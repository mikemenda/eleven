/**
 * auditUclStats.mjs
 *
 * Audits UCL seasonStats docs for a named player.
 * Prints every doc that could belong to that player, showing all relevant fields.
 *
 * Usage:
 *   node auditUclStats.mjs --name="Pedri"
 *   node auditUclStats.mjs --name="Lamine Yamal"
 *
 * Reads serviceAccountKey.json from the project root.
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve }       from 'path'
import { fileURLToPath } from 'url'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else args[arg.replace(/^--/, '')] = true
}

if (!args.name) {
  console.error('\nUsage: node auditUclStats.mjs --name="Pedri"\n')
  process.exit(1)
}

const TARGET_NAME = String(args.name).trim()
const KEY_PATH    = resolve(__dirname, '..', 'serviceAccountKey.json')

// ─── Firebase ─────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  const sa = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
  return admin.firestore()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = initFirebase()

  console.log(`\n══════════════════════════════════════════════════`)
  console.log(` Auditing UCL seasonStats for: "${TARGET_NAME}"`)
  console.log(`══════════════════════════════════════════════════\n`)

  // 1. Find the player document(s) by name
  const playerSnap = await db.collection('players')
    .where('name', '==', TARGET_NAME)
    .get()

  if (playerSnap.empty) {
    console.log(`❌ No player document found with name === "${TARGET_NAME}"`)
    console.log('   Check spelling exactly as stored in Firestore.\n')
  } else {
    console.log(`✅ Player document(s) found: ${playerSnap.size}`)
    playerSnap.docs.forEach(d => {
      const p = d.data()
      console.log(`   docId    : ${d.id}`)
      console.log(`   name     : ${p.name}`)
      console.log(`   clubId   : ${p.clubId}`)
      console.log(`   position : ${p.position}`)
      console.log(`   status   : ${p.status}`)
      if (p.uclApps != null)    console.log(`   uclApps  : ${p.uclApps}`)
      if (p.uclGoals != null)   console.log(`   uclGoals : ${p.uclGoals}`)
      if (p.seasonStats) {
        console.log(`   seasonStats (embedded array): ${p.seasonStats.length} items`)
        p.seasonStats.forEach(ss => console.log(`     label=${ss.label}  scope=${ss.scope ?? 'n/a'}  apps=${ss.apps}  goals=${ss.goals}  assists=${ss.assists}`))
      } else {
        console.log(`   seasonStats (embedded array): NOT PRESENT`)
      }
    })
  }

  // Get playerId(s) from found player docs
  const playerIds = playerSnap.docs.map(d => d.id)

  // 2. Load all seasons for label lookup
  const seasonsSnap = await db.collection('seasons').get()
  const seasonMap   = new Map(seasonsSnap.docs.map(d => [d.id, d.data().label ?? d.id]))
  console.log(`\n── Seasons loaded: ${seasonMap.size}`)
  seasonsSnap.docs.forEach(d => console.log(`   ${d.id} → ${d.data().label}`))

  // 3. Query UCL seasonStats by playerId
  console.log(`\n── UCL seasonStats by playerId (${playerIds.length} id(s)) ──────────────`)
  for (const pid of playerIds) {
    const snap = await db.collection('seasonStats')
      .where('playerId', '==', pid)
      .where('scope',    '==', 'UCL')
      .get()
    console.log(`\n   playerId=${pid} → ${snap.size} UCL docs`)
    snap.docs.forEach(d => {
      const s = d.data()
      const label = seasonMap.get(s.seasonId) ?? '(no label)'
      console.log(`     docId     : ${d.id}`)
      console.log(`     playerId  : ${s.playerId}`)
      console.log(`     playerName: ${s.playerName ?? '(missing)'}`)
      console.log(`     clubId    : ${s.clubId ?? '(missing)'}`)
      console.log(`     seasonId  : ${s.seasonId}  →  label: ${label}`)
      console.log(`     apps/G/A  : ${s.apps} / ${s.goals} / ${s.assists}`)
      console.log()
    })
  }

  // 4. Query UCL seasonStats by playerName
  console.log(`── UCL seasonStats by playerName === "${TARGET_NAME}" ────────────`)
  const byNameSnap = await db.collection('seasonStats')
    .where('playerName', '==', TARGET_NAME)
    .where('scope',      '==', 'UCL')
    .get()
  console.log(`\n   ${byNameSnap.size} docs found by playerName\n`)
  byNameSnap.docs.forEach(d => {
    const s = d.data()
    const label = seasonMap.get(s.seasonId) ?? '(no label)'
    const alreadyFound = playerIds.includes(s.playerId)
    console.log(`     docId     : ${d.id}  ${alreadyFound ? '(same as above)' : '⚠️  DIFFERENT playerId'}`)
    console.log(`     playerId  : ${s.playerId ?? '(missing)'}`)
    console.log(`     playerName: ${s.playerName ?? '(missing)'}`)
    console.log(`     clubId    : ${s.clubId ?? '(missing)'}`)
    console.log(`     seasonId  : ${s.seasonId}  →  label: ${label}`)
    console.log(`     apps/G/A  : ${s.apps} / ${s.goals} / ${s.assists}`)
    console.log()
  })

  // 5. All UCL docs regardless of playerId — scan for anything matching playerName loosely
  console.log(`── All UCL seasonStats docs (scan for "${TARGET_NAME}" by name) ──`)
  const allUclSnap = await db.collection('seasonStats')
    .where('scope', '==', 'UCL')
    .get()
  const nameNorm = TARGET_NAME.toLowerCase().trim()
  const loose    = allUclSnap.docs.filter(d => {
    const pn = (d.data().playerName ?? '').toLowerCase().trim()
    return pn.includes(nameNorm) || nameNorm.includes(pn)
  })
  console.log(`\n   Total UCL docs in collection: ${allUclSnap.size}`)
  console.log(`   Loose name matches: ${loose.length}\n`)
  loose.forEach(d => {
    const s = d.data()
    const label = seasonMap.get(s.seasonId) ?? '(no label)'
    console.log(`     docId     : ${d.id}`)
    console.log(`     playerId  : ${s.playerId ?? '(missing)'}`)
    console.log(`     playerName: ${s.playerName ?? '(missing)'}`)
    console.log(`     clubId    : ${s.clubId ?? '(missing)'}`)
    console.log(`     seasonId  : ${s.seasonId}  →  label: ${label}`)
    console.log(`     apps/G/A  : ${s.apps} / ${s.goals} / ${s.assists}`)
    console.log()
  })

  console.log(`══════════════════════════════════════════════════`)
  console.log(` Done. Paste full output above for diagnosis.`)
  console.log(`══════════════════════════════════════════════════\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
