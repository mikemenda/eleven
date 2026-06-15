/**
 * createClub.mjs
 *
 * Creates a new club doc in the Firestore clubs collection.
 * Default: dry-run (read-only). Use --write to create the doc.
 *
 * Usage:
 *   node scripts/createClub.mjs --name="FC Montverd"
 *   node scripts/createClub.mjs --name="FC Montverd" --write
 *
 * What it does:
 *   1. Lists all existing clubs in Firestore so you can confirm nothing is at risk
 *   2. Blocks if a club with the same name already exists
 *   3. On --write: creates a single doc in the clubs collection and prints the new club ID
 *
 * What it does NOT touch:
 *   seasons · players · seasonStats · matches · transfers · opponents
 *
 * After running --write, note the club ID printed in the output.
 * All subsequent commands for this club require --clubId=<id>:
 *
 *   cd /Users/MichaelMenda/Documents/Mike/1Apps/eleven/1Repo
 *
 *   node scripts/importSeason.mjs --season=S1 --file=data/uploads/montverd/S1.json --clubId=<montverd-id>
 *   node scripts/validateDataHealth.mjs --clubId=<montverd-id>
 *   node scripts/auditAndPatchTeamLogos.mjs --season=S1 --clubId=<montverd-id>
 *
 * Existing clubs (e.g. FC Richport) must also now pass --clubId on every command:
 *
 *   node scripts/importSeason.mjs --season=S8 --file=data/uploads/S8.json --clubId=<richport-id>
 *   node scripts/validateDataHealth.mjs --clubId=<richport-id>
 *
 * serviceAccountKey.json must be at the project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require    = createRequire(import.meta.url)
const admin      = require('firebase-admin')
const __dirname  = dirname(fileURLToPath(import.meta.url))
const KEY_PATH   = resolve(__dirname, '../serviceAccountKey.json')

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function header(t) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + t)
  console.log('─'.repeat(62))
}

function normName(s) { return (s || '').trim().toLowerCase() }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  // ── Validate CLI ────────────────────────────────────────────────────────────
  if (!args.name) {
    console.error('\n✗ --name is required  (e.g. --name="FC Montverd")\n')
    process.exit(1)
  }

  const clubName = args.name.trim()

  if (!clubName) {
    console.error('\n✗ --name cannot be empty\n')
    process.exit(1)
  }

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  createClub — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Name : ${clubName}`)
  console.log('══════════════════════════════════════════════════════════════')

  // ── Load existing clubs ──────────────────────────────────────────────────────
  header('Existing Clubs')
  console.log()

  const db   = initFirebase()
  const snap = await db.collection('clubs').get()

  const existingClubs = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  if (existingClubs.length === 0) {
    console.log('  (no clubs found in Firestore — this will be the first)')
  } else {
    for (const club of existingClubs) {
      console.log(`  ✓  ${club.id}  "${club.name}"`)
    }
  }

  // ── Name collision check ─────────────────────────────────────────────────────
  const duplicate = existingClubs.find(c => normName(c.name) === normName(clubName))
  if (duplicate) {
    console.error(`\n✗ A club named "${clubName}" already exists (id: ${duplicate.id}).`)
    console.error('  No action taken. Use the existing club ID with --clubId.\n')
    process.exit(1)
  }

  // ── Write plan ───────────────────────────────────────────────────────────────
  header('Write Plan')
  console.log()

  const clubDoc = {
    name:      clubName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  console.log('  Will create 1 doc in: clubs/')
  console.log(`    name      : "${clubDoc.name}"`)
  console.log(`    createdAt : <server timestamp>`)
  console.log()
  console.log('  Collections NOT touched:')
  console.log('    seasons · players · seasonStats · matches · transfers · opponents')

  // ── Dry-run exit ─────────────────────────────────────────────────────────────
  if (!WRITE) {
    console.log('\n' + '═'.repeat(62))
    console.log('  DRY RUN COMPLETE — no data was written.')
    console.log(`  Run with --write to create "${clubName}".`)
    console.log('═'.repeat(62) + '\n')
    return
  }

  // ── Write ────────────────────────────────────────────────────────────────────
  header('Creating Club')
  console.log()

  const clubRef = db.collection('clubs').doc()
  const clubId  = clubRef.id

  try {
    await clubRef.set(clubDoc)
  } catch (err) {
    console.error(`\n  ✗ Firestore write FAILED. No club was created.`)
    console.error(`  Error: ${err.message}\n`)
    process.exit(1)
  }

  // ── Verify ───────────────────────────────────────────────────────────────────
  const verify = await db.collection('clubs').doc(clubId).get()
  if (!verify.exists) {
    console.error('\n  ✗ Post-write verification FAILED — doc not found after write.\n')
    process.exit(1)
  }

  const written = verify.data()

  console.log('\n' + '═'.repeat(62))
  console.log('  ✅  CLUB CREATED')
  console.log('═'.repeat(62))
  console.log()
  console.log(`  Name      : ${written.name}`)
  console.log(`  Club ID   : ${clubId}`)
  console.log()
  console.log('  ── Copy this ID — required for all subsequent commands ──')
  console.log()
  console.log(`  Import S1 (dry-run):`)
  console.log(`    node scripts/importSeason.mjs --season=S1 --file=data/uploads/montverd/S1.json --clubId=${clubId}`)
  console.log()
  console.log(`  Health check:`)
  console.log(`    node scripts/validateDataHealth.mjs --clubId=${clubId}`)
  console.log()
  console.log('  ── Existing clubs now require --clubId too ──')
  console.log()
  existingClubs.forEach(c => {
    console.log(`  ${c.name.padEnd(20)} --clubId=${c.id}`)
  })
  console.log('═'.repeat(62) + '\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
