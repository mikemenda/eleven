import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayer, getSeasons, getTransfers } from '../firebase/services'
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

// Render a rate stat: null → "—", 0-denominator → "—", else 2dp
function fmtRate(val) {
  if (val === null || val === undefined) return '—'
  return val.toFixed(2)
}

// Render an optional field: null/undefined → "—"
function fmtOpt(val, dp = 1) {
  if (val === null || val === undefined) return '—'
  return typeof val === 'number' ? val.toFixed(dp) : val
}

function isGK(player) {
  return player?.position === 'GK'
}

// ─── Career totals config ─────────────────────────────────────────────────────
// Returns array of { key, label, value } for the totals strip.
// GKs: Apps / CS / CS/G / Avg Rating (no goals/assists/G+A/G/G/A/G/C/G)
// Outfielders: Apps / G / A / G+A / G/G / A/G / C/G / Avg Rating

function buildTotals(player) {
  const apps      = player.apps    || 0
  const goals     = player.goals   || 0
  const assists   = player.assists || 0
  const cs        = player.cleanSheets
  const rating    = player.averageRating

  const contrib   = goals + assists
  const gpg       = apps > 0 ? goals / apps : null
  const apg       = apps > 0 ? assists / apps : null
  const cpg       = apps > 0 ? contrib / apps : null
  const cspg      = apps > 0 && cs != null ? cs / apps : null

  if (isGK(player)) {
    return [
      { key: 'apps',    label: 'Apps',   value: apps },
      { key: 'cs',      label: 'CS',     value: cs != null ? cs : '—' },
      { key: 'cspg',    label: 'CS/G',   value: fmtRate(cspg) },
      { key: 'rating',  label: 'Avg Rtg',value: fmtOpt(rating, 1) },
    ]
  }

  return [
    { key: 'apps',    label: 'Apps',   value: apps },
    { key: 'goals',   label: 'Goals',  value: goals },
    { key: 'assists', label: 'Assists',value: assists },
    { key: 'contrib', label: 'G+A',    value: contrib },
    { key: 'gpg',     label: 'G/G',    value: fmtRate(gpg) },
    { key: 'apg',     label: 'A/G',    value: fmtRate(apg) },
    { key: 'cpg',     label: 'C/G',    value: fmtRate(cpg) },
    { key: 'rating',  label: 'Avg Rtg',value: fmtOpt(rating, 1) },
  ]
}

// Season-by-season table columns (All Comps tab)
// GKs show CS column; outfielders show G+A column. Avg Rating for both when present.
function buildSeasonCols(player) {
  if (isGK(player)) {
    return [
      { key: 'label',        header: 'Season' },
      { key: 'apps',         header: 'Apps' },
      { key: 'cleanSheets',  header: 'CS' },
      { key: 'cspg',         header: 'CS/G',  rate: true },
      { key: 'averageRating',header: 'Rtg' },
    ]
  }
  return [
    { key: 'label',        header: 'Season' },
    { key: 'apps',         header: 'Apps' },
    { key: 'goals',        header: 'G' },
    { key: 'assists',      header: 'A' },
    { key: 'contrib',      header: 'G+A',  derived: true },
    { key: 'averageRating',header: 'Rtg' },
  ]
}

function getSeasonCellValue(ss, colKey) {
  if (colKey === 'contrib') {
    return (ss.goals || 0) + (ss.assists || 0)
  }
  if (colKey === 'cspg') {
    const apps = ss.apps || 0
    const cs   = ss.cleanSheets
    return apps > 0 && cs != null ? (cs / apps).toFixed(2) : '—'
  }
  if (colKey === 'averageRating') {
    const v = ss.averageRating
    return v != null ? v.toFixed(1) : '—'
  }
  const v = ss[colKey]
  if (v === null || v === undefined) return '—'
  return v
}

