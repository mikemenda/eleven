/**
 * patchPlayerPositions.mjs
 *
 * Updates player.position for a fixed list of named players.
 * Dry-run by default. Pass --write to execute updates.
 *
 * Only the `position` field is written. Nothing else is touched.
 *
 * Usage:
 *   node scripts/patchPlayerPositions.mjs           (dry run — prints only)
 *   node scripts/patchPlayerPositions.mjs --write   (executes Firestore updates)
 *
 * Requires serviceAccountKey.json at project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const admin = require('firebase-admin')

const WRITE    = process.argv.includes('--write')
const KEY_PATH = resolve(__dirname, '../serviceAccountKey.json')

// ─── Patch list ───────────────────────────────────────────────────────────────
// Exact player names as they appear in Firestore.
// newPosition uses comma + space format: "CM, CAM"
// expectedCurrentPosition: if set, the script will warn (but not block) if the
// current stored value doesn't match — useful for catching data drift.

const PATCHES = [
  { name: 'Jamal Musiala',        newPosition: 'CAM, LM'      },
  { name: 'João Neves',           newPosition: 'CM, CDM'      },
  { name: 'Pedri',                newPosition: 'CM, CAM'      },
  { name: 'Eduardo Camavinga',    newPosition: 'CM, LB'       },
  { name: 'Piero Hincapié',       newPosition: 'LB, CB'       },
  { name: 'Wesley',               newPosition: 'RB, RM'       },
  { name: 'Lamine Yamal',         newPosition: 'RM, CAM'      },
  { name: 'Raphinha',             newPosition: 'LM, RM, CAM'  },
  { name: 'Yan Diomande',         newPosition: 'RM, LM'       },
  { name: 'Ousmane Dembélé',      newPosition: 'ST, RM'       },
]

// ─── Init ─────────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  return admin.firestore()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalise a name for matching: lowercase, collapse whitespace, trim.
// Does NOT strip accents — Firestore names include them (e.g. "Dembélé").
function normName(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function header(title) {
  const line = '─'.repeat(64)
  console.log(`\n${line}`)
  console.log(`  ${title}`)
  console.log(line)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log(WRITE
    ? '  ⚠  --write flag detected. Firestore updates WILL be executed.'
    : '  ℹ  Dry run. No data will be written. Pass --write to execute.')

  const db = initFirebase()

  // ── Load club ──────────────────────────────────────────────────────────────
  const clubsSnap = await db.collection('clubs').get()
  const clubs = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  if (clubs.length === 0) {
    console.error('\n  Fatal: no clubs found. Check Firestore connection.')
    process.exit(1)
  }
  const club = clubs.find(c => /richport/i.test(c.name)) || clubs[0]
  console.log(`\n  Club : ${club.name} (${club.id})`)

  // ── Load all players for this club ─────────────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', club.id)
    .get()
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  Players loaded: ${players.length}`)
  console.log(`  Patches to apply: ${PATCHES.length}`)

  // Build a normalised-name → player[] map for O(1) lookup.
  // Array because duplicate names, while unlikely, must be detected and flagged.
  const byNormName = {}
  for (const p of players) {
    const key = normName(p.name)
    if (!byNormName[key]) byNormName[key] = []
    byNormName[key].push(p)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Categorise each patch entry
  // ─────────────────────────────────────────────────────────────────────────────

  const wouldUpdate    = []
  const alreadyCorrect = []
  const manualReview   = []

  for (const patch of PATCHES) {
    const key     = normName(patch.name)
    const matches = byNormName[key] || []

    // ── No match ──────────────────────────────────────────────────────────────
    if (matches.length === 0) {
      manualReview.push({
        patch,
        reason: `No player found with name "${patch.name}" (normalised: "${key}")`,
        matches: [],
      })
      continue
    }

    // ── Multiple matches ──────────────────────────────────────────────────────
    if (matches.length > 1) {
      manualReview.push({
        patch,
        reason: `${matches.length} players found with name "${patch.name}" — cannot safely target one`,
        matches,
      })
      continue
    }

    const player = matches[0]
    const currentPosition = player.position || ''
    const newPosition     = patch.newPosition

    // ── Already correct ───────────────────────────────────────────────────────
    if (currentPosition === newPosition) {
      alreadyCorrect.push({ patch, player, currentPosition })
      continue
    }

    // ── Would update ──────────────────────────────────────────────────────────
    wouldUpdate.push({ patch, player, currentPosition, newPosition })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REPORT
  // ─────────────────────────────────────────────────────────────────────────────

  header(`Would Update — ${wouldUpdate.length} player(s)`)

  if (wouldUpdate.length === 0) {
    console.log('  None.')
  } else {
    console.log()
    // Column widths
    const nameW = 26
    const posW  = 20
    console.log(
      '  ' +
      'Name'.padEnd(nameW) +
      'Current position'.padEnd(posW) +
      '→  New position'
    )
    console.log('  ' + '─'.repeat(nameW + posW + 20))
    for (const { player, currentPosition, newPosition } of wouldUpdate) {
      const current = currentPosition || '(none)'
      console.log(
        '  ' +
        player.name.padEnd(nameW) +
        current.padEnd(posW) +
        `→  ${newPosition}`
      )
      console.log(`  ${''.padEnd(nameW)}id: ${player.id}`)
      console.log()
    }
  }

  header(`Already Correct — ${alreadyCorrect.length} player(s)`)

  if (alreadyCorrect.length === 0) {
    console.log('  None.')
  } else {
    for (const { player, currentPosition } of alreadyCorrect) {
      console.log(`  ${player.name.padEnd(26)} position: "${currentPosition}" — no change needed`)
    }
  }

  header(`Manual Review Required — ${manualReview.length} entry(s)`)

  if (manualReview.length === 0) {
    console.log('  None.')
  } else {
    for (const { patch, reason, matches } of manualReview) {
      console.log()
      console.log(`  ── "${patch.name}"  →  intended: "${patch.newPosition}"`)
      console.log(`     Reason: ${reason}`)
      if (matches.length > 1) {
        console.log('     Matching player IDs:')
        for (const m of matches) {
          console.log(`       ${m.id}  "${m.name}"  pos: "${m.position}"`)
        }
      }
    }
    console.log()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────

  header('Summary')
  console.log(`  wouldUpdate          : ${wouldUpdate.length}`)
  console.log(`  skippedAlreadyCorrect: ${alreadyCorrect.length}`)
  console.log(`  manualReview         : ${manualReview.length}`)

  // ─────────────────────────────────────────────────────────────────────────────
  // WRITE
  // ─────────────────────────────────────────────────────────────────────────────

  if (!WRITE) {
    console.log('\n  Dry run complete. No data written.')
    console.log('  Review the wouldUpdate list above, then run with --write to apply.\n')
    return
  }

  if (wouldUpdate.length === 0) {
    console.log('\n  Nothing to write.\n')
    return
  }

  header(`Writing ${wouldUpdate.length} update(s)…`)

  let written = 0
  let failed  = 0

  for (const { player, newPosition, currentPosition } of wouldUpdate) {
    try {
      await db.collection('players').doc(player.id).update({
        position: newPosition,
      })
      written++
      console.log(`  ✓ ${player.name.padEnd(26)} "${currentPosition}" → "${newPosition}"`)
    } catch (err) {
      failed++
      console.error(`  ✗ ${player.name}  FAILED: ${err.message}`)
    }
  }

  console.log()
  console.log(`  Written : ${written}`)
  console.log(`  Failed  : ${failed}`)
  console.log()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
