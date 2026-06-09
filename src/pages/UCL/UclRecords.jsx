import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './UCL.module.css'
import { isGK } from '../../utils/uclUtils'

// ─── Player photo — same pattern as Records.jsx ───────────────────────────────
function PlayerImg({ sofifaId, name, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette size={size} />
  return (
    <img
      src={`https://fifa-img.michaelmenda92.workers.dev/${sofifaId}`}
      alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block' }}
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

// ─── Local record helpers ─────────────────────────────────────────────────────
// These mirror the private helpers in Records.jsx exactly.
// They are intentionally inlined here rather than added to uclUtils.js
// to avoid a risky refactor of Records.jsx in this delivery.

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

// ─── UCL record computation ───────────────────────────────────────────────────
// Input: raw players array (same as loaded by index.jsx).
// Mirrors the uclCareer + uclSeason blocks from computeAllRecords in Records.jsx exactly.
// Min threshold: 5 UCL appearances for rate records.
function computeUclRecords(players) {
  const active = players.filter(p => !p.isHistoricalStub)

  // Sum UCL totals from embedded seasonStats[] (same as Records.jsx approach)
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

  // Single-season UCL entries from embedded seasonStats[]
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
    bestGpg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? (e.ss.uclGoals || 0)   / e.ss.uclApps : null),
    bestApg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? (e.ss.uclAssists || 0) / e.ss.uclApps : null),
    bestCpg:    maxByEntryRate(seasonEntries, e => (e.ss.uclApps || 0) >= 5 ? ((e.ss.uclGoals || 0) + (e.ss.uclAssists || 0)) / e.ss.uclApps : null),
  }

  return { career, season }
}

// ─── Display helpers ──────────────────────────────────────────────────────────
function fmtRate(n) {
  return n != null ? n.toFixed(2) : '—'
}

