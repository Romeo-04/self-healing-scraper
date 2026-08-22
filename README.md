# Canon Event

**A self-healing scraper that can refuse its own repair.**

Built on Bright Data Scraper Studio. When a site breaks extraction, Scraper Studio's AI
proposes a fix — and a four-check validation gate decides whether that fix is allowed to ship.

In *Across the Spider-Verse*, the Spider-Society detects anomalies and judges whether an event
is legitimate canon or a deviation that has to be stopped. This does the same thing to scraper
repairs.

---

## Evaluate it in 90 seconds — no credentials needed

Everything in this section runs offline against a committed payload of real collector output.
You do **not** need a Bright Data account to see the whole argument.

```bash
git clone https://github.com/Romeo-04/self-healing-scraper
cd self-healing-scraper
npm install

npm test                       # 83 tests
npm run seed                   # creates data.db
npm run demo:gate              # <- start here
```

`npm run demo:gate` is the project in one command. It judges three repair proposals:

```
1. A repair that changed NOTHING
  PASS  live        20 records, all assertions met
  PASS  regression  1 fixture(s) still pass
  PASS  anchor      20/20 known keys retained (100%, need 30%)
  FAIL  resolved    the original fault is still present: FIELD_BLEED
  => REJECTED
```

Three checks pass. The output is well-formed, plentiful, correctly typed, and every key from
the last good run is still present. By every structural measure the repair is fine — **and the
fault is still there.**

That is the whole point. A repair can produce perfect output and change nothing. `resolved` is
the only check that notices, because it is the only one that re-runs the drift sensor on the
repaired output and asks *did the thing that broke actually get fixed?*

Then see the detection that started it, and the console:

```bash
npm run pipeline -- replay     # the sensor finding the real defect
npm run dev                    # the console — open the port it prints
```

---

## The defect is real, and it was not staged

Bright Data's AI generated our collector from a plain-language description. On its first run,
the `availability` field came back like this, for a book that is simply in stock:

```
"In stock (19 available) In stock In stock In stock In stock In stock In stock"
```

The selector sweeps a whole page region and concatenates every book's availability into one
string. Every value is malformed.

And the run reports `20 records, 0 issues`. The field is present, non-null, correctly
string-typed, and the item count is exactly right at 20 of 20. **Four of our five drift signals
pass it.** A normal validation layer calls that a healthy run and moves on.

Our sensor caught it anyway, on the first real run. That is what the fifth signal is for.

---

## Setup

### Prerequisites

| Requirement | Why |
|---|---|
| **Node 24 or newer** | Uses `node:sqlite`, `node --test`, `--env-file-if-exists`, and native TypeScript type stripping. None of it is polyfilled. Check with `node --version`. |
| npm 10+ | Ships with Node 24. |
| A Bright Data account | **Only** for live collector runs and live repairs. Everything offline works without one. |
| An OpenAI API key | **Only** for the fallback repair, which fires when Bright Data's proposals are rejected twice. |

### Offline setup — no credentials

```bash
npm install
npm run seed
```

That is all. `seed` stores a `c_unset` placeholder collector ID, which is fine because nothing
offline calls the network. Now working:

| Command | What it does |
|---|---|
| `npm test` | 83 tests |
| `npm run typecheck` | `tsc --noEmit`, exits 0 |
| `npm run demo:gate` | the gate judging three proposals |
| `npm run pipeline -- replay` | detection against a committed real payload |
| `npm run dev` | the console |

### Live setup — with credentials

```bash
cp .env.example .env.local
```

Fill in:

```
BRIGHT_DATA_API_TOKEN=      # brightdata.com -> Account Settings -> API Tokens
BRIGHT_DATA_COLLECTOR_ID=   # the c_... id, printed by `bdata scraper create`
OPENAI_API_KEY=             # platform.openai.com -> API keys
OPENAI_MODEL=gpt-4.1-nano   # read from env, never hardcoded
MIRROR_PUBLIC_URL=          # unused; reserved
```

`.env.local` is git-ignored and must stay that way. `.env.example` is committed and holds
variable **names only**.

To create your own collector from scratch:

```bash
npx -p @brightdata/cli bdata login
npx -p @brightdata/cli bdata scraper create "https://books.toscrape.com" \
  "Extract every book on the page with title, price, availability status, and product URL"
```

That prints a `c_...` collector ID. Put it in `.env.local`. It takes about four minutes —
Scraper Studio's AI is generating the schema and the extraction code.

### The pipeline modes

Only one of them can approve anything.

