import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Build ra `.next/standalone` — chỉ copy đúng node_modules mà server thật sự cần (Next.js tự
  // trace dependency), image Docker gọn hơn nhiều so với copy nguyên node_modules đầy đủ.
  output: 'standalone',
  // better-sqlite3 có native binding (.node binary) — mặc định Turbopack cố "externalize" nó bằng
  // 1 tên module hash gắn CỨNG với đúng vị trí trong node_modules lúc build (cấu trúc lồng nhau
  // của pnpm). Copy `.next/standalone` sang cài qua `npm install -g` (cấu trúc node_modules PHẲNG,
  // khác hẳn pnpm) khiến tên hash đó không khớp gì cả — lỗi "Cannot find module
  // 'better-sqlite3-<hash>'" (đã tái hiện thật). Khai rõ package này ở đây để Next.js `require()`
  // thẳng theo cách Node resolution bình thường lúc chạy, không cố bundle/hash gì cả.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
