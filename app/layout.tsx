import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

// IDs and references only (student numbers, APP-2026-0001).
const plexCode = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'ClearGate', template: '%s · ClearGate' },
  description: 'End-of-term student clearance: each office marks its part, students send what is still needed.',
  applicationName: 'ClearGate',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#f3f5f8',
  width: 'device-width',
  initialScale: 1,
};

// Applies the saved theme before first paint (a fixed string; no user data).
const THEME_SCRIPT =
  "try{if(localStorage.getItem('cg-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');var m=document.querySelector('meta[name=\"theme-color\"]');if(m)m.setAttribute('content','#0f1012')}}catch(e){}";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexCode.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className={
            'absolute left-2 -top-16 z-200 px-3 py-2 rounded-control bg-ink text-ink-text font-medium ' +
            'focus:top-2 focus:no-underline print:hidden!'
          }
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
