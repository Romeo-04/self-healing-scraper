# Into the Scrape-Verse — Design

**Date:** 2026-08-20
**Deadline:** 2026-08-23 (~72 hours)
**Event:** WeMakeDevs x Bright Data — self-healing web scrapers
**Tracks targeted:** Web-Slinger (Best Use of Bright Data), Spider-Sense (Clean Code), Suit-Up (Best UI)

## 1. What we are building

A **Scraper Ops console** for Bright Data Scraper Studio collectors, powering a live **product price + stock feed**.

Exactly **two targets** ship, and this is a deliberate ceiling rather than an unfinished fleet:

1. `mirror` — the mutable mirror described in section 7. The site we can break on cue.
2. `books-toscrape` — `books.toscrape.com`, a public sandbox explicitly published for scraping practice. It is stable, unambiguously public, and never blocks, so it proves the pipeline works against the real internet without making demo day hostage to a retailer's bot defences.

The console is built so a third target is a row in `targets`, not a refactor. But two is what ships.

When a target site changes layout, the console detects the breakage, an agent rewrites the extraction logic, the fix is validated before it goes live, and the price feed never goes dark. Every repair is a recorded, diffable, reversible event.

Spider-Verse framing (spiders = collectors, dimensions = target sites, anomalies = drift) is used for naming and presentation only. It carries no behaviour.

### The core idea: self-healing as a contract version bump

The load-bearing abstraction is the **extraction contract** — a versioned, per-target description of how to get structured records out of a page. Self-healing is not a vague claim about AI; it is a concrete, auditable state transition:

```
contract v3 --[drift detected]--> candidate v4 --[validation gate]--> promoted v4
                                               \--[gate fails]-----> v3 stays live, human alerted
```

The gate is the whole reliability story. **An unvalidated contract is never promoted.**

## 2. Architecture

One Next.js 15 + TypeScript app. One deployable, one repo.

```
app/
  (console)/           Console UI routes: fleet, timeline, contract diff, feed
  mirror/live/         The mutable mirror site (public, scraped by a real collector)
  api/
    runs/              Trigger a run, poll status
    mirror/mutate/     Apply a mutation profile
    contracts/         Promote / rollback a contract version
lib/
  brightdata/          Scraper Studio client: trigger, poll, fetch snapshot, re-prompt
  contracts/           Contract types, versioning, storage, diffing
  extract/             Apply a contract to a payload, produce typed records
  sensor/              Drift detection signals
  healer/              LLM repair loop + validation gate
  mirror/              Mutation profiles (deterministic DOM transforms)
  db/                  node:sqlite schema + queries
```

Each module answers: what it does, how you call it, what it depends on. `sensor/` and `healer/` never touch HTTP or the DB directly — they take data in and return verdicts out, so they are unit-testable without a network or a browser.

### Data flow

```
trigger -> Scraper Studio collector -> snapshot (parsed JSON + captured HTML)
        -> extract (apply active contract) -> records
        -> sensor -> ok    -> store, feed updates
                  -> drift -> healer -> candidate contract
                           -> validation gate -> pass: promote, re-extract, verify
                                              -> fail: keep old contract, flag for human
        -> timeline event either way
```

### Division of labour with Scraper Studio

Scraper Studio owns what it is best at: proxy, unblocking, navigation, pagination, interaction, and a first-pass parse. Our collector is written to return **both** its parsed fields **and** the captured HTML of the item-container region, so the healer has raw material to re-derive selectors from.

Our layer owns the extraction contract. On drift we do two independent things:

1. **Repair the contract locally** and re-parse. This always works, so the demo cannot fail.
2. **Push a plain-language re-prompt to Scraper Studio** describing the new contract, and record whether it succeeded, failed, or is unsupported by the API.

Step 2 is best-effort and never blocks step 1. This hedges an unverified API capability without weakening the Scraper Studio integration story.

## 3. Data model

SQLite via `node:sqlite`, built into Node 24. No native build, no Windows compile pain.

| Table | Purpose | Key columns |
|---|---|---|
| `targets` | One per scraped site | `id`, `name`, `url`, `collector_id`, `active_contract_version` |
| `contracts` | Versioned extraction logic | `target_id`, `version`, `spec_json`, `created_by`, `parent_version`, `note` |
| `runs` | One collector execution | `target_id`, `contract_version`, `snapshot_id`, `status`, `record_count`, `raw_payload`, `captured_html` |
| `records` | Extracted products | `run_id`, `key`, `title`, `price`, `currency`, `in_stock`, `url` |
| `drift_events` | Sensor output | `run_id`, `severity`, `signals_json`, `evidence_json` |
| `heal_attempts` | Repair audit trail | `drift_event_id`, `from_version`, `to_version`, `status`, `model`, `validation_report_json`, `studio_reprompt_status` |
| `fixtures` | Known-good HTML for regression checks | `target_id`, `label`, `html`, `expected_assertions_json` |
| `mirror_state` | Singleton: which mutation is live | `profile`, `applied_at` |

