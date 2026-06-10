import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getTransfers, getSeasons, getPlayers } from '../firebase/services'
import TRANSFER_CLUBS from '../../data/transfer-clubs.json'
import styles from './Transfers.module.css'

function fmt(n) {
  if (!n) return 'Free'
  if (n >= 1e9) return `€${(n/1e9).toFixed(2)}B`
  if (n >= 1e6) return `€${(n/1e6).toFixed(1)}M`
  return `€${(n/1e3).toFixed(0)}K`
}

// Compact dot indicator config — no full labels in main row
// dot: CSS color string, or null for no dot
const RULE_DOT = {
  'Mandatory':        '#8899aa',       // slate — neutral
  'Optional':         '#8899aa',       // slate — neutral
  'Exchange':         '#9d85d4',       // restrained purple
  'Emergency Credit': 'var(--en-gold)',// gold
  'Forced-List':      '#b06050',       // muted rust
  'Swap':             '#5b9fdc',       // muted blue
}

// Cleaned display labels for the detail reveal only
const RULE_LABEL = {
  'Mandatory':        'Mandatory',
  'Optional':         'Optional',
  'Exchange':         'Exchange',
  'Emergency Credit': 'Emergency Credit',
  'Forced-List':      'Forced List',
  'Swap':             'Swap',
}

// Sort season labels newest-first: S7 > S6 > ... > S1
function compareSeasonLabels(a, b) {
  const num = s => { const m = s.match(/^S(\d+)$/); return m ? parseInt(m[1], 10) : 0 }
  return num(b) - num(a)
}

// Window sort: Summer before January within a season
const WINDOW_ORDER = { Summer: 0, January: 1 }

// Resolve club identity from the static transfer-clubs map.
function resolveClubIdentity(clubName) {
  if (!clubName) return null
  const key = clubName.trim().toLowerCase()
  const entry = TRANSFER_CLUBS[key]
  if (!entry) return null
  return { displayName: entry.displayName, sofifaTeamId: entry.sofifaTeamId }
}

const WORKER_BASE = 'https://fifa-img.michaelmenda92.workers.dev'

// ─── Player face ──────────────────────────────────────────────────────────────

function Silhouette({ size = 36 }) {
  return (
    <div className={styles.thumb} style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <circle cx="22" cy="15" r="7" fill="currentColor" opacity="0.35"/>
        <path d="M6 40c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="currentColor" opacity="0.25"/>
      </svg>
    </div>
  )
}

