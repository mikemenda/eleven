import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getSeasons, getPlayers } from '../firebase/services'
import { TROPHY_REGISTRY, deriveTrophiesFromSeasons } from '../utils/trophyUtils'
import styles from './Home.module.css'

// ─── TROPHY SILHOUETTES ───────────────────────────────────────────────────────
// Each is a distinct SVG path representing the real trophy shape.

const TrophySVG = {
  'UEFA Champions League': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 22 Q8 18 6 30 Q4 42 16 46 Q20 48 24 46 L26 42 Q18 44 14 38 Q10 32 16 28 Q18 26 22 27 Z"/>
      <path d="M58 22 Q72 18 74 30 Q76 42 64 46 Q60 48 56 46 L54 42 Q62 44 66 38 Q70 32 64 28 Q62 26 58 27 Z"/>
      <path d="M26 16 Q24 18 22 22 L22 27 Q26 24 28 24 L52 24 Q54 24 58 27 L58 22 Q56 18 54 16 Z"/>
      <path d="M22 27 L24 46 L56 46 L58 27 Q54 24 52 24 L28 24 Q26 24 22 27 Z"/>
      <ellipse cx="40" cy="16" rx="14" ry="4"/>
      <path d="M24 46 L26 54 L54 54 L56 46 Z"/>
      <rect x="28" y="54" width="24" height="5" rx="2"/>
      <rect x="36" y="59" width="8" height="26" rx="1"/>
      <rect x="30" y="72" width="20" height="5" rx="2"/>
      <path d="M30 85 L28 90 Q27 94 30 95 L50 95 Q53 94 52 90 L50 85 Z"/>
      <rect x="24" y="95" width="32" height="5" rx="2"/>
      <rect x="20" y="100" width="40" height="5" rx="2"/>
    </svg>
  ),
  'UEFA Europa League': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M40 3 L41.5 7.5 L46 7.5 L42.5 10 L44 14.5 L40 12 L36 14.5 L37.5 10 L34 7.5 L38.5 7.5 Z"/>
      <path d="M26 24 Q22 24 20 32 Q18 44 24 52 Q30 58 40 58 Q50 58 56 52 Q62 44 60 32 Q58 24 54 24 Q50 20 40 20 Q30 20 26 24 Z"/>
      <path d="M20 34 Q12 34 12 40 Q12 46 20 48 L22 46 L22 42 Q16 44 16 40 Q16 36 20 37 Z"/>
      <path d="M60 34 Q68 34 68 40 Q68 46 60 48 L58 46 L58 42 Q64 44 64 40 Q64 36 60 37 Z"/>
      <path d="M30 58 L32 66 L48 66 L50 58 Z"/>
      <rect x="30" y="66" width="20" height="5" rx="2"/>
      <rect x="37" y="71" width="6" height="18" rx="1"/>
      <rect x="31" y="82" width="18" height="4" rx="2"/>
      <path d="M29 86 L27 92 Q26 96 29 97 L51 97 Q54 96 53 92 L51 86 Z"/>
      <rect x="23" y="97" width="34" height="5" rx="2"/>
      <rect x="19" y="102" width="42" height="4" rx="2"/>
    </svg>
  ),
  'UEFA Conference League': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M40 4 L41.8 9.5 L47.5 9.5 L43 13 L44.8 18.5 L40 15.2 L35.2 18.5 L37 13 L32.5 9.5 L38.2 9.5 Z"/>
      <path d="M26 26 L22 28 L19 36 L20 46 L24 52 L30 56 L50 56 L56 52 L60 46 L61 36 L58 28 L54 26 L46 22 L34 22 Z"/>
      <path d="M30 30 L27 36 L28 44 L32 50 L48 50 L52 44 L53 36 L50 30 L44 26 L36 26 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M30 56 L32 64 L48 64 L50 56 Z"/>
      <rect x="29" y="64" width="22" height="6" rx="2"/>
      <rect x="36" y="70" width="8" height="16" rx="1"/>
      <rect x="30" y="80" width="20" height="5" rx="2"/>
      <path d="M28 85 L26 92 Q25 96 28 97 L52 97 Q55 96 54 92 L52 85 Z"/>
      <rect x="22" y="97" width="36" height="5" rx="2"/>
      <rect x="18" y="102" width="44" height="4" rx="2"/>
    </svg>
  ),
  'Premier League': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M28 8 L32 2 L35 8 L38 3 L40 9 L42 3 L45 8 L48 2 L52 8 L50 14 L30 14 Z"/>
      <rect x="27" y="14" width="26" height="5" rx="1"/>
      <path d="M27 19 Q20 22 18 30 Q16 38 22 42 L24 44 L56 44 L58 42 Q64 38 62 30 Q60 22 53 19 Z"/>
      <path d="M22 26 Q12 26 10 32 Q8 38 14 40 Q18 42 22 38 L22 34 Q16 36 15 32 Q14 28 20 28 Z"/>
      <path d="M58 26 Q68 26 70 32 Q72 38 66 40 Q62 42 58 38 L58 34 Q64 36 65 32 Q66 28 60 28 Z"/>
      <path d="M24 44 L26 50 L54 50 L56 44 Z"/>
      <rect x="28" y="50" width="24" height="6" rx="2"/>
      <rect x="34" y="56" width="12" height="20" rx="1"/>
      <path d="M28 76 L26 82 Q25 86 28 87 L52 87 Q55 86 54 82 L52 76 Z"/>
      <rect x="22" y="87" width="36" height="6" rx="2"/>
      <rect x="18" y="93" width="44" height="5" rx="2"/>
    </svg>
  ),
  'English Championship': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="40" cy="7" r="5"/>
      <rect x="38" y="12" width="4" height="4"/>
      <path d="M28 16 Q28 14 40 14 Q52 14 52 16 L54 23 L26 23 Z"/>
      <rect x="25" y="23" width="30" height="4" rx="1"/>
      <path d="M25 27 Q17 30 16 38 Q15 46 20 50 L22 52 L58 52 L60 50 Q65 46 64 38 Q63 30 55 27 Z"/>
      <path d="M20 34 Q10 32 9 40 Q8 48 18 50 L22 48 L22 44 Q13 46 13 40 Q13 34 20 36 Z"/>
      <path d="M60 34 Q70 32 71 40 Q72 48 62 50 L58 48 L58 44 Q67 46 67 40 Q67 34 60 36 Z"/>
      <path d="M22 52 L24 60 L56 60 L58 52 Z"/>
      <rect x="26" y="60" width="28" height="6" rx="2"/>
      <rect x="35" y="66" width="10" height="16" rx="1"/>
      <rect x="29" y="76" width="22" height="5" rx="2"/>
      <path d="M26 81 L24 88 Q23 92 26 93 L54 93 Q57 92 56 88 L54 81 Z"/>
      <rect x="20" y="93" width="40" height="5" rx="2"/>
      <rect x="16" y="98" width="48" height="5" rx="2"/>
    </svg>
  ),
  'La Liga': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M30 10 L33 4 L36 9 L40 3 L44 9 L47 4 L50 10 L48 16 L32 16 Z"/>
      <rect x="30" y="16" width="20" height="4" rx="1"/>
      <path d="M30 20 Q26 22 25 28 L25 36 Q26 40 30 42 L50 42 Q54 40 55 36 L55 28 Q54 22 50 20 Z"/>
      <path d="M25 26 Q16 26 15 32 Q14 38 22 40 L25 38 L25 34 Q18 36 18 32 Q18 28 24 28 Z"/>
      <path d="M55 26 Q64 26 65 32 Q66 38 58 40 L55 38 L55 34 Q62 36 62 32 Q62 28 56 28 Z"/>
      <path d="M30 42 L28 50 L52 50 L50 42 Z"/>
      <rect x="26" y="50" width="28" height="6" rx="2"/>
      <rect x="35" y="56" width="10" height="20" rx="1"/>
      <rect x="28" y="70" width="24" height="5" rx="2"/>
      <path d="M26 75 L24 82 Q23 86 26 87 L54 87 Q57 86 56 82 L54 75 Z"/>
      <rect x="20" y="87" width="40" height="5" rx="2"/>
      <rect x="16" y="92" width="48" height="5" rx="2"/>
    </svg>
  ),
  'Bundesliga': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="40" cy="32" rx="34" ry="10"/>
      <path d="M6 32 Q6 49 40 52 Q74 49 74 32 L70 32 Q70 46 40 49 Q10 46 10 32 Z"/>
      <ellipse cx="40" cy="32" rx="28" ry="7" fill="none" stroke="currentColor" strokeWidth="2"/>
      <ellipse cx="40" cy="31" rx="20" ry="5"/>
      <path d="M34 52 L32 62 L48 62 L46 52 Z"/>
      <rect x="28" y="62" width="24" height="6" rx="2"/>
      <rect x="34" y="68" width="12" height="14" rx="1"/>
      <path d="M26 82 L24 88 Q23 92 26 93 L54 93 Q57 92 56 88 L54 82 Z"/>
      <rect x="20" y="93" width="40" height="5" rx="2"/>
      <rect x="16" y="98" width="48" height="4" rx="2"/>
    </svg>
  ),
  'FA Cup': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="40" cy="6" r="4"/>
      <rect x="38" y="10" width="4" height="5"/>
      <path d="M28 15 Q28 12 40 12 Q52 12 52 15 L54 22 L26 22 Z"/>
      <rect x="26" y="22" width="28" height="4" rx="1"/>
      <path d="M26 26 Q18 28 16 36 Q14 46 22 50 L24 52 L56 52 L58 50 Q66 46 64 36 Q62 28 54 26 Z"/>
      <path d="M22 32 Q10 32 10 40 Q10 48 20 48 L22 46 L22 42 Q14 44 14 40 Q14 36 20 36 Z"/>
      <path d="M58 32 Q70 32 70 40 Q70 48 60 48 L58 46 L58 42 Q66 44 66 40 Q66 36 60 36 Z"/>
      <path d="M24 52 L26 60 L54 60 L56 52 Z"/>
      <rect x="27" y="60" width="26" height="6" rx="2"/>
      <rect x="35" y="66" width="10" height="18" rx="1"/>
      <rect x="29" y="78" width="22" height="5" rx="2"/>
      <path d="M26 83 L24 89 Q23 93 26 94 L54 94 Q57 93 56 89 L54 83 Z"/>
      <rect x="20" y="94" width="40" height="5" rx="2"/>
      <rect x="16" y="99" width="48" height="5" rx="2"/>
    </svg>
  ),
  'Carabao Cup': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="40" cy="8" r="3"/>
      <rect x="38.5" y="11" width="3" height="4"/>
      <path d="M30 15 Q30 13 40 13 Q50 13 50 15 L52 20 L28 20 Z"/>
      <rect x="27" y="20" width="26" height="3" rx="1"/>
      <path d="M27 23 Q18 25 16 33 Q14 41 20 45 L22 47 L58 47 L60 45 Q66 41 64 33 Q62 25 53 23 Z"/>
      <path d="M20 30 Q8 28 7 36 Q6 44 18 46 L22 44 L22 40 Q12 42 12 36 Q12 30 20 33 Z"/>
      <path d="M60 30 Q72 28 73 36 Q74 44 62 46 L58 44 L58 40 Q68 42 68 36 Q68 30 60 33 Z"/>
      <path d="M22 47 L24 54 L56 54 L58 47 Z"/>
      <rect x="26" y="54" width="28" height="7" rx="3"/>
      <rect x="36" y="61" width="8" height="16" rx="1"/>
      <rect x="30" y="71" width="20" height="5" rx="2"/>
      <path d="M28 76 L26 82 Q25 86 28 87 L52 87 Q55 86 54 82 L52 76 Z"/>
      <rect x="22" y="87" width="36" height="5" rx="2"/>
      <rect x="18" y="92" width="44" height="5" rx="2"/>
    </svg>
  ),
  'Copa del Rey': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M28 12 L31 5 L35 11 L40 4 L45 11 L49 5 L52 12 L50 18 L30 18 Z"/>
      <rect x="28" y="18" width="24" height="4" rx="1"/>
      <path d="M28 22 Q19 24 17 34 Q15 44 22 48 L24 50 L56 50 L58 48 Q65 44 63 34 Q61 24 52 22 Z"/>
      <path d="M22 28 Q10 26 9 35 Q8 44 20 48 L24 46 L24 40 Q14 44 13 36 Q12 28 20 30 Z"/>
      <path d="M58 28 Q70 26 71 35 Q72 44 60 48 L56 46 L56 40 Q66 44 67 36 Q68 28 60 30 Z"/>
      <path d="M24 50 L26 58 L54 58 L56 50 Z"/>
      <rect x="27" y="58" width="26" height="6" rx="2"/>
      <rect x="35" y="64" width="10" height="16" rx="1"/>
      <rect x="29" y="74" width="22" height="5" rx="2"/>
      <path d="M27 79 L25 86 Q24 90 27 91 L53 91 Q56 90 55 86 L53 79 Z"/>
      <rect x="21" y="91" width="38" height="5" rx="2"/>
      <rect x="17" y="96" width="46" height="5" rx="2"/>
    </svg>
  ),
  'DFB-Pokal': ({ className }) => (
    <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="40" cy="7" r="3.5"/>
      <rect x="38.5" y="10" width="3" height="5"/>
      <path d="M29 15 Q29 13 40 13 Q51 13 51 15 L52 21 L28 21 Z"/>
      <rect x="27" y="21" width="26" height="3" rx="1"/>
      <path d="M27 24 Q19 26 18 34 Q17 42 22 46 L24 48 L56 48 L58 46 Q63 42 62 34 Q61 26 53 24 Z"/>
      <path d="M22 30 L14 28 L12 36 L14 42 L22 42 L22 38 L16 38 L16 32 L22 34 Z"/>
      <path d="M58 30 L66 28 L68 36 L66 42 L58 42 L58 38 L64 38 L64 32 L58 34 Z"/>
      <path d="M24 48 L26 56 L54 56 L56 48 Z"/>
      <rect x="27" y="56" width="26" height="6" rx="2"/>
      <rect x="35" y="62" width="10" height="18" rx="1"/>
      <rect x="30" y="74" width="20" height="5" rx="2"/>
      <path d="M28 79 L26 86 Q25 90 28 91 L52 91 Q55 90 54 86 L52 79 Z"/>
      <rect x="22" y="91" width="36" height="5" rx="2"/>
      <rect x="18" y="96" width="44" height="5" rx="2"/>
    </svg>
  ),
}

