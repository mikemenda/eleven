/**
 * seedUclS2S3.mjs
 *
 * Creates missing S2 and S3 UCL seasonStats collection docs.
 * Reads clubId and seasonIds from Firestore — nothing hardcoded.
 * Matches players by normalized name with an approved alias table.
 * Skips any doc where playerId + seasonId + scope=UCL already exists.
 * After writing, recalculates top-level player UCL totals from all UCL
 * seasonStats docs (uclApps, uclGoals, uclAssists, uclCleanSheets).
 *
 * Usage:
 *   node scripts/seedUclS2S3.mjs            # dry run (default)
 *   node scripts/seedUclS2S3.mjs '--write'  # apply writes
 *
 * serviceAccountKey.json must be in the project root.
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve }       from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ─── CLI ──────────────────────────────────────────────────────────────────────

const WRITE   = process.argv.includes('--write')
const KEY_PATH = resolve(__dirname, '..', 'serviceAccountKey.json')

// ─── Source data ──────────────────────────────────────────────────────────────
// Extracted from uploaded screenshots. Approved by user before coding.
// Names here are the SHORT/DISPLAY form — alias map below resolves them
// to exact Firestore player names.

const S2_UCL_OUTFIELD = [
  { name: 'Nico Williams',  apps: 16, goals: 11, assists: 6 },
  { name: 'Lamine Yamal',   apps: 17, goals:  6, assists: 8 },
  { name: 'Musiala',        apps: 16, goals:  4, assists: 3 },
  { name: 'Haaland',        apps: 12, goals:  6, assists: 1 },
  { name: 'Ferran Torres',  apps: 11, goals:  5, assists: 3 },
  { name: 'Raphinha',       apps:  7, goals:  6, assists: 1 },
  { name: 'Pedri',          apps: 16, goals:  0, assists: 5 },
  { name: 'Saka',           apps:  6, goals:  3, assists: 0 },
  { name: 'Estevao',        apps:  6, goals:  1, assists: 0 },
  { name: 'Joao Neves',     apps: 10, goals:  0, assists: 0 },
]

const S2_UCL_GK = [
  { name: 'Joan Garcia', apps: 17, cleanSheets: 2, isGK: true },
]

const S3_UCL_OUTFIELD = [
  { name: 'Musiala',         apps: 15, goals: 13, assists: 7 },
  { name: 'Lamine Yamal',    apps: 15, goals:  6, assists: 7 },
  { name: 'Pedri',           apps: 15, goals:  2, assists: 7 },
  { name: 'Nico Williams',   apps: 14, goals:  5, assists: 2 },
  { name: 'Ekitike',         apps: 11, goals:  3, assists: 2 },
  { name: 'Wirtz',           apps: 10, goals:  3, assists: 1 },
  { name: 'Diomande',        apps:  6, goals:  2, assists: 2 },
  { name: 'Ferran Torres',   apps:  5, goals:  3, assists: 0 },
  { name: 'Adeyemi',         apps:  5, goals:  1, assists: 1 },
  { name: 'Julian Alvarez',  apps:  4, goals:  2, assists: 1 },
  { name: 'Endrick',         apps:  2, goals:  0, assists: 0 },
]

const S3_UCL_GK = [
  { name: 'Joan Garcia', apps: 15, cleanSheets: 4, isGK: true },
]

// ─── Alias map ────────────────────────────────────────────────────────────────
// Maps normalised source names → exact Firestore player names.
// Only aliases confirmed by the user are included.

const ALIASES = {
  'musiala':        'Jamal Musiala',
  'haaland':        'Erling Haaland',
  'saka':           'Bukayo Saka',
  'estevao':        'Estêvão',
  'joao neves':     'João Neves',
  'joan garcia':    'Joan García',
  'ekitike':        'Hugo Ekitéké',
  'wirtz':          'Florian Wirtz',
  'diomande':       'Yan Diomande',
  'adeyemi':        'Karim Adeyemi',
  'julian alvarez': 'Julián Álvarez',
  'endrick':        'Endrick',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalise(str) {
  return (str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// Resolve a source name to the canonical Firestore name.
// Returns the canonical name string, or null if unresolvable.
function resolveAlias(sourceName) {
  const norm = normalise(sourceName)
  return ALIASES[norm] ?? sourceName  // fall through to original if no alias needed
}

function calc(apps, goals, assists) {
  const contrib  = goals + assists
  const gPerGame = apps > 0 ? parseFloat((goals   / apps).toFixed(2)) : 0
  const aPerGame = apps > 0 ? parseFloat((assists  / apps).toFixed(2)) : 0
  const cPerGame = apps > 0 ? parseFloat((contrib  / apps).toFixed(2)) : 0
  return { contrib, gPerGame, aPerGame, cPerGame }
}

function calcGK(apps, cleanSheets) {
  const csPerGame = apps > 0 ? parseFloat((cleanSheets / apps).toFixed(2)) : 0
  return { csPerGame }
}

// ─── Firebase ─────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  let sa
  try { sa = JSON.parse(readFileSync(KEY_PATH, 'utf8')) }
  catch (e) { console.error(`\nCould not read serviceAccountKey.json: ${e.message}\n`); process.exit(1) }
  if (!sa.project_id) { console.error('\nMissing project_id in key file\n'); process.exit(1) }
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
  return admin.firestore()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  console.log('\n══════════════════════════════════════════════════')
  console.log(` seedUclS2S3.mjs — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (read-only)'}`)
  console.log('══════════════════════════════════════════════════\n')

  // ── 1. Read club ────────────────────────────────────────────────────────────
  const clubsSnap = await db.collection('clubs').get()
  if (clubsSnap.empty) { console.error('No clubs found'); process.exit(1) }
  // Use the first club (single-save app)
  const clubDoc = clubsSnap.docs[0]
  const clubId  = clubDoc.id
  console.log(`Club: "${clubDoc.data().name}" — clubId: ${clubId}\n`)

  // ── 2. Resolve S2 and S3 seasonIds ─────────────────────────────────────────
  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', clubId)
    .get()

  const seasonsByLabel = {}
  seasonsSnap.docs.forEach(d => {
    const label = d.data().label
    if (label) seasonsByLabel[label] = d.id
  })

  const s2Id = seasonsByLabel['S2']
  const s3Id = seasonsByLabel['S3']

  if (!s2Id) { console.error('ERROR: S2 season not found in Firestore'); process.exit(1) }
  if (!s3Id) { console.error('ERROR: S3 season not found in Firestore'); process.exit(1) }

  console.log(`S2 seasonId: ${s2Id}`)
  console.log(`S3 seasonId: ${s3Id}\n`)

  // ── 3. Build player name → id map ──────────────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', clubId)
    .get()

  // Map: normalised name → [{ id, name }]  (array to catch duplicates)
  const playersByNorm = {}
  playersSnap.docs.forEach(d => {
    const name = d.data().name
    const key  = normalise(name)
    if (!playersByNorm[key]) playersByNorm[key] = []
    playersByNorm[key].push({ id: d.id, name })
  })

  console.log(`Players loaded: ${playersSnap.size}\n`)

  // ── 4. Load existing UCL seasonStats to detect existing docs ────────────────
  const existingSnap = await db.collection('seasonStats')
    .where('scope', '==', 'UCL')
    .get()

  // Set of "playerId|seasonId" for quick existence check
  const existingKeys = new Set(
    existingSnap.docs.map(d => `${d.data().playerId}|${d.data().seasonId}`)
  )
  console.log(`Existing UCL seasonStats docs: ${existingSnap.size}\n`)

  // ── 5. Build docs to create ─────────────────────────────────────────────────

  const toCreate       = []  // { seasonLabel, doc }
  const skippedExisting = []
  const missingPlayers = []
  const ambiguousPlayers = []

  function processEntry(entry, seasonId, seasonLabel) {
    const canonical = resolveAlias(entry.name)
    const normKey   = normalise(canonical)
    const matches   = playersByNorm[normKey] ?? []

    if (matches.length === 0) {
      missingPlayers.push({ sourceName: entry.name, canonical, seasonLabel })
      return
    }
    if (matches.length > 1) {
      ambiguousPlayers.push({ sourceName: entry.name, canonical, matches: matches.map(m => m.id), seasonLabel })
      return
    }

    const { id: playerId, name: playerName } = matches[0]
    const existKey = `${playerId}|${seasonId}`

    if (existingKeys.has(existKey)) {
      skippedExisting.push({ playerName, seasonLabel })
      return
    }

    const goals   = entry.goals   ?? 0
    const assists = entry.assists ?? 0
    const apps    = entry.apps    ?? 0

    const { contrib, gPerGame, aPerGame, cPerGame } = calc(apps, goals, assists)

    const docData = {
      clubId,
      seasonId,
      playerId,
      playerName,
      scope:    'UCL',
      isGK:     entry.isGK ?? false,
      apps,
      goals,
      assists,
      contrib,
      gPerGame,
      aPerGame,
      cPerGame,
      cleanSheets: entry.isGK ? (entry.cleanSheets ?? 0) : null,
      csPerGame:   entry.isGK ? calcGK(apps, entry.cleanSheets ?? 0).csPerGame : null,
    }

    toCreate.push({ seasonLabel, playerName, docData })
  }

  // S2
  for (const e of S2_UCL_OUTFIELD) processEntry(e, s2Id, 'S2')
  for (const e of S2_UCL_GK)       processEntry(e, s2Id, 'S2')
  // S3
  for (const e of S3_UCL_OUTFIELD) processEntry(e, s3Id, 'S3')
  for (const e of S3_UCL_GK)       processEntry(e, s3Id, 'S3')

  // ── 6. Report plan ──────────────────────────────────────────────────────────

  console.log('─────────────────────────────────────────────────')
  console.log(' PLAN')
  console.log('─────────────────────────────────────────────────')

  if (toCreate.length) {
    console.log(`\n  Would create (${toCreate.length}):`)
    toCreate.forEach(({ seasonLabel, playerName, docData }) => {
      console.log(`    ${seasonLabel}  ${playerName.padEnd(22)}  apps:${docData.apps}  g:${docData.goals}  a:${docData.assists}  cs:${docData.cleanSheets ?? '—'}`)
    })
  }

  if (skippedExisting.length) {
    console.log(`\n  Skipped (already exist) (${skippedExisting.length}):`)
    skippedExisting.forEach(({ playerName, seasonLabel }) =>
      console.log(`    ${seasonLabel}  ${playerName}`))
  }

  if (missingPlayers.length) {
    console.log(`\n  ⚠️  Missing players — no Firestore match (${missingPlayers.length}):`)
    missingPlayers.forEach(({ sourceName, canonical, seasonLabel }) =>
      console.log(`    ${seasonLabel}  source="${sourceName}"  canonical="${canonical}"`))
  }

  if (ambiguousPlayers.length) {
    console.log(`\n  ⚠️  Ambiguous players — multiple matches (${ambiguousPlayers.length}):`)
    ambiguousPlayers.forEach(({ sourceName, canonical, matches, seasonLabel }) =>
      console.log(`    ${seasonLabel}  source="${sourceName}"  canonical="${canonical}"  ids=[${matches.join(', ')}]`))
  }

  console.log('\n─────────────────────────────────────────────────')
  console.log(` wouldCreate:      ${toCreate.length}`)
  console.log(` skippedExisting:  ${skippedExisting.length}`)
  console.log(` missingPlayers:   ${missingPlayers.length}`)
  console.log(` ambiguousPlayers: ${ambiguousPlayers.length}`)
  console.log('─────────────────────────────────────────────────\n')

  if (!WRITE) {
    console.log(' Dry run complete. Pass \'--write\' to apply.\n')
    process.exit(0)
  }

  // ── 7. Write UCL seasonStats docs ──────────────────────────────────────────

  console.log('Writing UCL seasonStats docs...\n')
  let created = 0
  for (const { seasonLabel, playerName, docData } of toCreate) {
    await db.collection('seasonStats').add(docData)
    console.log(`  ✓ ${seasonLabel}  UCL · ${playerName}`)
    created++
  }
  console.log(`\n  Created: ${created}\n`)

  // ── 8. Recalculate top-level UCL totals for affected players ────────────────
  // Collect the distinct playerIds we just created docs for, plus any
  // that already had UCL docs. Then sum ALL UCL docs for each player.

  const affectedPlayerIds = new Set([
    ...toCreate.map(({ docData }) => docData.playerId),
  ])

  if (affectedPlayerIds.size === 0) {
    console.log('No players affected — skipping UCL totals recalc.\n')
    process.exit(0)
  }

  console.log(`Recalculating UCL totals for ${affectedPlayerIds.size} player(s)...\n`)

  // Reload all UCL docs (includes what we just wrote)
  const allUclSnap = await db.collection('seasonStats')
    .where('scope', '==', 'UCL')
    .get()

  // Group by playerId
  const uclByPlayer = {}
  allUclSnap.docs.forEach(d => {
    const { playerId } = d.data()
    if (!playerId) return
    if (!uclByPlayer[playerId]) uclByPlayer[playerId] = []
    uclByPlayer[playerId].push(d.data())
  })

  let totalUpdated = 0
  for (const playerId of affectedPlayerIds) {
    const docs = uclByPlayer[playerId] ?? []

    const uclApps        = docs.reduce((s, d) => s + (d.apps        ?? 0), 0)
    const uclGoals       = docs.reduce((s, d) => s + (d.goals       ?? 0), 0)
    const uclAssists     = docs.reduce((s, d) => s + (d.assists     ?? 0), 0)
    const uclCleanSheets = docs.reduce((s, d) => s + (d.cleanSheets ?? 0), 0)

    // Only write cleanSheets if any doc is a GK
    const isGK = docs.some(d => d.isGK)

    const update = {
      uclApps,
      uclGoals,
      uclAssists,
    }
    if (isGK) update.uclCleanSheets = uclCleanSheets

    await db.collection('players').doc(playerId).update(update)

    const nameDoc = playersSnap.docs.find(d => d.id === playerId)
    const pName   = nameDoc ? nameDoc.data().name : playerId
    console.log(`  ✓ ${pName.padEnd(24)}  uclApps:${uclApps}  uclGoals:${uclGoals}  uclAssists:${uclAssists}${isGK ? `  uclCS:${uclCleanSheets}` : ''}`)
    totalUpdated++
  }

  console.log(`\n  UCL totals updated: ${totalUpdated}`)

  console.log('\n══════════════════════════════════════════════════')
  console.log(` Done.`)
  console.log(` created: ${created}  |  uclTotalsUpdated: ${totalUpdated}`)
  console.log('══════════════════════════════════════════════════\n')
}

main().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1) })
