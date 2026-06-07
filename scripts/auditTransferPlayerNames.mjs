/**
 * auditTransferPlayerNames.mjs
 *
 * Audits transfer docs against the players collection to identify name
 * mismatches, propose canonical name updates, and flag records that need
 * manual review.
 *
 * Read-only — no Firestore writes.
 *
 * Usage:
 *   node scripts/auditTransferPlayerNames.mjs
 *
 * Output sections:
 *   1. playerId-linked mismatches  — highest confidence, safe to patch
 *   2. Exact normalized matches    — high confidence, no playerId on transfer
 *   3. Alias matches               — medium confidence, resolve to exactly one player
 *   4. No match / ambiguous        — manual review required
 *   5. Transfer-only records       — intentionally unlinked, leave as-is
 *   6. Already canonical           — exact match, nothing to do
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// ── Known transfer-only records ───────────────────────────────────────────────
// These are intentionally unlinked historical records. Never match or patch.
const TRANSFER_ONLY = new Set([
  'Generated Player',
])

// ── Approved alias map ────────────────────────────────────────────────────────
// Only explicit, manually approved aliases are used for matching.
// Format: 'transfer name as stored' → 'canonical player name'
// Add entries here only after human review — never infer from partial surnames.
// This map is intentionally empty at first run; populate from audit findings.
const APPROVED_ALIASES = {
  // 'Schlotterbeck': 'Nico Schlotterbeck',  // example — uncomment if confirmed
}

// ── Normalization ─────────────────────────────────────────────────────────────
// Used for exact-normalized matching only — strips diacritics, lowercases,
// collapses whitespace. Does NOT do partial/substring matching.
function normalize(str) {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  const admin = require('firebase-admin')
  const sa    = require('./serviceAccountKey.json')
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()

  // ── Fetch all transfers ───────────────────────────────────────────────────
  const transferSnap = await db.collection('transfers').get()
  const transfers = transferSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`Fetched ${transfers.length} transfer docs\n`)

  // ── Fetch all players ─────────────────────────────────────────────────────
  const playerSnap = await db.collection('players').get()
  const players = playerSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`Fetched ${players.length} player docs\n`)

  // Build lookups
  const playerById   = new Map(players.map(p => [p.id, p]))             // id → player doc
  const playerByExact = new Map(players.map(p => [p.name, p]))           // exact name → player doc
  const playerByNorm  = new Map(players.map(p => [normalize(p.name), p])) // normalized → player doc

  // Results buckets
  const linkedMismatch   = []  // has playerId, transfer.player ≠ player.name
  const linkedCanonical  = []  // has playerId, transfer.player === player.name (already good)
  const exactMatch       = []  // no playerId, normalized name matches exactly one player
  const aliasMatch       = []  // no playerId, matches via APPROVED_ALIASES
  const transferOnly     = []  // in TRANSFER_ONLY set — intentionally unlinked
  const manualReview     = []  // no safe match or ambiguous

  for (const t of transfers) {
    const tName = t.player || ''
    const dir   = t.direction || '?'
    const season = t.season || t.seasonId || '?'

    // ── Transfer-only records — never touch ──────────────────────────────────
    if (TRANSFER_ONLY.has(tName)) {
      transferOnly.push({
        docId:    t.id,
        player:   tName,
        direction: dir,
        season,
        playerId: t.playerId || null,
        action:   'leaveAsTransferOnly',
        note:     'intentionally unlinked transfer-only historical record',
      })
      continue
    }

    // ── playerId-linked path ─────────────────────────────────────────────────
    if (t.playerId) {
      const linked = playerById.get(t.playerId)
      if (!linked) {
        // playerId present but points to a non-existent player doc
        manualReview.push({
          docId:         t.id,
          currentName:   tName,
          direction:     dir,
          season,
          playerId:      t.playerId,
          canonicalName: null,
          proposedName:  null,
          confidence:    'playerId-broken',
          action:        'manualReview',
          note:          'playerId exists but player doc not found in players collection',
        })
        continue
      }

      if (linked.name === tName) {
        // Already canonical
        linkedCanonical.push({
          docId:    t.id,
          player:   tName,
          direction: dir,
          season,
          playerId: t.playerId,
          action:   'alreadyCanonical',
        })
      } else {
        // Name mismatch — propose updating to canonical
        linkedMismatch.push({
          docId:         t.id,
          currentName:   tName,
          direction:     dir,
          season,
          playerId:      t.playerId,
          canonicalName: linked.name,
          proposedName:  linked.name,
          confidence:    'playerId',
          action:        'updateName',
          note:          'transfer.player differs from linked player.name',
        })
      }
      continue
    }

    // ── No playerId — try to match ────────────────────────────────────────────

    // 1. Exact name match
    if (playerByExact.has(tName)) {
      const matched = playerByExact.get(tName)
      exactMatch.push({
        docId:         t.id,
        currentName:   tName,
        direction:     dir,
        season,
        playerId:      null,
        canonicalName: matched.name,
        proposedName:  matched.name,
        matchedPlayerId: matched.id,
        confidence:    'exact',
        action:        'alreadyCanonical',  // name is already right; playerId linkage is separate decision
        note:          'name exactly matches a player doc — playerId linkage not in scope of this audit',
      })
      continue
    }

    // 2. Exact normalized match
    const normT = normalize(tName)
    if (playerByNorm.has(normT)) {
      const matched = playerByNorm.get(normT)
      // Check it isn't just a diacritic/case difference of the exact match (already handled)
      exactMatch.push({
        docId:           t.id,
        currentName:     tName,
        direction:       dir,
        season,
        playerId:        null,
        canonicalName:   matched.name,
        proposedName:    matched.name,
        matchedPlayerId: matched.id,
        confidence:      'exact-normalized',
        action:          'updateName',
        note:            'normalized match — transfer name differs by diacritics or casing',
      })
      continue
    }

    // 3. Approved alias match
    if (APPROVED_ALIASES[tName]) {
      const aliasTarget = APPROVED_ALIASES[tName]
      const matched = playerByExact.get(aliasTarget) || playerByNorm.get(normalize(aliasTarget))
      if (matched) {
        aliasMatch.push({
          docId:           t.id,
          currentName:     tName,
          direction:       dir,
          season,
          playerId:        null,
          canonicalName:   matched.name,
          proposedName:    matched.name,
          matchedPlayerId: matched.id,
          confidence:      'alias',
          action:          'updateName',
          note:            `approved alias: "${tName}" → "${matched.name}"`,
        })
        continue
      }
    }

    // 4. Partial surname scan (report only — do not auto-match)
    // Find all players whose normalized name CONTAINS the normalized transfer name,
    // or vice versa. Report for manual review only.
    const normTransfer = normalize(tName)
    const partialCandidates = players.filter(p => {
      const normPlayer = normalize(p.name)
      return (
        normPlayer.includes(normTransfer) ||
        normTransfer.includes(normPlayer) ||
        // last-name-only check: transfer name matches last token of player name
        normPlayer.split(' ').pop() === normTransfer ||
        normTransfer.split(' ').pop() === normPlayer.split(' ').pop()
      )
    })

    if (partialCandidates.length === 1) {
      manualReview.push({
        docId:         t.id,
        currentName:   tName,
        direction:     dir,
        season,
        playerId:      null,
        canonicalName: null,
        proposedName:  null,
        confidence:    'ambiguous-partial',
        action:        'manualReview',
        note:          `1 partial candidate: "${partialCandidates[0].name}" (id: ${partialCandidates[0].id}) — add to APPROVED_ALIASES if confirmed`,
        candidates:    partialCandidates.map(p => ({ id: p.id, name: p.name })),
      })
    } else if (partialCandidates.length > 1) {
      manualReview.push({
        docId:         t.id,
        currentName:   tName,
        direction:     dir,
        season,
        playerId:      null,
        canonicalName: null,
        proposedName:  null,
        confidence:    'ambiguous-multiple',
        action:        'manualReview',
        note:          `${partialCandidates.length} partial candidates — cannot safely auto-match`,
        candidates:    partialCandidates.map(p => ({ id: p.id, name: p.name })),
      })
    } else {
      // No match at all — OUT transfer of a sold/released player not in players collection
      manualReview.push({
        docId:         t.id,
        currentName:   tName,
        direction:     dir,
        season,
        playerId:      null,
        canonicalName: null,
        proposedName:  null,
        confidence:    'none',
        action:        'manualReview',
        note:          'no player doc found — likely departed player not in players collection (expected for OUT transfers)',
      })
    }
  }

  // ── Print results ─────────────────────────────────────────────────────────

  const divider = '═'.repeat(64)

  console.log(divider)
  console.log('  1. LINKED MISMATCHES (playerId match, name differs)')
  console.log('     → Safe to patch: update transfer.player to canonical name')
  console.log(divider)
  if (linkedMismatch.length === 0) {
    console.log('  None.\n')
  } else {
    for (const r of linkedMismatch) {
      console.log(`\n  [${r.docId}]`)
      console.log(`  ${r.direction} | ${r.season}`)
      console.log(`  current:   "${r.currentName}"`)
      console.log(`  canonical: "${r.canonicalName}"`)
      console.log(`  playerId:  ${r.playerId}`)
      console.log(`  action:    ${r.action}`)
    }
    console.log()
  }

  console.log(divider)
  console.log('  2. EXACT / NORMALIZED MATCHES (no playerId, name resolves cleanly)')
  console.log(divider)
  if (exactMatch.length === 0) {
    console.log('  None.\n')
  } else {
    for (const r of exactMatch) {
      const needsUpdate = r.action === 'updateName'
      console.log(`\n  [${r.docId}]  confidence: ${r.confidence}`)
      console.log(`  ${r.direction} | ${r.season}`)
      console.log(`  current:   "${r.currentName}"`)
      console.log(`  canonical: "${r.canonicalName}"`)
      console.log(`  matched playerId: ${r.matchedPlayerId}`)
      console.log(`  action:    ${r.action}  ${needsUpdate ? '← name update needed' : '← already correct'}`)
    }
    console.log()
  }

  console.log(divider)
  console.log('  3. ALIAS MATCHES (approved alias map)')
  console.log(divider)
  if (aliasMatch.length === 0) {
    console.log('  None.\n')
  } else {
    for (const r of aliasMatch) {
      console.log(`\n  [${r.docId}]`)
      console.log(`  ${r.direction} | ${r.season}`)
      console.log(`  current:   "${r.currentName}"`)
      console.log(`  canonical: "${r.canonicalName}"`)
      console.log(`  note: ${r.note}`)
    }
    console.log()
  }

  console.log(divider)
  console.log('  4. MANUAL REVIEW (no safe match or ambiguous)')
  console.log(divider)
  if (manualReview.length === 0) {
    console.log('  None.\n')
  } else {
    for (const r of manualReview) {
      console.log(`\n  [${r.docId}]  confidence: ${r.confidence}`)
      console.log(`  ${r.direction} | ${r.season}`)
      console.log(`  current:   "${r.currentName}"`)
      console.log(`  note: ${r.note}`)
      if (r.candidates?.length) {
        console.log(`  candidates:`)
        r.candidates.forEach(c => console.log(`    - "${c.name}" (${c.id})`))
      }
    }
    console.log()
  }

  console.log(divider)
  console.log('  5. TRANSFER-ONLY RECORDS (intentionally unlinked — do not touch)')
  console.log(divider)
  for (const r of transferOnly) {
    console.log(`\n  [${r.docId}]  "${r.player}" | ${r.direction} | ${r.season}`)
    console.log(`  note: ${r.note}`)
  }
  console.log()

  console.log(divider)
  console.log('  6. ALREADY CANONICAL (linked and name correct — nothing to do)')
  console.log(divider)
  console.log(`  ${linkedCanonical.length} docs already canonical.`)
  if (linkedCanonical.length <= 20) {
    for (const r of linkedCanonical) {
      console.log(`  ✓ "${r.player}" | ${r.direction} | ${r.season}`)
    }
  }
  console.log()

  // ── Summary ───────────────────────────────────────────────────────────────
  const actionable = linkedMismatch.length + exactMatch.filter(r => r.action === 'updateName').length + aliasMatch.length
  console.log(divider)
  console.log('  SUMMARY')
  console.log(divider)
  console.log(`  Total transfer docs:      ${transfers.length}`)
  console.log(`  Already canonical:        ${linkedCanonical.length + exactMatch.filter(r => r.action === 'alreadyCanonical').length}`)
  console.log(`  Safe to patch (playerId): ${linkedMismatch.length}`)
  console.log(`  Safe to patch (exact):    ${exactMatch.filter(r => r.action === 'updateName').length}`)
  console.log(`  Safe to patch (alias):    ${aliasMatch.length}`)
  console.log(`  Total actionable:         ${actionable}`)
  console.log(`  Manual review:            ${manualReview.length}`)
  console.log(`  Transfer-only (skip):     ${transferOnly.length}`)
  console.log()
  if (actionable > 0) {
    console.log('  Next step: review proposed changes above, then build patchTransferPlayerNames.mjs')
  } else {
    console.log('  No name patches needed.')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
