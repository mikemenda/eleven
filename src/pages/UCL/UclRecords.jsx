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

// ─── Record helpers (local, mirrors Records.jsx — avoids risky refactor) ─────
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

// ─── UCL player record computation ───────────────────────────────────────────
function computeUclRecords(players) {
  const active = players.filter(p => !p.isHistoricalStub)

  const withUCL = active.map(p => {
    let uclApps = 0, uclGoals = 0, uclAssists = 0, uclCleanSheets = 0
    for (const ss of p.seasonStats || []) {
      uclApps        += ss.uclApps        || 0
      uclGoals       += ss.uclGoals       || 0
      uclAssists     += ss.uclAssists     || 0
      uclCleanSheets += ss.uclCleanSheets || 0
    }
    return { ...p, uclApps, uclGoals, uclAssists, uclCleanSheets }
  })

  const withUCLOutfield = withUCL.filter(p => !isGK(p))
  const withUCLGks      = withUCL.filter(p => isGK(p))

  const career = {
    topGoals:   maxBy(withUCL,         p => p.uclGoals),
    topAssists: maxBy(withUCL,         p => p.uclAssists),
    topContrib: maxBy(withUCL,         p => p.uclGoals + p.uclAssists),
    topApps:    maxBy(withUCLOutfield, p => p.uclApps),
    bestGpg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? p.uclGoals   / p.uclApps : null),
    bestApg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? p.uclAssists / p.uclApps : null),
    bestCpg:    maxByRate(withUCL,     p => p.uclApps >= 5 ? (p.uclGoals + p.uclAssists) / p.uclApps : null),
    bestCspg:   maxByRate(withUCLGks,  p => p.uclApps >= 5 ? p.uclCleanSheets / p.uclApps : null),
  }

  const seasonEntries = []
  for (const p of active) {
    for (const ss of p.seasonStats || []) {
      if ((ss.uclApps || 0) > 0) seasonEntries.push({ player: p, ss })
    }
  }

  const season = {
    topGoals:   maxByEntry(seasonEntries,     e => e.ss.uclGoals || 0),
    topAssists: maxByEntry(seasonEntries,     e => e.ss.uclAssists || 0),
    topContrib: maxByEntry(seasonEntries,     e => (e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)),
    bestGpg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? (e.ss.uclGoals   || 0) / e.ss.uclApps : null),
    bestApg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? (e.ss.uclAssists || 0) / e.ss.uclApps : null),
    bestCpg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? ((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps : null),
  }

  const top5 = {
    career_goals:   top5By(withUCL, p => p.uclGoals,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclGoals, ctx: `${p.uclApps} UCL apps` })),
    career_assists: top5By(withUCL, p => p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclAssists, ctx: `${p.uclApps} UCL apps` })),
    career_contrib: top5By(withUCL, p => p.uclGoals + p.uclAssists,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclGoals + p.uclAssists, ctx: `${p.uclApps} UCL apps`, fmt: v => `${v} G+A` })),
    career_apps:    top5By(withUCLOutfield, p => p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: p.uclApps, ctx: p.position })),
    career_gpg:     top5ByRate(withUCL.filter(p => p.uclApps >= 5), p => p.uclGoals / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (p.uclGoals / p.uclApps).toFixed(2), ctx: `${p.uclGoals}G · ${p.uclApps} UCL apps` })),
    career_apg:     top5ByRate(withUCL.filter(p => p.uclApps >= 5), p => p.uclAssists / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (p.uclAssists / p.uclApps).toFixed(2), ctx: `${p.uclAssists}A · ${p.uclApps} UCL apps` })),
    career_cpg:     top5ByRate(withUCL.filter(p => p.uclApps >= 5), p => (p.uclGoals + p.uclAssists) / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: ((p.uclGoals + p.uclAssists) / p.uclApps).toFixed(2), ctx: `${p.uclGoals + p.uclAssists} G+A · ${p.uclApps} UCL apps` })),
    career_cspg:    top5ByRate(withUCLGks.filter(p => p.uclApps >= 5), p => p.uclCleanSheets / p.uclApps,
      p => ({ name: p.name, sofifaId: p.sofifaId, id: p.id, value: (p.uclCleanSheets / p.uclApps).toFixed(2), ctx: `${p.uclCleanSheets} CS · ${p.uclApps} UCL apps` })),
    season_goals:   top5ByEntry(seasonEntries, e => e.ss.uclGoals || 0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: e.ss.uclGoals || 0, ctx: `${e.ss.label} · ${e.ss.uclApps || 0} UCL apps` })),
    season_assists: top5ByEntry(seasonEntries, e => e.ss.uclAssists || 0,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: e.ss.uclAssists || 0, ctx: `${e.ss.label} · ${e.ss.uclApps || 0} UCL apps` })),
    season_contrib: top5ByEntry(seasonEntries, e => (e.ss.uclGoals || 0) + (e.ss.uclAssists || 0),
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: (e.ss.uclGoals || 0) + (e.ss.uclAssists || 0), ctx: `${e.ss.label} · ${e.ss.uclApps || 0} UCL apps`, fmt: v => `${v} G+A` })),
    season_gpg:     top5ByEntryRate(seasonEntries.filter(e => (e.ss.uclApps || 0) >= 5), e => (e.ss.uclGoals || 0) / e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: ((e.ss.uclGoals || 0) / e.ss.uclApps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.uclGoals || 0}G · ${e.ss.uclApps} apps` })),
    season_apg:     top5ByEntryRate(seasonEntries.filter(e => (e.ss.uclApps || 0) >= 5), e => (e.ss.uclAssists || 0) / e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: ((e.ss.uclAssists || 0) / e.ss.uclApps).toFixed(2), ctx: `${e.ss.label} · ${e.ss.uclAssists || 0}A · ${e.ss.uclApps} apps` })),
    season_cpg:     top5ByEntryRate(seasonEntries.filter(e => (e.ss.uclApps || 0) >= 5), e => ((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps,
      e => ({ name: e.player.name, sofifaId: e.player.sofifaId, id: e.player.id, value: (((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps).toFixed(2), ctx: `${e.ss.label} · ${(e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)} G+A · ${e.ss.uclApps} apps` })),
  }

  return { career, season, top5 }
}

// ─── Top 5 Modal — rendered via createPortal to document.body ────────────────
// This bypasses the CSS transform on .inner which would otherwise trap position:fixed.
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
  // Portal to document.body — bypasses .inner transform stacking context
  return createPortal(modal, document.body)
}

// ─── Record card — right side tappable for Top5 ──────────────────────────────
function RecordCard({ label, player, value, ctx, highlight, onCardClick, onPlayerClick }) {
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
        <span className={styles.rValue} style={highlight ? { color: 'var(--en-gold)' } : undefined}>
          {value}
        </span>
      </button>
    </div>
  )
}

// Club record card — no photo
function ClubRecordCard({ label, holder, value, ctx }) {
  return (
    <div className={styles.rClubCard}>
      <div className={styles.rClubLeft}>
        <div className={styles.rHolder}>{holder || '—'}</div>
        {ctx && <div className={styles.rCtx}>{ctx}</div>}
      </div>
      <div className={styles.rClubRight}>
        <span className={styles.rLabel}>{label}</span>
        <span className={styles.rValue}>{value}</span>
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
export default function UclRecords({ players, uclMatches, uclSeasons, opponents, loading }) {
  const navigate = useNavigate()
  const [recordView, setRecordView] = useState('players')  // 'players' | 'club'
  const [modal,      setModal]      = useState(null)       // { items, title }

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

  const { career: c, season: s, top5 } = computeUclRecords(players)
  const club = deriveUclClubRecords(uclMatches, uclSeasons, opponents)

  const fromPlayer = p => p ? { id: p.id, name: p.name, sofifaId: p.sofifaId } : null
  const fromEntry  = e => e ? { id: e.player.id, name: e.player.name, sofifaId: e.player.sofifaId } : null

  function onPlayerClick(id) {
    navigate(`/players/${id}`, { state: { defaultTab: 'ucl' } })
  }

  function openModal(key, title) {
    setModal({ items: top5[key] || [], title })
  }

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

      {/* ── Player records view ─────────────────────────────────────── */}
      {recordView === 'players' && (
        <>
          <Section title="Career">
            <RecordCard label="Most UCL goals"
              player={fromPlayer(c.topGoals)}
              value={c.topGoals ? `${c.topGoals.uclGoals} goals` : '—'}
              ctx={c.topGoals ? `${c.topGoals.uclApps} UCL apps` : null}
              highlight
              onCardClick={() => openModal('career_goals', 'Most UCL Career Goals')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most UCL assists"
              player={fromPlayer(c.topAssists)}
              value={c.topAssists ? `${c.topAssists.uclAssists} assists` : '—'}
              ctx={c.topAssists ? `${c.topAssists.uclApps} UCL apps` : null}
              onCardClick={() => openModal('career_assists', 'Most UCL Career Assists')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most UCL contributions"
              player={fromPlayer(c.topContrib)}
              value={c.topContrib ? `${c.topContrib.uclGoals + c.topContrib.uclAssists} G+A` : '—'}
              ctx={c.topContrib ? `${c.topContrib.uclApps} UCL apps` : null}
              onCardClick={() => openModal('career_contrib', 'Most UCL Career Contributions')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most UCL apps (outfield)"
              player={fromPlayer(c.topApps)}
              value={c.topApps ? `${c.topApps.uclApps} apps` : '—'}
              ctx={c.topApps?.position || null}
              onCardClick={() => openModal('career_apps', 'Most UCL Appearances')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best UCL G/Game"
              player={fromPlayer(c.bestGpg)}
              value={c.bestGpg ? fmtRate(c.bestGpg.uclGoals / c.bestGpg.uclApps) : '—'}
              ctx={c.bestGpg ? `${c.bestGpg.uclGoals}G · ${c.bestGpg.uclApps} UCL apps` : null}
              onCardClick={() => openModal('career_gpg', 'Best UCL Career G/Game')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best UCL A/Game"
              player={fromPlayer(c.bestApg)}
              value={c.bestApg ? fmtRate(c.bestApg.uclAssists / c.bestApg.uclApps) : '—'}
              ctx={c.bestApg ? `${c.bestApg.uclAssists}A · ${c.bestApg.uclApps} UCL apps` : null}
              onCardClick={() => openModal('career_apg', 'Best UCL Career A/Game')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best UCL C/Game"
              player={fromPlayer(c.bestCpg)}
              value={c.bestCpg ? fmtRate((c.bestCpg.uclGoals + c.bestCpg.uclAssists) / c.bestCpg.uclApps) : '—'}
              ctx={c.bestCpg ? `${c.bestCpg.uclGoals + c.bestCpg.uclAssists} G+A · ${c.bestCpg.uclApps} UCL apps` : null}
              onCardClick={() => openModal('career_cpg', 'Best UCL Career C/Game')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best UCL CS/Game (GK)"
              player={fromPlayer(c.bestCspg)}
              value={c.bestCspg ? fmtRate(c.bestCspg.uclCleanSheets / c.bestCspg.uclApps) : '—'}
              ctx={c.bestCspg ? `${c.bestCspg.uclCleanSheets} CS · ${c.bestCspg.uclApps} UCL apps` : null}
              onCardClick={() => openModal('career_cspg', 'Best UCL Career CS/Game')}
              onPlayerClick={onPlayerClick} />
          </Section>

          <Section title="Single Season">
            <RecordCard label="Most UCL goals (season)"
              player={fromEntry(s.topGoals)}
              value={s.topGoals ? `${s.topGoals.ss.uclGoals} goals` : '—'}
              ctx={s.topGoals ? `${s.topGoals.ss.label} · ${s.topGoals.ss.uclApps} UCL apps` : null}
              highlight
              onCardClick={() => openModal('season_goals', 'Most UCL Goals — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most UCL assists (season)"
              player={fromEntry(s.topAssists)}
              value={s.topAssists ? `${s.topAssists.ss.uclAssists} assists` : '—'}
              ctx={s.topAssists ? `${s.topAssists.ss.label} · ${s.topAssists.ss.uclApps} UCL apps` : null}
              onCardClick={() => openModal('season_assists', 'Most UCL Assists — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Most UCL contributions (season)"
              player={fromEntry(s.topContrib)}
              value={s.topContrib ? `${(s.topContrib.ss.uclGoals || 0) + (s.topContrib.ss.uclAssists || 0)} G+A` : '—'}
              ctx={s.topContrib ? `${s.topContrib.ss.label} · ${s.topContrib.ss.uclApps} UCL apps` : null}
              onCardClick={() => openModal('season_contrib', 'Most UCL Contributions — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best UCL G/Game (season)"
              player={fromEntry(s.bestGpg)}
              value={s.bestGpg ? fmtRate((s.bestGpg.ss.uclGoals || 0) / s.bestGpg.ss.uclApps) : '—'}
              ctx={s.bestGpg ? `${s.bestGpg.ss.label} · ${s.bestGpg.ss.uclGoals || 0}G · ${s.bestGpg.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_gpg', 'Best UCL G/Game — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best UCL A/Game (season)"
              player={fromEntry(s.bestApg)}
              value={s.bestApg ? fmtRate((s.bestApg.ss.uclAssists || 0) / s.bestApg.ss.uclApps) : '—'}
              ctx={s.bestApg ? `${s.bestApg.ss.label} · ${s.bestApg.ss.uclAssists || 0}A · ${s.bestApg.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_apg', 'Best UCL A/Game — Single Season')}
              onPlayerClick={onPlayerClick} />
            <RecordCard label="Best UCL C/Game (season)"
              player={fromEntry(s.bestCpg)}
              value={s.bestCpg ? fmtRate(((s.bestCpg.ss.uclGoals || 0) + (s.bestCpg.ss.uclAssists || 0)) / s.bestCpg.ss.uclApps) : '—'}
              ctx={s.bestCpg ? `${s.bestCpg.ss.label} · ${(s.bestCpg.ss.uclGoals || 0) + (s.bestCpg.ss.uclAssists || 0)} G+A · ${s.bestCpg.ss.uclApps} apps` : null}
              onCardClick={() => openModal('season_cpg', 'Best UCL C/Game — Single Season')}
              onPlayerClick={onPlayerClick} />
          </Section>

          <p className={styles.rQualNote}>Rate records require a minimum of 5 UCL appearances.</p>
        </>
      )}

      {/* ── Club records view ───────────────────────────────────────── */}
      {recordView === 'club' && (
        <Section title="Club Records">
          {club.biggestWin && (
            <ClubRecordCard label="Biggest UCL Win"
              holder={club.biggestWin.opp ? `vs ${club.biggestWin.opp}` : '—'}
              value={club.biggestWin.score}
              ctx={[club.biggestWin.round, club.biggestWin.season].filter(Boolean).join(' · ')} />
          )}
          {club.worstDefeat && (
            <ClubRecordCard label="Worst UCL Defeat"
              holder={club.worstDefeat.opp ? `vs ${club.worstDefeat.opp}` : '—'}
              value={club.worstDefeat.score}
              ctx={[club.worstDefeat.round, club.worstDefeat.season].filter(Boolean).join(' · ')} />
          )}
          {club.highestScoringMatch && (
            <ClubRecordCard label="Most Goals in a Match"
              holder={club.highestScoringMatch.opp ? `vs ${club.highestScoringMatch.opp}` : '—'}
              value={club.highestScoringMatch.score}
              ctx={[club.highestScoringMatch.round, club.highestScoringMatch.season].filter(Boolean).join(' · ')} />
          )}
          {club.mostGoalsCampaign && (
            <ClubRecordCard label="Most Goals in a Campaign"
              holder={club.mostGoalsCampaign.label}
              value={`${club.mostGoalsCampaign.gf} goals`}
              ctx={club.mostGoalsCampaign.record} />
          )}
          {club.fewestConcededCampaign && (
            <ClubRecordCard label="Fewest Conceded in a Campaign"
              holder={club.fewestConcededCampaign.label}
              value={`${club.fewestConcededCampaign.ga} conceded`}
              ctx={club.fewestConcededCampaign.record} />
          )}
          {club.bestCampaign && (
            <ClubRecordCard label="Best Campaign Record"
              holder={club.bestCampaign.label}
              value={`${club.bestCampaign.pts} pts`}
              ctx={`${club.bestCampaign.record} · ${club.bestCampaign.gf}–${club.bestCampaign.ga}`} />
          )}
          {club.finals && club.finals.played > 0 && (
            <ClubRecordCard label="Finals Record"
              holder={`${club.finals.played} final${club.finals.played !== 1 ? 's' : ''}`}
              value={`${club.finals.won}W ${club.finals.lost}L`}
              ctx={null} />
          )}
        </Section>
      )}

      {/* Top5 Modal — portal to document.body (bypasses .inner transform) */}
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
