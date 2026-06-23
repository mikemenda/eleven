/**
 * seedAllCompsStats.mjs
 *
 * Creates scope:'ALL' seasonStats collection docs from the embedded
 * player.seasonStats[] array on each player document.
 *
 * Background:
 *   The seasonStats collection currently only contains scope:'UCL' docs
 *   (seeded by seedUclS2S3.mjs for S2 and S3). There are no scope:'ALL'
 *   docs. The embedded player.seasonStats[] array is the existing working
 *   source of per-season all-comps stats.
 *
 *   This script reads those embedded entries and creates the matching
 *   collection docs, making the collection the canonical source for all
 *   pages (as approved in the Phase 0 data contract).
 *
 * Design:
 *   - Source:  player.seasonStats[] embedded array on player docs
 *   - Target:  seasonStats collection, one doc per (playerId, seasonId), scope:'ALL'
 *   - UCL sub-fields (uclApps, uclGoals, …) are NOT copied — those belong
 *     on scope:'UCL' docs and are handled by a separate script.
 *   - Resolves seasonId by joining on the season label.
 *   - Checks (playerId, seasonId, scope:'ALL') uniqueness before writing.
 *   - Never overwrites existing docs. Skips any that already exist.
 *   - Idempotent — safe to rerun at any time.
 *
 * Club scoping:
 *   - Pass --clubId=<id> to target a specific club.
 *   - If omitted, auto-detects only when exactly one club exists.
 *   - If multiple clubs exist, stops and asks for --clubId.
 *   - Never hardcodes any club ID.
 *
 * Usage:
 *   node scripts/seedAllCompsStats.mjs                     # dry-run (default)
 *   node scripts/seedAllCompsStats.mjs --clubId=<id>       # specify club
 *   node scripts/seedAllCompsStats.mjs --verbose           # show skip detail
 *   node scripts/seedAllCompsStats.mjs '--write'           # apply writes
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

// ─── CLI ─────────────────────────────────────────────────────────────────────

const WRITE   = process.argv.includes('--write')
const VERBOSE = process.argv.includes('--verbose')

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

// ─── Club resolution ─────────────────────────────────────────────────────────

async function resolveClub(db, providedId) {
  if (providedId) {
    const snap = await db.collection('clubs').doc(providedId).get()
    if (!snap.exists) {
      console.error(`\n✗ No club found with id: "${providedId}"\n`)
      process.exit(1)
    }
    return { id: snap.id, ...snap.data() }
  }

  const snap = await db.collection('clubs').get()
  if (snap.empty) {
    console.error('\n✗ No clubs found in Firestore.\n')
    process.exit(1)
  }
  if (snap.docs.length > 1) {
    console.error('\n✗ Multiple clubs found. Pass --clubId=<id> to specify which club.\n')
    snap.docs.forEach(d => console.error(`     ${d.id}  "${d.data().name}"`))
    console.error()
    process.exit(1)
  }
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function header(t) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + t)
  console.log('─'.repeat(62))
}

function row(l, v) { console.log(`  ${l.padEnd(44)} ${v}`) }

function safe(n) {
  if (n == null || n === undefined) return null
  const num = Number(n)
  return isNaN(num) ? null : num
}

// Returns true if the player's position string includes 'GK'
function isGKPosition(posStr) {
  if (!posStr) return false
  return posStr.split(/[,/]+/).map(p => p.trim()).includes('GK')
}

// Compute stored per-game rate fields from raw counts.
// Returns only the fields that are applicable (e.g. csPerGame for GK only).
function computeRates(apps, goals, assists, cleanSheets, isGK) {
  const ap = safe(apps)   ?? 0
  const g  = safe(goals)  ?? 0
  const a  = safe(assists) ?? 0
  const cs = safe(cleanSheets)
  const rates = {}
  if (ap > 0) {
    if (!isGK) {
      rates.gPerGame = parseFloat((g / ap).toFixed(2))
      rates.aPerGame = parseFloat((a / ap).toFixed(2))
      rates.cPerGame = parseFloat(((g + a) / ap).toFixed(2))
    }
    if (isGK && cs != null) {
      rates.csPerGame = parseFloat((cs / ap).toFixed(2))
    }
  }
  return rates
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  console.log('\n══════════════════════════════════════════════════════════')
  console.log(`  seedAllCompsStats — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log('══════════════════════════════════════════════════════════')

  const club = await resolveClub(db, args.clubId)

  console.log(`\n  Club  : ${club.name}`)
  console.log(`  ID    : ${club.id}`)
  console.log(`  Mode  : ${WRITE ? 'WRITE — will create Firestore docs' : 'DRY RUN — no writes'}`)

  // ── 1. Load seasons → label-to-seasonId map ──────────────────────────────

  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', club.id)
    .get()

  const labelToSeasonId = new Map() // label → seasonId
  const seasonIdToLabel = new Map() // seasonId → label

  for (const d of seasonsSnap.docs) {
    const label = d.data().label
    if (label) {
      labelToSeasonId.set(label, d.id)
      seasonIdToLabel.set(d.id, label)
    }
  }

  if (labelToSeasonId.size === 0) {
    console.log('\n  No seasons found for this club. Nothing to seed.\n')
    return
  }

  const seasonIdSet = new Set(labelToSeasonId.values())

  console.log(`\n  Seasons found: ${labelToSeasonId.size}`)
  for (const [label, id] of [...labelToSeasonId.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  )) {
    console.log(`    ${label.padEnd(4)}  (${id})`)
  }

  // ── 2. Load all players for this club ────────────────────────────────────

  const playersSnap = await db.collection('players')
    .where('clubId', '==', club.id)
    .get()

  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`\n  Players loaded: ${players.length}`)

  // ── 3. Load existing scope:'ALL' docs for duplicate detection ─────────────
  //
  // Load all seasonStats docs and filter by our season ID set.
  // We do NOT filter by clubId here — we scope by seasonId to avoid the
  // corrupted-clubId issue.

  const ssSnap = await db.collection('seasonStats').get()

  // Existing unique keys for scope:ALL docs belonging to this club
  const existingAllKeys = new Set()
  for (const d of ssSnap.docs) {
    const data = d.data()
    if (data.scope === 'ALL' && seasonIdSet.has(data.seasonId) && data.playerId) {
      existingAllKeys.add(`${data.playerId}|${data.seasonId}`)
    }
  }

  console.log(`  Existing scope:'ALL' docs for this club: ${existingAllKeys.size}`)

  // ── 4. Build the write plan ───────────────────────────────────────────────

  const toCreate   = []   // will be created
  const toSkip     = []   // already exist — skip
  const warnings   = []   // problems that prevent seeding a specific entry

  for (const player of players) {
    const embedded = Array.isArray(player.seasonStats) ? player.seasonStats : []
    if (embedded.length === 0) continue

    const isGK = isGKPosition(player.position)

    for (const entry of embedded) {
      const label = entry.label

      // ── Validate embedded entry ─────────────────────────────────────────
      if (!label) {
        warnings.push(`${player.name}: embedded seasonStats entry has no label — skipped`)
        continue
      }
      const seasonId = labelToSeasonId.get(label)
      if (!seasonId) {
        warnings.push(`${player.name}: embedded label "${label}" has no matching season doc — skipped`)
        continue
      }

      // ── Duplicate check ─────────────────────────────────────────────────
      const key = `${player.id}|${seasonId}`
      if (existingAllKeys.has(key)) {
        toSkip.push({ player, label, seasonId })
        continue
      }

      // ── Build doc shape ─────────────────────────────────────────────────
      //
      // Matches the Phase 0 data contract for scope:'ALL' docs.
      // UCL sub-fields (uclApps, uclGoals, etc.) are intentionally NOT
      // copied — those belong on scope:'UCL' docs.

      const apps        = safe(entry.apps)          ?? 0
      const goals       = isGK ? 0 : (safe(entry.goals)   ?? 0)
      const assists     = isGK ? 0 : (safe(entry.assists)  ?? 0)
      const cleanSheets = isGK ? (safe(entry.cleanSheets) ?? null) : null
      const avgRating   = safe(entry.averageRating) ?? null

      const rates = computeRates(apps, goals, assists, cleanSheets, isGK)

      const docData = {
        // ── Identity ────────────────────────────────────────────────────
        playerId:     player.id,
        clubId:       club.id,       // always the correct ID from Firestore
        seasonId,
        scope:        'ALL',
        label,                       // convenience cache — season doc is authoritative
        playerName:   player.name,   // convenience cache for debugging / audit scripts

        // ── Core stats ──────────────────────────────────────────────────
        isGK,
        apps,
        goals,
        assists,
        cleanSheets,
        averageRating: avgRating,

        // ── Derived per-game rates ───────────────────────────────────────
        // Recomputed from raw counts — never copied from the embedded array
        // in case the stored rates were calculated with different rounding.
        gPerGame:  rates.gPerGame  ?? null,
        aPerGame:  rates.aPerGame  ?? null,
        cPerGame:  rates.cPerGame  ?? null,
        csPerGame: rates.csPerGame ?? null,
      }

      toCreate.push({ player, label, seasonId, key, docData })
    }
  }

  // ── 5. Print plan ────────────────────────────────────────────────────────

  header('Seed Plan')
  console.log()
  row('Docs to create',                   String(toCreate.length))
  row('Docs to skip (already exist)',      String(toSkip.length))
  row('Warnings (entries that cannot seed)', String(warnings.length))

  if (warnings.length > 0) {
    console.log('\n  Warnings:')
    for (const w of warnings) console.log(`    ⚠  ${w}`)
  }

  if (toSkip.length > 0) {
    if (VERBOSE) {
      console.log('\n  Skipped (already exist):')
      for (const s of toSkip.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }) ||
        a.player.name.localeCompare(b.player.name)
      )) {
        console.log(`    ${s.player.name.padEnd(28)} ${s.label}  — already exists`)
      }
    } else {
      console.log(`\n  Skipped: ${toSkip.length} doc(s) already exist. (Pass --verbose to list them.)`)
    }
  }

  if (toCreate.length === 0) {
    console.log('\n  ✓ Nothing to seed — all docs already exist.')
    console.log('\n══════════════════════════════════════════════════════════')
    console.log('  Done. No data was written.')
    console.log('══════════════════════════════════════════════════════════\n')
    return
  }

  // Group by season for readable output
  const byLabel = {}
  for (const item of toCreate) {
    if (!byLabel[item.label]) byLabel[item.label] = []
    byLabel[item.label].push(item)
  }

  for (const label of Object.keys(byLabel).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )) {
    const items = byLabel[label]
    console.log(`\n  ${label}  —  ${items.length} doc(s) to create`)

    // Sort: GK last, then alphabetical by name
    items.sort((a, b) => {
      if (a.docData.isGK !== b.docData.isGK) return a.docData.isGK ? 1 : -1
      return a.player.name.localeCompare(b.player.name)
    })

    for (const { player, docData } of items) {
      const pos  = (player.position ?? '?').padEnd(10)
      const stub = player.isHistoricalStub ? '[STUB]  ' : '        '
      if (docData.isGK) {
        console.log(`    ${stub}${player.name.padEnd(28)} ${pos} apps:${String(docData.apps).padStart(3)}  cs:${docData.cleanSheets != null ? String(docData.cleanSheets).padStart(2) : ' —'}`)
      } else {
        const avg = docData.averageRating != null ? docData.averageRating.toFixed(1) : '—'
        console.log(`    ${stub}${player.name.padEnd(28)} ${pos} apps:${String(docData.apps).padStart(3)}  g:${String(docData.goals).padStart(3)}  a:${String(docData.assists).padStart(3)}  avg:${avg}`)
      }
    }
  }

  // ── 6. Dry-run exit ───────────────────────────────────────────────────────

  if (!WRITE) {
    console.log('\n' + '─'.repeat(62))
    console.log(`  DRY RUN complete.`)
    console.log(`  ${toCreate.length} doc(s) would be created.`)
    console.log(`  ${toSkip.length} doc(s) would be skipped (already exist).`)
    console.log("  Run with '--write' to apply.")
    console.log('══════════════════════════════════════════════════════════\n')
    return
  }

  // ── 7. Write docs ────────────────────────────────────────────────────────

  header('Creating Docs')
  console.log()

  let successCount = 0
  let skippedCount = 0
  let errorCount   = 0

  for (const { player, label, docData } of toCreate) {
    const nm = player.name.padEnd(28)
    try {
      await db.collection('seasonStats').add(docData)
      console.log(`  ✓  ${nm}  ${label}`)
      successCount++
    } catch (err) {
      console.error(`  ✗  ${nm}  ${label}  ERROR: ${err.message}`)
      errorCount++
    }
  }

  header('Write Summary')
  console.log()
  row('Created',                     String(successCount))
  row('Skipped (already existed)',   String(toSkip.length + skippedCount))
  row('Errors',                      errorCount > 0 ? `${errorCount}  ✗` : '0')

  if (errorCount === 0) {
    console.log('\n  ✓ Seed complete.')
    console.log('  Run auditSeasonStats.mjs to verify coverage.')
  } else {
    console.log('\n  ⚠ Some docs failed to create.')
    console.log('  Safe to rerun — idempotent. Existing docs will be skipped.')
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log(`  Done. ${successCount} doc(s) created.`)
  console.log('══════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
