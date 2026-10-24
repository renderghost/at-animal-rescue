# Running Homeward on your computer

There are two ways to run Homeward locally. Both use Docker, and both read the same settings file.

|            | 1. Everything in Docker                                     | 2. Live reload                                    |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Good for   | trying Homeward, or checking a change runs as in production | writing code: changes show in the browser at once |
| You need   | Docker                                                      | Docker, Node 22 and pnpm                          |
| Start with | `docker compose up --build --wait`                          | `pnpm services:up`, then `pnpm dev`               |

Production is different again: see [DEPLOY.md](DEPLOY.md). The table at the end of this page shows how.

## What you need

- **Docker:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) on a Mac or Windows, or Docker Engine with Compose 2.24 or later on Linux. In Docker Desktop's settings, under Resources, give it at least 4 GB of memory.
- **Docker buildx** (recommended): Docker's modern builder, which makes builds faster. Docker Desktop includes it. Without it, Docker says `buildx Docker CLI plugin not found: falling back to the classic builder`, and builds still work, just more slowly. To add it:
  - Mac with Homebrew (for example with Colima): `brew install docker-buildx`, then `mkdir -p ~/.docker/cli-plugins && ln -sfn "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx`
  - Ubuntu or Debian: `sudo apt install docker-buildx-plugin` if you installed Docker from Docker's own repository, or `sudo apt install docker-buildx` if it came from Ubuntu's.
  - Check it worked: `docker buildx version`
