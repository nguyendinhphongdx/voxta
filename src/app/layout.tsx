import { Geist } from 'next/font/google';
import { cn } from 'cn';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'voxta',
  icons: { icon: '/favicon.svg' },
};

// voxta là app 1 người dùng, luôn tối — không có toggle sáng/tối (force class "dark" thay vì
// theo prefers-color-scheme của hệ thống).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={cn('dark font-sans', geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
