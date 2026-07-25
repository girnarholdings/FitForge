import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { withBase } from '@/lib/utils';
import './globals.css';

/*
 * Self-hosted fonts via next/font/google — downloaded at BUILD time and bundled into the static
 * export (zero runtime network, GitHub-Pages/offline safe). Wired to the CSS vars the "Forged Gold"
 * theme reads: --font-inter (UI/body, variable) and --font-space-grotesk (display, 500/600/700).
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

// Origin only — the /FitForge base path is added per-asset via withBase(); Next does not prefix
// basePath onto metadata icon/OG URLs, so we do it ourselves. Overridable for other deploys.
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zeusnightbolt.github.io';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: 'FitForge — your personal trainer, forged around you.',
    template: '%s · FitForge',
  },
  description:
    'FitForge builds a training plan and nutrition targets from your preferences — equipment, goals, and the exercises you actually enjoy. Free, offline-friendly, and your data stays in your browser.',
  applicationName: 'FitForge',
  manifest: withBase('/site.webmanifest'),
  icons: {
    icon: [
      { url: withBase('/favicon.svg'), type: 'image/svg+xml' },
      { url: withBase('/favicon-32.png'), sizes: '32x32', type: 'image/png' },
    ],
    apple: withBase('/apple-touch-icon.png'),
  },
  openGraph: {
    type: 'website',
    siteName: 'FitForge',
    title: 'FitForge — your personal trainer, forged around you.',
    description:
      'Training plans, macro targets, and a muscle-smart exercise library — free and offline-friendly.',
    images: [{ url: withBase('/og.png'), width: 1200, height: 630, alt: 'FitForge' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FitForge — your personal trainer, forged around you.',
    description:
      'Training plans, macro targets, and a muscle-smart exercise library — free and offline-friendly.',
    images: [withBase('/og.png')],
  },
};

/*
 * `viewportFit: 'cover'` emits `viewport-fit=cover` — REQUIRED for
 * `env(safe-area-inset-*)` to report anything other than 0 on iOS, which every
 * bottom-pinned CTA in the app depends on to clear the home indicator.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0D14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
