// ─── UCL UTILITIES ─────────────────────────────────────────────────────────────
// Shared computation helpers for the UCL section.
// All functions are pure / read-only. No Firestore writes.
// Data flows in from UCL/index.jsx which loads once and passes down to all tabs.
//
// ─── DATA MODEL NOTES ────────────────────────────────────────────────────────
// Match docs: clubId, seasonId, competition (UCL_LP | UCL_R16 | UCL_QF | UCL_SF | UCL_Final),
//   round (MD1-MD8 for LP; QF/SF/Final for KO), leg (1|2), score_for, score_against,
//   home_away (H/A/N), opponent, opponentKey
//
// Season docs: uclEntered, uclResult ('Champions'|'Runners-Up'|'SF'|'QF'|'R16'|'Playoff'|'LP Only'),
//   uclFinalOpponent, uclFinalScore, uclLeaguePhasePosition, uclLPP/W/D/L/GF/GA/Pts,
//   uclR16/QF/SF Opponent+Score
//
// Player docs (Path A): uclApps, uclGoals, uclAssists, uclCleanSheets (top-level totals)
//   seasonStats[] (embedded array) — each entry has uclApps, uclGoals, uclAssists, uclCleanSheets
//
// Opponents map: opponentKey → { displayName, country, sofifaTeamId, crestUrl, ... }

// ─── COMPETITION CODES ────────────────────────────────────────────────────────
export const UCL_COMPS = new Set(['UCL_LP', 'UCL_R16', 'UCL_QF', 'UCL_SF', 'UCL_Final'])
export const UCL_KO_COMPS = ['UCL_R16', 'UCL_QF', 'UCL_SF', 'UCL_Final']

export const ROUND_LABELS = {
  UCL_LP:    'League Phase',
  UCL_R16:   'Round of 16',
  UCL_QF:    'Quarter-Final',
  UCL_SF:    'Semi-Final',
  UCL_Final: 'Final',
}

export const ROUND_SHORT = {
  UCL_LP:    'LP',
  UCL_R16:   'R16',
  UCL_QF:    'QF',
  UCL_SF:    'SF',
  UCL_Final: 'Final',
}

// ─── NATION → LEAGUE MAPPING ──────────────────────────────────────────────────
// Used to infer the domestic league from an opponent's country field.
// Opponents docs have `country` but not `league`. This mapping covers
// all countries that could realistically appear in UCL.
export const NATION_TO_LEAGUE = {
  'England':        'Premier League',
  'Spain':          'La Liga',
  'Germany':        'Bundesliga',
  'Italy':          'Serie A',
  'France':         'Ligue 1',
  'Portugal':       'Primeira Liga',
  'Netherlands':    'Eredivisie',
  'Belgium':        'Belgian Pro League',
  'Scotland':       'Scottish Premiership',
  'Turkey':         'Süper Lig',
  'Greece':         'Super League Greece',
  'Austria':        'Austrian Bundesliga',
  'Switzerland':    'Swiss Super League',
  'Ukraine':        'Ukrainian Premier League',
  'Czech Republic': 'Czech First League',
  'Croatia':        'HNL',
  'Denmark':        'Danish Superliga',
  'Sweden':         'Allsvenskan',
  'Norway':         'Eliteserien',
  'Poland':         'Ekstraklasa',
  'Serbia':         'Serbian SuperLiga',
  'Romania':        'Liga I',
  'Russia':         'Russian Premier League',
  'Cyprus':         'Cypriot First Division',
  'Malta':          'BOV Premier League',
  'Azerbaijan':     'Azerbaijan Premier League',
}

// ─── FILTER ───────────────────────────────────────────────────────────────────
// Returns only UCL match docs from a full match array
export function getUclMatches(allMatches) {
  return allMatches.filter(m => UCL_COMPS.has(m.competition))
}

// Returns only UCL seasons (any season where club participated)
export function getUclSeasons(allSeasons) {
  return allSeasons.filter(s =>
    s.uclEntered ||
    s.uclResult ||
    s.uclR16Opponent ||
    s.uclQFOpponent ||
    s.uclSFOpponent ||
    s.uclFinalOpponent ||
    s.uclLPP != null
  ).sort((a, b) => {
    // Sort ascending by year so S1 < S2 < ... — caller can reverse for display
    const ya = typeof a.year === 'string' ? parseInt(a.year.slice(0, 4), 10) : 0
    const yb = typeof b.year === 'string' ? parseInt(b.year.slice(0, 4), 10) : 0
    return ya - yb
  })
}

