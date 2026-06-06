/**
 * opponentMatcher.mjs
 *
 * Reusable module: matches a raw opponent name against the opponents seed list
 * and returns the canonical opponentKey + metadata.
 *
 * Used by:
 *   - backfillOpponents.mjs  (historical match docs)
 *   - Future CSV import pipeline (before any match doc is created)
 *
 * Matching rules:
 *   high     → exact normalised alias match or display/shortName match
 *              → auto-write: opponent=displayName, opponentKey, opponentRaw, opponentStatus=matched
 *   medium   → single partial containment match
 *              → flag for manual review, do not auto-write
 *   low      → ambiguous partial (multiple candidates)
 *              → flag for manual review, do not auto-write
 *   none     → no match found
 *              → flag for manual review, do not auto-write
 *
 * Usage:
 *   import { matchOpponent, loadSeed } from './opponentMatcher.mjs'
 *   const seed = loadSeed()
 *   const result = matchOpponent('Man City', seed)
 *   // { opponentKey: 'manchester-city', displayName: 'Manchester City',
 *   //   crestUrl: '...', confidence: 'high', strategy: 'exact-alias' }
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const SEED_PATH = resolve(__dirname, '..', 'data', 'opponents-seed.json')

const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev/team'

// ─── Normaliser ───────────────────────────────────────────────────────────────
// Strips diacritics, common suffixes, punctuation, extra whitespace.
// Must produce identical output to what's stored in the aliases array.

export function normalise(raw) {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')                                          // strip diacritics
    .replace(/\b(fc|afc|cf|sc|sk|fk|ac|sl|ssc|ss|rc|rcd|kv|nk)\b/g, '')     // strip suffixes
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Load seed ────────────────────────────────────────────────────────────────

export function loadSeed(seedPath) {
  const path = seedPath || SEED_PATH
  const raw  = readFileSync(path, 'utf8')
  return JSON.parse(raw)
}

// ─── Build alias map from seed ────────────────────────────────────────────────

export function buildAliasMap(seed) {
  const map = new Map() // normalised alias → opponentKey
  for (const entry of seed) {
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : []
    for (const alias of aliases) {
      const norm = normalise(alias)
      if (!norm) continue
      if (map.has(norm) && map.get(norm) !== entry.opponentKey) {
        // Genuine cross-entry collision — log and keep first
        console.warn(`  [opponentMatcher] alias collision: "${alias}" → ${entry.opponentKey} vs ${map.get(norm)}`)
      } else {
        map.set(norm, entry.opponentKey)
      }
    }
  }
  return map
}

// ─── Match one raw opponent name ──────────────────────────────────────────────

export function matchOpponent(rawOpponent, seed, aliasMap) {
  const raw = rawOpponent === null || rawOpponent === undefined ? '' : String(rawOpponent)
  if (!raw || raw === '(blank)') return null

  const norm = normalise(raw)
  if (!norm) return null

  const map = aliasMap || buildAliasMap(seed)

  // 1. Exact alias match → high
  if (map.has(norm)) {
    const key   = map.get(norm)
    const entry = seed.find(e => e.opponentKey === key)
    return entry ? result(entry, 'high', 'exact-alias') : null
  }

  // 2. Normalised displayName / shortName match → high
  for (const entry of seed) {
    const dn = normalise(entry.displayName)
    const sn = normalise(entry.shortName)
    if ((dn && dn === norm) || (sn && sn === norm)) {
      return result(entry, 'high', 'display-name')
    }
  }

  // 3. Partial containment (min 4 chars) → medium / low
  if (norm.length < 4) return null
  const partials = []
  for (const [alias, key] of map.entries()) {
    if (alias.includes(norm) || norm.includes(alias)) {
      if (!partials.find(p => p.key === key)) partials.push({ key, alias })
    }
  }
  if (partials.length === 1) {
    const entry = seed.find(e => e.opponentKey === partials[0].key)
    return entry ? result(entry, 'medium', 'partial') : null
  }
  if (partials.length > 1) {
    const best  = partials.slice().sort((a, b) => b.alias.length - a.alias.length)[0]
    const entry = seed.find(e => e.opponentKey === best.key)
    return entry ? { ...result(entry, 'low', 'ambiguous'), alternatives: partials.map(p => p.key) } : null
  }

  return null
}

function result(entry, confidence, strategy) {
  return {
    opponentKey:  entry.opponentKey,
    displayName:  entry.displayName,
    shortName:    entry.shortName,
    abbreviation: entry.abbreviation,
    country:      entry.country,
    sofifaTeamId: entry.sofifaTeamId,
    crestUrl:     `${WORKER_BASE}/${entry.sofifaTeamId}`,
    confidence,
    strategy,
  }
}

// ─── Batch match ──────────────────────────────────────────────────────────────

export function matchOpponents(rawNames, seed) {
  const map = buildAliasMap(seed)
  return rawNames.map(raw => ({ raw, match: matchOpponent(raw, seed, map) }))
}

// ─── Direct execution: quick test ────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seed = loadSeed()
  const map  = buildAliasMap(seed)
  const tests = [
    'Man City', 'MCI', 'Manchester City',
    'Real Madrid', 'Inter', 'Dortmund', 'BVB',
    'Leipzig', 'RB Leipzig',
    'Slavia Praha', 'Slavia Prague',
    'FC Testington',
    null, '', 'Unknown',
  ]
  console.log(`\nopponentMatcher self-test — ${seed.length} seed entries\n`)
  for (const t of tests) {
    const m = matchOpponent(t, seed, map)
    if (m) {
      console.log(`  [${m.confidence.padEnd(6)}] "${t}" → ${m.opponentKey} (${m.strategy})`)
    } else {
      console.log(`  [none  ] "${t}" → no match`)
    }
  }
  console.log()
}
