// Cache version — bump this number on every deployment.
// Current: 30
// History:
//   1  — initial build (Phase 1 scaffold)
//   2  — Phase 2 Home screen + NavBar
//   3  — Fix GitHub Pages base path + 404 routing
//   4  — Mobile responsiveness audit: logo overflow, header safe-area, 100dvh
//   5  — Seasons list + Season Detail + CreateSeasonModal (Phase 3)
//   6  — Home screen redesign: European Nights visual system (V4.1)
//   7  — Hero typography: Direction C (Inter 800, modern club website identity)
//   8  — Connect real Firebase project (eleven-c44a0) + S1 data seeded
//   9  — Fix GitHub Pages BrowserRouter basename; Seasons + SeasonDetail storytelling redesign
//   10 — European Nights migration: Seasons list + Season Detail
//   11 — Phase 4+5: Players, PlayerProfile, Transfers, Records, Rivals, Museum, SportingDirector
//   12 — (prior)
//   13 — Players + PlayerProfile: use playerFaceUrl from Firestore; silhouette fallback
//   14 — (prior)
//   15 — Data integrity fixes: Home field names, computeRecords sort mutations, transfer seasonId canonical filter, rival normalization, CreateSeasonModal trophy fields
//   16 — Add backfill scripts: backfillTransferSeasonIds, backfillTransferPlayerIds, backfillOpponentKeys
//   17 — Add patchMaatsenTransfer one-time patch script
//   18 — App correctness audit P1–P3: Transfers NavBar, Log Match link, seasonOptions crash, Museum trophy paths, Rivals finals filter, opponent key selection, Seasons UCL filter, Records transfer labels, PlayerProfile empty state, net spend sign, rival badge threshold, season label fallback, SeasonDetail UCL gate
//   19 — Add backfillPlayerTotals script to fix career stat totals seeded from single season only
//   20 — Nav cleanup: 5 primary items + hamburger; bottom sheet for Rivals, Museum, Sporting Director
//   21 — Seasons + SeasonDetail audit: 2-filter (All/UCL), UCL detection fix, uclEntered reliability, trophy shelf won-only, UCL major section (LP terminology), league record default-open, dynasty verdict meter, edit form reorder, key moments separators, arc touch targets, creation CTAs hidden, score clamp
//   22 — Seasons filters removed (clean timeline); SeasonDetail UCL powered by match docs: LP matchday table MD1-MD8, KO leg detail with season-doc fallback
//   23 — Opponent identity + logo layer: opponents collection, opponentMatcher, opponentSeed, backfillOpponents scripts; SeasonDetail UCL canonical names + crests; Rivals canonical names + crests; getOpponents/getOpponent services
//   24 — Players Phase 1: sticky stat table, position/role filters, header sort, Loaned filter removed; PlayerProfile: richer totals, GK-aware stats, All Comps tab, Transfer History tab, seasons-at-club, sofifaId removed from hero, seasonStats sorted newest-first, empty states, sessionStorage list state preservation
//   25 — Players+PlayerProfile Phase 1B: search font-size 16px (iOS zoom fix), status badge removed from list rows, identity column flattened (name+pos inline), PlayerProfile outfield 2x4 stat grid, GK 1x4 stat grid
//   26 — Players Phase 2: add getSeasonStatsByPlayer service; PlayerProfile reads seasonStats collection by scope; UCL per-season table; removed player.seasonStats embedded-array assumption
//   27 — PlayerProfile debug fix: label join from seasons collection, tabs before grid, tab-gated stat grids
//   28 — Fix getSeasonStatsByPlayer: query playerId-only; client-side clubId filter tolerates absent clubId
//   29 — Fix getSeasonStatsByPlayer: remove clubId filter entirely; playerId is club-scoped
//   30 — Fix PlayerProfile All Comps: restore player.seasonStats embedded array as data source (original working path); UCL tab reads seasonStats collection scope=UCL with seasons label join; two data paths now independent and cannot interfere
const SW_VERSION = 30;
