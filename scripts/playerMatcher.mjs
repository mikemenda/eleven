/**
 * playerMatcher.mjs
 *
 * Reusable utility that matches an array of player names against
 * data/fc26-players.csv and returns enriched FIFA metadata.
 *
 * Usage (import as module):
 *   import { matchPlayers } from './scripts/playerMatcher.mjs'
 *   const results = await matchPlayers(['Julián Álvarez', 'Pedri', ...])
 *
 * Usage (run directly):
 *   node scripts/playerMatcher.mjs
 *   — uses the SAMPLE_PLAYERS array below as a test input
 *
 * Returns per player:
 *   Matched:   { name, sofifaId, nationality, sofifaPosition, playerFaceUrl, matchConfidence, matchStrategy }
 *   No match:  { name, isGenerated: true }
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// ─── Config ──────────────────────────────────────────────────────────────────
const CSV_PATH        = resolve(__dirname, '../data/fc26-players.csv')
const FUZZY_THRESHOLD = 0.88

// ─── Sample input for direct execution ───────────────────────────────────────
const SAMPLE_PLAYERS = [
  'Julián Álvarez',
  'Pedri',
  'Jamal Musiala',
  'Lamine Yamal',
  'Joan García',
  'Florian Wirtz',
  'William Saliba',
  'Ousmane Dembélé',
  'Gilberto Mora',       // expected: isGenerated
  'Fake Regen Player',   // expected: isGenerated
]

// ─── Jaro-Winkler ─────────────────────────────────────────────────────────────
function jaroSimilarity(s1, s2) {
  if (s1 === s2) return 1
  const len1 = s1.length, len2 = s2.length
  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1
  const s1m = new Array(len1).fill(false)
  const s2m = new Array(len2).fill(false)
  let matches = 0, transpositions = 0

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist)
    const end   = Math.min(i + matchDist + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue
      s1m[i] = s2m[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0

  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1m[i]) continue
    while (!s2m[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
}

function jaroWinkler(s1, s2, p = 0.1) {
  const jaro = jaroSimilarity(s1, s2)
  let prefix = 0
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return jaro + prefix * p * (1 - jaro)
}

function normalise(raw) {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Load CSV once ────────────────────────────────────────────────────────────
function loadCSV() {
  const raw  = readFileSync(CSV_PATH, 'utf8')
  const rows = parse(raw, { columns: true, skip_empty_lines: true, bom: true })

  const byLongName  = new Map()
  const byShortName = new Map()

  for (const row of rows) {
    const ln = normalise(row.long_name)
    const sn = normalise(row.short_name)
    if (!byLongName.has(ln))  byLongName.set(ln, row)
    if (!byShortName.has(sn)) byShortName.set(sn, [])
    byShortName.get(sn).push(row)
  }

  const allLong = rows.map(r => ({ norm: normalise(r.long_name), row: r }))
  return { byLongName, byShortName, allLong }
}

// ─── Match one name ───────────────────────────────────────────────────────────
function matchOne(name, { byLongName, byShortName, allLong }) {
  const norm = normalise(name)

  // 1. Exact long_name
  if (byLongName.has(norm)) {
    return { row: byLongName.get(norm), strategy: 'exact_long', confidence: 1.0 }
  }

  // 2. Exact short_name (unique only)
  if (byShortName.has(norm)) {
    const candidates = byShortName.get(norm)
    if (candidates.length === 1) {
      return { row: candidates[0], strategy: 'exact_short', confidence: 0.95 }
    }
    // Ambiguous — fall through to fuzzy
  }

  // 3. Fuzzy against long_name
  let bestScore = 0, bestRow = null
  for (const { norm: ln, row } of allLong) {
    const score = jaroWinkler(norm, ln)
    if (score > bestScore) { bestScore = score; bestRow = row }
  }
  if (bestScore >= FUZZY_THRESHOLD) {
    return { row: bestRow, strategy: 'fuzzy', confidence: Math.round(bestScore * 100) / 100 }
  }

  return null
}

// ─── Shape a matched row into the return object ───────────────────────────────
function shapeResult(name, match) {
  if (!match) return { name, isGenerated: true }
  const { row, strategy, confidence } = match
  return {
    name,
    sofifaId:        row.player_id,
    nationality:     row.nationality_name,
    sofifaPosition:  row.player_positions,
    playerFaceUrl:   row.player_face_url,
    matchConfidence: confidence,
    matchStrategy:   strategy,
    csvLongName:     row.long_name,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function matchPlayers(playerNames) {
  const index   = loadCSV()
  const results = playerNames.map(name => shapeResult(name, matchOne(name, index)))

  const matched   = results.filter(r => !r.isGenerated)
  const unmatched = results.filter(r =>  r.isGenerated)

  console.log(`\n✅  Matched   : ${matched.length}`)
  console.log(`❌  Unmatched : ${unmatched.length}`)
  if (unmatched.length) {
    console.log('\nUnmatched players:')
    unmatched.forEach(r => console.log(`  — ${r.name}`))
  }
  console.log()

  return results
}

// ─── Direct execution (test run) ─────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running playerMatcher with sample input…\n')
  const results = await matchPlayers(SAMPLE_PLAYERS)

  console.log('─── Full results ───────────────────────────────────────────────')
  for (const r of results) {
    if (r.isGenerated) {
      console.log(`  [NO MATCH]  ${r.name}`)
    } else {
      const tag  = r.matchStrategy === 'exact_long' ? 'LONG '
                 : r.matchStrategy === 'exact_short' ? 'SHORT'
                 : 'FUZZY'
      const conf = r.matchStrategy === 'fuzzy' ? ` [${(r.matchConfidence * 100).toFixed(0)}%]` : '      '
      console.log(`  [${tag}]${conf}  ${r.name.padEnd(28)} → ${r.csvLongName}`)
      console.log(`            ID: ${r.sofifaId}  |  ${r.nationality}  |  ${r.sofifaPosition}`)
    }
  }
  console.log('────────────────────────────────────────────────────────────────\n')
}
