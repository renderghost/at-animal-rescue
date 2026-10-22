# Homeward

Animal rescue and adoption on the AT Protocol (the Atmosphere). Rescue organisations publish animals in need of a home, and adopters find animals that suit their home, household and means.

Scope and decisions: [`docs/MVP-SPEC.md`](docs/MVP-SPEC.md).

## Getting started

Requirements: Node 22 (see `.nvmrc`) and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

## Workspace

| Path                | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `apps/web`          | Next.js web app and server-side BFF (#13)                  |
| `apps/indexer`      | Jetstream consumer indexing `pet.homeward.*` records (#23) |
| `packages/lexicons` | Lexicon schemas and generated types (#16, #17)             |
| `packages/matching` | Pure matching logic shared by server and client (#38)      |
| `packages/db`       | Drizzle schema, migrations and connection helper (#14)     |

Internal packages are consumed as TypeScript source and have no build step.

## Scripts

| Command             | What it does                           |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | Run every workspace's dev task         |
| `pnpm build`        | Build every workspace                  |
| `pnpm lint`         | ESLint across the repo                 |
| `pnpm typecheck`    | `tsc` in every workspace               |
| `pnpm test`         | Vitest across the repo                 |
| `pnpm format`       | Prettier, writing changes              |
| `pnpm format:check` | Prettier, failing on unformatted files |

## Contributing

Each GitHub issue gets its own `feature/<issue#>-<slug>` branch from `main` and its own pull request.
