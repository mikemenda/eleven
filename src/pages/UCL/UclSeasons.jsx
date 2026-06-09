import { useState } from 'react'
import styles from './UCL.module.css'
import { fmtScore, fmtGD, ROUND_LABELS, ROUND_SHORT, UCL_KO_COMPS } from '../../utils/uclUtils'

const FINISH_DISPLAY = {
  'Champions':  'Champions',
  'Runners-Up': 'Finalist',
  'SF':         'Semi-Finalist',
  'QF':         'Quarterfinalist',
  'R16':        'Round of 16 Exit',
  'Playoff':    'Playoff',
  'LP Only':    'League Phase Exit',
}

const FINISH_COLOR = {
  'Champions':  'var(--en-gold)',
  'Runners-Up': 'var(--en-gold)',
  'SF':         'var(--en-text-2)',
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

function ordinal(n) {
  if (n == null) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

const MD_ORDER = ['MD1','MD2','MD3','MD4','MD5','MD6','MD7','MD8']

// ─── Campaign card ────────────────────────────────────────────────────────────
function CampaignCard({ summary, opponents, onSelect }) {
  const { season, matchRecord, koPath } = summary
  const finish      = season.uclResult
  const finishLabel = FINISH_DISPLAY[finish] || finish || '—'
  const finishColor = FINISH_COLOR[finish]   || 'var(--en-text-3)'
  const isChampion  = finish === 'Champions'
  const isFinalResult = finish === 'Champions' || finish === 'Runners-Up'

  return (
    <button className={styles.sznCard} onClick={() => onSelect(summary)}>
      {/* Row 1: Season label + year */}
      <div className={styles.sznCardHead}>
        <div className={styles.sznCardLeft}>
          <span className={styles.sznLabel}>{season.label}</span>
          <span className={styles.sznYear}>· {season.year}</span>
        </div>
      </div>

      {/* Row 2: Result badge on its own line */}
      <div className={styles.sznResultRow}>
        <span className={styles.sznResult} style={{ color: finishColor }}>
          {isChampion && <span className={styles.sznStar}>★ </span>}
          {finishLabel}
        </span>
      </div>

      {/* Row 3: Campaign record */}
      {matchRecord.p > 0 && (
        <div className={styles.sznCardRecord}>
          {[
            { k: 'P',  v: matchRecord.p  },
            { k: 'W',  v: matchRecord.w  },
            { k: 'D',  v: matchRecord.d  },
            { k: 'L',  v: matchRecord.l  },
          ].map(({ k, v }) => (
            <span key={k} className={styles.sznRecordItem}>
              <span className={styles.sznRecordVal}>{v}</span>
              <span className={styles.sznRecordKey}>{k}</span>
            </span>
          ))}
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

      {/* Row 4: KO path */}
      {koPath.length > 0 && (
        <div className={styles.sznKOStrip}>
          {koPath.map(ko => {
            const name  = ko.oppKey && opponents?.has(ko.oppKey)
              ? opponents.get(ko.oppKey).displayName
              : ko.opp || '?'
            const crest = matchCrest(ko.oppKey, opponents)
            const agg   = ko.agg ? fmtScore(ko.agg.totalFor, ko.agg.totalAgainst) : null
            const isFinal = ko.comp === 'UCL_Final'
            const aggColor = isFinal
              ? 'var(--en-gold)'
              : ko.res === 'W' ? 'var(--en-text-1)' : ko.res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
            return (
              <div key={ko.comp} className={styles.sznKOItem}>
                <span
                  className={styles.sznKORound}
                  style={isFinal ? { color: 'var(--en-gold)' } : undefined}
                >
                  {ko.label}
                </span>
                {crest && (
                  <img src={crest} alt="" className={styles.sznKOCrest}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                <span
                  className={styles.sznKOOpp}
                  style={isFinal ? { color: 'var(--en-text-1)', fontWeight: 600 } : undefined}
                >
                  {name}
                </span>
                {agg && <span className={styles.sznKOAgg} style={{ color: aggColor }}>{agg}</span>}
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

// ─── Campaign detail ──────────────────────────────────────────────────────────
function CampaignDetail({ summary, opponents, onBack }) {
  const { season, lpRecord, koPath, matchRecord, biggestWin } = summary
  const finish      = season.uclResult
  const finishLabel = FINISH_DISPLAY[finish] || finish || '—'
  const isChampion  = finish === 'Champions'
  const finishColor = FINISH_COLOR[finish]   || 'var(--en-text-3)'

  return (
    <div className={styles.sznDetail}>
      {/* Header */}
      <div className={styles.sznDetailHead}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className={styles.sznDetailTitle}>
          <span className={styles.sznDetailSeason}>{season.label}</span>
          <span className={styles.sznDetailYear}> · {season.year}</span>
        </div>
        <span className={styles.sznResult} style={{ color: finishColor }}>
          {isChampion && '★ '}{finishLabel}
        </span>
      </div>

      {/* Campaign Record */}
      {matchRecord.p > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Campaign Record</p>
          <div className={styles.sznDetailStatRow}>
            {[
              { k: 'P',  v: matchRecord.p  },
              { k: 'W',  v: matchRecord.w  },
              { k: 'D',  v: matchRecord.d  },
              { k: 'L',  v: matchRecord.l  },
              { k: 'GF', v: matchRecord.gf },
              { k: 'GA', v: matchRecord.ga },
            ].map(({ k, v }) => (
              <div key={k} className={styles.sznDetailStat}>
                <span className={styles.sznDetailStatVal}>{v}</span>
                <span className={styles.sznDetailStatKey}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* League Phase */}
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
                { k: 'P',  v: lpRecord.p  },
                { k: 'W',  v: lpRecord.w  },
                { k: 'D',  v: lpRecord.d  },
                { k: 'L',  v: lpRecord.l  },
                { k: 'GF', v: lpRecord.gf },
                { k: 'GA', v: lpRecord.ga },
              ].map(({ k, v }) => (
                <div key={k} className={styles.sznDetailStat}>
                  <span className={styles.sznDetailStatVal}>{v}</span>
                  <span className={styles.sznDetailStatKey}>{k}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Matchday Results */}
      {summary.lpMatchDocs?.length > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Matchday Results</p>
          <div className={styles.sznMatchTable}>
            <div className={styles.sznMatchHead}>
              <span>MD</span>
              <span>Opponent</span>
              <span style={{ textAlign: 'center' }}>H/A</span>
              <span style={{ textAlign: 'right' }}>Score</span>
              <span style={{ textAlign: 'center' }}>—</span>
            </div>
            {summary.lpMatchDocs
              .slice()
              .sort((a, b) => {
                const ai = MD_ORDER.indexOf(a.round)
                const bi = MD_ORDER.indexOf(b.round)
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
              })
              .map((m, i) => {
                const name  = matchOppName(m, opponents)
                const crest = matchCrest(m.opponentKey, opponents)
                const res   = m.score_for > m.score_against ? 'W' : m.score_for < m.score_against ? 'L' : 'D'
                const col   = res === 'W' ? 'var(--en-green)' : res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
                return (
                  <div key={m.id ?? i} className={styles.sznMatchRow}>
                    <span className={styles.sznMD}>{m.round ? m.round.replace('MD', '') : '—'}</span>
                    <span className={styles.sznMOpp}>
                      {crest && <img src={crest} alt="" className={styles.sznMCrest}
                        onError={e => { e.currentTarget.style.display = 'none' }} />}
                      {name}
                    </span>
                    <span className={styles.sznMVen}
                      style={{ color: m.home_away === 'H' ? 'var(--en-blue)' : 'var(--en-text-4)' }}>
                      {m.home_away || '—'}
                    </span>
                    <span className={styles.sznMScore}>{fmtScore(m.score_for, m.score_against) ?? '—'}</span>
                    <span className={styles.sznMRes} style={{ color: col }}>{res}</span>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* Knockout Path */}
      {koPath.length > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Knockout Path</p>
          {koPath.map(ko => {
            const name   = ko.oppKey && opponents?.has(ko.oppKey)
              ? opponents.get(ko.oppKey).displayName
              : ko.opp || '?'
            const crest  = matchCrest(ko.oppKey, opponents)
            const agg    = ko.agg ? fmtScore(ko.agg.totalFor, ko.agg.totalAgainst) : null
            const isFinal = ko.comp === 'UCL_Final'
            const aggColor = isFinal
              ? 'var(--en-gold)'
              : ko.res === 'W' ? 'var(--en-text-1)' : ko.res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
            const fullLabel = ROUND_LABELS[ko.comp] || ko.label
            return (
              <div
                key={ko.comp}
                className={styles.sznKORow}
                style={isFinal ? { borderTop: '0.5px solid var(--en-rule)' } : undefined}
              >
                <span
                  className={styles.sznKORoundBadge}
                  style={isFinal ? { color: 'var(--en-gold)' } : undefined}
                >
                  {fullLabel}
                </span>
                <div className={styles.sznKOOppBlock}>
                  {crest && (
                    <img src={crest} alt="" className={styles.sznKOCrestLg}
                      onError={e => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <span
                    className={styles.sznKOOppName}
                    style={isFinal ? { color: 'var(--en-text-1)', fontWeight: 700 } : undefined}
                  >
                    {name}
                  </span>
                </div>
                {agg && (
                  <span className={styles.sznKOAggLg} style={{ color: aggColor }}>{agg}</span>
                )}
                {ko.legs?.length > 0 && (
                  <div className={styles.sznKOLegs}>
                    {ko.legs.map((leg, li) => {
                      const lr = leg.score_for > leg.score_against ? 'W' : leg.score_for < leg.score_against ? 'L' : 'D'
                      const lc = lr === 'W' ? 'var(--en-green)' : lr === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
                      return (
                        <span key={li} className={styles.sznKOLeg}>
                          <span className={styles.sznKOLegLabel}>Leg {leg.leg ?? li + 1}</span>
                          <span className={styles.sznKOLegScore}>{fmtScore(leg.score_for, leg.score_against)}</span>
                          <span style={{ color: lc }}>{lr}</span>
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

      {/* Biggest Win */}
      {biggestWin && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Biggest Win</p>
          <div className={styles.sznDetailNote}>
            {fmtScore(biggestWin.score_for, biggestWin.score_against)}
            {' vs '}
            {matchOppName(biggestWin, opponents) || '—'}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Career knockout section ──────────────────────────────────────────────────
function CareerKnockoutSection({ knockoutData }) {
  const { legRecord } = knockoutData || {}

  const hasLegData = legRecord && UCL_KO_COMPS.some(c => legRecord[c]?.p > 0)
  if (!hasLegData) return null

  return (
    <div className={styles.sznCareerKO}>
      <p className={styles.sznCareerKOTitle}>Career Knockout Record</p>

      <div className={styles.sznKOTableHead}>
        <span className={styles.sznKOThRound}>Round</span>
        <span className={styles.sznKOThStat}>P</span>
        <span className={styles.sznKOThStat}>W</span>
        <span className={styles.sznKOThStat}>D</span>
        <span className={styles.sznKOThStat}>L</span>
        <span className={styles.sznKOThStat}>GD</span>
      </div>

      {UCL_KO_COMPS.map(comp => {
        const row = legRecord[comp]
        if (!row || row.p === 0) return null
        const isFinal = comp === 'UCL_Final'
        return (
          <div
            key={comp}
            className={styles.sznKOTableRow}
            style={isFinal ? { borderTop: '0.5px solid var(--en-rule)' } : undefined}
          >
            <span
              className={styles.sznKOTdRound}
              style={isFinal ? { color: 'var(--en-gold)', fontWeight: 700 } : undefined}
            >
              {ROUND_SHORT[comp] || comp}
            </span>
            <span className={styles.sznKOTdStat}>{row.p}</span>
            <span className={styles.sznKOTdStat}>{row.w}</span>
            <span className={styles.sznKOTdStat}>{row.d}</span>
            <span className={styles.sznKOTdStat}>{row.l}</span>
            <span
              className={styles.sznKOTdStat}
              style={isFinal ? { color: 'var(--en-gold)' } : undefined}
            >
              {fmtGD(row.gf, row.ga)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function UclSeasons({ summaries, opponents, knockoutData, finals, loading }) {
  const [selected, setSelected] = useState(null)

  if (loading) {
    return <div className={styles.loadWrap}><div className={styles.spinner} /></div>
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
      <CareerKnockoutSection knockoutData={knockoutData} />
    </div>
  )
}
