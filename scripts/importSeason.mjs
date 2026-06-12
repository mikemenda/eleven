/**
 * importSeason.mjs
 *
 * Imports a new season into the Eleven app from a structured JSON file.
 * Default: dry-run (read-only). Use --write to apply to Firestore.
 *
 * Pipeline:
 *   1. Validate season block (arithmetic, enums, required fields)
 *   2. Match players against Firestore + data/fc26-players.csv
 *   3. Match UCL opponents against data/opponents-seed.json
 *   4. Match transfer clubs against data/transfer-clubs.json
 *   5. Build all write objects in memory + idempotency check
 *   6. Compute updated top-level player cached totals
 *   7. Assert invariants (Σ stats = totals, LP count = uclLPP)
 *   8. Print dry-run report
 *   9. On --write: verify no blockers, execute in dependency order,
 *      re-assert invariants against live Firestore data
 *
 * --write is blocked if any of these exist:
 *   · Season arithmetic fails (W+D+L ≠ P, points formula, UCL LP)
 *   · UCL Final entry has a leg field
 *   · Season label already exists in Firestore
 *   · Any player match is ambiguous (multiple Firestore candidates)
 *   · Any UCL opponent is unmatched in opponents-seed.json
 *   · Any transfer club is unmatched in transfer-clubs.json
 *   · Post-build invariant fails (Σ collection docs ≠ computed totals)
 *
 * Usage:
 *   node scripts/importSeason.mjs --season S4 --file data/uploads/S4.json
 *   node scripts/importSeason.mjs --season S4 --file data/uploads/S4.json --clubId=<id>
 *   node scripts/importSeason.mjs --season S4 --file data/uploads/S4.json --write
 *
 * serviceAccountKey.json must be at the project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { matchPlayers }  from './playerMatcher.mjs'
import { matchOpponent, loadSeed, buildAliasMap } from './opponentMatcher.mjs'

const require    = createRequire(import.meta.url)
const admin      = require('firebase-admin')
const __dirname  = dirname(fileURLToPath(import.meta.url))
const KEY_PATH   = resolve(__dirname, '../serviceAccountKey.json')
const TC_PATH    = resolve(__dirname, '../data/transfer-clubs.json')
const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev/team'

// ─── CLI ─────────────────────────────────────────────────────────────────────

const WRITE = process.argv.includes('--write')

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

// ─── Domain constants ─────────────────────────────────────────────────────────

const UCL_RESULT_ENUM = ['Champions', 'Runners-Up', 'SF', 'QF', 'R16', 'Playoff', 'LP Only', 'Did Not Enter']
const UCL_COMP_ENUM   = ['UCL_LP', 'UCL_R16', 'UCL_QF', 'UCL_SF', 'UCL_Final']
const RULE_ENUM       = ['Mandatory', 'Optional', 'Exchange', 'Emergency Credit', 'Forced-List', 'Swap']
const WINDOW_ENUM     = ['Summer', 'January']

// ─── Firebase ─────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  let sa
  try { sa = JSON.parse(readFileSync(KEY_PATH, 'utf8')) }
  catch (e) {
    console.error(`\n✗ Could not read serviceAccountKey.json: ${e.message}`)
    console.error('  Place your Firebase service account key at the project root.\n')
    process.exit(1)
  }
  admin.initializeApp({ credential: admin.credential.cert(sa) })
  return admin.firestore()
}

// ─── Club resolution ─────────────────────────────────────────────────────────

async function resolveClub(db, providedId) {
  if (providedId) {
    const snap = await db.collection('clubs').doc(providedId).get()
    if (!snap.exists) { console.error(`\n✗ No club found with id: "${providedId}"\n`); process.exit(1) }
    return { id: snap.id, ...snap.data() }
  }
  const snap = await db.collection('clubs').get()
  if (snap.empty) { console.error('\n✗ No clubs found in Firestore.\n'); process.exit(1) }
  if (snap.docs.length > 1) {
    console.error('\n✗ Multiple clubs found. Pass --clubId=<id> to specify which club.\n')
    snap.docs.forEach(d => console.error(`     ${d.id}  "${d.data().name}"`))
    console.error(); process.exit(1)
  }
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalise a name for Firestore lookup — strip diacritics, lowercase, no punctuation.
// Must match the normalisation used in playerMatcher.mjs.
function normName(raw) {
  return (raw ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normClubKey(s) { return (s || '').toLowerCase().trim() }

function r2(n) { return n != null ? Math.round(n * 100) / 100 : null }

function computeRates(apps, goals, assists, cleanSheets, isGK) {
  if (!apps) return {}
  if (isGK)  return { csPerGame: r2(cleanSheets != null ? cleanSheets / apps : null) }
  return {
    gPerGame: r2(goals   / apps),
    aPerGame: r2(assists / apps),
    cPerGame: r2((goals + assists) / apps),
  }
}

function header(t) { console.log('\n' + '─'.repeat(62)); console.log('  ' + t); console.log('─'.repeat(62)) }
function row(l, v)  { console.log(`  ${l.padEnd(44)} ${v}`) }
function mk(v)      { return v === 'ok' ? '✓' : v === 'warn' ? '⚠' : '✗' }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  // ── Validate CLI ────────────────────────────────────────────────────────────
  if (!args.season) { console.error('\n✗ --season is required  (e.g. --season S4)\n'); process.exit(1) }
  if (!args.file)   { console.error('\n✗ --file is required  (e.g. --file data/uploads/S4.json)\n'); process.exit(1) }

  const seasonLabel = args.season

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  importSeason — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Season : ${seasonLabel}`)
  console.log(`  File   : ${args.file}`)
  console.log('══════════════════════════════════════════════════════════════')

  // ── Parse input file ────────────────────────────────────────────────────────
  let input
  try {
    input = JSON.parse(readFileSync(resolve(process.cwd(), args.file), 'utf8'))
  } catch (e) {
    console.error(`\n✗ Could not read/parse input file: ${e.message}\n`); process.exit(1)
  }

  if (!input.season || input.season.label !== seasonLabel) {
    console.error(`\n✗ --season ${seasonLabel} does not match season.label "${input.season?.label}" in file`)
    console.error('  Check --season or the file.\n'); process.exit(1)
  }

  const { season: si, playerStats = [], uclMatches = [], transfers = [] } = input

  // ── Load from Firestore ──────────────────────────────────────────────────────
  const db   = initFirebase()
  const club = await resolveClub(db, args.clubId)

  console.log(`\n  Club : ${club.name}  (${club.id})`)
  console.log('  Loading Firestore data…\n')

  const [seasonsSnap, playersSnap, ssSnap] = await Promise.all([
    db.collection('seasons').where('clubId', '==', club.id).get(),
    db.collection('players').where('clubId', '==', club.id).get(),
    db.collection('seasonStats').get(),
  ])

  const existingSeasons = seasonsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const existingPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Scope existing seasonStats to this club by seasonId (avoids trusting clubId field)
  const knownSeasonIds  = new Set(existingSeasons.map(s => s.id))
  const existingSsDocs  = ssSnap.docs
    .map(d => ({ _docId: d.id, ...d.data() }))
    .filter(d => knownSeasonIds.has(d.seasonId))
  const existingSsKeys  = new Set(existingSsDocs.map(d => `${d.playerId}|${d.seasonId}|${d.scope}`))

  // Player lookup maps
  const playerByExactName = new Map(existingPlayers.map(p => [p.name, p]))
  const playerByNormName  = new Map()
  const playerBySofifaId  = new Map()
  for (const p of existingPlayers) {
    const n = normName(p.name)
    if (!playerByNormName.has(n)) playerByNormName.set(n, [])
    playerByNormName.get(n).push(p)
    if (p.sofifaId) playerBySofifaId.set(String(p.sofifaId), p)
  }

  // Load disk data
  let transferClubs = {}
  try { transferClubs = JSON.parse(readFileSync(TC_PATH, 'utf8')) }
  catch (e) { console.error(`\n✗ Could not load transfer-clubs.json: ${e.message}\n`); process.exit(1) }

  const opponentSeed = loadSeed()
  const aliasMap     = buildAliasMap(opponentSeed)

  // Accumulators — errors and blockers both prevent --write; only display label differs
  const errors   = []   // ✗  structural/arithmetic failures
  const blockers = []   // ⚠  in dry-run, ✗ at write gate (season exists, unmatched clubs/opps)
  const warnings = []   // ⚠  informational, never block

  // ════════════════════════════════════════════════════════════════
  // STAGE 1 — Validate season block
  // ════════════════════════════════════════════════════════════════
  header('STAGE 1 — Season Block Validation')
  console.log()

  function arith(label, computed, expected, errMsg) {
    if (computed == null || expected == null) return
    if (computed !== expected) {
      errors.push(errMsg)
      console.log(`  ✗  ${label}  computed:${computed} ≠ ${expected}`)
    } else {
      console.log(`  ✓  ${label}  ${computed}`)
    }
  }

  if (si.leagueP != null) {
    arith('League  W+D+L = P',     (si.leagueW||0)+(si.leagueD||0)+(si.leagueL||0), si.leagueP,   `League W+D+L ${(si.leagueW||0)+(si.leagueD||0)+(si.leagueL||0)} ≠ P ${si.leagueP}`)
    arith('League  W×3+D = Pts',   (si.leagueW||0)*3+(si.leagueD||0),               si.leaguePts, `League Pts ${(si.leagueW||0)*3+(si.leagueD||0)} ≠ ${si.leaguePts}`)
  } else {
    console.log('  ─  League record fields absent — skipping')
  }

  if (si.uclEntered && si.uclLPP != null) {
    arith('UCL LP  W+D+L = P',     (si.uclLPW||0)+(si.uclLPD||0)+(si.uclLPL||0), si.uclLPP,   `UCL LP W+D+L ${(si.uclLPW||0)+(si.uclLPD||0)+(si.uclLPL||0)} ≠ P ${si.uclLPP}`)
    arith('UCL LP  W×3+D = Pts',   (si.uclLPW||0)*3+(si.uclLPD||0),              si.uclLPPts, `UCL LP Pts ${(si.uclLPW||0)*3+(si.uclLPD||0)} ≠ ${si.uclLPPts}`)
  }

  if (si.uclEntered && si.uclResult) {
    if (!UCL_RESULT_ENUM.includes(si.uclResult)) {
      errors.push(`uclResult "${si.uclResult}" not in allowed enum`)
      console.log(`  ✗  uclResult: "${si.uclResult}" — unrecognised value`)
    } else {
      console.log(`  ✓  uclResult: "${si.uclResult}"`)
    }
  }

  if (si.dynastyScore != null && (si.dynastyScore < 0 || si.dynastyScore > 100)) {
    errors.push(`dynastyScore ${si.dynastyScore} is outside 0–100`)
    console.log(`  ✗  dynastyScore: ${si.dynastyScore}  (must be 0–100)`)
  } else if (si.dynastyScore != null) {
    console.log(`  ✓  dynastyScore: ${si.dynastyScore}`)
  }

  // UCL Final leg check
  const finalEntries  = uclMatches.filter(m => m.competition === 'UCL_Final')
  const finalWithLeg  = finalEntries.filter(m => m.leg != null)
  if (finalWithLeg.length > 0) {
    errors.push(`UCL_Final entry has leg field set — must be absent or null`)
    console.log(`  ✗  UCL Final: leg field present  (hard FAIL)`)
  } else if (finalEntries.length === 1) {
    console.log(`  ✓  UCL Final: single-leg check passed`)
  } else if (finalEntries.length > 1) {
    errors.push(`${finalEntries.length} UCL_Final entries found — only one Final allowed`)
    console.log(`  ✗  UCL Final: ${finalEntries.length} entries  (only 1 allowed)`)
  }

  if (si.uclEntered && ['Champions', 'Runners-Up'].includes(si.uclResult) && !si.uclFinalOpponent) {
    warnings.push(`uclResult "${si.uclResult}" but uclFinalOpponent is absent`)
  }

  // Duplicate season — blocker on write, warning in dry-run
  const duplicateSeason = existingSeasons.find(ss => ss.label === seasonLabel)
  if (duplicateSeason) {
    blockers.push(`Season "${seasonLabel}" already exists (id: ${duplicateSeason.id}) — cannot overwrite without --replace (not available in Phase 3)`)
    console.log(`  ⚠  Season "${seasonLabel}" already exists in Firestore — write would be blocked`)
  } else {
    console.log(`  ✓  Season "${seasonLabel}" is new`)
  }

  // ════════════════════════════════════════════════════════════════
  // STAGE 2 — Match players
  // ════════════════════════════════════════════════════════════════
  header('STAGE 2 — Player Matching')
  console.log('\n  Matching against Firestore and fc26-players.csv…\n')

  // CSV match — prints its own brief summary; we use results for sofifaId + confidence
  const csvResults = await matchPlayers(playerStats.map(e => e.name))
  const csvByName  = new Map(csvResults.map(r => [r.name, r]))

  console.log()

  // OUT transfers — used to detect status transitions
  const outByName = new Set(transfers.filter(t => t.direction === 'OUT').map(t => t.player))

  const playerMatches = []

  for (const entry of playerStats) {
    const csvR = csvByName.get(entry.name)
    let fp = null        // Firestore player doc
    let matchMethod = null

    // 1. Exact Firestore name
    if (playerByExactName.has(entry.name)) {
      fp = playerByExactName.get(entry.name)
      matchMethod = 'exact'
    }

    // 2. Normalised Firestore name
    if (!fp) {
      const candidates = playerByNormName.get(normName(entry.name)) || []
      if (candidates.length === 1) {
        fp = candidates[0]; matchMethod = 'normalised'
      } else if (candidates.length > 1) {
        errors.push(`Ambiguous Firestore match for "${entry.name}": ${candidates.map(p => p.name).join(', ')}`)
        playerMatches.push({ entry, category: 'ambiguous', candidates, csvR, isGK: false })
        console.log(`  ✗  ${entry.name.padEnd(30)} → AMBIGUOUS  ${candidates.map(p => p.name).join(' | ')}`)
        continue
      }
    }

    // 3. sofifaId from CSV → Firestore
    if (!fp && csvR && !csvR.isGenerated) {
      const byId = playerBySofifaId.get(String(csvR.sofifaId))
      if (byId) { fp = byId; matchMethod = 'sofifaId' }
    }

    // Determine isGK
    const isGK = entry.isGK === true ||
      (!!(fp && (fp.position || '').split(/[,/\s]+/).map(p => p.trim()).includes('GK')))

    const statusTransition = (outByName.has(entry.name) && fp?.status === 'Active') ? 'Sold' : null

    if (fp) {
      const conf = csvR && !csvR.isGenerated && csvR.matchConfidence != null
        ? `  CSV:${csvR.matchStrategy}@${Math.round(csvR.matchConfidence * 100)}%`
        : ''
      console.log(`  ✓  ${entry.name.padEnd(30)} → "${fp.name}"  [${matchMethod}]${conf}`)
      if (csvR && !csvR.isGenerated && csvR.matchConfidence != null && csvR.matchConfidence < 0.93) {
        warnings.push(`Low CSV confidence for "${entry.name}" → "${csvR.csvLongName}" (${Math.round(csvR.matchConfidence*100)}%) — verify`)
      }
      if (statusTransition) console.log(`     ⚠  status transition: Active → Sold  (OUT transfer)`)
      playerMatches.push({ entry, category: 'matched', fp, csvR, isGK, matchMethod, statusTransition })
    } else if (csvR && !csvR.isGenerated) {
      console.log(`  ⚠  ${entry.name.padEnd(30)} → [NEW — sofifaId:${csvR.sofifaId}  ${csvR.nationality}]`)
      warnings.push(`New player to create: "${entry.name}"  (sofifaId:${csvR.sofifaId})`)
      playerMatches.push({ entry, category: 'new', fp: null, csvR, isGK, statusTransition })
    } else {
      console.log(`  ⚠  ${entry.name.padEnd(30)} → [NEW GENERATED — not in CSV, will be silhouette]`)
      warnings.push(`New generated player: "${entry.name}" — no sofifaId, renders as silhouette`)
      playerMatches.push({ entry, category: 'new_generated', fp: null, csvR: null, isGK, statusTransition })
    }
  }

  // ════════════════════════════════════════════════════════════════
  // STAGE 3 — Match UCL opponents
  // ════════════════════════════════════════════════════════════════
  header('STAGE 3 — Opponent Matching')
  console.log()

  const uniqueOpps    = [...new Set(uclMatches.map(m => m.opponent).filter(Boolean))]
  const oppResults    = []

  for (const raw of uniqueOpps) {
    const result = matchOpponent(raw, opponentSeed, aliasMap)
    if (result?.confidence === 'high') {
      console.log(`  ✓  ${raw.padEnd(32)} → ${result.opponentKey}  (${result.strategy})`)
      oppResults.push({ raw, match: result })
    } else if (result?.confidence === 'medium' || result?.confidence === 'low') {
      console.log(`  ⚠  ${raw.padEnd(32)} → ${result.opponentKey}  (${result.confidence} — review)`)
      warnings.push(`Opponent "${raw}" matched with ${result.confidence} confidence → "${result.opponentKey}" — verify`)
      oppResults.push({ raw, match: result })
    } else {
      console.log(`  ✗  ${raw.padEnd(32)} → NO MATCH  (blocks --write)`)
      blockers.push(`Opponent "${raw}" not found in opponents-seed.json — add entry before writing`)
      oppResults.push({ raw, match: null })
    }
  }

  const oppKeyByRaw  = new Map(oppResults.map(o => [o.raw, o.match?.opponentKey  || `unknown-${normName(o.raw).replace(/\s+/g, '-')}`]))
  const oppNameByRaw = new Map(oppResults.map(o => [o.raw, o.match?.displayName  || o.raw]))

  // ════════════════════════════════════════════════════════════════
  // STAGE 4 — Match transfer clubs
  // ════════════════════════════════════════════════════════════════
  header('STAGE 4 — Transfer Club Matching')
  console.log()

  const uniqueClubs = [...new Set(transfers.flatMap(t => [t.from_club, t.to_club].filter(Boolean)))]
  const clubResults = []

  for (const raw of uniqueClubs) {
    const entry = transferClubs[normClubKey(raw)]
    if (entry) {
      console.log(`  ✓  ${raw.padEnd(32)} → "${entry.displayName}"  id:${entry.sofifaTeamId}`)
      clubResults.push({ raw, resolved: true, displayName: entry.displayName, sofifaTeamId: entry.sofifaTeamId })
    } else {
      console.log(`  ✗  ${raw.padEnd(32)} → NO MATCH  (blocks --write)`)
      blockers.push(`Transfer club "${raw}" not found in transfer-clubs.json — add entry before writing`)
      clubResults.push({ raw, resolved: false })
    }
  }

  const clubByRaw = new Map(clubResults.map(c => [c.raw, c]))

  // ════════════════════════════════════════════════════════════════
  // STAGE 5 — Build write plan in memory
  // ════════════════════════════════════════════════════════════════
  header('STAGE 5 — Building Write Plan')
  console.log()

  // Placeholder used in dry-run wherever a real Firestore doc ID would appear
  const PENDING = '[pending-firestore-id]'

  // ── Season doc ──────────────────────────────────────────────────────────────
  const seasonDoc = {
    clubId: club.id, label: seasonLabel, year: si.year ?? null, isComplete: si.isComplete ?? true,
    leagueCompetition: si.leagueCompetition ?? null, leaguePosition: si.leaguePosition ?? null,
    leagueP: si.leagueP ?? null, leagueW: si.leagueW ?? null, leagueD: si.leagueD ?? null,
    leagueL: si.leagueL ?? null, leagueGF: si.leagueGF ?? null, leagueGA: si.leagueGA ?? null,
    leaguePts: si.leaguePts ?? null, leagueTop5: si.leagueTop5 ?? [],
    uclEntered: si.uclEntered ?? false,
    uclResult: si.uclResult ?? null, uclTournamentWinner: si.uclTournamentWinner ?? null,
    uclFinalOpponent: si.uclFinalOpponent ?? null, uclFinalScore: si.uclFinalScore ?? null,
    uclLeaguePhasePosition: si.uclLeaguePhasePosition ?? null,
    uclLPP: si.uclLPP ?? null, uclLPW: si.uclLPW ?? null, uclLPD: si.uclLPD ?? null,
    uclLPL: si.uclLPL ?? null, uclLPGF: si.uclLPGF ?? null, uclLPGA: si.uclLPGA ?? null, uclLPPts: si.uclLPPts ?? null,
    uclR16Opponent: si.uclR16Opponent ?? null, uclR16Score: si.uclR16Score ?? null,
    uclQFOpponent:  si.uclQFOpponent  ?? null, uclQFScore:  si.uclQFScore  ?? null,
    uclSFOpponent:  si.uclSFOpponent  ?? null, uclSFScore:  si.uclSFScore  ?? null,
    faCupResult: si.faCupResult ?? null, faCupFinalOpponent: si.faCupFinalOpponent ?? null, faCupWinner: si.faCupWinner ?? null,
    carabaoCupResult: si.carabaoCupResult ?? null, carabaoCupFinalOpponent: si.carabaoCupFinalOpponent ?? null, carabaoCupWinner: si.carabaoCupWinner ?? null,
    dynastyScore: si.dynastyScore ?? null, dynastyVerdict: si.dynastyVerdict ?? null,
    seasonHeadline: si.seasonHeadline ?? null, seasonDeck: si.seasonDeck ?? null,
    narrativeText: si.narrativeText ?? null, keyMoments: si.keyMoments ?? [],
  }

  // ── New player docs ──────────────────────────────────────────────────────────
  // Cache totals are seeded directly from S4 stats (their first season).
  // New players are not in playerUpdates (which only covers existing Firestore
  // players), so their totals must be correct from the moment the doc is created.
  const newPlayerDocs = playerMatches
    .filter(pm => pm.category === 'new' || pm.category === 'new_generated')
    .map(pm => {
      const ac  = pm.entry.allComps ?? {}
      const ucl = pm.entry.ucl      ?? {}
      const isGK = pm.isGK
      return {
        clubId: club.id,
        name: pm.entry.name,
        position: pm.entry.position ?? (isGK ? 'GK' : 'Unknown'),
        status: 'Active',
        sofifaId: pm.csvR?.sofifaId ?? null,
        nationality: pm.csvR?.nationality ?? null,
        isHistoricalStub: false,
        // Seed cache totals from this season's stats — correct from day one
        apps:           ac.apps          ?? 0,
        goals:          isGK ? 0 : (ac.goals    ?? 0),
        assists:        isGK ? 0 : (ac.assists   ?? 0),
        cleanSheets:    isGK ? (ac.cleanSheets ?? null) : null,
        uclApps:        ucl.apps         ?? 0,
        uclGoals:       isGK ? 0 : (ucl.goals   ?? 0),
        uclAssists:     isGK ? 0 : (ucl.assists  ?? 0),
        uclCleanSheets: isGK ? (ucl.cleanSheets ?? null) : null,
      }
    })

  // ── seasonStats docs ─────────────────────────────────────────────────────────
  const newAllStatsDocs = []
  const newUclStatsDocs = []

  for (const pm of playerMatches.filter(pm => pm.category !== 'ambiguous')) {
    const playerId   = pm.fp?.id ?? PENDING   // resolved at write time
    const playerName = pm.fp?.name ?? pm.entry.name
    const isGK       = pm.isGK
    const ac         = pm.entry.allComps ?? {}

    const apps        = ac.apps        ?? 0
    const goals       = isGK ? 0 : (ac.goals   ?? 0)
    const assists     = isGK ? 0 : (ac.assists  ?? 0)
    const cleanSheets = isGK ? (ac.cleanSheets ?? null) : null
    const avgRating   = ac.averageRating ?? null
    const rates       = computeRates(apps, goals, assists, cleanSheets, isGK)

    const allDoc = {
      playerId, clubId: club.id, seasonId: PENDING, scope: 'ALL',
      label: seasonLabel, playerName, isGK, apps, goals, assists, cleanSheets,
      averageRating: avgRating, ...rates,
    }
    newAllStatsDocs.push({ doc: allDoc, pm })

    // UCL doc — only if ucl block is present and has apps > 0
    const ucl = pm.entry.ucl
    if (ucl && (ucl.apps ?? 0) > 0) {
      const uclApps    = ucl.apps    ?? 0
      const uclGoals   = isGK ? 0 : (ucl.goals   ?? 0)
      const uclAssists = isGK ? 0 : (ucl.assists  ?? 0)
      const uclCS      = isGK ? (ucl.cleanSheets ?? null) : null
      const uclRates   = computeRates(uclApps, uclGoals, uclAssists, uclCS, isGK)
      const uclDoc = {
        playerId, clubId: club.id, seasonId: PENDING, scope: 'UCL',
        // scope:'UCL' docs intentionally omit label (matches existing seeded docs convention)
        playerName, isGK, apps: uclApps, goals: uclGoals, assists: uclAssists, cleanSheets: uclCS,
        ...uclRates,
      }
      newUclStatsDocs.push({ doc: uclDoc, pm })
    }
  }

  // ── UCL match docs ───────────────────────────────────────────────────────────
  const newMatchDocs = []
  const lpMatches    = uclMatches.filter(m => m.competition === 'UCL_LP')

  for (const m of uclMatches) {
    if (!UCL_COMP_ENUM.includes(m.competition)) {
      errors.push(`Unknown competition "${m.competition}" in uclMatches`)
      continue
    }
    const matchDoc = {
      clubId: club.id, seasonId: PENDING, seasonLabel,
      competition: m.competition, round: m.round ?? null, leg: null,
      score_for: m.score_for, score_against: m.score_against, home_away: m.home_away,
      opponent:    oppNameByRaw.get(m.opponent) ?? m.opponent,
      opponentKey: oppKeyByRaw.get(m.opponent)  ?? `unknown-${normName(m.opponent||'').replace(/\s+/g, '-')}`,
    }
    // leg field: present for KO rounds (R16/QF/SF), absent for Final and LP
    if (m.competition !== 'UCL_Final' && m.competition !== 'UCL_LP' && m.leg != null) {
      matchDoc.leg = m.leg
    }
    newMatchDocs.push(matchDoc)
  }

  // LP reconciliation
  const lpW  = lpMatches.filter(m => m.score_for  > m.score_against).length
  const lpD  = lpMatches.filter(m => m.score_for === m.score_against).length
  const lpL  = lpMatches.filter(m => m.score_for  < m.score_against).length
  const lpGF = lpMatches.reduce((a, m) => a + (m.score_for ?? 0), 0)
  const lpGA = lpMatches.reduce((a, m) => a + (m.score_against ?? 0), 0)

  if (si.uclLPP != null) {
    if (lpMatches.length !== si.uclLPP) {
      errors.push(`LP match count: ${lpMatches.length} provided ≠ uclLPP=${si.uclLPP}`)
    }
    if (si.uclLPW != null && lpW !== si.uclLPW) errors.push(`LP W: computed ${lpW} ≠ season field ${si.uclLPW}`)
    if (si.uclLPD != null && lpD !== si.uclLPD) errors.push(`LP D: computed ${lpD} ≠ season field ${si.uclLPD}`)
    if (si.uclLPL != null && lpL !== si.uclLPL) errors.push(`LP L: computed ${lpL} ≠ season field ${si.uclLPL}`)
  }

  // ── Transfer player resolution map ──────────────────────────────────────────
  // Shared by both transfer doc creation and OUT-transfer status updates.
  // Resolution priority:
  //   1. playerMatches — player is in playerStats (matched or new)
  //   2. Direct Firestore lookup — player in Firestore but not in playerStats
  //   3. null — no match (warned; transfer writes with playerId: null)
  //
  // playerId is PENDING for new players; resolved to a real ID during batch staging.

  const transferPlayerMap = new Map()  // t.player → { playerId, source, pm, fp }

  for (const t of transfers) {
    const name = t.player
    if (transferPlayerMap.has(name)) continue  // deduplicate

    // Priority 1: player is in playerStats
    const pm = playerMatches.find(p => p.entry.name === name && p.category !== 'ambiguous')
    if (pm) {
      // Existing players get their real Firestore ID; new players get PENDING
      const playerId = pm.fp?.id ?? PENDING
      transferPlayerMap.set(name, { playerId, source: pm.fp ? 'playerStats-matched' : 'playerStats-new', pm, fp: pm.fp ?? null })
      continue
    }

    // Priority 2: direct Firestore lookup (player not in playerStats at all)
    let fp = playerByExactName.get(name)
    if (!fp) {
      const candidates = playerByNormName.get(normName(name)) || []
      if (candidates.length === 1) fp = candidates[0]
    }

    if (fp) {
      transferPlayerMap.set(name, { playerId: fp.id, source: 'firestore-direct', pm: null, fp })
    } else {
      // No match found — warn clearly, differentiate IN vs OUT
      transferPlayerMap.set(name, { playerId: null, source: 'unresolved', pm: null, fp: null })
      if (t.direction === 'OUT') {
        warnings.push(`OUT transfer player "${name}" cannot be matched to Firestore — status will not update and transfer writes with playerId: null`)
      } else {
        warnings.push(`IN transfer player "${name}" cannot be matched to Firestore or playerStats — transfer writes with playerId: null`)
      }
    }
  }

  // ── Transfer docs ────────────────────────────────────────────────────────────
  const newTransferDocs = []

  for (const t of transfers) {
    if (!['IN', 'OUT'].includes(t.direction)) { errors.push(`Transfer direction "${t.direction}" invalid`); continue }
    if (!RULE_ENUM.includes(t.rule))           warnings.push(`Transfer rule "${t.rule}" not in expected enum`)
    if (!WINDOW_ENUM.includes(t.window))       warnings.push(`Transfer window "${t.window}" not in expected enum`)

    const resolved  = transferPlayerMap.get(t.player) ?? { playerId: null, source: 'unresolved', pm: null, fp: null }
    const playerId  = resolved.playerId   // PENDING for new players, real ID otherwise, null if unresolved
    const clubRaw   = t.direction === 'IN' ? t.from_club : t.to_club
    const clubEntry = clubByRaw.get(clubRaw)

    if (resolved.source === 'playerStats-new') {
      warnings.push(`Transfer "${t.player}" linked to a new player — playerId assigned after player doc is created`)
    }

    newTransferDocs.push({
      clubId: club.id, seasonId: PENDING, season: seasonLabel,
      window: t.window, direction: t.direction,
      player: t.player,
      position: t.position ?? resolved.fp?.position ?? resolved.pm?.entry.position ?? '?',
      playerId,
      from_club: t.from_club ?? null,
      to_club:   t.to_club   ?? null,
      fee_eur:   t.fee_eur   ?? 0,
      rule:      t.rule      ?? 'Mandatory',
      // Internal: resolved display info (stripped before writing to Firestore)
      _crestUrl: clubEntry?.sofifaTeamId ? `${WORKER_BASE}/${clubEntry.sofifaTeamId}` : null,
    })
  }

  row('Season doc',           '1  (new)')
  row('New player docs',      `${newPlayerDocs.length}${newPlayerDocs.length > 0 ? '  ⚠' : ''}`)
  row('scope:ALL stat docs',  String(newAllStatsDocs.length))
  row('scope:UCL stat docs',  String(newUclStatsDocs.length))
  row('UCL match docs',       String(newMatchDocs.length))
  row('Transfer docs',        String(newTransferDocs.length))

  // ════════════════════════════════════════════════════════════════
  // STAGE 6 — Compute updated player top-level totals
  // ════════════════════════════════════════════════════════════════
  header('STAGE 6 — Player Total Recomputation')
  console.log()

  const playerUpdates = []  // { id, apps, goals, assists, cleanSheets, uclApps, ..., status? }

  for (const pm of playerMatches.filter(pm => pm.fp && pm.category !== 'ambiguous')) {
    const pid = pm.fp.id

    // Sum existing + new ALL docs
    const exAll = existingSsDocs.filter(d => d.playerId === pid && d.scope === 'ALL')
    const exUcl = existingSsDocs.filter(d => d.playerId === pid && d.scope === 'UCL')
    const nyAll = newAllStatsDocs.filter(e => e.pm === pm).map(e => e.doc)
    const nyUcl = newUclStatsDocs.filter(e => e.pm === pm).map(e => e.doc)

    let apps = 0, goals = 0, assists = 0, cleanSheets = null
    for (const d of [...exAll, ...nyAll]) {
      apps    += d.apps    || 0
      goals   += d.goals   || 0
      assists += d.assists || 0
      if (d.cleanSheets != null) cleanSheets = (cleanSheets || 0) + d.cleanSheets
    }

    let uclApps = 0, uclGoals = 0, uclAssists = 0, uclCleanSheets = null
    for (const d of [...exUcl, ...nyUcl]) {
      uclApps    += d.apps    || 0
      uclGoals   += d.goals   || 0
      uclAssists += d.assists || 0
      if (d.cleanSheets != null) uclCleanSheets = (uclCleanSheets || 0) + d.cleanSheets
    }

    const prev = pm.fp.apps ?? 0
    const delta = apps - prev
    console.log(`  ${pm.fp.name.padEnd(30)}  apps: ${prev} → ${apps}  (${delta >= 0 ? '+' : ''}${delta})`)

    const upd = { id: pid, apps, goals, assists, cleanSheets, uclApps, uclGoals, uclAssists, uclCleanSheets }
    if (pm.statusTransition === 'Sold') { upd.status = 'Sold'; console.log(`    ⚠  status → Sold`) }
    playerUpdates.push(upd)
  }

  // Catch OUT-transfer status changes for players absent from playerStats.
  // Uses transferPlayerMap so resolution is consistent with transfer doc playerId.
  const soldOutsideStats = []   // { id, name } — status-only updates for the batch
  const idsInUpdates = new Set(playerUpdates.map(u => u.id))

  for (const t of transfers.filter(t => t.direction === 'OUT')) {
    const resolved = transferPlayerMap.get(t.player)
    const fp = resolved?.fp

    // Skip: unresolved (already warned in transferPlayerMap build), or new player
    // (new players are Active by definition — status is set in their player doc)
    if (!fp) continue

    // Skip: player is already covered by playerUpdates (in playerStats)
    if (idsInUpdates.has(fp.id)) continue

    // Player found in Firestore but not in playerStats — status-only update
    if (fp.status === 'Active') {
      soldOutsideStats.push({ id: fp.id, name: fp.name })
      console.log(`  ⚠  ${fp.name.padEnd(30)}  status → Sold  (OUT transfer, no S4 appearances)`)
    }
    // If already Sold/Loaned, no update needed
  }

  // ════════════════════════════════════════════════════════════════
  // STAGE 7 — Invariant check
  // ════════════════════════════════════════════════════════════════
  header('STAGE 7 — Invariant Check')
  console.log()

  for (const upd of playerUpdates) {
    // Verify: the total we plan to write == the actual Σ we computed from the docs
    const exAll = existingSsDocs.filter(d => d.playerId === upd.id && d.scope === 'ALL')
    const nyAll = newAllStatsDocs.filter(e => e.pm?.fp?.id === upd.id).map(e => e.doc)
    const actualSum = [...exAll, ...nyAll].reduce((a, d) => a + (d.apps || 0), 0)

    if (actualSum !== upd.apps) {
      errors.push(`Invariant FAIL: ${upd.id} — computed apps ${upd.apps} ≠ Σ docs ${actualSum}`)
      console.log(`  ✗  ${existingPlayers.find(p => p.id === upd.id)?.name ?? upd.id}  invariant FAIL`)
    }
  }

  const lpRecOk = si.uclLPP == null || lpMatches.length === si.uclLPP
  console.log(`  ${lpRecOk ? '✓' : '✗'}  LP reconciliation: ${lpMatches.length} match docs provided, uclLPP=${si.uclLPP ?? '(not set)'}`)
  if (errors.filter(e => e.startsWith('Invariant')).length === 0) {
    console.log('  ✓  All computed totals consistent with Σ of staged docs')
  }

  // ════════════════════════════════════════════════════════════════
  // FULL REPORT
  // ════════════════════════════════════════════════════════════════

  const allBlockers = [...errors, ...blockers]
  const isWriteSafe = allBlockers.length === 0
  const totalOps    = 1 + newPlayerDocs.length + newAllStatsDocs.length + newUclStatsDocs.length +
                      newMatchDocs.length + newTransferDocs.length + playerUpdates.length +
                      soldOutsideStats.length

  console.log('\n' + '═'.repeat(62))
  console.log('  DRY-RUN SUMMARY')
  console.log('═'.repeat(62))

  // Players
  header('Players')
  const matched    = playerMatches.filter(p => p.category === 'matched').length
  const newPl      = playerMatches.filter(p => p.category === 'new' || p.category === 'new_generated').length
  const ambig      = playerMatches.filter(p => p.category === 'ambiguous').length
  const statusChg  = playerMatches.filter(p => p.statusTransition).length + soldOutsideStats.length
  row('Total in input',              String(playerMatches.length))
  row('Matched to existing',         String(matched))
  row('New (will create)',           newPl  > 0 ? `${newPl}  ⚠` : '0')
  row('Ambiguous (blocks --write)',  ambig  > 0 ? `${ambig}  ✗` : '0')
  row('Status transitions',         statusChg > 0 ? `${statusChg}  ⚠` : '0')
  playerMatches.filter(p => p.category === 'ambiguous').forEach(pm =>
    console.log(`    ✗  "${pm.entry.name}" → ${pm.candidates?.map(p=>p.name).join(', ')}`)
  )
  playerMatches.filter(p => p.category !== 'matched' && p.category !== 'ambiguous').forEach(pm =>
    console.log(`    ⚠  ${pm.entry.name}  (${pm.category})`)
  )

  // Opponents
  header('UCL Opponents')
  const oppHigh    = oppResults.filter(o => o.match?.confidence === 'high').length
  const oppWarn    = oppResults.filter(o => o.match && o.match.confidence !== 'high').length
  const oppFail    = oppResults.filter(o => !o.match).length
  row('Matched (high)',           String(oppHigh))
  row('Matched (review)',         oppWarn > 0 ? `${oppWarn}  ⚠` : '0')
  row('Unmatched (blocks --write)', oppFail > 0 ? `${oppFail}  ✗` : '0')
  if (oppFail > 0) {
    console.log('\n  To fix — add to data/opponents-seed.json:')
    oppResults.filter(o => !o.match).forEach(o =>
      console.log(`    { "opponentKey": "${normName(o.raw).replace(/\s+/g, '-')}", "displayName": "${o.raw}", "country": "?", "sofifaTeamId": 0, "aliases": ["${normName(o.raw)}"] }`)
    )
  }

  // Transfer clubs
  header('Transfer Clubs')
  const clubOk    = clubResults.filter(c => c.resolved).length
  const clubFail  = clubResults.filter(c => !c.resolved).length
  row('Matched',                      String(clubOk))
  row('Unmatched (blocks --write)',    clubFail > 0 ? `${clubFail}  ✗` : '0')
  if (clubFail > 0) {
    console.log('\n  To fix — add to data/transfer-clubs.json:')
    clubResults.filter(c => !c.resolved).forEach(c =>
      console.log(`    "${normClubKey(c.raw)}": { "displayName": "${c.raw}", "sofifaTeamId": 0 }`)
    )
  }

  // UCL campaign
  header('UCL Campaign')
  if (si.uclEntered) {
    const koPath = ['R16','QF','SF','Final'].filter(r => uclMatches.some(m => m.competition === `UCL_${r}`)).join(' → ')
    row('League Phase matches',     `${lpMatches.length}  (uclLPP: ${si.uclLPP ?? '—'})`)
    row('LP record from match docs', `${lpW}W ${lpD}D ${lpL}L  ${lpGF}GF ${lpGA}GA`)
    row('LP record from season block',`${si.uclLPW ?? '?'}W ${si.uclLPD ?? '?'}D ${si.uclLPL ?? '?'}L  ${si.uclLPGF ?? '?'}GF ${si.uclLPGA ?? '?'}GA`)
    row('Reconciled',               lpRecOk ? '✓ YES' : '✗ MISMATCH')
    row('KO path',                  koPath || '(none in input)')
    row('UCL result',               si.uclResult ?? '—')
    row('Final single-leg',         finalWithLeg.length === 0 ? '✓ PASS' : '✗ FAIL')
  } else {
    console.log('\n  (uclEntered: false — no UCL campaign)')
  }

  // Trophies
  header('Trophies Detected')
  const trophies = []
  if (si.leaguePosition === 1)             trophies.push(si.leagueCompetition || 'League')
  if (si.uclResult === 'Champions')        trophies.push('UEFA Champions League')
  if (si.faCupResult === 'Winner')         trophies.push('FA Cup')
  if (si.carabaoCupResult === 'Winner')    trophies.push('Carabao Cup')
  if (trophies.length === 0) console.log('\n  (no trophies derived from season result fields)')
  else trophies.forEach(t => console.log(`  ✓  ${t}`))

  // Warnings
  if (warnings.length > 0) {
    header('Warnings')
    warnings.forEach(w => console.log(`  ⚠  ${w}`))
  }

  // Blocking issues
  if (allBlockers.length > 0) {
    header('Blocking Issues  (prevent --write)')
    allBlockers.forEach(b => console.log(`  ✗  ${b}`))
  }

  // Pages expected to update
  header('Pages Expected to Update After Write')
  const pages = ['Home', 'Seasons', 'Season Detail', 'Players', 'Player Profile',
                 'Records', 'Museum', 'History', 'Transfers']
  if (si.uclEntered) pages.push('UCL Overview', 'UCL Seasons', 'UCL Players', 'UCL Records', 'UCL Opponents')
  pages.forEach(p => console.log(`  ✓  ${p}`))

  // Write readiness
  console.log('\n' + '═'.repeat(62))
  if (isWriteSafe) {
    console.log('  ✅  SAFE TO WRITE')
    console.log(`  ${totalOps} Firestore operations ready.  Run with --write to apply.`)
  } else {
    console.log('  ✗   WRITE BLOCKED')
    console.log(`  ${allBlockers.length} issue(s) must be resolved.  See "Blocking Issues" above.`)
  }
  console.log('═'.repeat(62))

  // ════════════════════════════════════════════════════════════════
  // WRITE PATH
  // ════════════════════════════════════════════════════════════════

  if (!WRITE) {
    console.log('\n  Dry run complete. No data was written.')
    console.log('  Review the report, resolve any issues, then run with --write.\n')
    return
  }

  if (!isWriteSafe) {
    console.log('\n  ✗ Write aborted. Resolve all blocking issues and re-run dry-run first.\n')
    process.exit(1)
  }

  // ── Pre-allocate all document refs ──────────────────────────────────────────
  //
  // db.collection('x').doc() generates a Firestore document ID locally using
  // Firestore's ID generator — it makes NO network call and creates NO document.
  // The document only exists after batch.commit() succeeds.
  //
  // Pre-allocating all refs first lets us wire every cross-reference
  // (seasonId on stat/match/transfer docs, playerId on stat/transfer docs)
  // before any write happens, making the entire import a single atomic commit.

  header('Preparing Batch')
  console.log()

  const seasonRef = db.collection('seasons').doc()
  const seasonId  = seasonRef.id
  console.log(`  season id pre-allocated  : ${seasonId}`)

  // Pre-allocate new player refs — IDs known before any write
  const newPlayerRefMap = new Map()   // entry.name → DocumentReference
  const newPlayerIdMap  = new Map()   // entry.name → doc ID string
  for (const pm of playerMatches.filter(pm => pm.category === 'new' || pm.category === 'new_generated')) {
    const ref = db.collection('players').doc()
    newPlayerRefMap.set(pm.entry.name, ref)
    newPlayerIdMap.set(pm.entry.name, ref.id)
    console.log(`  player id pre-allocated  : ${pm.entry.name}  →  ${ref.id}`)
  }

  // resolveId is usable immediately — all IDs are known before batch.set() calls
  function resolveId(pm) {
    return pm.fp?.id ?? newPlayerIdMap.get(pm.entry.name) ?? null
  }

  // ── Stage all operations into the batch ──────────────────────────────────────

  const batch    = db.batch()
  let   opCount  = 0

  function bSet(ref, data)   { batch.set(ref, data);    opCount++ }
  function bUpdate(ref, flds){ batch.update(ref, flds); opCount++ }

  // 1 — Season doc
  bSet(seasonRef, seasonDoc)

  // 2 — New player docs
  for (const pm of playerMatches.filter(pm => pm.category === 'new' || pm.category === 'new_generated')) {
    const docData = newPlayerDocs.find(d => d.name === pm.entry.name)
    if (!docData) continue
    bSet(newPlayerRefMap.get(pm.entry.name), docData)
  }

  // 3 — scope:ALL seasonStats
  let allStaged = 0, allSkipped = 0
  for (const { doc, pm } of newAllStatsDocs) {
    const playerId = resolveId(pm)
    if (!playerId) continue
    const key = `${playerId}|${seasonId}|ALL`
    if (existingSsKeys.has(key)) { allSkipped++; continue }
    bSet(db.collection('seasonStats').doc(), { ...doc, playerId, seasonId, label: seasonLabel })
    allStaged++
  }

  // 4 — scope:UCL seasonStats
  let uclStaged = 0, uclSkipped = 0
  for (const { doc, pm } of newUclStatsDocs) {
    const playerId = resolveId(pm)
    if (!playerId) continue
    const key = `${playerId}|${seasonId}|UCL`
    if (existingSsKeys.has(key)) { uclSkipped++; continue }
    bSet(db.collection('seasonStats').doc(), { ...doc, playerId, seasonId })
    uclStaged++
  }

  // 5 — UCL match docs
  for (const doc of newMatchDocs) {
    bSet(db.collection('matches').doc(), { ...doc, seasonId })
  }

  // 6 — Transfer docs
  for (const t of newTransferDocs) {
    const { _crestUrl, ...cleanDoc } = t
    // Resolve PENDING → real ID for new players; existing and direct-Firestore
    // players already have their real ID stored in cleanDoc.playerId.
    const resolved = transferPlayerMap.get(t.player)
    let   playerId = cleanDoc.playerId
    if (playerId === PENDING && resolved?.pm) {
      playerId = resolveId(resolved.pm)  // pre-allocated ID for new player
    }
    bSet(db.collection('transfers').doc(), { ...cleanDoc, seasonId, playerId: playerId ?? null })
  }

  // 7 — Player top-level cache updates (existing player docs — batch.update not batch.set)
  for (const upd of playerUpdates) {
    const { id, ...fields } = upd
    bUpdate(db.collection('players').doc(id), fields)
  }

  // 8 — Status-only updates for sold players absent from playerStats
  //     (new players already have correct status in their bSet doc above)
  for (const sold of soldOutsideStats) {
    bUpdate(db.collection('players').doc(sold.id), { status: 'Sold' })
  }

  // ── Log what is staged ───────────────────────────────────────────────────────
  console.log()
  console.log(`  Staged  1  season doc`)
  console.log(`  Staged  ${newPlayerDocs.length}  new player doc(s)  (cache totals seeded from S4 stats)`)
  console.log(`  Staged  ${allStaged}  scope:ALL stat doc(s)${allSkipped > 0 ? `  (${allSkipped} skipped — already exist)` : ''}`)
  console.log(`  Staged  ${uclStaged}  scope:UCL stat doc(s)${uclSkipped > 0 ? `  (${uclSkipped} skipped — already exist)` : ''}`)
  console.log(`  Staged  ${newMatchDocs.length}  UCL match doc(s)`)
  console.log(`  Staged  ${newTransferDocs.length}  transfer doc(s)`)
  console.log(`  Staged  ${playerUpdates.length}  player cache update(s)`)
  console.log(`  Staged  ${soldOutsideStats.length}  status-only update(s)  (sold, not in playerStats)`)

  // ── Guard: reject if approaching Firestore's 500-operation batch limit ───────
  console.log()
  console.log(`  Total operations : ${opCount}  (hard limit: 500, guard: 450)`)

  if (opCount >= 450) {
    console.error(`\n  ✗ Batch size ${opCount} is at or above the safety limit of 450.`)
    console.error('  This season cannot be imported in a single batch.')
    console.error('  Contact the developer to add multi-batch support.\n')
    process.exit(1)
  }

  // ── Commit ───────────────────────────────────────────────────────────────────
  //
  // This is the ONLY line that writes to Firestore.
  // If it throws, Firestore is completely unchanged — no partial state.

  console.log(`  Committing ${opCount} operations atomically…`)
  try {
    await batch.commit()
  } catch (err) {
    console.error(`\n  ✗ Batch commit FAILED. Firestore is unchanged — no partial import.`)
    console.error(`  Error: ${err.message}`)
    console.error('  Fix the issue and re-run. The dry-run report is still valid.\n')
    process.exit(1)
  }

  console.log(`  ✅ Batch committed. All ${opCount} operations applied atomically.`)

  // ── Post-write invariant verification ────────────────────────────────────────
  header('Post-Write Verification')
  console.log()
  const postSnap = await db.collection('seasonStats').get()
  const postDocs = postSnap.docs
    .map(d => d.data())
    .filter(d => new Set([...knownSeasonIds, seasonId]).has(d.seasonId))

  let postPass = true
  for (const upd of playerUpdates) {
    const liveAll = postDocs.filter(d => d.playerId === upd.id && d.scope === 'ALL')
    const liveSum = liveAll.reduce((a, d) => a + (d.apps || 0), 0)
    const name    = existingPlayers.find(p => p.id === upd.id)?.name ?? upd.id
    if (liveSum !== upd.apps) {
      console.log(`  ✗  ${name.padEnd(30)}  live Σ apps ${liveSum} ≠ written ${upd.apps}`)
      postPass = false
    } else {
      console.log(`  ✓  ${name.padEnd(30)}  apps ${liveSum}`)
    }
  }

  console.log('\n' + '═'.repeat(62))
  if (postPass) {
    console.log(`  ✅  Import complete. Season "${seasonLabel}" is live.`)
    console.log('  Run validateDataHealth.mjs to confirm full data health.')
  } else {
    console.log('  ⚠   Import done but post-write verification found mismatches.')
    console.log('  Run validateDataHealth.mjs immediately to diagnose.')
    process.exit(1)
  }
  console.log('═'.repeat(62) + '\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
