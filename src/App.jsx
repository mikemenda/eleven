import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import NavBar from './components/NavBar'
import GameSelector from './pages/GameSelector'
import ClubSelector from './pages/ClubSelector'
import Home from './pages/Home'
import Seasons from './pages/Seasons'
import SeasonDetail from './pages/SeasonDetail'
import Players from './pages/Players'
import PlayerProfile from './pages/PlayerProfile'
import Transfers from './pages/Transfers'
import Records from './pages/Records'
import Rivals from './pages/Rivals'
import Museum from './pages/Museum'
import SportingDirector from './pages/SportingDirector'
import Login from './pages/Login'
import './styles/global.css'

const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{
      minHeight: '100dvh', background: 'var(--en-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 32, height: 32,
        border: '1.5px solid var(--en-rule)',
        borderTopColor: 'var(--en-blue)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!user) return <Login />
  return children
}

const InnerApp = () => (
  <Routes>
    <Route path="/"      element={<><Header /><GameSelector /></>} />
    <Route path="/clubs" element={<><Header /><ClubSelector /></>} />
    <Route path="/*"     element={
      <>
        <Header />
        <Routes>
          <Route path="/home"              element={<Home />} />
          <Route path="/seasons"           element={<Seasons />} />
          <Route path="/seasons/:id"       element={<SeasonDetail />} />
          <Route path="/players"           element={<Players />} />
          <Route path="/players/:id"       element={<PlayerProfile />} />
          <Route path="/transfers"         element={<Transfers />} />
          <Route path="/records"           element={<Records />} />
          <Route path="/rivals"            element={<Rivals />} />
          <Route path="/museum"            element={<Museum />} />
          <Route path="/sporting-director" element={<SportingDirector />} />
          <Route path="*"                  element={<Navigate to="/home" replace />} />
        </Routes>
        <NavBar />
      </>
    } />
  </Routes>
)

const App = () => (
  <BrowserRouter basename="/eleven">
    <AuthProvider>
      <RequireAuth>
        <AppProvider>
          <InnerApp />
        </AppProvider>
      </RequireAuth>
    </AuthProvider>
  </BrowserRouter>
)

export default App
