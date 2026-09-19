import { Geist } from 'next/font/google';
import { cn } from 'cn';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

import { OtpPromptDialog } from '../features/conversation/components/otp-prompt-dialog';
import { RegisterServiceWorker } from './register-service-worker';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'voxta',
  description: 'Voice-first client cho các agent platform tự host',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  // iOS bỏ qua phần lớn manifest.webmanifest (chỉ Android/Chrome đọc đầy đủ) — cần khai riêng các
  // meta tag apple-* này để "Thêm vào MH Chính" chạy standalone (không thanh URL) thay vì mở lại
  // Safari mỗi lần, xem thêm `viewport` bên dưới (viewportFit: 'cover' để tràn viền notch).
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'voxta',
  },
  // Next.js chỉ tự phát `mobile-web-app-capable` (chuẩn mới, iOS 16.4+ mới nhận) — thêm tay bản
  // `apple-` cho iOS cũ hơn, nếu không "Thêm vào MH Chính" sẽ mở lại Safari có thanh URL thay vì
  // standalone.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// voxta là app 1 người dùng, luôn tối — không có toggle sáng/tối (force class "dark" thay vì
// theo prefers-color-scheme của hệ thống).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={cn('dark font-sans', geist.variable)}>
      <body>
        {children}
        <OtpPromptDialog />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
