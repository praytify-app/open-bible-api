# Stage 1: Base
FROM node:22-alpine3.22 AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Stage 2: Production dependencies only
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Stage 3: Build (needs dev deps for TypeScript)
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Stage 4: Runtime (minimal)
FROM node:22-alpine3.22 AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/package.json ./
COPY --chown=appuser:appgroup drizzle ./drizzle

USER appuser
EXPOSE 3100

CMD ["node", "dist/index.js"]
