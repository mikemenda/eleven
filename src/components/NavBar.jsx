import { NavLink } from 'react-router-dom'
import styles from './NavBar.module.css'

const NAV_ITEMS = [
  {
    path: '/home',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 9.5L10 3L17 9.5V17H13V12H7V17H3V9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    path: '/seasons',
    label: 'Seasons',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 8H17" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 2V5M13 2V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    path: '/players',
    label: 'Players',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4 17C4 14 6.5 12 10 12C13.5 12 16 14 16 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    path: '/transfers',
    label: 'Transfers',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 6h12M4 6l3-3M4 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 14H4M16 14l-3-3M16 14l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    path: '/rivals',
    label: 'Rivals',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3L11.8 7.4L16.5 7.6L13 10.6L14.1 15.2L10 12.7L5.9 15.2L7 10.6L3.5 7.6L8.2 7.4L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    path: '/records',
    label: 'Records',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 16V10M8 16V6M11 16V8M14 16V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    path: '/museum',
    label: 'Museum',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 18H17M4 10H16V18H4V10ZM10 2L16 10H4L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 14V18M12 14V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    path: '/sporting-director',
    label: 'Director',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="13" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 17C2 14.5 4 13 7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M13 13C16 13 18 14.5 18 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M10 14V17M10 14L8 12M10 14L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

const NavBar = () => (
  <nav className={styles.nav} aria-label="Main navigation">
    {NAV_ITEMS.map(({ path, label, icon }) => (
      <NavLink
        key={path}
        to={path}
        className={({ isActive }) =>
          `${styles.item} ${isActive ? styles.active : ''}`
        }
      >
        <span className={styles.icon}>{icon}</span>
        <span className={styles.label}>{label}</span>
      </NavLink>
    ))}
  </nav>
)

export default NavBar
