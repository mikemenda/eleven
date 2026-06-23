/**
 * patchS1SeasonStatsLabels.mjs
 *
 * One-time cleanup for old S1 scope:ALL seasonStats docs.
 *
 * The Phase 1 validator currently warns when scope:ALL docs are missing
 * a label field. The app can resolve these docs by seasonId, but adding
 * label:"S1" makes the data consistent with newer imports and removes the
 * recurring validator warning.
 *
 * Default: dry-run only. Use --write to apply.
 *
 * Usage:
 *   node scripts/patchS1SeasonStatsLabels.mjs
 *   node scripts/patchS1SeasonStatsLabels.mjs --write
 *   node scripts/patchS1SeasonStatsLabels.mjs --clubId=<id>
 *   node scripts/patchS1SeasonStatsLabels.mjs --clubId=<id> --write
 *
 * serviceAccountKey.json must be at the project root (never committed).
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

  let serviceAccount
  try {
    serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  } catch (error) {
    console.error(`\n✗ Could not read serviceAccountKey.json: ${error.message}`)
    console.error('  Place your Firebase service account key at the project root.\n')
    process.exit(1)
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
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

// ─── Main ─────────────────────────────────────────────────────────────────────

function line() { console.log('─'.repeat(62)) }

async function main() {
  const db = initFirebase()
  const club = await resolveClub(db, args.clubId)

  console.log('\n' + '═'.repeat(62))
  console.log('  patchS1SeasonStatsLabels')
  console.log(`  Mode : ${WRITE ? 'WRITE' : 'DRY-RUN'}`)
  console.log(`  Club : ${club.name || club.id}`)
  console.log(`  ID   : ${club.id}`)
  console.log('═'.repeat(62))

  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', club.id)
    .where('label', '==', 'S1')
    .get()

  if (seasonsSnap.empty) {
    console.error('\n✗ No S1 season found for this club. Nothing patched.\n')
    process.exit(1)
  }

  if (seasonsSnap.docs.length > 1) {
    console.error('\n✗ Multiple S1 seasons found for this club. Refusing to patch.\n')
    seasonsSnap.docs.forEach(d => console.error(`     ${d.id}`))
    process.exit(1)
  }

  const s1Season = { id: seasonsSnap.docs[0].id, ...seasonsSnap.docs[0].data() }

  const ssSnap = await db.collection('seasonStats')
    .where('seasonId', '==', s1Season.id)
    .where('scope', '==', 'ALL')
    .get()

  const allDocs = ssSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
  const missingLabelDocs = allDocs.filter(d => !d.label)
  const existingLabelDocs = allDocs.filter(d => d.label)

  console.log('\nS1 season')
  line()
  console.log(`  seasonId        : ${s1Season.id}`)
  console.log(`  label           : ${s1Season.label}`)
  console.log(`  scope:ALL docs  : ${allDocs.length}`)
  console.log(`  already labelled: ${existingLabelDocs.length}`)
  console.log(`  to patch        : ${missingLabelDocs.length}`)

  if (missingLabelDocs.length === 0) {
    console.log('\n✓ No missing S1 scope:ALL labels found. Nothing to patch.\n')
    return
  }

  console.log('\nDocs to patch')
  line()
  for (const doc of missingLabelDocs) {
    const player = doc.playerName || doc.name || doc.playerId || '(unknown player)'
    console.log(`  ${doc.id}  ${player}`)
  }

  if (!WRITE) {
    console.log('\n' + '═'.repeat(62))
    console.log('  DRY-RUN COMPLETE')
    console.log(`  ${missingLabelDocs.length} doc(s) would be updated with label:"S1".`)
    console.log('  Run with --write to apply.')
    console.log('═'.repeat(62) + '\n')
    return
  }

  const batch = db.batch()
  for (const doc of missingLabelDocs) {
    batch.update(doc.ref, { label: 'S1' })
  }

  console.log('\nCommitting patch...')
  await batch.commit()

  console.log('\n' + '═'.repeat(62))
  console.log('  ✅ PATCH COMPLETE')
  console.log(`  Added label:"S1" to ${missingLabelDocs.length} scope:ALL seasonStats doc(s).`)
  console.log('  Run validateDataHealth.mjs to confirm the warning is gone.')
  console.log('═'.repeat(62) + '\n')
}

main().catch(error => {
  console.error('\n✗ patchS1SeasonStatsLabels failed:')
  console.error(error)
  process.exit(1)
})