| Command | Network | Can approve? |
|---|---|---|
| `npm run pipeline -- replay` | none | no |
| `npm run pipeline` *(detect, default)* | live collector run | no |
| `npm run pipeline -- heal-dry` | live run **and** live repair | no — always discards |
| `npm run pipeline -- heal-dry replay` | live repair, replayed detection | no — always discards |
| `CONFIRM_HEAL_LIVE=yes npm run pipeline -- heal-live` | everything | **yes — irreversible** |

`heal-live` refuses to start without that environment variable, deliberately.
`bdata scraper approve` **cannot be undone** — a pending proposal can be discarded, but the
CLI has no revert for an approved one. We verified that empirically rather than assuming it.

---

## How Bright Data Scraper Studio is used

Scraper Studio does what it is best at, and this project supplies what it does not.

| Bright Data owns | This project owns |
|---|---|
| Proxy, unblocking, navigation, pagination | Mapping its JSON output to typed records |
| HTML → JSON extraction | Detecting when that output has silently broken |
| **Repairing its own scraper** | **Deciding whether a repair ships** |

`lib/brightdata/cli.ts` drives four CLI operations from code:

```
bdata scraper run     <id> <url> --pretty     collect
bdata scraper heal    <id> "<prompt>" --url   request an AI repair
bdata scraper approve <id> --url              ship a proposal
bdata scraper approve <id> --url --reject     discard a pending proposal
```

**The most important line in the codebase is the one that isn't there: we never pass
`--auto-approve`.** That single omission turns a heal into a *proposal* something else can
refuse, and the entire project lives in the space it creates.

**The repair prompt is generated, not written.** When the sensor detects drift it produces
evidence — which field broke, what it used to yield, what it yields now — and
`lib/healer/prompt.ts` turns that into the plain-language prompt sent to `scraper heal`. The
system describes its own symptoms to Bright Data's AI, within the CLI's 1000-character limit.

### Two findings that shaped the architecture

Both empirical, both recorded in `docs/evidence/2026-08-21-cli-proposal-semantics.md`:

1. A pending proposal reaches `status: "awaiting_approval"` but is **invisible to
   `scraper run`** — you get the old output until you approve. So a gate cannot test a proposal
   by running it.
2. But `heal`'s response **embeds a `preview_result`** showing corrected values. That preview is
   the only pre-approval signal available, which makes it the **only reversible checkpoint in
   the loop.**

So the loop gates twice: check the preview and reject while still pending (free, reversible),
then approve and run the full four-check gate. Neither decision came from documentation.

---

## Drift detection

Five signals run on every response. Four are ordinary. The fifth earns its place.

| Signal | Fires when |
|---|---|
| `HARD_SCHEMA_FAIL` | a required field is missing in >20% of records |
| `FILL_RATE_DROP` | a field's fill rate falls below its floor, or drops 40pts vs history |
| `ITEM_COUNT_COLLAPSE` | count below `minItems`, or below half the rolling median |
| `TYPE_VIOLATION` | a value is present but fails its declared type or transform |
| `FIELD_BLEED` | **a single value repeats a multi-word phrase back-to-back** |

`FIELD_BLEED` exists because of the real defect above, which all four others pass.

It measures repetition *within* one value, not across records — because every book on the
target site genuinely is "In stock," so correct output legitimately repeats one identical value
20 times out of 20. A cross-record rule would flag correct data as broken. It also requires two
distinct tokens, so a chant or a repeated single word does not trip it.

---

## The gate

Four checks, all of which must pass. All four are always reported, even after one fails,
because the complete report *is* the audit trail.

| Check | Asks |
|---|---|
| **live** | does the repaired output satisfy every assertion? |
| **regression** | does it still satisfy them across the whole fixture URL set? |
| **anchor** | are at least 30% of the last good run's record keys still present? |
| **resolved** | **is the fault that triggered the repair actually gone?** |

`anchor` catches a proposal reading the wrong part of the page — twelve flawless records from a
related-products carousel parse perfectly and are completely wrong. `resolved` catches a repair
that changed nothing. It **fails closed**: no sensor verdict means no approval.

What protects the data is that the payload contract is versioned independently and never
advances unless the gate passes, so extraction stays on the last known-good contract regardless
of what state the collector is left in.

---

## Architecture

```
lib/brightdata/   Scraper Studio: run, heal, approve, reject
lib/extract/      apply a payload contract -> typed records
lib/sensor/       five drift signals
lib/healer/       two-stage heal loop, the gate, the OpenAI fallback
lib/db/           node:sqlite schema and access
scripts/          seed, pipeline (4 modes), gate demo
app/              the read-only console
```

`sensor/` and `healer/gate.ts` never touch HTTP or the database — they take data in and return
verdicts out, which is why they are testable without a network.

