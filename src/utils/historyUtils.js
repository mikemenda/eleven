// ─── HISTORY UTILITIES ────────────────────────────────────────────────────────
// Derives competition winners and historical records from season documents.
// History = all recorded competition winners by season (not just FC Richport wins).
// This is separate from trophyUtils.js which is FC Richport-only (Museum/Home).
//
// Season fields used here:
//   s.label                  — "S1", "S2", etc.
//   s.year                   — "2026/27"
//   s.leagueCompetition      — which domestic league FC Richport played in
//   s.leaguePosition         — finish position (1 = champion)
//   s.leaguePts, leagueW/D/L/GF/GA
//   s.uclResult              — FC Richport's UCL result
//   s.uclTournamentWinner    — who actually won UCL (may be another team)
//   s.uclFinalOpponent       — opponent in UCL final
//   s.uclFinalScore          — score of UCL final
//   s.faCupResult            — FC Richport's FA Cup result
//   s.faCupWinner            — who won FA Cup
//   s.faCupFinalOpponent     — opponent in FA Cup final
//   s.carabaoCupResult       — FC Richport's Carabao Cup result
//   s.carabaoCupWinner       — who won Carabao Cup
//   s.carabaoCupFinalOpponent — opponent in Carabao Cup final

// ─── COMPETITION REGISTRY FOR HISTORY ─────────────────────────────────────────
// Superset of trophyUtils TROPHY_REGISTRY — includes competitions tracked by
// History that may not yet have trophy SVGs (Serie A, Ligue 1, etc.)
export const HISTORY_COMPETITIONS = [
  // European
  { key: 'UEFA Champions League', short: 'UCL',          tier: 'european', region: 'Europe',  group: 'european' },
  { key: 'UEFA Europa League',    short: 'UEL',          tier: 'european', region: 'Europe',  group: 'european' },
  // English
  { key: 'Premier League',        short: 'Premier League', tier: 'league', region: 'England', group: 'england'  },
  { key: 'FA Cup',                short: 'FA Cup',         tier: 'cup',    region: 'England', group: 'england'  },
  { key: 'Carabao Cup',           short: 'Carabao Cup',    tier: 'cup',    region: 'England', group: 'england'  },
  // Spanish
  { key: 'La Liga',               short: 'La Liga',        tier: 'league', region: 'Spain',   group: 'spain'    },
  { key: 'Copa del Rey',          short: 'Copa del Rey',   tier: 'cup',    region: 'Spain',   group: 'spain'    },
  // Italian
  { key: 'Serie A',               short: 'Serie A',        tier: 'league', region: 'Italy',   group: 'italy'    },
  { key: 'Coppa Italia',          short: 'Coppa Italia',   tier: 'cup',    region: 'Italy',   group: 'italy'    },
  // German
  { key: 'Bundesliga',            short: 'Bundesliga',     tier: 'league', region: 'Germany', group: 'germany'  },
  { key: 'DFB-Pokal',             short: 'DFB-Pokal',      tier: 'cup',    region: 'Germany', group: 'germany'  },
  // French
  { key: 'Ligue 1',               short: 'Ligue 1',        tier: 'league', region: 'France',  group: 'france'   },
  { key: 'Coupe de France',       short: 'Coupe de France', tier: 'cup',   region: 'France',  group: 'france'   },
]

// League competition keys for the league filter
export const LEAGUE_KEYS = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1']

// Parse season year string to sortable int ("2026/27" → 2026, "2030/31" → 2030)
// Returns 0 for malformed so those seasons sort to bottom, not crash.
function seasonSortKey(s) {
  const raw = typeof s.year === 'string' ? s.year.trim() : ''
  const n = parseInt(raw.slice(0, 4), 10)
  return Number.isFinite(n) ? n : 0
}

// ─── MAIN DERIVATION ──────────────────────────────────────────────────────────
// Returns an array of HistoryEntry objects, one per competition per season.
// Each entry represents a recorded competition result for that season.
//
// HistoryEntry shape:
//   {
//     seasonId, seasonLabel, seasonYear,
//     competition,        — competition key from HISTORY_COMPETITIONS
//     winner,             — string: club name (FC Richport or another club)
//     runnerUp,           — string or null
//     finalScore,         — string or null (e.g. "2–1")
//     fcRichportWon,      — boolean: was it FC Richport who won?
//     fcRichportRunnerUp, — boolean: was FC Richport the runner-up?
//     fcRichportPosition, — number or null: league finish (1=champion, 2=2nd, etc.)
//     leaguePts,          — number or null (for league entries)
//     leagueRecord,       — string or null (e.g. "29W 7D 2L")
//     hasData,            — boolean: false = competition existed this season but no winner recorded
//   }
//
// Seasons are sorted oldest-first for timeline purposes.
// Call site can re-sort as needed.

