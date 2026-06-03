import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  getSeasons,
  getMatches,
  getPlayers,
  getTrophies,
} from '../firebase/services'
import styles from './Home.module.css'

// ─── TROPHY CONFIG ────────────────────────────────────────────────────────────

const TROPHY_LIST = [
  { key: 'UEFA Champions League', short: 'UCL',       icon: '★' },
  { key: 'UEFA Europa League',    short: 'Europa',    icon: '✦' },
  { key: 'UEFA Conference League',short: 'Conf.',     icon: '◆' },
  { key: 'Premier League',        short: 'Prem',      icon: '⬡' },
  { key: 'English Championship',  short: 'Champ',     icon: '⬡' },
  { key: 'La Liga',               short: 'La Liga',   icon: '⬡' },
  { key: 'Bundesliga',            short: 'Bundes',    icon: '⬡' },
  { key: 'FA Cup',                short: 'FA Cup',    icon: '⬤' },
  { key: 'Carabao Cup',           short: 'Carabao',  icon: '⬤' },
  { key: 'Copa del Rey',          short: 'Copa',      icon: '⬤' },
  { key: 'DFB-Pokal',             short: 'DFB',       icon: '⬤' },
]

// ─── DYNASTY SCORE TIER ──────────────────────────────────────────────────────

const dynastyTier = (score) => {
  if (!score && score !== 0) return { label: '—', cls: 'tierNone' }
  if (score >= 85) return { label: 'Elite',    cls: 'tierElite'  }
  if (score >= 70) return { label: 'Strong',   cls: 'tierStrong' }
  if (score >= 50) return { label: 'Average',  cls: 'tierAvg'    }
  return               { label: 'Rebuild',  cls: 'tierRebuild' }
}

const pillCls = (score) => {
  if (!score && score !== 0) return styles.pillNone
  if (score >= 85) return styles.pillElite
  if (score >= 70) return styles.pillStrong
  if (score >= 50) return styles.pillAvg
  return styles.pillRebuild
}

const barCls = (score) => {
  if (!score && score !== 0) return styles.barNone
  if (score >= 85) return styles.barElite
  if (score >= 70) return styles.barStrong
  if (score >= 50) return styles.barAvg
  return styles.barRebuild
}

// ─── POSITION STAT LABEL ─────────────────────────────────────────────────────

const legendStat = (player) => {
  const pos = player.position || ''
  if (pos === 'GK')  return { val: player.cleanSheets || 0, label: 'CS' }
  if (['CB','RB','LB','RWB','LWB'].includes(pos)) return { val: player.apps || 0, label: 'Apps' }
  if (['CDM','CM','CAM'].includes(pos)) return { val: player.assists || 0, label: 'Ast' }
  return { val: player.goals || 0, label: 'G' }
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <div className={styles.sectionLabel}>{children}</div>
)

const Loading = () => (
  <div className={styles.loadWrap}>
    <div className={styles.spinner} />
  </div>
)

// ─── SECTION 1: CLUB IDENTITY HERO ───────────────────────────────────────────

const ClubHero = ({ club, game, seasonCount, trophyCount }) => (
  <div
    className={styles.hero}
    style={{ '--crest': club.crestColor || 'var(--accent)' }}
  >
    <div className={styles.heroPitchLines} />
    <div className={styles.heroGlow} />

    <div className={styles.heroBody}>
      <div className={styles.heroLeft}>
        <h1 className={styles.heroClub}>{club.name}</h1>
        <div className={styles.heroMeta}>
          {club.manager && <span>{club.manager}</span>}
          {club.manager && club.formation && <span className={styles.dot}>·</span>}
          {club.formation && <span>{club.formation}</span>}
          {club.style && <><span className={styles.dot}>·</span><span>{club.style}</span></>}
        </div>
      </div>
      <div className={styles.heroRight}>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatVal}>{seasonCount}</span>
            <span className={styles.heroStatLabel}>Seasons</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <span className={styles.heroStatVal}>{trophyCount}</span>
            <span className={styles.heroStatLabel}>Trophies</span>
          </div>
        </div>
      </div>
    </div>

    <div className={styles.heroCrestLine} style={{ background: club.crestColor || 'var(--accent)' }} />
  </div>
)

// ─── SECTION 2: DYNASTY SCORE BANNER ─────────────────────────────────────────

