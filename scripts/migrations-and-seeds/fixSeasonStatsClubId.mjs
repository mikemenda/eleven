/**
 * fixSeasonStatsClubId.mjs
 *
 * Repairs corrupted clubId values on seasonStats collection docs.
 *
 * Background:
 *   S2/S3 UCL seasonStats docs were written during a seeding era where the
 *   clubId value was corrupted (letter O vs digit 0 mismatch). The repair
 *   script that later fixed other collections did not include seasonStats,
 *   so those docs still carry wrong clubId values.
 *
 *   This script identifies all such docs by joining on seasonId (which is
 *   correct in those docs) and updates them to carry the real club ID.
 *
 * Club scoping:
 *   - Pass --clubId=<id> to target a specific club.
 *   - If omitted, auto-detects only when exactly one club exists.
 *   - If multiple clubs exist, stops and asks for --clubId.
 *   - Never hardcodes any club ID.
 *
 * Usage:
 *   node scripts/fixSeasonStatsClubId.mjs                    # dry-run (default)
 *   node scripts/fixSeasonStatsClubId.mjs --clubId=<id>      # specify club
 *   node scripts/fixSeasonStatsClubId.mjs '--write'          # apply writes
 *
 * Dry-run by default. Pass '--write' (in single quotes) to execute updates.
 * Safe to rerun — only docs with wrong clubId are touched. Idempotent.
 *
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

const WRITE = process.argv.includes('--write')

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function header(t) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + t)
  console.log('─'.repeat(62))
}

function row(l, v) { console.log(`  ${l.padEnd(44)} ${v}`) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  console.log('\n══════════════════════════════════════════════════════════')
  console.log(`  fixSeasonStatsClubId — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log('══════════════════════════════════════════════════════════')

  const club          = await resolveClub(db, args.clubId)
  const correctClubId = club.id

  console.log(`\n  Club         : ${club.name}`)
  console.log(`  Correct ID   : ${correctClubId}`)
  console.log(`  Mode         : ${WRITE ? 'WRITE — Firestore docs will be updated' : 'DRY RUN — no writes'}`)

  // ── 1. Load all seasons for this club ────────────────────────────────────
  //
  // seasons.clubId is NOT corrupted, so this query is reliable.
  // We use the resulting seasonId set to identify which seasonStats docs
  // belong to this club — bypassing the corrupted clubId on those docs.

  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', correctClubId)
    .get()

  // seasonId → label  (for human-readable output)
  const seasonLabels = new Map()
  for (const d of seasonsSnap.docs) {
    seasonLabels.set(d.id, d.data().label ?? d.id)
  }

  const seasonIdSet = new Set(seasonLabels.keys())

  if (seasonIdSet.size === 0) {
    console.log('\n  No seasons found for this club. Nothing to repair.\n')
    return
  }

  console.log(`\n  Seasons found for this club: ${seasonIdSet.size}`)
  for (const [id, label] of [...seasonLabels.entries()].sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { numeric: true })
  )) {
    console.log(`    ${label.padEnd(4)}  (${id})`)
  }

  // ── 2. Load ALL seasonStats docs ─────────────────────────────────────────
  //
  // Do NOT filter by clubId here — that is exactly what is broken.
  // We load everything and join to our seasons by seasonId.

  const ssSnap  = await db.collection('seasonStats').get()
  const allDocs = ssSnap.docs.map(d => ({ _docId: d.id, ...d.data() }))

  // ── 3. Classify docs ─────────────────────────────────────────────────────

  const toRepair  = []   // belong to this club, wrong clubId
  const alreadyOk = []   // belong to this club, correct clubId
  const unrelated = []   // seasonId not in our season set — different club

  for (const doc of allDocs) {
    if (!seasonIdSet.has(doc.seasonId)) {
      unrelated.push(doc)
      continue
    }
    if (doc.clubId === correctClubId) {
      alreadyOk.push(doc)
    } else {
      toRepair.push(doc)
    }
  }

  header('Scan Results')
  console.log()
  row('Total seasonStats docs in DB',              String(allDocs.length))
  row('Belong to this club (by seasonId)',         String(toRepair.length + alreadyOk.length))
  row('  — correct clubId  (no action needed)',    String(alreadyOk.length))
  row('  — WRONG clubId    (will be repaired)',    toRepair.length > 0 ? `${toRepair.length}  ✗` : '0  ✓')
  row('Unrelated (other club / other game)',        String(unrelated.length))

  if (toRepair.length === 0) {
    console.log('\n  ✓ No docs need repair. All seasonStats docs for this club')
    console.log('    have the correct clubId.')
    console.log('\n══════════════════════════════════════════════════════════')
    console.log('  Done. No data was written.')
    console.log('══════════════════════════════════════════════════════════\n')
    return
  }

  // ── 4. List docs to repair ───────────────────────────────────────────────

  header(`Docs to Repair  (${toRepair.length})`)
  console.log()

  // Sort: season ascending, then scope, then player name
  toRepair.sort((a, b) => {
    const la = seasonLabels.get(a.seasonId) ?? ''
    const lb = seasonLabels.get(b.seasonId) ?? ''
    if (la !== lb) return la.localeCompare(lb, undefined, { numeric: true })
    if (a.scope !== b.scope) return (a.scope ?? '').localeCompare(b.scope ?? '')
    return (a.playerName ?? '').localeCompare(b.playerName ?? '')
  })

  for (const doc of toRepair) {
    const label   = seasonLabels.get(doc.seasonId) ?? '?'
    const nm      = (doc.playerName ?? doc.playerId ?? '(unknown)').padEnd(28)
    const scope   = (doc.scope ?? '(no scope)').padEnd(4)
    const current = doc.clubId ?? '(null)'
    console.log(`  ${nm}  ${label.padEnd(4)}  scope:${scope}`)
    console.log(`    stored  : "${current}"`)
    console.log(`    correct : "${correctClubId}"`)
    console.log(`    docId   : ${doc._docId}`)
    console.log()
  }

  // ── 5. Dry-run exit ───────────────────────────────────────────────────────

  if (!WRITE) {
    console.log('─'.repeat(62))
    console.log(`  DRY RUN complete.`)
    console.log(`  ${toRepair.length} doc(s) would be updated.`)
    console.log("  Run with '--write' to apply the repairs.")
    console.log('══════════════════════════════════════════════════════════\n')
    return
  }

  // ── 6. Apply repairs ──────────────────────────────────────────────────────

  header('Applying Repairs')
  console.log()

  let successCount = 0
  let errorCount   = 0

  for (const doc of toRepair) {
    const label = seasonLabels.get(doc.seasonId) ?? '?'
    const nm    = (doc.playerName ?? doc.playerId ?? '(unknown)').padEnd(28)
    try {
      await db.collection('seasonStats').doc(doc._docId).update({
        clubId: correctClubId,
      })
      console.log(`  ✓  ${nm}  ${label}  updated`)
      successCount++
    } catch (err) {
      console.error(`  ✗  ${nm}  ${label}  ERROR: ${err.message}`)
      errorCount++
    }
  }

  header('Write Summary')
  console.log()
  row('Updated successfully', String(successCount))
  row('Errors',               errorCount > 0 ? `${errorCount}  ✗` : '0')

  if (errorCount === 0) {
    console.log('\n  ✓ All docs repaired.')
    console.log('  Run auditSeasonStats.mjs to verify the fix.')
  } else {
    console.log('\n  ⚠ Some updates failed. Re-run the script — it is idempotent.')
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log(`  Done. ${successCount} doc(s) updated.`)
  console.log('══════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
