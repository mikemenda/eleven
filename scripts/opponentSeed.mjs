/**
 * opponentSeed.mjs
 *
 * Populates the Firestore `opponents` collection from data/opponents-seed.json.
 * Each entry becomes one document with ID = opponentKey.
 *
 * Usage:
 *   node scripts/opponentSeed.mjs                # dry run (default)
 *   node scripts/opponentSeed.mjs --write         # write to Firestore
 *   node scripts/opponentSeed.mjs --keyFile=path/to/key.json --write
 *
 * Idempotent: skips documents that already exist unless --overwrite is passed.
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve }       from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev/team'

// ─── CLI ──────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2)
const args = {}
for (const arg of rawArgs) {
  const eq = arg.indexOf('=')
  if (eq === -1) args[arg.replace(/^--/, '')] = true
  else { args[arg.slice(2, eq)] = arg.slice(eq + 1) }
}

const WRITE     = args.write === true || args.write === 'true'
const OVERWRITE = args.overwrite === true || args.overwrite === 'true'
const KEY_PATH  = args.keyFile
  ? resolve(String(args.keyFile))
  : resolve(__dirname, '..', 'serviceAccountKey.json')

// ─── Firebase init ────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  let sa
  try { sa = JSON.parse(readFileSync(KEY_PATH, 'utf8')) }
  catch (e) {
    console.error(`\nCould not read key at: ${KEY_PATH}\n  ${e.message}\n`)
    process.exit(1)
  }
  if (!sa.project_id) { console.error('\nMissing project_id in service account JSON\n'); process.exit(1) }
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
  return admin.firestore()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  // Load seed
  const seedPath = resolve(__dirname, '..', 'data', 'opponents-seed.json')
  let seed
  try { seed = JSON.parse(readFileSync(seedPath, 'utf8')) }
  catch (e) { console.error(`\nCould not read ${seedPath}\n  ${e.message}\n`); process.exit(1) }

  console.log('\n══════════════════════════════════════════════')
  console.log('  opponentSeed.mjs')
  console.log(`  Mode      : ${WRITE ? '✏️  WRITE' : '🔍 DRY RUN (pass --write to apply)'}`)
  if (WRITE && OVERWRITE) console.log('  Overwrite : YES (existing docs will be updated)')
  console.log(`  Entries   : ${seed.length}`)
  console.log('══════════════════════════════════════════════\n')

  let skipped = 0, written = 0, errored = 0

  for (const entry of seed) {
    const { opponentKey, sofifaTeamId, ...rest } = entry
    if (!opponentKey) { console.warn('  [skip] entry missing opponentKey'); skipped++; continue }

    const doc = {
      opponentKey,
      sofifaTeamId: sofifaTeamId ?? null,
      crestUrl: sofifaTeamId ? `${WORKER_BASE}/${sofifaTeamId}` : null,
      ...rest,
    }

    if (WRITE) {
      try {
        const ref  = db.collection('opponents').doc(opponentKey)
        const snap = await ref.get()
        if (snap.exists && !OVERWRITE) {
          console.log(`  [skip]  ${opponentKey} (already exists — pass --overwrite to update)`)
          skipped++
          continue
        }
        await ref.set(doc, { merge: false })
        console.log(`  [write] ${opponentKey}  sofifaTeamId=${sofifaTeamId ?? 'null'}`)
        written++
      } catch (e) {
        console.error(`  [error] ${opponentKey}: ${e.message}`)
        errored++
      }
    } else {
      // Dry run: print what would be written
      console.log(`  [dry]   ${opponentKey.padEnd(26)} displayName="${doc.displayName}"  sfId=${sofifaTeamId ?? 'null'}`)
    }
  }

  console.log()
  if (WRITE) {
    console.log(`Done. Written: ${written}  Skipped: ${skipped}  Errors: ${errored}`)
  } else {
    console.log(`Dry run complete. ${seed.length} entries would be written.`)
    console.log('Re-run with --write to apply.')
  }
  console.log()
}

main().catch(err => {
  console.error('\nFatal:', err.message)
  console.error(err.stack)
  process.exit(1)
})
