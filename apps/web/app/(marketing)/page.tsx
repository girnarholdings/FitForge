'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Sheet } from '@/components/ui';
import { TargetIcon, ShakerIcon, SwapIcon, type IconProps } from '@/components/ui/icons';
import { LogoLockup, LandingHero } from '@/components/illustrations';
import { getState, resetDemo } from '@/lib/demo/store';

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

  return (
    <main className="screen mx-auto w-full max-w-[430px] sm:max-w-md">
      <header className="safe-top flex flex-none items-center justify-between px-6 pb-1">
        <LogoLockup size={20} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-accent-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Local
        </span>
      </header>

      <div className="scroll-region flex flex-col px-6">
        <section className="flex-none pt-2">
          <h1 className="font-display text-[clamp(1.6rem,7.4vw,2.5rem)] font-bold leading-[1.06] tracking-tight text-foreground">
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
          <p className="mt-2 text-[0.9375rem] leading-snug text-muted-foreground">
            26 real training programs, 91 coached exercises, macros that match. Free, no account.
          </p>
        </section>

        {/* Elastic zone: the hero takes whatever height is left and no more. The
            absolute inner box lets the art shrink without contributing height. */}
        <div className="relative my-2 min-h-[96px] flex-1">
          <div className="absolute inset-0 flex items-center justify-center">
            <LandingHero style={{ height: '100%', width: 'auto', maxWidth: '100%' }} />
          </div>
        </div>

        <ul className="grid flex-none grid-cols-3 gap-2 pb-2">
          {VALUE_ROWS.map(({ Icon, title }) => (
            <li key={title} className="flex flex-col items-center gap-1.5 text-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent">
                <Icon size={18} />
              </span>
              <p className="text-[11px] font-semibold leading-tight text-foreground">{title}</p>
            </li>
          ))}
        </ul>
      </div>

      <footer className="cta-dock px-6">
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
              <Link href="/login" className="block">
                <Button size="lg" variant="ghost" block>
                  I have an account
                </Button>
              </Link>
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
