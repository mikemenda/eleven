import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import {
  HISTORY_COMPETITIONS,
  COUNTRY_ECOSYSTEM,
  LEAGUE_KEYS,
  resolveCompetitionKeys,
  deriveHistoryFromSeasons,
  detectTrebles,
  detectBackToBackUCL,
  computeEraLeaders,
  filterFCRichportInvolvement,
  getCompetitionHistory,
  getSeasonLabels,
} from '../utils/historyUtils'
import TRANSFER_CLUBS from '../../data/transfer-clubs.json'
import styles from './History.module.css'

// Trophy PNG assets — shared map from trophyAssets.jsx (12 competitions)
import { TROPHY_PNG_MAP } from '../utils/trophyAssets'

// Emoji fallback for competitions with no PNG asset yet
const COMP_EMOJI = {
  'English Championship':   '🏆',
  'UEFA Europa League':     '🏆',
  'UEFA Conference League': '🏆',
  'Serie A':                '🇮🇹',
  'Coppa Italia':           '🇮🇹',
  'Ligue 1':                '🇫🇷',
  'Coupe de France':        '🇫🇷',
}

const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function resolveTeamId(clubName) {
  if (!clubName) return null
  return TRANSFER_CLUBS[clubName.trim().toLowerCase()]?.sofifaTeamId ?? null
}