// ─── AGGREGATE ────────────────────────────────────────────────────────────────
// Given leg docs (already sorted by leg number), compute aggregate totals
function legAggregate(legs) {
  if (!legs.length) return null
  const totalFor     = legs.reduce((s, m) => s + (m.score_for     ?? 0), 0)
  const totalAgainst = legs.reduce((s, m) => s + (m.score_against ?? 0), 0)
  return { totalFor, totalAgainst }
}

// Compute W/D/L from score pair
function result(sf, sa) {
  if (sf == null || sa == null) return null
  if (sf > sa) return 'W'
  if (sf < sa) return 'L'
  return 'D'
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
// Derives the top-level UCL identity stats for the Overview tab.
// Sources: season docs (for campaign-level results) + match docs (for match stats)
export function deriveUclClubOverview(uclSeasons, uclMatches) {
  const campaigns   = uclSeasons.length
  const titles      = uclSeasons.filter(s => s.uclResult === 'Champions').length
  const finals      = uclSeasons.filter(s => s.uclResult === 'Champions' || s.uclResult === 'Runners-Up').length
  const semis       = uclSeasons.filter(s => s.uclResult === 'SF').length
  const quarters    = uclSeasons.filter(s => s.uclResult === 'QF').length
  const r16s        = uclSeasons.filter(s => s.uclResult === 'R16').length

  const played      = uclMatches.length
  const w           = uclMatches.filter(m => m.score_for  > m.score_against).length
  const d           = uclMatches.filter(m => m.score_for === m.score_against).length
  const l           = uclMatches.filter(m => m.score_for  < m.score_against).length
  const gf          = uclMatches.reduce((s, m) => s + (m.score_for  || 0), 0)
  const ga          = uclMatches.reduce((s, m) => s + (m.score_against || 0), 0)

  // Best finish — ranked by importance
  const FINISH_RANK = { 'Champions': 0, 'Runners-Up': 1, 'SF': 2, 'QF': 3, 'R16': 4, 'Playoff': 5, 'LP Only': 6 }
  const bestFinish = uclSeasons.reduce((best, s) => {
    if (!s.uclResult) return best
    if (!best) return s.uclResult
    return (FINISH_RANK[s.uclResult] ?? 99) < (FINISH_RANK[best] ?? 99) ? s.uclResult : best
  }, null)

  // Biggest UCL win (by goal difference, then goals scored)
  const biggestWin = uclMatches
    .filter(m => m.score_for > m.score_against)
    .sort((a, b) => {
      const gdA = (a.score_for - a.score_against)
      const gdB = (b.score_for - b.score_against)
      if (gdB !== gdA) return gdB - gdA
      return (b.score_for || 0) - (a.score_for || 0)
    })[0] || null

  // Worst UCL loss (by goal difference, then goals against)
  const worstLoss = uclMatches
    .filter(m => m.score_for < m.score_against)
    .sort((a, b) => {
      const gdA = (a.score_for - a.score_against)
      const gdB = (b.score_for - b.score_against)
      if (gdA !== gdB) return gdA - gdB  // most negative first
      return (b.score_against || 0) - (a.score_against || 0)
    })[0] || null

  // Most common UCL opponent (by match count)
  const oppCount = {}
  for (const m of uclMatches) {
    const key = m.opponentKey || m.opponent || 'Unknown'
    oppCount[key] = (oppCount[key] || 0) + 1
  }
  const mostCommonOppKey = Object.entries(oppCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  return {
    campaigns, titles, finals, semis, quarters, r16s,
    played, w, d, l, gf, ga, gd: gf - ga,
    bestFinish,
    biggestWin,
    worstLoss,
    mostCommonOppKey,
    winRate: played > 0 ? ((w / played) * 100).toFixed(0) : '0',
  }
}

// ─── SEASON SUMMARIES ─────────────────────────────────────────────────────────
// Builds a rich summary for each UCL campaign for the Seasons tab.
// Prefers match docs for KO path detail; falls back to season doc fields.
export function deriveUclSeasonSummaries(uclSeasons, uclMatches) {
  return uclSeasons.map(s => {
    const sMatches = uclMatches.filter(m => m.seasonId === s.id)

    // LP stats from match docs if available, else season doc
    const lpMatches = sMatches.filter(m => m.competition === 'UCL_LP')
    const hasLPDocs = lpMatches.length > 0

    const lpRecord = hasLPDocs ? (() => {
      const lw = lpMatches.filter(m => m.score_for  > m.score_against).length
      const ld = lpMatches.filter(m => m.score_for === m.score_against).length
      const ll = lpMatches.filter(m => m.score_for  < m.score_against).length
      const lgf = lpMatches.reduce((t, m) => t + (m.score_for     || 0), 0)
      const lga = lpMatches.reduce((t, m) => t + (m.score_against || 0), 0)
      return { p: lpMatches.length, w: lw, d: ld, l: ll, gf: lgf, ga: lga }
    })() : (s.uclLPP != null ? {
      p: s.uclLPP, w: s.uclLPW, d: s.uclLPD, l: s.uclLPL, gf: s.uclLPGF, ga: s.uclLPGA
    } : null)

    // KO path: compute from match docs per round
    const koPath = UCL_KO_COMPS.map(comp => {
      const legs = sMatches
        .filter(m => m.competition === comp)
        .sort((a, b) => (a.leg ?? 0) - (b.leg ?? 0))
      if (!legs.length) return null
      const agg = legAggregate(legs)
      const res = agg ? result(agg.totalFor, agg.totalAgainst) : null
      const opp = legs[0]?.opponent || null
      const oppKey = legs[0]?.opponentKey || null
      return { comp, label: ROUND_SHORT[comp], legs, agg, res, opp, oppKey }
    }).filter(Boolean)

    // Total match stats for this season
    const allSMatches = sMatches
    const sw  = allSMatches.filter(m => m.score_for  > m.score_against).length
    const sd  = allSMatches.filter(m => m.score_for === m.score_against).length
    const sl  = allSMatches.filter(m => m.score_for  < m.score_against).length
    const sgf = allSMatches.reduce((t, m) => t + (m.score_for     || 0), 0)
    const sga = allSMatches.reduce((t, m) => t + (m.score_against || 0), 0)

    // Biggest win this season
    const biggestWin = allSMatches
      .filter(m => m.score_for > m.score_against)
      .sort((a, b) => {
        const gdA = a.score_for - a.score_against
        const gdB = b.score_for - b.score_against
        if (gdB !== gdA) return gdB - gdA
        return (b.score_for || 0) - (a.score_for || 0)
      })[0] || null

    return {
      season: s,
      lpRecord,
      koPath,
      matchRecord: { p: allSMatches.length, w: sw, d: sd, l: sl, gf: sgf, ga: sga },
      biggestWin,
    }
  })
}

// ─── KNOCKOUT ROUND RECORDS ───────────────────────────────────────────────────
// Leg record: each match leg counts individually (standard UCL stat approach)
// Tie record: grouped by seasonId+competition pair → advanced/eliminated
export function deriveUclKnockoutRoundRecords(uclMatches) {
  const koMatches = uclMatches.filter(m => m.competition !== 'UCL_LP')

  // Per-round leg record
  const legRecord = {}
  for (const comp of UCL_KO_COMPS) {
    const legs = koMatches.filter(m => m.competition === comp)
    const w  = legs.filter(m => m.score_for  > m.score_against).length
    const d  = legs.filter(m => m.score_for === m.score_against).length
    const l  = legs.filter(m => m.score_for  < m.score_against).length
    const gf = legs.reduce((s, m) => s + (m.score_for     || 0), 0)
    const ga = legs.reduce((s, m) => s + (m.score_against || 0), 0)
    legRecord[comp] = { label: ROUND_LABELS[comp], short: ROUND_SHORT[comp], p: legs.length, w, d, l, gf, ga, gd: gf - ga }
  }

  // Tie record: group legs by seasonId+competition → compute aggregate → advanced/eliminated
  const tieMap = {}
  for (const m of koMatches) {
    const key = `${m.seasonId}::${m.competition}`
    if (!tieMap[key]) tieMap[key] = { comp: m.competition, legs: [] }
    tieMap[key].legs.push(m)
  }
  const tieRecord = {}
  for (const comp of UCL_KO_COMPS) {
    const ties = Object.values(tieMap).filter(t => t.comp === comp)
    let advanced = 0, eliminated = 0
    for (const tie of ties) {
      const agg = legAggregate(tie.legs)
      if (!agg) continue
      if (agg.totalFor > agg.totalAgainst) advanced++
      else if (agg.totalFor < agg.totalAgainst) eliminated++
      // exact draw aggregate — edge case, treat as eliminated (extra time/pens not tracked)
      else eliminated++
    }
    tieRecord[comp] = {
      label: ROUND_LABELS[comp],
      short: ROUND_SHORT[comp],
      ties: ties.length,
      advanced,
      eliminated,
    }
  }

  // LP record (flat, no tie concept)
  const lpMatches = uclMatches.filter(m => m.competition === 'UCL_LP')
  const lpW  = lpMatches.filter(m => m.score_for  > m.score_against).length
  const lpD  = lpMatches.filter(m => m.score_for === m.score_against).length
  const lpL  = lpMatches.filter(m => m.score_for  < m.score_against).length
  const lpGF = lpMatches.reduce((s, m) => s + (m.score_for     || 0), 0)
  const lpGA = lpMatches.reduce((s, m) => s + (m.score_against || 0), 0)
  const lpRecord = { label: 'League Phase', short: 'LP', p: lpMatches.length, w: lpW, d: lpD, l: lpL, gf: lpGF, ga: lpGA, gd: lpGF - lpGA }

  // KO total (all non-LP matches)
  const koW  = koMatches.filter(m => m.score_for  > m.score_against).length
  const koD  = koMatches.filter(m => m.score_for === m.score_against).length
  const koL  = koMatches.filter(m => m.score_for  < m.score_against).length
  const koGF = koMatches.reduce((s, m) => s + (m.score_for     || 0), 0)
  const koGA = koMatches.reduce((s, m) => s + (m.score_against || 0), 0)
  const koTotal = { label: 'Knockout Total', short: 'KO', p: koMatches.length, w: koW, d: koD, l: koL, gf: koGF, ga: koGA, gd: koGF - koGA }

  return { legRecord, tieRecord, lpRecord, koTotal }
}

// ─── FINALS LOG ───────────────────────────────────────────────────────────────
// Derives a list of UCL finals with full detail for display
export function deriveUclFinals(uclSeasons, uclMatches, opponents) {
  return uclSeasons
    .filter(s => s.uclResult === 'Champions' || s.uclResult === 'Runners-Up')
    .sort((a, b) => {
      const ya = typeof a.year === 'string' ? parseInt(a.year.slice(0, 4), 10) : 0
      const yb = typeof b.year === 'string' ? parseInt(b.year.slice(0, 4), 10) : 0
      return ya - yb
    })
    .map(s => {
      // Prefer match doc data for score; fall back to season doc
      const finalLegs = uclMatches.filter(m => m.seasonId === s.id && m.competition === 'UCL_Final')
      let score = s.uclFinalScore || null
      let oppKey = null
      let oppDisplay = s.uclFinalOpponent || null

      if (finalLegs.length > 0) {
        const agg = legAggregate(finalLegs)
        if (agg) score = `${agg.totalFor}–${agg.totalAgainst}`
        oppKey = finalLegs[0]?.opponentKey || null
        if (oppKey && opponents?.has(oppKey)) {
          oppDisplay = opponents.get(oppKey).displayName || oppDisplay
        } else {
          oppDisplay = finalLegs[0]?.opponent || oppDisplay
        }
      } else if (s.uclFinalOpponent) {
        // Try to resolve via opponents map by name match as fallback
        oppDisplay = s.uclFinalOpponent
      }

      const crest = oppKey && opponents?.has(oppKey) ? (opponents.get(oppKey).crestUrl || null) : null

      return {
        seasonId:    s.id,
        seasonLabel: s.label,
        year:        s.year,
        result:      s.uclResult,
        opponent:    oppDisplay,
        oppKey,
        crest,
        score,
      }
    })
}

// ─── UCL PLAYER STATS ─────────────────────────────────────────────────────────
// Derives UCL career totals from player docs (Path A — embedded seasonStats / top-level fields).
// This is intentionally Path A only for v50 main table — complete across all seasons.
// Path B (scope=UCL seasonStats collection) is used for per-season drilldowns in v51.
export function deriveUclPlayerStats(players) {
  return players
    .filter(p => !p.isHistoricalStub)
    .map(p => {
      // Prefer summing from embedded seasonStats UCL fields (most accurate)
      // Fall back to top-level uclApps/uclGoals/uclAssists if no embedded array
      let uclApps = 0, uclGoals = 0, uclAssists = 0, uclCleanSheets = 0
      if (p.seasonStats?.length) {
        for (const ss of p.seasonStats) {
          uclApps        += ss.uclApps        || 0
          uclGoals       += ss.uclGoals       || 0
          uclAssists     += ss.uclAssists     || 0
          uclCleanSheets += ss.uclCleanSheets || 0
        }
      } else {
        uclApps        = p.uclApps        || 0
        uclGoals       = p.uclGoals       || 0
        uclAssists     = p.uclAssists     || 0
        uclCleanSheets = p.uclCleanSheets || 0
      }
      return {
        id:            p.id,
        name:          p.name,
        position:      p.position,
        sofifaId:      p.sofifaId,
        status:        p.status,
        uclApps,
        uclGoals,
        uclAssists,
        uclCleanSheets,
        uclContrib:    uclGoals + uclAssists,
        uclGpg:        uclApps > 0 ? uclGoals   / uclApps : 0,
        uclApg:        uclApps > 0 ? uclAssists / uclApps : 0,
        uclCpg:        uclApps > 0 ? (uclGoals + uclAssists) / uclApps : 0,
      }
    })
    .filter(p => p.uclApps > 0)
}

// ─── UCL RIVALS ───────────────────────────────────────────────────────────────
// Derives rival records from UCL matches only.
// Mirrors getRivalStats() in services.js but scoped to UCL and enriched with opponents map.
export function deriveUclRivals(uclMatches, opponents, seasonLabelMap) {
  const map = {}
  for (const m of uclMatches) {
    const groupKey = m.opponentKey || String(m.opponent || 'unknown').trim().toLowerCase()
    if (!map[groupKey]) {
      map[groupKey] = {
        opponentKey: groupKey,
        opponent:    m.opponent,
        matches:     [],
      }
    }
    map[groupKey].matches.push({
      ...m,
      seasonLabel: seasonLabelMap?.[m.seasonId] || m.seasonLabel || '',
    })
  }

  return Object.values(map).map(r => {
    r.matches.sort((a, b) => {
      const sa = a.seasonLabel || ''
      const sb = b.seasonLabel || ''
      if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true })
      return (a.competition || '').localeCompare(b.competition || '')
    })

    const w  = r.matches.filter(m => m.score_for  > m.score_against).length
    const d  = r.matches.filter(m => m.score_for === m.score_against).length
    const l  = r.matches.filter(m => m.score_for  < m.score_against).length
    const gf = r.matches.reduce((s, m) => s + (m.score_for  || 0), 0)
    const ga = r.matches.reduce((s, m) => s + (m.score_against || 0), 0)

    // Enrich from opponents map
    const rec = opponents?.get(r.opponentKey)
    const displayName = rec?.displayName || r.opponent || r.opponentKey
    const crestUrl    = rec?.crestUrl    || null
    const country     = rec?.country     || null
    const league      = country ? (NATION_TO_LEAGUE[country] || null) : null

    // Knockout meetings
    const koMatches = r.matches.filter(m => m.competition !== 'UCL_LP')
    const finals    = r.matches.filter(m => m.competition === 'UCL_Final')

    return {
      opponentKey: r.opponentKey,
      displayName,
      crestUrl,
      country,
      league,
      matches:     r.matches,
      played:      r.matches.length,
      w, d, l,
      gf, ga,
      gd:          gf - ga,
      koMatches:   koMatches.length,
      finals:      finals.length,
    }
  }).sort((a, b) => {
    if (b.played !== a.played) return b.played - a.played
    if (b.gd !== a.gd) return b.gd - a.gd
    return a.displayName.localeCompare(b.displayName)
  })
}

