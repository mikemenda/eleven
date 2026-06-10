import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './UCL.module.css'
import { isGK } from '../../utils/uclUtils'

// ─── Position constants ───────────────────────────────────────────────────────
const POS_ORDER = ['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']
const ROLE_GROUPS = {
  Attackers:   ['ST','RW','LW','LM','RM','CAM','CF'],
  Midfielders: ['CM','CDM'],
  Defenders:   ['LB','RB','CB','LWB','RWB'],
}

function splitPositions(posStr) {
  if (!posStr) return []
  return posStr.split(/[,\/]+/).map(p => p.trim()).filter(Boolean)
}

function playerMatchesFilter(player, posFilter) {
  if (posFilter === 'All') return true
  if (posFilter === 'GK')  return isGK(player)
  const positions = splitPositions(player.position)
  if (ROLE_GROUPS[posFilter]) return positions.some(p => ROLE_GROUPS[posFilter].includes(p))
  return positions.includes(posFilter)
}

// ─── UCL season stat summation ────────────────────────────────────────────────
function sumUclSeasonStats(player, seasonLabel) {
  const rows = (player.seasonStats || []).filter(
    ss => ss.label === seasonLabel && (ss.uclApps || 0) > 0
  )
  if (!rows.length) return null
  return rows.reduce((acc, ss) => ({
    uclApps:        acc.uclApps        + (ss.uclApps        || 0),
    uclGoals:       acc.uclGoals       + (ss.uclGoals       || 0),
    uclAssists:     acc.uclAssists     + (ss.uclAssists     || 0),
    uclCleanSheets: acc.uclCleanSheets + (ss.uclCleanSheets || 0),
  }), { uclApps: 0, uclGoals: 0, uclAssists: 0, uclCleanSheets: 0 })
}

// ─── Derive UCL stats for a single player (career totals) ────────────────────
function derivePlayerUclStats(player) {
  let uclApps = 0, uclGoals = 0, uclAssists = 0, uclCleanSheets = 0
  if (player.seasonStats?.length) {
    for (const ss of player.seasonStats) {
      uclApps        += ss.uclApps        || 0
      uclGoals       += ss.uclGoals       || 0
      uclAssists     += ss.uclAssists     || 0
      uclCleanSheets += ss.uclCleanSheets || 0
    }
  } else {
    uclApps        = player.uclApps        || 0
    uclGoals       = player.uclGoals       || 0
    uclAssists     = player.uclAssists     || 0
    uclCleanSheets = player.uclCleanSheets || 0
  }
  return { uclApps, uclGoals, uclAssists, uclCleanSheets }
}

