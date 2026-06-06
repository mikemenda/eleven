/**
 * backfillTransferSeasonIds.mjs
 *
 * Finds every transfer document that has a `season` label but no `seasonId`,
 * looks up the matching season by (clubId + label), and writes `seasonId` back.
 *
 * Safety rules:
 *   - Dry-run by default. Pass --write to apply changes.
 *   - Never deletes any data.
 *   - Never overwrites a field that already has a non-empty value.
 *   - Flags anything it cannot confidently resolve for manual review.
 *
 * Usage:
 *   node scripts/backfillTransferSeasonIds.mjs           # dry-run
 *   node scripts/backfillTransferSeasonIds.mjs --write   # apply
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

const KEY_PATH  = resolve(__dirname, '../serviceAccountKey.json')
const DRY_RUN   = !process.argv.includes('--write')

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n backfillTransferSeasonIds — ${DRY_RUN ? 'DRY RUN (read-only)' : '⚠️  WRITE MODE'}`)
  console.log(' Pass --write to apply changes.\n')

  // Load all seasons into a lookup map keyed by clubId+label (both lowercased for safety)
  console.log('Loading seasons…')
  const seasonsSnap = await db.collection('seasons').get()
  const seasonLookup = new Map() // key: `${clubId}::${label.toLowerCase()}` → seasonId
  for (const doc of seasonsSnap.docs) {
    const d = doc.data()
    if (d.clubId && d.label) {
      seasonLookup.set(`${d.clubId}::${String(d.label).toLowerCase()}`, doc.id)
    }
  }
  console.log(`  ${seasonsSnap.size} seasons indexed.\n`)

  // Load all transfers
  console.log('Loading transfers…')
  const transfersSnap = await db.collection('transfers').get()
  console.log(`  ${transfersSnap.size} transfers loaded.\n`)

  // Counters
  let checked      = 0
  let skipped      = 0   // already has seasonId, or nothing to do
  let wouldUpdate  = 0   // dry-run: would write
  let updated      = 0   // write mode: wrote
  let manualReview = 0   // couldn't resolve — needs human

  const reviewList = []

  for (const doc of transfersSnap.docs) {
    checked++
    const d   = doc.data()
    const tid = doc.id

    // Already has a valid seasonId — skip, never overwrite
    if (hasValue(d.seasonId)) {
      skipped++
      continue
    }

    // No season label either — nothing to match against
    if (!hasValue(d.season)) {
      skipped++
      continue
    }

    // Need clubId to look up the season
    if (!hasValue(d.clubId)) {
      manualReview++
      reviewList.push({ id: tid, reason: 'no clubId on transfer', season: d.season, player: d.player })
      continue
    }

    const lookupKey = `${d.clubId}::${String(d.season).toLowerCase()}`
    const resolvedSeasonId = seasonLookup.get(lookupKey)

    if (!resolvedSeasonId) {
      manualReview++
      reviewList.push({
        id: tid,
        reason: `no season found for clubId=${d.clubId} label="${d.season}"`,
        player: d.player,
      })
      continue
    }

    // Safe to write
    if (DRY_RUN) {
      console.log(`  [would update] transfer ${tid}  player="${d.player}"  season="${d.season}"  → seasonId=${resolvedSeasonId}`)
      wouldUpdate++
    } else {
      await doc.ref.update({ seasonId: resolvedSeasonId })
      console.log(`  [updated]      transfer ${tid}  player="${d.player}"  season="${d.season}"  → seasonId=${resolvedSeasonId}`)
      updated++
    }
  }

  // Summary
  console.log('\n─────────────────────────────────────────')
  console.log(` checked:       ${checked}`)
  console.log(` skipped:       ${skipped}  (already had seasonId, or nothing to match)`)
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
      console.log(`   • [${r.id}] ${r.reason}${r.player ? `  player="${r.player}"` : ''}`)
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
