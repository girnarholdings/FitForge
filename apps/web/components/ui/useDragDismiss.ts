'use client';

/**
 * DRAG-TO-DISMISS for the bottom sheet.
 *
 * The sheet has drawn a grabber pill since the day it shipped — the universal "drag me" affordance
 * — and nothing was behind it. Hinting at a gesture that does not exist is worse than not hinting
 * at all: the finger goes down, the surface does not move, and the app reads as a web page wearing
 * a native costume. This hook is what the pill promises.
 *
 * WHY POINTER EVENTS BY HAND rather than a library drag: the app ships `LazyMotion` with the
 * `domAnimation` bundle, and drag support lives in `domMax` — adopting it would put the gesture
 * feature code in every route's bundle to serve one component. The hand-rolled version also
 * expresses the rule a generic drag cannot: a sheet may only be dragged from its top edge, or from
 * anywhere once its content is scrolled to the top, so scrolling a long list never yanks the sheet
 * off the screen.
 *
 * WHY THE TRANSFORM IS WRITTEN DIRECTLY TO THE NODE: a React state update per `pointermove` is a
 * render per frame of every drag. The offset is written to `style.transform` (compositor-only) and
 * React is told nothing until the gesture commits — the same trade the swipe deck makes.
 *
 * WHAT MAKES IT FEEL PHYSICAL, in the order you notice it missing:
 *   1. 1:1 tracking from the grab point — the sheet stays under the thumb, offset included.
 *   2. Rubber-banding upward — dragging a sheet ABOVE its resting edge resists instead of stopping
 *      dead, so the top reads as a boundary rather than a bug.
 *   3. Momentum projection on release — a short flick with speed behind it dismisses; a slow haul
 *      the same distance does not. The decision is made on where the gesture was HEADED.
 *   4. Velocity handoff — whichever way it resolves, the animation starts at the finger's exact
 *      speed, so there is no seam where the drag ends and the animation begins.
 *   5. Interruptibility — a sheet mid-flight can be grabbed and reversed. The new gesture starts
 *      from the live on-screen offset, never from the logical target, so there is no jump.
 */

import * as React from 'react';
import {
  VelocityTracker,
  rubberband,
  shouldCommit,
  RELEASE_VELOCITY_KEEP,
} from '@/lib/gesture/physics';

/** Movement before a gesture is claimed as a drag — below this it is still a tap. */
const CLAIM_PX = 10;
/** Fraction of the sheet's height that counts as "far enough" absent any speed. */
const DISMISS_RATIO = 0.35;
/** Undershooting a tall sheet's ratio would make short sheets undismissable by distance alone. */
const DISMISS_MAX_PX = 180;
/** ω for the critically-damped return: SPRING.sheet is k=340, m=1 → √(k/m) ≈ 18.4. */
const OMEGA = 18.4;
/** A dismissal that is already travelling gets out of the way fast; this is its floor speed. */
const MIN_EXIT_VELOCITY = 1100;

export interface DragDismissOptions {
  /** Called once the gesture has committed AND the sheet has finished travelling off-screen. */
  onDismiss: () => void;
  /** Sheets are only draggable where a bottom sheet is a bottom sheet — phone widths. */
  enabled: boolean;
  /** Honour `prefers-reduced-motion`: no spring, no fling, just resolve. */
  reduced: boolean;
}

export interface DragDismissBinding {
  ref: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
  /** 0 = fully open, 1 = fully dismissed. Drives the scrim so it fades WITH the finger. */
  progressRef: React.RefObject<number>;
}

