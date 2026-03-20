/**
 * @file frontend/src/app/layout.tsx
 * @description 루트 레이아웃 — Outfit 폰트, Material Symbols, 테마 프로바이더
 */
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vector — Collector Management',
  description: 'Equipment Log Collection Monitoring Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>{/* 폰트는 globals.css의 @font-face로 로컬 로드 (오프라인 환경 지원) */}</head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
