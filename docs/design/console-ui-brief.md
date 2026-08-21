# Into the Scrape-Verse — Console UI Brief

A design brief for the operator console. Everything here is real: the data shapes, the
field names, and the example values are taken from live runs of the actual scraper.

---

## 1. What this product is

A **scraper ops console**. It watches a small fleet of web scrapers, detects when a
target site's layout breaks extraction, asks the scraping platform to repair itself, and
**validates the repair before it goes live**. It also displays the data those scrapers
collect — book prices and stock — which is the thing the whole machine exists to serve.

The operator is a developer watching for two moments:

1. **"Something broke."** Which scraper, which field, how badly.
2. **"Did the fix hold?"** A repair was proposed; three checks ran; it was approved or
   rejected. Show them the verdict and the evidence.

Everything else is secondary to those two moments.

### The one concept the UI must teach

Repair is **not** magic. The scraping platform proposes a fix, and *our validation gate
decides whether it ships*. A proposal that looks perfect can still be wrong — it might be
reading the wrong part of the page entirely — and the gate catches that and **rejects** it.

**A rejection is a success, not an error.** The UI must make this legible. If a rejected
proposal is styled like a crash, the design has failed at its single most important job.

---

## 2. Non-negotiables

- **Dark theme only.** This is a monitoring tool that sits open on a second monitor.
- **Legibility outranks theme.** Every stylistic choice below yields to readability.
- **AA contrast minimum.** Body text ≥ 4.5:1, large text and borders ≥ 3:1. Status
  colours must be distinguishable by **shape or label too**, never colour alone.
- **No emoji as icons.** Use a real icon set (lucide preferred), consistent size and stroke.
- **Every state designed:** hover, focus-visible, active, disabled, loading, empty, error.
- **Live-updating.** Data refreshes every 2 seconds. Nothing may flash, jump, or reflow on
  refresh — that makes a monitoring tool unwatchable.
- **Responsive** down to tablet. Phone is nice-to-have, desktop is the real target.
- **Respect `prefers-reduced-motion`.** All the dimensional-rift motion below must have a
  static fallback.

---

## 3. Theme: Spider-Verse, done seriously

The project is called *Into the Scrape-Verse*. Scrapers are **spiders**, target sites are
**dimensions**, extraction breakage is an **anomaly**, and a repair is a **canon fix**.

The reference is *Into the Spider-Verse*'s print language, not Marvel merchandise:
Ben-Day halftone dots, chromatic aberration (red/cyan misregistration), screen-print
misalignment, comic panel gutters, and bold condensed display type.

### Where theme is allowed to live

| Allowed | Not allowed |
|---|---|
| Page headers, section titles, display type | Data tables, numbers, field values |
| Empty states and loading states | Anything a person reads to make a decision |
| Event markers on the timeline | Status badges (these must be instantly scannable) |
| Panel gutters and card framing | Form inputs and controls |
| Transitions between views | Chart axes, labels, gridlines |
| The "break the site" control | Gate check results |

**The rule:** theme the *chrome*, keep the *data* clean. A halftone texture behind a
section header is great. A halftone texture behind a price table is sabotage.

### Specific techniques, with limits

- **Chromatic aberration** — a 1–2px red/cyan offset on display headings only. Never on
  body text, never on numbers. Use it once or twice per screen, not everywhere.
- **Halftone dots** — very low opacity (3–6%) as a background texture on headers and
  empty states. Must never reduce text contrast.
- **Panel gutters** — comic-panel framing for card grids: slightly thicker borders and
  generous, consistent gaps. This one is free — it's just good card design with intent.
- **Glitch / rift motion** — reserve entirely for **anomaly detected** and **healing in
  progress**. When the whole UI glitches, nothing means anything. When only a breaking
  scraper glitches, the glitch *is* the alert.
- **Condensed display type** for headings and big numbers. Body stays a clean UI sans.

---

## 4. Tokens

Define these once. No hardcoded hex, no off-scale spacing.

### Colour

Base is a near-black with a slight blue-violet cast — the film's night palette — not
pure black and not neutral grey.

