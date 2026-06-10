import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import { CreateSeasonModal } from '../components/CreateSeasonModal'
import { TROPHY_PNG_MAP, TrophySVG, GenericTrophySVG } from '../utils/trophyAssets'
import styles from './Seasons.module.css'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildHeadline(season) {
  if (season.seasonHeadline) return season.seasonHeadline
  const parts = []
  if (season.leaguePosition === 1 && season.leagueCompetition)
    parts.push(`${season.leagueCompetition} champions`)
  if (season.uclResult === 'Champions') parts.push('UCL winners')
  if (season.uclResult === 'Runners-Up') parts.push('UCL finalists')
  if (!parts.length && season.label)
    return `${season.label}${season.year ? ` — ${season.year}` : ''}`
  return parts.join(' · ') || season.label
}

function buildDeck(season) {
  if (season.seasonDeck) return season.seasonDeck
  if (season.narrativeText)
    return season.narrativeText.slice(0, 110) + (season.narrativeText.length > 110 ? '…' : '')
  return null
}

// Map a competition key to its trophy PNG or SVG fallback
function TrophyIcon({ competitionKey, className, imgClassName }) {
  const png = TROPHY_PNG_MAP[competitionKey]
  if (png) {
    return <img src={png} alt={competitionKey} className={imgClassName || className} />
  }
  const SvgComp = TrophySVG[competitionKey] || GenericTrophySVG
  return <SvgComp className={className} />
}

function getHardware(season) {
  const honours = []
  if (season.leaguePosition === 1 && season.leagueCompetition)
    honours.push({ key: 'lg', label: season.leagueCompetition, type: 'league' })
  if (season.uclResult === 'Champions')
    honours.push({ key: 'ucl', label: 'UEFA Champions League', type: 'ucl' })
  if (season.faCupResult === 'Winner')
    honours.push({ key: 'fa', label: 'FA Cup', type: 'cup' })
  if (season.carabaoCupResult === 'Winner')
    honours.push({ key: 'cc', label: 'Carabao Cup', type: 'cup' })
  return honours
}

function getFinalist(season) {
  if (season.uclResult === 'Runners-Up') {
    const opp = season.uclFinalOpponent || season.uclTournamentWinner || ''
    return { opponent: opp }
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
  return (
    (season.dynastyScore != null && season.dynastyScore >= 85) ||
    season.uclResult === 'Champions'
  )
}

// ─── DYNASTY ARC ─────────────────────────────────────────────────────────────

function DynastyArc({ seasons, onNavigate }) {
  if (!seasons.length) return null
  const sorted = [...seasons].sort((a, b) =>
    (a.label || '').localeCompare(b.label || '')
  )
  return (
    <div className={styles.arc}>
      <p className={styles.arcLabel}>Dynasty arc</p>
      <div className={styles.arcBaseline}>
        <div className={styles.arcRow}>
          {sorted.map(s => {
            const honours = getHardware(s)
            const finalist = getFinalist(s)
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
                  {honours.map(h => <span key={h.key} className={styles.pipGold} />)}
                  {finalist && <span className={styles.pipSlate} />}
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
  const honours = getHardware(season)
  const finalist = getFinalist(season)
  const peak = isPeak(season)
  const dip = season.dynastyScore != null && season.dynastyScore < 60 && !peak

  return (
    <button className={styles.seasonRow} onClick={onClick}>
      <div
        className={`${styles.seasonRowAccent} ${peak ? styles.seasonRowAccentPeak : ''}`}
      />
      <div className={styles.seasonRowBody}>
        <div className={styles.rowMeta}>
          <span className={styles.rowLabel}>{season.label}</span>
          {season.year && <span className={styles.rowYear}>{season.year}</span>}
        </div>
        <div
          className={`${styles.rowHeadline} ${
            peak ? styles.rowHeadlinePeak : dip ? styles.rowHeadlineDip : ''
          }`}
        >
          {headline}
        </div>
        {deck && <div className={styles.rowDeck}>{deck}</div>}
        <div className={styles.rowFooter}>
          <div className={styles.rowHardware}>
            {honours.map(h => (
              <span key={h.key} className={styles.hwHonour}>
                <TrophyIcon
                  competitionKey={h.label}
                  imgClassName={styles.hwTrophyImg}
                  className={styles.hwTrophySvg}
                />
                <span className={styles.hwLabel}>{h.label}</span>
              </span>
            ))}
            {finalist && (
              <span className={styles.hwFinalist}>
                UCL Finalist · lost to {finalist.opponent || '…'}
              </span>
            )}
          </div>
          {season.dynastyScore != null && (
            <span
              className={`${styles.rowScore} ${peak ? styles.rowScorePeak : ''}`}
            >
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

  const plTitles  = seasons.filter(s => s.leaguePosition === 1).length
  const uclTitles = seasons.filter(s => s.uclResult === 'Champions').length

  const identityParts = []
  if (seasons.length)
    identityParts.push(`${seasons.length} season${seasons.length !== 1 ? 's' : ''}`)
  if (plTitles)
    identityParts.push(`${plTitles} league title${plTitles !== 1 ? 's' : ''}`)
  if (uclTitles)
    identityParts.push(`${uclTitles} UCL title${uclTitles !== 1 ? 's' : ''}`)

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* ── PAGE HEADER ── */}
        <div className={styles.pageHead}>
          <p className={styles.eyebrow}>
            {activeClub.name} · {activeGame?.title}
          </p>
          <h1 className={styles.pageTitle}>The {activeClub.name} story</h1>
          <div className={styles.heroIdentityRule} />
          {identityParts.length > 0 && (
            <p className={styles.identityMeta}>{identityParts.join(' · ')}</p>
          )}
        </div>

        {/* ── DYNASTY ARC ── */}
        {seasons.length >= 2 && (
          <DynastyArc
            seasons={seasons}
            onNavigate={id => navigate(`/seasons/${id}`)}
          />
        )}

        {/* ── SEASON LIST ── */}
        {loading ? (
          <div className={styles.loadWrap}>
            <div className={styles.spinner} />
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No seasons yet</p>
            <p className={styles.emptyText}>
              Import season data to start building your dynasty record.
            </p>
          </div>
        ) : (
          <div className={styles.seasonList}>
            {sorted.map(s => (
              <SeasonRow
                key={s.id}
                season={s}
                onClick={() => navigate(`/seasons/${s.id}`)}
              />
            ))}
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
