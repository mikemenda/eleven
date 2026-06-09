import styles from './UCL.module.css'
import { fmtScore, fmtGD, ROUND_LABELS } from '../../utils/uclUtils'

const FINISH_DISPLAY = {
  'Champions':  'Champions',
  'Runners-Up': 'Runners-Up',
  'SF':         'Semi-Final',
  'QF':         'Quarter-Final',
  'R16':        'Round of 16',
  'Playoff':    'Playoff',
  'LP Only':    'League Phase',
}

// Lookup opponent display name from opponents map
function oppName(m, opponents) {
  if (!m) return null
  const rec = opponents?.get(m.opponentKey)
  return rec?.displayName || m.opponent || null
}

// Compact round + season context string
function matchCtx(m) {
  const round  = ROUND_LABELS[m.competition] || m.competition || ''
  const season = m.seasonLabel || ''
  if (round && season) return `${round} · ${season}`
  return round || season || null
}

// Record vs most common opponent
function recordVsOpp(uclMatches, oppKey) {
  if (!oppKey) return null
  const ms = uclMatches.filter(m => (m.opponentKey || m.opponent) === oppKey)
  if (!ms.length) return null
  const w = ms.filter(m => m.score_for  > m.score_against).length
  const d = ms.filter(m => m.score_for === m.score_against).length
  const l = ms.filter(m => m.score_for  < m.score_against).length
  return `${w}W ${d}D ${l}L`
}

export default function UclOverview({ overview, uclSeasons, uclMatches, opponents, loading }) {
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

  const {
    campaigns, titles, finals, semis, quarters,
    played, w, d, l, gf, ga, gd,
    bestFinish, biggestWin, worstLoss,
    mostCommonOppKey, winRate,
  } = overview

  const biggestWinOpp  = oppName(biggestWin,  opponents)
  const worstLossOpp   = oppName(worstLoss,   opponents)
  const mostCommonName = mostCommonOppKey && opponents?.has(mostCommonOppKey)
    ? opponents.get(mostCommonOppKey).displayName
    : mostCommonOppKey
  const vsRecord = recordVsOpp(uclMatches || [], mostCommonOppKey)

  const gpg = played > 0 ? (gf / played).toFixed(2) : '0.00'

  return (
    <div className={styles.ovWrap}>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className={styles.ovHero}>
        <div className={styles.ovHeroLabel}>UEFA Champions League</div>
        <div className={styles.ovHeroName}>European Record</div>
      </div>

      {/* ── Stat grid 1: Match record ─────────────────────────────── */}
      <div className={styles.ovStatRow}>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal}>{played}</span>
          <span className={styles.ovStatKey}>Matches</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal} style={{ color: 'var(--en-green)' }}>{w}</span>
          <span className={styles.ovStatKey}>Wins</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal} style={{ color: 'var(--en-text-3)' }}>{d}</span>
          <span className={styles.ovStatKey}>Draws</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal} style={{ color: 'var(--danger)' }}>{l}</span>
          <span className={styles.ovStatKey}>Losses</span>
        </div>
      </div>

      {/* ── Stat grid 2: Goals ────────────────────────────────────── */}
      <div className={styles.ovStatRow}>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal}>{gf}</span>
          <span className={styles.ovStatKey}>GF</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal}>{ga}</span>
          <span className={styles.ovStatKey}>GA</span>
        </div>
        <div className={styles.ovStatPill}>
          <span
            className={styles.ovStatVal}
            style={{ color: gd > 0 ? 'var(--en-green)' : gd < 0 ? 'var(--danger)' : undefined }}
          >
            {gd > 0 ? `+${gd}` : gd}
          </span>
          <span className={styles.ovStatKey}>GD</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal} style={{ color: 'var(--en-gold)' }}>{gpg}</span>
          <span className={styles.ovStatKey}>G/G</span>
        </div>
      </div>

      {/* ── Results grid ──────────────────────────────────────────── */}
      <div className={styles.ovSection}>
        <p className={styles.ovSectionTitle}>Results</p>
        <div className={styles.ovStageGrid}>
          {[
            { label: 'Appearances', value: campaigns },
            { label: 'KO Round',    value: quarters + semis + finals },
            { label: 'Finals',      value: finals },
            { label: 'Titles',      value: titles },
          ].map(({ label, value }) => (
            <div key={label} className={styles.ovStageItem}>
              <span
                className={styles.ovStageVal}
                style={value > 0 ? { color: 'var(--en-gold)' } : undefined}
              >
                {value}
              </span>
              <span className={styles.ovStageKey}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notable ───────────────────────────────────────────────── */}
      {(biggestWin || worstLoss || mostCommonName) && (
        <div className={styles.ovSection}>
          <p className={styles.ovSectionTitle}>Notable</p>
          <div className={styles.ovRecordTable}>

            {biggestWin && (
              <div className={styles.ovRecordRow}>
                <span className={styles.ovRecordLabel}>Biggest Win</span>
                <div className={styles.ovRecordRight}>
                  <span className={styles.ovRecordValue} style={{ color: 'var(--en-green)' }}>
                    {fmtScore(biggestWin.score_for, biggestWin.score_against)}
                    {biggestWinOpp && ` vs ${biggestWinOpp}`}
                  </span>
                  {biggestWin.competition && (
                    <span className={styles.ovRecordSub}>{matchCtx(biggestWin)}</span>
                  )}
                </div>
              </div>
            )}

            {worstLoss && (
              <div className={styles.ovRecordRow}>
                <span className={styles.ovRecordLabel}>Worst Defeat</span>
                <div className={styles.ovRecordRight}>
                  <span className={styles.ovRecordValue} style={{ color: 'var(--danger)' }}>
                    {fmtScore(worstLoss.score_for, worstLoss.score_against)}
                    {worstLossOpp && ` vs ${worstLossOpp}`}
                  </span>
                  {worstLoss.competition && (
                    <span className={styles.ovRecordSub}>{matchCtx(worstLoss)}</span>
                  )}
                </div>
              </div>
            )}

            {mostCommonName && (
              <div className={styles.ovRecordRow}>
                <span className={styles.ovRecordLabel}>Most Common Opp.</span>
                <div className={styles.ovRecordRight}>
                  <span className={styles.ovRecordValue}>{mostCommonName}</span>
                  {vsRecord && (
                    <span className={styles.ovRecordSub}>{vsRecord}</span>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
