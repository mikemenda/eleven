/**
 * migrateS1Transfers.mjs
 *
 * Normalizes all S1 transfer docs from legacy camelCase field names
 * (feeEur / fromClub / toClub / ruleType) to canonical snake_case
 * (fee_eur / from_club / to_club / rule) and adds season: 'S1' snapshot.
 *
 * Source of truth for S1 data: confirmed screenshot + Firestore doc IDs
 * from transfer-audit.json (cross-checked 13/13 fees match).
 *
 * SKIPPED: Generic Player — no confirmed real-player replacement data.
 *          Will remain in manualReview until caller provides replacement.
 *
 * Usage:
 *   node scripts/migrateS1Transfers.mjs          # dry-run (safe, default)
 *   node scripts/migrateS1Transfers.mjs '--write' # execute writes
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const WRITE = process.argv.includes('--write')
const S1_SEASON_ID = '7ZQxy1R0zHmVDL2qDjYs'

// ── Source of truth ──────────────────────────────────────────────────────────
// Keyed by "player name + direction" for unambiguous matching.
// rule is null for all S1 docs — not present in original source of truth.
// from_club / to_club are set from the perspective of the transfer:
//   IN:  from_club = seller,  to_club = 'FC Richport'
//   OUT: from_club = 'FC Richport', to_club = buyer
const SOURCE_OF_TRUTH = {
  'Nico Williams__IN': {
    position: 'LM', from_club: 'Liverpool',          to_club: 'FC Richport',       fee_eur: 128500000, rule: null,
  },
  'Schlotterbeck__IN': {
    position: 'CB', from_club: 'Borussia Dortmund',  to_club: 'FC Richport',       fee_eur: 78000000,  rule: null,
  },
  'Johnny Cardoso__IN': {
    position: 'CM', from_club: 'Atlético Madrid',    to_club: 'FC Richport',       fee_eur: 42400000,  rule: null,
  },
  'Ferran Torres__IN': {
    position: 'ST', from_club: 'Barcelona',          to_club: 'FC Richport',       fee_eur: 60000000,  rule: null,
  },
  'Alphonso Davies__IN': {
    position: 'LB', from_club: 'Bayern Munich',      to_club: 'FC Richport',       fee_eur: 70900000,  rule: null,
  },
  'João Neves__IN': {
    position: 'CM', from_club: 'PSG',                to_club: 'FC Richport',       fee_eur: 150000000, rule: null,
  },
  'Jules Koundé__IN': {
    position: 'RB', from_club: 'PSG',                to_club: 'FC Richport',       fee_eur: 78100000,  rule: null,
  },
  'Antonio Silva__OUT': {
    position: 'CB', from_club: 'FC Richport',        to_club: 'Borussia Dortmund', fee_eur: 105500000, rule: null,
  },
  'Amad__OUT': {
    position: 'RM', from_club: 'FC Richport',        to_club: 'Atlético Madrid',   fee_eur: 69200000,  rule: null,
  },
  'Gvardiol__OUT': {
    position: 'LB', from_club: 'FC Richport',        to_club: 'Barcelona',         fee_eur: 116000000, rule: null,
  },
  'Maatsen__OUT': {
    position: 'LB', from_club: 'FC Richport',        to_club: 'Bayern Munich',     fee_eur: 78800000,  rule: null,
  },
  'Cole Palmer__OUT': {
    position: 'CAM', from_club: 'FC Richport',       to_club: 'PSG',               fee_eur: 233000000, rule: null,
  },
  'Hakimi__OUT': {
    position: 'RB', from_club: 'FC Richport',        to_club: 'PSG',               fee_eur: 129600000, rule: null,
  },
}

const LEGACY_FIELDS_TO_REMOVE = ['feeEur', 'fromClub', 'toClub', 'ruleType', 'rulePct']

async function main() {
  if (!WRITE) {
    console.log('═══════════════════════════════════════════════════')
    console.log('  DRY-RUN MODE — no Firestore writes will execute')
    console.log('  Pass \'--write\' to execute')
    console.log('═══════════════════════════════════════════════════\n')
  } else {
    console.log('⚠️  WRITE MODE — Firestore updates will execute\n')
  }

  const admin = require('firebase-admin')
  const sa    = require('../serviceAccountKey.json')
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()

  // Fetch all S1 transfer docs
  const snap = await db.collection('transfers')
    .where('seasonId', '==', S1_SEASON_ID)
    .get()

  const docs = snap.docs.map(d => ({ _ref: d.ref, id: d.id, ...d.data() }))
  console.log(`Fetched ${docs.length} docs with seasonId = ${S1_SEASON_ID}\n`)

  const results = {
    wouldUpdate: 0,
    updated: 0,
    skippedAlreadyCanonical: 0,
    manualReview: [],
    mismatches: [],
  }

  for (const doc of docs) {
    const matchKey = `${doc.player}__${doc.direction}`
    const truth    = SOURCE_OF_TRUTH[matchKey]

    // ── SKIP: Generic Player — no real replacement data yet ──────────────────
    if (doc.player === 'Generic Player') {
      console.log(`⏭  SKIPPED (manualReview): Generic Player — no confirmed replacement data`)
      results.manualReview.push({ id: doc.id, player: doc.player, reason: 'no confirmed real-player data' })
      continue
    }

    // ── No match in source of truth ──────────────────────────────────────────
    if (!truth) {
      console.log(`⚠  NO MATCH in source of truth: "${doc.player}" (${doc.direction}) — manualReview`)
      results.manualReview.push({ id: doc.id, player: doc.player, direction: doc.direction, reason: 'not in source of truth' })
      continue
    }

    // ── Already canonical? (fee_eur present, no legacy fields) ───────────────
    const hasLegacy    = LEGACY_FIELDS_TO_REMOVE.some(f => doc[f] != null)
    const hasCanonical = doc.fee_eur != null && doc.from_club != null && doc.to_club != null
    const hasSeasonLabel = doc.season === 'S1'

    if (!hasLegacy && hasCanonical && hasSeasonLabel) {
      console.log(`✓  ALREADY CANONICAL: ${doc.player} (${doc.direction})`)
      results.skippedAlreadyCanonical++
      continue
    }

    // ── Cross-check: Firestore legacy fee vs source of truth ─────────────────
    const firestoreFee = doc.feeEur ?? doc.fee_eur
    if (firestoreFee != null && firestoreFee !== truth.fee_eur) {
      console.log(`✗  FEE MISMATCH: ${doc.player} (${doc.direction})`)
      console.log(`   Firestore: ${firestoreFee}  Source of truth: ${truth.fee_eur}`)
      results.mismatches.push({ id: doc.id, player: doc.player, firestoreFee, truthFee: truth.fee_eur })
      results.manualReview.push({ id: doc.id, player: doc.player, reason: 'fee mismatch — not written' })
      continue
    }

    // ── Build canonical payload ───────────────────────────────────────────────
    const writes = {
      fee_eur:   truth.fee_eur,
      from_club: truth.from_club,
      to_club:   truth.to_club,
      position:  truth.position,
      rule:      truth.rule,   // null — not in source of truth
      season:    'S1',
    }

    // Remove legacy fields via FieldValue.delete()
    const { FieldValue } = admin.firestore
    for (const f of LEGACY_FIELDS_TO_REMOVE) {
      if (doc[f] !== undefined) {
        writes[f] = FieldValue.delete()
      }
    }

    // ── Print current vs proposed ─────────────────────────────────────────────
    console.log(`\n─── ${doc.player} (${doc.direction}) [doc: ${doc.id}] ───`)
    console.log(`  fee_eur:   ${doc.fee_eur ?? 'null'}  →  ${truth.fee_eur}`)
    console.log(`  from_club: ${doc.from_club ?? 'null'}  →  "${truth.from_club}"`)
    console.log(`  to_club:   ${doc.to_club ?? 'null'}  →  "${truth.to_club}"`)
    console.log(`  position:  ${doc.position ?? 'null'}  →  "${truth.position}"`)
    console.log(`  rule:      ${doc.rule ?? 'null'}  →  null (not in source of truth)`)
    console.log(`  season:    ${doc.season ?? 'null'}  →  "S1"`)
    const legacyPresent = LEGACY_FIELDS_TO_REMOVE.filter(f => doc[f] != null)
    if (legacyPresent.length) {
      console.log(`  REMOVE:    ${legacyPresent.join(', ')}`)
    }

    results.wouldUpdate++

    if (WRITE) {
      await doc._ref.update(writes)
      results.updated++
      console.log(`  ✅ Written`)
    } else {
      console.log(`  → Would write (dry-run)`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  wouldUpdate:             ${results.wouldUpdate}`)
  console.log(`  updated:                 ${results.updated}`)
  console.log(`  skippedAlreadyCanonical: ${results.skippedAlreadyCanonical}`)
  console.log(`  manualReview:            ${results.manualReview.length}`)
  console.log(`  mismatches:              ${results.mismatches.length}`)

  if (results.manualReview.length) {
    console.log('\n  manualReview items:')
    results.manualReview.forEach(r => console.log(`    - ${r.player} (${r.direction || '?'}): ${r.reason}`))
  }
  if (results.mismatches.length) {
    console.log('\n  MISMATCHES (not written):')
    results.mismatches.forEach(r => console.log(`    - ${r.player}: Firestore ${r.firestoreFee} vs truth ${r.truthFee}`))
  }
  if (!WRITE) {
    console.log('\n  Run with \'--write\' to execute.')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
