import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import { TROPHY_REGISTRY, TIER_ORDER, deriveTrophiesFromSeasons } from '../utils/trophyUtils'
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

// Museum-local: SVG asset map (visual concern, not shared)
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

function TrophySVG({ competition, won }) {
  const src = TROPHY_SVG_SRCS[competition]
  if (src) return (
    <img
      src={src}
      alt={competition}
      className={`${styles.trophyImg} ${won ? styles.trophyWon : styles.trophyUnearned}`}
    />
  )
  return (
    <div className={`${styles.trophyFallback} ${won ? styles.trophyWon : styles.trophyUnearned}`}>
      🏆
    </div>
  )
}

// ─── TROPHY DETAIL MODAL ─────────────────────────────────────────────────────
function TrophyDetail({ competition, wins, onClose }) {
  if (!competition) return null

  const reg = TROPHY_REGISTRY.find(t => t.key === competition)

  return (
    <>
      {/* Backdrop */}
      <div className={styles.modalBackdrop} onClick={onClose} aria-hidden="true" />

      {/* Sheet */}
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={competition}>
        <div className={styles.modalHandle} />

        {/* Trophy header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTrophyVis}>
            <TrophySVG competition={competition} won={true} />
          </div>
          <div className={styles.modalTitleGroup}>
            <div className={styles.modalRegion}>{reg?.region}</div>
            <div className={styles.modalTitle}>{competition}</div>
            <div className={styles.modalWinCount}>×{wins.length} {wins.length === 1 ? 'title' : 'titles'}</div>
          </div>
        </div>

        <div className={styles.modalRule} />

        {/* Season entries */}
        <div className={styles.modalWins}>
          {wins.map((w, i) => {
            const s = w.season
            return (
              <div key={i} className={styles.modalWinRow}>
                <span className={styles.modalWinSeason}>{w.seasonLabel}</span>
                <div className={styles.modalWinDetail}>
                  {/* UCL: show final opponent + score if available */}
                  {competition === 'UEFA Champions League' && (
                    s.uclFinalOpponent && s.uclFinalScore
                      ? <span className={styles.modalWinSub}>Final vs {s.uclFinalOpponent} · {s.uclFinalScore}</span>
                      : <span className={styles.modalWinSubMuted}>Final details not recorded</span>
                  )}

                  {/* League: show pts and record if available */}
                  {['Premier League','English Championship','La Liga','Bundesliga'].includes(competition) && (
                    s.leaguePts
                      ? <span className={styles.modalWinSub}>
                          {s.leaguePts} pts
                          {s.leagueW != null ? ` · ${s.leagueW}W ${s.leagueD ?? 0}D ${s.leagueL ?? 0}L` : ''}
                          {s.leagueGF != null ? ` · ${s.leagueGF} GF` : ''}
                        </span>
                      : <span className={styles.modalWinSubMuted}>League record not recorded</span>
                  )}

                  {/* FA Cup: final opponent if available */}
                  {competition === 'FA Cup' && (
                    s.faCupFinalOpponent
                      ? <span className={styles.modalWinSub}>Final vs {s.faCupFinalOpponent}</span>
                      : <span className={styles.modalWinSubMuted}>Final details not recorded</span>
                  )}

                  {/* Carabao Cup: final opponent if available */}
                  {competition === 'Carabao Cup' && (
                    s.carabaoCupFinalOpponent
                      ? <span className={styles.modalWinSub}>Final vs {s.carabaoCupFinalOpponent}</span>
                      : <span className={styles.modalWinSubMuted}>Final details not recorded</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button className={styles.modalClose} onClick={onClose}>Done</button>
      </div>
    </>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Museum() {
  const { activeClub } = useApp()
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // competition key of open modal

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    getSeasons(activeClub.id).then(s => {
      setSeasons(s)
      setLoading(false)
    })
  }, [activeClub])

  // All trophies derived from season data — single source of truth
  const allTrophies = deriveTrophiesFromSeasons(seasons)
  const totalWins = allTrophies.length

  // Group by competition key for O(1) lookup
  const byComp = {}
  for (const t of allTrophies) {
    if (!byComp[t.competition]) byComp[t.competition] = []
    byComp[t.competition].push(t)
  }

  // Sort registry by tier order for display
  const sorted = [...TROPHY_REGISTRY].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
  )

  const selectedWins = selected ? (byComp[selected] || []) : []

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
                  onClick={() => won && setSelected(trophy.key)}
                  disabled={!won}
                  aria-label={won ? `${trophy.key} — ${wins.length} title${wins.length !== 1 ? 's' : ''}` : trophy.key}
                >
                  <div className={styles.trophyVis}>
                    <TrophySVG competition={trophy.key} won={won} />
                    {won && <div className={styles.trophyGlow} />}
                  </div>
                  <div className={styles.trophyName}>{trophy.key}</div>
                  <div className={styles.trophyRegion}>{trophy.region}</div>
                  {won
                    ? <div className={styles.trophyCount}>×{wins.length}</div>
                    : <div className={styles.trophyNone}>—</div>
                  }
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── TROPHY DETAIL MODAL ── */}
      {selected && (
        <TrophyDetail
          competition={selected}
          wins={selectedWins}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