const DynastyBanner = ({ seasons }) => {
  if (!seasons.length) return (
    <div className={styles.section}>
      <SectionLabel>Dynasty rating</SectionLabel>
      <div className={styles.emptyCard}>
        <span className={styles.emptyText}>No seasons logged yet</span>
      </div>
    </div>
  )

  const scored = seasons.filter(s => s.dynastyScore)
  const avg = scored.length
    ? Math.round(scored.reduce((a, s) => a + s.dynastyScore, 0) / scored.length * 10) / 10
    : null
  const tier = dynastyTier(avg)

  return (
    <div className={styles.section}>
      <SectionLabel>Dynasty rating</SectionLabel>
      <div className={styles.dynastyCard}>
        <div className={styles.dynastyMain}>
          <div className={styles.dynastyScore}>{avg ?? '—'}</div>
          <div className={styles.dynastyRight}>
            <div className={`${styles.dynastyTier} ${styles[tier.cls]}`}>{tier.label} Dynasty</div>
            <div className={styles.dynastyAcross}>Across {seasons.length} season{seasons.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className={styles.dynastyPills}>
          {[...seasons].reverse().map(s => (
            <Link
              key={s.id}
              to={`/seasons/${s.id}`}
              className={`${styles.dynastyPill} ${pillCls(s.dynastyScore)}`}
            >
              {s.label} {s.dynastyScore ?? '—'}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── SECTION 3: TROPHY CABINET ────────────────────────────────────────────────

const TrophyCabinet = ({ trophies }) => {
  const [expanded, setExpanded] = useState(null)

  const countByKey = {}
  const seasonsByKey = {}
  trophies.forEach(t => {
    countByKey[t.competition] = (countByKey[t.competition] || 0) + 1
    if (!seasonsByKey[t.competition]) seasonsByKey[t.competition] = []
    seasonsByKey[t.competition].push(t.seasonLabel || t.seasonId)
  })

  return (
    <div className={styles.section}>
      <SectionLabel>Trophy cabinet</SectionLabel>
      <div className={styles.cabinetScroll}>
        <div className={styles.cabinetRow}>
          {TROPHY_LIST.map(t => {
            const count = countByKey[t.key] || 0
            const won = count > 0
            const isOpen = expanded === t.key
            return (
              <button
                key={t.key}
                className={`${styles.trophyCard} ${won ? styles.trophyWon : styles.trophyGhost}`}
                onClick={() => won && setExpanded(isOpen ? null : t.key)}
                disabled={!won}
                title={t.key}
              >
                <span className={styles.trophyIcon}>{t.icon}</span>
                <span className={styles.trophyShort}>{t.short}</span>
                {won && (
                  <span className={styles.trophyCount}>×{count}</span>
                )}
                {isOpen && (
                  <div className={styles.trophySeasons}>
                    {seasonsByKey[t.key]?.join(', ')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {trophies.length === 0 && (
        <p className={styles.cabinetEmpty}>The cabinet is empty. For now.</p>
      )}
    </div>
  )
}

// ─── SECTION 4: CAREER TIMELINE ───────────────────────────────────────────────

const CareerTimeline = ({ seasons }) => (
  <div className={styles.section}>
    <SectionLabel>Career timeline</SectionLabel>

    {seasons.length === 0 ? (
      <div className={styles.emptyCard}>
        <span className={styles.emptyText}>Your story starts here. Log your first season.</span>
      </div>
    ) : (
      <div className={styles.timeline}>
        {seasons.map((s, i) => {
          const tier = dynastyTier(s.dynastyScore)
          return (
            <Link key={s.id} to={`/seasons/${s.id}`} className={styles.timelineRow}>
              <div className={`${styles.timelineBar} ${barCls(s.dynastyScore)}`} />
              <div className={styles.timelineCard}>
                <div className={styles.timelineLeft}>
                  <span className={styles.timelineLabel}>{s.label}</span>
                  <span className={styles.timelineYear}>{s.year}</span>
                </div>
                <div className={styles.timelineBadges}>
                  {s.leagueResult && (
                    <span className={`${styles.badge} ${styles.badgeGold}`}>{s.leagueResult}</span>
                  )}
                  {s.uclResult && (
                    <span className={`${styles.badge} ${styles.badgeUcl}`}>{s.uclResult}</span>
                  )}
                </div>
                <div className={styles.timelineRight}>
                  {s.dynastyScore ? (
                    <span className={`${styles.scorePill} ${pillCls(s.dynastyScore)}`}>
                      {s.dynastyScore}
                    </span>
                  ) : (
                    <span className={styles.scorePillNone}>—</span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    )}

    <Link to="/seasons" className={styles.addBtn}>
      + Add season
    </Link>
  </div>
)

// ─── SECTION 5: CLUB LEGENDS ──────────────────────────────────────────────────

const ClubLegends = ({ players }) => {
  if (players.length === 0) return (
    <div className={styles.section}>
      <SectionLabel>Club legends</SectionLabel>
      <div className={styles.emptyCard}>
        <span className={styles.emptyText}>Add players to your squad to build your legends wall.</span>
      </div>
    </div>
  )

  const sorted = [...players]
    .sort((a, b) => (b.apps || 0) - (a.apps || 0))
    .slice(0, 6)

  return (
    <div className={styles.section}>
      <div className={styles.sectionRow}>
        <SectionLabel>Club legends</SectionLabel>
        <Link to="/players" className={styles.sectionLink}>View squad →</Link>
      </div>
      <div className={styles.legendsGrid}>
        {sorted.map(player => {
          const stat = legendStat(player)
          const initials = player.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
          const isLegend = player.status === 'Sold' && (player.apps || 0) >= 150
          const statusLabel = isLegend ? 'Legend' : (player.status || 'Active')
          const statusCls = isLegend ? styles.statusLegend : player.status === 'Sold' ? styles.statusSold : styles.statusActive

          return (
            <Link key={player.id} to={`/players/${player.id}`} className={styles.legendCard}>
              {player.sofifaId ? (
                <img
                  src={`https://cdn.sofifa.net/players/${player.sofifaId}/26/180_60.png`}
                  alt={player.name}
                  className={styles.legendImg}
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div
                className={styles.legendAvatar}
                style={{ display: player.sofifaId ? 'none' : 'flex' }}
              >
                {initials}
              </div>
              <div className={styles.legendInfo}>
                <span className={styles.legendName}>{player.name}</span>
                <span className={styles.legendPos}>{player.position}</span>
                <span className={styles.legendStat}>{stat.val} {stat.label}</span>
                <span className={`${styles.legendStatus} ${statusCls}`}>{statusLabel}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── SECTION 6: CURRENT SEASON STATUS ────────────────────────────────────────

const CurrentSeason = ({ seasons }) => {
  const current = seasons[0]

  if (!current) return (
    <div className={`${styles.section} ${styles.currentSectionElevated}`}>
      <SectionLabel>Start your next chapter</SectionLabel>
      <div className={styles.currentEmpty}>
        <p className={styles.currentEmptyText}>Your legacy begins here.</p>
        <Link to="/seasons" className={`${styles.ctaPrimary}`}>
          + Begin Season 1
        </Link>
      </div>
    </div>
  )

  return (
    <div className={`${styles.section} ${styles.currentSectionElevated}`}>
      <SectionLabel>Current season</SectionLabel>
      <div className={styles.currentCard}>
        <div className={styles.currentRow}>
          <div className={styles.currentLeft}>
            <span className={styles.currentLabel}>{current.label}</span>
            {current.year && <span className={styles.currentYear}>{current.year}</span>}
          </div>
          <div className={styles.currentBadges}>
            {current.leagueResult && (
              <span className={`${styles.badge} ${styles.badgeGold}`}>{current.leagueResult}</span>
            )}
            {current.uclResult && (
              <span className={`${styles.badge} ${styles.badgeUcl}`}>{current.uclResult}</span>
            )}
          </div>
        </div>

        <Link to="/log-match" className={styles.logMatchBtn}>
          Log a match →
        </Link>
      </div>
    </div>
  )
}

// ─── SECTION 7: QUICK ACTIONS ─────────────────────────────────────────────────

const QuickActions = () => (
  <div className={styles.quickActions}>
    <Link to="/log-match" className={styles.ctaPrimary}>+ Log match</Link>
    <Link to="/seasons"   className={styles.ctaGhost}>+ Add season</Link>
  </div>
)

// ─── MAIN HOME PAGE ───────────────────────────────────────────────────────────

const Home = () => {
  const { activeGame, activeClub } = useApp()
  const navigate = useNavigate()

  const [seasons,  setSeasons]  = useState([])
  const [players,  setPlayers]  = useState([])
  const [trophies, setTrophies] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!activeGame)  { navigate('/');      return }
    if (!activeClub)  { navigate('/clubs'); return }
    loadData()
  }, [activeGame, activeClub])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, p, t] = await Promise.all([
        getSeasons(activeClub.id),
        getPlayers(activeClub.id),
        getTrophies(activeClub.id),
      ])
      setSeasons(s)
      setPlayers(p)
      setTrophies(t)
    } catch (err) {
      console.error('Home load error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!activeGame || !activeClub) return null

  const trophyCount = activeClub.trophyCount || trophies.length

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {loading ? <Loading /> : (
          <>
            <ClubHero
              club={activeClub}
              game={activeGame}
              seasonCount={seasons.length}
              trophyCount={trophyCount}
            />

            <DynastyBanner seasons={seasons} />

            <TrophyCabinet trophies={trophies} />

            <CareerTimeline seasons={seasons} />

            <ClubLegends players={players} />

            <CurrentSeason seasons={seasons} />

            <QuickActions />
          </>
        )}

      </div>
    </div>
  )
}

export default Home
