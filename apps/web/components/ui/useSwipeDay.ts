'use client';

/**
 * SWIPE BETWEEN DAYS on Today and Nutrition.
 *
 * These are the two screens someone opens every day, and until now the only way to reach
 * yesterday's log was to hit a 36px chevron. On a phone the natural gesture for "the day before
 * this one" is to push the day sideways, and every calendar, mail client and photo library on the
 * platform answers it. The chevrons stay — a gesture with no visible control is a secret, and the
 * week strip is still the fastest way to jump four days — but the swipe is now the one that
 * matches the thumb.
 *
 * WHY THE CONTENT FOLLOWS AT A FRACTION rather than 1:1: a true 1:1 pager needs the destination
 * rendered alongside the current page, and a day of Today is a plan, a readiness card, a macro
 * ring and a workout list — mounting two of them to service a gesture that usually gets cancelled
 * is a real cost on a mid-range phone. So this is a HINT in the direction of travel (§8) rather
 * than a pager: the screen leans the way the day is going, resists progressively as it leans, and
 * the decision to commit is made on projected momentum exactly as a pager's would be. The lean is
 * deliberately small — enough to say "this gesture is doing something", not enough to imply the
 * next day is already under your finger and merely hidden.
 *
 * WHAT IT REFUSES TO CLAIM, which is most of what makes a screen-level gesture tolerable:
 *   · anything more vertical than horizontal — the page scrolls, always, and that outranks this;
 *   · anything starting inside a horizontal scroller, a chart, a slider or the swipe deck, marked
 *     with `data-no-swipe-nav`;
 *   · anything starting on a form control, where a sideways drag is text selection.
 */

import * as React from 'react';
import { VelocityTracker, rubberband, shouldCommit } from '@/lib/gesture/physics';
import { haptic } from './motion';

/** Movement before the gesture is claimed at all. */
const CLAIM_PX = 12;
/** How much more horizontal than vertical the movement must be to outrank scrolling. */
const HORIZONTAL_BIAS = 1.4;
/** Fraction of the finger's travel the screen actually leans. */
const LEAN_RATIO = 0.32;
/** The lean is rubber-banded against this, so it asymptotes instead of running off the screen. */
const LEAN_LIMIT_PX = 96;
/** Distance (of real finger travel) that commits with no speed behind it. */
const COMMIT_PX = 96;
/** ω for the settle back to centre — snappier than the sheet; this is a small, light movement. */
const OMEGA = 24;

export interface SwipeDayOptions {
  /** `-1` for the previous day, `+1` for the next. Called once, on commit. */
  onNavigate: (direction: -1 | 1) => void;
  enabled?: boolean;
  reduced?: boolean;
}

export function useSwipeDay({ onNavigate, enabled = true, reduced = false }: SwipeDayOptions) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const raf = React.useRef<number | null>(null);
  const offset = React.useRef(0);
  const tracker = React.useRef(new VelocityTracker());
  const gesture = React.useRef<{
    id: number;
    x: number;
    y: number;
    claimed: boolean;
    rejected: boolean;
  } | null>(null);

  const navigateRef = React.useRef(onNavigate);
  navigateRef.current = onNavigate;

  const paint = React.useCallback((x: number) => {
    offset.current = x;
    const node = ref.current;
    if (node) node.style.transform = x === 0 ? '' : `translate3d(${x.toFixed(2)}px, 0, 0)`;
  }, []);

  const settle = React.useCallback(
    (v0: number) => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (reduced) {
        paint(0);
        raf.current = null;
        return;
      }
      const d0 = offset.current;
      const started = performance.now();
      const step = (now: number) => {
        const t = (now - started) / 1000;
        const d = (d0 + (v0 + OMEGA * d0) * t) * Math.exp(-OMEGA * t);
        if (Math.abs(d) < 0.34) {
          paint(0);
          raf.current = null;
          return;
        }
        paint(d);
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [paint, reduced],
  );

  React.useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [role="slider"], [data-no-swipe-nav], [data-swipe-deck]',
        )
      ) {
        return;
      }
      // An in-flight settle is grabbed where it is, not restarted from centre.
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      tracker.current.reset();
      tracker.current.push(e.clientX, 0, e.timeStamp);
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, claimed: false, rejected: false };
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id || g.rejected) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      tracker.current.push(e.clientX, 0, e.timeStamp);

      if (!g.claimed) {
        if (Math.abs(dx) < CLAIM_PX) {
          // Vertical intent settles first: once the finger has clearly gone down the page, this
          // gesture is out of the running for good and must not steal it back on a later wobble.
          if (Math.abs(dy) >= CLAIM_PX) g.rejected = true;
          return;
        }
        if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) {
          g.rejected = true;
          return;
        }
        g.claimed = true;
      }
      paint(rubberband(dx * LEAN_RATIO, LEAN_LIMIT_PX));
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      gesture.current = null;
      if (!g.claimed) return;

      const dx = e.clientX - g.x;
      const v = tracker.current.velocity(e.timeStamp).x;
      const direction: -1 | 1 = dx < 0 ? 1 : -1;
      // Distance and velocity are both expressed ALONG the direction of travel, so the projection
      // never has to reason about sign — and a finger that flicked back the way it came arrives
      // here as a negative velocity, which is precisely how `shouldCommit` cancels a gesture the
      // user changed their mind about mid-drag.
      const along = dx < 0 ? -1 : 1;
      const committed = shouldCommit(Math.abs(dx), v * along, COMMIT_PX, { minTravel: CLAIM_PX });
      if (committed) {
        // A day change is a real commit, not navigation chrome — it earns the one short tick.
        haptic('tick');
        navigateRef.current(direction);
      }
      // Either way the screen returns to centre carrying the release velocity: on a commit the
      // content underneath has already been replaced, so the settle reads as the new day sliding
      // into place rather than the old one snapping back.
      settle(tracker.current.velocity(e.timeStamp).x * LEAN_RATIO);
    };

    const onCancel = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      gesture.current = null;
      if (g.claimed) settle(0);
    };

    node.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [enabled, paint, settle]);

  return ref;
}