// ─── Player photo ─────────────────────────────────────────────────────────────
function PlayerImg({ sofifaId, name, size = 28 }) {
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

function Silhouette({ size = 28 }) {
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

// ─── Column definitions — order: App G A G+A G/G A/G C/G ─────────────────────
const OUTFIELD_COLS = [
  { key: 'uclApps',    label: 'App', title: 'UCL Appearances',        isRate: false },
  { key: 'uclGoals',   label: 'G',   title: 'UCL Goals',              isRate: false },
  { key: 'uclAssists', label: 'A',   title: 'UCL Assists',            isRate: false },
  { key: 'uclContrib', label: 'G+A', title: 'UCL Contributions',      isRate: false },
  { key: 'uclGpg',     label: 'G/G', title: 'UCL Goals per Game',     isRate: true  },
  { key: 'uclApg',     label: 'A/G', title: 'UCL Assists per Game',   isRate: true  },
  { key: 'uclCpg',     label: 'C/G', title: 'UCL Contributions/Game', isRate: true  },
]

const GK_COLS = [
  { key: 'uclApps',        label: 'App',  title: 'UCL Appearances',           isRate: false },
  { key: 'uclCleanSheets', label: 'CS',   title: 'UCL Clean Sheets',          isRate: false },
  { key: 'uclCspg',        label: 'CS/G', title: 'UCL Clean Sheets per Game', isRate: true  },
  { key: 'uclGoals',       label: 'G',    title: 'UCL Goals',                 isRate: false },
]

function fmtStat(v, isRate) {
  if (v == null) return isRate ? '0.00' : '0'
  return isRate ? Number(v).toFixed(2) : String(v)
}

// ─── Enrich stats with derived rate fields ────────────────────────────────────
function enrichStats(raw) {
  const { uclApps, uclGoals, uclAssists, uclCleanSheets } = raw
  return {
    ...raw,
    uclContrib: uclGoals + uclAssists,
    uclGpg:     uclApps > 0 ? uclGoals   / uclApps : 0,
    uclApg:     uclApps > 0 ? uclAssists / uclApps : 0,
    uclCpg:     uclApps > 0 ? (uclGoals + uclAssists) / uclApps : 0,
    uclCspg:    uclApps > 0 ? uclCleanSheets / uclApps : 0,
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function UclPlayers({ players, uclSeasons, loading }) {
  const navigate = useNavigate()

  const [posFilter,    setPosFilter]    = useState('All')
  const [seasonFilter, setSeasonFilter] = useState('all')
  // Default sort: G+A descending
  const [sortKey,      setSortKey]      = useState('uclContrib')
  const [sortDir,      setSortDir]      = useState('desc')

  if (loading) {
    return <div className={styles.loadWrap}><div className={styles.spinner} /></div>
  }

  const base = players.filter(p => !p.isHistoricalStub)

  const withStats = base.map(p => {
    let raw
    if (seasonFilter === 'all') {
      raw = derivePlayerUclStats(p)
    } else {
      raw = sumUclSeasonStats(p, seasonFilter)
      if (!raw) return null
    }
    return {
      id:       p.id,
      name:     p.name,
      position: p.position,
      sofifaId: p.sofifaId,
      status:   p.status,
      ...enrichStats(raw),
    }
  }).filter(Boolean).filter(p => p.uclApps > 0)

  if (withStats.length === 0 && base.length > 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>👤</span>
        <p className={styles.emptyText}>No UCL stats found</p>
        <p className={styles.emptyHint}>
          {seasonFilter !== 'all'
            ? `No UCL data for ${seasonFilter}.`
            : 'Player UCL stats appear once seasonStats are seeded.'}
        </p>
      </div>
    )
  }

  if (withStats.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>👤</span>
        <p className={styles.emptyText}>No UCL player stats yet</p>
        <p className={styles.emptyHint}>Player UCL stats appear once seasonStats are seeded.</p>
      </div>
    )
  }

  // ── Position filter options ───────────────────────────────────────────────
  const presentPositions = new Set(withStats.flatMap(p => splitPositions(p.position)))
  const posFilterOptions = [
    { key: 'All', label: 'All' },
    ...Object.keys(ROLE_GROUPS)
      .filter(g => ROLE_GROUPS[g].some(p => presentPositions.has(p)))
      .map(g => ({ key: g, label: g })),
    ...POS_ORDER
      .filter(p => presentPositions.has(p))
      .map(p => ({ key: p, label: p })),
  ]

  // ── Season pills — newest first ───────────────────────────────────────────
  const seasonLabels = [...(uclSeasons || [])]
    .sort((a, b) => {
      const ya = typeof a.year === 'string' ? parseInt(a.year.slice(0, 4), 10) : 0
      const yb = typeof b.year === 'string' ? parseInt(b.year.slice(0, 4), 10) : 0
      return yb - ya
    })
    .map(s => s.label)
    .filter(Boolean)

  const cols = (posFilter === 'GK' || (posFilter === 'All' && withStats.every(p => isGK(p))))
    ? GK_COLS : OUTFIELD_COLS

  const filtered = withStats.filter(p => playerMatchesFilter(p, posFilter))

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  function handleSort(key) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handlePosFilter(key) {
    setPosFilter(key)
    setSortKey('uclContrib')
    setSortDir('desc')
  }

  function handleSeasonFilter(label) {
    setSeasonFilter(label)
    setSortKey('uclContrib')
    setSortDir('desc')
  }

  function handleRowClick(id) {
    navigate(`/players/${id}`, { state: { defaultTab: 'ucl' } })
  }

  return (
    <div className={styles.plWrap}>

      {/* ── Season filter pills ───────────────────────────────────── */}
      {seasonLabels.length > 0 && (
        <div className={styles.plSeasonBar}>
          <button
            className={`${styles.plSeasonBtn} ${seasonFilter === 'all' ? styles.plSeasonActive : ''}`}
            onClick={() => handleSeasonFilter('all')}
          >
            All Seasons
          </button>
          {seasonLabels.map(label => (
            <button
              key={label}
              className={`${styles.plSeasonBtn} ${seasonFilter === label ? styles.plSeasonActive : ''}`}
              onClick={() => handleSeasonFilter(label)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Position filter pills ─────────────────────────────────── */}
      <div className={styles.plFilterBar}>
        {posFilterOptions.map(f => (
          <button
            key={f.key}
            className={`${styles.plFilterBtn} ${posFilter === f.key ? styles.plFilterActive : ''}`}
            onClick={() => handlePosFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className={styles.plCount}>{sorted.length} player{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <div className={styles.plTableScroll}>
        <table className={styles.plTableEl}>
          <thead>
            <tr>
              <th className={styles.plThIdentity}>
                <span className={styles.plThNameInner}>Player</span>
              </th>
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
              <tr key={p.id} className={styles.plTr} onClick={() => handleRowClick(p.id)}>
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
