import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getMatchesByClub, getRivalStats } from '../firebase/services'
import styles from './Rivals.module.css'

export default function Rivals() {
  const { activeClub } = useApp()
  const [rivals, setRivals] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // opponent name
  const [filter, setFilter] = useState('all') // all | frequent | finals

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    getMatchesByClub(activeClub.id).then(matches => {
      setRivals(getRivalStats(matches))
      setLoading(false)
    })
  }, [activeClub])

  const filtered = rivals
    .filter(r => filter === 'all' || (filter === 'frequent' && r.played >= 2) || (filter === 'finals' && r.matches.some(m => m.round === 'Final')))

  if (selected) {
    const rival = rivals.find(r => r.opponent === selected)
    return <RivalDetail rival={rival} onBack={() => setSelected(null)} />
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Rivalry Record</span>
        <span className={styles.topCount}>{rivals.length} opponents</span>
      </div>

      <div className={styles.filterBar}>
        {[
          { key: 'all', label: 'All' },
          { key: 'frequent', label: '2+ Meetings' },
          { key: 'finals', label: 'Finals' },
        ].map(f => (
          <button key={f.key} className={`${styles.filterBtn} ${filter === f.key ? styles.filterActive : ''}`}
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
            {/* ── TABLE HEADER ── */}
            <div className={styles.tableHeader}>
              <span className={styles.thOpp}>Opponent</span>
              <span className={styles.thStat}>P</span>
              <span className={styles.thStat}>W</span>
              <span className={styles.thStat}>D</span>
              <span className={styles.thStat}>L</span>
              <span className={styles.thStat}>GD</span>
            </div>
            {filtered.map(r => (
              <button key={r.opponent} className={styles.rivalRow} onClick={() => setSelected(r.opponent)}>
                <div className={styles.rivalOpp}>
                  <span className={styles.rivalName}>{r.opponent}</span>
                  {r.played >= 5 && (
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

function RivalDetail({ rival, onBack }) {
  if (!rival) return null
  const finals = rival.matches.filter(m => m.round === 'Final' || m.round === 'UCL_Final')

  const COMP_LABEL = {
    UCL_LP: 'UCL LP', UCL_R16: 'UCL R16', UCL_QF: 'UCL QF',
    UCL_SF: 'UCL SF', UCL_Final: 'UCL Final', PL: 'PL',
    FA_Cup: 'FA Cup', Carabao: 'Carabao',
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <span className={styles.topLabel}>{rival.opponent}</span>
      </div>

      {/* H2H Summary */}
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

      {/* Match Log */}
      <div className={styles.inner}>
        {finals.length > 0 && (
          <div className={styles.finalsNote}>
            ⚡ {finals.length} final{finals.length > 1 ? 's' : ''} against {rival.opponent}
          </div>
        )}
        <div className={styles.matchLog}>
          {rival.matches.map((m, i) => {
            const win = m.score_for > m.score_against
            const draw = m.score_for === m.score_against
            const result = win ? 'W' : draw ? 'D' : 'L'
            const resultColor = win ? 'var(--en-green)' : draw ? 'var(--en-text-3)' : 'var(--danger)'
            return (
              <div key={i} className={styles.matchRow}>
                <span className={styles.matchResult} style={{ color: resultColor }}>{result}</span>
                <div className={styles.matchInfo}>
                  <span className={styles.matchComp}>{COMP_LABEL[m.competition] || m.competition}</span>
                  {m.round && <span className={styles.matchRound}>{m.round}</span>}
                  {m.seasonLabel && <span className={styles.matchSeason}>{m.seasonLabel}</span>}
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
      </div>
    </div>
  )
}
