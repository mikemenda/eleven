/**
 * patchS4PlayerIdentity.mjs
 *
 * Patches sofifaId only for the six S4 newly-created FC Richport players
 * whose player faces are wrong due to incorrect sofifaId values from import.
 *
 * Target players and correct sofifaIds:
 *   Victor Osimhen   → 232293
 *   Michael Olise    → 247827
 *   Rayan Cherki     → 251570
 *   Gavi             → 264240
 *   Gerard Martin    → 74462
 *   Patrick Dorgu    → 277432
 *
 * Safety rules:
 *   - Dry-run by default. Pass --write to apply changes.
 *   - Matches players by clubId AND exact name only.
 *   - If a player is not found, or if multiple docs match the same name,
 *     the script reports clearly and blocks --write entirely.
 *   - Only sofifaId is written. Stats, status, totals, seasonStats,
 *     transfers, and all other fields are never touched.
 *   - After write, re-reads each doc and confirms the stored value.
 *
 * Club scoping:
 *   - Pass --clubId=<id> to target a specific club.
 *   - If omitted, auto-detects when exactly one club exists.
 *
 * Usage:
 *   node scripts/patchS4PlayerIdentity.mjs
 *   node scripts/patchS4PlayerIdentity.mjs --clubId=<id>
 *   node scripts/patchS4PlayerIdentity.mjs --write
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

// ─── Target patch list ────────────────────────────────────────────────────────

const TARGETS = [
  { name: 'Victor Osimhen', sofifaId: 232293 },
  { name: 'Michael Olise',  sofifaId: 247827 },
  { name: 'Rayan Cherki',   sofifaId: 251570 },
  { name: 'Gavi',           sofifaId: 264240 },
  { name: 'Gerard Martin',  sofifaId: 74462  },
  { name: 'Patrick Dorgu',  sofifaId: 277432 },
]

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function header(t) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + t)
  console.log('─'.repeat(62))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db   = initFirebase()
  const club = await resolveClub(db, args.clubId)

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  patchS4PlayerIdentity — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Club  : ${club.name}`)
  console.log(`  ID    : ${club.id}`)
  console.log(`  Scope : sofifaId only — no stats, no status, no totals`)
  console.log('══════════════════════════════════════════════════════════════')

  // ── Load all players for this club ─────────────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', club.id)
    .get()

  const allPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // ── Resolve each target ────────────────────────────────────────────────────
  header('Player Resolution')
  console.log()

  const resolved = []
  let   blockers = 0

  for (const target of TARGETS) {
    const matches = allPlayers.filter(p => p.name === target.name)

    if (matches.length === 0) {
      console.log(`  ✗  ${target.name.padEnd(20)}  NOT FOUND in Firestore — blocks write`)
      resolved.push({ target, doc: null, status: 'not_found' })
      blockers++
      continue
    }

    if (matches.length > 1) {
      console.log(`  ✗  ${target.name.padEnd(20)}  AMBIGUOUS — ${matches.length} docs match — blocks write`)
      matches.forEach(m => console.log(`       ${m.id}`))
      resolved.push({ target, doc: null, status: 'ambiguous' })
      blockers++
      continue
    }

    const doc         = matches[0]
    const currentId   = doc.sofifaId ?? null
    const needsPatch  = currentId !== target.sofifaId
    const status      = needsPatch ? 'needs_patch' : 'already_correct'

    const mark = needsPatch ? '⚠' : '✓'
    console.log(`  ${mark}  ${target.name.padEnd(20)}  doc: ${doc.id}`)
    console.log(`       current sofifaId : ${currentId ?? '(null)'}`)
    console.log(`       target  sofifaId : ${target.sofifaId}`)
    console.log(`       action           : ${needsPatch ? 'WILL PATCH' : 'no change needed'}`)

    resolved.push({ target, doc, status })
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  header('Summary')
  console.log()

  const needsPatch     = resolved.filter(r => r.status === 'needs_patch')
  const alreadyCorrect = resolved.filter(r => r.status === 'already_correct')
  const notFound       = resolved.filter(r => r.status === 'not_found')
  const ambiguous      = resolved.filter(r => r.status === 'ambiguous')

  console.log(`  Players to patch      : ${needsPatch.length}`)
  console.log(`  Already correct       : ${alreadyCorrect.length}`)
  console.log(`  Not found (blockers)  : ${notFound.length}`)
  console.log(`  Ambiguous (blockers)  : ${ambiguous.length}`)

  if (blockers > 0) {
    console.log(`\n  ✗  ${blockers} blocker(s) detected. Resolve before running --write.`)
    console.log('══════════════════════════════════════════════════════════════')
    console.log('  Dry run complete. No data was written.')
    console.log('══════════════════════════════════════════════════════════════\n')
    process.exit(1)
  }

  if (needsPatch.length === 0) {
    console.log('\n  ✅  All sofifaId values are already correct. Nothing to write.')
    console.log('══════════════════════════════════════════════════════════════')
    console.log('  Dry run complete. No data was written.')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  console.log('\n  ✅  SAFE TO WRITE')
  console.log(`  ${needsPatch.length} player(s) will have sofifaId updated.`)
  console.log('  No other fields will be touched.')

  // ── Dry-run exit ───────────────────────────────────────────────────────────
  if (!WRITE) {
    console.log('══════════════════════════════════════════════════════════════')
    console.log('  Dry run complete. No data was written.')
    console.log('  Review the output above, then run with --write to apply.')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  // ── Write path ─────────────────────────────────────────────────────────────
  header('Writing Patches')
  console.log()

  for (const { target, doc, status } of resolved) {
    if (status !== 'needs_patch') {
      console.log(`  –  ${target.name.padEnd(20)}  skipped (already correct)`)
      continue
    }

    try {
      await db.collection('players').doc(doc.id).update({ sofifaId: target.sofifaId })
      console.log(`  ✓  ${target.name.padEnd(20)}  sofifaId → ${target.sofifaId}`)
    } catch (err) {
      console.error(`  ✗  ${target.name.padEnd(20)}  WRITE FAILED: ${err.message}`)
      console.error('  Aborting. Re-run dry run to check current state.\n')
      process.exit(1)
    }
  }

  // ── Post-write verification ────────────────────────────────────────────────
  header('Post-Write Verification')
  console.log()

  let allVerified = true

  for (const { target, doc, status } of resolved) {
    if (status !== 'needs_patch') continue

    const fresh = await db.collection('players').doc(doc.id).get()
    const storedId = fresh.data()?.sofifaId ?? null

    if (storedId === target.sofifaId) {
      console.log(`  ✓  ${target.name.padEnd(20)}  sofifaId confirmed: ${storedId}`)
    } else {
      console.log(`  ✗  ${target.name.padEnd(20)}  MISMATCH — stored: ${storedId}  expected: ${target.sofifaId}`)
      allVerified = false
    }
  }

  console.log('\n' + '══════════════════════════════════════════════════════════════')
  if (allVerified) {
    console.log('  ✅  All sofifaId values verified. Player faces should now resolve correctly.')
  } else {
    console.log('  ⚠   Some values did not verify. Run the dry-run again to inspect.')
  }
  console.log('══════════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
