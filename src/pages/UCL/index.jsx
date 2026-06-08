import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import {
  getMatchesByClub,
  getSeasons,
  getPlayers,
  getOpponents,
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
import UclKnockouts  from './UclKnockouts'
import styles from './UCL.module.css'

// ─── Tab definitions ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',   label: 'Overview'  },
  { key: 'seasons',    label: 'Seasons'   },
  { key: 'knockouts',  label: 'Knockouts' },
  { key: 'players',    label: 'Players'   },
  { key: 'records',    label: 'Records'   },
  { key: 'rivals',     label: 'Rivals'    },
]

const VALID_TABS = TABS.map(t => t.key)
const COMING_SOON = new Set(['players', 'records', 'rivals'])

// ─── Placeholder for v51 tabs ────────────────────────────────────────────────
function ComingSoonTab({ label }) {
  return (
    <div className={styles.comingSoon}>
      <span className={styles.comingSoonIcon}>🏗️</span>
      <p className={styles.comingSoonTitle}>{label}</p>
      <p className={styles.comingSoonText}>Coming in the next build.</p>
    </div>
  )
}

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

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getMatchesByClub(activeClub.id),
      getSeasons(activeClub.id),
      getPlayers(activeClub.id),
      getOpponents(),
    ]).then(([matches, seasons, plrs, oppMap]) => {
      // Build seasonId → label map for season label stamping on matches
      const seasonLabelMap = {}
      for (const s of seasons) {
        if (s.id) seasonLabelMap[s.id] = s.label || ''
      }

      // Stamp seasonLabel onto every match so helpers can use it without a join
      const enrichedMatches = matches.map(m => ({
        ...m,
        seasonLabel: seasonLabelMap[m.seasonId] || m.seasonLabel || '',
      }))

      setAllMatches(enrichedMatches)
      setAllSeasons(seasons)
      setPlayers(plrs)
      setOpponents(oppMap)
      setLoading(false)
    }).catch(err => {
      console.error('[UCL] data load error:', err)
      setLoading(false)
    })
  }, [activeClub])

  // ── Derived data (memoised implicitly by derivation at render) ───────────
  // These are cheap pure functions — no useEffect needed; they run synchronously.
  const uclMatches  = getUclMatches(allMatches)
  const uclSeasons  = getUclSeasons(allSeasons)

  // Add LP match docs into season summaries (used by UclSeasons detail view)
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
        <span className={styles.topLabel}>UCL</span>
        <span className={styles.topSub}>
          {loading ? '…' : `${uclSeasons.length} campaign${uclSeasons.length !== 1 ? 's' : ''}`}
        </span>
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
        {COMING_SOON.has(tab) ? (
          <ComingSoonTab label={TABS.find(t => t.key === tab)?.label || tab} />
        ) : tab === 'overview' ? (
          <UclOverview
            overview={overview}
            uclSeasons={uclSeasons}
            opponents={opponents}
            loading={loading}
          />
        ) : tab === 'seasons' ? (
          <UclSeasons
            summaries={summaries}
            opponents={opponents}
            loading={loading}
          />
        ) : tab === 'knockouts' ? (
          <UclKnockouts
            knockoutData={knockoutData}
            finals={finals}
            opponents={opponents}
            loading={loading}
          />
        ) : null}
      </div>
    </div>
  )
}
