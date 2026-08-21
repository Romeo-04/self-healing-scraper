---
name: committing-and-pushing
description: Use when committing, branching, pushing, or opening a PR in this repository, or when about to run git commit or git push
---

# Committing and Pushing

Every change reaches `main` through a named branch, carries a Conventional Commit message, and is attributed solely to the repository owner.

## The Three Rules

**1. Never commit directly to `main`.** Branch first, always.

**2. Every commit message is a Conventional Commit.**

**3. No AI attribution, ever.** No `Co-Authored-By` trailer for Claude or any model. No "Generated with", "Co-authored with Claude", or tool-credit footer. The repository owner is the sole contributor.

Rule 3 is absolute. It applies to squashes, amends, merges, reverts, and PR bodies.

## Branch Names

`<type>/<kebab-case-summary>` — the type matches the commit type.

| Branch | For |
|---|---|
| `feat/sensor-field-bleed` | New capability |
| `fix/poll-timeout-leak` | Bug fix |
| `docs/heal-loop-revision` | Documentation, spec |
| `chore/repo-conventions` | Tooling, config, deps |
| `refactor/extract-contract-io` | Restructuring, no behaviour change |
| `test/gate-rejection-path` | Tests only |

Keep summaries under about five words. No issue numbers, no dates, no personal prefixes.

## Commit Messages

```
<type>(<optional scope>): <imperative description>

<body: why, not what — the diff shows what>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`.

Subject rules: imperative mood (`add`, not `added`/`adds`), lowercase after the colon, no trailing period, under ~72 characters.

Write a body whenever the reason isn't self-evident. A reviewer should learn *why* from the message and *what* from the diff.

```
docs: redefine bleed signal as intra-value self-repetition

The cross-record formulation was inverted: every book on the target
site is genuinely in stock, so correct output repeats one value 20/20
times while broken output scores 0.70.
```

## Quick Reference

```bash
git checkout -b docs/some-change      # branch first
git add -A
git commit -m "docs: describe the change"
git push -u origin docs/some-change   # push the branch, never main
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Committed on `main` | `git branch <type>/<name>` then reset `main` back |
| Subject like `Updated files` | Name the actual change and give it a type |
| Past tense, or capital after colon | Imperative, lowercase |
| Body restates the diff | Replace with the reason for the change |
| Attribution trailer added by habit | Remove it before committing |

## Red Flags — Stop

- About to run `git commit` while on `main`
- Writing `Co-Authored-By`, `Generated with`, or any model name in a message
- Subject with no `type:` prefix
- "It's a tiny change, main is fine"
- "The trailer is just convention / it's honest / it's the default"

Each means: branch, rewrite the message, drop the attribution.

| Rationalization | Reality |
|---|---|
| "One-line fix, not worth a branch" | Branching costs one command. Do it. |
| "Nobody reads commit messages" | The message is the only record of *why*. |
| "Attribution is more honest" | The owner decided this. Their repo, their call. |
| "I'll clean up history later" | Rewriting pushed history breaks clones. Get it right now. |
