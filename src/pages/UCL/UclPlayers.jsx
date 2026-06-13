import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './UCL.module.css'
import { isGK, deriveUclPlayerStats } from '../../utils/uclUtils'

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

// Multi-select aware: posFilters is [] (All) or an array of filter keys.
// Player passes if it matches ANY selected key.
function playerMatchesPosFilters(player, posFilters) {
  if (posFilters.length === 0) return true
  return posFilters.some(f => {
    if (f === 'GK') return isGK(player)
    const positions = splitPositions(player.position)
    if (ROLE_GROUPS[f]) return positions.some(p => ROLE_GROUPS[f].includes(p))
    return positions.includes(f)
  })
}

// ─── UCL season stat lookup (collection-based) ───────────────────────────────
// Sums collection docs for a single player filtered to one season.
// seasonId is resolved by matching seasonLabel against the uclSeasons prop.
// Returns null if no UCL docs exist for this player+season combination.
function sumUclSeasonStatsDocs(playerId, seasonId, uclStatsDocs) {
  const docs = uclStatsDocs.filter(d => d.playerId === playerId && d.seasonId === seasonId)
  if (!docs.length) return null
  return docs.reduce((acc, d) => ({
    uclApps:        acc.uclApps        + (d.apps          || 0),
    uclGoals:       acc.uclGoals       + (d.goals         || 0),
    uclAssists:     acc.uclAssists     + (d.assists       || 0),
    uclCleanSheets: acc.uclCleanSheets + (d.cleanSheets   || 0),
  }), { uclApps: 0, uclGoals: 0, uclAssists: 0, uclCleanSheets: 0 })
}

// derivePlayerUclStats (inline, embedded-based) removed in Phase 1.
// Career totals now come from deriveUclPlayerStats(uclStatsDocs, players) in uclUtils.js.

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
export default function UclPlayers({ players, uclSeasons, uclStatsDocs, loading }) {
  const navigate = useNavigate()

  // Multi-select: [] = All, [...keys] = selected filters
  const [posFilters,    setPosFilters]    = useState([])
  const [seasonFilters, setSeasonFilters] = useState([])
  // Default sort: G+A descending
  const [sortKey,      setSortKey]      = useState('uclContrib')
  const [sortDir,      setSortDir]      = useState('desc')

  if (loading) {
    return <div className={styles.loadWrap}><div className={styles.spinner} /></div>
  }

  // Build a seasonLabel → seasonId map from the uclSeasons prop.
  // Used for the season filter — collection docs carry seasonId, not label.
  const seasonIdByLabel = {}
  for (const s of (uclSeasons || [])) {
    if (s.label && s.id) seasonIdByLabel[s.label] = s.id
  }

  // Career view: derive totals from collection docs via uclUtils (no embedded reads)
  const careerStats = deriveUclPlayerStats(uclStatsDocs || [], players)
  // Build a playerId → career stats lookup for O(1) access
  const careerByPlayerId = new Map(careerStats.map(s => [s.id, s]))

  const base = players.filter(p => !p.isHistoricalStub)

  const withStats = base.map(p => {
    let raw
    if (seasonFilters.length === 0) {
      // All seasons: use pre-computed career totals from collection docs
      const career = careerByPlayerId.get(p.id)
      if (!career) return null
      raw = {
        uclApps:        career.uclApps,
        uclGoals:       career.uclGoals,
        uclAssists:     career.uclAssists,
        uclCleanSheets: career.uclCleanSheets,
      }
    } else {
      // Multi-season: sum UCL docs across all selected seasons
      let apps = 0, goals = 0, assists = 0, cleanSheets = 0
      let hasAny = false
      for (const label of seasonFilters) {
        const seasonId = seasonIdByLabel[label]
        if (!seasonId) continue
        const s = sumUclSeasonStatsDocs(p.id, seasonId, uclStatsDocs || [])
        if (!s) continue
        hasAny    = true
        apps     += s.uclApps        || 0
        goals    += s.uclGoals       || 0
        assists  += s.uclAssists     || 0
        cleanSheets += s.uclCleanSheets || 0
      }
      if (!hasAny) return null
      raw = { uclApps: apps, uclGoals: goals, uclAssists: assists, uclCleanSheets: cleanSheets }
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
          {seasonFilters.length > 0
            ? `No UCL data for ${seasonFilters.join(', ')}.`
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

  // GK cols if: only GK is selected, or no pos filter and all players are GK
  const onlyGkSelected = posFilters.length === 1 && posFilters[0] === 'GK'
  const cols = (onlyGkSelected || (posFilters.length === 0 && withStats.every(p => isGK(p))))
    ? GK_COLS : OUTFIELD_COLS

  const filtered = withStats.filter(p => playerMatchesPosFilters(p, posFilters))

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  function handleSort(key) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // Toggle a position filter key. 'All' clears the array.
  function handlePosFilter(key) {
    if (key === 'All') {
      setPosFilters([])
    } else {
      setPosFilters(prev =>
        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      )
    }
    setSortKey('uclContrib')
    setSortDir('desc')
  }

  // Toggle a season label. Clears when already the only item selected.
  function handleSeasonFilter(label) {
    setSeasonFilters(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
    setSortKey('uclContrib')
    setSortDir('desc')
  }

  function clearSeasonFilters() {
    setSeasonFilters([])
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
            className={`${styles.plSeasonBtn} ${seasonFilters.length === 0 ? styles.plSeasonActive : ''}`}
            onClick={clearSeasonFilters}
          >
            All Seasons
          </button>
          {seasonLabels.map(label => (
            <button
              key={label}
              className={`${styles.plSeasonBtn} ${seasonFilters.includes(label) ? styles.plSeasonActive : ''}`}
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
            className={`${styles.plFilterBtn} ${
              f.key === 'All'
                ? posFilters.length === 0 ? styles.plFilterActive : ''
                : posFilters.includes(f.key) ? styles.plFilterActive : ''
            }`}
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
