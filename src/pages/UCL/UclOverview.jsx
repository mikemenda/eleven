import styles from './UCL.module.css'
import { fmtScore, fmtGD, ROUND_LABELS } from '../../utils/uclUtils'

const FINISH_DISPLAY = {
  'Champions':  'Champions',
  'Runners-Up': 'Finalist',
  'SF':         'Semi-Finalist',
  'QF':         'Quarterfinalist',
  'R16':        'Round of 16 Exit',
  'Playoff':    'Playoff',
  'LP Only':    'League Phase Exit',
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

// Singular/plural helper
function pl(n, singular, plural) {
  return n === 1 ? singular : (plural || `${singular}s`)
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
  const koApps = (quarters || 0) + (semis || 0) + (finals || 0)

  return (
    <div className={styles.ovWrap}>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className={styles.ovHero}>
        <div className={styles.ovHeroName}>European Record</div>
        <div className={styles.ovHeroRecord}>
          <span className={styles.ovWDL}>{w}W</span>
          <span className={styles.ovHeroDivider}>·</span>
          <span className={styles.ovWDL}>{d}D</span>
          <span className={styles.ovHeroDivider}>·</span>
          <span className={styles.ovWDL}>{l}L</span>
          <span className={styles.ovHeroDivider}>·</span>
          <span className={styles.ovHeroGoals}>{gf} GF · {ga} GA</span>
        </div>
      </div>

      {/* ── Stat grid: neutral ivory, no green/red ────────────────── */}
      <div className={styles.ovStatRow}>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal}>{played}</span>
          <span className={styles.ovStatKey}>Played</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal}>{w}</span>
          <span className={styles.ovStatKey}>Wins</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal}>{d}</span>
          <span className={styles.ovStatKey}>Draws</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal}>{l}</span>
          <span className={styles.ovStatKey}>Losses</span>
        </div>
      </div>

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
          <span className={styles.ovStatVal}>
            {gd > 0 ? `+${gd}` : gd}
          </span>
          <span className={styles.ovStatKey}>GD</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal} style={{ color: 'var(--en-gold)' }}>{gpg}</span>
          <span className={styles.ovStatKey}>G/G</span>
        </div>
      </div>

      {/* ── Results grid — with corrected labels + plurals ────────── */}
      <div className={styles.ovSection}>
        <p className={styles.ovSectionTitle}>Results</p>
        <div className={styles.ovStageGrid}>
          {[
            { value: campaigns, singular: 'Campaign',  plural: 'Campaigns' },
            { value: koApps,    singular: 'KO App',    plural: 'KO Apps'   },
            { value: finals,    singular: 'Final',     plural: 'Finals'    },
            { value: titles,    singular: 'Title',     plural: 'Titles'    },
          ].map(({ value, singular, plural }) => (
            <div key={singular} className={styles.ovStageItem}>
              <span
                className={styles.ovStageVal}
                style={value > 0 ? { color: 'var(--en-gold)' } : undefined}
              >
                {value}
              </span>
              <span className={styles.ovStageKey}>{pl(value, singular, plural)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notable ───────────────────────────────────────────────── */}
      {(biggestWin || worstLoss || mostCommonName) && (
        <div className={styles.ovSection}>
          <p className={styles.ovSectionTitle}>Notable</p>
          <div className={styles.ovNotableList}>

            {biggestWin && (
              <div className={styles.ovNotableRow}>
                <span className={styles.ovNotableLabel}>Biggest Win</span>
                <div className={styles.ovNotableRight}>
                  <span className={styles.ovNotableValue}>
                    {fmtScore(biggestWin.score_for, biggestWin.score_against)}
                    {biggestWinOpp && ` vs ${biggestWinOpp}`}
                  </span>
                  {biggestWin.competition && (
                    <span className={styles.ovNotableSub}>{matchCtx(biggestWin)}</span>
                  )}
                </div>
              </div>
            )}

            {worstLoss && (
              <div className={styles.ovNotableRow}>
                <span className={styles.ovNotableLabel}>Worst Defeat</span>
                <div className={styles.ovNotableRight}>
                  <span className={styles.ovNotableValue}>
                    {fmtScore(worstLoss.score_for, worstLoss.score_against)}
                    {worstLossOpp && ` vs ${worstLossOpp}`}
                  </span>
                  {worstLoss.competition && (
                    <span className={styles.ovNotableSub}>{matchCtx(worstLoss)}</span>
                  )}
                </div>
              </div>
            )}

            {mostCommonName && (
              <div className={styles.ovNotableRow}>
                <span className={styles.ovNotableLabel}>Most Faced</span>
                <div className={styles.ovNotableRight}>
                  <span className={styles.ovNotableValue}>{mostCommonName}</span>
                  {vsRecord && (
                    <span className={styles.ovNotableSub}>{vsRecord}</span>
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
