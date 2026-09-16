'use client';

import { useEffect } from 'react';

/** Đăng ký `public/sw.js` — điều kiện để trình duyệt/iOS coi voxta là PWA "installable". Không
 * làm gì thêm ngoài đăng ký (không cần biết trạng thái, không cần UI) nên tách riêng khỏi layout
 * chính, chỉ render `null`. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Không có gì để làm nếu đăng ký thất bại — app vẫn chạy bình thường, chỉ mất tính năng
        // "installable"/cache app-shell, không phải lỗi chặn đường.
      });
    }
  }, []);

  return null;
}
