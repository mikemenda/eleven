/**
 * preflightSeasonImport.mjs
 *
 * Read-only, offline preflight for a season JSON file. Runs BEFORE
 * verifyPlayerIdentityUrls.mjs, BEFORE importSeason.mjs's dry run, and
 * BEFORE any Firestore connection of any kind.
 *
 * This script NEVER initializes Firebase, NEVER reads serviceAccountKey.json,
 * NEVER writes any file, and NEVER modifies the season JSON it inspects.
 * It supplements importSeason.mjs's dry run — it does not replace it.
 *
 * Established workflow:
 *   1. finalized season JSON
 *   2. preflightSeasonImport.mjs   ← this script
 *   3. verifyPlayerIdentityUrls.mjs
 *   4. importSeason.mjs (dry run)
 *   5. review
 *   6. importSeason.mjs --write
 *   7. validateDataHealth.mjs
 *
 * What this mirrors from the current importSeason.mjs (kept in lockstep —
 * if importSeason.mjs's Stage 1 / Stage 1B / Stage 3 / Stage 4 logic or its
 * VALID_LEAGUE_NAMES / VALID_CUP_NAMES / RULE_ENUM constants ever change,
 * mirror the change here too):
 *   · Stage 1  — season arithmetic, UCL LP reconciliation, UCL Final structure
 *   · Stage 1B — externalLeagueResults / externalCupResults validation
 *   · Stage 3  — UCL opponent matching, via the real opponentMatcher.mjs
 *   · Stage 4  — transfer-club lookup, via the real normClubKey() lookup
 *
 * What this adds beyond the current importer (none of these exist in
 * importSeason.mjs today):
 *   · UCL knockout leg-pair completeness (R16/QF/SF must have both legs)
 *   · UCL league-phase matchday completeness (exactly one each of MD1–MD8)
 *   · Duplicate player names within playerStats
 *   · Spelling-mismatch detection between transfers[].player and playerStats[].name
 *
 * Deliberately NOT in scope for this script (left to other scripts):
 *   · sofifaId face-URL verification           → verifyPlayerIdentityUrls.mjs
 *   · new-vs-existing player/season Firestore checks → importSeason.mjs dry run
 *   · transfer-rule normalization or RULE_ENUM changes → explicitly out of scope
 *   · competition-alias dictionary / registry reconciliation → explicitly out of scope
 *
 * Usage:
 *   node scripts/preflightSeasonImport.mjs --file=data/uploads/montverd/S2.json
 *
 * Exit codes:
 *   0 — no blockers, safe to proceed to verifyPlayerIdentityUrls.mjs
 *   1 — one or more blockers found
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { matchOpponent, loadSeed, buildAliasMap } from './opponentMatcher.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TC_PATH    = resolve(__dirname, '../data/transfer-clubs.json')

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

if (!args.file) {
  console.error('\n✗ --file is required  (e.g. --file=data/uploads/montverd/S2.json)\n')
  process.exit(1)
}

// ─── Domain constants — mirrored verbatim from the current importSeason.mjs ──
// Keep these in lockstep with importSeason.mjs. If importSeason.mjs's
// versions of these change, update the copies here in the same pass.

const RULE_ENUM = ['Mandatory', 'Optional', 'Exchange', 'Emergency Credit', 'Forced-List', 'Swap']

// Stage 1B registries — mirrored verbatim from importSeason.mjs.
// NOTE: VALID_LEAGUE_NAMES includes "English Championship", which does not
// currently appear in src/utils/historyUtils.js's HISTORY_COMPETITIONS list
// (it only appears in that file's separate DOMESTIC_LEAGUES set, used for
// treble detection). That mismatch is a known, separate item — out of scope
// for this script. This script mirrors importSeason.mjs's actual current
// gate, not an idealized one, so its pass/fail predictions stay accurate.
const VALID_LEAGUE_NAMES = new Set([
  'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'English Championship',
])
const VALID_CUP_NAMES = new Set([
  'UEFA Champions League', 'UEFA Europa League', 'UEFA Conference League',
  'FA Cup', 'Carabao Cup', 'Copa del Rey', 'Coppa Italia', 'DFB-Pokal', 'Coupe de France',
])

const LP_ROUNDS_EXPECTED = ['MD1', 'MD2', 'MD3', 'MD4', 'MD5', 'MD6', 'MD7', 'MD8']
const KO_ROUNDS          = ['UCL_R16', 'UCL_QF', 'UCL_SF']

// ─── Helpers — mirrored verbatim from importSeason.mjs ───────────────────────

function normName(raw) {
  return (raw ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normClubKey(s) { return (s || '').toLowerCase().trim() }

// ─── Output helpers — same visual style as the other scripts ─────────────────

function header(t) { console.log('\n' + '─'.repeat(62)); console.log('  ' + t); console.log('─'.repeat(62)) }
function row(l, v)  { console.log(`  ${l.padEnd(44)} ${v}`) }

// ─── Severity accumulators ────────────────────────────────────────────────────
// Two tiers only: BLOCKER (✗, prevents proceeding) and INFO (⚠, never blocks).

const blockers = []
const info     = []

function fail(msg) { blockers.push(msg); console.log(`  ✗  ${msg}`) }
function note(msg) { info.push(msg);     console.log(`  ⚠  ${msg}`) }
function pass(msg) { console.log(`  ✓  ${msg}`) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log('  preflightSeasonImport — read-only, offline, no Firestore')
  console.log(`  File   : ${args.file}`)
  console.log('══════════════════════════════════════════════════════════════')

  // ── Load + parse ────────────────────────────────────────────────────────────
  let raw
  try {
    raw = readFileSync(resolve(process.cwd(), args.file), 'utf8')
  } catch (e) {
    console.error(`\n✗ Could not read file: ${e.message}\n`)
    process.exit(1)
  }

  let input
  try {
    input = JSON.parse(raw)
  } catch (e) {
    console.error(`\n✗ File is not valid JSON: ${e.message}\n`)
    process.exit(1)
  }

  // ════════════════════════════════════════════════════════════════
  // CHECK 1 — Basic Structure & Arithmetic
  // ════════════════════════════════════════════════════════════════
  header('CHECK 1 — Structure & Arithmetic')
  console.log()

  if (typeof input.season !== 'object' || input.season === null || Array.isArray(input.season)) {
    fail('"season" object is missing or malformed — every other check is skipped')
    printSummary()
    return
  }
  const si = input.season

  if (!si.label || typeof si.label !== 'string') {
    fail('season.label is missing or not a string')
  } else {
    pass(`season.label: "${si.label}"`)
  }

  function requireArray(value, name) {
    if (value === undefined) return []           // matches importer's default-to-[] behavior
    if (!Array.isArray(value)) {
      fail(`"${name}" is present but is not an array — importer destructuring would not crash, but downstream stages would receive the wrong shape`)
      return []
    }
    return value
  }

  const playerStats = requireArray(input.playerStats, 'playerStats')
  const uclMatches   = requireArray(input.uclMatches,  'uclMatches')
  const transfers    = requireArray(input.transfers,   'transfers')
  pass(`playerStats: ${playerStats.length} entr${playerStats.length === 1 ? 'y' : 'ies'}`)
  pass(`uclMatches: ${uclMatches.length} entr${uclMatches.length === 1 ? 'y' : 'ies'}`)
  pass(`transfers: ${transfers.length} entr${transfers.length === 1 ? 'y' : 'ies'}`)

  // League arithmetic — mirrors importer Stage 1 exactly, same guard
  if (si.leagueP != null) {
    const sumWDL = (si.leagueW || 0) + (si.leagueD || 0) + (si.leagueL || 0)
    if (sumWDL !== si.leagueP) fail(`League W+D+L ${sumWDL} ≠ P ${si.leagueP}`)
    else pass(`League W+D+L = P  (${sumWDL})`)

    const ptsCalc = (si.leagueW || 0) * 3 + (si.leagueD || 0)
    if (si.leaguePts != null) {
      if (ptsCalc !== si.leaguePts) fail(`League W×3+D ${ptsCalc} ≠ Pts ${si.leaguePts}`)
      else pass(`League W×3+D = Pts  (${ptsCalc})`)
    }
  } else {
    note('League record fields absent — skipping (matches importer behavior)')
  }

  // UCL league-phase arithmetic — same guard as importer: si.uclEntered && si.uclLPP != null
  const lpMatches = uclMatches.filter(m => m.competition === 'UCL_LP')
  if (si.uclEntered && si.uclLPP != null) {
    const sumWDL = (si.uclLPW || 0) + (si.uclLPD || 0) + (si.uclLPL || 0)
    if (sumWDL !== si.uclLPP) fail(`UCL LP W+D+L ${sumWDL} ≠ P ${si.uclLPP}`)
    else pass(`UCL LP W+D+L = P  (${sumWDL})`)

    const ptsCalc = (si.uclLPW || 0) * 3 + (si.uclLPD || 0)
    if (si.uclLPPts != null) {
      if (ptsCalc !== si.uclLPPts) fail(`UCL LP W×3+D ${ptsCalc} ≠ Pts ${si.uclLPPts}`)
      else pass(`UCL LP W×3+D = Pts  (${ptsCalc})`)
    }

    // Reconcile season-block UCL LP fields against the actual UCL_LP match docs
    if (lpMatches.length !== si.uclLPP) {
      fail(`LP match count: ${lpMatches.length} provided in uclMatches ≠ uclLPP=${si.uclLPP}`)
    } else {
      pass(`LP match count matches uclLPP  (${lpMatches.length})`)
    }
    const lpW  = lpMatches.filter(m => m.score_for  > m.score_against).length
    const lpD  = lpMatches.filter(m => m.score_for === m.score_against).length
    const lpL  = lpMatches.filter(m => m.score_for  < m.score_against).length
    const lpGF = lpMatches.reduce((a, m) => a + (m.score_for     ?? 0), 0)
    const lpGA = lpMatches.reduce((a, m) => a + (m.score_against ?? 0), 0)
    if (si.uclLPW != null && lpW !== si.uclLPW) fail(`LP W from match docs (${lpW}) ≠ season field uclLPW (${si.uclLPW})`)
    if (si.uclLPD != null && lpD !== si.uclLPD) fail(`LP D from match docs (${lpD}) ≠ season field uclLPD (${si.uclLPD})`)
    if (si.uclLPL != null && lpL !== si.uclLPL) fail(`LP L from match docs (${lpL}) ≠ season field uclLPL (${si.uclLPL})`)
    if (si.uclLPGF != null && lpGF !== si.uclLPGF) fail(`LP GF from match docs (${lpGF}) ≠ season field uclLPGF (${si.uclLPGF})`)
    if (si.uclLPGA != null && lpGA !== si.uclLPGA) fail(`LP GA from match docs (${lpGA}) ≠ season field uclLPGA (${si.uclLPGA})`)
  } else {
    note('UCL not entered or uclLPP absent — skipping UCL LP arithmetic (matches importer behavior)')
  }

  // Valid UCL Final structure — mirrors importer's hard checks exactly
  const finalEntries = uclMatches.filter(m => m.competition === 'UCL_Final')
  const finalWithLeg  = finalEntries.filter(m => m.leg != null)
  if (finalWithLeg.length > 0) {
    fail('UCL_Final entry has a leg field set — must be absent or null')
  } else if (finalEntries.length > 1) {
    fail(`${finalEntries.length} UCL_Final entries found — only one Final allowed`)
  } else if (finalEntries.length === 1) {
    pass('UCL Final: single entry, no leg field')
  } else {
    note('No UCL_Final entry present — skipping Final structure check')
  }

  // ════════════════════════════════════════════════════════════════
  // CHECK 2 — External Competition Results  (mirrors importer Stage 1B exactly)
  // ════════════════════════════════════════════════════════════════
  header('CHECK 2 — External Competition Results (Stage 1B mirror)')
  console.log()

  const externalLeagueResults = si.externalLeagueResults ?? []
  const externalCupResults    = si.externalCupResults    ?? []

  if (externalLeagueResults.length === 0 && externalCupResults.length === 0) {
    note('No externalLeagueResults / externalCupResults in this file — skipping')
  } else {

    const seenLeagueNames = new Set()
    for (const ext of externalLeagueResults) {
      const name = ext?.competition
      if (!name) { fail('externalLeagueResults entry missing "competition"'); continue }

      if (name === 'Premier League' || name === si.leagueCompetition) {
        fail(`externalLeagueResults entry "${name}" duplicates the club's own leagueCompetition — use the native league fields instead`)
        continue
      }
      if (!VALID_LEAGUE_NAMES.has(name)) {
        fail(`externalLeagueResults competition "${name}" not in the importer's VALID_LEAGUE_NAMES registry`)
        continue
      }
      if (seenLeagueNames.has(name)) {
        fail(`externalLeagueResults has duplicate competition "${name}"`)
        continue
      }
      seenLeagueNames.add(name)

      const rec = ext.record ?? {}
      let   ok  = true
      const sumPD = (rec.w ?? 0) + (rec.d ?? 0) + (rec.l ?? 0)
      if (rec.p != null && sumPD !== rec.p) {
        fail(`externalLeagueResults "${name}" W+D+L ${sumPD} ≠ P ${rec.p}`)
        ok = false
      }
      const ptsCalc = (rec.w ?? 0) * 3 + (rec.d ?? 0)
      if (rec.pts != null && ptsCalc !== rec.pts) {
        fail(`externalLeagueResults "${name}" W×3+D ${ptsCalc} ≠ Pts ${rec.pts}`)
        ok = false
      }
      if (!ext.champion) note(`externalLeagueResults "${name}" has no champion set`)
      if (ok) pass(`${name.padEnd(24)} ${ext.champion ?? '(no champion)'}  ${rec.w ?? '?'}W ${rec.d ?? '?'}D ${rec.l ?? '?'}L  ${rec.pts ?? '?'}pts`)
    }

    const seenCupNames = new Set()
    for (const ext of externalCupResults) {
      const name = ext?.competition
      if (!name) { fail('externalCupResults entry missing "competition"'); continue }

      if (!VALID_CUP_NAMES.has(name)) {
        fail(`externalCupResults competition "${name}" not in the importer's VALID_CUP_NAMES registry`)
        continue
      }
      if (seenCupNames.has(name)) {
        fail(`externalCupResults has duplicate competition "${name}"`)
        continue
      }
      seenCupNames.add(name)

      if (!ext.winner) {
        note(`externalCupResults "${name}" has no winner set`)
      } else {
        pass(`${name.padEnd(24)} ${ext.winner}${ext.finalScore ? `  ${ext.finalScore}` : ''}${ext.finalist ? `  vs ${ext.finalist}` : ''}`)
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // CHECK 3 — UCL Opponent Readiness  (real opponentMatcher.mjs logic)
  // ════════════════════════════════════════════════════════════════
  header('CHECK 3 — UCL Opponent Readiness')
  console.log()

  let opponentSeed, aliasMap
  try {
    opponentSeed = loadSeed()
    aliasMap     = buildAliasMap(opponentSeed)
  } catch (e) {
    fail(`Could not load opponents-seed.json via opponentMatcher.mjs: ${e.message}`)
    opponentSeed = []
    aliasMap     = new Map()
  }
  const seedByKey = new Map(opponentSeed.map(e => [e.opponentKey, e]))

  // Scope matches importer Stage 3 exactly: unique opponents from uclMatches[].opponent.
  // Season-level fields (uclFinalOpponent, uclR16Opponent, uclQFOpponent, uclSFOpponent)
  // are raw display strings the importer itself never resolves against the opponent
  // seed — they are intentionally out of scope here too, for the same reason.
  const uniqueOpps = [...new Set(uclMatches.map(m => m.opponent).filter(Boolean))]

  if (uniqueOpps.length === 0) {
    note('No UCL opponents found in uclMatches — skipping')
  } else {
    for (const raw of uniqueOpps) {
      let result = null
      try { result = matchOpponent(raw, opponentSeed, aliasMap) }
      catch (e) { fail(`${raw.padEnd(30)} — matchOpponent() threw: ${e.message}`); continue }

      if (!result) {
        fail(`${raw.padEnd(30)} — no matching opponent seed entry (would block --write)`)
        continue
      }
      if (result.confidence === 'high') {
        const seedEntry = seedByKey.get(result.opponentKey)
        const hasSofifaTeamId = seedEntry?.sofifaTeamId != null && seedEntry.sofifaTeamId !== 0
        if (!hasSofifaTeamId) {
          fail(`${raw.padEnd(30)} → ${result.opponentKey}  — matched but sofifaTeamId is missing/0 (would block --write)`)
        } else {
          pass(`${raw.padEnd(30)} → ${result.opponentKey}  (${result.strategy}, sofifaTeamId:${seedEntry.sofifaTeamId})`)
        }
      } else {
        // medium / low confidence — importer treats this as a warning, not a blocker
        note(`${raw.padEnd(30)} → ${result.opponentKey}  (${result.confidence} confidence — verify before --write)`)
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // CHECK 4 — Transfer-Club Readiness  (real transfer-clubs.json lookup)
  // ════════════════════════════════════════════════════════════════
  header('CHECK 4 — Transfer-Club Readiness')
  console.log()

  let transferClubs = {}
  try {
    transferClubs = JSON.parse(readFileSync(TC_PATH, 'utf8'))
  } catch (e) {
    fail(`Could not load data/transfer-clubs.json: ${e.message}`)
  }

  const uniqueClubs = [...new Set(transfers.flatMap(t => [t.from_club, t.to_club].filter(Boolean)))]

  if (uniqueClubs.length === 0) {
    note('No transfer clubs found in transfers — skipping')
  } else {
    for (const rawClub of uniqueClubs) {
      const entry = transferClubs[normClubKey(rawClub)]
      if (entry) {
        pass(`${rawClub.padEnd(30)} → "${entry.displayName}"  sofifaTeamId:${entry.sofifaTeamId}`)
      } else {
        fail(`${rawClub.padEnd(30)} — not found in transfer-clubs.json (would block --write)`)
        console.log(`       To fix — add to data/transfer-clubs.json:`)
        console.log(`         "${normClubKey(rawClub)}": { "displayName": "${rawClub}", "sofifaTeamId": 0 }`)
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // CHECK 5 — UCL Completeness  (not currently enforced by importer)
  // ════════════════════════════════════════════════════════════════
  header('CHECK 5 — UCL Completeness (LP rounds / KO legs)')
  console.log()

  // KO leg-pair completeness — for every round actually present, both legs must exist.
  for (const comp of KO_ROUNDS) {
    const legs = uclMatches.filter(m => m.competition === comp)
    if (legs.length === 0) continue   // round not used this season — fine
    const legNums = new Set(legs.map(m => m.leg))
    const hasLeg1 = legNums.has(1)
    const hasLeg2 = legNums.has(2)
    if (!hasLeg1 || !hasLeg2) {
      fail(`${comp} is missing ${!hasLeg1 ? 'leg 1' : 'leg 2'} — both legs are required for a knockout round that was entered`)
    } else if (legs.length > 2) {
      fail(`${comp} has ${legs.length} entries — exactly 2 (leg 1 and leg 2) expected`)
    } else {
      pass(`${comp.padEnd(10)} both legs present`)
    }
  }

  // LP matchday completeness — exactly one each of MD1–MD8, no dupes, no strays.
  if (lpMatches.length > 0) {
    const roundCounts = new Map()
    for (const m of lpMatches) {
      const r = m.round ?? '(missing round)'
      roundCounts.set(r, (roundCounts.get(r) || 0) + 1)
    }
    const missing = LP_ROUNDS_EXPECTED.filter(r => !roundCounts.has(r))
    const dupes   = [...roundCounts.entries()].filter(([, n]) => n > 1).map(([r]) => r)
    const strays  = [...roundCounts.keys()].filter(r => !LP_ROUNDS_EXPECTED.includes(r))

    if (missing.length > 0) fail(`UCL league phase missing matchday(s): ${missing.join(', ')}`)
    if (dupes.length   > 0) fail(`UCL league phase has duplicate matchday(s): ${dupes.join(', ')}`)
    if (strays.length  > 0) fail(`UCL league phase has unexpected round label(s) outside MD1–MD8: ${strays.join(', ')}`)
    if (missing.length === 0 && dupes.length === 0 && strays.length === 0) {
      pass(`UCL league phase: exactly one each of MD1–MD8 present`)
    }
  } else {
    note('No UCL_LP entries present — skipping league-phase completeness check')
  }

  // ════════════════════════════════════════════════════════════════
  // CHECK 6 — Player / Transfer Cross-Check
  // ════════════════════════════════════════════════════════════════
  header('CHECK 6 — Player / Transfer Cross-Check')
  console.log()

  // Duplicate player names within playerStats
  const nameCounts = new Map()
  for (const p of playerStats) {
    nameCounts.set(p.name, (nameCounts.get(p.name) || 0) + 1)
  }
  const duplicateNames = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([n]) => n)
  if (duplicateNames.length > 0) {
    duplicateNames.forEach(n => fail(`Duplicate player name in playerStats: "${n}" appears ${nameCounts.get(n)} times`))
  } else {
    pass(`No duplicate names among ${playerStats.length} playerStats entries`)
  }

  // Transfer player ↔ playerStats name cross-check.
  // Exact match            → clean, no issue.
  // Fuzzy match, not exact → likely the same player spelled two ways in this
  //                          file — a real data defect regardless of whether
  //                          the player is new or already in Firestore. FAIL.
  // No match at all        → normal for OUT transfers of existing/prior-season
  //                          players (e.g. sold without appearances this
  //                          season). Preflight has no Firestore access and
  //                          cannot tell "existing player, fine" apart from
  //                          "truly unresolved" — that distinction is the
  //                          importer dry run's job. INFO only, not a blocker.
  const playerNames = playerStats.map(p => p.name)
  const exactNameSet = new Set(playerNames)
  const normToNames  = new Map()
  for (const n of playerNames) {
    const key = normName(n)
    if (!normToNames.has(key)) normToNames.set(key, [])
    normToNames.get(key).push(n)
  }

  const uniqueTransferPlayers = [...new Set(transfers.map(t => t.player).filter(Boolean))]
  if (uniqueTransferPlayers.length === 0) {
    note('No transfer players to cross-check — skipping')
  } else {
    for (const tName of uniqueTransferPlayers) {
      if (exactNameSet.has(tName)) {
        pass(`${tName.padEnd(30)} exact match in playerStats`)
        continue
      }
      const candidates = normToNames.get(normName(tName)) || []
      if (candidates.length === 1) {
        fail(`${tName.padEnd(30)} — no exact match, but likely the same player as "${candidates[0]}" in playerStats (spelling mismatch — fix one to match the other exactly)`)
      } else if (candidates.length > 1) {
        fail(`${tName.padEnd(30)} — no exact match; multiple normalized candidates in playerStats: ${candidates.join(', ')} (ambiguous — resolve by hand)`)
      } else {
        note(`${tName.padEnd(30)} not in this season's playerStats — normal for a sold/existing player; importer dry run will resolve via Firestore`)
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // CHECK 7 — Transfer Rule Labels  (informational only — never blocks)
  // ════════════════════════════════════════════════════════════════
  header('CHECK 7 — Transfer Rule Labels (informational only)')
  console.log()

  if (transfers.length === 0) {
    note('No transfers to check — skipping')
  } else {
    const nonStandard = transfers.filter(t => !RULE_ENUM.includes(t.rule))
    if (nonStandard.length === 0) {
      pass(`All ${transfers.length} transfer rule(s) match RULE_ENUM`)
    } else {
      nonStandard.forEach(t => note(`"${t.rule}" (${t.player}) — not in RULE_ENUM; treated as informational only, not a blocker`))
      pass(`${transfers.length - nonStandard.length} of ${transfers.length} transfer rule(s) match RULE_ENUM — the rest are informational only`)
    }
  }

  printSummary()

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════
  function printSummary() {
    console.log('\n' + '═'.repeat(62))
    console.log('  SUMMARY')
    console.log('═'.repeat(62))
    row('Blockers',      blockers.length === 0 ? '0  ✓' : `${blockers.length}  ✗`)
    row('Warnings/Info', info.length === 0     ? '0'     : `${info.length}`)

    if (blockers.length > 0) {
      console.log()
      console.log('  Blocking issues:')
      blockers.forEach(b => console.log(`    ✗  ${b}`))
    }
    if (info.length > 0) {
      console.log()
      console.log('  Informational (does not block):')
      info.forEach(w => console.log(`    ⚠  ${w}`))
    }

    console.log('\n' + '═'.repeat(62))
    if (blockers.length === 0) {
      console.log('  ✅  SAFE TO PROCEED to verifyPlayerIdentityUrls.mjs, then importSeason.mjs dry run')
    } else {
      console.log('  ✗   NOT SAFE TO PROCEED — resolve the blocking issues above first')
    }
    console.log('  This script never wrote or modified anything. Read-only.')
    console.log('═'.repeat(62) + '\n')
  }
}

main()
  .then(() => process.exit(blockersExitCode()))
  .catch(err => { console.error('\nFatal error:', err); process.exit(1) })

function blockersExitCode() {
  return blockers.length === 0 ? 0 : 1
}
