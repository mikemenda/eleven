import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  getSeason,
  updateSeason,
  getTrophiesForSeason,
  addTrophy,
  getMatches,
  getOpponents,
} from '../firebase/services'
import { TROPHY_PNG_MAP, TrophySVG, GenericTrophySVG } from '../utils/trophyAssets'
import {
  deriveUclRivals,
  buildUclRivalNarrative,
  fmtScore as uclFmtScore,
  ROUND_LABELS,
  NATION_TO_LEAGUE,
} from '../utils/uclUtils'
import styles from './SeasonDetail.module.css'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const UCL_RESULTS   = ['Champions', 'Runners-Up', 'SF', 'QF', 'R16', 'Playoff', 'LP Only']
const CUP_ROUNDS    = ['Did Not Enter', 'R32', 'R16', 'QF', 'SF', 'Final', 'Winner']
const LEAGUE_OPTIONS = [
  'Premier League', 'English Championship', 'La Liga',
  'Bundesliga', 'Serie A', 'Ligue 1',
]

const MD_ORDER = ['MD1','MD2','MD3','MD4','MD5','MD6','MD7','MD8']
const KO_COMPS = ['UCL_R16', 'UCL_QF', 'UCL_SF', 'UCL_Final']

// Human-readable round labels
const KO_ROUND_LABEL = {
  R16:   'Round of 16',
  QF:    'Quarter-final',
  SF:    'Semi-final',
  Final: 'Final',
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const num     = v => (v === '' || v == null) ? null : (isNaN(Number(v)) ? null : Number(v))
const disp    = v => (v == null) ? '' : String(v)
const gd      = (gf, ga) => { const a = num(gf), b = num(ga); return (a != null && b != null) ? a - b : null }
const fmtGD   = n => n == null ? '—' : (n > 0 ? `+${n}` : String(n))
const ordinal  = n => { if (!n) return ''; const s=['th','st','nd','rd'], v=n%100; return s[(v-20)%10]||s[v]||s[0] }
const fmtScore = (sf, sa) => (sf != null && sa != null) ? `${sf}–${sa}` : null

// Short hero lede: first sentence or first ~160 chars, clean ellipsis
function buildHeroLede(narrativeText) {
  if (!narrativeText) return null
  const firstLine = narrativeText.split('\n')[0] || ''
  // Try to end at first sentence boundary within 160 chars
  const sentenceEnd = firstLine.search(/[.!?]/)
  if (sentenceEnd > 0 && sentenceEnd <= 160) {
    return firstLine.slice(0, sentenceEnd + 1)
  }
  if (firstLine.length <= 160) return firstLine
  // Truncate at word boundary
  const truncated = firstLine.slice(0, 160)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 100 ? truncated.slice(0, lastSpace) : truncated) + '…'
}

function detectUclActivity(s) {
  return !!(
    s.uclEntered ||
    s.uclResult ||
    s.uclR16Opponent ||
    s.uclQFOpponent ||
    s.uclSFOpponent ||
    s.uclFinalOpponent ||
    s.uclLPP != null ||
    s.uclLeaguePhasePosition != null
  )
}

function leagueWarnings(f) {
  const w = []
  const p = num(f.leagueP), ww = num(f.leagueW), d = num(f.leagueD),
        l = num(f.leagueL), pts = num(f.leaguePts)
  if (p != null && ww != null && d != null && l != null && ww + d + l !== p)
    w.push("W + D + L doesn't add up to P.")
  if (ww != null && d != null && pts != null && (ww * 3 + d) !== pts)
    w.push("Points don't match W/D/L.")
  return w
}

function uclWarnings(f) {
  const w = []
  const p = num(f.uclLPP), ww = num(f.uclLPW), d = num(f.uclLPD),
        l = num(f.uclLPL), pts = num(f.uclLPPts)
  if (p != null && ww != null && d != null && l != null && ww + d + l !== p)
    w.push("W + D + L doesn't add up to P.")
  if (ww != null && d != null && pts != null && (ww * 3 + d) !== pts)
    w.push("Points don't match W/D/L.")
  return w
}

function seasonToForm(s) {
  return {
    label:              s.label ?? '',
    year:               s.year ?? '',
    leagueCompetition:  s.leagueCompetition ?? 'Premier League',
    leaguePosition:     disp(s.leaguePosition),
    leagueP:    disp(s.leagueP),   leagueW:  disp(s.leagueW),
    leagueD:    disp(s.leagueD),   leagueL:  disp(s.leagueL),
    leagueGF:   disp(s.leagueGF),  leagueGA: disp(s.leagueGA),
    leaguePts:  disp(s.leaguePts),
    uclEntered:             detectUclActivity(s),
    uclResult:              s.uclResult ?? '',
    uclTournamentWinner:    s.uclTournamentWinner ?? '',
    uclFinalOpponent:       s.uclFinalOpponent ?? '',
    uclFinalScore:          s.uclFinalScore ?? '',
    uclLeaguePhasePosition: disp(s.uclLeaguePhasePosition),
    uclLPP:   disp(s.uclLPP),   uclLPW:  disp(s.uclLPW),
    uclLPD:   disp(s.uclLPD),   uclLPL:  disp(s.uclLPL),
    uclLPGF:  disp(s.uclLPGF),  uclLPGA: disp(s.uclLPGA),
    uclLPPts: disp(s.uclLPPts),
    uclR16Opponent: s.uclR16Opponent ?? '', uclR16Score: s.uclR16Score ?? '',
    uclQFOpponent:  s.uclQFOpponent  ?? '', uclQFScore:  s.uclQFScore  ?? '',
    uclSFOpponent:  s.uclSFOpponent  ?? '', uclSFScore:  s.uclSFScore  ?? '',
    faCupResult:          s.faCupResult ?? '',
    faCupFinalOpponent:   s.faCupFinalOpponent ?? '',
    faCupWinner:          s.faCupWinner ?? '',
    carabaoCupResult:         s.carabaoCupResult ?? '',
    carabaoCupFinalOpponent:  s.carabaoCupFinalOpponent ?? '',
    carabaoCupWinner:         s.carabaoCupWinner ?? '',
    seasonHeadline: s.seasonHeadline ?? '',
    narrativeText:  s.narrativeText ?? '',
    keyMoments:     (s.keyMoments?.length ? s.keyMoments : ['']),
    dynastyVerdict: s.dynastyVerdict ?? '',
    dynastyScore:   disp(s.dynastyScore),
  }
}

