import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateGate } from '../lib/healer/gate.ts'
import type { Assertions, ExtractedRecord } from '../lib/contracts/types.ts'

const ASSERTIONS: Assertions = { minItems: 10, fieldFillRate: { title: 1, price: 0.9 } }

function books(count: number, prefix = 'book'): ExtractedRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `https://books.toscrape.com/catalogue/${prefix}-${i}/index.html`,
    title: `Book ${i}`,
    price: 10 + i,
    url: `https://books.toscrape.com/catalogue/${prefix}-${i}/index.html`,
    raw: {},
  }))
}

const LAST_GOOD = books(20).map(r => r.key)

test('a genuinely good repair passes every check', () => {
  const verdict = evaluateGate({
    live: { records: books(20), assertions: ASSERTIONS },
    regression: [{ label: 'pristine', records: books(20), assertions: ASSERTIONS }],
    lastGoodKeys: LAST_GOOD,
  })
  assert.equal(verdict.pass, true)
  assert.ok(verdict.checks.every(c => c.pass))
})

test('REJECTS a proposal that parses cleanly but reads the wrong container', () => {
  // The carousel case: 12 well-formed records, zero overlap with the last good run.
  // Every assertion passes. Only the anchor check can catch this.
  const carousel = books(12, 'related-carousel-item')
  const verdict = evaluateGate({
    live: { records: carousel, assertions: ASSERTIONS },
    regression: [{ label: 'pristine', records: carousel, assertions: ASSERTIONS }],
    lastGoodKeys: LAST_GOOD,
  })
  assert.equal(verdict.pass, false)
  const anchor = verdict.checks.find(c => c.name === 'anchor')
  assert.equal(anchor?.pass, false)
})

test('REJECTS a proposal that fixes today but breaks a known-good fixture', () => {
  const verdict = evaluateGate({
    live: { records: books(20), assertions: ASSERTIONS },
    regression: [
      { label: 'pristine', records: books(20), assertions: ASSERTIONS },
      { label: 'renamed-classes', records: books(2), assertions: ASSERTIONS },
    ],
    lastGoodKeys: LAST_GOOD,
  })
  assert.equal(verdict.pass, false)
  assert.equal(verdict.checks.find(c => c.name === 'regression')?.pass, false)
})

test('REJECTS a proposal that fails the live assertions', () => {
  const verdict = evaluateGate({
    live: { records: books(4), assertions: ASSERTIONS },
    regression: [{ label: 'pristine', records: books(20), assertions: ASSERTIONS }],
    lastGoodKeys: LAST_GOOD,
  })
  assert.equal(verdict.pass, false)
  assert.equal(verdict.checks.find(c => c.name === 'live')?.pass, false)
})

test('anchor check passes at exactly the 30% threshold', () => {
  const overlapping = [...books(6), ...books(14, 'new')]
  const verdict = evaluateGate({
    live: { records: overlapping, assertions: ASSERTIONS },
    regression: [{ label: 'pristine', records: overlapping, assertions: ASSERTIONS }],
    lastGoodKeys: LAST_GOOD,
  })
  assert.equal(verdict.checks.find(c => c.name === 'anchor')?.pass, true)
})

test('anchor check is skipped when there is no prior good run', () => {
  const verdict = evaluateGate({
    live: { records: books(20), assertions: ASSERTIONS },
    regression: [{ label: 'pristine', records: books(20), assertions: ASSERTIONS }],
    lastGoodKeys: [],
  })
  assert.equal(verdict.pass, true)
  assert.match(verdict.checks.find(c => c.name === 'anchor')?.detail ?? '', /no prior/i)
})

test('every check runs even after one fails, so the report is complete', () => {
  const verdict = evaluateGate({
    live: { records: books(1), assertions: ASSERTIONS },
    regression: [{ label: 'pristine', records: books(1), assertions: ASSERTIONS }],
    lastGoodKeys: LAST_GOOD,
  })
  assert.equal(verdict.checks.length, 3)
})
