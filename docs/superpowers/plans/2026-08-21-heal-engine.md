# Heal Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pipeline that scrapes via Bright Data Scraper Studio, detects extraction drift, asks Bright Data to repair itself, and validates the repair before it ships.

**Architecture:** Scraper Studio owns HTML→JSON and owns repair via `bdata scraper heal`. We own JSON→records, drift detection, and the validation gate that decides whether a repair proposal is approved or rejected. State lives in SQLite. No UI in this plan — the deliverable is a heal loop demonstrable from a terminal.

**Tech Stack:** TypeScript, Node 24 (native type stripping, `node:sqlite`, `node:test`), Bright Data CLI (`bdata`), OpenAI (fallback repair only). No test framework, no ORM, no HTTP client library.

**Spec:** `docs/superpowers/specs/2026-08-20-into-the-scrape-verse-design.md`

## Global Constraints

- **Node 24+ required.** Uses `node:sqlite` and `node --test` with native TypeScript type stripping.
- **Erasable TS syntax only** in files run directly by Node: no `enum`, no `namespace`, no parameter properties, no decorators. Type stripping erases types; it does not transform.
- **Deadline 2026-08-23.** If a task overruns, ship the previous task's state.
- **Git rules from `CLAUDE.md` apply to every commit:** branch as `<type>/<kebab-summary>`, Conventional Commits, and never add AI attribution to a commit message.
- **Secrets:** read only via `lib/env.ts`. Never write a token, key, or collector ID into a tracked file.
- **Windows:** `npx` must be invoked as `npx.cmd` on `win32` when using `execFile` without a shell.
- **Two targets only:** `mirror` and `books-toscrape`.
- **Five sensor signals only:** `HARD_SCHEMA_FAIL`, `FILL_RATE_DROP`, `ITEM_COUNT_COLLAPSE`, `TYPE_VIOLATION`, `FIELD_BLEED`.

## File Structure

| File | Responsibility |
|---|---|
| `lib/env.ts` | Validated environment access, fails fast with a named message |
| `lib/db/schema.sql` | DDL for all tables |
| `lib/db/index.ts` | Open, migrate, and expose typed row helpers |
| `lib/contracts/types.ts` | `PayloadContract`, `Assertions`, `ExtractedRecord`, `Issue` |
| `lib/contracts/store.ts` | Read, write, version, and roll back contracts |
| `lib/extract/path.ts` | JSON path reads with fallback paths |
| `lib/extract/key.ts` | Stable record key derivation |
| `lib/extract/transforms.ts` | `trim`, `toNumber`, `parseStock` |
| `lib/extract/index.ts` | `applyContract(payload, contract)` → records + issues |
| `lib/sensor/assertions.ts` | Evaluate a contract's assertions against records |
| `lib/sensor/signals.ts` | The five drift signals |
| `lib/sensor/index.ts` | `runSensor()` → drift verdict |
| `lib/brightdata/cli.ts` | Wrap `bdata`: run, heal, approve, reject |
| `lib/healer/prompt.ts` | Turn drift evidence into a plain-language repair prompt |
| `lib/healer/gate.ts` | The validation gate: live, regression, anchor |
| `lib/healer/fallback.ts` | OpenAI structured-output contract repair |
| `lib/healer/index.ts` | Orchestrate the heal loop |
| `lib/mirror/profiles.ts` | Deterministic DOM mutation profiles |
| `lib/mirror/render.ts` | Render the mirror page for a profile |
| `scripts/probe-cli.ts` | Task 1 empirical probe |
| `scripts/seed.ts` | Seed targets, contracts, fixtures |
| `scripts/pipeline.ts` | Run the full loop from a terminal |

---

### Task 1: Probe the CLI's proposal semantics

The spec's one unresolved question: can `bdata` run a heal proposal *before* it is approved? The answer decides whether the gate sits before or after `approve`. Nothing else can be designed correctly until this is known, so it is task 1 and its deliverable is a committed findings document, not code.

**Files:**
- Create: `scripts/probe-cli.ts`
- Create: `docs/evidence/2026-08-21-cli-proposal-semantics.md`

**Interfaces:**
- Consumes: nothing
- Produces: a documented answer that Task 7 and Task 8 depend on. If pre-approval runs are impossible, Task 8's orchestration uses the post-approval rollback path.

- [ ] **Step 1: Capture the CLI's full surface**

```bash
npx -p @brightdata/cli bdata scraper --help
npx -p @brightdata/cli bdata scraper heal --help
npx -p @brightdata/cli bdata scraper approve --help
```

Record verbatim output. Look specifically for: a flag that runs a pending proposal, a way to list pending proposals, a way to read the proposed diff, and whether `heal` prints the proposal to stdout.

- [ ] **Step 2: Provoke a real heal proposal**

The `availability` field is genuinely broken (see spec section 5), so this needs no staging.

```bash
npx -p @brightdata/cli bdata scraper heal $BRIGHT_DATA_COLLECTOR_ID \
  "The availability field concatenates the availability text of several books into one string. Each record's availability must come only from that book's own listing, and should read exactly 'In stock' or 'Out of stock'." \
  --url https://books.toscrape.com
```

Do **not** pass `--auto-approve`. Capture all output.

- [ ] **Step 3: Try to run the unapproved proposal**

```bash
npx -p @brightdata/cli bdata scraper run $BRIGHT_DATA_COLLECTOR_ID https://books.toscrape.com --pretty
```

The question: does this return the OLD (broken) availability or the NEW proposed one?
- Old output → the proposal is not live, so **the gate cannot test it pre-approval**. Use the post-approval rollback path.
- New output → **pre-approval gate is possible**. Preferred path.

- [ ] **Step 4: Record the answer**

Write `docs/evidence/2026-08-21-cli-proposal-semantics.md` containing: the three `--help` outputs, the heal command and its output, the post-heal run output, and a one-line verdict — `GATE_PLACEMENT: pre-approval` or `GATE_PLACEMENT: post-approval-rollback`.

- [ ] **Step 5: Leave the collector in a known state**

If a proposal is pending, reject it so later tasks start from the known-broken baseline:

```bash
npx -p @brightdata/cli bdata scraper approve $BRIGHT_DATA_COLLECTOR_ID --reject
npx -p @brightdata/cli bdata scraper run $BRIGHT_DATA_COLLECTOR_ID https://books.toscrape.com --pretty
```

Confirm the broken `availability` is back. That broken state is Task 10's demo input.

- [ ] **Step 6: Commit**

