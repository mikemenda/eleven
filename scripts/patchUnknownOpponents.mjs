/**
 * patchUnknownOpponents.mjs
 *
 * One-time patch: sets canonical opponent fields on three match docs
 * whose opponent field was stored as "Unknown".
 *
 * Usage:
 *   node scripts/patchUnknownOpponents.mjs            # dry run (default)
 *   node scripts/patchUnknownOpponents.mjs --write    # apply to Firestore
 *   node scripts/patchUnknownOpponents.mjs --keyFile=path/to/key.json --write
 *
 * Requires serviceAccountKey.json in the repo root, or --keyFile=<path>.
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve }       from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ─── Patches ──────────────────────────────────────────────────────────────────

const PATCHES = [
  {
    docId:         'Y9HGPQXv6IdwqRlII6L1',
    opponent:      'Arsenal',
    opponentKey:   'arsenal',
    opponentRaw:   'Unknown',
    opponentStatus:'matched',
  },
  {
    docId:         'z3zpc3IGWYEcG8W8xo6C',
    opponent:      'Manchester United',
    opponentKey:   'manchester-united',
    opponentRaw:   'Unknown',
    opponentStatus:'matched',
  },
  {
    docId:         'xsL5G22FSy5l1TI5MgYf',
    opponent:      'Liverpool',
    opponentKey:   'liverpool',
    opponentRaw:   'Unknown',
    opponentStatus:'matched',
  },
]

// ─── CLI ──────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2)
const args = {}
for (const arg of rawArgs) {
  const eqIdx = arg.indexOf('=')
  if (eqIdx === -1) args[arg.replace(/^--/, '')] = true
  else { args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1) }
}

const WRITE    = args.write === true || args.write === 'true'
const KEY_PATH = args.keyFile
  ? resolve(String(args.keyFile))
  : resolve(__dirname, '..', 'serviceAccountKey.json')

// ─── Firebase init ────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()

  let serviceAccount
  try {
    serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  } catch (e) {
    console.error(`\nCould not read service account key at: ${KEY_PATH}`)
    console.error(`  Error: ${e.message}`)
    console.error('Download from Firebase Console → Project Settings → Service accounts\n')
    process.exit(1)
  }

  if (!serviceAccount.project_id) {
    console.error(`\nService account JSON is missing "project_id": ${KEY_PATH}\n`)
    process.exit(1)
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId:  serviceAccount.project_id,
  })

  return admin.firestore()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  console.log('\n══════════════════════════════════════════════')
  console.log('  patchUnknownOpponents.mjs')
  console.log(`  Mode : ${WRITE ? '✏️  WRITE' : '🔍 DRY RUN (pass --write to apply)'}`)
  console.log(`  Docs : ${PATCHES.length}`)
  console.log('══════════════════════════════════════════════\n')

  for (const patch of PATCHES) {
    const { docId, opponent, opponentKey, opponentRaw, opponentStatus } = patch
    const ref = db.collection('matches').doc(docId)

    // Read current state so dry run can show what would change
    let current = null
    try {
      const snap = await ref.get()
      if (!snap.exists) {
        console.error(`  [ERROR] Doc not found: ${docId}`)
        continue
      }
      current = snap.data() || {}
    } catch (e) {
      console.error(`  [ERROR] Could not read doc ${docId}: ${e.message}`)
      continue
    }

    const fields = { opponent, opponentKey, opponentRaw, opponentStatus }

    console.log(`  Doc: ${docId}`)
    for (const [field, newVal] of Object.entries(fields)) {
      const oldVal = current[field] !== undefined ? String(current[field]) : '(missing)'
      const marker = oldVal === String(newVal) ? '  (no change)' : `  ${oldVal} → ${newVal}`
      console.log(`    ${field.padEnd(16)} ${marker}`)
    }

    if (WRITE) {
      try {
        await ref.update(fields)
        console.log(`    ✅  Updated\n`)
      } catch (e) {
        console.error(`    ❌  Update failed: ${e.message}\n`)
      }
    } else {
      console.log(`    ↳  Dry run — no write\n`)
    }
  }

  if (!WRITE) {
    console.log('Dry run complete. Re-run with --write to apply.\n')
  } else {
    console.log('All patches applied.\n')
  }
}

main().catch(err => {
  console.error('\nFatal:', err.message)
  console.error(err.stack)
  process.exit(1)
})
