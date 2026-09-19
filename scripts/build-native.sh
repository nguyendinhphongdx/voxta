#!/usr/bin/env bash
# Build production chạy TRỰC TIẾP trên máy (không qua Docker) — dùng khi muốn voxta có PATH/
# Keychain/session y hệt terminal thật của bạn (né hẳn vấn đề Keychain gặp phải khi Claude Code
# chạy qua SSH từ trong container, xem lịch sử trò chuyện).
#
# `next build` với `output: 'standalone'` (next.config.ts) chỉ tự copy node_modules đã trace được
# vào `.next/standalone/` — KHÔNG tự copy `public/` và `.next/static/` (đúng theo tài liệu Next.js),
# nên phải copy tay 2 thư mục đó vào đúng vị trí `.next/standalone/` mong đợi trước khi chạy được
# `node .next/standalone/server.js` độc lập, không cần `node_modules` gốc hay `next start` nữa.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

pnpm install --frozen-lockfile
pnpm build

rm -rf .next/standalone/public .next/standalone/.next/static
cp -R public .next/standalone/public
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static

echo ""
echo "Build xong. Chạy thử (PHẢI đứng ở đúng thư mục repo — server.js đọc/ghi data/voxta.db theo"
echo "process.cwd(), không phải theo vị trí file server.js):"
echo "  cd $REPO_ROOT && PORT=3000 node .next/standalone/server.js"
echo ""
echo "Cài thành LaunchAgent (tự chạy cùng lúc đăng nhập, tự restart nếu crash):"
echo "  ./scripts/install-native-service.sh"
