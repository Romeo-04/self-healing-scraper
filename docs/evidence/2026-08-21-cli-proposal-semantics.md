# CLI heal proposal semantics — can `bdata scraper run` see an unapproved proposal?

**Date:** 2026-08-21
**Collector under test:** `$BRIGHT_DATA_COLLECTOR_ID` (books.toscrape.com collector; ID never printed here — see repo conventions)
**Question:** After `bdata scraper heal` produces a proposal *without* `--auto-approve`, does `bdata scraper run` return the OLD (broken) output or the NEW (proposed) output?

This is the single empirical question the rest of the heal-loop architecture depends on (design spec section 2, "Open question: where the gate sits"). The answer decides whether the validation gate runs a proposal *before* `approve` (preferred) or must `approve` first and roll back on failure (fallback).

---

## 1. `--help` outputs (verbatim)

### `npx -p @brightdata/cli bdata scraper --help`

```
Usage: brightdata scraper [options] [command]

Build and manage Bright Data scrapers

Options:
  -h, --help                              display help for command

Commands:
  create [options] <url> <description>    Build a scraper from a natural-language description using AI
  run [options] <collector_id> [url]      Run a Bright Data scraper on one or more URLs and return the data
  heal [options] <collector_id> <prompt>  Fix an existing scraper in place via AI self-healing
  approve [options] <collector_id>        Approve (or --reject) a heal that is awaiting approval
  help [command]                          display help for command
```

### `npx -p @brightdata/cli bdata scraper heal --help`

```
Usage: brightdata scraper heal [options] <collector_id> <prompt>

Fix an existing scraper in place via AI self-healing

Arguments:
  collector_id         Collector ID of the scraper to fix (from `scraper
                       create`)
  prompt               What is broken / what to fix (max 1000 chars)

Options:
  --url <url>          Verify target woven into the next-step hint. Not sent to
                       the heal call; heal only mutates the scraper.
  --auto-approve       When the heal hits the approval gate, approve it
                       automatically and poll through to done (default: stop and
                       let you review).
  --auto-save          With --auto-approve, also save the healed template
                       automatically once the job completes (sent as auto_save
                       to the resume call).
  --timeout <seconds>  Polling timeout in seconds (default: 600)
  --max-retries <n>    Max retries on the AI-Flow concurrent-job cap 429
                       (default: 4). Each wait grows exponentially with jitter,
                       up to ~4 min between attempts.
  --no-retry           Fail immediately on 429 instead of waiting through the
                       cap. Equivalent to --max-retries 0.
  -o, --output <path>  Write output to file
  --json               Force JSON output
  --pretty             Pretty-print JSON output
  --legacy-output      Emit the bare AI-progress payload instead of the
                       {collector_id, status, prompt, next_step, ...} envelope.
  --timing             Show request timing
  -h, --help           display help for command

Examples:
  # Fix a scraper whose price selector drifted, then get a ready-to-run verify command back
  $ brightdata scraper heal c_mp3tuab31lswoxvpws "The price field returns null — the selector moved into a span with data-testid. Capture price and currency again." --url https://example.com/product/1

  # Heal and save the result envelope (next_step tells you how to verify)
  $ brightdata scraper heal c_mp3tuab31lswoxvpws "Reviews stopped extracting after the page redesign" --pretty -o heal.json
```

### `npx -p @brightdata/cli bdata scraper approve --help`

```
Usage: brightdata scraper approve [options] <collector_id>

Approve (or --reject) a heal that is awaiting approval

Arguments:
  collector_id         Collector ID of the scraper whose heal is awaiting
                       approval

Options:
  --reject             Reject the proposed fix instead of approving it.
  --auto-save          Save the approved template automatically once the job
                       completes successfully (sent as auto_save to the resume
                       call).
  --url <url>          Verify target woven into the next-step hint on success.
  --timeout <seconds>  Polling timeout in seconds (default: 600)
  -o, --output <path>  Write output to file
  --json               Force JSON output
  --pretty             Pretty-print JSON output
  --legacy-output      Emit the bare AI-progress payload instead of the
                       envelope.
  --timing             Show request timing
  -h, --help           display help for command

Examples:
  # Approve a heal that stopped at awaiting_approval, then verify
  $ brightdata scraper approve c_mp3tuab31lswoxvpws --url https://example.com/product/1

  # Reject a proposed fix and start over with a sharper heal prompt
  $ brightdata scraper approve c_mp3tuab31lswoxvpws --reject
```

