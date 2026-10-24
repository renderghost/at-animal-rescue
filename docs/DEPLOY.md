# Deploying Homeward

Homeward runs on one server at Scaleway in Paris (#47). Everything stays in the EU: the server, the database and its backups. Email (Scaleway Transactional Email) and monitoring come with #48.

## What runs

`deploy/compose.production.yml` runs these, from `/opt/homeward` on the server:

| Service    | What it does                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `caddy`    | HTTPS with automatic Let's Encrypt certificates, in front of the web app (`deploy/Caddyfile`). |
| `web`      | The Next.js app (`ghcr.io/renderghost/homeward-web`). Resized photos are cached in a volume.   |
| `indexer`  | Follows Jetstream into the index (`ghcr.io/renderghost/homeward-indexer`).                     |
| `migrate`  | Runs database migrations once per deploy, before `web` and `indexer` start.                    |
| `postgres` | Postgres 17 with PostGIS. Not reachable from outside the server.                               |
| `backup`   | Nightly encrypted dumps to Scaleway Object Storage (`ghcr.io/renderghost/homeward-backup`).    |
| `umami`    | Optional cookie-free analytics (#46), only with `--profile analytics`.                         |

Images are built by GitHub Actions and stored in GitHub Container Registry. They hold code only, never personal data. Every merge to `main` that passes CI builds them, tagged `sha-<commit>` and `latest`, and deploys them.

## Setting up the server (once)

### 1. Scaleway

1. Create a project for Homeward, in the `fr-par` region.
2. Create an Instance: Ubuntu 24.04, at least 2 vCPUs and 4 GB of memory (for example `PLAY2-MICRO` or `DEV1-M`), with an IPv4 and an IPv6 address and your SSH key.
3. Give it a security group that allows inbound TCP 22 (only from your own address if you can), TCP 80, TCP 443 and UDP 443. Drop everything else.
4. Create a **private** Object Storage bucket, `homeward-backups`, in `fr-par`.
5. In IAM, create an application with an API key that can only write to that bucket. Its access key and secret key go in `.env` later.

### 2. DNS

Point an `A` and an `AAAA` record for Homeward's domain at the Instance. Caddy gets the certificate on first start.

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

Copy `deploy/production.env.example` to `/opt/homeward/.env` and fill it in. Never commit it. It holds:

- `DOMAIN`, `SITE_URL` and `ACME_EMAIL`.
- `POSTGRES_PASSWORD`: generate it with `openssl rand -base64 32`.
- `PRIVATE_STORE_KEYS` and `PRIVATE_STORE_ACTIVE_KEY`: generate with `openssl rand -base64 32`. **Keep a copy offline with the backup key.** Without these, private data can't be read, even from a backup.
- `ADMIN_DIDS`, `SMTP_URL` and `EMAIL_FROM` (#48).
- `BACKUP_AGE_RECIPIENTS`, and the `RCLONE_CONFIG_BACKUP_*` keys from step 1.5.

### 6. First start

Copy `deploy/compose.production.yml` and `deploy/Caddyfile` to `/opt/homeward`, then start the stack:

```sh
cd /opt/homeward
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps        # everything running, migrate exited 0
docker compose -f compose.production.yml run --rm backup once   # check a backup reaches the bucket
```

Open `https://<domain>/` to check it works.

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
4. runs migrations
5. restarts the app
6. checks that the site answers

If migrations fail, the running version stays up and the workflow fails.

### 8. Analytics (optional, #46)

```sh
docker compose -f compose.production.yml exec postgres createdb -U homeward umami
cp sites/analytics.caddy.example sites/analytics.caddy   # from deploy/sites/
# Set ANALYTICS_DOMAIN and UMAMI_APP_SECRET (openssl rand -base64 32) in .env, then:
docker compose -f compose.production.yml --profile analytics up -d
```

Log in to Umami at `https://<analytics domain>/` (it starts as `admin` / `umami`, so change that straight away). Add the website, then set `UMAMI_SCRIPT_URL` (`https://<analytics domain>/script.js`) and `UMAMI_WEBSITE_ID` in `.env` and run `up -d` again.

## Everyday

- **Deploys** happen on merge. Watch them under Actions → "Images and deploy".
- **Rolling back:** on the server, run `IMAGE_TAG=sha-<earlier commit> docker compose -f compose.production.yml up -d`. Migrations only ever move forwards, and lexicons and schema changes are backwards compatible, so an older app runs on a newer database. Check the migration list first if the change was large.
- **Changing settings:** edit `/opt/homeward/.env`, then run `docker compose -f compose.production.yml up -d`.
- **Logs:** `docker compose -f compose.production.yml logs -f web indexer`.

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
