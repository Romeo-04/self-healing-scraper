# Demo runbook

Everything below has been run and produces the output shown. Numbers are real.

**Total runtime: about 3 minutes.** Three acts, in this order, because each one sets up the next.

---

## Before you record

```bash
cd C:\Users\Jhezra\Documents\into-the-scraper-verse
npm install
npm test                 # expect: 83 pass, 0 fail
npm run seed             # expect: seeded books-toscrape at contract v1
```

Open **two windows**, side by side if your screen allows:

1. A terminal, font size up, in the project directory.
2. A browser. Start the console in a *second* terminal tab with `npm run dev`, then open the port it prints (usually `http://localhost:3000`).

**Two failure modes that will bite you on camera.** Both cost me time; neither is a code bug:

- **Every route 404s.** A stale Node process is squatting the port. Fix:
  `netstat -ano | findstr :3000` then `taskkill /PID <pid> /F`
- **A route 500s with `__webpack_modules__ is not a function`.** You ran `npm run build` while `npm run dev` was live, and the build overwrote the dev server's cache. Fix: stop the server, `rmdir /s /q .next`, `npm run dev` again.

Never run `npm run build` while `npm run dev` is running.

---

## Act 1 — The defect is real, and four of five checks miss it

**Run:**

```bash
npm run pipeline -- replay
```

**Expected output:**

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
persisted 20 record row(s) for run 1
recorded drift_event 1

=== detect mode: stopping here (never heals) ===
```

**What to point at, and why it matters.**

The line `20 records, 0 issues` is the setup. Every record extracted cleanly — nothing missing, nothing mistyped, item count exactly right at 20 of 20. Four of the five drift signals pass. A normal validation layer calls this a healthy run and moves on.

Then `FIELD_BLEED` fires anyway. Show the value it caught:

```
"In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

That is one book's availability field. It should read `In stock`. The scraper's selector is sweeping a whole page region and concatenating every book's availability into one string.

**The point to land:** this bug was not staged for the demo. Bright Data's AI generated that scraper, and this sensor found the defect on the first real run. The value is present, non-null, correctly typed, and the record count is perfect — which is exactly why the other four signals miss it.

---

## Act 2 — The gate refuses a repair that changed nothing

**Run:**

```bash
npm run demo:gate
```

**Expected output** (three blocks; the first is the one that matters):

```
1. A repair that changed NOTHING
  PASS  live        20 records, all assertions met
  PASS  regression  1 fixture(s) still pass
  PASS  anchor      20/20 known keys retained (100%, need 30%)
  FAIL  resolved    the original fault is still present: FIELD_BLEED
  => REJECTED

2. A GENUINE repair
  ... all four PASS
  => APPROVED

3. A repair reading the WRONG PART OF THE PAGE
  FAIL  anchor      0/20 known keys retained (0%, need 30%)
  => REJECTED
```

**What to say over block 1.**

Three checks pass. The output is well-formed, plentiful, correctly typed, and anchored to the previous run — every key from the last good run is still there. By every structural measure this repair is fine.

And the fault is still present. A repair can produce perfect output and change nothing at all.

`resolved` is the only check that notices, because it is the only one that re-runs the sensor on the repaired output and asks *did the thing that broke actually get fixed?*

**Block 3 is the inverse and worth ten seconds.** Twelve flawless records — from a related-products carousel instead of the catalogue. Every field valid, no drift detected. Only `anchor` catches it, by noticing that not one product from the previous run survived.

**The sentence to land:** a rejection is the system working. That is the whole product. Any loop can apply an AI's fix; this one can refuse it.

---

## Act 3 — The console

Open the browser. Visit in this order.

### `/timeline`

The chronological record. Point at the real `FIELD_BLEED` event from Act 1 — same signal, same detail string, now persisted.

Then point at the honest empty state where a repair would appear: **"No repair requested yet for this anomaly."** Say so plainly. That table is genuinely empty because the irreversible repair step has not been run against the live collector.

### `/gate-demo`

The four-check block rendered. Same verdicts as Act 2, in the UI. Show the `RESOLVED`-fails case and the `ANCHOR`-fails case.

Note the rejection is styled **amber and confident**, not red. That is deliberate: a rejection is the gate doing its job, and styling it as a crash would teach the operator the wrong thing.

### `/fleet`

One card per scraper. Health badge reading **Anomaly**, contract version `v1`, record count, per-field fill-rate bars.

The coloured left edge appears only when a card has something to report — a healthy card has no stripe, so the stripe's presence is the signal.

### `/feed`

The data the whole machine exists to serve. Real titles, real prices: `The Requiem Red — £22.65`. Twenty rows, plus the price chart.

**Close on this screen.** The argument is that the feed keeps working because a bad repair never shipped.

---

## Optional Act 4 — the live repair (irreversible)

**Do not run this on camera without deciding in advance.**

```bash
CONFIRM_HEAL_LIVE=yes npm run pipeline -- heal-live
```

This asks Bright Data's AI to repair its own scraper, checks the proposal's preview, and may call `bdata scraper approve` — which **cannot be undone**. There is no revert command in the CLI. If a bad repair is approved, recovery means recreating the collector (about four minutes with `bdata scraper create`).

It refuses to start without the `CONFIRM_HEAL_LIVE=yes` variable, on purpose.

Two things also worth knowing: the account's realtime page quota is currently exhausted, so the CLI falls back to a slow batch mode; and this path has never been executed, so it is the least-tested code in the project.

If you do run it and it succeeds, `/timeline` gains a real repair event and the empty state disappears — which is a stronger demo. That is a judgement call about risk, not a technical one.

---

## What not to claim

Say these accurately or a judge reading the repo will catch the gap:

| Do not say | Say instead |
|---|---|
| "It heals automatically in production" | "The detection and gate run end to end. The approve step is gated behind an explicit confirmation because it is irreversible." |
| "This is live data right now" | "This is real collector output, captured and replayed. The live fetch is quota-limited." |
| "The gate catches any bad repair" | "It catches repairs that changed nothing, and repairs reading the wrong data. It cannot catch a history-relative drop with no history." |

The honest version is stronger. Every limitation is already written down in `README.md`.

---

## The 60-second version

If time is tight, cut Act 3 to `/gate-demo` alone:

1. `npm run pipeline -- replay` — 20 records, 0 issues, and `FIELD_BLEED` fires anyway
2. `npm run demo:gate` — three checks pass, `resolved` refuses it
3. `/gate-demo` in the browser — the same verdict as a product

That is the entire argument in three commands.