```
--bg            #0A0A11   page
--surface       #12121C   cards, panels
--surface-2     #1A1A28   raised: modals, popovers, table header
--border        #262636   hairline
--border-strong #35354A   panel gutters, emphasis

--text          #EDEDF2   body
--text-muted    #9A9AB0   labels, secondary
--text-faint    #6A6A80   timestamps, hints
```

**Accent is cyan, and this decision is load-bearing:**

```
--accent        #22D3EE   primary action + focus ring ONLY
--accent-hover  #67E8F9
--accent-subtle rgba(34,211,238,0.14)
```

Crimson is the obvious Spider-Man choice for the accent, and it is **wrong here**. Red
must mean *critical drift* and nothing else. If the primary button is also red, every
screen reads as alarming and the actual alarm stops registering. Cyan takes the accent
job; red is reserved for meaning.

```
--critical      #F43F5E   critical drift, gate FAIL, failed run
--warn          #FBBF24   warning severity
--healthy       #34D399   healthy scraper, gate PASS, ok run
--healing       #E879F9   repair in flight — the "dimensional anomaly" magenta
--info          #818CF8
```

Each semantic colour also gets a `-subtle` translucent variant (12–18% alpha) for badge
and row backgrounds.

`--healing` magenta is the only decorative-feeling colour, and it earns its place: a
repair in flight is genuinely a distinct state from healthy, broken, and warning, and it
is the state the operator most wants to spot across a room.

### Spacing

4px base: **4, 8, 12, 16, 24, 32, 48, 64**. Nothing else. Padding inside a component is
always smaller than the gap between components.

### Type

- **Display** (headings, big numbers): a bold condensed sans — Archivo Narrow, Barlow
  Condensed, or Oswald. Weight 700.
- **UI** (everything else): Inter, or `system-ui` stack. Weights 400 / 500 / 600.
- **Mono** (selectors, JSON paths, field values, signal codes): JetBrains Mono or
  `ui-monospace`. **Required** — the data in this app is code-like and must look it.

Scale: 11, 12, 13, 14 (body), 16, 20, 24, 32, 44. Line-height 1.5 body, 1.15 display.

### Radius & elevation

Radius: 6 (controls), 12 (cards), 999 (pills). Hairline borders do the work; shadow only
for things that genuinely float (modals, popovers, toasts).

---

## 5. Surfaces

Five primary views plus one modal. Persistent left nav, plus a global status strip.

### 5.0 App shell

- **Left nav**, icon + label: Fleet, Timeline, Feed, Contracts, Mission Control. Collapses
  to icons under 1100px.
- **Wordmark** "INTO THE SCRAPE-VERSE" in display type with a subtle chromatic offset —
  the one place the effect is unmistakably intentional.
- **Global status strip** along the top: total spiders, how many healthy, last run time,
  and a live pulse dot. When any scraper is in `healing`, this strip carries the magenta.
- Content max-width ~1400px, `padding-inline: clamp(16px, 4vw, 48px)`.

### 5.1 Fleet — the home screen

A card grid, one card per scraper ("spider"). Two cards today; design for up to eight
without reflowing awkwardly.

Each card shows:

- **Name + dimension**: `books-toscrape` / `books.toscrape.com`
- **Health badge**: Healthy / Anomaly / Healing / Failed — colour **and** icon **and** word
- **Contract version**: `v3` — prominent; this number is what changes when a repair lands
- **Last run**: relative time, e.g. "42s ago"
- **Record count** with expected range: `20 records` (healthy) vs `3 records` (collapsed)
- **Per-field fill-rate bars** — one thin horizontal bar per field: `title 100%`,
  `price 100%`, `availability 35%`, `url 100%`. This compact row is the single most
  informative element on the screen; give it room.
- **Uptime sparkline** — last ~20 runs, one mark per run, coloured by status.
- Card click → that spider's detail / timeline filtered to it.

**Card states:** healthy (calm, bordered, no motion) · anomaly (critical-red left edge,
a subtle glitch on the badge only) · healing (magenta edge, slow pulse) · failed
(desaturated, muted — infrastructure failure is *not* the same as a broken site, and must
not look like one).

