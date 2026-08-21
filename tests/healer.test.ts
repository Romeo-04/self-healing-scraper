import { test } from 'node:test'
import assert from 'node:assert/strict'
import { healTarget } from '../lib/healer/index.ts'
import type { HealDeps } from '../lib/healer/index.ts'
import type { PayloadContract } from '../lib/contracts/types.ts'
import type { DriftVerdict } from '../lib/sensor/index.ts'

const CONTRACT: PayloadContract = {
  version: 1, targetId: 'books-toscrape',
  fields: [
    { name: 'title', path: 'title', transform: 'trim', type: 'string', required: true },
    { name: 'url', path: 'product_url', type: 'url', required: true },
  ],
  assertions: { minItems: 10, fieldFillRate: { title: 1 } },
}

const VERDICT: DriftVerdict = {
  severity: 'critical',
  signals: [{ code: 'FIELD_BLEED', severity: 'critical', detail: 'availability repeats 7x' }],
  evidence: {},
}

function goodPayload(prefix = 'book') {
  return Array.from({ length: 20 }, (_, i) => ({
    title: `Book ${i}`,
    product_url: `https://books.toscrape.com/catalogue/${prefix}-${i}/index.html`,
    availability: 'In stock',
  }))
}

const LAST_GOOD = goodPayload().map(p => p.product_url)

// No heal stub in this suite returns a preview_result, so extractPreviewRecords
// falls through to null (plain text isn't parseable JSON) and every attempt
// proceeds straight to Stage 2 — the same behaviour the un-adapted tests relied on.
function deps(overrides: Partial<HealDeps> = {}): HealDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    heal: async () => { calls.push('heal'); return { stdout: 'proposal ready' } },
    approve: async () => { calls.push('approve') },
    reject: async () => { calls.push('reject') },
    runCollector: async () => { calls.push('run'); return goodPayload() },
    fallbackPropose: async () => { calls.push('fallback'); return { ...CONTRACT, version: 2 } },
    ...overrides,
  }
}

const input = {
  collectorId: 'c_test', url: 'https://books.toscrape.com',
  contract: CONTRACT, verdict: VERDICT, sample: [], lastGoodKeys: LAST_GOOD,
  fixtures: [{ label: 'pristine', url: 'https://books.toscrape.com', assertions: CONTRACT.assertions }],
}

test('a passing studio proposal is approved and promoted', async () => {
  const d = deps()
  const outcome = await healTarget(d, input)
  assert.equal(outcome.status, 'promoted')
  assert.equal(outcome.source, 'studio')
  assert.ok(d.calls.includes('approve'))
  assert.ok(!d.calls.includes('reject'))
})

// Adapted: under the two-stage design, nothing is pending to reject once the
// proposal has been approved — a post-approval gate failure is recorded, not
// rolled back. This case has no preview (heal returns plain text), so it
// reaches Stage 2, gets approved, and only then is found to fail the gate.
test('a failing studio proposal is approved but never promoted, and is not rejected', async () => {
  const d = deps({ runCollector: async () => goodPayload('unrelated-carousel') })
  const outcome = await healTarget(d, input)
  assert.ok(d.calls.includes('approve'))
  assert.ok(!d.calls.includes('reject'), 'nothing is pending post-approval, so reject is never called')
  assert.notEqual(outcome.status, 'promoted')
})

test('studio is retried before the fallback is used', async () => {
  const d = deps({ runCollector: async () => goodPayload('unrelated-carousel') })
  await healTarget(d, input)
  assert.equal(d.calls.filter(c => c === 'heal').length, 3) // initial + 2 retries
  assert.ok(d.calls.includes('fallback'))
})

test('the original contract survives a total failure', async () => {
  const d = deps({ runCollector: async () => goodPayload('unrelated-carousel') })
  const outcome = await healTarget(d, input)
  assert.equal(outcome.status, 'failed')
  assert.equal(outcome.contract.version, CONTRACT.version)
})

test('a CLI failure degrades to failed rather than throwing', async () => {
  const d = deps({ heal: async () => { throw new Error('bdata exited 1') } })
  const outcome = await healTarget(d, input)
  assert.equal(outcome.status, 'failed')
})

// Adapted: verdict is nullable now (a preview-stage rejection never reaches
// the gate), so the audit-trail check only applies the 3-check shape to
// attempts that actually carried a verdict.
test('every attempt is recorded for the audit trail', async () => {
  const d = deps({ runCollector: async () => goodPayload('unrelated-carousel') })
  const outcome = await healTarget(d, input)
  assert.ok(outcome.attempts.length >= 3)
  assert.ok(outcome.attempts.every(a => a.verdict === null || a.verdict.checks.length === 3))
})

// Nothing is ever approved in this test (every preview is rejected), so the
// live collector never changes from whatever produced the original critical
// verdict. runCollector is overridden to reflect that it is still broken —
// otherwise the default good-payload stub would let the post-studio fallback
// gate trivially pass, which would promote a contract nobody actually fixed.
test('a proposal whose preview still bleeds is rejected before approval', async () => {
  const d = deps({
    heal: async () => ({ stdout: JSON.stringify({
      status: 'awaiting_approval',
      preview_result: [{
        title: 'Book 0',
        product_url: 'https://books.toscrape.com/catalogue/book-0/index.html',
        availability: 'In stock In stock In stock In stock',
      }],
    }) }),
    runCollector: async () => goodPayload('unrelated-carousel'),
  })
  const outcome = await healTarget(d, input)
  assert.ok(d.calls.includes('reject'))
  assert.ok(!d.calls.includes('approve'))
  assert.notEqual(outcome.status, 'promoted')
})

test('a clean preview proceeds to approval and the full gate', async () => {
  const d = deps({
    heal: async () => ({ stdout: JSON.stringify({
      status: 'awaiting_approval',
      preview_result: [{
        title: 'Book 0',
        product_url: 'https://books.toscrape.com/catalogue/book-0/index.html',
        availability: 'In stock',
      }],
    }) }),
  })
  const outcome = await healTarget(d, input)
  assert.ok(d.calls.includes('approve'))
  assert.equal(outcome.status, 'promoted')
})

test('a gate failure after approval does not attempt a reject', async () => {
  const d = deps({
    heal: async () => ({ stdout: JSON.stringify({
      status: 'awaiting_approval',
      preview_result: [{
        title: 'Book 0',
        product_url: 'https://books.toscrape.com/catalogue/book-0/index.html',
        availability: 'In stock',
      }],
    }) }),
    runCollector: async () => goodPayload('unrelated-carousel'),
  })
  const outcome = await healTarget(d, input)
  assert.ok(d.calls.includes('approve'))
  assert.ok(!d.calls.includes('reject'), 'nothing is pending after approval')
  assert.notEqual(outcome.status, 'promoted')
  assert.equal(outcome.contract.version, CONTRACT.version, 'contract must not advance')
})
