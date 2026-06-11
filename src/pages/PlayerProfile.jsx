import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayer, getSeasons, getTransfers, getSeasonStatsByPlayer } from '../firebase/services'
import styles from './PlayerProfile.module.css'

// ─── Image components ─────────────────────────────────────────────────────────

function Silhouette() {
  return (
    <div className={styles.silhouette}>
      <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="80" height="80">
        <circle cx="40" cy="26" r="14" fill="currentColor" opacity="0.35"/>
        <path d="M8 76c0-17.673 14.327-32 32-32s32 14.327 32 32" fill="currentColor" opacity="0.25"/>
      </svg>
    </div>
  )
}

function SofifaImg({ sofifaId, name }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette />
  return (
    <img
      src={`https://fifa-img.michaelmenda92.workers.dev/${sofifaId}`}
      alt={name}
      className={styles.heroImg}
      onError={() => setErr(true)}
    />
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n) return '—'
  return n >= 1e6 ? `€${(n / 1e6).toFixed(1)}M` : `€${(n / 1e3).toFixed(0)}K`
}

function fmtRate(val) {
  if (val === null || val === undefined) return '—'
  const n = typeof val === 'string' ? parseFloat(val) : val
  return typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : '—'
}

function fmtOpt(val, dp = 1) {
  if (val === null || val === undefined) return '—'
  return typeof val === 'number' ? val.toFixed(dp) : val
}

function isGK(player) {
  return player?.position === 'GK'
}

// ─── Label join ───────────────────────────────────────────────────────────────
// seasonStats docs have no label field — label lives on the seasons document.
// Build a Map<seasonId → label> from the seasons array, then attach to stat docs.
function attachLabels(statDocs, seasonMap) {
  return statDocs.map(d => ({
    ...d,
    label: seasonMap.get(d.seasonId) ?? d.seasonId ?? '—',
  }))
}

// Sort newest-first by label ("S7" > "S6" > … > "S1").
function sortNewestFirst(docs) {
  return [...docs].sort((a, b) => {
    const na = parseInt((a.label || '').replace(/\D/g, ''), 10) || 0
    const nb = parseInt((b.label || '').replace(/\D/g, ''), 10) || 0
    return nb - na
  })
}

// ─── Stat grid builders ───────────────────────────────────────────────────────
// All Comps grid — sourced from top-level player fields (all-comp career totals)
// UCL grid       — sourced from top-level uclApps/uclGoals/etc.
// Both follow same 2×4 outfield / 1×4 GK layout.

function buildAllCompsGrid(player) {
  const apps    = player.apps    || 0
  const goals   = player.goals   || 0
  const assists = player.assists || 0
  const cs      = player.cleanSheets
  const rating  = player.averageRating   // intentionally not stored at career level → always null/—

  const contrib = goals + assists
  const gpg     = apps > 0 ? goals / apps   : null
  const apg     = apps > 0 ? assists / apps : null
  const cpg     = apps > 0 ? contrib / apps : null
  const cspg    = apps > 0 && cs != null ? cs / apps : null

  if (isGK(player)) {
    return [[
      { key: 'apps', label: 'Apps', value: apps },
      { key: 'cs',   label: 'CS',   value: cs != null ? cs : '—' },
      { key: 'cspg', label: 'CS/G', value: fmtRate(cspg) },
      { key: 'avg',  label: 'Avg',  value: fmtOpt(rating, 1) },
    ]]
  }
  return [
    [
      { key: 'apps',    label: 'Apps',    value: apps },
      { key: 'contrib', label: 'G+A',     value: contrib },
      { key: 'goals',   label: 'Goals',   value: goals },
      { key: 'assists', label: 'Assists', value: assists },
    ],
    [
      { key: 'avg', label: 'Avg',  value: fmtOpt(rating, 1) },
      { key: 'cpg', label: 'C/G',  value: fmtRate(cpg) },
      { key: 'gpg', label: 'G/G',  value: fmtRate(gpg) },
      { key: 'apg', label: 'A/G',  value: fmtRate(apg) },
    ],
  ]
}

function buildUclGrid(player) {
  const apps    = player.uclApps    || 0
  const goals   = player.uclGoals   || 0
  const assists = player.uclAssists || 0
  const cs      = player.uclCleanSheets

  const contrib = goals + assists
  const gpg     = apps > 0 ? goals / apps   : null
  const apg     = apps > 0 ? assists / apps : null
  const cpg     = apps > 0 ? contrib / apps : null
  const cspg    = apps > 0 && cs != null ? cs / apps : null

  if (isGK(player)) {
    return [[
      { key: 'apps', label: 'Apps', value: apps },
      { key: 'cs',   label: 'CS',   value: cs != null ? cs : '—' },
      { key: 'cspg', label: 'CS/G', value: fmtRate(cspg) },
      { key: 'avg',  label: 'Avg',  value: '—' },   // no career UCL avg stored
    ]]
  }
  return [
    [
      { key: 'apps',    label: 'Apps',    value: apps },
      { key: 'contrib', label: 'G+A',     value: contrib },
      { key: 'goals',   label: 'Goals',   value: goals },
      { key: 'assists', label: 'Assists', value: assists },
    ],
    [
      { key: 'avg', label: 'Avg',  value: '—' },    // no career UCL avg stored
      { key: 'cpg', label: 'C/G',  value: fmtRate(cpg) },
      { key: 'gpg', label: 'G/G',  value: fmtRate(gpg) },
      { key: 'apg', label: 'A/G',  value: fmtRate(apg) },
    ],
  ]
}