// ─── TROPHY CONFIG ────────────────────────────────────────────────────────────
// TROPHY_LIST is now TROPHY_REGISTRY from trophyUtils — single source of truth.
// Aliased here so TrophyCabinet below needs no other changes.
const TROPHY_LIST = TROPHY_REGISTRY

// ─── STAT HELPERS ─────────────────────────────────────────────────────────────
const legendStat = (player) => {
  const pos = player.position || ''
  if (pos === 'GK') return { val: player.cleanSheets || 0, label: 'CS' }
  if (['CB','RB','LB','RWB','LWB'].includes(pos)) return { val: player.apps || 0, label: 'Apps' }
  if (['CDM','CM','CAM'].includes(pos)) return { val: player.assists || 0, label: 'Ast' }
  return { val: player.goals || 0, label: 'G' }
}

// Dynasty score visual tier
const dynastySize = (score) => {
  if (!score && score !== 0) return 'none'
  if (score >= 85) return 'peak'
  if (score >= 65) return 'mid'
  return 'dip'
}

// ─── LOADING ──────────────────────────────────────────────────────────────────
const Loading = () => (
  <div className={styles.loadWrap}>
    <div className={styles.spinner} />
  </div>
)

// ─── SECTION 1: CLUB HERO ────────────────────────────────────────────────────
const ClubHero = ({ club, seasonCount, trophyCount }) => (
  <div className={styles.hero}>
    <div className={styles.heroEyebrow}>Current save</div>
    <h1 className={styles.heroClubName}>{club.name}</h1>
    <div className={styles.heroIdentityRule} />
    <div className={styles.heroMeta}>
      {[
        seasonCount > 0 && `${seasonCount} Season${seasonCount !== 1 ? 's' : ''}`,
        trophyCount > 0 && `${trophyCount} Trophies`,
        club.manager,
        club.style,
      ].filter(Boolean).join(' · ')}
    </div>
    <div className={styles.heroRule} />
  </div>
)

