/**
 * auditOpponents.mjs
 *
 * Reads every match document for a given clubId from Firestore and
 * produces a full opponent audit report. No Firestore writes.
 *
 * Usage (from repo root in Codespaces):
 *
 *   node scripts/auditOpponents.mjs --clubId=<clubId>
 *
 *   Requires serviceAccountKey.json in the repo root (git-ignored).
 *   Download from: Firebase Console → Project Settings → Service accounts → Generate new private key
 *
 * Optional flags:
 *   --clubId=<id>             Firestore document ID for the club (required)
 *   --seasonIds=id1,id2,id3  Limit to specific season document IDs
 *   --json                   Write full results to audit-opponents.json
 *   --keyFile=<path>         Path to service account JSON (default: ./serviceAccountKey.json)
 */

import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Use createRequire so we can load the CJS firebase-admin package from an ESM script.
// Dynamic `import('firebase-admin')` fails because the package only exports a CJS entry
// and Node's ESM loader does not wrap CJS default exports consistently across versions.
const require = createRequire(import.meta.url)
const admin   = require('firebase-admin')

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ─── CLI parsing ──────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2)

if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`
Usage: node scripts/auditOpponents.mjs --clubId=<clubId> [options]

Options:
  --clubId=<id>            Firestore club document ID (required)
  --seasonIds=id1,id2,id3  Limit audit to specific season IDs
  --json                   Write full report to audit-opponents.json
  --keyFile=<path>         Service account key path (default: ./serviceAccountKey.json)
  --help                   Show this help

Example:
  node scripts/auditOpponents.mjs --clubId=kqhz2LAYC1pOzOtLehR4
  node scripts/auditOpponents.mjs --clubId=kqhz2LAYC1pOzOtLehR4 --json
`)
  process.exit(0)
}

const args = {}
for (const arg of rawArgs) {
  const eqIdx = arg.indexOf('=')
  if (eqIdx === -1) {
    args[arg.replace(/^--/, '')] = true
  } else {
    const k = arg.slice(2, eqIdx)
    const v = arg.slice(eqIdx + 1)
    args[k] = v
  }
}

if (!args.clubId && !args.test) {
  console.error('\nError: --clubId is required\n')
  console.error('Usage: node scripts/auditOpponents.mjs --clubId=<clubId>\n')
  process.exit(1)
}

const CLUB_ID       = args.clubId ? String(args.clubId) : 'TEST'
const SEASON_FILTER = args.seasonIds
  ? String(args.seasonIds).split(',').map(s => s.trim()).filter(Boolean)
  : null
const WRITE_JSON    = args.json === true || args.json === 'true'
const KEY_PATH      = args.keyFile
  ? resolve(String(args.keyFile))
  : resolve(__dirname, '..', 'serviceAccountKey.json')

// ─── Firebase Admin init ──────────────────────────────────────────────────────
// Firebase init is deferred into main() so --test mode can skip it entirely.
// initFirebase() uses createRequire-loaded admin, so .apps / .credential.cert /
// .initializeApp are always the real CJS exports — no .default unwrapping needed.

function initFirebase() {
  if (admin.apps.length) return admin.firestore()

  let serviceAccount
  try {
    serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
  } catch (e) {
    console.error(`\nCould not read service account key at: ${KEY_PATH}`)
    console.error(`  Error: ${e.message}`)
    console.error('\nDownload it from Firebase Console → Project Settings → Service accounts')
    console.error('and save it as serviceAccountKey.json in the repo root.\n')
    process.exit(1)
  }

  if (!serviceAccount || typeof serviceAccount !== 'object') {
    console.error(`\nService account file is not valid JSON: ${KEY_PATH}\n`)
    process.exit(1)
  }
  if (!serviceAccount.project_id) {
    console.error(`\nService account JSON is missing "project_id" — is this the right file?\n  ${KEY_PATH}\n`)
    process.exit(1)
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId:  serviceAccount.project_id,
  })

  return admin.firestore()
}

