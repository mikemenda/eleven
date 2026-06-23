/**
 * auditAndPatchPlayerFaces.mjs
 *
 * Audits and optionally patches player sofifaId fields for a given club.
 * Default: dry-run (read-only). Use --write to apply patches to Firestore.
 *
 * Background:
 *   The Eleven app derives every player face image URL solely from the
 *   player doc's sofifaId field:
 *     https://fifa-img.michaelmenda92.workers.dev/{sofifaId}
 *
 *   There is no stored "playerFaceUrl" field anywhere — sofifaId IS the
 *   identity anchor. A missing or wrong sofifaId means a missing or wrong face.
 *
 *   This script was created after Montverd S1 was imported with an older
 *   version of importSeason.mjs that sourced sofifaId from the CSV matcher
 *   instead of the season JSON. The result was null or wrong sofifaId on
 *   most player docs.
 *
 * What it checks:
 *   A. Firestore sofifaId null/zero — source JSON has a value → PATCH NEEDED
 *   B. Firestore sofifaId differs from source JSON value → VERIFY (manual check)
 *   C. Firestore sofifaId matches source JSON → MATCH
 *   D. Player not in source JSON (or no source file supplied) → SOURCE MISSING / NO SOURCE
 *
 * What it patches (--write only):
 *   · Players in group A: update sofifaId from source JSON value
 *   · Players in group B: update sofifaId from source JSON value
 *     (B is treated as patchable — the source JSON was manually supplied and
 *     is assumed to be the verified ground truth for this run)
 *   · Players in group C/D: no write
 *
 * Scope:
 *   · Only writes `sofifaId` on player docs for the given clubId.
 *   · Never touches seasons, seasonStats, matches, transfers, opponents, clubs,
 *     any other field on player docs, or any other club.
 *
 * Usage:
 *   node scripts/auditAndPatchPlayerFaces.mjs --clubId=<id>
 *   node scripts/auditAndPatchPlayerFaces.mjs --clubId=<id> --source-file=data/uploads/montverd/S1.json
 *   node scripts/auditAndPatchPlayerFaces.mjs --clubId=<id> --source-file=data/uploads/montverd/S1.json --write
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

const FACE_BASE  = 'https://fifa-img.michaelmenda92.workers.dev'

// ─── CLI ─────────────────────────────────────────────────────────────────────

const WRITE = process.argv.includes('--write')

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

if (!args.clubId) {
  console.error('\n✗ --clubId=<id> is required\n')
  console.error('  Example: node scripts/auditAndPatchPlayerFaces.mjs --clubId=xhAwkYVCNY8nGLqIiU5X')
  console.error('  Add --source-file=data/uploads/montverd/S1.json to cross-reference a season JSON.\n')
  process.exit(1)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normName(raw) {
  return (raw ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function faceUrl(sofifaId) {
  return sofifaId ? `${FACE_BASE}/${sofifaId}` : '(none)'
}

function isMissing(v) {
  return v == null || v === 0 || v === '' || v === '0'
}

function header(t) {
  console.log('\n' + '─'.repeat(72))
  console.log('  ' + t)
  console.log('─'.repeat(72))
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`  auditAndPatchPlayerFaces — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Club ID     : ${args.clubId}`)
  console.log(`  Source file : ${args['source-file'] ?? '(none — audit only)'}`)
  console.log('══════════════════════════════════════════════════════════════════════')

  const db = initFirebase()

  // ── Verify club exists ───────────────────────────────────────────────────────
  const clubSnap = await db.collection('clubs').doc(args.clubId).get()
  if (!clubSnap.exists) {
    console.error(`\n✗ No club found with id: "${args.clubId}"\n`)
    process.exit(1)
  }
  const club = { id: clubSnap.id, ...clubSnap.data() }
  console.log(`\n  Club        : ${club.name}  (${club.id})`)

  // ── Load Firestore player docs for this club ─────────────────────────────────
  console.log('  Loading player docs from Firestore…')
  const playersSnap = await db.collection('players').where('clubId', '==', club.id).get()
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  Found ${players.length} player doc(s) for this club.\n`)

  if (players.length === 0) {
    console.log('  No players found for this club. Nothing to audit.\n')
    process.exit(0)
  }

  // ── Load source JSON if supplied ─────────────────────────────────────────────
  // Build a normName → sofifaId map from every playerStats entry in the JSON.
  // Multiple seasons can be supplied (the script reads only playerStats[].sofifaId).
  const sourceSofifaById = new Map()   // normName → sofifaId (number)
  let sourceFile = null

  if (args['source-file']) {
    try {
      const raw = JSON.parse(readFileSync(resolve(process.cwd(), args['source-file']), 'utf8'))
      sourceFile = args['source-file']

      // Accept either a single season JSON { playerStats: [...] }
      // or an array of season JSONs [ { playerStats: [...] }, ... ]
      const seasons = Array.isArray(raw) ? raw : [raw]
      for (const s of seasons) {
        for (const entry of (s.playerStats ?? [])) {
          if (entry.sofifaId != null && entry.sofifaId !== 0 && entry.name) {
            const key = normName(entry.name)
            // First occurrence wins if the same player appears across multiple seasons
            if (!sourceSofifaById.has(key)) {
              sourceSofifaById.set(key, Number(entry.sofifaId))
            }
          }
        }
      }
      console.log(`  Source JSON : ${sourceFile}  (${sourceSofifaById.size} player(s) with sofifaId)\n`)
    } catch (e) {
      console.error(`\n✗ Could not read/parse source file: ${e.message}\n`)
      process.exit(1)
    }
  }

  // ── Build audit rows ──────────────────────────────────────────────────────────

  // Each row: { player, fsId, srcId, status, willPatch }
  // status: 'MATCH' | 'PATCH NEEDED' | 'VERIFY' | 'SOURCE MISSING' | 'NO SOURCE'
  const rows = []

  for (const p of players.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))) {
    const fsId  = isMissing(p.sofifaId) ? null : Number(p.sofifaId)
    const key   = normName(p.name)
    const srcId = sourceFile ? (sourceSofifaById.get(key) ?? null) : undefined  // undefined = no source file

    let status, willPatch

    if (!sourceFile) {
      // No source file — can only report what's in Firestore
      status    = isMissing(p.sofifaId) ? 'NULL IN FIRESTORE' : 'NO SOURCE'
      willPatch = false
    } else if (srcId == null) {
      // Source file provided but this player not found in it
      status    = 'SOURCE MISSING'
      willPatch = false
    } else if (fsId === srcId) {
      // IDs match
      status    = 'MATCH'
      willPatch = false
    } else if (isMissing(p.sofifaId)) {
      // Firestore is null/zero, source has a value → safe to patch
      status    = 'PATCH NEEDED'
      willPatch = true
    } else {
      // Both have values but they differ → flag for review; still patch on --write
      // (source JSON is assumed to be the verified ground truth when supplied)
      status    = 'VERIFY'
      willPatch = true
    }

    rows.push({ player: p, fsId, srcId, status, willPatch })
  }

  // ── Print audit table ─────────────────────────────────────────────────────────

  header('Player Identity Audit')

  const COL = { name: 28, fsId: 12, srcId: 12, url: 46, status: 16 }
  const pad = (s, n) => String(s ?? '(null)').padEnd(n)

  // Header row
  console.log(
    '  ' +
    pad('Name', COL.name) +
    pad('FS sofifaId', COL.fsId) +
    pad('SRC sofifaId', COL.srcId) +
    pad('Expected Face URL', COL.url) +
    'Status'
  )
  console.log('  ' + '─'.repeat(COL.name + COL.fsId + COL.srcId + COL.url + COL.status))

  for (const r of rows) {
    const mark =
      r.status === 'MATCH'          ? '✓' :
      r.status === 'NO SOURCE'      ? '–' :
      r.status === 'SOURCE MISSING' ? '–' :
      r.status === 'PATCH NEEDED'   ? '✗' :
      r.status === 'VERIFY'         ? '⚠' :
      r.status === 'NULL IN FIRESTORE' ? '✗' : '?'

    const displayFsId  = r.fsId  != null ? String(r.fsId)  : '(null)'
    const displaySrcId = r.srcId != null ? String(r.srcId) :
                         r.srcId === undefined ? '—' : '(null)'

    // Show the URL we expect after the patch (source ID if patching, FS ID otherwise)
    const effectiveId  = r.willPatch ? r.srcId : r.fsId
    const displayUrl   = effectiveId ? `${FACE_BASE}/${effectiveId}` : '(no face)'

    console.log(
      `  ${mark} ` +
      pad(r.player.name, COL.name - 2) + '  ' +
      pad(displayFsId, COL.fsId) +
      pad(displaySrcId, COL.srcId) +
      pad(displayUrl, COL.url) +
      r.status
    )
  }

  // ── Summary by category ───────────────────────────────────────────────────────

  header('Summary')

  const byStatus = (s) => rows.filter(r => r.status === s)
  const match         = byStatus('MATCH')
  const patchNeeded   = byStatus('PATCH NEEDED')
  const verify        = byStatus('VERIFY')
  const sourceMissing = byStatus('SOURCE MISSING')
  const noSource      = byStatus('NO SOURCE')
  const nullInFs      = byStatus('NULL IN FIRESTORE')
  const willPatch     = rows.filter(r => r.willPatch)

  console.log()
  console.log(`  Total players          : ${rows.length}`)
  console.log(`  MATCH (no change)      : ${match.length}`)
  if (patchNeeded.length > 0)
    console.log(`  PATCH NEEDED (null→src): ${patchNeeded.length}  ✗  will be patched on --write`)
  if (verify.length > 0) {
    console.log(`  VERIFY (FS≠SRC)        : ${verify.length}  ⚠  will be patched on --write (source assumed authoritative)`)
    console.log('    These players have non-null Firestore sofifaId that differs from the source JSON.')
    console.log('    Verify the source JSON sofifaId on sofifa.com before running --write.')
    verify.forEach(r =>
      console.log(`      ${r.player.name}  FS:${r.fsId}  SRC:${r.srcId}`)
    )
  }
  if (sourceMissing.length > 0) {
    console.log(`  SOURCE MISSING         : ${sourceMissing.length}  (player not in source JSON — no patch)`)
    sourceMissing.forEach(r => console.log(`    ${r.player.name}  FS sofifaId: ${r.fsId ?? '(null)'}  face: ${faceUrl(r.fsId)}`))
  }
  if (noSource.length > 0) {
    console.log(`  NO SOURCE              : ${noSource.length}  (Firestore has sofifaId — no source to compare)`)
  }
  if (nullInFs.length > 0) {
    console.log(`  NULL IN FIRESTORE      : ${nullInFs.length}  ✗  (no source file — cannot auto-patch; supply --source-file)`)
    nullInFs.forEach(r => console.log(`    ${r.player.name}`))
  }

  console.log()
  if (!sourceFile) {
    console.log('  ℹ  No source file supplied. Re-run with --source-file to enable patching.')
    console.log('     Example: --source-file=data/uploads/montverd/S1.json\n')
  } else if (willPatch.length === 0) {
    console.log('  ✅  All players with source data are already correct. No patches needed.\n')
  } else {
    console.log(`  ${WRITE ? '⚠️ ' : 'Dry-run:'} ${willPatch.length} sofifaId patch(es) ${WRITE ? 'will be' : 'would be'} applied.`)
    if (!WRITE) {
      console.log('  Review the VERIFY rows above, then run with --write to apply.\n')
    }
  }

  // ── Dry-run exit ──────────────────────────────────────────────────────────────
  if (!WRITE) {
    console.log('══════════════════════════════════════════════════════════════════════')
    console.log('  Dry run complete. No data was written.')
    if (willPatch.length > 0)
      console.log(`  Run with --write to apply ${willPatch.length} patch(es).`)
    console.log('══════════════════════════════════════════════════════════════════════\n')
    return
  }

  // ── Write gate ────────────────────────────────────────────────────────────────
  if (willPatch.length === 0) {
    console.log('══════════════════════════════════════════════════════════════════════')
    console.log('  Nothing to patch. Exiting without writes.')
    console.log('══════════════════════════════════════════════════════════════════════\n')
    return
  }

  // ── Apply patches ─────────────────────────────────────────────────────────────
  header('Applying Patches')
  console.log()

  // Use batched writes — max 500 ops per batch; each patch is 1 op.
  // For face patches a single season has ~20-40 players — well within limit.
  // If ever > 490 players, this would need batching; guard is included.
  if (willPatch.length >= 490) {
    console.error(`  ✗ ${willPatch.length} patches exceeds the safe single-batch limit (490).`)
    console.error('  Contact the developer to add multi-batch support.\n')
    process.exit(1)
  }

  const batch = db.batch()
  let opCount = 0

  for (const r of willPatch) {
    const ref = db.collection('players').doc(r.player.id)
    batch.update(ref, { sofifaId: r.srcId })
    opCount++
    console.log(`  → ${r.player.name.padEnd(32)}  sofifaId: ${r.fsId ?? '(null)'} → ${r.srcId}`)
  }

  console.log()
  console.log(`  Committing ${opCount} sofifaId update(s) atomically…`)
  try {
    await batch.commit()
  } catch (err) {
    console.error(`\n  ✗ Batch commit FAILED. Firestore is unchanged.`)
    console.error(`  Error: ${err.message}\n`)
    process.exit(1)
  }
  console.log(`  ✅ Batch committed. ${opCount} player doc(s) patched.`)

  // ── Post-write verification ───────────────────────────────────────────────────
  header('Post-Write Verification')
  console.log()

  const postSnap = await db.collection('players').where('clubId', '==', club.id).get()
  const postDocs = new Map(postSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))

  let allPass = true
  for (const r of willPatch) {
    const live = postDocs.get(r.player.id)
    if (!live) {
      console.log(`  ✗  ${r.player.name.padEnd(32)}  doc not found post-write`)
      allPass = false
      continue
    }
    const liveId = live.sofifaId != null ? Number(live.sofifaId) : null
    if (liveId === r.srcId) {
      console.log(`  ✓  ${r.player.name.padEnd(32)}  sofifaId: ${liveId}  ${faceUrl(liveId)}`)
    } else {
      console.log(`  ✗  ${r.player.name.padEnd(32)}  expected ${r.srcId} but live is ${liveId}`)
      allPass = false
    }
  }

  console.log('\n' + '══════════════════════════════════════════════════════════════════════')
  if (allPass) {
    console.log(`  ✅  Patch complete. ${opCount} player(s) updated.`)
    console.log('  Player faces should now resolve correctly in the app.')
    console.log('  Run validateDataHealth.mjs to confirm full data health.')
  } else {
    console.log('  ⚠   Patch applied but post-write verification found discrepancies.')
    console.log('  Run validateDataHealth.mjs immediately to diagnose.')
    process.exit(1)
  }
  console.log('══════════════════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
