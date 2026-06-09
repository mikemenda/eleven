import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './UCL.module.css'
import { deriveUclPlayerStats, isGK } from '../../utils/uclUtils'

// ─── Player photo — identical pattern to Records.jsx and Players.jsx ──────────
function PlayerImg({ sofifaId, name, size = 32 }) {
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

function Silhouette({ size = 32 }) {
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

// ─── Sort config ──────────────────────────────────────────────────────────────
// Outfield columns
const OUTFIELD_COLS = [
  { key: 'uclApps',    label: 'Apps',  title: 'UCL Appearances' },
  { key: 'uclGoals',   label: 'G',     title: 'UCL Goals' },
  { key: 'uclAssists', label: 'A',     title: 'UCL Assists' },
  { key: 'uclContrib', label: 'G+A',   title: 'UCL Contributions' },
  { key: 'uclGpg',     label: 'G/G',   title: 'UCL Goals per Game' },
  { key: 'uclCpg',     label: 'C/G',   title: 'UCL Contributions per Game' },
]

// GK columns
const GK_COLS = [
  { key: 'uclApps',        label: 'Apps',  title: 'UCL Appearances' },
  { key: 'uclCleanSheets', label: 'CS',    title: 'UCL Clean Sheets' },
  { key: 'uclCspg',        label: 'CS/G',  title: 'UCL Clean Sheets per Game' },
  { key: 'uclGoals',       label: 'G',     title: 'UCL Goals' },
]

// Filter tabs
const FILTERS = [
  { key: 'outfield', label: 'Outfield' },
  { key: 'gk',       label: 'GK'       },
  { key: 'all',      label: 'All'      },
]

function fmtRate(v) {
  return typeof v === 'number' && v > 0 ? v.toFixed(2) : '0.00'
}

export default function UclPlayers({ players, loading }) {
  const navigate = useNavigate()
  const [filter,  setFilter]  = useState('outfield')
  const [sortKey, setSortKey] = useState('uclApps')
  const [sortDir, setSortDir] = useState('desc')

  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  // Derive UCL stats from player docs (Path A — embedded seasonStats UCL fields)
  const allStats = deriveUclPlayerStats(players)

  // Add cspg for GK display (not in deriveUclPlayerStats since it's GK-only)
  const enriched = allStats.map(p => ({
    ...p,
    uclCspg: p.uclApps > 0 ? p.uclCleanSheets / p.uclApps : 0,
  }))

  // Filter by position group
  const filtered = enriched.filter(p => {
    if (filter === 'gk')      return isGK(p)
    if (filter === 'outfield') return !isGK(p)
    return true
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const cols = filter === 'gk' ? GK_COLS : OUTFIELD_COLS

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (allStats.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>👤</span>
        <p className={styles.emptyText}>No UCL player stats yet</p>
        <p className={styles.emptyHint}>Player UCL stats appear once seasonStats are seeded.</p>
      </div>
    )
  }

  return (
    <div className={styles.plWrap}>
      {/* Filter pills */}
      <div className={styles.plFilterBar}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`${styles.plFilterBtn} ${filter === f.key ? styles.plFilterActive : ''}`}
            onClick={() => {
              setFilter(f.key)
              setSortKey('uclApps')
              setSortDir('desc')
            }}
          >
            {f.label}
          </button>
        ))}
        <span className={styles.plCount}>{sorted.length} player{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className={styles.plTable}>
        {/* Header */}
        <div className={styles.plHead}>
          <span className={styles.plThName}>Player</span>
          {cols.map(c => (
            <button
              key={c.key}
              className={`${styles.plTh} ${sortKey === c.key ? styles.plThActive : ''}`}
              onClick={() => handleSort(c.key)}
              title={c.title}
            >
              {c.label}
              {sortKey === c.key && (
                <span className={styles.plSortArrow}>{sortDir === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>

        {/* Rows */}
        {sorted.map(p => (
          <button
            key={p.id}
            className={styles.plRow}
            onClick={() => navigate(`/players/${p.id}`)}
          >
            <span className={styles.plTdName}>
              <PlayerImg sofifaId={p.sofifaId} name={p.name} size={28} />
              <span className={styles.plNameInner}>
                <span className={styles.plName}>{p.name}</span>
                <span className={styles.plPos}>{p.position || '—'}</span>
              </span>
            </span>
            {cols.map(c => (
              <span
                key={c.key}
                className={`${styles.plTd} ${sortKey === c.key ? styles.plTdActive : ''}`}
              >
                {c.key === 'uclGpg' || c.key === 'uclApg' || c.key === 'uclCpg' || c.key === 'uclCspg'
                  ? fmtRate(p[c.key])
                  : (p[c.key] ?? 0)
                }
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  )
}
