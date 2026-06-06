/**
 * patchMaatsenTransfer.mjs
 *
 * One-time patch: links the Maatsen transfer doc to Ian Maatsen's player doc.
 *
 * Transfer doc : fUXyFtMdIT5yBxoPffus  (player field: "Maatsen")
 * Player doc   : 5Zedc8q2ZlhyXJREHK21  (name: "Ian Maatsen")
 *
 * Safety:
 *   - Dry-run by default. Pass --write to apply.
 *   - Only touches the single named document.
 *   - Never overwrites a playerId that is already set.
 *   - Never modifies any other field.
 *
 * Usage:
 *   node scripts/patchMaatsenTransfer.mjs           # dry-run
 *   node scripts/patchMaatsenTransfer.mjs --write   # apply
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

const KEY_PATH   = resolve(__dirname, '../serviceAccountKey.json')
const DRY_RUN    = !process.argv.includes('--write')

const TRANSFER_ID = 'fUXyFtMdIT5yBxoPffus'
const PLAYER_ID   = '5Zedc8q2ZlhyXJREHK21'

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
})

const db = admin.firestore()

async function main() {
  console.log(`\n patchMaatsenTransfer — ${DRY_RUN ? 'DRY RUN (read-only)' : '⚠️  WRITE MODE'}\n`)

  const ref  = db.collection('transfers').doc(TRANSFER_ID)
  const snap = await ref.get()

  if (!snap.exists) {
    console.error(`✗ Transfer doc ${TRANSFER_ID} not found. Aborting.`)
    process.exit(1)
  }

  const data = snap.data()
  console.log(`  Found transfer: player="${data.player}"  season="${data.season || '?'}"  direction="${data.direction || '?'}"`)

  if (data.playerId) {
    console.log(`  playerId already set to "${data.playerId}". Nothing to do.`)
    process.exit(0)
  }

  if (DRY_RUN) {
    console.log(`  [would update] playerId → ${PLAYER_ID}`)
    console.log('\n Run with --write to apply.\n')
  } else {
    await ref.update({ playerId: PLAYER_ID })
    console.log(`  [updated] playerId → ${PLAYER_ID}`)
    console.log('\n Done.\n')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
