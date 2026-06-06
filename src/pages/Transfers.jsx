import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransfers, getSeasons } from '../firebase/services'
import styles from './Transfers.module.css'

function fmt(n) {
  if (!n) return 'Free'
  if (n >= 1e9) return `€${(n/1e9).toFixed(2)}B`
  if (n >= 1e6) return `€${(n/1e6).toFixed(1)}M`
  return `€${(n/1e3).toFixed(0)}K`
}

const RULE_COLOR = {
  'Mandatory':        'var(--en-green)',
  'Forced-List':      'var(--danger)',
  'Emergency Credit': 'var(--en-gold)',
  'Optional':         'var(--en-text-3)',
  'Exchange':         '#a78bfa',
  'Swap':             '#60a5fa',
}

export default function Transfers() {
  const { activeClub } = useApp()
  const [transfers, setTransfers] = useState([])
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSeason, setSelectedSeason] = useState('all')
  const [dir, setDir] = useState('all') // all | IN | OUT

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([getTransfers(activeClub.id), getSeasons(activeClub.id)]).then(([t, s]) => {
      setTransfers(t)
      setSeasons(s)
      setLoading(false)
    })
  }, [activeClub])

  const filtered = transfers
    // Canonical filter key is `seasonId`. The `season` label is a legacy fallback
    // for transfer docs that pre-date the seasonId field being written on import.
    // TODO: backfill `seasonId` on all legacy transfer docs before Season 4 import,
    // then remove the `t.season === selectedSeason` fallback.
    .filter(t => selectedSeason === 'all' || t.seasonId === selectedSeason || t.season === selectedSeason)
    .filter(t => dir === 'all' || t.direction === dir)

  const ins  = filtered.filter(t => t.direction === 'IN')
  const outs = filtered.filter(t => t.direction === 'OUT')
  const totalIn  = ins.reduce((s, t) => s + (t.fee_eur || 0), 0)
  const totalOut = outs.reduce((s, t) => s + (t.fee_eur || 0), 0)
  const netSpend = totalIn - totalOut

  // Group by season + window
  const grouped = {}
  for (const t of filtered) {
    const key = `${t.season || '?'}__${t.window || '?'}`
    if (!grouped[key]) grouped[key] = { season: t.season, window: t.window, ins: [], outs: [] }
    if (t.direction === 'IN')  grouped[key].ins.push(t)
    if (t.direction === 'OUT') grouped[key].outs.push(t)
  }

  // Build season options. Canonical value is seasonId; display is the season label.
  // Legacy transfer docs with only `season` (no `seasonId`) are included via their label.
  const seasonOptions = (() => {
    const seen = new Set()
    const opts = []
    for (const t of transfers) {
      if (t.seasonId && !seen.has(t.seasonId)) {
        seen.add(t.seasonId)
        opts.push({ value: t.seasonId, label: t.season || t.seasonId })
      } else if (!t.seasonId && t.season && !seen.has(t.season)) {
        // Legacy: only a label string, no ID — use the label as both value and display
        seen.add(t.season)
        opts.push({ value: t.season, label: t.season })
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label))
  })()
    .sort((a, b) => a.localeCompare(b))

  return (
    <div className={styles.page}>
      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Transfer Record</span>
        <select className={styles.seasonPicker} value={selectedSeason}
          onChange={e => setSelectedSeason(e.target.value)}>
          <option value="all">All Seasons</option>
          {seasonOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      {/* ── NET SPEND SUMMARY ── */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryVal} style={{ color: 'var(--danger)' }}>
            {fmt(totalIn)}
          </span>
          <span className={styles.summaryKey}>Spent</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryVal} style={{ color: 'var(--en-green)' }}>
            {fmt(totalOut)}
          </span>
          <span className={styles.summaryKey}>Received</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryVal}
            style={{ color: netSpend > 0 ? 'var(--danger)' : 'var(--en-green)' }}>
            {netSpend > 0 ? `-${fmt(netSpend)}` : `+${fmt(Math.abs(netSpend))}`}
          </span>
          <span className={styles.summaryKey}>Net</span>
        </div>
      </div>

      {/* ── DIRECTION TABS ── */}
      <div className={styles.dirTabs}>
        {['all', 'IN', 'OUT'].map(d => (
          <button key={d} className={`${styles.dirTab} ${dir === d ? styles.dirActive : ''}`}
            onClick={() => setDir(d)}>
            {d === 'all' ? 'All' : d === 'IN' ? '▼ Arrivals' : '▲ Departures'}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🔄</span>
            <p className={styles.emptyText}>No transfers found</p>
          </div>
        ) : (
          Object.values(grouped).map((g, gi) => (
            <div key={gi} className={styles.windowGroup}>
              <div className={styles.windowHeader}>
                <span className={styles.windowSeason}>{g.season}</span>
                <span className={styles.windowName}>{g.window} Window</span>
                <div className={styles.windowNet}>
                  {(() => {
                    const i = g.ins.reduce((s, t) => s + (t.fee_eur || 0), 0)
                    const o = g.outs.reduce((s, t) => s + (t.fee_eur || 0), 0)
                    const n = i - o
                    return <span style={{ color: n > 0 ? 'var(--danger)' : 'var(--en-green)' }}>
                      {n >= 0 ? `-${fmt(n)}` : `+${fmt(Math.abs(n))}`} net
                    </span>
                  })()}
                </div>
              </div>
              {(dir === 'all' || dir === 'IN') && g.ins.map((t, i) => (
                <TransferRow key={`in-${i}`} t={t} />
              ))}
              {(dir === 'all' || dir === 'OUT') && g.outs.map((t, i) => (
                <TransferRow key={`out-${i}`} t={t} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TransferRow({ t }) {
  const isIn = t.direction === 'IN'
  return (
    <div className={styles.transferRow}>
      <div className={styles.transferArrow}
        style={{ color: isIn ? 'var(--en-green)' : 'var(--danger)' }}>
        {isIn ? '▼' : '▲'}
      </div>
      <div className={styles.transferInfo}>
        <div className={styles.transferName}>{t.player}</div>
        <div className={styles.transferMeta}>
          <span className={styles.transferPos}>{t.position}</span>
          <span className={styles.transferClubs}>
            {isIn ? t.from_club : t.to_club}
          </span>
          {t.rule && (
            <span className={styles.transferRule}
              style={{ color: RULE_COLOR[t.rule] || 'var(--en-text-3)' }}>
              {t.rule}
            </span>
          )}
        </div>
      </div>
      <div className={styles.transferFee}>{fmt(t.fee_eur)}</div>
    </div>
  )
}
