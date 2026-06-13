/**
 * auditAndPatchTeamLogos.mjs
 *
 * Audits and patches team logo identity for UCL opponents and transfer clubs.
 * Default: dry-run (read-only). Use --write to apply patches to Firestore.
 *
 * What it checks:
 *   STAGE 1  Load reference data from disk (opponents-seed.json, transfer-clubs.json)
 *   STAGE 2  Resolve club + target season + fetch Firestore (opponents, matches, transfers)
 *   STAGE 3  Audit opponents collection:
 *              - Does a doc exist for every UCL opponent in the target season?
 *              - Does each doc have all required identity fields?
 *              - Are sofifaTeamId / crestUrl correct against the seed?
 *              - Are shortName / abbreviation present (fields the importer currently omits)?
 *   STAGE 4  Audit transfer clubs:
 *              - Does every from_club / to_club on a transfer doc resolve in transfer-clubs.json?
 *              - Does the resolved sofifaTeamId agree with opponents-seed.json where both list the club?
 *   STAGE 5  Cross-check sofifaTeamId consistency between opponents-seed and transfer-clubs
 *   STAGE 6  Summary + importer gap analysis
 *   STAGE 7  (--write) Upsert corrected opponent docs; never touches stats/seasons/players/transfers
 *
 * --write patches:
 *   · Missing opponent docs: created from seed
 *   · Existing docs with wrong/missing fields: overwritten from seed (full replace, not merge)
 *   · Transfer clubs: no Firestore write — logo resolution is frontend-only (bundled JSON)
 *
 * Usage:
 *   node scripts/auditAndPatchTeamLogos.mjs --season S6
 *   node scripts/auditAndPatchTeamLogos.mjs --season S6 --clubId=<id>
 *   node scripts/auditAndPatchTeamLogos.mjs --season S6 --write
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
const SEED_PATH  = resolve(__dirname, '../data/opponents-seed.json')
const TC_PATH    = resolve(__dirname, '../data/transfer-clubs.json')
const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev/team'

// ─── Required fields that every opponents collection doc must carry ───────────
// These are the fields the app reads when resolving opponent logo + display name.
// shortName and abbreviation are NOT currently written by importSeason.mjs —
// that is the importer gap this script also documents.
const REQUIRED_OPPONENT_FIELDS = [
  'displayName',
  'shortName',
  'abbreviation',
  'country',
  'sofifaTeamId',
  'aliases',
  'crestUrl',
]

// ─── CLI ─────────────────────────────────────────────────────────────────────

const WRITE = process.argv.includes('--write')

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
    if (!snap.exists) { console.error(`\n✗ No club found with id: "${providedId}"\n`); process.exit(1) }
    return { id: snap.id, ...snap.data() }
  }
  const snap = await db.collection('clubs').get()
  if (snap.empty) { console.error('\n✗ No clubs found in Firestore.\n'); process.exit(1) }
  if (snap.docs.length > 1) {
    console.error('\n✗ Multiple clubs found. Pass --clubId=<id> to specify which club.\n')
    snap.docs.forEach(d => console.error(`     ${d.id}  "${d.data().name}"`))
    process.exit(1)
  }
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// ─── Normalisation helpers ────────────────────────────────────────────────────

// Must match the normalisation used in importSeason.mjs and opponentMatcher.mjs
function normName(raw) {
  return (raw ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normClubKey(s) { return (s || '').toLowerCase().trim() }

// ─── Output helpers ───────────────────────────────────────────────────────────

function header(t) {
  console.log('\n' + '─'.repeat(66))
  console.log('  ' + t)
  console.log('─'.repeat(66))
}

function row(label, value) {
  console.log(`  ${label.padEnd(46)} ${value}`)
}

const OK   = '✓'
const WARN = '⚠'
const FAIL = '✗'

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  if (!args.season) {
    console.error('\n✗ --season is required  (e.g. --season S6)\n')
    process.exit(1)
  }

  const seasonLabel = args.season

  console.log('\n══════════════════════════════════════════════════════════════════')
  console.log(`  auditAndPatchTeamLogos — ${WRITE ? '⚠️  WRITE MODE' : 'DRY RUN (default)'}`)
  console.log(`  Season : ${seasonLabel}`)
  console.log('══════════════════════════════════════════════════════════════════')

  // ════════════════════════════════════════════════════════════════
  // STAGE 1 — Load reference data from disk
  // ════════════════════════════════════════════════════════════════
  header('STAGE 1 — Reference Data')
  console.log()

  let opponentSeed, transferClubs
  try {
    opponentSeed = JSON.parse(readFileSync(SEED_PATH, 'utf8'))
    console.log(`  ${OK}  opponents-seed.json  (${opponentSeed.length} entries)`)
  } catch (e) {
    console.error(`  ${FAIL}  opponents-seed.json: ${e.message}`)
    process.exit(1)
  }
  try {
    transferClubs = JSON.parse(readFileSync(TC_PATH, 'utf8'))
    const tcCount = Object.keys(transferClubs).filter(k => k !== '_comment').length
    console.log(`  ${OK}  transfer-clubs.json  (${tcCount} keys)`)
  } catch (e) {
    console.error(`  ${FAIL}  transfer-clubs.json: ${e.message}`)
    process.exit(1)
  }

  // Build lookup maps from seed
  const seedByKey = new Map(opponentSeed.map(e => [e.opponentKey, e]))

  // Build alias → opponentKey map from seed (mirrors opponentMatcher.mjs logic)
  const aliasToKey = new Map()
  for (const entry of opponentSeed) {
    for (const alias of (entry.aliases ?? [])) {
      aliasToKey.set(normName(alias), entry.opponentKey)
    }
  }

  // Resolve a raw opponent name to its seed opponentKey (best-effort)
  function resolveToKey(rawName) {
    const n = normName(rawName)
    // 1. Exact alias match
    if (aliasToKey.has(n)) return aliasToKey.get(n)
    // 2. opponentKey direct match
    if (seedByKey.has(n.replace(/\s+/g, '-'))) return n.replace(/\s+/g, '-')
    return null
  }

  // ════════════════════════════════════════════════════════════════
  // STAGE 2 — Firestore: resolve club, season, load collections
  // ════════════════════════════════════════════════════════════════
  header('STAGE 2 — Firestore Data')
  console.log()

  const db   = initFirebase()
  const club = await resolveClub(db, args.clubId)
  console.log(`  Club : ${club.name}  (${club.id})`)
  console.log('  Loading Firestore data…\n')

  const [seasonsSnap, opponentsSnap, matchesSnap, transfersSnap] = await Promise.all([
    db.collection('seasons').where('clubId', '==', club.id).get(),
    db.collection('opponents').get(),
    db.collection('matches').get(),
    db.collection('transfers').get(),
  ])

  // Resolve the target season
  const seasons   = seasonsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const targetSzn = seasons.find(s => s.label === seasonLabel)
  if (!targetSzn) {
    console.error(`  ${FAIL}  Season "${seasonLabel}" not found in Firestore.\n`)
    console.error('  Seasons in Firestore: ' + seasons.map(s => s.label).join(', ') + '\n')
    process.exit(1)
  }
  console.log(`  ${OK}  Season "${seasonLabel}" found  (id: ${targetSzn.id})`)

  // Firestore opponent docs: key → { all fields }
  const fsOpponents = new Map()
  for (const doc of opponentsSnap.docs) {
    fsOpponents.set(doc.id, doc.data())  // doc.id IS the opponentKey
  }
  console.log(`  ${OK}  opponents collection  (${fsOpponents.size} docs)`)

  // S-season match docs
  const allMatchDocs  = matchesSnap.docs.map(d => ({ _docId: d.id, ...d.data() }))
  const seasonMatches = allMatchDocs.filter(d => d.seasonId === targetSzn.id)
  const uclMatches    = seasonMatches.filter(d => d.competition?.startsWith('UCL_'))
  console.log(`  ${OK}  ${seasonLabel} match docs  (${seasonMatches.length} total, ${uclMatches.length} UCL)`)

  // S-season transfer docs
  const allTransferDocs  = transfersSnap.docs.map(d => ({ _docId: d.id, ...d.data() }))
  const seasonTransfers  = allTransferDocs.filter(d => d.seasonId === targetSzn.id)
  console.log(`  ${OK}  ${seasonLabel} transfer docs  (${seasonTransfers.length} total)`)

  // Derive unique opponents from this season's UCL match docs
  const uniqueOpponentKeys = [...new Set(
    uclMatches.map(m => m.opponentKey).filter(Boolean)
  )]

  // ════════════════════════════════════════════════════════════════
  // STAGE 3 — Audit opponents collection
  // ════════════════════════════════════════════════════════════════
  header(`STAGE 3 — UCL Opponents Collection Audit  (${seasonLabel})`)
  console.log()
  console.log(`  ${uniqueOpponentKeys.length} unique opponentKey(s) found in ${seasonLabel} match docs:\n`)

  const opponentAuditRows = []
  const opponentPatches   = []    // { opponentKey, data } — for --write

  for (const oppKey of uniqueOpponentKeys.sort()) {
    const fsDoc  = fsOpponents.get(oppKey)
    const seed   = seedByKey.get(oppKey)

    const issues  = []
    const notices = []

    // ── Does the Firestore doc exist? ──────────────────────────────
    if (!fsDoc) {
      issues.push('MISSING from opponents collection — no Firestore doc exists')
    }

    // ── Does the seed have this key? ───────────────────────────────
    if (!seed) {
      issues.push(`NOT in opponents-seed.json — cannot auto-patch (add entry manually)`)
    }

    // ── Field-by-field checks on the existing Firestore doc ────────
    if (fsDoc && seed) {
      // sofifaTeamId
      if (fsDoc.sofifaTeamId == null || fsDoc.sofifaTeamId === 0) {
        issues.push(`sofifaTeamId is ${fsDoc.sofifaTeamId ?? 'null'} — crestUrl cannot be constructed`)
      } else if (fsDoc.sofifaTeamId !== seed.sofifaTeamId) {
        issues.push(`sofifaTeamId mismatch: Firestore has ${fsDoc.sofifaTeamId}, seed has ${seed.sofifaTeamId}`)
      }

      // crestUrl
      const expectedCrestUrl = `${WORKER_BASE}/${seed.sofifaTeamId}`
      if (!fsDoc.crestUrl) {
        issues.push('crestUrl is missing')
      } else if (fsDoc.crestUrl !== expectedCrestUrl) {
        issues.push(`crestUrl mismatch:\n       Firestore : "${fsDoc.crestUrl}"\n       Expected  : "${expectedCrestUrl}"`)
      }

      // displayName
      if (!fsDoc.displayName) {
        issues.push('displayName is missing')
      } else if (fsDoc.displayName !== seed.displayName) {
        notices.push(`displayName differs: Firestore "${fsDoc.displayName}" vs seed "${seed.displayName}"`)
      }

      // shortName — importer currently does NOT write this field
      if (!fsDoc.shortName) {
        notices.push(`shortName is absent (importer gap — not written by importSeason.mjs)`)
      }

      // abbreviation — importer currently does NOT write this field
      if (!fsDoc.abbreviation) {
        notices.push(`abbreviation is absent (importer gap — not written by importSeason.mjs)`)
      }

      // country
      if (!fsDoc.country) {
        notices.push('country is absent')
      }

      // aliases
      if (!Array.isArray(fsDoc.aliases) || fsDoc.aliases.length === 0) {
        notices.push('aliases is absent or empty')
      }
    }

    // ── Determine patch requirement ────────────────────────────────
    const needsPatch = seed && (issues.length > 0 || notices.some(n => n.includes('absent')))

    if (needsPatch) {
      opponentPatches.push({
        opponentKey: oppKey,
        data: {
          displayName:  seed.displayName,
          shortName:    seed.shortName    ?? seed.displayName,
          abbreviation: seed.abbreviation ?? null,
          country:      seed.country      ?? null,
          sofifaTeamId: seed.sofifaTeamId,
          aliases:      seed.aliases      ?? [],
          crestUrl:     `${WORKER_BASE}/${seed.sofifaTeamId}`,
        },
      })
    }

    opponentAuditRows.push({ oppKey, fsDoc, seed, issues, notices, needsPatch })

    // Print per-opponent result
    const icon = issues.length > 0 ? FAIL : (notices.length > 0 ? WARN : OK)
    console.log(`  ${icon}  ${oppKey}`)
    if (seed) {
      console.log(`       sofifaTeamId : ${seed.sofifaTeamId}  |  crestUrl : ${WORKER_BASE}/${seed.sofifaTeamId}`)
    }
    for (const issue of issues) {
      console.log(`       ${FAIL}  ${issue}`)
    }
    for (const notice of notices) {
      console.log(`       ${WARN}  ${notice}`)
    }
    if (issues.length === 0 && notices.length === 0) {
      console.log(`       All required fields present and correct.`)
    }
    console.log()
  }

  // Summary counts
  const oppMissing   = opponentAuditRows.filter(r => !r.fsDoc).length
  const oppBadFields = opponentAuditRows.filter(r => r.fsDoc && r.issues.length > 0).length
  const oppNotices   = opponentAuditRows.filter(r => r.notices.length > 0).length
  const oppClean     = opponentAuditRows.filter(r => r.issues.length === 0 && r.notices.length === 0).length

  row('Opponents checked',           String(uniqueOpponentKeys.length))
  row(`${OK}  Fully correct`,        String(oppClean))
  row(`${WARN}  Notices (non-blocking)`, String(oppNotices))
  row(`${FAIL}  Missing or bad fields`,  String(oppMissing + oppBadFields))
  row('Will patch on --write',       String(opponentPatches.length))

  // ════════════════════════════════════════════════════════════════
  // STAGE 4 — Audit transfer club resolution
  // ════════════════════════════════════════════════════════════════
  header(`STAGE 4 — Transfer Club Resolution Audit  (${seasonLabel})`)
  console.log()
  console.log(`  Checking every from_club / to_club against transfer-clubs.json.\n`)
  console.log(`  Note: logo resolution for transfers is frontend-only (bundled JSON).`)
  console.log(`  A club name that resolves here will display a crest once the PWA`)
  console.log(`  is rebuilt with the current transfer-clubs.json.\n`)

  // Collect unique club names from transfer docs
  const clubNames = new Set()
  for (const t of seasonTransfers) {
    if (t.from_club) clubNames.add(t.from_club)
    if (t.to_club)   clubNames.add(t.to_club)
  }

  const transferClubRows  = []
  const unresolvableClubs = []

  for (const raw of [...clubNames].sort()) {
    const key     = normClubKey(raw)
    const entry   = transferClubs[key]
    const seedKey = resolveToKey(raw)
    const seedEntry = seedKey ? seedByKey.get(seedKey) : null

    const issues  = []
    const notices = []

    if (!entry) {
      issues.push(`"${key}" not found in transfer-clubs.json — logo will not resolve`)
      unresolvableClubs.push(raw)
    } else {
      if (!entry.sofifaTeamId || entry.sofifaTeamId === 0) {
        issues.push(`sofifaTeamId is ${entry.sofifaTeamId ?? 'null'} — crestUrl cannot be constructed`)
      }
      if (!entry.displayName) {
        notices.push('displayName is absent in transfer-clubs.json entry')
      }
      // Cross-check against opponents-seed.json if the club also appears there
      if (seedEntry && seedEntry.sofifaTeamId !== entry.sofifaTeamId) {
        issues.push(
          `sofifaTeamId mismatch with opponents-seed.json:\n` +
          `       transfer-clubs.json : ${entry.sofifaTeamId}\n` +
          `       opponents-seed.json : ${seedEntry.sofifaTeamId}\n` +
          `       Verify which is correct at sofifa.com/team/${entry.sofifaTeamId} and sofifa.com/team/${seedEntry.sofifaTeamId}`
        )
      }
    }

    transferClubRows.push({ raw, key, entry, seedEntry, issues, notices })

    const icon = issues.length > 0 ? FAIL : (notices.length > 0 ? WARN : OK)
    console.log(`  ${icon}  "${raw}"  →  key: "${key}"`)
    if (entry) {
      console.log(`       ${OK}  Resolved  displayName:"${entry.displayName}"  sofifaTeamId:${entry.sofifaTeamId}`)
    }
    for (const issue of issues) console.log(`       ${FAIL}  ${issue}`)
    for (const notice of notices) console.log(`       ${WARN}  ${notice}`)
    console.log()
  }

  const tcResolved     = transferClubRows.filter(r => r.entry && r.issues.length === 0).length
  const tcBadOrMissing = transferClubRows.filter(r => !r.entry || r.issues.length > 0).length
  const tcIdMismatch   = transferClubRows.filter(r => r.issues.some(i => i.includes('mismatch'))).length

  row('Transfer club names checked',   String(clubNames.size))
  row(`${OK}  Resolved correctly`,     String(tcResolved))
  row(`${FAIL}  Unresolvable or bad`,  String(tcBadOrMissing))
  row('sofifaTeamId cross-check failures', String(tcIdMismatch))

  if (unresolvableClubs.length > 0) {
    console.log('\n  Unresolvable clubs — add these to data/transfer-clubs.json:')
    for (const raw of unresolvableClubs) {
      console.log(`    "${normClubKey(raw)}": { "displayName": "${raw}", "sofifaTeamId": 0 }`)
    }
  }

  // ════════════════════════════════════════════════════════════════
  // STAGE 5 — Cross-check sofifaTeamId between both reference files
  // ════════════════════════════════════════════════════════════════
  header('STAGE 5 — sofifaTeamId Cross-Check (seed vs transfer-clubs)')
  console.log()
  console.log(`  Clubs that appear in BOTH files should have matching sofifaTeamId.\n`)

  const crossCheckIssues = []

  for (const entry of opponentSeed) {
    // Try to find a matching entry in transfer-clubs.json
    const tcKey   = normClubKey(entry.displayName)
    const tcEntry = transferClubs[tcKey]
      ?? transferClubs[normClubKey(entry.shortName ?? '')]
      ?? null

    if (!tcEntry) continue  // Not in transfer-clubs.json — fine, not every opponent is a transfer club

    if (tcEntry.sofifaTeamId !== entry.sofifaTeamId) {
      crossCheckIssues.push({
        club:      entry.displayName,
        seedId:    entry.sofifaTeamId,
        tcId:      tcEntry.sofifaTeamId,
        tcKey,
      })
      console.log(`  ${FAIL}  "${entry.displayName}"`)
      console.log(`       opponents-seed.json  : sofifaTeamId ${entry.sofifaTeamId}`)
      console.log(`       transfer-clubs.json  : sofifaTeamId ${tcEntry.sofifaTeamId}  (key: "${tcKey}")`)
      console.log(`       Verify: sofifa.com/team/${entry.sofifaTeamId}  vs  sofifa.com/team/${tcEntry.sofifaTeamId}`)
      console.log()
    }
  }

  if (crossCheckIssues.length === 0) {
    console.log(`  ${OK}  No sofifaTeamId mismatches found between the two reference files.`)
  }

  row('Cross-check mismatches', String(crossCheckIssues.length))

  // ════════════════════════════════════════════════════════════════
  // STAGE 6 — Summary + importer gap analysis
  // ════════════════════════════════════════════════════════════════

  const totalIssues = (oppMissing + oppBadFields) + tcBadOrMissing + crossCheckIssues.length

  console.log('\n' + '═'.repeat(66))
  console.log('  AUDIT SUMMARY')
  console.log('═'.repeat(66))
  console.log()
  row('UCL opponents with missing/bad Firestore docs', String(oppMissing + oppBadFields))
  row('Transfer clubs unresolvable or mismatched',     String(tcBadOrMissing))
  row('sofifaTeamId cross-check mismatches',           String(crossCheckIssues.length))
  row('Opponent docs that will be patched (--write)',  String(opponentPatches.length))
  console.log()

  // ── Importer gap analysis ────────────────────────────────────────────────
  header('Importer Gap Analysis — importSeason.mjs')
  console.log(`
  The following gaps in importSeason.mjs can cause logo issues in future seasons.
  No immediate fix is needed for the current import (this script patches Firestore).
  Apply the fix to importSeason.mjs before importing the next season.

  GAP 1 — shortName and abbreviation not written to opponent docs
  ──────────────────────────────────────────────────────────────
  Current importer writes to opponents collection:
    displayName, country, sofifaTeamId, aliases, crestUrl

  Missing:
    shortName    — used by app for compact display in tight UI
    abbreviation — used by app for badge/table abbreviation

  Fix: in the newOpponentDocs .map() (around the "New opponent docs" comment),
  add shortName and abbreviation from the seed entry:

    data: {
      displayName:  o.seedEntry.displayName,
      shortName:    o.seedEntry.shortName    ?? o.seedEntry.displayName,
      abbreviation: o.seedEntry.abbreviation ?? null,   // ← add
      country:      o.seedEntry.country      ?? null,
      sofifaTeamId: o.seedEntry.sofifaTeamId,
      aliases:      o.seedEntry.aliases      ?? [],
      crestUrl:     \`\${WORKER_BASE}/\${o.seedEntry.sofifaTeamId}\`,
    }

  GAP 2 — Existing opponent docs are never updated, only created
  ──────────────────────────────────────────────────────────────
  If an opponent doc already exists in Firestore (fsExists: true), the importer
  skips it even if the doc has wrong or missing fields. This means a bad doc
  from a manual seed, an old import, or a seed update will silently persist.

  Fix: change willCreate logic so that docs with missing/wrong sofifaTeamId or
  crestUrl are also included in newOpponentDocs (using batch.set to overwrite).
  Alternatively, always upsert all matched opponents regardless of fsExists.

  This script (auditAndPatchTeamLogos.mjs --write) is the remediation tool
  for any season where this gap caused a missing logo.
`)

  // ── Write safety gate ────────────────────────────────────────────────────
  if (!WRITE) {
    console.log('═'.repeat(66))
    console.log('  DRY RUN COMPLETE — no data was written.')
    if (opponentPatches.length > 0) {
      console.log(`  ${opponentPatches.length} opponent doc(s) would be patched.`)
      console.log('  Run with --write to apply.')
    } else {
      console.log('  No Firestore writes needed.')
    }
    if (tcBadOrMissing > 0 || crossCheckIssues.length > 0) {
      console.log(`\n  Transfer club issues require manual fixes to data files + PWA rebuild.`)
      console.log('  No --write flag will fix these — they are resolved in the frontend.')
    }
    console.log('═'.repeat(66) + '\n')
    return
  }

  // ════════════════════════════════════════════════════════════════
  // STAGE 7 — Apply patches (--write only)
  // ════════════════════════════════════════════════════════════════
  header('STAGE 7 — Applying Patches')
  console.log()

  if (opponentPatches.length === 0) {
    console.log('  Nothing to patch in opponents collection. Exiting.\n')
    return
  }

  // Use a batch — all patches are atomic
  const batch   = db.batch()
  let   opCount = 0

  for (const { opponentKey, data } of opponentPatches) {
    const ref = db.collection('opponents').doc(opponentKey)
    batch.set(ref, data)   // full replace — always write the correct complete doc
    opCount++
    console.log(`  ${OK}  Staged: opponents/${opponentKey}`)
    console.log(`       sofifaTeamId : ${data.sofifaTeamId}`)
    console.log(`       crestUrl     : ${data.crestUrl}`)
    console.log(`       shortName    : ${data.shortName}`)
    console.log()
  }

  console.log(`  Committing ${opCount} opponent doc patch(es)…`)
  try {
    await batch.commit()
  } catch (err) {
    console.error(`\n  ${FAIL}  Batch commit FAILED. Firestore is unchanged.`)
    console.error(`  Error: ${err.message}\n`)
    process.exit(1)
  }

  console.log(`  ${OK}  Batch committed. ${opCount} opponent doc(s) patched.`)

  // ── Post-write verification ──────────────────────────────────────────────
  console.log('\n  Verifying patches…\n')
  const postSnap = await db.collection('opponents').get()
  const postDocs = new Map(postSnap.docs.map(d => [d.id, d.data()]))
  let   allGood  = true

  for (const { opponentKey, data } of opponentPatches) {
    const live = postDocs.get(opponentKey)
    if (!live) {
      console.log(`  ${FAIL}  ${opponentKey} — doc missing after write`)
      allGood = false
    } else if (live.sofifaTeamId !== data.sofifaTeamId) {
      console.log(`  ${FAIL}  ${opponentKey} — sofifaTeamId mismatch after write`)
      allGood = false
    } else if (live.crestUrl !== data.crestUrl) {
      console.log(`  ${FAIL}  ${opponentKey} — crestUrl mismatch after write`)
      allGood = false
    } else {
      console.log(`  ${OK}  ${opponentKey}  sofifaTeamId:${live.sofifaTeamId}  crestUrl verified`)
    }
  }

  console.log('\n' + '═'.repeat(66))
  if (allGood) {
    console.log(`  ✅  Patch complete. ${opponentPatches.length} opponent doc(s) corrected.`)
    console.log('  UCL logo identity is now consistent with opponents-seed.json.')
    console.log('  For transfer club logos: deploy updated transfer-clubs.json with a')
    console.log('  version bump (sw-version.js + vite.config.js) to complete the fix.')
  } else {
    console.log('  ⚠   Patch done but post-write verification found mismatches.')
    console.log('  Check Firestore directly and re-run the dry-run audit.')
  }
  console.log('═'.repeat(66) + '\n')
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1) })
