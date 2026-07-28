'use client';

/**
 * FIRST-RUN TOUR — a three-screen orientation carousel, shown once, over the real Today screen.
 *
 * ─── why a sheet and not coach-marks ────────────────────────────────────────────────────────
 * The obvious shape for "show me where things are" is a spotlight tour: cut a hole over the tab
 * bar, point at it, repeat five times. Rejected, for four concrete reasons.
 *
 *  1. NOTHING IS MEASURABLE ON MOUNT. `AppShell` renders a blank canvas until its `isOnboarded()`
 *     effect resolves, so anything calling `getBoundingClientRect()` on mount measures an empty
 *     page.
 *  2. THE TARGETS ARE THE WORST POSSIBLE ONES. The tab bar is `fixed` with
 *     `pb-[env(safe-area-inset-bottom)]` inside `min-h-dvh`; the top bar is `sticky` with a
 *     backdrop blur. On iOS Safari the URL bar collapsing changes `dvh` mid-tour and a spotlight
 *     ring slides off the thing it is pointing at.
 *  3. AT 390×664 A CUTOUT COVERS THE UI IT IS EXPLAINING, and what is left over — after a tooltip,
 *     a step counter, Back, Next and Skip — is about 200 px of copy.
 *  4. IT IS HONESTLY LESS USEFUL. "What is where" is a request for a MAP. A drawn replica of the
 *     tab bar labels all five tabs AT ONCE, side by side; coach-marks physically cannot do that in
 *     fewer than five steps.
 *
 * A `Sheet` is `role="dialog" aria-modal="true"` with stable testids (so the specs assert on
 * identity, never on position), it slides up over the user's ACTUAL Today screen — the honest half
 * of what coach-marks promise — and it inherits Escape-to-close, the scrim and the body scroll lock
 * for free.
 *
 * ─── the single most important implementation note ──────────────────────────────────────────
 * THE SHEET IS OPENED FROM AN EFFECT, NEVER FROM A RENDER-TIME STORE READ. `getServerSnapshot()`
 * returns the frozen default state, in which `tourSeenAt` is `null`; deciding to open during render
 * would bake an open dialog into the statically exported HTML and flash it at every returning user
 * before hydration.
 *
 * ─── never twice ────────────────────────────────────────────────────────────────────────────
 * `onClose` is wired to `markTourSeen()`, not just to the buttons, so EVERY dismissal path
 * persists: Skip, Escape, a tap on the scrim (which `Sheet` renders as an `aria-label="Close"`
 * button) and "Start training". A close path that does not write is how a first-run tour becomes a
 * recurring one.
 *
 * ─── copy rule ──────────────────────────────────────────────────────────────────────────────
 * Every sentence below is a statement about this app's own mechanics. There is not one training or
 * nutrition claim anywhere in this file, and none may be added.
 */
import * as React from 'react';
import { Sheet, Button } from '@/components/ui';
import {
  AnvilIcon,
  BarbellIcon,
  KettlebellIcon,
  ShakerIcon,
  TrendingUpIcon,
  type IconProps,
} from '@/components/ui/icons';
import { m, riseIn, staggerList, staggerItem, Pressable } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { useDemoState } from '@/lib/demo/useDemo';
import { getState, hasSeenTour, markTourSeen } from '@/lib/demo/store';

/**
 * Deliberately delayed. Opening on the same frame the screen paints reads as a bug ("it broke
 * before I saw it"); a beat later reads as deliberate. It is also the window in which the hydration
 * snapshot swap lands, so a returning user's real `tourSeenAt` arrives and cancels the timer before
 * anything is shown. Specs must wait on the locator, never on a fixed sleep.
 */
const OPEN_DELAY_MS = 250;

/* ═════════════════════════════════════════════════════════════════════════════ screen 1 art ══ */

interface TabSpec {
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  /** what this destination is FOR, in the user's words */
  blurb: string;
}

/**
 * The five primary tabs, in bar order, mirroring `AppShell.NAV`. Duplicated as data rather than
 * imported because this is a DRAWING of the bar, not the bar: it must never become clickable, and
 * it must not start rendering an `aria-current` or a live route.
 */
const TABS: TabSpec[] = [
  { label: 'Today', Icon: AnvilIcon, blurb: 'your session for today, plus your streak.' },
  { label: 'Workouts', Icon: BarbellIcon, blurb: 'your plan, and every split you can switch to.' },
  { label: 'Exercises', Icon: KettlebellIcon, blurb: 'the full movement library, with how-tos.' },
  { label: 'Nutrition', Icon: ShakerIcon, blurb: 'log food by typing what you ate.' },
  { label: 'Progress', Icon: TrendingUpIcon, blurb: 'your lifts, PRs and body weight over time.' },
];

/**
 * A STATIC, NON-INTERACTIVE replica of the bottom tab bar. `aria-hidden` in full: the five names
 * are read out immediately below it in the list, and a screen reader announcing them twice — once
 * as a picture of a bar, once as prose — is worse than not announcing the picture at all.
 */
