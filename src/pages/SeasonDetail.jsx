import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  getSeason,
  updateSeason,
  getTrophiesForSeason,
  addTrophy,
} from '../firebase/services'
import styles from './SeasonDetail.module.css'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const UCL_RESULTS  = ['Champions', 'Runners-Up', 'SF', 'QF', 'R16', 'Playoff', 'LP Only']
const CUP_ROUNDS   = ['Did Not Enter', 'R32', 'R16', 'QF', 'SF', 'Final', 'Winner']
const LEAGUE_OPTIONS = [
  'Premier League', 'English Championship', 'La Liga',
  'Bundesliga', 'Serie A', 'Ligue 1',
]

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const num    = v => (v === '' || v == null) ? null : (isNaN(Number(v)) ? null : Number(v))
const disp   = v => (v == null) ? '' : String(v)
const gd     = (gf, ga) => { const a = num(gf), b = num(ga); return (a != null && b != null) ? a - b : null }
const fmtGD  = n => n == null ? '—' : (n > 0 ? `+${n}` : String(n))
const ordinal = n => { if (!n) return ''; const s=['th','st','nd','rd'], v=n%100; return s[(v-20)%10]||s[v]||s[0] }

function abbrev(name) {
  if (!name) return '?'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return name.slice(0, 3).toUpperCase()
  if (words.length === 2) return (words[0][0] + words[1].slice(0,2)).toUpperCase()
  return words.map(w => w[0]).join('').slice(0,3).toUpperCase()
}

function leagueWarnings(f) {
  const w = []
  const p = num(f.leagueP), ww = num(f.leagueW), d = num(f.leagueD), l = num(f.leagueL), pts = num(f.leaguePts)
  if (p != null && ww != null && d != null && l != null && ww + d + l !== p)
    w.push('W + D + L doesn\'t add up to P.')
  if (ww != null && d != null && pts != null && (ww * 3 + d) !== pts)
    w.push('Points don\'t match W/D/L.')
  return w
}

function uclWarnings(f) {
  const w = []
  const p = num(f.uclLPP), ww = num(f.uclLPW), d = num(f.uclLPD), l = num(f.uclLPL), pts = num(f.uclLPPts)
  if (p != null && ww != null && d != null && l != null && ww + d + l !== p)
    w.push('W + D + L doesn\'t add up to P.')
  if (ww != null && d != null && pts != null && (ww * 3 + d) !== pts)
    w.push('Points don\'t match W/D/L.')
  return w
}

