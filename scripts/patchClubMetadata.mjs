/**
 * patchClubMetadata.mjs
 *
 * Patches an existing club doc with gameId and optional metadata fields
 * so the club appears in the frontend save selector.
 * Default: dry-run (read-only). Use --write to apply.
 *
 * The frontend selector loads clubs via:
 *   getClubs(activeGame.id)  →  where('gameId', '==', activeGame.id)
 *
 * A club doc missing gameId is permanently invisible in the selector,
 * regardless of how many seasons it has. This script adds that field
 * and any other optional metadata fields in a single atomic update.
 *
 * Game resolution:
 *   --game="FC 26"   looks up the game by title in the games collection (preferred)
 *   --gameId=<id>    explicit Firestore document ID (fallback)
 *
 * Only fields you explicitly pass are written — existing fields are preserved.
 * Never touches: seasons · players · seasonStats · matches · transfers
 *               opponents · games
 *
 * Usage:
 *   cd /Users/MichaelMenda/Documents/Mike/1Apps/eleven/1Repo
 *
 *   # Dry-run (always run first):
 *   node scripts/patchClubMetadata.mjs \
 *     --clubId=xhAwkYVCNY8nGLqIiU5X \
 *     --game="FC 26" \
 *     --manager="Pep Guardiola" \
 *     --formation="4-3-3" \
 *     --league="Premier League"
 *
 *   # Apply patch (only after reviewing dry-run output):
 *   node scripts/patchClubMetadata.mjs \
 *     --clubId=xhAwkYVCNY8nGLqIiU5X \
 *     --game="FC 26" \
 *     --manager="Pep Guardiola" \
 *     --formation="4-3-3" \
 *     --league="Premier League" \
 *     --write
 *
 * serviceAccountKey.json must be at the project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require    = createRequire(import.meta.url)
const admin      = require('firebase-admin')
const __dirname  = dirname(fileURLToPath(import.meta.url))
const KEY_PATH   = resolve(__dirname, '../serviceAccountKey.json')

// ─── CLI ─────────────────────────────────────────────────────────────────────

const WRITE = process.argv.includes('--write')

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

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

// ─── Game resolution ──────────────────────────────────────────────────────────

async function resolveGame(db) {
  // Explicit gameId takes precedence
  if (args.gameId) {
    const snap = await db.collection('games').doc(args.gameId).get()
    if (!snap.exists) {
      console.error(`\n✗ No game found with id: "${args.gameId}"\n`)
      process.exit(1)
    }
    return { id: snap.id, ...snap.data() }
  }

  // Lookup by title
  if (args.game) {
    const snap = await db.collection('games').get()
    const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const query = args.game.toLowerCase().trim()
    const matches = all.filter(g =>
      (g.title || g.name || g.label || '').toLowerCase().trim() === query
    )

    if (matches.length === 0) {
      const available = all.map(g => `"${g.title || g.name || g.id}"`).join(', ')
      console.error(`\n✗ No game found matching "${args.game}".`)
      console.error(`  Available: ${available || '(none — games collection is empty)'}`)
      console.error('  Check the title or use --gameId=<id> instead.\n')
      process.exit(1)
    }

    if (matches.length > 1) {
      console.error(`\n✗ Multiple games matched "${args.game}" — use --gameId=<id> to be explicit:`)
      matches.forEach(g => console.error(`     ${g.id}  "${g.title || g.name}"`))
      console.error()
      process.exit(1)
    }

    return matches[0]
  }

  console.error('\n✗ Game is required. Pass either:')
  console.error('     --game="FC 26"   (preferred — looks up by title)')
  console.error('     --gameId=<id>    (explicit Firestore document ID)\n')
  process.exit(1)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function header(t) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + t)
  console.log('─'.repeat(62))
}

function field(label, value) {
  const display = value === undefined ? '(not set)'
                : value === ''        ? '(empty string)'
                : value === null      ? 'null'
                : String(value)
  console.log(`  ${label.padEnd(18)} ${display}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  // ── Validate CLI ────────────────────────────────────────────────────────────
  if (!args.clubId) {
    console.error('\n✗ --clubId is required  (e.g. --clubId=xhAwkYVCNY8nGLqIiU5X)\n')
    process.exit(1)
  }

  if (!args.game && !args.gameId) {
    console.error('\n✗ Game is required. Pass either:')
    console.error('     --game="FC 26"   (preferred — looks up by title)')
    console.error('     --gameId=<id>    (explicit Firestore document ID)\n')
    process.exit(1)
  }

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  patchClubMetadata — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Club ID : ${args.clubId}`)
  console.log(`  Game    : ${args.game || `(explicit gameId: ${args.gameId})`}`)
  console.log('══════════════════════════════════════════════════════════════')

  const db = initFirebase()

  // ── Load club doc ────────────────────────────────────────────────────────────
  header('Current Club State')
  console.log()

  const clubRef  = db.collection('clubs').doc(args.clubId)
  const clubSnap = await clubRef.get()

  if (!clubSnap.exists) {
    console.error(`  ✗ No club found with id: "${args.clubId}"`)
    console.error('    Verify the clubId and try again.\n')
    process.exit(1)
  }

  const existing = clubSnap.data()
  console.log(`  ✓ Club doc found\n`)

  field('name',       existing.name)
  field('gameId',     existing.gameId)
  field('manager',    existing.manager)
  field('formation',  existing.formation)
  field('league',     existing.league)
  field('crestColor', existing.crestColor)
  field('createdAt',  existing.createdAt?.toDate?.().toISOString() ?? existing.createdAt)

  // ── Resolve game ─────────────────────────────────────────────────────────────
  header('Game Resolution')
  console.log()

  const game = await resolveGame(db)
  console.log(`  ✓ Game resolved`)
  console.log(`    id    : ${game.id}`)
  console.log(`    title : ${game.title || game.name || '(no title field)'}`)

  // ── Build patch ──────────────────────────────────────────────────────────────
  header('Proposed Patch')
  console.log()

  // gameId is always patched (the main purpose of this script).
  // Cosmetic fields are only included if explicitly passed as args.
  const patch = { gameId: game.id }

  if (typeof args.manager   === 'string') patch.manager   = args.manager
  if (typeof args.formation === 'string') patch.formation = args.formation
  if (typeof args.league    === 'string') patch.league    = args.league
  if (typeof args.crestColor === 'string') patch.crestColor = args.crestColor

  // Identify which fields are actually changing vs. already correct
  const changes  = []
  const noChange = []

  for (const [key, val] of Object.entries(patch)) {
    if (existing[key] === val) {
      noChange.push(key)
    } else {
      changes.push({ key, from: existing[key], to: val })
    }
  }

  if (changes.length === 0 && noChange.length > 0) {
    console.log('  ✓ All patched fields already have the correct values.')
    console.log('    No Firestore write is needed.')
    noChange.forEach(k => console.log(`    ${k.padEnd(14)} already: ${patch[k]}`))
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('  DRY RUN COMPLETE — nothing to write.')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  console.log('  Fields that will change:')
  for (const { key, from, to } of changes) {
    const fromStr = from === undefined ? '(not set)' : from === '' ? '(empty)' : String(from)
    console.log(`    ${key.padEnd(14)} ${fromStr.padEnd(30)} → "${to}"`)
  }

  if (noChange.length > 0) {
    console.log('\n  Fields already correct (will not be touched):')
    noChange.forEach(k => console.log(`    ${k.padEnd(14)} "${patch[k]}"`))
  }

  console.log('\n  Fields NOT in patch (preserved as-is):')
  const allKnown = new Set(['name', 'gameId', 'manager', 'formation', 'league', 'crestColor',
                             'style', 'seasonsLogged', 'trophyCount', 'createdAt'])
  const preserved = Object.keys(existing).filter(k => !Object.keys(patch).includes(k))
  if (preserved.length === 0) {
    console.log('    (none)')
  } else {
    preserved.forEach(k => console.log(`    ${k}`))
  }

  console.log('\n  Collections NOT touched:')
  console.log('    seasons · players · seasonStats · matches · transfers · opponents · games')

  // ── Dry-run exit ─────────────────────────────────────────────────────────────
  if (!WRITE) {
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('  DRY RUN COMPLETE — no data was written.')
    console.log(`  ${changes.length} field(s) would be updated.`)
    console.log('  Run with --write to apply.')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  // ── Write ─────────────────────────────────────────────────────────────────────
  header('Applying Patch')
  console.log()

  // update() merges fields — does not overwrite fields not in patch
  try {
    await clubRef.update(patch)
  } catch (err) {
    console.error(`\n  ✗ Firestore update FAILED. Club doc is unchanged.`)
    console.error(`  Error: ${err.message}\n`)
    process.exit(1)
  }

  // ── Post-write verification ───────────────────────────────────────────────────
  const verifySnap = await clubRef.get()
  if (!verifySnap.exists) {
    console.error('\n  ✗ Post-write verification FAILED — doc missing after update.\n')
    process.exit(1)
  }

  const written = verifySnap.data()
  let verifyPass = true

  for (const [key, val] of Object.entries(patch)) {
    if (written[key] !== val) {
      console.log(`  ✗ ${key}: written "${written[key]}" ≠ expected "${val}"`)
      verifyPass = false
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════')
  if (verifyPass) {
    console.log('  ✅  PATCH APPLIED')
    console.log()
    console.log(`  Club : ${written.name}`)
    console.log(`  ID   : ${args.clubId}`)
    console.log(`  gameId set to: ${written.gameId}`)
    console.log()
    console.log('  The club will now appear in the frontend save selector')
    console.log('  under the game it was linked to. Reload the PWA to confirm.')
  } else {
    console.log('  ⚠   Patch applied but post-write verification found mismatches.')
    console.log('  Read the fields above and check Firestore directly.')
  }
  console.log('══════════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
