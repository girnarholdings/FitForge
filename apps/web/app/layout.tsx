import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { withBase } from '@/lib/utils';
import { MotionProvider } from '@/components/ui/motion';
import { CloudSyncDriver } from '@/components/auth/GoogleAuth';
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

// Origin only — any base path is added per-asset via withBase(); Next does not prefix basePath
// onto metadata icon/OG URLs, so we do it ourselves. Overridable for other deploys. The default
// is the custom domain the Pages site actually serves from (see pages.yml for the fallback
// story if that domain is ever removed).
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://goforge.fit';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: 'FitForge — your personal trainer, forged around you.',
    template: '%s · FitForge',
  },
  // COPY RULE (shared with the landing page): no "offline" claim. There is no service worker, so
  // a cold load needs a connection — the app's own Coach answer says so, and the share cards must
  // not contradict it. "Stays in your browser" is the claim that IS true and is the differentiator.
  description:
    'FitForge builds a training plan and nutrition targets from your preferences — equipment, goals, and the exercises you actually enjoy. Free, no account, and your data never leaves your browser.',
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
      '31 real training programs, 91 coached exercises, macros that match. Free, no account, and your data stays in your browser.',
    images: [{ url: withBase('/og.png'), width: 1200, height: 630, alt: 'FitForge' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FitForge — your personal trainer, forged around you.',
    description:
      '31 real training programs, 91 coached exercises, macros that match. Free, no account, and your data stays in your browser.',
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
  themeColor: '#0B121A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        {/*
          AT THE ROOT, not inside the app shell — this is the fix for two bugs that looked
          unrelated and were the same mistake.

          It used to live in AppShell, which renders on `(app)` routes ONLY, and only AFTER that
          shell's gate has confirmed onboarding is complete. So:

            · a redirect sign-in returning to the LANDING page had nothing mounted to claim it, and
              the credential was silently dropped — you tapped "Continue with Google", came back,
              and were still signed out. Tapping again looked like the remedy; it was just another
              go at the same broken loop.

            · a signed-in user opening FitForge in a NEW browser had no training data locally, so
              the shell sent them to onboarding before the component that restores their account
              had ever mounted. Their plan was sitting in Firestore the whole time.

          Both need auth and sync alive on every route, including the ones outside the shell. It
          renders nothing, and is inert on builds with no Firebase project.
        */}
        <CloudSyncDriver />
        {/* One motion context for the whole app: the lazy DOM feature bundle plus the global
            reduced-motion contract, so no individual component has to remember either. */}
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
