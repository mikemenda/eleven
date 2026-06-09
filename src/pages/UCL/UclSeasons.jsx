import { useState } from 'react'
import styles from './UCL.module.css'
import { fmtScore, fmtGD, ROUND_LABELS, UCL_KO_COMPS } from '../../utils/uclUtils'

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

  return (
    <button className={styles.sznCard} onClick={() => onSelect(summary)}>
      <div className={styles.sznCardHead}>
        <div className={styles.sznCardLeft}>
          <span className={styles.sznLabel}>{season.label}</span>
          <span className={styles.sznYear}>{season.year}</span>
        </div>
        <span className={styles.sznResult} style={{ color: finishColor }}>
          {isChampion && <span className={styles.sznStar}>★ </span>}
          {finishLabel}
        </span>
      </div>

      {matchRecord.p > 0 && (
        <div className={styles.sznCardRecord}>
          {[
            { k: 'P', v: matchRecord.p },
            { k: 'W', v: matchRecord.w, c: 'var(--en-green)'  },
            { k: 'D', v: matchRecord.d, c: 'var(--en-text-3)' },
            { k: 'L', v: matchRecord.l, c: 'var(--danger)'    },
          ].map(({ k, v, c }) => (
            <span key={k} className={styles.sznRecordItem}>
              <span className={styles.sznRecordVal} style={c ? { color: c } : undefined}>{v}</span>
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

      {koPath.length > 0 && (
        <div className={styles.sznKOStrip}>
          {koPath.map(ko => {
            const name  = ko.oppKey && opponents?.has(ko.oppKey)
              ? opponents.get(ko.oppKey).displayName
              : ko.opp || '?'
            const crest = matchCrest(ko.oppKey, opponents)
            const agg   = ko.agg ? fmtScore(ko.agg.totalFor, ko.agg.totalAgainst) : null
            const col   = ko.res === 'W' ? 'var(--en-green)' : ko.res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
            return (
              <div key={ko.comp} className={styles.sznKOItem}>
                <span className={styles.sznKORound}>{ko.label}</span>
                {crest && (
                  <img src={crest} alt="" className={styles.sznKOCrest}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                <span className={styles.sznKOOpp}>{name}</span>
                {agg && <span className={styles.sznKOAgg} style={{ color: col }}>{agg}</span>}
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

      {matchRecord.p > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Campaign Record</p>
          <div className={styles.sznDetailStatRow}>
            {[
              { k: 'P',  v: matchRecord.p },
              { k: 'W',  v: matchRecord.w, c: 'var(--en-green)'  },
              { k: 'D',  v: matchRecord.d, c: 'var(--en-text-3)' },
              { k: 'L',  v: matchRecord.l, c: 'var(--danger)'    },
              { k: 'GF', v: matchRecord.gf },
              { k: 'GA', v: matchRecord.ga },
            ].map(({ k, v, c }) => (
              <div key={k} className={styles.sznDetailStat}>
                <span className={styles.sznDetailStatVal} style={c ? { color: c } : undefined}>{v}</span>
                <span className={styles.sznDetailStatKey}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {koPath.length > 0 && (
        <div className={styles.sznDetailSection}>
          <p className={styles.sznDetailSectionLabel}>Knockout Path</p>
          {koPath.map(ko => {
            const name  = ko.oppKey && opponents?.has(ko.oppKey)
              ? opponents.get(ko.oppKey).displayName
              : ko.opp || '?'
            const crest  = matchCrest(ko.oppKey, opponents)
            const agg    = ko.agg ? fmtScore(ko.agg.totalFor, ko.agg.totalAgainst) : null
            const col    = ko.res === 'W' ? 'var(--en-green)' : ko.res === 'L' ? 'var(--danger)' : 'var(--en-text-3)'
            const fullLabel = ROUND_LABELS[ko.comp] || ko.label
            return (
              <div key={ko.comp} className={styles.sznKORow}>
                <span className={styles.sznKORoundBadge}>{fullLabel}</span>
                <div className={styles.sznKOOppBlock}>
                  {crest && (
                    <img src={crest} alt="" className={styles.sznKOCrestLg}
                      onError={e => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <span className={styles.sznKOOppName}>{name}</span>
                </div>
                {agg && <span className={styles.sznKOAggLg} style={{ color: col }}>{agg}</span>}
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

// ─── Career knockout section — round record table only (Ties + Finals removed) ──
function CareerKnockoutSection({ knockoutData }) {
  const { legRecord } = knockoutData || {}

  const hasLegData = legRecord && UCL_KO_COMPS.some(c => legRecord[c]?.p > 0)
  if (!hasLegData) return null

  return (
    <div className={styles.sznCareerKO}>
      <p className={styles.sznCareerKOTitle}>Career Knockout Record</p>

      <div className={styles.koTableHead}>
        <span className={styles.koThRound}>Round</span>
        <span className={styles.koThStat}>P</span>
        <span className={styles.koThStat}>W</span>
        <span className={styles.koThStat}>D</span>
        <span className={styles.koThStat}>L</span>
        <span className={styles.koThStat}>GD</span>
      </div>

      {UCL_KO_COMPS.map(comp => {
        const row = legRecord[comp]
        if (!row || row.p === 0) return null
        const isFinal = comp === 'UCL_Final'
        return (
          <div key={comp} className={styles.koTableRow}
            style={isFinal ? { borderTop: '0.5px solid var(--en-rule)' } : undefined}>
            <span className={styles.koTdRound} style={isFinal ? { color: 'var(--en-gold)' } : undefined}>
              {ROUND_LABELS[comp] || comp}
            </span>
            <span className={styles.koTdStat}>{row.p}</span>
            <span className={styles.koTdStat} style={{ color: 'var(--en-green)' }}>{row.w}</span>
            <span className={styles.koTdStat} style={{ color: 'var(--en-text-3)' }}>{row.d}</span>
            <span className={styles.koTdStat} style={{ color: 'var(--danger)' }}>{row.l}</span>
            <span className={styles.koTdStat}
              style={{ color: row.gd > 0 ? 'var(--en-green)' : row.gd < 0 ? 'var(--danger)' : undefined }}>
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
      {/* Career knockout round record — compact, no Ties, no Finals */}
      <CareerKnockoutSection knockoutData={knockoutData} />
    </div>
  )
}
