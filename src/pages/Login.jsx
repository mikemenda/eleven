import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import styles from './Login.module.css'

const Login = () => {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError('Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pitchOverlay} />
      <div className={styles.radialGlow} />

      <div className={styles.inner}>
        {/* Brand */}
        <div className={styles.brand}>
          <Logo size={72} />
          <div className={styles.wordmark}>
            <span className={styles.xi}>XI</span>
            <span className={styles.eleven}>eleven</span>
          </div>
          <p className={styles.tagline}>FC Career Mode Companion</p>
        </div>

        {/* Sign in card */}
        <div className={styles.card}>
          <p className={styles.prompt}>Sign in to access your saves</p>

          <button
            className={styles.googleBtn}
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              <GoogleIcon />
            )}
            <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
          </button>

          {error && (
            <p className={styles.error}>{error}</p>
          )}

          <p className={styles.note}>
            Your data is private and only accessible when signed in with your Google account.
          </p>
        </div>
      </div>
    </div>
  )
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

export default Login
