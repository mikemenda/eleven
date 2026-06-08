import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { getSeasons } from '../firebase/services'
import {
  HISTORY_COMPETITIONS,
  LEAGUE_KEYS,
  deriveHistoryFromSeasons,
  computeDynasties,
  detectTrebles,
  computeEraLeaders,
  filterFCRichportInvolvement,
  getCompetitionHistory,
  getSeasonLabels,
} from '../utils/historyUtils'
import TRANSFER_CLUBS from '../../data/transfer-clubs.json'
import styles from './History.module.css'

// Trophy SVGs — same set as Museum
import uclSvg        from '../assets/trophies/ucl.svg'
import plSvg         from '../assets/trophies/premier-league.svg'
import faCupSvg      from '../assets/trophies/fa-cup.svg'
import carabaoSvg    from '../assets/trophies/carabao.svg'
import laLigaSvg     from '../assets/trophies/la-liga.svg'
import copaDelReySvg from '../assets/trophies/copa-del-rey.svg'
import bundesligaSvg from '../assets/trophies/bundesliga.svg'
import dfbPokalSvg   from '../assets/trophies/dfb-pokal.svg'
import uelSvg        from '../assets/trophies/uel.svg'

const TROPHY_SVG = {
  'UEFA Champions League': uclSvg,
  'Premier League':        plSvg,
  'FA Cup':                faCupSvg,
  'Carabao Cup':           carabaoSvg,
  'La Liga':               laLigaSvg,
  'Copa del Rey':          copaDelReySvg,
  'Bundesliga':            bundesligaSvg,
  'DFB-Pokal':             dfbPokalSvg,
  'UEFA Europa League':    uelSvg,
}

const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function resolveTeamId(clubName) {
  if (!clubName) return null
  const key = clubName.trim().toLowerCase()
  return TRANSFER_CLUBS[key]?.sofifaTeamId ?? null
}

function TrophyIcon({ competition, size = 28 }) {
  const src = TROPHY_SVG[competition]
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={styles.compIcon}
        style={{ width: size, height: size }}
      />
    )
  }
  // Fallback for competitions without SVGs (Serie A, Ligue 1, etc.)
  const EMOJI = {
    'Serie A':        '🇮🇹',
    'Coppa Italia':   '🇮🇹',
    'Ligue 1':        '🇫🇷',
    'Coupe de France':'🇫🇷',
  }
  return (
    <span className={styles.compIconEmoji} style={{ fontSize: size * 0.75 }}>
      {EMOJI[competition] || '🏆'}
    </span>
  )
}

