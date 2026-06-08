import { useState } from 'react'
import styles from './UCL.module.css'
import { fmtScore, ROUND_SHORT, ROUND_LABELS } from '../../utils/uclUtils'

const FINISH_DISPLAY = {
  'Champions':  'Champions',
  'Runners-Up': 'Runner-Up',
  'SF':         'Semi-Final',
  'QF':         'Quarter-Final',
  'R16':        'Round of 16',
  'Playoff':    'Playoff',
  'LP Only':    'League Phase',
}

const FINISH_COLOR = {
  'Champions':  'var(--en-gold)',
  'Runners-Up': 'var(--en-text-2)',
  'SF':         'var(--en-blue)',
  'QF':         'var(--en-text-2)',
  'R16':        'var(--en-text-3)',
  'Playoff':    'var(--en-text-3)',
  'LP Only':    'var(--en-text-3)',
}

function matchOppName(m, opponents) {
  if (!m) return null
  const key = m.opponentKey
  if (key && opponents?.has(key)) return opponents.get(key).displayName || m.opponent
  return m.opponent || '—'
}

function matchCrest(opponentKey, opponents) {
  if (!opponentKey || !opponents) return null
  return opponents.get(opponentKey)?.crestUrl || null
}

// Campaign card — collapsed view in the list
function CampaignCard({ summary, opponents, onSelect }) {
  const { season, matchRecord, lpRecord, koPath } = summary
  const finish = season.uclResult
  const finishLabel = FINISH_DISPLAY[finish] || finish || '—'
  const finishColor = FINISH_COLOR[finish] || 'var(--en-text-3)'
  const isChampion = finish === 'Champions'

  return (
    <button className={styles.sznCard} onClick={() => onSelect(summary)}>
      {/* Header row */}
      <div className={styles.sznCardHead}>
        <div className={styles.sznCardLeft}>
          <span className={styles.sznLabel}>{season.label}</span>
          <span className={styles.sznYear}>{season.year}</span>
        </div>
        <span
          className={styles.sznResult}
          style={{ color: finishColor }}
        >
          {isChampion && <span className={styles.sznStar}>★ </span>}
          {finishLabel}
        </span>
      </div>

      {/* Record row */}
      {matchRecord.p > 0 && (
        <div className={styles.sznCardRecord}>
          <span className={styles.sznRecordItem}>
            <span className={styles.sznRecordVal}>{matchRecord.p}</span>
            <span className={styles.sznRecordKey}>P</span>
          </span>
          <span className={styles.sznRecordItem}>
            <span className={styles.sznRecordVal} style={{ color: 'var(--en-green)' }}>{matchRecord.w}</span>
            <span className={styles.sznRecordKey}>W</span>
          </span>
          <span className={styles.sznRecordItem}>
            <span className={styles.sznRecordVal} style={{ color: 'var(--en-text-3)' }}>{matchRecord.d}</span>
            <span className={styles.sznRecordKey}>D</span>
          </span>
          <span className={styles.sznRecordItem}>
            <span className={styles.sznRecordVal} style={{ color: 'var(--danger)' }}>{matchRecord.l}</span>
            <span className={styles.sznRecordKey}>L</span>
          </span>
          <span className={styles.sznRecordDivider} />
          <span className={styles.sznRecordItem}>
            <span className={styles.sznRecordVal}>{matchRecord.gf}</span>
            <span className={styles.sznRecordKey}>GF</span>
          </span>
          <span className={styles.sznRecordItem}>
            <span className={styles.sznRecordVal}>{matchRecord.ga}</span>
            <span className={styles.sznRecordKey}>GA</span>
          </span>
        </div>
      )}

      {/* KO path strip */}
      {koPath.length > 0 && (
        <div className={styles.sznKOStrip}>
          {koPath.map(ko => {
            const oppName = ko.oppKey && opponents?.has(ko.oppKey)
              ? opponents.get(ko.oppKey).displayName
              : ko.opp || '?'
            const crest = matchCrest(ko.oppKey, opponents)
            const aggStr = ko.agg ? fmtScore(ko.agg.totalFor, ko.agg.totalAgainst) : null
            const resColor = ko.res === 'W' ? 'var(--en-green)' : ko.res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
            return (
              <div key={ko.comp} className={styles.sznKOItem}>
                <span className={styles.sznKORound}>{ko.label}</span>
                {crest && (
                  <img src={crest} alt="" className={styles.sznKOCrest}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                <span className={styles.sznKOOpp}>{oppName}</span>
                {aggStr && (
                  <span className={styles.sznKOAgg} style={{ color: resColor }}>{aggStr}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className={styles.sznChevron}>
        <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  )
}

// ── MD_ORDER for sorting League Phase matchdays ───────────────────────────────
const MD_ORDER = ['MD1','MD2','MD3','MD4','MD5','MD6','MD7','MD8']

// Campaign detail — expanded view
function CampaignDetail({ summary, opponents, onBack }) {
  const { season, lpRecord, koPath, matchRecord, biggestWin } = summary
  const finish = season.uclResult
  const finishLabel = FINISH_DISPLAY[finish] || finish || '—'
  const isChampion  = finish === 'Champions'
  const finishColor = FINISH_COLOR[finish] || 'var(--en-text-3)'

  // League Phase matchday rows from the UCL matches for this season
  // We need to pull these from the koPath's parent — actually they're passed
  // from the parent component as the full match set per season
  // (LP rows are in summary.lpMatchDocs if populated, else use lpRecord)

  return (
    <div className={styles.sznDetail}>
      {/* Back button + header */}
      <div className={styles.sznDetailHead}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className={styles.sznDetailTitle}>
          <span className={styles.sznLabel}>{season.label}</span>
          <span className={styles.sznYear}> · {season.year}</span>
        </div>
        <span className={styles.sznResult} style={{ color: finishColor }}>
          {isChampion && '★ '}{finishLabel}
        </span>
      </div>

      {/* Overall record */}
      {matchRecord.p > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Campaign Record</p>
          <div className={styles.sznDetailStatRow}>
            {[
              { k: 'P',   v: matchRecord.p },
              { k: 'W',   v: matchRecord.w, c: 'var(--en-green)'  },
              { k: 'D',   v: matchRecord.d, c: 'var(--en-text-3)' },
              { k: 'L',   v: matchRecord.l, c: 'var(--danger)'    },
              { k: 'GF',  v: matchRecord.gf },
              { k: 'GA',  v: matchRecord.ga },
            ].map(({ k, v, c }) => (
              <div key={k} className={styles.sznDetailStat}>
                <span className={styles.sznDetailStatVal} style={c ? { color: c } : undefined}>{v}</span>
                <span className={styles.sznDetailStatKey}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* League Phase from season doc */}
      {(lpRecord || season.uclLeaguePhasePosition != null) && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>League Phase</p>
          {season.uclLeaguePhasePosition != null && (
            <p className={styles.sznDetailNote}>
              Finished {season.uclLeaguePhasePosition}{ordinal(season.uclLeaguePhasePosition)} in the League Phase
            </p>
          )}
          {lpRecord && (
            <div className={styles.sznDetailStatRow}>
              {[
                { k: 'P',  v: lpRecord.p },
                { k: 'W',  v: lpRecord.w, c: 'var(--en-green)'  },
                { k: 'D',  v: lpRecord.d, c: 'var(--en-text-3)' },
                { k: 'L',  v: lpRecord.l, c: 'var(--danger)'    },
                { k: 'GF', v: lpRecord.gf },
                { k: 'GA', v: lpRecord.ga },
              ].map(({ k, v, c }) => (
                <div key={k} className={styles.sznDetailStat}>
                  <span className={styles.sznDetailStatVal} style={c ? { color: c } : undefined}>{v}</span>
                  <span className={styles.sznDetailStatKey}>{k}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LP matchday table from match docs */}
      {summary.lpMatchDocs?.length > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Matchday Results</p>
          <div className={styles.sznMatchTable}>
            <div className={styles.sznMatchHead}>
              <span className={styles.sznMD}>MD</span>
              <span className={styles.sznMOpp}>Opponent</span>
              <span className={styles.sznMVen}>H/A</span>
              <span className={styles.sznMScore}>Score</span>
              <span className={styles.sznMRes}>—</span>
            </div>
            {summary.lpMatchDocs
              .slice()
              .sort((a, b) => {
                const ai = MD_ORDER.indexOf(a.round)
                const bi = MD_ORDER.indexOf(b.round)
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
              })
              .map((m, i) => {
                const oppName = matchOppName(m, opponents)
                const crest   = matchCrest(m.opponentKey, opponents)
                const res = m.score_for > m.score_against ? 'W' : m.score_for < m.score_against ? 'L' : 'D'
                const resColor = res === 'W' ? 'var(--en-green)' : res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
                return (
                  <div key={m.id ?? i} className={styles.sznMatchRow}>
                    <span className={styles.sznMD}>{m.round ? m.round.replace('MD','') : '—'}</span>
                    <span className={styles.sznMOpp}>
                      {crest && <img src={crest} alt="" className={styles.sznMCrest}
                        onError={e => { e.currentTarget.style.display = 'none' }} />}
                      {oppName}
                    </span>
                    <span className={styles.sznMVen}
                      style={{ color: m.home_away === 'H' ? 'var(--en-blue)' : 'var(--en-text-4)' }}>
                      {m.home_away || '—'}
                    </span>
                    <span className={styles.sznMScore}>{fmtScore(m.score_for, m.score_against) ?? '—'}</span>
                    <span className={styles.sznMRes} style={{ color: resColor }}>{res}</span>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* Knockout path */}
      {koPath.length > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Knockout Path</p>
          {koPath.map(ko => {
            const oppName = ko.oppKey && opponents?.has(ko.oppKey)
              ? opponents.get(ko.oppKey).displayName
              : ko.opp || '?'
            const crest   = matchCrest(ko.oppKey, opponents)
            const aggStr  = ko.agg ? fmtScore(ko.agg.totalFor, ko.agg.totalAgainst) : null
            const resColor = ko.res === 'W' ? 'var(--en-green)' : ko.res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'

            return (
              <div key={ko.comp} className={styles.sznKORow}>
                <span className={styles.sznKORoundBadge}>{ko.label}</span>
                <div className={styles.sznKOOppBlock}>
                  {crest && (
                    <img src={crest} alt="" className={styles.sznKOCrestLg}
                      onError={e => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <span className={styles.sznKOOppName}>{oppName}</span>
                </div>
                {aggStr && (
                  <span className={styles.sznKOAggLg} style={{ color: resColor }}>{aggStr}</span>
                )}
                {/* Individual legs */}
                {ko.legs?.length > 0 && (
                  <div className={styles.sznKOLegs}>
                    {ko.legs.map((leg, li) => {
                      const legRes = leg.score_for > leg.score_against ? 'W' : leg.score_for < leg.score_against ? 'L' : 'D'
                      const legResColor = legRes === 'W' ? 'var(--en-green)' : legRes === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
                      return (
                        <span key={li} className={styles.sznKOLeg}>
                          <span className={styles.sznKOLegLabel}>Leg {leg.leg ?? li + 1}</span>
                          <span className={styles.sznKOLegScore}>{fmtScore(leg.score_for, leg.score_against)}</span>
                          <span style={{ color: legResColor }}>{legRes}</span>
                          <span className={styles.sznKOLegVenue}
                            style={{ color: leg.home_away === 'H' ? 'var(--en-blue)' : 'var(--en-text-4)' }}>
                            {leg.home_away || ''}
                          </span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Biggest win */}
      {biggestWin && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Biggest Win</p>
          <div className={styles.sznDetailNote} style={{ color: 'var(--en-green)' }}>
            {fmtScore(biggestWin.score_for, biggestWin.score_against)}
            {' vs '}
            {matchOppName(biggestWin, opponents) || '—'}
          </div>
        </div>
      )}
    </div>
  )
}

function ordinal(n) {
  if (n == null) return ''
  const s = ['th','st','nd','rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

export default function UclSeasons({ summaries, opponents, loading }) {
  const [selected, setSelected] = useState(null)

  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🗓️</span>
        <p className={styles.emptyText}>No UCL campaigns recorded</p>
        <p className={styles.emptyHint}>UCL campaigns populate from your season records.</p>
      </div>
    )
  }

  if (selected) {
    return (
      <CampaignDetail
        summary={selected}
        opponents={opponents}
        onBack={() => setSelected(null)}
      />
    )
  }

  // Most recent first
  const sorted = [...summaries].sort((a, b) => {
    const ya = typeof a.season.year === 'string' ? parseInt(a.season.year.slice(0, 4), 10) : 0
    const yb = typeof b.season.year === 'string' ? parseInt(b.season.year.slice(0, 4), 10) : 0
    return yb - ya
  })

  return (
    <div className={styles.sznList}>
      {sorted.map(summary => (
        <CampaignCard
          key={summary.season.id}
          summary={summary}
          opponents={opponents}
          onSelect={setSelected}
        />
      ))}
    </div>
  )
}