// ─── SECTION 2: TROPHY CABINET ───────────────────────────────────────────────
const TrophyCabinet = ({ trophies }) => {
  const countByKey = {}
  const seasonsByKey = {}
  trophies.forEach(t => {
    countByKey[t.competition] = (countByKey[t.competition] || 0) + 1
    if (!seasonsByKey[t.competition]) seasonsByKey[t.competition] = []
    seasonsByKey[t.competition].push(t.seasonLabel || t.seasonId)
  })

  const totalWon = trophies.length

  // Only show won trophies + the first few not yet won (up to 4 unearned)
  const wonList = TROPHY_LIST.filter(t => countByKey[t.key] > 0)
  const unearnedList = TROPHY_LIST.filter(t => !countByKey[t.key]).slice(0, 4)
  const displayList = [...wonList, ...unearnedList]

  return (
    <div className={styles.cabinet}>
      <div className={styles.sectionLabel}>Trophy cabinet</div>
      <div className={styles.cabinetShelf}>
        {displayList.map(t => {
          const count = countByKey[t.key] || 0
          const won = count > 0
          const TrophyShape = TrophySVG[t.key]
          if (!TrophyShape) return null
          return (
            <div key={t.key} className={won ? styles.trophyItem : styles.trophyItemGhost}>
              <TrophyShape className={won ? styles.trophySvgWon : styles.trophySvgGhost} />
              {won && <span className={styles.trophyCount}>{count}</span>}
              <span className={styles.trophyName}>{t.short}</span>
            </div>
          )
        })}
      </div>
      {totalWon > 0 && (
        <div className={styles.cabinetTotal}>
          <span className={styles.cabinetTotalNum}>{totalWon}</span>
          <span className={styles.cabinetTotalLabel}>Major honours · All seasons</span>
        </div>
      )}
      {totalWon === 0 && (
        <p className={styles.cabinetEmpty}>The cabinet is empty. For now.</p>
      )}
    </div>
  )
}

