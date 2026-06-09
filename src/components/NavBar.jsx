import { useState } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import styles from './NavBar.module.css'

// ─── UCL STARBALL ICON ────────────────────────────────────────────────────────
// Simplified starball: outer circle + 8-pointed star (4 diamond points rotated)
// visually matches the UEFA Champions League ball reference image.
// Implemented as filled star + circle stroke — legible at 20px.
const UCLIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    {/* Outer circle */}
    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.35"/>
    {/* 8-pointed star — two overlapping rotated squares, filled */}
    <path
      d="M10 2.5 L11.3 8.7 L17.5 10 L11.3 11.3 L10 17.5 L8.7 11.3 L2.5 10 L8.7 8.7 Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
)

// ─── PRIMARY NAV (4 items + hamburger) ───────────────────────────────────────
const PRIMARY_NAV = [
  {
    path: '/home',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 9.5L10 3L17 9.5V17H13V12H7V17H3V9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    path: '/ucl',
    label: 'UCL',
    icon: <UCLIcon />,
  },
  {
    path: '/seasons',
    label: 'Seasons',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 8H17" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 2V5M13 2V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    path: '/records',
    label: 'Records',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5 16V10M8 16V6M11 16V8M14 16V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
]

// Sheet nav paths — used to determine if hamburger should be gold
const SHEET_PATHS = ['/players', '/transfers', '/history', '/museum']

const SHEET_NAV = [
  {
    path: '/players',
    label: 'Players',
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4 17C4 14 6.5 12 10 12C13.5 12 16 14 16 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    path: '/transfers',
    label: 'Transfers',
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 6h12M4 6l3-3M4 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 14H4M16 14l-3-3M16 14l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    path: '/history',
    label: 'History',
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M7 3h6l1 2H6L7 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        <path d="M6 5c0 0-2 0-2 2s2 4 6 4 6-2 6-4-2-2-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M4 7c-1 0-1.5 1-1.5 1.5S3 10 4 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M16 7c1 0 1.5 1 1.5 1.5S17 10 16 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M8 11v2M12 11v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <rect x="6.5" y="13" width="7" height="2" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <line x1="5" y1="17" x2="15" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    path: '/museum',
    label: 'Museum',
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 18H17M4 10H16V18H4V10ZM10 2L16 10H4L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 14V18M12 14V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
]

const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

// ─── ACTIVE STATE HELPERS ─────────────────────────────────────────────────────
// NavLink's isActive only matches exactly. For nested routes like /seasons/:id
// and /ucl/*, we need prefix matching. We use useMatch at component level.
//
// HamburgerButton receives a prop so we can calculate sheet-route active state
// inside the parent component where all hooks must be called.

const NavBar = () => {
  const [sheetOpen, setSheetOpen] = useState(false)

  // Prefix matches for routes that have children
  const onSeasons = useMatch('/seasons/*')
  const onUCL     = useMatch('/ucl/*')

  // Sheet route active — any sheet path is current
  const onPlayers   = useMatch('/players/*')
  const onTransfers = useMatch('/transfers')
  const onHistory   = useMatch('/history')
  const onMuseum    = useMatch('/museum')
  const isSheetRouteActive = !!(onPlayers || onTransfers || onHistory || onMuseum)

  const closeSheet  = () => setSheetOpen(false)
  const toggleSheet = () => setSheetOpen(prev => !prev)

  return (
    <>
      {sheetOpen && (
        <div className={styles.backdrop} onClick={closeSheet} aria-hidden="true" />
      )}

      {/* Bottom Sheet */}
      <div
        className={`${styles.sheet} ${sheetOpen ? styles.sheetOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation options"
      >
        <div className={styles.sheetHandle} />
        <nav className={styles.sheetNav}>
          {SHEET_NAV.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `${styles.sheetItem} ${isActive ? styles.sheetItemActive : ''}`
              }
              onClick={closeSheet}
            >
              <span className={styles.sheetItemIcon}>{icon}</span>
              <span className={styles.sheetItemLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Primary NavBar */}
      <nav className={styles.nav} aria-label="Main navigation">
        {PRIMARY_NAV.map(({ path, label, icon }) => {
          // For /seasons and /ucl use prefix match so detail pages keep highlight
          const forceActive =
            (path === '/seasons' && !!onSeasons) ||
            (path === '/ucl'     && !!onUCL)

          return (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `${styles.item} ${(isActive || forceActive) ? styles.active : ''}`
              }
            >
              <span className={styles.icon}>{icon}</span>
              <span className={styles.label}>{label}</span>
            </NavLink>
          )
        })}

        {/* Hamburger — gold when any sheet route is active */}
        <button
          className={`${styles.item} ${styles.hamburgerBtn} ${(isSheetRouteActive || sheetOpen) ? styles.active : ''}`}
          onClick={toggleSheet}
          aria-label="More pages"
          aria-expanded={sheetOpen}
        >
          <span className={styles.icon}><HamburgerIcon /></span>
          <span className={styles.label}>More</span>
        </button>
      </nav>
    </>
  )
}

export default NavBar