**Observations from `--help` alone:** none of the three commands document a flag to run a pending proposal, list pending proposals, or read the proposed diff as a full payload. `heal` does print *something* about the proposal to stdout — its JSON envelope includes a `preview_result` sample and a `diff_summary` string — but there is no subcommand to fetch that again later, and no flag on `run` to target the pending version instead of the live one.

---

## 2. Provoking a real heal proposal

The collector's `availability` field genuinely concatenates several books' availability text into one string (e.g. `"In stock (19 available) In stock In stock In stock In stock In stock"`), confirmed present before this test and unrelated to any staged defect.

Command run (background, ~2.5 minutes to complete):

```bash
npx -p @brightdata/cli bdata scraper heal $BRIGHT_DATA_COLLECTOR_ID \
  "The availability field concatenates the availability text of several books into one string. Each record's availability must come only from that book's own listing, and should read exactly 'In stock' or 'Out of stock'." \
  --url https://books.toscrape.com --pretty
```

`--auto-approve` was **not** passed. Full output:

```
Triggering self-healing...
Healing scraper...
Step: planner — polling (attempt 1/600)
Step: planner — polling (attempt 2/600)
Step: planner — polling (attempt 3/600)
Step: planner — polling (attempt 4/600)
Step: planner — polling (attempt 5/600)
Step: control_preview_runner — polling (attempt 6/600)
Step: control_preview_runner — polling (attempt 7/600)
Step: control_preview_runner — polling (attempt 8/600)
Step: control_preview_runner — polling (attempt 9/600)
Step: control_preview_runner — polling (attempt 10/600)
Step: control_preview_runner — polling (attempt 11/600)
Step: control_preview_runner — polling (attempt 12/600)
Step: control_preview_runner — polling (attempt 13/600)
Step: control_preview_runner — polling (attempt 14/600)
Step: code_fixer — polling (attempt 15/600)
Step: code_fixer — polling (attempt 16/600)
Step: code_fixer — polling (attempt 17/600)
Step: code_fixer — polling (attempt 18/600)
Step: code_fixer — polling (attempt 19/600)
Step: code_fixer — polling (attempt 20/600)
Step: code_fixer — polling (attempt 21/600)
Step: code_fixer — polling (attempt 22/600)
Step: step_preview_runner — polling (attempt 23/600)
Step: step_preview_runner — polling (attempt 24/600)
Step: step_preview_runner — polling (attempt 25/600)
Step: step_preview_runner — polling (attempt 26/600)
Step: step_preview_runner — polling (attempt 27/600)
Step: step_preview_runner — polling (attempt 28/600)
Step: step_preview_runner — polling (attempt 29/600)
Step: request_fulfillment_validator — polling (attempt 30/600)
Step: request_fulfillment_validator — polling (attempt 31/600)
Step: request_fulfillment_validator — polling (attempt 32/600)
Step: request_fulfillment_validator — polling (attempt 33/600)
Step: request_fulfillment_validator — polling (attempt 34/600)
Step: request_fulfillment_validator — polling (attempt 35/600)
Step: request_fulfillment_validator — polling (attempt 36/600)
Step: request_fulfillment_validator — polling (attempt 37/600)
Done in 38 poll attempts.
Heal ready — awaiting approval (collector $BRIGHT_DATA_COLLECTOR_ID).
{
  "collector_id": "$BRIGHT_DATA_COLLECTOR_ID",
  "status": "awaiting_approval",
  "completed_steps": [
    "planner",
    "control_preview_runner",
    "step_advance",
    "control_preview_runner",
    "code_fixer",
    "step_preview_runner",
    "request_fulfillment_validator",
    "step_advance"
  ],
  "prompt": "The availability field concatenates the availability text of several books into one string. Each record's availability must come only from that book's own listing, and should read exactly 'In stock' or 'Out of stock'.",
  "view_url": "https://brightdata.com/cp/scrapers/$BRIGHT_DATA_COLLECTOR_ID",
  "next_step": "bdata scraper approve $BRIGHT_DATA_COLLECTOR_ID --url https://books.toscrape.com",
  "preview_result": [
    {
      "title": "Tipping the Velvet",
      "price": {
        "value": 53.74,
        "currency": "GBP"
      },
      "availability": "In stock",
      "product_url": "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html",
      "product_page_url": "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html"
    }
  ],
  "diff_summary": "proposed template has 2 step(s) — review at view_url"
}
```

