import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getPlayers, getSeasons, getTransfers } from '../firebase/services'
import styles from './SportingDirector.module.css'

const POS_GROUP = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', CF: 'ATT', ST: 'ATT'
}
const GROUPS = ['GK', 'DEF', 'MID', 'ATT']

function fmtFee(n) {
  if (!n) return 'Free'
  if (n >= 1e9) return `€${(n/1e9).toFixed(2)}B`
  if (n >= 1e6) return `€${(n/1e6).toFixed(1)}M`
  return `€${(n/1e3).toFixed(0)}K`
}

export default function SportingDirector() {
  const { activeClub } = useApp()
  const [players, setPlayers] = useState([])
  const [seasons, setSeasons] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('squad') // squad | spend | history

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getPlayers(activeClub.id),
      getSeasons(activeClub.id),
      getTransfers(activeClub.id),
    ]).then(([p, s, t]) => {
      setPlayers(p)
      setSeasons(s)
      setTransfers(t)
      setLoading(false)
    })
  }, [activeClub])

  const active = players.filter(p => p.status === 'Active')
  const byGroup = {}
  for (const g of GROUPS) {
    byGroup[g] = active.filter(p => (POS_GROUP[p.position] || 'MID') === g)
  }

  // Transfer spend per season
  const seasonSpend = seasons.map(s => {
    const ts = transfers.filter(t => t.season === s.label || t.seasonId === s.id)
    const spent = ts.filter(t => t.direction === 'IN').reduce((acc, t) => acc + (t.fee_eur || 0), 0)
    const recvd = ts.filter(t => t.direction === 'OUT').reduce((acc, t) => acc + (t.fee_eur || 0), 0)
    return { label: s.label, year: s.year, spent, recvd, net: spent - recvd }
  }).reverse()

  const totalSpent = transfers.filter(t => t.direction === 'IN').reduce((a, t) => a + (t.fee_eur || 0), 0)
  const totalRecvd = transfers.filter(t => t.direction === 'OUT').reduce((a, t) => a + (t.fee_eur || 0), 0)

  // Longest serving active players
  const longestServing = [...active]
    .sort((a, b) => (b.apps || 0) - (a.apps || 0))
    .slice(0, 5)

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Sporting Director</span>
      </div>

      {/* ── SQUAD OVERVIEW STRIP ── */}
      <div className={styles.squadStrip}>
        <div className={styles.stripItem}>
          <span className={styles.stripVal}>{active.length}</span>
          <span className={styles.stripKey}>Active</span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripVal}>{players.filter(p => p.status === 'Sold').length}</span>
          <span className={styles.stripKey}>Sold</span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripVal}>{players.filter(p => p.status === 'Loaned').length}</span>
          <span className={styles.stripKey}>Loaned</span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripVal}>{transfers.filter(t => t.direction === 'IN').length}</span>
          <span className={styles.stripKey}>Signings</span>
        </div>
      </div>

      <div className={styles.tabs}>
        {['squad', 'spend', 'history'].map(t => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}>
            {t === 'squad' ? 'Squad Depth' : t === 'spend' ? 'Net Spend' : 'Key Players'}
          </button>
        ))}
      </div>

      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : tab === 'squad' ? (
          <SquadDepth byGroup={byGroup} />
        ) : tab === 'spend' ? (
          <SpendHistory seasons={seasonSpend} total={{ spent: totalSpent, recvd: totalRecvd }} />
        ) : (
          <KeyPlayers players={longestServing} />
        )}
      </div>
    </div>
  )
}

function SquadDepth({ byGroup }) {
  const GROUP_COLOR = {
    GK:  '#f59e0b', DEF: '#3b82f6', MID: '#8b5cf6', ATT: 'var(--en-green)'
  }
  return (
    <div className={styles.squadDepth}>
      {GROUPS.map(g => (
        <div key={g} className={styles.posGroup}>
          <div className={styles.posGroupHeader}>
            <span className={styles.posGroupLabel} style={{ color: GROUP_COLOR[g] }}>{g}</span>
            <span className={styles.posGroupCount}>{byGroup[g].length}</span>
          </div>
          {byGroup[g].length === 0 ? (
            <div className={styles.posGroupEmpty}>No active players</div>
          ) : (
            byGroup[g].map(p => (
              <div key={p.id} className={styles.posPlayer}>
                <span className={styles.posPlayerPos}>{p.position}</span>
                <span className={styles.posPlayerName}>{p.name}</span>
                <span className={styles.posPlayerApps}>{p.apps || 0} apps</span>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

function SpendHistory({ seasons, total }) {
  const maxNet = Math.max(...seasons.map(s => Math.abs(s.net)), 1)
  return (
    <div className={styles.spendHistory}>
      {/* Totals */}
      <div className={styles.spendTotals}>
        <div className={styles.spendTotal}>
          <span className={styles.spendTotalVal} style={{ color: 'var(--danger)' }}>
            {fmtFee(total.spent)}
          </span>
          <span className={styles.spendTotalKey}>Total Spent</span>
        </div>
        <div className={styles.spendTotal}>
          <span className={styles.spendTotalVal} style={{ color: 'var(--en-green)' }}>
            {fmtFee(total.recvd)}
          </span>
          <span className={styles.spendTotalKey}>Total Received</span>
        </div>
        <div className={styles.spendTotal}>
          <span className={styles.spendTotalVal}
            style={{ color: (total.spent - total.recvd) > 0 ? 'var(--danger)' : 'var(--en-green)' }}>
            {fmtFee(Math.abs(total.spent - total.recvd))}
          </span>
          <span className={styles.spendTotalKey}>Net</span>
        </div>
      </div>

      {/* Per-season bars */}
      {seasons.map((s, i) => (
        <div key={i} className={styles.spendRow}>
          <span className={styles.spendSeason}>{s.label}</span>
          <div className={styles.spendBars}>
            <div className={styles.spendBarOut}
              style={{ width: `${(s.spent / (maxNet || 1)) * 100}%` }} />
            <div className={styles.spendBarIn}
              style={{ width: `${(s.recvd / (maxNet || 1)) * 100}%` }} />
          </div>
          <span className={styles.spendNet}
            style={{ color: s.net > 0 ? 'var(--danger)' : 'var(--en-green)' }}>
            {s.net >= 0 ? `-${fmtFee(s.net)}` : `+${fmtFee(Math.abs(s.net))}`}
          </span>
        </div>
      ))}
    </div>
  )
}

function KeyPlayers({ players }) {
  return (
    <div className={styles.keyPlayers}>
      <div className={styles.keyLabel}>Longest-Serving Active Players</div>
      {players.map((p, i) => (
        <div key={p.id} className={styles.keyPlayer}>
          <span className={styles.keyRank}>{i + 1}</span>
          <div className={styles.keyInfo}>
            <span className={styles.keyName}>{p.name}</span>
            <span className={styles.keyPos}>{p.position}</span>
          </div>
          <div className={styles.keyStats}>
            <span className={styles.keyStat}>{p.apps || 0} apps</span>
            <span className={styles.keyStat}>{p.goals || 0}G</span>
            <span className={styles.keyStat}>{p.assists || 0}A</span>
          </div>
        </div>
      ))}
    </div>
  )
}