```bash
git checkout -b docs/cli-proposal-semantics
git add scripts/probe-cli.ts docs/evidence/2026-08-21-cli-proposal-semantics.md
git commit -m "docs: record cli heal proposal semantics"
```

---

### Task 2: Scaffold and environment validation

**Files:**
- Create: `package.json`, `tsconfig.json`
- Create: `lib/env.ts`
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces: `requireEnv(name: string): string`, `optionalEnv(name: string, fallback: string): string`. Every later task reads configuration through these two functions only.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "self-healing-scraper",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "node --test tests/",
    "seed": "node --env-file=.env.local scripts/seed.ts",
    "pipeline": "node --env-file=.env.local scripts/pipeline.ts"
  },
  "dependencies": { "openai": "^4.104.0" }
}
```

`--env-file` is native to Node; no `dotenv` dependency.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["lib", "scripts", "tests"]
}
```

`erasableSyntaxOnly` makes the compiler reject syntax Node's type stripping cannot handle, so a mistake is caught at check time rather than as a runtime crash.

- [ ] **Step 3: Write the failing test**

```ts
// tests/env.test.ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../lib/env.ts`

- [ ] **Step 5: Write minimal implementation**

```ts
// lib/env.ts
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
      `Add it to .env.local — see .env.example for the full list.`
    )
  }
  return value
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? fallback : value
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 4 tests

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/scaffold-and-env
git add package.json tsconfig.json lib/env.ts tests/env.test.ts
git commit -m "feat: add scaffold and validated environment access"
```

---

### Task 3: Database schema and store

