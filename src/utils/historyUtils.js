// ─── HISTORY UTILITIES ────────────────────────────────────────────────────────
// Derives competition winners and historical records from season documents.
// History = all recorded competition winners by season (not just FC Richport wins).
// This is separate from trophyUtils.js which is FC Richport-only (Museum/Home).
//
// ─── CANONICAL SEASON FIELDS ─────────────────────────────────────────────────
// Fields currently in Firestore season docs:
//   s.label                    — "S1", "S2", etc.
//   s.year                     — "2026/27"
//   s.leagueCompetition        — which domestic league FC Richport played in
//   s.leaguePosition           — finish position (1 = champion)
//   s.leaguePts, leagueW/D/L/GF/GA
//   s.leagueTop5               — array [{position,club,pts,w,d,l,gf,ga}] (future upload)
//   s.uclEntered, s.uclResult  — FC Richport's UCL participation + result
//   s.uclTournamentWinner      — who actually won UCL (may be another team)
//   s.uclFinalOpponent         — opponent in UCL final
//   s.uclFinalScore            — e.g. "2–1"
//   s.faCupResult              — FC Richport's result ('Winner','Final','SF',...)
//   s.faCupWinner              — who won FA Cup
//   s.faCupFinalOpponent       — runner-up / opponent in final
//   s.faCupFinalScore          — final score (future field)
//   s.carabaoCupResult         — FC Richport's result
//   s.carabaoCupWinner         — who won Carabao Cup
//   s.carabaoCupFinalOpponent  — runner-up / opponent in final
//   s.carabaoCupFinalScore     — final score (future field)
//
// Future fields (not yet in Firestore — read gracefully, produce no entry if absent):
//   s.uelResult, s.uelWinner, s.uelFinalOpponent, s.uelFinalScore
//   s.ueclResult, s.ueclWinner, s.ueclFinalOpponent, s.ueclFinalScore
//   s.copaDelReyResult, s.copaDelReyWinner, s.copaDelReyFinalOpponent, s.copaDelReyFinalScore
//   s.coppaItaliaResult, s.coppaItaliaWinner, s.coppaItaliaFinalOpponent, s.coppaItaliaFinalScore
//   s.dfbPokalResult, s.dfbPokalWinner, s.dfbPokalFinalOpponent, s.dfbPokalFinalScore
//   s.coupeDeFranceResult, s.coupeDeFranceWinner, s.coupeDeFranceFinalOpponent, s.coupeDeFranceFinalScore

// ─── COMPETITION REGISTRY ─────────────────────────────────────────────────────
// Canonical competition list with tier + country group.
// `group` drives the country ecosystem filter in History.jsx.
// `tier` drives the competition type filter (All / European / Leagues / Cups).
// Keep European competitions grouped as 'european', not by country.
export const HISTORY_COMPETITIONS = [
  // European
  { key: 'UEFA Champions League', short: 'UCL',             tier: 'european', region: 'Europe',  group: 'european' },
  { key: 'UEFA Europa League',    short: 'UEL',             tier: 'european', region: 'Europe',  group: 'european' },
  { key: 'UEFA Conference League',short: 'UECL',            tier: 'european', region: 'Europe',  group: 'european' },
  // English
  { key: 'Premier League',        short: 'Premier League',  tier: 'league',   region: 'England', group: 'england'  },
  { key: 'FA Cup',                short: 'FA Cup',          tier: 'cup',      region: 'England', group: 'england'  },
  { key: 'Carabao Cup',           short: 'Carabao Cup',     tier: 'cup',      region: 'England', group: 'england'  },
  // Spanish
  { key: 'La Liga',               short: 'La Liga',         tier: 'league',   region: 'Spain',   group: 'spain'    },
  { key: 'Copa del Rey',          short: 'Copa del Rey',    tier: 'cup',      region: 'Spain',   group: 'spain'    },
  // Italian
  { key: 'Serie A',               short: 'Serie A',         tier: 'league',   region: 'Italy',   group: 'italy'    },
  { key: 'Coppa Italia',          short: 'Coppa Italia',    tier: 'cup',      region: 'Italy',   group: 'italy'    },
  // German
  { key: 'Bundesliga',            short: 'Bundesliga',      tier: 'league',   region: 'Germany', group: 'germany'  },
  { key: 'DFB-Pokal',             short: 'DFB-Pokal',       tier: 'cup',      region: 'Germany', group: 'germany'  },
  // French
  { key: 'Ligue 1',               short: 'Ligue 1',         tier: 'league',   region: 'France',  group: 'france'   },
  { key: 'Coupe de France',       short: 'Coupe de France', tier: 'cup',      region: 'France',  group: 'france'   },
]

