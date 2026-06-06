import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTrophies, getSeasons } from '../firebase/services'
import styles from './Museum.module.css'

// Trophy SVG imports — Vite resolves these to correct hashed paths at build time
import uclSvg        from '../assets/trophies/ucl.svg'
import plSvg         from '../assets/trophies/premier-league.svg'
import faCupSvg      from '../assets/trophies/fa-cup.svg'
import carabaoSvg    from '../assets/trophies/carabao.svg'
import champshipSvg  from '../assets/trophies/championship.svg'
import laLigaSvg     from '../assets/trophies/la-liga.svg'
import copaDelReySvg from '../assets/trophies/copa-del-rey.svg'
import bundesligaSvg from '../assets/trophies/bundesliga.svg'
import dfbPokalSvg   from '../assets/trophies/dfb-pokal.svg'
import uelSvg        from '../assets/trophies/uel.svg'
import ueclSvg       from '../assets/trophies/uecl.svg'

const TROPHY_SVG_SRCS = {
  'UEFA Champions League':  uclSvg,
  'Premier League':         plSvg,
  'FA Cup':                 faCupSvg,
  'Carabao Cup':            carabaoSvg,
  'English Championship':   champshipSvg,
  'La Liga':                laLigaSvg,
  'Copa del Rey':           copaDelReySvg,
  'Bundesliga':             bundesligaSvg,
  'DFB-Pokal':              dfbPokalSvg,
  'UEFA Europa League':     uelSvg,
  'UEFA Conference League': ueclSvg,
}

// ─── TROPHY CONFIG ────────────────────────────────────────────────────────────
const TROPHIES = [
  { key: 'UEFA Champions League',   icon: '🏆', tier: 'elite',    region: 'Europe' },
  { key: 'Premier League',          icon: '🥇', tier: 'league',   region: 'England' },
  { key: 'FA Cup',                  icon: '🏅', tier: 'cup',      region: 'England' },
  { key: 'Carabao Cup',             icon: '🥤', tier: 'cup',      region: 'England' },
  { key: 'English Championship',    icon: '🏅', tier: 'league',   region: 'England' },
  { key: 'La Liga',                 icon: '🥇', tier: 'league',   region: 'Spain' },
  { key: 'Copa del Rey',            icon: '🏅', tier: 'cup',      region: 'Spain' },
  { key: 'Bundesliga',              icon: '🥇', tier: 'league',   region: 'Germany' },
  { key: 'DFB-Pokal',               icon: '🏅', tier: 'cup',      region: 'Germany' },
  { key: 'UEFA Europa League',      icon: '🌕', tier: 'european', region: 'Europe' },
  { key: 'UEFA Conference League',  icon: '🌑', tier: 'european', region: 'Europe' },
]

const TIER_ORDER = ['elite', 'league', 'european', 'cup']

function TrophySVG({ competition, won }) {
  const src = TROPHY_SVG_SRCS[competition]

  if (src) return (
    <img src={src} alt={competition} className={`${styles.trophyImg} ${won ? styles.trophyWon : styles.trophyUnearned}`} />
  )

  return (
    <div className={`${styles.trophyFallback} ${won ? styles.trophyWon : styles.trophyUnearned}`}>
      {TROPHIES.find(t => t.key === competition)?.icon || '🏆'}
    </div>
  )
}

export default function Museum() {
  const { activeClub } = useApp()
  const [trophies, setTrophies] = useState([])
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([getTrophies(activeClub.id), getSeasons(activeClub.id)]).then(([t, s]) => {
      setTrophies(t)
      setSeasons(s)
      setLoading(false)
    })
  }, [activeClub])

  // Also derive trophies from season data (leaguePosition === 1, uclResult === 'Champions', etc.)
  const derivedTrophies = []
  for (const s of seasons) {
    if (s.leaguePosition === 1 && s.leagueCompetition)
      derivedTrophies.push({ competition: s.leagueCompetition, seasonId: s.id, seasonLabel: s.label })
    if (s.uclResult === 'Champions')
      derivedTrophies.push({ competition: 'UEFA Champions League', seasonId: s.id, seasonLabel: s.label })
    if (s.faCupResult === 'Winner')
      derivedTrophies.push({ competition: 'FA Cup', seasonId: s.id, seasonLabel: s.label })
    if (s.carabaoCupResult === 'Winner')
      derivedTrophies.push({ competition: 'Carabao Cup', seasonId: s.id, seasonLabel: s.label })
    if (s.uclELResult === 'Winner')
      derivedTrophies.push({ competition: 'UEFA Europa League', seasonId: s.id, seasonLabel: s.label })
    if (s.uclECLResult === 'Winner')
      derivedTrophies.push({ competition: 'UEFA Conference League', seasonId: s.id, seasonLabel: s.label })
  }

  // Merge Firestore trophies + derived (deduplicate by competition+seasonId)
  const allTrophies = [...derivedTrophies, ...trophies.filter(t =>
    !derivedTrophies.some(d => d.competition === t.competition && d.seasonId === t.seasonId)
  )]

  const totalWins = allTrophies.length
  const byComp = {}
  for (const t of allTrophies) {
    if (!byComp[t.competition]) byComp[t.competition] = []
    byComp[t.competition].push(t)
  }

  const sorted = [...TROPHIES].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))

  return (
    <div className={styles.page}>
      {/* ── HEADER ── */}
      <div className={styles.museumHeader}>
        <div className={styles.museumGlow} />
        <div className={styles.headerInner}>
          <span className={styles.headerLabel}>Club Museum</span>
          <div className={styles.headerTitle}>Trophy Cabinet</div>
          <div className={styles.headerCount}>
            <span className={styles.countNum}>{totalWins}</span>
            <span className={styles.countLabel}>trophies</span>
          </div>
        </div>
      </div>

      {/* ── TROPHY SHELF ── */}
      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : (
          <div className={styles.shelf}>
            {sorted.map(trophy => {
              const wins = byComp[trophy.key] || []
              const won = wins.length > 0
              return (
                <button
                  key={trophy.key}
                  className={`${styles.trophyCard} ${won ? styles.trophyCardWon : styles.trophyCardUnearned}`}
                  onClick={() => won && setSelected(trophy.key === selected ? null : trophy.key)}
                  disabled={!won}
                >
                  <div className={styles.trophyVis}>
                    <TrophySVG competition={trophy.key} won={won} />
                    {won && <div className={styles.trophyGlow} />}
                  </div>
                  <div className={styles.trophyName}>{trophy.key}</div>
                  <div className={styles.trophyRegion}>{trophy.region}</div>
                  {won ? (
                    <div className={styles.trophyCount}>×{wins.length}</div>
                  ) : (
                    <div className={styles.trophyNone}>—</div>
                  )}

                  {/* Expanded seasons won */}
                  {selected === trophy.key && wins.length > 0 && (
                    <div className={styles.trophySeasons}>
                      {wins.map((w, i) => (
                        <span key={i} className={styles.trophySeason}>{w.seasonLabel || '?'}</span>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── TIMELINE ── */}
        {!loading && totalWins > 0 && (
          <div className={styles.timeline}>
            <div className={styles.timelineLabel}>Trophy Timeline</div>
            {[...seasons].reverse().map(s => {
              const seasonTrophies = allTrophies.filter(t => t.seasonId === s.id)
              if (!seasonTrophies.length) return null
              return (
                <div key={s.id} className={styles.timelineRow}>
                  <span className={styles.timelineSeason}>{s.label}</span>
                  <div className={styles.timelineTrophies}>
                    {seasonTrophies.map((t, i) => (
                      <span key={i} className={styles.timelineTrophy}>{t.competition}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
