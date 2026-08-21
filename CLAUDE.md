# Into the Scrape-Verse

Self-healing scraper ops console built on Bright Data Scraper Studio. Design lives in
`docs/superpowers/specs/2026-08-20-into-the-scrape-verse-design.md` — read it before
changing anything structural.

## Git rules — always apply

These hold for every commit in this repository, without exception:

1. **Never commit directly to `main`.** Branch first: `<type>/<kebab-summary>`.
2. **Conventional Commits.** `<type>(<scope>): <imperative description>`, lowercase, no trailing period.
3. **No AI attribution.** Never add `Co-Authored-By` for Claude or any model, and no
   "Generated with" footer in commits or PR bodies. The repository owner is the sole contributor.

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`.

Full detail, examples, and failure modes: `.claude/skills/committing-and-pushing/SKILL.md`.

## Secrets

`.env.local` holds the Bright Data API token, the collector ID, and the OpenAI key. It is
git-ignored and must stay that way. `.env.example` is committed and carries **variable names
only, never values** — this repository is public.

Never write a real collector ID, token, or key into any tracked file, including docs.

## Stack

Next.js 15 + TypeScript. SQLite via `node:sqlite` (built into Node 24 — no native build).
Bright Data CLI (`bdata`) drives collectors and their repair. OpenAI is the fallback repair
agent only; `OPENAI_MODEL` is read from the environment and never hardcoded.
