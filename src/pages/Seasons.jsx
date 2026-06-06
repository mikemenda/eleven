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
  if (!parts.length && season.label) return `${season.label}${season.year ? ` — ${season.year}` : ''}`
  return parts.join(' · ') || season.label
}

function buildDeck(season) {
  if (season.seasonDeck) return season.seasonDeck
  if (season.narrativeText) return season.narrativeText.slice(0, 110) + (season.narrativeText.length > 110 ? '…' : '')
  return null
}

function getHardware(season) {
  const trophies = []
  const ucl = []
  if (season.leaguePosition === 1 && season.leagueCompetition)
    trophies.push({ key: 'lg', label: season.leagueCompetition, type: 'league' })
  if (season.uclResult === 'Champions')
    ucl.push({ key: 'ucl', label: 'UCL', type: 'ucl' })
  if (season.faCupResult === 'Winner')
    trophies.push({ key: 'fa', label: 'FA Cup', type: 'cup' })
  if (season.carabaoCupResult === 'Winner')
    trophies.push({ key: 'cc', label: 'Carabao', type: 'cup' })
  return { trophies, ucl }
}

function getRunnerUp(season) {
  if (season.uclResult === 'Runners-Up') {
    const opp = season.uclFinalOpponent || season.uclTournamentWinner || ''
    return { label: 'UCL R-U', opponent: opp }
  }
  return null
}

function scoreClass(season) {
  const d = season.dynastyScore
  if (d == null) return styles.arcScore_none
  if (d >= 85 || season.uclResult === 'Champions') return styles.arcScore_peak
  if (d >= 70) return styles.arcScore_mid
  if (d >= 60) return styles.arcScore_mid
  return styles.arcScore_dip
}

function isPeak(season) {
  return (season.dynastyScore != null && season.dynastyScore >= 85) || season.uclResult === 'Champions'
}

// ─── DYNASTY ARC ─────────────────────────────────────────────────────────────

function DynastyArc({ seasons, onNavigate }) {
  if (!seasons.length) return null
  const sorted = [...seasons].sort((a, b) => (a.label || '').localeCompare(b.label || ''))

  return (
    <div className={styles.arc}>
      <p className={styles.arcLabel}>Dynasty arc</p>
      <div className={styles.arcBaseline}>
        <div className={styles.arcRow}>
          {sorted.map(s => {
            const { trophies, ucl } = getHardware(s)
            const hasPeak = isPeak(s)
            return (
              <div
                key={s.id}
                className={styles.arcGroup}
                onClick={() => onNavigate(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onNavigate(s.id)}
              >
                <div className={styles.arcPips}>
                  {ucl.map(t => <span key={t.key} className={styles.pipGold} />)}
                  {trophies.map(t => <span key={t.key} className={styles.pipGreen} />)}
                </div>
                <span className={`${styles.arcScore} ${scoreClass(s)}`}>
                  {s.dynastyScore ?? '—'}
                </span>
                <span className={styles.arcSeasonLabel}>{s.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── SEASON ROW ───────────────────────────────────────────────────────────────

function SeasonRow({ season, onClick }) {
  const headline = buildHeadline(season)
  const deck = buildDeck(season)
  const { trophies, ucl } = getHardware(season)
  const runnerUp = getRunnerUp(season)
  const peak = isPeak(season)
  const dip = season.dynastyScore != null && season.dynastyScore < 60 && !peak

  const allTrophies = [...ucl, ...trophies]

  return (
    <button className={styles.seasonRow} onClick={onClick}>
      <div className={`${styles.seasonRowAccent} ${peak ? styles.seasonRowAccentPeak : ''}`} />
      <div className={styles.seasonRowBody}>
        <div className={styles.rowMeta}>
          <span className={styles.rowLabel}>{season.label}</span>
          {season.year && <span className={styles.rowYear}>{season.year}</span>}
        </div>
        <div className={`${styles.rowHeadline} ${peak ? styles.rowHeadlinePeak : dip ? styles.rowHeadlineDip : ''}`}>
          {headline}
        </div>
        {deck && <div className={styles.rowDeck}>{deck}</div>}
        <div className={styles.rowFooter}>
          <div className={styles.rowHardware}>
            {allTrophies.map(t => (
              <span
                key={t.key}
                className={t.type === 'ucl' ? styles.hwTrophy : t.type === 'league' ? styles.hwLeague : styles.hwTrophy}
              >
                {t.label}
              </span>
            ))}
            {runnerUp && (
              <span className={styles.hwRu}>
                {runnerUp.opponent ? `${runnerUp.opponent} · UCL R-U` : 'UCL R-U'}
              </span>
            )}
          </div>
          {season.dynastyScore != null && (
            <span className={`${styles.rowScore} ${peak ? styles.rowScorePeak : ''}`}>
              {season.dynastyScore}
            </span>
          )}
        </div>
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

  const sorted = [...seasons].sort((a, b) =>
    (b.label || '').localeCompare(a.label || '')
  )

  const filtered = filter === 'ucl'
    ? sorted.filter(s => s.uclEntered || s.uclResult)
    : filter === 'trophies'
      ? sorted.filter(s => getHardware(s).trophies.length + getHardware(s).ucl.length > 0)
      : sorted

  const plTitles = seasons.filter(s => s.leaguePosition === 1).length
  const uclTitles = seasons.filter(s => s.uclResult === 'Champions').length

  const identityParts = []
  if (seasons.length) identityParts.push(`${seasons.length} season${seasons.length !== 1 ? 's' : ''}`)
  if (plTitles) identityParts.push(`${plTitles} league title${plTitles !== 1 ? 's' : ''}`)
  if (uclTitles) identityParts.push(`${uclTitles} UCL title${uclTitles !== 1 ? 's' : ''}`)

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* ── PAGE HEADER ── */}
        <div className={styles.pageHead}>
          <p className={styles.eyebrow}>{activeClub.name} · {activeGame?.title}</p>
          <h1 className={styles.pageTitle}>The {activeClub.name} story</h1>
          <div className={styles.heroIdentityRule} />
          {identityParts.length > 0 && (
            <p className={styles.identityMeta}>{identityParts.join(' · ')}</p>
          )}
          <button className={styles.headAddBtn} onClick={() => setShowCreate(true)}>
            <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New season
          </button>
        </div>

        {/* ── DYNASTY ARC ── */}
        {seasons.length >= 2 && (
          <DynastyArc seasons={seasons} onNavigate={id => navigate(`/seasons/${id}`)} />
        )}

        {/* ── FILTERS ── */}
        <div className={styles.filterRow}>
          {[
            { key: 'all', label: 'All seasons' },
            { key: 'ucl', label: 'UCL only' },
            { key: 'trophies', label: 'Trophy seasons' },
          ].map(f => (
            <button
              key={f.key}
              className={`${styles.filterTab} ${filter === f.key ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── SEASON LIST ── */}
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{seasons.length === 0 ? 'No seasons yet' : 'No seasons match this filter'}</p>
            {seasons.length === 0 && (
              <>
                <p className={styles.emptyText}>Create your first season to start building your dynasty record.</p>
                <button className={styles.emptyBtn} onClick={() => setShowCreate(true)}>Create season</button>
              </>
            )}
          </div>
        ) : (
          <div className={styles.seasonList}>
            {filtered.map(s => (
              <SeasonRow
                key={s.id}
                season={s}
                onClick={() => navigate(`/seasons/${s.id}`)}
              />
            ))}
            <button className={styles.addRow} onClick={() => setShowCreate(true)}>
              <span className={styles.addRowIcon}>+</span>
              <span className={styles.addRowText}>Log next season</span>
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
