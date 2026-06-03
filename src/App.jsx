import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import NavBar from './components/NavBar'
import GameSelector from './pages/GameSelector'
import ClubSelector from './pages/ClubSelector'
import Home from './pages/Home'
import Login from './pages/Login'
import './styles/global.css'

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

// Selector screens — no NavBar
const SelectorRoutes = () => (
  <>
    <Header />
    <Routes>
      <Route path="/"      element={<GameSelector />} />
      <Route path="/clubs" element={<ClubSelector />} />
    </Routes>
  </>
)

// Inner app — Header + NavBar on every screen
const AppRoutes = () => (
  <>
    <Header />
    <Routes>
      <Route path="/home"          element={<Home />} />
      <Route path="/seasons"       element={<PlaceholderPage title="Seasons"        phase={3} />} />
      <Route path="/seasons/:id"   element={<PlaceholderPage title="Season Detail"  phase={3} />} />
      <Route path="/players"       element={<PlaceholderPage title="Players"        phase={4} />} />
      <Route path="/players/:id"   element={<PlaceholderPage title="Player Profile" phase={4} />} />
      <Route path="/rivals"        element={<PlaceholderPage title="Rivals"         phase={5} />} />
      <Route path="/records"       element={<PlaceholderPage title="Records"        phase={5} />} />
      <Route path="/log-match"     element={<PlaceholderPage title="Log Match"      phase={6} />} />
      <Route path="*"              element={<Navigate to="/home" replace />} />
    </Routes>
    <NavBar />
  </>
)

const Shell = () => {
  const { user } = useAuth()
  if (!user) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"      element={<SelectorRoutes />} />
        <Route path="/clubs" element={<SelectorRoutes />} />
        <Route path="/*"     element={<AppRoutes />} />
      </Routes>
    </BrowserRouter>
  )
}

const PlaceholderPage = ({ title, phase }) => (
  <div style={{
    minHeight: 'calc(100vh - 56px)',
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 20,
    paddingBottom: 'calc(60px + 20px)'
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
          <InnerApp />
        </AppProvider>
      </RequireAuth>
    </AuthProvider>
  </BrowserRouter>
)

const InnerApp = () => (
  <Routes>
    <Route path="/"      element={<><Header /><GameSelector /></>} />
    <Route path="/clubs" element={<><Header /><ClubSelector /></>} />
    <Route path="/*"     element={
      <>
        <Header />
        <Routes>
          <Route path="/home"        element={<Home />} />
          <Route path="/seasons"     element={<PlaceholderPage title="Seasons"        phase={3} />} />
          <Route path="/seasons/:id" element={<PlaceholderPage title="Season Detail"  phase={3} />} />
          <Route path="/players"     element={<PlaceholderPage title="Players"        phase={4} />} />
          <Route path="/players/:id" element={<PlaceholderPage title="Player Profile" phase={4} />} />
          <Route path="/rivals"      element={<PlaceholderPage title="Rivals"         phase={5} />} />
          <Route path="/records"     element={<PlaceholderPage title="Records"        phase={5} />} />
          <Route path="/log-match"   element={<PlaceholderPage title="Log Match"      phase={6} />} />
          <Route path="*"            element={<Navigate to="/home" replace />} />
        </Routes>
        <NavBar />
      </>
    } />
  </Routes>
)

export default App