**Files:**
- Create: `lib/db/schema.sql`, `lib/db/index.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `openDb(path: string): DatabaseSync` — migrated and ready. Callers use `db.prepare(...)` directly; there is no query-builder layer.

- [ ] **Step 1: Write `lib/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  collector_id TEXT NOT NULL,
  active_contract_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL REFERENCES targets(id),
  version INTEGER NOT NULL,
  spec_json TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('seed','studio','fallback')),
  parent_version INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (target_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL REFERENCES targets(id),
  contract_version INTEGER NOT NULL,
  snapshot_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','ok','drift','healed','failed')),
  record_count INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  key TEXT NOT NULL,
  title TEXT,
  price REAL,
  currency TEXT,
  in_stock INTEGER,
  url TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_run ON records(run_id);

CREATE TABLE IF NOT EXISTS drift_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  severity TEXT NOT NULL CHECK (severity IN ('warn','critical')),
  signals_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS heal_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drift_event_id INTEGER NOT NULL REFERENCES drift_events(id),
  from_version INTEGER NOT NULL,
  to_version INTEGER,
  status TEXT NOT NULL CHECK (status IN ('proposed','validated','promoted','rejected','failed')),
  source TEXT NOT NULL CHECK (source IN ('studio','fallback')),
  heal_prompt TEXT,
  proposal_json TEXT,
  validation_report_json TEXT,
  cli_action TEXT CHECK (cli_action IN ('approve','reject','none')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL REFERENCES targets(id),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  expected_assertions_json TEXT NOT NULL,
  golden_keys_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mirror_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  profile TEXT NOT NULL DEFAULT 'pristine',
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO mirror_state (id, profile) VALUES (1, 'pristine');
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/db.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/db.test.ts`
Expected: FAIL — cannot find module `../lib/db/index.ts`

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/db/index.ts
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'))
  return db
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/db.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/db-schema
git add lib/db tests/db.test.ts
git commit -m "feat: add sqlite schema and store"
```

---

### Task 4: Payload contract and extraction

**Files:**
- Create: `lib/contracts/types.ts`, `lib/extract/path.ts`, `lib/extract/key.ts`, `lib/extract/transforms.ts`, `lib/extract/index.ts`
- Test: `tests/extract.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type PayloadContract`, `type Assertions`, `type ExtractedRecord`, `type Issue`
  - `readWithFallbacks(item: unknown, path: string, fallbacks?: string[]): unknown`
  - `deriveKey(url: string | undefined, title: string | undefined): string`
  - `applyContract(payload: unknown[], contract: PayloadContract): { records: ExtractedRecord[]; issues: Issue[] }`

- [ ] **Step 1: Write the types**

```ts
// lib/contracts/types.ts
export type FieldName = 'title' | 'price' | 'currency' | 'availability' | 'url'

export type FieldSpec = {
  name: FieldName
  path: string
  fallbackPaths?: string[]
  transform?: 'trim' | 'toNumber' | 'parseStock'
  type: 'string' | 'number' | 'boolean' | 'url'
  required: boolean
}

export type Assertions = {
  minItems: number
  fieldFillRate: Partial<Record<FieldName, number>>
  priceRange?: [number, number]
  expectVaried?: FieldName[]
}

export type PayloadContract = {
  version: number
  targetId: string
  fields: FieldSpec[]
  assertions: Assertions
}

export type ExtractedRecord = {
  key: string
  title?: string
  price?: number
  currency?: string
  inStock?: boolean
  url?: string
  raw: Record<string, unknown>
}

export type Issue = {
  index: number
  field: FieldName
  kind: 'missing' | 'type'
  detail: string
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/extract.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readWithFallbacks } from '../lib/extract/path.ts'
import { deriveKey } from '../lib/extract/key.ts'
import { applyContract } from '../lib/extract/index.ts'
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/extract.test.ts`
Expected: FAIL — cannot find module `../lib/extract/path.ts`

- [ ] **Step 4: Implement path reading**

```ts
// lib/extract/path.ts
export function readPath(source: unknown, path: string): unknown {
  let cursor: unknown = source
  for (const segment of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

export function readWithFallbacks(source: unknown, path: string, fallbacks: string[] = []): unknown {
  for (const candidate of [path, ...fallbacks]) {
    const value = readPath(source, candidate)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}
```

- [ ] **Step 5: Implement key derivation**

```ts
// lib/extract/key.ts
export function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveKey(url: string | undefined, title: string | undefined): string {
  if (url !== undefined && url !== '') {
    try {
      const parsed = new URL(url)
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
    } catch {
      // not a valid URL — fall through to the title
    }
  }
  if (title !== undefined && title !== '') return slug(title)
  throw new Error('cannot derive record key: no url and no title')
}
```

- [ ] **Step 6: Implement transforms**

```ts
// lib/extract/transforms.ts
export function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return typeof value === 'number' ? String(value) : undefined
  const out = value.trim()
  return out === '' ? undefined : out
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  // tolerate both 1,299.00 and 1.299,00 by keeping the last separator as decimal
  const cleaned = value.replace(/[^\d.,-]/g, '')
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalised = cleaned
  if (lastComma > lastDot) normalised = cleaned.replace(/\./g, '').replace(',', '.')
  else normalised = cleaned.replace(/,/g, '')
  const parsed = Number.parseFloat(normalised)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseStock(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const text = value.toLowerCase()
  if (text.includes('out of stock') || text.includes('unavailable')) return false
  if (text.includes('in stock') || text.includes('available')) return true
  return undefined
}
```

`toNumber` already handles the `currency-format` mutation profile, which is why that profile tests the sensor rather than the parser.

- [ ] **Step 7: Implement `applyContract`**

```ts
// lib/extract/index.ts
import { readWithFallbacks } from './path.ts'
import { deriveKey } from './key.ts'
import { trim, toNumber, parseStock } from './transforms.ts'
import type { ExtractedRecord, FieldSpec, Issue, PayloadContract } from '../contracts/types.ts'

function applyTransform(spec: FieldSpec, value: unknown): unknown {
  switch (spec.transform) {
    case 'trim': return trim(value)
    case 'toNumber': return toNumber(value)
    case 'parseStock': return parseStock(value)
    default: return value
  }
}

function typeOk(spec: FieldSpec, value: unknown): boolean {
  switch (spec.type) {
    case 'number': return typeof value === 'number'
    case 'boolean': return typeof value === 'boolean'
    case 'url': return typeof value === 'string' && /^https?:\/\//.test(value)
    default: return typeof value === 'string'
  }
}

export function applyContract(
  payload: unknown[],
  contract: PayloadContract,
): { records: ExtractedRecord[]; issues: Issue[] } {
  const records: ExtractedRecord[] = []
  const issues: Issue[] = []

  payload.forEach((item, index) => {
    const values = new Map<string, unknown>()

    for (const spec of contract.fields) {
      const rawValue = readWithFallbacks(item, spec.path, spec.fallbackPaths)
      const value = applyTransform(spec, rawValue)

      if (value === undefined) {
        if (spec.required) {
          issues.push({ index, field: spec.name, kind: 'missing', detail: `no value at ${spec.path}` })
        } else if (rawValue !== undefined) {
          issues.push({ index, field: spec.name, kind: 'type', detail: `could not transform ${JSON.stringify(rawValue)}` })
        }
        continue
      }
      if (!typeOk(spec, value)) {
        issues.push({ index, field: spec.name, kind: 'type', detail: `expected ${spec.type}, got ${typeof value}` })
        continue
      }
      values.set(spec.name, value)
    }

    const url = values.get('url') as string | undefined
    const title = values.get('title') as string | undefined
    if (url === undefined && title === undefined) return

    records.push({
      key: deriveKey(url, title),
      title,
      price: values.get('price') as number | undefined,
      currency: values.get('currency') as string | undefined,
      inStock: values.get('availability') as boolean | undefined,
      url,
      raw: (item ?? {}) as Record<string, unknown>,
    })
  })

  return { records, issues }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --test tests/extract.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 9: Commit**

```bash
git checkout -b feat/payload-contract-extraction
git add lib/contracts lib/extract tests/extract.test.ts
git commit -m "feat: add payload contract and extraction"
```

---

### Task 5: Sensor signals

The `FIELD_BLEED` test uses the committed real payload, so the sensor is proven against the actual defect rather than a hand-written imitation.

**Files:**
- Create: `lib/sensor/assertions.ts`, `lib/sensor/signals.ts`, `lib/sensor/index.ts`
- Test: `tests/sensor.test.ts`

**Interfaces:**
- Consumes: `ExtractedRecord`, `Issue`, `PayloadContract`, `Assertions` from Task 4
- Produces:
  - `evaluateAssertions(records: ExtractedRecord[], assertions: Assertions): { pass: boolean; failures: string[] }`
  - `maxInternalRepeat(value: string): number`
  - `runSensor(input: SensorInput): DriftVerdict` where
    `SensorInput = { records, issues, contract, history: Array<{ recordCount: number; fillRates: Partial<Record<FieldName, number>> }> }`
    and `DriftVerdict = { severity: 'none' | 'warn' | 'critical'; signals: Signal[]; evidence: Record<string, unknown> }`
    and `Signal = { code: 'HARD_SCHEMA_FAIL' | 'FILL_RATE_DROP' | 'ITEM_COUNT_COLLAPSE' | 'TYPE_VIOLATION' | 'FIELD_BLEED'; severity: 'warn' | 'critical'; detail: string }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sensor.test.ts
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
  assert.equal(maxInternalRepeat('In stock (19 available) In stock In stock In stock'), 4)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sensor.test.ts`
Expected: FAIL — cannot find module `../lib/sensor/signals.ts`

- [ ] **Step 3: Implement assertion evaluation**

```ts
// lib/sensor/assertions.ts
import type { Assertions, ExtractedRecord, FieldName } from '../contracts/types.ts'

const FIELD_READERS: Record<FieldName, (r: ExtractedRecord) => unknown> = {
  title: r => r.title,
  price: r => r.price,
  currency: r => r.currency,
  availability: r => r.inStock,
  url: r => r.url,
}

export function fillRate(records: ExtractedRecord[], field: FieldName): number {
  if (records.length === 0) return 0
  const read = FIELD_READERS[field]
  const filled = records.filter(r => read(r) !== undefined && read(r) !== null).length
  return filled / records.length
}

export function distinctRatio(records: ExtractedRecord[], field: FieldName): number {
  if (records.length === 0) return 0
  const read = FIELD_READERS[field]
  return new Set(records.map(r => JSON.stringify(read(r)))).size / records.length
}

export function evaluateAssertions(
  records: ExtractedRecord[],
  assertions: Assertions,
): { pass: boolean; failures: string[] } {
  const failures: string[] = []

  if (records.length < assertions.minItems) {
    failures.push(`minItems: got ${records.length}, need ${assertions.minItems}`)
  }
  for (const [field, floor] of Object.entries(assertions.fieldFillRate)) {
    const rate = fillRate(records, field as FieldName)
    if (rate < (floor as number)) {
      failures.push(`fillRate.${field}: got ${rate.toFixed(2)}, need ${floor}`)
    }
  }
  if (assertions.priceRange) {
    const [lo, hi] = assertions.priceRange
    const outside = records.filter(r => r.price !== undefined && (r.price < lo || r.price > hi))
    if (outside.length > 0) failures.push(`priceRange: ${outside.length} record(s) outside [${lo},${hi}]`)
  }
  for (const field of assertions.expectVaried ?? []) {
    if (records.length > 1 && distinctRatio(records, field) < 0.5) {
      failures.push(`expectVaried.${field}: only ${distinctRatio(records, field).toFixed(2)} distinct`)
    }
  }

  return { pass: failures.length === 0, failures }
}
```

- [ ] **Step 4: Implement the signals**

```ts
// lib/sensor/signals.ts
export function maxInternalRepeat(value: string): number {
  const tokens = value.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length < 4) return 1

  let best = 1
  // n starts at 2: single-word repeats are common in ordinary prose and titles
  const maxN = Math.min(4, Math.floor(tokens.length / 2))
  for (let n = 2; n <= maxN; n++) {
    const counts = new Map<string, number>()
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n).join(' ')
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
    for (const count of counts.values()) if (count > best) best = count
  }
  return best
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
}
```

- [ ] **Step 5: Implement `runSensor`**

```ts
// lib/sensor/index.ts
import { evaluateAssertions, fillRate } from './assertions.ts'
import { maxInternalRepeat, median } from './signals.ts'
import type { ExtractedRecord, FieldName, Issue, PayloadContract } from '../contracts/types.ts'