// ─── Seed data — 51 entries, SoFIFA IDs verified against data/fc26-players.csv ─
const SEED = [
  // ── Premier League pool ────────────────────────────────────────────────────
  { opponentKey:'arsenal',            displayName:'Arsenal',                  shortName:'Arsenal',       abbreviation:'ARS', country:'England',     sofifaTeamId:1,      aliases:['arsenal','the gunners','afc','arsenal fc'] },
  { opponentKey:'aston-villa',        displayName:'Aston Villa',              shortName:'Aston Villa',   abbreviation:'AVL', country:'England',     sofifaTeamId:2,      aliases:['aston villa','villa','avfc','aston villa fc'] },
  { opponentKey:'bournemouth',        displayName:'AFC Bournemouth',          shortName:'Bournemouth',   abbreviation:'BOU', country:'England',     sofifaTeamId:1943,   aliases:['bournemouth','afc bournemouth','the cherries'] },
  { opponentKey:'brentford',          displayName:'Brentford',                shortName:'Brentford',     abbreviation:'BRE', country:'England',     sofifaTeamId:1925,   aliases:['brentford','brentford fc','the bees'] },
  { opponentKey:'brighton',           displayName:'Brighton & Hove Albion',   shortName:'Brighton',      abbreviation:'BHA', country:'England',     sofifaTeamId:1808,   aliases:['brighton','brighton and hove albion','brighton hove albion','bha','the seagulls'] },
  { opponentKey:'burnley',            displayName:'Burnley',                  shortName:'Burnley',       abbreviation:'BUR', country:'England',     sofifaTeamId:1796,   aliases:['burnley','burnley fc','the clarets'] },
  { opponentKey:'chelsea',            displayName:'Chelsea',                  shortName:'Chelsea',       abbreviation:'CHE', country:'England',     sofifaTeamId:5,      aliases:['chelsea','chelsea fc','the blues','cfc'] },
  { opponentKey:'crystal-palace',     displayName:'Crystal Palace',           shortName:'Crystal Palace',abbreviation:'CRY', country:'England',     sofifaTeamId:1799,   aliases:['crystal palace','palace','cpfc','the eagles'] },
  { opponentKey:'everton',            displayName:'Everton',                  shortName:'Everton',       abbreviation:'EVE', country:'England',     sofifaTeamId:7,      aliases:['everton','everton fc','the toffees','efc'] },
  { opponentKey:'fulham',             displayName:'Fulham',                   shortName:'Fulham',        abbreviation:'FUL', country:'England',     sofifaTeamId:144,    aliases:['fulham','fulham fc','the cottagers'] },
  { opponentKey:'liverpool',          displayName:'Liverpool',                shortName:'Liverpool',     abbreviation:'LIV', country:'England',     sofifaTeamId:9,      aliases:['liverpool','liverpool fc','lfc','the reds'] },
  { opponentKey:'manchester-city',    displayName:'Manchester City',          shortName:'Man City',      abbreviation:'MCI', country:'England',     sofifaTeamId:10,     aliases:['manchester city','man city','man. city','mci','mcfc','city','the citizens'] },
  { opponentKey:'manchester-united',  displayName:'Manchester United',        shortName:'Man United',    abbreviation:'MUN', country:'England',     sofifaTeamId:11,     aliases:['manchester united','man united','man utd','man. united','mun','mufc','united','the red devils'] },
  { opponentKey:'newcastle-united',   displayName:'Newcastle United',         shortName:'Newcastle',     abbreviation:'NEW', country:'England',     sofifaTeamId:13,     aliases:['newcastle united','newcastle','nufc','the magpies'] },
  { opponentKey:'nottingham-forest',  displayName:'Nottingham Forest',        shortName:"Nott'm Forest", abbreviation:'NFO', country:'England',     sofifaTeamId:14,     aliases:['nottingham forest','nottm forest','nottm. forest','nott m forest','forest','nffc'] },
  { opponentKey:'tottenham',          displayName:'Tottenham Hotspur',        shortName:'Tottenham',     abbreviation:'TOT', country:'England',     sofifaTeamId:18,     aliases:['tottenham hotspur','tottenham','spurs','thfc'] },
  { opponentKey:'west-ham',           displayName:'West Ham United',          shortName:'West Ham',      abbreviation:'WHU', country:'England',     sofifaTeamId:19,     aliases:['west ham united','west ham','whu','whufc','the hammers'] },
  { opponentKey:'wolves',             displayName:'Wolverhampton Wanderers',  shortName:'Wolves',        abbreviation:'WOL', country:'England',     sofifaTeamId:110,    aliases:['wolverhampton wanderers','wolves','wolverhampton','wwfc','wol'] },
  { opponentKey:'sunderland',         displayName:'Sunderland',               shortName:'Sunderland',    abbreviation:'SUN', country:'England',     sofifaTeamId:106,    aliases:['sunderland','sunderland afc','safc','the black cats'] },
  { opponentKey:'leeds-united',       displayName:'Leeds United',             shortName:'Leeds',         abbreviation:'LEE', country:'England',     sofifaTeamId:8,      aliases:['leeds united','leeds','lufc','the whites'] },
  { opponentKey:'sheffield-united',   displayName:'Sheffield United',         shortName:'Sheffield Utd', abbreviation:'SHU', country:'England',     sofifaTeamId:1794,   aliases:['sheffield united','sheffield utd','sheff united','sufc','the blades'] },
  { opponentKey:'leicester-city',     displayName:'Leicester City',           shortName:'Leicester',     abbreviation:'LEI', country:'England',     sofifaTeamId:95,     aliases:['leicester city','leicester','lcfc','the foxes'] },
  // ── UCL pool ──────────────────────────────────────────────────────────────
  { opponentKey:'real-madrid',        displayName:'Real Madrid',              shortName:'Real Madrid',   abbreviation:'RMA', country:'Spain',       sofifaTeamId:243,    aliases:['real madrid','real madrid cf','madrid','rma','los blancos'] },
  { opponentKey:'inter-milan',        displayName:'Inter Milan',              shortName:'Inter Milan',   abbreviation:'INT', country:'Italy',       sofifaTeamId:44,     aliases:['inter milan','inter','internazionale','int','nerazzurri'] },
  { opponentKey:'borussia-dortmund',  displayName:'Borussia Dortmund',        shortName:'Dortmund',      abbreviation:'DOR', country:'Germany',     sofifaTeamId:22,     aliases:['borussia dortmund','dortmund','bvb','bvb 09'] },
  { opponentKey:'rangers',            displayName:'Rangers FC',               shortName:'Rangers',       abbreviation:'RAN', country:'Scotland',    sofifaTeamId:86,     aliases:['rangers fc','rangers','rfc','the gers','glasgow rangers'] },
  { opponentKey:'bayern-munich',      displayName:'FC Bayern München',        shortName:'Bayern',        abbreviation:'BAY', country:'Germany',     sofifaTeamId:21,     aliases:['fc bayern munchen','fc bayern münchen','bayern munich','bayern munchen','fc bayern','fcbayern','bayern'] },
  { opponentKey:'barcelona',          displayName:'FC Barcelona',             shortName:'Barcelona',     abbreviation:'BAR', country:'Spain',       sofifaTeamId:241,    aliases:['fc barcelona','barcelona','barca','blaugrana'] },
  { opponentKey:'paris-sg',           displayName:'Paris Saint-Germain',      shortName:'PSG',           abbreviation:'PSG', country:'France',      sofifaTeamId:73,     aliases:['paris saint-germain','paris saint germain','psg','paris sg','paris'] },
  { opponentKey:'bayer-leverkusen',   displayName:'Bayer 04 Leverkusen',      shortName:'Leverkusen',    abbreviation:'B04', country:'Germany',     sofifaTeamId:32,     aliases:['bayer 04 leverkusen','bayer leverkusen','leverkusen','b04','die werkself'] },
  { opponentKey:'rb-leipzig',         displayName:'RB Leipzig',               shortName:'RB Leipzig',    abbreviation:'RBL', country:'Germany',     sofifaTeamId:112172, aliases:['rb leipzig','rbl','rasenballsport leipzig'] },
  { opponentKey:'atletico-madrid',    displayName:'Atlético Madrid',          shortName:'Atlético',      abbreviation:'ATM', country:'Spain',       sofifaTeamId:240,    aliases:['atletico madrid','atletico de madrid','atleti','atm','atletico'] },
  { opponentKey:'psv',                displayName:'PSV Eindhoven',            shortName:'PSV',           abbreviation:'PSV', country:'Netherlands', sofifaTeamId:247,    aliases:['psv eindhoven','psv','philips sport vereniging'] },
  { opponentKey:'sporting-cp',        displayName:'Sporting CP',              shortName:'Sporting CP',   abbreviation:'SCP', country:'Portugal',    sofifaTeamId:237,    aliases:['sporting cp','sporting clube de portugal','sporting lisbon','scp','sporting'] },
  { opponentKey:'benfica',            displayName:'SL Benfica',               shortName:'Benfica',       abbreviation:'BEN', country:'Portugal',    sofifaTeamId:234,    aliases:['sl benfica','benfica','sport lisboa e benfica','slb'] },
  { opponentKey:'porto',              displayName:'FC Porto',                 shortName:'Porto',         abbreviation:'POR', country:'Portugal',    sofifaTeamId:236,    aliases:['fc porto','porto','futebol clube do porto'] },
  { opponentKey:'club-brugge',        displayName:'Club Brugge KV',           shortName:'Club Brugge',   abbreviation:'BRU', country:'Belgium',     sofifaTeamId:231,    aliases:['club brugge kv','club brugge','brugge'] },
  { opponentKey:'celtic',             displayName:'Celtic',                   shortName:'Celtic',        abbreviation:'CEL', country:'Scotland',    sofifaTeamId:78,     aliases:['celtic','celtic fc','the bhoys','hoops'] },
  { opponentKey:'ajax',               displayName:'Ajax',                     shortName:'Ajax',          abbreviation:'AJX', country:'Netherlands', sofifaTeamId:245,    aliases:['ajax','afc ajax','ajax amsterdam'] },
  { opponentKey:'lazio',              displayName:'Lazio',                    shortName:'Lazio',         abbreviation:'LAZ', country:'Italy',       sofifaTeamId:46,     aliases:['lazio','ss lazio','biancocelesti'] },
  { opponentKey:'juventus',           displayName:'Juventus',                 shortName:'Juventus',      abbreviation:'JUV', country:'Italy',       sofifaTeamId:45,     aliases:['juventus','juventus fc','juve','la vecchia signora'] },
  { opponentKey:'ac-milan',           displayName:'AC Milan',                 shortName:'AC Milan',      abbreviation:'ACM', country:'Italy',       sofifaTeamId:47,     aliases:['ac milan','milan','acm','rossoneri'] },
  { opponentKey:'napoli',             displayName:'Napoli',                   shortName:'Napoli',        abbreviation:'NAP', country:'Italy',       sofifaTeamId:48,     aliases:['napoli','ssc napoli','partenopei'] },
  { opponentKey:'roma',               displayName:'Roma',                     shortName:'Roma',          abbreviation:'ROM', country:'Italy',       sofifaTeamId:52,     aliases:['roma','as roma','giallorossi'] },
  { opponentKey:'sevilla',            displayName:'Sevilla FC',               shortName:'Sevilla',       abbreviation:'SEV', country:'Spain',       sofifaTeamId:481,    aliases:['sevilla fc','sevilla','sfc'] },
  { opponentKey:'galatasaray',        displayName:'Galatasaray SK',           shortName:'Galatasaray',   abbreviation:'GAL', country:'Turkey',      sofifaTeamId:325,    aliases:['galatasaray sk','galatasaray','gal'] },
  { opponentKey:'salzburg',           displayName:'FC Red Bull Salzburg',     shortName:'Salzburg',      abbreviation:'SAL', country:'Austria',     sofifaTeamId:191,    aliases:['fc red bull salzburg','red bull salzburg','salzburg','rb salzburg'] },
  { opponentKey:'shakhtar',           displayName:'Shakhtar Donetsk',         shortName:'Shakhtar',      abbreviation:'SHA', country:'Ukraine',     sofifaTeamId:101059, aliases:['shakhtar donetsk','shakhtar','fc shakhtar'] },
  { opponentKey:'young-boys',         displayName:'BSC Young Boys',           shortName:'Young Boys',    abbreviation:'YOB', country:'Switzerland', sofifaTeamId:900,    aliases:['bsc young boys','young boys','yb','bsc yb'] },
  { opponentKey:'braga',              displayName:'Sporting Clube de Braga',  shortName:'Braga',         abbreviation:'SCB', country:'Portugal',    sofifaTeamId:1896,   aliases:['sporting clube de braga','sc braga','braga','scb'] },
  { opponentKey:'feyenoord',          displayName:'Feyenoord',                shortName:'Feyenoord',     abbreviation:'FEY', country:'Netherlands', sofifaTeamId:246,    aliases:['feyenoord','feyenoord rotterdam','fey'] },
]

