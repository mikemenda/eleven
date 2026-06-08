import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayers, getSeasons, getTransfers, getMatchesByClub } from '../firebase/services'
import styles from './Records.module.css'

// ─── Competition label map (shared with SeasonDetail) ─────────────────────────
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

// ─── Player photo (Cloudflare Worker, same pattern as Transfers/Players) ──────
function PlayerImg({ sofifaId, name, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette size={size} />
  return (
    <img
      src={`https://fifa-img.michaelmenda92.workers.dev/${sofifaId}`}
      alt={name}
      className={styles.playerImg}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      onError={() => setErr(true)}
    />
  )
}

function Silhouette({ size = 36 }) {
  return (
    <div className={styles.silhouette} style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <circle cx="22" cy="15" r="7" fill="currentColor" opacity="0.35" />
        <path d="M6 40c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="currentColor" opacity="0.25" />
      </svg>
    </div>
  )
}

// ─── Records computation ──────────────────────────────────────────────────────
// All rates computed live from raw counts. Stored rate fields never trusted.
// isHistoricalStub filtered out everywhere.
// Contributions = goals + assists (never from stored field).

function computeAllRecords({ players, seasons, transfers, matches }) {
  const active = players.filter(p => !p.isHistoricalStub)
  const outfield = active.filter(p => !isGK(p))
  const gks = active.filter(p => isGK(p))

  // ── All Comps career ──────────────────────────────────────────────────────
  const acCareer = {
    topGoals:   maxBy(active,  p => p.goals || 0),
    topAssists: maxBy(active,  p => p.assists || 0),
    topContrib: maxBy(active,  p => (p.goals || 0) + (p.assists || 0)),
    topApps:    maxBy(outfield,p => p.apps || 0),
    bestGpg:    maxByRate(active,  p => p.apps >= 20 ? (p.goals || 0) / p.apps : null),
    bestApg:    maxByRate(active,  p => p.apps >= 20 ? (p.assists || 0) / p.apps : null),
    bestCpg:    maxByRate(active,  p => p.apps >= 20 ? ((p.goals || 0) + (p.assists || 0)) / p.apps : null),
    bestCspg:   maxByRate(gks,     p => p.apps >= 20 ? (p.cleanSheets || 0) / p.apps : null),
  }

  // ── All Comps single season ───────────────────────────────────────────────
  // Flatten all players' embedded seasonStats[] into records with player ref
  const allSeasonEntries = []
  for (const p of active) {
    for (const ss of p.seasonStats || []) {
      allSeasonEntries.push({ player: p, ss })
    }
  }

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
  }

  // ── Champions League career ───────────────────────────────────────────────
  // Sum UCL fields from embedded seasonStats[]
  const withUCL = active.map(p => {
    let uclApps = 0, uclGoals = 0, uclAssists = 0, uclCleanSheets = 0
    for (const ss of p.seasonStats || []) {
      uclApps       += ss.uclApps       || 0
      uclGoals      += ss.uclGoals      || 0
      uclAssists    += ss.uclAssists    || 0
      uclCleanSheets+= ss.uclCleanSheets|| 0
    }
    return { ...p, uclApps, uclGoals, uclAssists, uclCleanSheets }
  })
  const withUCLOutfield = withUCL.filter(p => !isGK(p))
  const withUCLGks      = withUCL.filter(p => isGK(p))

  const uclCareer = {
    topGoals:   maxBy(withUCL,        p => p.uclGoals),
    topAssists: maxBy(withUCL,        p => p.uclAssists),
    topContrib: maxBy(withUCL,        p => p.uclGoals + p.uclAssists),
    topApps:    maxBy(withUCLOutfield,p => p.uclApps),
    bestGpg:    maxByRate(withUCL,    p => p.uclApps >= 5 ? p.uclGoals / p.uclApps : null),
    bestApg:    maxByRate(withUCL,    p => p.uclApps >= 5 ? p.uclAssists / p.uclApps : null),
    bestCpg:    maxByRate(withUCL,    p => p.uclApps >= 5 ? (p.uclGoals + p.uclAssists) / p.uclApps : null),
    bestCspg:   maxByRate(withUCLGks, p => p.uclApps >= 5 ? p.uclCleanSheets / p.uclApps : null),
  }

  // ── Champions League single season ────────────────────────────────────────
  const uclSeasonEntries = []
  for (const p of active) {
    for (const ss of p.seasonStats || []) {
      if ((ss.uclApps || 0) > 0) uclSeasonEntries.push({ player: p, ss })
    }
  }

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
  }

  // ── Top 5 lists (for popup) ───────────────────────────────────────────────
  const top5 = {
    ac_career_goals:   top5By(active, p => p.goals || 0,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.goals || 0, ctx: `${p.apps || 0} apps` })),
    ac_career_assists: top5By(active, p => p.assists || 0,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.assists || 0, ctx: `${p.apps || 0} apps` })),
    ac_career_contrib: top5By(active, p => (p.goals||0)+(p.assists||0),
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (p.goals||0)+(p.assists||0), ctx: `${p.apps||0} apps`, fmt: v => `${v} G+A` })),
    ac_career_apps:    top5By(outfield, p => p.apps || 0,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.apps || 0, ctx: p.position })),
    ac_career_gpg:     top5ByRate(active.filter(p=>p.apps>=20), p => (p.goals||0)/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: ((p.goals||0)/p.apps).toFixed(2), ctx: `${p.goals||0}G · ${p.apps} apps` })),
    ac_career_apg:     top5ByRate(active.filter(p=>p.apps>=20), p => (p.assists||0)/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: ((p.assists||0)/p.apps).toFixed(2), ctx: `${p.assists||0}A · ${p.apps} apps` })),
    ac_career_cpg:     top5ByRate(active.filter(p=>p.apps>=20), p => ((p.goals||0)+(p.assists||0))/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (((p.goals||0)+(p.assists||0))/p.apps).toFixed(2), ctx: `${(p.goals||0)+(p.assists||0)} G+A · ${p.apps} apps` })),
    ac_career_cspg:    top5ByRate(gks.filter(p=>p.apps>=20), p => (p.cleanSheets||0)/p.apps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: ((p.cleanSheets||0)/p.apps).toFixed(2), ctx: `${p.cleanSheets||0} CS · ${p.apps} apps` })),

    ac_season_goals:   top5ByEntry(allSeasonEntries, e => e.ss.goals||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: e.ss.goals||0, ctx: `${e.ss.label} · ${e.ss.apps||0} apps` })),
    ac_season_assists: top5ByEntry(allSeasonEntries, e => e.ss.assists||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: e.ss.assists||0, ctx: `${e.ss.label} · ${e.ss.apps||0} apps` })),
    ac_season_contrib: top5ByEntry(allSeasonEntries, e => (e.ss.goals||0)+(e.ss.assists||0),
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: (e.ss.goals||0)+(e.ss.assists||0), ctx: `${e.ss.label} · ${e.ss.apps||0} apps`, fmt: v=>`${v} G+A` })),
    ac_season_gpg:     top5ByEntryRate(allSeasonEntries.filter(e=>(e.ss.apps||0)>=20), e=>(e.ss.goals||0)/e.ss.apps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: ((e.ss.goals||0)/e.ss.apps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.goals||0}G · ${e.ss.apps} apps` })),
    ac_season_apg:     top5ByEntryRate(allSeasonEntries.filter(e=>(e.ss.apps||0)>=20), e=>(e.ss.assists||0)/e.ss.apps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: ((e.ss.assists||0)/e.ss.apps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.assists||0}A · ${e.ss.apps} apps` })),
    ac_season_cpg:     top5ByEntryRate(allSeasonEntries.filter(e=>(e.ss.apps||0)>=20), e=>((e.ss.goals||0)+(e.ss.assists||0))/e.ss.apps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: (((e.ss.goals||0)+(e.ss.assists||0))/e.ss.apps).toFixed(2), ctx: `${e.ss.label} · ${(e.ss.goals||0)+(e.ss.assists||0)} G+A · ${e.ss.apps} apps` })),

    ucl_career_goals:   top5By(withUCL, p=>p.uclGoals,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclGoals, ctx: `${p.uclApps} UCL apps` })),
    ucl_career_assists: top5By(withUCL, p=>p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclAssists, ctx: `${p.uclApps} UCL apps` })),
    ucl_career_contrib: top5By(withUCL, p=>p.uclGoals+p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclGoals+p.uclAssists, ctx: `${p.uclApps} UCL apps`, fmt: v=>`${v} G+A` })),
    ucl_career_apps:    top5By(withUCLOutfield, p=>p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclApps, ctx: p.position })),
    ucl_career_gpg:     top5ByRate(withUCL.filter(p=>p.uclApps>=5), p=>p.uclGoals/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (p.uclGoals/p.uclApps).toFixed(2), ctx: `${p.uclGoals}G · ${p.uclApps} UCL apps` })),
    ucl_career_apg:     top5ByRate(withUCL.filter(p=>p.uclApps>=5), p=>p.uclAssists/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (p.uclAssists/p.uclApps).toFixed(2), ctx: `${p.uclAssists}A · ${p.uclApps} UCL apps` })),
    ucl_career_cpg:     top5ByRate(withUCL.filter(p=>p.uclApps>=5), p=>(p.uclGoals+p.uclAssists)/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: ((p.uclGoals+p.uclAssists)/p.uclApps).toFixed(2), ctx: `${p.uclGoals+p.uclAssists} G+A · ${p.uclApps} UCL apps` })),
    ucl_career_cspg:    top5ByRate(withUCLGks.filter(p=>p.uclApps>=5), p=>p.uclCleanSheets/p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (p.uclCleanSheets/p.uclApps).toFixed(2), ctx: `${p.uclCleanSheets} CS · ${p.uclApps} UCL apps` })),

    ucl_season_goals:   top5ByEntry(uclSeasonEntries, e=>e.ss.uclGoals||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: e.ss.uclGoals||0, ctx: `${e.ss.label} · ${e.ss.uclApps||0} UCL apps` })),
    ucl_season_assists: top5ByEntry(uclSeasonEntries, e=>e.ss.uclAssists||0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: e.ss.uclAssists||0, ctx: `${e.ss.label} · ${e.ss.uclApps||0} UCL apps` })),
    ucl_season_contrib: top5ByEntry(uclSeasonEntries, e=>(e.ss.uclGoals||0)+(e.ss.uclAssists||0),
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: (e.ss.uclGoals||0)+(e.ss.uclAssists||0), ctx: `${e.ss.label} · ${e.ss.uclApps||0} UCL apps`, fmt: v=>`${v} G+A` })),
    ucl_season_gpg:     top5ByEntryRate(uclSeasonEntries.filter(e=>(e.ss.uclApps||0)>=5), e=>(e.ss.uclGoals||0)/e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: ((e.ss.uclGoals||0)/e.ss.uclApps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.uclGoals||0}G · ${e.ss.uclApps} apps` })),
    ucl_season_apg:     top5ByEntryRate(uclSeasonEntries.filter(e=>(e.ss.uclApps||0)>=5), e=>(e.ss.uclAssists||0)/e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: ((e.ss.uclAssists||0)/e.ss.uclApps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.uclAssists||0}A · ${e.ss.uclApps} apps` })),
    ucl_season_cpg:     top5ByEntryRate(uclSeasonEntries.filter(e=>(e.ss.uclApps||0)>=5), e=>((e.ss.uclGoals||0)+(e.ss.uclAssists||0))/e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: (((e.ss.uclGoals||0)+(e.ss.uclAssists||0))/e.ss.uclApps).toFixed(2), ctx: `${e.ss.label} · ${(e.ss.uclGoals||0)+(e.ss.uclAssists||0)} G+A · ${e.ss.uclApps} apps` })),

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
      t => ({ name: t.player||'Unknown', value: t.fee_eur||0, ctx: `${seasons.find(s=>s.id===t.seasonId)?.label||t.season||'?'} · from ${t.from_club||'?'}`, fmt: fmt, isClub: true })),
    transfers_out:  top5By(transfers.filter(t=>t.direction==='OUT'), t=>t.fee_eur||0,
      t => ({ name: t.player||'Unknown', value: t.fee_eur||0, ctx: `${seasons.find(s=>s.id===t.seasonId)?.label||t.season||'?'} · to ${t.to_club||'?'}`, fmt: fmt, isClub: true })),
  }

  // ── Club season records ───────────────────────────────────────────────────
  const resolveLabel = t => t.season || seasons.find(s => s.id === t.seasonId)?.label || '?'
  const ins  = transfers.filter(t => t.direction === 'IN')
  const outs = transfers.filter(t => t.direction === 'OUT')
  const highestIn  = [...ins].sort((a,b)=>(b.fee_eur||0)-(a.fee_eur||0))[0] || null
  const highestOut = [...outs].sort((a,b)=>(b.fee_eur||0)-(a.fee_eur||0))[0] || null
  if (highestIn)  highestIn._seasonLabel  = resolveLabel(highestIn)
  if (highestOut) highestOut._seasonLabel = resolveLabel(highestOut)

  const wins = matches.filter(m => m.score_for > m.score_against)
  const biggestWin = [...wins].sort((a,b)=>(b.score_for-b.score_against)-(a.score_for-a.score_against))[0]||null

  const byPts    = [...seasons].sort((a,b)=>(b.leaguePts||0)-(a.leaguePts||0))[0]||null
  const byGoals  = [...seasons].sort((a,b)=>(b.leagueGF||0)-(a.leagueGF||0))[0]||null
  const byGpg    = seasons.filter(s=>s.leagueP>0).map(s=>({...s,gpg:s.leagueGF/s.leagueP})).sort((a,b)=>b.gpg-a.gpg)[0]||null
  const byGA     = [...seasons].filter(s=>s.leagueP>0).sort((a,b)=>(a.leagueGA||999)-(b.leagueGA||999))[0]||null
  const byDynasty= [...seasons].sort((a,b)=>(b.dynastyScore||0)-(a.dynastyScore||0))[0]||null

  return {
    acCareer, acSeason,
    uclCareer, uclSeason,
    club: { byPts, byGoals, byGpg, byGA, byDynasty, biggestWin, highestIn, highestOut },
    top5,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isGK(p) {
  if (!p.position) return false
  const positions = p.position.split(/[,\/]+/).map(x => x.trim())
  return positions.includes('GK')
}

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
  const wins = matches.filter(m=>m.score_for>m.score_against)
  return [...wins]
    .sort((a,b)=>(b.score_for-b.score_against)-(a.score_for-a.score_against))
    .slice(0,5)
    .map(m => ({
      name: `vs ${m.opponent}`,
      value: `${m.score_for}–${m.score_against}`,
      ctx: `${compLabel(m.competition)} · ${m.home_away==='H'?'Home':m.home_away==='A'?'Away':'Neutral'}`,
      isClub: true,
      raw: m.score_for - m.score_against,
    }))
}

