# Working conventions

Homeward: animal rescue and adoption on the AT Protocol. Scope and decisions are in `docs/MVP-SPEC.md`.

## Language

- British English everywhere: code comments, docs, UI copy, commit messages, issues and PRs.
- UI strings live in `apps/web/messages/<language>.json`, never inline in components.

## Delivery

- Work is tracked as GitHub issues: epics are parent issues with sub-issues.
- One branch per issue, `feature/<issue#>-<slug>`, **always branched from `main`**.
- **No stacked PRs.** Every PR targets `main` and stands alone, so merge order never matters. If work depends on an unmerged PR, wait for it to merge (or say so) rather than stacking.
- Before pushing, run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Database tests need `pnpm services:up && pnpm db:migrate`.

## Decisions

- When a decision is open or ambiguous, put it to the product owner as **multiple-choice questions** with a recommended option, rather than guessing.
- Record agreed decisions in `docs/MVP-SPEC.md` and in the PR description.

## Product guard rails

- **Privacy:** adopter household data, precise location and identification numbers never go to a public repository. They belong in the private store (`packages/db`).
- **Transparency over authority:** show the facts that were checked, never a "verified" badge.
- **Records are forever:** lexicon changes must be backwards compatible (`packages/lexicons/README.md`).
- **Accessibility:** status is never conveyed by colour alone; keep the skip link, focus ring and labels intact.
