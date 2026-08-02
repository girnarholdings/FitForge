'use client';

/**
 * FIRST-RUN TOUR — a five-stop SPOTLIGHT over the real Today screen, shown once.
 *
 * ─── why coach-marks now, when a sheet was chosen before ────────────────────────────────────
 * The first version was a three-screen sheet of drawn replicas, rejected coach-marks for four
 * measurement problems, and was rebuilt by owner decision: highlight the REAL elements, don't
 * show pictures of them. Each old objection is answered in code rather than argued away:
 *
 *  1. "Nothing is measurable on mount" — nothing is measured on mount. The tour opens from a
 *     DELAYED effect (below), and each step measures at spotlight time, after Today has painted.
 *  2. "dvh changes mid-tour slide the ring off its target" — the ring is re-measured on every
 *     scroll and resize (rAF-throttled), so it TRACKS its element instead of trusting one rect.
 *  3. "a cutout covers the UI it explains" — the tooltip is placed on whichever side of the
 *     cutout has room, and falls back to center only when a target is genuinely absent.
 *  4. "coach-marks cannot name five tabs at once" — the tab-bar stop highlights the whole pill
 *     and its tooltip lists all five destinations side by side, same as the old drawn map.
 *
 * ─── mechanics ──────────────────────────────────────────────────────────────────────────────
 * Targets are `[data-tour="…"]` attributes on the real components (TodayView, AppShell,
 * FloatingTabBar) — never testids, which belong to the specs, and never class names, which
 * belong to styling. A selector can match twice (mobile pill + desktop sidebar); the VISIBLE
 * match wins. A target that does not exist right now (the check-in on a rest day) degrades to a
 * centered card with the same copy — the step teaches the feature either way.
 *
 * ─── never twice ────────────────────────────────────────────────────────────────────────────
 * `dismiss` is the one funnel and it persists via `markTourSeen()`: Skip, the final button,
 * Escape, and a tap on the dimmed scrim (rendered as an `aria-label="Close"` button) all pass
 * through it. A close path that does not write is how a first-run tour becomes a recurring one.
 *
 * ─── copy rule ──────────────────────────────────────────────────────────────────────────────
 * Every sentence is a statement about this app's own mechanics. No training or nutrition claims.
 */
import * as React from 'react';
import { Button } from '@/components/ui';
import {
  AnvilIcon,
  BarbellIcon,
  KettlebellIcon,
  ShakerIcon,
  TrendingUpIcon,
  type IconProps,
} from '@/components/ui/icons';
import { m, riseIn } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { useDemoState } from '@/lib/demo/useDemo';
import { getState, hasSeenTour, markTourSeen } from '@/lib/demo/store';

/**
 * Deliberately delayed. Opening on the same frame the screen paints reads as a bug; a beat later
 * reads as deliberate. It is also the window in which the hydration snapshot swap lands, so a
 * returning user's real `tourSeenAt` arrives and cancels the timer before anything is shown —
 * and the window in which Today's cards actually paint, which is what makes them measurable.
 */
const OPEN_DELAY_MS = 250;

/** Breathing room between an element and its cutout edge. */
const SPOT_PAD = 8;
/** Minimum viewport space a tooltip needs before it takes that side of the cutout. */
const TOOLTIP_ROOM = 230;

interface TabSpec {
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  blurb: string;
}

/** The five primary tabs, in bar order, mirroring `AppShell.NAV` — prose for the tab-bar stop. */
const TABS: TabSpec[] = [
  { label: 'Today', Icon: AnvilIcon, blurb: 'your session for today, plus your streak.' },
  { label: 'Workouts', Icon: BarbellIcon, blurb: 'your plan, and every split you can switch to.' },
  { label: 'Exercises', Icon: KettlebellIcon, blurb: 'the full movement library, with how-tos.' },
  { label: 'Nutrition', Icon: ShakerIcon, blurb: 'log food by typing what you ate.' },
  { label: 'Progress', Icon: TrendingUpIcon, blurb: 'your lifts, PRs and body weight over time.' },
];

interface TourStop {
  id: string;
  /** the `[data-tour]` anchor this stop spotlights */
  target: string;
  title: string;
  render: () => React.ReactElement;
}