`contracts.created_by` is `seed` or `healer`.

`records.key` is the stable identity of a product across runs, and the anchor check in section 6 depends on it. It is derived as: the product's absolute URL with query string and fragment stripped; if the contract yields no URL, a slug of the normalised title. Key derivation lives in `lib/extract/` next to the extractor and is unit-tested, because a key that silently changes shape would make every anchor check pass vacuously.

`runs.status` is `pending`, `ok`, `drift`, `healed`, or `failed`. `failed` means **infrastructure** failure (collector unreachable, snapshot timeout). `drift` means the site changed. Conflating these two would be a lie in the UI, so they are distinct states everywhere.

## 4. The extraction contract

```ts
type ExtractionContract = {
  version: number
  targetId: string
  itemSelector: string              // container for one product
  fields: Array<{
    name: 'title' | 'price' | 'availability' | 'url'
    selector: string                // relative to itemSelector
    source: 'text' | 'attr'
    attr?: string                   // when source is 'attr'
    transform?: 'trim' | 'parsePrice' | 'parseStock'
    type: 'string' | 'number' | 'boolean' | 'url'
    required: boolean
  }>
  assertions: {
    minItems: number
    fieldFillRate: Record<string, number>   // e.g. { price: 0.9, title: 1.0 }
    priceRange?: [number, number]
  }
}
```

`assertions` exist so the validation gate has an objective, per-target definition of "this contract works" that does not depend on the model's own opinion of its output.

## 5. Drift detection — six signals

The sensor runs on every completed run and emits zero or more signals, each with evidence.

**Damage signals — severity `critical`, trigger a heal:**

1. `HARD_SCHEMA_FAIL` — a required field is missing or unparseable in more than 20% of records.
2. `FILL_RATE_DROP` — a field's non-null rate falls below its contract floor, or drops more than 40 percentage points against the rolling median of the last 5 good runs.
3. `ITEM_COUNT_COLLAPSE` — record count below `minItems`, or below 50% of the rolling median.
4. `TYPE_VIOLATION` — value present but fails its declared type or transform, for example `1.299,00 EUR` under a dot-decimal price parser.

**Early-warning signals — severity `warn`, logged only:**

5. `DISTRIBUTION_SHIFT` — a numeric field's median moves by more than 10x, or its variance collapses to zero. Every row identical usually means a selector now points at a static node.
6. `STRUCTURAL_HASH_CHANGE` — the DOM-path skeleton hash of the item containers changed while the data still parses cleanly. Nothing is broken yet; something moved.

Signal 6 is what makes this an ops tool rather than an error handler: it can flag an upcoming break before any data is lost.

## 6. The heal loop

Triggered only by a `critical` drift event.

1. **Gather evidence** — failing signals, a sample of failing records, the last known-good contract, and the captured HTML trimmed to the item-container region. Scripts and styles stripped, capped at roughly 40k characters, sampling the first N containers so structure survives truncation.
2. **Propose** — call Claude Sonnet 5 with structured output enforced, returning a candidate `ExtractionContract` at `version + 1`.
3. **Validation gate** — the candidate must pass all three of:
   - **Live check.** Applied to the failing run's HTML, it satisfies every assertion.
   - **Regression check.** Applied to every stored fixture, it still satisfies that fixture's assertions. A fix that repairs today's layout but breaks last week's is rejected.
   - **Anchor check.** At least 30% of the record keys from the last good run are still present. This is what stops the model from healing onto the wrong container — a related-products carousel parses perfectly and is completely wrong.
4. **Outcome:**
   - Pass: write contract `v+1`, point the target at it, re-extract the failing snapshot, mark the run `healed`.
   - Fail: feed the validation report back into the prompt and retry, up to 2 times.
   - Still failing: mark the heal attempt `failed`, **keep the old contract live**, flag the target as needs-human in the console.
5. **Best-effort, non-blocking** — attempt a plain-language Scraper Studio re-prompt describing the new contract, and record `studio_reprompt_status` as `ok`, `failed`, or `unsupported`.

Every step is written to `heal_attempts`, so the console can show exactly what was tried, what was rejected, and why.

## 7. The mutable mirror

Real sites do not break on a demo schedule. So we own one that does.

`app/mirror/live` serves a product listing page whose DOM is transformed by the mutation profile currently stored in `mirror_state`. The URL never changes; the markup does.

Mutation profiles are deterministic, so runs are reproducible.

