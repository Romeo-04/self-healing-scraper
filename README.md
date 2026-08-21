# Into the Scrape-Verse

A self-healing scraper ops console built on Bright Data Scraper Studio.

When a site's layout breaks extraction, Bright Data's AI proposes a repair to its own
scraper — and **our validation gate decides whether that repair is allowed to ship.**

## The idea

Every self-healing scraper demo shows the same thing: something breaks, an AI fixes it,
applause. The interesting question is the one nobody demos — *what happens when the AI's
fix is wrong?*

An unattended `--auto-approve` loop trusts a model's own opinion of its work. This project
supplies the judgement that loop lacks. Bright Data proposes; a three-part gate measures
the proposal against fixtures and anchors; only then does it ship.

**A rejection is the system working, not failing.**

### The gate, on a real case

A repair proposal that returns 12 perfectly well-formed records — every field present,
correctly typed, plenty of them — from entirely the wrong part of the page:

```
PASS  live        12 records, all assertions met
PASS  regression  1 fixture(s) still pass
FAIL  anchor      0/20 known keys retained (0%, need 30%)
```

Two checks pass. Every assertion is satisfied. Only the anchor check notices that not one
product from the previous good run survived — so the proposal is reading a related-products
carousel, not the catalogue. Rejected.

All three checks are always reported, even after one fails, because the full report *is*
the audit trail.

## How Bright Data Scraper Studio is used

Scraper Studio does what it is best at, and this project supplies what it does not.

| Bright Data owns | This project owns |
|---|---|
| Proxy, unblocking, navigation, pagination | Mapping its JSON output to typed records |
| HTML → JSON parsing | Detecting when that output has silently broken |
| **Repairing its own scraper** (`bdata scraper heal`) | **Deciding whether a repair ships** |

Concretely, `lib/brightdata/cli.ts` drives four CLI operations:

```
bdata scraper run     <id> <url> --pretty     collect data
bdata scraper heal    <id> "<prompt>" --url   request an AI repair (never --auto-approve)
bdata scraper approve <id> --url              ship a proposal
bdata scraper approve <id> --url --reject     discard a pending proposal
```

Withholding `--auto-approve` is the load-bearing decision in the whole codebase. It is what
turns a heal into a *proposal* that something else can refuse.

The repair prompt is not hand-written. `lib/healer/prompt.ts` generates it from the sensor's
evidence — which fields broke, what they used to yield, what they yield now — so the system
describes its own symptoms to Bright Data's AI.

## Drift detection

Five signals run on every collector response. Four are ordinary. The fifth earns its place.

| Signal | Fires when |
|---|---|
| `HARD_SCHEMA_FAIL` | a required field is missing in >20% of records |
| `FILL_RATE_DROP` | a field's fill rate falls below its floor, or drops 40pts vs recent history |
| `ITEM_COUNT_COLLAPSE` | record count below `minItems`, or below half the rolling median |
| `TYPE_VIOLATION` | a value is present but fails its declared type or transform |
| `FIELD_BLEED` | a single value repeats a multi-word phrase back-to-back |

`FIELD_BLEED` exists because of a real bug. The scraper Bright Data's AI generated for
`books.toscrape.com` returns, for a book that is simply in stock:

```
"availability": "In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

Every value is malformed. And **the other four signals all pass on it** — the field is
present, non-null, correctly string-typed, and the item count is exactly right at 20 of 20.
A live run reports `20 records, 0 issues` and then flags it critical anyway.

That defect was not staged. It was found by this sensor on the first real run.

## The gate

Three checks, all of which must pass:

- **Live** — the repaired collector's output satisfies every assertion in the contract.
- **Regression** — it still satisfies them across the whole fixture URL set. A fix that
  repairs today and breaks yesterday is refused.
- **Anchor** — at least 30% of the record keys from the last good run are still present.
  This is the check that catches a proposal reading the wrong container.

Skipped-and-passing on a first-ever run, since there is nothing to anchor against yet.

### Two stages, because approval cannot be undone

`bdata scraper approve` is **irreversible.** A *pending* proposal can be discarded; an
approved one cannot be rolled back — the CLI has no revert, and we verified that empirically
rather than assuming it.

So the loop gates twice:

1. **Pre-approval** — `heal` embeds a `preview_result` sample of what the proposal would
   produce. Check it. If it still bleeds or fails its types, `approve --reject` while the
   proposal is still pending. **This is the only point where a bad proposal can be refused
   for free.**
2. **Post-approval** — approve, run, evaluate all three checks. On failure, record the truth
   and issue a *corrective* heal citing the specific failures. No fake rollback.

What actually protects the data is that our payload contract is versioned independently and
never advances unless the gate passes. Extraction stays on the last known-good contract no
matter what state the collector is left in.

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in the three values
npm test                       # 77 tests
npm run typecheck

npm run seed
npm run pipeline               # replay/detect — read-only
```

Four modes, and only one of them can approve anything:

| Mode | Does | Reversible |
|---|---|---|
| `replay` | replays a captured payload; no network call | yes |
| `detect` *(default)* | live collector run, senses drift, stops | yes |
| `heal-dry` | also heals and checks the preview, then always discards | yes |
| `heal-live` | the full loop; may approve | **no** |

`heal-live` refuses to start without `CONFIRM_HEAL_LIVE=yes`.

## Stack

Next.js-ready TypeScript with **one runtime dependency**. Node 24 supplies the rest:
`node:sqlite` for storage, `node --test` for the suite, `--env-file` for config, and native
type stripping so there is no build step. `tsc --noEmit` runs as a guard, with
`erasableSyntaxOnly` so unsupported syntax fails at check time rather than at runtime.

`openai` is the only install, and it powers the *fallback* repair — used only when Bright
Data's own proposals are rejected twice. Model is read from `OPENAI_MODEL`, never hardcoded.

## Honest limitations

Recorded here rather than discovered by a judge:

- **`FIELD_BLEED` detects back-to-back repetition only.** An interleaved bleed
  (`"In stock 19 In stock 20"`) is missed. Separating that from natural language reliably is
  a research problem; sibling-node concatenation produces the back-to-back shape.
- **`toNumber` is over-strict on annotated prices.** `"£52.15 (inc. VAT)"` returns
  `undefined`, which triggers an unnecessary repair. It fails safe: refusing to parse raises
  `TYPE_VIOLATION`, whereas guessing corrupts data silently.
- **The full live loop has not run end-to-end in one process.** The account's realtime page
  quota is exhausted, forcing the CLI into a batch mode too slow to hold a process open for.
  Each link is evidenced separately in `docs/evidence/`; all of them inside one uninterrupted
  run is not yet done.
- **`heal-live` has never been executed.** Approval is irreversible, so that decision belongs
  to a human.

## Evidence

`docs/evidence/` holds real transcripts, not summaries:

- `2026-08-21-books-toscrape-baseline.json` — 20 records from a real collector run
- `2026-08-21-cli-proposal-semantics.md` — a real heal, its `awaiting_approval` envelope, and
  the empirical finding that a pending proposal is invisible to `run`
- `2026-08-21-replay-detect-run.md` — the pipeline detecting the genuine defect

Design and plan live in `docs/superpowers/`.

## A note for contributors

`.git/hooks/commit-msg` strips AI attribution trailers. Hooks are not committed, so a fresh
clone needs it reinstalled — see `.claude/skills/committing-and-pushing/SKILL.md` for the
repository's git conventions.
