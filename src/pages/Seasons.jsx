import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import { CreateSeasonModal } from '../components/CreateSeasonModal'
import styles from './Seasons.module.css'

// ─── DYNASTY TIER ────────────────────────────────────────────────────────────

const dynastyPillClass = (score, s) => {
  if (!score && score !== 0) return s.pillNone
  if (score >= 85) return s.pillElite
  if (score >= 70) return s.pillStrong
  if (score >= 50) return s.pillAvg
  return s.pillRebuild
}

// ─── UCL RESULT BADGE ────────────────────────────────────────────────────────

const uclBadgeClass = (result, s) => {
  if (result === 'Champions')  return s.badgeChampions
  if (result === 'Runners-Up') return s.badgeRunnerUp
  return s.badgeDefault
}

// ─── LOADING ─────────────────────────────────────────────────────────────────

const Loading = () => (
  <div className={styles.loadWrap}>
    <div className={styles.spinner} />
  </div>
)

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

const EmptyState = ({ onAdd }) => (
  <div className={styles.empty}>
    <div className={styles.emptyIcon}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect x="4" y="6" width="28" height="26" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M4 14h28" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M12 4v5M24 4v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 22h12M18 18v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
    <p className={styles.emptyTitle}>No seasons yet</p>
    <p className={styles.emptyText}>Create your first season to start building your dynasty record.</p>
    <button className={styles.emptyBtn} onClick={onAdd}>
      + Create Season
    </button>
  </div>
)

// ─── SEASON ROW ──────────────────────────────────────────────────────────────

const SeasonRow = ({ season, onClick }) => {
  const hasLeague = season.leagueW != null
  const wdl = hasLeague ? `${season.leagueW}W ${season.leagueD}D ${season.leagueL}L` : null
  const pts = season.leaguePts != null ? `${season.leaguePts} pts` : null

  return (
    <button className={styles.row} onClick={onClick}>
      <div className={styles.rowBar} />

      <div className={styles.rowCard}>
        {/* Left: label + year */}
        <div className={styles.rowLeft}>
          <span className={styles.rowLabel}>{season.label}</span>
          <span className={styles.rowYear}>{season.year}</span>
        </div>

        {/* Center: badges */}
        <div className={styles.rowCenter}>
          {season.leaguePosition != null && (
            <span className={styles.leaguePos}>
              {season.leaguePosition}{ordinal(season.leaguePosition)}
            </span>
          )}
          {wdl && <span className={styles.wdl}>{wdl}</span>}
          {pts  && <span className={styles.pts}>{pts}</span>}
          {season.uclResult && (
            <span className={`${styles.badge} ${uclBadgeClass(season.uclResult, styles)}`}>
              {season.uclResult === 'Champions' ? '★ ' : ''}{season.uclResult}
            </span>
          )}
        </div>

        {/* Right: dynasty score + status */}
        <div className={styles.rowRight}>
          {season.dynastyScore != null ? (
            <span className={`${styles.scorePill} ${dynastyPillClass(season.dynastyScore, styles)}`}>
              {season.dynastyScore}
            </span>
          ) : (
            <span className={styles.scorePillNone}>—</span>
          )}
          <span className={`${styles.statusDot} ${season.isComplete ? styles.statusDotDone : styles.statusDotLive}`} />
        </div>
      </div>
    </button>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const Seasons = () => {
  const { activeGame, activeClub } = useApp()
  const navigate = useNavigate()

  const [seasons,    setSeasons]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!activeGame)  { navigate('/');      return }
    if (!activeClub)  { navigate('/clubs'); return }
    load()
  }, [activeGame, activeClub])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getSeasons(activeClub.id)
      setSeasons(data)
    } catch (err) {
      console.error('Seasons load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreated = (seasonId) => {
    setShowCreate(false)
    navigate(`/seasons/${seasonId}`)
  }

  if (!activeGame || !activeClub) return null

  const complete   = seasons.filter(s => s.isComplete)
  const inProgress = seasons.filter(s => !s.isComplete)

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* ── Page header ── */}
        <div className={styles.pageHeader}>
          <div>
            <p className={styles.pageEyebrow}>{activeClub.name}</p>
            <h1 className={styles.pageTitle}>Seasons</h1>
          </div>
          <button className={styles.addBtn} onClick={() => setShowCreate(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add Season
          </button>
        </div>

        {/* ── Legend ── */}
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.statusDot} ${styles.statusDotLive}`} />
            In progress
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.statusDot} ${styles.statusDotDone}`} />
            Complete
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.scorePill} ${styles.pillElite}`} style={{ fontSize: 10, padding: '2px 7px' }}>85+</span>
            Dynasty score
          </span>
        </div>

        {loading ? (
          <Loading />
        ) : seasons.length === 0 ? (
          <EmptyState onAdd={() => setShowCreate(true)} />
        ) : (
          <>
            {/* In-progress seasons */}
            {inProgress.length > 0 && (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>In Progress</p>
                <div className={styles.list}>
                  {inProgress.map(s => (
                    <SeasonRow
                      key={s.id}
                      season={s}
                      onClick={() => navigate(`/seasons/${s.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed seasons */}
            {complete.length > 0 && (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>Completed — {complete.length}</p>
                <div className={styles.list}>
                  {complete.map(s => (
                    <SeasonRow
                      key={s.id}
                      season={s}
                      onClick={() => navigate(`/seasons/${s.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

      </div>

      {showCreate && (
        <CreateSeasonModal
          clubId={activeClub.id}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

export default Seasons

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function ordinal(n) {
  if (n == null) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
