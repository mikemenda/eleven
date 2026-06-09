import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getSeasons, getPlayers } from '../firebase/services'
import { TROPHY_REGISTRY, TIER_ORDER, deriveTrophiesFromSeasons } from '../utils/trophyUtils'
import { TrophySVG, GenericTrophySVG } from '../utils/trophyAssets'
import styles from './Home.module.css'

// ─── CLOUDFLARE WORKER BASE ───────────────────────────────────────────────────
const CF = 'https://fifa-img.michaelmenda92.workers.dev'

// ─── STAT HELPERS ─────────────────────────────────────────────────────────────
// Returns primary + secondary stat for a legend row
const legendStats = (player) => {
  const pos = player.position || ''
  if (pos === 'GK') {
    return [
      { val: player.cleanSheets ?? player.uclCleanSheets ?? 0, label: 'Clean Sheets' },
      { val: player.apps || 0, label: 'Apps' },
    ]
  }
  if (['CB', 'RB', 'LB', 'RWB', 'LWB'].includes(pos)) {
    return [
      { val: player.apps || 0, label: 'Apps' },
      { val: player.assists || 0, label: 'Assists' },
    ]
  }
  if (['CDM', 'CM', 'CAM'].includes(pos)) {
    return [
      { val: player.goals || 0, label: 'Goals' },
      { val: player.assists || 0, label: 'Assists' },
    ]
  }
  // Attackers / default
  return [
    { val: player.goals || 0, label: 'Goals' },
    { val: player.assists || 0, label: 'Assists' },
  ]
}

// Derive season accomplishments for the Peak Season card
const peakAccomplishments = (season) => {
  const list = []
  if (season.leaguePosition === 1 && season.leagueCompetition) {
    list.push(season.leagueCompetition)
  }
  if (season.uclResult === 'Champions') list.push('UCL Champions')
  if (season.faCupResult === 'Winner')   list.push('FA Cup')
  if (season.carabaoCupResult === 'Winner') list.push('Carabao Cup')
  return list
}

// ─── LOADING ──────────────────────────────────────────────────────────────────
const Loading = () => (
  <div className={styles.loadWrap}>
    <div className={styles.spinner} />
  </div>
)

// ─── SECTION 1: CLUB HERO ────────────────────────────────────────────────────
const ClubHero = ({ club, game, seasons, trophyCount }) => {
  const wins   = seasons.reduce((a, s) => a + (s.leagueW || 0), 0)
  const draws  = seasons.reduce((a, s) => a + (s.leagueD || 0), 0)
  const losses = seasons.reduce((a, s) => a + (s.leagueL || 0), 0)
  const record = wins + draws + losses > 0
    ? `${wins}W–${draws}D–${losses}L`
    : null

  const initials = club.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(w => w[0].toUpperCase())
    .join('')

  return (
    <div className={styles.hero}>
      <div className={styles.heroInner}>
        {/* Crest slot */}
        <div className={styles.heroCrestSlot}>
          {club.crestUrl ? (
            <img src={club.crestUrl} alt={club.name} className={styles.heroCrestImg} />
          ) : (
            <span className={styles.heroCrestMonogram}>{initials}</span>
          )}
        </div>

        <div className={styles.heroText}>
          <div className={styles.heroEyebrow}>Club Archive</div>
          <h1 className={styles.heroClubName}>{club.name}</h1>
          <div className={styles.heroMeta}>
            {[club.manager, game?.title].filter(Boolean).join('  ·  ')}
          </div>
        </div>
      </div>

      <div className={styles.heroGoldRule} />

      <div className={styles.heroRecord}>
        {[
          seasons.length > 0 && `${seasons.length} Season${seasons.length !== 1 ? 's' : ''}`,
          trophyCount > 0    && `${trophyCount} Trophies`,
          record,
        ].filter(Boolean).join('  ·  ')}
      </div>
    </div>
  )
}

