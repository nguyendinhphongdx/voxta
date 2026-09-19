#!/usr/bin/env bash
# Bước dọn sau `next build` (output: 'standalone') — dùng chung cho local test, CI publish lên
# npm, và trước đây từng lặp lại y hệt ở build-native.sh + build-npm-package.sh (đã gộp thành 1).
#
# `next build` chỉ tự copy node_modules đã trace được vào `.next/standalone/` — KHÔNG tự copy
# `public/`/`.next/static/` (đúng theo tài liệu Next.js).
#
# Bug thật đã verify tay trong Next.js/Turbopack (không phải do repo này): với native module như
# better-sqlite3, Turbopack "externalize" bằng 1 tên module HASH riêng (vd
# "better-sqlite3-bfc5648742806807", khác hẳn tên gói thật "better-sqlite3") và GHI THẲNG tên hash
# đó vào file trace `*.nft.json` — nhưng bước tự copy file sang `.next/standalone/` của Next.js lại
# KHÔNG tạo file/thư mục đúng tên hash đó, dù chính nó vừa ghi ra trace yêu cầu có file đó. Kết quả:
# `require('better-sqlite3-<hash>')` lúc chạy standalone luôn "Cannot find module". Hash này gắn
# với build cụ thể (đổi giữa các lần build khác máy/khác path) nên KHÔNG hardcode — tự dò từ chính
# `*.nft.json` của build hiện tại rồi tạo bản copy thật (không symlink — xem bên dưới) vào đúng tên
# đó.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -d .next/standalone ]; then
  echo "Chưa có .next/standalone — chạy 'pnpm build' trước." >&2
  exit 1
fi

rm -rf .next/standalone/public .next/standalone/.next/static
cp -R public .next/standalone/public
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static

# Lấy bản gốc từ node_modules/.pnpm CỦA REPO (đầy đủ prebuilds mọi nền tảng), KHÔNG lấy từ
# .next/standalone/node_modules/.pnpm — bản đó là chính bản Next.js đã tự trace/copy, và trace này
# tự nó đã thiếu sẵn 1 số file .node theo nền tảng (vd đã tái hiện thật: thiếu darwin-arm64.node dù
# máy build là Apple Silicon) nên dùng làm nguồn "real" thì chỉ copy lại đúng cái thiếu đó.
REAL_DIR=$(find node_modules/.pnpm -maxdepth 1 -iname "better-sqlite3@*" 2>/dev/null | head -1)
if [ -n "$REAL_DIR" ]; then
  HASHED_NAMES=$(grep -rhoE "better-sqlite3-[a-f0-9]+" .next/standalone/.next/server --include="*.nft.json" 2>/dev/null | sort -u || true)
  for name in $HASHED_NAMES; do
    # Luôn ghi đè bằng bản gốc đầy đủ, kể cả khi Next.js đã tự tạo sẵn thư mục này (thư mục đó
    # chính là bản thiếu file cần fix).
    rm -rf ".next/standalone/node_modules/$name"
    # COPY thật, KHÔNG symlink — `npm pack`/`publish` âm thầm bỏ qua mọi symlink lúc đóng gói
    # tarball (đã tái hiện thật: symlink còn nguyên trên đĩa nhưng biến mất trong .tgz, khiến bản
    # cài global lại lỗi y hệt dù build local chạy đúng). Tốn thêm vài MB nhưng sống sót qua pack.
    cp -R "$REAL_DIR/node_modules/better-sqlite3" ".next/standalone/node_modules/$name"
    echo "Đã tạo node_modules/$name (fix bug trace/copy thiếu module native của Next.js)."
  done
fi

echo "Sẵn sàng: .next/standalone/server.js"