// ─── RecordCard ───────────────────────────────────────────────────────────────
// Mirrors the Records.jsx RecordCard component structure and CSS class names.
// Uses UCL.module.css which defines matching classes (rCard, rLeft, rRight, etc.)
function RecordCard({ label, player, value, ctx, highlight, onPlayerClick }) {
  const navigate = useNavigate()
  function handlePlayerClick() {
    if (player?.id && onPlayerClick) onPlayerClick(player.id)
  }
  return (
    <div className={styles.rCard}>
      {/* Left: photo + name */}
      <div className={styles.rLeft}>
        <button
          className={styles.rPlayerBtn}
          onClick={handlePlayerClick}
          disabled={!player?.id}
          title={player?.name}
        >
          <PlayerImg sofifaId={player?.sofifaId} name={player?.name || ''} size={36} />
        </button>
        <button
          className={styles.rMetaBtn}
          onClick={handlePlayerClick}
          disabled={!player?.id}
        >
          <span className={styles.rHolder}>{player?.name || '—'}</span>
          {ctx && <span className={styles.rCtx}>{ctx}</span>}
        </button>
      </div>
      {/* Right: label + value */}
      <div className={styles.rRight}>
        <span className={styles.rLabel}>{label}</span>
        <span className={styles.rValue} style={highlight ? { color: 'var(--en-gold)' } : undefined}>
          {value}
        </span>
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function UclRecords({ players, loading }) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.spinner} />
      </div>
    )
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

  const { career: c, season: s } = computeUclRecords(players)

  // Helper: player ref from a top-level player object
  const fromPlayer = p => p ? { id: p.id, name: p.name, sofifaId: p.sofifaId } : null
  // Helper: player ref from a season entry
  const fromEntry  = e => e ? { id: e.player.id, name: e.player.name, sofifaId: e.player.sofifaId } : null

  function onPlayerClick(id) {
    navigate(`/players/${id}`)
  }

  return (
    <div className={styles.rWrap}>

      {/* ── Career records ──────────────────────────────────────────── */}
      <Section title="Career">
        <RecordCard
          label="Most UCL goals"
          player={fromPlayer(c.topGoals)}
          value={c.topGoals ? `${c.topGoals.uclGoals} goals` : '—'}
          ctx={c.topGoals ? `${c.topGoals.uclApps} UCL apps` : null}
          highlight
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Most UCL assists"
          player={fromPlayer(c.topAssists)}
          value={c.topAssists ? `${c.topAssists.uclAssists} assists` : '—'}
          ctx={c.topAssists ? `${c.topAssists.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Most UCL contributions"
          player={fromPlayer(c.topContrib)}
          value={c.topContrib ? `${c.topContrib.uclGoals + c.topContrib.uclAssists} G+A` : '—'}
          ctx={c.topContrib ? `${c.topContrib.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Most UCL apps (outfield)"
          player={fromPlayer(c.topApps)}
          value={c.topApps ? `${c.topApps.uclApps} apps` : '—'}
          ctx={c.topApps?.position || null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Best UCL G/Game"
          player={fromPlayer(c.bestGpg)}
          value={c.bestGpg ? fmtRate(c.bestGpg.uclGoals / c.bestGpg.uclApps) : '—'}
          ctx={c.bestGpg ? `${c.bestGpg.uclGoals}G · ${c.bestGpg.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Best UCL A/Game"
          player={fromPlayer(c.bestApg)}
          value={c.bestApg ? fmtRate(c.bestApg.uclAssists / c.bestApg.uclApps) : '—'}
          ctx={c.bestApg ? `${c.bestApg.uclAssists}A · ${c.bestApg.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Best UCL C/Game"
          player={fromPlayer(c.bestCpg)}
          value={c.bestCpg ? fmtRate((c.bestCpg.uclGoals + c.bestCpg.uclAssists) / c.bestCpg.uclApps) : '—'}
          ctx={c.bestCpg ? `${c.bestCpg.uclGoals + c.bestCpg.uclAssists} G+A · ${c.bestCpg.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Best UCL CS/Game (GK)"
          player={fromPlayer(c.bestCspg)}
          value={c.bestCspg ? fmtRate(c.bestCspg.uclCleanSheets / c.bestCspg.uclApps) : '—'}
          ctx={c.bestCspg ? `${c.bestCspg.uclCleanSheets} CS · ${c.bestCspg.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
      </Section>

      {/* ── Single-season records ────────────────────────────────────── */}
      <Section title="Single Season">
        <RecordCard
          label="Most UCL goals (season)"
          player={fromEntry(s.topGoals)}
          value={s.topGoals ? `${s.topGoals.ss.uclGoals} goals` : '—'}
          ctx={s.topGoals ? `${s.topGoals.ss.label} · ${s.topGoals.ss.uclApps} UCL apps` : null}
          highlight
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Most UCL assists (season)"
          player={fromEntry(s.topAssists)}
          value={s.topAssists ? `${s.topAssists.ss.uclAssists} assists` : '—'}
          ctx={s.topAssists ? `${s.topAssists.ss.label} · ${s.topAssists.ss.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Most UCL contributions (season)"
          player={fromEntry(s.topContrib)}
          value={s.topContrib ? `${(s.topContrib.ss.uclGoals || 0) + (s.topContrib.ss.uclAssists || 0)} G+A` : '—'}
          ctx={s.topContrib ? `${s.topContrib.ss.label} · ${s.topContrib.ss.uclApps} UCL apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Best UCL G/Game (season)"
          player={fromEntry(s.bestGpg)}
          value={s.bestGpg ? fmtRate((s.bestGpg.ss.uclGoals || 0) / s.bestGpg.ss.uclApps) : '—'}
          ctx={s.bestGpg ? `${s.bestGpg.ss.label} · ${s.bestGpg.ss.uclGoals || 0}G · ${s.bestGpg.ss.uclApps} apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Best UCL A/Game (season)"
          player={fromEntry(s.bestApg)}
          value={s.bestApg ? fmtRate((s.bestApg.ss.uclAssists || 0) / s.bestApg.ss.uclApps) : '—'}
          ctx={s.bestApg ? `${s.bestApg.ss.label} · ${s.bestApg.ss.uclAssists || 0}A · ${s.bestApg.ss.uclApps} apps` : null}
          onPlayerClick={onPlayerClick}
        />
        <RecordCard
          label="Best UCL C/Game (season)"
          player={fromEntry(s.bestCpg)}
          value={s.bestCpg ? fmtRate(((s.bestCpg.ss.uclGoals || 0) + (s.bestCpg.ss.uclAssists || 0)) / s.bestCpg.ss.uclApps) : '—'}
          ctx={s.bestCpg ? `${s.bestCpg.ss.label} · ${(s.bestCpg.ss.uclGoals || 0) + (s.bestCpg.ss.uclAssists || 0)} G+A · ${s.bestCpg.ss.uclApps} apps` : null}
          onPlayerClick={onPlayerClick}
        />
      </Section>

      {/* Minimum qualifier note */}
      <p className={styles.rQualNote}>Rate records require a minimum of 5 UCL appearances.</p>
    </div>
  )
}
