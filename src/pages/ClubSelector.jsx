import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getClubs, addClub } from '../firebase/services'
import styles from './ClubSelector.module.css'

// Preset crest colors for quick selection
const CREST_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#f97316', // Orange
  '#eab308', // Yellow
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f43f5e', // Rose
  '#84cc16', // Lime
  '#6366f1', // Indigo
  '#ffffff', // White
]

const MANAGER_STYLES = [
  'Possession', 'Counter-attack', 'High press', 'Tiki-taka',
  'Parkbus', 'Direct', 'Wing play', 'Gegenpress'
]

const FORMATIONS = [
  '4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3',
  '4-5-1', '5-3-2', '4-1-2-1-2', '4-3-2-1', '4-4-1-1'
]

const ClubSelector = () => {
  const { activeGame, activeClub, selectClub } = useApp()
  const navigate = useNavigate()
  const [clubs, setClubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    manager: '',
    style: '',
    formation: '',
    crestColor: CREST_COLORS[0],
    league: ''
  })

  useEffect(() => {
    if (!activeGame) {
      navigate('/')
      return
    }
    loadClubs()
  }, [activeGame])

  const loadClubs = async () => {
    try {
      const data = await getClubs(activeGame.id)
      setClubs(data)
      // Auto-open form if no clubs exist
      if (data.length === 0) setShowForm(true)
    } catch (err) {
      console.error('Error loading clubs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (club) => {
    selectClub(club)
    navigate('/home')
  }

  const handleSaveClub = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const ref = await addClub({
        ...form,
        gameId: activeGame.id,
        seasonsLogged: 0,
        trophyCount: 0
      })
      const newClub = { id: ref.id, ...form, gameId: activeGame.id, seasonsLogged: 0, trophyCount: 0 }
      setClubs(prev => [...prev, newClub])
      setShowForm(false)
      setForm({ name: '', manager: '', style: '', formation: '', crestColor: CREST_COLORS[0], league: '' })
      // Auto-select new club
      handleSelect(newClub)
    } catch (err) {
      console.error('Error saving club:', err)
    } finally {
      setSaving(false)
    }
  }

  const updateForm = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className={styles.page}>
      <div className={styles.pitchOverlay} />

      <div className={styles.inner}>
        {/* Back nav */}
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {activeGame?.title}
        </button>

        <div className={styles.header}>
          <h1 className={styles.title}>Select club save</h1>
          {clubs.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => setShowForm(true)}
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              + New save
            </button>
          )}
        </div>

        {loading ? (
          <div className={styles.grid}>
            {[0,1].map(i => (
              <div key={i} className={`${styles.skeleton} loading-shimmer`} />
            ))}
          </div>
        ) : showForm ? (
          <ClubForm
            form={form}
            updateForm={updateForm}
            onSave={handleSaveClub}
            onCancel={clubs.length > 0 ? () => setShowForm(false) : null}
            saving={saving}
            gameTitle={activeGame?.title}
          />
        ) : (
          <div className={styles.grid}>
            {clubs.map((club, idx) => (
              <ClubCard
                key={club.id}
                club={club}
                isActive={activeClub?.id === club.id}
                index={idx}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Club Card ────────────────────────────────────────────────────────────────

const ClubCard = ({ club, isActive, index, onSelect }) => (
  <button
    className={`${styles.card} ${isActive ? styles.activeCard : ''}`}
    onClick={() => onSelect(club)}
    style={{ animationDelay: `${index * 60}ms` }}
  >
    {/* Crest accent bar */}
    <div
      className={styles.crestAccent}
      style={{ background: club.crestColor || 'var(--accent)' }}
    />

    <div className={styles.cardBody}>
      <div className={styles.cardTop}>
        <div className={styles.crestCircle} style={{ borderColor: club.crestColor || 'var(--accent)' }}>
          <span className={styles.crestInitial} style={{ color: club.crestColor || 'var(--accent)' }}>
            {club.name?.[0] || '?'}
          </span>
        </div>
        {isActive && (
          <span className={styles.activeBadge}>Active</span>
        )}
      </div>

      <div className={styles.clubName}>{club.name}</div>

      {club.manager && (
        <div className={styles.clubMeta}>
          {club.manager}
          {club.formation && <span className={styles.sep}>·</span>}
          {club.formation && <span>{club.formation}</span>}
        </div>
      )}

      <div className={styles.clubStats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{club.seasonsLogged || 0}</span>
          <span className={styles.statLabel}>Seasons</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statValue}>{club.trophyCount || 0}</span>
          <span className={styles.statLabel}>Trophies</span>
        </div>
        {club.league && (
          <>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statValue} style={{ fontSize: 11 }}>{club.league}</span>
              <span className={styles.statLabel}>League</span>
            </div>
          </>
        )}
      </div>
    </div>

    <div className={styles.cardArrow}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  </button>
)

// ─── Club Form ────────────────────────────────────────────────────────────────

const ClubForm = ({ form, updateForm, onSave, onCancel, saving, gameTitle }) => (
  <div className={styles.form}>
    <div className={styles.formHeader}>
      <h2 className={styles.formTitle}>New club save</h2>
      <p className={styles.formSub}>in {gameTitle}</p>
    </div>

    <div className={styles.formFields}>
      {/* Club name */}
      <div className={styles.field}>
        <label className={styles.label}>Club name *</label>
        <input
          autoFocus
          className={styles.input}
          placeholder="e.g. FC Richport"
          value={form.name}
          onChange={e => updateForm('name', e.target.value)}
        />
      </div>

      {/* Manager */}
      <div className={styles.field}>
        <label className={styles.label}>Manager</label>
        <input
          className={styles.input}
          placeholder="e.g. Luis Enrique"
          value={form.manager}
          onChange={e => updateForm('manager', e.target.value)}
        />
      </div>

      {/* League */}
      <div className={styles.field}>
        <label className={styles.label}>Starting league</label>
        <input
          className={styles.input}
          placeholder="e.g. Premier League"
          value={form.league}
          onChange={e => updateForm('league', e.target.value)}
        />
      </div>

      {/* Style + Formation row */}
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Style</label>
          <select
            className={styles.select}
            value={form.style}
            onChange={e => updateForm('style', e.target.value)}
          >
            <option value="">— select —</option>
            {MANAGER_STYLES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Formation</label>
          <select
            className={styles.select}
            value={form.formation}
            onChange={e => updateForm('formation', e.target.value)}
          >
            <option value="">— select —</option>
            {FORMATIONS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Crest color */}
      <div className={styles.field}>
        <label className={styles.label}>Crest color</label>
        <div className={styles.colorGrid}>
          {CREST_COLORS.map(color => (
            <button
              key={color}
              className={`${styles.colorSwatch} ${form.crestColor === color ? styles.swatchActive : ''}`}
              style={{ background: color }}
              onClick={() => updateForm('crestColor', color)}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>

    <div className={styles.formActions}>
      <button
        className="btn btn-primary"
        onClick={onSave}
        disabled={saving || !form.name.trim()}
      >
        {saving ? 'Saving...' : 'Create save'}
      </button>
      {onCancel && (
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  </div>
)

export default ClubSelector
