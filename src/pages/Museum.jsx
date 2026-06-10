import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import { TROPHY_REGISTRY, TIER_ORDER, deriveTrophiesFromSeasons } from '../utils/trophyUtils'
import { TROPHY_PNG_MAP } from '../utils/trophyAssets'
import styles from './Museum.module.css'

// ─── TROPHY IMAGE ─────────────────────────────────────────────────────────────
function TrophyImage({ competition, className }) {
  const src = TROPHY_PNG_MAP[competition]
  if (src) return (
    <img src={src} alt={competition} className={`${className} ${styles.trophyWon}`} />
  )
  return (
    <div className={`${styles.trophyFallback} ${styles.trophyWon}`}>🏆</div>
  )
}

// ─── ACCORDION WIN ROWS ───────────────────────────────────────────────────────
function WinRows({ competition, wins }) {
  return (
    <div className={styles.accordionBody}>
      <div className={styles.accordionRule} />
      <div className={styles.winList}>
        {wins.map((w, i) => {
          const s = w.season
          return (
            <div key={i} className={styles.winRow}>
              <span className={styles.winSeason}>{w.seasonLabel}</span>
              <div className={styles.winDetail}>
                {competition === 'UEFA Champions League' && (
                  s.uclFinalOpponent && s.uclFinalScore
                    ? <span className={styles.winSub}>Final vs {s.uclFinalOpponent} · {s.uclFinalScore}</span>
                    : <span className={styles.winSubMuted}>Final details not recorded</span>
                )}
                {['Premier League', 'English Championship', 'La Liga', 'Bundesliga'].includes(competition) && (
                  s.leaguePts
                    ? <span className={styles.winSub}>
                        {s.leaguePts} pts
                        {s.leagueW != null ? ` · ${s.leagueW}W ${s.leagueD ?? 0}D ${s.leagueL ?? 0}L` : ''}
                        {s.leagueGF != null ? ` · ${s.leagueGF} GF` : ''}
                      </span>
                    : <span className={styles.winSubMuted}>League record not recorded</span>
                )}
                {competition === 'FA Cup' && (
                  s.faCupFinalOpponent
                    ? <span className={styles.winSub}>Final vs {s.faCupFinalOpponent}</span>
                    : <span className={styles.winSubMuted}>Final details not recorded</span>
                )}
                {competition === 'Carabao Cup' && (
                  s.carabaoCupFinalOpponent
                    ? <span className={styles.winSub}>Final vs {s.carabaoCupFinalOpponent}</span>
                    : <span className={styles.winSubMuted}>Final details not recorded</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Museum() {
  const { activeClub } = useApp()
  const [seasons, setSeasons]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    getSeasons(activeClub.id).then(s => {
      setSeasons(s)
      setLoading(false)
    })
  }, [activeClub])

  const allTrophies = deriveTrophiesFromSeasons(seasons)
  const totalWins   = allTrophies.length

  const byComp = {}
  for (const t of allTrophies) {
    if (!byComp[t.competition]) byComp[t.competition] = []
    byComp[t.competition].push(t)
  }

  const sorted = [...TROPHY_REGISTRY].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
  )

  const wonTrophies = sorted.filter(trophy => (byComp[trophy.key] || []).length > 0)

  function handleRowTap(key) {
    setExpanded(prev => (prev === key ? null : key))
  }

  return (
    <div className={styles.page}>
      {/* ── HERO ── */}
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

      {/* ── HONOURS LIST ── */}
      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : (
          <div className={styles.honoursList}>
            {wonTrophies.map((trophy, idx) => {
              const wins      = byComp[trophy.key]
              const isOpen    = expanded === trophy.key
              const isLast    = idx === wonTrophies.length - 1

              return (
                <div
                  key={trophy.key}
                  className={`${styles.honourItem} ${isLast ? styles.honourItemLast : ''}`}
                >
                  {/* ── ROW HEADER (tap target) ── */}
                  <button
                    className={`${styles.honourRow} ${isOpen ? styles.honourRowOpen : ''}`}
                    onClick={() => handleRowTap(trophy.key)}
                    aria-expanded={isOpen}
                    aria-label={`${trophy.key} — ${wins.length} title${wins.length !== 1 ? 's' : ''}`}
                  >
                    {/* Left: trophy PNG */}
                    <div className={styles.rowTrophyVis}>
                      <TrophyImage competition={trophy.key} className={styles.rowTrophyImg} />
                    </div>

                    {/* Middle: name + region + count */}
                    <div className={styles.rowMeta}>
                      <div className={styles.rowName}>{trophy.key}</div>
                      <div className={styles.rowRegion}>{trophy.region}</div>
                      <div className={styles.rowCount}>
                        ×{wins.length} {wins.length === 1 ? 'title' : 'titles'}
                      </div>
                    </div>

                    {/* Right: chevron */}
                    <div className={`${styles.rowChevron} ${isOpen ? styles.rowChevronOpen : ''}`}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  {/* ── ACCORDION BODY (inline, no clipping) ── */}
                  {isOpen && (
                    <WinRows competition={trophy.key} wins={wins} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
