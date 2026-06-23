/**
 * auditPlayerPositions.mjs
 *
 * Dry-run audit of player.position field values.
 * Reports: unique positions, multi-position players, format inconsistencies,
 * players that may need manual review.
 * Never writes to Firestore.
 *
 * Usage:
 *   node scripts/auditPlayerPositions.mjs
 *   node scripts/auditPlayerPositions.mjs --verbose   (show all players per position)
 *
 * Requires serviceAccountKey.json at project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const admin = require('firebase-admin')

const VERBOSE   = process.argv.includes('--verbose')
const KEY_PATH  = resolve(__dirname, '../serviceAccountKey.json')

// ─── Known valid single positions ────────────────────────────────────────────
// These are the position codes the app uses. Anything outside this set is flagged.

const KNOWN_POSITIONS = new Set([
  'GK',
  'CB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM',
  'LW', 'RW', 'CF', 'ST',
])

// Separators the app already handles in splitPositions(): comma, slash
// We also detect other separators that might have slipped in (hyphen, pipe, space-only)
const SEPARATOR_RE = /[,\/\|\-]/

// ─── Init ─────────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  return admin.firestore()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function header(title) {
  const line = '─'.repeat(60)
  console.log(`\n${line}`)
  console.log(`  ${title}`)
  console.log(line)
}

function row(label, value) {
  console.log(`  ${label.padEnd(40)} ${value}`)
}

// Split position string into individual codes using the app's existing logic.
// Handles: "CM", "CM, CAM", "CM,CAM", "CM / CAM", "CM/CAM"
function splitPositions(posStr) {
  if (!posStr) return []
  return posStr.split(/[,\/]+/).map(p => p.trim()).filter(Boolean)
}

// Detect separator style used in a position string
function detectSeparator(posStr) {
  if (/,/.test(posStr))   return 'comma'
  if (/\//.test(posStr))  return 'slash'
  if (/\|/.test(posStr))  return 'pipe'
  if (/-/.test(posStr))   return 'hyphen'
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  // ── Load club ──────────────────────────────────────────────────────────────
  const clubsSnap = await db.collection('clubs').get()
  const clubs = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  if (clubs.length === 0) {
    console.error('No clubs found. Check Firestore connection.')
    process.exit(1)
  }

  const club = clubs.find(c => /richport/i.test(c.name)) || clubs[0]
  console.log(`\n  Club: ${club.name} (${club.id})`)

  // ── Load all players ───────────────────────────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', club.id)
    .get()
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION A — Raw position value inventory
  // ─────────────────────────────────────────────────────────────────────────────

  header('A — Raw position Field Inventory')

  // Count every unique raw position string exactly as stored
  const rawValueCounts = {}
  const missingPosition = []

  for (const p of players) {
    const pos = p.position
    if (!pos || pos.trim() === '') {
      missingPosition.push(p)
    } else {
      rawValueCounts[pos] = (rawValueCounts[pos] || 0) + 1
    }
  }

  row('Total players', players.length)
  row('Players with missing/empty position', missingPosition.length)
  row('Unique raw position values', Object.keys(rawValueCounts).length)

  console.log('\n  All unique position values (raw, as stored in Firestore):\n')
  const sortedValues = Object.entries(rawValueCounts).sort((a, b) => b[1] - a[1])
  for (const [val, count] of sortedValues) {
    const parts = splitPositions(val)
    const allKnown = parts.every(p => KNOWN_POSITIONS.has(p))
    const multi    = parts.length > 1
    const tag = multi ? ' ← multi' : (!allKnown ? ' ← UNKNOWN code' : '')
    const valDisplay = `"${val}"`.padEnd(26)
    console.log(`    ${valDisplay} × ${String(count).padStart(2)} player(s)${tag}`)
  }

  if (missingPosition.length > 0) {
    console.log('\n  Players with missing position:')
    for (const p of missingPosition) {
      console.log(`    ${p.name.padEnd(28)} status: ${p.status || '(none)'}  id: ${p.id}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION B — Multi-position players (already stored as multi)
  // ─────────────────────────────────────────────────────────────────────────────

  header('B — Players Already Stored With Multiple Positions')

  const multiPos = players.filter(p => {
    const parts = splitPositions(p.position)
    return parts.length > 1
  })

  if (multiPos.length === 0) {
    console.log('  No players currently have multiple positions stored.')
  } else {
    console.log(`  ${multiPos.length} player(s) with multiple positions:\n`)
    for (const p of multiPos) {
      const parts = splitPositions(p.position)
      const sep   = detectSeparator(p.position)
      const allKnown = parts.every(x => KNOWN_POSITIONS.has(x))
      const warn  = !allKnown ? '  ⚠ unknown code' : ''
      console.log(`    ${p.name.padEnd(28)} "${p.position}"  (${parts.length} parts, sep: ${sep})${warn}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION C — Separator format consistency
  // Goal: establish whether the codebase uses comma or slash.
  // The app's splitPositions() handles both, but we should standardise.
  // ─────────────────────────────────────────────────────────────────────────────

  header('C — Separator Format Analysis')

  let commaCount  = 0
  let slashCount  = 0
  let pipeCount   = 0
  let hyphenCount = 0

  for (const p of players) {
    if (!p.position) continue
    const sep = detectSeparator(p.position)
    if (sep === 'comma')  commaCount++
    if (sep === 'slash')  slashCount++
    if (sep === 'pipe')   pipeCount++
    if (sep === 'hyphen') hyphenCount++
  }

  row('Using comma separator  (e.g. "CM, CAM")', commaCount)
  row('Using slash separator  (e.g. "CM/CAM")',  slashCount)
  row('Using pipe separator   (e.g. "CM|CAM")',  pipeCount)
  row('Using hyphen separator (e.g. "CM-CAM")',  hyphenCount)

  const hasInconsistency = (commaCount > 0 && slashCount > 0) || pipeCount > 0 || hyphenCount > 0
  if (hasInconsistency) {
    console.log('\n  ⚠ Mixed separators detected. Recommend standardising on comma+space: "CM, CAM"')
    console.log('    The app\'s splitPositions() already handles both comma and slash,')
    console.log('    but consistent storage prevents future confusion.')
  } else if (commaCount > 0) {
    console.log('\n  ✓ All multi-position values use comma separator.')
  } else if (slashCount > 0) {
    console.log('\n  ✓ All multi-position values use slash separator.')
    console.log('    Consider migrating to comma+space ("CM, CAM") for readability.')
  } else {
    console.log('\n  No multi-position values found — no separator issues.')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION D — Unknown position codes
  // ─────────────────────────────────────────────────────────────────────────────

  header('D — Unknown Position Codes')

  const unknownCodePlayers = []
  for (const p of players) {
    const parts = splitPositions(p.position)
    const unknown = parts.filter(x => !KNOWN_POSITIONS.has(x))
    if (unknown.length > 0) {
      unknownCodePlayers.push({ player: p, unknown })
    }
  }

  if (unknownCodePlayers.length === 0) {
    console.log('  ✓ All position codes are within the known set.\n')
  } else {
    console.log(`  ${unknownCodePlayers.length} player(s) with unrecognised position codes:\n`)
    for (const { player, unknown } of unknownCodePlayers) {
      console.log(`    ${player.name.padEnd(28)} "${player.position}"  unknown: [${unknown.join(', ')}]`)
    }
    console.log()
    console.log('  Known codes:', [...KNOWN_POSITIONS].join(', '))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION E — Players that may need manual position review
  // Flags based on heuristics — these are suggestions, not definitive errors.
  // ─────────────────────────────────────────────────────────────────────────────

  header('E — Players That May Need Manual Review')

  console.log('  These are heuristic flags only. You decide whether to update.')
  console.log('  All changes should go through a dry-run update script first.\n')

  const toReview = []

  for (const p of players) {
    const pos   = (p.position || '').trim()
    const parts = splitPositions(pos)
    const reasons = []

    // Single-position players who are commonly multi-pos in career mode
    // (conservative list — only flag very common multi-position roles)
    const commonMulti = {
      'CAM': ['CAM, CM', 'CAM, LW', 'CAM, RW'],
      'CM':  ['CM, CAM', 'CM, CDM'],
      'CDM': ['CDM, CM'],
      'LW':  ['LW, LM', 'LW, CAM'],
      'RW':  ['RW, RM', 'RW, CAM'],
      'ST':  ['ST, CF'],
      'CF':  ['CF, ST', 'CF, CAM'],
      'LM':  ['LM, LW'],
      'RM':  ['RM, RW'],
      'LB':  ['LB, LWB'],
      'RB':  ['RB, RWB'],
    }

    if (parts.length === 1 && commonMulti[parts[0]]) {
      reasons.push(`Single "${parts[0]}" — commonly also plays: ${commonMulti[parts[0]].join(' or ')}`)
    }

    // Veteran players (many apps) stored as a single attacking position
    // are worth double-checking since career mode often unlocks new roles
    const apps = p.apps || 0
    if (apps >= 100 && parts.length === 1 && ['ST','LW','RW','CAM','CF'].includes(parts[0])) {
      reasons.push(`${apps} career apps — worth confirming no secondary position unlocked`)
    }

    if (reasons.length > 0) {
      toReview.push({ player: p, reasons })
    }
  }

  if (toReview.length === 0) {
    console.log('  No players flagged for manual review.\n')
  } else {
    for (const { player, reasons } of toReview) {
      console.log(`  ── ${player.name} (${player.position || 'NO POSITION'})  apps: ${player.apps || 0}`)
      for (const r of reasons) {
        console.log(`     • ${r}`)
      }
      console.log()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION F — Recommended format + update approach
  // ─────────────────────────────────────────────────────────────────────────────

  header('F — Recommended Format & Update Approach')

  console.log(`
  RECOMMENDED POSITION FORMAT
  ───────────────────────────
  Use: "CM, CAM"  (comma + space, uppercase codes)
  - Matches how the app's splitPositions() already parses values
  - Human-readable in Firestore console
  - Consistent with the KNOWN_POSITIONS code set above
  - No new app-owned fields needed — player.position is the source of truth

  SAFEST UPDATE APPROACH
  ──────────────────────
  Do NOT bulk-update position values with a write script yet.
  Instead, for each player you want to update:

  1. Run this audit to confirm the current value.
  2. Decide the correct value manually (you own the save data, not the script).
  3. Prepare a targeted list: { playerId, currentPosition, newPosition }
  4. We build a dry-run "patchPlayerPositions.mjs" that reads the list, prints
     what it would write, and only executes with --write flag.
  5. You review the dry-run output, then approve --write.

  This is the same pattern used for all prior backfill/patch scripts.
  No position should be inferred automatically from sofifaId or any external source.
`)

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION G — Full player list (verbose only)
  // ─────────────────────────────────────────────────────────────────────────────

  if (VERBOSE) {
    header('G — Full Player Position List (verbose)')
    console.log()
    const sorted = [...players].sort((a, b) => (a.position || 'ZZZ').localeCompare(b.position || 'ZZZ'))
    for (const p of sorted) {
      const pos    = p.position || '(none)'
      const parts  = splitPositions(p.position)
      const multi  = parts.length > 1 ? ' ←' : ''
      console.log(`    ${p.name.padEnd(28)} "${pos}"${multi}`)
    }
    console.log()
  }

  header('Summary')
  console.log('  This was a read-only audit. No data was written.')
  console.log('  Run with --verbose to see the full player position list.')
  console.log()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
