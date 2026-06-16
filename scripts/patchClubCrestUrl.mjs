/**
 * patchClubCrestUrl.mjs
 *
 * Patches the `crestUrl` field on an existing club document in Firestore.
 * Default: dry-run (read-only). Use --write to apply.
 *
 * The frontend reads `club.crestUrl` to render the official badge/shield
 * wherever the club identity is shown (Header, ClubCard, Home hero, History).
 * This script is the only supported way to set or update that field.
 *
 * Badge file setup (do this first — no upload script):
 *   1. Place the badge PNG at: public/club-crests/<slug>.png in the repo
 *   2. The app-relative URL is: /eleven/club-crests/<slug>.png
 *   3. Run this script with --crestUrl=/eleven/club-crests/<slug>.png
 *      (dry-run first, then --write)
 *
 * Accepted crestUrl formats:
 *   /eleven/...    app-relative path for repo-hosted badges (preferred)
 *   https://...    external URL (e.g. future CDN)
 *   Anything else is rejected.
 *
 * Important — AppContext caching:
 *   activeClub is stored in localStorage by the app. After patching Firestore,
 *   the user must re-open the Club Selector and re-select the club to pick up
 *   the new crestUrl. A hard reload alone is NOT sufficient.
 *
 * Only the `crestUrl` field is written — all other fields are preserved as-is.
 * Never touches: seasons · players · seasonStats · matches · transfers
 *               opponents · games
 *
 * Usage:
 *   cd /Users/MichaelMenda/Documents/Mike/1Apps/eleven/1Repo
 *
 *   # Dry-run (always run first):
 *   node scripts/patchClubCrestUrl.mjs \
 *     --clubId=kqhz2LAYC1pOzOtLehR4 \
 *     --crestUrl=/eleven/club-crests/richport.png
 *
 *   # Apply patch (only after reviewing dry-run output):
 *   node scripts/patchClubCrestUrl.mjs \
 *     --clubId=kqhz2LAYC1pOzOtLehR4 \
 *     --crestUrl=/eleven/club-crests/richport.png \
 *     --write
 *
 * serviceAccountKey.json must be at the project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH  = resolve(__dirname, '../serviceAccountKey.json')

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
  console.log(`  ${label.padEnd(14)} ${display}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  // ── Validate CLI ────────────────────────────────────────────────────────────
  if (!args.clubId) {
    console.error('\n✗ --clubId is required')
    console.error('  Example: node scripts/patchClubCrestUrl.mjs --clubId=kqhz2LAYC1pOzOtLehR4 --crestUrl=/eleven/club-crests/richport.png\n')
    process.exit(1)
  }

  if (!args.crestUrl) {
    console.error('\n✗ --crestUrl is required')
    console.error('  Upload the badge to Firebase Storage, copy the download URL, then pass it here.\n')
    process.exit(1)
  }

  // URL format validation: accept /eleven/... (repo-hosted) or https:// (external)
  const isRepoPath = args.crestUrl.startsWith('/eleven/')
  const isHttpsUrl = args.crestUrl.startsWith('https://')
  if (!isRepoPath && !isHttpsUrl) {
    console.error(`\n✗ --crestUrl must start with /eleven/ or https://`)
    console.error(`  Received: "${args.crestUrl}"`)
    console.error('  For repo-hosted badges: /eleven/club-crests/<slug>.png')
    console.error('  For external URLs:      https://...\n')
    process.exit(1)
  }

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  patchClubCrestUrl — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Club ID  : ${args.clubId}`)
  console.log(`  crestUrl : ${args.crestUrl}`)
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
  field('crestColor', existing.crestColor)
  field('crestUrl',   existing.crestUrl)
  field('gameId',     existing.gameId)

  // ── Diff check ───────────────────────────────────────────────────────────────
  header('Proposed Patch')
  console.log()

  if (existing.crestUrl === args.crestUrl) {
    console.log('  ✓ crestUrl is already set to this value. No write needed.')
    console.log(`    ${args.crestUrl}`)
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('  DRY RUN COMPLETE — nothing to write (value already correct).')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  const fromStr = existing.crestUrl ? existing.crestUrl : '(not set)'
  console.log(`  crestUrl`)
  console.log(`    from : ${fromStr}`)
  console.log(`    to   : ${args.crestUrl}`)
  console.log()
  console.log('  Only crestUrl is patched. All other fields are preserved as-is.')
  console.log()
  console.log('  Collections NOT touched:')
  console.log('    seasons · players · seasonStats · matches · transfers · opponents · games')

  // ── Dry-run exit ─────────────────────────────────────────────────────────────
  if (!WRITE) {
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('  DRY RUN COMPLETE — no data was written.')
    console.log('  Run with --write to apply.')
    console.log()
    console.log('  After writing, the user must re-open Club Selector and')
    console.log('  re-select the club to pick up the new crestUrl (localStorage cache).')
    console.log('══════════════════════════════════════════════════════════════\n')
    return
  }

  // ── Write ────────────────────────────────────────────────────────────────────
  header('Applying Patch')
  console.log()

  try {
    await clubRef.update({ crestUrl: args.crestUrl })
  } catch (err) {
    console.error(`  ✗ Firestore update FAILED. Club doc is unchanged.`)
    console.error(`  Error: ${err.message}\n`)
    process.exit(1)
  }

  // ── Post-write verification ───────────────────────────────────────────────────
  const verifySnap = await clubRef.get()
  if (!verifySnap.exists) {
    console.error('  ✗ Post-write verification FAILED — doc missing after update.\n')
    process.exit(1)
  }

  const written = verifySnap.data()

  console.log('\n══════════════════════════════════════════════════════════════')
  if (written.crestUrl === args.crestUrl) {
    console.log('  ✅  PATCH APPLIED')
    console.log()
    console.log(`  Club     : ${written.name}`)
    console.log(`  ID       : ${args.clubId}`)
    console.log(`  crestUrl : ${written.crestUrl}`)
    console.log()
    console.log('  To see the badge in the app:')
    console.log('    1. Open the app → Club Selector')
    console.log('    2. Tap the club to re-select it (refreshes localStorage cache)')
    console.log('    3. Badge will appear in Header, ClubCard, Home hero, and History')
  } else {
    console.log('  ⚠   Patch applied but post-write verification found a mismatch.')
    console.log(`  Written : "${written.crestUrl}"`)
    console.log(`  Expected: "${args.crestUrl}"`)
    console.log('  Check Firestore directly.')
  }
  console.log('══════════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