export type SignalCode =
  | 'HARD_SCHEMA_FAIL' | 'FILL_RATE_DROP' | 'ITEM_COUNT_COLLAPSE'
  | 'TYPE_VIOLATION' | 'FIELD_BLEED'

export type Signal = { code: SignalCode; severity: 'warn' | 'critical'; detail: string }

export type HistoryEntry = { recordCount: number; fillRates: Partial<Record<FieldName, number>> }

export type SensorInput = {
  records: ExtractedRecord[]
  issues: Issue[]
  contract: PayloadContract
  history: HistoryEntry[]
}

export type DriftVerdict = {
  severity: 'none' | 'warn' | 'critical'
  signals: Signal[]
  evidence: Record<string, unknown>
}

const BLEED_THRESHOLD = 3
const MISSING_SHARE = 0.2
const FILL_DROP_POINTS = 0.4

export function runSensor(input: SensorInput): DriftVerdict {
  const { records, issues, contract, history } = input
  const signals: Signal[] = []
  const total = Math.max(records.length, 1)

  // 1 HARD_SCHEMA_FAIL
  for (const spec of contract.fields.filter(f => f.required)) {
    const missing = issues.filter(i => i.field === spec.name && i.kind === 'missing').length
    if (missing / total > MISSING_SHARE) {
      signals.push({ code: 'HARD_SCHEMA_FAIL', severity: 'critical',
        detail: `${spec.name} missing in ${missing}/${total} records` })
    }
  }

  // 4 TYPE_VIOLATION
  const typeIssues = issues.filter(i => i.kind === 'type')
  if (typeIssues.length / total > MISSING_SHARE) {
    signals.push({ code: 'TYPE_VIOLATION', severity: 'critical',
      detail: `${typeIssues.length} type failures, e.g. ${typeIssues[0]?.detail ?? ''}` })
  }

  // 3 ITEM_COUNT_COLLAPSE
  const historicalMedian = median(history.map(h => h.recordCount))
  if (records.length < contract.assertions.minItems) {
    signals.push({ code: 'ITEM_COUNT_COLLAPSE', severity: 'critical',
      detail: `${records.length} records, minItems ${contract.assertions.minItems}` })
  } else if (historicalMedian > 0 && records.length < historicalMedian * 0.5) {
    signals.push({ code: 'ITEM_COUNT_COLLAPSE', severity: 'critical',
      detail: `${records.length} records vs rolling median ${historicalMedian}` })
  }

  // 2 FILL_RATE_DROP
  for (const spec of contract.fields) {
    const current = fillRate(records, spec.name)
    const past = median(
      history.map(h => h.fillRates[spec.name]).filter((v): v is number => v !== undefined)
    )
    const floor = contract.assertions.fieldFillRate[spec.name]
    if (floor !== undefined && current < floor) {
      signals.push({ code: 'FILL_RATE_DROP', severity: 'critical',
        detail: `${spec.name} fill ${current.toFixed(2)} below floor ${floor}` })
    } else if (past > 0 && past - current > FILL_DROP_POINTS) {
      signals.push({ code: 'FILL_RATE_DROP', severity: 'critical',
        detail: `${spec.name} fill fell ${past.toFixed(2)} -> ${current.toFixed(2)}` })
    }
  }

  // 5 FIELD_BLEED — intra-value self-repetition
  const bleeding: Record<string, number> = {}
  for (const record of records) {
    for (const [field, value] of Object.entries(record.raw)) {
      if (typeof value !== 'string') continue
      const repeat = maxInternalRepeat(value)
      if (repeat >= BLEED_THRESHOLD) bleeding[field] = Math.max(bleeding[field] ?? 0, repeat)
    }
  }
  for (const [field, repeat] of Object.entries(bleeding)) {
    signals.push({ code: 'FIELD_BLEED', severity: 'critical',
      detail: `${field} repeats an internal phrase ${repeat}x within a single value` })
  }

  // contract assertions (carries expectVaried)
  const assertionResult = evaluateAssertions(records, contract.assertions)
  for (const failure of assertionResult.failures) {
    if (failure.startsWith('expectVaried')) {
      signals.push({ code: 'FIELD_BLEED', severity: 'critical', detail: failure })
    }
  }

  const severity: DriftVerdict['severity'] =
    signals.some(s => s.severity === 'critical') ? 'critical'
    : signals.length > 0 ? 'warn'
    : 'none'

  return {
    severity,
    signals,
    evidence: {
      recordCount: records.length,
      issueCount: issues.length,
      assertionFailures: assertionResult.failures,
      sampleRecords: records.slice(0, 3).map(r => r.raw),
    },
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/sensor.test.ts`
Expected: PASS, 12 tests

If `FIELD_BLEED fires on the real broken payload` fails, print `maxInternalRepeat` for each `availability` value before changing the threshold — the real data has repeat counts of 3 to 7, so a passing threshold of 3 is correct and a failure means the n-gram loop is wrong.

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/drift-sensor
git add lib/sensor tests/sensor.test.ts
git commit -m "feat: add drift sensor with five signals"
```

---

### Task 6: Bright Data CLI wrapper

**Files:**
- Create: `lib/brightdata/cli.ts`
- Test: `tests/brightdata.test.ts`

**Interfaces:**
- Consumes: `requireEnv` from Task 2
- Produces:
  - `extractJson(stdout: string): unknown` — pulls the JSON payload out of CLI output that also contains progress lines
  - `runCollector(collectorId: string, url: string): Promise<unknown[]>`
  - `healCollector(collectorId: string, prompt: string, url: string): Promise<{ stdout: string }>`
  - `approveProposal(collectorId: string, url: string): Promise<void>`
  - `rejectProposal(collectorId: string, url: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

`extractJson` is the only pure part and the only part worth unit-testing; the rest is a process boundary verified manually in Task 10.

```ts
// tests/brightdata.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/brightdata.test.ts`
Expected: FAIL — cannot find module `../lib/brightdata/cli.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/brightdata/cli.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

// On Windows, execFile without a shell cannot launch npx (a .cmd shim).
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const BASE = ['-p', '@brightdata/cli', 'bdata']
const TIMEOUT_MS = 300_000
const MAX_BUFFER = 32 * 1024 * 1024

export function extractJson(stdout: string): unknown {
  const firstArray = stdout.indexOf('[')
  const firstObject = stdout.indexOf('{')
  const candidates = [firstArray, firstObject].filter(i => i >= 0).sort((a, b) => a - b)
  for (const start of candidates) {
    for (let end = stdout.length; end > start; end--) {
      const slice = stdout.slice(start, end)
      try {
        return JSON.parse(slice)
      } catch {
        // keep shrinking the window
      }
    }
  }
  throw new Error(`no JSON found in CLI output: ${stdout.slice(0, 200)}`)
}

async function bdata(args: string[]): Promise<string> {
  const { stdout } = await run(NPX, [...BASE, ...args], { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER })
  return stdout
}

export async function runCollector(collectorId: string, url: string): Promise<unknown[]> {
  const stdout = await bdata(['scraper', 'run', collectorId, url, '--pretty'])
  const payload = extractJson(stdout)
  if (!Array.isArray(payload)) throw new Error('collector did not return an array')
  return payload
}

export async function healCollector(
  collectorId: string, prompt: string, url: string,
): Promise<{ stdout: string }> {
  // deliberately no --auto-approve: the proposal must face the gate first
  return { stdout: await bdata(['scraper', 'heal', collectorId, prompt, '--url', url]) }
}

export async function approveProposal(collectorId: string, url: string): Promise<void> {
  await bdata(['scraper', 'approve', collectorId, '--url', url])
}

export async function rejectProposal(collectorId: string, url: string): Promise<void> {
  await bdata(['scraper', 'approve', collectorId, '--url', url, '--reject'])
}
```

The shrinking-window parse in `extractJson` is deliberately simple rather than clever: CLI output has trailing lines after the JSON as well as leading ones, and a brace-counting parser would need to handle strings containing braces.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/brightdata.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/brightdata-cli
git add lib/brightdata tests/brightdata.test.ts
git commit -m "feat: add bright data cli wrapper"
```

---

### Task 7: The validation gate

This is the most important task in the plan. The gate is what makes "self-healing" a claim rather than a hope, and its rejection test is the evidence behind it.

**Files:**
- Create: `lib/healer/gate.ts`
- Test: `tests/gate.test.ts`

**Interfaces:**
- Consumes: `evaluateAssertions` (Task 5), `ExtractedRecord`, `Assertions` (Task 4)
- Produces:
  - `type GateCheck = { name: 'live' | 'regression' | 'anchor'; pass: boolean; detail: string }`
  - `type GateVerdict = { pass: boolean; checks: GateCheck[] }`
  - `evaluateGate(input: GateInput): GateVerdict` where
    `GateInput = { live: { records: ExtractedRecord[]; assertions: Assertions }, regression: Array<{ label: string; records: ExtractedRecord[]; assertions: Assertions }>, lastGoodKeys: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gate.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gate.test.ts`
Expected: FAIL — cannot find module `../lib/healer/gate.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/healer/gate.ts
import { evaluateAssertions } from '../sensor/assertions.ts'
import type { Assertions, ExtractedRecord } from '../contracts/types.ts'

const ANCHOR_MIN_OVERLAP = 0.3

export type GateCheck = { name: 'live' | 'regression' | 'anchor'; pass: boolean; detail: string }
export type GateVerdict = { pass: boolean; checks: GateCheck[] }

export type GateInput = {
  live: { records: ExtractedRecord[]; assertions: Assertions }
  regression: Array<{ label: string; records: ExtractedRecord[]; assertions: Assertions }>
  lastGoodKeys: string[]
}

export function evaluateGate(input: GateInput): GateVerdict {
  const checks: GateCheck[] = []

  const live = evaluateAssertions(input.live.records, input.live.assertions)
  checks.push({
    name: 'live',
    pass: live.pass,
    detail: live.pass ? `${input.live.records.length} records, all assertions met` : live.failures.join('; '),
  })

  const regressionFailures: string[] = []
  for (const fixture of input.regression) {
    const result = evaluateAssertions(fixture.records, fixture.assertions)
    if (!result.pass) regressionFailures.push(`${fixture.label}: ${result.failures.join('; ')}`)
  }
  checks.push({
    name: 'regression',
    pass: regressionFailures.length === 0,
    detail: regressionFailures.length === 0
      ? `${input.regression.length} fixture(s) still pass`
      : regressionFailures.join(' | '),
  })

  if (input.lastGoodKeys.length === 0) {
    checks.push({ name: 'anchor', pass: true, detail: 'skipped: no prior good run to anchor against' })
  } else {
    const liveKeys = new Set(input.live.records.map(r => r.key))
    const kept = input.lastGoodKeys.filter(k => liveKeys.has(k)).length
    const ratio = kept / input.lastGoodKeys.length
    checks.push({
      name: 'anchor',
      pass: ratio >= ANCHOR_MIN_OVERLAP,
      detail: `${kept}/${input.lastGoodKeys.length} known keys retained (${(ratio * 100).toFixed(0)}%, need ${ANCHOR_MIN_OVERLAP * 100}%)`,
    })
  }

  return { pass: checks.every(c => c.pass), checks }
}
```

Every check runs unconditionally rather than short-circuiting, because the whole report is written to `heal_attempts.validation_report_json` and a partial report makes the audit trail useless.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gate.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/validation-gate
git add lib/healer/gate.ts tests/gate.test.ts
git commit -m "feat: add validation gate with live, regression and anchor checks"
```

---

### Task 8: Heal prompt and fallback repair

**Files:**
- Create: `lib/healer/prompt.ts`, `lib/healer/fallback.ts`
- Test: `tests/prompt.test.ts`

**Interfaces:**
- Consumes: `DriftVerdict`, `Signal` (Task 5), `PayloadContract` (Task 4), `requireEnv`/`optionalEnv` (Task 2)
- Produces:
  - `buildHealPrompt(input: { verdict: DriftVerdict; contract: PayloadContract; sample: unknown[]; priorRejection?: string }): string`
  - `proposeContract(args: { contract: PayloadContract; verdict: DriftVerdict; sample: unknown[] }): Promise<PayloadContract>`

- [ ] **Step 1: Write the failing test**

The prompt is a pure function, so it is testable without touching a network.

```ts
// tests/prompt.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prompt.test.ts`
Expected: FAIL — cannot find module `../lib/healer/prompt.ts`

- [ ] **Step 3: Implement the prompt builder**

```ts
// lib/healer/prompt.ts
import type { PayloadContract } from '../contracts/types.ts'
import type { DriftVerdict } from '../sensor/index.ts'

const SAMPLE_LIMIT = 3

export function buildHealPrompt(input: {
  verdict: DriftVerdict
  contract: PayloadContract
  sample: unknown[]
  priorRejection?: string
}): string {
  const { verdict, contract, sample, priorRejection } = input

  const symptoms = verdict.signals.map(s => `- ${s.code}: ${s.detail}`).join('\n')
  const expected = contract.fields
    .map(f => `- ${f.name}: one ${f.type} per item, read from ${f.path}${f.required ? ' (required)' : ''}`)
    .join('\n')
  const samples = sample.slice(0, SAMPLE_LIMIT)
    .map(item => JSON.stringify(item))
    .join('\n')

  const retry = priorRejection === undefined ? '' :
    `\nA previous attempt was rejected by validation for this reason:\n${priorRejection}\n` +
    `Produce a different fix that addresses it. Do not repeat the rejected approach.\n`

  return [
    `The scraper's output is malformed. Fix the extraction logic.`,
    ``,
    `Detected problems:`,
    symptoms,
    ``,
    `Each record should contain:`,
    expected,
    ``,
    `Actual malformed output:`,
    samples,
    retry,
    `Each field must be read from that item's own element only. Do not concatenate`,
    `text from sibling or ancestor elements. Item count and the other fields are`,
    `currently correct, so preserve them.`,
  ].join('\n')
}
```

The prompt is assembled only from the contract, the sensor's signals, and the sampled payload. No environment value is ever interpolated, which is what the leak test pins.

- [ ] **Step 4: Implement the OpenAI fallback**

```ts
// lib/healer/fallback.ts
import OpenAI from 'openai'
import { optionalEnv, requireEnv } from '../env.ts'
import { buildHealPrompt } from './prompt.ts'
import type { PayloadContract } from '../contracts/types.ts'
import type { DriftVerdict } from '../sensor/index.ts'

const CONTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'path', 'type', 'required'],
        properties: {
          name: { type: 'string', enum: ['title', 'price', 'currency', 'availability', 'url'] },
          path: { type: 'string' },
          fallbackPaths: { type: 'array', items: { type: 'string' } },
          transform: { type: 'string', enum: ['trim', 'toNumber', 'parseStock'] },
          type: { type: 'string', enum: ['string', 'number', 'boolean', 'url'] },
          required: { type: 'boolean' },
        },
      },
    },
  },
} as const

