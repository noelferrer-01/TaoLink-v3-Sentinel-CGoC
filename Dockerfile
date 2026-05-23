# Sentinel — multi-stage Dockerfile (dev + prod targets)
# Same image base across local + prod per ADR 0008.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app

# -------- dev --------
FROM base AS dev
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

# -------- builder --------
FROM base AS builder
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# -------- prod --------
FROM node:20-alpine AS prod
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "server.js"]
