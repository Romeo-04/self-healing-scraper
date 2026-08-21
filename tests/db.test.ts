import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../lib/db/index.ts'

test('openDb creates every table', () => {
  const db = openDb(':memory:')
  const rows = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  ).all() as Array<{ name: string }>
  const names = rows.map(r => r.name)
  for (const t of ['contracts','drift_events','fixtures','heal_attempts','mirror_state','records','runs','targets']) {
    assert.ok(names.includes(t), `missing table ${t}`)
  }
})

test('mirror_state is seeded as a singleton', () => {
  const db = openDb(':memory:')
  const row = db.prepare(`SELECT profile FROM mirror_state WHERE id = 1`).get() as { profile: string }
  assert.equal(row.profile, 'pristine')
})

test('runs.status rejects an unknown status', () => {
  const db = openDb(':memory:')
  db.prepare(`INSERT INTO targets (id,name,url,collector_id) VALUES ('t','T','http://x','c_1')`).run()
  assert.throws(() =>
    db.prepare(`INSERT INTO runs (target_id,contract_version,status) VALUES ('t',1,'bogus')`).run()
  )
})

test('a contract version is unique per target', () => {
  const db = openDb(':memory:')
  db.prepare(`INSERT INTO targets (id,name,url,collector_id) VALUES ('t','T','http://x','c_1')`).run()
  const ins = db.prepare(`INSERT INTO contracts (target_id,version,spec_json,created_by) VALUES ('t',1,'{}','seed')`)
  ins.run()
  assert.throws(() => ins.run())
})
