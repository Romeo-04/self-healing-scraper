# Into the Scrape-Verse — Design

**Date:** 2026-08-20, revised 2026-08-21
**Deadline:** 2026-08-23 (~48 hours remaining at revision)
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
  brightdata/          Scraper Studio: trigger, poll, snapshot, heal, approve/reject
  contracts/           Contract types, versioning, storage, diffing
  extract/             Apply a contract to a payload, produce typed records + keys
  sensor/              Drift detection signals
  healer/              Heal orchestration, evidence-to-prompt, validation gate,
                       and the OpenAI fallback repair
  mirror/              Mutation profiles (deterministic DOM transforms)
  db/                  node:sqlite schema + queries
```

Each module answers: what it does, how you call it, what it depends on. `sensor/` and `healer/` never touch HTTP or the DB directly — they take data in and return verdicts out, so they are unit-testable without a network or a browser.

### Data flow

```
trigger -> Scraper Studio collector -> snapshot (parsed JSON; no HTML)
        -> extract (apply active contract) -> records
        -> sensor -> ok    -> store, feed updates
                  -> drift -> bdata scraper heal (no --auto-approve) -> proposal
                           -> validation gate: live + regression + anchor
                                -> pass: bdata scraper approve       -> re-extract, run = healed
                                -> fail: bdata scraper approve --reject
                                         -> retry heal (max 2)
                                         -> then fallback: our own contract repair
                                         -> still failing: last good state stays live
        -> timeline event either way
