import { useState } from 'react'
import styles from './UCL.module.css'
import {
  deriveUclRivals,
  deriveUclLeagueRecords,
  buildUclRivalNarrative,
  fmtScore,
  fmtGD,
  ROUND_LABELS,
} from '../../utils/uclUtils'

// ─── Opponent detail view ─────────────────────────────────────────────────────
function OpponentDetail({ rival, clubName, onBack }) {
  if (!rival) return null
  const narrative   = buildUclRivalNarrative(rival, clubName)
  const finalsCount = rival.matches.filter(m => m.competition === 'UCL_Final').length

  const seasonGroups = []
  for (const m of rival.matches) {
    const label = m.seasonLabel || '—'
    const last  = seasonGroups[seasonGroups.length - 1]
    if (last && last.label === label) last.matches.push(m)
    else seasonGroups.push({ label, matches: [m] })
  }

  return (
    <div className={styles.rvDetail}>
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
            <span className={styles.rvDetailLeague}>{rival.league || rival.country}</span>
          )}
        </div>
      </div>

      {/* H2H stat bar */}
      <div className={styles.rvH2H}>
        {[
          { k: 'Won',   v: rival.w,  c: 'var(--en-text-1)'  },
          { k: 'Drawn', v: rival.d,  c: 'var(--en-text-3)' },
          { k: 'Lost',  v: rival.l,  c: 'var(--en-text-1)'  },
          { k: 'Goals', v: `${rival.gf}–${rival.ga}` },
        ].map(({ k, v, c }) => (
          <div key={k} className={styles.rvH2HItem}>
            <span className={styles.rvH2HVal} style={c ? { color: c } : undefined}>{v}</span>
            <span className={styles.rvH2HKey}>{k}</span>
          </div>
        ))}
      </div>

      {narrative && <p className={styles.rvNarrative}>{narrative}</p>}

      {finalsCount > 0 && (
        <div className={styles.rvFinalsNote}>
          ★ {finalsCount} UCL final{finalsCount > 1 ? 's' : ''} against {rival.displayName}
        </div>
      )}

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
                      {ROUND_LABELS[m.competition] || m.competition || '—'}
                    </span>
                    {m.leg != null && <span className={styles.rvMatchLeg}>· Leg {m.leg}</span>}
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

