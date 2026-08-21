# Live detection run — 2026-08-21

## What this proves, and what it does not

**Proves:** the pipeline processes genuine Bright Data collector output end to end —
extraction, drift detection, database persistence — and correctly identifies the real
defect in the collector's `availability` field.

**Does not prove:** the network fetch inside this particular run. It was replayed from
a captured payload rather than triggered live. See "Why replay" below. The network path
is evidenced separately, and honestly, further down.

## The run

```
################################################
# pipeline mode: REPLAY
# offline: replays a captured payload, senses drift, makes no network call and never heals
################################################

=== scraping with contract v1 ===
replayed 20 records from docs/evidence/2026-08-21-books-toscrape-baseline.json
20 records, 0 issues

=== sensor: critical ===
  FIELD_BLEED: availability repeats an internal phrase 6x within a single value
persisted 20 record row(s) for run 3
recorded drift_event 3

=== detect mode: stopping here (never heals) ===
Drift is CRITICAL. Next step would be one of:
  npm run pipeline -- heal-dry   (heal + validate, always discards the proposal — reversible)
  CONFIRM_HEAL_LIVE=yes npm run pipeline -- heal-live   (may approve — irreversible)
```

### Reading the result

`20 records, 0 issues` — every record extracted cleanly. No field was missing, and no
value failed its type or transform. A naive check would call this a healthy run.

`FIELD_BLEED` — the sensor disagrees, and it is right. The collector's `availability`
field concatenates several books' availability text into one value, so a record whose
availability should read `In stock` instead reads:

```
"In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

Every value is malformed. The field is present, non-null, correctly string-typed, and
the item count is exactly right at 20 of 20 — so `HARD_SCHEMA_FAIL`, `TYPE_VIOLATION`,
`ITEM_COUNT_COLLAPSE`, and `FILL_RATE_DROP` all pass. Only `FIELD_BLEED` sees it.

**This defect was not staged.** It is a genuine bug in the scraper Bright Data's AI
generated, found by our sensor on the first real run.

## Why replay, not a live trigger

Two live `detect` attempts were made and neither completed:

1. The account's realtime page quota is exhausted. The CLI reports
   `Realtime page limit exceeded — switching to batch mode` and falls back to a batch
   job that polls up to 3600 times against a scheduled ETA.
2. The first attempt was killed by a 5-minute timeout at batch poll 28 — our bug, since
   fixed: the timeout is now `BDATA_TIMEOUT_MS`, defaulting to 30 minutes. The second
   attempt was killed by a process-lifetime limit before producing output.

The CLI exposes no subcommand to retrieve a completed batch job — only `create`, `run`,
`heal`, and `approve` — so `run` must stay attached for the whole batch. That is what
made a long batch run impractical to hold open here.

`replay` mode exists because of this. It is a real feature rather than a workaround for
a demo: it makes runs deterministic and free, which is what you want when iterating on
detection logic.

## How the network path is evidenced instead

- `docs/evidence/2026-08-21-books-toscrape-baseline.json` is 20 records captured from a
  real `bdata scraper run` against `books.toscrape.com`. The payload replayed above **is**
  live collector output.
- `docs/evidence/2026-08-21-cli-proposal-semantics.md` records a real `heal` invocation,
  its `awaiting_approval` envelope, a real `run`, and a real `approve --reject`.
- The CLI spawn path was re-verified after a fix: `bdata --version` returns `0.3.5`
  through the same code path the pipeline uses.

So each link in the chain has been exercised against the real service. What has not been
done is all of them inside one uninterrupted process, and that is a quota limitation
rather than a code one.

## What is deliberately not run here

`heal-live` may call `bdata scraper approve`, which is **irreversible** — a pending
proposal can be discarded, but the CLI has no revert for an approved one. It therefore
refuses to start unless `CONFIRM_HEAL_LIVE=yes` is set explicitly. That decision belongs
to the repository owner, not to an automated run.
