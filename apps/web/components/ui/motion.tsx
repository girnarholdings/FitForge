'use client';

/**
 * THE MOTION LAYER.
 *
 * The app used to feel like a chalkboard: every tap was an instant, hard state swap with nothing
 * in between, so nothing acknowledged the touch and nothing explained where a new panel came from.
 * That is what reads as "static web app" on a phone — native UI is legible precisely *because* it
 * moves, and the movement carries meaning:
 *
 *   · **Press feedback** says "the surface received your finger" before the result arrives.
 *   · **Entrance direction** says where a thing came from, so a sheet is understood as covering
 *     the page rather than replacing it.
 *   · **Stagger** turns a list appearing all at once into a list you can actually parse.
 *
 * Everything here is built on one shared spring vocabulary rather than ad-hoc durations, so a
 * press, a sheet and a list entrance all feel like the same physical world.
 *
 * ACCESSIBILITY IS NOT AN AFTERTHOUGHT: `MotionConfig reducedMotion="user"` is installed once at
 * the app root by {@link MotionProvider}, which makes every `motion` component below honour
 * `prefers-reduced-motion` automatically — transforms are dropped, opacity is kept. Nothing in
 * this file needs its own media query, and nothing may bypass it with a raw CSS animation.
 *
 * COST: `LazyMotion` + `domAnimation` loads the DOM feature bundle only (~18 kB) instead of the
 * full library, and `m.*` components carry no feature code of their own.
 */
import * as React from 'react';
import {
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from 'motion/react';

export { m, AnimatePresence } from 'motion/react';
export type { Variants, Transition } from 'motion/react';

/* ══════════════════════════════════════════════════════════════════ the spring vocabulary ══ */

/**
 * Four springs, and everything in the app picks one. Named for the JOB, not the numbers, so a
 * reviewer can tell whether a choice is right without simulating it in their head.
 */
export const SPRING = {
  /** Taps, toggles, chips. Fast enough to feel like a direct physical response. */
  press: { type: 'spring', stiffness: 700, damping: 34, mass: 0.55 },
  /** Panels and cards arriving. Enough travel to read as "this came from somewhere". */
  panel: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
  /** Bottom sheets. Heavier — a sheet is a big object and should carry weight. */
  sheet: { type: 'spring', stiffness: 340, damping: 36, mass: 1 },
  /** Numbers, bars, gauges settling. Slow and completely overshoot-free. */
  settle: { type: 'spring', stiffness: 180, damping: 30, mass: 1 },
} satisfies Record<string, Transition>;

/* ═══════════════════════════════════════════════════════════════════════════ the provider ══ */

/**
 * Mount once, at the app root. Provides the lazy feature bundle and the global reduced-motion
 * contract for every `m.*` element in the tree.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={SPRING.panel}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/* ══════════════════════════════════════════════════════════════════════ shared variants ══ */

/** A panel arriving: rises slightly and fades in. The default for cards and sheets' contents. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: SPRING.panel },
  exit: { opacity: 0, y: 8, transition: { duration: 0.14 } },
};

/**
 * A LIST arriving. Children are revealed on a short stagger so the eye can follow the order
 * instead of being handed twelve rows simultaneously. 34 ms is deliberately below the ~50 ms where
 * a stagger stops feeling like one motion and starts feeling like a queue.
 */
export const staggerList: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.034, delayChildren: 0.02 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SPRING.panel },
};

/* ═══════════════════════════════════════════════════════════════════════ press feedback ══ */

/**
 * The single most important piece of "feel" in the app: a surface that yields under a finger.
 *
 * Scale is kept shallow (0.97) because a phone tap target is already small — anything deeper reads
 * as a bounce rather than a press. Applied via `whileTap` so it fires on pointerdown and releases
 * on pointerup, which is what makes it feel connected to the finger rather than to the navigation
 * that follows.
 */
export const PRESS = { scale: 0.97 } as const;
/** Slightly gentler press for large surfaces — a whole card scaling 3 % looks like a glitch. */
export const PRESS_SOFT = { scale: 0.985 } as const;

export type PressableProps = HTMLMotionProps<'button'> & {
  /** use the gentler scale (cards, wide rows) */
  soft?: boolean;
};

/**
 * A `<button>` that responds to touch. Drop-in for any interactive element that is not already a
 * `Button` (rows, chips, tiles, map regions).
 */
export const Pressable = React.forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { soft, children, ...rest },
  ref,
) {
  return (
    <m.button
      ref={ref}
      type="button"
      whileTap={soft ? PRESS_SOFT : PRESS}
      transition={SPRING.press}
      {...rest}
    >
      {children}
    </m.button>
  );
});

/* ══════════════════════════════════════════════════════════════════════ animated numbers ══ */

/**
 * A number that COUNTS to its new value instead of teleporting.
 *
 * Used where a number changing is the whole point of an interaction — the exercise count as a
 * filter narrows, a weekly set target as it is calibrated. A value that snaps gives no sense that
 * *your action* caused it; a value that travels does.
 *
 * Implemented with rAF against a spring-ish ease rather than `useSpring` so the DOM text is
 * written as an integer and never renders a half-set.
 */
export function AnimatedNumber({
  value,
  className,
  duration = 420,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(value);
  const fromRef = React.useRef(value);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (reduced) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      // easeOutCubic — fast departure, soft arrival, no overshoot on a digit.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, duration, reduced]);

  return <span className={className}>{shown}</span>;
}

/* ═════════════════════════════════════════════════════════════════════════════ haptics ══ */

/**
 * A short buzz where the platform allows it. Deliberately tiny durations: this is punctuation on a
 * committed action (a set logged, a target calibrated), never decoration on navigation.
 */
export function haptic(kind: 'tick' | 'confirm' = 'tick'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(kind === 'confirm' ? [12, 40, 18] : 10);
}
