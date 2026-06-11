import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayers, getSeasons, getTransfers, getMatchesByClub, getOpponents, getSeasonStatsByClub } from '../firebase/services'
import TRANSFER_CLUBS from '../../data/transfer-clubs.json'
import styles from './Records.module.css'

// ─── Competition label map ────────────────────────────────────────────────────
const COMP_LABELS = {
  UCL_LP:    'UCL League Phase',
  UCL_R16:   'UCL Round of 16',
  UCL_QF:    'UCL Quarter-Final',
  UCL_SF:    'UCL Semi-Final',
  UCL_Final: 'UCL Final',
  PL:        'Premier League',
  FA_Cup:    'FA Cup',
  Carabao:   'Carabao Cup',
}
const compLabel = (code) => COMP_LABELS[code] || code || '—'

// ─── Fee formatter ────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n) return 'Free'
  if (n >= 1e9) return `€${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1)}M`
  return `€${(n / 1e3).toFixed(0)}K`
}

// ─── Rate formatter ───────────────────────────────────────────────────────────
function fmtRate(n) {
  return n != null ? Number(n).toFixed(2) : '—'
}

// ─── Transfer-clubs identity lookup (mirrors Transfers.jsx exactly) ───────────
const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev'

function resolveClubIdentity(clubName) {
  if (!clubName) return null
  const key = clubName.trim().toLowerCase()
  const entry = TRANSFER_CLUBS[key]
  if (!entry) return null
  return { displayName: entry.displayName, sofifaTeamId: entry.sofifaTeamId }
}

// ─── Player photo ─────────────────────────────────────────────────────────────
function PlayerImg({ sofifaId, name, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <PlayerSilhouette size={size} />
  return (
    <img
      src={`${WORKER_BASE}/${sofifaId}`}
      alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
               flexShrink: 0, display: 'block' }}
      onError={() => setErr(true)}
    />
  )
}

function PlayerSilhouette({ size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--en-surface-2, #1a2a40)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--en-text-4)',
    }}>
      <svg viewBox="0 0 44 44" fill="none" width={size} height={size}>
        <circle cx="22" cy="15" r="7" fill="currentColor" opacity="0.35" />
        <path d="M6 40c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="currentColor" opacity="0.25" />
      </svg>
    </div>
  )
}

// ─── Club / opponent crest ────────────────────────────────────────────────────
function OppCrest({ crestUrl, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!crestUrl || err) return <CrestFallback size={size} />
  return (
    <img
      src={crestUrl}
      alt=""
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, display: 'block' }}
      onError={() => setErr(true)}
    />
  )
}

// Generic shield fallback — used when no opponent or club identity is available
function CrestFallback({ size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, flexShrink: 0,
      background: 'var(--en-surface-2, #1a2a40)',
      border: '0.5px solid var(--en-rule)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 24 24" fill="none" width={size * 0.55} height={size * 0.55}>
        <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
          style={{ color: 'var(--en-text-4)' }} />
      </svg>
    </div>
  )
}

// FC Richport monogram fallback — used for club-only records (no opponent)
function RichportMark({ size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, flexShrink: 0,
      background: 'var(--en-surface-2, #1a2a40)',
      border: '0.5px solid rgba(224,194,122,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: 'var(--font-inter)',
        fontSize: Math.round(size * 0.38) + 'px',
        fontWeight: 800,
        color: 'var(--en-gold)',
        letterSpacing: '-0.03em',
        lineHeight: 1,
        userSelect: 'none',
      }}>XI</span>
    </div>
  )
}

// ─── GK helper ────────────────────────────────────────────────────────────────
function isGK(p) {
  if (!p.position) return false
  return p.position.split(/[,\/]+/).map(x => x.trim()).includes('GK')
}

