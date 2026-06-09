import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import { TROPHY_REGISTRY, TIER_ORDER, deriveTrophiesFromSeasons } from '../utils/trophyUtils'
import { TROPHY_PNG_MAP } from '../utils/trophyAssets'
import styles from './Museum.module.css'

// TrophyImage renders the real PNG if available, emoji fallback otherwise.
// Used for both shelf cards and the detail modal.
function TrophyImage({ competition, className }) {
  const src = TROPHY_PNG_MAP[competition]
  if (src) return (
    <img src={src} alt={competition} className={`${className} ${styles.trophyWon}`} />
  )
  // Fallback for competitions with no PNG (Championship, Europa League, Conference League)
  return (
    <div className={`${styles.trophyFallback} ${styles.trophyWon}`}>🏆</div>
  )
}

// ─── TROPHY DETAIL MODAL ─────────────────────────────────────────────────────
function TrophyDetail({ competition, wins, onClose }) {
  if (!competition) return null

  const reg = TROPHY_REGISTRY.find(t => t.key === competition)

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={competition}>
        <div className={styles.modalHandle} />

        <div className={styles.modalHeader}>
          <div className={styles.modalTrophyVis}>
            <TrophyImage competition={competition} className={styles.trophyImg} />
          </div>
          <div className={styles.modalTitleGroup}>
            <div className={styles.modalRegion}>{reg?.region}</div>
            <div className={styles.modalTitle}>{competition}</div>
            <div className={styles.modalWinCount}>×{wins.length} {wins.length === 1 ? 'title' : 'titles'}</div>
          </div>
        </div>

        <div className={styles.modalRule} />

        <div className={styles.modalWins}>
          {wins.map((w, i) => {
            const s = w.season
            return (
              <div key={i} className={styles.modalWinRow}>
                <span className={styles.modalWinSeason}>{w.seasonLabel}</span>
                <div className={styles.modalWinDetail}>
                  {competition === 'UEFA Champions League' && (
                    s.uclFinalOpponent && s.uclFinalScore
                      ? <span className={styles.modalWinSub}>Final vs {s.uclFinalOpponent} · {s.uclFinalScore}</span>
                      : <span className={styles.modalWinSubMuted}>Final details not recorded</span>
                  )}
                  {['Premier League','English Championship','La Liga','Bundesliga'].includes(competition) && (
                    s.leaguePts
                      ? <span className={styles.modalWinSub}>
                          {s.leaguePts} pts
                          {s.leagueW != null ? ` · ${s.leagueW}W ${s.leagueD ?? 0}D ${s.leagueL ?? 0}L` : ''}
                          {s.leagueGF != null ? ` · ${s.leagueGF} GF` : ''}
                        </span>
                      : <span className={styles.modalWinSubMuted}>League record not recorded</span>
                  )}
                  {competition === 'FA Cup' && (
                    s.faCupFinalOpponent
                      ? <span className={styles.modalWinSub}>Final vs {s.faCupFinalOpponent}</span>
                      : <span className={styles.modalWinSubMuted}>Final details not recorded</span>
                  )}
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
  const [selected, setSelected] = useState(null)

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

  const selectedWins = selected ? (byComp[selected] || []) : []

  return (
    <div className={styles.page}>
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

      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : (
          <div className={styles.shelf}>
            {sorted
              .filter(trophy => (byComp[trophy.key] || []).length > 0)
              .map(trophy => {
                const wins = byComp[trophy.key]
                return (
                  <button
                    key={trophy.key}
                    className={styles.trophyCard}
                    onClick={() => setSelected(trophy.key)}
                    aria-label={`${trophy.key} — ${wins.length} title${wins.length !== 1 ? 's' : ''}`}
                  >
                    <div className={styles.trophyVis}>
                      <TrophyImage competition={trophy.key} className={styles.trophyImg} />
                      <div className={styles.trophyGlow} />
                    </div>
                    <div className={styles.trophyName}>{trophy.key}</div>
                    <div className={styles.trophyRegion}>{trophy.region}</div>
                    <div className={styles.trophyCount}>×{wins.length}</div>
                  </button>
                )
              })
            }
          </div>
        )}
      </div>

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