```

### Division of labour with Scraper Studio

Scraper Studio owns what it is best at: proxy, unblocking, navigation, pagination, interaction, and the parse itself. It also owns **repair**, which is the part that reshaped this design.

The Bright Data CLI exposes:

```
bdata scraper heal    <collector_id> "<prompt>"  --url  --auto-approve
bdata scraper approve <collector_id>             --url  --reject
```

Withhold `--auto-approve` and `heal` leaves the fix as a **proposal**. `approve` ships it; `approve --reject` discards it.

That approve/reject seam is where this project lives:

> **Bright Data proposes the repair. Our validation gate decides whether it ships.**

This is strictly better than the design's original plan of running a parallel repair system beside theirs. Scraper Studio integration and reliability stop being two competing mechanisms and become the same mechanism — we are not wrapping their tool, we are supplying the judgement it lacks. An unattended `--auto-approve` loop trusts a model's own opinion of its work; ours trusts assertions, fixtures, and anchors.

Our extraction contract keeps its central role, now with two jobs:

1. The **objective standard** a proposal is measured against, independent of any model's self-assessment.
2. The **fallback repair artifact** when Bright Data's proposal is rejected twice.

### Open question: where the gate sits

The gate must test a proposal against real output, which requires running the healed scraper. Whether the CLI can run a *pending, unapproved* proposal is not documented and must be settled empirically on day 1. Two placements, and the answer picks one:

- **Pre-approval gate (preferred).** Run the proposal, validate, then `approve` or `approve --reject`. Nothing bad ever reaches the live collector.
- **Post-approval verify-and-rollback (fallback).** `approve`, run, validate; on failure immediately restore the previous collector state and record the rejection. Slightly weaker — a bad contract is briefly live — but still auditable and still automatic.

The console presents whichever is real. It does not claim the stronger one if we end up on the weaker one.

## 3. Data model

SQLite via `node:sqlite`, built into Node 24. No native build, no Windows compile pain.

| Table | Purpose | Key columns |
|---|---|---|
| `targets` | One per scraped site | `id`, `name`, `url`, `collector_id`, `active_contract_version` |
| `contracts` | Versioned extraction logic | `target_id`, `version`, `spec_json`, `created_by`, `parent_version`, `note` |
| `runs` | One collector execution | `target_id`, `contract_version`, `snapshot_id`, `status`, `record_count`, `raw_payload` |
| `records` | Extracted products | `run_id`, `key`, `title`, `price`, `currency`, `in_stock`, `url` |
| `drift_events` | Sensor output | `run_id`, `severity`, `signals_json`, `evidence_json` |
| `heal_attempts` | Repair audit trail | `drift_event_id`, `from_version`, `to_version`, `status`, `source`, `heal_prompt`, `proposal_json`, `validation_report_json`, `cli_action` |
| `fixtures` | Known-good expectations per URL, for regression checks | `target_id`, `label`, `url`, `expected_assertions_json`, `golden_keys_json`, `golden_field_stats_json` |
| `mirror_state` | Singleton: which mutation is live | `profile`, `applied_at` |

`contracts.created_by` is `seed`, `studio` (a Bright Data heal proposal we approved), or `fallback` (our own repair). `heal_attempts.source` is `studio` or `fallback`, and `heal_attempts.cli_action` records `approve`, `reject`, or `none` so the audit trail states exactly what was done to the live collector.

`records.key` is the stable identity of a product across runs, and the anchor check in section 6 depends on it. It is derived as: the product's absolute URL with query string and fragment stripped; if the contract yields no URL, a slug of the normalised title. Key derivation lives in `lib/extract/` next to the extractor and is unit-tested, because a key that silently changes shape would make every anchor check pass vacuously.

`runs.status` is `pending`, `ok`, `drift`, `healed`, or `failed`. `failed` means **infrastructure** failure (collector unreachable, snapshot timeout). `drift` means the site changed. Conflating these two would be a lie in the UI, so they are distinct states everywhere.

## 4. The extraction contract

**Revised 2026-08-21 after seeing real collector output.** The original draft assumed the contract held CSS selectors applied to HTML. It does not, because Scraper Studio returns parsed JSON and no HTML (section 13, question 2). The real division is cleaner:

- **Bright Data owns HTML to JSON.** Selectors, interaction, pagination, and the repair of all three. Their `heal` command edits their code.
- **We own JSON to records, plus judgement.** Our contract maps their payload shape onto our records and defines what "working" means.

So the contract is a **payload contract**, not a selector contract:

```ts
type PayloadContract = {
  version: number
  targetId: string
  fields: Array<{
    name: 'title' | 'price' | 'currency' | 'availability' | 'url'
    path: string                    // JSON path into a payload item, e.g. 'price.value'
    fallbackPaths?: string[]        // tried in order; tolerates benign renames
    transform?: 'trim' | 'parseStock' | 'toNumber'
    type: 'string' | 'number' | 'boolean' | 'url'
    required: boolean
  }>
  assertions: {
    minItems: number
    fieldFillRate: Record<string, number>   // e.g. { price: 0.9, title: 1.0 }
    priceRange?: [number, number]
    maxRepeatRatio?: Record<string, number> // see below
  }
}
```

Real output from collector `c_mt2g81n4o5kz5bgla` confirms the shape: `title`, `price: { value, currency, symbol }`, `availability`, `product_url`, `product_page_url`. Hence `path` reaching `price.value`, and `fallbackPaths` covering the redundant `product_url` / `product_page_url` pair.

`assertions` exist so the validation gate has an objective, per-target definition of "this contract works" that does not depend on any model's opinion of its own output. `maxRepeatRatio` is the newest one and it came directly from a real defect — see section 5.

## 5. Drift detection — signals

The sensor runs on every completed run and emits zero or more signals, each with evidence.

**Damage signals — severity `critical`, trigger a heal:**

1. `HARD_SCHEMA_FAIL` — a required field is missing or unparseable in more than 20% of records.
2. `FILL_RATE_DROP` — a field's non-null rate falls below its contract floor, or drops more than 40 percentage points against the rolling median of the last 5 good runs.
3. `ITEM_COUNT_COLLAPSE` — record count below `minItems`, or below 50% of the rolling median.
4. `TYPE_VIOLATION` — value present but fails its declared type or transform, for example `1.299,00 EUR` under a dot-decimal price parser.

5. `FIELD_BLEED` — a field's values repeat across records beyond `maxRepeatRatio`, or its distinct-value count collapses toward one while item count stays healthy. Severity `critical`.

**Signal 5 was un-cut on 2026-08-21, because the first real collector run produced exactly this defect.** Bright Data's auto-generated scraper returned, for every book:

```
"availability": "In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

The trailing repeats vary in count between records, so the selector is sweeping a whole region rather than each item's own availability node. Every value is malformed, and — critically — **no other signal catches it.** The field is present, non-null, string-typed, and the item count is fine. Signals 1 through 4 all pass. Only "these values repeat when they should vary" sees it.