**One runtime dependency.** Node 24 supplies SQLite, the test runner, env loading, and
TypeScript stripping, so the engine has no build step and no bundler. `openai` is the only
install and powers the fallback repair only. `tsc --noEmit` runs with `erasableSyntaxOnly` as a
mechanical guard, verified to actually reject unsupported syntax rather than being configured
and inert.

---

## The console

`npm run dev`, then open the port it prints.

| Route | Shows |
|---|---|
| `/fleet` | one card per scraper — health badge, contract version, fill-rate bars |
| `/timeline` | runs, drift events, and repair attempts in order |
| `/gate-demo` | the four-check verdict block, including both refusal cases |
| `/feed` | the price table and chart — the data the machine exists to serve |

**Read-only by construction.** It opens the database in read-only mode and has no mutating
routes, so it cannot trigger a repair or touch the collector. It also never imports from
`lib/` — a thin `app/db.ts` does the reads, keeping the engine a pure Node project.

---

## Evidence

`docs/evidence/` holds real transcripts, not claims:

| File | What it records |
|---|---|
| `2026-08-21-books-toscrape-baseline.json` | 20 records from a real collector run |
| `2026-08-21-cli-proposal-semantics.md` | a real heal, its `awaiting_approval` envelope, and the finding that a pending proposal is invisible to `run` |
| `2026-08-21-replay-detect-run.md` | the sensor detecting the genuine defect |
| `2026-08-22-live-heal-dry-run.md` | a real repair request to Bright Data, judged and then discarded |
| `2026-08-23-live-heal-live-run.md` | **the full autonomous loop, `approve` fired — and the repair did not work** |

**Read the last one.** The full loop ran autonomously with `CONFIRM_HEAL_LIVE=yes`: the sensor
generated a prompt, Bright Data proposed a repair, its `preview_result` came back **clean**, our
pre-approval check passed it on merit, and `approve` fired with no human involved.

Then the collector was re-run. **The repair had not worked** — 17 of 20 records still bleeding,
output identical to before.

The proposal's self-reported preview was unrepresentative of what the collector actually
produces. `--auto-approve` would have shipped that and logged a success. The only check that
catches it is `resolved`, which re-runs the sensor on **real** post-repair output rather than
trusting a proposal's description of itself — and on this run it timed out under the account's
batch-mode quota fallback before it could.

The contract stayed at v1 throughout, so nothing downstream was corrupted and nothing false was
recorded. That is the design working: it approved, could not verify, and refused to claim
success.

`docs/DEMO.md` is a runbook for reproducing all of it.

---

## Honest limitations

Written here rather than left to be discovered:

- **`FIELD_BLEED` detects back-to-back repetition only.** An interleaved bleed
  (`"In stock 19 In stock 20"`) is missed. Separating that from natural language reliably is a
  research problem; sibling-node concatenation produces the back-to-back shape.
- **`toNumber` is over-strict on annotated prices.** `"£52.15 (inc. VAT)"` returns `undefined`,
  triggering an unnecessary repair. It fails safe — refusing to parse raises `TYPE_VIOLATION`,
  whereas guessing corrupts data silently.
- **`resolved` cannot catch a history-relative fault with no history.** With an empty history,
  the relative branches of `FILL_RATE_DROP` and `ITEM_COUNT_COLLAPSE` cannot fire.
- **A live `heal-live` ran and did not close the loop.** `approve` fired autonomously, but the
  post-approval verification timed out under the quota fallback, and a later run showed the
  repair had not worked. The contract correctly stayed at v1. Full record in the evidence table.
- **The full live loop has not run uninterrupted in one process.** The account's realtime page
  quota is exhausted, which forces the CLI into a batch mode taking about ten minutes. Each link
  is evidenced separately.

---

## Troubleshooting

**Every console route returns 404.** A stale Node process is holding the port.

```bash
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

**A route 500s with `__webpack_modules__ is not a function`.** Something ran `npm run build`
while `npm run dev` was live and overwrote the dev server's cache. Stop the server, delete
`.next`, start again. Never build while dev is serving.

**`spawn EINVAL` when calling the CLI.** Node refuses to spawn `.cmd` shims. Already handled —
`lib/brightdata/cli.ts` resolves npx's JS entry point and runs it through `node` directly.

**A live run hangs for minutes.** Expected when the realtime quota is exhausted; the CLI falls
back to batch mode. Raise `BDATA_TIMEOUT_MS` (default 30 minutes), or use a `replay` mode.

**Commit hooks.** `.git/hooks/commit-msg` strips AI attribution trailers. Hooks are not
committed, so a fresh clone needs it reinstalled — see
`.claude/skills/committing-and-pushing/SKILL.md` for this repository's git conventions.
