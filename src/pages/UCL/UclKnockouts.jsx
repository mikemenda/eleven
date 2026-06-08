import styles from './UCL.module.css'
import { fmtScore, fmtGD, ROUND_LABELS, UCL_KO_COMPS } from '../../utils/uclUtils'

function StatRow({ label, value, color, bold }) {
  return (
    <div className={styles.koRecordRow}>
      <span className={styles.koRecordLabel}>{label}</span>
      <span
        className={styles.koRecordValue}
        style={{
          color:      color || undefined,
          fontWeight: bold  ? 600 : undefined,
        }}
      >
        {value}
      </span>
    </div>
  )
}

// Coloured W/D/L inline
function WDL({ w, d, l }) {
  return (
    <span>
      <span style={{ color: 'var(--en-green)' }}>{w}W</span>
      {' '}<span style={{ color: 'var(--en-text-3)' }}>{d}D</span>
      {' '}<span style={{ color: 'var(--danger)' }}>{l}L</span>
    </span>
  )
}

export default function UclKnockouts({ knockoutData, finals, opponents, loading }) {
  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  const { legRecord, tieRecord, lpRecord, koTotal } = knockoutData || {}

  const noData = !legRecord || UCL_KO_COMPS.every(c => legRecord[c]?.p === 0)

  if (noData && (!finals || finals.length === 0)) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>⚔️</span>
        <p className={styles.emptyText}>No knockout data yet</p>
        <p className={styles.emptyHint}>Knockout records populate when UCL match docs are logged.</p>
      </div>
    )
  }

  return (
    <div className={styles.koWrap}>

      {/* ── Leg record by round ──────────────────────────────────── */}
      {legRecord && (
        <div className={styles.koSection}>
          <p className={styles.koSectionTitle}>Match Record by Round</p>
          <p className={styles.koSectionNote}>Each leg counted individually</p>

          {/* Table header */}
          <div className={styles.koTableHead}>
            <span className={styles.koThRound}>Round</span>
            <span className={styles.koThStat}>P</span>
            <span className={styles.koThStat}>W</span>
            <span className={styles.koThStat}>D</span>
            <span className={styles.koThStat}>L</span>
            <span className={styles.koThStat}>GF</span>
            <span className={styles.koThStat}>GA</span>
            <span className={styles.koThStat}>GD</span>
          </div>

          {/* League Phase row */}
          {lpRecord && lpRecord.p > 0 && (
            <div className={styles.koTableRow} style={{ opacity: 0.7 }}>
              <span className={styles.koTdRound}>{lpRecord.short}</span>
              <span className={styles.koTdStat}>{lpRecord.p}</span>
              <span className={styles.koTdStat} style={{ color: 'var(--en-green)' }}>{lpRecord.w}</span>
              <span className={styles.koTdStat} style={{ color: 'var(--en-text-3)' }}>{lpRecord.d}</span>
              <span className={styles.koTdStat} style={{ color: 'var(--danger)' }}>{lpRecord.l}</span>
              <span className={styles.koTdStat}>{lpRecord.gf}</span>
              <span className={styles.koTdStat}>{lpRecord.ga}</span>
              <span className={styles.koTdStat}
                style={{ color: lpRecord.gd > 0 ? 'var(--en-green)' : lpRecord.gd < 0 ? 'var(--danger)' : undefined }}>
                {fmtGD(lpRecord.gf, lpRecord.ga)}
              </span>
            </div>
          )}

          {/* KO round rows */}
          {UCL_KO_COMPS.map(comp => {
            const row = legRecord[comp]
            if (!row || row.p === 0) return null
            const isFinal = comp === 'UCL_Final'
            return (
              <div
                key={comp}
                className={styles.koTableRow}
                style={isFinal ? { borderTop: '0.5px solid var(--en-rule)' } : undefined}
              >
                <span className={styles.koTdRound} style={isFinal ? { color: 'var(--en-gold)' } : undefined}>
                  {row.short}
                </span>
                <span className={styles.koTdStat}>{row.p}</span>
                <span className={styles.koTdStat} style={{ color: 'var(--en-green)' }}>{row.w}</span>
                <span className={styles.koTdStat} style={{ color: 'var(--en-text-3)' }}>{row.d}</span>
                <span className={styles.koTdStat} style={{ color: 'var(--danger)' }}>{row.l}</span>
                <span className={styles.koTdStat}>{row.gf}</span>
                <span className={styles.koTdStat}>{row.ga}</span>
                <span className={styles.koTdStat}
                  style={{ color: row.gd > 0 ? 'var(--en-green)' : row.gd < 0 ? 'var(--danger)' : undefined }}>
                  {fmtGD(row.gf, row.ga)}
                </span>
              </div>
            )
          })}

          {/* KO Total */}
          {koTotal && koTotal.p > 0 && (
            <div className={styles.koTableRow} style={{ borderTop: '0.5px solid var(--en-rule)', fontWeight: 600 }}>
              <span className={styles.koTdRound}>KO Total</span>
              <span className={styles.koTdStat}>{koTotal.p}</span>
              <span className={styles.koTdStat} style={{ color: 'var(--en-green)' }}>{koTotal.w}</span>
              <span className={styles.koTdStat} style={{ color: 'var(--en-text-3)' }}>{koTotal.d}</span>
              <span className={styles.koTdStat} style={{ color: 'var(--danger)' }}>{koTotal.l}</span>
              <span className={styles.koTdStat}>{koTotal.gf}</span>
              <span className={styles.koTdStat}>{koTotal.ga}</span>
              <span className={styles.koTdStat}
                style={{ color: koTotal.gd > 0 ? 'var(--en-green)' : koTotal.gd < 0 ? 'var(--danger)' : undefined }}>
                {fmtGD(koTotal.gf, koTotal.ga)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Tie record (advanced / eliminated) ──────────────────── */}
      {tieRecord && UCL_KO_COMPS.some(c => tieRecord[c]?.ties > 0) && (
        <div className={styles.koSection}>
          <p className={styles.koSectionTitle}>Tie Record</p>
          <p className={styles.koSectionNote}>Two-leg ties — advanced vs eliminated</p>

          <div className={styles.koTieHead}>
            <span className={styles.koTieLabelCol}>Round</span>
            <span className={styles.koTieCol}>Ties</span>
            <span className={styles.koTieCol} style={{ color: 'var(--en-green)' }}>Advanced</span>
            <span className={styles.koTieCol} style={{ color: 'var(--danger)' }}>Out</span>
          </div>

          {UCL_KO_COMPS.map(comp => {
            const row = tieRecord[comp]
            if (!row || row.ties === 0) return null
            const isFinal = comp === 'UCL_Final'
            return (
              <div key={comp} className={styles.koTieRow}>
                <span
                  className={styles.koTieLabelCol}
                  style={isFinal ? { color: 'var(--en-gold)' } : undefined}
                >
                  {row.label}
                </span>
                <span className={styles.koTieCol}>{row.ties}</span>
                <span className={styles.koTieCol} style={{ color: 'var(--en-green)' }}>{row.advanced}</span>
                <span className={styles.koTieCol} style={{ color: 'var(--danger)' }}>{row.eliminated}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Finals log ───────────────────────────────────────────── */}
      {finals && finals.length > 0 && (
        <div className={styles.koSection}>
          <p className={styles.koSectionTitle}>Finals</p>

          {finals.map(f => {
            const won  = f.result === 'Champions'
            const color = won ? 'var(--en-gold)' : 'var(--en-text-3)'
            return (
              <div key={f.seasonId} className={styles.koFinalRow}>
                {/* Crest */}
                {f.crest && (
                  <img src={f.crest} alt="" className={styles.koFinalCrest}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                {/* Season + opponent */}
                <div className={styles.koFinalInfo}>
                  <span className={styles.koFinalSeason}>{f.seasonLabel}</span>
                  <span className={styles.koFinalOpp}>vs {f.opponent || '—'}</span>
                </div>
                {/* Score */}
                {f.score && (
                  <span className={styles.koFinalScore} style={{ color }}>{f.score}</span>
                )}
                {/* Result badge */}
                <span className={styles.koFinalResult} style={{ color }}>
                  {won ? '★ W' : 'L'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
