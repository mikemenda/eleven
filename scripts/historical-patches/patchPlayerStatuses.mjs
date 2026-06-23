/**
 * patchPlayerStatuses.mjs
 *
 * Corrects player.status based on transfer history.
 * Dry-run by default. Pass --write to execute updates.
 *
 * Rules:
 *   - Latest transfer OUT → expected status: Sold
 *   - Latest transfer IN  → expected status: Active
 *   - No transfer history → skip (do not guess)
 *   - Ambiguous history   → skip (flag for manual review)
 *   - Already correct     → skip (no write needed)
 *
 * Usage:
 *   node scripts/patchPlayerStatuses.mjs           (dry run — prints only)
 *   node scripts/patchPlayerStatuses.mjs --write   (executes Firestore updates)
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

const WRITE     = process.argv.includes('--write')
const KEY_PATH  = resolve(__dirname, '../serviceAccountKey.json')

const VALID_DIRECTIONS = new Set(['IN', 'OUT'])
const VALID_STATUSES   = new Set(['Active', 'Sold', 'Loaned'])

// ─── Init ─────────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  return admin.firestore()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seasonNum(label) {
  return parseInt((label || '').replace(/\D/g, ''), 10) || 0
}

function header(title) {
  const line = '─'.repeat(64)
  console.log(`\n${line}`)
  console.log(`  ${title}`)
  console.log(line)
}

function fmt(n) {
  if (!n) return 'Free/unknown'
  if (n >= 1e9) return `€${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1)}M`
  return `€${(n / 1e3).toFixed(0)}K`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log(WRITE
    ? '  ⚠  --write flag detected. Firestore updates WILL be executed.'
    : '  ℹ  Dry run. No data will be written. Pass --write to execute.')

  const db = initFirebase()

  // ── Load club ──────────────────────────────────────────────────────────────
  const clubsSnap = await db.collection('clubs').get()
  const clubs = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  if (clubs.length === 0) {
    console.error('\n  Fatal: no clubs found. Check Firestore connection.')
    process.exit(1)
  }
  const club = clubs.find(c => /richport/i.test(c.name)) || clubs[0]
  console.log(`\n  Club: ${club.name} (${club.id})`)

  // ── Load players ───────────────────────────────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', club.id)
    .get()
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  Players loaded: ${players.length}`)

  // ── Load transfers ─────────────────────────────────────────────────────────
  const transfersSnap = await db.collection('transfers')
    .where('clubId', '==', club.id)
    .get()
  const transfers = transfersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  Transfers loaded: ${transfers.length}`)

  // ── Load seasons (for label resolution) ───────────────────────────────────
  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', club.id)
    .get()
  const seasonLabelMap = new Map(
    seasonsSnap.docs.map(d => [d.id, d.data().label])
  )

  // ── Index transfers by playerId (preferred) and player name (fallback) ─────
  const byPlayerId   = {}   // playerId   → transfer[]
  const byPlayerName = {}   // lowercase  → transfer[]

  for (const t of transfers) {
    if (t.playerId) {
      if (!byPlayerId[t.playerId]) byPlayerId[t.playerId] = []
      byPlayerId[t.playerId].push(t)
    }
    // Also index by name regardless of playerId presence, as a secondary lookup
    const key = (t.player || '').trim().toLowerCase()
    if (key) {
      if (!byPlayerName[key]) byPlayerName[key] = []
      byPlayerName[key].push(t)
    }
  }

  function getPlayerTransfers(player) {
    // Prefer playerId index; fall back to name match
    const byId   = byPlayerId[player.id] || []
    const byName = byPlayerName[(player.name || '').trim().toLowerCase()] || []
    // Merge and deduplicate by transfer doc id
    const seen = new Set()
    const merged = []
    for (const t of [...byId, ...byName]) {
      if (!seen.has(t.id)) { seen.add(t.id); merged.push(t) }
    }
    return merged
  }

  function resolveLabel(t) {
    if (t.seasonId && seasonLabelMap.has(t.seasonId)) return seasonLabelMap.get(t.seasonId)
    if (t.season) return t.season
    return null
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Categorise every player
  // ─────────────────────────────────────────────────────────────────────────────

  const wouldUpdate    = []   // conflict — has clear expected status different from current
  const alreadyCorrect = []   // no change needed
  const skippedNoHistory = [] // no transfer docs at all
  const skippedAmbiguous = [] // transfer history present but cannot determine clear latest
  const manualReview     = [] // edge cases that need a human decision

  for (const player of players) {
    const allTransfers = getPlayerTransfers(player)

    // ── No transfer history: skip unconditionally ────────────────────────────
    if (allTransfers.length === 0) {
      skippedNoHistory.push({ player, reason: 'No transfer docs found' })
      continue
    }

    // ── Filter to transfers with valid direction ───────────────────────────────
    const validTransfers = allTransfers.filter(t => VALID_DIRECTIONS.has(t.direction))

    if (validTransfers.length === 0) {
      // Transfer docs exist but none have a valid direction — cannot proceed
      skippedAmbiguous.push({
        player,
        reason: `${allTransfers.length} transfer doc(s) found but none have a valid direction field`,
        transfers: allTransfers,
      })
      continue
    }

    // ── Resolve season labels ─────────────────────────────────────────────────
    // Transfers with no resolvable season label are ambiguous for ordering purposes.
    const labelled   = validTransfers.filter(t => resolveLabel(t) !== null)
    const unlabelled = validTransfers.filter(t => resolveLabel(t) === null)

    if (labelled.length === 0) {
      // All transfers have direction but none have a resolvable season — cannot order
      skippedAmbiguous.push({
        player,
        reason: `${validTransfers.length} transfer doc(s) with valid direction but no resolvable season label — cannot determine order`,
        transfers: validTransfers,
      })
      continue
    }

    if (unlabelled.length > 0) {
      // Some transfers have no season label — flag for manual review but still
      // proceed with the labelled ones, noting the gap.
      manualReview.push({
        player,
        reason: `${unlabelled.length} transfer doc(s) have no resolvable season label — ordering may be incomplete`,
        transfers: validTransfers,
        unlabelled,
      })
      // Fall through: we still attempt to determine status from the labelled subset.
      // If the result is unambiguous we include it in wouldUpdate/alreadyCorrect.
    }

    // ── Sort labelled transfers chronologically ───────────────────────────────
    // Within the same season: IN before OUT (signed first, sold later is the
    // normal career-mode pattern; this ordering means last=OUT if they were
    // sold in the same season they were signed, which is correct).
    const sorted = [...labelled].sort((a, b) => {
      const diff = seasonNum(resolveLabel(a)) - seasonNum(resolveLabel(b))
      if (diff !== 0) return diff
      if (a.direction === 'IN' && b.direction === 'OUT') return -1
      if (a.direction === 'OUT' && b.direction === 'IN') return 1
      return 0
    })

    // ── Check for same-season duplicate directions ────────────────────────────
    // Two OUT transfers in the same season, or two IN transfers in the same
    // season, are suspicious — flag for manual review instead of guessing.
    const lastSeason     = resolveLabel(sorted[sorted.length - 1])
    const inLastSeason   = sorted.filter(t => resolveLabel(t) === lastSeason)
    const directionsInLast = [...new Set(inLastSeason.map(t => t.direction))]

    if (directionsInLast.length > 1) {
      // Both IN and OUT in the same last season — genuinely ambiguous
      manualReview.push({
        player,
        reason: `Both IN and OUT transfers exist in ${lastSeason} — cannot determine final status`,
        transfers: sorted,
        unlabelled,
      })
      continue
    }

    const outCountInLast = inLastSeason.filter(t => t.direction === 'OUT').length
    if (outCountInLast > 1) {
      manualReview.push({
        player,
        reason: `${outCountInLast} OUT transfers in ${lastSeason} — duplicate records suspected`,
        transfers: sorted,
        unlabelled,
      })
      continue
    }

    // ── Determine expected status ─────────────────────────────────────────────
    const lastTransfer   = sorted[sorted.length - 1]
    const lastDir        = lastTransfer.direction
    const lastLabel      = resolveLabel(lastTransfer)
    const expectedStatus = lastDir === 'OUT' ? 'Sold' : 'Active'
    const currentStatus  = player.status

    // ── Compare and categorise ────────────────────────────────────────────────
    if (currentStatus === expectedStatus) {
      alreadyCorrect.push({ player, currentStatus, expectedStatus, lastTransfer, lastLabel })
    } else {
      wouldUpdate.push({ player, currentStatus, expectedStatus, lastTransfer, lastLabel, sorted })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REPORT
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Would update ─────────────────────────────────────────────────────────────
  header(`Would Update — ${wouldUpdate.length} player(s)`)

  if (wouldUpdate.length === 0) {
    console.log('  None. All players with transfer history have correct status.')
  } else {
    for (const entry of wouldUpdate) {
      const { player, currentStatus, expectedStatus, lastTransfer, lastLabel, sorted } = entry
      const from  = lastTransfer.from_club || '?'
      const to    = lastTransfer.to_club   || '?'
      const fee   = fmt(lastTransfer.fee_eur)
      const rule  = lastTransfer.rule || '?'

      console.log()
      console.log(`  ── ${player.name}`)
      console.log(`     Current status  : ${currentStatus || '(none)'}`)
      console.log(`     Expected status : ${expectedStatus}`)
      console.log(`     Latest transfer : ${lastDir(lastTransfer)} in ${lastLabel}`)
      console.log(`     From → To       : ${from} → ${to}`)
      console.log(`     Fee / Rule      : ${fee} / ${rule}`)
      console.log(`     Player ID       : ${player.id}`)

      // Show full timeline so you can sanity-check
      if (sorted.length > 1) {
        console.log('     Full timeline:')
        for (const t of sorted) {
          const lbl = resolveLabel(t)
          console.log(`       ${t.direction.padEnd(4)}  ${(lbl || '?').padEnd(4)}  ${(t.from_club || '?').padEnd(24)} → ${t.to_club || '?'}`)
        }
      }
    }
  }

  // ── Already correct ───────────────────────────────────────────────────────────
  header(`Already Correct — ${alreadyCorrect.length} player(s)`)
  if (alreadyCorrect.length === 0) {
    console.log('  None.')
  } else {
    for (const { player, currentStatus, lastLabel } of alreadyCorrect) {
      console.log(`  ${player.name.padEnd(30)} ${currentStatus.padEnd(10)} last transfer: ${lastLabel}`)
    }
  }

  // ── Skipped: no transfer history ──────────────────────────────────────────────
  header(`Skipped — No Transfer History — ${skippedNoHistory.length} player(s)`)
  console.log('  These players pre-date transfer tracking or were never transferred.')
  console.log('  Status will not be changed regardless of --write.\n')
  if (skippedNoHistory.length === 0) {
    console.log('  None.')
  } else {
    for (const { player } of skippedNoHistory) {
      const apps   = player.apps || 0
      const status = player.status || '(none)'
      console.log(`  ${player.name.padEnd(30)} status: ${status.padEnd(10)} apps: ${apps}`)
    }
  }

  // ── Skipped: ambiguous ────────────────────────────────────────────────────────
  header(`Skipped — Ambiguous — ${skippedAmbiguous.length} player(s)`)
  if (skippedAmbiguous.length === 0) {
    console.log('  None.')
  } else {
    for (const { player, reason } of skippedAmbiguous) {
      console.log(`  ${player.name.padEnd(30)} ⚠ ${reason}`)
    }
  }

  // ── Manual review ─────────────────────────────────────────────────────────────
  header(`Manual Review Required — ${manualReview.length} player(s)`)
  if (manualReview.length === 0) {
    console.log('  None.')
  } else {
    for (const { player, reason, transfers: ts } of manualReview) {
      console.log()
      console.log(`  ── ${player.name}  (current status: ${player.status || 'none'})`)
      console.log(`     Reason: ${reason}`)
      console.log('     Transfers:')
      for (const t of ts) {
        const lbl = resolveLabel(t) || '?'
        console.log(`       ${(t.direction || '?').padEnd(4)}  ${lbl.padEnd(4)}  ${(t.from_club || '?').padEnd(24)} → ${t.to_club || '?'}`)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary line
  // ─────────────────────────────────────────────────────────────────────────────

  header('Summary')
  console.log(`  wouldUpdate            : ${wouldUpdate.length}`)
  console.log(`  skippedAlreadyCorrect  : ${alreadyCorrect.length}`)
  console.log(`  skippedNoTransferHistory: ${skippedNoHistory.length}`)
  console.log(`  skippedAmbiguous       : ${skippedAmbiguous.length}`)
  console.log(`  manualReview           : ${manualReview.length}`)

  // ─────────────────────────────────────────────────────────────────────────────
  // WRITE
  // ─────────────────────────────────────────────────────────────────────────────

  if (!WRITE) {
    console.log('\n  Dry run complete. No data written.')
    console.log('  Review the wouldUpdate list above, then run with --write to apply.\n')
    return
  }

  if (wouldUpdate.length === 0) {
    console.log('\n  Nothing to write.\n')
    return
  }

  header(`Writing ${wouldUpdate.length} update(s)…`)

  let written = 0
  let failed  = 0

  for (const { player, expectedStatus } of wouldUpdate) {
    try {
      await db.collection('players').doc(player.id).update({
        status: expectedStatus,
      })
      written++
      console.log(`  ✓ ${player.name.padEnd(30)} → ${expectedStatus}`)
    } catch (err) {
      failed++
      console.error(`  ✗ ${player.name}  FAILED: ${err.message}`)
    }
  }

  console.log()
  console.log(`  Written : ${written}`)
  console.log(`  Failed  : ${failed}`)
  console.log()
}

// ─── Tiny helper used inside the report loop ─────────────────────────────────

function lastDir(t) {
  return `${t.direction} (${t.from_club || '?'} → ${t.to_club || '?'})`
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
