# Stage 1: Base
# Minor and Alpine release pinned so rebuilds are reproducible; bump deliberately.
FROM node:24.21-alpine3.24 AS base
# Node 24 still bundles corepack (Node 25+ does not). The pnpm version comes
# from the packageManager field in package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app

# Stage 2: Production dependencies only
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Stage 3: Build (needs dev deps for TypeScript)
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Stage 4: Runtime (minimal)
FROM node:24.21-alpine3.24 AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
ENV NODE_ENV=production

# Code stays root-owned: the app never writes to its own tree, so a
# compromised process should not be able to rewrite dist/ or node_modules/.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY drizzle ./drizzle

# The one writable path: the seeder caches eBible downloads here.
RUN mkdir -p /app/.cache && chown appuser:appgroup /app/.cache

USER appuser
EXPOSE 3100

CMD ["node", "dist/index.js"]
