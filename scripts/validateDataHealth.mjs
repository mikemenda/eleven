/**
 * validateDataHealth.mjs
 *
 * Read-only data health validation for the Eleven app.
 * Confirms that the seasonStats collection is internally consistent
 * and that all Phase 1 page read paths have valid data.
 *
 * Runs five sections:
 *   1. seasonStats coverage  — every season has ALL + UCL docs, no orphans
 *   2. Player total reconciliation — top-level cached totals match collection sums
 *   3. Arithmetic checks — stored per-game rates consistent with raw counts
 *   4. Records readiness — each Phase 1 page read path has valid data
 *   5. Summary + recommendation
 *
 * Club scoping:
 *   - Pass --clubId=<id> to target a specific club.
 *   - If omitted, auto-detects only when exactly one club exists.
 *   - If multiple clubs exist, stops and asks for --clubId.
 *   - Never hardcodes any club ID.
 *
 * Usage:
 *   node scripts/validateDataHealth.mjs
 *   node scripts/validateDataHealth.mjs --clubId=<id>
 *   node scripts/validateDataHealth.mjs --verbose
 *
 * No --write mode. This script is read-only only.
 * Requires serviceAccountKey.json at project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH  = resolve(__dirname, '../serviceAccountKey.json')

// ─── CLI ─────────────────────────────────────────────────────────────────────

const VERBOSE = process.argv.includes('--verbose')

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

if (args.write) {
  console.error('\nvalidateDataHealth.mjs is read-only. There is no --write mode.\n')
  process.exit(1)
}

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
    if (!snap.exists) {
      console.error(`\n✗ No club found with id: "${providedId}"\n`)
      process.exit(1)
    }
    return { id: snap.id, ...snap.data() }
  }

  const snap = await db.collection('clubs').get()
  if (snap.empty) {
    console.error('\n✗ No clubs found in Firestore.\n')
    process.exit(1)
  }
  if (snap.docs.length > 1) {
    console.error('\n✗ Multiple clubs found. Pass --clubId=<id> to specify which club.\n')
    snap.docs.forEach(d => console.error(`     ${d.id}  "${d.data().name}"`))
    console.error()
    process.exit(1)
  }
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// ─── Verdict helpers ──────────────────────────────────────────────────────────

const PASS    = 'PASS'
const WARNING = 'WARNING'
const FAIL    = 'FAIL'

function verdictMark(v) {
  if (v === PASS)    return '✓'
  if (v === WARNING) return '⚠'
  return                    '✗'
}

function worstVerdict(...verdicts) {
  if (verdicts.includes(FAIL))    return FAIL
  if (verdicts.includes(WARNING)) return WARNING
  return PASS
}

function header(title) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + title)
  console.log('─'.repeat(62))
}

function row(label, value, verdict) {
  const mark = verdict ? `  ${verdictMark(verdict)}` : ''
  console.log(`  ${label.padEnd(42)} ${String(value)}${mark}`)
}

// ─── Rate helpers ─────────────────────────────────────────────────────────────

function calcRate(num, den) {
  if (!den || den === 0) return null
  return num / den
}

function rateClose(stored, calc, tol = 0.015) {
  if (stored == null && calc == null) return true
  if (stored == null || calc == null) return false
  return Math.abs(stored - calc) <= tol
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db   = initFirebase()
  const club = await resolveClub(db, args.clubId)

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log('  validateDataHealth — read-only')
  console.log(`  Club : ${club.name}`)
  console.log(`  ID   : ${club.id}`)
  console.log('══════════════════════════════════════════════════════════════')

  // ── Load all data ───────────────────────────────────────────────────────────

  const [seasonsSnap, playersSnap, ssSnap] = await Promise.all([
    db.collection('seasons').where('clubId', '==', club.id).get(),
    db.collection('players').where('clubId', '==', club.id).get(),
    db.collection('seasonStats').get(),
  ])

  // Seasons
  const seasons    = seasonsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const seasonById = new Map(seasons.map(s => [s.id, s]))
  const seasonIdSet = new Set(seasons.map(s => s.id))

  // Players
  const players       = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const playerById    = new Map(players.map(p => [p.id, p]))
  const playerIdSet   = new Set(players.map(p => p.id))
  const activePlayers = players.filter(p => !p.isHistoricalStub)
  const stubPlayers   = players.filter(p =>  p.isHistoricalStub)

  // seasonStats — scope to this club by seasonId (avoids trusting clubId field)
  const allSsDocs = ssSnap.docs
    .map(d => ({ _docId: d.id, ...d.data() }))
    .filter(d => seasonIdSet.has(d.seasonId))

  const allDocs = allSsDocs.filter(d => d.scope === 'ALL')
  const uclDocs = allSsDocs.filter(d => d.scope === 'UCL')

  console.log(`\n  Seasons   : ${seasons.length}`)
  console.log(`  Players   : ${players.length} total (${activePlayers.length} active, ${stubPlayers.length} stubs)`)
  console.log(`  SS docs   : ${allSsDocs.length} (${allDocs.length} ALL, ${uclDocs.length} UCL)`)

  // Track overall verdicts across sections
  const sectionVerdicts = []
  let   totalChecks = 0
  let   totalPass   = 0
  let   totalWarn   = 0
  let   totalFail   = 0

  function record(verdict) {
    totalChecks++
    if (verdict === PASS)    totalPass++
    if (verdict === WARNING) totalWarn++
    if (verdict === FAIL)    totalFail++
    return verdict
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 1 — seasonStats Coverage
  // ════════════════════════════════════════════════════════════════

  header('SECTION 1 — seasonStats Coverage')

  const s1Issues = []

  // 1a. scope:ALL per season
  console.log('\n  scope:ALL coverage:')
  const allBySeasonId = new Map()
  for (const doc of allDocs) {
    if (!allBySeasonId.has(doc.seasonId)) allBySeasonId.set(doc.seasonId, [])
    allBySeasonId.get(doc.seasonId).push(doc)
  }

  for (const s of seasons.sort((a, b) => (a.label||'').localeCompare(b.label||'', undefined, { numeric: true }))) {
    const docs = allBySeasonId.get(s.id) || []
    const v    = record(docs.length > 0 ? PASS : FAIL)
    console.log(`    ${s.label?.padEnd(4) || '????'}  ${verdictMark(v)}  ${docs.length} doc(s)`)
    if (v === FAIL) s1Issues.push(`No scope:ALL docs for season ${s.label}`)
  }

  // 1b. scope:UCL per UCL season
  console.log('\n  scope:UCL coverage (UCL seasons only):')
  const uclBySeasonId = new Map()
  for (const doc of uclDocs) {
    if (!uclBySeasonId.has(doc.seasonId)) uclBySeasonId.set(doc.seasonId, [])
    uclBySeasonId.get(doc.seasonId).push(doc)
  }

  const uclSeasons = seasons.filter(s => s.uclEntered === true)
  if (uclSeasons.length === 0) {
    console.log('    (no seasons marked uclEntered:true — skipping UCL coverage check)')
  }
  for (const s of uclSeasons.sort((a, b) => (a.label||'').localeCompare(b.label||'', undefined, { numeric: true }))) {
    const docs = uclBySeasonId.get(s.id) || []
    const v    = record(docs.length > 0 ? PASS : FAIL)
    console.log(`    ${s.label?.padEnd(4) || '????'}  ${verdictMark(v)}  ${docs.length} doc(s)`)
    if (v === FAIL) s1Issues.push(`No scope:UCL docs for UCL season ${s.label}`)
  }

  // 1c. Orphaned seasonId
  const orphanSeason = allSsDocs.filter(d => !seasonById.has(d.seasonId))
  const vOrphanSzn   = record(orphanSeason.length === 0 ? PASS : FAIL)
  row('Orphaned seasonId docs', orphanSeason.length === 0 ? '0  ✓' : `${orphanSeason.length}  ✗`, null)
  if (orphanSeason.length > 0) {
    orphanSeason.forEach(d => s1Issues.push(`Doc ${d._docId} has unknown seasonId: ${d.seasonId}`))
    if (VERBOSE) orphanSeason.forEach(d => console.log(`    ✗  ${d._docId}  seasonId:${d.seasonId}`))
  }

  // 1d. Orphaned playerId
  const orphanPlayer = allSsDocs.filter(d => !playerById.has(d.playerId))
  const vOrphanPlr   = record(orphanPlayer.length === 0 ? PASS : FAIL)
  row('Orphaned playerId docs', orphanPlayer.length === 0 ? '0  ✓' : `${orphanPlayer.length}  ✗`, null)
  if (orphanPlayer.length > 0) {
    orphanPlayer.forEach(d => s1Issues.push(`Doc ${d._docId} has unknown playerId: ${d.playerId}`))
    if (VERBOSE) orphanPlayer.forEach(d => console.log(`    ✗  ${d._docId}  playerId:${d.playerId}`))
  }

  // 1e. Wrong clubId
  const wrongClubId  = allSsDocs.filter(d => d.clubId !== club.id)
  const vClubId      = record(wrongClubId.length === 0 ? PASS : FAIL)
  row('Docs with wrong clubId', wrongClubId.length === 0 ? '0  ✓' : `${wrongClubId.length}  ✗`, null)
  if (wrongClubId.length > 0) {
    wrongClubId.forEach(d => {
      const lbl = seasonById.get(d.seasonId)?.label ?? '?'
      s1Issues.push(`Doc ${d._docId} (${d.playerName || d.playerId}, ${lbl}) has wrong clubId: "${d.clubId}"`)
    })
    if (VERBOSE) wrongClubId.forEach(d => console.log(`    ✗  ${d._docId}  stored:"${d.clubId}"  correct:"${club.id}"`))
  }

  // 1f. Label coverage
  console.log('\n  Label field coverage:')
  const allMissingLabel = allDocs.filter(d => !d.label)
  const uclMissingLabel = uclDocs.filter(d => !d.label)

  // scope:ALL docs missing label: WARNING (Step E fix handles at runtime via seasonId)
  const vAllLabel = record(allMissingLabel.length === 0 ? PASS : WARNING)
  console.log(`    scope:ALL missing label  ${verdictMark(vAllLabel)}  ${allMissingLabel.length} doc(s)`)
  if (allMissingLabel.length > 0) {
    // Check if their seasonId resolves — if not, that is a FAIL-level problem
    const unresolvable = allMissingLabel.filter(d => !seasonById.has(d.seasonId))
    if (unresolvable.length > 0) {
      unresolvable.forEach(d => s1Issues.push(`scope:ALL doc ${d._docId} missing label AND seasonId unresolvable`))
      record(FAIL)
      console.log(`      ✗  ${unresolvable.length} doc(s) cannot be resolved even by seasonId — FAIL`)
    } else {
      console.log(`      ⚠  All ${allMissingLabel.length} are resolvable by seasonId (Step E fix covers this)`)
    }
    if (VERBOSE) allMissingLabel.forEach(d => {
      const lbl = seasonById.get(d.seasonId)?.label ?? '(unresolvable)'
      console.log(`      ${d._docId}  player:${d.playerName||d.playerId}  season:${lbl}`)
    })
  }

  // scope:UCL docs missing label: expected (seedUclS2S3 never stored label) — not a failure
  const vUclLabel = record(PASS) // not penalised
  console.log(`    scope:UCL missing label  ${verdictMark(vUclLabel)}  ${uclMissingLabel.length} doc(s)  (expected — UCL docs never stored label)`)

  const sec1Verdict = worstVerdict(vOrphanSzn, vOrphanPlr, vClubId, vAllLabel,
    ...seasons.map(s => (allBySeasonId.get(s.id)||[]).length > 0 ? PASS : FAIL),
    ...uclSeasons.map(s => (uclBySeasonId.get(s.id)||[]).length > 0 ? PASS : FAIL)
  )
  sectionVerdicts.push(sec1Verdict)

  console.log(`\n  SECTION 1 RESULT:  ${verdictMark(sec1Verdict)} ${sec1Verdict}`)
  if (s1Issues.length > 0 && !VERBOSE) {
    console.log(`  Issues (${s1Issues.length}):`)
    s1Issues.forEach(msg => console.log(`    ✗  ${msg}`))
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 2 — Player Total Reconciliation
  // ════════════════════════════════════════════════════════════════

  header('SECTION 2 — Player Total Reconciliation')

  // Group collection docs by playerId for fast lookup
  const allDocsByPlayer = new Map()
  const uclDocsByPlayer = new Map()
  for (const doc of allDocs) {
    if (!allDocsByPlayer.has(doc.playerId)) allDocsByPlayer.set(doc.playerId, [])
    allDocsByPlayer.get(doc.playerId).push(doc)
  }
  for (const doc of uclDocs) {
    if (!uclDocsByPlayer.has(doc.playerId)) uclDocsByPlayer.set(doc.playerId, [])
    uclDocsByPlayer.get(doc.playerId).push(doc)
  }

  const rec2Rows   = []
  const rec2Issues = []

  for (const p of activePlayers) {
    const aDocs = allDocsByPlayer.get(p.id) || []
    const uDocs = uclDocsByPlayer.get(p.id) || []

    // Sum from collection
    let sumApps = 0, sumGoals = 0, sumAssists = 0, sumCS = null
    for (const d of aDocs) {
      sumApps    += d.apps        || 0
      sumGoals   += d.goals       || 0
      sumAssists += d.assists     || 0
      if (d.cleanSheets != null) sumCS = (sumCS || 0) + d.cleanSheets
    }

    let sumUclApps = 0, sumUclGoals = 0, sumUclAssists = 0, sumUclCS = null
    for (const d of uDocs) {
      sumUclApps    += d.apps        || 0
      sumUclGoals   += d.goals       || 0
      sumUclAssists += d.assists     || 0
      if (d.cleanSheets != null) sumUclCS = (sumUclCS || 0) + d.cleanSheets
    }

    const checks = [
      { field: 'apps',         topLevel: p.apps         ?? 0,    sum: sumApps },
      { field: 'goals',        topLevel: p.goals        ?? 0,    sum: sumGoals },
      { field: 'assists',      topLevel: p.assists      ?? 0,    sum: sumAssists },
      { field: 'cleanSheets',  topLevel: p.cleanSheets  ?? null, sum: sumCS },
      { field: 'uclApps',      topLevel: p.uclApps      ?? 0,    sum: sumUclApps },
      { field: 'uclGoals',     topLevel: p.uclGoals     ?? 0,    sum: sumUclGoals },
      { field: 'uclAssists',   topLevel: p.uclAssists   ?? 0,    sum: sumUclAssists },
      { field: 'uclCleanSheets', topLevel: p.uclCleanSheets ?? null, sum: sumUclCS },
    ]

    const playerIssues = []

    for (const { field, topLevel, sum } of checks) {
      // Normalise nulls: null ≈ 0 for fields we expect to be 0 when absent
      const tl = topLevel ?? 0
      const s  = sum      ?? 0

      let v
      if (aDocs.length === 0 && field !== 'uclApps' && field !== 'uclGoals' && field !== 'uclAssists' && field !== 'uclCleanSheets') {
        // No ALL docs at all for this player — cache can't be verified against collection
        v = record(WARNING)
        playerIssues.push(`${field}: no ALL docs to verify against (top-level: ${topLevel})`)
      } else if (tl !== s) {
        v = record(FAIL)
        playerIssues.push(`${field}: top-level ${tl} ≠ collection sum ${s}  (delta: ${s - tl > 0 ? '+' : ''}${s - tl})`)
        rec2Issues.push(`${p.name}  ${field}: top-level ${tl} ≠ sum ${s}`)
      } else {
        v = record(PASS)
      }
    }

    if (playerIssues.length > 0) {
      rec2Rows.push({ player: p, issues: playerIssues })
    }
  }

  const rec2Mismatches = rec2Issues.length
  const rec2Players    = new Set(rec2Issues.map(r => r.split('  ')[0])).size

  row('Active players checked',   activePlayers.length, null)
  row('Historical stubs skipped', stubPlayers.length,   null)
  row('Total field comparisons',  activePlayers.length * 8, null)
  row('Mismatches found',         rec2Mismatches === 0 ? '0  ✓' : `${rec2Mismatches}  ✗`, null)

  if (rec2Rows.length > 0) {
    console.log()
    for (const { player, issues } of rec2Rows) {
      console.log(`  ${player.name}`)
      for (const msg of issues) console.log(`    ${verdictMark(FAIL)}  ${msg}`)
    }
  }

  if (stubPlayers.length > 0 && VERBOSE) {
    console.log(`\n  Stubs ignored (${stubPlayers.length}):`)
    stubPlayers.forEach(p => console.log(`    ${p.name}`))
  }

  const sec2Verdict = rec2Mismatches === 0 ? PASS : FAIL
  sectionVerdicts.push(sec2Verdict)
  console.log(`\n  SECTION 2 RESULT:  ${verdictMark(sec2Verdict)} ${sec2Verdict}`)

  // ════════════════════════════════════════════════════════════════
  // SECTION 3 — Arithmetic Checks
  // ════════════════════════════════════════════════════════════════

  header('SECTION 3 — Arithmetic Checks')

  const sec3Issues   = []
  let   rateWarn     = 0
  let   rateFail     = 0
  let   impossibleCS = 0
  let   uclGtAll     = 0
  let   negativeVals = 0
  let   zeroAppsData = 0
  let   highRateWarn = 0
  let   docsWithRates = 0

  for (const doc of allSsDocs) {
    const nm  = doc.playerName ?? doc.playerId ?? '?'
    const lbl = seasonById.get(doc.seasonId)?.label ?? '?'
    const tag = `${nm} (${lbl} ${doc.scope})`

    // Hard FAIL: negative values
    for (const field of ['apps', 'goals', 'assists', 'cleanSheets']) {
      if (doc[field] != null && doc[field] < 0) {
        record(FAIL); rateFail++; negativeVals++
        sec3Issues.push(`FAIL  ${tag}  negative ${field}: ${doc[field]}`)
      }
    }

    // Hard FAIL: apps=0 with goals/assists/cleanSheets present
    if ((doc.apps ?? 0) === 0) {
      const hasData = (doc.goals > 0) || (doc.assists > 0) || (doc.cleanSheets > 0)
      if (hasData) {
        record(FAIL); rateFail++; zeroAppsData++
        sec3Issues.push(`FAIL  ${tag}  apps=0 but has goal/assist/CS data`)
      }
    }

    // Hard FAIL: cleanSheets on a non-GK scope:ALL doc
    if (doc.scope === 'ALL' && !doc.isGK && doc.cleanSheets != null && doc.cleanSheets > 0) {
      record(FAIL); rateFail++; impossibleCS++
      sec3Issues.push(`FAIL  ${tag}  cleanSheets=${doc.cleanSheets} on non-GK player`)
    }

    // Skip rate checks if apps=0
    if ((doc.apps ?? 0) === 0) continue

    const apps    = doc.apps
    const goals   = doc.goals   ?? 0
    const assists = doc.assists ?? 0
    const cs      = doc.cleanSheets

    // Rate checks (stored vs computed)
    if (doc.gPerGame != null) {
      docsWithRates++
      const computed = calcRate(goals, apps)
      if (!rateClose(doc.gPerGame, computed)) {
        record(WARNING); rateWarn++
        sec3Issues.push(`WARN  ${tag}  gPerGame stored:${doc.gPerGame} computed:${computed?.toFixed(3)}`)
      } else { record(PASS) }
    }
    if (doc.aPerGame != null) {
      const computed = calcRate(assists, apps)
      if (!rateClose(doc.aPerGame, computed)) {
        record(WARNING); rateWarn++
        sec3Issues.push(`WARN  ${tag}  aPerGame stored:${doc.aPerGame} computed:${computed?.toFixed(3)}`)
      } else { record(PASS) }
    }
    if (doc.cPerGame != null) {
      const computed = calcRate(goals + assists, apps)
      if (!rateClose(doc.cPerGame, computed)) {
        record(WARNING); rateWarn++
        sec3Issues.push(`WARN  ${tag}  cPerGame stored:${doc.cPerGame} computed:${computed?.toFixed(3)}`)
      } else { record(PASS) }
    }
    if (doc.csPerGame != null && doc.isGK) {
      const computed = calcRate(cs ?? 0, apps)
      if (!rateClose(doc.csPerGame, computed)) {
        record(WARNING); rateWarn++
        sec3Issues.push(`WARN  ${tag}  csPerGame stored:${doc.csPerGame} computed:${computed?.toFixed(3)}`)
      } else { record(PASS) }
    }

    // WARNING (not FAIL): unusually high rate — possible in a video game, but worth flagging
    if (doc.scope === 'ALL' && !doc.isGK) {
      if ((doc.gPerGame ?? 0) > 1.0) {
        record(WARNING); highRateWarn++
        sec3Issues.push(`WARN  ${tag}  gPerGame=${doc.gPerGame} > 1.0 (unusual — verify)`)
      }
    }
  }

  // Hard FAIL: UCL apps > ALL apps for the same player in the same season
  for (const s of seasons) {
    const allForSzn = allDocsByPlayer  // iterate all players
    for (const [playerId] of allDocsByPlayer) {
      const allDoc = (allDocsByPlayer.get(playerId) || []).find(d => d.seasonId === s.id)
      const uclDoc = (uclDocsByPlayer.get(playerId) || []).find(d => d.seasonId === s.id)
      if (allDoc && uclDoc) {
        if ((uclDoc.apps ?? 0) > (allDoc.apps ?? 0)) {
          record(FAIL); rateFail++; uclGtAll++
          const nm  = allDoc.playerName ?? playerId
          sec3Issues.push(`FAIL  ${nm} (${s.label})  UCL apps ${uclDoc.apps} > ALL apps ${allDoc.apps}`)
        } else { record(PASS) }
      }
    }
  }

  row('Docs checked',              allSsDocs.length, null)
  row('Docs with stored rate fields', docsWithRates, null)
  row('Rate mismatches (> ±0.015)', rateWarn === 0  ? '0  ✓' : `${rateWarn}  ⚠`, null)
  row('High gPerGame > 1.0 (warning)', highRateWarn === 0 ? '0  ✓' : `${highRateWarn}  ⚠`, null)
  row('Negative stat values',      negativeVals === 0 ? '0  ✓' : `${negativeVals}  ✗`, null)
  row('apps=0 with data',          zeroAppsData === 0 ? '0  ✓' : `${zeroAppsData}  ✗`, null)
  row('cleanSheets on non-GK',     impossibleCS === 0 ? '0  ✓' : `${impossibleCS}  ✗`, null)
  row('UCL apps > ALL apps (same szn)', uclGtAll === 0 ? '0  ✓' : `${uclGtAll}  ✗`, null)

  if (sec3Issues.length > 0) {
    console.log()
    sec3Issues.forEach(msg => console.log(`  ${msg}`))
  }

  const sec3Verdict = rateFail > 0 ? FAIL : rateWarn > 0 || highRateWarn > 0 ? WARNING : PASS
  sectionVerdicts.push(sec3Verdict)
  console.log(`\n  SECTION 3 RESULT:  ${verdictMark(sec3Verdict)} ${sec3Verdict}`)

  // ════════════════════════════════════════════════════════════════
  // SECTION 4 — Records Readiness
  // ════════════════════════════════════════════════════════════════

  header('SECTION 4 — Records Readiness')

  const sec4Rows = []

  function readinessCheck(name, verdict, detail) {
    record(verdict)
    sec4Rows.push({ name, verdict, detail })
  }

  // Players season filter: every season reachable by seasonId
  {
    const missingSzn = seasons.filter(s => (allBySeasonId.get(s.id) || []).length === 0)
    const v = missingSzn.length === 0 ? PASS : FAIL
    readinessCheck(
      'Players season filter',
      v,
      missingSzn.length === 0
        ? 'all seasons have ALL docs reachable by seasonId'
        : `${missingSzn.map(s => s.label).join(', ')} missing ALL docs`
    )
  }

  // PlayerProfile / Compare All Comps table: every active player with apps > 0 has ALL docs
  {
    const noAllDocs = activePlayers.filter(p => (p.apps ?? 0) > 0 && (allDocsByPlayer.get(p.id) || []).length === 0)
    const v = noAllDocs.length === 0 ? PASS : FAIL
    readinessCheck(
      'PlayerProfile / Compare All Comps table',
      v,
      noAllDocs.length === 0
        ? 'all active players with apps have ALL docs'
        : `${noAllDocs.length} player(s) have apps but no ALL docs: ${noAllDocs.map(p => p.name).join(', ')}`
    )
  }

  // Records All Comps single-season: ALL docs can be labelled (label field OR seasonId resolves)
  {
    const unreachable = allDocs.filter(d => !d.label && !seasonById.has(d.seasonId))
    const v = unreachable.length === 0 ? PASS : FAIL
    readinessCheck(
      'Records — All Comps single-season labels',
      v,
      unreachable.length === 0
        ? 'all ALL docs have label or resolvable seasonId'
        : `${unreachable.length} doc(s) have no label and unresolvable seasonId`
    )
  }

  // UCL Players tab: every active player with uclApps > 0 has UCL docs
  {
    const noUclDocs = activePlayers.filter(p => (p.uclApps ?? 0) > 0 && (uclDocsByPlayer.get(p.id) || []).length === 0)
    const v = noUclDocs.length === 0 ? PASS : FAIL
    readinessCheck(
      'UCL Players tab',
      v,
      noUclDocs.length === 0
        ? 'all players with cached uclApps have UCL docs'
        : `${noUclDocs.length} player(s) have uclApps but no UCL docs: ${noUclDocs.map(p => p.name).join(', ')}`
    )
  }

  // Records UCL single-season: UCL docs all have a resolvable seasonId
  {
    const badSeasonId = uclDocs.filter(d => !seasonById.has(d.seasonId))
    const v = badSeasonId.length === 0 ? PASS : FAIL
    readinessCheck(
      'Records — UCL single-season seasonId',
      v,
      badSeasonId.length === 0
        ? 'all UCL docs have resolvable seasonId'
        : `${badSeasonId.length} UCL doc(s) have unresolvable seasonId`
    )
  }

  // Home Legends: reads top-level totals only — always fine if players loaded
  readinessCheck(
    'Home Legends',
    PASS,
    'reads top-level totals only — no collection dependency'
  )

  // Museum / History / Seasons: reads season docs only
  readinessCheck(
    'Museum / History / Seasons',
    PASS,
    'reads season docs only — no player stat collection dependency'
  )

  // Print section 4 table
  console.log()
  const nameW = Math.max(...sec4Rows.map(r => r.name.length)) + 2
  for (const { name, verdict, detail } of sec4Rows) {
    console.log(`  ${verdictMark(verdict)}  ${name.padEnd(nameW)}  ${detail}`)
  }

  const sec4Verdict = worstVerdict(...sec4Rows.map(r => r.verdict))
  sectionVerdicts.push(sec4Verdict)
  console.log(`\n  SECTION 4 RESULT:  ${verdictMark(sec4Verdict)} ${sec4Verdict}`)

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════

  const overallVerdict = worstVerdict(...sectionVerdicts)

  console.log('\n' + '═'.repeat(62))
  console.log('  SUMMARY')
  console.log('═'.repeat(62))
  console.log()

  sectionVerdicts.forEach((v, i) => {
    console.log(`  Section ${i + 1}  ${verdictMark(v)} ${v}`)
  })

  console.log()
  row('Total checks run',   totalChecks, null)
  row('PASS',               totalPass,   null)
  row('WARNING',            totalWarn,   null)
  row('FAIL',               totalFail,   null)

  if (stubPlayers.length > 0) {
    console.log(`\n  Note: ${stubPlayers.length} historical stub(s) excluded from reconciliation checks.`)
  }

  console.log()

  if (overallVerdict === PASS) {
    console.log('  ✅  SAFE TO PROCEED')
    console.log('  seasonStats collection is internally consistent for all seasons.')
    console.log('  Top-level player totals reconcile with collection sums.')
    console.log('  All page read paths have valid data to work with.')
    console.log('  Ready for next season import.')
  } else if (overallVerdict === WARNING) {
    console.log('  ⚠   WARNINGS PRESENT — REVIEW')
    console.log('  No blocking failures. The app should function correctly.')
    console.log('  Review warnings above before the next import — some may indicate')
    console.log('  edge cases that the importer should handle consistently.')
    if (totalWarn > 0) console.log(`  ${totalWarn} warning(s) listed above.`)
  } else {
    console.log('  ✗   REPAIR NEEDED')
    console.log('  At least one blocking failure detected. See FAIL items above.')
    console.log('  Do not run the next import until failures are resolved.')
    console.log(`  ${totalFail} failure(s) listed above.`)
    if (rec2Mismatches > 0) {
      console.log()
      console.log('  Suggested repair for top-level total mismatches:')
      console.log('  Run the backfill step from the importer pipeline once built,')
      console.log('  or build a targeted backfillPlayerTotals.mjs script.')
    }
  }

  console.log('\n' + '═'.repeat(62))
  console.log('  Audit complete. No data was written.')
  console.log('═'.repeat(62) + '\n')

  // Exit code: 0 for PASS/WARNING, 1 for FAIL (useful for CI integration)
  process.exit(overallVerdict === FAIL ? 1 : 0)
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
