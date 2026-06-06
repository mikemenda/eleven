// Cache version — bump this number on every deployment.
// Current: 18
// History:
//   1 — initial build (Phase 1 scaffold)
//   2 — Phase 2 Home screen + NavBar
//   3 — Fix GitHub Pages base path + 404 routing
//   4 — Mobile responsiveness audit: logo overflow, header safe-area, 100dvh
//   5 — Seasons list + Season Detail + CreateSeasonModal (Phase 3)
//   6 — Home screen redesign: European Nights visual system (V4.1)
//   7 — Hero typography: Direction C (Inter 800, modern club website identity)
//   8 — Connect real Firebase project (eleven-c44a0) + S1 data seeded
//   9 — Fix GitHub Pages BrowserRouter basename; Seasons + SeasonDetail storytelling redesign
//   10 — European Nights migration: Seasons list + Season Detail
//   11 — Phase 4+5: Players, PlayerProfile, Transfers, Records, Rivals, Museum, SportingDirector
//   12 — (prior)
//   13 — Players + PlayerProfile: use playerFaceUrl from Firestore; silhouette fallback
//   14 — (prior)
//   15 — Data integrity fixes: Home field names, computeRecords sort mutations, transfer seasonId canonical filter, rival normalization, CreateSeasonModal trophy fields
//   16 — Add backfill scripts: backfillTransferSeasonIds, backfillTransferPlayerIds, backfillOpponentKeys
//   17 — Add patchMaatsenTransfer one-time patch script
//   18 — App correctness audit P1–P3: Transfers NavBar, Log Match link, seasonOptions crash, Museum trophy paths, Rivals finals filter, opponent key selection, Seasons UCL filter, Records transfer labels, PlayerProfile empty state, net spend sign, rival badge threshold, season label fallback, SeasonDetail UCL gate
const SW_VERSION = 18;
