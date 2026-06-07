import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './config'

// ─── GAMES (FC Versions) ─────────────────────────────────────────────────────

export const getGames = async () => {
  const snap = await getDocs(collection(db, 'games'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addGame = async (title) => {
  return addDoc(collection(db, 'games'), { title, createdAt: serverTimestamp() })
}

// ─── CLUBS ───────────────────────────────────────────────────────────────────

export const getClubs = async (gameId) => {
  const q = query(collection(db, 'clubs'), where('gameId', '==', gameId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addClub = async (data) => {
  return addDoc(collection(db, 'clubs'), { ...data, createdAt: serverTimestamp() })
}

export const updateClub = async (clubId, data) => {
  return updateDoc(doc(db, 'clubs', clubId), data)
}

// ─── SEASONS ─────────────────────────────────────────────────────────────────

export const getSeasons = async (clubId) => {
  const q = query(
    collection(db, 'seasons'),
    where('clubId', '==', clubId),
    orderBy('year', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addSeason = async (data) => {
  return addDoc(collection(db, 'seasons'), { ...data, createdAt: serverTimestamp() })
}

export const updateSeason = async (seasonId, data) => {
  return updateDoc(doc(db, 'seasons', seasonId), data)
}

export const getSeason = async (seasonId) => {
  const snap = await getDoc(doc(db, 'seasons', seasonId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export const getTrophiesForSeason = async (seasonId) => {
  const q = query(collection(db, 'trophies'), where('seasonId', '==', seasonId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ─── MATCHES ─────────────────────────────────────────────────────────────────

export const getMatches = async (seasonId) => {
  const q = query(collection(db, 'matches'), where('seasonId', '==', seasonId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getMatchesByClub = async (clubId) => {
  const q = query(collection(db, 'matches'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addMatch = async (data) => {
  return addDoc(collection(db, 'matches'), { ...data, createdAt: serverTimestamp() })
}

// ─── PLAYERS ─────────────────────────────────────────────────────────────────

export const getPlayers = async (clubId) => {
  const q = query(collection(db, 'players'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getPlayer = async (playerId) => {
  const snap = await getDoc(doc(db, 'players', playerId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export const addPlayer = async (data) => {
  return addDoc(collection(db, 'players'), { ...data, createdAt: serverTimestamp() })
}

export const updatePlayer = async (playerId, data) => {
  return updateDoc(doc(db, 'players', playerId), data)
}

// Returns all seasonStats documents for a given player across all seasons and scopes.
// Queries by playerId only — a compound playerId+clubId query would silently exclude
// docs where clubId was written inconsistently during early seeding (S2/S3 corruption era).
// Client-side: keep docs where clubId matches OR where clubId is absent (legacy tolerance).
// Callers must join to seasons by seasonId to get the season label ("S1", "S2", etc.) —
// seasonStats docs do NOT have a label field.
export const getSeasonStatsByPlayer = async (playerId, clubId) => {
  const q = query(
    collection(db, 'seasonStats'),
    where('playerId', '==', playerId)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => !d.clubId || d.clubId === clubId)
}

// ─── TRANSFERS ───────────────────────────────────────────────────────────────

export const getTransfers = async (clubId) => {
  const q = query(collection(db, 'transfers'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getTransfersBySeason = async (seasonId) => {
  const q = query(collection(db, 'transfers'), where('seasonId', '==', seasonId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addTransfer = async (data) => {
  return addDoc(collection(db, 'transfers'), { ...data, createdAt: serverTimestamp() })
}

// ─── TROPHIES ────────────────────────────────────────────────────────────────

export const getTrophies = async (clubId) => {
  const q = query(collection(db, 'trophies'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addTrophy = async (data) => {
  return addDoc(collection(db, 'trophies'), { ...data, createdAt: serverTimestamp() })
}

// ─── OPPONENTS ───────────────────────────────────────────────────────────────
// Returns all opponent documents as a Map<opponentKey, opponentDoc>
// for O(1) lookup. Call once per page and pass down; do not call per row.

export const getOpponents = async () => {
  const snap = await getDocs(collection(db, 'opponents'))
  const map = new Map()
  snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
  return map
}

export const getOpponent = async (opponentKey) => {
  if (!opponentKey) return null
  const snap = await getDoc(doc(db, 'opponents', opponentKey))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

// ─── GOALS ───────────────────────────────────────────────────────────────────

export const getGoals = async (matchId) => {
  const q = query(collection(db, 'goals'), where('matchId', '==', matchId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getGoalsByClub = async (clubId) => {
  const q = query(collection(db, 'goals'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addGoal = async (data) => {
  return addDoc(collection(db, 'goals'), data)
}

// ─── RIVALS (derived from matches — no separate collection needed) ────────────
// getRivalData builds H2H stats from match documents keyed by opponent name.
// All computation is client-side to avoid extra Firestore collections.

export const getRivalStats = (matches) => {
  const map = {}
  for (const m of matches) {
    const displayName = m.opponent
    if (!displayName) continue
    // Canonical grouping key: prefer an explicit opponentKey field (for future backfill),
    // otherwise normalize the display name to guard against "Real Madrid" vs "R. Madrid"
    // variants that would otherwise create separate rival entries.
    // TODO: backfill `opponentKey` on all match docs before Season 4 import for clean grouping.
    const groupKey = m.opponentKey || String(displayName).trim().toLowerCase()
    if (!map[groupKey]) {
      map[groupKey] = {
        opponentKey: groupKey,     // stable normalized key for selection/lookup
        opponent: displayName,     // display name from first occurrence
        matches: [],
        narrative: m.rivalryNarrative || ''
      }
    }
    map[groupKey].matches.push(m)
    if (m.rivalryNarrative) map[groupKey].narrative = m.rivalryNarrative
  }
  return Object.values(map).map(r => {
    const w = r.matches.filter(m => m.score_for > m.score_against).length
    const d = r.matches.filter(m => m.score_for === m.score_against).length
    const l = r.matches.filter(m => m.score_for < m.score_against).length
    const gf = r.matches.reduce((s, m) => s + (m.score_for || 0), 0)
    const ga = r.matches.reduce((s, m) => s + (m.score_against || 0), 0)
    return { ...r, played: r.matches.length, w, d, l, gf, ga, gd: gf - ga }
  }).sort((a, b) => b.played - a.played)
}

// ─── RECORDS (computed client-side from players + seasons + matches) ──────────

export const computeRecords = ({ players, seasons, matches, goals, transfers }) => {
  // Individual records — from player career stats stored on player docs
  const active = players.filter(p => p.apps > 0 || p.goals > 0)

  const topScorer     = [...active].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0] || null
  const topAssists    = [...active].sort((a, b) => (b.assists || 0) - (a.assists || 0))[0] || null
  const mostApps      = [...active].sort((a, b) => (b.apps || 0) - (a.apps || 0))[0] || null
  const bestGpg       = active.filter(p => (p.apps || 0) >= 30)
    .map(p => ({ ...p, gpg: (p.goals || 0) / p.apps }))
    .sort((a, b) => b.gpg - a.gpg)[0] || null

  // Season records
  const byPts    = [...seasons].sort((a, b) => (b.leaguePts || 0) - (a.leaguePts || 0))[0] || null
  const byGoals  = [...seasons].sort((a, b) => (b.leagueGF || 0) - (a.leagueGF || 0))[0] || null
  const byGpg    = seasons.filter(s => s.leagueP > 0)
    .map(s => ({ ...s, gpg: (s.leagueGF || 0) / s.leagueP }))
    .sort((a, b) => b.gpg - a.gpg)[0] || null

  // Biggest win — from matches
  const wins = matches.filter(m => m.score_for > m.score_against)
  const biggestWin = [...wins].sort((a, b) =>
    (b.score_for - b.score_against) - (a.score_for - a.score_against)
  )[0] || null

  // UCL finals
  const uclFinals = seasons.filter(s =>
    s.uclResult === 'Champions' || s.uclResult === 'Runners-Up'
  ).map(s => ({
    season: s.label,
    year: s.year,
    result: s.uclResult,
    opponent: s.uclFinalOpponent || s.uclTournamentWinner || '?',
    score: s.uclFinalScore || '?',
  }))

  // GK records — from players with position GK
  const gks = players.filter(p => p.position === 'GK')

  // Transfer records
  const ins  = transfers.filter(t => t.direction === 'IN')
  const outs = transfers.filter(t => t.direction === 'OUT')
  // Resolve season label: prefer the snapshot on the doc, fall back to seasons array lookup
  const resolveLabel = (t) => t.season || seasons.find(s => s.id === t.seasonId)?.label || '?'
  const highestIn  = [...ins].sort((a, b) => (b.fee_eur || 0) - (a.fee_eur || 0))[0] || null
  const highestOut = [...outs].sort((a, b) => (b.fee_eur || 0) - (a.fee_eur || 0))[0] || null
  if (highestIn)  highestIn._seasonLabel  = resolveLabel(highestIn)
  if (highestOut) highestOut._seasonLabel = resolveLabel(highestOut)

  // Net spend per season
  const netByseason = {}
  for (const t of transfers) {
    if (!t.seasonId) continue
    if (!netByseason[t.seasonId]) netByseason[t.seasonId] = { in: 0, out: 0, seasonId: t.seasonId }
    if (t.direction === 'IN')  netByseason[t.seasonId].in  += (t.fee_eur || 0)
    if (t.direction === 'OUT') netByseason[t.seasonId].out += (t.fee_eur || 0)
  }
  const netSpends = Object.values(netByseason).map(n => ({
    ...n,
    net: n.in - n.out,
    season: seasons.find(s => s.id === n.seasonId)?.label || '?'
  }))
  const biggestSpend = [...netSpends].sort((a, b) => b.net - a.net)[0] || null

  return {
    individual: { topScorer, topAssists, mostApps, bestGpg },
    season: { byPts, byGoals, byGpg, biggestWin },
    ucl: { finals: uclFinals },
    gk: { keepers: gks },
    transfers: { highestIn, highestOut, biggestSpend }
  }
}
