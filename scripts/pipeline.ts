// scripts/pipeline.ts
//
// Three modes, selected by the first CLI argument (default: detect):
//
//   detect     (default) — run the collector, extract, sense drift, persist the
//              run/records/drift_event, then STOP. Never calls heal, approve, or reject.
//   heal-dry   — everything detect does, plus request a heal proposal and evaluate the
//              pre-approval preview check, then ALWAYS discard the proposal via
//              `approve --reject`. Reversible. Never approves.
//   heal-live  — the full heal loop, which MAY approve a proposal. `bdata scraper
//              approve` is irreversible — there is no revert, rollback, or
//              version-restore command anywhere in the CLI. Gated behind an explicit
//              CONFIRM_HEAL_LIVE=yes environment variable.
//
// npm run pipeline            -> detect
// npm run pipeline -- heal-dry
// CONFIRM_HEAL_LIVE=yes npm run pipeline -- heal-live

import { readFileSync } from 'node:fs'
import { openDb } from '../lib/db/index.ts'
import { requireEnv } from '../lib/env.ts'
import { applyContract } from '../lib/extract/index.ts'
import { runSensor } from '../lib/sensor/index.ts'
import { evaluateAssertions } from '../lib/sensor/assertions.ts'
import { maxInternalRepeat } from '../lib/sensor/signals.ts'
import { healTarget, extractPreviewRecords } from '../lib/healer/index.ts'
import type { HealAttempt } from '../lib/healer/index.ts'
import { buildHealPrompt } from '../lib/healer/prompt.ts'
import { proposeContract } from '../lib/healer/fallback.ts'
import { approveProposal, healCollector, rejectProposal, runCollector } from '../lib/brightdata/cli.ts'
import type { PayloadContract, Assertions } from '../lib/contracts/types.ts'

// verdict === null means the gate never returned a verdict. If we approved
// anyway, the change is LIVE and unvalidated -- that must never be recorded as
// 'rejected' (which implies the change was safely discarded). 'failed' is the
// honest status for an unvalidated-but-live approval.
function attemptStatus(attempt: HealAttempt): string {
  if (attempt.verdict !== null) return attempt.verdict.pass ? 'promoted' : 'rejected'
  return attempt.cliAction === 'approve' ? 'failed' : 'rejected'
}

const TARGET_ID = 'books-toscrape'
const HEARTBEAT_MS = 15_000

type Mode = 'detect' | 'heal-dry' | 'heal-live' | 'replay'

function parseMode(argv: string[]): Mode {
  const raw = argv[2]
  if (raw === undefined) return 'detect'
  if (raw === 'detect' || raw === 'heal-dry' || raw === 'heal-live' || raw === 'replay') return raw
  console.error(`unknown mode "${raw}" — expected one of: detect, heal-dry, heal-live, replay`)
  process.exit(1)
}

const mode = parseMode(process.argv)

console.log('################################################')
console.log(`# pipeline mode: ${mode.toUpperCase()}`)
const BANNER: Record<Mode, string> = {
  replay: '# offline: replays a captured payload, senses drift, makes no network call and never heals',
  detect: '# read-only: triggers a collector run, senses drift, never heals',
  'heal-dry': '# heals, then ALWAYS discards the proposal (approve --reject) — reversible, never approves',
  'heal-live': '# LIVE HEAL: may call `approve`, which is IRREVERSIBLE — no revert/rollback exists',
}
console.log(BANNER[mode])
console.log('################################################\n')

// approving a Bright Data proposal cannot be undone; heal-live requires an
// explicit, deliberate opt-in before it is allowed to touch the CLI at all.
if (mode === 'heal-live' && process.env.CONFIRM_HEAL_LIVE !== 'yes') {
  console.error('Refusing to run heal-live.')
  console.error('`bdata scraper approve` is IRREVERSIBLE: there is no revert, rollback, or')
  console.error('version-restore command anywhere in the CLI. A bad approval permanently')
  console.error('alters the live collector; recovery means recreating it from scratch.')
  console.error('Set CONFIRM_HEAL_LIVE=yes only if you have deliberately accepted that risk.')
  process.exit(1)
}

const db = openDb('data.db')
const collectorId = requireEnv('BRIGHT_DATA_COLLECTOR_ID')
const url = 'https://books.toscrape.com'

const contractRow = db.prepare(
  `SELECT spec_json FROM contracts WHERE target_id='books-toscrape'
   ORDER BY version DESC LIMIT 1`
).get() as { spec_json: string }
const contract = JSON.parse(contractRow.spec_json) as PayloadContract

