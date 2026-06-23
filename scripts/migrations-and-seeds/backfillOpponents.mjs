/**
 * backfillOpponents.mjs
 *
 * Links existing match documents to canonical opponent records.
 *
 * For each match doc:
 *   - Runs the raw opponent name through opponentMatcher
 *   - If HIGH confidence match:
 *       opponent      → canonical displayName  (e.g. "Manchester City")
 *       opponentRaw   → original stored value  (e.g. "Man City")
 *       opponentKey   → canonical key          (e.g. "manchester-city")
 *       opponentStatus→ "matched"
 *   - If medium / low / none:
 *       opponentRaw   → original stored value
 *       opponentStatus→ "ambiguous" | "unmatched"
 *       opponent / opponentKey are NOT changed
 *
 * Usage:
 *   node scripts/backfillOpponents.mjs --clubId=<id>           # dry run
 *   node scripts/backfillOpponents.mjs --clubId=<id> --write   # apply
 *
 * Optional:
 *   --seasonIds=id1,id2    Limit to specific seasons
 *   --keyFile=path/to/key.json
 */

import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { resolve }       from 'path'
import { fileURLToPath } from 'url'
import { matchOpponent, buildAliasMap, loadSeed } from './opponentMatcher.mjs'

const require   = createRequire(import.meta.url)
const admin     = require('firebase-admin')
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ─── CLI ──────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2)
const args = {}
for (const arg of rawArgs) {
  const eq = arg.indexOf('=')
  if (eq === -1) args[arg.replace(/^--/, '')] = true
  else { args[arg.slice(2, eq)] = arg.slice(eq + 1) }
}

if (!args.clubId) {
  console.error('\nUsage: node scripts/backfillOpponents.mjs --clubId=<id> [--write] [--seasonIds=id1,id2]\n')
  process.exit(1)
}

const CLUB_ID       = String(args.clubId)
const WRITE         = args.write === true || args.write === 'true'
const SEASON_FILTER = args.seasonIds
  ? String(args.seasonIds).split(',').map(s => s.trim()).filter(Boolean)
  : null
const KEY_PATH = args.keyFile
  ? resolve(String(args.keyFile))
  : resolve(__dirname, '..', 'serviceAccountKey.json')

