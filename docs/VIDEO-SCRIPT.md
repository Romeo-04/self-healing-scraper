# Video script

**Target: 2:50.** Read it as written; every number in it is real and verified.

Timings assume you have already run `npm run seed` and have `npm run dev` serving in a
second tab. Commands to type are in the left column, narration in the right.

---

## 0:00 – 0:18 · Cold open, on the terminal

> Every self-healing scraper demo shows the same thing. Something breaks, an AI fixes it, applause.
>
> Nobody demos the interesting question — *what happens when the AI's fix is wrong?*
>
> That's what this is.

Do not show a title card. Open on the terminal.

---

## 0:18 – 1:00 · Act 1 · The defect

**Type:**
```bash
npm run pipeline -- replay
```

While it runs (under a second):

> This is real output from a Bright Data Scraper Studio collector. Twenty books, scraped from a live site.

**When the output lands, point at `20 records, 0 issues`:**

> Twenty records. Zero issues. Every field present, correctly typed, item count exactly right.
>
> Four of the five drift checks pass. A normal validation layer calls this healthy and moves on.

**Point at the `FIELD_BLEED` line:**

> The fifth one fires.

**Now show the value.** Scroll to it, or have it ready in a second pane:

```
"In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

> That's one book's availability. It should say "In stock."
>
> The scraper's selector is sweeping the whole page and gluing every book's availability into one string. Every value is malformed.
>
> And I didn't stage this. Bright Data's AI wrote that scraper. This sensor found the bug on the first real run — because the field is present, non-null, correctly typed, and the count is perfect. That's exactly why the other four checks miss it.

---

## 1:00 – 2:00 · Act 2 · The gate

**Type:**
```bash
npm run demo:gate
```

**Stop on block 1. Let it sit for a beat.**

> Now the important part. This is the validation gate judging a repair.

**Point at the three PASS rows:**

> Live check passes — twenty records, all assertions met. Regression passes. Anchor passes — every single key from the last good run is still there, a hundred percent.
>
> By every structural measure, this repair is fine.

**Point at `FAIL resolved`:**

> And the fault is still there.
>
> This was a repair that changed *nothing*. Perfect output, zero improvement. Three checks waved it through.
>
> `resolved` is the only one that catches it, because it's the only one that re-runs the sensor on the repaired data and asks: did the thing that broke actually get fixed?

**Scroll to block 3:**

> The inverse case. Twelve flawless records — from a related-products carousel instead of the catalogue. Every field valid, no drift. Only the anchor check notices that not one product from the previous run survived.

**Beat. Then the line the whole video exists for:**

> A rejection is the system working. Any loop can apply an AI's fix. This one can refuse it.

---

## 2:00 – 2:40 · Act 3 · The console

**Switch to the browser. `/timeline`.**

> Same event, persisted. The real drift, the real signal.

**Point at the empty state:**

> And here's where a repair would appear. It's empty, and I'll be straight about why: approving a repair on Bright Data's side is irreversible — there's no revert command — so that step is gated behind an explicit confirmation and I haven't run it against the live collector.

**Go to `/gate-demo`.**

> Same four checks, as a product. Note the rejection is amber, not red. That's deliberate — a rejection is the gate doing its job, and styling it like a crash would teach the operator exactly the wrong thing.

**Go to `/fleet`.**

> One card per scraper. Health, contract version, per-field fill rates. The coloured edge only appears when a card has something to report.

**Go to `/feed`. End here.**

> And this is what the machine exists for. Real titles, real prices, twenty rows.
>
> The feed keeps working because a bad repair never shipped.

---

## 2:40 – 2:50 · Close

> Bright Data proposes the repair. This decides whether it ships.
>
> Eighty-three tests. One runtime dependency. Every limitation written down in the README.

Cut.

---

## Delivery notes

**Pace.** The two silences matter more than anything you say. Hold for a beat after
`FAIL resolved` in Act 2, and again after "a rejection is the system working." Those are
the two moments a judge decides whether this is interesting.

**Do not read the PASS rows quickly.** The three passes are the setup for the failure. If
you rush them, the reveal has nothing to land against.

**Say the limitation out loud** in Act 3. It costs eight seconds and it is the difference
between a judge trusting the rest of the video and wondering what else was glossed. You
are being graded on reliability — volunteering the boundary of what you proved is evidence
*for* you.

**Font size up** before you start. Terminal text that can't be read on a laptop screen
wastes the strongest material you have.

**If a route 404s on camera:** stop, do not debug live. It is a stale process on the port —
`taskkill /PID <pid> /F`, restart `npm run dev`. Covered in `docs/DEMO.md`.

---

## If you only get 60 seconds

Cut Act 3 entirely except `/gate-demo`.

1. **0:00–0:10** — "Nobody demos what happens when the AI's fix is wrong."
2. **0:10–0:30** — `npm run pipeline -- replay`. Twenty records, zero issues, `FIELD_BLEED` fires anyway. Show the malformed value.
3. **0:30–0:55** — `npm run demo:gate`. Three checks pass, `resolved` refuses it. "A repair that changed nothing. A rejection is the system working."
4. **0:55–1:00** — `/gate-demo` in the browser. "Bright Data proposes. This decides whether it ships."
