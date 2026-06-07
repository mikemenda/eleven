import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayer, getPlayers, getSeasons, getSeasonStatsByPlayer } from '../firebase/services'
import styles from './PlayerCompare.module.css'

// ─── Image helpers ────────────────────────────────────────────────────────────

function Silhouette({ size = 56 }) {
  return (
    <div className={styles.silhouette} style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <circle cx="40" cy="26" r="14" fill="currentColor" opacity="0.35"/>
        <path d="M8 76c0-17.673 14.327-32 32-32s32 14.327 32 32" fill="currentColor" opacity="0.25"/>
      </svg>
    </div>
  )
}

function SofifaImg({ sofifaId, name, size = 56 }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette size={size} />
  return (
    <img
      src={`https://fifa-img.michaelmenda92.workers.dev/${sofifaId}`}
      alt={name}
      className={styles.heroImg}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtRate(val) {
  if (val === null || val === undefined) return '—'
  return typeof val === 'number' ? val.toFixed(2) : '—'
}

function isGK(player) {
  return player?.position === 'GK'
}

// ─── Label join ───────────────────────────────────────────────────────────────

function attachLabels(statDocs, seasonMap) {
  return statDocs.map(d => ({
    ...d,
    label: seasonMap.get(d.seasonId) ?? d.seasonId ?? '—',
  }))
}

function sortNewestFirst(docs) {
  return [...docs].sort((a, b) => {
    const na = parseInt((a.label || '').replace(/\D/g, ''), 10) || 0
    const nb = parseInt((b.label || '').replace(/\D/g, ''), 10) || 0
    return nb - na
  })
}

// ─── Totals row definitions ───────────────────────────────────────────────────
// pA/pB may be null — rows are defined against real players only for GK detection.
// When one is null we fall back to outfield defaults.

function allCompsRows(pA, pB) {
  const bothGK   = isGK(pA) && isGK(pB)
  const eitherGK = isGK(pA) || isGK(pB)

  return [
    { key: 'apps',    label: 'Apps',         getValue: p => p?.apps    || 0 },
    { key: 'goals',   label: 'Goals',        getValue: p => p?.goals   || 0,                                                   hideIf: bothGK },
    { key: 'assists', label: 'Assists',      getValue: p => p?.assists || 0,                                                   hideIf: bothGK },
    { key: 'contrib', label: 'G+A',          getValue: p => (p?.goals || 0) + (p?.assists || 0),                              hideIf: bothGK },
    { key: 'gpg',     label: 'G/G',          getValue: p => p && p.apps > 0 ? (p.goals   || 0) / p.apps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'apg',     label: 'A/G',          getValue: p => p && p.apps > 0 ? (p.assists || 0) / p.apps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'cpg',     label: 'C/G',          getValue: p => p && p.apps > 0 ? ((p.goals || 0) + (p.assists || 0)) / p.apps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'cs',      label: 'Clean Sheets', getValue: p => p?.cleanSheets ?? null,                                            hideIf: !eitherGK },
    { key: 'cspg',    label: 'CS/G',         getValue: p => p && p.apps > 0 && p.cleanSheets != null ? p.cleanSheets / p.apps : null, fmt: fmtRate, hideIf: !eitherGK },
  ].filter(r => !r.hideIf)
}

function uclTotalsRows(pA, pB) {
  const bothGK   = isGK(pA) && isGK(pB)
  const eitherGK = isGK(pA) || isGK(pB)

  return [
    { key: 'uclApps',    label: 'Apps',         getValue: p => p?.uclApps    || 0 },
    { key: 'uclGoals',   label: 'Goals',        getValue: p => p?.uclGoals   || 0,                                            hideIf: bothGK },
    { key: 'uclAssists', label: 'Assists',      getValue: p => p?.uclAssists || 0,                                            hideIf: bothGK },
    { key: 'uclContrib', label: 'G+A',          getValue: p => (p?.uclGoals || 0) + (p?.uclAssists || 0),                    hideIf: bothGK },
    { key: 'uclGpg',     label: 'G/G',          getValue: p => p && (p.uclApps || 0) > 0 ? (p.uclGoals   || 0) / p.uclApps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'uclApg',     label: 'A/G',          getValue: p => p && (p.uclApps || 0) > 0 ? (p.uclAssists || 0) / p.uclApps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'uclCpg',     label: 'C/G',          getValue: p => p && (p.uclApps || 0) > 0 ? ((p.uclGoals || 0) + (p.uclAssists || 0)) / p.uclApps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'uclCs',      label: 'Clean Sheets', getValue: p => p?.uclCleanSheets ?? null,                                     hideIf: !eitherGK },
    { key: 'uclCspg',    label: 'CS/G',         getValue: p => p && (p.uclApps || 0) > 0 && p.uclCleanSheets != null ? p.uclCleanSheets / p.uclApps : null, fmt: fmtRate, hideIf: !eitherGK },
  ].filter(r => !r.hideIf)
}

// ─── Winner logic ─────────────────────────────────────────────────────────────
// Only highlight winners when both players are present.

function winner(rawA, rawB, bothPresent) {
  if (!bothPresent) return 'none'
  if (rawA === null && rawB === null) return 'none'
  const a = rawA ?? -Infinity
  const b = rawB ?? -Infinity
  if (a > b) return 'a'
  if (b > a) return 'b'
  return 'equal'
}

function displayVal(raw, fmtFn) {
  if (raw === null || raw === undefined) return '—'
  if (fmtFn) return fmtFn(raw)
  return raw
}

// ─── Season table helpers ─────────────────────────────────────────────────────

// Fixed compact columns per spec: Apps · C/G · G/G · A/G
// GK gets Apps + CS/G; G/G and A/G will return — naturally from missing data.
const SEASON_COLS = [
  { key: 'apps',     label: 'Apps', fmt: null },
  { key: 'cPerGame', label: 'C/G',  fmt: fmtRate },
  { key: 'gPerGame', label: 'G/G',  fmt: fmtRate },
  { key: 'aPerGame', label: 'A/G',  fmt: fmtRate },
]

// UCL season table uses same shape — keys match UCL seasonStats docs
// which use the same field names (gPerGame, aPerGame, cPerGame, apps) as All Comps docs.
const UCL_SEASON_COLS = SEASON_COLS

function buildSeasonUnion(statsA, statsB) {
  const allLabels = [...new Set([
    ...statsA.map(s => s.label),
    ...statsB.map(s => s.label),
  ])].sort((a, b) => {
    const na = parseInt((a || '').replace(/\D/g, ''), 10) || 0
    const nb = parseInt((b || '').replace(/\D/g, ''), 10) || 0
    return nb - na
  })
  const mapA = Object.fromEntries(statsA.map(s => [s.label, s]))
  const mapB = Object.fromEntries(statsB.map(s => [s.label, s]))
  return allLabels.map(label => ({ label, a: mapA[label] || null, b: mapB[label] || null }))
}

function seasonCellVal(doc, key) {
  if (!doc) return null
  if (['gPerGame','aPerGame','cPerGame','csPerGame'].includes(key)) return doc[key] ?? null
  return doc[key] ?? null
}

// ─── Player picker sheet ──────────────────────────────────────────────────────

function PlayerPicker({ players, onSelect, onClose, excludeId }) {
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    // Small delay so the sheet animation completes before focusing
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  const filtered = players
    .filter(p => p.id !== excludeId)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      {/* Backdrop */}
      <div className={styles.pickerBackdrop} onClick={onClose} />

      {/* Sheet */}
      <div className={styles.pickerSheet}>
        <div className={styles.pickerHeader}>
          <span className={styles.pickerTitle}>Select Player</span>
          <button className={styles.pickerClose} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className={styles.pickerSearchWrap}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className={styles.pickerSearchIcon}>
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            className={styles.pickerSearch}
            placeholder="Search player…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.pickerList}>
          {filtered.length === 0 ? (
            <p className={styles.pickerEmpty}>No players found</p>
          ) : (
            filtered.map(p => (
              <button key={p.id} className={styles.pickerRow} onClick={() => onSelect(p.id)}>
                <SofifaImg sofifaId={p.sofifaId} name={p.name} size={32} />
                <div className={styles.pickerRowInfo}>
                  <span className={styles.pickerRowName}>{p.name}</span>
                  <span className={styles.pickerRowMeta}>{p.position}{p.nationality ? ` · ${p.nationality}` : ''}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ─── Hero slot ────────────────────────────────────────────────────────────────
// Handles both populated and empty states.

function HeroSlot({ player, side, onClear, onSelect }) {
  if (player) {
    return (
      <div className={`${styles.heroCol} ${side === 'b' ? styles.heroColRight : ''}`}>
        <div className={styles.heroImgWrap}>
          <SofifaImg sofifaId={player.sofifaId} name={player.name} size={56} />
        </div>
        <div className={styles.heroDetails}>
          <p className={styles.heroName}>{player.name}</p>
          <p className={styles.heroMeta}>
            {player.position}
            {player.nationality ? ` · ${player.nationality}` : ''}
          </p>
        </div>
        <button className={styles.heroClearBtn} onClick={onClear} title="Remove player">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <button
      className={`${styles.heroCol} ${styles.heroColEmpty} ${side === 'b' ? styles.heroColRight : ''}`}
      onClick={onSelect}
    >
      <div className={styles.heroEmptyIcon}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M12 14v6M9 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <span className={styles.heroEmptyLabel}>Select player</span>
    </button>
  )
}

// ─── Totals section ───────────────────────────────────────────────────────────

function TotalsSection({ rows, playerA, playerB }) {
  const bothPresent = !!playerA && !!playerB
  return (
    <div className={styles.totalsBlock}>
      {rows.map(row => {
        const rawA = playerA ? row.getValue(playerA) : null
        const rawB = playerB ? row.getValue(playerB) : null
        const w = winner(rawA, rawB, bothPresent)
        return (
          <div key={row.key} className={styles.statRow}>
            <span className={`${styles.statVal} ${styles.statValLeft} ${w === 'a' ? styles.statWin : w === 'equal' ? styles.statEqual : w === 'none' && playerA ? styles.statNeutral : styles.statLose}`}>
              {playerA ? displayVal(rawA, row.fmt) : '—'}
            </span>
            <span className={styles.statLabel}>{row.label}</span>
            <span className={`${styles.statVal} ${styles.statValRight} ${w === 'b' ? styles.statWin : w === 'equal' ? styles.statEqual : w === 'none' && playerB ? styles.statNeutral : styles.statLose}`}>
              {playerB ? displayVal(rawB, row.fmt) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Season comparison table ──────────────────────────────────────────────────
// Only rendered when both players are present.

function SeasonCompTable({ rows, cols }) {
  if (!rows.length) return null
  return (
    <div className={styles.seasonTableWrap}>
      <table className={styles.seasonTable}>
        <thead>
          <tr>
            <th className={styles.sthSeason}>Season</th>
            {cols.map(c => <th key={`a-${c.key}`} className={styles.sth}>{c.label}</th>)}
            <th className={styles.sthDivider} />
            {cols.map(c => <th key={`b-${c.key}`} className={styles.sth}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, a, b }) => (
            <tr key={label} className={styles.str}>
              <td className={styles.stdSeason}>{label}</td>
              {cols.map(c => {
                const rawA = seasonCellVal(a, c.key)
                const rawB = seasonCellVal(b, c.key)
                const w = winner(rawA, rawB, true)
                return (
                  <td key={`a-${c.key}`} className={`${styles.std} ${w === 'a' ? styles.stdWin : ''}`}>
                    {displayVal(rawA, c.fmt)}
                  </td>
                )
              })}
              <td className={styles.stdDivider} />
              {cols.map(c => {
                const rawA = seasonCellVal(a, c.key)
                const rawB = seasonCellVal(b, c.key)
                const w = winner(rawA, rawB, true)
                return (
                  <td key={`b-${c.key}`} className={`${styles.std} ${w === 'b' ? styles.stdWin : ''}`}>
                    {displayVal(rawB, c.fmt)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Data loader hook ─────────────────────────────────────────────────────────
// Loads a single player's stats (all comps embedded + UCL collection).
// Returns { allStats, uclStats } or nulls while loading.

function usePlayerStats(playerId, seasonMap) {
  const [allStats, setAllStats] = useState([])
  const [uclStats, setUclStats] = useState([])

  useEffect(() => {
    if (!playerId || !seasonMap) { setAllStats([]); setUclStats([]); return }
    getPlayer(playerId).then(p => {
      setAllStats(sortNewestFirst(p?.seasonStats || []))
      return getSeasonStatsByPlayer(playerId)
    }).then(docs => {
      const ucl = docs.filter(d => d.scope === 'UCL')
      setUclStats(sortNewestFirst(attachLabels(ucl, seasonMap)))
    }).catch(() => { setAllStats([]); setUclStats([]) })
  }, [playerId, seasonMap])

  return { allStats, uclStats }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerCompare() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeClub } = useApp()
  const navigate = useNavigate()

  const idA = searchParams.get('a') || null
  const idB = searchParams.get('b') || null

  // Core data
  const [playerA,    setPlayerA]    = useState(null)
  const [playerB,    setPlayerB]    = useState(null)
  const [allPlayers, setAllPlayers] = useState([])    // full squad for picker
  const [seasonMap,  setSeasonMap]  = useState(null)  // Map<id → label>
  const [loadingA,   setLoadingA]   = useState(false)
  const [loadingB,   setLoadingB]   = useState(false)
  const [baseLoading,setBaseLoading]= useState(true)

  // Stats — loaded independently per player
  const [allStatsA, setAllStatsA] = useState([])
  const [uclStatsA, setUclStatsA] = useState([])
  const [allStatsB, setAllStatsB] = useState([])
  const [uclStatsB, setUclStatsB] = useState([])

  // UI state
  const [tab,        setTab]        = useState('all')
  const [pickerSide, setPickerSide] = useState(null)   // 'a' | 'b' | null

  // ── Load base data (all players + seasons) on mount ──────────────────────
  useEffect(() => {
    if (!activeClub) return
    Promise.all([
      getPlayers(activeClub.id),
      getSeasons(activeClub.id),
    ]).then(([ps, seasons]) => {
      setAllPlayers(ps)
      setSeasonMap(new Map(seasons.map(s => [s.id, s.label])))
      setBaseLoading(false)
    })
  }, [activeClub])

  // ── Load player A whenever idA changes ───────────────────────────────────
  useEffect(() => {
    if (!idA) { setPlayerA(null); setAllStatsA([]); setUclStatsA([]); return }
    if (!seasonMap) return
    setLoadingA(true)
    Promise.all([
      getPlayer(idA),
      getSeasonStatsByPlayer(idA),
    ]).then(([p, statDocs]) => {
      setPlayerA(p)
      setAllStatsA(sortNewestFirst(p?.seasonStats || []))
      const ucl = statDocs.filter(d => d.scope === 'UCL')
      setUclStatsA(sortNewestFirst(attachLabels(ucl, seasonMap)))
      setLoadingA(false)
    })
  }, [idA, seasonMap])

  // ── Load player B whenever idB changes ───────────────────────────────────
  useEffect(() => {
    if (!idB) { setPlayerB(null); setAllStatsB([]); setUclStatsB([]); return }
    if (!seasonMap) return
    setLoadingB(true)
    Promise.all([
      getPlayer(idB),
      getSeasonStatsByPlayer(idB),
    ]).then(([p, statDocs]) => {
      setPlayerB(p)
      setAllStatsB(sortNewestFirst(p?.seasonStats || []))
      const ucl = statDocs.filter(d => d.scope === 'UCL')
      setUclStatsB(sortNewestFirst(attachLabels(ucl, seasonMap)))
      setLoadingB(false)
    })
  }, [idB, seasonMap])

  // ── URL param helpers ────────────────────────────────────────────────────
  function setSlot(side, id) {
    const params = {}
    const currentA = searchParams.get('a')
    const currentB = searchParams.get('b')
    if (side === 'a') {
      if (id) params.a = id
      if (currentB) params.b = currentB
    } else {
      if (currentA) params.a = currentA
      if (id) params.b = id
    }
    setSearchParams(params, { replace: true })
  }

  function clearSlot(side) {
    setSlot(side, null)
  }

  function handlePickerSelect(id) {
    setSlot(pickerSide, id)
    setPickerSide(null)
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const bothPresent   = !!playerA && !!playerB
  const allRows       = allCompsRows(playerA, playerB)
  const uclRows       = uclTotalsRows(playerA, playerB)
  const allSeasons    = bothPresent ? buildSeasonUnion(allStatsA, allStatsB) : []
  const uclSeasons    = bothPresent ? buildSeasonUnion(uclStatsA, uclStatsB) : []

  const hasUclDataA   = (playerA?.uclApps || 0) > 0 || uclStatsA.length > 0
  const hasUclDataB   = (playerB?.uclApps || 0) > 0 || uclStatsB.length > 0
  const hasAnyUcl     = hasUclDataA || hasUclDataB

  // Column label: last name or position placeholder
  const labelA = playerA ? playerA.name.split(' ').pop() : 'Player A'
  const labelB = playerB ? playerB.name.split(' ').pop() : 'Player B'

  if (baseLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <span className={styles.topLabel}>Comparison</span>
        </div>
        <div className={styles.loadWrap}><div className={styles.spinner} /></div>
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <span className={styles.topLabel}>Comparison</span>
      </div>

      {/* ── HERO ROW ── */}
      <div className={styles.heroRow}>
        <HeroSlot
          player={loadingA ? null : playerA}
          side="a"
          onClear={() => clearSlot('a')}
          onSelect={() => setPickerSide('a')}
        />
        <div className={styles.heroDivider} />
        <HeroSlot
          player={loadingB ? null : playerB}
          side="b"
          onClear={() => clearSlot('b')}
          onSelect={() => setPickerSide('b')}
        />
      </div>

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
          onClick={() => setTab('all')}
        >
          All Comps
        </button>
        <button
          className={`${styles.tab} ${tab === 'ucl' ? styles.tabActive : ''}`}
          onClick={() => setTab('ucl')}
        >
          UCL
        </button>
      </div>

      {/* ── COLUMN LABELS ── */}
      <div className={styles.colLabels}>
        <span className={styles.colLabelA}>{labelA}</span>
        <span className={styles.colLabelCenter} />
        <span className={styles.colLabelB}>{labelB}</span>
      </div>

      {/* ── ALL COMPS TAB ── */}
      {tab === 'all' && (
        <div className={styles.section}>
          <TotalsSection rows={allRows} playerA={playerA} playerB={playerB} />
          {bothPresent && allSeasons.length > 0 && (
            <>
              <div className={styles.sectionDivider}>
                <span className={styles.sectionDividerLabel}>Season by Season</span>
              </div>
              <SeasonCompTable rows={allSeasons} cols={SEASON_COLS} />
            </>
          )}
          {!bothPresent && (playerA || playerB) && (
            <p className={styles.pendingNote}>Select a second player to see season-by-season comparison.</p>
          )}
        </div>
      )}

      {/* ── UCL TAB ── */}
      {tab === 'ucl' && (
        <div className={styles.section}>
          {!playerA && !playerB ? (
            <p className={styles.noData}>Select players to compare UCL stats.</p>
          ) : !hasAnyUcl ? (
            <p className={styles.noData}>
              {bothPresent ? 'Neither player has UCL data recorded.' : 'This player has no UCL appearances recorded.'}
            </p>
          ) : (
            <>
              {bothPresent && (!hasUclDataA || !hasUclDataB) && (
                <p className={styles.uclNote}>
                  {!hasUclDataA ? playerA.name : playerB.name} has no UCL appearances recorded.
                </p>
              )}
              <TotalsSection rows={uclRows} playerA={playerA} playerB={playerB} />
              {bothPresent && uclSeasons.length > 0 && (
                <>
                  <div className={styles.sectionDivider}>
                    <span className={styles.sectionDividerLabel}>Season by Season</span>
                  </div>
                  <SeasonCompTable rows={uclSeasons} cols={UCL_SEASON_COLS} />
                </>
              )}
              {!bothPresent && (
                <p className={styles.pendingNote}>Select a second player to see season-by-season comparison.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PLAYER PICKER SHEET ── */}
      {pickerSide && (
        <PlayerPicker
          players={allPlayers}
          onSelect={handlePickerSelect}
          onClose={() => setPickerSide(null)}
          excludeId={pickerSide === 'a' ? idB : idA}
        />
      )}

    </div>
  )
}
