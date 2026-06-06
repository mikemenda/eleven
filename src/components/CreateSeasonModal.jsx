import { useState, useEffect } from 'react'
import { getSeasons, addSeason } from '../firebase/services'
import styles from './CreateSeasonModal.module.css'

const LEAGUE_OPTIONS = [
  'Premier League',
  'English Championship',
  'La Liga',
  'Bundesliga',
  'Serie A',
  'Ligue 1',
]

const LABEL_RE = /^[A-Za-z]\d{1,2}$/
const YEAR_RE  = /^\d{4}\/\d{2}$/

export const CreateSeasonModal = ({ clubId, onClose, onCreated }) => {
  const [label,  setLabel]  = useState('')
  const [year,   setYear]   = useState('')
  const [league, setLeague] = useState('Premier League')
  const [errors, setErrors] = useState({})
  const [existingLabels, setExistingLabels] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSeasons(clubId)
      .then(seasons => setExistingLabels(seasons.map(s => s.label.toLowerCase())))
      .catch(console.error)
  }, [clubId])

  const validateField = (field, value) => {
    if (field === 'label') {
      if (!value.trim()) return 'Label is required.'
      if (!LABEL_RE.test(value.trim())) return 'Use a format like S1 or S8.'
      if (existingLabels.includes(value.trim().toLowerCase())) return 'You already have a season with this label.'
    }
    if (field === 'year') {
      if (!value.trim()) return 'Year is required.'
      if (!YEAR_RE.test(value.trim())) return 'Use YYYY/YY format, e.g. 2033/34.'
    }
    return null
  }

  const handleBlur = (field, value) => {
    const err = validateField(field, value)
    setErrors(prev => err ? { ...prev, [field]: err } : (() => { const e = { ...prev }; delete e[field]; return e })())
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const labelErr = validateField('label', label)
    const yearErr  = validateField('year', year)
    if (labelErr || yearErr) {
      setErrors({ ...(labelErr ? { label: labelErr } : {}), ...(yearErr ? { year: yearErr } : {}) })
      return
    }
    setSaving(true)
    try {
      const ref = await addSeason({
        clubId,
        label:            label.trim().toUpperCase(),
        year:             year.trim(),
        leagueCompetition: league,
        isComplete:       false,
        dynastyScore:     null,
        narrativeText:    null,
        keyMoments:       [],
        leaguePosition:   null,
        leagueP:  null, leagueW: null, leagueD: null,
        leagueL:  null, leagueGF: null, leagueGA: null, leaguePts: null,
        uclEntered:             null,
        uclResult:              null,
        uclTournamentWinner:    null,
        uclLeaguePhasePosition: null,
        uclLPP: null, uclLPW: null, uclLPD: null,
        uclLPL: null, uclLPGF: null, uclLPGA: null, uclLPPts: null,
        faCupResult:          null,
        faCupFinalOpponent:   null,
        faCupWinner:          null,
        carabaoCupResult:         null,
        carabaoCupFinalOpponent:  null,
        carabaoCupWinner:         null,
        // Europa League and Conference League results — required for Museum trophy derivation
        uclELResult:              null,
        uclECLResult:             null,
      })
      onCreated(ref.id)
    } catch (err) {
      console.error(err)
      setErrors(prev => ({ ...prev, submit: 'Couldn\'t create season. Try again.' }))
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Create Season">

        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>New Season</p>
            <h2 className={styles.title}>Create Season</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form className={styles.body} onSubmit={handleSubmit} noValidate>
          <div className={styles.fields}>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Season Label</label>
              <input
                className={`${styles.input} ${errors.label ? styles.inputError : ''}`}
                value={label}
                onChange={e => setLabel(e.target.value.toUpperCase())}
                onBlur={e => handleBlur('label', e.target.value)}
                placeholder="S8"
                maxLength={4}
                autoFocus
              />
              {errors.label
                ? <span className={styles.errorText}>{errors.label}</span>
                : <span className={styles.hintText}>e.g. S1, S8</span>
              }
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Year</label>
              <input
                className={`${styles.input} ${errors.year ? styles.inputError : ''}`}
                value={year}
                onChange={e => setYear(e.target.value)}
                onBlur={e => handleBlur('year', e.target.value)}
                placeholder="2033/34"
                maxLength={7}
              />
              {errors.year
                ? <span className={styles.errorText}>{errors.year}</span>
                : <span className={styles.hintText}>e.g. 2033/34</span>
              }
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>League</label>
              <select
                className={styles.select}
                value={league}
                onChange={e => setLeague(e.target.value)}
              >
                {LEAGUE_OPTIONS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

          </div>

          {errors.submit && (
            <p className={styles.submitError}>{errors.submit}</p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={saving}>
              {saving ? (
                <>
                  <span className={styles.spinner} />
                  Creating…
                </>
              ) : 'Create Season'}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}
