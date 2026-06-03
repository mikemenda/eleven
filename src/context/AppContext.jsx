import { createContext, useContext, useState, useEffect } from 'react'

const AppContext = createContext(null)

export const AppProvider = ({ children }) => {
  const [activeGame, setActiveGame] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eleven_activeGame')) } catch { return null }
  })
  const [activeClub, setActiveClub] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eleven_activeClub')) } catch { return null }
  })

  // Per-game active club persistence
  const [clubsByGame, setClubsByGame] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eleven_clubsByGame')) || {} } catch { return {} }
  })

  useEffect(() => {
    localStorage.setItem('eleven_activeGame', JSON.stringify(activeGame))
  }, [activeGame])

  useEffect(() => {
    localStorage.setItem('eleven_activeClub', JSON.stringify(activeClub))
    if (activeGame && activeClub) {
      setClubsByGame(prev => {
        const updated = { ...prev, [activeGame.id]: activeClub }
        localStorage.setItem('eleven_clubsByGame', JSON.stringify(updated))
        return updated
      })
    }
  }, [activeClub, activeGame])

  const selectGame = (game) => {
    setActiveGame(game)
    // Restore last used club for this game version
    const lastClub = clubsByGame[game.id] || null
    setActiveClub(lastClub)
  }

  const selectClub = (club) => {
    setActiveClub(club)
  }

  const clearContext = () => {
    setActiveGame(null)
    setActiveClub(null)
  }

  return (
    <AppContext.Provider value={{
      activeGame,
      activeClub,
      selectGame,
      selectClub,
      clearContext
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
