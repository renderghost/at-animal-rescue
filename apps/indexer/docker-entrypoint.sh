#!/bin/sh
# Entry point of the indexer image (#47): the indexer, migrations, a backfill (#24), a
# re-encryption after a key rotation (#48) or a check of the production settings (#102).
set -e
cd /repo
case "$1" in
  indexer) exec apps/indexer/node_modules/.bin/tsx apps/indexer/src/main.ts ;;
  migrate) exec packages/db/node_modules/.bin/tsx packages/db/src/migrate.ts ;;
  check) exec packages/db/node_modules/.bin/tsx packages/db/src/check-settings.ts ;;
  rotate-keys) exec packages/db/node_modules/.bin/tsx packages/db/src/rotate-keys.ts ;;
  backfill) shift; exec apps/indexer/node_modules/.bin/tsx apps/indexer/src/backfill.ts "$@" ;;
  *) exec "$@" ;;
esac
