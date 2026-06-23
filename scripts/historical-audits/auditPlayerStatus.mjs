/**
 * auditPlayerStatus.mjs
 *
 * Dry-run audit of player.status vs transfer history.
 * Reports conflicts, missing statuses, and transfer direction health.
 * Never writes to Firestore.
 *
 * Usage:
 *   node scripts/auditPlayerStatus.mjs
 *   node scripts/auditPlayerStatus.mjs --verbose   (show all players, not just flagged)
 *
 * Requires serviceAccountKey.json at project root (never committed).
 */

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const require  = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const admin = require('firebase-admin')

const VERBOSE   = process.argv.includes('--verbose')
const KEY_PATH  = resolve(__dirname, '../serviceAccountKey.json')

// ─── Init ─────────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  return admin.firestore()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_STATUSES    = new Set(['Active', 'Sold', 'Loaned'])
const VALID_DIRECTIONS  = new Set(['IN', 'OUT'])

// Sort season labels S1 < S2 … S7 numerically
function seasonNum(label) {
  return parseInt((label || '').replace(/\D/g, ''), 10) || 0
}

// Pretty-print section headers
function header(title) {
  const line = '─'.repeat(60)
  console.log(`\n${line}`)
  console.log(`  ${title}`)
  console.log(line)
}

