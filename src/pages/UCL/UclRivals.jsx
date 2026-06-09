import { useState } from 'react'
import styles from './UCL.module.css'
import {
  deriveUclRivals,
  deriveUclLeagueRecords,
  buildUclRivalNarrative,
  fmtScore,
  fmtGD,
} from '../../utils/uclUtils'

// Competition code → short label for match log
const COMP_SHORT = {
  UCL_LP:    'LP',
  UCL_R16:   'R16',
  UCL_QF:    'QF',
  UCL_SF:    'SF',
  UCL_Final: 'Final',
}

// ─── Rival detail view ────────────────────────────────────────────────────────
function RivalDetail({ rival, clubName, onBack }) {
  if (!rival) return null

  const narrative = buildUclRivalNarrative(rival, clubName)
  const finalsCount = rival.matches.filter(m => m.competition === 'UCL_Final').length

  // Group matches by seasonLabel
  const seasonGroups = []
  for (const m of rival.matches) {
    const label = m.seasonLabel || '—'
    const last  = seasonGroups[seasonGroups.length - 1]
    if (last && last.label === label) {
      last.matches.push(m)
    } else {
      seasonGroups.push({ label, matches: [m] })
    }
  }

  return (
    <div className={styles.rvDetail}>
      {/* Back + header */}
      <div className={styles.rvDetailHead}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {rival.crestUrl && (
          <img src={rival.crestUrl} alt="" className={styles.rvDetailCrest}
            onError={e => { e.currentTarget.style.display = 'none' }} />
        )}
        <div className={styles.rvDetailTitle}>
          <span className={styles.rvDetailName}>{rival.displayName}</span>
          {(rival.league || rival.country) && (
            <span className={styles.rvDetailLeague}>
              {rival.league || rival.country}
            </span>
          )}
        </div>
      </div>

      {/* H2H bar */}
      <div className={styles.rvH2H}>
        <div className={styles.rvH2HItem}>
          <span className={styles.rvH2HVal} style={{ color: 'var(--en-green)' }}>{rival.w}</span>
          <span className={styles.rvH2HKey}>Won</span>
        </div>
        <div className={styles.rvH2HItem}>
          <span className={styles.rvH2HVal} style={{ color: 'var(--en-text-3)' }}>{rival.d}</span>
          <span className={styles.rvH2HKey}>Drawn</span>
        </div>
        <div className={styles.rvH2HItem}>
          <span className={styles.rvH2HVal} style={{ color: 'var(--danger)' }}>{rival.l}</span>
          <span className={styles.rvH2HKey}>Lost</span>
        </div>
        <div className={styles.rvH2HItem}>
          <span className={styles.rvH2HVal}>{rival.gf}–{rival.ga}</span>
          <span className={styles.rvH2HKey}>Goals</span>
        </div>
      </div>

      {/* Narrative */}
      {narrative && (
        <p className={styles.rvNarrative}>{narrative}</p>
      )}

      {/* Finals note */}
      {finalsCount > 0 && (
        <div className={styles.rvFinalsNote}>
          ⚡ {finalsCount} UCL final{finalsCount > 1 ? 's' : ''} against {rival.displayName}
        </div>
      )}

      {/* Match log grouped by season */}
      <div className={styles.rvMatchLog}>
        {seasonGroups.map(group => (
          <div key={group.label}>
            <div className={styles.rvSeasonDivider}>{group.label}</div>
            {group.matches.map((m, i) => {
              const win  = m.score_for > m.score_against
              const draw = m.score_for === m.score_against
              const res  = win ? 'W' : draw ? 'D' : 'L'
              const col  = win ? 'var(--en-green)' : draw ? 'var(--en-text-3)' : 'var(--danger)'
              const isFinal = m.competition === 'UCL_Final'
              return (
                <div key={i} className={styles.rvMatchRow}>
                  <span className={styles.rvMatchRes} style={{ color: col }}>{res}</span>
                  <div className={styles.rvMatchInfo}>
                    <span className={styles.rvMatchComp}
                      style={isFinal ? { color: 'var(--en-gold)' } : undefined}>
                      {COMP_SHORT[m.competition] || m.competition}
                    </span>
                    {m.leg != null && (
                      <span className={styles.rvMatchLeg}>Leg {m.leg}</span>
                    )}
                  </div>
                  <span className={styles.rvMatchScore}>{fmtScore(m.score_for, m.score_against)}</span>
                  <span className={styles.rvMatchVenue}
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
  )
}

// ─── League/nation records sub-section ───────────────────────────────────────
function LeagueRecords({ uclMatches, opponents }) {
  const groups = deriveUclLeagueRecords(uclMatches, opponents)
  if (groups.length === 0) return null

  return (
    <div className={styles.rvLeagueWrap}>
      <p className={styles.rvLeagueTitle}>Record by League / Nation</p>

      <div className={styles.rvLeagueHead}>
        <span className={styles.rvLgLeague}>League</span>
        <span className={styles.rvLgStat}>P</span>
        <span className={styles.rvLgStat}>W</span>
        <span className={styles.rvLgStat}>D</span>
        <span className={styles.rvLgStat}>L</span>
        <span className={styles.rvLgStat}>GD</span>
      </div>

      {groups.map(g => (
        <div key={g.country} className={styles.rvLeagueRow}>
          <div className={styles.rvLgLeague}>
            <span className={styles.rvLgName}>{g.league !== 'Unknown' ? g.league : g.country}</span>
            <span className={styles.rvLgNation}>{g.country !== 'Unknown' ? g.country : ''}</span>
          </div>
          <span className={styles.rvLgStat}>{g.p}</span>
          <span className={styles.rvLgStat} style={{ color: 'var(--en-green)' }}>{g.w}</span>
          <span className={styles.rvLgStat} style={{ color: 'var(--en-text-3)' }}>{g.d}</span>
          <span className={styles.rvLgStat} style={{ color: 'var(--danger)' }}>{g.l}</span>
          <span className={styles.rvLgStat}
            style={{ color: g.gd > 0 ? 'var(--en-green)' : g.gd < 0 ? 'var(--danger)' : undefined }}>
            {fmtGD(g.gf, g.ga)}
          </span>
        </div>
      ))}

      {/* Clubs note per row — shown as subscript */}
      {groups.map(g => (
        <div key={`clubs-${g.country}`} className={styles.rvLgClubs}>
          <span className={styles.rvLgClubsLabel}>
            {g.league !== 'Unknown' ? g.league : g.country}:
          </span>
          {' '}{g.clubs.join(', ')}
        </div>
      ))}
    </div>
  )
}

// ─── Main rivals list ─────────────────────────────────────────────────────────
export default function UclRivals({ uclMatches, opponents, clubName, loading }) {
  const [selected, setSelected] = useState(null)
  const [view,     setView]     = useState('rivals') // 'rivals' | 'leagues'

  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  // Derive UCL rivals — matches already have seasonLabel stamped
  const rivals = deriveUclRivals(uclMatches, opponents)

  if (selected) {
    const rival = rivals.find(r => r.opponentKey === selected)
    return (
      <RivalDetail
        rival={rival}
        clubName={clubName}
        onBack={() => setSelected(null)}
      />
    )
  }

  if (rivals.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>⚔️</span>
        <p className={styles.emptyText}>No UCL opponents yet</p>
        <p className={styles.emptyHint}>UCL opponents appear from match docs.</p>
      </div>
    )
  }

  return (
    <div className={styles.rvWrap}>
      {/* View toggle */}
      <div className={styles.rvToggleBar}>
        <button
          className={`${styles.rvToggleBtn} ${view === 'rivals' ? styles.rvToggleActive : ''}`}
          onClick={() => setView('rivals')}
        >
          Opponents
        </button>
        <button
          className={`${styles.rvToggleBtn} ${view === 'leagues' ? styles.rvToggleActive : ''}`}
          onClick={() => setView('leagues')}
        >
          By League
        </button>
        <span className={styles.rvCount}>{rivals.length} clubs</span>
      </div>

      {view === 'leagues' ? (
        <LeagueRecords uclMatches={uclMatches} opponents={opponents} />
      ) : (
        <>
          {/* Rivals table */}
          <div className={styles.rvTableHead}>
            <span className={styles.rvThOpp}>Opponent</span>
            <span className={styles.rvThStat}>P</span>
            <span className={styles.rvThStat}>W</span>
            <span className={styles.rvThStat}>D</span>
            <span className={styles.rvThStat}>L</span>
            <span className={styles.rvThStat}>GD</span>
          </div>

          {rivals.map(r => (
            <button
              key={r.opponentKey}
              className={styles.rvRow}
              onClick={() => setSelected(r.opponentKey)}
            >
              <div className={styles.rvOpp}>
                {r.crestUrl && (
                  <img src={r.crestUrl} alt="" className={styles.rvCrest}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                <div className={styles.rvOppText}>
                  <span className={styles.rvOppName}>{r.displayName}</span>
                  {(r.league || r.country) && (
                    <span className={styles.rvOppLeague}>{r.league || r.country}</span>
                  )}
                </div>
                {r.finals > 0 && (
                  <span className={styles.rvFinalBadge}>Final</span>
                )}
              </div>
              <span className={styles.rvStat}>{r.played}</span>
              <span className={styles.rvStat} style={{ color: 'var(--en-green)' }}>{r.w}</span>
              <span className={styles.rvStat} style={{ color: 'var(--en-text-3)' }}>{r.d}</span>
              <span className={styles.rvStat} style={{ color: 'var(--danger)' }}>{r.l}</span>
              <span className={styles.rvStat}
                style={{ color: r.gd > 0 ? 'var(--en-green)' : r.gd < 0 ? 'var(--danger)' : undefined }}>
                {r.gd > 0 ? `+${r.gd}` : r.gd}
              </span>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className={styles.rvChevron}>
                <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
