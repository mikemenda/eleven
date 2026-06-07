/**
 * patchTransferCleanup.mjs
 *
 * Patches three transfer docs:
 *
 *  1. "Generic Player" (S1 OUT) — regen placeholder, no real player identity.
 *     Renamed to "Generated Player", all canonical fields written, legacy
 *     fields removed. playerId stays null (transfer-only historical record).
 *
 *  2. Mercado (S2 Jan OUT) — position backfill only.
 *
 *  3. Newerton (S3 Sum OUT) — position backfill only.
 *
 * All patches are matched by Firestore doc ID — no name-based matching.
 * playerId is never touched. No player stubs are created.
 *
 * Usage:
 *   node scripts/patchTransferCleanup.mjs           # dry-run (default, safe)
 *   node scripts/patchTransferCleanup.mjs '--write' # execute writes
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// ─────────────────────────────────────────────────────────────────────────────
// !! FILL THESE IN BEFORE RUNNING !!
// Mercado and Newerton are sold players with no Firestore profile doc.
// Their positions are not recoverable from the database — source from your
// original save records and set the values here before running the dry-run.
// ─────────────────────────────────────────────────────────────────────────────
const MERCADO_POSITION  = 'CM'  // Patrik Mercado — CM (Ecuador)
const NEWERTON_POSITION = 'LW'  // Newerton Martins da Silva — LW (Brazil)
// ─────────────────────────────────────────────────────────────────────────────

const WRITE = process.argv.includes('--write')

// Patch definitions — keyed by Firestore doc ID for unambiguous targeting
const PATCHES = [
  {
    id:          '2jt9pHGBuduy4aQeim8r',
    label:       'Generic Player → Generated Player (S1 OUT regen)',
    writes: {
      player:     'Generated Player',
      position:   'CAM',
      fee_eur:    125600000,
      from_club:  'FC Richport',
      to_club:    'Liverpool',
      season:     'S1',
      // direction, seasonId, window, clubId, playerId — unchanged
    },
    // Legacy camelCase fields still present on this doc (migration skipped it)
    removeLegacy: ['feeEur', 'fromClub', 'toClub', 'ruleType'],
    skipIfNull:   false,
  },
  {
    id:          '8VCVBpUbnkW8ALdpG8Cl',
    label:       'Mercado (S2 Jan OUT) — position backfill',
    writes:      () => {
      if (!MERCADO_POSITION) return null  // guard: position not set
      return { position: MERCADO_POSITION }
    },
    removeLegacy: [],
    skipIfNull:   true,   // skip if position constant not filled in
  },
  {
    id:          'iaqV3C93rudhXLzn08LL',
    label:       'Newerton (S3 Sum OUT) — position backfill',
    writes:      () => {
      if (!NEWERTON_POSITION) return null
      return { position: NEWERTON_POSITION }
    },
    removeLegacy: [],
    skipIfNull:   true,
  },
]

async function main() {
  // Pre-flight: warn if position constants not set
  const positionsMissing = []
  if (!MERCADO_POSITION)  positionsMissing.push('MERCADO_POSITION')
  if (!NEWERTON_POSITION) positionsMissing.push('NEWERTON_POSITION')

  if (!WRITE) {
    console.log('═══════════════════════════════════════════════════════')
    console.log('  DRY-RUN MODE — no Firestore writes will execute')
    console.log('  Pass \'--write\' to execute')
    console.log('═══════════════════════════════════════════════════════\n')
  } else {
    console.log('⚠️  WRITE MODE — Firestore updates will execute\n')
  }

  if (positionsMissing.length) {
    console.log(`⚠️  Position constants not set: ${positionsMissing.join(', ')}`)
    console.log('   Mercado and Newerton patches will be SKIPPED until these are filled in.\n')
  }

  const admin = require('firebase-admin')
  const sa    = require('../serviceAccountKey.json')
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()
  const { FieldValue } = admin.firestore

  const results = {
    wouldUpdate: 0,
    updated:     0,
    skipped:     0,
    errors:      [],
  }

  for (const patch of PATCHES) {
    console.log(`\n─── ${patch.label} [${patch.id}] ───`)

    // Resolve writes — can be plain object or function (for conditional patches)
    const writes = typeof patch.writes === 'function' ? patch.writes() : patch.writes

    if (!writes) {
      console.log('  ⏭  SKIPPED — position constant not set')
      results.skipped++
      continue
    }

    // Fetch current doc to show diff
    let currentDoc
    try {
      const snap = await db.collection('transfers').doc(patch.id).get()
      if (!snap.exists) {
        console.log('  ✗  Doc not found in Firestore — check ID')
        results.errors.push({ id: patch.id, label: patch.label, reason: 'doc not found' })
        continue
      }
      currentDoc = snap.data()
    } catch (err) {
      console.log(`  ✗  Fetch error: ${err.message}`)
      results.errors.push({ id: patch.id, label: patch.label, reason: err.message })
      continue
    }

    // Print diff: current → proposed
    let anyChange = false
    for (const [field, newVal] of Object.entries(writes)) {
      const oldVal = currentDoc[field] ?? null
      const changed = oldVal !== newVal
      if (changed) {
        console.log(`  ${field}: ${JSON.stringify(oldVal)}  →  ${JSON.stringify(newVal)}`)
        anyChange = true
      } else {
        console.log(`  ${field}: ${JSON.stringify(oldVal)}  (unchanged)`)
      }
    }

    // Legacy field removals
    if (patch.removeLegacy?.length) {
      const present = patch.removeLegacy.filter(f => currentDoc[f] !== undefined)
      if (present.length) {
        console.log(`  REMOVE legacy fields: ${present.join(', ')}`)
        anyChange = true
      } else {
        console.log('  No legacy fields to remove (already clean)')
      }
    }

    if (!anyChange) {
      console.log('  ✓  Already canonical — no changes needed')
      results.skipped++
      continue
    }

    results.wouldUpdate++

    if (WRITE) {
      // Add FieldValue.delete() for legacy field removals
      const finalWrites = { ...writes }
      for (const f of (patch.removeLegacy || [])) {
        if (currentDoc[f] !== undefined) {
          finalWrites[f] = FieldValue.delete()
        }
      }
      try {
        await db.collection('transfers').doc(patch.id).update(finalWrites)
        results.updated++
        console.log('  ✅ Written')
      } catch (err) {
        console.log(`  ✗  Write error: ${err.message}`)
        results.errors.push({ id: patch.id, label: patch.label, reason: err.message })
      }
    } else {
      console.log('  → Would write (dry-run)')
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  wouldUpdate: ${results.wouldUpdate}`)
  console.log(`  updated:     ${results.updated}`)
  console.log(`  skipped:     ${results.skipped}`)
  console.log(`  errors:      ${results.errors.length}`)
  if (results.errors.length) {
    results.errors.forEach(e => console.log(`    - ${e.label}: ${e.reason}`))
  }
  if (positionsMissing.length && !WRITE) {
    console.log(`\n  To complete: set ${positionsMissing.join(' and ')} at the top of this file,`)
    console.log('  then re-run the dry-run to confirm, then pass \'--write\'.')
  }
  if (!WRITE && results.wouldUpdate > 0) {
    console.log("\n  Run with '--write' to execute.")
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
