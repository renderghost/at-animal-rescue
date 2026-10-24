# Production image for the indexer (#47), which also runs database migrations.
# Build from the repository root:
#   docker build -f apps/indexer/Dockerfile -t homeward-indexer .
#
#   default command   the indexer
#   migrate           docker run ... homeward-indexer migrate

FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY . .
# The workspace packages run as TypeScript through tsx, so their dev tooling comes along.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod=false --filter @homeward/indexer... \
    && chown -R node:node /repo
COPY --chmod=755 apps/indexer/docker-entrypoint.sh /usr/local/bin/homeward
USER node
ENTRYPOINT ["homeward"]
CMD ["indexer"]
