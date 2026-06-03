import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import GameSelector from './pages/GameSelector'
import ClubSelector from './pages/ClubSelector'
import Home from './pages/Home'
import Login from './pages/Login'
import './styles/global.css'

// Gate — only renders children if signed in, otherwise shows Login
const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        width: 32, height: 32,
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!user) return <Login />
  return children
}

const AppRoutes = () => (
  <>
    <Header />
    <Routes>
      <Route path="/" element={<GameSelector />} />
      <Route path="/clubs" element={<ClubSelector />} />
      <Route path="/home" element={<Home />} />
      <Route path="/seasons" element={<PlaceholderPage title="Seasons" phase={2} />} />
      <Route path="/seasons/:id" element={<PlaceholderPage title="Season Detail" phase={2} />} />
      <Route path="/players" element={<PlaceholderPage title="Players" phase={3} />} />
      <Route path="/players/:id" element={<PlaceholderPage title="Player Profile" phase={3} />} />
      <Route path="/rivals" element={<PlaceholderPage title="Rivals" phase={4} />} />
      <Route path="/records" element={<PlaceholderPage title="Records" phase={4} />} />
      <Route path="/log-match" element={<PlaceholderPage title="Log Match" phase={5} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>
)

const PlaceholderPage = ({ title, phase }) => (
  <div style={{
    minHeight: 'calc(100vh - 56px)',
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 20
  }}>
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7 }}>
        Phase {phase}
      </span>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>
        {title}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Coming in Phase {phase} of the build.
      </p>
    </div>
  </div>
)

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <RequireAuth>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </RequireAuth>
    </AuthProvider>
  </BrowserRouter>
)

export default App