// ─── COUNTRY ECOSYSTEM FILTER ─────────────────────────────────────────────────
// Maps country pill label → HISTORY_COMPETITIONS group key.
// Used by History.jsx to resolve which competitions belong to a country.
export const COUNTRY_ECOSYSTEM = [
  { label: 'All',     group: 'all'      },
  { label: 'England', group: 'england'  },
  { label: 'Spain',   group: 'spain'    },
  { label: 'Italy',   group: 'italy'    },
  { label: 'Germany', group: 'germany'  },
  { label: 'France',  group: 'france'   },
]

// Helper: given a country group and a competition type tier, return matching
// competition keys. Handles AND logic for combined filters.
//   group: 'all' | 'england' | 'spain' | 'italy' | 'germany' | 'france'
//   tier:  'all' | 'european' | 'league' | 'cup'
// When group === 'all' and tier === 'all', returns all competition keys.
// When group is a country, European competitions are EXCLUDED (they have group='european').
export function resolveCompetitionKeys(group, tier) {
  return HISTORY_COMPETITIONS
    .filter(c => {
      const groupMatch = group === 'all' || c.group === group
      const tierMatch  = tier === 'all'  || c.tier === tier
      return groupMatch && tierMatch
    })
    .map(c => c.key)
}

// League competition keys — used by isLeague check in UI
export const LEAGUE_KEYS = new Set(
  HISTORY_COMPETITIONS.filter(c => c.tier === 'league').map(c => c.key)
)

// ─── SEASON SORT ──────────────────────────────────────────────────────────────
function seasonSortKey(s) {
  const raw = typeof s.year === 'string' ? s.year.trim() : ''
  const n = parseInt(raw.slice(0, 4), 10)
  return Number.isFinite(n) ? n : 0
}

// ─── CUP ENTRY BUILDER ───────────────────────────────────────────────────────
// Reusable builder for any cup-style competition.
// Returns a HistoryEntry or null if no data to show.
// Parameters:
//   base         — { seasonId, seasonLabel, seasonYear, season }
//   competition  — competition key string
//   clubName     — active club name
//   fcResult     — season field for FC Richport's result (e.g. s.faCupResult)
//   winner       — season field for winner name (e.g. s.faCupWinner)
//   finalOpponent— season field for final opponent (e.g. s.faCupFinalOpponent)
//   finalScore   — season field for final score (e.g. s.faCupFinalScore)
function buildCupEntry(base, competition, clubName, fcResult, winner, finalOpponent, finalScore) {
  // Only generate an entry if FC Richport had a result or a winner is recorded
  if (!fcResult && !winner) return null

  const fcWon    = fcResult === 'Winner'
  const winnerName = fcWon ? clubName : (winner || null)
  const fcRU     = fcResult === 'Final' && !fcWon
  const runnerUp = fcWon
    ? (finalOpponent || null)
    : (fcRU ? clubName : (finalOpponent || null))

  return {
    ...base,
    competition,
    winner:             winnerName,
    runnerUp,
    finalScore:         finalScore || null,
    fcRichportWon:      fcWon,
    fcRichportRunnerUp: fcRU,
    fcRichportPosition: null,
    leaguePts:          null,
    leagueRecord:       null,
    leagueTop5:         null,
    hasData:            !!winnerName,
  }
}

