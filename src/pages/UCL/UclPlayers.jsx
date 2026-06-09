import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './UCL.module.css'
import { deriveUclPlayerStats, isGK } from '../../utils/uclUtils'

// ─── Position constants (from Players.jsx) ───────────────────────────────────
const POS_ORDER   = ['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']
const ROLE_GROUPS = {
  Attackers:   ['ST','RW','LW','LM','RM','CAM','CF'],
  Midfielders: ['CM','CDM'],
  Defenders:   ['LB','RB','CB','LWB','RWB'],
}

function splitPositions(posStr) {
  if (!posStr) return []
  return posStr.split(/[,\/]+/).map(p => p.trim()).filter(Boolean)
}

function playerMatchesFilter(player, filter) {
  if (filter === 'All') return true
  if (filter === 'GK')  return isGK(player)
  const positions = splitPositions(player.position)
  if (ROLE_GROUPS[filter]) return positions.some(p => ROLE_GROUPS[filter].includes(p))
  return positions.includes(filter)
}

// ─── Player photo ─────────────────────────────────────────────────────────────
function PlayerImg({ sofifaId, name, size = 32 }) {
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

// ─── Column definitions ───────────────────────────────────────────────────────
const OUTFIELD_COLS = [
  { key: 'uclApps',    label: 'Apps', title: 'UCL Appearances',      isRate: false },
  { key: 'uclGoals',   label: 'G',    title: 'UCL Goals',            isRate: false },
  { key: 'uclAssists', label: 'A',    title: 'UCL Assists',          isRate: false },
  { key: 'uclContrib', label: 'G+A',  title: 'UCL Contributions',    isRate: false },
  { key: 'uclGpg',     label: 'G/G',  title: 'UCL Goals per Game',   isRate: true  },
  { key: 'uclCpg',     label: 'C/G',  title: 'UCL Contribs per Game',isRate: true  },
]

const GK_COLS = [
  { key: 'uclApps',        label: 'Apps', title: 'UCL Appearances',            isRate: false },
  { key: 'uclCleanSheets', label: 'CS',   title: 'UCL Clean Sheets',           isRate: false },
  { key: 'uclCspg',        label: 'CS/G', title: 'UCL Clean Sheets per Game',  isRate: true  },
  { key: 'uclGoals',       label: 'G',    title: 'UCL Goals',                  isRate: false },
]

// Filter bar options
const FILTER_OPTIONS = [
  { key: 'All',        label: 'All',        isGroup: false },
  { key: 'Attackers',  label: 'Attackers',  isGroup: true  },
  { key: 'Midfielders',label: 'Mids',       isGroup: true  },
  { key: 'Defenders',  label: 'Defenders',  isGroup: true  },
  { key: 'GK',         label: 'GK',         isGroup: false },
]

function fmtStat(v, isRate) {
  if (v == null) return isRate ? '0.00' : '0'
  return isRate ? Number(v).toFixed(2) : String(v)
}

export default function UclPlayers({ players, loading }) {
  const navigate = useNavigate()
  const [filter,  setFilter]  = useState('All')       // default All
  const [sortKey, setSortKey] = useState('uclApps')
  const [sortDir, setSortDir] = useState('desc')

  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  const allStats = deriveUclPlayerStats(players).map(p => ({
    ...p,
    uclCspg: p.uclApps > 0 ? p.uclCleanSheets / p.uclApps : 0,
  }))

  if (allStats.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>👤</span>
        <p className={styles.emptyText}>No UCL player stats yet</p>
        <p className={styles.emptyHint}>Player UCL stats appear once seasonStats are seeded.</p>
      </div>
    )
  }

  const filtered = allStats.filter(p => playerMatchesFilter(p, filter))
  const cols     = filter === 'GK' ? GK_COLS : OUTFIELD_COLS

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  function handleSort(key) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handleRowClick(id) {
    // Navigate to PlayerProfile defaulting to UCL tab
    navigate(`/players/${id}`, { state: { defaultTab: 'ucl' } })
  }

  // Rebuild filter when switching group so sort key is valid for new cols
  function handleFilter(key) {
    setFilter(key)
    setSortKey('uclApps')
    setSortDir('desc')
  }

  return (
    <div className={styles.plWrap}>
      {/* Filter bar */}
      <div className={styles.plFilterBar}>
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.key}
            className={`${styles.plFilterBtn} ${filter === f.key ? styles.plFilterActive : ''}`}
            onClick={() => handleFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className={styles.plCount}>{sorted.length} player{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table — HTML table with sticky identity column, same pattern as Players.jsx */}
      <div className={styles.plTableScroll}>
        <table className={styles.plTableEl}>
          <thead>
            <tr>
              {/* Frozen identity header */}
              <th className={styles.plThIdentity}>
                <span className={styles.plThNameInner}>Player</span>
              </th>
              {/* Scrollable stat headers */}
              {cols.map(c => (
                <th key={c.key} className={styles.plThStat}>
                  <button
                    className={`${styles.plSortBtn} ${sortKey === c.key ? styles.plSortActive : ''}`}
                    onClick={() => handleSort(c.key)}
                    title={c.title}
                  >
                    {c.label}
                    {sortKey === c.key && (
                      <span className={styles.plSortArrow}>{sortDir === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr
                key={p.id}
                className={styles.plTr}
                onClick={() => handleRowClick(p.id)}
              >
                {/* Frozen identity cell */}
                <td className={styles.plTdIdentity}>
                  <div className={styles.plIdentity}>
                    <div className={styles.plThumb}>
                      <PlayerImg sofifaId={p.sofifaId} name={p.name} size={28} />
                    </div>
                    <div className={styles.plIdentityInfo}>
                      <span className={styles.plName}>{p.name}</span>
                      <span className={styles.plPos}>{p.position || '—'}</span>
                    </div>
                  </div>
                </td>
                {/* Stat cells */}
                {cols.map(c => (
                  <td
                    key={c.key}
                    className={`${styles.plTdStat} ${sortKey === c.key ? styles.plTdActive : ''}`}
                  >
                    {fmtStat(p[c.key], c.isRate)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