function TabBarArt() {
  return (
    <div
      aria-hidden
      className="rounded-2xl border border-border bg-surface-2/80 px-1 py-2 shadow-[var(--shadow-card)]"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((t, i) => (
          <li key={t.label} className="min-w-0 flex-1">
            <div
              className={cn(
                'flex flex-col items-center gap-1 px-0.5 text-[10px] font-semibold leading-none',
                i === 0 ? 'text-accent' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-12 place-items-center rounded-full',
                  i === 0 && 'bg-accent-muted',
                )}
              >
                <t.Icon size={22} />
              </span>
              <span className="max-w-full truncate">{t.label}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScreenTabs() {
  return (
    <div className="space-y-3">
      <TabBarArt />
      <m.ul variants={staggerList} initial="hidden" animate="show" className="space-y-1.5">
        {TABS.map((t) => (
          <m.li key={t.label} variants={staggerItem} className="text-[13px] leading-snug">
            <span className="font-semibold text-foreground">{t.label}</span>
            <span className="text-muted-foreground"> — {t.blurb}</span>
          </m.li>
        ))}
      </m.ul>
      <p className="text-xs text-muted-foreground">
        Settings and Coach live in the bar at the top.
      </p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════ screen 2 art ══ */

/**
 * A miniature of the Today workout card — the accent header block and the gold CTA — drawn in the
 * same visual language as the real one, so the eye recognises it the moment the sheet closes.
 * Non-interactive by construction: a `div` and a `span`, never a `Link` or a `Button`.
 */
function WorkoutCardArt() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)]"
    >
      <div className="bg-accent px-4 py-2.5 text-accent-foreground">
        <p className="text-[9px] font-semibold uppercase tracking-wide opacity-80">
          Today&rsquo;s workout
        </p>
        <p className="font-display text-sm font-bold">Push A</p>
      </div>
      <div className="bg-surface-2 px-4 py-3">
        <span className="flex h-9 items-center justify-center rounded-field bg-accent text-[13px] font-semibold text-accent-foreground">
          Start workout
        </span>
      </div>
    </div>
  );
}

function ScreenStart() {
  return (
    <div className="space-y-3">
      <WorkoutCardArt />
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        On <span className="font-semibold text-foreground">Today</span>, tap{' '}
        <span className="font-semibold text-foreground">Start workout</span>. Each exercise gets its
        own screen: every box carries its own label — weight, reps, RPE — and you close the collar
        beside them to log the set. The rest timer starts itself.
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Any word you don&rsquo;t know is underlined with dots in there. Tap it and it explains
        itself.
      </p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════ screen 3 art ══ */

/** A replica of the gold `Local` chip that sits in the top bar of every screen. */
function LocalChipArt() {
  return (
    <div className="flex justify-center py-1">
      <span
        aria-hidden
        className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-accent-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Local
      </span>
    </div>
  );
}

function ScreenLocal() {
  return (
    <div className="space-y-3">
      <LocalChipArt />
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        There&rsquo;s no account and no server. Your plan, your logs and your meals live in this
        browser only. Clearing your browser data clears FitForge — export a backup from{' '}
        <span className="font-semibold text-foreground">Settings</span> any time.
      </p>
      <p className="text-xs text-muted-foreground">You can reopen this tour from Settings.</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════ the carousel ══ */

const SCREENS: { id: string; title: string; render: () => React.ReactElement }[] = [
  { id: 'tabs', title: 'Five tabs, along the bottom', render: () => <ScreenTabs /> },
  { id: 'start', title: 'Start here', render: () => <ScreenStart /> },
  { id: 'local', title: 'Local Mode', render: () => <ScreenLocal /> },
];

const TOTAL_STEPS = SCREENS.length;

export function FirstRunTour() {
  // REACTIVE read (`useDemoState`), not `getState()`: `resetTour()` from Settings must be able to
  // re-arm this while the component is already mounted, and `markTourSeen()` must stop the effect
  // from re-firing. A direct read would compile and never update.
  const seen = hasSeenTour(useDemoState());
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (seen) return;
    const timer = window.setTimeout(() => {
      // Second guard, against the authoritative store rather than the snapshot: on a returning
      // user's first paint the snapshot is still the frozen server state, and if hydration were
      // somehow slower than the delay, this is what keeps the tour from flashing.
      if (hasSeenTour(getState())) return;
      setStep(0);
      setOpen(true);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [seen]);

  /** The ONE dismissal funnel. `Sheet` routes Escape and the scrim here too. */
  const dismiss = React.useCallback(() => {
    setOpen(false);
    markTourSeen();
  }, []);

  const screen = SCREENS[step]!;
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <Sheet open={open} onClose={dismiss} title={screen.title}>
      <div data-testid="first-run-tour">
        {/*
          Keyed on the step so each screen MOUNTS fresh and plays `riseIn` on arrival. Deliberately
          not wrapped in `AnimatePresence`: with screens of different heights, waiting for an exit
          collapses the sheet to the chrome and bounces it back, which reads as a glitch. Reduced
          motion is handled globally by `MotionConfig reducedMotion="user"`.
        */}
        <m.div
          key={screen.id}
          variants={riseIn}
          initial="hidden"
          animate="show"
          data-testid={`tour-step-${step + 1}`}
          data-tour-screen={screen.id}
        >
          {screen.render()}
        </m.div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {/* SKIP IS FIRST IN THE ROW AND PRESENT ON EVERY SCREEN. The escape hatch on a modal the
              user did not ask for should never be something they have to hunt for, and it must
              never be one step further away than the thing it is escaping. */}
          <Pressable
            onClick={dismiss}
            data-testid="tour-skip"
            className="-ml-2 flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Skip
          </Pressable>

          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex items-center gap-1" aria-hidden>
              {SCREENS.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === step ? 'w-4 bg-accent' : 'w-1.5 bg-border',
                  )}
                />
              ))}
            </span>
            {/*
              The counter is VISIBLE text, not an aria-only announcement: it is the same fact for
              everyone, it is testable, and it tells a sighted user how much tour is left — which is
              what stops people hunting for Skip in the first place.
            */}
            <span
              data-testid="tour-progress"
              className="text-[11px] font-medium tabular-nums text-muted-foreground"
            >
              {step + 1} of {TOTAL_STEPS}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {step > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                data-testid="tour-back"
              >
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={dismiss} data-testid="tour-finish">
                Start training
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
                data-testid="tour-next"
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
