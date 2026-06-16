/**
 * verifyPlayerIdentityUrls.mjs
 *
 * Pre-import sofifaId verification. Read-only. No Firestore. No writes.
 *
 * For every player in a season JSON that has a sofifaId, this script builds
 * the Cloudflare worker face URL and verifies it returns HTTP 200. A non-200
 * response means the sofifaId is wrong or missing — importing it would produce
 * silhouette faces or the wrong player photo in the app.
 *
 * Root cause this was built to prevent:
 *   Montverd S1 was imported with 17 / 20 wrong sofifaIds sourced from an
 *   incorrect player database. auditAndPatchPlayerFaces.mjs confirmed Firestore
 *   matched the source JSON — but the source JSON itself was wrong. This script
 *   catches that class of error at the JSON level before any write happens.
 *
 * Worker URL format:
 *   https://fifa-img.michaelmenda92.workers.dev/{sofifaId}
 *
 * PASS criteria:
 *   · sofifaId is present and non-zero
 *   · Worker returns HTTP 200
 *   · (Content-Type check is advisory — worker may vary, but 200 is the gate)
 *
 * FAIL criteria:
 *   · sofifaId is missing, null, or zero
 *   · Worker returns 404 / 500 / any non-200 status
 *   · Network fetch error
 *
 * Generated / fictional AI career-mode players without a sofifaId legitimately
 * fail — they will render as silhouettes in the app, which is expected. This
 * script flags them clearly so you can confirm the omission is intentional.
 *
 * Usage:
 *   node scripts/verifyPlayerIdentityUrls.mjs --file=data/uploads/montverd/S1.json
 *
 * Exit codes:
 *   0 — all players with sofifaId returned HTTP 200
 *   1 — one or more players failed (wrong ID, missing ID, fetch error)
 *
 * ─── Recommended pre-import workflow ────────────────────────────────────────
 *
 *   Step 1 — Verify player face URLs (this script):
 *     node scripts/verifyPlayerIdentityUrls.mjs --file=data/uploads/<club>/<season>.json
 *     → All players must PASS before proceeding.
 *       Fix any wrong sofifaIds in the JSON, then re-run until exit code 0.
 *
 *   Step 2 — Dry-run the import:
 *     node scripts/importSeason.mjs --season=S1 --file=data/uploads/<club>/<season>.json
 *     → Review the full dry-run report. Resolve any blocking issues.
 *
 *   Step 3 — Write (only after Steps 1 and 2 both pass):
 *     node scripts/importSeason.mjs --season=S1 --file=data/uploads/<club>/<season>.json --write
 *
 *   Step 4 — Post-write health check:
 *     node scripts/validateDataHealth.mjs
 *
 * No serviceAccountKey.json required. No Firestore access.
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'

// ─── Config ───────────────────────────────────────────────────────────────────

const WORKER_BASE  = 'https://fifa-img.michaelmenda92.workers.dev'

// Milliseconds before a single fetch is considered timed out.
// Cloudflare Workers are globally distributed — 8 s is generous.
const FETCH_TIMEOUT_MS = 8000

// Concurrency cap: fetch this many URLs in parallel.
// Avoids hammering the worker while keeping the script fast.
const CONCURRENCY = 5

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = {}
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=')
  if (eq !== -1) args[arg.slice(2, eq)] = arg.slice(eq + 1)
  else           args[arg.replace(/^--/, '')] = true
}

if (!args.file) {
  console.error('\n✗ --file is required')
  console.error('  Example: node scripts/verifyPlayerIdentityUrls.mjs --file=data/uploads/montverd/S1.json\n')
  process.exit(1)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMissing(v) {
  return v == null || v === 0 || v === '' || v === '0'
}

// Fetch with an AbortController timeout.
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return { ok: true, status: res.status, statusText: res.statusText }
  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    return { ok: false, status: null, error: isTimeout ? `timeout after ${ms}ms` : err.message }
  } finally {
    clearTimeout(timer)
  }
}

// Run an array of async tasks with a maximum concurrency.
async function pooled(tasks, concurrency) {
  const results = new Array(tasks.length)
  let   next    = 0

  async function worker() {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Load season JSON ────────────────────────────────────────────────────────
  let input
  try {
    input = JSON.parse(readFileSync(resolve(process.cwd(), args.file), 'utf8'))
  } catch (e) {
    console.error(`\n✗ Could not read/parse file: ${e.message}\n`)
    process.exit(1)
  }

  const playerStats = input.playerStats ?? []
  const seasonLabel = input.season?.label ?? '(unknown season)'

  if (playerStats.length === 0) {
    console.error('\n✗ No playerStats found in JSON.\n')
    process.exit(1)
  }

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log('  verifyPlayerIdentityUrls — read-only, no Firestore')
  console.log(`  Season : ${seasonLabel}`)
  console.log(`  File   : ${args.file}`)
  console.log(`  Players: ${playerStats.length}`)
  console.log('══════════════════════════════════════════════════════════════')
  console.log()
  console.log(`  Fetching ${playerStats.length} worker URL(s) with concurrency ${CONCURRENCY}…`)
  console.log()

  // ── Build fetch tasks ───────────────────────────────────────────────────────
  // Players without sofifaId are pre-failed — no network call needed.
  const rows = playerStats.map(entry => ({
    name:     entry.name     ?? '(unnamed)',
    position: entry.position ?? '?',
    sofifaId: isMissing(entry.sofifaId) ? null : Number(entry.sofifaId),
    url:      isMissing(entry.sofifaId) ? null : `${WORKER_BASE}/${entry.sofifaId}`,
    // result filled in after fetch
    status:   null,
    error:    null,
    pass:     null,
  }))

  const tasks = rows.map(row => async () => {
    if (!row.sofifaId) {
      row.status = null
      row.error  = 'sofifaId missing'
      row.pass   = false
      return
    }
    const result = await fetchWithTimeout(row.url, FETCH_TIMEOUT_MS)
    if (result.ok) {
      row.status = result.status
      row.pass   = result.status === 200
      if (!row.pass) row.error = result.statusText || `HTTP ${result.status}`
    } else {
      row.status = null
      row.error  = result.error
      row.pass   = false
    }
  })

  await pooled(tasks, CONCURRENCY)

  // ── Print results table ─────────────────────────────────────────────────────
  const NAME_W = Math.max(20, ...rows.map(r => r.name.length)) + 2
  const POS_W  = 8
  const ID_W   = 12
  const URL_W  = 54
  const STA_W  = 6

  // Header
  console.log(
    '  ' +
    'Name'.padEnd(NAME_W) +
    'Pos'.padEnd(POS_W) +
    'sofifaId'.padEnd(ID_W) +
    'Worker URL'.padEnd(URL_W) +
    'HTTP'.padEnd(STA_W) +
    'Result'
  )
  console.log('  ' + '─'.repeat(NAME_W + POS_W + ID_W + URL_W + STA_W + 8))

  for (const r of rows) {
    const mark       = r.pass ? '✓' : '✗'
    const result     = r.pass ? 'PASS' : `FAIL  ${r.error ?? ''}`
    const displayId  = r.sofifaId != null ? String(r.sofifaId) : '(missing)'
    const displayUrl = r.url ?? '(no URL)'
    const displaySta = r.status != null ? String(r.status) : '—'

    console.log(
      `  ${mark} ` +
      r.name.padEnd(NAME_W - 2) + '  ' +
      r.position.padEnd(POS_W) +
      displayId.padEnd(ID_W) +
      displayUrl.padEnd(URL_W) +
      displaySta.padEnd(STA_W) +
      result
    )
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const passed  = rows.filter(r =>  r.pass).length
  const failed  = rows.filter(r => !r.pass).length
  const allPass = failed === 0

  console.log('\n' + '═'.repeat(62))

  if (allPass) {
    console.log(`  ✅  ALL ${passed} player(s) PASSED`)
    console.log('  Every sofifaId resolves to a valid worker image URL.')
    console.log('  Safe to proceed with importSeason dry-run.')
  } else {
    console.log(`  ✗   ${failed} player(s) FAILED  (${passed} passed)`)
    console.log()

    const missingId = rows.filter(r => !r.pass && !r.sofifaId)
    const badUrl    = rows.filter(r => !r.pass &&  r.sofifaId)

    if (missingId.length > 0) {
      console.log(`  Missing sofifaId (${missingId.length}):`)
      missingId.forEach(r =>
        console.log(`    ✗  ${r.name}  — add "sofifaId": <number> to their JSON entry`)
      )
      console.log()
    }

    if (badUrl.length > 0) {
      console.log(`  Wrong sofifaId — URL returned non-200 (${badUrl.length}):`)
      badUrl.forEach(r =>
        console.log(`    ✗  ${r.name}  sofifaId:${r.sofifaId}  (${r.error ?? `HTTP ${r.status}`})`)
      )
      console.log()
      console.log('  To fix: look up the correct sofifaId at sofifa.com/player/<sofifaId>/')
      console.log('  Then update the JSON and re-run this script before proceeding.')
    }

    console.log('  Do not run importSeason --write until all players PASS.')
  }

  console.log('═'.repeat(62))
  console.log('  Read-only. No data was written.\n')

  process.exit(allPass ? 0 : 1)
}

main().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