That is worth more than a synthetic demo: it is an unstaged defect, in a real generated scraper, found by our sensor on the first run. Section 11's demo leads with it.

**Cut, and not for time:**

6. `STRUCTURAL_HASH_CHANGE` — hashing the DOM-path skeleton of item containers. **Infeasible, not deferred.** It needs HTML, and the collector returns none (section 13). Recording it here so the reason is on the record rather than rediscovered later.

**Five signals ship.** The `severity` column and the warn/critical split stay in the schema regardless.

## 6. The heal loop

Triggered only by a `critical` drift event.

1. **Gather evidence** — failing signals, a sample of failing records, the last known-good contract, and the raw collector payload. There is no HTML to trim (section 13): the evidence is the malformed JSON itself, which is what Bright Data's `heal` needs anyway, since it is repairing its own code and can re-fetch the page for itself.
2. **Ask Bright Data to heal.** Run `bdata scraper heal <collector_id> "<prompt>" --url <target>` **without** `--auto-approve`. The prompt is generated from the drift evidence, not hand-written: which fields broke, what they used to yield, what they yield now. Turning sensor evidence into a plain-language repair prompt is a real piece of engineering and lives in `lib/healer/prompt.ts`.
3. **Validation gate** — run the proposal (see "where the gate sits" in section 2) and require all three of:
   - **Live check.** Run the healed collector against the failing target URL. Every assertion must pass.
   - **Regression check.** Run it against the whole fixture URL set — the mirror in each surviving mutation profile, plus `books.toscrape.com`. Every fixture's assertions must pass. A fix that repairs today's layout but breaks a layout that worked yesterday is rejected.
     *Revised 2026-08-21:* originally this replayed stored HTML through the candidate contract. With no HTML available, it instead re-runs the healed collector across several known URLs and checks each against its recorded expectations. This costs real collector calls, but it tests the actual repaired scraper rather than a local imitation of it — a stronger check than the one it replaces.
   - **Anchor check.** At least 30% of the record keys from the last good run are still present. This is what stops the model from healing onto the wrong container — a related-products carousel parses perfectly and is completely wrong.
4. **Outcome:**
   - Pass: `bdata scraper approve <collector_id>`. Write contract `v+1` recording what changed, re-extract, mark the run `healed`.
   - Fail: `bdata scraper approve <collector_id> --reject`, then retry `heal` with the validation report folded into a sharper prompt. Up to 2 retries.
   - Still failing after 2 retries: fall through to step 5.
5. **Fallback — our own repair.** Only reached when Bright Data's proposals are rejected twice. An OpenAI call with strict JSON-schema structured output returns a candidate `ExtractionContract` at `version + 1`, which faces the *same* three-part gate. If it passes, we parse locally from the captured payload and the feed keeps running on our contract while the collector stays on its last good version.
6. **Still failing** — mark the heal attempt `failed`, **keep the last good state live**, flag the target as needs-human in the console.

Every step is written to `heal_attempts`, including the exact prompt sent, the proposal received, the gate's verdict, and which of `approve` or `approve --reject` was called. The console can therefore show what was tried, what was refused, and why — the audit trail *is* the reliability evidence.

Model choice for step 5 is `OPENAI_MODEL`, read from the environment rather than hardcoded, so the fallback can be repointed without a code change. The exact model id is verified against the provider's model list on day 1 instead of assumed.

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

- **Unit, sensor** — each shipped signal against fixture snapshots, including near-miss cases that must *not* fire.
- **Unit, extractor** — a contract applied to saved HTML for every mutation profile.
- **Integration, heal loop happy path** — recorded mirror HTML plus a mocked model returning a known-good contract. Asserts promotion and re-extraction.
- **Integration, heal loop rejection path** — a mocked model returning a plausible but wrong contract, the related-products carousel. Asserts the gate **rejects** it and the old contract stays live. **This is the single most important test in the repo**, because it is the evidence behind the reliability claim.
- **Manual** — a full live run against the real collector before recording.

## 11. Schedule

Revised on 2026-08-21. The original plan assumed three days from Aug 20; the real window is closer to 48 hours, so the schedule below is what ships and section 13's non-goals absorbed the difference.

**Block A — Aug 21, remainder of day.** Answer the two open empirical questions first, because both can force a redesign (see section 13). Then: repo scaffold, DB schema, mirror and mutation profiles, tunnel up, a real collector run landing in SQLite.
*Gate: a real collector run stored locally, and a documented answer on where the gate sits.*