// ─── SECTION 3: CLUB LEGACY ──────────────────────────────────────────────────
const ClubLegacy = ({ seasons }) => {
  if (seasons.length === 0) return null

  // Fields use the canonical leagueW/leagueD/leagueL/leagueGF/leagueGA schema.
  // Do NOT use wins/draws/losses/goalsFor/goalsAgainst — those fields do not exist.
  const wins = seasons.reduce((a, s) => a + (s.leagueW || 0), 0)
  const draws = seasons.reduce((a, s) => a + (s.leagueD || 0), 0)
  const losses = seasons.reduce((a, s) => a + (s.leagueL || 0), 0)
  const played = wins + draws + losses
  const winRate = played > 0 ? Math.round((wins / played) * 100) : null

  // Derive league titles directly from season data (leaguePosition === 1)
  const leagueTitles = seasons.filter(s => s.leaguePosition === 1).length

  const uclFinals = seasons.filter(s =>
    s.uclResult && (s.uclResult.toLowerCase().includes('winner') || s.uclResult.toLowerCase().includes('runner') || s.uclResult.toLowerCase().includes('final'))
  ).length

  const goalsFor = seasons.reduce((a, s) => a + (s.leagueGF || 0), 0)
  const goalsAgainst = seasons.reduce((a, s) => a + (s.leagueGA || 0), 0)

  const stats = [
    winRate !== null   ? { val: `${winRate}%`, label: 'Win rate',      featured: true }  : null,
    leagueTitles > 0   ? { val: leagueTitles,   label: 'League titles', featured: true }  : null,
    uclFinals > 0      ? { val: uclFinals,       label: 'UCL finals',   featured: false } : null,
    goalsFor > 0       ? { val: goalsFor,         label: 'Goals scored', featured: false } : null,
  ].filter(Boolean)

  if (stats.length === 0) return null

  return (
    <div className={styles.legacy}>
      <div className={styles.sectionLabel}>Club legacy</div>
      <div className={styles.legacyGrid}>
        {stats.map((s, i) => (
          <div key={i} className={s.featured ? styles.legacyStatFeatured : styles.legacyStat}>
            <div className={s.featured ? styles.legacyValFeatured : styles.legacyVal}>{s.val}</div>
            <div className={styles.legacyLabel}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SECTION 4: DYNASTY ARC ──────────────────────────────────────────────────
const DynastyArc = ({ seasons }) => {
  if (seasons.length === 0) return null

  return (
    <div className={styles.dynasty}>
      <div className={styles.sectionLabelRow}>
        <span className={styles.sectionLabel}>Dynasty arc</span>
        <Link to="/seasons" className={styles.sectionLink}>All seasons →</Link>
      </div>
      <div className={styles.arcBaseline}>
        <div className={styles.arcRow}>
          {[...seasons].reverse().map((s) => {
            const tier = dynastySize(s.dynastyScore)
            const hasPL = s.leagueResult && s.leagueResult.toLowerCase().includes('1st')
            const hasUCL = s.uclResult && (s.uclResult.toLowerCase().includes('winner') || s.uclResult.toLowerCase().includes('won'))
            return (
              <Link key={s.id} to={`/seasons/${s.id}`} className={styles.arcGroup}>
                <span className={`${styles.arcSeasonLabel} ${tier === 'peak' ? styles.arcSeasonPeak : ''}`}>
                  {s.label}
                </span>
                <span className={`${styles.arcScore} ${styles[`arcScore_${tier}`]}`}>
                  {s.dynastyScore ?? '—'}
                </span>
                <div className={styles.arcPips}>
                  {hasPL  && <span className={styles.pipGreen} />}
                  {hasUCL && <span className={styles.pipGold} />}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <div className={styles.arcLegend}>
        <span className={styles.arcLegendItem}><span className={styles.pipGreen} /> PL title</span>
        <span className={styles.arcLegendItem}><span className={styles.pipGold} /> UCL won</span>
        <span className={styles.arcLegendItem}><span className={`${styles.arcLegendDot} ${styles.arcLegendBlue}`} /> Peak season</span>
      </div>
    </div>
  )
}

// ─── SECTION 5: CLUB LEGENDS ─────────────────────────────────────────────────
const ClubLegends = ({ players }) => {
  if (players.length === 0) return (
    <div className={styles.legends}>
      <div className={styles.sectionLabel}>Club legends</div>
      <p className={styles.emptyText}>Add players to your squad to build your legends wall.</p>
    </div>
  )

  const sorted = [...players]
    .sort((a, b) => (b.apps || 0) - (a.apps || 0))
    .slice(0, 5)

  // Shirt numbers are positional — assign by index for display
  const shirtNumbers = [10, 8, 11, 1, 9]

  return (
    <div className={styles.legends}>
      <div className={styles.sectionLabelRow}>
        <span className={styles.sectionLabel}>Club legends</span>
        <Link to="/players" className={styles.sectionLink}>Full roster →</Link>
      </div>
      <div className={styles.legendsList}>
        {sorted.map((player, i) => {
          const stat = legendStat(player)
          const isLegend = player.status === 'Sold' && (player.apps || 0) >= 150
          const statusLabel = isLegend ? 'Legend' : (player.status || 'Active')
          const statusCls = isLegend
            ? styles.statusLegend
            : player.status === 'Sold'
              ? styles.statusSold
              : styles.statusActive
          return (
            <Link key={player.id} to={`/players/${player.id}`} className={styles.legendRow}>
              <span className={styles.legendShirtNum}>{shirtNumbers[i] ?? i + 1}</span>
              <div className={styles.legendDivider} />
              <div className={styles.legendFace}>
                {player.sofifaId ? (
                  <img
                    src={`https://cdn.sofifa.net/players/${player.sofifaId}/26/180_60.png`}
                    alt={player.name}
                    className={styles.legendImg}
                    onError={e => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div
                  className={styles.legendSilhouette}
                  style={{ display: player.sofifaId ? 'none' : 'flex' }}
                >
                  <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="20" cy="11" r="9" fill="var(--en-blue)"/>
                    <path d="M4 44 Q4 28 20 28 Q36 28 36 44" fill="var(--en-blue)"/>
                  </svg>
                </div>
              </div>
              <div className={styles.legendInfo}>
                <span className={styles.legendName}>{player.name}</span>
                <span className={styles.legendRole}>{player.position} · {statusLabel}</span>
                <span className={`${styles.legendStatus} ${statusCls}`} />
              </div>
              <div className={styles.legendStatBlock}>
                <span className={styles.legendStatVal}>{stat.val}</span>
                <span className={styles.legendStatLabel}>{stat.label}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── SECTION 6: LOG MATCH ACTION ─────────────────────────────────────────────
const LogMatchAction = ({ seasons }) => {
  const current = seasons[0]
  return (
    <div className={styles.logSection}>
      <Link to="/seasons" className={styles.logBtn}>
        <div className={styles.logBtnLeft}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 6.5V10.5L12.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div className={styles.logBtnText}>View seasons</div>
            {current && (
              <div className={styles.logBtnSub}>{current.label} · Active</div>
            )}
          </div>
        </div>
        <span className={styles.logBtnArrow}>→</span>
      </Link>
      <Link to="/seasons" className={styles.secondaryBtn}>
        {current ? 'View all seasons' : '+ Begin Season 1'}
      </Link>
    </div>
  )
}

// ─── MAIN HOME PAGE ───────────────────────────────────────────────────────────
const Home = () => {
  const { activeGame, activeClub } = useApp()
  const navigate = useNavigate()

  const [seasons,  setSeasons]  = useState([])
  const [players,  setPlayers]  = useState([])
  const [loading,  setLoading]  = useState(true)

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

  // Derive trophies from season data — single source of truth (same as Museum)
  const trophies = deriveTrophiesFromSeasons(seasons)
  const trophyCount = trophies.length

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {loading ? <Loading /> : (
          <>
            <ClubHero
              club={activeClub}
              seasonCount={seasons.length}
              trophyCount={trophyCount}
            />
            <TrophyCabinet trophies={trophies} />
            <ClubLegacy seasons={seasons} />
            <DynastyArc seasons={seasons} />
            <ClubLegends players={players} />
            <LogMatchAction seasons={seasons} />
          </>
        )}
      </div>
    </div>
  )
}

export default Home
