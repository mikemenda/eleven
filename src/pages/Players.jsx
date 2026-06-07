import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayers } from '../firebase/services'
import styles from './Players.module.css'

// ─── Position constants ────────────────────────────────────────────────────────

const POS_ORDER = ['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

const ROLE_GROUPS = {
  Attackers:  ['ST','RW','LW','LM','RM','CAM','CF'],
  Midfielders:['CM','CDM'],
  Defenders:  ['LB','RB','CB','LWB','RWB'],
}

const INDIVIDUAL_POS = POS_ORDER

// Split a player's position string safely into an array of codes.
// Handles: "CM", "CM, CAM", "CM,CAM", "CM / CAM", "LM, RM, CAM"
function splitPositions(posStr) {
  if (!posStr) return []
  return posStr.split(/[,\/]+/).map(p => p.trim()).filter(Boolean)
}

function playerMatchesFilter(player, filter) {
  if (filter === 'All') return true
  const positions = splitPositions(player.position)
  if (ROLE_GROUPS[filter]) return positions.some(p => ROLE_GROUPS[filter].includes(p))
  return positions.includes(filter)
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_META = {
  Active: { label: 'Active', color: 'var(--en-green)' },
  Sold:   { label: 'Sold',   color: 'var(--en-text-3)' },
}

// ─── Stat column definitions ──────────────────────────────────────────────────

const STAT_COLS = [
  { key: 'apps',        label: 'Apps',  title: 'Appearances' },
  { key: 'goals',       label: 'G',     title: 'Goals' },
  { key: 'assists',     label: 'A',     title: 'Assists' },
  { key: 'contrib',     label: 'G+A',   title: 'Contributions (Goals + Assists)', derived: true },
  { key: 'gpg',         label: 'G/G',   title: 'Goals per Game',          derived: true },
  { key: 'apg',         label: 'A/G',   title: 'Assists per Game',        derived: true },
  { key: 'cpg',         label: 'C/G',   title: 'Contributions per Game',  derived: true },
  { key: 'cleanSheets', label: 'CS',    title: 'Clean Sheets' },
  { key: 'cspg',        label: 'CS/G',  title: 'Clean Sheets per Game',   derived: true },
  { key: 'rating',      label: 'Rtg',   title: 'Average Rating' },
]

// ─── Season stat aggregation ──────────────────────────────────────────────────
// Sums the selected seasons from player.seasonStats (embedded array).
// Returns a flat stats object with the same shape as the career-total fields,
// so getStatValue can work identically against it.
//
// player.seasonStats items have: label, apps, goals, assists, cleanSheets
// Rate fields (gPerGame etc.) are NOT summed — they are recomputed from totals.
// averageRating is not summed (no meaningful aggregate across seasons).

function sumSeasonStats(player, selectedSeasons) {
  if (!selectedSeasons || selectedSeasons.length === 0) return null

  const rows = (player.seasonStats || []).filter(s => selectedSeasons.includes(s.label))
  if (rows.length === 0) return null   // player has no data in selected seasons

  let apps        = 0
  let goals       = 0
  let assists     = 0
  let cleanSheets = null   // stays null unless at least one row has a value

  for (const row of rows) {
    apps        += row.apps        || 0
    goals       += row.goals       || 0
    assists     += row.assists     || 0
    if (row.cleanSheets != null) {
      cleanSheets = (cleanSheets || 0) + row.cleanSheets
    }
  }

  return { apps, goals, assists, cleanSheets, _filtered: true }
}

// ─── Stat value resolver ──────────────────────────────────────────────────────
// Accepts either a player doc (career totals) or a summed stats object.
// The source object has the same field names in both cases.

function getStatValue(source, key) {
  const apps = source.apps || 0
  switch (key) {
    case 'apps':        return apps
    case 'goals':       return source.goals || 0
    case 'assists':     return source.assists || 0
    case 'contrib':     return (source.goals || 0) + (source.assists || 0)
    case 'gpg':         return apps > 0 ? (source.goals   || 0) / apps : null
    case 'apg':         return apps > 0 ? (source.assists || 0) / apps : null
    case 'cpg':         return apps > 0 ? ((source.goals || 0) + (source.assists || 0)) / apps : null
    case 'cleanSheets': return source.cleanSheets != null ? source.cleanSheets : null
    case 'cspg':        return apps > 0 && source.cleanSheets != null ? source.cleanSheets / apps : null
    case 'rating':      return source.averageRating != null ? source.averageRating : null
    default:            return null
  }
}

function fmtStat(val, key) {
  if (val === null || val === undefined) return '—'
  if (key === 'gpg' || key === 'apg' || key === 'cpg' || key === 'cspg') return val.toFixed(2)
  if (key === 'rating') return typeof val === 'number' ? val.toFixed(1) : '—'
  return val
}

// ─── Season label helpers ─────────────────────────────────────────────────────

function seasonNum(label) {
  return parseInt((label || '').replace(/\D/g, ''), 10) || 0
}

// Derive the sorted union of all season labels present in the loaded squad.
// Newest-first (S7, S6, … S1).
function deriveSeasonOptions(players) {
  const labels = new Set()
  for (const p of players) {
    for (const ss of p.seasonStats || []) {
      if (ss.label) labels.add(ss.label)
    }
  }
  return [...labels].sort((a, b) => seasonNum(b) - seasonNum(a))
}

// ─── Position sort for default ordering ───────────────────────────────────────

function posSort(player) {
  const positions = splitPositions(player.position)
  if (positions.length === 0) return 99
  const idx = positions.map(p => {
    const i = POS_ORDER.indexOf(p)
    return i === -1 ? 99 : i
  })
  return Math.min(...idx)
}

// ─── sessionStorage helpers ───────────────────────────────────────────────────

const SS_KEY = 'players_list_state'

function loadState() {
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(state) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify(state)) } catch {}
}

