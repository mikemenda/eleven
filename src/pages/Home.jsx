import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import styles from './Home.module.css'

const Home = () => {
  const { activeGame, activeClub } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    if (!activeGame) navigate('/')
    else if (!activeClub) navigate('/clubs')
  }, [activeGame, activeClub])

  if (!activeGame || !activeClub) return null

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* Context banner */}
        <div className={styles.contextBanner}>
          <div className={styles.crestDot} style={{ background: activeClub.crestColor }} />
          <span className={styles.clubLabel}>{activeClub.name}</span>
          <span className={styles.sep}>·</span>
          <span className={styles.gameLabel}>{activeGame.title}</span>
        </div>

        <div className={styles.comingSoon}>
          <div className={styles.phase}>Phase 2</div>
          <h1 className={styles.title}>Home Dashboard</h1>
          <p className={styles.desc}>
            Season summary table, all-time records,<br/>trophy cabinet, and quick-add buttons.
          </p>
          <div className={styles.featureList}>
            {[
              'Season-by-season W/D/L table',
              'All-time record stat cards',
              'Trophy cabinet shelf',
              'Record highlights strip',
              '+ Log Match / + Log Season'
            ].map(f => (
              <div key={f} className={styles.featureItem}>
                <span className={styles.featureDot} />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