// ─── UCL LEAGUE/NATION RECORDS ────────────────────────────────────────────────
// Groups UCL matches by opponent country → league.
// Used by v51 Rivals tab league/nation records sub-section.
export function deriveUclLeagueRecords(uclMatches, opponents) {
  const countryMap = {}

  for (const m of uclMatches) {
    const rec     = opponents?.get(m.opponentKey)
    const country = rec?.country || 'Unknown'
    const league  = country !== 'Unknown' ? (NATION_TO_LEAGUE[country] || `${country} (League)`) : 'Unknown'
    const clubKey = m.opponentKey || m.opponent || 'unknown'
    const clubDisplay = rec?.displayName || m.opponent || clubKey

    if (!countryMap[country]) {
      countryMap[country] = { country, league, clubs: new Set(), matches: [] }
    }
    countryMap[country].clubs.add(clubDisplay)
    countryMap[country].matches.push(m)
  }

  return Object.values(countryMap).map(group => {
    const { country, league, clubs, matches } = group
    const w  = matches.filter(m => m.score_for  > m.score_against).length
    const d  = matches.filter(m => m.score_for === m.score_against).length
    const l  = matches.filter(m => m.score_for  < m.score_against).length
    const gf = matches.reduce((s, m) => s + (m.score_for  || 0), 0)
    const ga = matches.reduce((s, m) => s + (m.score_against || 0), 0)
    return {
      country, league,
      clubs:   [...clubs].sort(),
      p:       matches.length,
      w, d, l,
      gf, ga,
      gd:      gf - ga,
    }
  }).sort((a, b) => b.p - a.p)
}

