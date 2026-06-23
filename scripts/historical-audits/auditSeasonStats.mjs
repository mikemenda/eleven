/**
 * auditSeasonStats.mjs
 *
 * Read-only audit of the seasonStats collection.
 * Reports scope:'ALL' and scope:'UCL' coverage per season for a given club.
 *
 * Club scoping:
 *   - Pass --clubId=<id> to target a specific club.
 *   - If omitted, the script auto-detects the club only when exactly one
 *     club exists in the database. If multiple clubs exist, it stops and
 *     asks you to pass --clubId explicitly.
 *
 * Usage:
 *   node scripts/auditSeasonStats.mjs
 *   node scripts/auditSeasonStats.mjs --clubId=<id>
 *   node scripts/auditSeasonStats.mjs --verbose
 *
 * No --write mode. This script is read-only.
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
// Never hardcodes a club ID.
// Requires --clubId when multiple clubs exist.

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
    console.error('\n✗ Multiple clubs found. Pass --clubId=<id> to specify which club to audit.\n')
    snap.docs.forEach(d => console.error(`     ${d.id}  "${d.data().name}"`))
    console.error()
    process.exit(1)
  }
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rule()   { console.log('─'.repeat(62)) }
function header(t){ console.log('\n' + '─'.repeat(62)); console.log('  ' + t); console.log('─'.repeat(62)) }
function row(l, v){ console.log(`  ${l.padEnd(44)} ${v}`) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  auditSeasonStats — read-only')
  console.log('══════════════════════════════════════════════════════════')

  const club = await resolveClub(db, args.clubId)
  console.log(`\n  Club : ${club.name}`)
  console.log(`  ID   : ${club.id}\n`)

  // ── 1. Load all seasons for this club ────────────────────────────────────

  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', club.id)
    .get()

  // seasonId → { label, year }
  const seasonMeta = new Map()
  for (const d of seasonsSnap.docs) {
    seasonMeta.set(d.id, {
      label: d.data().label ?? d.id,
      year:  d.data().year  ?? '',
    })
  }

  const seasonIdSet = new Set(seasonMeta.keys())

  if (seasonMeta.size === 0) {
    console.log('  No seasons found for this club. Nothing to audit.\n')
    return
  }

  console.log(`  Seasons for this club: ${seasonMeta.size}`)
  for (const [id, { label, year }] of [...seasonMeta.entries()].sort((a, b) =>
    a[1].label.localeCompare(b[1].label, undefined, { numeric: true })
  )) {
    console.log(`    ${label.padEnd(4)}  ${year.padEnd(8)}  (${id})`)
  }

  // ── 2. Load all seasonStats docs ─────────────────────────────────────────
  //
  // We do NOT filter by clubId here. The S2/S3 UCL docs carry corrupted
  // clubId values, so any clubId filter would silently exclude them.
  // Instead we scope by checking seasonId ∈ our known season ID set.

  const ssSnap = await db.collection('seasonStats').get()
  const total  = ssSnap.size

  const clubDocs = ssSnap.docs
    .map(d => ({ _docId: d.id, ...d.data() }))
    .filter(d => seasonIdSet.has(d.seasonId))

  console.log(`\n  Total seasonStats docs in DB          : ${total}`)
  console.log(`  Docs belonging to this club (by season): ${clubDocs.length}`)

  // ── 3. Group by season label and scope ───────────────────────────────────

  // structure: label → { ALL: doc[], UCL: doc[], UNKNOWN: doc[] }
  const bySeason = {}
  for (const [, { label }] of seasonMeta) {
    bySeason[label] = { ALL: [], UCL: [], UNKNOWN: [] }
  }

  for (const doc of clubDocs) {
    const label = seasonMeta.get(doc.seasonId)?.label
    if (!label) continue
    const bucket = doc.scope === 'ALL' ? 'ALL'
                 : doc.scope === 'UCL' ? 'UCL'
                 : 'UNKNOWN'
    bySeason[label][bucket].push(doc)
  }

  // ── 4. Per-season coverage report ────────────────────────────────────────

  header('Coverage by Season')

  const sortedLabels = Object.keys(bySeason).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )

  let missAll = 0
  let missUcl = 0

  for (const label of sortedLabels) {
    const { ALL, UCL, UNKNOWN } = bySeason[label]
    const allOk = ALL.length > 0
    const uclOk = UCL.length > 0
    if (!allOk) missAll++
    if (!uclOk) missUcl++

    console.log(`\n  ${label}`)
    console.log(`    scope:ALL  ${allOk ? '✓' : '✗'}  ${ALL.length} doc(s)`)
    console.log(`    scope:UCL  ${uclOk ? '✓' : '✗'}  ${UCL.length} doc(s)`)
    if (UNKNOWN.length > 0) {
      console.log(`    scope:???  ⚠  ${UNKNOWN.length} doc(s) with unrecognised scope`)
    }

    if (VERBOSE) {
      if (ALL.length > 0) {
        console.log('    ALL docs:')
        for (const d of ALL) {
          const nm = (d.playerName ?? d.playerId ?? '?').padEnd(28)
          console.log(`      ${nm}  apps:${String(d.apps ?? '?').padStart(3)}  g:${String(d.goals ?? '?').padStart(3)}  a:${String(d.assists ?? '?').padStart(3)}  clubId:${d.clubId ?? '(missing)'}`)
        }
      }
      if (UCL.length > 0) {
        console.log('    UCL docs:')
        for (const d of UCL) {
          const nm = (d.playerName ?? d.playerId ?? '?').padEnd(28)
          const cs = d.isGK ? `  cs:${String(d.cleanSheets ?? '?').padStart(2)}` : ''
          console.log(`      ${nm}  apps:${String(d.apps ?? '?').padStart(3)}  g:${String(d.goals ?? '?').padStart(3)}  a:${String(d.assists ?? '?').padStart(3)}${cs}  clubId:${d.clubId ?? '(missing)'}`)
        }
      }
    }
  }

  // ── 5. clubId health check ───────────────────────────────────────────────

  header('clubId Health Check')

  const allColl = clubDocs.filter(d => d.scope === 'ALL')
  const uclColl = clubDocs.filter(d => d.scope === 'UCL')

  const corruptAll = allColl.filter(d => d.clubId !== club.id)
  const corruptUcl = uclColl.filter(d => d.clubId !== club.id)

  row('scope:ALL docs — correct clubId', String(allColl.length - corruptAll.length))
  row('scope:ALL docs — WRONG clubId',   corruptAll.length > 0 ? `${corruptAll.length}  ✗` : '0  ✓')
  row('scope:UCL docs — correct clubId', String(uclColl.length - corruptUcl.length))
  row('scope:UCL docs — WRONG clubId',   corruptUcl.length > 0 ? `${corruptUcl.length}  ✗` : '0  ✓')

  const corrupt = [...corruptAll, ...corruptUcl]
  if (corrupt.length > 0) {
    console.log('\n  Corrupted docs:')
    for (const d of corrupt) {
      const label = seasonMeta.get(d.seasonId)?.label ?? '?'
      const nm    = (d.playerName ?? d.playerId ?? '?').padEnd(28)
      console.log(`    ${nm}  ${label.padEnd(4)}  scope:${(d.scope ?? '?').padEnd(4)}  stored:"${d.clubId ?? '(null)'}"  correct:"${club.id}"`)
      console.log(`      docId: ${d._docId}`)
    }
    console.log('\n  → Run fixSeasonStatsClubId.mjs to repair these docs.')
  }

  // ── 6. Summary ───────────────────────────────────────────────────────────

  header('Summary')
  console.log()

  const issues = []
  if (missAll  > 0)        issues.push(`scope:ALL docs missing for ${missAll} season(s)   → run seedAllCompsStats.mjs`)
  if (missUcl  > 0)        issues.push(`scope:UCL docs missing for ${missUcl} season(s)   → run auditS1UclStats.mjs`)
  if (corrupt.length > 0)  issues.push(`${corrupt.length} doc(s) have wrong clubId         → run fixSeasonStatsClubId.mjs`)

  if (issues.length === 0) {
    console.log('  ✓ All checks passed. seasonStats collection looks complete.')
  } else {
    console.log(`  ${issues.length} issue(s) found:\n`)
    issues.forEach((msg, i) => console.log(`  ${i + 1}. ${msg}`))
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  Audit complete. No data was written.')
  console.log('══════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
