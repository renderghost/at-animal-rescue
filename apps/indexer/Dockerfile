# Production image for the indexer (#47), which also runs migrations and backfill (#24).
# Build from the repository root:
#   docker build -f apps/indexer/Dockerfile -t homeward-indexer .
# Works with BuildKit and with Docker's classic builder (#104).
#
#   default command   the indexer
#   migrate           docker run ... homeward-indexer migrate
#   check             docker run --env-file .env ... homeward-indexer check   (production .env)
#   backfill          docker run ... homeward-indexer backfill <handle-or-did>... | --known

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# Dependencies first, from the lockfile alone, so a code change doesn't download them again.
# Fetched in their own folder, which would otherwise hold every workspace's packages.
WORKDIR /deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
WORKDIR /repo
COPY . .
# The workspace packages run as TypeScript through tsx, so their dev tooling comes along.
RUN pnpm install --frozen-lockfile --offline --prod=false --filter @homeward/indexer...

# Only the installed workspace: the package store stays behind in the build stage.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
COPY --from=build --chown=node:node /repo /repo
COPY apps/indexer/docker-entrypoint.sh /usr/local/bin/homeward
RUN chmod 755 /usr/local/bin/homeward
USER node
ENTRYPOINT ["homeward"]
CMD ["indexer"]
