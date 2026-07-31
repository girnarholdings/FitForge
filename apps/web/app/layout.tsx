import type { Metadata, Viewport } from 'next';
import { Archivo, Big_Shoulders } from 'next/font/google';
import { withBase } from '@/lib/utils';
import { MotionProvider } from '@/components/ui/motion';
import { CloudSyncDriver } from '@/components/auth/GoogleAuth';
import { SyncConflictSheet } from '@/components/auth/SyncConflictSheet';
import { ShellBridgeDriver } from '@/lib/native/ShellBridgeDriver';
import './globals.css';

/*
 * Self-hosted fonts via next/font/google — downloaded at BUILD time and bundled into the static
 * export (zero runtime network, GitHub-Pages/offline safe).
 *
 * THE FACES ARE THE FORGE'S, NOT THE TEMPLATE'S. Inter + Space Grotesk — the previous pair — are
 * the two most saturated faces in AI-generated UI, and both sat on the review skill's named-default
 * list; keeping them meant the identity read as generated whatever else changed. Their
 * replacements come from the subject's own graphic world:
 *
 *   · ARCHIVO (UI/body) — a workhorse grotesque descended from turn-of-the-century foundry
 *     types, tall x-height, built for dense information settings. Carries labels, body, buttons
 *     and data at 13–15px without drama, and ships real tabular figures for `.tabular`.
 *   · BIG SHOULDERS (display) — an industrial condensed grotesque drawn for Chicago's "City of
 *     Big Shoulders" civic identity: steel, railyards, forges. Headings and hero numerals only —
 *     never labels, never body (see --font-display usage in globals.css). `adjustFontFallback`
 *     is off because this Next's metrics table predates the family's upstream rename; the
 *     explicit condensed fallbacks below stand in during swap.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  variable: '--font-big-shoulders',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['Arial Narrow', 'Oswald', 'sans-serif-condensed', 'sans-serif'],
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
  themeColor: '#131010', // the warm-iron surface — the browser chrome must wear the same metal
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${bigShoulders.variable}`}>
      <body>
        {/* eslint-disable-next-line react/no-danger -- the direction contract must survive the
            production build as a real HTML comment (JSX comments compile away), per the design
            skill's decide-then-build rule; it contains only our own static text. */}
        <div
          hidden
          aria-hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: A training log forged like the equipment it tracks. One surface owns the athlete's whole
loop and refuses the dark-dashboard default: no uniform card stacks, no glow ambience, no kicker
labels, no emoji garnish.
OWN-WORLD: Warm iron surfaces (charcoal with heat under it, never blue-black), machined edges (1px
top-light), true offset shadows, copper as the only accent and ember strictly as HEAT-STATE — the
leading edge of real progress. Big Shoulders condensed for headings and hero numerals; Archivo for
everything spoken at UI size; drawn 1.75-stroke icons, food included.
STORY: Open the app, see today's work at full scale, log it, watch the metal heat toward the goal.
FIRST VIEWPORT (Today, 390px): date strip, then the workout as the single anchor — day name in Big
Shoulders, copper start CTA with knurl band — readiness beneath it, nutrition as one heat-bar row.
FORM: Owner-pinned (forged metal, dark + copper; logo untouched); pin beats the roll.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, and DESIGN.md
-->`,
          }}
        />
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
        {/* The iOS-shell handshake (ForgeBridge v1) — at the root for the same reason as
            CloudSyncDriver: the shell wraps EVERY route, so detection and health sync must not
            wait for the app shell to mount. Renders nothing; inert in a plain browser. */}
        <ShellBridgeDriver />
        {/* One motion context for the whole app: the lazy DOM feature bundle plus the global
            reduced-motion contract, so no individual component has to remember either. */}
        <MotionProvider>
          {/* The merge-or-overwrite question raised by signing into an account that already holds
              different training. App-wide because sign-in happens on the landing page as often as
              in Settings, and INSIDE MotionProvider because it renders a Sheet. Nothing shows until
              the reconcile actually finds two divergent histories. */}
          <SyncConflictSheet />
          {children}
        </MotionProvider>
      </body>
    </html>
  );
}
