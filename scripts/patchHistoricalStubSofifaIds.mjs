/**
 * patchHistoricalStubSofifaIds.mjs
 *
 * Adds sofifaId to historical stub player documents where we have a confirmed ID.
 * A historical stub is a player doc created to make old OUT transfers linkable —
 * these players were sold before the app's player-tracking began.
 *
 * Safety rules:
 *   • Only updates documents where isHistoricalStub === true
 *   • Only updates the sofifaId field — nothing else is touched
 *   • Never creates new player documents
 *   • Never touches transfers or any other collection
 *   • Generated Player has no sofifaId entry and will remain with silhouette
 *   • Dry-run by default — pass --write to apply
 *
 * Usage:
 *   node scripts/patchHistoricalStubSofifaIds.mjs              # dry run
 *   node scripts/patchHistoricalStubSofifaIds.mjs --write      # write to Firestore
 *   node scripts/patchHistoricalStubSofifaIds.mjs --club <id>  # override auto-detect
 *
 * All sofifaIds verified against sofifa.com/player/{id}/ URLs.
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const admin   = require('firebase-admin')

// ─── Approved sofifaId map ────────────────────────────────────────────────────
// Key   = exact canonical player name as stored in Firestore (name field)
// Value = sofifaId verified from sofifa.com/player/{sofifaId}/
//
// Generated Player intentionally absent — must stay silhouette.
// Do not add entries without a confirmed sofifa.com/player/{id}/ URL.

const STUB_SOFIFA_IDS = {
  'Cole Palmer':                257534,   // sofifa.com/player/257534/cole-palmer/
  'Patrik Mercado':             271741,   // sofifa.com/player/271741/patrik-mercado/
  'Mario Gila':                 268804,   // sofifa.com/player/268804/mario-gila-fuentes/
  'Newerton Martins da Silva':  277194,   // sofifa.com/player/277194/newerton-martins-da-silva/
  'Jorrel Hato':                272978,   // sofifa.com/player/272978/jorrel-hato/
  'Amad Diallo':                254088,   // sofifa.com/player/254088/amad-diallo/
  'Achraf Hakimi':              235212,   // sofifa.com/player/235212/achraf-hakimi/
  'Denzel Dumfries':            233096,   // sofifa.com/player/233096/denzel-dumfries/
  'Joško Gvardiol':             251517,   // sofifa.com/player/251517/josko-gvardiol/
}

function hr(char = '─', width = 72) { return char.repeat(width) }
function pad(s, w) { const str = String(s ?? ''); return str.length >= w ? str : str + ' '.repeat(w - str.length) }

// ─── Init ─────────────────────────────────────────────────────────────────────

const svcPath = new URL('../serviceAccountKey.json', import.meta.url).pathname
admin.initializeApp({ credential: admin.credential.cert(require(svcPath)) })
const db = admin.firestore()

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2)
  const WRITE   = args.includes('--write')
  const clIdx   = args.indexOf('--club')
  let   clubId  = clIdx !== -1 ? args[clIdx + 1] : null

  // ── Auto-detect club ───────────────────────────────────────────────────────
  if (!clubId) {
    const snap = await db.collection('clubs').get()
    if (snap.empty) { console.error('No clubs found. Pass --club <id>.'); process.exit(1) }
    if (snap.docs.length > 1) {
      console.log('Multiple clubs — pass --club <id>:')
      snap.docs.forEach(d => console.log(`  ${d.id}  ${d.data().name || '(unnamed)'}`))
      process.exit(0)
    }
    clubId = snap.docs[0].id
    console.log(`Auto-detected club: ${snap.docs[0].data().name || '(unnamed)'} (${clubId})\n`)
  }

  console.log(hr('═'))
  console.log('  patchHistoricalStubSofifaIds.mjs')
  console.log(`  Mode   : ${WRITE ? '✏️  WRITE' : '🔍 DRY RUN — pass --write to apply'}`)
  console.log(`  Club   : ${clubId}`)
  console.log(`  Stubs  : ${Object.keys(STUB_SOFIFA_IDS).length} entries in map`)
  console.log(hr('═'))

  // ── Fetch all players for this club ───────────────────────────────────────
  const playersSnap = await db.collection('players')
    .where('clubId', '==', clubId)
    .get()

  const allPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Split into stubs and non-stubs for clarity
  const stubs    = allPlayers.filter(p => p.isHistoricalStub === true)
  const nonStubs = allPlayers.filter(p => p.isHistoricalStub !== true)

  console.log(`\nPlayers fetched : ${allPlayers.length} total`)
  console.log(`Historical stubs: ${stubs.length}`)
  console.log(`Non-stub players: ${nonStubs.length} (will not be touched)\n`)

  // ── Build result table ─────────────────────────────────────────────────────
  // For every entry in the map, find the matching stub doc
  const results = []

  for (const [targetName, sofifaId] of Object.entries(STUB_SOFIFA_IDS)) {
    const matches = stubs.filter(p => p.name === targetName)

    if (matches.length === 0) {
      results.push({ name: targetName, sofifaId, status: 'NOT_FOUND', doc: null })
    } else if (matches.length > 1) {
      results.push({ name: targetName, sofifaId, status: 'MULTIPLE_FOUND', docs: matches })
    } else {
      const doc = matches[0]
      const currentSofifaId = doc.sofifaId ?? null
      if (currentSofifaId === sofifaId) {
        results.push({ name: targetName, sofifaId, status: 'ALREADY_SET', doc })
      } else {
        results.push({ name: targetName, sofifaId, status: 'WILL_UPDATE', doc, currentSofifaId })
      }
    }
  }

  // Also flag any stubs NOT in the map (not an error, just informational)
  const mappedNames = new Set(Object.keys(STUB_SOFIFA_IDS))
  const unmappedStubs = stubs.filter(p => !mappedNames.has(p.name))

  // ── Print report ───────────────────────────────────────────────────────────
  console.log(hr())
  console.log('PATCH PLAN — STUBS IN MAP')
  console.log(hr())
  console.log(pad('NAME', 32) + pad('CURRENT', 12) + pad('PROPOSED', 12) + 'STATUS')
  console.log(hr('─'))

  for (const r of results) {
    const current  = r.status === 'WILL_UPDATE'   ? String(r.currentSofifaId ?? '—')
                   : r.status === 'ALREADY_SET'   ? String(r.sofifaId)
                   : '—'
    const proposed = r.status === 'NOT_FOUND' || r.status === 'MULTIPLE_FOUND'
                   ? '—' : String(r.sofifaId)

    const statusLabel =
      r.status === 'WILL_UPDATE'     ? '→ will update'
    : r.status === 'ALREADY_SET'     ? '✓ already set'
    : r.status === 'NOT_FOUND'       ? '⚠ NOT FOUND — check Firestore name'
    : r.status === 'MULTIPLE_FOUND'  ? '⚠ MULTIPLE DOCS — manual review needed'
    : r.status

    console.log(pad(r.name, 32) + pad(current, 12) + pad(proposed, 12) + statusLabel)
  }

  // Unmapped stubs
  if (unmappedStubs.length > 0) {
    console.log('\n' + hr())
    console.log(`STUBS NOT IN MAP — ${unmappedStubs.length} (no action taken)`)
    console.log(hr('─'))
    for (const p of unmappedStubs) {
      const sfId = p.sofifaId ? String(p.sofifaId) : '(none)'
      console.log(`  ${pad(p.name, 32)} sofifaId: ${sfId}`)
    }
  }

  // ── Summary before write ───────────────────────────────────────────────────
  const toUpdate     = results.filter(r => r.status === 'WILL_UPDATE')
  const alreadySet   = results.filter(r => r.status === 'ALREADY_SET')
  const notFound     = results.filter(r => r.status === 'NOT_FOUND')
  const multipleFound = results.filter(r => r.status === 'MULTIPLE_FOUND')

  console.log('\n' + hr())
  console.log('SUMMARY')
  console.log(hr('─'))
  console.log(`  Will update  : ${toUpdate.length}`)
  console.log(`  Already set  : ${alreadySet.length}`)
  console.log(`  Not found    : ${notFound.length}${notFound.length > 0 ? '  ← check name spelling in Firestore' : ''}`)
  console.log(`  Multi-match  : ${multipleFound.length}${multipleFound.length > 0 ? '  ← manual review needed' : ''}`)
  console.log(`  Unmapped stubs: ${unmappedStubs.length}  (no action — not in map)`)

  if (!WRITE) {
    console.log('\n' + hr('═'))
    console.log('  DRY RUN COMPLETE — no data written.')
    console.log('  Re-run with --write to apply the patch.')
    console.log(hr('═') + '\n')
    process.exit(0)
  }

  // ── Apply writes ───────────────────────────────────────────────────────────
  if (toUpdate.length === 0) {
    console.log('\nNothing to write.\n')
    process.exit(0)
  }

  console.log('\n' + hr())
  console.log('WRITING')
  console.log(hr('─'))

  let written = 0
  let errored = 0

  for (const r of toUpdate) {
    try {
      await db.collection('players').doc(r.doc.id).update({ sofifaId: r.sofifaId })
      console.log(`  [write] ${r.name.padEnd(32)} sofifaId → ${r.sofifaId}`)
      written++
    } catch (err) {
      console.error(`  [error] ${r.name}: ${err.message}`)
      errored++
    }
  }

  console.log('\n' + hr('═'))
  console.log(`  Done. Written: ${written}  Errors: ${errored}`)
  console.log(hr('═') + '\n')

  process.exit(errored > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
