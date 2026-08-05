'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Sheet } from '@/components/ui';
import { TargetIcon, ShakerIcon, SwapIcon, type IconProps } from '@/components/ui/icons';
import { LogoLockup, LandingHero } from '@/components/illustrations';
import {
  GoogleSignInButton,
  redirectSignInCompleted,
  subscribeRedirectSignIn,
} from '@/components/auth/GoogleAuth';
import { getState, isOnboarded, resetDemo } from '@/lib/demo/store';
import { signOutUser } from '@/lib/auth/firebase';
import { getRestoreState, subscribeRestore } from '@/lib/auth/sync';

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

  /**
   * START OVER — and for a signed-in user, SIGN OUT FIRST.
   *
   * The sheet promises this erases "your Local Mode data — plan, logs, and meals stored in this
   * browser". For a signed-out user that is exactly what happened. For a signed-in one it was a
   * lie with teeth: the cloud mirror was still running, so emptying the store notified it, and
   * four seconds later the empty bundle replaced the athlete's entire history in their Google
   * account. A control that says "this browser" was quietly destroying the backup that exists
   * precisely so this browser would not matter.
   *
   * Signing out first stops the mirror before the wipe, which makes the promise true: the account
   * keeps its copy, this browser starts clean, and signing back in restores it. Deleting the
   * account's data is a different decision and still lives where it says so — Settings → Erase
   * everything, which deletes the document explicitly and refuses if it cannot confirm it.
   */
  const startOver = async () => {
    setConfirmReset(false);
    // Awaited, not fire-and-forget: the mirror must be gone BEFORE the store is emptied. A failed
    // sign-out leaves the account untouched, which is the safe side of this to fail on.
    await signOutUser().catch(() => {});
    resetDemo();
    setReturning(false);
    router.push('/onboarding/welcome');
  };

  /**
   * Where a Google sign-in lands — decided HERE, but only once the account has actually answered.
   *
   * The history matters, because both previous versions were wrong in opposite directions. The
   * first read `isOnboarded()` the instant the popup closed and sent an empty browser to
   * onboarding — deciding "this person is new" from "this browser is new", microseconds before
   * their real plan arrived from Firestore. The fix was to stop deciding at all and push everyone
   * to `/today`, letting the app shell wait for the reconcile.
   *
   * That trades a wrong destination for a punishing one. `/today` is this app's heaviest route
   * (224 kB of first-load JS); a brand-new account loads all of it, hydrates, waits for the
   * account, and is then bounced to `/onboarding/welcome` — another 272 kB. MEASURED on ordinary
   * cellular that is ~6 s of BLANK SCREEN between "I picked my Google account" and "I can see
   * anything", versus ~230 ms for the Local Mode button beside it. That gap is the whole reason
   * signing in felt broken while Local Mode felt fine.
   *
   * So: stay on this page — already painted, nothing more to download — show that something is
   * happening, and wait for the same reconcile the shell would have waited for. Then go straight
   * to the right place, loading exactly one bundle. `phase: 'done'` is settled-not-successful by
   * design, and the timeout below is the backstop for the case where even that never arrives.
   */
  const [finishing, setFinishing] = React.useState(false);
  /** Latches across calls: the popup's `onDone` and a returning redirect both land here, and one
   *  leave is all anybody needs. Without it each call would add a subscription and a timer. */
  const leaving = React.useRef(false);

  const routeAfterRestore = React.useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setFinishing(true);
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      // The account's own data decides. A returning athlete lands on their training; a genuinely
      // new one starts the wizard — and neither pays for the other's bundle.
      router.push(isOnboarded() ? '/today' : '/onboarding/welcome');
    };
    const off = subscribeRestore(() => {
      if (getRestoreState().phase === 'done') go();
    });
    // A reconcile that never settles (offline mid-sign-in, Firestore unreachable) must not strand
    // anyone on this screen. `syncOnSignIn` already resolves its phase in a `finally`; this is the
    // belt for the case where the driver never got to run at all.
    const timer = setTimeout(go, 12_000);
    if (getRestoreState().phase === 'done') go();
  }, [router]);

  const afterSignIn = () => routeAfterRestore();

  /**
   * A REDIRECT SIGN-IN COMES BACK HERE, and nothing used to notice.
   *
   * The popup path calls `afterSignIn` from its own click handler. The redirect path cannot: the
   * browser left for Google and returned on a fresh page load, so the component that started it is
   * long gone. `CloudSyncDriver` claimed the credential app-wide — but this page just sat there,
   * still offering "Continue with Google" to someone who had already signed in. Tapping it again
   * looked like the fix and was simply another go round the same loop.
   *
   * KEYED ON THE REDIRECT ITSELF, not on "is signed in". Being signed in is also true for a
   * returning visitor who deliberately opened this page to press "Start over", and for the moment
   * after Settings → Erase signs someone out and sends them back here. Neither of those has asked
   * to be moved.
   */
  const redirectDone = React.useSyncExternalStore(
    subscribeRedirectSignIn,
    redirectSignInCompleted,
    () => false,
  );
  React.useEffect(() => {
    if (redirectDone) routeAfterRestore();
  }, [redirectDone, routeAfterRestore]);

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
            <span className="text-accent-soft">Forged around you.</span>
          </h1>
          {/* COPY BUDGET: this line must stay within ~2 lines at 390px (see the layout note at the
              top of the file) — about 90 characters. It also may NOT claim offline support: there
              is no service worker, so a cold load still needs a connection, and the Coach KB entry
              "Does the app work offline?" states that precisely. Marketing does not get to out-run
              the app's own honest answer. Every figure here is checkable: 31 programs in
              seed/data/splits.json, 91 rows in seed/data/exercises.json, macros from
              @fitforge/shared → rules/macros.ts. */}
          <p className="mt-3 max-w-[36ch] text-base leading-relaxed text-muted-foreground">
            31 real training programs, 91 coached exercises, macros that match. Free, no account.
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
          {finishing ? (
            /* Signed in, fetching the account. Replacing the buttons rather than sitting beside
               them is deliberate: the decision of where to go next is already made, and leaving a
               live "Start in Local Mode" under someone's thumb invites them to start a second,
               conflicting history one tap before their real one lands. */
            <p
              className="py-3 text-center text-sm text-muted-foreground"
              role="status"
              data-testid="landing-finishing"
            >
              Setting up your account…
            </p>
          ) : returning ? (
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
          <Button variant="danger" block onClick={() => void startOver()}>
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
