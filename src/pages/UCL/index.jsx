import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import {
  getMatchesByClub,
  getSeasons,
  getPlayers,
  getOpponents,
  getSeasonStatsByClub,
} from '../../firebase/services'
import {
  getUclMatches,
  getUclSeasons,
  deriveUclClubOverview,
  deriveUclSeasonSummaries,
  deriveUclKnockoutRoundRecords,
  deriveUclFinals,
} from '../../utils/uclUtils'
import UclOverview   from './UclOverview'
import UclSeasons    from './UclSeasons'
import UclPlayers    from './UclPlayers'
import UclRecords    from './UclRecords'
import UclRivals     from './UclRivals'
import uclNavIcon    from '../../assets/icons/ucl-nav.png'
import styles from './UCL.module.css'

// ─── Tab definitions ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',  label: 'Overview'   },
  { key: 'seasons',   label: 'Seasons'    },
  { key: 'players',   label: 'Players'    },
  { key: 'records',   label: 'Records'    },
  { key: 'rivals',    label: 'Opponents'  },
]

const VALID_TABS = TABS.map(t => t.key)

// ─── UCL page entry point ─────────────────────────────────────────────────────
export default function UCL() {
  const { activeClub } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab driven by ?tab= query param, same pattern as Records
  const rawTab = searchParams.get('tab')
  const tab    = VALID_TABS.includes(rawTab) ? rawTab : 'overview'
  const setTab = useCallback((key) => {
    setSearchParams({ tab: key }, { replace: true })
  }, [setSearchParams])

  // ── Shared data ──────────────────────────────────────────────────────────
  const [allMatches, setAllMatches] = useState([])
  const [allSeasons, setAllSeasons] = useState([])
  const [players,    setPlayers]    = useState([])
  const [opponents,  setOpponents]  = useState(new Map())
  const [loading,    setLoading]    = useState(true)
  const [uclStatsDocs, setUclStatsDocs] = useState([])

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getMatchesByClub(activeClub.id),
      getSeasons(activeClub.id),
      getPlayers(activeClub.id),
      getOpponents(),
      getSeasonStatsByClub(activeClub.id),
    ]).then(([matches, seasons, plrs, oppMap, statDocs]) => {
      const seasonLabelMap = {}
      for (const s of seasons) {
        if (s.id) seasonLabelMap[s.id] = s.label || ''
      }

      const enrichedMatches = matches.map(m => ({
        ...m,
        seasonLabel: seasonLabelMap[m.seasonId] || m.seasonLabel || '',
      }))

      // Filter once at load time — only UCL-scope docs are needed by the UCL tabs
      const uclDocs = statDocs.filter(d => d.scope === 'UCL')

      setAllMatches(enrichedMatches)
      setAllSeasons(seasons)
      setPlayers(plrs)
      setOpponents(oppMap)
      setUclStatsDocs(uclDocs)
      setLoading(false)
    }).catch(err => {
      console.error('[UCL] data load error:', err)
      setLoading(false)
    })
  }, [activeClub])

  // ── Derived data ─────────────────────────────────────────────────────────
  const uclMatches  = getUclMatches(allMatches)
  const uclSeasons  = getUclSeasons(allSeasons)

  const baseSummaries = deriveUclSeasonSummaries(uclSeasons, uclMatches)
  const summaries = baseSummaries.map(s => ({
    ...s,
    lpMatchDocs: uclMatches.filter(m =>
      m.seasonId === s.season.id && m.competition === 'UCL_LP'
    ),
  }))

  const overview      = !loading ? deriveUclClubOverview(uclSeasons, uclMatches) : null
  const knockoutData  = !loading ? deriveUclKnockoutRoundRecords(uclMatches) : null
  const finals        = !loading ? deriveUclFinals(uclSeasons, uclMatches, opponents) : null

  // ── No club selected guard ───────────────────────────────────────────────
  if (!activeClub) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>No club selected</p>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* Top bar */}
      <div className={styles.topBar}>
        <img src={uclNavIcon} alt="" className={styles.topBarIcon} />
        <span className={styles.topLabel}>UEFA Champions League</span>
      </div>

      {/* Tab bar */}
      <div className={styles.tabs} role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.inner}>
        {tab === 'overview' ? (
          <UclOverview
            overview={overview}
            uclSeasons={uclSeasons}
            uclMatches={uclMatches}
            opponents={opponents}
            loading={loading}
          />
        ) : tab === 'seasons' ? (
          <UclSeasons
            summaries={summaries}
            opponents={opponents}
            knockoutData={knockoutData}
            finals={finals}
            loading={loading}
          />
        ) : tab === 'players' ? (
          <UclPlayers
            players={players}
            uclSeasons={uclSeasons}
            uclStatsDocs={uclStatsDocs}
            loading={loading}
          />
        ) : tab === 'records' ? (
          <UclRecords
            players={players}
            uclMatches={uclMatches}
            uclSeasons={uclSeasons}
            opponents={opponents}
            uclStatsDocs={uclStatsDocs}
            loading={loading}
          />
        ) : tab === 'rivals' ? (
          <UclRivals
            uclMatches={uclMatches}
            opponents={opponents}
            clubName={activeClub?.name || ''}
            loading={loading}
          />
        ) : null}
      </div>
    </div>
  )
}
