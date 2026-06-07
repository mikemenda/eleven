/**
 * auditTransferClubs.mjs
 *
 * Read-only audit of all transfer club names across the transfers collection.
 *
 * Reports:
 *   • Every unique club appearing in from_club or to_club
 *   • Normalized key (lowercase + trimmed)
 *   • Appearance count + direction breakdown (from / to / both)
 *   • Whether an opponents doc already exists for this key (→ sofifaTeamId known)
 *   • Proposed entries needed for data/transfer-clubs.json (missing from opponents)
 *   • Any transfers with null / blank from_club or to_club
 *
 * Usage:
 *   node scripts/auditTransferClubs.mjs
 *   node scripts/auditTransferClubs.mjs --club <clubId>   (override auto-detect)
 *
 * Never writes to Firestore.
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const admin   = require('firebase-admin')
const svcPath = new URL('../serviceAccountKey.json', import.meta.url).pathname

// ─── Init ─────────────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(require(svcPath)),
})
const db = admin.firestore()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mirror of opponentMatcher normalisation: lowercase, trim, collapse whitespace */
function normalise(name) {
  if (!name || !name.trim()) return null
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pad(str, width) {
  const s = String(str ?? '')
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}

function hr(char = '─', width = 80) {
  return char.repeat(width)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args   = process.argv.slice(2)
  const clIdx  = args.indexOf('--club')
  let   clubId = clIdx !== -1 ? args[clIdx + 1] : null

  // ── Auto-detect club if not supplied ──────────────────────────────────────
  if (!clubId) {
    const clubsSnap = await db.collection('clubs').get()
    if (clubsSnap.empty) {
      console.error('No clubs found in Firestore. Pass --club <clubId> explicitly.')
      process.exit(1)
    }
    if (clubsSnap.docs.length === 1) {
      clubId = clubsSnap.docs[0].id
      const name = clubsSnap.docs[0].data().name || '(unnamed)'
      console.log(`Auto-detected club: ${name} (${clubId})\n`)
    } else {
      console.log('Multiple clubs found. Pass --club <clubId> to select one:')
      clubsSnap.docs.forEach(d => {
        console.log(`  ${d.id}  ${d.data().name || '(unnamed)'}`)
      })
      process.exit(0)
    }
  }

  // ── Fetch transfers ────────────────────────────────────────────────────────
  console.log('Fetching transfers…')
  const txSnap = await db.collection('transfers')
    .where('clubId', '==', clubId)
    .get()

  const transfers = txSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  ${transfers.length} transfer docs found.\n`)

  // ── Fetch opponents (for identity cross-reference) ─────────────────────────
  console.log('Fetching opponents collection…')
  const oppSnap = await db.collection('opponents').get()
  const opponentKeys = new Set(oppSnap.docs.map(d => d.id))
  // Build a map of key → { displayName, sofifaTeamId } for richer reporting
  const opponentData = {}
  oppSnap.docs.forEach(d => {
    opponentData[d.id] = d.data()
  })
  console.log(`  ${opponentKeys.size} opponent docs found.\n`)

  // ── Tally club appearances ─────────────────────────────────────────────────
  /**
   * clubMap: normalised key → {
   *   rawNames: Set<string>,   // all raw spellings seen
   *   fromCount: number,       // times seen in from_club
   *   toCount:   number,       // times seen in to_club
   *   totalCount: number,
   *   opponentDoc: object|null // opponent doc if key matches
   * }
   */
  const clubMap = {}
  const nullFromClub = []
  const nullToClub   = []

  for (const t of transfers) {
    const from = t.from_club
    const to   = t.to_club
    const dir  = t.direction

    // Flag blank/null fields
    if (!from || !String(from).trim()) {
      nullFromClub.push({ id: t.id, player: t.player, season: t.season || t.seasonId, direction: dir })
    }
    if (!to || !String(to).trim()) {
      nullToClub.push({ id: t.id, player: t.player, season: t.season || t.seasonId, direction: dir })
    }

    // Tally from_club (skip FC Richport itself — it's always one side)
    const clubsToTally = []
    if (dir === 'IN'  && from && String(from).trim()) clubsToTally.push({ raw: from, field: 'from' })
    if (dir === 'OUT' && to   && String(to).trim())   clubsToTally.push({ raw: to,   field: 'to'   })
    // Also tally the other side for completeness (some docs have both meaningful)
    if (dir === 'IN'  && to   && String(to).trim())   clubsToTally.push({ raw: to,   field: 'to'   })
    if (dir === 'OUT' && from && String(from).trim()) clubsToTally.push({ raw: from, field: 'from' })

    for (const { raw, field } of clubsToTally) {
      const key = normalise(raw)
      if (!key) continue
      if (!clubMap[key]) {
        clubMap[key] = {
          rawNames:    new Set(),
          fromCount:   0,
          toCount:     0,
          totalCount:  0,
          opponentDoc: opponentKeys.has(key) ? opponentData[key] : null,
        }
      }
      clubMap[key].rawNames.add(raw)
      if (field === 'from') clubMap[key].fromCount++
      else                  clubMap[key].toCount++
      clubMap[key].totalCount++
    }
  }

  // Sort by total appearances desc
  const sorted = Object.entries(clubMap)
    .sort(([, a], [, b]) => b.totalCount - a.totalCount)

  // ── Section 1: Full club table ─────────────────────────────────────────────
  console.log(hr())
  console.log('TRANSFER CLUB AUDIT — ALL CLUBS')
  console.log(hr())
  console.log(
    pad('NORMALISED KEY', 36) +
    pad('COUNT', 7) +
    pad('FROM', 6) +
    pad('TO', 6) +
    pad('IDENTITY', 10) +
    'RAW NAME(S)'
  )
  console.log(hr('─', 80))

  for (const [key, data] of sorted) {
    const identityStatus = data.opponentDoc
      ? `✓ ${data.opponentDoc.sofifaTeamId || '(no teamId)'}`
      : '✗ missing'

    const rawList = [...data.rawNames].join(' / ')

    console.log(
      pad(key, 36) +
      pad(data.totalCount, 7) +
      pad(data.fromCount,  6) +
      pad(data.toCount,    6) +
      pad(identityStatus, 10) +
      '  ' + rawList
    )
  }

  // ── Section 2: Missing from opponents → needed in transfer-clubs.json ──────
  const missing = sorted.filter(([, d]) => !d.opponentDoc)

  console.log('\n' + hr())
  console.log(`MISSING OPPONENT IDENTITY — ${missing.length} clubs need entries in data/transfer-clubs.json`)
  console.log(hr())

  if (missing.length === 0) {
    console.log('  All transfer clubs are already covered by the opponents collection.')
  } else {
    console.log('  The following clubs have no matching opponents doc.')
    console.log('  Add them to data/transfer-clubs.json with their sofifaTeamId.\n')

    // Print as a JSON skeleton for easy copy-paste
    const skeleton = {}
    for (const [key, data] of missing) {
      const displayName = [...data.rawNames][0] // first raw spelling as best guess
      skeleton[key] = {
        displayName,
        sofifaTeamId: null,  // FILL IN MANUALLY
        _appearances: data.totalCount,
        _direction: data.fromCount > 0 && data.toCount > 0
          ? 'both'
          : data.fromCount > 0 ? 'from_club only' : 'to_club only',
      }
    }
    console.log(JSON.stringify(skeleton, null, 2))
  }

  // ── Section 3: Clubs already covered by opponents ─────────────────────────
  const covered = sorted.filter(([, d]) => d.opponentDoc)

  console.log('\n' + hr())
  console.log(`ALREADY COVERED BY OPPONENTS COLLECTION — ${covered.length} clubs`)
  console.log(hr())

  if (covered.length === 0) {
    console.log('  None.')
  } else {
    for (const [key, data] of covered) {
      const teamId = data.opponentDoc.sofifaTeamId || '⚠ sofifaTeamId missing on opponent doc'
      const disp   = data.opponentDoc.displayName  || [...data.rawNames][0]
      console.log(`  ${pad(key, 34)} sofifaTeamId: ${teamId}  (${disp})`)
    }
  }

  // ── Section 4: Null / blank club fields ───────────────────────────────────
  console.log('\n' + hr())
  console.log('NULL / BLANK CLUB FIELDS')
  console.log(hr())

  if (nullFromClub.length === 0 && nullToClub.length === 0) {
    console.log('  No null or blank from_club / to_club fields found. ✓')
  } else {
    if (nullFromClub.length > 0) {
      console.log(`\n  BLANK from_club (${nullFromClub.length}):`)
      for (const t of nullFromClub) {
        console.log(`    doc:${t.id}  player:${t.player}  season:${t.season}  dir:${t.direction}`)
      }
    }
    if (nullToClub.length > 0) {
      console.log(`\n  BLANK to_club (${nullToClub.length}):`)
      for (const t of nullToClub) {
        console.log(`    doc:${t.id}  player:${t.player}  season:${t.season}  dir:${t.direction}`)
      }
    }
  }

  // ── Section 5: Summary ────────────────────────────────────────────────────
  console.log('\n' + hr())
  console.log('SUMMARY')
  console.log(hr())
  console.log(`  Total transfers scanned :  ${transfers.length}`)
  console.log(`  Unique transfer clubs   :  ${sorted.length}`)
  console.log(`  Covered by opponents    :  ${covered.length}`)
  console.log(`  Missing identity        :  ${missing.length}  ← need sofifaTeamId`)
  console.log(`  Null from_club fields   :  ${nullFromClub.length}`)
  console.log(`  Null to_club fields     :  ${nullToClub.length}`)
  console.log(hr())
  console.log('\nDone. No data was written to Firestore.\n')

  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
