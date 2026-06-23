/**
 * createHistoricalTransferStubs.mjs
 *
 * Creates historical player stub docs for OUT transfers that currently have
 * no playerId, then links those transfer docs to the created stubs.
 * Also patches the Ian Maatsen display name on his existing linked transfer doc.
 *
 * Safe to rerun: checks for existing player docs by normalized name + clubId
 * before creating. If exactly one match exists, reuses it. If multiple exist,
 * flags for manual review and skips. If none, creates a new stub.
 *
 * Dependency: run AFTER patchTransferCleanup.mjs --write has completed.
 *   - Generated Player name + fields must be canonical
 *   - Mercado position must be CM
 *   - Newerton position must be LW
 *
 * Usage:
 *   node scripts/createHistoricalTransferStubs.mjs           # dry-run (default)
 *   node scripts/createHistoricalTransferStubs.mjs '--write' # execute writes
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const WRITE    = process.argv.includes('--write')
const CLUB_ID  = 'kqhz2LAYC1pOzOtLehR4'

// ── Stub definitions ─────────────────────────────────────────────────────────
// Each entry defines one historical player stub and the transfer doc to link.
// transferDocId is matched by Firestore doc ID — no name-based matching.
// canonicalName is the authoritative display name written to both player.name
// and transfer.player.
// position is sourced from confirmed data (transfer doc or user-confirmed).
const STUBS = [
  {
    canonicalName:  'Cole Palmer',
    position:       'CAM',
    transferDocId:  '0ILn3IeqKe8ZJZJMKK67',
    note:           'S1 Summer OUT to PSG — €233M',
  },
  {
    canonicalName:  'Patrik Mercado',
    position:       'CM',
    transferDocId:  '8VCVBpUbnkW8ALdpG8Cl',
    note:           'S2 January OUT to Brentford — €22M',
  },
  {
    canonicalName:  'Mario Gila',
    position:       'CB',
    transferDocId:  'aRnol6S5MzeqicRNS6ZR',
    note:           'S2 Summer OUT to Aston Villa — €63.9M',
  },
  {
    canonicalName:  'Newerton Martins da Silva',
    position:       'LW',
    transferDocId:  'iaqV3C93rudhXLzn08LL',
    note:           'S3 Summer OUT to Brighton — €26.2M',
  },
  {
    canonicalName:  'Jorrel Hato',
    position:       'CB',
    transferDocId:  'itx0zAZ9gM7GRm04oAOh',
    note:           'S2 Summer OUT to Bayern Munich — €95.6M',
  },
  {
    canonicalName:  'Amad Diallo',
    position:       'RM',
    transferDocId:  'kqO4fRBHoUJac851en0I',
    note:           'S1 Summer OUT to Atlético Madrid — €69.2M',
  },
  {
    canonicalName:  'Achraf Hakimi',
    position:       'RB',
    transferDocId:  'prGdbJOagUBft6mAG3xu',
    note:           'S1 Summer OUT to PSG — €129.6M',
  },
  {
    canonicalName:  'Denzel Dumfries',
    position:       'RB',
    transferDocId:  's763UY5WrdkHEhQ5tnOX',
    note:           'S2 Summer OUT to Liverpool — €55.1M',
  },
  {
    canonicalName:  'Joško Gvardiol',
    position:       'LB',
    transferDocId:  'x23siGAh7IO2U3JsSLGH',
    note:           'S1 Summer OUT to Barcelona — €116M',
  },
  {
    canonicalName:  'Generated Player',
    position:       'CAM',
    transferDocId:  '2jt9pHGBuduy4aQeim8r',
    note:           'S1 Summer OUT to Liverpool — €125.6M — regen placeholder',
  },
]

// ── Name-only patch (no stub creation — player doc already exists) ────────────
const NAME_ONLY_PATCHES = [
  {
    transferDocId:  'fUXyFtMdIT5yBxoPffus',
    existingPlayerId: '5Zedc8q2ZlhyXJREHK21',
    canonicalName:  'Ian Maatsen',
    note:           'S1 Summer OUT to Bayern Munich — update display name only, playerId already correct',
  },
]

// ── Normalization ─────────────────────────────────────────────────────────────
function normalize(str) {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Stub doc template ─────────────────────────────────────────────────────────
function buildStubDoc(name, position) {
  return {
    clubId:           CLUB_ID,
    name,
    position,
    status:           'Sold',
    isHistoricalStub: true,
    apps:             0,
    goals:            0,
    assists:          0,
    cleanSheets:      0,
    uclApps:          0,
    uclGoals:         0,
    uclAssists:       0,
    uclCleanSheets:   0,
    seasonStats:      [],
    sofifaId:         null,
    playerFaceUrl:    null,
  }
}

async function main() {
  if (!WRITE) {
    console.log('══════════════════════════════════════════════════════════')
    console.log('  DRY-RUN MODE — no Firestore writes will execute')
    console.log('  Pass \'--write\' to execute')
    console.log('══════════════════════════════════════════════════════════\n')
  } else {
    console.log('⚠️  WRITE MODE — Firestore writes will execute\n')
  }

  const admin = require('firebase-admin')
  const sa    = require('../serviceAccountKey.json')
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()

  // ── Load existing players for this club ──────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', CLUB_ID)
    .get()
  const existingPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`Loaded ${existingPlayers.length} existing player docs for club\n`)

  // Build normalized name → player(s) map for collision detection
  const byNormName = {}
  for (const p of existingPlayers) {
    const key = normalize(p.name)
    if (!byNormName[key]) byNormName[key] = []
    byNormName[key].push(p)
  }

  const results = {
    wouldCreateStubs:      0,
    createdStubs:          0,
    reusedExistingPlayers: 0,
    wouldLinkTransfers:    0,
    linkedTransfers:       0,
    skippedAlreadyLinked:  0,
    manualReview:          [],
  }

  // ── Process each stub definition ─────────────────────────────────────────
  for (const stub of STUBS) {
    const { canonicalName, position, transferDocId, note } = stub
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`  ${canonicalName} (${position})`)
    console.log(`  ${note}`)
    console.log(`  transfer doc: ${transferDocId}`)

    // ── 1. Fetch the transfer doc to verify current state ──────────────────
    let transferDoc
    try {
      const tSnap = await db.collection('transfers').doc(transferDocId).get()
      if (!tSnap.exists) {
        console.log(`  ✗  Transfer doc not found — skipping`)
        results.manualReview.push({ name: canonicalName, transferDocId, reason: 'transfer doc not found' })
        continue
      }
      transferDoc = { id: tSnap.id, ...tSnap.data() }
    } catch (err) {
      console.log(`  ✗  Fetch error: ${err.message}`)
      results.manualReview.push({ name: canonicalName, transferDocId, reason: err.message })
      continue
    }

    // ── 2. Check if transfer already linked ───────────────────────────────
    if (transferDoc.playerId) {
      console.log(`  ⏭  Transfer already has playerId: ${transferDoc.playerId} — skipping`)
      results.skippedAlreadyLinked++
      continue
    }

    // ── 3. Check for existing player doc by normalized name + clubId ──────
    const normKey = normalize(canonicalName)
    const candidates = byNormName[normKey] || []

    let playerDocId = null
    let playerAction = null

    if (candidates.length === 1) {
      // Exactly one match — reuse
      playerDocId  = candidates[0].id
      playerAction = 'reuse'
      console.log(`  ♻️  Reusing existing player doc: ${playerDocId} ("${candidates[0].name}")`)
      results.reusedExistingPlayers++
    } else if (candidates.length > 1) {
      // Ambiguous — manual review
      console.log(`  ⚠️  ${candidates.length} existing player docs match normalized name — MANUAL REVIEW`)
      candidates.forEach(c => console.log(`       - ${c.id}: "${c.name}" status=${c.status}`))
      results.manualReview.push({
        name: canonicalName,
        transferDocId,
        reason: `${candidates.length} ambiguous existing player docs`,
        candidates: candidates.map(c => ({ id: c.id, name: c.name, status: c.status })),
      })
      continue
    } else {
      // No match — create stub
      playerAction = 'create'
      console.log(`  ✦  No existing player doc — will create stub`)
    }

    // ── 4. Print proposed writes ───────────────────────────────────────────
    if (playerAction === 'create') {
      const stubDoc = buildStubDoc(canonicalName, position)
      console.log(`\n  STUB DOC to create:`)
      Object.entries(stubDoc).forEach(([k, v]) =>
        console.log(`    ${k}: ${JSON.stringify(v)}`)
      )
      results.wouldCreateStubs++
    }

    // Transfer update
    const currentName = transferDoc.player
    const nameChanged = currentName !== canonicalName
    console.log(`\n  TRANSFER UPDATE:`)
    console.log(`    player:   "${currentName}"  →  "${canonicalName}"${nameChanged ? '' : '  (unchanged)'}`)
    console.log(`    playerId: ${transferDoc.playerId ?? 'null'}  →  ${playerAction === 'create' ? '<new stub id>' : playerDocId}`)
    results.wouldLinkTransfers++

    // ── 5. Execute writes ──────────────────────────────────────────────────
    if (WRITE) {
      try {
        if (playerAction === 'create') {
          const stubDoc = buildStubDoc(canonicalName, position)
          const newRef  = await db.collection('players').add(stubDoc)
          playerDocId   = newRef.id
          results.createdStubs++
          console.log(`\n  ✅ Created stub: ${playerDocId}`)

          // Add to local index so reruns within the same process won't re-create
          const newEntry = { id: playerDocId, name: canonicalName }
          if (!byNormName[normKey]) byNormName[normKey] = []
          byNormName[normKey].push(newEntry)
        }

        // Link transfer
        await db.collection('transfers').doc(transferDocId).update({
          player:   canonicalName,
          playerId: playerDocId,
        })
        results.linkedTransfers++
        console.log(`  ✅ Linked transfer → playerId: ${playerDocId}`)
      } catch (err) {
        console.log(`  ✗  Write error: ${err.message}`)
        results.manualReview.push({ name: canonicalName, transferDocId, reason: err.message })
      }
    } else {
      console.log(`\n  → Would write (dry-run)`)
    }
  }

  // ── Process name-only patches (no stub creation) ─────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log('  NAME-ONLY PATCHES (existing playerId — display name update only)')
  console.log(`${'─'.repeat(60)}`)

  for (const patch of NAME_ONLY_PATCHES) {
    const { transferDocId, existingPlayerId, canonicalName, note } = patch
    console.log(`\n  ${canonicalName}`)
    console.log(`  ${note}`)
    console.log(`  transfer doc: ${transferDocId}`)

    let transferDoc
    try {
      const tSnap = await db.collection('transfers').doc(transferDocId).get()
      if (!tSnap.exists) {
        console.log(`  ✗  Transfer doc not found`)
        results.manualReview.push({ name: canonicalName, transferDocId, reason: 'transfer doc not found' })
        continue
      }
      transferDoc = { id: tSnap.id, ...tSnap.data() }
    } catch (err) {
      console.log(`  ✗  Fetch error: ${err.message}`)
      results.manualReview.push({ name: canonicalName, transferDocId, reason: err.message })
      continue
    }

    // Verify playerId matches expected
    if (transferDoc.playerId !== existingPlayerId) {
      console.log(`  ⚠️  playerId mismatch — stored: ${transferDoc.playerId}, expected: ${existingPlayerId} — MANUAL REVIEW`)
      results.manualReview.push({
        name: canonicalName, transferDocId,
        reason: `playerId mismatch: stored ${transferDoc.playerId} vs expected ${existingPlayerId}`,
      })
      continue
    }

    const currentName = transferDoc.player
    if (currentName === canonicalName) {
      console.log(`  ✓  Already canonical: "${canonicalName}" — skipping`)
      results.skippedAlreadyLinked++
      continue
    }

    console.log(`  player: "${currentName}"  →  "${canonicalName}"`)
    console.log(`  playerId: ${existingPlayerId}  (unchanged)`)
    results.wouldLinkTransfers++

    if (WRITE) {
      try {
        await db.collection('transfers').doc(transferDocId).update({ player: canonicalName })
        results.linkedTransfers++
        console.log(`  ✅ Updated display name`)
      } catch (err) {
        console.log(`  ✗  Write error: ${err.message}`)
        results.manualReview.push({ name: canonicalName, transferDocId, reason: err.message })
      }
    } else {
      console.log(`  → Would write (dry-run)`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log('  SUMMARY')
  console.log(`${'═'.repeat(60)}`)
  console.log(`  wouldCreateStubs:      ${results.wouldCreateStubs}`)
  console.log(`  createdStubs:          ${results.createdStubs}`)
  console.log(`  reusedExistingPlayers: ${results.reusedExistingPlayers}`)
  console.log(`  wouldLinkTransfers:    ${results.wouldLinkTransfers}`)
  console.log(`  linkedTransfers:       ${results.linkedTransfers}`)
  console.log(`  skippedAlreadyLinked:  ${results.skippedAlreadyLinked}`)
  console.log(`  manualReview:          ${results.manualReview.length}`)

  if (results.manualReview.length) {
    console.log('\n  Manual review items:')
    results.manualReview.forEach(r => {
      console.log(`    - ${r.name} (${r.transferDocId}): ${r.reason}`)
      if (r.candidates) r.candidates.forEach(c => console.log(`        candidate: ${c.id} "${c.name}"`))
    })
  }

  if (!WRITE && (results.wouldCreateStubs > 0 || results.wouldLinkTransfers > 0)) {
    console.log("\n  Run with '--write' to execute.")
  }
  if (WRITE) {
    console.log('\n  Expected clean run: wouldCreateStubs=10, createdStubs=10,')
    console.log('  reusedExistingPlayers=0, wouldLinkTransfers=11, linkedTransfers=11,')
    console.log('  skippedAlreadyLinked=0, manualReview=0')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
