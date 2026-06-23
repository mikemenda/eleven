/**
 * auditS1UclStats.mjs
 *
 * Read-only audit of S1 UCL player statistics.
 *
 * FC Richport reached the UCL Final in S1 (lost to Real Madrid 1–5).
 * This script determines whether S1 UCL player stats exist in either of
 * the two possible locations:
 *
 *   (A) seasonStats COLLECTION — scope:'UCL' docs with S1 seasonId
 *       (the target canonical source)
 *
 *   (B) embedded player.seasonStats[] array — S1 entries that contain
 *       non-zero uclApps sub-fields
 *       (the current working source for UCL data in the embedded array)
 *
 * It does NOT create, fabricate, or modify any data.
 * If source data is absent, the script explains exactly what input is needed.
 *
 * Club scoping:
 *   - Pass --clubId=<id> to target a specific club.
 *   - If omitted, auto-detects only when exactly one club exists.
 *   - If multiple clubs exist, stops and asks for --clubId.
 *   - Never hardcodes any club ID.
 *
 * Usage:
 *   node scripts/auditS1UclStats.mjs
 *   node scripts/auditS1UclStats.mjs --clubId=<id>
 *
 * No --write mode. This script is read-only only.
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

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

// Guard: no write mode exists for this script
if (args.write) {
  console.error('\nauditS1UclStats.mjs is read-only. There is no --write mode.\n')
  process.exit(1)
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  auditS1UclStats — read-only')
  console.log('══════════════════════════════════════════════════════════')

  const club = await resolveClub(db, args.clubId)
  console.log(`\n  Club : ${club.name}`)
  console.log(`  ID   : ${club.id}`)

  // ── 1. Find the S1 season doc ─────────────────────────────────────────────

  const seasonsSnap = await db.collection('seasons')
    .where('clubId', '==', club.id)
    .get()

  const s1Doc = seasonsSnap.docs.find(d => d.data().label === 'S1')

  if (!s1Doc) {
    console.log('\n  ✗ No season with label "S1" found for this club.')
    console.log('    Cannot audit S1 UCL stats without an S1 season document.\n')
    return
  }

  const s1SeasonId = s1Doc.id
  const s1         = s1Doc.data()

  console.log('\n  S1 season doc found:')
  console.log(`    seasonId        : ${s1SeasonId}`)
  console.log(`    year            : ${s1.year            ?? '(not set)'}`)
  console.log(`    uclEntered      : ${s1.uclEntered      ?? '(not set)'}`)
  console.log(`    uclResult       : ${s1.uclResult       ?? '(not set)'}`)
  console.log(`    uclFinalOpponent: ${s1.uclFinalOpponent ?? '(not set)'}`)
  console.log(`    uclFinalScore   : ${s1.uclFinalScore   ?? '(not set)'}`)

  // ── 2. Check A: seasonStats COLLECTION for S1 UCL docs ───────────────────
  //
  // Load all scope:'UCL' docs. We do NOT filter by clubId here because the
  // S2/S3 docs carry corrupted clubId values and we want a consistent
  // read pattern. We scope to this club by matching seasonId.

  header('A — seasonStats Collection  (scope:UCL, S1 seasonId)')

  const uclCollSnap = await db.collection('seasonStats')
    .where('scope', '==', 'UCL')
    .get()

  const s1CollDocs = uclCollSnap.docs
    .map(d => ({ _docId: d.id, ...d.data() }))
    .filter(d => d.seasonId === s1SeasonId)

  if (s1CollDocs.length === 0) {
    console.log('\n  ✗ No scope:UCL docs found in the collection for S1.')
    console.log('    (The existing seed script — seedUclS2S3.mjs — only covered S2 and S3.)')
  } else {
    console.log(`\n  ✓ ${s1CollDocs.length} scope:UCL doc(s) already exist for S1:\n`)
    // Sort by player name for readable output
    s1CollDocs.sort((a, b) => (a.playerName ?? '').localeCompare(b.playerName ?? ''))
    for (const d of s1CollDocs) {
      const nm    = (d.playerName ?? d.playerId ?? '(unknown)').padEnd(28)
      const csStr = d.isGK ? `  cs:${String(d.cleanSheets ?? '?').padStart(2)}` : ''
      const clubOk = d.clubId === club.id ? '' : `  ⚠ clubId:"${d.clubId}" (corrupted)`
      console.log(`    ${nm}  apps:${String(d.apps ?? '?').padStart(3)}  g:${String(d.goals ?? '?').padStart(3)}  a:${String(d.assists ?? '?').padStart(3)}${csStr}${clubOk}`)
    }
  }

  // ── 3. Check B: embedded player.seasonStats[] for S1 UCL sub-fields ──────

  header('B — Embedded player.seasonStats[]  (S1 entry, uclApps sub-fields)')

  const playersSnap = await db.collection('players')
    .where('clubId', '==', club.id)
    .get()

  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  const withS1UclData  = []   // S1 entry exists AND uclApps > 0
  const withS1NoUcl    = []   // S1 entry exists but uclApps = 0 or absent
  const noS1Entry      = []   // no S1 entry in embedded array at all

  for (const player of players) {
    if (player.isHistoricalStub) continue

    const embedded = Array.isArray(player.seasonStats) ? player.seasonStats : []
    const s1Entry  = embedded.find(e => e.label === 'S1')

    if (!s1Entry) {
      noS1Entry.push(player)
      continue
    }

    if ((s1Entry.uclApps ?? 0) > 0) {
      withS1UclData.push({ player, entry: s1Entry })
    } else {
      withS1NoUcl.push({ player, entry: s1Entry })
    }
  }

  // Players with embedded S1 UCL data
  if (withS1UclData.length > 0) {
    console.log(`\n  ✓ ${withS1UclData.length} player(s) have non-zero uclApps in their embedded S1 entry:\n`)
    withS1UclData.sort((a, b) => a.player.name.localeCompare(b.player.name))
    for (const { player, entry } of withS1UclData) {
      const nm    = player.name.padEnd(28)
      const pos   = (player.position ?? '?').padEnd(10)
      const csStr = (entry.uclCleanSheets ?? 0) > 0 ? `  uclCS:${entry.uclCleanSheets}` : ''
      console.log(`    ${nm}  ${pos}  uclApps:${String(entry.uclApps ?? 0).padStart(3)}  uclG:${String(entry.uclGoals ?? 0).padStart(3)}  uclA:${String(entry.uclAssists ?? 0).padStart(3)}${csStr}`)
    }
    console.log()
    console.log('  → This embedded data is the available source for seeding S1 UCL collection docs.')
    console.log('  → A script (seedS1UclStats.mjs) can read these sub-fields and create the')
    console.log('    missing scope:UCL collection docs. Wait for approval before building it.')
  } else {
    console.log('\n  ✗ No players have non-zero uclApps in their embedded S1 seasonStats entry.')
  }

  // Players with S1 entry but no UCL sub-fields
  if (withS1NoUcl.length > 0) {
    console.log(`\n  ${withS1NoUcl.length} player(s) have an S1 entry but uclApps = 0 or absent:`)
    withS1NoUcl.sort((a, b) => a.player.name.localeCompare(b.player.name))
    for (const { player, entry } of withS1NoUcl) {
      const nm = player.name.padEnd(28)
      console.log(`    ${nm}  apps:${String(entry.apps ?? 0).padStart(3)}  uclApps:${String(entry.uclApps ?? 0).padStart(3)}`)
    }
    console.log('  (These players were in the squad during S1 but did not appear in UCL — expected.)')
  }

  // Players with no S1 entry at all
  if (noS1Entry.length > 0) {
    console.log(`\n  ${noS1Entry.length} non-stub player(s) have no S1 entry in their embedded array:`)
    noS1Entry.sort((a, b) => a.name.localeCompare(b.name))
    for (const p of noS1Entry) {
      console.log(`    ${p.name.padEnd(28)}  status:${p.status ?? '?'}  totalApps:${p.apps ?? 0}`)
    }
    console.log('  (These players joined after S1 — expected.)')
  }

  // ── 4. Summary and recommendation ────────────────────────────────────────

  header('Summary & Recommendation')

  const collHasS1  = s1CollDocs.length > 0
  const embHasS1   = withS1UclData.length > 0

  console.log()

  if (collHasS1) {
    // Collection already has S1 UCL docs
    console.log('  ✓ S1 UCL collection docs already exist.')
    console.log(`    ${s1CollDocs.length} scope:UCL doc(s) found for S1 in the collection.`)
    console.log('    No seeding needed for S1 UCL.')

    // Check for clubId corruption on these docs
    const corruptS1 = s1CollDocs.filter(d => d.clubId !== club.id)
    if (corruptS1.length > 0) {
      console.log(`\n  ⚠ ${corruptS1.length} S1 UCL doc(s) have corrupted clubId.`)
      console.log('    Run fixSeasonStatsClubId.mjs to repair them.')
    }

  } else if (embHasS1) {
    // No collection docs but embedded source data exists
    console.log('  ⚠ S1 UCL collection docs are MISSING.')
    console.log(`    But embedded source data exists for ${withS1UclData.length} player(s) — listed above.\n`)
    console.log('  Recommended next step:')
    console.log('    Approve building scripts/seedS1UclStats.mjs.')
    console.log('    That script will read the uclApps/uclGoals/uclAssists sub-fields from each')
    console.log("    player's embedded S1 seasonStats entry and create scope:'UCL' collection docs.")
    console.log('    It will follow the same dry-run-first pattern as seedUclS2S3.mjs.')

  } else {
    // No collection docs AND no embedded source data
    console.log('  ✗ S1 UCL collection docs are MISSING.')
    console.log('    No embedded source data found (uclApps = 0 or absent on all S1 entries).\n')
    console.log('  To seed S1 UCL stats, you will need to provide the player data manually.')
    console.log('  Required for each player who appeared in UCL during S1:\n')
    console.log('    name        — exact name as stored in Firestore')
    console.log('    apps        — UCL appearances in S1')
    console.log('    goals       — UCL goals in S1')
    console.log('    assists     — UCL assists in S1')
    console.log('    cleanSheets — (GK only) UCL clean sheets in S1\n')
    console.log('  Once you provide this data, a seedS1UclStats.mjs script will be built.')
    console.log('  Do not share data here until the audit is reviewed and approved.')
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  Audit complete. No data was written.')
  console.log('══════════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
