import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayer, getSeasons, getSeasonStatsByPlayer } from '../firebase/services'
import styles from './PlayerCompare.module.css'

// ─── Image helpers (mirrors PlayerProfile) ────────────────────────────────────

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

function fmtOpt(val, dp = 1) {
  if (val === null || val === undefined) return '—'
  return typeof val === 'number' ? val.toFixed(dp) : val
}

function isGK(player) {
  return player?.position === 'GK'
}

// ─── Label join (same pattern as PlayerProfile) ───────────────────────────────

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

// ─── Stat row definitions ─────────────────────────────────────────────────────
// Returns rows describing what to compare. Each row: { key, label, getValue(player) }

function allCompsRows(pA, pB) {
  const eitherGK = isGK(pA) || isGK(pB)
  const bothGK   = isGK(pA) && isGK(pB)

  const base = [
    { key: 'apps',    label: 'Apps',    getValue: p => p.apps    || 0 },
    { key: 'goals',   label: 'Goals',   getValue: p => p.goals   || 0, hideIf: bothGK },
    { key: 'assists', label: 'Assists', getValue: p => p.assists || 0, hideIf: bothGK },
    { key: 'contrib', label: 'G+A',     getValue: p => (p.goals || 0) + (p.assists || 0), hideIf: bothGK },
    { key: 'gpg',     label: 'G/G',     getValue: p => p.apps > 0 ? (p.goals   || 0) / p.apps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'apg',     label: 'A/G',     getValue: p => p.apps > 0 ? (p.assists || 0) / p.apps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'cpg',     label: 'C/G',     getValue: p => p.apps > 0 ? ((p.goals || 0) + (p.assists || 0)) / p.apps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'cs',      label: 'Clean Sheets', getValue: p => p.cleanSheets ?? null, hideIf: !eitherGK },
    { key: 'cspg',    label: 'CS/G',    getValue: p => p.apps > 0 && p.cleanSheets != null ? p.cleanSheets / p.apps : null, fmt: fmtRate, hideIf: !eitherGK },
  ]

  return base.filter(r => !r.hideIf)
}

function uclTotalsRows(pA, pB) {
  const eitherGK = isGK(pA) || isGK(pB)
  const bothGK   = isGK(pA) && isGK(pB)

  return [
    { key: 'uclApps',    label: 'Apps',    getValue: p => p.uclApps    || 0 },
    { key: 'uclGoals',   label: 'Goals',   getValue: p => p.uclGoals   || 0, hideIf: bothGK },
    { key: 'uclAssists', label: 'Assists', getValue: p => p.uclAssists || 0, hideIf: bothGK },
    { key: 'uclContrib', label: 'G+A',     getValue: p => (p.uclGoals || 0) + (p.uclAssists || 0), hideIf: bothGK },
    { key: 'uclGpg',     label: 'G/G',     getValue: p => (p.uclApps || 0) > 0 ? (p.uclGoals   || 0) / p.uclApps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'uclApg',     label: 'A/G',     getValue: p => (p.uclApps || 0) > 0 ? (p.uclAssists || 0) / p.uclApps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'uclCpg',     label: 'C/G',     getValue: p => (p.uclApps || 0) > 0 ? ((p.uclGoals || 0) + (p.uclAssists || 0)) / p.uclApps : null, fmt: fmtRate, hideIf: bothGK },
    { key: 'uclCs',      label: 'Clean Sheets', getValue: p => p.uclCleanSheets ?? null, hideIf: !eitherGK },
    { key: 'uclCspg',    label: 'CS/G',    getValue: p => (p.uclApps || 0) > 0 && p.uclCleanSheets != null ? p.uclCleanSheets / p.uclApps : null, fmt: fmtRate, hideIf: !eitherGK },
  ].filter(r => !r.hideIf)
}

// ─── Value comparison helpers ─────────────────────────────────────────────────

