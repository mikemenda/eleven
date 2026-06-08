import styles from './UCL.module.css'
import { fmtScore, fmtGD } from '../../utils/uclUtils'

// Result finish label → display string
const FINISH_DISPLAY = {
  'Champions':  'Champions',
  'Runners-Up': 'Runners-Up',
  'SF':         'Semi-Final',
  'QF':         'Quarter-Final',
  'R16':        'Round of 16',
  'Playoff':    'Playoff',
  'LP Only':    'League Phase',
}

// Small stat block used in the hero row
function StatPill({ label, value, accent }) {
  return (
    <div className={styles.ovStatPill}>
      <span
        className={styles.ovStatVal}
        style={accent ? { color: 'var(--en-gold)' } : undefined}
      >
        {value}
      </span>
      <span className={styles.ovStatKey}>{label}</span>
    </div>
  )
}

// Inline W/D/L coloured stat
function WDL({ w, d, l }) {
  return (
    <span className={styles.ovWDL}>
      <span style={{ color: 'var(--en-green)' }}>{w}W</span>
      {' '}
      <span style={{ color: 'var(--en-text-3)' }}>{d}D</span>
      {' '}
      <span style={{ color: 'var(--danger)' }}>{l}L</span>
    </span>
  )
}

// Enrich a match doc with opponent display name from the opponents map
function matchDisplayName(m, opponents) {
  if (!m) return null
  const key = m.opponentKey
  if (key && opponents?.has(key)) return opponents.get(key).displayName || m.opponent
  return m.opponent || null
}