// ─── Top 5 Modal ──────────────────────────────────────────────────────────────

function Top5Modal({ title, items, onClose, onPlayerClick }) {
  if (!items) return null
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{title}</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        {items.length === 0 ? (
          <div className={styles.modalEmpty}>No eligible entries yet</div>
        ) : (
          <div className={styles.modalList}>
            {items.map((item, i) => (
              <div key={i} className={styles.modalRow}>
                <span className={styles.modalRank}>{i + 1}</span>
                {!item.isClub && (
                  <button
                    className={styles.modalPlayerBtn}
                    onClick={() => item.id && onPlayerClick(item.id)}
                    disabled={!item.id}
                  >
                    <PlayerImg sofifaId={item.sofifaId} name={item.name} size={28} />
                  </button>
                )}
                <div className={styles.modalInfo}>
                  <span className={styles.modalName}>{item.name}</span>
                  {item.ctx && <span className={styles.modalCtx}>{item.ctx}</span>}
                </div>
                <span className={styles.modalValue}>
                  {item.fmt ? item.fmt(item.value) : item.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Record card ──────────────────────────────────────────────────────────────

function RecordCard({ label, player, value, ctx, highlight, onCardClick, onPlayerClick }) {
  return (
    <div className={styles.recordCard}>
      {/* Left: photo + player info — clickable for PlayerProfile */}
      <div className={styles.recordLeft}>
        {player ? (
          <button
            className={styles.recordPlayerBtn}
            onClick={() => player.id && onPlayerClick && onPlayerClick(player.id)}
            disabled={!player.id}
            title={player.name}
          >
            <PlayerImg sofifaId={player.sofifaId} name={player.name} size={36} />
          </button>
        ) : (
          <div className={styles.recordImgPlaceholder} />
        )}
        <div className={styles.recordMeta}>
          <div className={styles.recordHolder}>{player?.name || '—'}</div>
          {ctx && <div className={styles.recordCtx}>{ctx}</div>}
        </div>
      </div>
      {/* Right: label + value — clickable for Top 5 */}
      <button className={styles.recordRight} onClick={onCardClick}>
        <div className={styles.recordLabel}>{label}</div>
        <div className={styles.recordValue} style={highlight ? { color: 'var(--en-gold)' } : {}}>
          {value}
        </div>
      </button>
    </div>
  )
}

// Club-level record card (no player photo, just season/transfer data)
function ClubRecordCard({ label, holder, value, ctx, highlight, onCardClick }) {
  return (
    <button className={`${styles.clubRecordCard} ${onCardClick ? styles.clubRecordCardTappable : ''}`} onClick={onCardClick}>
      <div className={styles.clubRecordLeft}>
        <div className={styles.clubRecordHolder}>{holder || '—'}</div>
        {ctx && <div className={styles.clubRecordCtx}>{ctx}</div>}
      </div>
      <div className={styles.clubRecordRight}>
        <div className={styles.clubRecordLabel}>{label}</div>
        <div className={styles.clubRecordValue} style={highlight ? { color: 'var(--en-gold)' } : {}}>
          {value}
        </div>
      </div>
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

// ─── Tab panels ───────────────────────────────────────────────────────────────

function AllCompsTab({ r, top5, onCardClick, onPlayerClick }) {
  const { acCareer: c, acSeason: s } = r

  // Helpers to build player ref for RecordCard
  const fromPlayer = (p) => p ? { id: p.id, name: p.name, sofifaId: p.sofifaId } : null
  const fromEntry  = (e) => e ? { id: e.player.id, name: e.player.name, sofifaId: e.player.sofifaId } : null

  return (
    <div>
      <Section title="Career">
        <RecordCard label="Most career goals"
          player={fromPlayer(c.topGoals)}
          value={c.topGoals ? `${c.topGoals.goals} goals` : '—'}
          ctx={c.topGoals ? `${c.topGoals.apps} apps` : null}
          highlight onCardClick={()=>onCardClick('ac_career_goals','Most Career Goals')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most career assists"
          player={fromPlayer(c.topAssists)}
          value={c.topAssists ? `${c.topAssists.assists} assists` : '—'}
          ctx={c.topAssists ? `${c.topAssists.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_assists','Most Career Assists')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most career contributions"
          player={fromPlayer(c.topContrib)}
          value={c.topContrib ? `${(c.topContrib.goals||0)+(c.topContrib.assists||0)} G+A` : '—'}
          ctx={c.topContrib ? `${c.topContrib.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_contrib','Most Career Contributions')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most appearances (outfield)"
          player={fromPlayer(c.topApps)}
          value={c.topApps ? `${c.topApps.apps} apps` : '—'}
          ctx={c.topApps?.position}
          onCardClick={()=>onCardClick('ac_career_apps','Most Appearances')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best G/Game"
          player={fromPlayer(c.bestGpg)}
          value={c.bestGpg ? `${((c.bestGpg.goals||0)/c.bestGpg.apps).toFixed(2)}` : '—'}
          ctx={c.bestGpg ? `${c.bestGpg.goals||0}G · ${c.bestGpg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_gpg','Best Career G/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best A/Game"
          player={fromPlayer(c.bestApg)}
          value={c.bestApg ? `${((c.bestApg.assists||0)/c.bestApg.apps).toFixed(2)}` : '—'}
          ctx={c.bestApg ? `${c.bestApg.assists||0}A · ${c.bestApg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_apg','Best Career A/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best C/Game"
          player={fromPlayer(c.bestCpg)}
          value={c.bestCpg ? `${(((c.bestCpg.goals||0)+(c.bestCpg.assists||0))/c.bestCpg.apps).toFixed(2)}` : '—'}
          ctx={c.bestCpg ? `${(c.bestCpg.goals||0)+(c.bestCpg.assists||0)} G+A · ${c.bestCpg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_cpg','Best Career C/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best CS/Game (GK)"
          player={fromPlayer(c.bestCspg)}
          value={c.bestCspg ? `${((c.bestCspg.cleanSheets||0)/c.bestCspg.apps).toFixed(2)}` : '—'}
          ctx={c.bestCspg ? `${c.bestCspg.cleanSheets||0} CS · ${c.bestCspg.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_career_cspg','Best Career CS/Game')} onPlayerClick={onPlayerClick} />
      </Section>

      <Section title="Single Season">
        <RecordCard label="Single-season goals"
          player={fromEntry(s.topGoals)}
          value={s.topGoals ? `${s.topGoals.ss.goals} goals` : '—'}
          ctx={s.topGoals ? `${s.topGoals.ss.label} · ${s.topGoals.ss.apps} apps` : null}
          highlight onCardClick={()=>onCardClick('ac_season_goals','Single-Season Goals')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Single-season assists"
          player={fromEntry(s.topAssists)}
          value={s.topAssists ? `${s.topAssists.ss.assists} assists` : '—'}
          ctx={s.topAssists ? `${s.topAssists.ss.label} · ${s.topAssists.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_assists','Single-Season Assists')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Single-season contributions"
          player={fromEntry(s.topContrib)}
          value={s.topContrib ? `${(s.topContrib.ss.goals||0)+(s.topContrib.ss.assists||0)} G+A` : '—'}
          ctx={s.topContrib ? `${s.topContrib.ss.label} · ${s.topContrib.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_contrib','Single-Season Contributions')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best G/Game (season)"
          player={fromEntry(s.bestGpg)}
          value={s.bestGpg ? `${((s.bestGpg.ss.goals||0)/s.bestGpg.ss.apps).toFixed(2)}` : '—'}
          ctx={s.bestGpg ? `${s.bestGpg.ss.label} · ${s.bestGpg.ss.goals||0}G · ${s.bestGpg.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_gpg','Best Single-Season G/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best A/Game (season)"
          player={fromEntry(s.bestApg)}
          value={s.bestApg ? `${((s.bestApg.ss.assists||0)/s.bestApg.ss.apps).toFixed(2)}` : '—'}
          ctx={s.bestApg ? `${s.bestApg.ss.label} · ${s.bestApg.ss.assists||0}A · ${s.bestApg.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_apg','Best Single-Season A/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best C/Game (season)"
          player={fromEntry(s.bestCpg)}
          value={s.bestCpg ? `${(((s.bestCpg.ss.goals||0)+(s.bestCpg.ss.assists||0))/s.bestCpg.ss.apps).toFixed(2)}` : '—'}
          ctx={s.bestCpg ? `${s.bestCpg.ss.label} · ${(s.bestCpg.ss.goals||0)+(s.bestCpg.ss.assists||0)} G+A · ${s.bestCpg.ss.apps} apps` : null}
          onCardClick={()=>onCardClick('ac_season_cpg','Best Single-Season C/Game')} onPlayerClick={onPlayerClick} />
      </Section>
    </div>
  )
}

function UCLTab({ r, top5, onCardClick, onPlayerClick }) {
  const { uclCareer: c, uclSeason: s } = r
  const fromCareer = (p) => p ? { id: p.id, name: p.name, sofifaId: p.sofifaId } : null
  const fromEntry  = (e) => e ? { id: e.player.id, name: e.player.name, sofifaId: e.player.sofifaId } : null

  return (
    <div>
      <Section title="Career">
        <RecordCard label="Most UCL career goals"
          player={fromCareer(c.topGoals)}
          value={c.topGoals ? `${c.topGoals.uclGoals} goals` : '—'}
          ctx={c.topGoals ? `${c.topGoals.uclApps} UCL apps` : null}
          highlight onCardClick={()=>onCardClick('ucl_career_goals','Most UCL Career Goals')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most UCL career assists"
          player={fromCareer(c.topAssists)}
          value={c.topAssists ? `${c.topAssists.uclAssists} assists` : '—'}
          ctx={c.topAssists ? `${c.topAssists.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_career_assists','Most UCL Career Assists')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most UCL career contributions"
          player={fromCareer(c.topContrib)}
          value={c.topContrib ? `${c.topContrib.uclGoals+c.topContrib.uclAssists} G+A` : '—'}
          ctx={c.topContrib ? `${c.topContrib.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_career_contrib','Most UCL Career Contributions')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Most UCL appearances (outfield)"
          player={fromCareer(c.topApps)}
          value={c.topApps ? `${c.topApps.uclApps} apps` : '—'}
          ctx={c.topApps?.position}
          onCardClick={()=>onCardClick('ucl_career_apps','Most UCL Appearances')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best UCL G/Game"
          player={fromCareer(c.bestGpg)}
          value={c.bestGpg ? `${(c.bestGpg.uclGoals/c.bestGpg.uclApps).toFixed(2)}` : '—'}
          ctx={c.bestGpg ? `${c.bestGpg.uclGoals}G · ${c.bestGpg.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_career_gpg','Best UCL Career G/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best UCL A/Game"
          player={fromCareer(c.bestApg)}
          value={c.bestApg ? `${(c.bestApg.uclAssists/c.bestApg.uclApps).toFixed(2)}` : '—'}
          ctx={c.bestApg ? `${c.bestApg.uclAssists}A · ${c.bestApg.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_career_apg','Best UCL Career A/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best UCL C/Game"
          player={fromCareer(c.bestCpg)}
          value={c.bestCpg ? `${((c.bestCpg.uclGoals+c.bestCpg.uclAssists)/c.bestCpg.uclApps).toFixed(2)}` : '—'}
          ctx={c.bestCpg ? `${c.bestCpg.uclGoals+c.bestCpg.uclAssists} G+A · ${c.bestCpg.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_career_cpg','Best UCL Career C/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best UCL CS/Game (GK)"
          player={fromCareer(c.bestCspg)}
          value={c.bestCspg ? `${(c.bestCspg.uclCleanSheets/c.bestCspg.uclApps).toFixed(2)}` : '—'}
          ctx={c.bestCspg ? `${c.bestCspg.uclCleanSheets} CS · ${c.bestCspg.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_career_cspg','Best UCL Career CS/Game')} onPlayerClick={onPlayerClick} />
      </Section>

      <Section title="Single Season">
        <RecordCard label="Single-season UCL goals"
          player={fromEntry(s.topGoals)}
          value={s.topGoals ? `${s.topGoals.ss.uclGoals} goals` : '—'}
          ctx={s.topGoals ? `${s.topGoals.ss.label} · ${s.topGoals.ss.uclApps} UCL apps` : null}
          highlight onCardClick={()=>onCardClick('ucl_season_goals','Single-Season UCL Goals')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Single-season UCL assists"
          player={fromEntry(s.topAssists)}
          value={s.topAssists ? `${s.topAssists.ss.uclAssists} assists` : '—'}
          ctx={s.topAssists ? `${s.topAssists.ss.label} · ${s.topAssists.ss.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_season_assists','Single-Season UCL Assists')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Single-season UCL contributions"
          player={fromEntry(s.topContrib)}
          value={s.topContrib ? `${(s.topContrib.ss.uclGoals||0)+(s.topContrib.ss.uclAssists||0)} G+A` : '—'}
          ctx={s.topContrib ? `${s.topContrib.ss.label} · ${s.topContrib.ss.uclApps} UCL apps` : null}
          onCardClick={()=>onCardClick('ucl_season_contrib','Single-Season UCL Contributions')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best UCL G/Game (season)"
          player={fromEntry(s.bestGpg)}
          value={s.bestGpg ? `${((s.bestGpg.ss.uclGoals||0)/s.bestGpg.ss.uclApps).toFixed(2)}` : '—'}
          ctx={s.bestGpg ? `${s.bestGpg.ss.label} · ${s.bestGpg.ss.uclGoals||0}G · ${s.bestGpg.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_gpg','Best Single-Season UCL G/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best UCL A/Game (season)"
          player={fromEntry(s.bestApg)}
          value={s.bestApg ? `${((s.bestApg.ss.uclAssists||0)/s.bestApg.ss.uclApps).toFixed(2)}` : '—'}
          ctx={s.bestApg ? `${s.bestApg.ss.label} · ${s.bestApg.ss.uclAssists||0}A · ${s.bestApg.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_apg','Best Single-Season UCL A/Game')} onPlayerClick={onPlayerClick} />
        <RecordCard label="Best UCL C/Game (season)"
          player={fromEntry(s.bestCpg)}
          value={s.bestCpg ? `${(((s.bestCpg.ss.uclGoals||0)+(s.bestCpg.ss.uclAssists||0))/s.bestCpg.ss.uclApps).toFixed(2)}` : '—'}
          ctx={s.bestCpg ? `${s.bestCpg.ss.label} · ${(s.bestCpg.ss.uclGoals||0)+(s.bestCpg.ss.uclAssists||0)} G+A · ${s.bestCpg.ss.uclApps} apps` : null}
          onCardClick={()=>onCardClick('ucl_season_cpg','Best Single-Season UCL C/Game')} onPlayerClick={onPlayerClick} />
      </Section>
    </div>
  )
}

function ClubTab({ r, onCardClick }) {
  const { club: c } = r

  return (
    <div>
      <Section title="Season Records">
        <ClubRecordCard label="Most league points"
          holder={c.byPts?.label}
          value={c.byPts ? `${c.byPts.leaguePts} pts` : '—'}
          ctx={c.byPts ? `${c.byPts.leagueW}W ${c.byPts.leagueD}D ${c.byPts.leagueL}L` : null}
          highlight onCardClick={()=>onCardClick('club_pts','Most League Points')} />
        <ClubRecordCard label="Most league goals"
          holder={c.byGoals?.label}
          value={c.byGoals ? `${c.byGoals.leagueGF} goals` : '—'}
          ctx={c.byGoals?.leagueP > 0 ? `${(c.byGoals.leagueGF/c.byGoals.leagueP).toFixed(2)} G/game` : null}
          onCardClick={()=>onCardClick('club_goals','Most League Goals')} />
        <ClubRecordCard label="Best goals/game"
          holder={c.byGpg?.label}
          value={c.byGpg ? `${c.byGpg.gpg.toFixed(2)} G/game` : '—'}
          ctx={c.byGpg ? `${c.byGpg.leagueGF} goals · ${c.byGpg.leagueP} games` : null}
          onCardClick={()=>onCardClick('club_gpg','Best Goals/Game')} />
        <ClubRecordCard label="Fewest goals conceded"
          holder={c.byGA?.label}
          value={c.byGA ? `${c.byGA.leagueGA} conceded` : '—'}
          ctx={c.byGA ? `${c.byGA.leagueP} games` : null}
          onCardClick={()=>onCardClick('club_ga','Fewest Goals Conceded')} />
        <ClubRecordCard label="Best dynasty score"
          holder={c.byDynasty?.label}
          value={c.byDynasty ? `${c.byDynasty.dynastyScore} pts` : '—'}
          ctx={c.byDynasty?.year}
          highlight onCardClick={()=>onCardClick('club_dynasty','Best Dynasty Score')} />
        {c.biggestWin ? (
          <ClubRecordCard label="Biggest win"
            holder={`vs ${c.biggestWin.opponent}`}
            value={`${c.biggestWin.score_for}–${c.biggestWin.score_against}`}
            ctx={`${compLabel(c.biggestWin.competition)} · ${c.biggestWin.home_away==='H'?'Home':c.biggestWin.home_away==='A'?'Away':'Neutral'}`}
            highlight onCardClick={()=>onCardClick('club_win','Biggest Win')} />
        ) : (
          <ClubRecordCard label="Biggest win" holder="No match data yet" value="—" />
        )}
      </Section>

      <Section title="Transfers">
        <ClubRecordCard label="Highest fee received"
          holder={c.highestOut ? `${c.highestOut.player}` : 'No data'}
          value={c.highestOut ? fmt(c.highestOut.fee_eur) : '—'}
          ctx={c.highestOut ? `${c.highestOut._seasonLabel} · to ${c.highestOut.to_club||'?'}` : null}
          highlight onCardClick={c.highestOut ? ()=>onCardClick('transfers_out','Highest Fee Received') : null} />
        <ClubRecordCard label="Highest fee paid"
          holder={c.highestIn ? `${c.highestIn.player}` : 'No data'}
          value={c.highestIn ? fmt(c.highestIn.fee_eur) : '—'}
          ctx={c.highestIn ? `${c.highestIn._seasonLabel} · from ${c.highestIn.from_club||'?'}` : null}
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

  // Tab is driven by ?tab= query param. Default to allcomps if absent or invalid.
  const rawTab = searchParams.get('tab')
  const tab = VALID_TABS.includes(rawTab) ? rawTab : 'allcomps'

  const setTab = useCallback((key) => {
    setSearchParams({ tab: key }, { replace: true })
  }, [setSearchParams])

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { key, title }

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getPlayers(activeClub.id),
      getSeasons(activeClub.id),
      getTransfers(activeClub.id),
      getMatchesByClub(activeClub.id),
    ]).then(([players, seasons, transfers, matches]) => {
      setData(computeAllRecords({ players, seasons, transfers, matches }))
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

  const closeModal = useCallback(() => setModal(null), [])

  const modalItems = modal && data ? data.top5[modal.key] || [] : null

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Club Records</span>
        <span className={styles.topHint}>Rate records require 20 apps in all comps or 5 UCL apps</span>
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
          <AllCompsTab r={data} top5={data.top5} onCardClick={handleCardClick} onPlayerClick={handlePlayerClick} />
        ) : tab === 'champions' ? (
          <UCLTab r={data} top5={data.top5} onCardClick={handleCardClick} onPlayerClick={handlePlayerClick} />
        ) : (
          <ClubTab r={data} onCardClick={handleCardClick} />
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
