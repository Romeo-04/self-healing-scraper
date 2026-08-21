import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readWithFallbacks } from '../lib/extract/path.ts'
import { deriveKey } from '../lib/extract/key.ts'
import { applyContract } from '../lib/extract/index.ts'
import { toNumber } from '../lib/extract/transforms.ts'
import type { PayloadContract } from '../lib/contracts/types.ts'

const CONTRACT: PayloadContract = {
  version: 1,
  targetId: 'books-toscrape',
  fields: [
    { name: 'title',        path: 'title',           transform: 'trim',       type: 'string',  required: true },
    { name: 'price',        path: 'price.value',     transform: 'toNumber',   type: 'number',  required: true },
    { name: 'currency',     path: 'price.currency',  transform: 'trim',       type: 'string',  required: false },
    { name: 'availability', path: 'availability',    transform: 'parseStock', type: 'boolean', required: false },
    { name: 'url',          path: 'product_url', fallbackPaths: ['product_page_url'], type: 'url', required: true },
  ],
  assertions: { minItems: 10, fieldFillRate: { title: 1, price: 0.9 } },
}

test('readWithFallbacks reads a nested path', () => {
  assert.equal(readWithFallbacks({ price: { value: 52.15 } }, 'price.value'), 52.15)
})

test('readWithFallbacks uses a fallback when the primary is absent', () => {
  assert.equal(readWithFallbacks({ b: 'x' }, 'a', ['b']), 'x')
})

test('readWithFallbacks returns undefined when nothing resolves', () => {
  assert.equal(readWithFallbacks({}, 'a', ['b']), undefined)
})

test('readWithFallbacks does not throw on a non-object mid-path', () => {
  assert.equal(readWithFallbacks({ price: 5 }, 'price.value'), undefined)
})

test('deriveKey strips query and fragment from a url', () => {
  assert.equal(
    deriveKey('https://books.toscrape.com/catalogue/x_1/index.html?a=1#frag', undefined),
    'https://books.toscrape.com/catalogue/x_1/index.html'
  )
})

test('deriveKey falls back to a title slug when there is no url', () => {
  assert.equal(deriveKey(undefined, 'The Black Maria'), 'the-black-maria')
})

test('deriveKey is stable across runs for the same input', () => {
  const a = deriveKey('https://x.test/a/', undefined)
  const b = deriveKey('https://x.test/a/', undefined)
  assert.equal(a, b)
})

test('applyContract extracts a well-formed payload with no issues', () => {
  const payload = [{
    title: 'The Black Maria',
    price: { value: 52.15, currency: 'GBP' },
    availability: 'In stock',
    product_url: 'https://books.toscrape.com/catalogue/the-black-maria_991/index.html',
    product_page_url: 'https://books.toscrape.com/catalogue/the-black-maria_991/index.html',
  }]
  const { records, issues } = applyContract(payload, CONTRACT)
  assert.equal(issues.length, 0)
  assert.equal(records.length, 1)
  assert.equal(records[0]?.title, 'The Black Maria')
  assert.equal(records[0]?.price, 52.15)
  assert.equal(records[0]?.inStock, true)
})

test('applyContract reports a missing required field as an issue', () => {
  const { issues } = applyContract([{ title: 'X', price: { value: 1 } }], CONTRACT)
  assert.ok(issues.some(i => i.field === 'url' && i.kind === 'missing'))
})

test('applyContract reports an unparseable number as a type issue', () => {
  const payload = [{ title: 'X', price: { value: 'not a number' }, product_url: 'https://x.test/a' }]
  const { issues } = applyContract(payload, CONTRACT)
  assert.ok(issues.some(i => i.field === 'price' && i.kind === 'type'))
})

test('parseStock reads out-of-stock text as false', () => {
  const payload = [{ title: 'X', price: { value: 1 }, availability: 'Out of stock', product_url: 'https://x.test/a' }]
  const { records } = applyContract(payload, CONTRACT)
  assert.equal(records[0]?.inStock, false)
})

test('toNumber reads a lone three-digit group as thousands, not a decimal', () => {
  assert.equal(toNumber('1,299'), 1299)
  assert.equal(toNumber('1.299'), 1299)
})

test('toNumber reads a lone two-digit group as a decimal', () => {
  assert.equal(toNumber('1,29'), 1.29)
  assert.equal(toNumber('52.15'), 52.15)
})

test('toNumber handles repeated grouping separators', () => {
  assert.equal(toNumber('1,234,567'), 1234567)
})

test('toNumber uses the later separator as the decimal when both appear', () => {
  assert.equal(toNumber('1,299.00'), 1299)
  assert.equal(toNumber('1.299,00'), 1299)
})

test('toNumber strips currency symbols and rejects non-numeric text', () => {
  assert.equal(toNumber('£52.15'), 52.15)
  assert.equal(toNumber('about ten pounds'), undefined)
  assert.equal(toNumber(''), undefined)
})
