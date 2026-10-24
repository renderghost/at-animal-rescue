# Production image for the web app (#47). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t homeward-web .
# Works with BuildKit and with Docker's classic builder (#104).

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
# Dependencies first, from the lockfile alone, so a code change doesn't download them again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
# The whole workspace, so the build has its tooling (TypeScript lives at the root).
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @homeward/web build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    IMAGE_CACHE_DIR=/data/images
WORKDIR /app
# The standalone server with only the files it uses, plus static assets.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p /data/images && chown node:node /data/images
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
