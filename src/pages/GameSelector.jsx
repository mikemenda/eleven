import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getGames, addGame } from '../firebase/services'
import styles from './GameSelector.module.css'

const DEFAULT_VERSIONS = [
  { title: 'FC 25', year: 25 },
  { title: 'FC 26', year: 26 },
  { title: 'FC 27', year: 27 },
  { title: 'FC 28', year: 28 },
]

const GameSelector = () => {
  const { selectGame, activeGame } = useApp()
  const navigate = useNavigate()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newVersion, setNewVersion] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    loadGames()
  }, [])

  const loadGames = async () => {
    try {
      const data = await getGames()
      setGames(data)
    } catch (err) {
      console.error('Error loading games:', err)
      setGames([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (game) => {
    selectGame(game)
    navigate('/clubs')
  }

  const handleAddVersion = async (title) => {
    if (!title.trim()) return
    setAdding(true)
    try {
      const ref = await addGame(title.trim())
      const newGame = { id: ref.id, title: title.trim() }
      setGames(prev => [...prev, newGame])
      setShowAddForm(false)
      setNewVersion('')
    } catch (err) {
      console.error('Error adding version:', err)
    } finally {
      setAdding(false)
    }
  }

  const displayGames = games.length > 0 ? games : DEFAULT_VERSIONS.map((v, i) => ({
    id: `default-${i}`,
    title: v.title,
    isDefault: true
  }))

  return (
    <div className={styles.page}>
      <div className={styles.pitchOverlay} />
      <div className={styles.radialGlow} />

      <div className={styles.inner}>
        {/* Selector — no brand lockup; header already shows XI eleven */}
        <div className={styles.selectorSection}>
          <div className={styles.sectionHeading}>
            <p className={styles.prompt}>Select version</p>
            <p className={styles.promptSub}>Choose the FC title tied to your career archive.</p>
          </div>

          {loading ? (
            <div className={styles.skeletons}>
              {[0,1,2].map(i => (
                <div key={i} className={`${styles.skeletonCard} loading-shimmer`} />
              ))}
            </div>
          ) : (
            <div className={styles.grid}>
              {displayGames.map((game, idx) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isActive={activeGame?.id === game.id}
                  index={idx}
                  onSelect={handleSelect}
                />
              ))}

              {/* Add version card */}
              {!showAddForm ? (
                <button
                  className={`${styles.card} ${styles.addCard}`}
                  onClick={() => setShowAddForm(true)}
                  style={{ animationDelay: `${displayGames.length * 60}ms` }}
                >
                  <span className={styles.addIcon}>+</span>
                  <span className={styles.addLabel}>Add version</span>
                </button>
              ) : (
                <div className={`${styles.card} ${styles.addFormCard}`}>
                  <input
                    autoFocus
                    className={styles.addInput}
                    placeholder="e.g. FC 29"
                    value={newVersion}
                    onChange={e => setNewVersion(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddVersion(newVersion)
                      if (e.key === 'Escape') setShowAddForm(false)
                    }}
                  />
                  <div className={styles.addFormActions}>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleAddVersion(newVersion)}
                      disabled={adding || !newVersion.trim()}
                      style={{ padding: '7px 14px', fontSize: 12 }}
                    >
                      {adding ? '...' : 'Add'}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => { setShowAddForm(false); setNewVersion('') }}
                      style={{ padding: '7px 14px', fontSize: 12 }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {games.length === 0 && !loading && (
          <p className={styles.setupHint}>
            Connect Firebase in <code>src/firebase/config.js</code> to persist data
          </p>
        )}
      </div>
    </div>
  )
}

const GameCard = ({ game, isActive, index, onSelect }) => (
  <button
    className={`${styles.card} ${isActive ? styles.activeCard : ''}`}
    onClick={() => onSelect(game)}
    style={{ animationDelay: `${index * 60}ms` }}
  >
    {isActive && <div className={styles.activePip} />}

    <div className={styles.cardInner}>
      <div className={styles.versionBadge}>
        {game.title}
      </div>

      {game.clubCount > 0 && (
        <div className={styles.cardMeta}>
          <span>{game.clubCount} save{game.clubCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {game.isDefault && (
        <div className={styles.defaultNote}>Not started</div>
      )}
    </div>

    {isActive && (
      <div className={styles.activeIndicator}>
        {/* Gold ring indicator */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="#D4AF37" strokeWidth="1.5" />
          <circle cx="6" cy="6" r="2.5" fill="#D4AF37" />
        </svg>
      </div>
    )}
  </button>
)

export default GameSelector
