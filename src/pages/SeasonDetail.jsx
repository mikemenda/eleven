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

const num  = v => (v === '' || v == null) ? null : (isNaN(Number(v)) ? null : Number(v))
const disp = v => (v == null) ? '' : String(v)
const gd   = (gf, ga) => { const a = num(gf), b = num(ga); return (a != null && b != null) ? a - b : null }
const gpg  = (gf, p)  => { const a = num(gf), b = num(p);  return (a && b && b > 0) ? (a / b).toFixed(2) : null }
const fmtGD = n => n == null ? '—' : (n > 0 ? `+${n}` : String(n))
const ordinal = n => { if (!n) return ''; const s=['th','st','nd','rd'], v=n%100; return s[(v-20)%10]||s[v]||s[0] }

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
    uclLeaguePhasePosition: disp(s.uclLeaguePhasePosition),
    uclLPP: disp(s.uclLPP), uclLPW: disp(s.uclLPW), uclLPD: disp(s.uclLPD),
    uclLPL: disp(s.uclLPL), uclLPGF: disp(s.uclLPGF), uclLPGA: disp(s.uclLPGA),
    uclLPPts: disp(s.uclLPPts),
    faCupResult:         s.faCupResult ?? '',
    faCupFinalOpponent:  s.faCupFinalOpponent ?? '',
    faCupWinner:         s.faCupWinner ?? '',
    carabaoCupResult:         s.carabaoCupResult ?? '',
    carabaoCupFinalOpponent:  s.carabaoCupFinalOpponent ?? '',
    carabaoCupWinner:         s.carabaoCupWinner ?? '',
    narrativeText: s.narrativeText ?? '',
    keyMoments:    (s.keyMoments?.length ? s.keyMoments : ['']),
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
    uclLeaguePhasePosition: num(f.uclLeaguePhasePosition),
    uclLPP: num(f.uclLPP), uclLPW: num(f.uclLPW), uclLPD: num(f.uclLPD),
    uclLPL: num(f.uclLPL), uclLPGF: num(f.uclLPGF), uclLPGA: num(f.uclLPGA),
    uclLPPts: num(f.uclLPPts),
    faCupResult:         f.faCupResult || null,
    faCupFinalOpponent:  f.faCupFinalOpponent.trim() || null,
    faCupWinner:         f.faCupWinner.trim() || null,
    carabaoCupResult:        f.carabaoCupResult || null,
    carabaoCupFinalOpponent: f.carabaoCupFinalOpponent.trim() || null,
    carabaoCupWinner:        f.carabaoCupWinner.trim() || null,
    narrativeText: f.narrativeText.trim() || null,
    keyMoments:    f.keyMoments.map(k => k.trim()).filter(Boolean),
  }
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <p className={styles.sectionLabel}>{children}</p>
)

const FieldGroup = ({ label, hint, error, children }) => (
  <div className={styles.fieldGroup}>
    {label && <label className={styles.fieldLabel}>{label}</label>}
    {children}
    {error && <span className={styles.fieldError}>{error}</span>}
    {hint && !error && <span className={styles.fieldHint}>{hint}</span>}
  </div>
)

const TextInput = ({ className = '', ...props }) => (
  <input className={`${styles.input} ${className}`} {...props} />
)

const NumInput = ({ ...props }) => (
  <input type="number" min="0" className={styles.input} {...props} />
)

const SelectInput = ({ children, ...props }) => (
  <select className={styles.select} {...props}>{children}</select>
)

const DerivedField = ({ value }) => (
  <div className={styles.derivedField}>{value ?? '—'}</div>
)

const Warning = ({ children }) => (
  <div className={styles.warning}>{children}</div>
)

// Confirm / trophy dialogs
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
        >
          {confirmLabel}
        </button>
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

