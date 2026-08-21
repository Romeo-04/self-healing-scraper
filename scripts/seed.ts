// scripts/seed.ts
import { openDb } from '../lib/db/index.ts'
import { requireEnv } from '../lib/env.ts'
import type { PayloadContract } from '../lib/contracts/types.ts'

const BOOKS_CONTRACT: PayloadContract = {
  version: 1,
  targetId: 'books-toscrape',
  fields: [
    { name: 'title',        path: 'title',           transform: 'trim',       type: 'string',  required: true },
    { name: 'price',        path: 'price.value',     transform: 'toNumber',   type: 'number',  required: true },
    { name: 'currency',     path: 'price.currency',  transform: 'trim',       type: 'string',  required: false },
    { name: 'availability', path: 'availability',    transform: 'parseStock', type: 'boolean', required: false },
    { name: 'url',          path: 'product_url', fallbackPaths: ['product_page_url'], type: 'url', required: true },
  ],
  assertions: {
    minItems: 15,
    fieldFillRate: { title: 1, price: 0.9, url: 1 },
    priceRange: [1, 1000],
    expectVaried: ['title', 'url'],
  },
}

const db = openDb('data.db')

db.prepare(
  `INSERT OR REPLACE INTO targets (id,name,url,collector_id,active_contract_version)
   VALUES (?,?,?,?,?)`
).run('books-toscrape', 'Books to Scrape', 'https://books.toscrape.com', requireEnv('BRIGHT_DATA_COLLECTOR_ID'), 1)

db.prepare(
  `INSERT OR IGNORE INTO contracts (target_id,version,spec_json,created_by,note)
   VALUES (?,?,?,?,?)`
).run('books-toscrape', 1, JSON.stringify(BOOKS_CONTRACT), 'seed', 'initial hand-written contract')

const existingFixture = db.prepare(
  `SELECT id FROM fixtures WHERE target_id='books-toscrape' AND label='homepage'`
).get()

if (existingFixture === undefined) {
  db.prepare(
    `INSERT INTO fixtures (target_id,label,url,expected_assertions_json,golden_keys_json)
     VALUES (?,?,?,?,?)`
  ).run('books-toscrape', 'homepage', 'https://books.toscrape.com',
        JSON.stringify(BOOKS_CONTRACT.assertions), JSON.stringify([]))
}

console.log('seeded books-toscrape at contract v1')
