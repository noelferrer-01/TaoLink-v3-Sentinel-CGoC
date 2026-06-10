import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Mono kept via next/font for self-hosted optimisation (codes / labels / tags).
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--ff-mono',
  display: 'swap',
});

// Display + body both use Stack Sans Text — loaded via Google Fonts stylesheet
// because Next.js 15's bundled next/font/google catalog predates this family.
// --ff-display and --ff-body are set in globals.css :root to point at it.

export const metadata: Metadata = {
  title: 'Sentinel',
  description: 'TaoLink v3 — Sentinel — HRIS + payroll for Commander Group of Companies.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={plexMono.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Stack+Sans+Text:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