console.log(`=== scraping with contract v${contract.version} ===`)
if (mode !== 'replay') {
  console.log('(a live collector run can take 30s-4min; printing progress, not timing out early)')
}
const startedAt = Date.now()
const heartbeat = setInterval(() => {
  console.log(`  ... still waiting on the collector (${Math.round((Date.now() - startedAt) / 1000)}s elapsed)`)
}, HEARTBEAT_MS)

let payload: unknown[]
if (mode === 'replay') {
  // Replay a captured payload instead of calling the collector. Added because the
  // account's realtime page quota is exhausted, which forces the CLI into a batch
  // mode too slow to hold a process open for. The captured file IS real collector
  // output, so extraction, sensing, and persistence are exercised on genuine data;
  // only the network fetch is skipped.
  clearInterval(heartbeat)
  const replayPath = process.argv[3] ?? 'docs/evidence/2026-08-21-books-toscrape-baseline.json'
  const parsed: unknown = JSON.parse(readFileSync(replayPath, 'utf8'))
  if (!Array.isArray(parsed)) {
    console.error(`replay file ${replayPath} does not contain a JSON array`)
    process.exit(1)
  }
  payload = parsed
  console.log(`replayed ${payload.length} records from ${replayPath}`)
} else {
  try {
    payload = await runCollector(collectorId, url)
  } finally {
    clearInterval(heartbeat)
  }
}
console.log(`collector responded after ${Math.round((Date.now() - startedAt) / 1000)}s`)

const { records, issues } = applyContract(payload, contract)
console.log(`${records.length} records, ${issues.length} issues`)

const history = (db.prepare(
  `SELECT record_count FROM runs WHERE target_id='books-toscrape' AND status='ok'
   ORDER BY id DESC LIMIT 5`
).all() as Array<{ record_count: number }>).map(r => ({ recordCount: r.record_count, fillRates: {} }))

const verdict = runSensor({ records, issues, contract, history })
console.log(`\n=== sensor: ${verdict.severity} ===`)
for (const signal of verdict.signals) console.log(`  ${signal.code}: ${signal.detail}`)

const runId = Number((db.prepare(
  `INSERT INTO runs (target_id,contract_version,status,record_count,raw_payload)
   VALUES (?,?,?,?,?) RETURNING id`
).get('books-toscrape', contract.version, verdict.severity === 'critical' ? 'drift' : 'ok',
       records.length, JSON.stringify(payload)) as { id: number }).id)

const insertRecord = db.prepare(
  `INSERT INTO records (run_id,key,title,price,currency,in_stock,url)
   VALUES (?,?,?,?,?,?,?)`
)
for (const record of records) {
  insertRecord.run(
    runId,
    record.key,
    record.title ?? null,
    record.price ?? null,
    record.currency ?? null,
    record.inStock === undefined ? null : (record.inStock ? 1 : 0),
    record.url ?? null,
  )
}
console.log(`persisted ${records.length} record row(s) for run ${runId}`)

let driftId: number | null = null
if (verdict.severity === 'critical') {
  driftId = Number((db.prepare(
    `INSERT INTO drift_events (run_id,severity,signals_json,evidence_json)
     VALUES (?,?,?,?) RETURNING id`
  ).get(runId, 'critical', JSON.stringify(verdict.signals), JSON.stringify(verdict.evidence)) as { id: number }).id)
  console.log(`recorded drift_event ${driftId}`)
} else {
  // No critical drift: this run's keys are a trustworthy anchor for the next
  // one. Closes the gap where golden_keys_json was seeded empty and the
  // anchor check had nothing real to compare against.
  db.prepare(
    `UPDATE fixtures SET golden_keys_json=? WHERE target_id=? AND label='homepage'`
  ).run(JSON.stringify(records.map(r => r.key)), TARGET_ID)
  console.log(`updated fixtures.golden_keys_json with ${records.length} key(s) from run ${runId}`)
}

if (mode === 'detect' || mode === 'replay') {
  console.log('\n=== detect mode: stopping here (never heals) ===')
  if (verdict.severity === 'critical') {
    console.log('Drift is CRITICAL. Next step would be one of:')
    console.log('  npm run pipeline -- heal-dry   (heal + validate, always discards the proposal — reversible)')
    console.log('  CONFIRM_HEAL_LIVE=yes npm run pipeline -- heal-live   (may approve — irreversible)')
  } else {
    console.log(`Drift severity is "${verdict.severity}" — nothing to heal.`)
  }
  process.exit(0)
}

if (verdict.severity !== 'critical') {
  console.log('\nno critical drift — nothing to heal')
  process.exit(0)
}

const driftEventId = driftId as number // non-null: verdict.severity === 'critical' above