That last distinction matters: `failed` means the collector was unreachable. `anomaly`
means the site changed. Conflating them visually would lie to the operator.

### 5.2 Timeline — the event stream

A vertical chronological stream, newest first. This is where the story of a repair is told,
and it is the screen most likely to be filmed for a demo. Make it the best thing here.

Event types, each with a distinct marker:

| Event | Marker | Content |
|---|---|---|
| Run OK | small healthy dot | `books-toscrape · 20 records · contract v2 · 1.4s` |
| Anomaly detected | red diamond, glitch-in on arrival | signal chips + evidence |
| Repair requested | magenta node | the plain-language prompt sent to the platform |
| Gate verdict | three-check block | PASS/FAIL per check with detail |
| Approved | healthy node, "canon" framing | `contract v2 → v3 promoted` |
| Rejected | amber node — **not** red | `proposal rejected, v2 stays live` |
| Run failed | grey node | `collector unreachable, 3 attempts` |

**Signal chips** use monospace, uppercase, colour-coded by severity:
`FIELD_BLEED` · `HARD_SCHEMA_FAIL` · `ITEM_COUNT_COLLAPSE` · `TYPE_VIOLATION` ·
`FILL_RATE_DROP`

Each event is collapsed by default with a one-line summary and expands to show evidence.
Expanded evidence is monospace JSON with syntax tinting.

Use comic panel gutters here: each event is a panel, the vertical connector is the gutter.
This is the one screen where leaning into the reference is fully earned.

**Anomaly events arrive with a glitch-in animation. Nothing else animates on arrival.**

### 5.3 Gate verdict — the money shot

Appears inline in the timeline and as an expandable detail panel. This component carries
the product's entire argument, so it deserves the most design attention of anything here.

Three checks, always all three shown, always in this order:

```
LIVE        PASS   20 records, all assertions met
REGRESSION  PASS   1 fixture still passes
ANCHOR      FAIL   0/20 known keys retained (0%, need 30%)
```

- Each check: name (mono, uppercase), verdict pill (PASS/FAIL), detail (mono, muted).
- **Every check renders even when an earlier one fails.** Never short-circuit the display —
  the complete report is the audit trail.
- Overall verdict banner above: **PROPOSAL APPROVED** or **PROPOSAL REJECTED**.
- A rejection banner is **amber and confident**, not red and panicked. Supporting copy
  like *"The gate did its job — contract v2 remains live"* is exactly the right tone.
  The operator should feel protected, not alarmed.

### 5.4 Contract diff

Side-by-side version comparison, `v2` vs `v3`.

- Each version is a list of field mappings, monospace:
  `price → price.value` / `availability → inventory.warehouse.state`
- Changed rows highlighted; unchanged rows dimmed so change pops.
- Header per side: version number, who created it (`seed` / `studio` / `fallback`),
  timestamp, and the note.
- **Provenance badge** — `studio` (the platform proposed it) vs `fallback` (our own agent
  proposed it) vs `seed` (hand-written). Distinct, quiet styling; this is interesting
  metadata, not an alert.
- **Rollback button** — destructive-adjacent. Secondary styling with a confirm step, never
  a bare red button sitting next to data.

### 5.5 Feed — the actual product

The data the scrapers collect. This screen proves the machine serves a purpose.

- **Price table**: Title · Price · Currency · In stock · Last seen. Real rows:

  | Title | Price | Stock |
  |---|---|---|
  | The Black Maria | £52.15 | In stock |
  | Rip it Up and Start Again | £35.02 | In stock |
  | The Dirty Little Secrets of Getting Your Dream Job | £33.34 | In stock |
  | The Requiem Red | £22.65 | In stock |

  20 rows typical. Right-align prices, tabular numerals, mono for the price column.
- **Price history chart** — line or step chart per tracked book, prices in the £13.99–£57.25
  range. Clean and unthemed: no halftone, no aberration, no glow. Axes and gridlines in
  `--border`, series in accent and neutrals, direct labels over a legend where possible.
