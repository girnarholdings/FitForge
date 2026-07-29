'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Sheet } from '@/components/ui';
import { TargetIcon, ShakerIcon, SwapIcon, type IconProps } from '@/components/ui/icons';
import { LogoLockup, LandingHero } from '@/components/illustrations';
import { GoogleSignInButton } from '@/components/auth/GoogleAuth';
import { getState, isOnboarded, resetDemo } from '@/lib/demo/store';

/**
 * Marketing landing (§5.2) — a SINGLE-VIEWPORT composition.
 *
 * Phone-first budget at 390 × 664 (iPhone Safari, URL bar + toolbar visible):
 *   header ~42 · headline ~69 · subhead ~49 · hero (flexes, 96–220) · value
 *   row ~71 · docked CTA ~146  →  fits with the hero absorbing the slack.
 * The hero art is the only elastic element, so on shorter phones (SE, 568px)
 * it shrinks instead of pushing the CTA off-screen. If a device is smaller
 * still, `.scroll-region` scrolls and the `.cta-dock` stays pinned.
 */
const VALUE_ROWS: { Icon: (p: IconProps) => React.ReactElement; title: string }[] = [
  // TargetIcon stays here and ONLY here (plus WelcomeStep): a target that means a numeric goal is
  // the correct reading of a dartboard. Everywhere it meant "the muscles this hits" it is now
  // BodyIcon. The apple became a shaker so the promise on the landing page is the same object the
  // Nutrition tab wears once you are inside.
  { Icon: TargetIcon, title: 'A plan tuned to you' },
  { Icon: ShakerIcon, title: 'Macros, explained' },
  { Icon: SwapIcon, title: 'Smart substitutions' },
];

export default function LandingPage() {
  const router = useRouter();
  // Hydration gate: read the store only after mount so the returning-user CTA swap never flashes.
  const [mounted, setMounted] = React.useState(false);
  const [returning, setReturning] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);

  React.useEffect(() => {
    setReturning(getState().completedAt != null);
    setMounted(true);
  }, []);

  const startOver = () => {
    resetDemo();
    setConfirmReset(false);
    setReturning(false);
    router.push('/onboarding/welcome');
  };

  /**
   * Where a Google sign-in lands. Onboarding either way, unless this browser already holds a
   * finished plan — someone signing in on a device they have already used should not be asked to
   * build a plan they can see behind the dialog. A brand-new device restores from the cloud
   * instead: CloudSyncDriver pulls the backup, and onboarding's own gate sends them on.
   */
  const afterSignIn = () => router.push(isOnboarded() ? '/today' : '/onboarding/welcome');

  return (
    <main data-flow="desktop" className="screen mx-auto w-full max-w-[430px] sm:max-w-md lg:max-w-[1080px] lg:px-10">
      <header className="safe-top flex flex-none items-center justify-between px-6 pb-1 lg:px-0 lg:py-5">
        <LogoLockup size={20} />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Local
        </span>
      </header>

      <div className="scroll-region flex flex-col px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-center lg:gap-16 lg:px-0">
        <div className="contents lg:block">
        <section className="flex-none pt-2">
          <h1 className="font-display text-[clamp(2rem,9vw,2.75rem)] font-bold leading-[1.06] tracking-tight text-foreground lg:text-[3.5rem]">
            Your personal trainer.
            <br />
            <span className="text-gradient-gold">Forged around you.</span>
          </h1>
          {/* COPY BUDGET: this line must stay within ~2 lines at 390px (see the layout note at the
              top of the file) — about 90 characters. It also may NOT claim offline support: there
              is no service worker, so a cold load still needs a connection, and the Coach KB entry
              "Does the app work offline?" states that precisely. Marketing does not get to out-run
              the app's own honest answer. Every figure here is checkable: 26 programs in
              seed/data/splits.json, 91 rows in seed/data/exercises.json, macros from
              @fitforge/shared → rules/macros.ts. */}
          <p className="mt-3 max-w-[36ch] text-base leading-relaxed text-muted-foreground">
            26 real training programs, 91 coached exercises, macros that match. Free, no account.
          </p>
        </section>

        {/* Elastic zone: the hero takes whatever height is left and NO MORE THAN 46% of the
            phone — decoration must never out-rank the headline again. On lg it moves to the
            right-hand grid column. */}
        <div className="relative my-2 max-h-[46vh] min-h-[96px] flex-1 lg:hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <LandingHero style={{ height: '100%', width: 'auto', maxWidth: '100%' }} />
          </div>
        </div>

        {/* The value props, un-boxed: one quiet dot-separated line instead of three icon tiles
            in tinted squares. Same three strings, verbatim — one is spec-asserted. */}
        <ul className="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-1 pb-2 text-[0.8125rem] font-medium text-muted-foreground">
          {VALUE_ROWS.map(({ title }, i) => (
            <li key={title} className="flex items-center gap-2.5">
              {i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-border-strong" />}
              {title}
            </li>
          ))}
        </ul>
        </div>

        <div className="hidden lg:block">
          <LandingHero style={{ height: '540px', width: 'auto', maxWidth: '100%' }} />
        </div>
      </div>

      <footer className="cta-dock px-6 lg:mx-0 lg:max-w-[480px] lg:px-0">
        {/* Render CTAs only after hydration so the returning-user swap doesn't flash (§5.2). */}
        <div className={`flex flex-col gap-2 ${mounted ? '' : 'invisible'}`}>
          {returning ? (
            <>
              <Link href="/today" className="block">
                <Button size="lg" block glow>
                  Continue your plan
                </Button>
              </Link>
              <Button size="lg" variant="ghost" block onClick={() => setConfirmReset(true)}>
                Start over
              </Button>
            </>
          ) : (
            <>
              <Link href="/onboarding/welcome" className="block">
                <Button size="lg" block glow>
                  Start in Local Mode
                </Button>
              </Link>
              {/* THE SECOND DOOR, AND THE LAST ONE.
                  Sign up and sign in are one button because Google does not distinguish them —
                  and splitting them into "create account" and "I have an account" is most of what
                  made this screen confusing: three routes (landing CTA, a login page, an
                  onboarding auth step) that all led to the same two outcomes. Two doors now, and
                  nothing behind either of them asks the question again.
                  Renders nothing on a build with no Firebase project, which correctly leaves
                  Local Mode as the only way in. */}
              {/* warmOnMount={false}: this page promises "Free, no account", and most people who
                  read it will tap Local Mode. Preparing Google's popup for all of them would mean
                  a third-party request on behalf of visitors who never asked for one. It warms on
                  pointer-down instead. See GoogleSignInButton. */}
              <GoogleSignInButton warmOnMount={false} onDone={afterSignIn} />
              <p className="px-2 pt-0.5 text-center text-[11px] leading-snug text-muted-foreground">
                {/* Says the quiet part out loud. "Continue with Google" is the standard label and
                    covers both cases, but a first-time visitor reading it next to a Local Mode
                    button can reasonably wonder whether an account is something they already need
                    to have. */}
                New or returning — Google does both, and backs your training up across devices.
                Local Mode keeps everything in this browser instead.
              </p>
            </>
          )}
        </div>
      </footer>

      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Start over?">
        <p className="text-sm text-muted-foreground">
          This erases your Local Mode data — plan, logs, and meals stored in this browser — and
          restarts onboarding. This cannot be undone.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="danger" block onClick={startOver}>
            Erase and start over
          </Button>
          <Button variant="ghost" block onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