// ─── Normaliser ───────────────────────────────────────────────────────────────
function normalise(raw) {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|afc|cf|sc|sk|fk|ac|sl|ssc|ss|rc|rcd|kv)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Build alias lookup map ───────────────────────────────────────────────────
const aliasMap = new Map()
for (const entry of SEED) {
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : []
  for (const alias of aliases) {
    const norm = normalise(alias)
    if (!norm) continue
    if (aliasMap.has(norm) && aliasMap.get(norm) !== entry.opponentKey) {
      console.warn(`  [warn] Alias collision: "${alias}" → ${entry.opponentKey} vs ${aliasMap.get(norm)}`)
    }
    aliasMap.set(norm, entry.opponentKey)
  }
}

// ─── Match raw opponent name against seed ─────────────────────────────────────
function proposedMatch(rawOpponent) {
  const raw = rawOpponent === null || rawOpponent === undefined ? '' : String(rawOpponent)
  if (!raw || raw === '(blank)') return null

  const norm = normalise(raw)
  if (!norm) return null

  // 1. Exact alias match
  if (aliasMap.has(norm)) {
    return { key: aliasMap.get(norm), confidence: 'high', strategy: 'exact-alias' }
  }

  // 2. Normalised displayName / shortName match
  for (const entry of SEED) {
    const dn = normalise(entry.displayName)
    const sn = normalise(entry.shortName)
    if ((dn && dn === norm) || (sn && sn === norm)) {
      return { key: entry.opponentKey, confidence: 'high', strategy: 'display-name' }
    }
  }

  // 3. Partial containment (minimum 4 chars to avoid false positives)
  if (norm.length < 4) return null
  const partials = []
  for (const [alias, key] of aliasMap.entries()) {
    if (alias.includes(norm) || norm.includes(alias)) {
      partials.push({ key, alias })
    }
  }
  if (partials.length === 1) {
    return { key: partials[0].key, confidence: 'medium', strategy: 'partial' }
  }
  if (partials.length > 1) {
    const best = partials.slice().sort((a, b) => b.alias.length - a.alias.length)[0]
    return { key: best.key, confidence: 'low', strategy: 'ambiguous' }
  }

  return null
}

