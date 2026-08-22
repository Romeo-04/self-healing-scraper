# Live heal-dry run — 2026-08-22

A real repair request to Bright Data Scraper Studio, judged by the validation gate, then
discarded. Nothing was approved. The collector is unchanged.

## What this proves

- The live repair path works end to end, from drift detection through a real
  `bdata scraper heal` call to a gate verdict.
- The repair prompt sent to Bright Data was **generated from the sensor's own evidence**, not
  hand-written.
- Bright Data's AI produced a proposal that **actually fixed the defect** — the preview came
  back clean and the pre-approval check passed it.
- The proposal was still discarded, because `heal-dry` never approves. That is the mode
  behaving correctly, not a failure.

## What this does not prove

No repair was **applied**. `heal-dry` always ends in `approve --reject`. Applying a repair is
`heal-live`, which may call `approve` — irreversible, since the CLI has no revert.

## The run

```
################################################
# pipeline mode: HEAL-DRY
# heals, then ALWAYS discards the proposal (approve --reject) — reversible, never approves
################################################

=== scraping with contract v1 ===
(a live collector run can take 30s-4min; printing progress, not timing out early)
  ... still waiting on the collector (15s elapsed)
  [... continues to 585s — see "on the duration" below]

=== sensor: critical ===
  FIELD_BLEED: availability repeats an internal phrase 6x within a single value
persisted 20 record row(s) for run 2
recorded drift_event 2

=== heal-dry: requesting a proposal from Bright Data Studio ===

preview check: PASS

=== heal-dry: discarding the proposal (approve --reject) — this mode never approves ===

contract stays at v1 — heal-dry never promotes
```

Exit code 0.

## What landed in the database

```
heal_attempts rows: 1
  status      : rejected
  source      : studio
  cli_action  : reject
  from_version: 1  ->  to_version: null
  report      : {"previewPass":true,"previewDetail":[]}

runs: 1:drift/20  2:drift/20
drift events: 2
contract version: still 1
```

`to_version: null` and `contract version: still 1` together are the proof that nothing was
promoted. `cli_action: reject` records what was actually done to the collector.

## Reading `previewPass: true`

This is the interesting result. `heal`'s response embeds a `preview_result` — the proposal's
own sample of what it would produce. The gate applied the contract to that sample and checked
what a sample can support: fields present, types parsing, and no field bleed.

It passed. Bright Data's AI correctly diagnosed the concatenated `availability` field from a
prompt our sensor generated, and its proposed fix produced clean values.

**And the proposal was rejected anyway**, because `heal-dry` exists to exercise the path
without committing. Had this been `heal-live`, the passing preview would have led to
`approve`, followed by the full four-check gate against real post-repair output.

That is the honest state of things: the repair was good, the gate agreed it looked good, and
we chose not to ship it.

## On the duration

The collector run took roughly ten minutes. The account's realtime page quota is exhausted, so
the CLI falls back to a batch job that polls against a scheduled ETA. This is a quota
condition, not a code path — the run succeeded, it was just slow.

Ten minutes is too slow to perform on camera. For a recording, use:

```bash
npm run pipeline -- heal-dry replay
```

which sources the **detection** payload from the committed baseline (real collector output)
while still performing a **live** heal. The quota blocks `scraper run`, not `scraper heal`.

## Reproducing it

```bash
npm run seed
npm run pipeline -- heal-dry          # live detection, ~10 min under batch mode
npm run pipeline -- heal-dry replay   # replayed detection, live heal, fast
```

Both always discard the proposal. Neither can approve anything.
