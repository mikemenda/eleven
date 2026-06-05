import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import { CreateSeasonModal } from '../components/CreateSeasonModal'
import styles from './Seasons.module.css'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildHeadline(season) {
  if (season.seasonHeadline) return season.seasonHeadline
  const parts = []
  if (season.leaguePosition === 1 && season.leagueCompetition)
    parts.push(`${season.leagueCompetition} champions`)
  if (season.uclResult === 'Champions') parts.push('UCL winners')
  if (season.uclResult === 'Runners-Up') parts.push('UCL finalists')
  if (!parts.length && season.label) return `${season.label} — ${season.year || ''}`
  return parts.join(' · ') || season.label
}

function buildDeck(season) {
  if (season.seasonDeck) return season.seasonDeck
  if (season.narrativeText) return season.narrativeText.slice(0, 120) + (season.narrativeText.length > 120 ? '…' : '')
  return null
}

function getTrophies(season) {
  const trophies = []
  if (season.leaguePosition === 1 && season.leagueCompetition)
    trophies.push({ key: 'league', label: season.leagueCompetition, type: 'win' })
  if (season.uclResult === 'Champions')
    trophies.push({ key: 'ucl', label: 'UCL', type: 'ucl' })
  if (season.faCupResult === 'Winner')
    trophies.push({ key: 'fa', label: 'FA Cup', type: 'cup' })
  if (season.carabaoCupResult === 'Winner')
    trophies.push({ key: 'carabao', label: 'Carabao', type: 'cup' })
  return trophies
}

function getRunnerUp(season) {
  if (season.uclResult === 'Runners-Up') {
    const opp = season.uclFinalOpponent || season.uclTournamentWinner || ''
    return { label: 'UCL R-U', scoreline: season.uclFinalScore || null, opponent: opp }
  }
  return null
}

function isPeak(season) {
  return (season.dynastyScore != null && season.dynastyScore >= 85) ||
    season.uclResult === 'Champions'
}

function isLow(season) {
  return season.dynastyScore != null && season.dynastyScore < 60 &&
    season.uclResult !== 'Champions'
}

// Dynasty arc across all seasons
function DynastyArc({ seasons }) {
  if (!seasons.length) return null
  const sorted = [...seasons].sort((a, b) => {
    const la = a.label || '', lb = b.label || ''
    return la.localeCompare(lb)
  })
  const max = Math.max(...sorted.map(s => s.dynastyScore || 0), 1)
  return (
    <div className={styles.arcWrap}>
      <p className={styles.arcLabel}>Dynasty arc</p>
      <div className={styles.arcBar}>
        {sorted.map(s => {
          const pct = s.dynastyScore ? Math.round((s.dynastyScore / max) * 100) : 8
          const cls = isPeak(s) ? styles.arcSegPeak : isLow(s) ? styles.arcSegLow : styles.arcSeg
          return (
            <div key={s.id} className={cls}>
              <div className={styles.arcFill} style={{ height: `${pct}%` }} />
              <div className={styles.arcSegLabel}>{s.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Single season card on the timeline
function SeasonCard({ season, onClick }) {
  const headline = buildHeadline(season)
  const deck = buildDeck(season)
  const trophies = getTrophies(season)
  const runnerUp = getRunnerUp(season)
  const peak = isPeak(season)
  const low = isLow(season)

  return (
    <button
      className={`${styles.card} ${peak ? styles.cardPeak : ''} ${low ? styles.cardLow : ''}`}
      onClick={onClick}
    >
      <div className={styles.cardMeta}>
        {season.label}{season.year ? ` · ${season.year}` : ''}
        {!season.isComplete && <span className={styles.liveDot} />}
      </div>
      <div className={styles.cardHeadline}>{headline}</div>
      {deck && <div className={styles.cardDeck}>{deck}</div>}
      <div className={styles.cardBottom}>
        <div className={styles.trophyRow}>
          {trophies.map(t => (
            <span key={t.key} className={`${styles.tPill} ${styles['tPill_' + t.type]}`}>
              🏆 {t.label}
            </span>
          ))}
          {runnerUp && (
            <span className={styles.tRu}>
              {runnerUp.opponent && (
                <span className={styles.miniCrest}>{runnerUp.opponent.slice(0,3).toUpperCase()}</span>
              )}
              {runnerUp.label}{runnerUp.scoreline ? ` · ${runnerUp.scoreline}` : ''}
            </span>
          )}
        </div>
        {season.dynastyScore != null && (
          <span className={`${styles.dScore} ${peak ? styles.dScorePeak : ''}`}>
            {season.dynastyScore}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const Seasons = () => {
  const { activeGame, activeClub } = useApp()
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!activeGame) { navigate('/'); return }
    if (!activeClub) { navigate('/clubs'); return }
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

  // Sort newest first (by label descending)
  const sorted = [...seasons].sort((a, b) => {
    const la = a.label || '', lb = b.label || ''
    return lb.localeCompare(la)
  })

  const filtered = filter === 'ucl'
    ? sorted.filter(s => s.uclEntered)
    : filter === 'trophies'
      ? sorted.filter(s => getTrophies(s).length > 0)
      : sorted

  // Build identity line from club data
  const plTitles = seasons.filter(s => s.leaguePosition === 1).length
  const uclTitles = seasons.filter(s => s.uclResult === 'Champions').length

  const identityParts = []
  if (seasons.length) identityParts.push(`${seasons.length} season${seasons.length !== 1 ? 's' : ''}`)
  if (plTitles) identityParts.push(`${plTitles} league title${plTitles !== 1 ? 's' : ''}`)
  if (uclTitles) identityParts.push(`${uclTitles} UCL title${uclTitles !== 1 ? 's' : ''}`)

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        <div className={styles.pageHead}>
          <div>
            <p className={styles.eyebrow}>{activeClub.name} · {activeGame?.title}</p>
            <h1 className={styles.pageTitle}>The {activeClub.name} story</h1>
          </div>
          <button className={styles.addBtn} onClick={() => setShowCreate(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New season
          </button>
        </div>

        {identityParts.length > 0 && (
          <p className={styles.identityLine}>{identityParts.join(' · ')}.</p>
        )}

        {seasons.length >= 3 && <DynastyArc seasons={seasons} />}

        <div className={styles.filters}>
          {['all', 'ucl', 'trophies'].map(f => (
            <button
              key={f}
              className={`${styles.filterChip} ${filter === f ? styles.filterActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All seasons' : f === 'ucl' ? 'UCL only' : 'Trophy seasons'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{seasons.length === 0 ? 'No seasons yet' : 'No seasons match this filter'}</p>
            {seasons.length === 0 && (
              <>
                <p className={styles.emptyText}>Create your first season to start building your dynasty record.</p>
                <button className={styles.emptyBtn} onClick={() => setShowCreate(true)}>+ Create Season</button>
              </>
            )}
          </div>
        ) : (
          <div className={styles.timeline}>
            {filtered.map(s => (
              <SeasonCard
                key={s.id}
                season={s}
                onClick={() => navigate(`/seasons/${s.id}`)}
              />
            ))}
            <button className={styles.addTimeline} onClick={() => setShowCreate(true)}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Log next season
            </button>
          </div>
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