function ClubBadge({ clubName, size = 32, highlight = false }) {
  const [err, setErr] = useState(false)
  const teamId = resolveTeamId(clubName)

  if (clubName === 'FC Richport') {
    return (
      <div
        className={`${styles.clubBadge} ${styles.fcRichportBadge}`}
        style={{ width: size, height: size }}
        title="FC Richport"
      >
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width={size * 0.7} height={size * 0.7}>
          <text x="50%" y="58%" dominantBaseline="middle" textAnchor="middle"
            fill="var(--en-green)" fontFamily="var(--font-display)" fontSize="16" fontWeight="700">
            XI
          </text>
        </svg>
      </div>
    )
  }

  if (!teamId || err) {
    return (
      <div className={styles.clubBadgeFallback} style={{ width: size, height: size }} title={clubName}>
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
          <path
            d="M16 2L3 7v9c0 7 5.2 12.3 13 14 7.8-1.7 13-7 13-14V7L16 2z"
            fill="currentColor" opacity="0.10"
            stroke="currentColor" strokeWidth="1" strokeOpacity="0.2"
          />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={`${WORKER_BASE}/team/${teamId}`}
      alt={clubName}
      className={`${styles.clubBadgeImg} ${highlight ? styles.clubBadgeHighlight : ''}`}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}

// ─── POSITION SUFFIX ─────────────────────────────────────────────────────────

function ordinal(n) {
  if (!n) return ''
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── COMPETITION DETAIL MODAL ─────────────────────────────────────────────────

function CompetitionModal({ competition, historyEntries, clubName, onClose }) {
  const compHistory = getCompetitionHistory(historyEntries, competition.key)
  const compInfo    = HISTORY_COMPETITIONS.find(c => c.key === competition.key)
  const totalTitles = compHistory.filter(e => e.hasData).length
  const isLeague    = LEAGUE_KEYS.includes(competition.key)

  // Top winners for this competition
  const titleMap = {}
  for (const e of compHistory) {
    if (!e.winner || !e.hasData) continue
    titleMap[e.winner] = (titleMap[e.winner] || 0) + 1
  }
  const topWinners = Object.entries(titleMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={competition.key}>
        <div className={styles.modalHandle} />

        {/* Header */}
        <div className={styles.modalHeader}>
          <TrophyIcon competition={competition.key} size={36} />
          <div className={styles.modalTitleGroup}>
            <div className={styles.modalRegion}>{compInfo?.region}</div>
            <div className={styles.modalCompName}>{competition.key}</div>
            <div className={styles.modalSubStat}>
              {totalTitles} recorded winner{totalTitles !== 1 ? 's' : ''} · {compHistory.length} season{compHistory.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div className={styles.modalRule} />

        {/* Top winners */}
        {topWinners.length > 0 && (
          <div className={styles.modalSection}>
            <div className={styles.modalSectionLabel}>Top Winners</div>
            {topWinners.map(([club, count], i) => (
              <div key={club} className={`${styles.modalTopRow} ${club === clubName ? styles.fcHighlightRow : ''}`}>
                <span className={styles.modalRank}>#{i + 1}</span>
                <ClubBadge clubName={club} size={22} />
                <span className={`${styles.modalClubName} ${club === clubName ? styles.fcGreen : ''}`}>{club}</span>
                <span className={styles.modalTitleCount}>×{count}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.modalRule} />

        {/* Season-by-season */}
        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>Season by Season</div>
          {compHistory.length === 0 ? (
            <div className={styles.modalEmpty}>No data recorded for this competition.</div>
          ) : (
            compHistory.map((e, i) => (
              <div key={i} className={`${styles.modalSeasonRow} ${(e.fcRichportWon || e.fcRichportRunnerUp) ? styles.fcHighlightRow : ''}`}>
                <span className={styles.modalSeasonLabel}>{e.seasonLabel}</span>
                <div className={styles.modalSeasonDetail}>
                  {!e.hasData ? (
                    <span className={styles.muted}>Winner not recorded</span>
                  ) : isLeague ? (
                    <div className={styles.modalLeagueDetail}>
                      <div className={styles.modalLeagueWinner}>
                        <ClubBadge clubName={e.winner} size={18} />
                        <span className={`${styles.modalClubName} ${e.fcRichportWon ? styles.fcGreen : ''}`}>{e.winner}</span>
                        {e.leaguePts && <span className={styles.leaguePts}>{e.leaguePts} pts</span>}
                      </div>
                      {e.leagueRecord && <span className={styles.leagueRecord}>{e.leagueRecord}</span>}
                      {!e.fcRichportWon && e.fcRichportPosition != null && (
                        <span className={styles.fcFinish}>
                          FC Richport — {ordinal(e.fcRichportPosition)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={styles.modalFinalDetail}>
                      <div className={styles.modalFinalWinner}>
                        <ClubBadge clubName={e.winner} size={18} />
                        <span className={`${styles.modalClubName} ${e.fcRichportWon ? styles.fcGreen : ''}`}>{e.winner}</span>
                        {e.finalScore && <span className={styles.finalScore}>{e.finalScore}</span>}
                      </div>
                      {e.runnerUp && (
                        <span className={styles.runnerUp}>vs {e.runnerUp}</span>
                      )}
                    </div>
                  )}
                </div>
                {e.fcRichportWon && <span className={styles.fcBadgePill}>Won</span>}
                {e.fcRichportRunnerUp && !e.fcRichportWon && <span className={styles.ruBadgePill}>RU</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ─── SEASON CARD ──────────────────────────────────────────────────────────────

function SeasonCard({ seasonLabel, seasonYear, entries, clubName, onCompClick }) {
  return (
    <div className={styles.seasonCard}>
      <div className={styles.seasonCardHeader}>
        <span className={styles.seasonCardLabel}>{seasonLabel}</span>
        {seasonYear && <span className={styles.seasonCardYear}>{seasonYear}</span>}
      </div>
      <div className={styles.seasonEntries}>
        {entries.map((e, i) => {
          const isLeague = LEAGUE_KEYS.includes(e.competition)
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
                  <div className={styles.entryMuted}>Winner not recorded</div>
                ) : isLeague ? (
                  <div className={styles.entryWinnerLine}>
                    <ClubBadge clubName={e.winner} size={20} />
                    <span className={`${styles.entryWinnerName} ${e.fcRichportWon ? styles.fcGreen : ''}`}>
                      {e.winner}
                    </span>
                    {e.leaguePts && <span className={styles.entryPts}>{e.leaguePts}pts</span>}
                    {!e.fcRichportWon && e.fcRichportPosition != null && (
                      <span className={styles.entryFinish}>· FCR {ordinal(e.fcRichportPosition)}</span>
                    )}
                  </div>
                ) : (
                  <div className={styles.entryWinnerLine}>
                    <ClubBadge clubName={e.winner} size={20} />
                    <span className={`${styles.entryWinnerName} ${e.fcRichportWon ? styles.fcGreen : ''}`}>
                      {e.winner}
                    </span>
                    {e.finalScore && <span className={styles.entryScore}>{e.finalScore}</span>}
                    {e.runnerUp && <span className={styles.entryRU}>· {e.runnerUp}</span>}
                  </div>
                )}
              </div>
              {e.fcRichportWon      && <span className={styles.fcBadgePill}>Won</span>}
              {e.fcRichportRunnerUp && !e.fcRichportWon && <span className={styles.ruBadgePill}>RU</span>}
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

  const [seasons,        setSeasons]        = useState([])
  const [loading,        setLoading]        = useState(true)
  const [filterSeason,   setFilterSeason]   = useState('all')
  const [filterComp,     setFilterComp]     = useState('all')    // 'all' | 'european' | 'league' | 'cup'
  const [filterLeague,   setFilterLeague]   = useState('all')
  const [fcOnly,         setFcOnly]         = useState(false)
  const [modalComp,      setModalComp]      = useState(null)     // competition object

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    getSeasons(activeClub.id).then(s => {
      setSeasons(s)
      setLoading(false)
    })
  }, [activeClub])

  const allHistory = deriveHistoryFromSeasons(seasons, clubName)

  // Filtered entries
  const filteredHistory = (() => {
    let list = fcOnly ? filterFCRichportInvolvement(allHistory) : allHistory

    if (filterSeason !== 'all') {
      list = list.filter(e => e.seasonLabel === filterSeason)
    }

    if (filterComp !== 'all') {
      const tierMap = { european: 'european', league: 'league', cup: 'cup' }
      if (tierMap[filterComp]) {
        const tier = tierMap[filterComp]
        const keys = HISTORY_COMPETITIONS.filter(c => c.tier === tier || (tier === 'league' && c.tier === 'league')).map(c => c.key)
        list = list.filter(e => keys.includes(e.competition))
      }
    }

    if (filterLeague !== 'all') {
      list = list.filter(e => e.competition === filterLeague)
    }

    return list
  })()

  // Group filtered entries by season, newest first
  const seasonLabels = getSeasonLabels(allHistory)
  const bySeason = {}
  for (const e of filteredHistory) {
    if (!bySeason[e.seasonLabel]) bySeason[e.seasonLabel] = []
    bySeason[e.seasonLabel].push(e)
  }
  // Sort by season label newest-first
  const displaySeasons = seasonLabels
    .filter(label => bySeason[label] && bySeason[label].length > 0)

  // Summary stats
  const totalSeasons     = seasons.length
  const tracked          = new Set(allHistory.map(e => e.competition)).size
  const eraLeaders       = computeEraLeaders(allHistory, 5)
  const mostDecorated    = eraLeaders[0]
  const dynasties        = computeDynasties(allHistory)
  const trebles          = detectTrebles(allHistory)

  // FC Richport total wins
  const fcTitles = allHistory.filter(e => e.fcRichportWon).length
  const fcAppearances = allHistory.filter(e => e.fcRichportWon || e.fcRichportRunnerUp).length

  const handleCompClick = useCallback((comp) => {
    setModalComp(comp)
  }, [])

  const compOptions = [
    { value: 'all',      label: 'All Competitions' },
    { value: 'european', label: 'European' },
    { value: 'league',   label: 'Leagues' },
    { value: 'cup',      label: 'Cups' },
  ]

  return (
    <div className={styles.page}>

      {/* ── HEADER ── */}
      <div className={styles.historyHeader}>
        <div className={styles.historyGlow} />
        <div className={styles.headerInner}>
          <span className={styles.headerEyebrow}>Competition Archive</span>
          <div className={styles.headerTitle}>History</div>
          <div className={styles.headerSubtitle}>All recorded winners across every season</div>
        </div>
      </div>

      <div className={styles.inner}>

        {/* ── SUMMARY CARDS ── */}
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
            <div className={styles.summaryLabel}>{clubName} Titles</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryNum}>{dynasties.length}</div>
            <div className={styles.summaryLabel}>Dynasties</div>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : (
          <>
            {/* ── FILTERS ── */}
            <div className={styles.filtersWrap}>
              {/* FC Richport toggle */}
              <button
                className={`${styles.fcToggle} ${fcOnly ? styles.fcToggleOn : ''}`}
                onClick={() => { setFcOnly(v => !v); setFilterLeague('all') }}
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
                    onClick={() => { setFilterComp(o.value); setFilterLeague('all') }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* League filter (only when showing leagues) */}
              {(filterComp === 'all' || filterComp === 'league') && (
                <div className={styles.pillRow}>
                  <button
                    className={`${styles.pill} ${filterLeague === 'all' ? styles.pillActive : ''}`}
                    onClick={() => setFilterLeague('all')}
                  >All Leagues</button>
                  {LEAGUE_KEYS.map(k => (
                    <button
                      key={k}
                      className={`${styles.pill} ${filterLeague === k ? styles.pillActive : ''}`}
                      onClick={() => setFilterLeague(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}

              {/* Season filter */}
              <div className={`${styles.pillRow} ${styles.pillRowWrap}`}>
                <button
                  className={`${styles.pill} ${filterSeason === 'all' ? styles.pillActive : ''}`}
                  onClick={() => setFilterSeason('all')}
                >
                  All Seasons
                </button>
                {seasonLabels.map(label => (
                  <button
                    key={label}
                    className={`${styles.pill} ${filterSeason === label ? styles.pillActive : ''}`}
                    onClick={() => setFilterSeason(label)}
                  >
                    {label}
                  </button>
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
                    onCompClick={handleCompClick}
                  />
                ))}
              </div>
            )}

            {/* ── ERA SUMMARY ── */}
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
                      <ClubBadge clubName={leader.club} size={28} />
                      <span className={`${styles.eraClub} ${leader.club === clubName ? styles.fcGreen : ''}`}>
                        {leader.club}
                      </span>
                      <div className={styles.eraRight}>
                        <span className={styles.eraTotal}>{leader.total}</span>
                        <span className={styles.eraTotalLabel}>title{leader.total !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── DYNASTIES ── */}
            {filterSeason === 'all' && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>Dynasties</div>
                  <div className={styles.sectionSub}>Clubs with multiple titles in the same competition</div>
                </div>
                {dynasties.length === 0 ? (
                  <div className={styles.sectionEmpty}>No dynasties recorded yet.</div>
                ) : (
                  <div className={styles.dynastyList}>
                    {dynasties.map((d, i) => (
                      <button
                        key={i}
                        className={`${styles.dynastyRow} ${d.club === clubName ? styles.fcHighlightRow : ''}`}
                        onClick={() => {
                          const comp = HISTORY_COMPETITIONS.find(c => c.key === d.competition)
                          if (comp) setModalComp(comp)
                        }}
                      >
                        <TrophyIcon competition={d.competition} size={20} />
                        <div className={styles.dynastyContent}>
                          <div className={styles.dynastyComp}>{d.competition}</div>
                          <div className={`${styles.dynastyClub} ${d.club === clubName ? styles.fcGreen : ''}`}>
                            {d.club}
                          </div>
                        </div>
                        <div className={styles.dynastyBadge}>×{d.count}</div>
                        <div className={styles.dynastySeasons}>
                          {d.seasons.join(', ')}
                        </div>
                        <svg className={styles.entryChevron} width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
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
                        <ClubBadge clubName={t.club} size={28} />
                        <div className={styles.trebleContent}>
                          <div className={`${styles.trebleClub} ${t.club === clubName ? styles.fcGreen : ''}`}>
                            {t.club}
                          </div>
                          <div className={styles.trebleComps}>
                            {t.competitions.join(' · ')}
                          </div>
                        </div>
                        <span className={styles.trebleBadge}>Treble</span>
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
          onClose={() => setModalComp(null)}
        />
      )}
    </div>
  )
}