// ─── MAIN DERIVATION ──────────────────────────────────────────────────────────
// Returns an array of HistoryEntry objects, one per competition per season.
//
// HistoryEntry shape:
//   {
//     seasonId, seasonLabel, seasonYear, season,
//     competition,        — key from HISTORY_COMPETITIONS
//     winner,             — string or null
//     runnerUp,           — string or null
//     finalScore,         — string or null
//     fcRichportWon,      — boolean
//     fcRichportRunnerUp, — boolean
//     fcRichportPosition, — number or null (league finish)
//     leaguePts,          — number or null
//     leagueRecord,       — string or null (e.g. "29W 7D 2L")
//     leagueTop5,         — array or null [{position,club,pts,w,d,l,gf,ga}]
//     hasData,            — boolean: false = entry exists but no winner recorded
//   }

export function deriveHistoryFromSeasons(seasons, clubName = 'FC Richport') {
  if (!seasons || seasons.length === 0) return []

  const sorted = [...seasons].sort((a, b) => seasonSortKey(a) - seasonSortKey(b))
  const entries = []

  for (const s of sorted) {
    const base = {
      seasonId:    s.id,
      seasonLabel: s.label || '?',
      seasonYear:  s.year  || '',
      season:      s,
    }

    // ── UEFA CHAMPIONS LEAGUE ───────────────────────────────────────────────
    if (s.uclEntered || s.uclResult || s.uclTournamentWinner) {
      let winner = null, fcWon = false, fcRU = false, runnerUp = null
      const finalScore = s.uclFinalScore || null

      if (s.uclResult === 'Champions') {
        winner   = clubName
        fcWon    = true
        runnerUp = s.uclFinalOpponent || null
      } else if (s.uclTournamentWinner) {
        winner = s.uclTournamentWinner
        if (s.uclResult === 'Runners-Up') {
          fcRU     = true
          runnerUp = clubName
        } else {
          runnerUp = s.uclFinalOpponent || null
        }
      }
      // If only uclEntered/uclResult with no winner, hasData = false (graceful)

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
        leagueTop5:         null,
        hasData:            !!winner,
      })
    }

    // ── UEFA EUROPA LEAGUE (future field: s.uelWinner / s.uelResult) ────────
    if (s.uelResult || s.uelWinner) {
      const entry = buildCupEntry(
        base, 'UEFA Europa League', clubName,
        s.uelResult, s.uelWinner, s.uelFinalOpponent, s.uelFinalScore
      )
      if (entry) entries.push(entry)
    }

    // ── UEFA CONFERENCE LEAGUE (future: s.ueclWinner / s.ueclResult) ────────
    if (s.ueclResult || s.ueclWinner) {
      const entry = buildCupEntry(
        base, 'UEFA Conference League', clubName,
        s.ueclResult, s.ueclWinner, s.ueclFinalOpponent, s.ueclFinalScore
      )
      if (entry) entries.push(entry)
    }

    // ── DOMESTIC LEAGUE ─────────────────────────────────────────────────────
    if (s.leagueCompetition) {
      const pos   = s.leaguePosition
      const fcWon = pos === 1
      // Only know the winner if FC Richport won; otherwise "Not recorded"
      const winner = fcWon ? clubName : null

      const pts = s.leaguePts ?? null
      let leagueRecord = null
      if (s.leagueW != null || s.leagueD != null) {
        const parts = []
        if (s.leagueW != null) parts.push(`${s.leagueW}W`)
        if (s.leagueD != null) parts.push(`${s.leagueD}D`)
        if (s.leagueL != null) parts.push(`${s.leagueL}L`)
        leagueRecord = parts.join(' ') || null
      }

      // leagueTop5: future upload field — read as-is if present, null otherwise
      const top5 = Array.isArray(s.leagueTop5) && s.leagueTop5.length > 0
        ? s.leagueTop5
        : null

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
        leagueTop5:         top5,
        hasData:            !!winner,
      })
    }

    // ── FA CUP ─────────────────────────────────────────────────────────────
    if (s.faCupResult || s.faCupWinner) {
      const entry = buildCupEntry(
        base, 'FA Cup', clubName,
        s.faCupResult, s.faCupWinner, s.faCupFinalOpponent, s.faCupFinalScore
      )
      if (entry) entries.push(entry)
    }

    // ── CARABAO CUP ────────────────────────────────────────────────────────
    if (s.carabaoCupResult || s.carabaoCupWinner) {
      const entry = buildCupEntry(
        base, 'Carabao Cup', clubName,
        s.carabaoCupResult, s.carabaoCupWinner, s.carabaoCupFinalOpponent, s.carabaoCupFinalScore
      )
      if (entry) entries.push(entry)
    }

    // ── COPA DEL REY (future field) ─────────────────────────────────────────
    if (s.copaDelReyResult || s.copaDelReyWinner) {
      const entry = buildCupEntry(
        base, 'Copa del Rey', clubName,
        s.copaDelReyResult, s.copaDelReyWinner, s.copaDelReyFinalOpponent, s.copaDelReyFinalScore
      )
      if (entry) entries.push(entry)
    }

    // ── COPPA ITALIA (future field) ─────────────────────────────────────────
    if (s.coppaItaliaResult || s.coppaItaliaWinner) {
      const entry = buildCupEntry(
        base, 'Coppa Italia', clubName,
        s.coppaItaliaResult, s.coppaItaliaWinner, s.coppaItaliaFinalOpponent, s.coppaItaliaFinalScore
      )
      if (entry) entries.push(entry)
    }

    // ── DFB-POKAL (future field) ────────────────────────────────────────────
    if (s.dfbPokalResult || s.dfbPokalWinner) {
      const entry = buildCupEntry(
        base, 'DFB-Pokal', clubName,
        s.dfbPokalResult, s.dfbPokalWinner, s.dfbPokalFinalOpponent, s.dfbPokalFinalScore
      )
      if (entry) entries.push(entry)
    }

    // ── COUPE DE FRANCE (future field) ─────────────────────────────────────
    if (s.coupeDeFranceResult || s.coupeDeFranceWinner) {
      const entry = buildCupEntry(
        base, 'Coupe de France', clubName,
        s.coupeDeFranceResult, s.coupeDeFranceWinner, s.coupeDeFranceFinalOpponent, s.coupeDeFranceFinalScore
      )
      if (entry) entries.push(entry)
    }
  }

  return entries
}