- **Git**, to get the code.
- **For live reload, and before you push a change:** Node 22 and pnpm. Install Node from [nodejs.org](https://nodejs.org) (or with `nvm install`, which reads `.nvmrc`), then run `corepack enable`, which brings the right pnpm.
- **On Windows:** use WSL 2, and keep the code inside the Linux file system (for example `~/code`), not under `C:\`.

## First time

```sh
git clone https://github.com/renderghost/at-animal-rescue.git
cd at-animal-rescue
cp .env.example .env
```

`.env` holds your local settings. It works as it is. See [Settings](#settings) for the few you might change.

## 1. Everything in Docker

```sh
docker compose up --build --wait
```

This builds Homeward from your copy of the code, starts the database, brings it up to date, and starts the web app and the indexer. It returns when everything is ready. The first time takes 5 to 10 minutes, while Docker downloads and builds. Later runs take seconds, or a minute or two after a code change.

Then open:

- **Homeward:** http://localhost:3000
- **Emails Homeward sends:** http://localhost:8025. Mailpit catches them all, so nothing leaves your computer.
- **Health:** http://localhost:3000/api/health should say `"status":"ok"`.

Docker keeps running in the background. Everyday commands:

| To                                     | Run                                                 |
| -------------------------------------- | --------------------------------------------------- |
| See what's running                     | `docker compose ps`                                 |
| Watch the logs (Ctrl+C stops watching) | `docker compose logs -f web indexer`                |
| Apply code changes, or a `git pull`    | `docker compose up --build --wait`                  |
| Stop                                   | `docker compose down`                               |
| Start again                            | `docker compose up --wait`                          |
| Start with an empty database           | `docker compose down -v`, then start again          |
| Open a database prompt (`\q` to leave) | `docker compose exec postgres psql -U homeward`     |
| Resync an account from its repository  | `docker compose run --rm indexer backfill <handle>` |

`docker compose down` keeps your data. `docker compose down -v` deletes the local database, which is safe: nothing on your computer is the only copy of anything.

## 2. Live reload

For writing code. The web app and the indexer run on your computer with Node, and reload when you save a file. Docker runs only the database and Mailpit.

```sh
corepack enable
pnpm install
docker compose stop web indexer   # only if option 1 is running, to free port 3000
pnpm services:up                  # the database and Mailpit, in Docker
pnpm db:migrate                   # brings the database up to date
pnpm dev                          # http://localhost:3000
```

Ctrl+C stops `pnpm dev`. `pnpm services:down` stops Docker too. After a `git pull`, run `pnpm install` and `pnpm db:migrate` again.

Before you push a change, run the same checks as CI, with the database running:

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Signing in

Homeward signs in with an AT Protocol account, such as a Bluesky account, and an app password. There's no separate local login, so use a test account:

1. Create a new account at [bsky.app](https://bsky.app) just for testing.
2. In its settings, under Privacy and security, add an app password.
3. Sign in at http://localhost:3000 with the account's handle and that app password.

Good to know:

- **What you publish is real.** Organisation profiles, animals and listings go to the test account's public repository, just as they would from the live site. Keep test data obviously fake, and delete it when you're done.
- **The live site sees it too.** Its indexer reads the same network. Organisations aren't public until a moderator approves them, though, so test organisations only appear in the live site's moderation queue. Reject them there.
- **To try `/admin`,** put the test account's DID in `ADMIN_DIDS` in `.env`. Find the DID by opening `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<handle>`. Then start again: `docker compose up --wait`, or restart `pnpm dev`.

Signing in, and the indexer, need an internet connection.

## Settings

Local settings live in `.env`, copied from `.env.example`. They work as they are; the comments in the file explain each one. Ones you might change:

- `ADMIN_DIDS`, to use `/admin` (see above).
- `WEB_PORT` and `POSTGRES_PORT`, if 3000 or 5432 is taken on your computer. If you change `POSTGRES_PORT`, change the port in `DATABASE_URL` to match.

Docker uses its own addresses for the database and Mailpit, so the same `.env` works for both options. After changing it, run `docker compose up --wait` again, or restart `pnpm dev`.

Never commit `.env`. It's listed in `.gitignore`.

## Local and production

|                         | On your computer                            | In production                                                                       |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Compose file            | `docker-compose.yml`, built from your code  | `deploy/compose.production.yml`, with images built by GitHub                        |
| Settings                | `.env`, from `.env.example`, works as it is | `/opt/homeward/.env`, from `deploy/production.env.example`, checked on every deploy |
| Address                 | http://localhost:3000                       | `https://` and the domain, through Caddy                                            |
| Email                   | caught by Mailpit                           | sent through Scaleway Transactional Email                                           |
| Encryption key          | a public development key                    | your own key, with a copy kept offline                                              |
| Backups, error tracking | none                                        | nightly encrypted backups, and Bugsink                                              |
| Updates                 | `docker compose up --build --wait`          | automatic when a change reaches `main`                                              |

## When something goes wrong

| What you see                                            | What to do                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your settings seem to be ignored                        | Check `.env` exists in the repository's folder (`cp .env.example .env`), and run Docker commands from that folder.                                            |
| `port is already allocated` or `address already in use` | Something else is using 3000, 5432, 1025 or 8025, often another Postgres (Postgres.app or Homebrew). Stop it, or set `WEB_PORT` or `POSTGRES_PORT` in `.env`. |
| `container homeward-indexer-1 is unhealthy`             | The indexer can't reach the network: it needs an internet connection. Homeward itself still works. `docker compose logs indexer` says more.                   |
| `service "migrate" didn't complete successfully`        | Run `docker compose logs migrate`. On a first start the database is sometimes slow: run the command again.                                                    |
| The build stops with `killed` or `exit code: 137`       | Docker ran out of memory. Give it at least 4 GB in Docker Desktop's settings.                                                                                 |
| `buildx Docker CLI plugin not found`                    | Builds still work, more slowly. Install buildx: see [What you need](#what-you-need).                                                                          |
| A warning that the platform `linux/amd64` doesn't match | Expected on Apple Silicon Macs: PostGIS only publishes Intel images, which run through Rosetta. It's harmless.                                                |
| Signing in fails                                        | Use an app password, not the account's password, and check the handle. Your computer needs an internet connection.                                            |
| Your change doesn't show (option 1)                     | Run `docker compose up --build --wait`: without `--build`, Docker runs the code as it was last built.                                                         |
| Errors mentioning `/bin/sh^M` (Windows)                 | The files have Windows line endings. Clone again inside WSL 2.                                                                                                |
| Still stuck                                             | Start completely fresh: `docker compose down -v`, then `docker compose build --no-cache`, then `docker compose up --wait`.                                    |
