import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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

// Sort season labels newest-first: S7 > S6 > ... > S1
function compareSeasonLabels(a, b) {
  const num = s => { const m = s.match(/^S(\d+)$/); return m ? parseInt(m[1], 10) : 0 }
  return num(b) - num(a)
}

// Window sort: Summer before January within a season
const WINDOW_ORDER = { Summer: 0, January: 1 }

export default function Transfers() {
  const { activeClub } = useApp()
  const [transfers, setTransfers] = useState([])
  const [seasons, setSeasons]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [selectedSeason, setSelectedSeason] = useState('all')
  const [dir, setDir] = useState('all') // all | IN | OUT

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([getTransfers(activeClub.id), getSeasons(activeClub.id)])
      .then(([t, s]) => {
        setTransfers(t)
        setSeasons(s)
      })
      .catch(err => console.error('[Transfers] load error:', err))
      .finally(() => setLoading(false))
  }, [activeClub])

  // Build seasonId → label lookup from seasons collection
  const seasonLabelById = Object.fromEntries(seasons.map(s => [s.id, s.label]))

  // Resolve the display label for a transfer doc.
  // Priority: snapshot on doc → seasons collection lookup → raw ID (last resort)
  const resolveLabel = t =>
    t.season ||
    (t.seasonId && seasonLabelById[t.seasonId]) ||
    t.seasonId ||
    '?'

  // Filter — canonical key is seasonId; season label fallback for legacy docs
  const filtered = transfers
    .filter(t =>
      selectedSeason === 'all' ||
      t.seasonId === selectedSeason ||
      t.season === selectedSeason
    )
    .filter(t => dir === 'all' || t.direction === dir)

  const ins      = filtered.filter(t => t.direction === 'IN')
  const outs     = filtered.filter(t => t.direction === 'OUT')
  const totalIn  = ins.reduce((s, t)  => s + (t.fee_eur || 0), 0)
  const totalOut = outs.reduce((s, t) => s + (t.fee_eur || 0), 0)
  const netSpend = totalIn - totalOut

  // Group by season + window
  const grouped = {}
  for (const t of filtered) {
    const displayLabel = resolveLabel(t)
    const key = `${displayLabel}__${t.window || '?'}`
    if (!grouped[key]) grouped[key] = { season: displayLabel, window: t.window || '?', ins: [], outs: [] }
    if (t.direction === 'IN')  grouped[key].ins.push(t)
    if (t.direction === 'OUT') grouped[key].outs.push(t)
  }

  // Sort groups: newest season first, Summer before January within each season
  const sortedGroups = Object.values(grouped).sort((a, b) => {
    const seasonDiff = compareSeasonLabels(a.season, b.season)
    if (seasonDiff !== 0) return seasonDiff
    return (WINDOW_ORDER[a.window] ?? 99) - (WINDOW_ORDER[b.window] ?? 99)
  })

  // Build season filter options — never shows raw Firestore IDs
  const seasonOptions = (() => {
    const seen = new Set()
    const opts = []
    for (const t of transfers) {
      if (t.seasonId && !seen.has(t.seasonId)) {
        seen.add(t.seasonId)
        const label = t.season || seasonLabelById[t.seasonId] || 'S?'
        opts.push({ value: t.seasonId, label })
      } else if (!t.seasonId && t.season && !seen.has(t.season)) {
        seen.add(t.season)
        opts.push({ value: t.season, label: t.season })
      }
    }
    return opts.sort((a, b) => compareSeasonLabels(a.label, b.label))
  })()

  // Summary bar: labels and values change based on active direction tab
  const summaryConfig = {
    all: [
      { val: fmt(totalIn),  color: 'var(--danger)',    key: 'Spent' },
      { val: fmt(totalOut), color: 'var(--en-green)',  key: 'Received' },
      {
        val: netSpend > 0 ? `-${fmt(netSpend)}` : netSpend < 0 ? `+${fmt(Math.abs(netSpend))}` : '—',
        color: netSpend > 0 ? 'var(--danger)' : netSpend < 0 ? 'var(--en-green)' : 'var(--en-text-3)',
        key: netSpend > 0 ? 'Net spend' : netSpend < 0 ? 'Net profit' : 'Net',
      },
    ],
    IN: [
      { val: fmt(totalIn),                                              color: 'var(--danger)',    key: 'Spent' },
      { val: String(ins.length),                                        color: 'var(--en-text-1)', key: 'Arrivals' },
      { val: ins.length ? fmt(Math.round(totalIn / ins.length)) : '—', color: 'var(--en-gold)',   key: 'Avg fee' },
    ],
    OUT: [
      { val: fmt(totalOut),                                               color: 'var(--en-green)',  key: 'Received' },
      { val: String(outs.length),                                         color: 'var(--en-text-1)', key: 'Departures' },
      { val: outs.length ? fmt(Math.round(totalOut / outs.length)) : '—', color: 'var(--en-gold)',   key: 'Avg fee' },
    ],
  }
  const summaryItems = summaryConfig[dir]

  return (
    <div className={styles.page}>
      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Transfer Record</span>
        <select
          className={styles.seasonPicker}
          value={selectedSeason}
          onChange={e => setSelectedSeason(e.target.value)}
        >
          <option value="all">All Seasons</option>
          {seasonOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── SUMMARY BAR ── */}
      <div className={styles.summaryBar}>
        {summaryItems.map((item, i) => (
          <div key={i} className={styles.summaryItem}>
            <span className={styles.summaryVal} style={{ color: item.color }}>{item.val}</span>
            <span className={styles.summaryKey}>{item.key}</span>
          </div>
        ))}
      </div>

      {/* ── DIRECTION TABS ── */}
      <div className={styles.dirTabs}>
        {['all', 'IN', 'OUT'].map(d => (
          <button
            key={d}
            className={`${styles.dirTab} ${dir === d ? styles.dirActive : ''}`}
            onClick={() => setDir(d)}
          >
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
          sortedGroups.map((g, gi) => (
            <div key={gi} className={styles.windowGroup}>
              <div className={styles.windowHeader}>
                <span className={styles.windowSeason}>{g.season}</span>
                <span className={styles.windowName}>{g.window} Window</span>
                <div className={styles.windowNet}>
                  {(() => {
                    const i = g.ins.reduce((s, t)  => s + (t.fee_eur || 0), 0)
                    const o = g.outs.reduce((s, t) => s + (t.fee_eur || 0), 0)
                    const n = i - o
                    if (n === 0) return <span style={{ color: 'var(--en-text-3)' }}>— net</span>
                    return (
                      <span style={{ color: n > 0 ? 'var(--danger)' : 'var(--en-green)' }}>
                        {n > 0 ? `-${fmt(n)}` : `+${fmt(Math.abs(n))}`} net
                      </span>
                    )
                  })()}
                </div>
              </div>
              {(dir === 'all' || dir === 'IN')  && g.ins.map((t, i)  => <TransferRow key={`in-${i}`}  t={t} />)}
              {(dir === 'all' || dir === 'OUT') && g.outs.map((t, i) => <TransferRow key={`out-${i}`} t={t} />)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TransferRow({ t }) {
  const navigate = useNavigate()
  const isIn       = t.direction === 'IN'
  const isLinkable = !!t.playerId

  const handleClick = () => {
    if (isLinkable) navigate(`/players/${t.playerId}`)
  }

  return (
    <div
      className={styles.transferRow}
      onClick={isLinkable ? handleClick : undefined}
      style={{ cursor: isLinkable ? 'pointer' : 'default' }}
    >
      <div
        className={styles.transferArrow}
        style={{ color: isIn ? 'var(--en-green)' : 'var(--danger)' }}
      >
        {isIn ? '▼' : '▲'}
      </div>
      <div className={styles.transferInfo}>
        <div className={styles.transferName}>{t.player}</div>
        <div className={styles.transferMeta}>
          {t.position && <span className={styles.transferPos}>{t.position}</span>}
          {(isIn ? t.from_club : t.to_club) && (
            <span className={styles.transferClubs}>{isIn ? t.from_club : t.to_club}</span>
          )}
          {t.rule && (
            <span
              className={styles.transferRule}
              style={{ color: RULE_COLOR[t.rule] || 'var(--en-text-3)' }}
            >
              {t.rule}
            </span>
          )}
        </div>
      </div>
      <div className={styles.transferFee}>{fmt(t.fee_eur)}</div>
    </div>
  )
}
