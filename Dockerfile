FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/ 2>/dev/null || true
RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

# ── Build ──────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm --filter @workspace/api-server exec prisma generate
RUN pnpm --filter @workspace/api-server run build

# ── Production ─────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Only copy production artifacts
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/prisma ./prisma
COPY --from=builder /app/artifacts/api-server/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Prisma client location (relative to node_modules)
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm 2>/dev/null || true

RUN addgroup -S capto && adduser -S capto -G capto
USER capto

EXPOSE 8080
ENV PORT=8080

CMD ["node", "dist/main.js"]