// ─── SECTION 2: CLUB LEGACY STAT STRIP ───────────────────────────────────────
const ClubLegacyStrip = ({ seasons, trophyCount }) => {
  if (seasons.length === 0) return null

  const wins   = seasons.reduce((a, s) => a + (s.leagueW || 0), 0)
  const draws  = seasons.reduce((a, s) => a + (s.leagueD || 0), 0)
  const losses = seasons.reduce((a, s) => a + (s.leagueL || 0), 0)
  const played = wins + draws + losses
  const winRate = played > 0 ? Math.round((wins / played) * 100) : null

  const gf = seasons.reduce((a, s) => a + (s.leagueGF || 0), 0)
  const gpg = played > 0 ? (gf / played).toFixed(2) : null

  if (winRate === null && gpg === null) return null

  return (
    <div className={styles.legacyStrip}>
      {winRate !== null && (
        <div className={styles.legacyStat}>
          <span className={styles.legacyVal}>{winRate}<span className={styles.legacyUnit}>%</span></span>
          <span className={styles.legacyLabel}>Win Rate</span>
        </div>
      )}
      {winRate !== null && gpg !== null && <div className={styles.legacyDivider} />}
      {gpg !== null && (
        <div className={styles.legacyStat}>
          <span className={styles.legacyVal}>{gpg}</span>
          <span className={styles.legacyLabel}>Goals / Game</span>
        </div>
      )}
      {(winRate !== null || gpg !== null) && trophyCount > 0 && <div className={styles.legacyDivider} />}
      {trophyCount > 0 && (
        <div className={styles.legacyStat}>
          <span className={styles.legacyVal}>{trophyCount}</span>
          <span className={styles.legacyLabel}>Trophies</span>
        </div>
      )}
    </div>
  )
}

// ─── SECTION 3: PEAK SEASON CARD ─────────────────────────────────────────────
const PeakSeason = ({ seasons }) => {
  if (seasons.length === 0) return null

  const peak = seasons.reduce((best, s) =>
    (s.dynastyScore ?? -1) > (best?.dynastyScore ?? -1) ? s : best
  , null)

  if (!peak || peak.dynastyScore == null) return null

  const accomplishments = peakAccomplishments(peak)

  return (
    <Link to={`/seasons/${peak.id}`} className={styles.peakCard}>
      <div className={styles.peakTop}>
        <span className={styles.peakBadge}>Peak Season</span>
        <span className={styles.peakScore}>{peak.dynastyScore}</span>
      </div>
      <div className={styles.peakLabel}>{peak.label}</div>
      {accomplishments.length > 0 && (
        <div className={styles.peakAccomplishments}>
          {accomplishments.map((a, i) => (
            <span key={i} className={styles.peakAccomplishment}>{a}</span>
          ))}
        </div>
      )}
    </Link>
  )
}