export function useDragDismiss({ onDismiss, enabled, reduced }: DragDismissOptions) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const scrimRef = React.useRef<HTMLElement | null>(null);
  const progressRef = React.useRef(0);

  const raf = React.useRef<number | null>(null);
  /**
   * The entrance defers its spring by one frame so the sheet paints once below the fold first.
   * That deferred frame has to be cancellable, because a sheet can be dismissed INSIDE it — a
   * keyboard user pressing Escape the instant a sheet appears, or a test doing the same. If it
   * fires anyway it calls `animateTo`, which cancels the exit animation whose completion callback
   * is the thing that unmounts the sheet, and the sheet is then stuck on screen forever.
   */
  const entranceRaf = React.useRef<number | null>(null);
  const offset = React.useRef(0);
  /**
   * True from the moment the sheet is committed to leaving until it has left.
   *
   * A drag may interrupt an ENTRANCE freely — that is the point of §3. It may not interrupt an
   * exit, and the reason is not taste: by then the parent has already flipped its `open` prop and
   * fired `onClose`, and this component has no way to ask for it back. A pointer-down during the
   * exit used to cancel the animation whose completion callback performs the unmount, leaving the
   * sheet frozen on screen forever, swallowing every click on the page behind it. A double-tap on
   * a confirm button was enough to do it.
   */
  const exiting = React.useRef(false);
  const tracker = React.useRef(new VelocityTracker());
  const gesture = React.useRef<{
    id: number;
    startY: number;
    /** offset the sheet already had when grabbed — this is what makes an interrupt seamless */
    baseOffset: number;
    claimed: boolean;
    height: number;
  } | null>(null);

  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  /** Write the current offset to the DOM. Compositor-only properties, nothing else. */
  const paint = React.useCallback((y: number) => {
    offset.current = y;
    const node = ref.current;
    if (node) node.style.transform = y === 0 ? '' : `translate3d(0, ${y.toFixed(2)}px, 0)`;
    const height = node?.offsetHeight ?? 0;
    const p = height > 0 ? Math.min(1, Math.max(0, y / height)) : 0;
    progressRef.current = p;
    // The scrim fades WITH the drag rather than only at the end. Without this the sheet slides
    // away over a backdrop that stays fully dark, which reads as two unrelated things happening.
    const scrim = scrimRef.current;
    if (scrim) scrim.style.opacity = p > 0 ? String(1 - p * 0.9) : '';
  }, []);

  const stopAnimation = React.useCallback(() => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  const cancelEntrance = React.useCallback(() => {
    if (entranceRaf.current !== null) {
      cancelAnimationFrame(entranceRaf.current);
      entranceRaf.current = null;
    }
  }, []);

  /**
   * Critically-damped analytic spring toward `target`, seeded with `v0`.
   *
   * Closed-form rather than a numerical integrator so the motion is identical regardless of frame
   * pacing — a dropped frame changes nothing about where the sheet is at time t, which is exactly
   * the property a stuttering phone needs. `x(t) = (d₀ + (v₀ + ω·d₀)·t)·e^(−ω·t)`.
   */
  const animateTo = React.useCallback(
    (target: number, v0: number, done?: () => void) => {
      stopAnimation();
      if (reduced) {
        paint(target);
        done?.();
        return;
      }
      const d0 = offset.current - target;
      const started = performance.now();
      const step = (now: number) => {
        const t = (now - started) / 1000;
        const d = (d0 + (v0 + OMEGA * d0) * t) * Math.exp(-OMEGA * t);
        // Below a third of a pixel nothing is visible and the tail can run for hundreds of ms.
        if (Math.abs(d) < 0.34) {
          paint(target);
          raf.current = null;
          done?.();
          return;
        }
        paint(target + d);
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [paint, reduced, stopAnimation],
  );

  React.useEffect(
    () => () => {
      stopAnimation();
      cancelEntrance();
    },
    [stopAnimation, cancelEntrance],
  );

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0 || exiting.current) return;
      const node = ref.current;
      if (!node) return;
      // Never steal the gesture from something the user is actually operating. A slider or a
      // horizontal chip row inside a sheet has its own claim on the finger.
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [data-no-sheet-drag]')) return;

      // An interrupt: whatever was animating stops HERE, at the pixel it had reached, and the new
      // gesture continues from that value. Starting from the target instead is the visible jump
      // that makes grabbed animations feel broken.
      stopAnimation();

      // NO POINTER CAPTURE HERE. Capturing on pointer-DOWN retargets the whole pointer sequence to
      // the panel, and `click` is then dispatched at the nearest common ancestor of down and up —
      // which becomes the panel rather than the button under the finger. Capturing on press
      // therefore silently kills every control inside every sheet. Capture is taken at the moment
      // the gesture is CLAIMED instead, where suppressing the click is exactly what is wanted.
      tracker.current.reset();
      tracker.current.push(0, e.clientY, e.timeStamp);
      gesture.current = {
        id: e.pointerId,
        startY: e.clientY,
        baseOffset: offset.current,
        claimed: false,
        height: node.offsetHeight || 1,
      };
    },
    [enabled, stopAnimation],
  );

  /**
   * Move and release are bound to the window rather than to React props so that a drag survives
   * the pointer leaving the panel, and so `pointermove` never schedules a React render.
   */
  React.useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.startY;
      tracker.current.push(0, e.clientY, e.timeStamp);

      if (!g.claimed) {
        if (Math.abs(dy) < CLAIM_PX) return;
        // A sheet may only be pulled down from a scroll position of zero. Otherwise a downward
        // swipe halfway through a long food list would fling the sheet away instead of scrolling,
        // which is the single most common way a draggable sheet becomes infuriating.
        if (dy > 0 && node.scrollTop > 0) {
          gesture.current = null;
          return;
        }
        g.claimed = true;
        // Now that this is unambiguously a drag, take the pointer. Tracking survives the finger
        // leaving the panel, and the click that would otherwise land on whatever control the
        // gesture started on is suppressed — a drag must never also press a button.
        node.setPointerCapture?.(e.pointerId);
      }

      const raw = g.baseOffset + dy;
      // Downward is free travel; upward is resisted against the sheet's own height so the top
      // edge reads as a soft boundary instead of a wall.
      const next = raw >= 0 ? raw : rubberband(raw, g.height);
      // While the sheet owns the gesture the browser must not also scroll or trigger pull-to-
      // refresh with it. Only after the claim, so an unclaimed tap still scrolls normally.
      if (e.cancelable) e.preventDefault();
      paint(next);
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      gesture.current = null;
      if (!g.claimed) return;
      if (node.hasPointerCapture?.(e.pointerId)) node.releasePointerCapture?.(e.pointerId);

      const v = tracker.current.velocity(e.timeStamp).y;
      const threshold = Math.min(DISMISS_MAX_PX, g.height * DISMISS_RATIO);
      if (offset.current > 0 && shouldCommit(offset.current, v, threshold)) {
        // Committed: continue OUT at no less than the speed it was already travelling, so the
        // dismissal is one continuous motion rather than a drag followed by an animation.
        const exitVelocity = Math.max(MIN_EXIT_VELOCITY, v * RELEASE_VELOCITY_KEEP);
        exiting.current = true;
        animateTo(g.height, exitVelocity, () => onDismissRef.current());
        return;
      }
      // Returned home, inheriting the release velocity so the seam is invisible.
      animateTo(0, v * RELEASE_VELOCITY_KEEP);
    };

    const onCancel = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      gesture.current = null;
      if (g.claimed) animateTo(0, 0);
    };

    // `passive: false` on move because a claimed drag must be able to preventDefault.
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [enabled, animateTo, paint]);

  /**
   * The entrance. The panel starts a full height below its resting place and springs up.
   *
   * This is the same code path as the return-from-drag, deliberately: a sheet arriving and a
   * sheet snapping back are the same object doing the same thing, and giving them separate
   * implementations is how the two quietly drift into feeling different.
   */
  const animateIn = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    exiting.current = false;
    cancelEntrance();
    paint(node.offsetHeight || 1);
    // A frame at the offscreen position before the spring starts, so the first visible frame is
    // the sheet below the fold rather than the sheet already halfway up.
    entranceRaf.current = requestAnimationFrame(() => {
      entranceRaf.current = null;
      // A dismissal that landed inside this frame owns the sheet now; starting the entrance on
      // top of it would cancel the exit and strand the sheet.
      if (exiting.current) return;
      animateTo(0, 0);
    });
  }, [animateTo, paint, cancelEntrance]);

  /**
   * The exit. Enter and exit travel the same path in opposite directions (§7) — a sheet that
   * arrived from the bottom edge leaves through the bottom edge, never by fading in place.
   */
  const animateOut = React.useCallback(
    (done: () => void) => {
      const node = ref.current;
      // Before the latch, so a still-pending entrance frame can never outlive the decision to go.
      cancelEntrance();
      exiting.current = true;
      if (!node) {
        done();
        return;
      }
      animateTo(node.offsetHeight || 1, MIN_EXIT_VELOCITY * 0.5, done);
    },
    [animateTo, cancelEntrance],
  );

  return { ref, scrimRef, progressRef, onPointerDown, animateIn, animateOut };
}