// ─── TREBLES ──────────────────────────────────────────────────────────────────
// Detects seasons where any club won UCL + domestic league + domestic cup.
// Only counts entries where hasData === true.
// Returns: [{ seasonLabel, seasonYear, club, competitions }]

const DOMESTIC_LEAGUES = new Set(['Premier League','La Liga','Serie A','Bundesliga','Ligue 1','English Championship'])
const DOMESTIC_CUPS    = new Set(['FA Cup','Carabao Cup','Copa del Rey','Coppa Italia','DFB-Pokal','Coupe de France'])

export function detectTrebles(historyEntries) {
  const bySeason = {}
  for (const e of historyEntries) {
    if (!e.winner || !e.hasData) continue
    if (!bySeason[e.seasonId]) bySeason[e.seasonId] = {
      seasonLabel: e.seasonLabel,
      seasonYear:  e.seasonYear,
      byClub: {},
    }
    const club = e.winner
    if (!bySeason[e.seasonId].byClub[club]) bySeason[e.seasonId].byClub[club] = []
    bySeason[e.seasonId].byClub[club].push(e.competition)
  }

  const trebles = []
  for (const seasonData of Object.values(bySeason)) {
    for (const [club, comps] of Object.entries(seasonData.byClub)) {
      const hasUCL    = comps.includes('UEFA Champions League')
      const hasLeague = comps.some(c => DOMESTIC_LEAGUES.has(c))
      const hasCup    = comps.some(c => DOMESTIC_CUPS.has(c))
      if (hasUCL && hasLeague && hasCup) {
        trebles.push({ seasonLabel: seasonData.seasonLabel, seasonYear: seasonData.seasonYear, club, competitions: comps })
      }
    }
  }
  return trebles.sort((a, b) => a.seasonLabel.localeCompare(b.seasonLabel, undefined, { numeric: true }))
}

