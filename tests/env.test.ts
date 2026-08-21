import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireEnv, optionalEnv } from '../lib/env.ts'

test('requireEnv returns a set value', () => {
  process.env.PROBE_SET = 'value'
  assert.equal(requireEnv('PROBE_SET'), 'value')
})

test('requireEnv names the missing variable and points at .env.example', () => {
  delete process.env.PROBE_MISSING
  assert.throws(() => requireEnv('PROBE_MISSING'), /PROBE_MISSING/)
  assert.throws(() => requireEnv('PROBE_MISSING'), /\.env\.example/)
})

test('requireEnv treats whitespace-only as missing', () => {
  process.env.PROBE_BLANK = '   '
  assert.throws(() => requireEnv('PROBE_BLANK'), /PROBE_BLANK/)
})

test('optionalEnv falls back when unset', () => {
  delete process.env.PROBE_OPT
  assert.equal(optionalEnv('PROBE_OPT', 'default'), 'default')
})