function seasonToForm(s) {
  return {
    label:            s.label ?? '',
    year:             s.year ?? '',
    leagueCompetition: s.leagueCompetition ?? 'Premier League',
    leaguePosition:   disp(s.leaguePosition),
    leagueP:   disp(s.leagueP),   leagueW: disp(s.leagueW),
    leagueD:   disp(s.leagueD),   leagueL: disp(s.leagueL),
    leagueGF:  disp(s.leagueGF),  leagueGA: disp(s.leagueGA),
    leaguePts: disp(s.leaguePts),
    uclEntered:             s.uclEntered  ?? false,
    uclResult:              s.uclResult   ?? '',
    uclTournamentWinner:    s.uclTournamentWinner ?? '',
    uclFinalOpponent:       s.uclFinalOpponent ?? '',
    uclFinalScore:          s.uclFinalScore ?? '',
    uclLeaguePhasePosition: disp(s.uclLeaguePhasePosition),
    uclLPP: disp(s.uclLPP), uclLPW: disp(s.uclLPW), uclLPD: disp(s.uclLPD),
    uclLPL: disp(s.uclLPL), uclLPGF: disp(s.uclLPGF), uclLPGA: disp(s.uclLPGA),
    uclLPPts: disp(s.uclLPPts),
    uclR16Opponent: s.uclR16Opponent ?? '', uclR16Score: s.uclR16Score ?? '',
    uclQFOpponent:  s.uclQFOpponent  ?? '', uclQFScore:  s.uclQFScore  ?? '',
    uclSFOpponent:  s.uclSFOpponent  ?? '', uclSFScore:  s.uclSFScore  ?? '',
    faCupResult:         s.faCupResult ?? '',
    faCupFinalOpponent:  s.faCupFinalOpponent ?? '',
    faCupWinner:         s.faCupWinner ?? '',
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
    label:            f.label.trim().toUpperCase(),
    year:             f.year.trim(),
    leagueCompetition: f.leagueCompetition,
    leaguePosition:   num(f.leaguePosition),
    leagueP:   num(f.leagueP),   leagueW: num(f.leagueW),
    leagueD:   num(f.leagueD),   leagueL: num(f.leagueL),
    leagueGF:  num(f.leagueGF),  leagueGA: num(f.leagueGA),
    leaguePts: num(f.leaguePts),
    uclEntered:             f.uclEntered,
    uclResult:              f.uclResult || null,
    uclTournamentWinner:    f.uclTournamentWinner.trim() || null,
    uclFinalOpponent:       f.uclFinalOpponent.trim() || null,
    uclFinalScore:          f.uclFinalScore.trim() || null,
    uclLeaguePhasePosition: num(f.uclLeaguePhasePosition),
    uclLPP: num(f.uclLPP), uclLPW: num(f.uclLPW), uclLPD: num(f.uclLPD),
    uclLPL: num(f.uclLPL), uclLPGF: num(f.uclLPGF), uclLPGA: num(f.uclLPGA),
    uclLPPts: num(f.uclLPPts),
    uclR16Opponent: f.uclR16Opponent.trim() || null, uclR16Score: f.uclR16Score.trim() || null,
    uclQFOpponent:  f.uclQFOpponent.trim()  || null, uclQFScore:  f.uclQFScore.trim()  || null,
    uclSFOpponent:  f.uclSFOpponent.trim()  || null, uclSFScore:  f.uclSFScore.trim()  || null,
    faCupResult:         f.faCupResult || null,
    faCupFinalOpponent:  f.faCupFinalOpponent.trim() || null,
    faCupWinner:         f.faCupWinner.trim() || null,
    carabaoCupResult:        f.carabaoCupResult || null,
    carabaoCupFinalOpponent: f.carabaoCupFinalOpponent.trim() || null,
    carabaoCupWinner:        f.carabaoCupWinner.trim() || null,
    seasonHeadline: f.seasonHeadline.trim() || null,
    narrativeText:  f.narrativeText.trim() || null,
    keyMoments:     f.keyMoments.map(k => k.trim()).filter(Boolean),
    dynastyVerdict: f.dynastyVerdict.trim() || null,
    dynastyScore:   num(f.dynastyScore),
  }
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

const FieldGroup = ({ label, hint, error, children }) => (
  <div className={styles.fieldGroup}>
    {label && <label className={styles.fieldLabel}>{label}</label>}
    {children}
    {error && <span className={styles.fieldError}>{error}</span>}
    {hint && !error && <span className={styles.fieldHint}>{hint}</span>}
  </div>
)

const TxtInput   = ({ className = '', ...p }) => <input className={`${styles.input} ${className}`} {...p} />
const NumInput   = (p) => <input type="number" min="0" className={styles.input} {...p} />
const SelInput   = ({ children, ...p }) => <select className={styles.select} {...p}>{children}</select>
const DerivedFld = ({ value }) => <div className={styles.derivedField}>{value ?? '—'}</div>
const Warning    = ({ children }) => <div className={styles.warning}>{children}</div>

const Dialog = ({ title, body, confirmLabel, confirmDanger, onConfirm, onCancel }) => (
  <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
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
      <p className={styles.dialogBody}>Add <strong>{competition}</strong> to your trophy cabinet for this season?</p>
      <div className={styles.dialogActions}>
        <button className={styles.dialogCancel} onClick={onSkip}>Skip</button>
        <button className={styles.dialogConfirm} onClick={onConfirm}>Add Trophy</button>
      </div>
    </div>
  </div>
)

// ─── TROPHY SVG (museum object, not emoji) ────────────────────────────────────

const TrophySvg = ({ className }) => (
  <svg className={className} viewBox="0 0 44 58" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 38c-8 0-14-7-14-16V8h28v14c0 9-6 16-14 16z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M8 12H4a3 3 0 0 0 0 6h4M36 12h4a3 3 0 0 1 0 6h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M22 38v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M14 46h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 50h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="22" cy="20" r="4" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.4"/>
  </svg>
)

// ─── TROPHY SHELF (read-only) ─────────────────────────────────────────────────

function TrophyShelf({ s }) {
  const items = []

  if (s.leaguePosition === 1 && s.leagueCompetition)
    items.push({ key: 'lg', label: s.leagueCompetition, won: true })
  if (s.uclResult === 'Champions')
    items.push({ key: 'ucl', label: 'UEFA Champions League', won: true })
  if (s.faCupResult === 'Winner')
    items.push({ key: 'fa', label: 'FA Cup', won: true })
  if (s.carabaoCupResult === 'Winner')
    items.push({ key: 'cc', label: 'Carabao Cup', won: true })
  if (s.uclResult === 'Runners-Up') {
    const opp = s.uclFinalOpponent || s.uclTournamentWinner || ''
    items.push({
      key: 'ucl-ru', label: 'UCL Final', won: false,
      sub: opp ? `Lost to ${opp}${s.uclFinalScore ? ` · ${s.uclFinalScore}` : ''}` : s.uclFinalScore || null
    })
  }

  if (!items.length) return null

  return (
    <div className={styles.trophyShelf}>
      <div className={styles.trophyShelfItems}>
        {items.map(t => (
          <div key={t.key} className={t.won ? styles.trophyItem : styles.trophyItemRu}>
            <TrophySvg className={t.won ? styles.trophySvgWon : styles.trophySvgRu} />
            <span className={t.won ? styles.trophyName : styles.trophyRuLabel}>{t.label}</span>
            {t.sub && <span className={styles.trophyRuSub}>{t.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── UCL PATH (read-only) ─────────────────────────────────────────────────────

function UclPath({ s }) {
  const isChampion = s.uclResult === 'Champions'
  const isRunnerUp = s.uclResult === 'Runners-Up'
  const reachedFinal = isChampion || isRunnerUp

  const rounds = []
  if (s.uclLeaguePhasePosition != null) {
    rounds.push({
      stage: 'Group',
      abbr: 'LP',
      score: `${s.uclLeaguePhasePosition}${ordinal(s.uclLeaguePhasePosition)}`,
      isLoss: false,
    })
  }
  if (s.uclR16Opponent) rounds.push({ stage: 'R16', abbr: abbrev(s.uclR16Opponent), score: s.uclR16Score || '—', opponent: s.uclR16Opponent, isLoss: false })
  if (s.uclQFOpponent)  rounds.push({ stage: 'QF',  abbr: abbrev(s.uclQFOpponent),  score: s.uclQFScore  || '—', opponent: s.uclQFOpponent,  isLoss: false })
  if (s.uclSFOpponent)  rounds.push({ stage: 'SF',  abbr: abbrev(s.uclSFOpponent),  score: s.uclSFScore  || '—', opponent: s.uclSFOpponent,  isLoss: false })
  if (reachedFinal) {
    const opp = s.uclFinalOpponent || s.uclTournamentWinner || ''
    rounds.push({
      stage: 'Final',
      abbr: abbrev(opp),
      score: s.uclFinalScore || '—',
      opponent: opp,
      isLoss: isRunnerUp,
      isWin: isChampion,
    })
  }

  if (!rounds.length) return (
    <p className={styles.dimText}>
      {s.uclResult ? `Exited at ${s.uclResult}` : 'No UCL data recorded'}
    </p>
  )

  return (
    <div className={styles.uclPath}>
      {rounds.map((r, i) => (
        <div key={i} className={styles.uclNodeWrap}>
          <div className={styles.uclNode}>
            <div className={styles.uclStage}>{r.stage}</div>
            <div className={`${styles.uclCrest} ${r.isLoss ? styles.uclCrestLoss : r.isWin ? styles.uclCrestWin : ''}`}>
              {r.abbr}
            </div>
            <div className={`${styles.uclScore} ${r.isLoss ? styles.uclScoreLoss : styles.uclScorePass}`}>
              {r.score}
            </div>
            {r.opponent && <div className={styles.uclOppName}>{r.opponent}</div>}
          </div>
          {i < rounds.length - 1 && <div className={styles.uclArrow}>›</div>}
        </div>
      ))}
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const SeasonDetail = () => {
  const { id: seasonId } = useParams()
  const navigate  = useNavigate()
  const { activeGame, activeClub } = useApp()

  const [season,   setSeason]   = useState(null)
  const [trophies, setTrophies] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)

  const [editing,  setEditing]  = useState(false)
  const [form,     setForm]     = useState(null)
  const [origForm, setOrigForm] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState(null)

  const [showLeagueRecord, setShowLeagueRecord] = useState(false)
  const [showMDGrid,       setShowMDGrid]       = useState(false)

  const [dlgDiscard,  setDlgDiscard]  = useState(false)
  const [dlgComplete, setDlgComplete] = useState(false)
  const [dlgUnlock,   setDlgUnlock]   = useState(false)
  const [trophyQueue, setTrophyQueue] = useState([])
  const pendingTrophies = useRef([])

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
      const [s, t] = await Promise.all([getSeason(seasonId), getTrophiesForSeason(seasonId)])
      if (!s) { setLoadErr('Season not found.'); return }
      setSeason(s); setTrophies(t)
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
    else { setTrophyQueue([]); await doSave([...pendingTrophies.current]); pendingTrophies.current = [] }
  }

  const doSave = async (trophiesToAdd) => {
    setSaving(true)
    try {
      await updateSeason(seasonId, formToDoc(form))
      for (const t of trophiesToAdd) await addTrophy({ clubId: season.clubId, seasonId, competition: t.competition })
      await load()
      setEditing(false); setForm(null)
    } catch (e) {
      console.error(e); setSaveErr('Couldn\'t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const doComplete = async () => {
    try { await updateSeason(seasonId, { isComplete: true }); await load() }
    catch (e) { console.error(e) } finally { setDlgComplete(false) }
  }

  const doUnlock = async () => {
    try { await updateSeason(seasonId, { isComplete: false }); await load() }
    catch (e) { console.error(e) } finally { setDlgUnlock(false) }
  }

  const addMoment    = () => form.keyMoments.length < 10 && set('keyMoments', [...form.keyMoments, ''])
  const updateMoment = (i, v) => { const a=[...form.keyMoments]; a[i]=v; set('keyMoments', a) }
  const removeMoment = (i) => { const a=form.keyMoments.filter((_,j)=>j!==i); set('keyMoments', a.length ? a : ['']) }

  if (loading) return <div className={styles.loadWrap}><div className={styles.spinner} /></div>
  if (loadErr) return (
    <div className={styles.errorWrap}>
      <p className={styles.errorText}>{loadErr}</p>
      <button className={styles.backBtn} onClick={() => navigate('/seasons')}>← Back</button>
    </div>
  )

  const s = season
  const f = form

  const lGD   = editing ? gd(f.leagueGF, f.leagueGA) : gd(s.leagueGF, s.leagueGA)
  const uGD   = editing ? gd(f.uclLPGF, f.uclLPGA)   : gd(s.uclLPGF, s.uclLPGA)
  const lWarn = editing ? leagueWarnings(f) : []
  const uWarn = editing ? uclWarnings(f)    : []

  const headline = s.seasonHeadline ||
    (s.leaguePosition === 1 ? `${s.leagueCompetition || 'League'} champions — ${s.label}` : s.label)

  const hasTrophyData = s.leaguePosition === 1 || s.uclResult === 'Champions' ||
    s.uclResult === 'Runners-Up' || s.faCupResult === 'Winner' || s.carabaoCupResult === 'Winner'

  const hasCups = (s.faCupResult && s.faCupResult !== 'Did Not Enter') ||
    (s.carabaoCupResult && s.carabaoCupResult !== 'Did Not Enter')

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
              <path d="M12 5L7 10l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className={styles.topCenter}>
            <span className={styles.topLabel}>{s.label}</span>
            {s.year && <span className={styles.topYear}>{s.year}</span>}
          </div>
          <div className={styles.topRight}>
            {s.isComplete
              ? <span className={styles.badgeComplete}>Complete</span>
              : <span className={styles.badgeLive}>Live</span>
            }
          </div>
        </div>

        {/* ── EDIT BAR ── */}
        {editing && (
          <div className={styles.editBar}>
            <span className={styles.editIndicator}><span className={styles.editDot} /> Editing</span>
            <div className={styles.editActions}>
              <button className={styles.cancelEditBtn} onClick={handleCancel} disabled={saving}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
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
                <rect x="1.5" y="5.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M3.5 5.5V4a3 3 0 0 1 6 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Locked
            </span>
            <button className={styles.unlockBtn} onClick={() => setDlgUnlock(true)}>Unlock to edit</button>
          </div>
        )}

        {/* ── ACTION TOOLBAR ── */}
        {!s.isComplete && !editing && (
          <div className={styles.toolbar}>
            <button className={styles.editBtn} onClick={enterEdit}>
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                <path d="M8.5 2.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Edit season
            </button>
            <button className={styles.completeBtn} onClick={() => setDlgComplete(true)}>Mark complete</button>
          </div>
        )}

        {saveErr && <div className={styles.saveErr}>{saveErr}</div>}

        {/* ════════════════════════════════════════════════════════════
            READ-ONLY STORY VIEW
        ════════════════════════════════════════════════════════════ */}
        {!editing && (
          <>
            {/* ── SECTION 1: HERO (10/10) ── */}
            <div className={styles.hero}>
              <p className={styles.heroEyebrow}>
                {s.label}{s.year ? ` · ${s.year}` : ''}{s.leagueCompetition ? ` · ${s.leagueCompetition}` : ''}
              </p>
              <h1 className={styles.heroHeadline}>{headline}</h1>
              <div className={styles.heroIdentityRule} />
              {s.narrativeText && (
                <p className={styles.heroLede}>
                  {s.narrativeText.split('\n')[0]}
                </p>
              )}
            </div>

            {/* ── SECTION 2: TROPHY CABINET (9/10) ── */}
            {hasTrophyData && <TrophyShelf s={s} />}

            {/* ── SECTION 3: THE STORY (8/10) ── */}
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

            {/* ── SECTION 4: KEY MOMENTS (7/10) ── */}
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

            {/* ── SECTION 5: THE LEAGUE (5/10) ── */}
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
                <button
                  className={styles.toggleBtn}
                  onClick={() => setShowLeagueRecord(v => !v)}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
                    style={{ transform: showLeagueRecord ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {showLeagueRecord ? 'Hide record' : 'Full season record'}
                </button>
                {showLeagueRecord && s.leagueP != null && (
                  <div className={styles.recordGrid}>
                    {[
                      [s.leagueP, 'P'], [s.leagueW, 'W'], [s.leagueD, 'D'], [s.leagueL, 'L'],
                      [s.leagueGF, 'GF'], [s.leagueGA, 'GA'], [fmtGD(lGD), 'GD'], [s.leaguePts, 'Pts']
                    ].map(([val, lbl]) => (
                      <div key={lbl} className={styles.recordCell}>
                        <div className={styles.rcVal}>{val ?? '—'}</div>
                        <div className={styles.rcLbl}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION 6: UCL JOURNEY (8/10) ── */}
            {s.uclEntered && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>UCL journey</p>
                {s.uclResult && (
                  <p className={styles.uclOpener}>
                    {s.uclResult === 'Champions'
                      ? `Champions of Europe.${s.uclFinalOpponent ? ` ${s.uclFinalOpponent} defeated in the final${s.uclFinalScore ? ` ${s.uclFinalScore}` : ''}.` : ''}`
                      : s.uclResult === 'Runners-Up'
                        ? `Reached the final — beaten${s.uclFinalOpponent ? ` by ${s.uclFinalOpponent}` : ''}${s.uclFinalScore ? ` ${s.uclFinalScore}` : ''}.`
                        : `Exited at the ${s.uclResult} stage.`
                    }
                  </p>
                )}
                <UclPath s={s} />
                {s.uclLPP != null && (
                  <>
                    <button className={styles.toggleBtn} onClick={() => setShowMDGrid(v => !v)}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
                        style={{ transform: showMDGrid ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {showMDGrid ? 'Hide group stage' : 'Group stage record'}
                    </button>
                    {showMDGrid && (
                      <div className={styles.recordGrid}>
                        {[
                          [s.uclLPP, 'P'], [s.uclLPW, 'W'], [s.uclLPD, 'D'], [s.uclLPL, 'L'],
                          [s.uclLPGF, 'GF'], [s.uclLPGA, 'GA'], [fmtGD(uGD), 'GD'], [s.uclLPPts, 'Pts']
                        ].map(([val, lbl]) => (
                          <div key={lbl} className={styles.recordCell}>
                            <div className={styles.rcVal}>{val ?? '—'}</div>
                            <div className={styles.rcLbl}>{lbl}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── SECTION 7: CUPS (4/10) ── */}
            {hasCups && (
              <div className={styles.section}>
                <p className={styles.sectionLabel}>Cups</p>
                <div className={styles.cupRows}>
                  {s.faCupResult && s.faCupResult !== 'Did Not Enter' && (
                    <CupRow label="FA Cup" result={s.faCupResult} opponent={s.faCupFinalOpponent} winner={s.faCupWinner} />
                  )}
                  {s.carabaoCupResult && s.carabaoCupResult !== 'Did Not Enter' && (
                    <CupRow label="Carabao Cup" result={s.carabaoCupResult} opponent={s.carabaoCupFinalOpponent} winner={s.carabaoCupWinner} />
                  )}
                </div>
              </div>
            )}

            {/* ── SECTION 8: DYNASTY VERDICT (9/10) ── */}
            {(s.dynastyScore != null || s.dynastyVerdict) && (
              <div className={styles.dynastyVerdictBlock}>
                <p className={styles.sectionLabel}>Dynasty verdict</p>
                {s.dynastyVerdict && (
                  <p className={styles.dynastyVerdictText}>"{s.dynastyVerdict}"</p>
                )}
                {s.dynastyScore != null && (
                  <div className={styles.dynastyScoreRow}>
                    <span className={styles.dynastyNum}>{s.dynastyScore}</span>
                    <span className={styles.dynastyOf}>/ 100</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            EDIT FORM — logic unchanged
        ════════════════════════════════════════════════════════════ */}
        {editing && f && (
          <div className={styles.editForm}>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>Identity</p>
              <div className={styles.row2}>
                <FieldGroup label="Label">
                  <TxtInput value={f.label} onChange={e => set('label', e.target.value.toUpperCase())} maxLength={4} placeholder="S1" />
                </FieldGroup>
                <FieldGroup label="Year">
                  <TxtInput value={f.year} onChange={e => set('year', e.target.value)} maxLength={7} placeholder="2026/27" />
                </FieldGroup>
              </div>
              <FieldGroup label="League">
                <SelInput value={f.leagueCompetition} onChange={e => set('leagueCompetition', e.target.value)}>
                  {LEAGUE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </SelInput>
              </FieldGroup>
              <FieldGroup label="Season headline" hint="One-line summary shown on the Seasons list">
                <TxtInput value={f.seasonHeadline} onChange={e => set('seasonHeadline', e.target.value)} placeholder="The founding year — title won, final lost 1–5" />
              </FieldGroup>
            </div>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>League record</p>
              <div className={styles.row2}>
                <FieldGroup label="Position"><NumInput value={f.leaguePosition} onChange={e => set('leaguePosition', e.target.value)} placeholder="1" /></FieldGroup>
                <FieldGroup label="Points"><NumInput value={f.leaguePts} onChange={e => set('leaguePts', e.target.value)} placeholder="85" /></FieldGroup>
              </div>
              <div className={styles.row4}>
                <FieldGroup label="P"><NumInput value={f.leagueP}  onChange={e => set('leagueP',  e.target.value)} placeholder="38" /></FieldGroup>
                <FieldGroup label="W"><NumInput value={f.leagueW}  onChange={e => set('leagueW',  e.target.value)} /></FieldGroup>
                <FieldGroup label="D"><NumInput value={f.leagueD}  onChange={e => set('leagueD',  e.target.value)} /></FieldGroup>
                <FieldGroup label="L"><NumInput value={f.leagueL}  onChange={e => set('leagueL',  e.target.value)} /></FieldGroup>
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
                <button
                  type="button"
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
                  <p className={styles.subHeading}>League phase</p>
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
              <p className={styles.editSectionHead}>Story & moments</p>
              <FieldGroup label="Season narrative" hint="Prose shown at the top of the season page">
                <textarea
                  className={styles.textarea}
                  value={f.narrativeText}
                  onChange={e => set('narrativeText', e.target.value)}
                  placeholder="Write the season story…"
                  rows={6}
                />
              </FieldGroup>
              <div className={styles.momentsHeader}>
                <p className={styles.subHeading}>Key moments</p>
                <span className={styles.momentsCount}>{f.keyMoments.filter(Boolean).length}/10</span>
              </div>
              <div className={styles.momentsList_edit}>
                {f.keyMoments.map((m, i) => (
                  <div key={i} className={styles.momentRow}>
                    <span className={styles.momentNum}>{i + 1}</span>
                    <input
                      className={styles.input}
                      value={m}
                      onChange={e => updateMoment(i, e.target.value)}
                      placeholder="e.g. Álvarez hat-trick, UCL MD6 vs Celtic"
                    />
                    <button type="button" className={styles.momentRemove} onClick={() => removeMoment(i)} aria-label="Remove">
                      <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                        <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))}
                {f.keyMoments.length < 10 && (
                  <button type="button" className={styles.addMoment} onClick={addMoment}>
                    <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Add moment
                  </button>
                )}
              </div>
            </div>

            <div className={styles.editSection}>
              <p className={styles.editSectionHead}>Dynasty verdict</p>
              <FieldGroup label="Verdict" hint="Closing statement for the season — written as history">
                <textarea
                  className={styles.textarea}
                  value={f.dynastyVerdict}
                  onChange={e => set('dynastyVerdict', e.target.value)}
                  placeholder="The season that made everything inevitable…"
                  rows={3}
                />
              </FieldGroup>
              <FieldGroup label="Dynasty score (0–100)">
                <NumInput value={f.dynastyScore} onChange={e => set('dynastyScore', e.target.value)} min="0" max="100" placeholder="78" />
              </FieldGroup>
            </div>

          </div>
        )}

        {/* ── DIALOGS ── */}
        {dlgDiscard && (
          <Dialog title="Discard changes?" body="Unsaved edits will be lost." confirmLabel="Discard" confirmDanger onConfirm={doDiscard} onCancel={() => setDlgDiscard(false)} />
        )}
        {dlgComplete && (
          <Dialog title={`Mark ${s.label} as complete?`} body="Completed seasons are locked. You can unlock at any time." confirmLabel="Mark complete" onConfirm={doComplete} onCancel={() => setDlgComplete(false)} />
        )}
        {dlgUnlock && (
          <Dialog title={`Unlock ${s.label}?`} body="This will allow editing a completed season." confirmLabel="Unlock" onConfirm={doUnlock} onCancel={() => setDlgUnlock(false)} />
        )}
        {trophyQueue.length > 0 && (
          <TrophyPrompt competition={trophyQueue[0].competition} onConfirm={() => resolveTrophy(true)} onSkip={() => resolveTrophy(false)} />
        )}

      </div>
    </div>
  )
}

export default SeasonDetail

// ─── CupRow ──────────────────────────────────────────────────────────────────
function CupRow({ label, result, opponent, winner }) {
  return (
    <div className={styles.cupRow}>
      <span className={styles.cupLabel}>{label}</span>
      <div className={styles.cupRight}>
        {result ? (
          <>
            <span className={`${styles.cupBadge} ${result === 'Winner' ? styles.cupWon : result === 'Final' ? styles.cupFinal : styles.cupDefault}`}>
              {result}
            </span>
            {opponent && <span className={styles.dimText}>vs {opponent}</span>}
            {winner && result !== 'Winner' && <span className={styles.dimText}>Won by {winner}</span>}
          </>
        ) : (
          <span className={styles.dimText}>Not set</span>
        )}
      </div>
    </div>
  )
}