// ─── Records computation ──────────────────────────────────────────────────────
function computeAllRecords({ players, seasons, transfers, matches, allStatsDocs, uclStatsDocs }) {
  const active   = players.filter(p => !p.isHistoricalStub)
  const outfield = active.filter(p => !isGK(p))
  const gks      = active.filter(p => isGK(p))

  // Lookup maps — used by all collection-based stat blocks below
  const playerById     = new Map(players.map(p => [p.id, p]))
  // scope:'UCL' docs lack a label field; scope:'ALL' docs carry it but we keep
  // this fallback in case any doc is missing it.
  const seasonLabelById = new Map((seasons || []).map(s => [s.id, s.label || '—']))

  // ── All Comps career ──────────────────────────────────────────────────────
  // Rate threshold: 20 apps (all comps career)
  const acCareer = {
    topGoals:   maxBy(active,  p => p.goals || 0),
    topAssists: maxBy(active,  p => p.assists || 0),
    topContrib: maxBy(active,  p => (p.goals || 0) + (p.assists || 0)),
    bestGpg:    maxByRate(active,  p => p.apps >= 20 ? (p.goals || 0) / p.apps : null),
    bestApg:    maxByRate(active,  p => p.apps >= 20 ? (p.assists || 0) / p.apps : null),
    bestCpg:    maxByRate(active,  p => p.apps >= 20 ? ((p.goals || 0) + (p.assists || 0)) / p.apps : null),
    bestCspg:   maxByRate(gks,     p => p.apps >= 20 ? (p.cleanSheets || 0) / p.apps : null),
    topApps:    maxBy(outfield, p => p.apps || 0),
  }

  // ── All Comps single season ───────────────────────────────────────────────
  // Canonical source: scope:'ALL' collection docs.
  // scope:'ALL' docs carry a label field (stored by seedAllCompsStats.mjs);
  // seasonLabelById provides a safe fallback if any doc is missing it.
  const allSeasonEntries = (allStatsDocs || []).map(doc => {
    const player = playerById.get(doc.playerId)
    if (!player || player.isHistoricalStub) return null
    const ss = {
      label:       doc.label || seasonLabelById.get(doc.seasonId) || '—',
      apps:        doc.apps        || 0,
      goals:       doc.goals       || 0,
      assists:     doc.assists     || 0,
      cleanSheets: doc.cleanSheets || 0,
    }
    return { player, ss }
  }).filter(Boolean)
  const gkSeasonEntries = allSeasonEntries.filter(e => isGK(e.player))

  const acSeason = {
    topGoals:   maxByEntry(allSeasonEntries, e => e.ss.goals || 0),
    topAssists: maxByEntry(allSeasonEntries, e => e.ss.assists || 0),
    topContrib: maxByEntry(allSeasonEntries, e => (e.ss.goals || 0) + (e.ss.assists || 0)),
    bestGpg:    maxByEntryRate(allSeasonEntries, e =>
      (e.ss.apps || 0) >= 20 ? (e.ss.goals || 0) / e.ss.apps : null),
    bestApg:    maxByEntryRate(allSeasonEntries, e =>
      (e.ss.apps || 0) >= 20 ? (e.ss.assists || 0) / e.ss.apps : null),
    bestCpg:    maxByEntryRate(allSeasonEntries, e =>
      (e.ss.apps || 0) >= 20 ? ((e.ss.goals || 0) + (e.ss.assists || 0)) / e.ss.apps : null),
    // GK single-season CS/Game — same 20-app threshold as other single-season rates
    bestCspg:   maxByEntryRate(gkSeasonEntries, e =>
      (e.ss.apps || 0) >= 20 ? (e.ss.cleanSheets || 0) / e.ss.apps : null),
  }

  // ── Champions League career ───────────────────────────────────────────────
  // Rate threshold: 5 UCL apps (career)
  // UCL career — canonical: scope:'UCL' collection docs grouped by playerId.
  // No silent fallback to embedded p.seasonStats or top-level p.uclApps.
  // Dev warning fires if a player has top-level UCL totals but no collection docs.
  const uclByPlayer = new Map()
  for (const doc of (uclStatsDocs || [])) {
    if (!doc.playerId) continue
    const p = playerById.get(doc.playerId)
    if (!p || p.isHistoricalStub) continue
    if (!uclByPlayer.has(doc.playerId)) {
      uclByPlayer.set(doc.playerId, {
        ...p,
        uclApps: 0, uclGoals: 0, uclAssists: 0, uclCleanSheets: 0,
      })
    }
    const acc = uclByPlayer.get(doc.playerId)
    acc.uclApps        += doc.apps        || 0
    acc.uclGoals       += doc.goals       || 0
    acc.uclAssists     += doc.assists     || 0
    acc.uclCleanSheets += doc.cleanSheets || 0
  }

  if (process.env.NODE_ENV === 'development') {
    for (const p of active) {
      if ((p.uclApps || 0) > 0 && !uclByPlayer.has(p.id)) {
        console.warn(
          `[Records] ${p.name} has top-level uclApps=${p.uclApps} ` +
          `but no scope:'UCL' collection docs. Run auditSeasonStats.mjs to diagnose.`
        )
      }
    }
  }

  const withUCL         = [...uclByPlayer.values()].filter(p => p.uclApps > 0)
  const withUCLOutfield = withUCL.filter(p => !isGK(p))
  const withUCLGks      = withUCL.filter(p => isGK(p))

  const uclCareer = {
    topGoals:   maxBy(withUCL,         p => p.uclGoals),
    topAssists: maxBy(withUCL,         p => p.uclAssists),
    topContrib: maxBy(withUCL,         p => p.uclGoals + p.uclAssists),
    bestGpg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? p.uclGoals / p.uclApps : null),
    bestApg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? p.uclAssists / p.uclApps : null),
    bestCpg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? (p.uclGoals + p.uclAssists) / p.uclApps : null),
    bestCspg:   maxByRate(withUCLGks,  p => p.uclApps >= 5 ? p.uclCleanSheets / p.uclApps : null),
    topApps:    maxBy(withUCLOutfield, p => p.uclApps),
  }

  // ── Champions League single season ────────────────────────────────────────
  // Canonical source: scope:'UCL' collection docs.
  // scope:'UCL' docs do NOT carry a label field — join via seasonLabelById.
  const uclSeasonEntries = (uclStatsDocs || [])
    .filter(doc => (doc.apps || 0) > 0)
    .map(doc => {
      const player = playerById.get(doc.playerId)
      if (!player || player.isHistoricalStub) return null
      const ss = {
        label:          seasonLabelById.get(doc.seasonId) || '—',
        uclApps:        doc.apps        || 0,
        uclGoals:       doc.goals       || 0,
        uclAssists:     doc.assists     || 0,
        uclCleanSheets: doc.cleanSheets || 0,
      }
      return { player, ss }
    }).filter(Boolean)

  const uclSeason = {
    topGoals:   maxByEntry(uclSeasonEntries, e => e.ss.uclGoals || 0),
    topAssists: maxByEntry(uclSeasonEntries, e => e.ss.uclAssists || 0),
    topContrib: maxByEntry(uclSeasonEntries, e => (e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)),
    bestGpg:    maxByEntryRate(uclSeasonEntries, e =>
      (e.ss.uclApps || 0) >= 5 ? (e.ss.uclGoals || 0) / e.ss.uclApps : null),
    bestApg:    maxByEntryRate(uclSeasonEntries, e =>
      (e.ss.uclApps || 0) >= 5 ? (e.ss.uclAssists || 0) / e.ss.uclApps : null),
    bestCpg:    maxByEntryRate(uclSeasonEntries, e =>
      (e.ss.uclApps || 0) >= 5 ? ((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps : null),
    // GK single-season CS/Game — same 5 UCL app threshold
    bestCspg:   maxByEntryRate(uclSeasonEntries.filter(e => isGK(e.player)), e =>
      (e.ss.uclApps || 0) >= 5 ? (e.ss.uclCleanSheets || 0) / e.ss.uclApps : null),
  }

  // ── Top 5 lists ───────────────────────────────────────────────────────────

  const top5 = {
    // All Comps — Career
    ac_career_goals:   top5By(active, p => p.goals || 0,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: p.goals || 0, ctx: `${p.apps || 0} apps`, fmt: v => `${v} goals` })),
    ac_career_assists: top5By(active, p => p.assists || 0,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: p.assists || 0, ctx: `${p.apps || 0} apps`, fmt: v => `${v} assists` })),
    ac_career_contrib: top5By(active, p => (p.goals||0)+(p.assists||0),
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (p.goals||0)+(p.assists||0), ctx: `${p.apps||0} apps`, fmt: v => `${v} G+A` })),
    ac_career_gpg:     top5ByRate(active.filter(p=>p.apps>=20), p => (p.goals||0)/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: ((p.goals||0)/p.apps).toFixed(2), ctx: `${p.goals||0}G · ${p.apps} apps`, fmt: v => `${v} G/G` })),
    ac_career_apg:     top5ByRate(active.filter(p=>p.apps>=20), p => (p.assists||0)/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: ((p.assists||0)/p.apps).toFixed(2), ctx: `${p.assists||0}A · ${p.apps} apps`, fmt: v => `${v} A/G` })),
    ac_career_cpg:     top5ByRate(active.filter(p=>p.apps>=20), p => ((p.goals||0)+(p.assists||0))/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (((p.goals||0)+(p.assists||0))/p.apps).toFixed(2),
              ctx: `${(p.goals||0)+(p.assists||0)} G+A · ${p.apps} apps`, fmt: v => `${v} C/G` })),
    ac_career_cspg:    top5ByRate(gks.filter(p=>p.apps>=20), p => (p.cleanSheets||0)/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: ((p.cleanSheets||0)/p.apps).toFixed(2),
              ctx: `${p.cleanSheets||0} CS · ${p.apps} apps`, fmt: v => `${v} CS/G` })),
    ac_career_apps:    top5By(outfield, p => p.apps || 0,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: p.apps || 0, ctx: p.position, fmt: v => `${v} apps` })),

    // All Comps — Single Season
    ac_season_goals:   top5ByEntry(allSeasonEntries, e => e.ss.goals||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: e.ss.goals||0, ctx: `${e.ss.label} · ${e.ss.apps||0} apps`, fmt: v => `${v} goals` })),
    ac_season_assists: top5ByEntry(allSeasonEntries, e => e.ss.assists||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: e.ss.assists||0, ctx: `${e.ss.label} · ${e.ss.apps||0} apps`, fmt: v => `${v} assists` })),
    ac_season_contrib: top5ByEntry(allSeasonEntries, e => (e.ss.goals||0)+(e.ss.assists||0),
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: (e.ss.goals||0)+(e.ss.assists||0), ctx: `${e.ss.label} · ${e.ss.apps||0} apps`, fmt: v => `${v} G+A` })),
    ac_season_gpg:     top5ByEntryRate(allSeasonEntries.filter(e=>(e.ss.apps||0)>=20), e=>(e.ss.goals||0)/e.ss.apps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.goals||0)/e.ss.apps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.goals||0}G · ${e.ss.apps} apps`, fmt: v => `${v} G/G` })),
    ac_season_apg:     top5ByEntryRate(allSeasonEntries.filter(e=>(e.ss.apps||0)>=20), e=>(e.ss.assists||0)/e.ss.apps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.assists||0)/e.ss.apps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.assists||0}A · ${e.ss.apps} apps`, fmt: v => `${v} A/G` })),
    ac_season_cpg:     top5ByEntryRate(allSeasonEntries.filter(e=>(e.ss.apps||0)>=20), e=>((e.ss.goals||0)+(e.ss.assists||0))/e.ss.apps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: (((e.ss.goals||0)+(e.ss.assists||0))/e.ss.apps).toFixed(2),
              ctx: `${e.ss.label} · ${(e.ss.goals||0)+(e.ss.assists||0)} G+A · ${e.ss.apps} apps`, fmt: v => `${v} C/G` })),
    ac_season_cspg:    top5ByEntryRate(gkSeasonEntries.filter(e=>(e.ss.apps||0)>=20), e=>(e.ss.cleanSheets||0)/e.ss.apps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.cleanSheets||0)/e.ss.apps).toFixed(2),
              ctx: `${e.ss.label} · ${e.ss.cleanSheets||0} CS · ${e.ss.apps} apps`, fmt: v => `${v} CS/G` })),

    // UCL — Career
    ucl_career_goals:   top5By(withUCL, p=>p.uclGoals,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: p.uclGoals, ctx: `${p.uclApps} apps`, fmt: v => `${v} goals` })),
    ucl_career_assists: top5By(withUCL, p=>p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: p.uclAssists, ctx: `${p.uclApps} apps`, fmt: v => `${v} assists` })),
    ucl_career_contrib: top5By(withUCL, p=>p.uclGoals+p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: p.uclGoals+p.uclAssists, ctx: `${p.uclApps} apps`, fmt: v => `${v} G+A` })),
    ucl_career_gpg:     top5ByRate(withUCL.filter(p=>p.uclApps>=5), p=>p.uclGoals/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (p.uclGoals/p.uclApps).toFixed(2), ctx: `${p.uclGoals}G · ${p.uclApps} apps`, fmt: v => `${v} G/G` })),
    ucl_career_apg:     top5ByRate(withUCL.filter(p=>p.uclApps>=5), p=>p.uclAssists/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (p.uclAssists/p.uclApps).toFixed(2), ctx: `${p.uclAssists}A · ${p.uclApps} apps`, fmt: v => `${v} A/G` })),
    ucl_career_cpg:     top5ByRate(withUCL.filter(p=>p.uclApps>=5), p=>(p.uclGoals+p.uclAssists)/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: ((p.uclGoals+p.uclAssists)/p.uclApps).toFixed(2),
              ctx: `${p.uclGoals+p.uclAssists} G+A · ${p.uclApps} apps`, fmt: v => `${v} C/G` })),
    ucl_career_cspg:    top5ByRate(withUCLGks.filter(p=>p.uclApps>=5), p=>p.uclCleanSheets/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (p.uclCleanSheets/p.uclApps).toFixed(2),
              ctx: `${p.uclCleanSheets} CS · ${p.uclApps} apps`, fmt: v => `${v} CS/G` })),
    ucl_career_apps:    top5By(withUCLOutfield, p=>p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: p.uclApps, ctx: p.position, fmt: v => `${v} apps` })),

    // UCL — Single Season
    ucl_season_goals:   top5ByEntry(uclSeasonEntries, e=>e.ss.uclGoals||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: e.ss.uclGoals||0, ctx: `${e.ss.label} · ${e.ss.uclApps||0} apps`, fmt: v => `${v} goals` })),
    ucl_season_assists: top5ByEntry(uclSeasonEntries, e=>e.ss.uclAssists||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: e.ss.uclAssists||0, ctx: `${e.ss.label} · ${e.ss.uclApps||0} apps`, fmt: v => `${v} assists` })),
    ucl_season_contrib: top5ByEntry(uclSeasonEntries, e=>(e.ss.uclGoals||0)+(e.ss.uclAssists||0),
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: (e.ss.uclGoals||0)+(e.ss.uclAssists||0), ctx: `${e.ss.label} · ${e.ss.uclApps||0} apps`, fmt: v => `${v} G+A` })),
    ucl_season_gpg:     top5ByEntryRate(uclSeasonEntries.filter(e=>(e.ss.uclApps||0)>=5), e=>(e.ss.uclGoals||0)/e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.uclGoals||0)/e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${e.ss.uclGoals||0}G · ${e.ss.uclApps} apps`, fmt: v => `${v} G/G` })),
    ucl_season_apg:     top5ByEntryRate(uclSeasonEntries.filter(e=>(e.ss.uclApps||0)>=5), e=>(e.ss.uclAssists||0)/e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.uclAssists||0)/e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${e.ss.uclAssists||0}A · ${e.ss.uclApps} apps`, fmt: v => `${v} A/G` })),
    ucl_season_cpg:     top5ByEntryRate(uclSeasonEntries.filter(e=>(e.ss.uclApps||0)>=5), e=>((e.ss.uclGoals||0)+(e.ss.uclAssists||0))/e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: (((e.ss.uclGoals||0)+(e.ss.uclAssists||0))/e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${(e.ss.uclGoals||0)+(e.ss.uclAssists||0)} G+A · ${e.ss.uclApps} apps`, fmt: v => `${v} C/G` })),
    ucl_season_cspg:    top5ByEntryRate(uclSeasonEntries.filter(e=>isGK(e.player)&&(e.ss.uclApps||0)>=5), e=>(e.ss.uclCleanSheets||0)/e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.uclCleanSheets||0)/e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${e.ss.uclCleanSheets||0} CS · ${e.ss.uclApps} apps`, fmt: v => `${v} CS/G` })),

    // Club tab
    club_pts:       top5By(seasons, s=>s.leaguePts||0,
      s => ({ name: s.label, value: s.leaguePts||0, ctx: `${s.leagueW}W ${s.leagueD}D ${s.leagueL}L`, fmt: v=>`${v} pts`, isClub: true })),
    club_goals:     top5By(seasons, s=>s.leagueGF||0,
      s => ({ name: s.label, value: s.leagueGF||0, ctx: s.leagueP>0?`${(s.leagueGF/s.leagueP).toFixed(2)} G/game`:'', fmt: v=>`${v} goals`, isClub: true })),
    club_gpg:       top5ByRate(seasons.filter(s=>s.leagueP>0), s=>s.leagueGF/s.leagueP,
      s => ({ name: s.label, value: (s.leagueGF/s.leagueP).toFixed(2), ctx: `${s.leagueGF} goals · ${s.leagueP} games`, isClub: true })),
    club_ga:        top5By(seasons, s=>-(s.leagueGA||999),
      s => ({ name: s.label, value: s.leagueGA||0, ctx: `${s.leagueP||0} games`, fmt: v=>`${v} conceded`, isClub: true })),
    club_dynasty:   top5By(seasons, s=>s.dynastyScore||0,
      s => ({ name: s.label, value: s.dynastyScore||0, ctx: s.year||'', fmt: v=>`${v} pts`, isClub: true })),
    club_win:       buildBiggestWinTop5(matches),
    transfers_in:   top5By(transfers.filter(t=>t.direction==='IN'), t=>t.fee_eur||0,
      t => ({ name: t.player||'Unknown', value: t.fee_eur||0,
              ctx: `${seasons.find(s=>s.id===t.seasonId)?.label||t.season||'?'} · from ${t.from_club||'?'}`,
              fmt: fmt, isClub: true })),
    transfers_out:  top5By(transfers.filter(t=>t.direction==='OUT'), t=>t.fee_eur||0,
      t => ({ name: t.player||'Unknown', value: t.fee_eur||0,
              ctx: `${seasons.find(s=>s.id===t.seasonId)?.label||t.season||'?'} · to ${t.to_club||'?'}`,
              fmt: fmt, isClub: true })),
  }

  // ── Club season records ───────────────────────────────────────────────────
  const resolveLabel = t => t.season || seasons.find(s => s.id === t.seasonId)?.label || '?'
  const ins      = transfers.filter(t => t.direction === 'IN')
  const outs     = transfers.filter(t => t.direction === 'OUT')
  const highestIn  = [...ins].sort((a,b)=>(b.fee_eur||0)-(a.fee_eur||0))[0] || null
  const highestOut = [...outs].sort((a,b)=>(b.fee_eur||0)-(a.fee_eur||0))[0] || null
  if (highestIn)  highestIn._seasonLabel  = resolveLabel(highestIn)
  if (highestOut) highestOut._seasonLabel = resolveLabel(highestOut)

  const wins      = matches.filter(m => m.score_for > m.score_against)
  const biggestWin = [...wins].sort((a,b)=>(b.score_for-b.score_against)-(a.score_for-a.score_against))[0]||null

  const byPts     = [...seasons].sort((a,b)=>(b.leaguePts||0)-(a.leaguePts||0))[0]||null
  const byGoals   = [...seasons].sort((a,b)=>(b.leagueGF||0)-(a.leagueGF||0))[0]||null
  const byGpg     = seasons.filter(s=>s.leagueP>0).map(s=>({...s,gpg:s.leagueGF/s.leagueP})).sort((a,b)=>b.gpg-a.gpg)[0]||null
  const byGA      = [...seasons].filter(s=>s.leagueP>0).sort((a,b)=>(a.leagueGA||999)-(b.leagueGA||999))[0]||null
  const byDynasty = [...seasons].sort((a,b)=>(b.dynastyScore||0)-(a.dynastyScore||0))[0]||null

  return {
    acCareer, acSeason,
    uclCareer, uclSeason,
    club: { byPts, byGoals, byGpg, byGA, byDynasty, biggestWin, highestIn, highestOut },
    top5,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maxBy(arr, fn) {
  if (!arr.length) return null
  return arr.reduce((best, x) => fn(x) > fn(best) ? x : best, arr[0])
}
function maxByRate(arr, fn) {
  const eligible = arr.filter(x => fn(x) !== null)
  if (!eligible.length) return null
  return eligible.reduce((best, x) => fn(x) > fn(best) ? x : best, eligible[0])
}
function maxByEntry(entries, fn) {
  if (!entries.length) return null
  return entries.reduce((best, e) => fn(e) > fn(best) ? e : best, entries[0])
}
function maxByEntryRate(entries, fn) {
  const eligible = entries.filter(e => fn(e) !== null)
  if (!eligible.length) return null
  return eligible.reduce((best, e) => fn(e) > fn(best) ? e : best, eligible[0])
}
function top5By(arr, scoreFn, mapFn) {
  return [...arr].sort((a,b)=>scoreFn(b)-scoreFn(a)).slice(0,5).map(mapFn)
}
function top5ByRate(arr, scoreFn, mapFn) {
  return [...arr].sort((a,b)=>scoreFn(b)-scoreFn(a)).slice(0,5).map(mapFn)
}
function top5ByEntry(entries, scoreFn, mapFn) {
  return [...entries].sort((a,b)=>scoreFn(b)-scoreFn(a)).slice(0,5).map(mapFn)
}
function top5ByEntryRate(entries, scoreFn, mapFn) {
  return [...entries].sort((a,b)=>scoreFn(b)-scoreFn(a)).slice(0,5).map(mapFn)
}

function buildBiggestWinTop5(matches) {
  const wins = matches.filter(m => m.score_for > m.score_against)
  return [...wins]
    .sort((a,b) => (b.score_for-b.score_against)-(a.score_for-a.score_against))
    .slice(0,5)
    .map(m => ({
      name: `vs ${m.opponent}`,
      value: `${m.score_for}–${m.score_against}`,
      ctx: `${compLabel(m.competition)} · ${m.home_away==='H'?'Home':m.home_away==='A'?'Away':'Neutral'}`,
      isClub: true,
    }))
}

// ─── Top 5 Modal ──────────────────────────────────────────────────────────────

function Top5Modal({ title, items, onClose, onPlayerClick }) {
  if (!items) return null
  const modal = (
    <div className={styles.rModalOverlay} onClick={onClose}>
      <div className={styles.rModal} onClick={e => e.stopPropagation()}>
        <div className={styles.rModalHeader}>
          <span className={styles.rModalTitle}>{title}</span>
          <button className={styles.rModalClose} onClick={onClose}>✕</button>
        </div>
        {items.length === 0 ? (
          <div className={styles.rModalEmpty}>No eligible entries yet</div>
        ) : (
          <div className={styles.rModalList}>
            {items.map((item, i) => (
              <div key={i} className={styles.rModalRow}>
                <span className={styles.rModalRank}>{i + 1}</span>
                {!item.isClub && (
                  <button
                    className={styles.rModalPlayerBtn}
                    onClick={() => item.id && onPlayerClick(item.id)}
                    disabled={!item.id}
                  >
                    <PlayerImg sofifaId={item.sofifaId} name={item.name} size={28} />
                  </button>
                )}
                <button
                  className={styles.rModalInfoBtn}
                  onClick={() => item.id && !item.isClub && onPlayerClick(item.id)}
                  disabled={!item.id || item.isClub}
                >
                  <span className={styles.rModalName}>{item.name}</span>
                  {item.ctx && <span className={styles.rModalCtx}>{item.ctx}</span>}
                </button>
                <span className={styles.rModalValue}>
                  {item.fmt ? item.fmt(item.value) : item.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}

// ─── Player record card ───────────────────────────────────────────────────────
// All record values are gold — no highlight prop needed.

function RecordCard({ label, player, value, ctx, onCardClick, onPlayerClick }) {
  function handlePlayer() {
    if (player?.id && onPlayerClick) onPlayerClick(player.id)
  }
  return (
    <div className={styles.rCard}>
      <div className={styles.rLeft}>
        <button className={styles.rPlayerBtn} onClick={handlePlayer} disabled={!player?.id} title={player?.name}>
          <PlayerImg sofifaId={player?.sofifaId} name={player?.name || ''} size={36} />
        </button>
        <button className={styles.rMetaBtn} onClick={handlePlayer} disabled={!player?.id}>
          <span className={styles.rHolder}>{player?.name || '—'}</span>
          {ctx && <span className={styles.rCtx}>{ctx}</span>}
        </button>
      </div>
      <button className={styles.rRight} onClick={onCardClick}>
        <span className={styles.rLabel}>{label}</span>
        <span className={styles.rValue} style={{ color: 'var(--en-gold)' }}>{value}</span>
      </button>
    </div>
  )
}

// ─── Club record card — crest on left ────────────────────────────────────────

function ClubRecordCard({ label, holder, value, ctx, crestUrl, crestType, onCardClick }) {
  // crestType: 'opp' = opponent crest, 'richport' = XI monogram, undefined = generic fallback
  const crestEl = crestType === 'richport'
    ? <RichportMark size={36} />
    : <OppCrest crestUrl={crestUrl || null} size={36} />

  return (
    <button
      className={`${styles.rCard} ${styles.rCardClub} ${onCardClick ? styles.rCardTappable : ''}`}
      onClick={onCardClick}
      disabled={!onCardClick}
      style={{ width: '100%', textAlign: 'left' }}
    >
      <div className={styles.rLeft}>
        <div style={{ flexShrink: 0 }}>{crestEl}</div>
        <div className={styles.rMetaBtn} style={{ cursor: 'inherit', pointerEvents: 'none' }}>
          <span className={styles.rHolder}>{holder || '—'}</span>
          {ctx && <span className={styles.rCtx}>{ctx}</span>}
        </div>
      </div>
      <div className={styles.rRight} style={{ cursor: 'inherit', pointerEvents: 'none' }}>
        <span className={styles.rLabel}>{label}</span>
        <span className={styles.rValue} style={{ color: 'var(--en-gold)' }}>{value}</span>
      </div>
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div className={styles.rSection}>
      <div className={styles.rSectionTitle}>{title}</div>
      {children}
    </div>
  )
}

// ─── Tab panels ───────────────────────────────────────────────────────────────

function AllCompsTab({ r, onCardClick, onPlayerClick }) {
  const { acCareer: c, acSeason: s } = r
  const fromPlayer = p => p ? { id: p.id, name: p.name, sofifaId: p.sofifaId } : null
  const fromEntry  = e => e ? { id: e.player.id, name: e.player.name, sofifaId: e.player.sofifaId } : null

  return (
    <div className={styles.rWrap}>
      {/* Career — order: Goals · Assists · G+A · G/G · A/G · C/G · CS/G · Appearances */}
      <Section title="Career">
        <RecordCard label="Most Goals"
          player={fromPlayer(c.topGoals)}
          value={c.topGoals ? `${c.topGoals.goals} goals` : '—'}
          ctx={c.topGoals ? `${c.topGoals.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_goals','Most Goals')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most Assists"
          player={fromPlayer(c.topAssists)}
          value={c.topAssists ? `${c.topAssists.assists} assists` : '—'}
          ctx={c.topAssists ? `${c.topAssists.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_assists','Most Assists')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most G+A"
          player={fromPlayer(c.topContrib)}
          value={c.topContrib ? `${(c.topContrib.goals||0)+(c.topContrib.assists||0)} G+A` : '—'}
          ctx={c.topContrib ? `${c.topContrib.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_contrib','Most G+A')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best G/Game"
          player={fromPlayer(c.bestGpg)}
          value={c.bestGpg ? `${fmtRate((c.bestGpg.goals||0)/c.bestGpg.apps)} G/G` : '—'}
          ctx={c.bestGpg ? `${c.bestGpg.goals||0}G · ${c.bestGpg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_gpg','Best G/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best A/Game"
          player={fromPlayer(c.bestApg)}
          value={c.bestApg ? `${fmtRate((c.bestApg.assists||0)/c.bestApg.apps)} A/G` : '—'}
          ctx={c.bestApg ? `${c.bestApg.assists||0}A · ${c.bestApg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_apg','Best A/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best C/Game"
          player={fromPlayer(c.bestCpg)}
          value={c.bestCpg ? `${fmtRate(((c.bestCpg.goals||0)+(c.bestCpg.assists||0))/c.bestCpg.apps)} C/G` : '—'}
          ctx={c.bestCpg ? `${(c.bestCpg.goals||0)+(c.bestCpg.assists||0)} G+A · ${c.bestCpg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_cpg','Best C/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best CS/Game"
          player={fromPlayer(c.bestCspg)}
          value={c.bestCspg ? `${fmtRate((c.bestCspg.cleanSheets||0)/c.bestCspg.apps)} CS/G` : '—'}
          ctx={c.bestCspg ? `${c.bestCspg.cleanSheets||0} CS · ${c.bestCspg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_cspg','Best CS/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most Appearances"
          player={fromPlayer(c.topApps)}
          value={c.topApps ? `${c.topApps.apps} apps` : '—'}
          ctx={c.topApps?.position || null}
          onCardClick={()=>onCardClick('ac_career_apps','Most Appearances')} onPlayerClick={onPlayerClick} />
      </Section>
      <p className={styles.rQualNote}>Rate records require a minimum of 20 appearances.</p>

      {/* Single Season — order: Goals · Assists · G+A · G/G · A/G · C/G · CS/G */}
      <Section title="Single Season">
        <RecordCard label="Most Goals"
          player={fromEntry(s.topGoals)}
          value={s.topGoals ? `${s.topGoals.ss.goals} goals` : '—'}
          ctx={s.topGoals ? `${s.topGoals.ss.label} · ${s.topGoals.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_goals','Most Goals — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most Assists"
          player={fromEntry(s.topAssists)}
          value={s.topAssists ? `${s.topAssists.ss.assists} assists` : '—'}
          ctx={s.topAssists ? `${s.topAssists.ss.label} · ${s.topAssists.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_assists','Most Assists — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most G+A"
          player={fromEntry(s.topContrib)}
          value={s.topContrib ? `${(s.topContrib.ss.goals||0)+(s.topContrib.ss.assists||0)} G+A` : '—'}
          ctx={s.topContrib ? `${s.topContrib.ss.label} · ${s.topContrib.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_contrib','Most G+A — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best G/Game"
          player={fromEntry(s.bestGpg)}
          value={s.bestGpg ? `${fmtRate((s.bestGpg.ss.goals||0)/s.bestGpg.ss.apps)} G/G` : '—'}
          ctx={s.bestGpg ? `${s.bestGpg.ss.label} · ${s.bestGpg.ss.goals||0}G · ${s.bestGpg.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_gpg','Best G/Game — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best A/Game"
          player={fromEntry(s.bestApg)}
          value={s.bestApg ? `${fmtRate((s.bestApg.ss.assists||0)/s.bestApg.ss.apps)} A/G` : '—'}
          ctx={s.bestApg ? `${s.bestApg.ss.label} · ${s.bestApg.ss.assists||0}A · ${s.bestApg.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_apg','Best A/Game — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best C/Game"
          player={fromEntry(s.bestCpg)}
          value={s.bestCpg ? `${fmtRate(((s.bestCpg.ss.goals||0)+(s.bestCpg.ss.assists||0))/s.bestCpg.ss.apps)} C/G` : '—'}
          ctx={s.bestCpg ? `${s.bestCpg.ss.label} · ${(s.bestCpg.ss.goals||0)+(s.bestCpg.ss.assists||0)} G+A · ${s.bestCpg.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_cpg','Best C/Game — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best CS/Game"
          player={fromEntry(s.bestCspg)}
          value={s.bestCspg ? `${fmtRate((s.bestCspg.ss.cleanSheets||0)/s.bestCspg.ss.apps)} CS/G` : '—'}
          ctx={s.bestCspg ? `${s.bestCspg.ss.label} · ${s.bestCspg.ss.cleanSheets||0} CS · ${s.bestCspg.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_cspg','Best CS/Game — Single Season')} onPlayerClick={onPlayerClick} />
      </Section>
      <p className={styles.rQualNote}>Rate records require a minimum of 20 appearances.</p>
    </div>
  )
}

function UCLTab({ r, onCardClick, onPlayerClick }) {
  const { uclCareer: c, uclSeason: s } = r
  const fromCareer = p => p ? { id: p.id, name: p.name, sofifaId: p.sofifaId } : null
  const fromEntry  = e => e ? { id: e.player.id, name: e.player.name, sofifaId: e.player.sofifaId } : null

  return (
    <div className={styles.rWrap}>
      {/* Career — order: Goals · Assists · G+A · G/G · A/G · C/G · CS/G · Appearances */}
      <Section title="Career">
        <RecordCard label="Most Goals"
          player={fromCareer(c.topGoals)}
          value={c.topGoals ? `${c.topGoals.uclGoals} goals` : '—'}
          ctx={c.topGoals ? `${c.topGoals.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_career_goals','Most Goals')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most Assists"
          player={fromCareer(c.topAssists)}
          value={c.topAssists ? `${c.topAssists.uclAssists} assists` : '—'}
          ctx={c.topAssists ? `${c.topAssists.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_career_assists','Most Assists')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most G+A"
          player={fromCareer(c.topContrib)}
          value={c.topContrib ? `${c.topContrib.uclGoals+c.topContrib.uclAssists} G+A` : '—'}
          ctx={c.topContrib ? `${c.topContrib.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_career_contrib','Most G+A')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best G/Game"
          player={fromCareer(c.bestGpg)}
          value={c.bestGpg ? `${fmtRate(c.bestGpg.uclGoals/c.bestGpg.uclApps)} G/G` : '—'}
          ctx={c.bestGpg ? `${c.bestGpg.uclGoals}G · ${c.bestGpg.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_career_gpg','Best G/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best A/Game"
          player={fromCareer(c.bestApg)}
          value={c.bestApg ? `${fmtRate(c.bestApg.uclAssists/c.bestApg.uclApps)} A/G` : '—'}
          ctx={c.bestApg ? `${c.bestApg.uclAssists}A · ${c.bestApg.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_career_apg','Best A/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best C/Game"
          player={fromCareer(c.bestCpg)}
          value={c.bestCpg ? `${fmtRate((c.bestCpg.uclGoals+c.bestCpg.uclAssists)/c.bestCpg.uclApps)} C/G` : '—'}
          ctx={c.bestCpg ? `${c.bestCpg.uclGoals+c.bestCpg.uclAssists} G+A · ${c.bestCpg.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_career_cpg','Best C/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best CS/Game"
          player={fromCareer(c.bestCspg)}
          value={c.bestCspg ? `${fmtRate(c.bestCspg.uclCleanSheets/c.bestCspg.uclApps)} CS/G` : '—'}
          ctx={c.bestCspg ? `${c.bestCspg.uclCleanSheets} CS · ${c.bestCspg.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_career_cspg','Best CS/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most Appearances"
          player={fromCareer(c.topApps)}
          value={c.topApps ? `${c.topApps.uclApps} apps` : '—'}
          ctx={c.topApps?.position || null}
          onCardClick={()=>onCardClick('ucl_career_apps','Most Appearances')} onPlayerClick={onPlayerClick} />
      </Section>
      <p className={styles.rQualNote}>Rate records require a minimum of 5 UCL appearances.</p>

      {/* Single Season — order: Goals · Assists · G+A · G/G · A/G · C/G · CS/G */}
      <Section title="Single Season">
        <RecordCard label="Most Goals"
          player={fromEntry(s.topGoals)}
          value={s.topGoals ? `${s.topGoals.ss.uclGoals} goals` : '—'}
          ctx={s.topGoals ? `${s.topGoals.ss.label} · ${s.topGoals.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_goals','Most Goals — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most Assists"
          player={fromEntry(s.topAssists)}
          value={s.topAssists ? `${s.topAssists.ss.uclAssists} assists` : '—'}
          ctx={s.topAssists ? `${s.topAssists.ss.label} · ${s.topAssists.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_assists','Most Assists — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most G+A"
          player={fromEntry(s.topContrib)}
          value={s.topContrib ? `${(s.topContrib.ss.uclGoals||0)+(s.topContrib.ss.uclAssists||0)} G+A` : '—'}
          ctx={s.topContrib ? `${s.topContrib.ss.label} · ${s.topContrib.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_contrib','Most G+A — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best G/Game"
          player={fromEntry(s.bestGpg)}
          value={s.bestGpg ? `${fmtRate((s.bestGpg.ss.uclGoals||0)/s.bestGpg.ss.uclApps)} G/G` : '—'}
          ctx={s.bestGpg ? `${s.bestGpg.ss.label} · ${s.bestGpg.ss.uclGoals||0}G · ${s.bestGpg.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_gpg','Best G/Game — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best A/Game"
          player={fromEntry(s.bestApg)}
          value={s.bestApg ? `${fmtRate((s.bestApg.ss.uclAssists||0)/s.bestApg.ss.uclApps)} A/G` : '—'}
          ctx={s.bestApg ? `${s.bestApg.ss.label} · ${s.bestApg.ss.uclAssists||0}A · ${s.bestApg.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_apg','Best A/Game — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best C/Game"
          player={fromEntry(s.bestCpg)}
          value={s.bestCpg ? `${fmtRate(((s.bestCpg.ss.uclGoals||0)+(s.bestCpg.ss.uclAssists||0))/s.bestCpg.ss.uclApps)} C/G` : '—'}
          ctx={s.bestCpg ? `${s.bestCpg.ss.label} · ${(s.bestCpg.ss.uclGoals||0)+(s.bestCpg.ss.uclAssists||0)} G+A · ${s.bestCpg.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_cpg','Best C/Game — Single Season')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best CS/Game"
          player={fromEntry(s.bestCspg)}
          value={s.bestCspg ? `${fmtRate((s.bestCspg.ss.uclCleanSheets||0)/s.bestCspg.ss.uclApps)} CS/G` : '—'}
          ctx={s.bestCspg ? `${s.bestCspg.ss.label} · ${s.bestCspg.ss.uclCleanSheets||0} CS · ${s.bestCspg.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_cspg','Best CS/Game — Single Season')} onPlayerClick={onPlayerClick} />
      </Section>
      <p className={styles.rQualNote}>Rate records require a minimum of 5 UCL appearances.</p>
    </div>
  )
}

function ClubTab({ r, opponents, onCardClick }) {
  const { club: c } = r

  // Resolve opponent crest URL from opponents map (same pattern as UCL Records)
  function oppCrest(oppName) {
    if (!oppName || !opponents) return null
    for (const [, rec] of opponents) {
      if (rec.displayName === oppName || rec.opponentRaw === oppName) return rec.crestUrl || null
    }
    return null
  }

  // Resolve transfer club crest via transfer-clubs.json (exact same as Transfers.jsx)
  function transferCrest(clubName) {
    const ident = resolveClubIdentity(clubName)
    if (!ident?.sofifaTeamId) return null
    return `${WORKER_BASE}/team/${ident.sofifaTeamId}`
  }

  return (
    <div className={styles.rWrap}>
      <Section title="Season Records">
        <ClubRecordCard label="Most League Points"
          holder={c.byPts?.label}
          value={c.byPts ? `${c.byPts.leaguePts} pts` : '—'}
          ctx={c.byPts ? `${c.byPts.leagueW}W ${c.byPts.leagueD}D ${c.byPts.leagueL}L` : null}
          crestType="richport"
          onCardClick={()=>onCardClick('club_pts','Most League Points')} />
        <ClubRecordCard label="Most League Goals"
          holder={c.byGoals?.label}
          value={c.byGoals ? `${c.byGoals.leagueGF} goals` : '—'}
          ctx={c.byGoals?.leagueP > 0 ? `${(c.byGoals.leagueGF/c.byGoals.leagueP).toFixed(2)} G/game` : null}
          crestType="richport"
          onCardClick={()=>onCardClick('club_goals','Most League Goals')} />
        <ClubRecordCard label="Best Goals/Game"
          holder={c.byGpg?.label}
          value={c.byGpg ? `${c.byGpg.gpg.toFixed(2)} G/game` : '—'}
          ctx={c.byGpg ? `${c.byGpg.leagueGF} goals · ${c.byGpg.leagueP} games` : null}
          crestType="richport"
          onCardClick={()=>onCardClick('club_gpg','Best Goals/Game')} />
        <ClubRecordCard label="Fewest Goals Conceded"
          holder={c.byGA?.label}
          value={c.byGA ? `${c.byGA.leagueGA} conceded` : '—'}
          ctx={c.byGA ? `${c.byGA.leagueP} games` : null}
          crestType="richport"
          onCardClick={()=>onCardClick('club_ga','Fewest Goals Conceded')} />
        <ClubRecordCard label="Best Dynasty Score"
          holder={c.byDynasty?.label}
          value={c.byDynasty ? `${c.byDynasty.dynastyScore} pts` : '—'}
          ctx={c.byDynasty?.year}
          crestType="richport"
          onCardClick={()=>onCardClick('club_dynasty','Best Dynasty Score')} />
        {c.biggestWin ? (
          <ClubRecordCard label="Biggest Win"
            holder={`vs ${c.biggestWin.opponent}`}
            value={`${c.biggestWin.score_for}–${c.biggestWin.score_against}`}
            ctx={`${compLabel(c.biggestWin.competition)} · ${c.biggestWin.home_away==='H'?'Home':c.biggestWin.home_away==='A'?'Away':'Neutral'}`}
            crestUrl={oppCrest(c.biggestWin.opponent)}
            onCardClick={()=>onCardClick('club_win','Biggest Win')} />
        ) : (
          <ClubRecordCard label="Biggest Win" holder="No match data yet" value="—" crestType="richport" />
        )}
      </Section>

      <Section title="Transfers">
        <ClubRecordCard label="Highest Fee Received"
          holder={c.highestOut ? c.highestOut.player : 'No data'}
          value={c.highestOut ? fmt(c.highestOut.fee_eur) : '—'}
          ctx={c.highestOut ? `${c.highestOut._seasonLabel} · to ${c.highestOut.to_club||'?'}` : null}
          crestUrl={c.highestOut ? transferCrest(c.highestOut.to_club) : null}
          onCardClick={c.highestOut ? ()=>onCardClick('transfers_out','Highest Fee Received') : null} />
        <ClubRecordCard label="Highest Fee Paid"
          holder={c.highestIn ? c.highestIn.player : 'No data'}
          value={c.highestIn ? fmt(c.highestIn.fee_eur) : '—'}
          ctx={c.highestIn ? `${c.highestIn._seasonLabel} · from ${c.highestIn.from_club||'?'}` : null}
          crestUrl={c.highestIn ? transferCrest(c.highestIn.from_club) : null}
          onCardClick={c.highestIn ? ()=>onCardClick('transfers_in','Highest Fee Paid') : null} />
      </Section>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const VALID_TABS = ['allcomps', 'champions', 'club']
const TABS = [
  { key: 'allcomps',  label: 'All Comps' },
  { key: 'champions', label: 'Champions League' },
  { key: 'club',      label: 'Club' },
]

export default function Records() {
  const { activeClub } = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const tab    = VALID_TABS.includes(rawTab) ? rawTab : 'allcomps'
  const setTab = useCallback((key) => {
    setSearchParams({ tab: key }, { replace: true })
  }, [setSearchParams])

  const [data,      setData]      = useState(null)
  const [opponents, setOpponents] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getPlayers(activeClub.id),
      getSeasons(activeClub.id),
      getTransfers(activeClub.id),
      getMatchesByClub(activeClub.id),
      getOpponents(),
      getSeasonStatsByClub(activeClub.id),
    ]).then(([players, seasons, transfers, matches, opps, statDocs]) => {
      const allStatsDocs = statDocs.filter(d => d.scope === 'ALL')
      const uclStatsDocs = statDocs.filter(d => d.scope === 'UCL')
      setData(computeAllRecords({ players, seasons, transfers, matches, allStatsDocs, uclStatsDocs }))
      setOpponents(opps)
      setLoading(false)
    }).catch(err => {
      console.error('[Records] load error:', err)
      setLoading(false)
    })
  }, [activeClub])

  const handlePlayerClick = useCallback((playerId) => {
    navigate(`/players/${playerId}`)
  }, [navigate])

  const handleCardClick = useCallback((key, title) => {
    setModal({ key, title })
  }, [])

  const closeModal  = useCallback(() => setModal(null), [])
  const modalItems  = modal && data ? data.top5[modal.key] || [] : null

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Club Records</span>
        <span className={styles.topHint}>Rate records: 20 apps (all comps) · 5 UCL apps</span>
      </div>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : !data ? null : tab === 'allcomps' ? (
          <AllCompsTab r={data} onCardClick={handleCardClick} onPlayerClick={handlePlayerClick} />
        ) : tab === 'champions' ? (
          <UCLTab r={data} onCardClick={handleCardClick} onPlayerClick={handlePlayerClick} />
        ) : (
          <ClubTab r={data} opponents={opponents} onCardClick={handleCardClick} />
        )}
      </div>

      {modal && (
        <Top5Modal
          title={modal.title}
          items={modalItems}
          onClose={closeModal}
          onPlayerClick={(id) => { closeModal(); handlePlayerClick(id) }}
        />
      )}
    </div>
  )
}