// Sort seasonStats newest-first by label (S7 > S6 > ... > S1)
// Label format: "S1", "S2", etc.
function sortSeasons(statsArr) {
  return [...statsArr].sort((a, b) => {
    const na = parseInt((a.label || '').replace(/\D/g, ''), 10) || 0
    const nb = parseInt((b.label || '').replace(/\D/g, ''), 10) || 0
    return nb - na
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerProfile() {
  const { id } = useParams()
  const { activeClub } = useApp()
  const navigate = useNavigate()

  const [player,    setPlayer]    = useState(null)
  const [seasons,   setSeasons]   = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('career') // career | ucl | history

  useEffect(() => {
    if (!activeClub) return
    Promise.all([
      getPlayer(id),
      getSeasons(activeClub.id),
      getTransfers(activeClub.id),
    ]).then(([p, s, t]) => {
      setPlayer(p)
      setSeasons(s)
      setTransfers(
        t.filter(tr => tr.playerId === id || tr.player === p?.name)
      )
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
  const statusColors = { Active: 'var(--en-green)', Sold: 'var(--en-text-3)', Loaned: 'var(--en-gold)' }

  const seasonStats  = sortSeasons(player.seasonStats || [])
  const seasonsCount = seasonStats.length
  const totals       = buildTotals(player)
  const seasonCols   = buildSeasonCols(player)

  // UCL career totals (Phase 1 — aggregate only, no per-season breakdown yet)
  const hasUcl       = player.uclApps != null && player.uclApps > 0

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

      {/* ── CAREER TOTALS ── */}
      <div className={styles.totalsScroll}>
        <div className={styles.totalsRow}>
          {totals.map(t => (
            <div key={t.key} className={styles.totalCard}>
              <span className={styles.totalVal}>{t.value}</span>
              <span className={styles.totalKey}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'career' ? styles.tabActive : ''}`}
          onClick={() => setTab('career')}
        >
          All Comps
        </button>
        <button
          className={`${styles.tab} ${tab === 'ucl' ? styles.tabActive : ''}`}
          onClick={() => setTab('ucl')}
        >
          UCL
        </button>
        <button
          className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`}
          onClick={() => setTab('history')}
        >
          Transfer History
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className={styles.inner}>

        {/* ALL COMPS */}
        {tab === 'career' && (
          <div className={styles.section}>
            {seasonStats.length === 0 ? (
              <p className={styles.noData}>No season data imported yet.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    {seasonCols.map(col => (
                      <th key={col.key} className={col.key === 'label' ? styles.thLeft : undefined}>
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasonStats.map((ss, i) => (
                    <tr key={i}>
                      {seasonCols.map(col => (
                        <td
                          key={col.key}
                          className={col.key === 'label' ? styles.seasonLabel : undefined}
                        >
                          {getSeasonCellValue(ss, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* UCL — Phase 1: career totals only */}
        {tab === 'ucl' && (
          <div className={styles.section}>
            {!hasUcl ? (
              <p className={styles.noData}>No UCL appearances recorded.</p>
            ) : (
              <>
                <div className={styles.uclTotals}>
                  <div className={styles.totalCard}>
                    <span className={styles.totalVal}>{player.uclApps || 0}</span>
                    <span className={styles.totalKey}>Apps</span>
                  </div>
                  <div className={styles.totalCard}>
                    <span className={styles.totalVal}>{player.uclGoals || 0}</span>
                    <span className={styles.totalKey}>Goals</span>
                  </div>
                  <div className={styles.totalCard}>
                    <span className={styles.totalVal}>{player.uclAssists || 0}</span>
                    <span className={styles.totalKey}>Assists</span>
                  </div>
                  {isGK(player) && (
                    <div className={styles.totalCard}>
                      <span className={styles.totalVal}>
                        {player.uclCleanSheets != null ? player.uclCleanSheets : '—'}
                      </span>
                      <span className={styles.totalKey}>CS</span>
                    </div>
                  )}
                </div>
                <p className={styles.uclNote}>
                  Season-by-season UCL breakdown available after S4 import.
                </p>
              </>
            )}
          </div>
        )}

        {/* TRANSFER HISTORY */}
        {tab === 'history' && (
          <div className={styles.section}>
            {transfers.length === 0 ? (
              <p className={styles.noData}>No transfer activity at this club.</p>
            ) : (
              <div className={styles.transferList}>
                {transfers.map((t, i) => (
                  <div key={i} className={styles.transferItem}>
                    <div
                      className={styles.transferDir}
                      style={{ color: t.direction === 'IN' ? 'var(--en-green)' : 'var(--danger, #ef4444)' }}
                    >
                      {t.direction === 'IN' ? '▼ IN' : '▲ OUT'}
                    </div>
                    <div className={styles.transferDetails}>
                      <div className={styles.transferClubs}>
                        {t.from_club} → {t.to_club}
                      </div>
                      <div className={styles.transferMeta}>
                        {t.season} · {t.window} · {t.rule}
                      </div>
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
