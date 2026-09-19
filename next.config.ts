import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Build ra `.next/standalone` — chỉ copy đúng node_modules mà server thật sự cần (Next.js tự
  // trace dependency), image Docker gọn hơn nhiều so với copy nguyên node_modules đầy đủ.
  output: 'standalone',
};

export default nextConfig;
