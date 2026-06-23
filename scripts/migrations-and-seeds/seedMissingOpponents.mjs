/**
 * seedMissingOpponents.mjs
 *
 * Seeds missing Firestore `opponents` collection docs from data/opponents-seed.json.
 *
 * The Firestore `opponents` collection is the runtime source for all UCL opponent
 * identity data (displayName, country, crestUrl). It is separate from the seed JSON,
 * which is only used by the import script for validation. If an opponent is missing
 * from Firestore, its crest and display name will not appear in the UCL tabs.
 *
 * This script checks a defined list of target opponentKeys, compares against
 * Firestore, and creates only the missing docs. Existing docs are always skipped.
 *
 * Fields written per doc:
 *   displayName   — from seed JSON
 *   country       — from seed JSON
 *   sofifaTeamId  — from seed JSON (required; blocks --write if absent)
 *   aliases       — from seed JSON
 *   crestUrl      — computed: WORKER_BASE/team/{sofifaTeamId}
 *
 * Blockers (prevent --write):
 *   · A target opponentKey is not found in opponents-seed.json
 *   · A target entry has no sofifaTeamId (0, null, or absent)
 *
 * Usage:
 *   node scripts/seedMissingOpponents.mjs
 *   node scripts/seedMissingOpponents.mjs --write
 *
 * Requires serviceAccountKey.json at project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH  = resolve(__dirname, '../serviceAccountKey.json')
const SEED_PATH = resolve(__dirname, '../data/opponents-seed.json')

const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev'

// ─── Target opponentKeys for this fix ────────────────────────────────────────
// Add future missing opponents here as needed. Keys must match opponentKey in
// opponents-seed.json exactly.

const TARGETS = [
  'lech-poznan',
  'real-sociedad',
]

// ─── CLI ─────────────────────────────────────────────────────────────────────

const WRITE = process.argv.includes('--write')

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function header(t) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + t)
  console.log('─'.repeat(62))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  seedMissingOpponents — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Targets : ${TARGETS.join(', ')}`)
  console.log('══════════════════════════════════════════════════════════════')

  // ── Load seed file ──────────────────────────────────────────────────────────
  let seedArray
  try {
    seedArray = JSON.parse(readFileSync(SEED_PATH, 'utf8'))
  } catch (e) {
    console.error(`\n✗ Could not read opponents-seed.json: ${e.message}\n`)
    process.exit(1)
  }

  // Build a map from opponentKey → seed entry for O(1) lookup
  const seedMap = new Map(seedArray.map(e => [e.opponentKey, e]))

  // ── Resolve seed data for each target ──────────────────────────────────────
  header('Seed File Resolution')
  console.log()

  const resolved = []
  let   blockers = 0

  for (const key of TARGETS) {
    const entry = seedMap.get(key)

    if (!entry) {
      console.log(`  ✗  ${key.padEnd(24)}  NOT FOUND in opponents-seed.json — blocks write`)
      resolved.push({ key, entry: null, status: 'seed_missing' })
      blockers++
      continue
    }

    if (!entry.sofifaTeamId || entry.sofifaTeamId === 0) {
      console.log(`  ✗  ${key.padEnd(24)}  sofifaTeamId is absent or 0 — blocks write`)
      resolved.push({ key, entry, status: 'no_team_id' })
      blockers++
      continue
    }

    const crestUrl = `${WORKER_BASE}/team/${entry.sofifaTeamId}`
    console.log(`  ✓  ${key.padEnd(24)}  "${entry.displayName}"  sofifaTeamId:${entry.sofifaTeamId}`)
    console.log(`     crestUrl : ${crestUrl}`)
    resolved.push({ key, entry, crestUrl, status: 'seed_ok' })
  }

  if (blockers > 0) {
    console.log(`\n  ✗  ${blockers} blocker(s) in seed file. Resolve before running --write.`)
    console.log('══════════════════════════════════════════════════════════════')
    console.log('  Dry run complete. No data was written.')
    console.log('══════════════════════════════════════════════════════════════\n')
    process.exit(1)
  }

  // ── Check Firestore for existing docs ──────────────────────────────────────
  header('Firestore Existence Check')
  console.log()

  const db = initFirebase()

  for (const r of resolved) {
    if (r.status !== 'seed_ok') continue

    const snap = await db.collection('opponents').doc(r.key).get()

    if (snap.exists) {
      const existing = snap.data()
      console.log(`  –  ${r.key.padEnd(24)}  ALREADY EXISTS — skipping`)
      console.log(`     stored displayName : ${existing.displayName || '(none)'}`)
      console.log(`     stored crestUrl    : ${existing.crestUrl || '(none)'}`)
      r.status = 'exists'
    } else {
      console.log(`  ⚠  ${r.key.padEnd(24)}  MISSING in Firestore — will create`)
      r.status = 'will_create'
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  header('Summary')
  console.log()

  const toCreate  = resolved.filter(r => r.status === 'will_create')
  const toSkip    = resolved.filter(r => r.status === 'exists')

  console.log(`  Will create  : ${toCreate.length}`)
  console.log(`  Already exist (skip) : ${toSkip.length}`)

  if (toCreate.length > 0) {
    console.log()
    for (const r of toCreate) {
      console.log(`  ⚠  ${r.key}`)
      console.log(`     displayName  : ${r.entry.displayName}`)
      console.log(`     country      : ${r.entry.country}`)
      console.log(`     sofifaTeamId : ${r.entry.sofifaTeamId}`)
      console.log(`     aliases      : ${JSON.stringify(r.entry.aliases ?? [])}`)
      console.log(`     crestUrl     : ${r.crestUrl}`)
    }
  }

  if (toCreate.length === 0) {
    console.log('\n  ✅  All target opponents already exist in Firestore. Nothing to write.')
    console.log('══════════════════════════════════════════════════════════════')
    console.log('  Dry run complete. No data was written.')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  console.log('\n  ✅  SAFE TO WRITE')
  console.log(`  ${toCreate.length} opponent doc(s) will be created.`)

  // ── Dry-run exit ────────────────────────────────────────────────────────────
  if (!WRITE) {
    console.log('══════════════════════════════════════════════════════════════')
    console.log('  Dry run complete. No data was written.')
    console.log('  Review the output above, then run with --write to apply.')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  // ── Write path ──────────────────────────────────────────────────────────────
  header('Writing Opponent Docs')
  console.log()

  for (const r of toCreate) {
    const docData = {
      displayName:  r.entry.displayName,
      country:      r.entry.country      ?? null,
      sofifaTeamId: r.entry.sofifaTeamId,
      aliases:      r.entry.aliases      ?? [],
      crestUrl:     r.crestUrl,
    }

    try {
      await db.collection('opponents').doc(r.key).set(docData)
      console.log(`  ✓  ${r.key.padEnd(24)}  created`)
    } catch (err) {
      console.error(`  ✗  ${r.key.padEnd(24)}  WRITE FAILED: ${err.message}`)
      console.error('  Aborting. Re-run dry run to check current state.\n')
      process.exit(1)
    }
  }

  // ── Post-write verification ─────────────────────────────────────────────────
  header('Post-Write Verification')
  console.log()

  let allVerified = true

  for (const r of toCreate) {
    const fresh = await db.collection('opponents').doc(r.key).get()

    if (fresh.exists) {
      const d = fresh.data()
      console.log(`  ✓  ${r.key.padEnd(24)}  exists — displayName: "${d.displayName}"  crestUrl: ${d.crestUrl}`)
    } else {
      console.log(`  ✗  ${r.key.padEnd(24)}  NOT FOUND after write — unexpected`)
      allVerified = false
    }
  }

  console.log('\n' + '══════════════════════════════════════════════════════════════')
  if (allVerified) {
    console.log('  ✅  All opponent docs verified. UCL crests should now resolve.')
    console.log('  Reload the app to see the updated logos.')
  } else {
    console.log('  ⚠   Some docs did not verify. Run the dry-run again to inspect.')
  }
  console.log('══════════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
