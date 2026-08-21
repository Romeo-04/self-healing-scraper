import { test } from 'node:test'
import assert from 'node:assert/strict'
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
