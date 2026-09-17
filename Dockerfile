# ---------- Stage 1: Build ----------
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN pnpm build

# ---------- Stage 2: Production ----------
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma 2>/dev/null || true

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nestjs

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main"]
