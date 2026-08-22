# Live heal-live run — 2026-08-23

The full autonomous repair loop, executed against the real collector with
`CONFIRM_HEAL_LIVE=yes`. **`approve` fired.** The repair is live on the collector, and the
post-approval verification did not complete.

This is the honest record of a partially-successful run. Nothing here is presented as a
success it was not.

## What happened, in order

```
################################################
# pipeline mode: HEAL-LIVE
# LIVE HEAL: may call `approve`, which is IRREVERSIBLE — no revert/rollback exists
################################################

=== scraping with contract v1 ===
replayed 20 records from docs/evidence/2026-08-21-books-toscrape-baseline.json
20 records, 0 issues

=== sensor: critical ===
  FIELD_BLEED: availability repeats an internal phrase 6x within a single value
persisted 20 record row(s) for run 2
recorded drift_event 2

=== heal-live: running the full heal loop (may approve — irreversible) ===

=== outcome: failed via none ===
  attempt 1 (studio) -> cli:approve
    preview REJECTED: bdata scraper run timed out after 1800000ms

contract v1 stays live
```

Step by step:

1. **Detection** — replayed from the committed baseline (real collector output), so the fault
   was established without spending a live run. `FIELD_BLEED`, critical.
2. **Repair prompt** — generated from the sensor's own evidence.
3. **`bdata scraper heal`** — called live. Bright Data produced a proposal.
4. **Pre-approval preview check — PASSED.** The proposal's `preview_result` satisfied the
   contract's assertions and showed no field bleed.
5. **`bdata scraper approve` — FIRED.** Autonomous, no human in the loop. The repair is now
   live on the collector. This cannot be undone; the CLI has no revert.
6. **Post-approval gate — never completed.** The four-check gate needs real post-repair output,
   so it triggered a collector run. That run timed out after 30 minutes at batch poll 33.
7. **Outcome `failed`.** The payload contract stayed at **v1**.

## What the audit trail records

```
heal_attempts:
  status      : failed
  source      : studio
  cli_action  : approve      <-- the irreversible action DID happen
  from -> to  : 1 -> 1       <-- the contract did not advance
  report      : {"previewFailures":["bdata scraper run timed out after 1800000ms: ..."]}
```

`status: failed` with `cli_action: approve` is deliberate and load-bearing. An earlier version
of this code wrote `rejected` whenever the gate returned no verdict — which would have told an
operator the change was safely discarded when it had in fact been approved irreversibly and
never validated. That was fixed before this run, and this row is why the fix mattered.

## What this proves

- **The loop is genuinely autonomous.** Once armed with `CONFIRM_HEAL_LIVE=yes`, no human
  touched it. Detection, prompt generation, the repair request, the preview judgement, and the
  irreversible approval all executed without intervention.
- **The pre-approval gate works on live data.** Bright Data's proposal was judged against the
  contract before anything was committed, and it passed on merit.
- **The system does not lie when it cannot finish.** It approved, failed to verify, refused to
  advance the contract, and recorded precisely that.

## What this does not prove

- **~~Whether the repair is correct.~~** Now verified: it is **not**. See the finding below.
- **That the loop closes.** A completed cycle would be drift → repair → approve → clean run →
  contract v2. This stopped at step four of five.

## Why it stopped

The account's realtime page quota is exhausted. Every `scraper run` falls back to a batch job
polling against a scheduled ETA, and that exceeded the 30-minute `BDATA_TIMEOUT_MS`. The
detection phase was replayed specifically to avoid this, but the gate's verification run cannot
be replayed — checking post-repair output is the entire point of it.

This is a quota condition, not a defect in the loop. The same run against an account with
realtime capacity would have completed in seconds.

## THE FINDING: the preview was wrong, and the gate's fourth check is why it exists

After the approval, the collector was run again to see whether the repair had worked.

```
records: 20
bleeding availability values: 17/20
sample: "In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

**The repair did not work.** The output is unchanged from before the heal.

Trace the sequence:

| Step | Result |
|---|---|
| Bright Data's `preview_result` | showed **clean** values |
| Our pre-approval preview check | **PASSED** — on merit, against the real contract |
| `approve` | fired |
| Actual post-approval output | **still 17/20 bleeding** |

The proposal's self-reported preview did not reflect what the collector actually produces. Our
Stage 1 check was not wrong about the preview — the preview itself was unrepresentative.

**This is the empirical case for the `resolved` check.** It re-runs the drift sensor on real
post-repair output and asks whether the fault is gone. It is the only check in the system that
would have caught this, and it is the one that timed out before it could run.

Three conclusions follow, and they are the strongest evidence this project produced:

1. **A model's self-reported preview is not sufficient evidence that a repair worked.** Here it
   was actively misleading, and it passed a legitimate assertion check.
2. **`--auto-approve` would have shipped this and reported success.** The defect would have
   stayed live, the pipeline would have logged a heal, and nothing would have flagged it. That
   is precisely the failure mode this project was built to prevent.
3. **Verification has to run against real output, not a proposal's description of itself.**
   Cheap pre-approval checks are worth having — they refuse obvious failures for free — but they
   cannot be the last word.

The run stopping short of `resolved` is therefore not just an inconvenience. It left the system
in the exact state the fourth check exists to detect, which is why the contract staying at v1
mattered so much.

## Current state of the collector

The approved repair is live and **ineffective** — the collector still returns the original
malformed `availability`. Our payload contract remains at v1, so extraction is still governed by
the last known-good contract, and the sensor will keep flagging the defect on every run. Nothing
downstream was corrupted and nothing false was recorded.

Re-running `heal-live` corrects forward: the sensor will re-measure, and if the repair worked
the run reports `ok` and no repair is requested.

## Reproducing it

```bash
npm run seed
CONFIRM_HEAL_LIVE=yes npm run pipeline -- heal-live replay
```

Requires `.env.local` with a live `BRIGHT_DATA_COLLECTOR_ID`. **This may approve a repair
irreversibly.** It refuses to start without the environment variable for that reason.