**Block B — Aug 22, first half.** Extraction contracts, extractor, sensor signals 1 through 4, the heal loop against `bdata scraper heal`, the validation gate, rollback, and the two integration tests.
*Gate: break the mirror, watch it heal, in the terminal. Nothing UI yet.*

**Block C — Aug 22, second half.** Console UI, README explaining Scraper Studio usage, demo video.
*Gate: submitted Aug 22 evening, leaving Aug 23 as buffer.*

The ordering is deliberate: the terminal-level heal demo in Block B is the submission's actual content. If Block C is compromised, a recorded terminal session still demonstrates everything judged under reliability and Scraper Studio integration. UI is the upside, not the foundation.

Cut order if time runs short: the Vercel deploy of the console, then the contract-diff view, then the sparklines. The heal loop and its rejection test are never cut.

## 12. Prerequisites owned by the human

| # | Item | Status |
|---|---|---|
| 1 | Bright Data account, CLI authenticated (`bdata login`) | **done** — zones `cli_unlocker` and `cli_browser` auto-provisioned |
| 2 | `BRIGHT_DATA_API_TOKEN` | **done** |
| 3 | `BRIGHT_DATA_COLLECTOR_ID` | **done** — `c_mt2g81n4o5kz5bgla`, generated by `bdata scraper create` |
| 4 | `OPENAI_API_KEY` for the fallback repair agent | **done** |
| 5 | `OPENAI_MODEL` | open — verify a real model id on day 1 |
| 6 | `$50` hackathon credits claimed | unconfirmed |
| 7 | GitHub remote for the submission link | open, not blocking |

The collector was created with `bdata scraper create <url> "<description>"`, which is also the answer to "where do I find the collector ID" — the CLI prints it, and the dashboard mirrors it at `brightdata.com/cp/scrapers/<id>`. The ID only exists once a collector does.

## 13. Explicit non-goals

No user accounts, no notifications, no approval queue, no multi-tenant anything, no third target, no scheduled cron. Each is a real feature, and each would cost the heal loop time it cannot spare.

Cut on 2026-08-21 when the window shrank to ~48 hours: the `lazy-rows` and `chaos` mutation profiles, and sensor signals 5 and 6. Five profiles and four signals are enough to prove the mechanism, and `currency-format` — the one that breaks parsing while selectors still match — survives the cut because it is the most convincing single demonstration that the sensor understands meaning rather than just absence.

### Open empirical questions

1. **Can the CLI run a pending, unapproved heal proposal?** — **still open.** Decides whether the gate sits before or after `approve` (section 2). If it cannot, we take verify-and-rollback and describe it honestly. First task of the build.

2. **Can a collector return raw page HTML alongside parsed fields?** — **answered 2026-08-21: no.** A real run of `c_mt2g81n4o5kz5bgla` returned only parsed JSON (`title`, `price: { value, currency, symbol }`, `availability`, `product_url`, `product_page_url`) with no HTML field and no markup anywhere in the payload.

   Consequences, all absorbed into the design rather than left as debt:
   - The contract became a **payload contract** over JSON paths instead of a selector contract over DOM (section 4). This is a more honest split: selectors are Bright Data's to own and repair.
   - The regression check re-runs the healed collector across several known URLs instead of replaying stored HTML (section 6). More expensive, and a stronger test.
   - Sensor signal 6 is **infeasible**, not deferred (section 5).
   - `runs.captured_html` deleted; `fixtures` now stores per-URL expectations rather than markup (section 3).

   A second raw-page collector was considered and rejected. It would double collector calls and reintroduce a parallel extraction path — exactly the design we deliberately abandoned when the CLI's `heal`/`approve` seam turned out to be real.

### Found while verifying: a real defect worth building around

The first live run exposed a genuine bug in Bright Data's auto-generated scraper — `availability` values sweep a whole page region instead of each item's own node, so every record carries a malformed, near-repeating string. Signals 1 through 4 all pass on it. This directly caused signal 5 (`FIELD_BLEED`) to be un-cut, and it gives the demo an unstaged failure found by our own sensor on the very first run. That is worth more than any mutation we could stage ourselves.