function formToDoc(f) {
  return {
    label:              f.label.trim().toUpperCase(),
    year:               f.year.trim(),
    leagueCompetition:  f.leagueCompetition,
    leaguePosition:     num(f.leaguePosition),
    leagueP:    num(f.leagueP),   leagueW:  num(f.leagueW),
    leagueD:    num(f.leagueD),   leagueL:  num(f.leagueL),
    leagueGF:   num(f.leagueGF),  leagueGA: num(f.leagueGA),
    leaguePts:  num(f.leaguePts),
    uclEntered:             f.uclEntered,
    uclResult:              f.uclResult || null,
    uclTournamentWinner:    f.uclTournamentWinner.trim() || null,
    uclFinalOpponent:       f.uclFinalOpponent.trim() || null,
    uclFinalScore:          f.uclFinalScore.trim() || null,
    uclLeaguePhasePosition: num(f.uclLeaguePhasePosition),
    uclLPP:   num(f.uclLPP),   uclLPW:  num(f.uclLPW),
    uclLPD:   num(f.uclLPD),   uclLPL:  num(f.uclLPL),
    uclLPGF:  num(f.uclLPGF),  uclLPGA: num(f.uclLPGA),
    uclLPPts: num(f.uclLPPts),
    uclR16Opponent: f.uclR16Opponent.trim() || null,
    uclR16Score:    f.uclR16Score.trim() || null,
    uclQFOpponent:  f.uclQFOpponent.trim()  || null,
    uclQFScore:     f.uclQFScore.trim()  || null,
    uclSFOpponent:  f.uclSFOpponent.trim()  || null,
    uclSFScore:     f.uclSFScore.trim()  || null,
    faCupResult:          f.faCupResult || null,
    faCupFinalOpponent:   f.faCupFinalOpponent.trim() || null,
    faCupWinner:          f.faCupWinner.trim() || null,
    carabaoCupResult:         f.carabaoCupResult || null,
    carabaoCupFinalOpponent:  f.carabaoCupFinalOpponent.trim() || null,
    carabaoCupWinner:         f.carabaoCupWinner.trim() || null,
    seasonHeadline: f.seasonHeadline.trim() || null,
    narrativeText:  f.narrativeText.trim() || null,
    keyMoments:     f.keyMoments.map(k => k.trim()).filter(Boolean),
    dynastyVerdict: f.dynastyVerdict.trim() || null,
    dynastyScore:   num(f.dynastyScore),
  }
}

// ─── SMALL FORM COMPONENTS ────────────────────────────────────────────────────

const FieldGroup = ({ label, hint, error, children }) => (
  <div className={styles.fieldGroup}>
    {label && <label className={styles.fieldLabel}>{label}</label>}
    {children}
    {error && <span className={styles.fieldError}>{error}</span>}
    {hint && !error && <span className={styles.fieldHint}>{hint}</span>}
  </div>
)

const TxtInput   = ({ className = '', ...p }) => <input className={`${styles.input} ${className}`} {...p} />
const NumInput   = p => <input type="number" min="0" className={styles.input} {...p} />
const SelInput   = ({ children, ...p }) => <select className={styles.select} {...p}>{children}</select>
const DerivedFld = ({ value }) => <div className={styles.derivedField}>{value ?? '—'}</div>
const Warning    = ({ children }) => <div className={styles.warning}>{children}</div>

const Dialog = ({ title, body, confirmLabel, confirmDanger, onConfirm, onCancel }) => (
  <div className={styles.dialogBackdrop}
       onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
    <div className={styles.dialog} role="dialog" aria-modal="true">
      <h3 className={styles.dialogTitle}>{title}</h3>
      {body && <p className={styles.dialogBody}>{body}</p>}
      <div className={styles.dialogActions}>
        <button className={styles.dialogCancel} onClick={onCancel}>Cancel</button>
        <button
          className={`${styles.dialogConfirm} ${confirmDanger ? styles.dialogConfirmDanger : ''}`}
          onClick={onConfirm}
        >{confirmLabel}</button>
      </div>
    </div>
  </div>
)

const TrophyPrompt = ({ competition, onConfirm, onSkip }) => (
  <div className={styles.dialogBackdrop}>
    <div className={styles.dialog} role="dialog" aria-modal="true">
      <div className={styles.trophyIcon}>🏆</div>
      <h3 className={styles.dialogTitle}>Add to Trophy Cabinet?</h3>
      <p className={styles.dialogBody}>
        Add <strong>{competition}</strong> to your trophy cabinet for this season?
      </p>
      <div className={styles.dialogActions}>
        <button className={styles.dialogCancel} onClick={onSkip}>Skip</button>
        <button className={styles.dialogConfirm} onClick={onConfirm}>Add Trophy</button>
      </div>
    </div>
  </div>
)

// ─── TROPHY SHELF ─────────────────────────────────────────────────────────────

