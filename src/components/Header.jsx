import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Logo from './Logo'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import styles from './Header.module.css'

const Header = () => {
  const { activeGame, activeClub } = useApp()
  const { user, signOutUser } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleVersionBadge = () => navigate('/')
  const handleClubBadge = () => { if (activeGame) navigate('/clubs') }

  const handleSignOut = async () => {
    setShowUserMenu(false)
    await signOutUser()
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Logo size={32} showWordmark className={styles.logo} />
      </div>

      <div className={styles.context}>
        {activeGame && (
          <button className={styles.badge} onClick={handleVersionBadge} title="Switch FC version">
            <span className={styles.badgeLabel}>{activeGame.title}</span>
          </button>
        )}
        {activeGame && activeClub && (
          <>
            <span className={styles.divider}>/</span>
            <button
              className={`${styles.badge} ${styles.clubBadge}`}
              onClick={handleClubBadge}
              title="Switch club"
            >
              {activeClub.crestColor && (
                <span className={styles.crestDot} style={{ background: activeClub.crestColor }} />
              )}
              <span className={styles.badgeLabel}>{activeClub.name}</span>
            </button>
          </>
        )}
      </div>

      {/* User avatar + sign out */}
      {user && (
        <div className={styles.userArea}>
          <button
            className={styles.avatar}
            onClick={() => setShowUserMenu(v => !v)}
            title={user.displayName || user.email}
          >
            {user.photoURL
              ? <img src={user.photoURL} alt="" className={styles.avatarImg} referrerPolicy="no-referrer" />
              : <span className={styles.avatarInitial}>{(user.displayName || user.email || '?')[0].toUpperCase()}</span>
            }
          </button>

          {showUserMenu && (
            <>
              <div className={styles.menuOverlay} onClick={() => setShowUserMenu(false)} />
              <div className={styles.userMenu}>
                <div className={styles.menuName}>{user.displayName || user.email}</div>
                <div className={styles.menuDivider} />
                <button className={styles.menuItem} onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  )
}

export default Header