// ─── Safe string coercion ─────────────────────────────────────────────────────
function s(v, fallback) {
  const fb = fallback !== undefined ? String(fallback) : ''
  if (v === null || v === undefined) return fb
  const str = String(v)
  return str === '' ? fb : str
}

// ─── Build report from a matches array ───────────────────────────────────────
// Extracted so it can be tested locally without Firestore.
function buildReport(matches, seasonLabels) {
  const labels = (seasonLabels && typeof seasonLabels === 'object') ? seasonLabels : {}

  const groups = new Map()

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (!m || typeof m !== 'object') {
      console.warn(`  [warn] match at index ${i} is not an object — skipping`)
      continue
    }

    const docId   = s(m.id, `index-${i}`)
    const raw     = s(m.opponent, '(blank)') || '(blank)'
    const comp    = s(m.competition)
    const sid     = s(m.seasonId)
    const curKey  = m.opponentKey !== undefined ? s(m.opponentKey) : null

    if (!groups.has(raw)) {
      groups.set(raw, {
        raw,
        currentOpponentKey: curKey,
        count: 0,
        competitions: new Set(),
        seasons: new Set(),
      })
    }

    const g = groups.get(raw)
    g.count++
    if (comp) g.competitions.add(comp)
    if (sid)  g.seasons.add(s(labels[sid], sid) || sid)

    // If later docs have a non-null opponentKey, prefer it over null
    if (curKey && !g.currentOpponentKey) g.currentOpponentKey = curKey
  }

  // Sort: count desc, then alpha
  const sorted = Array.from(groups.values()).sort(
    (a, b) => b.count - a.count || a.raw.localeCompare(b.raw)
  )

  const rows = []
  for (const g of sorted) {
    let match = null
    try { match = proposedMatch(g.raw) } catch (e) {
      console.warn(`  [warn] proposedMatch failed for "${g.raw}": ${e.message}`)
    }

    const seed       = match ? SEED.find(entry => entry.opponentKey === match.key) || null : null
    const needsReview = !match || match.confidence !== 'high'

    const compsArr   = g.competitions instanceof Set ? Array.from(g.competitions) : []
    const seasonsArr = g.seasons      instanceof Set ? Array.from(g.seasons)      : []

    rows.push({
      raw:          g.raw,
      currentKey:   s(g.currentOpponentKey, '—') || '—',
      count:        g.count,
      competitions: compsArr.join(', '),
      seasons:      seasonsArr.slice().sort().join(', '),
      proposedKey:  s(seed ? seed.opponentKey : null,  '❓ UNMATCHED') || '❓ UNMATCHED',
      displayName:  s(seed ? seed.displayName : null,  ''),
      shortName:    s(seed ? seed.shortName   : null,  ''),
      abbreviation: s(seed ? seed.abbreviation: null,  ''),
      sofifaTeamId: (seed && seed.sofifaTeamId != null) ? seed.sofifaTeamId : '',
      crestUrl:     seed
        ? `https://fifa-img.michaelmenda92.workers.dev/team/${seed.sofifaTeamId}`
        : '',
      confidence:   s(match ? match.confidence : null, 'none') || 'none',
      strategy:     s(match ? match.strategy   : null, 'no-match') || 'no-match',
      needsReview,
    })
  }

  return rows
}

