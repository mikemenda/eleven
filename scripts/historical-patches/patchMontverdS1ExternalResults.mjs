/**
 * patchMontverdS1ExternalResults.mjs
 *
 * ONE-TIME, narrow patch script. Not a general-purpose tool — it is hardcoded
 * to FC Montverd's S1 season only and will refuse to run against anything else.
 *
 * This is NOT a season re-import. It does not touch players, seasonStats,
 * matches, transfers, opponents, or any other season field. It does not
 * write to faCupFinalOpponent / faCupFinalScore / uclFinalOpponent /
 * uclFinalScore — those fields describe FC Montverd's OWN competition path
 * and are left exactly as they are.
 *
 * It patches exactly three fields on the live S1 season document, syncing
 * them from the canonical source JSON (data/uploads/montverd/S1.json):
 *   - externalLeagueResults
 *   - externalCupResults
 *   - leagueTop5   (repairs the original broken string-array format)
 *
 * Pipeline:
 *   1. Validate CLI args against hardcoded expected values (safety guard).
 *   2. Read + validate the source JSON (same registry/arithmetic checks as
 *      importSeason.mjs STAGE 1B, duplicated here since this script never
 *      runs through the importer).
 *   3. Read the live club doc, print its name for visual confirmation.
 *   4. Read the live S1 season doc. Fail on zero or multiple matches.
 *   5. Snapshot the FULL current doc (every field) before any write.
 *   6. Print a before → after diff for the three whitelisted fields.
 *   7. Dry-run by default. --write required to apply.
 *   8. On --write: update only the three whitelisted fields, then re-fetch
 *      and verify (a) those three fields match exactly, and (b) every other
 *      field on the document is byte-identical to the pre-write snapshot.
 *
 * Usage:
 *   node scripts/patchMontverdS1ExternalResults.mjs --clubId=xhAwkYVCNY8nGLqIiU5X --season=S1 --source-file=data/uploads/montverd/S1.json
 *   node scripts/patchMontverdS1ExternalResults.mjs --clubId=xhAwkYVCNY8nGLqIiU5X --season=S1 --source-file=data/uploads/montverd/S1.json --write
 *
 * serviceAccountKey.json must be at the project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin      = require('firebase-admin')
const __dirname  = dirname(fileURLToPath(import.meta.url))
const KEY_PATH   = resolve(__dirname, '../serviceAccountKey.json')

// ─── Hardcoded safety guard ───────────────────────────────────────────────────
// This script is single-purpose. Running it against any other club/season
// would apply FC Montverd's verified S1 external results to the wrong
// document. Both must match exactly or the script refuses to proceed.
const EXPECTED_CLUB_ID = 'xhAwkYVCNY8nGLqIiU5X'
const EXPECTED_SEASON  = 'S1'

// Mirror of HISTORY_COMPETITIONS in src/utils/historyUtils.js and of the
// VALID_LEAGUE_NAMES / VALID_CUP_NAMES constants in scripts/importSeason.mjs
// STAGE 1B. Keep all three in sync if a new competition is ever added.
const VALID_LEAGUE_NAMES = new Set([
  'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'English Championship',
])
const VALID_CUP_NAMES = new Set([
  'UEFA Champions League', 'UEFA Europa League', 'UEFA Conference League',
  'FA Cup', 'Carabao Cup', 'Copa del Rey', 'Coppa Italia', 'DFB-Pokal', 'Coupe de France',
])
const PATCHED_FIELDS = ['externalLeagueResults', 'externalCupResults', 'leagueTop5']

// ─── CLI ─────────────────────────────────────────────────────────────────────

const WRITE = process.argv.includes('--write')

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

function fail(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1) }

if (!args.clubId)     fail('--clubId is required  (e.g. --clubId=xhAwkYVCNY8nGLqIiU5X)')
if (!args.season)     fail('--season is required  (e.g. --season=S1)')
if (!args['source-file']) fail('--source-file is required  (e.g. --source-file=data/uploads/montverd/S1.json)')

if (args.clubId !== EXPECTED_CLUB_ID) {
  fail(`This script is hardcoded to clubId "${EXPECTED_CLUB_ID}" (FC Montverd) only.\n  Got: "${args.clubId}"\n  Refusing to run against a different club.`)
}
if (args.season !== EXPECTED_SEASON) {
  fail(`This script is hardcoded to season "${EXPECTED_SEASON}" only.\n  Got: "${args.season}"\n  Refusing to run against a different season.`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function header(t) { console.log('\n' + '─'.repeat(64)); console.log('  ' + t); console.log('─'.repeat(64)) }
function row(l, v)  { console.log(`  ${String(l).padEnd(34)} ${v}`) }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

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

// ─── Source JSON validation (mirrors importSeason.mjs STAGE 1B) ─────────────

function validateExternalLeagueResults(arr, ownLeague, errors) {
  const seen = new Set()
  for (const ext of arr) {
    const name = ext?.competition
    if (!name) { errors.push('externalLeagueResults entry missing "competition"'); continue }
    if (name === 'Premier League' || name === ownLeague) {
      errors.push(`externalLeagueResults "${name}" duplicates the club's own leagueCompetition — must not be in this array`)
      continue
    }
    if (!VALID_LEAGUE_NAMES.has(name)) {
      errors.push(`externalLeagueResults competition "${name}" not in the known league registry`)
      continue
    }
    if (seen.has(name)) { errors.push(`externalLeagueResults has duplicate competition "${name}"`); continue }
    seen.add(name)

    const rec = ext.record ?? {}
    const sumPD = (rec.w ?? 0) + (rec.d ?? 0) + (rec.l ?? 0)
    if (rec.p != null && sumPD !== rec.p) errors.push(`externalLeagueResults "${name}" W+D+L ${sumPD} ≠ P ${rec.p}`)
    const ptsCalc = (rec.w ?? 0) * 3 + (rec.d ?? 0)
    if (rec.pts != null && ptsCalc !== rec.pts) errors.push(`externalLeagueResults "${name}" W×3+D ${ptsCalc} ≠ Pts ${rec.pts}`)
    if (!ext.champion) errors.push(`externalLeagueResults "${name}" has no champion set`)
  }
}

function validateExternalCupResults(arr, errors) {
  const seen = new Set()
  for (const ext of arr) {
    const name = ext?.competition
    if (!name) { errors.push('externalCupResults entry missing "competition"'); continue }
    if (!VALID_CUP_NAMES.has(name)) { errors.push(`externalCupResults competition "${name}" not in the known cup registry`); continue }
    if (seen.has(name)) { errors.push(`externalCupResults has duplicate competition "${name}"`); continue }
    seen.add(name)
    if (!ext.winner) errors.push(`externalCupResults "${name}" has no winner set`)
  }
}

function validateLeagueTop5(arr, errors) {
  if (!Array.isArray(arr) || arr.length === 0) { errors.push('leagueTop5 is empty or missing'); return }
  for (const r of arr) {
    if (r.position == null || !r.club) { errors.push(`leagueTop5 row missing position/club: ${JSON.stringify(r)}`); continue }
    if (r.w != null && r.d != null && r.l != null && r.p != null) {
      const sum = r.w + r.d + r.l
      if (sum !== r.p) errors.push(`leagueTop5 "${r.club}" W+D+L ${sum} ≠ P ${r.p}`)
    }
    if (r.w != null && r.d != null && r.pts != null) {
      const ptsCalc = r.w * 3 + r.d
      if (ptsCalc !== r.pts) errors.push(`leagueTop5 "${r.club}" W×3+D ${ptsCalc} ≠ Pts ${r.pts}`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  patchMontverdS1ExternalResults — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Club ID     : ${args.clubId}`)
  console.log(`  Season      : ${args.season}`)
  console.log(`  Source file : ${args['source-file']}`)
  console.log('══════════════════════════════════════════════════════════════')

  // ── Load + validate source JSON ─────────────────────────────────────────────
  let input
  try {
    input = JSON.parse(readFileSync(resolve(process.cwd(), args['source-file']), 'utf8'))
  } catch (e) {
    fail(`Could not read/parse source file: ${e.message}`)
  }

  const si = input.season
  if (!si) fail('Source file has no "season" block.')
  if (si.label !== args.season) {
    fail(`Source file season.label "${si.label}" does not match --season=${args.season}`)
  }

  const newExternalLeagueResults = si.externalLeagueResults ?? []
  const newExternalCupResults    = si.externalCupResults    ?? []
  const newLeagueTop5            = si.leagueTop5            ?? []

  header('STAGE 1 — Validating Source JSON')
  console.log()
  const srcErrors = []
  validateExternalLeagueResults(newExternalLeagueResults, si.leagueCompetition, srcErrors)
  validateExternalCupResults(newExternalCupResults, srcErrors)
  validateLeagueTop5(newLeagueTop5, srcErrors)

  if (srcErrors.length > 0) {
    srcErrors.forEach(e => console.log(`  ✗  ${e}`))
    fail(`${srcErrors.length} validation issue(s) in the source JSON. Fix data/uploads/montverd/S1.json and re-run.`)
  }
  console.log(`  ✓  externalLeagueResults : ${newExternalLeagueResults.length} entries, all valid`)
  console.log(`  ✓  externalCupResults    : ${newExternalCupResults.length} entries, all valid`)
  console.log(`  ✓  leagueTop5            : ${newLeagueTop5.length} rows, all valid`)

  // ── Firebase ─────────────────────────────────────────────────────────────────
  const db = initFirebase()

  // ── Verify live club doc ────────────────────────────────────────────────────
  header('STAGE 2 — Verifying Live Club Document')
  console.log()
  const clubSnap = await db.collection('clubs').doc(args.clubId).get()
  if (!clubSnap.exists) fail(`No club found with id "${args.clubId}"`)
  const club = { id: clubSnap.id, ...clubSnap.data() }
  row('Club name (from Firestore)', club.name ?? '(no name field)')
  row('Club ID',                    club.id)
  if (!/montverd/i.test(club.name ?? '')) {
    console.log('\n  ⚠  WARNING: club.name does not contain "Montverd". Double-check this is the')
    console.log('     intended club before proceeding — clubId matched but the name looks off.')
  } else {
    console.log('\n  ✓  Club name confirms FC Montverd')
  }

  // ── Find the live S1 season doc ─────────────────────────────────────────────
  header('STAGE 3 — Locating Live S1 Season Document')
  console.log()
  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', args.clubId)
    .where('label', '==', args.season)
    .get()

  if (seasonsSnap.empty) fail(`No "${args.season}" season document found for club "${args.clubId}".`)
  if (seasonsSnap.docs.length > 1) {
    console.error(`\n✗ Found ${seasonsSnap.docs.length} season documents with label "${args.season}" for this club:`)
    seasonsSnap.docs.forEach(d => console.error(`     ${d.id}`))
    console.error('  Refusing to guess which one. Resolve the duplicate first.\n')
    process.exit(1)
  }

  const seasonDocRef = seasonsSnap.docs[0].ref
  const liveBefore    = seasonsSnap.docs[0].data()
  const seasonId       = seasonsSnap.docs[0].id
  row('Season document ID', seasonId)
  row('label',               liveBefore.label)
  row('year',                liveBefore.year)
  row('leagueCompetition',   liveBefore.leagueCompetition)
  console.log('\n  ✓  Exactly one matching season document found')

  // ── Context: club's own competition path (untouched, printed for confirmation) ──
  header('Context — FC Montverd\'s Own Competition Path (will NOT be touched)')
  console.log()
  row('leaguePosition',            liveBefore.leaguePosition)
  row('leagueW / D / L',           `${liveBefore.leagueW} / ${liveBefore.leagueD} / ${liveBefore.leagueL}`)
  row('leaguePts',                 liveBefore.leaguePts)
  row('uclResult',                 liveBefore.uclResult)
  row('uclTournamentWinner',       liveBefore.uclTournamentWinner)
  row('uclFinalOpponent',          liveBefore.uclFinalOpponent ?? '(null — staying null)')
  row('uclFinalScore',             liveBefore.uclFinalScore ?? '(null — staying null)')
  row('faCupResult',               liveBefore.faCupResult)
  row('faCupWinner',               liveBefore.faCupWinner)
  row('faCupFinalOpponent',        liveBefore.faCupFinalOpponent ?? '(null — staying null)')
  row('carabaoCupResult',          liveBefore.carabaoCupResult)
  row('carabaoCupFinalOpponent',   liveBefore.carabaoCupFinalOpponent)
  row('carabaoCupWinner',          liveBefore.carabaoCupWinner ?? '(null — staying null)')

  // ── Diff the three whitelisted fields ───────────────────────────────────────
  header('STAGE 4 — Proposed Changes (3 fields only)')
  console.log()

  function printArrayDiff(label, before, after) {
    console.log(`  ${label}`)
    console.log(`    Current  : ${Array.isArray(before) ? `${before.length} entr${before.length === 1 ? 'y' : 'ies'}` : '(absent)'}`)
    if (before && before.length) console.log(`      ${JSON.stringify(before).slice(0, 120)}${JSON.stringify(before).length > 120 ? '…' : ''}`)
    console.log(`    Proposed : ${after.length} entr${after.length === 1 ? 'y' : 'ies'}`)
    after.forEach(e => console.log(`      ${JSON.stringify(e)}`))
    console.log()
  }

  printArrayDiff('externalLeagueResults', liveBefore.externalLeagueResults, newExternalLeagueResults)
  printArrayDiff('externalCupResults',    liveBefore.externalCupResults,    newExternalCupResults)
  printArrayDiff('leagueTop5',            liveBefore.leagueTop5,           newLeagueTop5)

  const noopFields = PATCHED_FIELDS.filter(f => deepEqual(liveBefore[f], { externalLeagueResults: newExternalLeagueResults, externalCupResults: newExternalCupResults, leagueTop5: newLeagueTop5 }[f]))
  if (noopFields.length === PATCHED_FIELDS.length) {
    console.log('  ─  All three fields already match the source JSON exactly. Nothing to write.')
  } else if (noopFields.length > 0) {
    console.log(`  ─  Already matching (no-op): ${noopFields.join(', ')}`)
  }

  // ── Snapshot full doc for post-write "nothing else changed" verification ────
  const fullSnapshotBefore = { ...liveBefore }

  console.log('\n' + '═'.repeat(64))
  if (noopFields.length === PATCHED_FIELDS.length) {
    console.log('  ✅  NOTHING TO WRITE — source JSON already matches Firestore exactly.')
    console.log('═'.repeat(64) + '\n')
    return
  }
  console.log('  ✅  SAFE TO WRITE  — run with --write to apply.')
  console.log('═'.repeat(64))

  if (!WRITE) {
    console.log('\n  Dry run complete. No data was written.\n')
    return
  }

  // ════════════════════════════════════════════════════════════════
  // WRITE PATH
  // ════════════════════════════════════════════════════════════════
  header('Writing')
  console.log()

  const patch = {
    externalLeagueResults: newExternalLeagueResults,
    externalCupResults:    newExternalCupResults,
    leagueTop5:            newLeagueTop5,
  }

  try {
    await seasonDocRef.update(patch)
  } catch (err) {
    console.error(`\n  ✗ Write FAILED. Firestore should be unchanged. Error: ${err.message}\n`)
    process.exit(1)
  }
  console.log('  ✓ Update committed.')

  // ── Post-write verification ─────────────────────────────────────────────────
  header('Post-Write Verification')
  console.log()

  const afterSnap = await seasonDocRef.get()
  const after      = afterSnap.data()

  let pass = true

  for (const field of PATCHED_FIELDS) {
    const ok = deepEqual(after[field], patch[field])
    console.log(`  ${ok ? '✓' : '✗'}  ${field.padEnd(24)} ${ok ? 'matches expected value' : 'MISMATCH'}`)
    if (!ok) pass = false
  }

  // Every other field must be byte-identical to the pre-write snapshot.
  const beforeKeys = new Set(Object.keys(fullSnapshotBefore))
  const afterKeys  = new Set(Object.keys(after))
  const otherKeysBefore = [...beforeKeys].filter(k => !PATCHED_FIELDS.includes(k))
  const unexpectedNewKeys = [...afterKeys].filter(k => !beforeKeys.has(k) && !PATCHED_FIELDS.includes(k))
  const missingKeys       = otherKeysBefore.filter(k => !afterKeys.has(k))

  let driftCount = 0
  for (const key of otherKeysBefore) {
    if (!deepEqual(fullSnapshotBefore[key], after[key])) {
      console.log(`  ✗  UNEXPECTED CHANGE on field "${key}" — was not in the patch whitelist`)
      driftCount++
      pass = false
    }
  }
  if (unexpectedNewKeys.length > 0) {
    console.log(`  ✗  Unexpected new field(s) appeared: ${unexpectedNewKeys.join(', ')}`)
    pass = false
  }
  if (missingKeys.length > 0) {
    console.log(`  ✗  Field(s) disappeared: ${missingKeys.join(', ')}`)
    pass = false
  }
  if (driftCount === 0 && unexpectedNewKeys.length === 0 && missingKeys.length === 0) {
    console.log(`  ✓  All ${otherKeysBefore.length} other field(s) on the document are byte-identical to before the write`)
  }

  console.log('\n' + '═'.repeat(64))
  if (pass) {
    console.log('  ✅  Patch complete and verified. Only externalLeagueResults,')
    console.log('      externalCupResults, and leagueTop5 changed on this document.')
  } else {
    console.log('  ✗   VERIFICATION FAILED — see issues above. Investigate immediately.')
    process.exit(1)
  }
  console.log('═'.repeat(64) + '\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
