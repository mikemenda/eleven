// Cache version — bump this number on every deployment.
// Current: 72
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
//   24 — Players Phase 1: sticky stat table, position/role filters, header sort, Loaned filter removed; PlayerProfile: richer totals, GK-aware stats, All Comps tab, Transfer History tab, seasons-at-club, sofifaId removed from hero, sessionStorage list state preservation
//   25 — Players+PlayerProfile Phase 1B: search font-size 16px (iOS zoom fix), status badge removed, identity column flattened, PlayerProfile outfield 2x4 stat grid, GK 1x4 stat grid
//   26 — Players Phase 2: getSeasonStatsByPlayer; PlayerProfile UCL tab reads seasonStats collection scope=UCL; two data paths independent
//   27 — PlayerProfile debug fix: label join from seasons collection, tabs before grid
//   28 — Fix getSeasonStatsByPlayer: query playerId-only; client-side clubId filter tolerates absent clubId
//   29 — Fix getSeasonStatsByPlayer: remove clubId filter entirely
//   30 — Fix PlayerProfile All Comps: restore player.seasonStats embedded array; UCL tab reads seasonStats collection scope=UCL
//   31 — Player Comparison: compare mode; PlayerCompare page with All Comps + UCL tabs
//   32 — PlayerCompare improvements: Compare button on PlayerProfile; single-slot picker sheet
//   33 — Players season filter: multi-select season pills, per-season stat display, summed multi-season stats
//   34 — Transfers: S1 schema migration; dropdown label fix; deterministic window group sort
//   35 — Transfers completion: patchTransferCleanup; TransferRow tap-through to PlayerProfile
//   36 — Fix Transfers stuck loading: remove orderBy from getTransfers
//   37 — Transfers identity layer: player face thumbnails + club crests; transfer-clubs.json
//   38 — Fix transfer-clubs.json: Brighton/Juventus; row layout arrow→face→name/meta→fee→crest
//   39 — Fix transfer-clubs.json: Roma/Tottenham/Brentford; resolveClubIdentity single source
//   40 — Brand asset update: real XI PNG logo; icon set generated from X1_App.png
//   44 — Rivals data reliability: seasonLabel join, chronological sort, Finals filter both fields
//   45 — Standardize trophy data path: trophyUtils.js + deriveTrophiesFromSeasons; Museum/Home both derive from season docs
//   46 — Harden trophy sort (NaN-safe); Museum won-only grid
//   47 — Remove Sporting Director
//   49 — History patch: Back-to-Back UCL, country ecosystem filter, UCL Finals count
//   50 — UCL section: /ucl route, tab shell, uclUtils.js, NATION_TO_LEAGUE
//   51 — UCL complete: Players/Records/Rivals tabs; UclRivals narratives
//   52 — UCL consolidation: 5 tabs; Overview restructured; UclPlayers table; UclRecords Top5Modal
//   53 — UCL fixes: round record table; season/position filters; Top5Modal createPortal; Rivals league table
//   54 — Entry flow design pass: gold/ivory/slate palette; neon green removed; gold selected-card
//   55 — Entry flow polish: gold local buttons; Add Version dark surface; XI mark seal
//   56 — Home redesign: Club Archive hero; Legacy strip; Peak Season; Honours won-only; Dynasty Arc bars; Legends CF Worker faces; Rivals removed; NavBar restructured; Header premium
//   57 — Home/nav corrections: section order; crest 80px; trophy two-line layout; Peak Inter 800; Dynasty text badges; Legends 3 stats, no rank, no green; full typography overhaul; header vertical divider; NavBar useMatch active state; UCL starball redesign
//   58 — Asset polish: real trophy PNGs integrated (12 competitions); UCL nav PNG (transparent white starball, CSS-filtered for active/inactive); --en-gold updated to #E0C27A across global.css + all hardcoded rgba values; Peak Season compacted (single row with eyebrow+S3+score pill, ~40% height reduction); trophyAssets.jsx split into TROPHY_PNG_MAP + SVG fallbacks
//   59 — UCL full design system pass: starball branding in topBar; tab bar Inter fonts; Rivals tab renamed Opponents; mono fonts replaced with Inter except scores; section labels, record titles, filter chips, player positions upgraded to readable #8899aa; Overview stat grid neutral; Results labels with plural logic; Notable rows redesigned; Seasons — Finalist label, gold finals emphasis, Career KO table with short round labels; Players — A/G column, default sort G+A, gold sorted-column, gold active chips; Records — label readability, consistent 120px right panel, units in Top5 modal; Opponents — renamed from Rivals, Inter typography
//   60 — UCL refinement patch: NavBar UCL icon active filter corrected to match #E0C27A; UCL title Inter 800; European Record hero Inter 800 + UCL trophy PNG right-side; WDL hero line removed; Results cards add inline SVG icons; Season card result label back inline-right; Career KO Final row full gold; KO path leg typography improved (sznKOLegRes class, H/A contrast); Players column reorder App G A G+A G/G A/G C/G + App abbreviation; Records — all values gold, cleaned labels (no UCL prefix), reordered career/season, club records with crest + G/G averages, Finals Record removed, season CS/Game added; Opponents — sortable P/W/D/L/GD with gold column highlight, count label readable, league detail GD stat + redesigned match row, tighter club block spacing
//   61 — Records visual alignment: standalone Records page migrated to v60 UCL Records design system; Inter tabs/labels, all values gold, 120px right panel, createPortal modal, OppCrest+RichportMark on Club tab, resolveClubIdentity transfer crests, label/ordering cleanup, acSeason+uclSeason bestCspg added
//   62 — Museum accordion: replaced trophy grid + bottom sheet modal with one-trophy-per-line accordion list; inline expand/collapse with no clipping; trophy PNG left, name/region/count middle, chevron right; region label readability improved (en-text-3); Done button removed
//   63 — Museum refinement: trophy image 2.2x larger (76×120px container); row padding increased for breathing room; hero count line replaced with archive stat line (Inter, no mono tracking) showing "N trophies · N seasons" with derived season count and singular/plural
//   64 — History visual system pass: gold/ivory brand treatment throughout; Inter typography (mono removed); gold active filter chips; FC Richport uses shared RichportMark identity (matches Records.jsx, auto-upgrades with future crestUrl); Finalist badge replaces RU; Won badge gold/Inter; highlight rows gold tint not green; Era Leaders gold title counts; Treble/Back-to-Back UCL badges Inter; spinner gold; header eyebrow Inter; summary stats Inter 700
//   65 — Players visual system pass: green removed throughout (gold/ivory system); Inter typography replaces mono on all labels; filter chips match UCL pill design (gold outline active state, no background fill); sortActive gold; posGroup active unified with posActive; compare ring gold outline + faint gold tint; compare selected row gold tint; compare CTA gold button (dark text); PlayerProfile tab underline gold, status Active gold, transfer IN gold, compare hover gold, labels/grid Inter; PlayerCompare winner stats gold, tab underline gold, season winner gold, all labels Inter; App column (no s); fmtRate parseFloat leading-zero guard in Players/Profile/Compare; spinner gold throughout
//   66 — Transfers visual system pass: Inter typography throughout (mono removed); topLabel Inter 800 matches Records; season picker dark surface + gold focus; summary bar muted rust (spent/negative) + gold (received/positive), no neon green; direction tabs gold active underline; window header gold season label + Inter 500 name; net value muted rust/gold/slate; transfer rows slim directional left stripe (gold-tinted arrivals, slate departures) replaces neon triangles; rule text removed from main row, replaced with compact 5px dot indicator (gold=Emergency Credit, purple=Exchange, rust=Forced List, slate=Mandatory/Optional); inline detail reveal on row tap (arrived from/departed to, transfer type, fee); player face+name area navigates to profile; spinner gold; empty state Inter no emoji; tab labels clean (Arrivals/Departures, no arrows)
//   67 — Transfers Types filter: Types button top-right opens portal bottom sheet; sheet shows transfer types present in data with matching dot indicators; selecting a type filters list + closes sheet; active filter chip (Type: Exchange ×) appears below tabs with gold border + dot + clear button; Types button turns gold outline when active; sheet has gold checkmark on selected row + subtle gold tint; composes with season + direction filters; availableRules derived from full dataset
//   68 — Seasons + Season Detail full visual system pass: Inter typography throughout (mono removed); gold eyebrow + gold gradient hero rule; real trophy PNGs in TrophyShelf (52×68px) + small PNGs on season cards (16×22px) + cup row icons (24×32px); green identity removed (gold/slate system); Finalist replaces R-U/Runner-Up everywhere; season card footer Inter 600 gold honours; Dynasty Arc scores Inter 800 + slate pip for finalist; UCL Journey gold left-border opener, gold KO agg win badges (not neon green), expanded round labels (Round of 16/Quarter-final/Semi-final), Final row gold accent; league/UCL record grid ivory values + gold Pts highlight only; Key Moments gold index numbers; Dynasty Verdict gold left border + Inter /100; edit/locked controls gold/slate (no blue); all spinners gold; edit bar gold tint; input focus gold; toggle gold active state
//   71 — SeasonDetail UCL opponent drill-in data scope fix: load all seasons for the club and fetch their matches in parallel; allUclMatches now contains every UCL match across all seasons (not just the current season); opponent card shows correct all-time W/D/L, goals, narrative, and full match log across every season
//   70 — Targeted patch: Season Detail hero headline wraps season code (S1/S2/S3) in Inter 800 span so Playfair numeral drop is eliminated; UCL opponent card scroll fixed (oppScrollBody flex:1 min-height:0 overflow-y:auto, narrative+finals+matches all scroll together); oppDetailCard height:82dvh for proper flex bounds
//   69 — Final Seasons polish: Dynasty Arc score consistency (all same size/weight, no permanent tiering), ring pip for finalist vs filled pip for winner; season card score uniform treatment; Season Detail top-bar and hero eyebrow use Inter 700 (no Playfair S3 drop), hero headline clamp reduced; hero lede derived as first sentence ~160 chars (full story retained in Story section, no duplication); trophy PNG shelf 25% larger (65×85px); cup badge text-only gold (no heavy box border), opponent text ivory/slate; UCL Final leg row shows "Final" not "Leg 1", neutral venue H/A/N; KO round rows tappable with chevron to open in-page UCL opponent drill-in; LP matchday rows tappable; UclOpponentDetail overlay (bottom-sheet card, 82dvh, scrollable match log) reuses deriveUclRivals + buildUclRivalNarrative from uclUtils.js; close X returns to same Season Detail, no navigation away
const SW_VERSION = 71;