function row(label, value) {
  console.log(`  ${label.padEnd(40)} ${value}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  // ── 1. Load club (FC Richport) ─────────────────────────────────────────────
  const clubsSnap = await db.collection('clubs').get()
  const clubs = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  if (clubs.length === 0) {
    console.error('No clubs found. Check Firestore connection.')
    process.exit(1)
  }

  // Find FC Richport; fall back to first club if only one exists
  const club = clubs.find(c => /richport/i.test(c.name)) || clubs[0]
  console.log(`\n  Club: ${club.name} (${club.id})`)

  // ── 2. Load all players for this club ──────────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', club.id)
    .get()
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // ── 3. Load all transfers for this club ────────────────────────────────────
  const transfersSnap = await db.collection('transfers')
    .where('clubId', '==', club.id)
    .get()
  const transfers = transfersSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // ── 4. Load seasons (for label resolution) ────────────────────────────────
  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', club.id)
    .get()
  const seasonLabelMap = new Map(
    seasonsSnap.docs.map(d => [d.id, d.data().label])
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION A — Transfer direction health
  // ─────────────────────────────────────────────────────────────────────────────

  header('A — Transfer Direction Health')

  let tTotal        = transfers.length
  let tHasDirection = 0
  let tMissing      = 0
  let tUnexpected   = []

  for (const t of transfers) {
    const dir = t.direction
    if (dir === undefined || dir === null || dir === '') {
      tMissing++
    } else if (VALID_DIRECTIONS.has(dir)) {
      tHasDirection++
    } else {
      tUnexpected.push({ id: t.id, player: t.player, direction: dir })
    }
  }

  row('Total transfer docs', tTotal)
  row('Have valid direction (IN/OUT)', tHasDirection)
  row('Missing direction', tMissing)
  row('Unexpected direction values', tUnexpected.length)

  if (tUnexpected.length > 0) {
    console.log('\n  Unexpected direction values:')
    for (const t of tUnexpected) {
      console.log(`    doc ${t.id} | player: "${t.player}" | direction: "${t.direction}"`)
    }
  }

  const directionReliable = tMissing === 0 && tUnexpected.length === 0
  const directionPartial  = tMissing > 0 && tHasDirection > 0

  if (directionReliable) {
    console.log('\n  ✓ Direction field is complete and clean across all transfer docs.')
  } else if (tMissing === tTotal) {
    console.log('\n  ✗ DIRECTION FIELD ENTIRELY MISSING — conflict detection will be skipped.')
  } else if (directionPartial) {
    console.log(`\n  ⚠ Direction field is partial (${tMissing} missing). Conflict detection`)
    console.log('    will only cover players whose full transfer history is intact.')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION B — Player status breakdown
  // ─────────────────────────────────────────────────────────────────────────────

  header('B — Player Status Breakdown')

  const byStatus = {}
  const missingStatus = []
  const unknownStatus = []

  for (const p of players) {
    const s = p.status
    if (!s) {
      missingStatus.push(p)
    } else if (!VALID_STATUSES.has(s)) {
      unknownStatus.push(p)
    } else {
      byStatus[s] = (byStatus[s] || 0) + 1
    }
  }

  row('Total players', players.length)
  row('Active', byStatus['Active'] || 0)
  row('Sold', byStatus['Sold'] || 0)
  row('Loaned', byStatus['Loaned'] || 0)
  row('Missing status (null/undefined/empty)', missingStatus.length)
  row('Unknown status value', unknownStatus.length)

  if (missingStatus.length > 0) {
    console.log('\n  Players with missing status:')
    for (const p of missingStatus) {
      console.log(`    ${p.name.padEnd(28)} id: ${p.id}`)
    }
  }

  if (unknownStatus.length > 0) {
    console.log('\n  Players with unknown status values:')
    for (const p of unknownStatus) {
      console.log(`    ${p.name.padEnd(28)} status: "${p.status}"  id: ${p.id}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION C — Transfer history per player
  // Build per-player transfer timeline, sorted chronologically.
  // ─────────────────────────────────────────────────────────────────────────────

  header('C — Per-Player Transfer Timeline Summary')

  // Index transfers by playerId (preferred) or player name (fallback)
  // Multiple transfers per player are expected (e.g. IN then OUT).
  const transfersByPlayerId   = {}   // playerId → transfer[]
  const transfersByPlayerName = {}   // name (lowercase) → transfer[]
  let tWithPlayerId = 0
  let tWithoutPlayerId = 0

  for (const t of transfers) {
    if (t.playerId) {
      tWithPlayerId++
      if (!transfersByPlayerId[t.playerId]) transfersByPlayerId[t.playerId] = []
      transfersByPlayerId[t.playerId].push(t)
    } else {
      tWithoutPlayerId++
      const key = (t.player || '').trim().toLowerCase()
      if (key) {
        if (!transfersByPlayerName[key]) transfersByPlayerName[key] = []
        transfersByPlayerName[key].push(t)
      }
    }
  }

  row('Transfer docs with playerId', tWithPlayerId)
  row('Transfer docs without playerId (name-matched)', tWithoutPlayerId)

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION D — Status conflict detection
  // Only runs when direction data is present and reliable enough to use.
  // ─────────────────────────────────────────────────────────────────────────────

  header('D — Status Conflict Detection')

  if (tTotal === 0) {
    console.log('  No transfer docs found — skipping conflict detection.')
  } else if (tMissing === tTotal) {
    console.log('  ✗ Skipped — direction field missing on all transfer docs.')
    console.log('    Cannot determine transfer timeline without direction.')
  } else {

    // Resolve transfer list for a player doc: prefer playerId index, fall back to name
    function getPlayerTransfers(player) {
      if (transfersByPlayerId[player.id]) return transfersByPlayerId[player.id]
      const key = (player.name || '').trim().toLowerCase()
      return transfersByPlayerName[key] || []
    }

    // Resolve season label for a transfer doc
    function resolveLabel(t) {
      if (t.seasonId && seasonLabelMap.has(t.seasonId)) return seasonLabelMap.get(t.seasonId)
      if (t.season) return t.season
      return '?'
    }

    const conflicts = []
    const warnings  = []
    const clean     = []

    for (const player of players) {
      const playerTransfers = getPlayerTransfers(player)

      // Only consider transfers that have a valid direction
      const validTransfers = playerTransfers.filter(t => VALID_DIRECTIONS.has(t.direction))
      const partial = validTransfers.length < playerTransfers.length

      if (validTransfers.length === 0) {
        // No transfer history at all — not necessarily wrong
        // Flag only if status is Sold (sold players should have an OUT transfer)
        if (player.status === 'Sold') {
          warnings.push({
            player,
            issue: 'Status is Sold but no transfer docs found',
            transfers: [],
          })
        }
        continue
      }

      // Sort valid transfers by season number, then by transfer direction (IN < OUT within same season)
      const sorted = [...validTransfers].sort((a, b) => {
        const diff = seasonNum(resolveLabel(a)) - seasonNum(resolveLabel(b))
        if (diff !== 0) return diff
        // Within the same season: IN before OUT
        if (a.direction === 'IN' && b.direction === 'OUT') return -1
        if (a.direction === 'OUT' && b.direction === 'IN') return 1
        return 0
      })

      const lastTransfer = sorted[sorted.length - 1]
      const lastSeason   = resolveLabel(lastTransfer)
      const lastDir      = lastTransfer.direction
      const status       = player.status

      // Derive expected status from last transfer
      // Last transfer OUT → expected Sold
      // Last transfer IN  → expected Active
      const expectedStatus = lastDir === 'OUT' ? 'Sold' : 'Active'

      const conflict = status !== expectedStatus

      const entry = {
        player,
        status,
        expectedStatus,
        lastTransfer: { direction: lastDir, season: lastSeason },
        transferCount: validTransfers.length,
        partial,
        sorted,
      }

      if (partial) {
        warnings.push({ ...entry, issue: `Partial direction data (${validTransfers.length}/${playerTransfers.length} transfers have direction)` })
      } else if (conflict) {
        conflicts.push({ ...entry, issue: `status="${status}" but last transfer was ${lastDir} in ${lastSeason} → expected "${expectedStatus}"` })
      } else {
        clean.push(entry)
      }
    }

    // ── Report conflicts ──────────────────────────────────────────────────────
    if (conflicts.length === 0) {
      console.log('  ✓ No status conflicts detected.\n')
    } else {
      console.log(`\n  ✗ ${conflicts.length} status conflict(s) found:\n`)
      for (const c of conflicts) {
        console.log(`  ── ${c.player.name} (id: ${c.player.id})`)
        console.log(`     ${c.issue}`)
        if (VERBOSE) {
          console.log('     Full transfer timeline:')
          for (const t of c.sorted) {
            const label = resolveLabel(t)
            const fee   = t.fee_eur ? `€${(t.fee_eur/1e6).toFixed(1)}M` : 'Free/unknown'
            console.log(`       ${t.direction.padEnd(4)}  ${label.padEnd(4)}  ${(t.from_club||'?').padEnd(22)} → ${(t.to_club||'?').padEnd(22)}  ${fee}`)
          }
        }
        console.log()
      }
    }

    // ── Report warnings ───────────────────────────────────────────────────────
    if (warnings.length > 0) {
      console.log(`  ⚠ ${warnings.length} warning(s) (partial data — cannot confirm or deny):\n`)
      for (const w of warnings) {
        console.log(`  ── ${w.player.name} (id: ${w.player.id})`)
        console.log(`     ${w.issue}`)
        console.log()
      }
    }

    // ── Report clean ──────────────────────────────────────────────────────────
    console.log(`  ✓ ${clean.length} player(s) with clean status/transfer alignment.`)
    if (VERBOSE && clean.length > 0) {
      console.log()
      for (const c of clean) {
        console.log(`     ${c.player.name.padEnd(28)} status: ${c.status.padEnd(8)} last: ${c.lastTransfer.direction} ${c.lastTransfer.season}`)
      }
    }

  } // end conflict detection block

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION E — Players with no transfer history at all
  // ─────────────────────────────────────────────────────────────────────────────

  header('E — Players With No Transfer History')

  const noTransferHistory = players.filter(p => {
    const byId   = transfersByPlayerId[p.id] || []
    const byName = transfersByPlayerName[(p.name || '').trim().toLowerCase()] || []
    return byId.length === 0 && byName.length === 0
  })

  if (noTransferHistory.length === 0) {
    console.log('  All players have at least one transfer doc.\n')
  } else {
    console.log(`  ${noTransferHistory.length} player(s) with no transfer docs:\n`)
    for (const p of noTransferHistory) {
      const apps   = p.apps || 0
      const status = p.status || '(no status)'
      console.log(`    ${p.name.padEnd(28)} status: ${status.padEnd(8)}  apps: ${apps}`)
    }
    console.log()
    console.log('  Note: Players with 0 apps and no transfers may be placeholders.')
    console.log('  Players with apps > 0 but no IN transfer likely pre-date S1 import.')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION F — Summary
  // ─────────────────────────────────────────────────────────────────────────────

  header('F — Summary')
  console.log('  This was a read-only audit. No data was written.')
  console.log('  Run with --verbose to see full transfer timelines for flagged players.')
  console.log()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
