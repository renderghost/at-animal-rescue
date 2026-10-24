#!/bin/sh
# Entry point of the indexer image (#47): the indexer or migrations.
set -e
cd /repo
case "$1" in
  indexer) exec apps/indexer/node_modules/.bin/tsx apps/indexer/src/main.ts ;;
  migrate) exec packages/db/node_modules/.bin/tsx packages/db/src/migrate.ts ;;
  *) exec "$@" ;;
esac
