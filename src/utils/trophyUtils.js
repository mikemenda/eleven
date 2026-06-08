// ─── TROPHY UTILITIES ────────────────────────────────────────────────────────
// Single source of truth for competition registry and trophy derivation.
//
// DATA PATH DECISION (v45):
//   Season documents are the primary source of truth for trophies.
//   The Firestore `trophies` collection is NOT used for Museum or Home.
//   It remains in services.js for potential future use (e.g. manual overrides).
//
// HOW TO ADD A NEW COMPETITION:
//   1. Add an entry to TROPHY_REGISTRY below.
//   2. Add derivation logic to deriveTrophiesFromSeasons() below.
//   3. Add the relevant result field to SeasonDetail's form + formToDoc.

// ─── REGISTRY ─────────────────────────────────────────────────────────────────
// Canonical competition list. Used by Museum (grid) and Home (cabinet).
// `key` must match the string stored in season docs (leagueCompetition, etc.)
export const TROPHY_REGISTRY = [
  { key: 'UEFA Champions League',   short: 'Champions League', tier: 'elite',    region: 'Europe'  },
  { key: 'Premier League',          short: 'Premier League',   tier: 'league',   region: 'England' },
  { key: 'English Championship',    short: 'Championship',     tier: 'league',   region: 'England' },
  { key: 'La Liga',                 short: 'La Liga',          tier: 'league',   region: 'Spain'   },
  { key: 'Bundesliga',              short: 'Bundesliga',       tier: 'league',   region: 'Germany' },
  { key: 'UEFA Europa League',      short: 'Europa League',    tier: 'european', region: 'Europe'  },
  { key: 'UEFA Conference League',  short: 'Conference',       tier: 'european', region: 'Europe'  },
  { key: 'FA Cup',                  short: 'FA Cup',           tier: 'cup',      region: 'England' },
  { key: 'Carabao Cup',             short: 'Carabao Cup',      tier: 'cup',      region: 'England' },
  { key: 'Copa del Rey',            short: 'Copa del Rey',     tier: 'cup',      region: 'Spain'   },
  { key: 'DFB-Pokal',               short: 'DFB-Pokal',        tier: 'cup',      region: 'Germany' },
]

export const TIER_ORDER = ['elite', 'league', 'european', 'cup']

// ─── DERIVATION ───────────────────────────────────────────────────────────────
// Derives the full list of trophies won from season documents.
//
// Returns an array of objects: { competition, seasonId, seasonLabel, season }
//   - competition:  canonical key matching TROPHY_REGISTRY
//   - seasonId:     Firestore season document ID
//   - seasonLabel:  display label e.g. "S1"
//   - season:       the full season object (for detail views — finals data etc.)
//
// Seasons are expected in the order returned by getSeasons() (year desc).
// The returned array is sorted oldest-first (ascending year) for timeline display.
//
// TODO — UEL / UECL:
//   These competitions cannot yet be derived from season data because SeasonDetail
//   has no form fields for uclELResult / uclECLResult. Until those fields are added
//   to the season edit form and formToDoc, UEL/UECL wins must be added manually to
//   the Firestore `trophies` collection and retrieved separately if needed.
//   When SeasonDetail supports them, add derivation here:
//     if (s.uclELResult === 'Winner')
//       push({ competition: 'UEFA Europa League', ... })
//     if (s.uclECLResult === 'Winner')
//       push({ competition: 'UEFA Conference League', ... })

// Parse a season's year string ("YYYY/YY" format, enforced by CreateSeasonModal's YEAR_RE)
// into a sortable integer. Returns 0 for any season where year is missing or malformed
// so those seasons sink to the bottom rather than throwing or producing NaN.
function seasonSortKey(s) {
  const raw = typeof s.year === 'string' ? s.year.trim() : ''
  // Expected: "2027/28". Take first 4 chars and parse.
  // Guard: if result is NaN (empty string, wrong format), return 0.
  const n = parseInt(raw.slice(0, 4), 10)
  return Number.isFinite(n) ? n : 0
}

export function deriveTrophiesFromSeasons(seasons) {
  const result = []

  // Sort a copy oldest-first. getSeasons() returns year desc, so we re-sort here.
  // Using seasonSortKey() rather than raw string sort because:
  //   - Firestore orderBy('year') is lexicographic and works for YYYY/YY, but
  //     client-side we want a single defensive numeric path regardless of call site.
  //   - NaN-safe: malformed or missing year fields go to position 0, not crash.
  const sorted = [...seasons].sort((a, b) => seasonSortKey(a) - seasonSortKey(b))

  for (const s of sorted) {
    const base = { seasonId: s.id, seasonLabel: s.label, season: s }

    // League title — leaguePosition === 1
    if (s.leaguePosition === 1 && s.leagueCompetition) {
      result.push({ ...base, competition: s.leagueCompetition })
    }

    // UEFA Champions League
    if (s.uclResult === 'Champions') {
      result.push({ ...base, competition: 'UEFA Champions League' })
    }

    // FA Cup
    if (s.faCupResult === 'Winner') {
      result.push({ ...base, competition: 'FA Cup' })
    }

    // Carabao Cup
    if (s.carabaoCupResult === 'Winner') {
      result.push({ ...base, competition: 'Carabao Cup' })
    }

    // NOTE: UEL and UECL are not derived here — see TODO above.
  }

  return result
}

// ─── HISTORY HELPERS (future use) ────────────────────────────────────────────
// These are designed for a future separate History page, not Club Museum.
// History = all recorded competition winners by season (not just FC Richport wins).
//
// Available season fields for History page:
//   s.uclTournamentWinner    — who won UCL that season (may or may not be the club)
//   s.faCupWinner            — who won FA Cup that season
//   s.carabaoCupWinner       — who won Carabao Cup that season
//   s.leagueCompetition      — which league
//   s.leaguePosition         — finish position (1 = champion)
//
// When History is built, call getSeasons(clubId) and use these fields.
// Club Museum should always remain scoped to FC Richport wins only.
