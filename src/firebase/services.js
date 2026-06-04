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
  return addDoc(collection(db, 'games'), {
    title,
    createdAt: serverTimestamp()
  })
}

// ─── CLUBS ───────────────────────────────────────────────────────────────────

export const getClubs = async (gameId) => {
  const q = query(collection(db, 'clubs'), where('gameId', '==', gameId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addClub = async (data) => {
  return addDoc(collection(db, 'clubs'), {
    ...data,
    createdAt: serverTimestamp()
  })
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
  return addDoc(collection(db, 'seasons'), {
    ...data,
    createdAt: serverTimestamp()
  })
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
  return addDoc(collection(db, 'matches'), {
    ...data,
    createdAt: serverTimestamp()
  })
}

// ─── PLAYERS ─────────────────────────────────────────────────────────────────

export const getPlayers = async (clubId) => {
  const q = query(collection(db, 'players'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addPlayer = async (data) => {
  return addDoc(collection(db, 'players'), {
    ...data,
    createdAt: serverTimestamp()
  })
}

export const updatePlayer = async (playerId, data) => {
  return updateDoc(doc(db, 'players', playerId), data)
}

// ─── TRANSFERS ───────────────────────────────────────────────────────────────

export const getTransfers = async (clubId) => {
  const q = query(collection(db, 'transfers'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addTransfer = async (data) => {
  return addDoc(collection(db, 'transfers'), {
    ...data,
    createdAt: serverTimestamp()
  })
}

// ─── TROPHIES ────────────────────────────────────────────────────────────────

export const getTrophies = async (clubId) => {
  const q = query(collection(db, 'trophies'), where('clubId', '==', clubId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addTrophy = async (data) => {
  return addDoc(collection(db, 'trophies'), {
    ...data,
    createdAt: serverTimestamp()
  })
}

// ─── GOALS ───────────────────────────────────────────────────────────────────

export const getGoals = async (matchId) => {
  const q = query(collection(db, 'goals'), where('matchId', '==', matchId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const addGoal = async (data) => {
  return addDoc(collection(db, 'goals'), data)
}
