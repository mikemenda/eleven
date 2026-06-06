import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getPlayers, getSeasons, getTransfers, getMatchesByClub, computeRecords
} from '../firebase/services'
import styles from './Records.module.css'

function fmt(n) {
  if (!n) return 'Free'
  if (n >= 1e9) return `€${(n/1e9).toFixed(2)}B`
  if (n >= 1e6) return `€${(n/1e6).toFixed(1)}M`
  return `€${(n/1e3).toFixed(0)}K`
}

export default function Records() {
  const { activeClub } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('individual')

  useEffect(() => {
    if (!activeClub) return
    setLoading(true)
    Promise.all([
      getPlayers(activeClub.id),
      getSeasons(activeClub.id),
      getTransfers(activeClub.id),
      getMatchesByClub(activeClub.id),
    ]).then(([players, seasons, transfers, matches]) => {
      setData(computeRecords({ players, seasons, transfers, matches, goals: [] }))
      setLoading(false)
    })
  }, [activeClub])

  const TABS = [
    { key: 'individual', label: 'Individual' },
    { key: 'season',     label: 'Season' },
    { key: 'transfers',  label: 'Transfers' },
    { key: 'ucl',        label: 'UCL Finals' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.topLabel}>Club Records</span>
      </div>
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.inner}>
        {loading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : !data ? null : tab === 'individual' ? (
          <IndividualRecords r={data.individual} gk={data.gk} />
        ) : tab === 'season' ? (
          <SeasonRecords r={data.season} />
        ) : tab === 'transfers' ? (
          <TransferRecords r={data.transfers} />
        ) : (
          <UCLFinals r={data.ucl} />
        )}
      </div>
    </div>
  )
}

function RecordCard({ label, holder, value, sub, highlight }) {
  return (
    <div className={styles.recordCard}>
      <div className={styles.recordLabel}>{label}</div>
      <div className={styles.recordHolder}>{holder || '—'}</div>
      <div className={styles.recordValue} style={highlight ? { color: 'var(--en-gold)' } : {}}>
        {value}
      </div>
      {sub && <div className={styles.recordSub}>{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

function IndividualRecords({ r, gk }) {
  return (
    <div>
      <Section title="Goals">
        <RecordCard
          label="All-time top scorer"
          holder={r.topScorer?.name}
          value={r.topScorer ? `${r.topScorer.goals} goals` : '—'}
          highlight
        />
      </Section>
      <Section title="Assists">
        <RecordCard
          label="All-time assists leader"
          holder={r.topAssists?.name}
          value={r.topAssists ? `${r.topAssists.assists} assists` : '—'}
          highlight
        />
      </Section>
      <Section title="Appearances">
        <RecordCard
          label="Most appearances"
          holder={r.mostApps?.name}
          value={r.mostApps ? `${r.mostApps.apps} apps` : '—'}
        />
      </Section>
      <Section title="Efficiency">
        <RecordCard
          label="Best goals-per-game (min 30 apps)"
          holder={r.bestGpg?.name}
          value={r.bestGpg ? `${r.bestGpg.gpg.toFixed(2)} G/game` : '—'}
          sub={r.bestGpg ? `${r.bestGpg.goals}G in ${r.bestGpg.apps} apps` : null}
        />
      </Section>
      {gk.keepers?.length > 0 && (
        <Section title="Goalkeepers">
          {gk.keepers.map((k, i) => (
            <RecordCard
              key={i}
              label={k.name}
              holder={`${k.apps || 0} apps`}
              value={`${k.cleanSheets || 0} clean sheets`}
              sub={k.apps > 0 ? `${((k.cleanSheets || 0) / k.apps * 100).toFixed(0)}% CS rate` : null}
            />
          ))}
        </Section>
      )}
    </div>
  )
}

function SeasonRecords({ r }) {
  return (
    <div>
      <Section title="Points">
        <RecordCard
          label="Most points in a season"
          holder={r.byPts?.label}
          value={r.byPts ? `${r.byPts.leaguePts} pts` : '—'}
          sub={r.byPts ? `${r.byPts.leagueW}W ${r.byPts.leagueD}D ${r.byPts.leagueL}L` : null}
          highlight
        />
      </Section>
      <Section title="Goals">
        <RecordCard
          label="Most goals in a season"
          holder={r.byGoals?.label}
          value={r.byGoals ? `${r.byGoals.leagueGF} goals` : '—'}
        />
        <RecordCard
          label="Best goals-per-game"
          holder={r.byGpg?.label}
          value={r.byGpg ? `${r.byGpg.gpg.toFixed(2)} G/game` : '—'}
          sub={r.byGpg ? `${r.byGpg.leagueGF} goals in ${r.byGpg.leagueP} games` : null}
        />
      </Section>
      <Section title="Biggest Win">
        {r.biggestWin ? (
          <RecordCard
            label={`vs ${r.biggestWin.opponent}`}
            holder={r.biggestWin.competition}
            value={`${r.biggestWin.score_for}–${r.biggestWin.score_against}`}
            sub={r.biggestWin.home_away === 'H' ? 'Home' : r.biggestWin.home_away === 'A' ? 'Away' : 'Neutral'}
            highlight
          />
        ) : (
          <RecordCard label="No match data yet" holder="—" value="—" />
        )}
      </Section>
    </div>
  )
}

function TransferRecords({ r }) {
  return (
    <div>
      <Section title="Highest Fee Paid">
        <RecordCard
          label={r.highestIn ? `${r.highestIn.player} from ${r.highestIn.from_club}` : 'No data'}
          holder={r.highestIn?.season}
          value={r.highestIn ? `${fmt(r.highestIn.fee_eur)}` : '—'}
          highlight
        />
      </Section>
      <Section title="Highest Fee Received">
        <RecordCard
          label={r.highestOut ? `${r.highestOut.player} to ${r.highestOut.to_club}` : 'No data'}
          holder={r.highestOut?.season}
          value={r.highestOut ? `${fmt(r.highestOut.fee_eur)}` : '—'}
          highlight
        />
      </Section>
      <Section title="Biggest Net Spend (Single Season)">
        <RecordCard
          label={r.biggestSpend ? r.biggestSpend.season : 'No data'}
          holder={r.biggestSpend ? `In: ${fmt(r.biggestSpend.in)} / Out: ${fmt(r.biggestSpend.out)}` : '—'}
          value={r.biggestSpend ? fmt(Math.abs(r.biggestSpend.net)) : '—'}
        />
      </Section>
    </div>
  )
}

function UCLFinals({ r }) {
  if (!r.finals?.length) return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>🏆</span>
      <p className={styles.emptyText}>No UCL finals yet</p>
      <p className={styles.emptyHint}>UCL finals are populated from season data</p>
    </div>
  )
  return (
    <div>
      <Section title={`UCL Finals — ${r.finals.length} appearance${r.finals.length !== 1 ? 's' : ''}`}>
        {r.finals.map((f, i) => (
          <div key={i} className={styles.finalCard}>
            <div className={styles.finalResult}
              style={{ color: f.result === 'Champions' ? 'var(--en-gold)' : 'var(--en-text-3)' }}>
              {f.result === 'Champions' ? '🏆 Winners' : '🥈 Runners-Up'}
            </div>
            <div className={styles.finalMatch}>
              <span className={styles.finalSeason}>{f.season} {f.year && `(${f.year})`}</span>
              <span className={styles.finalVs}>vs {f.opponent}</span>
            </div>
            <div className={styles.finalScore}>{f.score}</div>
          </div>
        ))}
      </Section>
    </div>
  )
}