function ordinal(n) {
  if (!n) return ''
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

function TrophyIcon({ competition, size = 26 }) {
  const src = TROPHY_PNG_MAP[competition]
  if (src) return <img src={src} alt="" className={styles.compIcon} style={{ width: size, height: size }} />
  const emoji = COMP_EMOJI[competition]
  return <span className={styles.compIconEmoji} style={{ fontSize: size * 0.72 }}>{emoji || '🏆'}</span>
}

// ─── CLUB BADGE ───────────────────────────────────────────────────────────────
// For the active/user club, uses the same RichportMark pattern as Records.jsx:
// Inter 800, var(--en-gold) "XI" mark, gold border, dark surface.
// This is the shared identity used across Records, UCL, and now History.
// When a future global crestUrl is added to activeClub, this component is the
// single place to update — History will automatically reflect it.
//
// For opponent clubs: resolves sofifaTeamId via transfer-clubs.json → CF Worker.
// Falls back to a neutral shield if no crest is available.

function ClubBadge({ clubName, size = 30, isUserClub = false, crestUrl = null }) {
  const [err, setErr] = useState(false)

  // User club identity — matches RichportMark in Records.jsx
  // Future: if crestUrl is passed in (from activeClub.crestUrl), use that first
  if (isUserClub) {
    if (crestUrl && !err) {
      return (
        <img
          src={crestUrl}
          alt={clubName}
          style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0,
                   borderRadius: 4, display: 'block' }}
          onError={() => setErr(true)}
        />
      )
    }
    // Monogram fallback — matches Records.jsx RichportMark exactly
    return (
      <div className={styles.richportMark} style={{ width: size, height: size }}>
        <span style={{
          fontFamily: 'var(--font-inter)',
          fontSize: Math.round(size * 0.38) + 'px',
          fontWeight: 800,
          color: 'var(--en-gold)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          userSelect: 'none',
        }}>XI</span>
      </div>
    )
  }

  // Opponent / external club
  const teamId = resolveTeamId(clubName)
  if (!teamId || err) {
    return (
      <div className={styles.shieldFallback} style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" fill="none" width={size * 0.6} height={size * 0.6}>
          <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2Z"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
            style={{ color: 'var(--en-text-4)' }} />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={`${WORKER_BASE}/team/${teamId}`}
      alt={clubName}
      className={styles.clubBadgeImg}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}

// ─── COMPETITION DETAIL MODAL ─────────────────────────────────────────────────

function CompetitionModal({ competition, historyEntries, clubName, activeClub, onClose }) {
  const compHistory = getCompetitionHistory(historyEntries, competition.key)
  const compInfo    = HISTORY_COMPETITIONS.find(c => c.key === competition.key)
  const isLeague    = LEAGUE_KEYS.has(competition.key)

  // Title count map for this competition
  const titleMap = {}
  for (const e of compHistory) {
    if (e.winner && e.hasData) titleMap[e.winner] = (titleMap[e.winner] || 0) + 1
  }
  // Show up to 5 winners, stable sort by count desc then name asc
  const topWinners = Object.entries(titleMap)
    .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
    .slice(0, 5)

  const totalRecorded = compHistory.filter(e => e.hasData).length

  const isUserClub = (club) => club === clubName
  const userCrestUrl = activeClub?.crestUrl || null

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={competition.key}>
        <div className={styles.modalHandle} />

        <div className={styles.modalHeader}>
          <TrophyIcon competition={competition.key} size={34} />
          <div className={styles.modalTitleGroup}>
            <div className={styles.modalRegion}>{compInfo?.region}</div>
            <div className={styles.modalCompName}>{competition.key}</div>
            <div className={styles.modalSubStat}>
              {totalRecorded} recorded winner{totalRecorded !== 1 ? 's' : ''} · {compHistory.length} season{compHistory.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div className={styles.modalRule} />

        {/* Top Winners */}
        {topWinners.length > 0 && (
          <div className={styles.modalSection}>
            <div className={styles.modalSectionLabel}>Top Winners</div>
            {topWinners.map(([club, count], i) => (
              <div key={club} className={`${styles.modalTopRow} ${isUserClub(club) ? styles.fcHighlightRow : ''}`}>
                <span className={styles.modalRank}>#{i + 1}</span>
                <ClubBadge
                  clubName={club}
                  size={22}
                  isUserClub={isUserClub(club)}
                  crestUrl={isUserClub(club) ? userCrestUrl : null}
                />
                <span className={`${styles.modalClubName} ${isUserClub(club) ? styles.fcGold : ''}`}>{club}</span>
                <span className={styles.modalTitleCount}>×{count}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.modalRule} />

        {/* Season by season */}
        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>Season by Season</div>
          {compHistory.length === 0 ? (
            <div className={styles.modalEmpty}>No data recorded for this competition.</div>
          ) : compHistory.map((e, i) => (
            <div key={i} className={`${styles.modalSeasonRow} ${(e.fcRichportWon || e.fcRichportRunnerUp) ? styles.fcHighlightRow : ''}`}>
              <span className={styles.modalSeasonLabel}>{e.seasonLabel}</span>
              <div className={styles.modalSeasonDetail}>
                {!e.hasData ? (
                  <span className={styles.muted}>Not recorded</span>
                ) : isLeague ? (
                  <div className={styles.modalLeagueDetail}>
                    <div className={styles.modalLeagueWinner}>
                      <ClubBadge
                        clubName={e.winner}
                        size={18}
                        isUserClub={isUserClub(e.winner)}
                        crestUrl={isUserClub(e.winner) ? userCrestUrl : null}
                      />
                      <span className={`${styles.modalClubName} ${e.fcRichportWon ? styles.fcGold : ''}`}>{e.winner}</span>
                      {e.leaguePts != null && <span className={styles.leaguePts}>{e.leaguePts} pts</span>}
                    </div>
                    {e.leagueRecord && <span className={styles.leagueRecord}>{e.leagueRecord}</span>}
                    {e.leagueTop5 && (
                      <div className={styles.top5Table}>
                        {e.leagueTop5.map((row, ri) => (
                          <div key={ri} className={`${styles.top5Row} ${row.club === clubName ? styles.fcGold : ''}`}>
                            <span className={styles.top5Pos}>{row.position}</span>
                            <span className={styles.top5Club}>{row.club}</span>
                            <span className={styles.top5Pts}>{row.pts}pts</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!e.fcRichportWon && e.fcRichportPosition != null && (
                      <span className={styles.fcFinish}>{clubName} — {ordinal(e.fcRichportPosition)}</span>
                    )}
                  </div>
                ) : (
                  <div className={styles.modalFinalDetail}>
                    <div className={styles.modalFinalWinner}>
                      <ClubBadge
                        clubName={e.winner}
                        size={18}
                        isUserClub={isUserClub(e.winner)}
                        crestUrl={isUserClub(e.winner) ? userCrestUrl : null}
                      />
                      <span className={`${styles.modalClubName} ${e.fcRichportWon ? styles.fcGold : ''}`}>{e.winner}</span>
                      {e.finalScore && <span className={styles.finalScore}>{e.finalScore}</span>}
                    </div>
                    {e.runnerUp && <span className={styles.runnerUp}>vs {e.runnerUp}</span>}
                  </div>
                )}
              </div>
              {e.fcRichportWon      && <span className={styles.wonBadge}>Won</span>}
              {e.fcRichportRunnerUp && !e.fcRichportWon && <span className={styles.finalistBadge}>Finalist</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── SEASON CARD ──────────────────────────────────────────────────────────────

function SeasonCard({ seasonLabel, seasonYear, entries, clubName, activeClub, onCompClick }) {
  const isUserClub = (club) => club === clubName
  const userCrestUrl = activeClub?.crestUrl || null

  return (
    <div className={styles.seasonCard}>
      <div className={styles.seasonCardHeader}>
        <span className={styles.seasonCardLabel}>{seasonLabel}</span>
        {seasonYear && <span className={styles.seasonCardYear}>{seasonYear}</span>}
      </div>
      <div className={styles.seasonEntries}>
        {entries.map((e, i) => {
          const isLeague = LEAGUE_KEYS.has(e.competition)
          const comp = HISTORY_COMPETITIONS.find(c => c.key === e.competition)
          return (
            <button
              key={i}
              className={`${styles.entryRow} ${(e.fcRichportWon || e.fcRichportRunnerUp) ? styles.entryRowFC : ''}`}
              onClick={() => onCompClick(comp || { key: e.competition })}
            >
              <TrophyIcon competition={e.competition} size={22} />
              <div className={styles.entryContent}>
                <div className={styles.entryCompName}>{e.competition}</div>
                {!e.hasData ? (
                  <div className={styles.entryMuted}>Not recorded</div>
                ) : isLeague ? (
                  <div className={styles.entryWinnerLine}>
                    <ClubBadge
                      clubName={e.winner}
                      size={20}
                      isUserClub={isUserClub(e.winner)}
                      crestUrl={isUserClub(e.winner) ? userCrestUrl : null}
                    />
                    <span className={`${styles.entryWinnerName} ${e.fcRichportWon ? styles.fcGold : ''}`}>{e.winner}</span>
                    {e.leaguePts != null && <span className={styles.entryPts}>{e.leaguePts}pts</span>}
                    {!e.fcRichportWon && e.fcRichportPosition != null && (
                      <span className={styles.entryFinish}>· {ordinal(e.fcRichportPosition)}</span>
                    )}
                  </div>
                ) : (
                  <div className={styles.entryWinnerLine}>
                    <ClubBadge
                      clubName={e.winner}
                      size={20}
                      isUserClub={isUserClub(e.winner)}
                      crestUrl={isUserClub(e.winner) ? userCrestUrl : null}
                    />
                    <span className={`${styles.entryWinnerName} ${e.fcRichportWon ? styles.fcGold : ''}`}>{e.winner}</span>
                    {e.finalScore && <span className={styles.entryScore}>{e.finalScore}</span>}
                    {e.runnerUp && <span className={styles.entryRU}>· {e.runnerUp}</span>}
                  </div>
                )}
              </div>
              {e.fcRichportWon      && <span className={styles.wonBadge}>Won</span>}
              {e.fcRichportRunnerUp && !e.fcRichportWon && <span className={styles.finalistBadge}>Finalist</span>}
              <svg className={styles.entryChevron} width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function History() {
  const { activeClub } = useApp()
  const clubName = activeClub?.name || 'FC Richport'

  const [seasons,      setSeasons]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterSeason, setFilterSeason] = useState('all')
  const [filterComp,   setFilterComp]   = useState('all')
  const [filterGroup,  setFilterGroup]  = useState('all')
  const [fcOnly,       setFcOnly]       = useState(false)
  const [modalComp,    setModalComp]    = useState(null)

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    getSeasons(activeClub.id).then(s => { setSeasons(s); setLoading(false) })
  }, [activeClub])

  const allHistory = deriveHistoryFromSeasons(seasons, clubName)

  const filteredHistory = (() => {
    let list = fcOnly ? filterFCRichportInvolvement(allHistory) : allHistory
    if (filterSeason !== 'all') {
      list = list.filter(e => e.seasonLabel === filterSeason)
    }
    const allowedKeys = resolveCompetitionKeys(filterGroup, filterComp)
    if (filterGroup !== 'all' || filterComp !== 'all') {
      list = list.filter(e => allowedKeys.includes(e.competition))
    }
    return list
  })()

  const seasonLabels = getSeasonLabels(allHistory)
  const bySeason = {}
  for (const e of filteredHistory) {
    if (!bySeason[e.seasonLabel]) bySeason[e.seasonLabel] = []
    bySeason[e.seasonLabel].push(e)
  }
  const displaySeasons = seasonLabels.filter(label => bySeason[label]?.length > 0)

  const totalSeasons = seasons.length
  const tracked      = new Set(allHistory.map(e => e.competition)).size
  const fcTitles     = allHistory.filter(e => e.fcRichportWon).length
  const uclFinals    = allHistory.filter(e =>
    e.competition === 'UEFA Champions League' && (e.fcRichportWon || e.fcRichportRunnerUp)
  ).length

  const eraLeaders = computeEraLeaders(allHistory, 5)
  const trebles    = detectTrebles(allHistory)
  const backToBack = detectBackToBackUCL(allHistory)

  const handleCompClick = useCallback(comp => setModalComp(comp), [])

  const compOptions = [
    { value: 'all',      label: 'All Competitions' },
    { value: 'european', label: 'European' },
    { value: 'league',   label: 'Leagues' },
    { value: 'cup',      label: 'Cups' },
  ]

  const showCountryFilter = filterComp !== 'european'

  return (
    <div className={styles.page}>

      {/* ── HEADER ── */}
      <div className={styles.historyHeader}>
        <div className={styles.historyGlow} />
        <div className={styles.headerInner}>
          <span className={styles.headerEyebrow}>Competition Archive</span>
          <div className={styles.headerTitle}>History</div>
          <div className={styles.headerSubtitle}>Winners, finalists, and era records across the save</div>
        </div>
      </div>

      <div className={styles.inner}>

        {/* ── SUMMARY STRIP ── */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryNum}>{totalSeasons}</div>
            <div className={styles.summaryLabel}>Seasons</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryNum}>{tracked}</div>
            <div className={styles.summaryLabel}>Competitions</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryNum}>{fcTitles}</div>
            <div className={styles.summaryLabel}>Richport Titles</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryNum}>{uclFinals}</div>
            <div className={styles.summaryLabel}>UCL Finals</div>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : (
          <>
            {/* ── FILTERS ── */}
            <div className={styles.filtersWrap}>

              {/* Club toggle */}
              <button
                className={`${styles.fcToggle} ${fcOnly ? styles.fcToggleOn : ''}`}
                onClick={() => { setFcOnly(v => !v); setFilterGroup('all') }}
              >
                <span className={styles.fcToggleDot} />
                {clubName} only
              </button>

              {/* Competition type */}
              <div className={styles.pillRow}>
                {compOptions.map(o => (
                  <button
                    key={o.value}
                    className={`${styles.pill} ${filterComp === o.value ? styles.pillActive : ''}`}
                    onClick={() => {
                      setFilterComp(o.value)
                      if (o.value === 'european') setFilterGroup('all')
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Country ecosystem — hidden when European-only */}
              {showCountryFilter && (
                <div className={styles.pillRow}>
                  {COUNTRY_ECOSYSTEM.map(({ label, group }) => (
                    <button
                      key={group}
                      className={`${styles.pill} ${filterGroup === group ? styles.pillActive : ''}`}
                      onClick={() => setFilterGroup(group)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Season filter */}
              <div className={`${styles.pillRow} ${styles.pillRowWrap}`}>
                <button
                  className={`${styles.pill} ${filterSeason === 'all' ? styles.pillActive : ''}`}
                  onClick={() => setFilterSeason('all')}
                >All Seasons</button>
                {seasonLabels.map(label => (
                  <button
                    key={label}
                    className={`${styles.pill} ${filterSeason === label ? styles.pillActive : ''}`}
                    onClick={() => setFilterSeason(label)}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* ── MAIN ARCHIVE ── */}
            {displaySeasons.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📋</div>
                <div className={styles.emptyTitle}>No results</div>
                <div className={styles.emptyBody}>Try adjusting your filters.</div>
              </div>
            ) : (
              <div className={styles.archiveList}>
                {displaySeasons.map(label => (
                  <SeasonCard
                    key={label}
                    seasonLabel={label}
                    seasonYear={bySeason[label][0]?.seasonYear}
                    entries={bySeason[label]}
                    clubName={clubName}
                    activeClub={activeClub}
                    onCompClick={handleCompClick}
                  />
                ))}
              </div>
            )}

            {/* ── ERA LEADERS ── */}
            {eraLeaders.length > 0 && filterSeason === 'all' && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>Era Leaders</div>
                  <div className={styles.sectionSub}>Most titles across all recorded competitions</div>
                </div>
                <div className={styles.eraList}>
                  {eraLeaders.map((leader, i) => (
                    <div key={leader.club} className={`${styles.eraRow} ${leader.club === clubName ? styles.fcHighlightRow : ''}`}>
                      <span className={styles.eraRank}>#{i + 1}</span>
                      <ClubBadge
                        clubName={leader.club}
                        size={28}
                        isUserClub={leader.club === clubName}
                        crestUrl={leader.club === clubName ? (activeClub?.crestUrl || null) : null}
                      />
                      <span className={`${styles.eraClub} ${leader.club === clubName ? styles.fcGold : ''}`}>{leader.club}</span>
                      <div className={styles.eraRight}>
                        <span className={styles.eraTotal}>{leader.total}</span>
                        <span className={styles.eraTotalLabel}>title{leader.total !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── TREBLE WINNERS ── */}
            {filterSeason === 'all' && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>Treble Winners</div>
                  <div className={styles.sectionSub}>UCL + domestic league + domestic cup in one season</div>
                </div>
                {trebles.length === 0 ? (
                  <div className={styles.sectionEmpty}>No trebles recorded yet.</div>
                ) : (
                  <div className={styles.trebleList}>
                    {trebles.map((t, i) => (
                      <div key={i} className={`${styles.trebleRow} ${t.club === clubName ? styles.fcHighlightRow : ''}`}>
                        <div className={styles.trebleLeft}>
                          <span className={styles.trebleSeason}>{t.seasonLabel}</span>
                          {t.seasonYear && <span className={styles.trebleYear}>{t.seasonYear}</span>}
                        </div>
                        <ClubBadge
                          clubName={t.club}
                          size={28}
                          isUserClub={t.club === clubName}
                          crestUrl={t.club === clubName ? (activeClub?.crestUrl || null) : null}
                        />
                        <div className={styles.trebleContent}>
                          <div className={`${styles.trebleClub} ${t.club === clubName ? styles.fcGold : ''}`}>{t.club}</div>
                          <div className={styles.trebleComps}>{t.competitions.join(' · ')}</div>
                        </div>
                        <span className={styles.trebleBadge}>Treble</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── BACK-TO-BACK UCL ── */}
            {filterSeason === 'all' && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>Back-to-Back UCL</div>
                  <div className={styles.sectionSub}>Champions League won in consecutive seasons</div>
                </div>
                {backToBack.length === 0 ? (
                  <div className={styles.sectionEmpty}>No back-to-back Champions League winners recorded yet.</div>
                ) : (
                  <div className={styles.b2bList}>
                    {backToBack.map((b, i) => (
                      <div key={i} className={`${styles.b2bRow} ${b.club === clubName ? styles.fcHighlightRow : ''}`}>
                        <TrophyIcon competition="UEFA Champions League" size={28} />
                        <ClubBadge
                          clubName={b.club}
                          size={28}
                          isUserClub={b.club === clubName}
                          crestUrl={b.club === clubName ? (activeClub?.crestUrl || null) : null}
                        />
                        <div className={styles.b2bContent}>
                          <div className={`${styles.b2bClub} ${b.club === clubName ? styles.fcGold : ''}`}>{b.club}</div>
                          <div className={styles.b2bSeasons}>{b.seasons.join(' · ')}</div>
                        </div>
                        <span className={styles.b2bBadge}>
                          {b.seasons.length >= 3 ? `×${b.seasons.length}` : 'Back-to-Back'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* ── COMPETITION DETAIL MODAL ── */}
      {modalComp && (
        <CompetitionModal
          competition={modalComp}
          historyEntries={allHistory}
          clubName={clubName}
          activeClub={activeClub}
          onClose={() => setModalComp(null)}
        />
      )}
    </div>
  )
}
