import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

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
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#0b0d10',
          color: '#e6e6e6',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
