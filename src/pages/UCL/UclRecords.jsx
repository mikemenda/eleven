import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import styles from './UCL.module.css'
import { isGK, deriveUclClubRecords } from '../../utils/uclUtils'

// ─── Player photo ─────────────────────────────────────────────────────────────
function PlayerImg({ sofifaId, name, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette size={size} />
  return (
    <img
      src={`https://fifa-img.michaelmenda92.workers.dev/${sofifaId}`}
      alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
               flexShrink: 0, display: 'block' }}
      onError={() => setErr(true)}
    />
  )
}

function Silhouette({ size = 36 }) {
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

// ─── Opponent crest for club record cards ─────────────────────────────────────
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

// ─── Record helpers ───────────────────────────────────────────────────────────
function maxBy(arr, fn) {
  if (!arr.length) return null
  return arr.reduce((best, x) => fn(x) > fn(best) ? x : best, arr[0])
}
function maxByRate(arr, fn) {
  const el = arr.filter(x => fn(x) !== null)
  if (!el.length) return null
  return el.reduce((best, x) => fn(x) > fn(best) ? x : best, el[0])
}
function maxByEntry(entries, fn) {
  if (!entries.length) return null
  return entries.reduce((best, e) => fn(e) > fn(best) ? e : best, entries[0])
}
function maxByEntryRate(entries, fn) {
  const el = entries.filter(e => fn(e) !== null)
  if (!el.length) return null
  return el.reduce((best, e) => fn(e) > fn(best) ? e : best, el[0])
}
function top5By(arr, scoreFn, mapFn) {
  return [...arr].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, 5).map(mapFn)
}
function top5ByRate(arr, scoreFn, mapFn) {
  return [...arr].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, 5).map(mapFn)
}
function top5ByEntry(entries, scoreFn, mapFn) {
  return [...entries].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, 5).map(mapFn)
}
function top5ByEntryRate(entries, scoreFn, mapFn) {
  return [...entries].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, 5).map(mapFn)
}