export function deriveHistoryFromSeasons(seasons, clubName = 'FC Richport') {
  if (!seasons || seasons.length === 0) return []

  // Sort oldest-first for chronological processing
  const sorted = [...seasons].sort((a, b) => seasonSortKey(a) - seasonSortKey(b))

  const entries = []

  for (const s of sorted) {
    const base = {
      seasonId:    s.id,
      seasonLabel: s.label || '?',
      seasonYear:  s.year  || '',
      season:      s,
    }

    // ── UCL ────────────────────────────────────────────────────────────────
    if (s.uclEntered || s.uclResult || s.uclTournamentWinner) {
      // Determine the actual UCL winner
      let winner = null
      let fcWon  = false
      let fcRU   = false
      let runnerUp = null
      let finalScore = s.uclFinalScore || null

      if (s.uclResult === 'Champions') {
        winner = clubName
        fcWon  = true
        runnerUp = s.uclFinalOpponent || null
      } else if (s.uclTournamentWinner) {
        winner = s.uclTournamentWinner
        if (s.uclResult === 'Runners-Up') {
          fcRU     = true
          runnerUp = clubName
        } else {
          runnerUp = s.uclFinalOpponent || null
        }
      } else if (s.uclResult && s.uclResult !== 'LP Only') {
        // We know FC Richport participated but winner not recorded
        winner = null
      }

      entries.push({
        ...base,
        competition:        'UEFA Champions League',
        winner,
        runnerUp,
        finalScore,
        fcRichportWon:      fcWon,
        fcRichportRunnerUp: fcRU,
        fcRichportPosition: null,
        leaguePts:          null,
        leagueRecord:       null,
        hasData:            !!winner,
      })
    }

    // ── DOMESTIC LEAGUE ────────────────────────────────────────────────────
    if (s.leagueCompetition) {
      const pos    = s.leaguePosition
      const fcWon  = pos === 1
      const winner = fcWon ? clubName : null   // Only know winner if FC Richport won
      const pts    = s.leaguePts ?? null
      let leagueRecord = null
      if (s.leagueW != null || s.leagueD != null) {
        const parts = []
        if (s.leagueW != null) parts.push(`${s.leagueW}W`)
        if (s.leagueD != null) parts.push(`${s.leagueD}D`)
        if (s.leagueL != null) parts.push(`${s.leagueL}L`)
        leagueRecord = parts.join(' ') || null
      }

      entries.push({
        ...base,
        competition:        s.leagueCompetition,
        winner,
        runnerUp:           null,
        finalScore:         null,
        fcRichportWon:      fcWon,
        fcRichportRunnerUp: false,
        fcRichportPosition: pos ?? null,
        leaguePts:          pts,
        leagueRecord,
        hasData:            !!winner,
      })
    }

    // ── FA CUP ─────────────────────────────────────────────────────────────
    if (s.faCupResult || s.faCupWinner) {
      const fcWon  = s.faCupResult === 'Winner'
      const winner = fcWon
        ? clubName
        : (s.faCupWinner || null)
      const fcRU   = s.faCupResult === 'Final' && !fcWon
      const runnerUp = fcWon
        ? (s.faCupFinalOpponent || null)
        : (fcRU ? clubName : null)

      entries.push({
        ...base,
        competition:        'FA Cup',
        winner,
        runnerUp,
        finalScore:         null,
        fcRichportWon:      fcWon,
        fcRichportRunnerUp: fcRU,
        fcRichportPosition: null,
        leaguePts:          null,
        leagueRecord:       null,
        hasData:            !!(winner),
      })
    }

    // ── CARABAO CUP ────────────────────────────────────────────────────────
    if (s.carabaoCupResult || s.carabaoCupWinner) {
      const fcWon  = s.carabaoCupResult === 'Winner'
      const winner = fcWon
        ? clubName
        : (s.carabaoCupWinner || null)
      const fcRU   = s.carabaoCupResult === 'Final' && !fcWon
      const runnerUp = fcWon
        ? (s.carabaoCupFinalOpponent || null)
        : (fcRU ? clubName : null)

      entries.push({
        ...base,
        competition:        'Carabao Cup',
        winner,
        runnerUp,
        finalScore:         null,
        fcRichportWon:      fcWon,
        fcRichportRunnerUp: fcRU,
        fcRichportPosition: null,
        leaguePts:          null,
        leagueRecord:       null,
        hasData:            !!(winner),
      })
    }

    // NOTE: Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France, UEL are not
    // in the season schema yet. When SeasonDetail adds winner fields for them,
    // add derivation blocks here using the same pattern as FA Cup above.
  }

  return entries
}