// ─── SECTION 4: TROPHY CABINET ───────────────────────────────────────────────
const TrophyCabinet = ({ trophies }) => {
  const countByKey = {}
  trophies.forEach(t => {
    countByKey[t.competition] = (countByKey[t.competition] || 0) + 1
  })

  // Only won trophies, ordered by tier
  const wonList = TROPHY_REGISTRY
    .filter(t => countByKey[t.key] > 0)
    .sort((a, b) => {
      const ai = TIER_ORDER.indexOf(a.tier)
      const bi = TIER_ORDER.indexOf(b.tier)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  if (wonList.length === 0) return (
    <div className={styles.cabinet}>
      <div className={styles.sectionLabelRow}>
        <span className={styles.sectionLabel}>Honours</span>
      </div>
      <p className={styles.cabinetEmpty}>The cabinet is empty. For now.</p>
    </div>
  )

  return (
    <div className={styles.cabinet}>
      <div className={styles.sectionLabelRow}>
        <span className={styles.sectionLabel}>Honours</span>
        <Link to="/museum" className={styles.sectionLink}>Museum →</Link>
      </div>
      <div className={styles.cabinetShelf}>
        {wonList.map(t => {
          const count = countByKey[t.key]
          const TrophyShape = TrophySVG[t.key] || GenericTrophySVG
          return (
            <div key={t.key} className={styles.trophyItem}>
              <TrophyShape className={styles.trophySvg} />
              {count > 1 && <span className={styles.trophyCount}>×{count}</span>}
              <span className={styles.trophyName}>{t.short}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SECTION 5: DYNASTY ARC ──────────────────────────────────────────────────
const DynastyArc = ({ seasons }) => {
  if (seasons.length === 0) return null

  const maxScore = Math.max(...seasons.map(s => s.dynastyScore || 0))
  const peakId   = seasons.find(s => s.dynastyScore === maxScore && maxScore > 0)?.id

  // Seasons in chronological order (getSeasons returns year desc, so reverse)
  const ordered = [...seasons].reverse()

  return (
    <div className={styles.dynasty}>
      <div className={styles.sectionLabelRow}>
        <span className={styles.sectionLabel}>Dynasty Arc</span>
        <Link to="/seasons" className={styles.sectionLink}>All seasons →</Link>
      </div>

      <div className={styles.arcRows}>
        {ordered.map(s => {
          const score    = s.dynastyScore ?? null
          const isPeak   = s.id === peakId
          const hasPL    = s.leaguePosition === 1
          const hasUCL   = s.uclResult === 'Champions'
          const fillPct  = score != null ? Math.max(4, Math.round((score / 100) * 100)) : 0

          return (
            <Link key={s.id} to={`/seasons/${s.id}`} className={styles.arcRow}>
              <span className={styles.arcSeasonLabel}>{s.label}</span>
              <div className={styles.arcBarTrack}>
                <div
                  className={`${styles.arcBarFill} ${isPeak ? styles.arcBarPeak : ''}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              <span className={`${styles.arcScoreVal} ${isPeak ? styles.arcScorePeak : ''}`}>
                {score ?? '—'}
              </span>
              <div className={styles.arcBadges}>
                {isPeak  && <span className={styles.arcBadgePeak}>Peak</span>}
                {hasUCL  && <span className={styles.arcBadgeUCL}>★</span>}
                {hasPL   && !hasUCL && <span className={styles.arcBadgePL}>●</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── SECTION 6: CLUB LEGENDS ─────────────────────────────────────────────────
const ClubLegends = ({ players }) => {
  if (players.length === 0) return (
    <div className={styles.legends}>
      <div className={styles.sectionLabel}>Club Legends</div>
      <p className={styles.emptyText}>Add players to build your legends wall.</p>
    </div>
  )

  const sorted = [...players]
    .sort((a, b) => (b.apps || 0) - (a.apps || 0))
    .slice(0, 5)

  return (
    <div className={styles.legends}>
      <div className={styles.sectionLabelRow}>
        <span className={styles.sectionLabel}>Club Legends</span>
        <Link to="/players" className={styles.sectionLink}>Full roster →</Link>
      </div>
      <div className={styles.legendsList}>
        {sorted.map((player, i) => {
          const stats    = legendStats(player)
          const isLegend = player.status === 'Sold' && (player.apps || 0) >= 150
          const statusLabel = isLegend ? 'Legend' : (player.status || 'Active')
          const statusCls   = isLegend
            ? styles.statusLegend
            : player.status === 'Sold'
              ? styles.statusSold
              : styles.statusActive

          return (
            <Link key={player.id} to={`/players/${player.id}`} className={styles.legendRow}>
              {/* Rank */}
              <span className={styles.legendRank}>#{i + 1}</span>

              {/* Face */}
              <div className={styles.legendFace}>
                {player.sofifaId ? (
                  <img
                    src={`${CF}/${player.sofifaId}`}
                    alt={player.name}
                    className={styles.legendImg}
                    onError={e => {
                      e.target.style.display = 'none'
                      const sil = e.target.nextSibling
                      if (sil) sil.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div
                  className={styles.legendSilhouette}
                  style={{ display: player.sofifaId ? 'none' : 'flex' }}
                >
                  <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="20" cy="11" r="9" fill="var(--en-text-5)"/>
                    <path d="M4 44 Q4 28 20 28 Q36 28 36 44" fill="var(--en-text-5)"/>
                  </svg>
                </div>
              </div>

              {/* Info */}
              <div className={styles.legendInfo}>
                <span className={styles.legendName}>{player.name}</span>
                <span className={styles.legendMeta}>
                  <span className={styles.legendPos}>{player.position}</span>
                  <span className={`${styles.legendStatus} ${statusCls}`}>{statusLabel}</span>
                </span>
              </div>

              {/* Stats */}
              <div className={styles.legendStats}>
                {stats.map((st, si) => (
                  <div key={si} className={styles.legendStatCell}>
                    <span className={styles.legendStatVal}>{st.val}</span>
                    <span className={styles.legendStatLabel}>{st.label}</span>
                  </div>
                ))}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── MAIN HOME PAGE ───────────────────────────────────────────────────────────
const Home = () => {
  const { activeGame, activeClub } = useApp()
  const navigate = useNavigate()

  const [seasons, setSeasons] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeGame)  { navigate('/');      return }
    if (!activeClub)  { navigate('/clubs'); return }
    loadData()
  }, [activeGame, activeClub])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([
        getSeasons(activeClub.id),
        getPlayers(activeClub.id),
      ])
      setSeasons(s)
      setPlayers(p)
    } catch (err) {
      console.error('Home load error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!activeGame || !activeClub) return null

  const trophies    = deriveTrophiesFromSeasons(seasons)
  const trophyCount = trophies.length

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {loading ? <Loading /> : (
          <>
            <ClubHero
              club={activeClub}
              game={activeGame}
              seasons={seasons}
              trophyCount={trophyCount}
            />
            <ClubLegacyStrip seasons={seasons} trophyCount={trophyCount} />
            <PeakSeason seasons={seasons} />
            <TrophyCabinet trophies={trophies} />
            <DynastyArc seasons={seasons} />
            <ClubLegends players={players} />
          </>
        )}
      </div>
    </div>
  )
}

export default Home