if (mode === 'heal-dry') {
  console.log('\n=== heal-dry: requesting a proposal from Bright Data Studio ===')
  const prompt = buildHealPrompt({ verdict, contract, sample: payload.slice(0, 3) })
  const healed = await healCollector(collectorId, prompt, url)

  const previewRecords = extractPreviewRecords(healed.stdout, contract)
  let previewPass: boolean
  let previewDetail: string[]
  if (previewRecords === null) {
    previewPass = false
    previewDetail = ['no preview_result available in heal output']
  } else {
    const sampleAssertions: Assertions = { minItems: 1, fieldFillRate: contract.assertions.fieldFillRate }
    const previewCheck = evaluateAssertions(previewRecords, sampleAssertions)
    const bleeding = previewRecords.some(record =>
      Object.values(record.raw).some(value => typeof value === 'string' && maxInternalRepeat(value) >= 3))
    previewPass = previewCheck.pass && !bleeding
    previewDetail = bleeding ? [...previewCheck.failures, 'preview still shows field bleed'] : previewCheck.failures
  }

  console.log(`\npreview check: ${previewPass ? 'PASS' : 'FAIL'}`)
  for (const detail of previewDetail) console.log(`  - ${detail}`)

  console.log('\n=== heal-dry: discarding the proposal (approve --reject) — this mode never approves ===')
  await rejectProposal(collectorId, url)

  db.prepare(
    `INSERT INTO heal_attempts
     (drift_event_id,from_version,to_version,status,source,validation_report_json,cli_action)
     VALUES (?,?,?,?,?,?,?)`
  ).run(driftEventId, contract.version, null, 'rejected', 'studio',
        JSON.stringify({ previewPass, previewDetail }), 'reject')

  console.log(`\ncontract stays at v${contract.version} — heal-dry never promotes`)
  process.exit(0)
}

// mode === 'heal-live'
console.log('\n=== heal-live: running the full heal loop (may approve — irreversible) ===')

// The anchor check must compare this run against a run known to be good, never
// against itself — pull the last confirmed-good key set out of the fixtures
// row instead of the (possibly drifted) current run. Empty is a legitimate
// "no prior good run yet" state; never fall back to the current run's keys.
const goldenKeysRow = db.prepare(
  `SELECT golden_keys_json FROM fixtures WHERE target_id=? AND label='homepage'`
).get(TARGET_ID) as { golden_keys_json: string } | undefined
const lastGoodKeys: string[] = goldenKeysRow === undefined
  ? []
  : (JSON.parse(goldenKeysRow.golden_keys_json) as string[])

const outcome = await healTarget(
  { heal: healCollector, approve: approveProposal, reject: rejectProposal,
    runCollector, fallbackPropose: proposeContract },
  { collectorId, url, contract, verdict, sample: payload.slice(0, 3),
    lastGoodKeys,
    history,
    fixtures: [
      { label: 'homepage', url, assertions: contract.assertions },
      { label: 'page-2', url: 'https://books.toscrape.com/catalogue/page-2.html', assertions: contract.assertions },
    ] },
)

console.log(`\n=== outcome: ${outcome.status} via ${outcome.source} ===`)
outcome.attempts.forEach((attempt, i) => {
  console.log(`  attempt ${i + 1} (${attempt.source}) -> cli:${attempt.cliAction}`)
  if (attempt.verdict === null) {
    console.log(`    preview REJECTED: ${attempt.previewFailures.join('; ')}`)
  } else {
    for (const check of attempt.verdict.checks) {
      console.log(`    ${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
    }
  }
})

for (const attempt of outcome.attempts) {
  db.prepare(
    `INSERT INTO heal_attempts
     (drift_event_id,from_version,to_version,status,source,validation_report_json,cli_action)
     VALUES (?,?,?,?,?,?,?)`
  ).run(driftEventId, contract.version, outcome.contract.version,
        attemptStatus(attempt), attempt.source,
        JSON.stringify(attempt.verdict ?? { previewFailures: attempt.previewFailures }), attempt.cliAction)
}

if (outcome.status === 'promoted') {
  db.prepare(
    `INSERT INTO contracts (target_id,version,spec_json,created_by,parent_version,note)
     VALUES (?,?,?,?,?,?)`
  ).run('books-toscrape', outcome.contract.version, JSON.stringify(outcome.contract),
        outcome.source === 'studio' ? 'studio' : 'fallback', contract.version,
        `healed after ${outcome.attempts.length} attempt(s)`)
  db.prepare(`UPDATE targets SET active_contract_version=? WHERE id='books-toscrape'`)
    .run(outcome.contract.version)
  db.prepare(`UPDATE runs SET status='healed' WHERE id=?`).run(runId)
  console.log(`\npromoted contract v${outcome.contract.version}`)
} else {
  console.log(`\ncontract v${contract.version} stays live`)
}