// ─── Print report table ───────────────────────────────────────────────────────
function printReport(rows, clubId) {
  const pad = (v, n) => String(v == null ? '' : v).slice(0, n).padEnd(n)

  const W = {
    raw:7, curKey:20, n:4, comps:38, seas:18,
    propKey:22, disp:24, short:16, abbr:5, sfId:9, conf:8, review:10,
  }
  // raw column: adapt to longest name, min 20, max 32
  const maxRaw = Math.min(32, Math.max(20, ...rows.map(r => r.raw.length)))
  W.raw = maxRaw + 1

  const totalW = Object.values(W).reduce((a, b) => a + b, 0)
  const sep    = '─'.repeat(totalW)

  const h = (label, key) => pad(label, W[key])
  console.log(
    h('Raw opponent','raw') + h('Cur key','curKey') + h('N','n') +
    h('Competitions','comps') + h('Seasons','seas') +
    h('Proposed key','propKey') + h('displayName','disp') +
    h('shortName','short') + h('Abbr','abbr') + h('sfId','sfId') +
    h('Conf','conf') + h('Review?','review')
  )
  console.log(sep)

  let autoN = 0, reviewN = 0, unmatchedN = 0
  for (const r of rows) {
    console.log(
      pad(r.raw,          W.raw)     +
      pad(r.currentKey,   W.curKey)  +
      pad(r.count,        W.n)       +
      pad(r.competitions, W.comps)   +
      pad(r.seasons,      W.seas)    +
      pad(r.proposedKey,  W.propKey) +
      pad(r.displayName,  W.disp)    +
      pad(r.shortName,    W.short)   +
      pad(r.abbreviation, W.abbr)    +
      pad(r.sofifaTeamId, W.sfId)    +
      pad(r.confidence,   W.conf)    +
      pad(r.needsReview ? '⚠️  YES' : 'no', W.review)
    )
    if (!r.needsReview) autoN++
    else if (r.confidence === 'none') unmatchedN++
    else reviewN++
  }

  console.log(sep)
  console.log()
  console.log('Summary')
  console.log(`  Club             : ${clubId}`)
  console.log(`  Unique opponents : ${rows.length}`)
  console.log(`  Auto-matched     : ${autoN}`)
  console.log(`  Low/med conf     : ${reviewN}`)
  console.log(`  Unmatched        : ${unmatchedN}`)
  console.log()

  const unmatched = rows.filter(r => r.confidence === 'none')
  if (unmatched.length) {
    console.log('⚠️  UNMATCHED — add to SEED in opponentSeed.mjs before --write:')
    for (const r of unmatched) {
      console.log(`    "${r.raw}"  ×${r.count}  [${r.competitions}]  seasons: ${r.seasons}`)
    }
  } else {
    console.log(`✅  All ${rows.length} opponent names matched to seed entries.`)
  }

  console.log()
  console.log('══════════════════════════════════════════════')
  console.log('crestUrl serving — decision required:')
  console.log('  Option A — Direct CDN (no Worker change):')
  console.log('    https://cdn.sofifa.net/teams/{sofifaTeamId}/light_2x.png')
  console.log('    ✓ Covered by Workbox sofifa-images CacheFirst rule')
  console.log('    ⚠ cdn.sofifa.net may 403 direct browser requests (same issue as player faces)')
  console.log('  Option B — Via Worker (recommended):')
  console.log('    https://fifa-img.michaelmenda92.workers.dev/team/{sofifaTeamId}')
  console.log('    ✓ Consistent with player face pattern; Worker handles CDN 403')
  console.log('    ⚠ Requires adding /team/:id route to the Cloudflare Worker first')
  console.log('  This report shows Option B URLs.')
  console.log('══════════════════════════════════════════════')
}

