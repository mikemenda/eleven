import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getMatchesByClub, getRivalStats, getOpponents, getSeasons } from '../firebase/services'
import styles from './Rivals.module.css'

export default function Rivals() {
  const { activeClub } = useApp()
  const [rivals,    setRivals]    = useState([])
  const [opponents, setOpponents] = useState(new Map())
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [filter,    setFilter]    = useState('all')

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getMatchesByClub(activeClub.id),
      getOpponents(),
      getSeasons(activeClub.id),
    ]).then(([matches, oppMap, seasons]) => {
      // Build seasonId → label map (e.g. "abc123" → "S3") so every match row
      // can display the correct season label. Match docs store seasonId, not the
      // label — so we must join here rather than relying on m.seasonLabel existing.
      const seasonLabelMap = {}
      for (const s of seasons) {
        seasonLabelMap[s.id] = s.label || ''
      }
      // Stamp each match with its resolved label before passing to getRivalStats.
      // getRivalStats then sorts matches by this label so the detail log is chronological.
      const enrichedMatches = matches.map(m => ({
        ...m,
        seasonLabel: seasonLabelMap[m.seasonId] || m.seasonLabel || '',
      }))
      setRivals(getRivalStats(enrichedMatches))
      setOpponents(oppMap)
      setLoading(false)
    })
  }, [activeClub])

  // Enrich rival with canonical displayName and crestUrl from opponents collection.
  function enrichRival(r) {
    if (!r) return r
    const key = r.opponentKey
    if (key && opponents.has(key)) {
      const rec = opponents.get(key)
      return { ...r, displayName: rec.displayName || r.opponent, crestUrl: rec.crestUrl || null }
    }
    return { ...r, displayName: r.opponent, crestUrl: null }
  }

  // Finals filter: a match counts as a final if its round is 'Final'
  // OR if its competition field is 'UCL_Final' (some docs store the stage
  // in competition rather than round — checking both fields ensures no finals
  // are silently excluded from the Finals tab).
  function isFinal(m) {
    return (
      m.round === 'Final' ||
      m.round === 'UCL_Final' ||
      m.competition === 'UCL_Final' ||
      m.competition === 'FA_Cup_Final' ||
      m.competition === 'Carabao_Final'
    )
  }

  const filtered = rivals
    .filter(r =>
      filter === 'all' ||
      (filter === 'frequent' && r.played >= 2) ||
      (filter === 'finals'   && r.matches.some(isFinal))
    )
    .map(enrichRival)

  if (selected) {
    const rival = rivals.find(r => r.opponentKey === selected)
    return (
      <RivalDetail
        rival={enrichRival(rival)}
        onBack={() => setSelected(null)}
        isFinal={isFinal}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Rivalry Record</span>
        <span className={styles.topCount}>{rivals.length} opponents</span>
      </div>

      <div className={styles.filterBar}>
        {[
          { key: 'all',      label: 'All' },
          { key: 'frequent', label: '2+ Meetings' },
          { key: 'finals',   label: 'Finals' },
        ].map(f => (
          <button key={f.key}
            className={`${styles.filterBtn} ${filter === f.key ? styles.filterActive : ''}`}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>⚔️</span>
            <p className={styles.emptyText}>No rivalry data yet</p>
            <p className={styles.emptyHint}>Rivals populate as you log matches</p>
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <span className={styles.thOpp}>Opponent</span>
              <span className={styles.thStat}>P</span>
              <span className={styles.thStat}>W</span>
              <span className={styles.thStat}>D</span>
              <span className={styles.thStat}>L</span>
              <span className={styles.thStat}>GD</span>
            </div>
            {filtered.map(r => (
              <button key={r.opponentKey} className={styles.rivalRow}
                onClick={() => setSelected(r.opponentKey)}>
                <div className={styles.rivalOpp}>
                  {r.crestUrl && (
                    <img src={r.crestUrl} alt="" className={styles.rivalCrest}
                      onError={e => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <span className={styles.rivalName}>{r.displayName}</span>
                  {/* Rival badge: shown when 3+ matches played against this opponent.
                      Threshold of 3 reflects meaningful repeated encounters across seasons.
                      Adjust this number here if the definition of "rival" needs to change. */}
                  {r.played >= 3 && (
                    <span className={styles.rivalBadge} style={{ color: 'var(--en-gold)' }}>Rival</span>
                  )}
                </div>
                <span className={styles.rivalStat}>{r.played}</span>
                <span className={styles.rivalStat} style={{ color: 'var(--en-green)' }}>{r.w}</span>
                <span className={styles.rivalStat} style={{ color: 'var(--en-text-3)' }}>{r.d}</span>
                <span className={styles.rivalStat} style={{ color: 'var(--danger)' }}>{r.l}</span>
                <span className={styles.rivalStat}
                  style={{ color: r.gd > 0 ? 'var(--en-green)' : r.gd < 0 ? 'var(--danger)' : 'var(--en-text-3)' }}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className={styles.chevron}>
                  <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// Competition code → display label map.
// Carabao is "Carabao Cup" to match all other app competition labels.
const COMP_LABEL = {
  UCL_LP:    'UCL LP',
  UCL_R16:   'UCL R16',
  UCL_QF:    'UCL QF',
  UCL_SF:    'UCL SF',
  UCL_Final: 'UCL Final',
  PL:        'PL',
  FA_Cup:    'FA Cup',
  Carabao:   'Carabao Cup',  // was 'Carabao' — fixed to match app-wide label
}

function RivalDetail({ rival, onBack, isFinal }) {
  if (!rival) return null

  const finalsCount = rival.matches.filter(isFinal).length

  // Group matches by seasonLabel for a cleaner chronological read.
  // Matches are already sorted by seasonLabel inside getRivalStats,
  // so we just need to split them into labelled groups here.
  const seasonGroups = []
  for (const m of rival.matches) {
    const label = m.seasonLabel || '—'
    const last = seasonGroups[seasonGroups.length - 1]
    if (last && last.label === label) {
      last.matches.push(m)
    } else {
      seasonGroups.push({ label, matches: [m] })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {rival.crestUrl && (
          <img src={rival.crestUrl} alt="" className={styles.detailCrest}
            onError={e => { e.currentTarget.style.display = 'none' }} />
        )}
        <span className={styles.topLabel}>{rival.displayName}</span>
      </div>

      <div className={styles.h2hBar}>
        <div className={styles.h2hItem}>
          <span className={styles.h2hVal} style={{ color: 'var(--en-green)' }}>{rival.w}</span>
          <span className={styles.h2hKey}>Won</span>
        </div>
        <div className={styles.h2hItem}>
          <span className={styles.h2hVal} style={{ color: 'var(--en-text-3)' }}>{rival.d}</span>
          <span className={styles.h2hKey}>Drawn</span>
        </div>
        <div className={styles.h2hItem}>
          <span className={styles.h2hVal} style={{ color: 'var(--danger)' }}>{rival.l}</span>
          <span className={styles.h2hKey}>Lost</span>
        </div>
        <div className={styles.h2hItem}>
          <span className={styles.h2hVal}>{rival.gf}–{rival.ga}</span>
          <span className={styles.h2hKey}>Goals</span>
        </div>
      </div>

      <div className={styles.inner}>
        {finalsCount > 0 && (
          <div className={styles.finalsNote}>
            ⚡ {finalsCount} final{finalsCount > 1 ? 's' : ''} against {rival.displayName}
          </div>
        )}
        <div className={styles.matchLog}>
          {seasonGroups.map(group => (
            <div key={group.label}>
              {/* Season divider — minimal: small label, no visual redesign */}
              <div className={styles.seasonDivider}>{group.label}</div>
              {group.matches.map((m, i) => {
                const win   = m.score_for > m.score_against
                const draw  = m.score_for === m.score_against
                const res   = win ? 'W' : draw ? 'D' : 'L'
                const color = win ? 'var(--en-green)' : draw ? 'var(--en-text-3)' : 'var(--danger)'
                return (
                  <div key={i} className={styles.matchRow}>
                    <span className={styles.matchResult} style={{ color }}>{res}</span>
                    <div className={styles.matchInfo}>
                      <span className={styles.matchComp}>{COMP_LABEL[m.competition] || m.competition}</span>
                      {m.round && <span className={styles.matchRound}>{m.round}</span>}
                    </div>
                    <span className={styles.matchScore}>{m.score_for}–{m.score_against}</span>
                    <span className={styles.matchVenue}
                      style={{ color: m.home_away === 'H' ? 'var(--en-blue)' : 'var(--en-text-4)' }}>
                      {m.home_away || '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