// ─── BACK-TO-BACK UCL ────────────────────────────────────────────────────────
// Detects clubs that won the UCL in consecutive recorded season labels.
// "Consecutive" = S(N) followed by S(N+1) with no gap in between.
// Returns: [{ club, seasons: ['S2','S3'] }]
// If no back-to-back exists, returns [].

export function detectBackToBackUCL(historyEntries) {
  // Build ordered list of UCL winners by season label
  const uclWins = historyEntries
    .filter(e => e.competition === 'UEFA Champions League' && e.hasData && e.winner)
    .sort((a, b) => a.seasonLabel.localeCompare(b.seasonLabel, undefined, { numeric: true }))

  if (uclWins.length < 2) return []

  // Extract numeric season number from label (e.g. "S3" → 3)
  function seasonNum(label) {
    const m = label.match(/^S(\d+)$/i)
    return m ? parseInt(m[1], 10) : null
  }

  const results = []
  for (let i = 0; i < uclWins.length - 1; i++) {
    const current = uclWins[i]
    const next    = uclWins[i + 1]
    const nCurrent = seasonNum(current.seasonLabel)
    const nNext    = seasonNum(next.seasonLabel)
    // Must be same club AND consecutive season numbers (N and N+1)
    if (
      current.winner === next.winner &&
      nCurrent !== null && nNext !== null &&
      nNext === nCurrent + 1
    ) {
      // Could be a run of 3+ — extend if so
      const existing = results.find(
        r => r.club === current.winner && r.seasons.includes(current.seasonLabel)
      )
      if (existing) {
        if (!existing.seasons.includes(next.seasonLabel)) {
          existing.seasons.push(next.seasonLabel)
        }
      } else {
        results.push({ club: current.winner, seasons: [current.seasonLabel, next.seasonLabel] })
      }
    }
  }
  return results
}

// ─── ERA LEADERS ─────────────────────────────────────────────────────────────
// Ranks clubs by total recorded titles. Returns top N.

export function computeEraLeaders(historyEntries, topN = 5) {
  const map = {}
  for (const e of historyEntries) {
    if (!e.winner || !e.hasData) continue
    if (!map[e.winner]) map[e.winner] = { club: e.winner, total: 0, byCompetition: {} }
    map[e.winner].total++
    map[e.winner].byCompetition[e.competition] = (map[e.winner].byCompetition[e.competition] || 0) + 1
  }
  return Object.values(map)
    .sort((a, b) => b.total !== a.total ? b.total - a.total : a.club.localeCompare(b.club))
    .slice(0, topN)
}

// ─── FC RICHPORT INVOLVEMENT ──────────────────────────────────────────────────

export function filterFCRichportInvolvement(historyEntries) {
  return historyEntries.filter(e =>
    e.fcRichportWon ||
    e.fcRichportRunnerUp ||
    (e.fcRichportPosition != null && e.fcRichportPosition <= 5)
  )
}

// ─── COMPETITION DETAIL ───────────────────────────────────────────────────────

export function getCompetitionHistory(historyEntries, competition) {
  return historyEntries
    .filter(e => e.competition === competition)
    .sort((a, b) => a.seasonLabel.localeCompare(b.seasonLabel, undefined, { numeric: true }))
}

// ─── SEASON LABELS ────────────────────────────────────────────────────────────

export function getSeasonLabels(historyEntries) {
  const labels = [...new Set(historyEntries.map(e => e.seasonLabel))]
  return labels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
}
