# Homeward

Animal rescue and adoption on the AT Protocol (the Atmosphere). Rescue organisations publish animals in need of a home, and adopters find animals that suit their home, household and means.

Scope and decisions: [`docs/MVP-SPEC.md`](docs/MVP-SPEC.md).

## Running it locally

Requires Docker. Everything runs in containers, built from your copy of the code:

```sh
cp .env.example .env
docker compose up --build --wait   # the first time takes 5 to 10 minutes
```

Then open http://localhost:3000. Emails Homeward sends are caught at http://localhost:8025.

For live reload with `pnpm dev` (Node 22 and pnpm 10), signing in, and what to do when something goes wrong, see [`docs/LOCAL.md`](docs/LOCAL.md).

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

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev`          | Run every workspace's dev task                          |
| `pnpm build`        | Build every workspace                                   |
| `pnpm lint`         | ESLint across the repo                                  |
| `pnpm typecheck`    | `tsc` in every workspace                                |
| `pnpm test`         | Vitest across the repo                                  |
| `pnpm format`       | Prettier, writing changes                               |
| `pnpm format:check` | Prettier, failing on unformatted files                  |
| `pnpm services:up`  | Start only Postgres/PostGIS and Mailpit, for `pnpm dev` |
| `pnpm db:migrate`   | Apply database migrations                               |

## Deploying

Production runs on one Scaleway server in Paris, deployed automatically when a change reaches `main`. Its settings are checked before every deploy. See [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Contributing

Each GitHub issue gets its own `feature/<issue#>-<slug>` branch from `main` and its own pull request against `main`; PRs are never stacked. See [`CLAUDE.md`](CLAUDE.md) for working conventions.