// ─── Self-test with mock data (runs when --test flag passed) ──────────────────
function runSelfTest() {
  console.log('\n── Self-test: report-building logic with mock match data ──\n')
  const mockMatches = [
    // fully populated, should match
    { id:'m1', opponent:'Manchester City',  opponentKey:null,              competition:'UCL_Final', seasonId:'s1' },
    { id:'m2', opponent:'Real Madrid',      opponentKey:'real-madrid',     competition:'UCL_LP',    seasonId:'s1' },
    { id:'m3', opponent:'Man City',         opponentKey:null,              competition:'UCL_SF',    seasonId:'s2' },
    { id:'m4', opponent:'MCI',              opponentKey:null,              competition:'PL',        seasonId:'s2' },
    // missing opponent
    { id:'m5', opponent:null,               opponentKey:null,              competition:'PL',        seasonId:'s1' },
    { id:'m6', opponent:undefined,          opponentKey:null,              competition:'FA_Cup',    seasonId:'s1' },
    { id:'m7' /* no opponent field */                                                                             },
    // missing competition
    { id:'m8', opponent:'Dortmund',         opponentKey:null,              competition:null,        seasonId:'s2' },
    // missing seasonId
    { id:'m9', opponent:'Liverpool',        opponentKey:null,              competition:'PL',        seasonId:null },
    // missing seasonId field entirely
    { id:'m10', opponent:'Chelsea',         opponentKey:null,              competition:'PL'                       },
    // unknown opponent — should be UNMATCHED
    { id:'m11', opponent:'FC Testington',   opponentKey:null,              competition:'UCL_LP',    seasonId:'s3' },
    // non-string opponent
    { id:'m12', opponent:42,               opponentKey:null,              competition:'PL',        seasonId:'s1' },
    // entirely missing doc (null entry)
    null,
    // opponentKey already set
    { id:'m14', opponent:'Inter Milan',     opponentKey:'inter-milan',     competition:'UCL_Final', seasonId:'s1' },
  ]
  const mockLabels = { s1: 'S1', s2: 'S2', s3: 'S3' }
  const rows = buildReport(mockMatches, mockLabels)
  printReport(rows, 'MOCK-TEST')
  console.log('\n── Self-test complete — no crashes means report logic is safe ──\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Self-test mode: validate report logic against mock data, no Firestore needed
  if (args.test) {
    runSelfTest()
    process.exit(0)
  }

  const db = initFirebase()

  console.log('\n══════════════════════════════════════════════')
  console.log('  Opponent Audit — dry run, no Firestore writes')
  console.log(`  Club ID   : ${CLUB_ID}`)
  console.log(`  Seed size : ${SEED.length} entries`)
  if (SEASON_FILTER) console.log(`  Season filter: ${SEASON_FILTER.join(', ')}`)
  console.log('══════════════════════════════════════════════\n')

  // Fetch matches
  let snapDocs = []
  try {
    const snap = await db.collection('matches').where('clubId', '==', CLUB_ID).get()
    snapDocs = Array.isArray(snap.docs) ? snap.docs : []
  } catch (e) {
    console.error(`\nFailed to fetch matches: ${e.message}\n`)
    if (e.code === 5 || /NOT_FOUND/i.test(e.message)) {
      console.error('Check that the clubId exists in Firestore.\n')
    }
    process.exit(1)
  }

  let matches = snapDocs.map(d => {
    let data = {}
    try { data = d.data() || {} } catch (e) {
      console.warn(`  [warn] doc.data() failed for doc ${d.id}: ${e.message}`)
    }
    return { id: d.id, ...data }
  })

  if (SEASON_FILTER) {
    matches = matches.filter(m => {
      const sid = s(m.seasonId)
      return sid && SEASON_FILTER.includes(sid)
    })
  }

  console.log(`  Matches fetched : ${snapDocs.length}`)
  console.log(`  After filter    : ${matches.length}\n`)

  if (matches.length === 0) {
    console.log(`⚠️  No matches found for clubId "${CLUB_ID}".`)
    console.log('Check the clubId is correct and matches exist in Firestore.\n')
    process.exit(0)
  }

  // Fetch season labels
  const seasonLabels = {}
  try {
    const seasSnap = await db.collection('seasons').where('clubId', '==', CLUB_ID).get()
    const seasDocs = Array.isArray(seasSnap.docs) ? seasSnap.docs : []
    for (const d of seasDocs) {
      try {
        const data = d.data() || {}
        seasonLabels[d.id] = s(data.label, d.id) || d.id
      } catch (e) {
        console.warn(`  [warn] Could not read season doc ${d.id}: ${e.message}`)
      }
    }
  } catch (e) {
    console.warn(`  [warn] Could not fetch seasons (IDs will show instead of labels): ${e.message}`)
  }

  const rows = buildReport(matches, seasonLabels)
  printReport(rows, CLUB_ID)

  if (WRITE_JSON) {
    const output = {
      generatedAt:     new Date().toISOString(),
      clubId:          CLUB_ID,
      matchesRead:     matches.length,
      uniqueOpponents: rows.length,
      rows,
    }
    writeFileSync('audit-opponents.json', JSON.stringify(output, null, 2))
    console.log('\n📄  Full report written to: audit-opponents.json')
  }

  console.log()
}

main().catch(err => {
  console.error('\nFatal error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