export async function proposeContract(args: {
  contract: PayloadContract
  verdict: DriftVerdict
  sample: unknown[]
}): Promise<PayloadContract> {
  const client = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
  const model = requireEnv('OPENAI_MODEL')

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content:
        'You repair JSON field mappings. The scraper payload shape is fixed; only the ' +
        'field paths and transforms may change. Return only the fields array.' },
      { role: 'user', content:
        `${buildHealPrompt(args)}\n\nCurrent mapping:\n${JSON.stringify(args.contract.fields, null, 2)}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'payload_contract_fields', strict: true, schema: CONTRACT_SCHEMA },
    },
  })

  const content = response.choices[0]?.message.content
  if (content === null || content === undefined) throw new Error('fallback repair returned no content')
  const parsed = JSON.parse(content) as { fields: PayloadContract['fields'] }

  return {
    ...args.contract,
    version: args.contract.version + 1,
    fields: parsed.fields,
  }
}

export function fallbackModelName(): string {
  return optionalEnv('OPENAI_MODEL', '(unset)')
}
```

- [ ] **Step 5: Verify `OPENAI_MODEL` names a real model**

`requireEnv('OPENAI_MODEL')` fails fast rather than guessing, so confirm a live value before relying on this path:

```bash
node --env-file=.env.local -e "
const OpenAI = (await import('openai')).default
const c = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const list = await c.models.list()
console.log(list.data.map(m => m.id).sort().join('\n'))
"
```

Pick a current chat model that supports `json_schema` response format, write it into `.env.local` as `OPENAI_MODEL`, and record the chosen id in the commit body. Do not hardcode it anywhere.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/prompt.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/heal-prompt-and-fallback
git add lib/healer/prompt.ts lib/healer/fallback.ts tests/prompt.test.ts
git commit -m "feat: add heal prompt builder and openai fallback repair"
```

---

### Task 9: Heal orchestration

Ties Tasks 5 through 8 into the loop. Gate placement follows Task 1's verdict.

**Files:**
- Create: `lib/healer/index.ts`
- Test: `tests/healer.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4 through 8
- Produces: `healTarget(deps: HealDeps, input: HealInput): Promise<HealOutcome>` where dependencies are injected so the loop is testable without a network:

```ts
export type HealDeps = {
  heal: (collectorId: string, prompt: string, url: string) => Promise<{ stdout: string }>
  approve: (collectorId: string, url: string) => Promise<void>
  reject: (collectorId: string, url: string) => Promise<void>
  runCollector: (collectorId: string, url: string) => Promise<unknown[]>
  fallbackPropose: (args: { contract: PayloadContract; verdict: DriftVerdict; sample: unknown[] }) => Promise<PayloadContract>
}
export type HealOutcome = {
  status: 'promoted' | 'rejected' | 'failed'
  source: 'studio' | 'fallback' | 'none'
  attempts: Array<{ source: 'studio' | 'fallback'; verdict: GateVerdict; cliAction: 'approve' | 'reject' | 'none' }>
  contract: PayloadContract
}
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/healer.test.ts
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

test('a failing studio proposal is rejected, not approved', async () => {
  const d = deps({ runCollector: async () => goodPayload('unrelated-carousel') })
  const outcome = await healTarget(d, input)
  assert.ok(d.calls.includes('reject'))
  assert.ok(!d.calls.includes('approve'))
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

test('every attempt is recorded for the audit trail', async () => {
  const d = deps({ runCollector: async () => goodPayload('unrelated-carousel') })
  const outcome = await healTarget(d, input)
  assert.ok(outcome.attempts.length >= 3)
  assert.ok(outcome.attempts.every(a => a.verdict.checks.length === 3))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/healer.test.ts`
Expected: FAIL — cannot find module `../lib/healer/index.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/healer/index.ts
import { applyContract } from '../extract/index.ts'
import { buildHealPrompt } from './prompt.ts'
import { evaluateGate } from './gate.ts'
import type { GateVerdict } from './gate.ts'
import type { Assertions, PayloadContract } from '../contracts/types.ts'
import type { DriftVerdict } from '../sensor/index.ts'

const STUDIO_ATTEMPTS = 3

export type HealDeps = {
  heal: (collectorId: string, prompt: string, url: string) => Promise<{ stdout: string }>
  approve: (collectorId: string, url: string) => Promise<void>
  reject: (collectorId: string, url: string) => Promise<void>
  runCollector: (collectorId: string, url: string) => Promise<unknown[]>
  fallbackPropose: (args: {
    contract: PayloadContract; verdict: DriftVerdict; sample: unknown[]
  }) => Promise<PayloadContract>
}

export type HealInput = {
  collectorId: string
  url: string
  contract: PayloadContract
  verdict: DriftVerdict
  sample: unknown[]
  lastGoodKeys: string[]
  fixtures: Array<{ label: string; url: string; assertions: Assertions }>
}

export type HealAttempt = {
  source: 'studio' | 'fallback'
  verdict: GateVerdict
  cliAction: 'approve' | 'reject' | 'none'
}

export type HealOutcome = {
  status: 'promoted' | 'rejected' | 'failed'
  source: 'studio' | 'fallback' | 'none'
  attempts: HealAttempt[]
  contract: PayloadContract
}

async function gateFor(
  deps: HealDeps, input: HealInput, contract: PayloadContract,
): Promise<GateVerdict> {
  const livePayload = await deps.runCollector(input.collectorId, input.url)
  const live = applyContract(livePayload, contract)

  const regression = []
  for (const fixture of input.fixtures) {
    const payload = fixture.url === input.url
      ? livePayload
      : await deps.runCollector(input.collectorId, fixture.url)
    regression.push({
      label: fixture.label,
      records: applyContract(payload, contract).records,
      assertions: fixture.assertions,
    })
  }

  return evaluateGate({
    live: { records: live.records, assertions: contract.assertions },
    regression,
    lastGoodKeys: input.lastGoodKeys,
  })
}

export async function healTarget(deps: HealDeps, input: HealInput): Promise<HealOutcome> {
  const attempts: HealAttempt[] = []
  let priorRejection: string | undefined

  for (let attempt = 0; attempt < STUDIO_ATTEMPTS; attempt++) {
    const prompt = buildHealPrompt({
      verdict: input.verdict, contract: input.contract, sample: input.sample, priorRejection,
    })
    try {
      await deps.heal(input.collectorId, prompt, input.url)
      const verdict = await gateFor(deps, input, input.contract)

      if (verdict.pass) {
        await deps.approve(input.collectorId, input.url)
        attempts.push({ source: 'studio', verdict, cliAction: 'approve' })
        return {
          status: 'promoted',
          source: 'studio',
          attempts,
          contract: { ...input.contract, version: input.contract.version + 1 },
        }
      }

      await deps.reject(input.collectorId, input.url)
      attempts.push({ source: 'studio', verdict, cliAction: 'reject' })
      priorRejection = verdict.checks.filter(c => !c.pass).map(c => `${c.name}: ${c.detail}`).join('; ')
    } catch (error) {
      return {
        status: 'failed', source: 'none', attempts, contract: input.contract,
      }
    }
  }

  // Studio exhausted. Try our own repair; it faces the identical gate.
  try {
    const candidate = await deps.fallbackPropose({
      contract: input.contract, verdict: input.verdict, sample: input.sample,
    })
    const verdict = await gateFor(deps, input, candidate)
    attempts.push({ source: 'fallback', verdict, cliAction: 'none' })
    if (verdict.pass) {
      return { status: 'promoted', source: 'fallback', attempts, contract: candidate }
    }
  } catch {
    // fall through to failed: the old contract stays live
  }

  return { status: 'failed', source: 'none', attempts, contract: input.contract }
}
```

If Task 1 concluded `GATE_PLACEMENT: post-approval-rollback`, change only `gateFor`'s caller: `approve` before gating, and on failure call `reject` to restore. The gate itself, the retry logic, and the audit trail are unchanged — which is why the placement question was safe to defer past design.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/healer.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all tests from Tasks 2 through 9

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/heal-orchestration
git add lib/healer/index.ts tests/healer.test.ts
git commit -m "feat: add heal orchestration with studio retry and fallback"
```

---

### Task 10: Seed, pipeline, and live end-to-end proof

The point where the loop stops being unit-tested and becomes real. The `availability` defect is genuinely present in the collector, so this needs no staging.

**Files:**
- Create: `scripts/seed.ts`, `scripts/pipeline.ts`
- Create: `docs/evidence/2026-08-22-live-heal-run.md`

**Interfaces:**
- Consumes: every module from Tasks 2 through 9
- Produces: a terminal-runnable demonstration and a committed transcript

- [ ] **Step 1: Write the seed script**

```ts
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

db.prepare(
  `INSERT INTO fixtures (target_id,label,url,expected_assertions_json,golden_keys_json)
   VALUES (?,?,?,?,?)`
).run('books-toscrape', 'homepage', 'https://books.toscrape.com',
      JSON.stringify(BOOKS_CONTRACT.assertions), JSON.stringify([]))

console.log('seeded books-toscrape at contract v1')
```

- [ ] **Step 2: Write the pipeline script**

```ts
// scripts/pipeline.ts
import { openDb } from '../lib/db/index.ts'
import { requireEnv } from '../lib/env.ts'
import { applyContract } from '../lib/extract/index.ts'
import { runSensor } from '../lib/sensor/index.ts'
import { healTarget } from '../lib/healer/index.ts'
import { proposeContract } from '../lib/healer/fallback.ts'
import { approveProposal, healCollector, rejectProposal, runCollector } from '../lib/brightdata/cli.ts'
import type { PayloadContract } from '../lib/contracts/types.ts'

const db = openDb('data.db')
const collectorId = requireEnv('BRIGHT_DATA_COLLECTOR_ID')
const url = 'https://books.toscrape.com'

const contractRow = db.prepare(
  `SELECT spec_json FROM contracts WHERE target_id='books-toscrape'
   ORDER BY version DESC LIMIT 1`
).get() as { spec_json: string }
const contract = JSON.parse(contractRow.spec_json) as PayloadContract

console.log(`\n=== scraping with contract v${contract.version} ===`)
const payload = await runCollector(collectorId, url)
const { records, issues } = applyContract(payload, contract)
console.log(`${records.length} records, ${issues.length} issues`)

const history = (db.prepare(
  `SELECT record_count FROM runs WHERE target_id='books-toscrape' AND status='ok'
   ORDER BY id DESC LIMIT 5`
).all() as Array<{ record_count: number }>).map(r => ({ recordCount: r.record_count, fillRates: {} }))

const verdict = runSensor({ records, issues, contract, history })
console.log(`\n=== sensor: ${verdict.severity} ===`)
for (const signal of verdict.signals) console.log(`  ${signal.code}: ${signal.detail}`)

const runId = Number((db.prepare(
  `INSERT INTO runs (target_id,contract_version,status,record_count,raw_payload)
   VALUES (?,?,?,?,?) RETURNING id`
).get('books-toscrape', contract.version, verdict.severity === 'critical' ? 'drift' : 'ok',
       records.length, JSON.stringify(payload)) as { id: number }).id)

if (verdict.severity !== 'critical') {
  console.log('\nno critical drift — nothing to heal')
  process.exit(0)
}

const driftId = Number((db.prepare(
  `INSERT INTO drift_events (run_id,severity,signals_json,evidence_json)
   VALUES (?,?,?,?) RETURNING id`
).get(runId, 'critical', JSON.stringify(verdict.signals), JSON.stringify(verdict.evidence)) as { id: number }).id)

console.log('\n=== healing ===')
const outcome = await healTarget(
  { heal: healCollector, approve: approveProposal, reject: rejectProposal,
    runCollector, fallbackPropose: proposeContract },
  { collectorId, url, contract, verdict, sample: payload.slice(0, 3),
    lastGoodKeys: records.map(r => r.key),
    fixtures: [{ label: 'homepage', url, assertions: contract.assertions }] },
)

console.log(`\n=== outcome: ${outcome.status} via ${outcome.source} ===`)
outcome.attempts.forEach((attempt, i) => {
  console.log(`  attempt ${i + 1} (${attempt.source}) -> cli:${attempt.cliAction}`)
  for (const check of attempt.verdict.checks) {
    console.log(`    ${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
  }
})

for (const attempt of outcome.attempts) {
  db.prepare(
    `INSERT INTO heal_attempts
     (drift_event_id,from_version,to_version,status,source,validation_report_json,cli_action)
     VALUES (?,?,?,?,?,?,?)`
  ).run(driftId, contract.version, outcome.contract.version,
        attempt.verdict.pass ? 'promoted' : 'rejected', attempt.source,
        JSON.stringify(attempt.verdict), attempt.cliAction)
}

if (outcome.status === 'promoted') {
  db.prepare(
    `INSERT INTO contracts (target_id,version,spec_json,created_by,parent_version,note)
     VALUES (?,?,?,?,?,?)`
  ).run('books-toscrape', outcome.contract.version, JSON.stringify(outcome.contract),
        outcome.source === 'studio' ? 'studio' : 'fallback', contract.version,
        `healed after ${outcome.attempts.length} attempt(s)`)
  db.prepare(`UPDATE targets SET active_contract_version=? WHERE id='books-toscrape'`)
    .run(outcome.contract.version)
  db.prepare(`UPDATE runs SET status='healed' WHERE id=?`).run(runId)
  console.log(`\npromoted contract v${outcome.contract.version}`)
} else {
  console.log(`\ncontract v${contract.version} stays live`)
}
```

- [ ] **Step 3: Seed and run**

```bash
npm run seed
npm run pipeline
```

Expected on the first run: 20 records, `critical` severity, `FIELD_BLEED` naming `availability`, then a heal attempt with a three-check gate report.

- [ ] **Step 4: Capture the transcript**

Save the full terminal output to `docs/evidence/2026-08-22-live-heal-run.md`. Record the outcome honestly, including a `failed` result. A gate that correctly rejects three bad proposals is a better demonstration than one that rubber-stamps a fix, and the transcript is the submission's core evidence either way.

- [ ] **Step 5: Verify the loop settles**

```bash
npm run pipeline
```

If the first run promoted a fix, this run should report `severity: none` and exit without healing. That transition — critical, then healed, then clean — is the demo.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/pipeline-and-seed
git add scripts docs/evidence/2026-08-22-live-heal-run.md
git commit -m "feat: add seed and pipeline scripts with live heal transcript"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 2 Architecture, module boundaries | Tasks 2–9 mirror the `lib/` layout |
| 2 Division of labour, heal/approve seam | Tasks 6, 9 |
| 2 Open question, gate placement | Task 1, applied in Task 9 |
| 3 Data model | Task 3 |
| 4 Payload contract | Task 4 |
| 5 Five signals, `FIELD_BLEED` | Task 5 |
| 6 Heal loop, three-part gate | Tasks 7, 9 |
| 6 OpenAI fallback, `OPENAI_MODEL` from env | Task 8 |
| 9 Error handling, infra vs drift | Task 3 status enum, Task 9 failure paths |
| 10 Testing, rejection path is critical | Task 7 test 2, Task 9 test 2 |
| 12 Prerequisites | Task 8 Step 5 resolves `OPENAI_MODEL` |

**Deferred to the console plan, deliberately:** spec section 7 (mutable mirror), section 8 (console UI). The mirror is a UI-adjacent asset and the engine is demonstrable without it, since the real `availability` defect supplies genuine drift. Signal 6 is infeasible per spec section 13 and has no task.

**Known gap:** `fixtures.golden_keys_json` is seeded empty in Task 10 and the anchor check is fed from the current run's keys instead. That is correct on the first run (nothing prior exists) but means the anchor check is weak until a second good run is stored. Populating `golden_keys_json` after the first `ok` run is the first task of the console plan.

**Type consistency:** verified — `PayloadContract`, `Assertions`, `ExtractedRecord`, `Issue`, `FieldName` are defined once in Task 4 and imported everywhere. `DriftVerdict` and `Signal` are defined in Task 5 and consumed unchanged in Tasks 8 and 9. `GateVerdict` is defined in Task 7 and consumed in Task 9. `runSensor`, `applyContract`, `evaluateGate`, `healTarget`, `buildHealPrompt`, and `proposeContract` keep identical signatures across every task that names them.