function TrophyShelf({ s }) {
  const items = []
  if (s.leaguePosition === 1 && s.leagueCompetition)
    items.push({ key: 'lg',  label: s.leagueCompetition })
  if (s.uclResult === 'Champions')
    items.push({ key: 'ucl', label: 'UEFA Champions League' })
  if (s.faCupResult === 'Winner')
    items.push({ key: 'fa',  label: 'FA Cup' })
  if (s.carabaoCupResult === 'Winner')
    items.push({ key: 'cc',  label: 'Carabao Cup' })
  if (!items.length) return null

  return (
    <div className={styles.trophyShelf}>
      <div className={styles.trophyShelfItems}>
        {items.map(t => {
          const png = TROPHY_PNG_MAP[t.label]
          const SvgComp = TrophySVG[t.label] || GenericTrophySVG
          return (
            <div key={t.key} className={styles.trophyItem}>
              {png
                ? <img src={png} alt={t.label} className={styles.trophyPng} />
                : <SvgComp className={styles.trophySvgWon} />
              }
              <span className={styles.trophyName}>{t.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── UCL OPPONENT DETAIL — in-page drill-in ──────────────────────────────────
// Mirrors UclRivals OpponentDetail but scoped to Season Detail.
// allMatches = all UCL matches across all seasons (needed for full rivalry history)
// opponents = full opponents map

function UclOpponentDetail({ opponentKey, allMatches, opponents, clubName, onClose }) {
  if (!opponentKey) return null

  // Build seasonLabelMap from matches (best effort)
  const seasonLabelMap = {}
  for (const m of allMatches) {
    if (m.seasonId && m.seasonLabel) seasonLabelMap[m.seasonId] = m.seasonLabel
  }

  // Derive rivals from all UCL matches — same as UCL Opponents page
  const uclMatches = allMatches.filter(m =>
    ['UCL_LP','UCL_R16','UCL_QF','UCL_SF','UCL_Final'].includes(m.competition)
  )
  const rivals = deriveUclRivals(uclMatches, opponents, seasonLabelMap)
  const rival  = rivals.find(r => r.opponentKey === opponentKey)

  if (!rival) {
    // Fallback: opponent exists in opponents map but no UCL match data
    const rec = opponents?.get(opponentKey)
    return (
      <div className={styles.oppDetailOverlay}>
        <div className={styles.oppDetailCard}>
          <div className={styles.oppDetailHead}>
            <button className={styles.oppDetailClose} onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            {rec?.crestUrl && (
              <img src={rec.crestUrl} alt="" className={styles.oppDetailCrest}
                onError={e => { e.currentTarget.style.display = 'none' }} />
            )}
            <div className={styles.oppDetailTitleBlock}>
              <span className={styles.oppDetailName}>{rec?.displayName || opponentKey}</span>
              {rec?.country && (
                <span className={styles.oppDetailLeague}>
                  {NATION_TO_LEAGUE[rec.country] || rec.country}
                </span>
              )}
            </div>
          </div>
          <p className={styles.oppDetailEmpty}>No UCL match data found for this opponent.</p>
        </div>
      </div>
    )
  }

  const narrative   = buildUclRivalNarrative(rival, clubName)
  const finalsCount = rival.matches.filter(m => m.competition === 'UCL_Final').length

  // Group matches by season label
  const seasonGroups = []
  for (const m of rival.matches) {
    const label = m.seasonLabel || '—'
    const last  = seasonGroups[seasonGroups.length - 1]
    if (last && last.label === label) last.matches.push(m)
    else seasonGroups.push({ label, matches: [m] })
  }

  return (
    <div className={styles.oppDetailOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.oppDetailCard}>

        {/* Header */}
        <div className={styles.oppDetailHead}>
          <button className={styles.oppDetailClose} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
          {rival.crestUrl && (
            <img src={rival.crestUrl} alt="" className={styles.oppDetailCrest}
              onError={e => { e.currentTarget.style.display = 'none' }} />
          )}
          <div className={styles.oppDetailTitleBlock}>
            <span className={styles.oppDetailName}>{rival.displayName}</span>
            {(rival.league || rival.country) && (
              <span className={styles.oppDetailLeague}>{rival.league || rival.country}</span>
            )}
          </div>
        </div>

        {/* H2H stat bar */}
        <div className={styles.oppH2H}>
          {[
            { k: 'Won',   v: rival.w },
            { k: 'Drawn', v: rival.d },
            { k: 'Lost',  v: rival.l },
            { k: 'Goals', v: `${rival.gf}–${rival.ga}` },
          ].map(({ k, v }) => (
            <div key={k} className={styles.oppH2HItem}>
              <span className={styles.oppH2HVal}>{v}</span>
              <span className={styles.oppH2HKey}>{k}</span>
            </div>
          ))}
        </div>

        {/* Narrative */}
        {narrative && <p className={styles.oppNarrative}>{narrative}</p>}

        {/* Finals note */}
        {finalsCount > 0 && (
          <div className={styles.oppFinalsNote}>
            ★ {finalsCount} UCL final{finalsCount > 1 ? 's' : ''} against {rival.displayName}
          </div>
        )}

        {/* Match log — scrollable */}
        <div className={styles.oppMatchLog}>
          {seasonGroups.map(group => (
            <div key={group.label}>
              <div className={styles.oppSeasonDivider}>{group.label}</div>
              {group.matches.map((m, i) => {
                const win  = m.score_for > m.score_against
                const draw = m.score_for === m.score_against
                const res  = win ? 'W' : draw ? 'D' : 'L'
                const col  = win ? 'var(--en-green)' : draw ? 'var(--en-text-3)' : 'var(--danger)'
                const isFinal = m.competition === 'UCL_Final'
                // Final has no leg number — show "Final" instead
                const showLeg = m.leg != null && m.competition !== 'UCL_Final'
                return (
                  <div key={i} className={styles.oppMatchRow}>
                    <span className={styles.oppMatchRes} style={{ color: col }}>{res}</span>
                    <div className={styles.oppMatchInfo}>
                      <span className={styles.oppMatchComp}
                        style={isFinal ? { color: 'var(--en-gold)' } : undefined}>
                        {ROUND_LABELS[m.competition] || m.competition || '—'}
                      </span>
                      {showLeg && <span className={styles.oppMatchLeg}>· Leg {m.leg}</span>}
                    </div>
                    <span className={styles.oppMatchScore}>
                      {fmtScore(m.score_for, m.score_against) ?? '—'}
                    </span>
                    <span className={styles.oppMatchVenue}
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
    </div>
  )
}

// ─── UCL SECTION — match-doc-powered ─────────────────────────────────────────

function matchResult(sf, sa) {
  if (sf == null || sa == null) return null
  if (sf > sa) return 'W'
  if (sf < sa) return 'L'
  return 'D'
}

function buildLPRows(matches) {
  const lpMatches = matches.filter(m => m.competition === 'UCL_LP')
  if (!lpMatches.length) return []
  return [...lpMatches].sort((a, b) => {
    const ai = MD_ORDER.indexOf(a.round)
    const bi = MD_ORDER.indexOf(b.round)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function buildKOLegs(matches, compCode) {
  return matches
    .filter(m => m.competition === compCode)
    .sort((a, b) => (a.leg ?? 0) - (b.leg ?? 0))
}

function legAggregate(legs) {
  if (!legs.length) return null
  const totalFor     = legs.reduce((s, m) => s + (m.score_for     ?? 0), 0)
  const totalAgainst = legs.reduce((s, m) => s + (m.score_against ?? 0), 0)
  return { totalFor, totalAgainst }
}

function oppDisplay(matchDoc, opponents) {
  if (!matchDoc) return null
  const key = matchDoc.opponentKey
  if (key && opponents && opponents.has(key)) {
    return opponents.get(key).displayName || matchDoc.opponent || null
  }
  return matchDoc.opponent || null
}

function oppCrest(opponentKey, opponents) {
  if (!opponentKey || !opponents) return null
  return opponents.get(opponentKey)?.crestUrl || null
}

function abbrev(name) {
  if (!name) return '—'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return name.slice(0, 3).toUpperCase()
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 3)
}

function UclSection({ s, matches, opponents, allUclMatches, clubName, onSelectOpponent }) {
  const isChampion = s.uclResult === 'Champions'
  const isFinalist = s.uclResult === 'Runners-Up'

  let opener = null
  if (isChampion) {
    opener = `Champions of Europe.${
      s.uclFinalOpponent
        ? ` ${s.uclFinalOpponent} defeated in the final${s.uclFinalScore ? ` ${s.uclFinalScore}` : ''}.`
        : ''
    }`
  } else if (isFinalist) {
    opener = `Reached the final — defeated${
      s.uclFinalOpponent ? ` by ${s.uclFinalOpponent}` : ''
    }${s.uclFinalScore ? ` ${s.uclFinalScore}` : ''}.`
  } else if (s.uclResult) {
    const resultMap = {
      SF: 'the semi-finals',
      QF: 'the quarter-finals',
      R16: 'the Round of 16',
      Playoff: 'the playoff round',
      'LP Only': 'the league phase',
    }
    opener = `Exited at ${resultMap[s.uclResult] || s.uclResult}.`
  }

  const lpRows = buildLPRows(matches)
  const hasLPMatchDocs = lpRows.length > 0
  const hasLPRecord = s.uclLPP != null
  const lpGD = gd(s.uclLPGF, s.uclLPGA)

  const rounds = [
    { label: 'R16',   comp: 'UCL_R16',   opp: s.uclR16Opponent, aggDoc: s.uclR16Score },
    { label: 'QF',    comp: 'UCL_QF',    opp: s.uclQFOpponent,  aggDoc: s.uclQFScore  },
    { label: 'SF',    comp: 'UCL_SF',    opp: s.uclSFOpponent,  aggDoc: s.uclSFScore  },
    { label: 'Final', comp: 'UCL_Final', opp: s.uclFinalOpponent || s.uclTournamentWinner, aggDoc: s.uclFinalScore },
  ]

  const koRounds = rounds
    .map(r => {
      const legs    = buildKOLegs(matches, r.comp)
      const hasLegs = legs.length > 0
      const agg     = hasLegs ? legAggregate(legs) : null
      let roundResult = null
      if (agg) {
        if (agg.totalFor > agg.totalAgainst) roundResult = 'W'
        else if (agg.totalFor < agg.totalAgainst) roundResult = 'L'
        else roundResult = 'D'
      }
      const legKey    = hasLegs ? (legs[0]?.opponentKey || null) : null
      const rawOppName= hasLegs ? (legs[0]?.opponent ?? r.opp) : r.opp
      const oppKey    = legKey || null
      const canonName = oppKey && opponents.has(oppKey)
        ? opponents.get(oppKey).displayName
        : rawOppName
      const crest     = oppKey ? oppCrest(oppKey, opponents) : null
      const isFinal   = r.label === 'Final'

      return {
        label:  r.label,
        displayLabel: KO_ROUND_LABEL[r.label] || r.label,
        comp:   r.comp,
        opponent:     canonName,
        opponentKey:  oppKey,
        crest,
        legs:   hasLegs ? legs : null,
        aggStr: agg ? `${agg.totalFor}–${agg.totalAgainst}` : (r.aggDoc || null),
        roundResult,
        isFinal,
      }
    })
    .filter(r => r.opponent || r.legs)

  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>UCL journey</p>

      {opener && <p className={styles.uclOpener}>{opener}</p>}

      {/* ── League Phase ── */}
      {(hasLPMatchDocs || hasLPRecord) && (
        <div className={styles.uclBlock}>
          <p className={styles.uclBlockLabel}>League Phase</p>

          {s.uclLeaguePhasePosition != null && (
            <p className={styles.uclLPPosition}>
              Finished {s.uclLeaguePhasePosition}
              {ordinal(s.uclLeaguePhasePosition)} in the League Phase
            </p>
          )}

          {hasLPMatchDocs && (
            <div className={styles.matchTable}>
              <div className={styles.matchTableHead}>
                <span className={styles.mtColRound}>MD</span>
                <span className={styles.mtColOpponent}>Opponent</span>
                <span className={styles.mtColVenue}>H/A</span>
                <span className={styles.mtColScore}>Score</span>
                <span className={styles.mtColResult}>—</span>
              </div>
              {lpRows.map((m, i) => {
                const res      = matchResult(m.score_for, m.score_against)
                const dispName = oppDisplay(m, opponents) || '—'
                const crest    = oppCrest(m.opponentKey, opponents)
                return (
                  <button
                    key={m.id ?? i}
                    className={`${styles.matchRow} ${m.opponentKey ? styles.matchRowClickable : ''}`}
                    onClick={() => m.opponentKey && onSelectOpponent(m.opponentKey)}
                    disabled={!m.opponentKey}
                  >
                    <span className={styles.mtColRound}>
                      {m.round ? m.round.replace('MD', '') : '—'}
                    </span>
                    <span className={styles.mtColOpponent}>
                      {crest && (
                        <img src={crest} alt="" className={styles.mtCrest}
                          onError={e => { e.currentTarget.style.display = 'none' }} />
                      )}
                      {dispName}
                    </span>
                    <span className={styles.mtColVenue}
                      style={{ color: m.home_away === 'H' ? 'var(--en-text-3)' : 'var(--en-text-4)' }}>
                      {m.home_away || '—'}
                    </span>
                    <span className={styles.mtColScore}>
                      {fmtScore(m.score_for, m.score_against) ?? '—'}
                    </span>
                    <span className={`${styles.mtColResult} ${
                      res === 'W' ? styles.resW :
                      res === 'L' ? styles.resL :
                      res === 'D' ? styles.resD : ''
                    }`}>
                      {res ?? '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {hasLPRecord && (
            <div className={styles.recordGrid} style={{ marginTop: hasLPMatchDocs ? 16 : 0 }}>
              {[
                [s.uclLPP, 'P', false], [s.uclLPW, 'W', false], [s.uclLPD, 'D', false], [s.uclLPL, 'L', false],
                [s.uclLPGF, 'GF', false], [s.uclLPGA, 'GA', false], [fmtGD(lpGD), 'GD', false], [s.uclLPPts, 'Pts', true],
              ].map(([val, lbl, highlight]) => (
                <div key={lbl} className={`${styles.recordCell} ${highlight ? styles.recordCellHighlight : ''}`}>
                  <div className={styles.rcVal}>{val ?? '—'}</div>
                  <div className={styles.rcLbl}>{lbl}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Knockout rounds ── */}
      {koRounds.length > 0 && (
        <div className={styles.uclBlock}>
          <p className={styles.uclBlockLabel}>Knockout stage</p>
          <div className={styles.koRounds}>
            {koRounds.map(r => {
              const isFinalWon  = r.isFinal && isChampion
              const isFinalLost = r.isFinal && isFinalist
              return (
                <div
                  key={r.label}
                  className={`${styles.koRound} ${isFinalWon ? styles.koRoundFinal : ''}`}
                >
                  <div
                    className={`${styles.koRoundHeader} ${r.opponentKey ? styles.koRoundHeaderClickable : ''}`}
                    onClick={() => r.opponentKey && onSelectOpponent(r.opponentKey)}
                    role={r.opponentKey ? 'button' : undefined}
                    tabIndex={r.opponentKey ? 0 : undefined}
                    onKeyDown={e => e.key === 'Enter' && r.opponentKey && onSelectOpponent(r.opponentKey)}
                  >
                    <span className={styles.koRoundLabel}>{r.displayLabel}</span>
                    {r.opponent && (
                      <span className={styles.koOpponent}>
                        {r.crest && (
                          <img src={r.crest} alt="" className={styles.koCrest}
                            onError={e => { e.currentTarget.style.display = 'none' }} />
                        )}
                        {r.opponent}
                      </span>
                    )}
                    {r.aggStr && (
                      <span className={`${styles.koAgg} ${
                        isFinalWon  ? styles.koAggWon  :
                        isFinalLost ? styles.koAggLost :
                        r.roundResult === 'W' ? styles.koAggWon :
                        r.roundResult === 'L' ? styles.koAggLost : styles.koAggNeutral
                      }`}>
                        {r.aggStr}
                      </span>
                    )}
                    {r.opponentKey && (
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" className={styles.koChevron}>
                        <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>

                  {/* Per-leg rows — Final shows no leg number */}
                  {r.legs && r.legs.length > 0 && (
                    <div className={styles.koLegs}>
                      {r.legs.map((leg, li) => {
                        const res = matchResult(leg.score_for, leg.score_against)
                        // Final = single match, don't show "Leg 1"
                        const legLabel = r.isFinal ? 'Final' : `Leg ${leg.leg ?? li + 1}`
                        return (
                          <div key={leg.id ?? li} className={styles.koLeg}>
                            <span className={styles.koLegNum}>{legLabel}</span>
                            <span className={styles.koLegVenue}
                              style={{
                                color: leg.home_away === 'H'
                                  ? 'var(--en-text-3)'
                                  : leg.home_away === 'N'
                                  ? '#8899aa'
                                  : 'var(--en-text-4)',
                              }}>
                              {leg.home_away || '—'}
                            </span>
                            <span className={styles.koLegScore}>
                              {fmtScore(leg.score_for, leg.score_against) ?? '—'}
                            </span>
                            <span className={`${styles.koLegResult} ${
                              res === 'W' ? styles.resW :
                              res === 'L' ? styles.resL :
                              res === 'D' ? styles.resD : ''
                            }`}>
                              {res ?? '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!opener && !hasLPMatchDocs && !hasLPRecord && koRounds.length === 0 && (
        <p className={styles.dimText}>No UCL data recorded.</p>
      )}
    </div>
  )
}

// ─── DYNASTY SCORE METER ──────────────────────────────────────────────────────

function DynastyScoreMeter({ score }) {
  if (score == null) return null
  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className={styles.scoreBarTrack}>
      <div className={styles.scoreBarFill} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const SeasonDetail = () => {
  const { id: seasonId } = useParams()
  const navigate = useNavigate()
  const { activeGame, activeClub } = useApp()

  const [season,   setSeason]   = useState(null)
  const [trophies, setTrophies] = useState([])
  const [matches,  setMatches]  = useState([])
  const [opponents,setOpponents]= useState(new Map())
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)

  const [editing,  setEditing]  = useState(false)
  const [form,     setForm]     = useState(null)
  const [origForm, setOrigForm] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState(null)

  const [dlgDiscard,  setDlgDiscard]  = useState(false)
  const [dlgComplete, setDlgComplete] = useState(false)
  const [dlgUnlock,   setDlgUnlock]   = useState(false)
  const [trophyQueue, setTrophyQueue] = useState([])
  const pendingTrophies = useRef([])

  // UCL opponent drill-in state
  const [selectedOppKey, setSelectedOppKey] = useState(null)
  // All UCL matches across seasons for full rivalry history
  const [allUclMatches, setAllUclMatches] = useState([])

  const hasChanges = editing && form && origForm &&
    JSON.stringify(form) !== JSON.stringify(origForm)

  useEffect(() => {
    if (!activeGame)  { navigate('/');      return }
    if (!activeClub)  { navigate('/clubs'); return }
    load()
  }, [seasonId])

  const load = async () => {
    setLoading(true); setLoadErr(null)
    try {
      const [s, t, m, opp] = await Promise.all([
        getSeason(seasonId),
        getTrophiesForSeason(seasonId),
        getMatches(seasonId),
        getOpponents(),
      ])
      if (!s) { setLoadErr('Season not found.'); return }
      setSeason(s)
      setTrophies(t)
      setMatches(m)
      setOpponents(opp)
      // Enrich match docs with seasonLabel for the rival narrative builder
      const enriched = m.map(match => ({
        ...match,
        seasonLabel: match.seasonLabel || s.label || '',
      }))
      setAllUclMatches(enriched)
    } catch (e) {
      console.error(e); setLoadErr('Failed to load season.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!hasChanges) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [hasChanges])

  const enterEdit = () => {
    const f = seasonToForm(season)
    setForm(f); setOrigForm(f); setSaveErr(null); setEditing(true)
  }
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const handleCancel = () => { hasChanges ? setDlgDiscard(true) : doDiscard() }
  const doDiscard = () => { setEditing(false); setForm(null); setDlgDiscard(false) }

  const handleSave = async () => {
    setSaving(true); setSaveErr(null)
    const existingComps = trophies.map(t => t.competition)
    const prompts = []
    if (form.uclResult === 'Champions' && !existingComps.includes('UEFA Champions League'))
      prompts.push({ competition: 'UEFA Champions League' })
    if (form.faCupResult === 'Winner' && !existingComps.includes('FA Cup'))
      prompts.push({ competition: 'FA Cup' })
    if (form.carabaoCupResult === 'Winner' && !existingComps.includes('Carabao Cup'))
      prompts.push({ competition: 'Carabao Cup' })
    if (prompts.length > 0) {
      setSaving(false); pendingTrophies.current = []; setTrophyQueue(prompts); return
    }
    await doSave([])
  }

  const resolveTrophy = async (accepted) => {
    const queue = [...trophyQueue]
    const current = queue.shift()
    if (accepted) pendingTrophies.current = [...pendingTrophies.current, current]
    if (queue.length > 0) { setTrophyQueue(queue) }
    else {
      setTrophyQueue([])
      await doSave([...pendingTrophies.current])
      pendingTrophies.current = []
    }
  }

  const doSave = async (trophiesToAdd) => {
    setSaving(true)
    try {
      await updateSeason(seasonId, formToDoc(form))
      for (const t of trophiesToAdd)
        await addTrophy({ clubId: season.clubId, seasonId, competition: t.competition })
      await load()
      setEditing(false); setForm(null)
    } catch (e) {
      console.error(e); setSaveErr("Couldn't save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const doComplete = async () => {
    try { await updateSeason(seasonId, { isComplete: true }); await load() }
    catch (e) { console.error(e) }
    finally { setDlgComplete(false) }
  }

  const doUnlock = async () => {
    try { await updateSeason(seasonId, { isComplete: false }); await load() }
    catch (e) { console.error(e) }
    finally { setDlgUnlock(false) }
  }

  const addMoment    = () =>
    form.keyMoments.length < 10 && set('keyMoments', [...form.keyMoments, ''])
  const updateMoment = (i, v) => {
    const a = [...form.keyMoments]; a[i] = v; set('keyMoments', a)
  }
  const removeMoment = (i) => {
    const a = form.keyMoments.filter((_, j) => j !== i)
    set('keyMoments', a.length ? a : [''])
  }

  if (loading) return <div className={styles.loadWrap}><div className={styles.spinner} /></div>
  if (loadErr) return (
    <div className={styles.errorWrap}>
      <p className={styles.errorText}>{loadErr}</p>
      <button className={styles.backBtn} onClick={() => navigate('/seasons')}>← Back</button>
    </div>
  )

  const s = season
  const f = form

  const lGD  = editing ? gd(f.leagueGF, f.leagueGA) : gd(s.leagueGF, s.leagueGA)
  const uGD  = editing ? gd(f.uclLPGF,  f.uclLPGA)  : gd(s.uclLPGF,  s.uclLPGA)
  const lWarn = editing ? leagueWarnings(f) : []
  const uWarn = editing ? uclWarnings(f)    : []

  const dynastyScoreNum = editing ? num(f?.dynastyScore) : null
  const dynastyScoreOutOfRange =
    dynastyScoreNum != null && (dynastyScoreNum < 0 || dynastyScoreNum > 100)

  const headline = s.seasonHeadline ||
    (s.leaguePosition === 1
      ? `${s.leagueCompetition || 'League'} champions — ${s.label}`
      : s.label)

  const heroLede = buildHeroLede(s.narrativeText)

  const hasTrophyData =
    s.leaguePosition === 1 || s.uclResult === 'Champions' ||
    s.faCupResult === 'Winner' || s.carabaoCupResult === 'Winner'

  const showFaCup   = s.faCupResult    && s.faCupResult    !== 'Did Not Enter'
  const showCarabao = s.carabaoCupResult && s.carabaoCupResult !== 'Did Not Enter'
  const hasCups     = showFaCup || showCarabao

  const uclActive = detectUclActivity(s) ||
    matches.some(m => m.competition === 'UCL_LP' || KO_COMPS.includes(m.competition))

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* ── TOP BAR ── */}
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => {
            if (hasChanges) { setDlgDiscard(true); return }
            navigate('/seasons')
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 5L7 10l5 5" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className={styles.topCenter}>
            {/* Season label — Inter 700, no display font */}
            <span className={styles.topLabel}>{s.label}</span>
            {s.year && <span className={styles.topYear}>{s.year}</span>}
          </div>
          <div className={styles.topRight}>
            {s.isComplete
              ? <span className={styles.badgeComplete}>Complete</span>
              : <span className={styles.badgeLive}>In progress</span>
            }
          </div>
        </div>

        {/* ── EDIT BAR ── */}
        {editing && (
          <div className={styles.editBar}>
            <span className={styles.editIndicator}>
              <span className={styles.editDot} /> Editing
            </span>
            <div className={styles.editActions}>
              <button className={styles.cancelEditBtn}
                      onClick={handleCancel} disabled={saving}>Cancel</button>
              <button className={styles.saveBtn}
                      onClick={handleSave} disabled={saving}>
                {saving ? <><span className={styles.spinnerSm} /> Saving…</> : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── LOCKED BAR ── */}
        {s.isComplete && !editing && (
          <div className={styles.lockedBar}>
            <span className={styles.lockedText}>
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                <rect x="1.5" y="5.5" width="10" height="7" rx="1"
                      stroke="currentColor" strokeWidth="1.3"/>
                <path d="M3.5 5.5V4a3 3 0 0 1 6 0v1.5"
                      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Locked
            </span>
            <button className={styles.unlockBtn}
                    onClick={() => setDlgUnlock(true)}>Unlock to edit</button>
          </div>
        )}

        {/* ── ACTION TOOLBAR ── */}
        {!s.isComplete && !editing && (
          <div className={styles.toolbar}>
            <button className={styles.editBtn} onClick={enterEdit}>
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                <path d="M8.5 2.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor"
                      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Edit season
            </button>
            <button className={styles.completeBtn}
                    onClick={() => setDlgComplete(true)}>Mark complete</button>
          </div>
        )}

        {saveErr && <div className={styles.saveErr}>{saveErr}</div>}

        {/* ════════════════════════════════════════════════════════════
            READ-ONLY STORY VIEW
        ════════════════════════════════════════════════════════════ */}
        {!editing && (
          <>
            {/* 1. HERO */}
            <div className={styles.hero}>
              <p className={styles.heroEyebrow}>
                {s.label}
                {s.year ? ` · ${s.year}` : ''}
                {s.leagueCompetition ? ` · ${s.leagueCompetition}` : ''}
              </p>
              <h1 className={styles.heroHeadline}>{headline}</h1>
              <div className={styles.heroIdentityRule} />
              {/* Short lede only — full story is in "The Story" section below */}
              {heroLede && (
                <p className={styles.heroLede}>{heroLede}</p>
              )}
            </div>

            {/* 2. TROPHY SHELF */}
            {hasTrophyData && <TrophyShelf s={s} />}

            {/* 3. THE STORY — full narrative, not duplicated in hero */}
            {s.narrativeText && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>The story</p>
                <div className={styles.storyBody}>
                  {s.narrativeText.split('\n').filter(Boolean).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>
            )}

            {/* 4. KEY MOMENTS */}
            {s.keyMoments?.length > 0 && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>Key moments</p>
                <div className={styles.momentsList}>
                  {s.keyMoments.map((m, i) => (
                    <div key={i} className={styles.moment}>
                      <span className={styles.momentIndex}>{i + 1}</span>
                      <span className={styles.momentText}>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. THE LEAGUE */}
            {s.leaguePosition != null && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>The league</p>
                <p className={styles.leagueStatement}>
                  {s.leaguePosition === 1
                    ? `${s.leagueCompetition || 'League'} champions.`
                    : `Finished ${s.leaguePosition}${ordinal(s.leaguePosition)} in the ${s.leagueCompetition || 'league'}.`
                  }
                  {s.leaguePts ? ` ${s.leaguePts} points.` : ''}
                </p>
                {s.leagueP != null && (
                  <div className={styles.recordGrid}>
                    {[
                      [s.leagueP, 'P', false], [s.leagueW, 'W', false], [s.leagueD, 'D', false], [s.leagueL, 'L', false],
                      [s.leagueGF, 'GF', false], [s.leagueGA, 'GA', false], [fmtGD(lGD), 'GD', false], [s.leaguePts, 'Pts', true],
                    ].map(([val, lbl, highlight]) => (
                      <div key={lbl} className={`${styles.recordCell} ${highlight ? styles.recordCellHighlight : ''}`}>
                        <div className={styles.rcVal}>{val ?? '—'}</div>
                        <div className={styles.rcLbl}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 6. UCL JOURNEY */}
            {uclActive && (
              <UclSection
                s={s}
                matches={matches}
                opponents={opponents}
                allUclMatches={allUclMatches}
                clubName={activeClub?.name}
                onSelectOpponent={setSelectedOppKey}
              />
            )}

            {/* 7. CUPS */}
            {hasCups && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>Cups</p>
                <div className={styles.cupRows}>
                  {showFaCup && (
                    <CupRow label="FA Cup" result={s.faCupResult}
                            opponent={s.faCupFinalOpponent} winner={s.faCupWinner} />
                  )}
                  {showCarabao && (
                    <CupRow label="Carabao Cup" result={s.carabaoCupResult}
                            opponent={s.carabaoCupFinalOpponent} winner={s.carabaoCupWinner} />
                  )}
                </div>
              </div>
            )}

            {/* 8. DYNASTY VERDICT */}
            {(s.dynastyScore != null || s.dynastyVerdict) && (
              <div className={styles.dynastyVerdictBlock}>
                <p className={styles.sectionLabel}>Dynasty verdict</p>
                {s.dynastyVerdict && (
                  <p className={styles.dynastyVerdictText}>{s.dynastyVerdict}</p>
                )}
                {s.dynastyScore != null && (
                  <>
                    <div className={styles.dynastyScoreRow}>
                      <span className={styles.dynastyNum}>{s.dynastyScore}</span>
                      <span className={styles.dynastyOf}>/ 100</span>
                    </div>
                    <DynastyScoreMeter score={s.dynastyScore} />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            EDIT FORM
        ════════════════════════════════════════════════════════════ */}
        {editing && f && (
          <div className={styles.editForm}>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>Identity</p>
              <div className={styles.row2}>
                <FieldGroup label="Label">
                  <TxtInput value={f.label}
                            onChange={e => set('label', e.target.value.toUpperCase())}
                            maxLength={4} placeholder="S1" />
                </FieldGroup>
                <FieldGroup label="Year">
                  <TxtInput value={f.year}
                            onChange={e => set('year', e.target.value)}
                            maxLength={7} placeholder="2026/27" />
                </FieldGroup>
              </div>
              <FieldGroup label="League">
                <SelInput value={f.leagueCompetition}
                          onChange={e => set('leagueCompetition', e.target.value)}>
                  {LEAGUE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </SelInput>
              </FieldGroup>
              <FieldGroup label="Season headline"
                          hint="One-line summary shown on the Seasons list">
                <TxtInput value={f.seasonHeadline}
                          onChange={e => set('seasonHeadline', e.target.value)}
                          placeholder="The founding year — title won, final lost 1–5" />
              </FieldGroup>
            </div>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>Story & moments</p>
              <FieldGroup label="Season narrative"
                          hint="Prose shown at the top of the season page">
                <textarea className={styles.textarea} value={f.narrativeText}
                          onChange={e => set('narrativeText', e.target.value)}
                          placeholder="Write the season story…" rows={6} />
              </FieldGroup>
              <div className={styles.momentsHeader}>
                <p className={styles.subHeading}>Key moments</p>
                <span className={styles.momentsCount}>{f.keyMoments.filter(Boolean).length}/10</span>
              </div>
              <div className={styles.momentsList_edit}>
                {f.keyMoments.map((m, i) => (
                  <div key={i} className={styles.momentRow}>
                    <span className={styles.momentNum}>{i + 1}</span>
                    <input className={styles.input} value={m}
                           onChange={e => updateMoment(i, e.target.value)}
                           placeholder="e.g. Álvarez hat-trick, UCL MD6 vs Celtic" />
                    <button type="button" className={styles.momentRemove}
                            onClick={() => removeMoment(i)} aria-label="Remove">
                      <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                        <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor"
                              strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))}
                {f.keyMoments.length < 10 && (
                  <button type="button" className={styles.addMoment} onClick={addMoment}>
                    <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor"
                            strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Add moment
                  </button>
                )}
              </div>
            </div>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>League record</p>
              <div className={styles.row2}>
                <FieldGroup label="Position">
                  <NumInput value={f.leaguePosition} onChange={e => set('leaguePosition', e.target.value)} placeholder="1" />
                </FieldGroup>
                <FieldGroup label="Points">
                  <NumInput value={f.leaguePts} onChange={e => set('leaguePts', e.target.value)} placeholder="85" />
                </FieldGroup>
              </div>
              <div className={styles.row4}>
                <FieldGroup label="P"><NumInput value={f.leagueP} onChange={e => set('leagueP', e.target.value)} placeholder="38" /></FieldGroup>
                <FieldGroup label="W"><NumInput value={f.leagueW} onChange={e => set('leagueW', e.target.value)} /></FieldGroup>
                <FieldGroup label="D"><NumInput value={f.leagueD} onChange={e => set('leagueD', e.target.value)} /></FieldGroup>
                <FieldGroup label="L"><NumInput value={f.leagueL} onChange={e => set('leagueL', e.target.value)} /></FieldGroup>
              </div>
              <div className={styles.row3}>
                <FieldGroup label="GF"><NumInput value={f.leagueGF} onChange={e => set('leagueGF', e.target.value)} /></FieldGroup>
                <FieldGroup label="GA"><NumInput value={f.leagueGA} onChange={e => set('leagueGA', e.target.value)} /></FieldGroup>
                <FieldGroup label="GD"><DerivedFld value={fmtGD(lGD)} /></FieldGroup>
              </div>
              {lWarn.map((w, i) => <Warning key={i}>{w}</Warning>)}
            </div>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>UCL</p>
              <label className={styles.toggleRow}>
                <span className={styles.fieldLabel}>Entered UCL</span>
                <button type="button"
                  className={`${styles.toggle} ${f.uclEntered ? styles.toggleOn : ''}`}
                  onClick={() => set('uclEntered', !f.uclEntered)}
                  aria-pressed={f.uclEntered}
                ><span className={styles.toggleThumb} /></button>
              </label>
              {f.uclEntered && (
                <>
                  <div className={styles.row2}>
                    <FieldGroup label="Result">
                      <SelInput value={f.uclResult} onChange={e => set('uclResult', e.target.value)}>
                        <option value="">— Select —</option>
                        {UCL_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                      </SelInput>
                    </FieldGroup>
                    <FieldGroup label="Tournament winner">
                      <TxtInput value={f.uclTournamentWinner} onChange={e => set('uclTournamentWinner', e.target.value)} placeholder="Real Madrid" />
                    </FieldGroup>
                  </div>
                  {(f.uclResult === 'Champions' || f.uclResult === 'Runners-Up') && (
                    <div className={styles.row2}>
                      <FieldGroup label="Final opponent">
                        <TxtInput value={f.uclFinalOpponent} onChange={e => set('uclFinalOpponent', e.target.value)} placeholder="Inter Milan" />
                      </FieldGroup>
                      <FieldGroup label="Final score">
                        <TxtInput value={f.uclFinalScore} onChange={e => set('uclFinalScore', e.target.value)} placeholder="2–1" />
                      </FieldGroup>
                    </div>
                  )}
                  <p className={styles.subHeading}>Knockout opponents</p>
                  <div className={styles.row2}>
                    <FieldGroup label="R16 opponent"><TxtInput value={f.uclR16Opponent} onChange={e => set('uclR16Opponent', e.target.value)} placeholder="Bayern Munich" /></FieldGroup>
                    <FieldGroup label="R16 agg score"><TxtInput value={f.uclR16Score} onChange={e => set('uclR16Score', e.target.value)} placeholder="3–1" /></FieldGroup>
                  </div>
                  <div className={styles.row2}>
                    <FieldGroup label="QF opponent"><TxtInput value={f.uclQFOpponent} onChange={e => set('uclQFOpponent', e.target.value)} placeholder="Dortmund" /></FieldGroup>
                    <FieldGroup label="QF agg score"><TxtInput value={f.uclQFScore} onChange={e => set('uclQFScore', e.target.value)} placeholder="4–2" /></FieldGroup>
                  </div>
                  <div className={styles.row2}>
                    <FieldGroup label="SF opponent"><TxtInput value={f.uclSFOpponent} onChange={e => set('uclSFOpponent', e.target.value)} placeholder="Inter Milan" /></FieldGroup>
                    <FieldGroup label="SF agg score"><TxtInput value={f.uclSFScore} onChange={e => set('uclSFScore', e.target.value)} placeholder="3–2" /></FieldGroup>
                  </div>
                  <p className={styles.subHeading}>League Phase</p>
                  <div className={styles.row2}>
                    <FieldGroup label="LP finish"><NumInput value={f.uclLeaguePhasePosition} onChange={e => set('uclLeaguePhasePosition', e.target.value)} placeholder="6" min="1" max="36" /></FieldGroup>
                    <FieldGroup label="LP pts"><NumInput value={f.uclLPPts} onChange={e => set('uclLPPts', e.target.value)} placeholder="16" /></FieldGroup>
                  </div>
                  <div className={styles.row4}>
                    <FieldGroup label="P"><NumInput value={f.uclLPP} onChange={e => set('uclLPP', e.target.value)} placeholder="8" /></FieldGroup>
                    <FieldGroup label="W"><NumInput value={f.uclLPW} onChange={e => set('uclLPW', e.target.value)} /></FieldGroup>
                    <FieldGroup label="D"><NumInput value={f.uclLPD} onChange={e => set('uclLPD', e.target.value)} /></FieldGroup>
                    <FieldGroup label="L"><NumInput value={f.uclLPL} onChange={e => set('uclLPL', e.target.value)} /></FieldGroup>
                  </div>
                  <div className={styles.row3}>
                    <FieldGroup label="GF"><NumInput value={f.uclLPGF} onChange={e => set('uclLPGF', e.target.value)} /></FieldGroup>
                    <FieldGroup label="GA"><NumInput value={f.uclLPGA} onChange={e => set('uclLPGA', e.target.value)} /></FieldGroup>
                    <FieldGroup label="GD"><DerivedFld value={fmtGD(uGD)} /></FieldGroup>
                  </div>
                  {uWarn.map((w, i) => <Warning key={i}>{w}</Warning>)}
                </>
              )}
            </div>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>Cup results</p>
              <p className={styles.subHeading}>FA Cup</p>
              <div className={styles.row2}>
                <FieldGroup label="Result">
                  <SelInput value={f.faCupResult} onChange={e => set('faCupResult', e.target.value)}>
                    <option value="">— Select —</option>
                    {CUP_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                  </SelInput>
                </FieldGroup>
                {(f.faCupResult === 'Winner' || f.faCupResult === 'Final') && (
                  <FieldGroup label="Final opponent">
                    <TxtInput value={f.faCupFinalOpponent} onChange={e => set('faCupFinalOpponent', e.target.value)} placeholder="Arsenal" />
                  </FieldGroup>
                )}
              </div>
              {f.faCupResult && f.faCupResult !== 'Winner' && f.faCupResult !== 'Did Not Enter' && (
                <FieldGroup label="Tournament winner">
                  <TxtInput value={f.faCupWinner} onChange={e => set('faCupWinner', e.target.value)} placeholder="Arsenal" />
                </FieldGroup>
              )}
              <p className={styles.subHeading} style={{ marginTop: 4 }}>Carabao Cup</p>
              <div className={styles.row2}>
                <FieldGroup label="Result">
                  <SelInput value={f.carabaoCupResult} onChange={e => set('carabaoCupResult', e.target.value)}>
                    <option value="">— Select —</option>
                    {CUP_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                  </SelInput>
                </FieldGroup>
                {(f.carabaoCupResult === 'Winner' || f.carabaoCupResult === 'Final') && (
                  <FieldGroup label="Final opponent">
                    <TxtInput value={f.carabaoCupFinalOpponent} onChange={e => set('carabaoCupFinalOpponent', e.target.value)} placeholder="Tottenham" />
                  </FieldGroup>
                )}
              </div>
              {f.carabaoCupResult && f.carabaoCupResult !== 'Winner' && f.carabaoCupResult !== 'Did Not Enter' && (
                <FieldGroup label="Tournament winner">
                  <TxtInput value={f.carabaoCupWinner} onChange={e => set('carabaoCupWinner', e.target.value)} placeholder="Liverpool" />
                </FieldGroup>
              )}
            </div>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>Dynasty verdict</p>
              <FieldGroup label="Verdict" hint="Closing statement for the season — written as history">
                <textarea className={styles.textarea} value={f.dynastyVerdict}
                          onChange={e => set('dynastyVerdict', e.target.value)}
                          placeholder="The season that made everything inevitable…" rows={3} />
              </FieldGroup>
              <FieldGroup label="Dynasty score (0–100)">
                <NumInput value={f.dynastyScore} onChange={e => set('dynastyScore', e.target.value)} min="0" max="100" placeholder="78" />
                {dynastyScoreOutOfRange && <Warning>Score must be between 0 and 100.</Warning>}
              </FieldGroup>
            </div>

          </div>
        )}

        {/* ── DIALOGS ── */}
        {dlgDiscard && (
          <Dialog title="Discard changes?" body="Unsaved edits will be lost."
                  confirmLabel="Discard" confirmDanger
                  onConfirm={doDiscard} onCancel={() => setDlgDiscard(false)} />
        )}
        {dlgComplete && (
          <Dialog title={`Mark ${s.label} as complete?`}
                  body="Completed seasons are locked. You can unlock at any time."
                  confirmLabel="Mark complete"
                  onConfirm={doComplete} onCancel={() => setDlgComplete(false)} />
        )}
        {dlgUnlock && (
          <Dialog title={`Unlock ${s.label}?`}
                  body="This will allow editing a completed season."
                  confirmLabel="Unlock"
                  onConfirm={doUnlock} onCancel={() => setDlgUnlock(false)} />
        )}
        {trophyQueue.length > 0 && (
          <TrophyPrompt
            competition={trophyQueue[0].competition}
            onConfirm={() => resolveTrophy(true)}
            onSkip={() => resolveTrophy(false)}
          />
        )}

      </div>

      {/* ── UCL OPPONENT DRILL-IN OVERLAY ── */}
      {selectedOppKey && (
        <UclOpponentDetail
          opponentKey={selectedOppKey}
          allMatches={allUclMatches}
          opponents={opponents}
          clubName={activeClub?.name}
          onClose={() => setSelectedOppKey(null)}
        />
      )}

    </div>
  )
}

export default SeasonDetail

// ─── CupRow ──────────────────────────────────────────────────────────────────

function CupRow({ label, result, opponent, winner }) {
  if (!result) return null
  const png = TROPHY_PNG_MAP[label]
  const SvgComp = TrophySVG[label] || GenericTrophySVG
  return (
    <div className={styles.cupRow}>
      <div className={styles.cupLeft}>
        {png
          ? <img src={png} alt={label} className={styles.cupTrophyImg} />
          : <SvgComp className={styles.cupTrophySvg} />
        }
        <span className={styles.cupLabel}>{label}</span>
      </div>
      <div className={styles.cupRight}>
        <span className={`${styles.cupBadge} ${
          result === 'Winner' ? styles.cupWon :
          result === 'Final'  ? styles.cupFinal : styles.cupDefault
        }`}>
          {result === 'Winner' ? 'Winner' : result === 'Final' ? 'Finalist' : result}
        </span>
        {/* Opponent — readable ivory/slate */}
        {opponent && (
          <span className={styles.cupOpponent}>vs {opponent}</span>
        )}
        {winner && result !== 'Winner' && (
          <span className={styles.cupOpponent}>Won by {winner}</span>
        )}
      </div>
    </div>
  )
}