// ─── DETERMINISTIC RIVAL NARRATIVE ───────────────────────────────────────────
// Generates a data-grounded summary sentence from UCL match history.
// No AI, no invented facts. All statements derived directly from match docs.
// clubName: pass activeClub.name — never hardcode a club name here.
export function buildUclRivalNarrative(rival, clubName) {
  const { displayName, matches, played, w, d, l, gf, ga, finals, koMatches } = rival
  const club = clubName || 'Your club'
  if (!played) return null

  const parts = []

  // Base record description
  if (w > l) {
    parts.push(`${club} have a positive record against ${displayName}, winning ${w} of ${played} UCL meetings.`)
  } else if (l > w) {
    parts.push(`${displayName} have had the upper hand against ${club}, winning ${l} of ${played} UCL encounters.`)
  } else {
    parts.push(`${club} and ${displayName} are evenly matched in the UCL, sharing ${played} meetings ${w === 0 ? 'with no wins for either side' : `with ${w} wins each`}.`)
  }

  // Finals
  if (finals > 0) {
    const finalMatches = matches.filter(m => m.competition === 'UCL_Final')
    const finalSeasons = finalMatches
      .map(m => m.seasonLabel)
      .filter(Boolean)
      .join(', ')
    const finalWins = finalMatches.filter(m => m.score_for > m.score_against).length
    if (finalWins === finals) {
      parts.push(`${club} won ${finals === 1 ? 'the' : 'both'} final${finals > 1 ? 's' : ''} between the sides${finalSeasons ? ` (${finalSeasons})` : ''}.`)
    } else if (finalWins === 0) {
      parts.push(`${displayName} won ${finals === 1 ? 'the' : 'both'} final${finals > 1 ? 's' : ''} between the sides${finalSeasons ? ` (${finalSeasons})` : ''}.`)
    } else {
      parts.push(`The sides have met in ${finals} finals${finalSeasons ? ` (${finalSeasons})` : ''}.`)
    }
  }

  // Knockout count if no finals
  if (finals === 0 && koMatches > 0) {
    parts.push(`They have met ${koMatches} time${koMatches > 1 ? 's' : ''} in the knockout rounds.`)
  }

  return parts.join(' ')
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
// Format a scoreline safely
export function fmtScore(sf, sa) {
  if (sf == null || sa == null) return null
  return `${sf}–${sa}`
}

// GD with sign
export function fmtGD(gf, ga) {
  const v = (gf || 0) - (ga || 0)
  if (v > 0) return `+${v}`
  return String(v)
}

// Is GK position
export function isGK(p) {
  const pos = (p.position || '').toUpperCase()
  return pos === 'GK' || pos === 'GOALKEEPER'
}
