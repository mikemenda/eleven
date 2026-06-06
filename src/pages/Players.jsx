import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlayers } from '../firebase/services'
import styles from './Players.module.css'

const POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']
const POS_GROUP = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', CF: 'ATT', ST: 'ATT'
}
const STATUS_META = {
  Active: { label: 'Active', color: 'var(--en-green)' },
  Sold:   { label: 'Sold',   color: 'var(--en-text-3)' },
  Loaned: { label: 'Loan',   color: 'var(--en-gold)' },
}

const posSort = p => {
  const i = POS_ORDER.indexOf(p.position)
  return i === -1 ? 99 : i
}

function Silhouette() {
  return (
    <div className={styles.silhouette}>
      <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" width="44" height="44">
        <circle cx="22" cy="15" r="7" fill="currentColor" opacity="0.35"/>
        <path d="M6 40c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="currentColor" opacity="0.25"/>
      </svg>
    </div>
  )
}

function SofifaImg({ sofifaId, name }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette />
  return (
    <img
      src={`https://fifa-img.michaelmenda92.workers.dev/${sofifaId}`}
      alt={name}
      className={styles.playerImg}
      onError={() => setErr(true)}
    />
  )
}

const SORT_OPTIONS = [
  { key: 'pos', label: 'Position' },
  { key: 'apps', label: 'Apps' },
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
]

export default function Players() {
  const { activeClub } = useApp()
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All') // All / Active / Sold / Loaned
  const [sort, setSort] = useState('pos')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    getPlayers(activeClub.id).then(p => { setPlayers(p); setLoading(false) })
  }, [activeClub])

  const filtered = players
    .filter(p => filter === 'All' || p.status === filter)
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'pos')     return posSort(a) - posSort(b)
      if (sort === 'apps')    return (b.apps || 0) - (a.apps || 0)
      if (sort === 'goals')   return (b.goals || 0) - (a.goals || 0)
      if (sort === 'assists') return (b.assists || 0) - (a.assists || 0)
      return 0
    })

  const counts = {
    All:    players.length,
    Active: players.filter(p => p.status === 'Active').length,
    Sold:   players.filter(p => p.status === 'Sold').length,
    Loaned: players.filter(p => p.status === 'Loaned').length,
  }

  return (
    <div className={styles.page}>
      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <div className={styles.topTitle}>
          <span className={styles.topLabel}>Squad</span>
          <span className={styles.topCount}>{players.length} players</span>
        </div>
        <div className={styles.searchWrap}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className={styles.searchIcon}>
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.search}
            placeholder="Search player…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className={styles.filterBar}>
        {['All', 'Active', 'Sold', 'Loaned'].map(f => (
          <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}>
            {f} <span className={styles.filterCount}>{counts[f]}</span>
          </button>
        ))}
        <div className={styles.sortSep} />
        {SORT_OPTIONS.map(s => (
          <button key={s.key} className={`${styles.sortBtn} ${sort === s.key ? styles.sortActive : ''}`}
            onClick={() => setSort(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>👤</span>
            <p className={styles.emptyText}>No players found</p>
            <p className={styles.emptyHint}>Import via CSV or add players manually</p>
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map(p => (
              <button key={p.id} className={styles.playerRow} onClick={() => navigate(`/players/${p.id}`)}>
                <div className={styles.playerThumb}>
                  <SofifaImg sofifaId={p.sofifaId} name={p.name} />
                </div>
                <div className={styles.playerInfo}>
                  <div className={styles.playerName}>{p.name}</div>
                  <div className={styles.playerMeta}>
                    <span className={styles.playerPos}>{p.position}</span>
                    {p.nationality && <span className={styles.playerNat}>{p.nationality}</span>}
                    {p.status && p.status !== 'Active' && (
                      <span className={styles.statusBadge}
                        style={{ color: STATUS_META[p.status]?.color }}>
                        {STATUS_META[p.status]?.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.playerStats}>
                  <div className={styles.statPill}>
                    <span className={styles.statVal}>{p.apps || 0}</span>
                    <span className={styles.statKey}>Apps</span>
                  </div>
                  <div className={styles.statPill}>
                    <span className={styles.statVal}>{p.goals || 0}</span>
                    <span className={styles.statKey}>G</span>
                  </div>
                  <div className={styles.statPill}>
                    <span className={styles.statVal}>{p.assists || 0}</span>
                    <span className={styles.statKey}>A</span>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className={styles.chevron}>
                  <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