| Profile | What it changes |
|---|---|
| `pristine` | Baseline layout |
| `renamed-classes` | `.product-card` becomes `.p-item-v2`, and similar |
| `tag-swap` | `div` becomes `article`; price moves from a `span` to a `data-` attribute |
| `currency-format` | `$1,299.00` becomes `1.299,00 EUR` — breaks the parser, not the selector |
| `nested-wrap` | Extra wrapper elements; price relocated into a grandchild |
| `lazy-rows` | Half the rows behind a load-more control, exercising Studio interaction |
| `chaos` | Deterministic combination of several of the above |

`currency-format` matters because it breaks *parsing* while selectors still match, proving the sensor catches semantic drift and not just missing nodes.

### Reachability

Bright Data must reach the mirror over the public internet while its mutation state lives in the same local SQLite DB.

- **Primary.** A Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:3000`). No account needed, gives a public HTTPS URL, keeps one state store, and the collector sees a constant URL whose content genuinely changes.
- **Fallback.** Deploy the mirror to Vercel with path-based variants (`/mirror/v/renamed-classes`) and pass the chosen variant as the collector's input URL at trigger time. Less elegant, since the URL changes rather than the page, but it removes the tunnel as a single point of failure during recording.

## 8. Console UI

Five surfaces. Live updates by polling every 2 seconds.

- **Fleet** — one card per target: health badge, contract version, last run, uptime sparkline, per-field fill-rate bars.
- **Timeline** — chronological stream of run, drift, and heal events with expandable evidence.
- **Contract diff** — side-by-side `vN` against `vN+1` with changed selectors highlighted, plus a rollback button.
- **Feed** — the product table and price-history chart. This is the real product judges asked for.
- **Mission control** — mutation profile picker and a trigger-run button. The demo panel.

Visual direction is dark, high contrast, with a restrained crimson and cyan accent. The `clean-web-ui` skill governs the spacing, type, and colour system; the `dataviz` skill governs the sparkline and price chart. Theming stays a surface treatment — no cleverness that costs reliability.

## 9. Error handling

| Failure | Handling |
|---|---|
| Collector trigger fails | Retry with backoff, 3 attempts, then run `failed` and fleet shows collector unreachable. Never reported as drift |
| Snapshot never ready | Poll capped at 3 minutes, then run `failed` as stale |
| Model returns an invalid contract | Structured output enforcement plus 2 retries, then heal `failed` |
| Validation gate fails | Old contract stays live. A success path for reliability, not an error |
| Missing env vars | Fail fast at startup with a named, actionable message |

Secrets live in `.env.local`, which is git-ignored. `.env.example` is committed.

## 10. Testing

Targeted, because there are 72 hours. The tests exist where a silent bug would destroy the central claim.

- **Unit, sensor** — each of the six signals against fixture snapshots, including near-miss cases that must *not* fire.
- **Unit, extractor** — a contract applied to saved HTML for every mutation profile.
- **Integration, heal loop happy path** — recorded mirror HTML plus a mocked model returning a known-good contract. Asserts promotion and re-extraction.
- **Integration, heal loop rejection path** — a mocked model returning a plausible but wrong contract, the related-products carousel. Asserts the gate **rejects** it and the old contract stays live. **This is the single most important test in the repo**, because it is the evidence behind the reliability claim.
- **Manual** — a full live run against the real collector before recording.

## 11. Schedule

**Day 1, Aug 20 remainder.** Repo scaffold, DB schema, mirror and mutation profiles, tunnel up, Scraper Studio collector created and triggered end-to-end, snapshots landing in SQLite.
*Gate: a real collector run stored locally.*

**Day 2, Aug 21.** Extraction contracts, extractor, six sensor signals, heal loop, validation gate, rollback, tests.
*Gate: break the mirror, watch it heal, in the terminal.*

**Day 3, Aug 22.** Console UI, polish, README explaining Scraper Studio usage, demo video. Submit Aug 22 evening, leaving Aug 23 as buffer.
*Gate: submitted a day early.*

Cut order if time runs short: the `lazy-rows` and `chaos` profiles, signal 6, the Vercel deploy of the console, then the contract-diff view. The heal loop and its rejection test are never cut.

## 12. Prerequisites owned by the human

1. Bright Data account with Scraper Studio, $50 hackathon credits claimed
2. `BRIGHT_DATA_API_TOKEN` from Account Settings, API Tokens
3. `BRIGHT_DATA_COLLECTOR_ID`, starting `c_`, from the collector URL
4. `ANTHROPIC_API_KEY` for the runtime heal agent
5. A GitHub remote for the submission link

## 13. Explicit non-goals

No user accounts, no notifications, no approval queue, no multi-tenant anything, no third target, no scheduled cron. Each is a real feature, and each would cost the heal loop time it cannot spare.

The riskiest thing in this design is the assumption that a Scraper Studio collector can be made to return captured HTML alongside its parsed fields. Section 2 depends on it, and it is the first thing to verify on day 1. If it turns out to be impossible, the fallback is a second collector whose only job is returning the raw page, and the schedule absorbs it — but this needs to be known within hours, not on day 3.
