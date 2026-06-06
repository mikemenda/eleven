/**
 * backfillTransferPlayerIds.mjs
 *
 * Finds every transfer document that has a `player` name but no `playerId`,
 * looks up the matching player by (clubId + name exact match), and writes
 * `playerId` back.
 *
 * Safety rules:
 *   - Dry-run by default. Pass --write to apply changes.
 *   - Never deletes any data.
 *   - Never overwrites a field that already has a non-empty value.
 *   - Flags ambiguous matches (multiple players with same name in same club)
 *     and missing matches for manual review. Does not guess.
 *
 * Usage:
 *   node scripts/backfillTransferPlayerIds.mjs           # dry-run
 *   node scripts/backfillTransferPlayerIds.mjs --write   # apply
 *
 * Prerequisites:
 *   - serviceAccountKey.json present in project root (do not commit).
 *   - firebase-admin installed (already in package.json).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// ─── Config ──────────────────────────────────────────────────────────────────

const KEY_PATH = resolve(__dirname, '../serviceAccountKey.json')
const DRY_RUN  = !process.argv.includes('--write')

// ─── Init ────────────────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasValue(v) {
  return v !== undefined && v !== null && v !== ''
}

// Normalize a player name for matching: lowercase, trim, collapse whitespace.
// Does not strip accents — accents are meaningful and must match exactly in the
// player doc. If the transfer name has a different accent than the player doc,
// it will land in manualReview rather than silently mis-matching.
function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n backfillTransferPlayerIds — ${DRY_RUN ? 'DRY RUN (read-only)' : '⚠️  WRITE MODE'}`)
  console.log(' Pass --write to apply changes.\n')

  // Load all players into a lookup map keyed by `${clubId}::${normalizedName}`
  // Value is an array because there could theoretically be duplicates (which we flag).
  console.log('Loading players…')
  const playersSnap = await db.collection('players').get()
  const playerLookup = new Map() // key: `${clubId}::${normalizedName}` → [{ id, name }]
  for (const doc of playersSnap.docs) {
    const d = doc.data()
    if (d.clubId && d.name) {
      const key = `${d.clubId}::${normalizeName(d.name)}`
      if (!playerLookup.has(key)) playerLookup.set(key, [])
      playerLookup.get(key).push({ id: doc.id, name: d.name })
    }
  }
  console.log(`  ${playersSnap.size} players indexed.\n`)

  // Load all transfers
  console.log('Loading transfers…')
  const transfersSnap = await db.collection('transfers').get()
  console.log(`  ${transfersSnap.size} transfers loaded.\n`)

  // Counters
  let checked      = 0
  let skipped      = 0
  let wouldUpdate  = 0
  let updated      = 0
  let manualReview = 0

  const reviewList = []

  for (const doc of transfersSnap.docs) {
    checked++
    const d   = doc.data()
    const tid = doc.id

    // Already has a valid playerId — skip, never overwrite
    if (hasValue(d.playerId)) {
      skipped++
      continue
    }

    // No player name — nothing to match against
    if (!hasValue(d.player)) {
      skipped++
      continue
    }

    // Need clubId to scope the player lookup
    if (!hasValue(d.clubId)) {
      manualReview++
      reviewList.push({ id: tid, reason: 'no clubId on transfer', player: d.player })
      continue
    }

    const lookupKey = `${d.clubId}::${normalizeName(d.player)}`
    const matches   = playerLookup.get(lookupKey) || []

    if (matches.length === 0) {
      // Player name not found in this club's roster.
      // Could be a player who was transferred out and later deleted, or a name mismatch.
      manualReview++
      reviewList.push({
        id: tid,
        reason: `no player found in club ${d.clubId} matching name "${d.player}"`,
        season: d.season,
      })
      continue
    }

    if (matches.length > 1) {
      // Ambiguous — multiple player docs with the same normalized name in the same club.
      // Do not guess. Flag for manual review.
      manualReview++
      reviewList.push({
        id: tid,
        reason: `ambiguous: ${matches.length} players match name "${d.player}" in club ${d.clubId}`,
        candidates: matches.map(m => `${m.id} (${m.name})`).join(', '),
        season: d.season,
      })
      continue
    }

    // Exactly one match — safe to write
    const { id: resolvedPlayerId, name: resolvedName } = matches[0]

    if (DRY_RUN) {
      console.log(`  [would update] transfer ${tid}  player="${d.player}"  → playerId=${resolvedPlayerId} ("${resolvedName}")`)
      wouldUpdate++
    } else {
      await doc.ref.update({ playerId: resolvedPlayerId })
      console.log(`  [updated]      transfer ${tid}  player="${d.player}"  → playerId=${resolvedPlayerId} ("${resolvedName}")`)
      updated++
    }
  }

  // Summary
  console.log('\n─────────────────────────────────────────')
  console.log(` checked:       ${checked}`)
  console.log(` skipped:       ${skipped}  (already had playerId, or nothing to match)`)
  if (DRY_RUN) {
    console.log(` wouldUpdate:   ${wouldUpdate}`)
  } else {
    console.log(` updated:       ${updated}`)
  }
  console.log(` manualReview:  ${manualReview}`)
  console.log('─────────────────────────────────────────\n')

  if (reviewList.length > 0) {
    console.log('⚠️  Manual review required:')
    for (const r of reviewList) {
      console.log(`   • [${r.id}] ${r.reason}`)
      if (r.candidates) console.log(`       candidates: ${r.candidates}`)
      if (r.season)     console.log(`       season: ${r.season}`)
    }
    console.log('')
  }

  if (DRY_RUN && wouldUpdate > 0) {
    console.log(' Run with --write to apply the above changes.\n')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
