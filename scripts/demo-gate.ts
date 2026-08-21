// Shows the validation gate judging three repair proposals, using the real
// captured collector payload as the starting point. No network calls, no cost,
// deterministic — safe to run repeatedly and safe to record.
//
//   npm run demo:gate
//
// The point of the demo is the third column of each block: which single check
// catches a proposal that every other check waves through.

import { readFileSync } from 'node:fs'
import { openDb } from '../lib/db/index.ts'
import { applyContract } from '../lib/extract/index.ts'
import { runSensor } from '../lib/sensor/index.ts'
import { evaluateGate } from '../lib/healer/gate.ts'
import type { PayloadContract } from '../lib/contracts/types.ts'

const BASELINE = 'docs/evidence/2026-08-21-books-toscrape-baseline.json'

const db = openDb('data.db')
const row = db.prepare(
  `SELECT spec_json FROM contracts WHERE target_id='books-toscrape' ORDER BY version DESC LIMIT 1`,
).get() as { spec_json: string } | undefined

if (row === undefined) {
  console.error('no contract found — run `npm run seed` first')
  process.exit(1)
}

const contract = JSON.parse(row.spec_json) as PayloadContract
const broken = JSON.parse(readFileSync(BASELINE, 'utf8')) as unknown[]
const lastGoodKeys = applyContract(broken, contract).records.map(r => r.key)

function judge(label: string, why: string, payload: unknown[]): void {
  const { records, issues } = applyContract(payload, contract)
  const sensed = runSensor({ records, issues, contract, history: [] })
  const verdict = evaluateGate({
    live: { records, assertions: contract.assertions },
    regression: [{ label: 'homepage', records, assertions: contract.assertions }],
    lastGoodKeys,
    repaired: { severity: sensed.severity, signals: sensed.signals.map(s => s.code) },
  })

  console.log('')
  console.log(label)
  console.log(`  ${why}`)
  console.log('')
  for (const check of verdict.checks) {
    console.log(`  ${(check.pass ? 'PASS' : 'FAIL').padEnd(6)}${check.name.padEnd(12)}${check.detail}`)
  }
  console.log(`  ${verdict.pass ? '=> APPROVED' : '=> REJECTED'}`)
}

console.log('=========================================================')
console.log(' The validation gate, judging three repair proposals')
console.log('=========================================================')

judge(
  '1. A repair that changed NOTHING',
  'The output is well-formed and identical to the previous run. Three checks wave it through.',
  broken,
)

judge(
  '2. A GENUINE repair',
  'Same records, but availability now reads correctly. Nothing objects.',
  broken.map(record => ({ ...(record as Record<string, unknown>), availability: 'In stock' })),
)

judge(
  '3. A repair reading the WRONG PART OF THE PAGE',
  'Twelve flawless records scraped from a related-products carousel instead of the catalogue.',
  Array.from({ length: 12 }, (_, i) => ({
    title: `Related Book ${i}`,
    price: { value: 9 + i, currency: 'GBP' },
    availability: 'In stock',
    product_url: `https://books.toscrape.com/catalogue/related-${i}/index.html`,
  })),
)

console.log('')
console.log('---------------------------------------------------------')
console.log('Case 1 is the one worth dwelling on: live, regression and')
console.log('anchor all PASS. Only `resolved` notices that the fault')
console.log('which triggered the repair is still there.')
console.log('---------------------------------------------------------')