// Shared grid renderer
function StatGrid({ grid }) {
  return (
    <div className={styles.totalsGrid}>
      {grid.map((row, ri) => (
        <div key={ri} className={styles.totalsRow}>
          {row.map(cell => (
            <div key={cell.key} className={styles.totalCard}>
              <span className={styles.totalVal}>{cell.value}</span>
              <span className={styles.totalKey}>{cell.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Season table column definitions ─────────────────────────────────────────

function allColsFor(player) {
  if (isGK(player)) {
    return [
      { key: 'label',         header: 'Season' },
      { key: 'apps',          header: 'Apps' },
      { key: 'cleanSheets',   header: 'CS' },
      { key: 'csPerGame',     header: 'CS/G' },
      { key: 'averageRating', header: 'Avg' },
    ]
  }
  return [
    { key: 'label',         header: 'Season' },
    { key: 'apps',          header: 'Apps' },
    { key: 'goals',         header: 'G' },
    { key: 'assists',       header: 'A' },
    { key: '_contrib',      header: 'G+A' },
    { key: 'gPerGame',      header: 'G/G' },
    { key: 'aPerGame',      header: 'A/G' },
    { key: 'cPerGame',      header: 'C/G' },
    { key: 'averageRating', header: 'Avg' },
  ]
}

function uclColsFor(player) {
  if (isGK(player)) {
    return [
      { key: 'label',            header: 'Season' },
      { key: 'apps',             header: 'Apps' },
      { key: 'cleanSheets',      header: 'CS' },
      { key: 'csPerGame',        header: 'CS/G' },
      { key: 'uclAverageRating', header: 'Avg' },
    ]
  }
  return [
    { key: 'label',            header: 'Season' },
    { key: 'apps',             header: 'Apps' },
    { key: 'goals',            header: 'G' },
    { key: 'assists',          header: 'A' },
    { key: '_contrib',         header: 'G+A' },
    { key: 'gPerGame',         header: 'G/G' },
    { key: 'aPerGame',         header: 'A/G' },
    { key: 'cPerGame',         header: 'C/G' },
    { key: 'uclAverageRating', header: 'Avg' },
  ]
}

// Resolve a single cell value from a seasonStats document.
function cellVal(doc, key) {
  if (key === '_contrib') {
    return (doc.goals || 0) + (doc.assists || 0)
  }
  if (key === 'averageRating' || key === 'uclAverageRating') {
    const v = doc[key]
    return v != null ? fmtOpt(v, 1) : '—'
  }
  // gPerGame, aPerGame, cPerGame, csPerGame stored in Firestore from seed scripts
  if (['gPerGame','aPerGame','cPerGame','csPerGame'].includes(key)) {
    const v = doc[key]
    return v != null ? fmtRate(v) : '—'
  }
  const v = doc[key]
  if (v === null || v === undefined) return '—'
  return v
}

// Shared season table renderer
function SeasonTable({ cols, rows }) {
  if (rows.length === 0) return null
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {cols.map(col => (
            <th key={col.key} className={col.key === 'label' ? styles.thLeft : undefined}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(ss => (
          <tr key={ss.id}>
            {cols.map(col => (
              <td key={col.key} className={col.key === 'label' ? styles.seasonLabel : undefined}>
                {cellVal(ss, col.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerProfile() {
  const { id } = useParams()
  const { activeClub } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  const [player,    setPlayer]    = useState(null)
  const [allStats,  setAllStats]  = useState([])  // from seasonStats collection, scope='ALL'
  const [uclStats,  setUclStats]  = useState([])  // from seasonStats collection, scope=UCL
  const [transfers, setTransfers] = useState([])
  const [loading,   setLoading]   = useState(true)
  // Default to 'ucl' tab when navigated from UCL section (via location.state.defaultTab)
  // All other navigation paths pass no state and default to 'career' as before.
  const [tab,       setTab]       = useState(location.state?.defaultTab || 'career')

  useEffect(() => {
    if (!activeClub) return
    Promise.all([
      getPlayer(id),
      getSeasons(activeClub.id),
      getSeasonStatsByPlayer(id),
      getTransfers(activeClub.id),
    ]).then(([p, seasons, statDocs, t]) => {
      setPlayer(p)

      // ── ALL COMPS: canonical source — scope:'ALL' collection docs ───────
      // statDocs already loaded above; filter to ALL scope and attach labels.
      // scope:'ALL' docs carry a label field from seedAllCompsStats.mjs;
      // attachLabels adds/overwrites it from seasonMap as a safe fallback.
      const allDocs = statDocs.filter(d => d.scope === 'ALL')
      setAllStats(sortNewestFirst(attachLabels(allDocs, seasonMap)))

      // ── UCL: read from seasonStats collection, scope=UCL ────────────────
      // Join labels from seasons since collection docs have no label field.
      const seasonMap = new Map(seasons.map(s => [s.id, s.label]))
      const uclDocs = statDocs.filter(d => d.scope === 'UCL')
      setUclStats(sortNewestFirst(attachLabels(uclDocs, seasonMap)))

      setTransfers(t.filter(tr => tr.playerId === id || tr.player === p?.name))
      setLoading(false)
    })
  }, [id, activeClub])

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadWrap}><div className={styles.spinner} /></div>
    </div>
  )

  if (!player) return (
    <div className={styles.page}>
      <div className={styles.loadWrap}>
        <p className={styles.notFound}>Player not found</p>
      </div>
    </div>
  )

  const status       = player.status || 'Active'
  const statusColors = { Active: 'var(--en-gold)', Sold: 'var(--en-text-3)', Loaned: 'var(--en-gold)' }
  const seasonsCount = allStats.length

  const allCompsGrid = buildAllCompsGrid(player)
  const uclGrid      = buildUclGrid(player)
  const hasUclTotals = (player.uclApps || 0) > 0

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <span className={styles.topLabel}>Player Profile</span>
        <button
          className={styles.compareBtn}
          onClick={() => navigate(`/players/compare?a=${id}`)}
        >
          Compare
        </button>
      </div>

      {/* ── HERO ── */}
      <div className={styles.hero}>
        <div className={styles.heroImgWrap}>
          <SofifaImg sofifaId={player.sofifaId} name={player.name} />
        </div>
        <div className={styles.heroInfo}>
          <div className={styles.heroMeta}>
            <span className={styles.heroPos}>{player.position}</span>
            {player.nationality && <span className={styles.heroNat}>{player.nationality}</span>}
            <span className={styles.heroStatus} style={{ color: statusColors[status] }}>{status}</span>
          </div>
          <h1 className={styles.heroName}>{player.name}</h1>
          <span className={styles.heroSeasons}>
            {seasonsCount > 0
              ? `${seasonsCount} Season${seasonsCount !== 1 ? 's' : ''}`
              : 'No season data'}
          </span>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'career'  ? styles.tabActive : ''}`} onClick={() => setTab('career')}>
          All Comps
        </button>
        <button className={`${styles.tab} ${tab === 'ucl'     ? styles.tabActive : ''}`} onClick={() => setTab('ucl')}>
          UCL
        </button>
        <button className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`} onClick={() => setTab('history')}>
          Transfer History
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className={styles.inner}>

        {/* ── ALL COMPS ── */}
        {tab === 'career' && (
          <div className={styles.section}>
            <StatGrid grid={allCompsGrid} />
            <div className={styles.tableDivider} />
            {allStats.length === 0
              ? <p className={styles.noData}>No season data imported yet.</p>
              : <SeasonTable cols={allColsFor(player)} rows={allStats} />
            }
          </div>
        )}

        {/* ── UCL ── */}
        {tab === 'ucl' && (
          <div className={styles.section}>
            {!hasUclTotals && uclStats.length === 0 ? (
              <p className={styles.noData}>No UCL appearances recorded.</p>
            ) : (
              <>
                <StatGrid grid={uclGrid} />
                <div className={styles.tableDivider} />
                {uclStats.length === 0
                  ? <p className={styles.noData}>Season-by-season UCL data not yet imported.</p>
                  : <SeasonTable cols={uclColsFor(player)} rows={uclStats} />
                }
              </>
            )}
          </div>
        )}

        {/* ── TRANSFER HISTORY ── */}
        {tab === 'history' && (
          <div className={styles.section}>
            {transfers.length === 0 ? (
              <p className={styles.noData}>No transfer activity at this club.</p>
            ) : (
              <div className={styles.transferList}>
                {transfers.map((t, i) => (
                  <div key={i} className={styles.transferItem}>
                    <div className={styles.transferDir}
                      style={{ color: t.direction === 'IN' ? 'var(--en-gold)' : 'var(--en-text-3)' }}>
                      {t.direction === 'IN' ? '▼ IN' : '▲ OUT'}
                    </div>
                    <div className={styles.transferDetails}>
                      <div className={styles.transferClubs}>{t.from_club} → {t.to_club}</div>
                      <div className={styles.transferMeta}>{t.season} · {t.window} · {t.rule}</div>
                    </div>
                    <div className={styles.transferFee}>{fmt(t.fee_eur)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