// computeUclRecords — Phase 1 canonical version
// Reads exclusively from uclStatsDocs (scope:'UCL' collection docs).
// No reads from player.seasonStats[] or top-level player.uclApps.
//
// uclStatsDocs: scope:'UCL' collection docs from getSeasonStatsByClub
// players:      player docs — used for identity data only (sofifaId, position, name)
// uclSeasons:   season docs — used to resolve seasonId → label for display
function computeUclRecords(uclStatsDocs, players, uclSeasons) {
  // Build lookup maps
  const playerMap   = new Map(players.map(p => [p.id, p]))
  const seasonLabel = new Map((uclSeasons || []).map(s => [s.id, s.label || '—']))

  // Group collection docs by playerId and sum career totals
  const careerByPlayer = new Map()
  for (const doc of uclStatsDocs) {
    if (!doc.playerId) continue
    const p = playerMap.get(doc.playerId)
    if (!p || p.isHistoricalStub) continue
    if (!careerByPlayer.has(doc.playerId)) {
      careerByPlayer.set(doc.playerId, {
        ...p,
        uclApps: 0, uclGoals: 0, uclAssists: 0, uclCleanSheets: 0,
      })
    }
    const acc = careerByPlayer.get(doc.playerId)
    acc.uclApps        += doc.apps        || 0
    acc.uclGoals       += doc.goals       || 0
    acc.uclAssists     += doc.assists     || 0
    acc.uclCleanSheets += doc.cleanSheets || 0
  }

  const withUCL         = [...careerByPlayer.values()].filter(p => p.uclApps > 0)
  const withUCLOutfield = withUCL.filter(p => !isGK(p))
  const withUCLGks      = withUCL.filter(p => isGK(p))

  const career = {
    topGoals:   maxBy(withUCL,         p => p.uclGoals),
    topAssists: maxBy(withUCL,         p => p.uclAssists),
    topContrib: maxBy(withUCL,         p => p.uclGoals + p.uclAssists),
    bestGpg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? p.uclGoals   / p.uclApps : null),
    bestApg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? p.uclAssists / p.uclApps : null),
    bestCpg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? (p.uclGoals + p.uclAssists) / p.uclApps : null),
    bestCspg:   maxByRate(withUCLGks,  p => p.uclApps >= 5 ? p.uclCleanSheets / p.uclApps : null),
    topApps:    maxBy(withUCLOutfield, p => p.uclApps),
  }

  // Season entries: one entry per collection doc (one player+season combination)
  // The ss shape is normalised to match the old embedded-array shape so all
  // downstream record formatters work without change.
  const seasonEntries = []
  for (const doc of uclStatsDocs) {
    if (!doc.playerId) continue
    const p = playerMap.get(doc.playerId)
    if (!p || p.isHistoricalStub) continue
    if ((doc.apps || 0) === 0) continue
    // Normalise collection doc fields to the shape the formatters expect
    const ss = {
      label:          seasonLabel.get(doc.seasonId) || '—',
      uclApps:        doc.apps        || 0,
      uclGoals:       doc.goals       || 0,
      uclAssists:     doc.assists     || 0,
      uclCleanSheets: doc.cleanSheets || 0,
    }
    seasonEntries.push({ player: p, ss })
  }

  const season = {
    topGoals:   maxByEntry(seasonEntries,     e => e.ss.uclGoals || 0),
    topAssists: maxByEntry(seasonEntries,     e => e.ss.uclAssists || 0),
    topContrib: maxByEntry(seasonEntries,     e => (e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)),
    bestGpg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? (e.ss.uclGoals   || 0) / e.ss.uclApps : null),
    bestApg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? (e.ss.uclAssists || 0) / e.ss.uclApps : null),
    bestCpg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? ((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps : null),
    bestCspg:   maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? (e.ss.uclCleanSheets || 0) / e.ss.uclApps : null),
  }

  const top5 = {
    career_goals:   top5By(withUCL, p => p.uclGoals,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclGoals,
              ctx: `${p.uclApps} UCL apps`, fmt: v => `${v} goals` })),
    career_assists: top5By(withUCL, p => p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclAssists,
              ctx: `${p.uclApps} UCL apps`, fmt: v => `${v} assists` })),
    career_contrib: top5By(withUCL, p => p.uclGoals + p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclGoals + p.uclAssists,
              ctx: `${p.uclApps} UCL apps`, fmt: v => `${v} G+A` })),
    career_gpg:     top5ByRate(withUCL.filter(p => p.uclApps >= 5), p => p.uclGoals / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (p.uclGoals / p.uclApps).toFixed(2),
              ctx: `${p.uclGoals}G · ${p.uclApps} UCL apps`, fmt: v => `${v} G/G` })),
    career_apg:     top5ByRate(withUCL.filter(p => p.uclApps >= 5), p => p.uclAssists / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (p.uclAssists / p.uclApps).toFixed(2),
              ctx: `${p.uclAssists}A · ${p.uclApps} UCL apps`, fmt: v => `${v} A/G` })),
    career_cpg:     top5ByRate(withUCL.filter(p => p.uclApps >= 5), p => (p.uclGoals + p.uclAssists) / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: ((p.uclGoals + p.uclAssists) / p.uclApps).toFixed(2),
              ctx: `${p.uclGoals + p.uclAssists} G+A · ${p.uclApps} UCL apps`, fmt: v => `${v} C/G` })),
    career_cspg:    top5ByRate(withUCLGks.filter(p => p.uclApps >= 5), p => p.uclCleanSheets / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id,
              value: (p.uclCleanSheets / p.uclApps).toFixed(2),
              ctx: `${p.uclCleanSheets} CS · ${p.uclApps} UCL apps`, fmt: v => `${v} CS/G` })),
    career_apps:    top5By(withUCLOutfield, p => p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclApps,
              ctx: p.position, fmt: v => `${v} apps` })),
    season_goals:   top5ByEntry(seasonEntries, e => e.ss.uclGoals || 0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: e.ss.uclGoals || 0,
              ctx: `${e.ss.label} · ${e.ss.uclApps || 0} UCL apps`, fmt: v => `${v} goals` })),
    season_assists: top5ByEntry(seasonEntries, e => e.ss.uclAssists || 0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: e.ss.uclAssists || 0,
              ctx: `${e.ss.label} · ${e.ss.uclApps || 0} UCL apps`, fmt: v => `${v} assists` })),
    season_contrib: top5ByEntry(seasonEntries, e => (e.ss.uclGoals || 0) + (e.ss.uclAssists || 0),
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: (e.ss.uclGoals || 0) + (e.ss.uclAssists || 0),
              ctx: `${e.ss.label} · ${e.ss.uclApps || 0} UCL apps`, fmt: v => `${v} G+A` })),
    season_gpg:     top5ByEntryRate(seasonEntries.filter(e => (e.ss.uclApps || 0) >= 5), e => (e.ss.uclGoals || 0) / e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.uclGoals || 0) / e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${e.ss.uclGoals || 0}G · ${e.ss.uclApps} apps`, fmt: v => `${v} G/G` })),
    season_apg:     top5ByEntryRate(seasonEntries.filter(e => (e.ss.uclApps || 0) >= 5), e => (e.ss.uclAssists || 0) / e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.uclAssists || 0) / e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${e.ss.uclAssists || 0}A · ${e.ss.uclApps} apps`, fmt: v => `${v} A/G` })),
    season_cpg:     top5ByEntryRate(seasonEntries.filter(e => (e.ss.uclApps || 0) >= 5), e => ((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: (((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${(e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)} G+A · ${e.ss.uclApps} apps`, fmt: v => `${v} C/G` })),
    season_cspg:    top5ByEntryRate(seasonEntries.filter(e => (e.ss.uclApps || 0) >= 5), e => (e.ss.uclCleanSheets || 0) / e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id,
              value: ((e.ss.uclCleanSheets || 0) / e.ss.uclApps).toFixed(2),
              ctx: `${e.ss.label} · ${e.ss.uclCleanSheets || 0} CS · ${e.ss.uclApps} apps`, fmt: v => `${v} CS/G` })),
  }

  return { career, season, top5 }
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

// ─── Player record card — all values gold ─────────────────────────────────────
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
        {/* All record values gold */}
        <span className={styles.rValue} style={{ color: 'var(--en-gold)' }}>{value}</span>
      </button>
    </div>
  )
}

// ─── Club record card — with crest on left ────────────────────────────────────
function ClubRecordCard({ label, holder, value, ctx, crestUrl }) {
  return (
    <div className={styles.rCard}>
      <div className={styles.rLeft}>
        {/* Crest or shield fallback */}
        <OppCrest crestUrl={crestUrl} size={36} />
        <div className={styles.rMetaBtn} style={{ cursor: 'default' }}>
          <span className={styles.rHolder}>{holder || '—'}</span>
          {ctx && <span className={styles.rCtx}>{ctx}</span>}
        </div>
      </div>
      <div className={styles.rRight} style={{ cursor: 'default' }}>
        <span className={styles.rLabel}>{label}</span>
        <span className={styles.rValue} style={{ color: 'var(--en-gold)' }}>{value}</span>
      </div>
    </div>
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

function fmtRate(n) {
  return n != null ? Number(n).toFixed(2) : '—'
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function UclRecords({ players, uclMatches, uclSeasons, opponents, uclStatsDocs, loading }) {
  const navigate = useNavigate()
  const [recordView, setRecordView] = useState('players')
  const [modal,      setModal]      = useState(null)

  if (loading) {
    return <div className={styles.loadWrap}><div className={styles.spinner} /></div>
  }

  const activePlayers = players.filter(p => !p.isHistoricalStub)
  if (activePlayers.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📋</span>
        <p className={styles.emptyText}>No UCL records yet</p>
        <p className={styles.emptyHint}>Records appear once UCL player stats are seeded.</p>
      </div>
    )
  }

  const { career: c, season: s, top5 } = computeUclRecords(uclStatsDocs || [], players, uclSeasons)
  const club = deriveUclClubRecords(uclMatches, uclSeasons, opponents)

  const fromPlayer = p => p ? { id: p.id, name: p.name, sofifaId: p.sofifaId } : null
  const fromEntry  = e => e ? { id: e.player.id, name: e.player.name, sofifaId: e.player.sofifaId } : null

  // Helper to look up opponent crest from uclMatches + opponents map
  function oppCrest(oppName) {
    if (!oppName || !opponents) return null
    for (const [, rec] of opponents) {
      if (rec.displayName === oppName) return rec.crestUrl || null
    }
    return null
  }

  function onPlayerClick(id) {
    navigate(`/players/${id}`, { state: { defaultTab: 'ucl' } })
  }

  function openModal(key, title) {
    setModal({ items: top5[key] || [], title })
  }

  // Campaign G/G averages — computed from raw data (no Firestore writes)
  const mgc = club.mostGoalsCampaign
  const fcc = club.fewestConcededCampaign
  const bc  = club.bestCampaign

  return (
    <div className={styles.rWrap}>

      {/* ── Players / Club toggle ───────────────────────────────────── */}
      <div className={styles.rvToggleBar}>
        <button
          className={`${styles.rvToggleBtn} ${recordView === 'players' ? styles.rvToggleActive : ''}`}
          onClick={() => setRecordView('players')}
        >
          Players
        </button>
        <button
          className={`${styles.rvToggleBtn} ${recordView === 'club' ? styles.rvToggleActive : ''}`}
          onClick={() => setRecordView('club')}
        >
          Club
        </button>
      </div>

      {/* ── Player records ──────────────────────────────────────────── */}
      {recordView === 'players' && (
        <>
          {/* Career — order: Goals, Assists, G+A, G/G, A/G, C/G, CS/G, Appearances */}
          <Section title="Career">
            <RecordCard label="Most Goals"
              player={fromPlayer(c.topGoals)}
              value={c.topGoals ? `${c.topGoals.uclGoals} goals` : '—'}
              ctx={c.topGoals ? `${c.topGoals.uclApps} apps` : null}
              onCardClick={() => openModal('career_goals', 'Most Career Goals')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most Assists"
              player={fromPlayer(c.topAssists)}
              value={c.topAssists ? `${c.topAssists.uclAssists} assists` : '—'}
              ctx={c.topAssists ? `${c.topAssists.uclApps} apps` : null}
              onCardClick={() => openModal('career_assists', 'Most Career Assists')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most G+A"
              player={fromPlayer(c.topContrib)}
              value={c.topContrib ? `${c.topContrib.uclGoals + c.topContrib.uclAssists} G+A` : '—'}
              ctx={c.topContrib ? `${c.topContrib.uclApps} apps` : null}
              onCardClick={() => openModal('career_contrib', 'Most Career Contributions')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best G/Game"
              player={fromPlayer(c.bestGpg)}
              value={c.bestGpg ? `${fmtRate(c.bestGpg.uclGoals / c.bestGpg.uclApps)} G/G` : '—'}
              ctx={c.bestGpg ? `${c.bestGpg.uclGoals}G · ${c.bestGpg.uclApps} apps` : null}
              onCardClick={() => openModal('career_gpg', 'Best Career G/Game')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best A/Game"
              player={fromPlayer(c.bestApg)}
              value={c.bestApg ? `${fmtRate(c.bestApg.uclAssists / c.bestApg.uclApps)} A/G` : '—'}
              ctx={c.bestApg ? `${c.bestApg.uclAssists}A · ${c.bestApg.uclApps} apps` : null}
              onCardClick={() => openModal('career_apg', 'Best Career A/Game')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best C/Game"
              player={fromPlayer(c.bestCpg)}
              value={c.bestCpg ? `${fmtRate((c.bestCpg.uclGoals + c.bestCpg.uclAssists) / c.bestCpg.uclApps)} C/G` : '—'}
              ctx={c.bestCpg ? `${c.bestCpg.uclGoals + c.bestCpg.uclAssists} G+A · ${c.bestCpg.uclApps} apps` : null}
              onCardClick={() => openModal('career_cpg', 'Best Career C/Game')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best CS/Game"
              player={fromPlayer(c.bestCspg)}
              value={c.bestCspg ? `${fmtRate(c.bestCspg.uclCleanSheets / c.bestCspg.uclApps)} CS/G` : '—'}
              ctx={c.bestCspg ? `${c.bestCspg.uclCleanSheets} CS · ${c.bestCspg.uclApps} apps` : null}
              onCardClick={() => openModal('career_cspg', 'Best Career CS/Game')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most Appearances"
              player={fromPlayer(c.topApps)}
              value={c.topApps ? `${c.topApps.uclApps} apps` : '—'}
              ctx={c.topApps?.position || null}
              onCardClick={() => openModal('career_apps', 'Most Appearances')}
              onPlayerClick={onPlayerClick} />
          </Section>

          {/* Single Season — order: Goals, Assists, G+A, G/G, A/G, C/G, CS/G */}
          <Section title="Single Season">
            <RecordCard label="Most Goals"
              player={fromEntry(s.topGoals)}
              value={s.topGoals ? `${s.topGoals.ss.uclGoals} goals` : '—'}
              ctx={s.topGoals ? `${s.topGoals.ss.label} · ${s.topGoals.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_goals', 'Most Goals — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most Assists"
              player={fromEntry(s.topAssists)}
              value={s.topAssists ? `${s.topAssists.ss.uclAssists} assists` : '—'}
              ctx={s.topAssists ? `${s.topAssists.ss.label} · ${s.topAssists.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_assists', 'Most Assists — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most G+A"
              player={fromEntry(s.topContrib)}
              value={s.topContrib ? `${(s.topContrib.ss.uclGoals || 0) + (s.topContrib.ss.uclAssists || 0)} G+A` : '—'}
              ctx={s.topContrib ? `${s.topContrib.ss.label} · ${s.topContrib.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_contrib', 'Most Contributions — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best G/Game"
              player={fromEntry(s.bestGpg)}
              value={s.bestGpg ? `${fmtRate((s.bestGpg.ss.uclGoals || 0) / s.bestGpg.ss.uclApps)} G/G` : '—'}
              ctx={s.bestGpg ? `${s.bestGpg.ss.label} · ${s.bestGpg.ss.uclGoals || 0}G · ${s.bestGpg.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_gpg', 'Best G/Game — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best A/Game"
              player={fromEntry(s.bestApg)}
              value={s.bestApg ? `${fmtRate((s.bestApg.ss.uclAssists || 0) / s.bestApg.ss.uclApps)} A/G` : '—'}
              ctx={s.bestApg ? `${s.bestApg.ss.label} · ${s.bestApg.ss.uclAssists || 0}A · ${s.bestApg.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_apg', 'Best A/Game — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best C/Game"
              player={fromEntry(s.bestCpg)}
              value={s.bestCpg ? `${fmtRate(((s.bestCpg.ss.uclGoals || 0) + (s.bestCpg.ss.uclAssists || 0)) / s.bestCpg.ss.uclApps)} C/G` : '—'}
              ctx={s.bestCpg ? `${s.bestCpg.ss.label} · ${(s.bestCpg.ss.uclGoals || 0) + (s.bestCpg.ss.uclAssists || 0)} G+A · ${s.bestCpg.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_cpg', 'Best C/Game — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best CS/Game"
              player={fromEntry(s.bestCspg)}
              value={s.bestCspg ? `${fmtRate((s.bestCspg.ss.uclCleanSheets || 0) / s.bestCspg.ss.uclApps)} CS/G` : '—'}
              ctx={s.bestCspg ? `${s.bestCspg.ss.label} · ${s.bestCspg.ss.uclCleanSheets || 0} CS · ${s.bestCspg.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_cspg', 'Best CS/Game — Single Season')}
              onPlayerClick={onPlayerClick} />
          </Section>

          <p className={styles.rQualNote}>Rate records require a minimum of 5 UCL appearances.</p>
        </>
      )}

      {/* ── Club records ────────────────────────────────────────────── */}
      {recordView === 'club' && (
        <Section title="Club Records">
          {club.biggestWin && (
            <ClubRecordCard label="Biggest Win"
              holder={club.biggestWin.opp ? `vs ${club.biggestWin.opp}` : '—'}
              value={club.biggestWin.score}
              ctx={[club.biggestWin.round, club.biggestWin.season].filter(Boolean).join(' · ')}
              crestUrl={oppCrest(club.biggestWin.opp)} />
          )}
          {club.worstDefeat && (
            <ClubRecordCard label="Worst Defeat"
              holder={club.worstDefeat.opp ? `vs ${club.worstDefeat.opp}` : '—'}
              value={club.worstDefeat.score}
              ctx={[club.worstDefeat.round, club.worstDefeat.season].filter(Boolean).join(' · ')}
              crestUrl={oppCrest(club.worstDefeat.opp)} />
          )}
          {club.highestScoringMatch && (
            <ClubRecordCard label="Most Goals in Match"
              holder={club.highestScoringMatch.opp ? `vs ${club.highestScoringMatch.opp}` : '—'}
              value={club.highestScoringMatch.score}
              ctx={[club.highestScoringMatch.round, club.highestScoringMatch.season].filter(Boolean).join(' · ')}
              crestUrl={oppCrest(club.highestScoringMatch.opp)} />
          )}
          {mgc && (() => {
            const gpgVal = mgc.p > 0 ? (mgc.gf / mgc.p).toFixed(2) : '—'
            return (
              <ClubRecordCard label="Most G/G in Campaign"
                holder={mgc.label}
                value={`${gpgVal} G/G`}
                ctx={`${mgc.p} matches · ${mgc.gf} goals`}
                crestUrl={null} />
            )
          })()}
          {fcc && (() => {
            const gcgVal = fcc.p > 0 ? (fcc.ga / fcc.p).toFixed(2) : '—'
            return (
              <ClubRecordCard label="Fewest G/G Conceded"
                holder={fcc.label}
                value={`${gcgVal} GA/G`}
                ctx={`${fcc.p} matches · ${fcc.ga} conceded`}
                crestUrl={null} />
            )
          })()}
          {bc && (
            <ClubRecordCard label="Best LP Points Total"
              holder={bc.label}
              value={`${bc.pts} pts`}
              ctx={`${bc.record} · ${bc.gf}–${bc.ga}`}
              crestUrl={null} />
          )}
        </Section>
      )}

      {/* Top5 Modal */}
      {modal && (
        <Top5Modal
          title={modal.title}
          items={modal.items}
          onClose={() => setModal(null)}
          onPlayerClick={id => {
            setModal(null)
            navigate(`/players/${id}`, { state: { defaultTab: 'ucl' } })
          }}
        />
      )}
    </div>
  )
}
