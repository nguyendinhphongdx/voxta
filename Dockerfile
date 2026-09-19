# syntax=docker/dockerfile:1

# Debian slim (không phải Alpine) — better-sqlite3 build từ source cần glibc + toolchain quen
# thuộc hơn, ít bất ngờ hơn musl của Alpine.
FROM node:22-bookworm-slim AS base
RUN corepack enable

# ---- deps: cài dependencies, kể cả compile native better-sqlite3 ----
FROM base AS deps
WORKDIR /app
# python3/make/g++ chỉ cần lúc cài (better-sqlite3 build từ source nếu không có prebuilt binary
# khớp nền tảng) — không nằm trong image runtime cuối cùng, không làm phình image chạy thật.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder: build Next.js production ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- runner: image chạy thật, tối giản ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# tmux + openssh-client: cho backend "Terminal Agent (tmux)" điều khiển terminal máy khác qua lệnh
# `ssh user@host` (xem src/lib/tmux-agent.ts). Backend "Claude Code" cần `claude` CLI cài + đăng
# nhập riêng (tài khoản cá nhân) — KHÔNG bundle được ở đây, tự cài thêm trong container nếu cần
# dùng backend đó (vd sửa Dockerfile này hoặc `docker compose exec` cài tay).
RUN apt-get update && apt-get install -y --no-install-recommends tmux openssh-client \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs --home /home/voxta --shell /bin/bash voxta \
  && mkdir -p /home/voxta/.ssh && chown -R voxta:nodejs /home/voxta
ENV HOME=/home/voxta

COPY --from=builder /app/public ./public
COPY --from=builder --chown=voxta:nodejs /app/.next/standalone ./
COPY --from=builder --chown=voxta:nodejs /app/.next/static ./.next/static

# SQLite settings (src/lib/db.ts) nằm ở đây — mount volume vào đúng path này để dữ liệu sống sót
# qua các lần recreate container.
RUN mkdir -p /app/data && chown voxta:nodejs /app/data

USER voxta
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
