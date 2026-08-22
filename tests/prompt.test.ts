import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHealPrompt } from '../lib/healer/prompt.ts'
import type { PayloadContract } from '../lib/contracts/types.ts'
import type { DriftVerdict } from '../lib/sensor/index.ts'

const CONTRACT: PayloadContract = {
  version: 3, targetId: 'books-toscrape',
  fields: [{ name: 'availability', path: 'availability', transform: 'parseStock', type: 'boolean', required: false }],
  assertions: { minItems: 15, fieldFillRate: {} },
}

const VERDICT: DriftVerdict = {
  severity: 'critical',
  signals: [{ code: 'FIELD_BLEED', severity: 'critical',
    detail: 'availability repeats an internal phrase 7x within a single value' }],
  evidence: { recordCount: 20, issueCount: 0, assertionFailures: [], sampleRecords: [] },
}

const SAMPLE = [{ availability: 'In stock (19 available) In stock In stock In stock' }]

test('prompt names the broken field', () => {
  assert.match(buildHealPrompt({ verdict: VERDICT, contract: CONTRACT, sample: SAMPLE }), /availability/)
})

test('prompt states the observed symptom, not just the field name', () => {
  const prompt = buildHealPrompt({ verdict: VERDICT, contract: CONTRACT, sample: SAMPLE })
  assert.match(prompt, /repeats/i)
})

test('prompt includes a real sample value so the fix is grounded', () => {
  const prompt = buildHealPrompt({ verdict: VERDICT, contract: CONTRACT, sample: SAMPLE })
  assert.match(prompt, /In stock \(19 available\)/)
})

test('prompt does not leak the collector id or any token', () => {
  process.env.BRIGHT_DATA_COLLECTOR_ID = 'c_secret123'
  const prompt = buildHealPrompt({ verdict: VERDICT, contract: CONTRACT, sample: SAMPLE })
  assert.ok(!prompt.includes('c_secret123'))
})

test('a prior rejection is fed back so the retry is not identical', () => {
  const prompt = buildHealPrompt({
    verdict: VERDICT, contract: CONTRACT, sample: SAMPLE,
    priorRejection: 'anchor: 0/20 known keys retained',
  })
  assert.match(prompt, /anchor: 0\/20/)
  assert.match(prompt, /previous attempt/i)
})

// The CLI's `bdata scraper heal <prompt>` documents a 1000 character maximum.
// Three real (unsampled) records plus a prior rejection is the worst realistic
// case -- confirm the assembled prompt still fits.
test('the prompt stays under the CLI 1000-character limit with three real records and a prior rejection', () => {
  const records: unknown[] = JSON.parse(
    readFileSync('docs/evidence/2026-08-21-books-toscrape-baseline.json', 'utf8'),
  )
  const prompt = buildHealPrompt({
    verdict: VERDICT,
    contract: CONTRACT,
    sample: records.slice(0, 3),
    priorRejection: 'anchor: 0/20 known keys retained; regression: pristine failed minItems',
  })
  assert.ok(prompt.length <= 1000, `prompt was ${prompt.length} characters`)
})

test('prompt shows the offending field value in full, never truncated', () => {
  const bleeding = 'In stock (19 available) In stock In stock In stock In stock In stock In stock'
  const longTitled = [{
    title: 'Our Band Could Be Your Life: Scenes from the American Indie Underground, 1981-1991',
    price: { value: 57.25, currency: 'GBP', symbol: '£' },
    availability: bleeding,
    product_url: 'https://books.toscrape.com/catalogue/our-band_985/index.html',
  }]
  const prompt = buildHealPrompt({ verdict: VERDICT, contract: CONTRACT, sample: longTitled })

  // A real heal failed because truncating the whole record let an 84-character
  // title consume the budget, cutting the malformed value mid-string: the AI was
  // told a phrase repeated 6x and shown it twice.
  assert.ok(prompt.includes(bleeding), 'the complete malformed value must survive')
  assert.ok(prompt.length <= 1000, `prompt must fit the CLI limit, got ${prompt.length}`)
})
