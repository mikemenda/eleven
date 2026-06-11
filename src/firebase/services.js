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
// Queries by playerId only. No clubId filter.
//
// Why playerId-only is safe:
// playerId is a Firestore document ID already scoped to one club save. Two players at
// two different clubs have two separate playerIds — filtering by playerId is inherently
// club-specific with no cross-club contamination risk.
//
// Historical note (resolved pre-Phase-1):
// S2/S3 UCL seasonStats docs were written with corrupted clubId values (letter O vs
// digit 0 mismatch). This was fully repaired by fixSeasonStatsClubId.mjs and verified
// clean: 0 wrong-clubId docs remain. The playerId-only pattern is retained because it
// remains correct and safe regardless.
//
// NOTE: scope:'UCL' docs do not carry a label field — join to seasons by seasonId to
// get the display label ("S1", "S2", etc.). scope:'ALL' docs carry label as a
// convenience cache, but the seasons collection is always authoritative.
export const getSeasonStatsByPlayer = async (playerId) => {
  const q = query(
    collection(db, 'seasonStats'),
    where('playerId', '==', playerId)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Returns ALL seasonStats documents for a given club across all players, seasons,
// and scopes in a single Firestore query.
//
// This is the club-level companion to getSeasonStatsByPlayer. It loads the full
// canonical stat set (99 docs for S1–S3: 66 scope:'ALL' + 33 scope:'UCL') in one
// round-trip. Pages that need to display or compute across multiple players and
// seasons — Records, Players season filter, UCL tabs — use this instead of making
// per-player calls.
//
// The returned array is intentionally unfiltered and unsorted. Each calling page
// filters client-side by scope, playerId, or seasonId as needed. This avoids
// composite Firestore indexes and keeps all grouping/sorting logic co-located with
// the UI that needs it.
//
// Safe to use now that the pre-Phase-1 clubId repair is verified complete.
export const getSeasonStatsByClub = async (clubId) => {
  const q = query(
    collection(db, 'seasonStats'),
    where('clubId', '==', clubId)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ─── TRANSFERS ───────────────────────────────────────────────────────────────

export const getTransfers = async (clubId) => {
  // No orderBy — avoids requiring a composite Firestore index.
  // All deterministic sorting (season + window) is handled client-side in Transfers.jsx.
  try {
    const q = query(collection(db, 'transfers'), where('clubId', '==', clubId))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('[getTransfers] Firestore error:', err)
    return []
  }
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
    // Sort this rival's matches chronologically:
    // Primary: seasonLabel ascending (S1 < S2 … S9 < S10 via localeCompare).
    // Secondary: competition code so league-phase matches group before knockouts
    // within the same season (UCL_LP < UCL_QF < UCL_SF < UCL_Final alphabetically).
    // This sort is stable and will remain correct as future seasons are added.
    r.matches.sort((a, b) => {
      const sa = a.seasonLabel || ''
      const sb = b.seasonLabel || ''
      if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true })
      const ca = a.competition || ''
      const cb = b.competition || ''
      return ca.localeCompare(cb)
    })

    const w = r.matches.filter(m => m.score_for > m.score_against).length
    const d = r.matches.filter(m => m.score_for === m.score_against).length
    const l = r.matches.filter(m => m.score_for < m.score_against).length
    const gf = r.matches.reduce((s, m) => s + (m.score_for || 0), 0)
    const ga = r.matches.reduce((s, m) => s + (m.score_against || 0), 0)
    return { ...r, played: r.matches.length, w, d, l, gf, ga, gd: gf - ga }
  }).sort((a, b) => {
    // Primary sort: most matches played (descending).
    if (b.played !== a.played) return b.played - a.played
    // Tiebreaker 1: goal difference (descending) — more dominant rival ranks higher.
    if (b.gd !== a.gd) return b.gd - a.gd
    // Tiebreaker 2: goals for (descending) — more attacking encounters rank higher.
    if (b.gf !== a.gf) return b.gf - a.gf
    // Tiebreaker 3: alphabetical by opponent key — fully deterministic, never random.
    return a.opponentKey.localeCompare(b.opponentKey)
  })
}

// ─── RECORDS ─────────────────────────────────────────────────────────────────
// computeRecords has been removed. All record computation now lives in
// Records.jsx (computeAllRecords) to keep logic co-located with the UI
// and support the full expanded record set without any Firestore writes.


