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

      <div className={styles.rvH2H}>
        {[
          { k: 'Won',   v: rival.w  },
          { k: 'Drawn', v: rival.d  },
          { k: 'Lost',  v: rival.l  },
          { k: 'Goals', v: `${rival.gf}–${rival.ga}` },
        ].map(({ k, v }) => (
          <div key={k} className={styles.rvH2HItem}>
            <span className={styles.rvH2HVal}>{v}</span>
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
                    style={{ color: m.home_away === 'H' ? 'var(--en-text-2)' : 'var(--en-text-3)' }}>
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

  // GD stat for the H2H bar
  const gd = group.gf - group.ga

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

      {/* H2H bar — GD instead of raw Goals */}
      <div className={styles.rvH2H}>
        {[
          { k: 'Won',   v: group.w },
          { k: 'Drawn', v: group.d },
          { k: 'Lost',  v: group.l },
          { k: 'GD',    v: gd > 0 ? `+${gd}` : gd },
        ].map(({ k, v }) => (
          <div key={k} className={styles.rvH2HItem}>
            <span className={styles.rvH2HVal}>{v}</span>
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
                    const scoreStr = fmtScore(m.score_for, m.score_against)
                    return (
                      // Redesigned match row: left = stage · season [· Leg N], right = W/D/L score H/A
                      <div key={i} className={styles.rvLeagueMatchRow}>
                        <div className={styles.rvLeagueMatchLeft}>
                          <span
                            className={styles.rvLeagueMatchStage}
                            style={isFinal ? { color: 'var(--en-gold)' } : undefined}
                          >
                            {g.label} · {ROUND_LABELS[m.competition] || m.competition || '—'}
                          </span>
                          {m.leg != null && (
                            <span className={styles.rvLeagueMatchLeg}>Leg {m.leg}</span>
                          )}
                        </div>
                        <div className={styles.rvLeagueMatchRight}>
                          <span className={styles.rvLeagueMatchRes} style={{ color: col }}>{res}</span>
                          <span className={styles.rvLeagueMatchScore}>{scoreStr}</span>
                          <span
                            className={styles.rvLeagueMatchVenue}
                            style={{ color: m.home_away === 'H' ? 'var(--en-text-2)' : 'var(--en-text-3)' }}
                          >
                            {m.home_away || '—'}
                          </span>
                        </div>
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

// ─── Sortable column header button ────────────────────────────────────────────
function SortTh({ label, colKey, sortKey, sortDir, onSort, className }) {
  const active = sortKey === colKey
  return (
    <button
      className={`${className} ${active ? styles.rvThSortActive : ''}`}
      onClick={() => onSort(colKey)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
               display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2,
               width: '100%' }}
    >
      {label}
      {active && <span style={{ fontSize: 9 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function UclRivals({ uclMatches, opponents, clubName, loading }) {
  const [selected,       setSelected]       = useState(null)
  const [selectedLeague, setSelectedLeague] = useState(null)
  const [view,           setView]           = useState('rivals')

  // Opponents sort state — default: Played desc
  const [oppSortKey, setOppSortKey] = useState('played')
  const [oppSortDir, setOppSortDir] = useState('desc')

  // League sort state — default: Played desc
  const [lgSortKey, setLgSortKey] = useState('p')
  const [lgSortDir, setLgSortDir] = useState('desc')

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

  // Sort helpers
  function handleOppSort(key) {
    if (key === oppSortKey) setOppSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setOppSortKey(key); setOppSortDir('desc') }
  }
  function handleLgSort(key) {
    if (key === lgSortKey) setLgSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setLgSortKey(key); setLgSortDir('desc') }
  }

  // Sort opponents
  const sortedRivals = [...rivals].sort((a, b) => {
    const getVal = (r, k) => {
      if (k === 'played') return r.played
      if (k === 'gd')     return r.gd
      return r[k] ?? 0
    }
    const av = getVal(a, oppSortKey)
    const bv = getVal(b, oppSortKey)
    return oppSortDir === 'desc' ? bv - av : av - bv
  })

  // Sort leagues
  const sortedLeagues = [...leagueGroups].sort((a, b) => {
    const getVal = (g, k) => {
      if (k === 'gd') return g.gf - g.ga
      return g[k] ?? 0
    }
    const av = getVal(a, lgSortKey)
    const bv = getVal(b, lgSortKey)
    return lgSortDir === 'desc' ? bv - av : av - bv
  })

  return (
    <div className={styles.rvWrap}>
      {/* Toggle — count label inline, improved readability */}
      <div className={styles.rvToggleBar}>
        <button className={`${styles.rvToggleBtn} ${view === 'rivals' ? styles.rvToggleActive : ''}`}
          onClick={() => setView('rivals')}>
          Opponents
        </button>
        <button className={`${styles.rvToggleBtn} ${view === 'leagues' ? styles.rvToggleActive : ''}`}
          onClick={() => setView('leagues')}>
          By League
        </button>
        <span className={styles.rvCount}>
          {view === 'rivals'
            ? `${rivals.length} club${rivals.length !== 1 ? 's' : ''}`
            : `${leagueGroups.length} league${leagueGroups.length !== 1 ? 's' : ''}`
          }
        </span>
      </div>

      {view === 'leagues' ? (
        <div>
          {/* Sortable league table header */}
          <div className={styles.rvLeagueTableHead}>
            <span className={styles.rvLgThLeague}>League</span>
            <span className={styles.rvLgThNation}>Nation</span>
            <SortTh label="P"  colKey="p"  sortKey={lgSortKey} sortDir={lgSortDir} onSort={handleLgSort} className={styles.rvLgThStat} />
            <SortTh label="W"  colKey="w"  sortKey={lgSortKey} sortDir={lgSortDir} onSort={handleLgSort} className={styles.rvLgThStat} />
            <SortTh label="D"  colKey="d"  sortKey={lgSortKey} sortDir={lgSortDir} onSort={handleLgSort} className={styles.rvLgThStat} />
            <SortTh label="L"  colKey="l"  sortKey={lgSortKey} sortDir={lgSortDir} onSort={handleLgSort} className={styles.rvLgThStat} />
            <SortTh label="GD" colKey="gd" sortKey={lgSortKey} sortDir={lgSortDir} onSort={handleLgSort} className={styles.rvLgThStat} />
          </div>

          {sortedLeagues.map(g => {
            const gdVal = g.gf - g.ga
            return (
              <button key={g.country} className={styles.rvLeagueRow53}
                onClick={() => setSelectedLeague(g)}>
                <span className={`${styles.rvLgTdLeague} ${lgSortKey === 'p' || lgSortKey === 'w' || lgSortKey === 'd' || lgSortKey === 'l' || lgSortKey === 'gd' ? '' : ''}`}>
                  {g.league !== 'Unknown' ? g.league : g.country}
                </span>
                <span className={styles.rvLgTdNation}>
                  {g.country !== 'Unknown' ? g.country : '—'}
                </span>
                <span className={`${styles.rvLgTdStat} ${lgSortKey === 'p'  ? styles.rvTdSortActive : ''}`}>{g.p}</span>
                <span className={`${styles.rvLgTdStat} ${lgSortKey === 'w'  ? styles.rvTdSortActive : ''}`}>{g.w}</span>
                <span className={`${styles.rvLgTdStat} ${lgSortKey === 'd'  ? styles.rvTdSortActive : ''}`}>{g.d}</span>
                <span className={`${styles.rvLgTdStat} ${lgSortKey === 'l'  ? styles.rvTdSortActive : ''}`}>{g.l}</span>
                <span className={`${styles.rvLgTdStat} ${lgSortKey === 'gd' ? styles.rvTdSortActive : ''}`}>{gdVal > 0 ? `+${gdVal}` : gdVal}</span>
                <svg width="10" height="10" viewBox="0 0 20 20" fill="none" className={styles.rvChevron}>
                  <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )
          })}
        </div>
      ) : (
        <>
          {/* Sortable opponents table header */}
          <div className={styles.rvTableHead}>
            <span className={styles.rvThOpp}>Opponent</span>
            <SortTh label="P"  colKey="played" sortKey={oppSortKey} sortDir={oppSortDir} onSort={handleOppSort} className={styles.rvThStat} />
            <SortTh label="W"  colKey="w"      sortKey={oppSortKey} sortDir={oppSortDir} onSort={handleOppSort} className={styles.rvThStat} />
            <SortTh label="D"  colKey="d"      sortKey={oppSortKey} sortDir={oppSortDir} onSort={handleOppSort} className={styles.rvThStat} />
            <SortTh label="L"  colKey="l"      sortKey={oppSortKey} sortDir={oppSortDir} onSort={handleOppSort} className={styles.rvThStat} />
            <SortTh label="GD" colKey="gd"     sortKey={oppSortKey} sortDir={oppSortDir} onSort={handleOppSort} className={styles.rvThStat} />
          </div>
          {sortedRivals.map(r => (
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
              <span className={`${styles.rvStat} ${oppSortKey === 'played' ? styles.rvTdSortActive : ''}`}>{r.played}</span>
              <span className={`${styles.rvStat} ${oppSortKey === 'w'      ? styles.rvTdSortActive : ''}`}>{r.w}</span>
              <span className={`${styles.rvStat} ${oppSortKey === 'd'      ? styles.rvTdSortActive : ''}`}>{r.d}</span>
              <span className={`${styles.rvStat} ${oppSortKey === 'l'      ? styles.rvTdSortActive : ''}`}>{r.l}</span>
              <span className={`${styles.rvStat} ${oppSortKey === 'gd'     ? styles.rvTdSortActive : ''}`}>
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