// ─── Firebase init ────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return admin.firestore()
  let sa
  try { sa = JSON.parse(readFileSync(KEY_PATH, 'utf8')) }
  catch (e) { console.error(`\nCould not read key: ${e.message}\n`); process.exit(1) }
  if (!sa.project_id) { console.error('\nMissing project_id\n'); process.exit(1) }
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
  return admin.firestore()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db   = initFirebase()
  const seed = loadSeed()
  const map  = buildAliasMap(seed)

  console.log('\n══════════════════════════════════════════════')
  console.log('  backfillOpponents.mjs')
  console.log(`  Mode      : ${WRITE ? '✏️  WRITE' : '🔍 DRY RUN (pass --write to apply)'}`)
  console.log(`  Club ID   : ${CLUB_ID}`)
  console.log(`  Seed      : ${seed.length} entries`)
  if (SEASON_FILTER) console.log(`  Seasons   : ${SEASON_FILTER.join(', ')}`)
  console.log('══════════════════════════════════════════════\n')

  // Fetch matches
  let snapDocs = []
  try {
    const snap = await db.collection('matches').where('clubId', '==', CLUB_ID).get()
    snapDocs = Array.isArray(snap.docs) ? snap.docs : []
  } catch (e) {
    console.error(`\nFailed to fetch matches: ${e.message}\n`); process.exit(1)
  }

  let matches = snapDocs.map(d => {
    let data = {}
    try { data = d.data() || {} } catch (e) {
      console.warn(`  [warn] doc.data() failed for ${d.id}: ${e.message}`)
    }
    return { _docId: d.id, ...data }
  })

  if (SEASON_FILTER) {
    matches = matches.filter(m => {
      const sid = m.seasonId != null ? String(m.seasonId) : ''
      return sid && SEASON_FILTER.includes(sid)
    })
  }

  console.log(`  Matches fetched : ${snapDocs.length}`)
  console.log(`  After filter    : ${matches.length}\n`)

  if (matches.length === 0) {
    console.log('No matches to process.\n')
    process.exit(0)
  }

  // Fetch season labels for readable output
  const seasonLabels = {}
  try {
    const ss = await db.collection('seasons').where('clubId', '==', CLUB_ID).get()
    for (const d of (ss.docs || [])) {
      try { seasonLabels[d.id] = String((d.data() || {}).label || d.id) }
      catch (_) {}
    }
  } catch (_) {}

  // Process each match
  let autoMatched = 0, needsReview = 0, alreadyDone = 0, errored = 0

  const reviewList = [] // {docId, opponent, confidence, reason}

  for (const m of matches) {
    const docId        = m._docId
    const rawOpponent  = m.opponent != null ? String(m.opponent) : ''
    const currentStatus= m.opponentStatus
    const seasonLabel  = m.seasonId ? (seasonLabels[m.seasonId] || m.seasonId) : '?'

    // Skip if already fully matched
    if (currentStatus === 'matched' && m.opponentKey && m.opponentRaw) {
      alreadyDone++
      continue
    }

    // Match
    let result = null
    try { result = matchOpponent(rawOpponent, seed, map) } catch (e) {
      console.warn(`  [warn] matchOpponent threw for "${rawOpponent}" (${docId}): ${e.message}`)
    }

    if (result && result.confidence === 'high') {
      // Auto-link: update opponent, opponentRaw, opponentKey, opponentStatus
      const patch = {
        opponent:       result.displayName,   // canonical official name
        opponentRaw:    rawOpponent,           // preserve original
        opponentKey:    result.opponentKey,
        opponentStatus: 'matched',
      }

      if (WRITE) {
        try {
          await db.collection('matches').doc(docId).update(patch)
          console.log(`  [write] ${docId}  "${rawOpponent}" → "${result.displayName}"  [${seasonLabel}]`)
          autoMatched++
        } catch (e) {
          console.error(`  [error] ${docId}: ${e.message}`)
          errored++
        }
      } else {
        console.log(
          `  [dry]   ${docId}  "${rawOpponent}".padEnd(22)} → "${result.displayName.padEnd(24)}"` +
          `  key=${result.opponentKey}  conf=high  [${seasonLabel}]`
        )
        autoMatched++
      }

    } else {
      // Low/medium/none: preserve raw, set status, do not overwrite opponent or key
      const confidence = result?.confidence || 'none'
      const status     = confidence === 'none' ? 'unmatched' : 'ambiguous'

      const patch = {
        opponentRaw:    rawOpponent,
        opponentStatus: status,
      }

      if (WRITE) {
        try {
          await db.collection('matches').doc(docId).update(patch)
        } catch (e) {
          console.error(`  [error] ${docId}: ${e.message}`)
          errored++
        }
      }

      reviewList.push({
        docId,
        opponent: rawOpponent,
        confidence,
        reason: result ? `best guess: ${result.opponentKey} (${result.strategy})` : 'no seed match',
        season: seasonLabel,
      })
      needsReview++
    }
  }

  // Summary
  console.log()
  console.log('── Summary ────────────────────────────────────')
  console.log(`  Already matched : ${alreadyDone}`)
  console.log(`  Auto-matched    : ${autoMatched}`)
  console.log(`  Needs review    : ${needsReview}`)
  if (errored) console.log(`  Errors          : ${errored}`)
  console.log()

  if (reviewList.length) {
    console.log('⚠️  Manual review required:')
    for (const r of reviewList) {
      console.log(`    ${r.docId}  opp="${r.opponent}"  conf=${r.confidence}  ${r.reason}  [${r.season}]`)
    }
    console.log()
    console.log('  → To resolve: add an alias to the seed entry in data/opponents-seed.json')
    console.log('    then re-run opponentSeed.mjs --write --overwrite and backfillOpponents.mjs --write')
  }

  if (!WRITE) {
    console.log()
    console.log('Dry run complete. Re-run with --write to apply.')
  }
  console.log()
}

main().catch(err => {
  console.error('\nFatal:', err.message)
  console.error(err.stack)
  process.exit(1)
})
