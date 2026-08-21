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

// The default heal stub returns a clean, well-formed preview_result so Stage 1
// (the pre-approval preview check) passes and the attempt reaches Stage 2 —
// the behaviour a genuinely working studio proposal would produce. Tests that
// need to exercise Stage 1 itself (rejection, missing preview) override `heal`
// explicitly.
function deps(overrides: Partial<HealDeps> = {}): HealDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    heal: async () => {
      calls.push('heal')
      return { stdout: JSON.stringify({
        status: 'awaiting_approval',
        preview_result: [{
          title: 'Book 0',
          product_url: 'https://books.toscrape.com/catalogue/book-0/index.html',
          availability: 'In stock',
        }],
      }) }
    },
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

// approve is irreversible. If runCollector then throws while gating (a realtime
// timeout is realistic), the approval must still be on the audit trail -- the
// database must never be able to deny that an irreversible approval happened.
test('an error after approval still records the approval before failing', async () => {
  const d = deps({
    runCollector: async () => { throw new Error('bdata scraper run timed out after 1800000ms') },
  })
  const outcome = await healTarget(d, input)
  assert.equal(outcome.status, 'failed')
  assert.ok(d.calls.includes('approve'))
  const recorded = outcome.attempts.find(a => a.cliAction === 'approve')
  assert.ok(recorded, 'the approval must be recorded even though the gate never ran')
  assert.equal(recorded.verdict, null)
  assert.match(recorded.previewFailures.join(' '), /timed out/)
})

// Adapted: verdict is nullable now (a preview-stage rejection never reaches
// the gate), so the audit-trail check only applies the 4-check shape (live,
// regression, anchor, resolved) to attempts that actually carried a verdict.
test('every attempt is recorded for the audit trail', async () => {
  const d = deps({ runCollector: async () => goodPayload('unrelated-carousel') })
  const outcome = await healTarget(d, input)
  assert.ok(outcome.attempts.length >= 3)
  assert.ok(outcome.attempts.every(a => a.verdict === null || a.verdict.checks.length === 4))
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

// A missing preview is the only bleed-aware check before an irreversible
// approval. Treat it as a Stage 1 failure, not a pass-through: the pipeline's
// heal-dry mode already treats the same null as a FAIL, and the two paths
// must agree.
test('a missing preview is treated as a Stage 1 failure, never a pass-through to approval', async () => {
  const d = deps({ heal: async () => ({ stdout: 'proposal ready' }) }) // not parseable JSON
  const outcome = await healTarget(d, input)
  // Every studio attempt must be rejected while pending, never approved on the
  // strength of a preview that was never actually checked.
  assert.ok(!d.calls.includes('approve'))
  assert.notEqual(outcome.source, 'studio')
  const studioAttempts = outcome.attempts.filter(a => a.source === 'studio')
  assert.equal(studioAttempts.length, 3)
  assert.ok(studioAttempts.every(a => a.cliAction === 'reject' && a.verdict === null))
  assert.match(studioAttempts[0]?.previewFailures.join(' ') ?? '', /no preview_result/)
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