- **A "data continuity" marker**: a thin vertical rule on the chart where a repair landed,
  labelled `v2 → v3`. This is the payoff of the entire product — *the feed did not go dark
  when the site broke* — and it should be visible at a glance.
- Sortable columns, and a stale-data indicator if the last run is old.

### 5.6 Mission Control — the demo panel

Where the operator deliberately breaks a site to prove self-healing works.

- **Mutation profile picker** — a segmented control or card row:
  `pristine` · `renamed-classes` · `tag-swap` · `currency-format` · `nested-wrap`
  Each with a one-line plain-English description of what it breaks. `pristine` is the
  restore option and should read as the safe default.
- **"BREAK THE SITE"** — the one place a big, loud, unapologetically comic-book button
  belongs. Display type, chromatic offset, satisfying press state. It is a deliberate
  destructive-ish action on a site we own, so it should feel weighty — a hold-to-confirm
  or two-step press would be better than a plain click.
- **"TRIGGER RUN"** — the primary action, accent cyan, plain and clean.
- **Live run log** — streaming terminal-style output while a run is in flight. Mono,
  dark, auto-scrolling, with a clear "in progress" indicator.

---

## 6. States

Design all of these; the app hits every one of them regularly.

- **Empty fleet** — "No spiders deployed." Themed, illustrated, with a clear next action.
  This is a legitimate place for a full halftone treatment.
- **First load** — skeletons matching final layout dimensions exactly, so nothing shifts.
- **Run in flight** — the triggering card enters a determinate-feeling loading state.
  Collector runs take 30s–4min, so this state is **long-lived and must not feel stuck**.
  Show elapsed time and the current step.
- **No drift ever detected** — a calm, positive state, not an empty void.
- **Repair in flight** — the magenta state, most distinctive on the screen.
- **Repair failed after retries** — needs-human. Serious but not catastrophic: the old
  contract is still live and the feed is still running. Say so explicitly.
- **Collector unreachable** — infrastructure error, visually distinct from site drift.
- **Stale data** — last successful run is old; badge it rather than silently showing old numbers.

---

## 7. Deliberate anti-goals

- ❌ Spider-webs as decorative borders or dividers
- ❌ A spider-web loading spinner
- ❌ Comic sound effects ("THWIP!", "BAM!") anywhere near functional UI
- ❌ Red as the accent / primary button colour (see §4)
- ❌ Halftone or aberration on numbers, tables, charts, or form fields
- ❌ Glitch effects on healthy states — it destroys the glitch's meaning as an alert
- ❌ Styling a gate rejection as a crash or failure
- ❌ Colour as the only carrier of status
- ❌ Layout that shifts on the 2-second refresh

---

## 8. If you build only three things

In priority order, because the deadline is short:

1. **Timeline with the gate verdict block** — the product's argument, and the demo's spine.
2. **Fleet cards with fill-rate bars** — the at-a-glance health read.
3. **Feed table + price chart with the `v2 → v3` continuity marker** — proof the thing is useful.

Mission Control and Contract Diff are valuable but cuttable.

---

## 9. Reference data

Copy these verbatim into mockups. Real values make better design decisions than
placeholders, and this is what the screens will actually contain.

**Targets:** `books-toscrape` (books.toscrape.com), `mirror` (our controllable test site)

**Statuses:** `pending` · `ok` · `drift` · `healed` · `failed`

**Signals:** `HARD_SCHEMA_FAIL` · `FILL_RATE_DROP` · `ITEM_COUNT_COLLAPSE` ·
`TYPE_VIOLATION` · `FIELD_BLEED`

**Fields tracked:** `title` · `price` · `currency` · `availability` · `url`

**Contract provenance:** `seed` · `studio` · `fallback`

**Gate checks:** `live` · `regression` · `anchor`

**A real signal detail string, for sizing:**
`availability repeats an internal phrase 7x within a single value`

**A real anchor-check detail:**
`6/20 known keys retained (30%, need 30%)`

**The real broken value that started all of this** — one book's availability field,
which should read simply "In stock":

```
"In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

Good UI makes it obvious at a glance that this string is wrong. That is the whole job.