// Returns 'a' | 'b' | 'equal' | 'none' (if both null/0 in a non-meaningful way)
function winner(rawA, rawB) {
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

// ─── Season table union builder ───────────────────────────────────────────────

function buildSeasonUnion(statsA, statsB) {
  // Collect all labels from both players, deduplicate, sort newest-first
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

// ─── Season cell value resolver (matches PlayerProfile cellVal logic) ─────────

function seasonCellVal(doc, key) {
  if (!doc) return null
  if (key === '_contrib') return (doc.goals || 0) + (doc.assists || 0)
  if (['gPerGame','aPerGame','cPerGame','csPerGame'].includes(key)) {
    return doc[key] ?? null
  }
  return doc[key] ?? null
}

// ─── Compact season stat columns for comparison ───────────────────────────────

function seasonCompCols(pA, pB) {
  const eitherGK = isGK(pA) || isGK(pB)
  const bothGK   = isGK(pA) && isGK(pB)

  if (bothGK) {
    return [
      { key: 'apps',        label: 'Apps', fmt: null },
      { key: 'cleanSheets', label: 'CS',   fmt: null },
      { key: 'csPerGame',   label: 'CS/G', fmt: fmtRate },
    ]
  }
  if (eitherGK) {
    // mixed: show outfield cols only, GK gets — for goal cols naturally
    return [
      { key: 'apps',     label: 'Apps', fmt: null },
      { key: 'goals',    label: 'G',    fmt: null },
      { key: 'assists',  label: 'A',    fmt: null },
      { key: '_contrib', label: 'G+A',  fmt: null },
    ]
  }
  return [
    { key: 'apps',     label: 'Apps', fmt: null },
    { key: 'goals',    label: 'G',    fmt: null },
    { key: 'assists',  label: 'A',    fmt: null },
    { key: '_contrib', label: 'G+A',  fmt: null },
    { key: 'gPerGame', label: 'G/G',  fmt: fmtRate },
  ]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerHero({ player, side }) {
  return (
    <div className={`${styles.heroCol} ${side === 'b' ? styles.heroColRight : ''}`}>
      <SofifaImg sofifaId={player.sofifaId} name={player.name} size={56} />
      <div className={styles.heroDetails}>
        <p className={styles.heroName}>{player.name}</p>
        <p className={styles.heroMeta}>
          {player.position}
          {player.nationality ? ` · ${player.nationality}` : ''}
        </p>
      </div>
    </div>
  )
}

function TotalsSection({ rows, playerA, playerB }) {
  return (
    <div className={styles.totalsBlock}>
      {rows.map(row => {
        const rawA = row.getValue(playerA)
        const rawB = row.getValue(playerB)
        const w = winner(rawA, rawB)
        return (
          <div key={row.key} className={styles.statRow}>
            <span className={`${styles.statVal} ${styles.statValLeft} ${w === 'a' ? styles.statWin : w === 'equal' ? styles.statEqual : styles.statLose}`}>
              {displayVal(rawA, row.fmt)}
            </span>
            <span className={styles.statLabel}>{row.label}</span>
            <span className={`${styles.statVal} ${styles.statValRight} ${w === 'b' ? styles.statWin : w === 'equal' ? styles.statEqual : styles.statLose}`}>
              {displayVal(rawB, row.fmt)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

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
                const w = winner(rawA, rawB)
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
                const w = winner(rawA, rawB)
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerCompare() {
  const [searchParams] = useSearchParams()
  const { activeClub } = useApp()
  const navigate = useNavigate()

  const idA = searchParams.get('a')
  const idB = searchParams.get('b')

  const [playerA, setPlayerA] = useState(null)
  const [playerB, setPlayerB] = useState(null)
  const [allStatsA, setAllStatsA] = useState([])  // embedded seasonStats from player doc
  const [allStatsB, setAllStatsB] = useState([])
  const [uclStatsA, setUclStatsA] = useState([])  // from seasonStats collection, UCL scope
  const [uclStatsB, setUclStatsB] = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('all')

  useEffect(() => {
    if (!idA || !idB || !activeClub) return
    setLoading(true)

    // Batch 1: both player docs + seasons
    Promise.all([
      getPlayer(idA),
      getPlayer(idB),
      getSeasons(activeClub.id),
    ]).then(([pA, pB, seasons]) => {
      setPlayerA(pA)
      setPlayerB(pB)

      // All Comps: embedded arrays (same source as PlayerProfile)
      setAllStatsA(sortNewestFirst(pA?.seasonStats || []))
      setAllStatsB(sortNewestFirst(pB?.seasonStats || []))

      // Batch 2: UCL seasonStats from collection
      const seasonMap = new Map(seasons.map(s => [s.id, s.label]))
      return Promise.all([
        getSeasonStatsByPlayer(idA),
        getSeasonStatsByPlayer(idB),
      ]).then(([docsA, docsB]) => {
        const uclA = docsA.filter(d => d.scope === 'UCL')
        const uclB = docsB.filter(d => d.scope === 'UCL')
        setUclStatsA(sortNewestFirst(attachLabels(uclA, seasonMap)))
        setUclStatsB(sortNewestFirst(attachLabels(uclB, seasonMap)))
        setLoading(false)
      })
    })
  }, [idA, idB, activeClub])

  if (!idA || !idB) {
    return (
      <div className={styles.page}>
        <div className={styles.loadWrap}>
          <p className={styles.notFound}>Invalid comparison — two player IDs required.</p>
        </div>
      </div>
    )
  }

  if (loading) {
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

  if (!playerA || !playerB) {
    return (
      <div className={styles.page}>
        <div className={styles.loadWrap}>
          <p className={styles.notFound}>One or both players not found.</p>
        </div>
      </div>
    )
  }

  const allRows      = allCompsRows(playerA, playerB)
  const uclRows      = uclTotalsRows(playerA, playerB)
  const allSeasons   = buildSeasonUnion(allStatsA, allStatsB)
  const uclSeasons   = buildSeasonUnion(uclStatsA, uclStatsB)
  const seasonCols   = seasonCompCols(playerA, playerB)

  const hasUclDataA  = (playerA.uclApps || 0) > 0 || uclStatsA.length > 0
  const hasUclDataB  = (playerB.uclApps || 0) > 0 || uclStatsB.length > 0
  const hasAnyUcl    = hasUclDataA || hasUclDataB

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

      {/* ── HERO ── */}
      <div className={styles.heroRow}>
        <PlayerHero player={playerA} side="a" />
        <div className={styles.heroDivider} />
        <PlayerHero player={playerB} side="b" />
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

      {/* ── COLUMN LABELS (below tabs, above totals) ── */}
      <div className={styles.colLabels}>
        <span className={styles.colLabelA}>{playerA.name.split(' ').pop()}</span>
        <span className={styles.colLabelCenter} />
        <span className={styles.colLabelB}>{playerB.name.split(' ').pop()}</span>
      </div>

      {/* ── ALL COMPS TAB ── */}
      {tab === 'all' && (
        <div className={styles.section}>
          <TotalsSection rows={allRows} playerA={playerA} playerB={playerB} />
          {allSeasons.length > 0 && (
            <>
              <div className={styles.sectionDivider}>
                <span className={styles.sectionDividerLabel}>Season by Season</span>
              </div>
              <SeasonCompTable rows={allSeasons} cols={seasonCols} />
            </>
          )}
        </div>
      )}

      {/* ── UCL TAB ── */}
      {tab === 'ucl' && (
        <div className={styles.section}>
          {!hasAnyUcl ? (
            <p className={styles.noData}>Neither player has UCL data recorded.</p>
          ) : (
            <>
              {/* Per-player UCL note if one has no data */}
              {(!hasUclDataA || !hasUclDataB) && (
                <p className={styles.uclNote}>
                  {!hasUclDataA ? playerA.name : playerB.name} has no UCL appearances recorded.
                </p>
              )}
              <TotalsSection rows={uclRows} playerA={playerA} playerB={playerB} />
              {uclSeasons.length > 0 && (
                <>
                  <div className={styles.sectionDivider}>
                    <span className={styles.sectionDividerLabel}>Season by Season</span>
                  </div>
                  <SeasonCompTable rows={uclSeasons} cols={seasonCols} />
                </>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}
