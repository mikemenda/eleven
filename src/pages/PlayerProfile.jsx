import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayer, getSeasons, getTransfers } from '../firebase/services'
import styles from './PlayerProfile.module.css'

const POS_GROUP = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', CF: 'ATT', ST: 'ATT'
}

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

function fmt(n) { if (!n) return '—'; return n >= 1e6 ? `€${(n/1e6).toFixed(1)}M` : `€${(n/1e3).toFixed(0)}K` }

export default function PlayerProfile() {
  const { id } = useParams()
  const { activeClub } = useApp()
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('career') // career | ucl | history

  useEffect(() => {
    if (!activeClub) return
    Promise.all([
      getPlayer(id),
      getSeasons(activeClub.id),
      getTransfers(activeClub.id),
    ]).then(([p, s, t]) => {
      setPlayer(p)
      setSeasons(s)
      // Canonical link is playerId. The name fallback supports legacy transfer docs
      // that were seeded without a playerId reference.
      // TODO: backfill `playerId` on all legacy transfer docs before Season 4 import,
      // then remove the `tr.player === p?.name` fallback.
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

  const gpg = player.apps > 0 ? (player.goals / player.apps).toFixed(2) : '—'
  const apg = player.apps > 0 ? (player.assists / player.apps).toFixed(2) : '—'

  // Season breakdown from player.seasonStats (array of {seasonId, label, apps, goals, assists, ...})
  const seasonStats = player.seasonStats || []

  const status = player.status || 'Active'
  const statusColors = { Active: 'var(--en-green)', Sold: 'var(--en-text-3)', Loaned: 'var(--en-gold)' }

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
          {player.sofifaId && (
            <span className={styles.heroId}>ID #{player.sofifaId}</span>
          )}
        </div>
      </div>

      {/* ── CAREER TOTALS ── */}
      <div className={styles.totalsRow}>
        <div className={styles.totalCard}>
          <span className={styles.totalVal}>{player.apps || 0}</span>
          <span className={styles.totalKey}>Apps</span>
        </div>
        <div className={styles.totalCard}>
          <span className={styles.totalVal}>{player.goals || 0}</span>
          <span className={styles.totalKey}>Goals</span>
        </div>
        <div className={styles.totalCard}>
          <span className={styles.totalVal}>{player.assists || 0}</span>
          <span className={styles.totalKey}>Assists</span>
        </div>
        <div className={styles.totalCard}>
          <span className={styles.totalVal}>{gpg}</span>
          <span className={styles.totalKey}>G/Game</span>
        </div>
        {player.position === 'GK' && (
          <div className={styles.totalCard}>
            <span className={styles.totalVal}>{player.cleanSheets || 0}</span>
            <span className={styles.totalKey}>CS</span>
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        {['career', 'ucl', 'history'].map(t => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}>
            {t === 'career' ? 'Season Log' : t === 'ucl' ? 'UCL' : 'Transfers'}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className={styles.inner}>
        {tab === 'career' && (
          <div className={styles.section}>
            {seasonStats.length === 0 ? (
              <p className={styles.noData}>No season breakdown data available</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Apps</th>
                    <th>G</th>
                    <th>A</th>
                    {player.position === 'GK' && <th>CS</th>}
                  </tr>
                </thead>
                <tbody>
                  {seasonStats.map((ss, i) => (
                    <tr key={i}>
                      <td className={styles.seasonLabel}>{ss.label || '—'}</td>
                      <td>{ss.apps || 0}</td>
                      <td>{ss.goals || 0}</td>
                      <td>{ss.assists || 0}</td>
                      {player.position === 'GK' && <td>{ss.cleanSheets || 0}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'ucl' && (
          <div className={styles.section}>
            {!player.uclApps ? (
              <p className={styles.noData}>No UCL data recorded</p>
            ) : (
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
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className={styles.section}>
            {transfers.length === 0 ? (
              <p className={styles.noData}>No transfer activity at this club.</p>
            ) : (
              <div className={styles.transferList}>
                {transfers.map((t, i) => (
                  <div key={i} className={styles.transferItem}>
                    <div className={styles.transferDir}
                      style={{ color: t.direction === 'IN' ? 'var(--en-green)' : 'var(--danger)' }}>
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
