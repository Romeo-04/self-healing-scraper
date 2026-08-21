import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { maxInternalRepeat } from '../lib/sensor/signals.ts'
import { runSensor } from '../lib/sensor/index.ts'
import { applyContract } from '../lib/extract/index.ts'
import type { PayloadContract } from '../lib/contracts/types.ts'

const CONTRACT: PayloadContract = {
  version: 1,
  targetId: 'books-toscrape',
  fields: [
    { name: 'title',        path: 'title',        transform: 'trim',       type: 'string',  required: true },
    { name: 'price',        path: 'price.value',  transform: 'toNumber',   type: 'number',  required: true },
    { name: 'availability', path: 'availability', transform: 'parseStock', type: 'boolean', required: false },
    { name: 'url',          path: 'product_url',  type: 'url',             required: true },
  ],
  assertions: { minItems: 15, fieldFillRate: { title: 1, price: 0.9 }, expectVaried: ['title', 'url'] },
}

const HEALTHY = Array.from({ length: 20 }, (_, i) => ({
  title: `Book ${i}`,
  price: { value: 10 + i },
  availability: 'In stock',
  product_url: `https://books.toscrape.com/catalogue/book-${i}/index.html`,
}))

const noHistory: never[] = []

test('maxInternalRepeat counts a repeated phrase inside one value', () => {
  // 3, not 4: the algorithm counts the longest run of BACK-TO-BACK repeats.
  // The leading "In stock" is separated from the trailing three by "(19
  // available)", so it does not chain into that run — same reasoning as the
  // "In stock (20 available) In stock In stock" case dropping from 3 to 2.
  assert.equal(maxInternalRepeat('In stock (19 available) In stock In stock In stock'), 3)
})

test('maxInternalRepeat returns 1 for correct single-phrase output', () => {
  assert.equal(maxInternalRepeat('In stock'), 1)
})

test('maxInternalRepeat does not fire on an ordinary title', () => {
  assert.ok(maxInternalRepeat('Rip it Up and Start Again') < 3)
})

test('healthy output produces no drift', () => {
  const { records, issues } = applyContract(HEALTHY, CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: noHistory })
  assert.equal(verdict.severity, 'none')
})

test('FIELD_BLEED fires on the real broken payload', () => {
  const payload = JSON.parse(
    readFileSync('docs/evidence/2026-08-21-books-toscrape-baseline.json', 'utf8')
  ) as unknown[]
  const { records, issues } = applyContract(payload, CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: noHistory })
  assert.equal(verdict.severity, 'critical')
  assert.ok(verdict.signals.some(s => s.code === 'FIELD_BLEED'))
})

test('correct uniform availability does NOT fire FIELD_BLEED', () => {
  // every book genuinely in stock: identical across records, but clean within each value
  const { records, issues } = applyContract(HEALTHY, CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: noHistory })
  assert.ok(!verdict.signals.some(s => s.code === 'FIELD_BLEED'))
})

test('ITEM_COUNT_COLLAPSE fires below minItems', () => {
  const { records, issues } = applyContract(HEALTHY.slice(0, 3), CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: noHistory })
  assert.ok(verdict.signals.some(s => s.code === 'ITEM_COUNT_COLLAPSE'))
})

test('ITEM_COUNT_COLLAPSE fires below half the rolling median', () => {
  const { records, issues } = applyContract(HEALTHY.slice(0, 16), CONTRACT)
  const verdict = runSensor({
    records, issues, contract: CONTRACT,
    history: [{ recordCount: 40, fillRates: {} }, { recordCount: 40, fillRates: {} }],
  })
  assert.ok(verdict.signals.some(s => s.code === 'ITEM_COUNT_COLLAPSE'))
})

test('HARD_SCHEMA_FAIL fires when a required field is missing in most records', () => {
  const broken = HEALTHY.map(r => ({ ...r, product_url: undefined }))
  const { records, issues } = applyContract(broken, CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: noHistory })
  assert.ok(verdict.signals.some(s => s.code === 'HARD_SCHEMA_FAIL'))
})

test('TYPE_VIOLATION fires when a present value will not parse', () => {
  const broken = HEALTHY.map(r => ({ ...r, price: { value: 'about ten pounds' } }))
  const { records, issues } = applyContract(broken, CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: noHistory })
  assert.ok(verdict.signals.some(s => s.code === 'TYPE_VIOLATION'))
})

test('FILL_RATE_DROP fires on a large drop against history', () => {
  const half = HEALTHY.map((r, i) => (i % 2 === 0 ? { ...r, price: undefined } : r))
  const { records, issues } = applyContract(half, CONTRACT)
  const verdict = runSensor({
    records, issues, contract: CONTRACT,
    history: [{ recordCount: 20, fillRates: { price: 1 } }, { recordCount: 20, fillRates: { price: 1 } }],
  })
  assert.ok(verdict.signals.some(s => s.code === 'FILL_RATE_DROP'))
})

test('expectVaried fires when a must-vary field goes uniform', () => {
  const uniform = HEALTHY.map(r => ({ ...r, title: 'Same Title' }))
  const { records, issues } = applyContract(uniform, CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: noHistory })
  assert.equal(verdict.severity, 'critical')
})

test('FIELD_BLEED does not fire on natural phrase repetition in a title', () => {
  assert.ok(maxInternalRepeat('The Best of the Best of the Best') < 3)
  assert.ok(maxInternalRepeat('the the the the') < 3)
  assert.ok(maxInternalRepeat('New York, New York') < 3)
})

test('FIELD_BLEED fires on back-to-back repetition', () => {
  assert.ok(maxInternalRepeat('In stock In stock In stock') >= 3)
  assert.ok(maxInternalRepeat('In stock (19 available) In stock In stock In stock In stock') >= 3)
})

test('sensor evidence truncates oversized string fields', () => {
  const long = 'x'.repeat(5000)
  const payload = Array.from({ length: 20 }, (_, i) => ({
    title: `Book ${i}`,
    price: { value: 10 + i },
    availability: 'In stock',
    product_url: `https://books.toscrape.com/catalogue/book-${i}/index.html`,
    description: long,
  }))
  const { records, issues } = applyContract(payload, CONTRACT)
  const verdict = runSensor({ records, issues, contract: CONTRACT, history: [] })
  const size = JSON.stringify(verdict.evidence).length
  assert.ok(size < 10_000, `evidence should be bounded, got ${size} bytes`)
})