function PlayerFace({ sofifaId, name, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!sofifaId || err) return <Silhouette size={size} />
  return (
    <img
      src={`${WORKER_BASE}/${sofifaId}`}
      alt={name}
      className={styles.playerFace}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}

// ─── Club crest ───────────────────────────────────────────────────────────────

function ShieldFallback({ size = 36 }) {
  return (
    <div className={styles.crestWrap} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <path
          d="M18 3L5 8v10c0 8 5.8 13.8 13 15 7.2-1.2 13-7 13-15V8L18 3z"
          fill="currentColor" opacity="0.12"
          stroke="currentColor" strokeWidth="1" strokeOpacity="0.25"
        />
      </svg>
    </div>
  )
}

function ClubCrest({ teamId, clubName, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!teamId || err) return <ShieldFallback size={size} />
  return (
    <img
      src={`${WORKER_BASE}/team/${teamId}`}
      alt={clubName}
      className={styles.crestImg}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Transfers() {
  const { activeClub } = useApp()
  const [transfers, setTransfers] = useState([])
  const [seasons,   setSeasons]   = useState([])
  const [playerMap, setPlayerMap] = useState(new Map())
  const [loading,   setLoading]   = useState(true)
  const [selectedSeason, setSelectedSeason] = useState('all')
  const [dir, setDir] = useState('all')

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getTransfers(activeClub.id),
      getSeasons(activeClub.id),
      getPlayers(activeClub.id),
    ])
      .then(([t, s, p]) => {
        setTransfers(t)
        setSeasons(s)
        const map = new Map()
        p.forEach(player => map.set(player.id, player))
        setPlayerMap(map)
      })
      .catch(err => console.error('[Transfers] load error:', err))
      .finally(() => setLoading(false))
  }, [activeClub])

  const seasonLabelById = Object.fromEntries(seasons.map(s => [s.id, s.label]))

  const resolveLabel = t =>
    t.season ||
    (t.seasonId && seasonLabelById[t.seasonId]) ||
    t.seasonId ||
    '?'

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

  const sortedGroups = Object.values(grouped).sort((a, b) => {
    const seasonDiff = compareSeasonLabels(a.season, b.season)
    if (seasonDiff !== 0) return seasonDiff
    return (WINDOW_ORDER[a.window] ?? 99) - (WINDOW_ORDER[b.window] ?? 99)
  })

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

  // Summary strip — muted rust for spent/negative, gold for received/positive
  const MUTED_RUST = '#b06050'
  const summaryConfig = {
    all: [
      { val: fmt(totalIn),  color: MUTED_RUST,            key: 'Spent' },
      { val: fmt(totalOut), color: 'var(--en-gold)',       key: 'Received' },
      {
        val: netSpend > 0 ? `-${fmt(netSpend)}` : netSpend < 0 ? `+${fmt(Math.abs(netSpend))}` : '—',
        color: netSpend > 0 ? MUTED_RUST : netSpend < 0 ? 'var(--en-gold)' : 'var(--en-text-3)',
        key: netSpend > 0 ? 'Net spend' : netSpend < 0 ? 'Net profit' : 'Net',
      },
    ],
    IN: [
      { val: fmt(totalIn),                                              color: MUTED_RUST,            key: 'Spent' },
      { val: String(ins.length),                                        color: 'var(--en-text-1)',    key: 'Arrivals' },
      { val: ins.length ? fmt(Math.round(totalIn / ins.length)) : '—', color: 'var(--en-gold)',      key: 'Avg fee' },
    ],
    OUT: [
      { val: fmt(totalOut),                                               color: 'var(--en-gold)',     key: 'Received' },
      { val: String(outs.length),                                         color: 'var(--en-text-1)',   key: 'Departures' },
      { val: outs.length ? fmt(Math.round(totalOut / outs.length)) : '—', color: 'var(--en-gold)',    key: 'Avg fee' },
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
            {d === 'all' ? 'All' : d === 'IN' ? 'Arrivals' : 'Departures'}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No transfers found</p>
            <p className={styles.emptyHint}>Try a different season or filter</p>
          </div>
        ) : (
          sortedGroups.map((g, gi) => (
            <WindowGroup
              key={gi}
              group={g}
              groupIndex={gi}
              dir={dir}
              playerMap={playerMap}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Window group ─────────────────────────────────────────────────────────────

function WindowGroup({ group: g, groupIndex: gi, dir, playerMap }) {
  const [expandedKey, setExpandedKey] = useState(null)

  const MUTED_RUST = '#b06050'
  const totalIn  = g.ins.reduce((s, t)  => s + (t.fee_eur || 0), 0)
  const totalOut = g.outs.reduce((s, t) => s + (t.fee_eur || 0), 0)
  const net = totalIn - totalOut

  const netEl = net === 0
    ? <span style={{ color: 'var(--en-text-3)' }}>—</span>
    : <span style={{ color: net > 0 ? MUTED_RUST : 'var(--en-gold)' }}>
        {net > 0 ? `−${fmt(net)}` : `+${fmt(Math.abs(net))}`}
      </span>

  const handleToggle = (key) => {
    setExpandedKey(prev => prev === key ? null : key)
  }

  return (
    <div className={styles.windowGroup}>
      <div className={styles.windowHeader}>
        <span className={styles.windowSeason}>{g.season}</span>
        <span className={styles.windowDot}>·</span>
        <span className={styles.windowName}>{g.window} Window</span>
        <div className={styles.windowNet}>{netEl}</div>
      </div>
      {(dir === 'all' || dir === 'IN')  && g.ins.map((t, i) => (
        <TransferRow
          key={`in-${i}`}
          t={t}
          rowKey={`${gi}-in-${i}`}
          isExpanded={expandedKey === `${gi}-in-${i}`}
          onToggle={handleToggle}
          playerMap={playerMap}
        />
      ))}
      {(dir === 'all' || dir === 'OUT') && g.outs.map((t, i) => (
        <TransferRow
          key={`out-${i}`}
          t={t}
          rowKey={`${gi}-out-${i}`}
          isExpanded={expandedKey === `${gi}-out-${i}`}
          onToggle={handleToggle}
          playerMap={playerMap}
        />
      ))}
    </div>
  )
}

// ─── Transfer row ─────────────────────────────────────────────────────────────

function TransferRow({ t, rowKey, isExpanded, onToggle, playerMap }) {
  const navigate   = useNavigate()
  const isIn       = t.direction === 'IN'
  const isLinkable = !!t.playerId

  const player    = t.playerId ? (playerMap.get(t.playerId) ?? null) : null
  const sofifaId  = player?.sofifaId ?? null

  const rawClub    = isIn ? t.from_club : t.to_club
  const clubIdent  = resolveClubIdentity(rawClub)
  const clubLabel  = clubIdent?.displayName ?? rawClub
  const clubTeamId = clubIdent?.sofifaTeamId ?? null

  const dotColor = t.rule ? (RULE_DOT[t.rule] ?? '#8899aa') : null
  const ruleLabel = t.rule ? (RULE_LABEL[t.rule] ?? t.rule) : null

  // Click on the player identity area → navigate to profile (if linkable)
  const handleIdentityClick = (e) => {
    if (isLinkable) {
      e.stopPropagation()
      navigate(`/players/${t.playerId}`)
    }
  }

  // Click on anywhere else in the row → toggle detail
  const handleRowClick = () => {
    onToggle(rowKey)
  }

  return (
    <div className={styles.transferRowWrap}>
      {/* Main row */}
      <div
        className={`${styles.transferRow} ${isIn ? styles.rowIn : styles.rowOut}`}
        onClick={handleRowClick}
      >
        {/* Slim directional stripe — rendered via CSS left-border on rowIn/rowOut */}

        {/* Player face — tap navigates to profile */}
        <div
          className={styles.faceWrap}
          onClick={handleIdentityClick}
          style={{ cursor: isLinkable ? 'pointer' : 'default' }}
        >
          <PlayerFace sofifaId={sofifaId} name={t.player} size={36} />
        </div>

        {/* Player name + metadata */}
        <div
          className={styles.transferInfo}
          onClick={handleIdentityClick}
          style={{ cursor: isLinkable ? 'pointer' : 'default' }}
        >
          <div className={styles.transferName}>{t.player}</div>
          <div className={styles.transferMeta}>
            {t.position && <span className={styles.transferPos}>{t.position}</span>}
            {dotColor && (
              <span
                className={styles.ruleDot}
                style={{ background: dotColor }}
                title={ruleLabel ?? ''}
              />
            )}
            {clubLabel && <span className={styles.transferClub}>{clubLabel}</span>}
          </div>
        </div>

        {/* Fee */}
        <div className={styles.transferFee}>{fmt(t.fee_eur)}</div>

        {/* Club crest */}
        <div className={styles.crestCol}>
          <ClubCrest teamId={clubTeamId} clubName={clubLabel} size={32} />
        </div>
      </div>

      {/* Inline detail reveal */}
      {isExpanded && (
        <div className={styles.transferDetail}>
          <div className={styles.detailRow}>
            <span className={styles.detailKey}>{isIn ? 'Arrived from' : 'Departed to'}</span>
            <span className={styles.detailVal}>{clubLabel || '—'}</span>
          </div>
          {ruleLabel && (
            <div className={styles.detailRow}>
              <span className={styles.detailKey}>Transfer type</span>
              <span
                className={styles.detailVal}
                style={{ color: dotColor || 'var(--en-text-2)' }}
              >
                {ruleLabel}
              </span>
            </div>
          )}
          <div className={styles.detailRow}>
            <span className={styles.detailKey}>Fee</span>
            <span className={styles.detailVal} style={{ color: 'var(--en-gold)' }}>{fmt(t.fee_eur)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
