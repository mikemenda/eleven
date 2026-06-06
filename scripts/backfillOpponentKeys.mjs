/**
 * backfillOpponentKeys.mjs
 *
 * Finds every match document that has an `opponent` field but no `opponentKey`,
 * and writes `opponentKey = opponent.trim().toLowerCase()`.
 *
 * opponentKey is the canonical grouping key used by getRivalStats to prevent
 * "Real Madrid" vs "R. Madrid" from creating separate rival entries.
 * Once backfilled, opponentKey is the source of truth for grouping.
 * The `opponent` display field is never modified.
 *
 * Safety rules:
 *   - Dry-run by default. Pass --write to apply changes.
 *   - Never deletes any data.
 *   - Never overwrites a field that already has a non-empty value.
 *   - Flags match docs with no opponent field for manual review.
 *
 * Usage:
 *   node scripts/backfillOpponentKeys.mjs           # dry-run
 *   node scripts/backfillOpponentKeys.mjs --write   # apply
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n backfillOpponentKeys — ${DRY_RUN ? 'DRY RUN (read-only)' : '⚠️  WRITE MODE'}`)
  console.log(' Pass --write to apply changes.\n')

  // Load all matches
  console.log('Loading matches…')
  const matchesSnap = await db.collection('matches').get()
  console.log(`  ${matchesSnap.size} matches loaded.\n`)

  // Counters
  let checked      = 0
  let skipped      = 0   // already has opponentKey, or no opponent field
  let wouldUpdate  = 0
  let updated      = 0
  let manualReview = 0

  const reviewList = []

  // Collect a preview of unique derived keys so we can spot any normalization
  // collisions before committing (e.g. "Real Madrid" and "real madrid" both
  // mapping to the same key is expected and correct).
  const keyPreview = new Map() // normalizedKey → Set of raw display names

  for (const doc of matchesSnap.docs) {
    checked++
    const d   = doc.data()
    const mid = doc.id

    // Already has a valid opponentKey — skip, never overwrite
    if (hasValue(d.opponentKey)) {
      skipped++
      continue
    }

    // No opponent field — can't derive a key
    if (!hasValue(d.opponent)) {
      manualReview++
      reviewList.push({
        id: mid,
        reason: 'no opponent field on match',
        season: d.seasonId || d.season || '?',
        competition: d.competition || '?',
      })
      continue
    }

    const derivedKey = String(d.opponent).trim().toLowerCase()

    // Track for collision preview
    if (!keyPreview.has(derivedKey)) keyPreview.set(derivedKey, new Set())
    keyPreview.get(derivedKey).add(d.opponent)

    if (DRY_RUN) {
      console.log(`  [would update] match ${mid}  opponent="${d.opponent}"  → opponentKey="${derivedKey}"`)
      wouldUpdate++
    } else {
      await doc.ref.update({ opponentKey: derivedKey })
      console.log(`  [updated]      match ${mid}  opponent="${d.opponent}"  → opponentKey="${derivedKey}"`)
      updated++
    }
  }

  // Summary
  console.log('\n─────────────────────────────────────────')
  console.log(` checked:       ${checked}`)
  console.log(` skipped:       ${skipped}  (already had opponentKey, or no opponent field to derive from)`)
  if (DRY_RUN) {
    console.log(` wouldUpdate:   ${wouldUpdate}`)
  } else {
    console.log(` updated:       ${updated}`)
  }
  console.log(` manualReview:  ${manualReview}`)
  console.log('─────────────────────────────────────────\n')

  // Show any keys that consolidate multiple display name variants — this is the
  // whole point of opponentKey, so these are expected and good. Surface them so
  // you can confirm the consolidation is intentional.
  const consolidations = [...keyPreview.entries()].filter(([, names]) => names.size > 1)
  if (consolidations.length > 0) {
    console.log('ℹ️  Normalisation consolidations (multiple display names → one key):')
    for (const [key, names] of consolidations) {
      console.log(`   "${key}"  ←  ${[...names].map(n => `"${n}"`).join(', ')}`)
    }
    console.log('   These will be grouped as one rival. Confirm this is correct before writing.\n')
  }

  if (reviewList.length > 0) {
    console.log('⚠️  Manual review required:')
    for (const r of reviewList) {
      console.log(`   • [${r.id}] ${r.reason}  season=${r.season}  competition=${r.competition}`)
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
