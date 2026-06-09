// ─── TROPHY ASSET COMPONENTS ─────────────────────────────────────────────────
// SVG silhouettes retained as fallback for competitions with no PNG asset.
// TROPHY_PNG_MAP is the primary asset source for Home Honours.
// Home.jsx uses PNG when available, falls back to TrophySVG otherwise.

// ─── PNG ASSET MAP ────────────────────────────────────────────────────────────
// Keyed by TROPHY_REGISTRY competition key.
// Only competitions that have a real PNG asset are listed here.
// Missing entries → SVG fallback in TrophyCabinet.
import uclPng           from '../assets/trophies/ucl.png'
import premierLeaguePng from '../assets/trophies/premier-league.png'
import faCupPng         from '../assets/trophies/fa-cup.png'
import carabaoCupPng    from '../assets/trophies/carabao-cup.png'
import copaDelReyPng    from '../assets/trophies/copa-del-rey.png'
import dfbPokalPng      from '../assets/trophies/dfb-pokal.png'
import bundesligaPng    from '../assets/trophies/bundesliga.png'
import laLigaPng        from '../assets/trophies/la-liga.png'
import serieAPng        from '../assets/trophies/serie-a.png'
import coppaItaliaPng   from '../assets/trophies/coppa-italia.png'
import ligue1Png        from '../assets/trophies/ligue-1.png'
import coupeDeeFrancePng from '../assets/trophies/coupe-de-france.png'

export const TROPHY_PNG_MAP = {
  'UEFA Champions League':  uclPng,
  'Premier League':         premierLeaguePng,
  'FA Cup':                 faCupPng,
  'Carabao Cup':            carabaoCupPng,
  'Copa del Rey':           copaDelReyPng,
  'DFB-Pokal':              dfbPokalPng,
  'Bundesliga':             bundesligaPng,
  'La Liga':                laLigaPng,
  'Serie A':                serieAPng,
  'Coppa Italia':           coppaItaliaPng,
  'Ligue 1':                ligue1Png,
  'Coupe de France':        coupeDeeFrancePng,
  // No PNG available for: English Championship, UEFA Europa League, UEFA Conference League
  // Those fall back to TrophySVG below.
}

// ─── SVG FALLBACK COMPONENTS ──────────────────────────────────────────────────
// Used only for competitions that have no PNG in TROPHY_PNG_MAP.
// Each accepts a `className` prop. All use fill="currentColor".

export const TrophySVG = {
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
}

// Generic fallback for any unrecognised competition with no PNG
export const GenericTrophySVG = ({ className }) => (
  <svg className={className} viewBox="0 0 80 110" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M26 18 Q20 20 18 30 Q16 42 24 48 L26 50 L54 50 L56 48 Q64 42 62 30 Q60 20 54 18 Z"/>
    <path d="M22 26 Q12 24 11 34 Q10 44 22 46 L22 42 Q15 44 15 34 Q15 26 22 29 Z"/>
    <path d="M58 26 Q68 24 69 34 Q70 44 58 46 L58 42 Q65 44 65 34 Q65 26 58 29 Z"/>
    <path d="M26 50 L28 58 L52 58 L54 50 Z"/>
    <rect x="28" y="58" width="24" height="6" rx="2"/>
    <rect x="35" y="64" width="10" height="18" rx="1"/>
    <rect x="29" y="76" width="22" height="5" rx="2"/>
    <path d="M27 81 L25 88 Q24 92 27 93 L53 93 Q56 92 55 88 L53 81 Z"/>
    <rect x="21" y="93" width="38" height="5" rx="2"/>
    <rect x="17" y="98" width="46" height="5" rx="2"/>
  </svg>
)