// ─── League detail view ───────────────────────────────────────────────────────
function LeagueDetail({ group, opponents, onBack }) {
  if (!group) return null

  const byOpp = {}
  for (const m of group.matches) {
    const key = m.opponentKey || m.opponent || 'unknown'
    if (!byOpp[key]) {
      const rec  = opponents?.get(m.opponentKey)
      byOpp[key] = {
        key,
        displayName: rec?.displayName || m.opponent || key,
        crestUrl:    rec?.crestUrl    || null,
        matches:     [],
      }
    }
    byOpp[key].matches.push(m)
  }

  const clubs = Object.values(byOpp).sort((a, b) => b.matches.length - a.matches.length)

  return (
    <div className={styles.rvDetail}>
      <div className={styles.rvDetailHead}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className={styles.rvDetailTitle}>
          <span className={styles.rvDetailName}>{group.league !== 'Unknown' ? group.league : group.country}</span>
          {group.country !== 'Unknown' && <span className={styles.rvDetailLeague}>{group.country}</span>}
        </div>
      </div>

      <div className={styles.rvH2H}>
        {[
          { k: 'Won',   v: group.w,  c: 'var(--en-text-1)'  },
          { k: 'Drawn', v: group.d,  c: 'var(--en-text-3)' },
          { k: 'Lost',  v: group.l,  c: 'var(--en-text-1)'  },
          { k: 'Goals', v: `${group.gf}–${group.ga}` },
        ].map(({ k, v, c }) => (
          <div key={k} className={styles.rvH2HItem}>
            <span className={styles.rvH2HVal} style={c ? { color: c } : undefined}>{v}</span>
            <span className={styles.rvH2HKey}>{k}</span>
          </div>
        ))}
      </div>

      {clubs.map(club => {
        const cw  = club.matches.filter(m => m.score_for  > m.score_against).length
        const cd  = club.matches.filter(m => m.score_for === m.score_against).length
        const cl  = club.matches.filter(m => m.score_for  < m.score_against).length
        const cgf = club.matches.reduce((s, m) => s + (m.score_for || 0), 0)
        const cga = club.matches.reduce((s, m) => s + (m.score_against || 0), 0)

        const seasonGroups = []
        for (const m of club.matches) {
          const label = m.seasonLabel || '—'
          const last  = seasonGroups[seasonGroups.length - 1]
          if (last && last.label === label) last.matches.push(m)
          else seasonGroups.push({ label, matches: [m] })
        }

        return (
          <div key={club.key} className={styles.rvLeagueClubBlock}>
            <div className={styles.rvLeagueClubHead}>
              {club.crestUrl && (
                <img src={club.crestUrl} alt="" className={styles.rvCrest}
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              )}
              <span className={styles.rvLeagueClubName}>{club.displayName}</span>
              <span className={styles.rvLeagueClubRecord}>
                {cw}W {cd}D {cl}L · {cgf}–{cga}
              </span>
            </div>
            <div className={styles.rvMatchLog}>
              {seasonGroups.map(g => (
                <div key={g.label}>
                  <div className={styles.rvSeasonDivider}>{g.label}</div>
                  {g.matches.map((m, i) => {
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
                            {ROUND_LABELS[m.competition] || m.competition || '—'}
                          </span>
                          {m.leg != null && <span className={styles.rvMatchLeg}>· Leg {m.leg}</span>}
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
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function UclRivals({ uclMatches, opponents, clubName, loading }) {
  const [selected,       setSelected]       = useState(null)
  const [selectedLeague, setSelectedLeague] = useState(null)
  const [view,           setView]           = useState('rivals')

  if (loading) {
    return <div className={styles.loadWrap}><div className={styles.spinner} /></div>
  }

  const rivals       = deriveUclRivals(uclMatches, opponents)
  const leagueGroups = deriveUclLeagueRecords(uclMatches, opponents)

  if (selected) {
    const rival = rivals.find(r => r.opponentKey === selected)
    return <OpponentDetail rival={rival} clubName={clubName} onBack={() => setSelected(null)} />
  }

  if (selectedLeague) {
    return <LeagueDetail group={selectedLeague} opponents={opponents} onBack={() => setSelectedLeague(null)} />
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
        <button className={`${styles.rvToggleBtn} ${view === 'rivals' ? styles.rvToggleActive : ''}`}
          onClick={() => setView('rivals')}>
          Opponents
        </button>
        <button className={`${styles.rvToggleBtn} ${view === 'leagues' ? styles.rvToggleActive : ''}`}
          onClick={() => setView('leagues')}>
          By League
        </button>
        <span className={styles.rvCount}>{rivals.length} clubs</span>
      </div>

      {view === 'leagues' ? (
        <div>
          <div className={styles.rvLeagueTableHead}>
            <span className={styles.rvLgThLeague}>League</span>
            <span className={styles.rvLgThNation}>Nation</span>
            <span className={styles.rvLgThStat}>P</span>
            <span className={styles.rvLgThStat}>W</span>
            <span className={styles.rvLgThStat}>D</span>
            <span className={styles.rvLgThStat}>L</span>
            <span className={styles.rvLgThStat}>GD</span>
          </div>

          {leagueGroups.map(g => (
            <button key={g.country} className={styles.rvLeagueRow53}
              onClick={() => setSelectedLeague(g)}>
              <span className={styles.rvLgTdLeague}>
                {g.league !== 'Unknown' ? g.league : g.country}
              </span>
              <span className={styles.rvLgTdNation}>
                {g.country !== 'Unknown' ? g.country : '—'}
              </span>
              <span className={styles.rvLgTdStat}>{g.p}</span>
              <span className={styles.rvLgTdStat}>{g.w}</span>
              <span className={styles.rvLgTdStat}>{g.d}</span>
              <span className={styles.rvLgTdStat}>{g.l}</span>
              <span className={styles.rvLgTdStat}>{fmtGD(g.gf, g.ga)}</span>
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none" className={styles.rvChevron}>
                <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.rvTableHead}>
            <span className={styles.rvThOpp}>Opponent</span>
            <span className={styles.rvThStat}>P</span>
            <span className={styles.rvThStat}>W</span>
            <span className={styles.rvThStat}>D</span>
            <span className={styles.rvThStat}>L</span>
            <span className={styles.rvThStat}>GD</span>
          </div>
          {rivals.map(r => (
            <button key={r.opponentKey} className={styles.rvRow}
              onClick={() => setSelected(r.opponentKey)}>
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
              </div>
              <span className={styles.rvStat}>{r.played}</span>
              <span className={styles.rvStat}>{r.w}</span>
              <span className={styles.rvStat}>{r.d}</span>
              <span className={styles.rvStat}>{r.l}</span>
              <span className={styles.rvStat}>{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
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