// ─── Silhouette + image components ───────────────────────────────────────────

function Silhouette({ size = 36 }) {
  return (
    <div className={styles.silhouette} style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <circle cx="22" cy="15" r="7" fill="currentColor" opacity="0.35"/>
        <path d="M6 40c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="currentColor" opacity="0.25"/>
      </svg>
    </div>
  )
}

function SofifaImg({ sofifaId, name, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette size={size} />
  return (
    <img
      src={`https://fifa-img.michaelmenda92.workers.dev/${sofifaId}`}
      alt={name}
      className={styles.playerImg}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Players() {
  const { activeClub } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // Restore state from sessionStorage on mount
  const saved = loadState()

  const [players,      setPlayers]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statusFilter, setStatusFilter] = useState(saved?.statusFilter ?? 'All')
  const [posFilter,    setPosFilter]    = useState(saved?.posFilter    ?? 'All')
  const [search,       setSearch]       = useState(saved?.search       ?? '')
  const [sortKey,      setSortKey]      = useState(saved?.sortKey      ?? 'pos')
  const [sortDir,      setSortDir]      = useState(saved?.sortDir      ?? 'desc')

  // Season filter: Set of selected season labels (e.g. new Set(['S2','S3']))
  // Stored as an array in sessionStorage (Sets aren't JSON-serialisable).
  const [seasonFilter, setSeasonFilter] = useState(
    () => new Set(saved?.seasonFilter ?? [])
  )

  const scrollRef = useRef(null)

  // ── Compare mode state ────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])

  // Persist state whenever filters change
  useEffect(() => {
    saveState({
      statusFilter, posFilter, search, sortKey, sortDir,
      seasonFilter: [...seasonFilter],
    })
  }, [statusFilter, posFilter, search, sortKey, sortDir, seasonFilter])

  // Restore scroll position after players load
  useEffect(() => {
    if (!loading && saved?.scrollY && scrollRef.current) {
      scrollRef.current.scrollTop = saved.scrollY
    }
  }, [loading]) // eslint-disable-line

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    getPlayers(activeClub.id).then(p => { setPlayers(p); setLoading(false) })
  }, [activeClub])

  // ── Season filter toggle ──────────────────────────────────────────────────
  function toggleSeason(label) {
    setSeasonFilter(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  function clearSeasonFilter() {
    setSeasonFilter(new Set())
  }

  // ── Compare mode handlers ─────────────────────────────────────────────────

  function toggleCompareMode() {
    setCompareMode(m => !m)
    setSelectedIds([])
  }

  function handleSelectPlayer(playerId) {
    setSelectedIds(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId)
      if (prev.length >= 2) return prev
      return [...prev, playerId]
    })
  }

  function handleCompareGo() {
    if (selectedIds.length !== 2) return
    navigate(`/players/compare?a=${selectedIds[0]}&b=${selectedIds[1]}`)
  }

  // Save scroll position when navigating away
  const handleRowClick = useCallback((playerId) => {
    if (compareMode) {
      handleSelectPlayer(playerId)
      return
    }
    if (scrollRef.current) {
      saveState({
        statusFilter, posFilter, search, sortKey, sortDir,
        seasonFilter: [...seasonFilter],
        scrollY: scrollRef.current.scrollTop,
      })
    }
    navigate(`/players/${playerId}`)
  }, [compareMode, navigate, statusFilter, posFilter, search, sortKey, sortDir, seasonFilter, selectedIds])

  // ── Sort handler ──────────────────────────────────────────────────────────
  function handleSort(key) {
    if (compareMode) return
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // ── Season filter active? ─────────────────────────────────────────────────
  const selectedSeasons     = [...seasonFilter]
  const seasonFilterActive  = selectedSeasons.length > 0

  // ── Per-player filtered stats ─────────────────────────────────────────────
  // Build a Map<playerId, statsSource> so the render loop can look up
  // the right source (career totals or summed seasons) in O(1).
  //
  // When seasonFilterActive:
  //   statsSource = sumSeasonStats result (may be null if player has no data
  //   in selected seasons — those players are excluded from the visible list)
  // When not active:
  //   statsSource = the player doc itself (career totals)

  const statsMap = new Map()
  for (const p of players) {
    if (seasonFilterActive) {
      const summed = sumSeasonStats(p, selectedSeasons)
      statsMap.set(p.id, summed)  // null means player had no seasons matched
    } else {
      statsMap.set(p.id, p)
    }
  }

  // ── Season visibility: player appeared in any selected season ─────────────
  function playerInSelectedSeasons(player) {
    if (!seasonFilterActive) return true
    return statsMap.get(player.id) !== null
  }

  // ── Derived/filtered/sorted list ──────────────────────────────────────────
  const filtered = players
    .filter(p => !p.isHistoricalStub)  // hide transfer-only historical stubs (still linkable from Transfers)
    .filter(p => statusFilter === 'All' || p.status === statusFilter)
    .filter(p => playerMatchesFilter(p, posFilter))
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => playerInSelectedSeasons(p))
    .sort((a, b) => {
      if (sortKey === 'pos') {
        return posSort(a) - posSort(b)
      }
      const srcA = statsMap.get(a.id) ?? a
      const srcB = statsMap.get(b.id) ?? b
      const av = getStatValue(srcA, sortKey) ?? -Infinity
      const bv = getStatValue(srcB, sortKey) ?? -Infinity
      return sortDir === 'desc' ? bv - av : av - bv
    })

  const counts = {
    All:    players.length,
    Active: players.filter(p => p.status === 'Active').length,
    Sold:   players.filter(p => p.status === 'Sold').length,
  }

  // ── Season options derived from squad data ────────────────────────────────
  const seasonOptions = deriveSeasonOptions(players)

  // ── Position filter pills ─────────────────────────────────────────────────
  const presentPositions = new Set(players.flatMap(p => splitPositions(p.position)))
  const posFilterOptions = [
    { key: 'All', label: 'All' },
    ...Object.keys(ROLE_GROUPS)
      .filter(g => ROLE_GROUPS[g].some(p => presentPositions.has(p)))
      .map(g => ({ key: g, label: g })),
    ...INDIVIDUAL_POS
      .filter(p => presentPositions.has(p))
      .map(p => ({ key: p, label: p })),
  ]

  // ── Selected player names for CTA bar ─────────────────────────────────────
  const selectedPlayers = selectedIds.map(id => players.find(p => p.id === id)).filter(Boolean)

  // ── Scope label shown when season filter is active ────────────────────────
  // e.g. "S7" or "S2 + S3 + S4"
  const scopeLabel = seasonFilterActive
    ? [...seasonFilter]
        .sort((a, b) => seasonNum(b) - seasonNum(a))
        .join(' + ')
    : null

  // ─────────────────────────────────────────────────────────────────────────
  // Sticky offset calculation for filter bars.
  // topBar ≈ 45px. compareHint replaces filterBar (same height ≈ 35px).
  // seasonBar is always visible: ≈ 37px.
  // posBar sits below seasonBar.
  //
  // When normal mode:
  //   filterBar top  = 56 + 45 = 101
  //   seasonBar top  = 56 + 45 + 35 = 136
  //   posBar top     = 56 + 45 + 35 + 37 = 173
  //
  // When compare mode (no filterBar, compareHint instead):
  //   compareHint top = 56 + 45 = 101
  //   seasonBar top   = 56 + 45 + 35 = 136
  //   posBar top      = 56 + 45 + 35 + 37 = 173  (same)
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <div className={styles.topTitle}>
          <span className={styles.topLabel}>Squad</span>
          <span className={styles.topCount}>{players.length} players</span>
        </div>
        <div className={styles.searchWrap}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className={styles.searchIcon}>
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.search}
            placeholder="Search player…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* Compare toggle */}
        <button
          className={`${styles.compareBtn} ${compareMode ? styles.compareBtnActive : ''}`}
          onClick={toggleCompareMode}
        >
          {compareMode ? 'Cancel' : 'Compare'}
        </button>
      </div>

      {/* ── COMPARE MODE HINT / STATUS FILTER ── */}
      {compareMode ? (
        <div className={styles.compareHint}>
          {selectedIds.length === 0 && 'Select two players to compare'}
          {selectedIds.length === 1 && 'Select one more player'}
          {selectedIds.length === 2 && 'Ready to compare'}
        </div>
      ) : (
        <div className={styles.filterBar}>
          {['All', 'Active', 'Sold'].map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${statusFilter === f ? styles.filterActive : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f} <span className={styles.filterCount}>{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── SEASON FILTER ── */}
      {seasonOptions.length > 0 && (
        <div className={styles.seasonBar}>
          <span className={styles.seasonBarLabel}>Season</span>
          {seasonOptions.map(label => (
            <button
              key={label}
              className={`${styles.seasonBtn} ${seasonFilter.has(label) ? styles.seasonActive : ''}`}
              onClick={() => toggleSeason(label)}
            >
              {label}
            </button>
          ))}
          {seasonFilterActive && (
            <button className={styles.seasonClear} onClick={clearSeasonFilter} title="Clear season filter">
              ✕
            </button>
          )}
        </div>
      )}

      {/* ── SCOPE LABEL (shown when season filter active) ── */}
      {seasonFilterActive && (
        <div className={styles.scopeBar}>
          <span className={styles.scopeLabel}>
            Showing stats for {scopeLabel}
          </span>
          <span className={styles.scopeCount}>
            {filtered.length} player{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── POSITION FILTER ── */}
      <div className={styles.posBar}>
        {posFilterOptions.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.posBtn} ${posFilter === key ? styles.posActive : ''} ${ROLE_GROUPS[key] ? styles.posGroup : ''}`}
            onClick={() => setPosFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TABLE ── */}
      <div className={styles.tableWrap} ref={scrollRef}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>👤</span>
            <p className={styles.emptyText}>No players found</p>
            <p className={styles.emptyHint}>
              {seasonFilterActive
                ? `No players appeared in ${scopeLabel}`
                : search
                  ? 'Try a different name'
                  : 'Import via CSV or add players manually'}
            </p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {/* Frozen identity header */}
                  <th className={`${styles.th} ${styles.thIdentity}`}>
                    <button
                      className={`${styles.sortHeader} ${sortKey === 'pos' ? styles.sortActive : ''}`}
                      onClick={() => handleSort('pos')}
                      title="Sort by position"
                    >
                      Player
                      {sortKey === 'pos' && !compareMode && (
                        <span className={styles.sortArrow}>{sortDir === 'desc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  </th>
                  {/* Scrollable stat headers */}
                  {STAT_COLS.map(col => (
                    <th key={col.key} className={`${styles.th} ${styles.thStat}`}>
                      <button
                        className={`${styles.sortHeader} ${sortKey === col.key && !compareMode ? styles.sortActive : ''}`}
                        onClick={() => handleSort(col.key)}
                        title={`Sort by ${col.title}`}
                      >
                        {col.label}
                        {sortKey === col.key && !compareMode && (
                          <span className={styles.sortArrow}>{sortDir === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(player => {
                  const isSelected  = selectedIds.includes(player.id)
                  const isDisabled  = compareMode && selectedIds.length === 2 && !isSelected
                  // Use filtered stats if season filter is active, otherwise career totals
                  const statsSource = statsMap.get(player.id) ?? player
                  return (
                    <tr
                      key={player.id}
                      className={`${styles.tr} ${isSelected ? styles.trSelected : ''} ${isDisabled ? styles.trDisabled : ''}`}
                      onClick={() => handleRowClick(player.id)}
                    >
                      {/* Frozen identity cell */}
                      <td className={`${styles.td} ${styles.tdIdentity}`}>
                        <div className={styles.identity}>
                          {compareMode && (
                            <div className={`${styles.selectRing} ${isSelected ? styles.selectRingActive : ''}`}>
                              {isSelected && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          )}
                          <div className={styles.thumb}>
                            <SofifaImg sofifaId={player.sofifaId} name={player.name} size={32} />
                          </div>
                          <div className={styles.identityInfo}>
                            <span className={styles.playerName}>{player.name}</span>
                            <span className={styles.playerPos}>{player.position || '—'}</span>
                          </div>
                        </div>
                      </td>
                      {/* Stat cells — sourced from statsSource */}
                      {STAT_COLS.map(col => {
                        const raw     = getStatValue(statsSource, col.key)
                        const display = fmtStat(raw, col.key)
                        const isActive = sortKey === col.key && !compareMode
                        return (
                          <td
                            key={col.key}
                            className={`${styles.td} ${styles.tdStat} ${isActive ? styles.tdSortActive : ''}`}
                          >
                            {display}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── COMPARE CTA BAR ── */}
      {compareMode && selectedIds.length === 2 && (
        <div className={styles.compareCta}>
          <div className={styles.compareCtaPlayers}>
            {selectedPlayers.map((p, i) => (
              <span key={p.id} className={styles.compareCtaName}>
                {i > 0 && <span className={styles.compareCtaVs}>vs</span>}
                {p.name.split(' ').pop()}
              </span>
            ))}
          </div>
          <button className={styles.compareCtaBtn} onClick={handleCompareGo}>
            Compare →
          </button>
        </div>
      )}

    </div>
  )
}