Note the proposal's own `preview_result`: for *Tipping the Velvet* it already shows the **fixed** value, `"availability": "In stock"` — no concatenation. This is the proposal's self-reported preview, generated internally by the AI-Flow's `step_preview_runner`/`request_fulfillment_validator` steps. It is not the same thing as invoking `scraper run`, which is the actual test in the next section.

---

## 3. Trying to run the unapproved proposal

Command (background, ~9 minutes to complete — batch mode):

```bash
npx -p @brightdata/cli bdata scraper run $BRIGHT_DATA_COLLECTOR_ID https://books.toscrape.com --pretty
```

The collector was still `awaiting_approval` at this point (nothing was approved or rejected between step 2 and this call). Representative output (2 of 20 records; every record showed the same OLD broken pattern):

```json
[
  {
    "title": "Libertarianism for Beginners",
    "price": { "value": 51.33, "currency": "GBP", "symbol": "£" },
    "availability": "In stock (19 available) In stock In stock In stock In stock In stock In stock",
    "product_url": "https://books.toscrape.com/catalogue/libertarianism-for-beginners_982/index.html",
    "product_page_url": "https://books.toscrape.com/catalogue/libertarianism-for-beginners_982/index.html",
    "input": { "url": "https://books.toscrape.com" }
  },
  {
    "title": "Tipping the Velvet",
    "price": { "value": 53.74, "currency": "GBP", "symbol": "£" },
    "availability": "In stock (20 available) In stock",
    "product_url": "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html",
    "product_page_url": "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html",
    "input": { "url": "https://books.toscrape.com" }
  }
]
```

**Direct comparison for the same book, same moment:**

| Source | `availability` for *Tipping the Velvet* |
|---|---|
| `heal`'s own `preview_result` (proposal, unapproved) | `"In stock"` (fixed) |
| `scraper run` output, called immediately after, proposal still unapproved | `"In stock (20 available) In stock"` (still broken, still concatenated) |

All 20 records from `scraper run` matched the OLD broken pattern (a repeated `"In stock"` phrase, count varying 1–6 times per record, exactly like the pre-existing baseline in `docs/evidence/2026-08-21-books-toscrape-baseline.json`). None matched the proposal's clean `"In stock"` / `"Out of stock"` form.

---

## 4. Restoring the known-broken baseline

```bash
npx -p @brightdata/cli bdata scraper approve $BRIGHT_DATA_COLLECTOR_ID --reject
```

Output:

```
Rejecting self-healing...
{
  "collector_id": "$BRIGHT_DATA_COLLECTOR_ID",
  "status": "rejected",
  "completed_steps": [
    "planner",
    "control_preview_runner",
    "step_advance",
    "control_preview_runner",
    "code_fixer",
    "step_preview_runner",
    "request_fulfillment_validator",
    "step_advance",
    "user_approval"
  ],
  "prompt": "",
  "view_url": "https://brightdata.com/cp/scrapers/$BRIGHT_DATA_COLLECTOR_ID",
  "next_step": "bdata scraper run $BRIGHT_DATA_COLLECTOR_ID <url>"
}
```

A follow-up `bdata scraper run $BRIGHT_DATA_COLLECTOR_ID https://books.toscrape.com --pretty` confirmed the broken `availability` concatenation is still (and only ever was) live — see task-1-report.md for the full transcript. The collector was left in this known-broken state deliberately, per the task's own instructions, as the input Task 10's demo depends on.

---

## 5. Reasoning

1. `heal` without `--auto-approve` stages a proposal and stops at `status: "awaiting_approval"`. It reports a `preview_result` sample directly in its own response — so the CLI *does* print something about the proposal to stdout — but this preview comes from the AI-Flow's internal preview steps, generated once, during the heal job itself.
2. Calling `scraper run` afterwards — a separate command, a separate collector execution — does not read that staged proposal. It re-triggers a live scrape using the currently *approved* (i.e., unchanged, still-broken) template. Every one of the 20 returned records carried the old concatenated-availability defect, matching the pre-heal baseline exactly in form.
3. There is no CLI flag, on `run` or elsewhere, to target the pending/unapproved version instead of the live one, and no subcommand to list or diff pending proposals beyond the one-shot `preview_result` embedded in `heal`'s own output.
4. Therefore a validation gate cannot execute `bdata scraper run` against an unapproved proposal and observe its effect — the proposal is invisible to `run` until `approve` makes it live. The gate must instead: `approve`, run, validate, and on failure immediately `approve --reject` (or otherwise restore the previous state) — the post-approval verify-and-rollback path described in the design spec's section 2 fallback option.

---

GATE_PLACEMENT: post-approval-rollback
