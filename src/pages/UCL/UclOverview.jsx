import styles from './UCL.module.css'
import { fmtScore, fmtGD, ROUND_LABELS } from '../../utils/uclUtils'
import uclTrophyPng from '../../assets/trophies/ucl.png'

const FINISH_DISPLAY = {
  'Champions':  'Champions',
  'Runners-Up': 'Finalist',
  'SF':         'Semi-Finalist',
  'QF':         'Quarterfinalist',
  'R16':        'Round of 16 Exit',
  'Playoff':    'Playoff',
  'LP Only':    'League Phase Exit',
}

function oppName(m, opponents) {
  if (!m) return null
  const rec = opponents?.get(m.opponentKey)
  return rec?.displayName || m.opponent || null
}

function matchCtx(m) {
  const round  = ROUND_LABELS[m.competition] || m.competition || ''
  const season = m.seasonLabel || ''
  if (round && season) return `${round} · ${season}`
  return round || season || null
}

function recordVsOpp(uclMatches, oppKey) {
  if (!oppKey) return null
  const ms = uclMatches.filter(m => (m.opponentKey || m.opponent) === oppKey)
  if (!ms.length) return null
  const w = ms.filter(m => m.score_for  > m.score_against).length
  const d = ms.filter(m => m.score_for === m.score_against).length
  const l = ms.filter(m => m.score_for  < m.score_against).length
  return `${w}W ${d}D ${l}L`
}

function pl(n, singular, plural) {
  return n === 1 ? singular : (plural || `${singular}s`)
}

// ─── Inline SVG icons for Results cards ───────────────────────────────────────
// currentColor — styled via CSS. Small, minimal, premium.
const CampaignsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M3 8H17" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M7 2V5M13 2V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const KOAppsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    {/* Two left entries → merge lines → single winner on right */}
    <path d="M3 5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M3 15h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M7 5v3.5M7 15v-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M7 8.5h3M7 11.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M10 8.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M10 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M14 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const FinalsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    {/* Medal: circle head + two ribbon tails */}
    <circle cx="10" cy="12" r="4" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M7.5 8.5L6 3h8l-1.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const TitleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 2L11.8 7.2H17.3L12.9 10.4L14.7 15.6L10 12.4L5.3 15.6L7.1 10.4L2.7 7.2H8.2L10 2Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
)

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
    biggestWin, worstLoss,
    mostCommonOppKey,
  } = overview

  const biggestWinOpp  = oppName(biggestWin,  opponents)
  const worstLossOpp   = oppName(worstLoss,   opponents)
  const mostCommonName = mostCommonOppKey && opponents?.has(mostCommonOppKey)
    ? opponents.get(mostCommonOppKey).displayName
    : mostCommonOppKey
  const vsRecord = recordVsOpp(uclMatches || [], mostCommonOppKey)

  const gpg    = played > 0 ? (gf / played).toFixed(2) : '0.00'
  const koApps = (quarters || 0) + (semis || 0) + (finals || 0)

  return (
    <div className={styles.ovWrap}>

      {/* ── Hero — trophy right, title left ──────────────────────── */}
      <div className={styles.ovHero}>
        <div className={styles.ovHeroInner}>
          <div className={styles.ovHeroText}>
            <div className={styles.ovHeroName}>European Record</div>
          </div>
          <img
            src={uclTrophyPng}
            alt="UEFA Champions League Trophy"
            className={styles.ovHeroTrophy}
          />
        </div>
      </div>

      {/* ── Stat grid: match record ───────────────────────────────── */}
      <div className={styles.ovStatRow}>
        {[
          { v: played, k: 'Played' },
          { v: w,      k: 'Wins'   },
          { v: d,      k: 'Draws'  },
          { v: l,      k: 'Losses' },
        ].map(({ v, k }) => (
          <div key={k} className={styles.ovStatPill}>
            <span className={styles.ovStatVal}>{v}</span>
            <span className={styles.ovStatKey}>{k}</span>
          </div>
        ))}
      </div>

      {/* ── Stat grid: goals ─────────────────────────────────────── */}
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
          <span className={styles.ovStatVal}>{gd > 0 ? `+${gd}` : gd}</span>
          <span className={styles.ovStatKey}>GD</span>
        </div>
        <div className={styles.ovStatPill}>
          <span className={styles.ovStatVal} style={{ color: 'var(--en-gold)' }}>{gpg}</span>
          <span className={styles.ovStatKey}>G/G</span>
        </div>
      </div>

      {/* ── Results grid with icons ───────────────────────────────── */}
      <div className={styles.ovSection}>
        <p className={styles.ovSectionTitle}>Results</p>
        <div className={styles.ovStageGrid}>
          {[
            { value: campaigns, singular: 'Campaign',  plural: 'Campaigns', Icon: CampaignsIcon, gold: false },
            { value: koApps,    singular: 'KO App',    plural: 'KO Apps',   Icon: KOAppsIcon,   gold: false },
            { value: finals,    singular: 'Final',     plural: 'Finals',    Icon: FinalsIcon,   gold: false },
            { value: titles,    singular: 'Title',     plural: 'Titles',    Icon: TitleIcon,    gold: true  },
          ].map(({ value, singular, plural, Icon, gold }) => (
            <div key={singular} className={styles.ovStageItem}>
              <span
                className={styles.ovStageIcon}
                style={{ color: (gold && value > 0) ? 'var(--en-gold)' : undefined }}
              >
                <Icon />
              </span>
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