// ─── DYNASTIES ────────────────────────────────────────────────────────────────
// Returns clubs with 2+ titles in the same competition.
// Shape: [{ competition, club, count, seasons: ['S1','S2',...] }]
// Sorted by count descending, then competition key, then club name.

export function computeDynasties(historyEntries) {
  const map = {}  // key: `${competition}:::${club}`

  for (const e of historyEntries) {
    if (!e.winner || !e.hasData) continue
    const k = `${e.competition}:::${e.winner}`
    if (!map[k]) map[k] = { competition: e.competition, club: e.winner, count: 0, seasons: [] }
    map[k].count++
    map[k].seasons.push(e.seasonLabel)
  }

  return Object.values(map)
    .filter(d => d.count >= 2)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (a.competition !== b.competition) return a.competition.localeCompare(b.competition)
      return a.club.localeCompare(b.club)
    })
}

// ─── TREBLES ──────────────────────────────────────────────────────────────────
// Detects seasons where any club won 3 or more major competitions in the same season.
// "Major" = UEFA Champions League + any domestic league + any domestic cup.
// Only counts competitions where hasData === true.
//
// Returns: [{ seasonLabel, seasonYear, club, competitions: ['Comp A', 'Comp B', 'Comp C'] }]

const DOMESTIC_LEAGUES = new Set(['Premier League','La Liga','Serie A','Bundesliga','Ligue 1','English Championship'])
const DOMESTIC_CUPS    = new Set(['FA Cup','Carabao Cup','Copa del Rey','Coppa Italia','DFB-Pokal','Coupe de France'])

export function detectTrebles(historyEntries) {
  // Group by season
  const bySeason = {}
  for (const e of historyEntries) {
    if (!e.winner || !e.hasData) continue
    const k = e.seasonId
    if (!bySeason[k]) bySeason[k] = {
      seasonLabel: e.seasonLabel,
      seasonYear:  e.seasonYear,
      byClub: {},
    }
    const club = e.winner
    if (!bySeason[k].byClub[club]) bySeason[k].byClub[club] = []
    bySeason[k].byClub[club].push(e.competition)
  }

  const trebles = []
  for (const seasonData of Object.values(bySeason)) {
    for (const [club, comps] of Object.entries(seasonData.byClub)) {
      const hasUCL     = comps.includes('UEFA Champions League')
      const hasLeague  = comps.some(c => DOMESTIC_LEAGUES.has(c))
      const hasCup     = comps.some(c => DOMESTIC_CUPS.has(c))

      if (hasUCL && hasLeague && hasCup) {
        trebles.push({
          seasonLabel:  seasonData.seasonLabel,
          seasonYear:   seasonData.seasonYear,
          club,
          competitions: comps,
        })
      }
    }
  }

  // Sort by season label ascending
  return trebles.sort((a, b) =>
    a.seasonLabel.localeCompare(b.seasonLabel, undefined, { numeric: true })
  )
}

// ─── ERA LEADERS ─────────────────────────────────────────────────────────────
// Ranks clubs by total recorded titles across all supported competitions.
// Returns top N clubs: [{ club, total, byCompetition: { 'UCL': 2, 'PL': 7 } }]

export function computeEraLeaders(historyEntries, topN = 5) {
  const map = {}  // club name → { total, byCompetition }

  for (const e of historyEntries) {
    if (!e.winner || !e.hasData) continue
    if (!map[e.winner]) map[e.winner] = { club: e.winner, total: 0, byCompetition: {} }
    map[e.winner].total++
    map[e.winner].byCompetition[e.competition] =
      (map[e.winner].byCompetition[e.competition] || 0) + 1
  }

  return Object.values(map)
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.club.localeCompare(b.club)
    })
    .slice(0, topN)
}

// ─── FC RICHPORT INVOLVEMENT ──────────────────────────────────────────────────
// Returns entries where FC Richport won, was runner-up, or had a notable league
// finish. Used for the FC Richport Only filter.

export function filterFCRichportInvolvement(historyEntries) {
  return historyEntries.filter(e =>
    e.fcRichportWon ||
    e.fcRichportRunnerUp ||
    (e.fcRichportPosition != null && e.fcRichportPosition <= 5)
  )
}

// ─── COMPETITION DETAIL ───────────────────────────────────────────────────────
// Returns all history entries for a single competition, sorted oldest-first.

export function getCompetitionHistory(historyEntries, competition) {
  return historyEntries
    .filter(e => e.competition === competition)
    .sort((a, b) =>
      a.seasonLabel.localeCompare(b.seasonLabel, undefined, { numeric: true })
    )
}

// ─── SEASON LABELS LIST ───────────────────────────────────────────────────────
// Returns sorted unique season labels from history entries (newest first).

export function getSeasonLabels(historyEntries) {
  const labels = [...new Set(historyEntries.map(e => e.seasonLabel))]
  return labels.sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  )
}