export default function UclOverview({ overview, uclSeasons, opponents, loading }) {
  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (!overview || uclSeasons.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🏆</span>
        <p className={styles.emptyText}>No UCL data yet</p>
        <p className={styles.emptyHint}>UCL statistics populate from your season and match records.</p>
      </div>
    )
  }

  const { campaigns, titles, finals, semis, quarters, played, w, d, l, gf, ga, gd, bestFinish, biggestWin, worstLoss, mostCommonOppKey, winRate } = overview

  const biggestWinOpp  = matchDisplayName(biggestWin,  opponents)
  const worstLossOpp   = matchDisplayName(worstLoss,   opponents)
  const mostCommonName = mostCommonOppKey && opponents?.has(mostCommonOppKey)
    ? opponents.get(mostCommonOppKey).displayName
    : mostCommonOppKey

  return (
    <div className={styles.ovWrap}>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className={styles.ovHero}>
        <div className={styles.ovHeroLabel}>UEFA Champions League</div>
        <div className={styles.ovHeroName}>European Record</div>
        <div className={styles.ovHeroSub}>
          {campaigns} campaign{campaigns !== 1 ? 's' : ''}
          {titles > 0 && ` · ${titles} title${titles !== 1 ? 's' : ''}`}
          {finals > 0 && ` · ${finals} final${finals !== 1 ? 's' : ''}`}
        </div>
        <div className={styles.ovHeroRecord}>
          <WDL w={w} d={d} l={l} />
          <span className={styles.ovHeroDivider}>·</span>
          <span className={styles.ovHeroGoals}>{gf}–{ga}</span>
        </div>
      </div>

      {/* ── Stat row ──────────────────────────────────────────────── */}
      <div className={styles.ovStatRow}>
        <StatPill label="Matches"    value={played} />
        <StatPill label="Goals For"  value={gf} />
        <StatPill label="Goals Ag."  value={ga} />
        <StatPill label="Win Rate"   value={`${winRate}%`} accent />
      </div>

      {/* ── Stage breakdown ───────────────────────────────────────── */}
      <div className={styles.ovSection}>
        <p className={styles.ovSectionTitle}>Campaign Results</p>
        <div className={styles.ovStageGrid}>
          {[
            { label: 'Titles',      value: titles },
            { label: 'Finals',      value: finals },
            { label: 'Semi-Finals', value: semis + finals },
            { label: 'Quarters',    value: quarters + semis + finals },
          ].map(({ label, value }) => (
            <div key={label} className={styles.ovStageItem}>
              <span className={styles.ovStageVal} style={value > 0 ? { color: 'var(--en-gold)' } : undefined}>
                {value}
              </span>
              <span className={styles.ovStageKey}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Record detail ─────────────────────────────────────────── */}
      <div className={styles.ovSection}>
        <p className={styles.ovSectionTitle}>All-Time Record</p>
        <div className={styles.ovRecordTable}>
          {[
            { label: 'Played',         value: played },
            { label: 'Won',            value: w,  color: 'var(--en-green)' },
            { label: 'Drawn',          value: d,  color: 'var(--en-text-3)' },
            { label: 'Lost',           value: l,  color: 'var(--danger)' },
            { label: 'Goals For',      value: gf },
            { label: 'Goals Against',  value: ga },
            { label: 'Goal Difference',value: fmtGD(gf, ga), color: gd > 0 ? 'var(--en-green)' : gd < 0 ? 'var(--danger)' : undefined },
            { label: 'Best Finish',    value: bestFinish ? (FINISH_DISPLAY[bestFinish] || bestFinish) : '—' },
          ].map(({ label, value, color }) => (
            <div key={label} className={styles.ovRecordRow}>
              <span className={styles.ovRecordLabel}>{label}</span>
              <span className={styles.ovRecordValue} style={color ? { color } : undefined}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notable matches ───────────────────────────────────────── */}
      {(biggestWin || worstLoss || mostCommonName) && (
        <div className={styles.ovSection}>
          <p className={styles.ovSectionTitle}>Notable</p>
          <div className={styles.ovRecordTable}>
            {biggestWin && (
              <div className={styles.ovRecordRow}>
                <span className={styles.ovRecordLabel}>Biggest Win</span>
                <span className={styles.ovRecordValue} style={{ color: 'var(--en-green)' }}>
                  {fmtScore(biggestWin.score_for, biggestWin.score_against)}
                  {biggestWinOpp && <span className={styles.ovMatchOpp}> vs {biggestWinOpp}</span>}
                </span>
              </div>
            )}
            {worstLoss && (
              <div className={styles.ovRecordRow}>
                <span className={styles.ovRecordLabel}>Worst Loss</span>
                <span className={styles.ovRecordValue} style={{ color: 'var(--danger)' }}>
                  {fmtScore(worstLoss.score_for, worstLoss.score_against)}
                  {worstLossOpp && <span className={styles.ovMatchOpp}> vs {worstLossOpp}</span>}
                </span>
              </div>
            )}
            {mostCommonName && (
              <div className={styles.ovRecordRow}>
                <span className={styles.ovRecordLabel}>Most Common Opp.</span>
                <span className={styles.ovRecordValue}>{mostCommonName}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Latest campaign ───────────────────────────────────────── */}
      {uclSeasons.length > 0 && (() => {
        const latest = [...uclSeasons].sort((a, b) => {
          const ya = typeof a.year === 'string' ? parseInt(a.year.slice(0, 4), 10) : 0
          const yb = typeof b.year === 'string' ? parseInt(b.year.slice(0, 4), 10) : 0
          return yb - ya
        })[0]
        if (!latest) return null
        const finishLabel = FINISH_DISPLAY[latest.uclResult] || latest.uclResult || '—'
        const won = latest.uclResult === 'Champions'
        return (
          <div className={styles.ovSection}>
            <p className={styles.ovSectionTitle}>Latest Campaign</p>
            <div className={styles.ovLatestCard}>
              <div className={styles.ovLatestSeason}>
                {latest.label}
                <span className={styles.ovLatestYear}> · {latest.year}</span>
              </div>
              <div
                className={styles.ovLatestResult}
                style={{ color: won ? 'var(--en-gold)' : undefined }}
              >
                {finishLabel}
              </div>
              {latest.uclFinalOpponent && (
                <div className={styles.ovLatestFinal}>
                  Final vs {latest.uclFinalOpponent}
                  {latest.uclFinalScore ? ` · ${latest.uclFinalScore}` : ''}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