const STOPS: TourStop[] = [
  {
    id: 'session',
    target: 'today-card',
    title: 'Your session lives here',
    render: () => (
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        This card is the day&rsquo;s work. Tap{' '}
        <span className="font-semibold text-foreground">Start workout</span> and every exercise
        gets its own screen — weight, reps, RPE, each box labeled — and the rest timer starts
        itself. Words you don&rsquo;t know are dot-underlined in there; tap one and it explains
        itself.
      </p>
    ),
  },
  {
    id: 'checkin',
    target: 'check-in',
    title: 'Check in each morning',
    render: () => (
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Say how you slept and how sore you are, and the day&rsquo;s session adapts to your
        answer. On training mornings the check-in sits right under your workout card.
      </p>
    ),
  },
  {
    id: 'ledger',
    target: 'today-ledger',
    title: 'Food and body weight',
    render: () => (
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Your calories and protein against today&rsquo;s targets, and your weight trend — logged
        by typing what you ate, in{' '}
        <span className="font-semibold text-foreground">Nutrition</span>. If you built a meal
        plan in onboarding, it lives there too, swaps included.
      </p>
    ),
  },
  {
    id: 'tabs',
    target: 'tab-bar',
    title: 'Five tabs, along the bottom',
    render: () => (
      <ul className="space-y-1">
        {TABS.map((t) => (
          <li key={t.label} className="flex items-start gap-2 text-[12.5px] leading-snug">
            <t.Icon size={15} aria-hidden className="mt-px shrink-0 text-accent" />
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{t.label}</span> — {t.blurb}
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'local',
    target: 'top-bar',
    title: 'Coach, Settings, and your data',
    render: () => (
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Settings and Coach live in the bar at the top.{' '}
        <span className="font-semibold text-foreground">Local</span> means everything stays in
        this browser only — clearing browser data clears FitForge, so export a backup from
        Settings any time. You can replay this tour from Settings too.
      </p>
    ),
  },
];

const TOTAL_STEPS = STOPS.length;

/** The visible element for a `data-tour` anchor — a selector can match a hidden twin. */
function findTarget(target: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return (
    els.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? null
  );
}

export function FirstRunTour() {
  // REACTIVE read (`useDemoState`), not `getState()`: `resetTour()` from Settings must be able
  // to re-arm this while the component is already mounted, and `markTourSeen()` must stop the
  // effect from re-firing.
  const seen = hasSeenTour(useDemoState());
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (seen) return;
    const timer = window.setTimeout(() => {
      // Second guard, against the authoritative store rather than the snapshot: keeps the tour
      // from flashing if hydration were somehow slower than the delay.
      if (hasSeenTour(getState())) return;
      setStep(0);
      setOpen(true);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [seen]);

  /** The ONE dismissal funnel — Skip, finish, Escape and the scrim all land here. */
  const dismiss = React.useCallback(() => {
    setOpen(false);
    markTourSeen();
  }, []);

  const stop = STOPS[step]!;

  // MEASURE AND TRACK the spotlight target. Centering the element first, then re-measuring on
  // every scroll and resize, is what makes the cutout stay ON its element when iOS collapses
  // the URL bar or the athlete drags the page mid-tour.
  React.useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(stop.target);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    let raf = 0;
    const measure = () => {
      const t = findTarget(stop.target);
      setRect(t ? t.getBoundingClientRect() : null);
    };
    measure();
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, step, stop.target]);

  // Escape closes — and persists, like every other exit.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  // Move focus with the tooltip so keyboard and screen-reader users ride along.
  React.useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, step]);

  if (!open) return null;

  const isLast = step === TOTAL_STEPS - 1;
  const vh = window.innerHeight;

  // Tooltip side: below the cutout when there is room, above when there is room there, centered
  // when the target is missing or the viewport is too tight for either.
  const cut = rect
    ? {
        x: Math.max(4, rect.left - SPOT_PAD),
        y: rect.top - SPOT_PAD,
        w: Math.min(window.innerWidth - 8, rect.width + SPOT_PAD * 2),
        h: rect.height + SPOT_PAD * 2,
      }
    : null;
  const below = cut != null && vh - (cut.y + cut.h) >= TOOLTIP_ROOM;
  const above = cut != null && !below && cut.y >= TOOLTIP_ROOM;
  const cardPos: React.CSSProperties = below
    ? { top: cut!.y + cut!.h + 12 }
    : above
      ? { bottom: vh - cut!.y + 12 }
      : { top: '50%', transform: 'translateY(-50%)' };

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label={stop.title}
      data-testid="first-run-tour"
    >
      {/* The scrim IS a button (tap anywhere dimmed = close), with the mask riding inside it.
          The SVG is pointer-events-none so the button underneath takes the tap. */}
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className="absolute inset-0 h-full w-full cursor-default"
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <mask id="ff-tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {cut && <rect x={cut.x} y={cut.y} width={cut.w} height={cut.h} rx={20} fill="black" />}
            </mask>
          </defs>
          {/* One dim layer, masked — the cutout is a hole, not a drawn ring pretending. */}
          <rect width="100%" height="100%" fill="rgba(12,8,6,0.8)" mask="url(#ff-tour-mask)" />
          {cut && (
            <rect
              x={cut.x}
              y={cut.y}
              width={cut.w}
              height={cut.h}
              rx={20}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity={0.85}
              strokeWidth={1.5}
            />
          )}
        </svg>
      </button>

      {/* The tooltip card — keyed on the step so each stop mounts fresh and plays `riseIn`. */}
      <m.div
        key={stop.id}
        variants={riseIn}
        initial="hidden"
        animate="show"
        ref={cardRef}
        tabIndex={-1}
        style={cardPos}
        data-testid={`tour-step-${step + 1}`}
        data-tour-screen={stop.id}
        className={cn(
          'absolute inset-x-3 mx-auto max-w-[24rem] rounded-card border border-border bg-surface-2 p-4',
          'shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] outline-none',
        )}
      >
        <h2 className="font-display text-lg font-bold leading-tight text-foreground">
          {stop.title}
        </h2>
        <div className="mt-2">{stop.render()}</div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {/* SKIP IS FIRST AND PRESENT AT EVERY STOP — the escape from a modal the user did not
              ask for must never be a hunt. */}
          <button
            type="button"
            onClick={dismiss}
            data-testid="tour-skip"
            className="-ml-2 flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Skip
          </button>

          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex items-center gap-1" aria-hidden>
              {STOPS.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === step ? 'w-4 bg-accent' : 'w-1.5 bg-border',
                  )}
                />
              ))}
            </span>
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
      </m.div>
    </div>
  );
}