// Collapsible section
const Section = ({ title, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionTitle}>{title}</span>
          {badge && <span className={styles.sectionBadge}>{badge}</span>}
        </div>
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          width="16" height="16" viewBox="0 0 16 16" fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

// Read-only stat row
const StatRow = ({ label, value }) => (
  <div className={styles.statRow}>
    <span className={styles.statLabel}>{label}</span>
    <span className={styles.statValue}>{value != null && value !== '' ? value : '—'}</span>
  </div>
)

// Read-only record bar (W/D/L etc.)
const RecordBar = ({ children }) => (
  <div className={styles.recordBar}>{children}</div>
)

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const SeasonDetail = () => {
  const { id: seasonId } = useParams()
  const navigate  = useNavigate()
  const { activeGame, activeClub } = useApp()

  const [season,  setSeason]  = useState(null)
  const [trophies, setTrophies] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(null)

  // Edit state
  const [editing,   setEditing]   = useState(false)
  const [form,      setForm]      = useState(null)
  const [origForm,  setOrigForm]  = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [saveErr,   setSaveErr]   = useState(null)

  // Dialog state
  const [dlgDiscard,   setDlgDiscard]   = useState(false)
  const [dlgComplete,  setDlgComplete]  = useState(false)
  const [dlgUnlock,    setDlgUnlock]    = useState(false)
  const [trophyQueue,  setTrophyQueue]  = useState([])
  const pendingTrophies = useRef([])

  const hasChanges = editing && form && origForm &&
    JSON.stringify(form) !== JSON.stringify(origForm)

  // ── Load ──
  useEffect(() => {
    if (!activeGame)  { navigate('/');      return }
    if (!activeClub)  { navigate('/clubs'); return }
    load()
  }, [seasonId])

  const load = async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const [s, t] = await Promise.all([
        getSeason(seasonId),
        getTrophiesForSeason(seasonId),
      ])
      if (!s) { setLoadErr('Season not found.'); return }
      setSeason(s)
      setTrophies(t)
    } catch (e) {
      console.error(e)
      setLoadErr('Failed to load season.')
    } finally {
      setLoading(false)
    }
  }

  // beforeunload guard
  useEffect(() => {
    if (!hasChanges) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [hasChanges])

  // ── Edit mode ──
  const enterEdit = () => {
    const f = seasonToForm(season)
    setForm(f); setOrigForm(f); setSaveErr(null); setEditing(true)
  }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // ── Cancel ──
  const handleCancel = () => { hasChanges ? setDlgDiscard(true) : doDiscard() }
  const doDiscard = () => { setEditing(false); setForm(null); setDlgDiscard(false) }

  // ── Save ──
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
      setSaving(false)
      pendingTrophies.current = []
      setTrophyQueue(prompts)
      return
    }
    await doSave([])
  }

  const resolveTrophy = async (accepted) => {
    const queue = [...trophyQueue]
    const current = queue.shift()
    if (accepted) pendingTrophies.current = [...pendingTrophies.current, current]

    if (queue.length > 0) {
      setTrophyQueue(queue)
    } else {
      setTrophyQueue([])
      await doSave([...pendingTrophies.current])
      pendingTrophies.current = []
    }
  }

  const doSave = async (trophiesToAdd) => {
    setSaving(true)
    try {
      await updateSeason(seasonId, formToDoc(form))
      for (const t of trophiesToAdd) {
        await addTrophy({ clubId: season.clubId, seasonId, competition: t.competition })
      }
      await load()
      setEditing(false); setForm(null)
    } catch (e) {
      console.error(e)
      setSaveErr('Couldn\'t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Complete / Unlock ──
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

  // ── Key moments ──
  const addMoment    = () => form.keyMoments.length < 10 && set('keyMoments', [...form.keyMoments, ''])
  const updateMoment = (i, v) => { const a=[...form.keyMoments]; a[i]=v; set('keyMoments', a) }
  const removeMoment = (i) => { const a=form.keyMoments.filter((_,j)=>j!==i); set('keyMoments', a.length ? a : ['']) }

  // ── Render ──

  if (loading) return (
    <div className={styles.loadWrap}><div className={styles.spinner} /></div>
  )

  if (loadErr) return (
    <div className={styles.errorWrap}>
      <p className={styles.errorText}>{loadErr}</p>
      <button className={styles.backBtn} onClick={() => navigate('/seasons')}>← Back to Seasons</button>
    </div>
  )

  const s = season
  const f = form

  // Derived live values
  const lGD  = editing ? gd(f.leagueGF, f.leagueGA)   : gd(s.leagueGF, s.leagueGA)
  const lGPG = editing ? gpg(f.leagueGF, f.leagueP)   : gpg(s.leagueGF, s.leagueP)
  const uGD  = editing ? gd(f.uclLPGF, f.uclLPGA)     : gd(s.uclLPGF, s.uclLPGA)
  const lWarn = editing ? leagueWarnings(f) : []
  const uWarn = editing ? uclWarnings(f)    : []

  // Dynasty display
  const dynastyDisplay = s.dynastyScore != null
    ? String(s.dynastyScore)
    : null

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* ── Top bar ── */}
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => {
            if (hasChanges) { setDlgDiscard(true); return }
            navigate('/seasons')
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L5 9l6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div className={styles.topBarCenter}>
            <span className={styles.topLabel}>{s.label}</span>
            <span className={styles.topYear}>{s.year}</span>
          </div>

          <div className={styles.topBarRight}>
            {s.isComplete
              ? <span className={styles.badgeComplete}>Complete</span>
              : <span className={styles.badgeLive}>Live</span>
            }
          </div>
        </div>

        {/* ── Edit bar ── */}
        {editing && (
          <div className={styles.editBar}>
            <span className={styles.editIndicator}>
              <span className={styles.editDot} /> Editing
            </span>
            <div className={styles.editActions}>
              <button className={styles.cancelEditBtn} onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving
                  ? <><span className={styles.spinnerSm} /> Saving…</>
                  : 'Save Changes'
                }
              </button>
            </div>
          </div>
        )}

        {/* ── Locked bar ── */}
        {s.isComplete && !editing && (
          <div className={styles.lockedBar}>
            <span className={styles.lockedText}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M3.5 5.5V4a3 3 0 0 1 6 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Season locked
            </span>
            <button className={styles.unlockBtn} onClick={() => setDlgUnlock(true)}>Unlock</button>
          </div>
        )}

        {/* ── Action toolbar (read-only, not locked) ── */}
        {!s.isComplete && !editing && (
          <div className={styles.toolbar}>
            <button className={styles.editBtn} onClick={enterEdit}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M8.5 2.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Edit Season
            </button>
            <button className={styles.completeBtn} onClick={() => setDlgComplete(true)}>
              Mark Complete
            </button>
          </div>
        )}

        {saveErr && <div className={styles.saveErr}>{saveErr}</div>}

        {/* ══ SECTIONS ══════════════════════════════════════════════ */}
        <div className={styles.sections}>

          {/* ── Identity ── */}
          <Section title="Identity" defaultOpen>
            {editing ? (
              <div className={styles.fields}>
                <div className={styles.row2}>
                  <FieldGroup label="Label">
                    <TextInput value={f.label} onChange={e => set('label', e.target.value.toUpperCase())} maxLength={4} placeholder="S1" />
                  </FieldGroup>
                  <FieldGroup label="Year">
                    <TextInput value={f.year} onChange={e => set('year', e.target.value)} maxLength={7} placeholder="2026/27" />
                  </FieldGroup>
                </div>
                <FieldGroup label="League Competition">
                  <SelectInput value={f.leagueCompetition} onChange={e => set('leagueCompetition', e.target.value)}>
                    {LEAGUE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </SelectInput>
                </FieldGroup>
                <div className={styles.dynastyReadOnly}>
                  <span className={styles.dynastyROLabel}>Dynasty Rating</span>
                  <span className={styles.dynastyROValue}>
                    {dynastyDisplay ?? <em>Pending</em>}
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.stats}>
                <StatRow label="Label" value={<span className={styles.mono}>{s.label}</span>} />
                <StatRow label="Year" value={s.year} />
                <StatRow label="Competition" value={s.leagueCompetition} />
                <div className={styles.dynastyRow}>
                  <span className={styles.statLabel}>Dynasty Rating</span>
                  {dynastyDisplay
                    ? <span className={styles.dynastyScore}>{dynastyDisplay}</span>
                    : <span className={styles.dynastyPending}>Rating Pending</span>
                  }
                </div>
              </div>
            )}
          </Section>

          {/* ── League ── */}
          <Section
            title="League Summary"
            badge={s.leaguePosition ? `${s.leaguePosition}${ordinal(s.leaguePosition)}` : null}
          >
            {editing ? (
              <div className={styles.fields}>
                <div className={styles.row2}>
                  <FieldGroup label="Position">
                    <NumInput value={f.leaguePosition} onChange={e => set('leaguePosition', e.target.value)} placeholder="1" />
                  </FieldGroup>
                  <FieldGroup label="Points">
                    <NumInput value={f.leaguePts} onChange={e => set('leaguePts', e.target.value)} placeholder="85" />
                  </FieldGroup>
                </div>
                <div className={styles.row4}>
                  <FieldGroup label="P"><NumInput value={f.leagueP}   onChange={e => set('leagueP',  e.target.value)} placeholder="38" /></FieldGroup>
                  <FieldGroup label="W"><NumInput value={f.leagueW}   onChange={e => set('leagueW',  e.target.value)} /></FieldGroup>
                  <FieldGroup label="D"><NumInput value={f.leagueD}   onChange={e => set('leagueD',  e.target.value)} /></FieldGroup>
                  <FieldGroup label="L"><NumInput value={f.leagueL}   onChange={e => set('leagueL',  e.target.value)} /></FieldGroup>
                </div>
                <div className={styles.row3}>
                  <FieldGroup label="GF"><NumInput value={f.leagueGF} onChange={e => set('leagueGF', e.target.value)} /></FieldGroup>
                  <FieldGroup label="GA"><NumInput value={f.leagueGA} onChange={e => set('leagueGA', e.target.value)} /></FieldGroup>
                  <FieldGroup label="GD"><DerivedField value={fmtGD(lGD)} /></FieldGroup>
                </div>
                {lGPG && (
                  <div className={styles.derivedRow}>
                    <span className={styles.derivedLabel}>Goals / Game</span>
                    <span className={styles.derivedValue}>{lGPG}</span>
                  </div>
                )}
                {lWarn.map((w, i) => <Warning key={i}>{w}</Warning>)}
              </div>
            ) : (
              <div className={styles.stats}>
                {s.leagueP != null ? (
                  <RecordBar>
                    <span>{s.leagueW}W {s.leagueD}D {s.leagueL}L</span>
                    <span className={styles.barDot}>·</span>
                    <span>{s.leagueGF}–{s.leagueGA} ({fmtGD(gd(s.leagueGF, s.leagueGA))})</span>
                    <span className={styles.barDot}>·</span>
                    <span className={styles.barBold}>{s.leaguePts} pts</span>
                  </RecordBar>
                ) : null}
                {lGPG && <StatRow label="Goals / Game" value={lGPG} />}
                {s.leaguePosition && <StatRow label="Final Position" value={`${s.leaguePosition}${ordinal(s.leaguePosition)}`} />}
              </div>
            )}
          </Section>

          {/* ── UCL ── */}
          <Section
            title="UCL"
            badge={s.uclResult || null}
          >
            {editing ? (
              <div className={styles.fields}>
                <label className={styles.toggleRow}>
                  <span className={styles.fieldLabel}>Entered UCL</span>
                  <button
                    type="button"
                    className={`${styles.toggle} ${f.uclEntered ? styles.toggleOn : ''}`}
                    onClick={() => set('uclEntered', !f.uclEntered)}
                    aria-pressed={f.uclEntered}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                </label>

                {f.uclEntered && (
                  <>
                    <div className={styles.row2}>
                      <FieldGroup label="Result">
                        <SelectInput value={f.uclResult} onChange={e => set('uclResult', e.target.value)}>
                          <option value="">— Select —</option>
                          {UCL_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                        </SelectInput>
                      </FieldGroup>
                      <FieldGroup label="Tournament Winner">
                        <TextInput value={f.uclTournamentWinner} onChange={e => set('uclTournamentWinner', e.target.value)} placeholder="Real Madrid" />
                      </FieldGroup>
                    </div>

                    <p className={styles.subHeading}>League Phase</p>
                    <div className={styles.row2}>
                      <FieldGroup label="Finish">
                        <NumInput value={f.uclLeaguePhasePosition} onChange={e => set('uclLeaguePhasePosition', e.target.value)} placeholder="6" min="1" max="36" />
                      </FieldGroup>
                      <FieldGroup label="Pts">
                        <NumInput value={f.uclLPPts} onChange={e => set('uclLPPts', e.target.value)} placeholder="16" />
                      </FieldGroup>
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
                      <FieldGroup label="GD"><DerivedField value={fmtGD(uGD)} /></FieldGroup>
                    </div>
                    {uWarn.map((w, i) => <Warning key={i}>{w}</Warning>)}
                  </>
                )}
              </div>
            ) : (
              <div className={styles.stats}>
                {!s.uclEntered ? (
                  <span className={styles.dimText}>Did not enter UCL</span>
                ) : (
                  <>
                    {s.uclResult && (
                      <div className={styles.uclResultRow}>
                        <span className={`${styles.uclBadge} ${s.uclResult === 'Champions' ? styles.uclChampions : s.uclResult === 'Runners-Up' ? styles.uclRunnerUp : styles.uclDefault}`}>
                          {s.uclResult === 'Champions' ? '★ ' : ''}{s.uclResult}
                        </span>
                        {s.uclTournamentWinner && s.uclResult !== 'Champions' && (
                          <span className={styles.dimText}>Won by {s.uclTournamentWinner}</span>
                        )}
                      </div>
                    )}
                    {s.uclLeaguePhasePosition && (
                      <StatRow label="LP Finish" value={`${s.uclLeaguePhasePosition}${ordinal(s.uclLeaguePhasePosition)}`} />
                    )}
                    {s.uclLPP != null && (
                      <RecordBar>
                        <span>{s.uclLPW}W {s.uclLPD}D {s.uclLPL}L</span>
                        <span className={styles.barDot}>·</span>
                        <span>{s.uclLPGF}–{s.uclLPGA}</span>
                        <span className={styles.barDot}>·</span>
                        <span className={styles.barBold}>{s.uclLPPts} pts</span>
                      </RecordBar>
                    )}
                  </>
                )}
              </div>
            )}
          </Section>

          {/* ── Cups ── */}
          <Section title="Cup Results">
            {editing ? (
              <div className={styles.fields}>
                <p className={styles.subHeading}>FA Cup</p>
                <div className={styles.row2}>
                  <FieldGroup label="Result">
                    <SelectInput value={f.faCupResult} onChange={e => set('faCupResult', e.target.value)}>
                      <option value="">— Select —</option>
                      {CUP_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                    </SelectInput>
                  </FieldGroup>
                  {(f.faCupResult === 'Winner' || f.faCupResult === 'Final') && (
                    <FieldGroup label="Final Opponent">
                      <TextInput value={f.faCupFinalOpponent} onChange={e => set('faCupFinalOpponent', e.target.value)} placeholder="Arsenal" />
                    </FieldGroup>
                  )}
                </div>
                {f.faCupResult && f.faCupResult !== 'Winner' && f.faCupResult !== 'Did Not Enter' && (
                  <FieldGroup label="Tournament Winner">
                    <TextInput value={f.faCupWinner} onChange={e => set('faCupWinner', e.target.value)} placeholder="Arsenal" />
                  </FieldGroup>
                )}

                <p className={styles.subHeading} style={{ marginTop: 4 }}>Carabao Cup</p>
                <div className={styles.row2}>
                  <FieldGroup label="Result">
                    <SelectInput value={f.carabaoCupResult} onChange={e => set('carabaoCupResult', e.target.value)}>
                      <option value="">— Select —</option>
                      {CUP_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                    </SelectInput>
                  </FieldGroup>
                  {(f.carabaoCupResult === 'Winner' || f.carabaoCupResult === 'Final') && (
                    <FieldGroup label="Final Opponent">
                      <TextInput value={f.carabaoCupFinalOpponent} onChange={e => set('carabaoCupFinalOpponent', e.target.value)} placeholder="Tottenham" />
                    </FieldGroup>
                  )}
                </div>
                {f.carabaoCupResult && f.carabaoCupResult !== 'Winner' && f.carabaoCupResult !== 'Did Not Enter' && (
                  <FieldGroup label="Tournament Winner">
                    <TextInput value={f.carabaoCupWinner} onChange={e => set('carabaoCupWinner', e.target.value)} placeholder="Liverpool" />
                  </FieldGroup>
                )}
              </div>
            ) : (
              <div className={styles.stats}>
                <CupRow label="FA Cup" result={s.faCupResult} opponent={s.faCupFinalOpponent} winner={s.faCupWinner} />
                <CupRow label="Carabao Cup" result={s.carabaoCupResult} opponent={s.carabaoCupFinalOpponent} winner={s.carabaoCupWinner} />
              </div>
            )}
          </Section>

          {/* ── Narrative ── */}
          <Section title="Narrative & Key Moments">
            {editing ? (
              <div className={styles.fields}>
                <FieldGroup label="Season Narrative">
                  <textarea
                    className={styles.textarea}
                    value={f.narrativeText}
                    onChange={e => set('narrativeText', e.target.value)}
                    placeholder="Write your season story…"
                    rows={5}
                  />
                </FieldGroup>

                <div className={styles.momentsHeader}>
                  <p className={styles.subHeading}>Key Moments</p>
                  <span className={styles.momentsCount}>{f.keyMoments.filter(Boolean).length}/10</span>
                </div>
                <div className={styles.momentsList}>
                  {f.keyMoments.map((m, i) => (
                    <div key={i} className={styles.momentRow}>
                      <span className={styles.momentNum}>{i + 1}</span>
                      <input
                        className={styles.input}
                        value={m}
                        onChange={e => updateMoment(i, e.target.value)}
                        placeholder="e.g. Rangers shock exit — 1–5 QF first leg"
                      />
                      <button
                        type="button"
                        className={styles.momentRemove}
                        onClick={() => removeMoment(i)}
                        aria-label="Remove"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                  {f.keyMoments.length < 10 && (
                    <button type="button" className={styles.addMoment} onClick={addMoment}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                      Add moment
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.stats}>
                {s.narrativeText
                  ? <p className={styles.narrativeText}>{s.narrativeText}</p>
                  : <span className={styles.dimText}>No narrative yet</span>
                }
                {s.keyMoments?.length > 0 && (
                  <ul className={styles.momentReadList}>
                    {s.keyMoments.map((m, i) => (
                      <li key={i} className={styles.momentReadItem}>
                        <span className={styles.momentBullet}>·</span>{m}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>

        </div>{/* end sections */}

        {/* ── Dialogs ── */}
        {dlgDiscard && (
          <Dialog
            title="Discard changes?"
            body="Any unsaved edits will be lost."
            confirmLabel="Discard"
            confirmDanger
            onConfirm={doDiscard}
            onCancel={() => setDlgDiscard(false)}
          />
        )}
        {dlgComplete && (
          <Dialog
            title={`Mark ${s.label} as complete?`}
            body="Completed seasons are locked for editing. You can unlock at any time."
            confirmLabel="Mark Complete"
            onConfirm={doComplete}
            onCancel={() => setDlgComplete(false)}
          />
        )}
        {dlgUnlock && (
          <Dialog
            title={`Unlock ${s.label} for editing?`}
            body="This will allow changes to a completed season."
            confirmLabel="Unlock"
            onConfirm={doUnlock}
            onCancel={() => setDlgUnlock(false)}
          />
        )}
        {trophyQueue.length > 0 && (
          <TrophyPrompt
            competition={trophyQueue[0].competition}
            onConfirm={() => resolveTrophy(true)}
            onSkip={() => resolveTrophy(false)}
          />
        )}

      </div>
    </div>
  )
}

export default SeasonDetail

// ─── CupRow read-only helper ─────────────────────────────────────────────────
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
