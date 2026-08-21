import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractJson } from '../lib/brightdata/cli.ts'

test('extractJson ignores leading progress lines', () => {
  const stdout = [
    'Step: code_generator — polling (attempt 1/600)',
    'Done in 194 poll attempts.',
    '[{"title":"A"},{"title":"B"}]',
  ].join('\n')
  assert.deepEqual(extractJson(stdout), [{ title: 'A' }, { title: 'B' }])
})

test('extractJson handles a pretty-printed array', () => {
  const stdout = 'noise\n[\n  {\n    "title": "A"\n  }\n]\n'
  assert.deepEqual(extractJson(stdout), [{ title: 'A' }])
})

test('extractJson handles a single object payload', () => {
  assert.deepEqual(extractJson('noise\n{"collector_id":"c_1"}'), { collector_id: 'c_1' })
})

test('extractJson throws a useful error when there is no JSON', () => {
  assert.throws(() => extractJson('only progress lines here'), /no JSON/i)
})
