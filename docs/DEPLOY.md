# Deploying Homeward

Homeward runs on one server at Scaleway in Paris (#47), watched by a small second server in another zone (#48). Everything stays in the EU:

- the servers, the database and its backups
- email, through Scaleway Transactional Email
- error reports, in Bugsink on our own server
- uptime checks, from Uptime Kuma on the second server

To run Homeward on your own computer instead, see [LOCAL.md](LOCAL.md).

## What runs

`deploy/compose.production.yml` runs these, from `/opt/homeward` on the server:

| Service    | What it does                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `caddy`    | HTTPS with automatic Let's Encrypt certificates, in front of the web app (`deploy/Caddyfile`). |
| `web`      | The Next.js app (`ghcr.io/renderghost/homeward-web`). Resized photos are cached in a volume.   |
| `indexer`  | Follows Jetstream into the index (`ghcr.io/renderghost/homeward-indexer`).                     |
| `check`    | Checks `.env` on every deploy. A mistake stops the deploy here, before anything changes.       |
| `migrate`  | Runs database migrations once per deploy, after `check` and before `web` and `indexer` start.  |
| `postgres` | Postgres 17 with PostGIS. Not reachable from outside the server.                               |
| `backup`   | Nightly encrypted dumps to Scaleway Object Storage (`ghcr.io/renderghost/homeward-backup`).    |
| `bugsink`  | Error tracking (#48) at its own address. The web app and indexer report errors to it.          |
| `umami`    | Optional cookie-free analytics (#46), only with `--profile analytics`.                         |

`deploy/monitor/compose.yml` runs Uptime Kuma, behind its own Caddy, on the second server.

Images are built by GitHub Actions and stored in GitHub Container Registry. They hold code only, never personal data. Every merge to `main` that passes CI builds them, tagged `sha-<commit>` and `latest`, and deploys them.

## Setting up the server (once)

### 1. Scaleway

1. Create a project for Homeward, in the `fr-par` region.
2. Create an Instance: Ubuntu 24.04, at least 2 vCPUs and 4 GB of memory (for example `PLAY2-MICRO` or `DEV1-M`), with an IPv4 and an IPv6 address and your SSH key.
3. Give it a security group that allows inbound TCP 22 (only from your own address if you can), TCP 80, TCP 443 and UDP 443. Drop everything else.
4. Create a **private** Object Storage bucket, `homeward-backups`, in `fr-par`.
5. In IAM, create an application with an API key that can only write to that bucket. Its access key and secret key go in `.env` later.
6. In Transactional Email, add Homeward's domain. Add the SPF, DKIM and DMARC records the console shows to your DNS, and wait until it says the domain is verified. Mail from an unverified domain isn't sent.
7. In IAM, create an application with an API key that can only send through Transactional Email. Its secret key, and the project's ID, go in `.env` as `TEM_SECRET_KEY` and `TEM_PROJECT_ID`.
8. Create a second, small Instance for monitoring, for example `STARDUST1-S` or `DEV1-S`, in **another zone** such as `nl-ams-1`. A monitor on the same machine can't tell you that machine is down.

### 2. DNS

Point `A` and `AAAA` records at the servers. Caddy gets each certificate on first start.

| Name                           | Points at               |
| ------------------------------ | ----------------------- |
| `DOMAIN` (Homeward itself)     | the main Instance       |
| `ERRORS_DOMAIN` (Bugsink)      | the main Instance       |
| `MONITOR_DOMAIN` (Uptime Kuma) | the monitoring Instance |

### 3. The server

```sh
# As root on the Instance.
apt update && apt full-upgrade -y && apt install -y unattended-upgrades
curl -fsSL https://get.docker.com | sh   # Docker Engine and the compose plugin
adduser --disabled-password --gecos '' deploy && usermod -aG docker deploy
install -d -o deploy -g deploy /opt/homeward /opt/homeward/sites
# Copy your SSH public key, and the deploy key's (step 7), to /home/deploy/.ssh/authorized_keys.
```

As `deploy`, log in to GitHub Container Registry with a token that can only read packages:

```sh
docker login ghcr.io -u <github-user>   # paste a token with the read:packages scope
```

### 4. Backup keys

Backups are encrypted to [age](https://age-encryption.org) public keys. The server holds only the public keys, so it can't read its own backups.

On your own computer, make a key and keep the file in your password manager:

```sh
age-keygen -o homeward-backup.key   # prints the public key: age1...
```

Add a second person's public key too, so losing one key doesn't lose the backups.

### 5. Settings

Copy `deploy/compose.production.yml` and `deploy/Caddyfile` to `/opt/homeward`, and `deploy/production.env.example` to `/opt/homeward/.env`. Make `.env` readable by `deploy` only, and never commit it:

```sh
chmod 600 /opt/homeward/.env
```

Fill in every setting marked `[required]`. The template says what each one is, and gives the command that makes each secret:

- `DOMAIN`, `SITE_URL` (`https://` and the domain) and `ACME_EMAIL`.
- `POSTGRES_PASSWORD`: `openssl rand -hex 32`. Letters and digits only, because it goes into the database address.
- `PRIVATE_STORE_KEYS`: `echo "k1:$(openssl rand -base64 32)"`, with `PRIVATE_STORE_ACTIVE_KEY=k1`. **Keep a copy offline with the backup key.** Without it, private data can't be read, even from a backup.
- `ADMIN_DIDS`: the moderators' DIDs. To find the DID of an account, open `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<handle>`.
- `TEM_PROJECT_ID`, `TEM_SECRET_KEY` and `EMAIL_FROM` from step 1.7. `EMAIL_FROM` must be on the verified domain.
- `ERRORS_DOMAIN` and `BUGSINK_SECRET_KEY` (`openssl rand -base64 50`). `SENTRY_DSN_WEB` and `SENTRY_DSN_INDEXER` stay empty until step 6.
- `BACKUP_AGE_RECIPIENTS` from step 4, separated by spaces, and the `RCLONE_CONFIG_BACKUP_*` keys from step 1.5.

Then check your work. It lists anything missing or wrong, in plain words, and changes nothing:

```sh
cd /opt/homeward
docker compose -f compose.production.yml run --rm check
```

Fix what it reports and run it again, until it says `Settings checked.` Warnings don't stop anything, but are worth fixing.

### 6. First start

Start the stack:

```sh
cd /opt/homeward
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps        # everything running; check and migrate exited 0
docker compose -f compose.production.yml run --rm backup once   # check a backup reaches the bucket
```

Open `https://<domain>/` to check it works, and `https://<domain>/api/health`, which should say `"status":"ok"`.

Then set up error tracking:

```sh
docker compose -f compose.production.yml exec bugsink bugsink-manage createsuperuser
```

1. Sign in at `https://<errors domain>/`.
2. Create a team, then two projects, `web` and `indexer`.
3. Copy each project's DSN into `.env` as `SENTRY_DSN_WEB` and `SENTRY_DSN_INDEXER`, and run `up -d` again.
4. Turn on email alerts for new issues in each project.

Error reports carry the error, its stack trace and the route, never cookies, headers, request bodies, query strings or user details. They're kept for 90 days.

### 7. Automatic deploys

Deploys run from GitHub Actions over SSH (`.github/workflows/deploy.yml`):

1. Make a deploy key with `ssh-keygen -t ed25519 -f homeward-deploy -N ''`. Add `homeward-deploy.pub` to `/home/deploy/.ssh/authorized_keys`.
2. In the repository's settings, create an environment called `production` with:
   - variables `DEPLOY_HOST` (the server's address), `DEPLOY_USER` (`deploy`) and `DEPLOY_DOMAIN` (the domain)
   - secrets `DEPLOY_SSH_KEY` (the contents of `homeward-deploy`) and `DEPLOY_KNOWN_HOSTS` (the output of `ssh-keyscan -t ed25519 <server>`)

   You can add required reviewers to the environment if you'd like to approve each deploy.

3. Add a repository variable `DEPLOY_ENABLED` set to `true`.

From then on, every merge to `main` that passes CI does the following:

1. builds the images and pushes them to GHCR
2. copies the compose file and Caddyfile to the server
3. pulls the new images
4. checks `.env`
5. runs migrations
6. restarts the app
7. checks `/api/health` says the site, database and indexer are up

If the check or the migrations fail, the running version stays up and the workflow fails. The workflow's log says why.

### 8. Analytics (optional, #46)

```sh
docker compose -f compose.production.yml exec postgres createdb -U homeward umami
cp sites/analytics.caddy.example sites/analytics.caddy   # from deploy/sites/
# Set ANALYTICS_DOMAIN and UMAMI_APP_SECRET (openssl rand -base64 32) in .env, then:
docker compose -f compose.production.yml --profile analytics up -d
```

Log in to Umami at `https://<analytics domain>/` (it starts as `admin` / `umami`, so change that straight away). Add the website, then set `UMAMI_SCRIPT_URL` (`https://<analytics domain>/script.js`) and `UMAMI_WEBSITE_ID` in `.env` and run `up -d` again.

### 9. Uptime monitoring

On the monitoring Instance, install Docker as in step 3, then:

```sh
install -d -o deploy -g deploy /opt/monitor
# Copy deploy/monitor/compose.yml and deploy/monitor/Caddyfile to /opt/monitor, and create
# /opt/monitor/.env with MONITOR_DOMAIN and ACME_EMAIL.
cd /opt/monitor && docker compose up -d
```

Open `https://<monitor domain>/` and create the admin account. Then add:

1. **Email notifications** through Transactional Email: SMTP host `smtp.tem.scaleway.com`, port 465, TLS, with the project ID as the username and the secret key as the password. Make this the default notification.
2. **Homeward**: an HTTP(s) keyword monitor on `https://<domain>/api/health`, with keyword `"status":"ok"` and a 60-second interval. It fails if the site, the database or the indexer is down. Turn on certificate expiry alerts.
3. **Errors**: an HTTP(s) monitor on `https://<errors domain>/`, every 5 minutes.
4. **Nightly backup**: a Push monitor with a heartbeat interval of 25 hours. Put its push URL in the main server's `.env` as `BACKUP_HEARTBEAT_URL`, then run `docker compose -f compose.production.yml up -d backup`. Run `backup once` to check the heartbeat arrives.

## Everyday

- **Deploys** happen on merge. Watch them under Actions → "Images and deploy".
- **Rolling back:** on the server, run `IMAGE_TAG=sha-<earlier commit> docker compose -f compose.production.yml up -d`. Migrations only ever move forwards, and lexicons and schema changes are backwards compatible, so an older app runs on a newer database. Check the migration list first if the change was large.
- **Changing settings:** edit `/opt/homeward/.env`, run `docker compose -f compose.production.yml run --rm check`, then `docker compose -f compose.production.yml up -d`.
- **Logs:** `docker compose -f compose.production.yml logs -f web indexer`.
- **Errors:** Bugsink emails each new issue. The list is at `https://<errors domain>/`.
- **Health:** `https://<domain>/api/health` says whether the database and the indexer are up. Uptime Kuma checks it every minute.
- **After an outage:** if the indexer was down, or an account's listings look out of date, resync from the accounts' repositories (#24). Use `--known` for every organisation in the index, or name the accounts:

  ```sh
  docker compose -f compose.production.yml run --rm indexer backfill --known
  docker compose -f compose.production.yml run --rm indexer backfill hillfarm.example.org
  ```

## When something goes wrong

Start with `docker compose -f compose.production.yml ps`, which shows what's running, and the logs of whatever isn't. In the commands below, `dc` is short for `docker compose -f compose.production.yml`. To make it a real shortcut, add `alias dc='docker compose -f /opt/homeward/compose.production.yml'` to `~/.bashrc`.

| What you see                                                      | What to do                                                                                                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A deploy fails with `service "check" didn't complete`             | A setting in `.env` is missing or wrong. Run `dc run --rm check`, fix what it lists, and re-run the workflow. The site kept running the previous version.      |
| `required variable ... is missing a value`                        | That setting is empty in `.env`. Fill it in.                                                                                                                   |
| A deploy fails with `service "migrate" didn't complete`           | Run `dc logs migrate`. The site kept running the previous version. Raise an issue with the log if the cause isn't clear.                                       |
| The site doesn't load, or the browser warns about the certificate | Check the domain's DNS points at the server, and that ports 80 and 443 are open in the security group. Then `dc logs caddy`: it says why a certificate failed. |
| `502 Bad Gateway`                                                 | The web app isn't up. Run `dc ps` and `dc logs web`.                                                                                                           |
| `/api/health` says `"indexer":"down"`                             | Run `dc logs indexer`. It reconnects to Jetstream by itself; if it was down for long, run a backfill (see "Everyday").                                         |
| Emails don't arrive                                               | Check the domain is verified in Transactional Email and `EMAIL_FROM` is on it. `dc logs web` shows sending errors.                                             |
| The backup heartbeat alert fires                                  | Run `dc run --rm backup once` and read its output: usually the bucket keys, or the age recipients.                                                             |
| The disk is full                                                  | `docker system df` shows what's using it. `docker image prune -a` removes old images that no container uses.                                                   |

## Backups

- **When:** every night at `BACKUP_HOUR` (03:00 UTC by default).
- **What:** a `pg_dump` of the whole database in custom format, encrypted with age. This covers the index, the private store, private photos, sessions, share links and moderation.
- **Where:** `homeward-backups` in Paris, under `daily/`, `weekly/` (Sundays) and `monthly/` (the 1st).
- **How long:** 7 daily, 4 weekly and 6 monthly copies.
- The photo cache isn't backed up: it rebuilds itself from the PDSes.

### Restoring

Practise this every few months on a scratch database, so a real restore isn't the first one.

```sh
# On your computer: fetch a backup (or download it from the Scaleway console) and decrypt it.
rclone copy backup:homeward-backups/daily/homeward-2026-10-24.dump.age .
age -d -i homeward-backup.key homeward-2026-10-24.dump.age > homeward.dump
pg_restore --list homeward.dump | head          # check it's readable

# On the server: stop the app, restore, start again.
docker compose -f compose.production.yml stop web indexer backup
docker compose -f compose.production.yml exec -T postgres \
  pg_restore -U homeward -d homeward --clean --if-exists --no-owner < homeward.dump
docker compose -f compose.production.yml up -d
```

The restored private data can only be read with the `PRIVATE_STORE_KEYS` that were in use when the backup was made.

## Secrets

Production secrets live in two places only:

- `/opt/homeward/.env` on the server (owned by `deploy`, mode 600)
- the `production` environment in GitHub, for deploys

Both operators keep a copy of each in a shared password-manager vault. Secrets never go in git, chat, issues or email.

| Secret                                        | Lives in                     | Offline copy               | To rotate                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`                           | `.env`                       | Vault                      | Make one with `openssl rand -hex 32`. `docker compose exec postgres psql -U homeward -c "ALTER USER homeward PASSWORD '…'"`, then update `.env` and `up -d`.                                                                                     |
| `PRIVATE_STORE_KEYS`                          | `.env`                       | Vault, with the backup key | Add a new `id:key`, make it `PRIVATE_STORE_ACTIVE_KEY`, `up -d`, then `docker compose run --rm migrate rotate-keys`. When it reports no failures, wait 30 days (the longest session) and remove the old key. Old backups still need the old key. |
| `TEM_SECRET_KEY`                              | `.env`                       | Vault                      | Create a new IAM key with the same rights, update `.env`, `up -d`, delete the old key.                                                                                                                                                           |
| `RCLONE_CONFIG_BACKUP_*`                      | `.env`                       | Vault                      | As for TEM, with the bucket-only key.                                                                                                                                                                                                            |
| age backup key                                | Offline only                 | Two people's vaults        | Make a new key and add its public key to `BACKUP_AGE_RECIPIENTS`. Keep the old private key until the last backup made with it has expired (6 months).                                                                                            |
| `BUGSINK_SECRET_KEY`, `UMAMI_APP_SECRET`      | `.env`                       | Vault                      | New value, `up -d`. People signed in to those tools sign in again.                                                                                                                                                                               |
| `DEPLOY_SSH_KEY`                              | GitHub `production`          | Not needed                 | New key pair; replace it in `authorized_keys` and in GitHub.                                                                                                                                                                                     |
| GHCR read token                               | `docker login` on the server | Not needed                 | New token with `read:packages`, then `docker login ghcr.io` again.                                                                                                                                                                               |
| Admin passwords (Bugsink, Uptime Kuma, Umami) | Each tool                    | Vault                      | Change in the tool.                                                                                                                                                                                                                              |

Rotate any secret at once if it may have leaked, and each time an operator leaves.
