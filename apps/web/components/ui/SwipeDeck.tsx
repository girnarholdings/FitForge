'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon, XIcon, RepeatIcon } from './icons';
import { Confetti, usePrefersReducedMotion, type BurstKind, type BurstSpec } from './Confetti';

/* --------------------------------------------------------------------------------- types */

export type SwipeDirection = 'left' | 'right' | 'up';

/** Imperative surface handed to a custom action row (e.g. a category interstitial). */
export interface SwipeDeckActionApi {
  swipe: (dir: SwipeDirection) => void;
  undo: () => void;
  canUndo: boolean;
}

export interface SwipeDeckProps<T> {
  /** full ordered card list; the deck renders `index`, `index + 1`, `index + 2` */
  items: readonly T[];
  /** controlled cursor — the parent advances it in `onSwipe` (and rewinds it in `onUndo`) */
  index: number;
  getKey: (item: T) => string;
  /** accessible name for the focusable top card, e.g. "Barbell, card 4 of 28" */
  getCardLabel: (item: T, index: number) => string;
  /** card body. `depth` is 0 for the top card, 1/2 for the two cards stacked behind it. */
  renderCard: (item: T, meta: { depth: number; index: number }) => React.ReactNode;
  onSwipe: (item: T, dir: SwipeDirection, index: number) => void;
  /** return the direction the restored card originally left in, so it can fly back in */
  onUndo?: () => SwipeDirection | void;
  canUndo?: boolean;
  /** cards that answer themselves (interstitials) opt out of gestures */
  isSwipeable?: (item: T) => boolean;
  /** replace the default three-button row for a given card */
  renderActions?: (item: T, api: SwipeDeckActionApi) => React.ReactNode;
  /** button + overlay-stamp copy (defaults to the equipment wording) */
  actionLabels?: { left: string; right: string; up: string };
  /** politely announced after each answer */
  announcement?: string;
  /** rendered when `index` runs past the end of `items` */
  emptyState?: React.ReactNode;
  /**
   * Which celebration fires on commit. Defaults to a gold spark for `up`, a light ripple for
   * `right` and nothing for `left`. Return `null` to stay quiet.
   */
  getBurst?: (item: T, dir: SwipeDirection) => BurstKind | null;
  /**
   * Decorative layer painted over the card area (combo chips, coach marks…). Rendered inside a
   * `pointer-events: none` absolute overlay so it can never shift layout or eat a gesture.
   */
  overlay?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

/* ----------------------------------------------------------------------------- constants */

/** commit at 35% of card width (≈120px on a 390px iPhone) … */
const COMMIT_RATIO_X = 0.35;
/** … or 30% of card height for the up-swipe … */
const COMMIT_RATIO_Y = 0.3;
/** … with a floor so tiny decks stay usable. */
const MIN_COMMIT_PX = 72;
/** … or a fling, regardless of distance. */
const FLING_VELOCITY = 0.4; // px/ms
/** a flick still has to *travel* a little, so a jittery tap can never commit */
const MIN_FLING_PX = 22;
/** the card only claims the pointer after this much movement */
const CLAIM_PX = 10;
const MAX_ROTATE_DEG = 8;
const ROTATE_PER_PX = 0.06;
const EXIT_MS = 260;
const EXIT_MS_REDUCED = 120;

/** how far ahead of the finger the card is allowed to lead, in ms of current velocity */
const LEAD_MS = 11;
const LEAD_MAX_PX = 14;
/** grab feedback — the card lifts a hair the moment it is claimed */
const GRAB_SCALE = 1.02;
/** critically-damped snap-back: ω ≈ 6.6 / settle-time → ~320ms to rest */
const SPRING_OMEGA = 20.5;
/** release velocity is inherited (damped) by the spring so a nudge still feels elastic */
const SPRING_VELOCITY_KEEP = 0.45;
/** how many pointermove samples the fling velocity is averaged over */
const VELOCITY_SAMPLES = 5;

const DEPTH_STYLE = [
  { scale: 1, y: 0, opacity: 1 },
  { scale: 0.94, y: 12, opacity: 0.85 },
  { scale: 0.88, y: 24, opacity: 0.6 },
] as const;

const BEHIND_TRANSITION = 'transform 180ms ease-out, opacity 180ms ease-out';

/** default fly-out heading when there is no meaningful release vector (button / keyboard) */
const DEFAULT_VECTOR: Record<SwipeDirection, { x: number; y: number }> = {
  left: { x: -1, y: -0.14 },
  right: { x: 1, y: -0.14 },
  up: { x: 0, y: -1 },
};

/* --------------------------------------------------------------------------------- icons */

/** Gold-filled star — the "have it and love it" signal. Local to the deck (no emoji, §2.4). */
export const StarIcon = ({ size = 24, ...p }: React.SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
    focusable="false"
    {...p}
  >
    <path d="M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.7l-5.52 2.9 1.05-6.15L3.06 9.1l6.18-.9L12 2.6z" />
  </svg>
);

/* ------------------------------------------------------------------------------- helpers */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Haptics are a progressive enhancement — silently absent on iOS Safari / desktop. */
function haptic(pattern: number | number[]): void {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    navigator.vibrate(pattern);
  } catch {
    /* some engines throw inside cross-origin iframes — never let feel break function */
  }
}

/* --------------------------------------------------------------------------------- deck */

interface Sample {
  x: number;
  y: number;
  t: number;
}

interface MotionState {
  mode: 'idle' | 'drag' | 'spring';
  /** rendered offset */
  x: number;
  y: number;
  /** raw pointer offset (drag target) */
  tx: number;
  ty: number;
  /** the small lead the card takes on the finger, from live velocity */
  leadX: number;
  leadY: number;
  /** spring velocity, px/s */
  vx: number;
  vy: number;
  scale: number;
  scaleTarget: number;
  raf: number | null;
  last: number;
}

/**
 * A Tinder-style, fully keyboard- and button-accessible swipe deck (research §3).
 *
 * Gestures: drag LEFT / RIGHT / UP past ~35% of the card (or flick ≥ 0.4 px/ms over ≥ 22px) to
 * commit; anything less springs back on a critically-damped spring (~320ms). Every gesture has a
 * single-tap equivalent in the button row and an arrow-key equivalent on the focused card
 * (WCAG 2.5.1 / 2.5.7), and undo is unlimited as long as the parent keeps the history.
 *
 * Feel: the card tracks the pointer 1:1 with a small velocity-derived lead, lifts to 1.02× on
 * grab, and the card *behind* is progressively promoted toward the front as the drag advances, so
 * the stack reads as physical. A commit flies the card out along the real release vector with its
 * rotation continuing, fires a haptic tick and pops a short gold burst.
 *
 * Drag is applied imperatively (no React re-render per pointermove) so it stays smooth on a phone;
 * only commit/undo re-render. `prefers-reduced-motion` swaps the fling for a short crossfade and
 * suppresses every celebration.
 *
 * The deck owns its own layout: a flexible card region plus a fixed action row, so a parent can
 * drop it into a `100svh` flex column and it will never create a scroll wall.
 */
export function SwipeDeck<T>({
  items,
  index,
  getKey,
  getCardLabel,
  renderCard,
  onSwipe,
  onUndo,
  canUndo = false,
  isSwipeable,
  renderActions,
  actionLabels = { left: "Don't have", right: 'Have it', up: 'Love it' },
  announcement,
  emptyState,
  getBurst,
  overlay,
  className,
  'data-testid': testId,
}: SwipeDeckProps<T>) {
  const reduced = usePrefersReducedMotion();
  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const behindRefs = React.useRef<Array<HTMLDivElement | null>>([null, null]);
  const stampRefs = React.useRef<Record<SwipeDirection, HTMLDivElement | null>>({
    left: null,
    right: null,
    up: null,
  });

  const motion = React.useRef<MotionState>({
    mode: 'idle',
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    leadX: 0,
    leadY: 0,
    vx: 0,
    vy: 0,
    scale: 1,
    scaleTarget: 1,
    raf: null,
    last: 0,
  });

  const pointerRef = React.useRef<{ id: number | null; startX: number; startY: number; claimed: boolean }>(
    { id: null, startX: 0, startY: 0, claimed: false },
  );
  const samplesRef = React.useRef<Sample[]>([]);
  /** which direction is currently past its commit line — drives the "armed" tick */
  const armedRef = React.useRef<SwipeDirection | null>(null);

  const [size, setSize] = React.useState({ w: 320, h: 420 });
  const [exiting, setExiting] = React.useState<{
    key: string;
    item: T;
    dir: SwipeDirection;
    from: { dx: number; dy: number };
    vec: { x: number; y: number };
  } | null>(null);
  const [entering, setEntering] = React.useState<{ key: string; dir: SwipeDirection } | null>(null);
  const [burst, setBurst] = React.useState<BurstSpec | null>(null);
  const burstSeq = React.useRef(0);

  // Measure the card area so thresholds and fly-out distances are geometry-correct.
  React.useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const thresholdX = Math.max(MIN_COMMIT_PX, size.w * COMMIT_RATIO_X);
  const thresholdY = Math.max(MIN_COMMIT_PX, size.h * COMMIT_RATIO_Y);

  // Latest geometry for the imperative painter, which is deliberately identity-stable.
  const thRef = React.useRef({ x: thresholdX, y: thresholdY });
  thRef.current = { x: thresholdX, y: thresholdY };

  const top = index >= 0 && index < items.length ? items[index] : undefined;
  const topKey = top !== undefined ? getKey(top) : null;
  const gesturesOn = top !== undefined && (isSwipeable ? isSwipeable(top) : true);

  /* --------------------------------------------------------------- imperative drag paint */

  /** Paint the whole stack from `motion.current`. Called from pointermove and from the rAF loop. */
  const paint = React.useCallback(() => {
    const m = motion.current;
    const th = thRef.current;
    const dx = m.x;
    const dy = m.y;

    const el = cardRef.current;
    if (el) {
      const rot = clamp(dx * ROTATE_PER_PX, -MAX_ROTATE_DEG, MAX_ROTATE_DEG);
      el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${m.scale.toFixed(4)})`;
    }

    // Directional intent — the stamp that matches the current heading ramps in, and crossing the
    // commit line "arms" it (brighter vignette + a haptic tick).
    const upDominant = dy < 0 && Math.abs(dy) > 1.5 * Math.abs(dx);
    const raw: Record<SwipeDirection, number> = {
      left: upDominant || dx >= 0 ? 0 : -dx / th.x,
      right: upDominant || dx <= 0 ? 0 : dx / th.x,
      up: upDominant ? -dy / th.y : 0,
    };
    const dirs: readonly SwipeDirection[] = ['left', 'right', 'up'];
    let armed: SwipeDirection | null = null;
    for (const d of dirs) {
      if (raw[d] >= 1) armed = d;
      const s = stampRefs.current[d];
      if (!s) continue;
      // Ease the ramp so intent reads well before the line, then saturates.
      const v = clamp01(raw[d]);
      s.style.opacity = String(v * v * (3 - 2 * v));
      s.dataset.armed = raw[d] >= 1 ? 'true' : 'false';
    }
    if (m.mode === 'drag' && armed !== armedRef.current) {
      if (armed !== null) haptic(8);
      armedRef.current = armed;
    } else if (m.mode !== 'drag') {
      armedRef.current = armed;
    }

    // Progressive promotion: the stack rises toward the front as the top card is dragged away.
    const p = clamp01(Math.max(Math.abs(dx) / th.x, Math.max(0, -dy) / th.y)) * 0.92;
    const inTransit = m.mode !== 'idle' || p > 0;
    for (let i = 0; i < 2; i++) {
      const el2 = behindRefs.current[i];
      if (!el2) continue;
      const from = DEPTH_STYLE[i + 1]!;
      const to = DEPTH_STYLE[i]!;
      const scale = from.scale + (to.scale - from.scale) * p;
      const yy = from.y + (to.y - from.y) * p;
      const op = from.opacity + (to.opacity - from.opacity) * p;
      el2.style.transition = inTransit ? 'none' : BEHIND_TRANSITION;
      el2.style.transform = `translate3d(0px, ${yy.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      el2.style.opacity = op.toFixed(3);
    }
  }, []);

  /* ------------------------------------------------------------------------- motion loop */

  const stepRef = React.useRef<(now: number) => void>(() => {});
  stepRef.current = (now: number) => {
    const m = motion.current;
    const dt = Math.min(0.05, Math.max(0.001, (now - m.last) / 1000));
    m.last = now;

    // Grab lift eases exponentially — frame-rate independent, no transition to fight.
    m.scale += (m.scaleTarget - m.scale) * (1 - Math.exp(-dt * 18));

    if (m.mode === 'drag') {
      m.x = m.tx + m.leadX;
      m.y = m.ty + m.leadY;
    } else if (m.mode === 'spring') {
      // Critically damped: a = -ω²x - 2ωv. Settles in ~320ms with no overshoot.
      const w = SPRING_OMEGA;
      m.vx += (-w * w * m.x - 2 * w * m.vx) * dt;
      m.vy += (-w * w * m.y - 2 * w * m.vy) * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (
        Math.abs(m.x) < 0.35 &&
        Math.abs(m.y) < 0.35 &&
        Math.abs(m.vx) < 10 &&
        Math.abs(m.vy) < 10
      ) {
        m.x = 0;
        m.y = 0;
        m.vx = 0;
        m.vy = 0;
        m.mode = 'idle';
      }
    }

    paint();

    if (m.mode !== 'idle' || Math.abs(m.scale - m.scaleTarget) > 0.0008) {
      m.raf = requestAnimationFrame((t) => stepRef.current(t));
    } else {
      m.scale = m.scaleTarget;
      m.raf = null;
      paint();
    }
  };

  const ensureLoop = React.useCallback(() => {
    const m = motion.current;
    if (m.raf !== null || typeof window === 'undefined') return;
    m.last = performance.now();
    m.raf = requestAnimationFrame((t) => stepRef.current(t));
  }, []);

  React.useEffect(
    () => () => {
      const m = motion.current;
      if (m.raf !== null) cancelAnimationFrame(m.raf);
      m.raf = null;
    },
    [],
  );

  const resetMotion = React.useCallback(() => {
    const m = motion.current;
    if (m.raf !== null) cancelAnimationFrame(m.raf);
    Object.assign(m, {
      mode: 'idle' as const,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      leadX: 0,
      leadY: 0,
      vx: 0,
      vy: 0,
      scale: 1,
      scaleTarget: 1,
      raf: null,
      last: 0,
    });
    armedRef.current = null;
    samplesRef.current = [];
  }, []);

  /** Re-home the stack after every render that isn't mid-gesture (React owns the resting state). */
  React.useLayoutEffect(() => {
    const m = motion.current;
    if (m.mode !== 'idle') return;
    if (!entering) {
      const el = cardRef.current;
      if (el) {
        el.style.transition = 'none';
        el.style.transform = 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)';
      }
    }
    for (let i = 0; i < 2; i++) {
      const el2 = behindRefs.current[i];
      if (!el2) continue;
      const d = DEPTH_STYLE[i + 1]!;
      el2.style.transition = BEHIND_TRANSITION;
      el2.style.transform = `translate3d(0px, ${d.y}px, 0) scale(${d.scale})`;
      el2.style.opacity = String(d.opacity);
    }
  });

  /* ------------------------------------------------------------------------- committing */

  const exitRef = React.useRef<HTMLDivElement | null>(null);

  const exitStartRotation = exiting
    ? clamp(exiting.from.dx * ROTATE_PER_PX, -MAX_ROTATE_DEG, MAX_ROTATE_DEG)
    : 0;

  /** Fly out along the ACTUAL release heading, with the rotation carrying on past the edge. */
  const exitTransform = React.useMemo(() => {
    if (!exiting) return '';
    const dist = Math.hypot(size.w, size.h) + 200;
    const spin = (exiting.dir === 'left' ? -1 : 1) * (exiting.dir === 'up' ? 10 : 26);
    const x = exiting.from.dx + exiting.vec.x * dist;
    const y = exiting.from.dy + exiting.vec.y * dist;
    return `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(exitStartRotation + spin).toFixed(1)}deg)`;
  }, [exitStartRotation, exiting, size.h, size.w]);

  // Keyboard users must not lose the deck when the answered card unmounts.
  const refocus = React.useRef(false);

  const commit = React.useCallback(
    (
      dir: SwipeDirection,
      from: { dx: number; dy: number } = { dx: 0, dy: 0 },
      release?: { x: number; y: number },
    ) => {
      if (top === undefined || topKey === null) return;

      // Blend the release heading with the committed direction so a diagonal flick still leaves
      // on the side the user actually chose.
      const base = DEFAULT_VECTOR[dir];
      let vx = release?.x ?? 0;
      let vy = release?.y ?? 0;
      const speed = Math.hypot(vx, vy);
      if (speed < 0.12) {
        const dLen = Math.hypot(from.dx, from.dy);
        if (dLen > 24) {
          vx = from.dx / dLen;
          vy = from.dy / dLen;
        } else {
          vx = base.x;
          vy = base.y;
        }
      } else {
        vx /= speed;
        vy /= speed;
      }
      if (dir === 'right') vx = Math.max(vx, 0.4);
      if (dir === 'left') vx = Math.min(vx, -0.4);
      if (dir === 'up') vy = Math.min(vy, -0.45);
      const len = Math.hypot(vx, vy) || 1;
      const vec = { x: vx / len, y: vy / len };

      haptic(dir === 'up' ? [12, 26, 16] : 14);

      const kind: BurstKind | null = getBurst
        ? getBurst(top, dir)
        : dir === 'up'
          ? 'spark'
          : dir === 'right'
            ? 'ripple'
            : null;
      if (kind && !reduced) {
        burstSeq.current += 1;
        setBurst({
          id: burstSeq.current,
          kind,
          x: size.w / 2 + from.dx * 0.55,
          y: size.h / 2 + from.dy * 0.55,
          power: kind === 'spark' ? 1 : 0.85,
        });
      }

      refocus.current =
        typeof document !== 'undefined' && cardRef.current === document.activeElement;
      resetMotion();
      setEntering(null);
      setExiting({ key: topKey, item: top, dir, from, vec });
      onSwipe(top, dir, index);
    },
    [getBurst, index, onSwipe, reduced, resetMotion, size.h, size.w, top, topKey],
  );

  React.useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  // Fly the committed card away, then drop it from the tree.
  React.useEffect(() => {
    if (!exiting) return;
    const ms = reduced ? EXIT_MS_REDUCED : EXIT_MS;
    const el = exitRef.current;
    const raf = requestAnimationFrame(() => {
      if (!el) return;
      el.style.transition = reduced
        ? `opacity ${EXIT_MS_REDUCED}ms ease-out`
        : `transform ${EXIT_MS}ms cubic-bezier(0.25, 0.4, 0.5, 1), opacity ${EXIT_MS}ms cubic-bezier(0.6, 0, 0.9, 0.4)`;
      if (!reduced) el.style.transform = exitTransform;
      el.style.opacity = '0';
    });
    const t = window.setTimeout(() => setExiting(null), ms + 40);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [exiting, exitTransform, reduced]);

  const handleUndo = React.useCallback(() => {
    if (!canUndo || !onUndo) return;
    const dir = onUndo();
    haptic(6);
    resetMotion();
    setBurst(null);
    setExiting(null);
    if (dir) setEntering({ key: `undo-${index}-${Date.now()}`, dir });
  }, [canUndo, index, onUndo, resetMotion]);

  // Clear the fly-in transform on the next frame so the restored card animates home.
  React.useEffect(() => {
    if (!entering) return;
    const raf = requestAnimationFrame(() => {
      const el = cardRef.current;
      if (!el) return;
      el.style.transition = `transform ${reduced ? EXIT_MS_REDUCED : 320}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease-out`;
      el.style.transform = 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)';
      el.style.opacity = '1';
    });
    const t = window.setTimeout(() => setEntering(null), 380);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [entering, reduced]);

  /* --------------------------------------------------------------------- pointer events */

  const sampleVelocity = (): { x: number; y: number } => {
    const s = samplesRef.current;
    if (s.length < 2) return { x: 0, y: 0 };
    const last = s[s.length - 1]!;
    // Oldest sample still inside a 90ms window — short enough that a flick at the very end of a
    // slow drag still reads as a flick.
    let first = s[0]!;
    for (let i = s.length - 1; i >= 0; i--) {
      first = s[i]!;
      if (last.t - first.t >= 55) break;
    }
    const dt = last.t - first.t;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gesturesOn || exiting) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = pointerRef.current;
    p.id = e.pointerId;
    p.startX = e.clientX;
    p.startY = e.clientY;
    p.claimed = false;
    samplesRef.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    const el = cardRef.current;
    if (el) el.style.transition = 'none';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointerRef.current;
    if (p.id !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;

    const s = samplesRef.current;
    s.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (s.length > VELOCITY_SAMPLES) s.shift();

    if (!p.claimed) {
      if (Math.abs(dx) < CLAIM_PX && Math.abs(dy) < CLAIM_PX) return;
      p.claimed = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const m = motion.current;
      m.mode = 'drag';
      m.scaleTarget = GRAB_SCALE;
      ensureLoop();
    }

    const v = sampleVelocity();
    const m = motion.current;
    m.tx = dx;
    m.ty = dy;
    m.leadX = clamp(v.x * LEAD_MS, -LEAD_MAX_PX, LEAD_MAX_PX);
    m.leadY = clamp(v.y * LEAD_MS, -LEAD_MAX_PX, LEAD_MAX_PX);
    m.x = m.tx + m.leadX;
    m.y = m.ty + m.leadY;
    paint(); // 1:1 with the finger — do not wait for the next frame
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointerRef.current;
    if (p.id !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    const claimed = p.claimed;
    p.id = null;
    p.claimed = false;
    if (!claimed) return;

    const v = sampleVelocity();
    const travelled = Math.hypot(dx, dy);
    const th = thRef.current;
    const upDominant = dy < 0 && Math.abs(dy) > 1.5 * Math.abs(dx);

    if (
      upDominant &&
      (Math.abs(dy) >= th.y || (-v.y >= FLING_VELOCITY && travelled >= MIN_FLING_PX))
    ) {
      commit('up', { dx, dy }, v);
      return;
    }
    if (
      !upDominant &&
      (Math.abs(dx) >= th.x || (Math.abs(v.x) >= FLING_VELOCITY && travelled >= MIN_FLING_PX))
    ) {
      commit(dx > 0 ? 'right' : 'left', { dx, dy }, v);
      return;
    }

    // Spring home, inheriting a damped share of the release velocity.
    const m = motion.current;
    m.mode = 'spring';
    m.vx = v.x * 1000 * SPRING_VELOCITY_KEEP;
    m.vy = v.y * 1000 * SPRING_VELOCITY_KEEP;
    m.scaleTarget = 1;
    armedRef.current = null;
    ensureLoop();
  };

  /* -------------------------------------------------------------------------- keyboard */

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      if (canUndo) {
        e.preventDefault();
        handleUndo();
      }
      return;
    }
    if (!gesturesOn) return;
    const map: Record<string, SwipeDirection> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
    };
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    commit(dir);
  };

  /* ---------------------------------------------------------------------------- render */

  const stack = React.useMemo(
    () =>
      items
        .slice(index, index + 3)
        .map((item, depth) => ({ item, depth, absolute: index + depth })),
    [index, items],
  );

  const api: SwipeDeckActionApi = { swipe: (d) => commit(d), undo: handleUndo, canUndo };

  const enteringTransform = entering
    ? entering.dir === 'up'
      ? `translate3d(0px, ${-(size.h + 120)}px, 0) rotate(-4deg)`
      : `translate3d(${(entering.dir === 'right' ? 1 : -1) * (size.w + 120)}px, 0, 0) rotate(${(entering.dir === 'right' ? 1 : -1) * MAX_ROTATE_DEG}deg)`
    : undefined;

  return (
    <div
      className={cn('flex min-h-0 flex-col', className)}
      data-testid={testId}
      onKeyDown={onKeyDown}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ---------------------------------------------------------------- card area */}
      <div ref={areaRef} className="relative min-h-0 flex-1 select-none">
        {top === undefined && !exiting && (
          <div className="absolute inset-0 grid place-items-center">{emptyState}</div>
        )}

        {stack
          .slice()
          .reverse()
          .map(({ item, depth, absolute }) => {
            const d = DEPTH_STYLE[Math.min(depth, DEPTH_STYLE.length - 1)] ?? DEPTH_STYLE[0];
            const isTop = depth === 0;
            const key = getKey(item);
            return (
              <div
                key={key}
                ref={(el) => {
                  if (isTop) cardRef.current = el;
                  else behindRefs.current[depth - 1] = el;
                }}
                data-testid={isTop ? 'swipe-deck-card' : undefined}
                role="group"
                aria-roledescription="swipeable card"
                aria-label={isTop ? getCardLabel(item, absolute) : undefined}
                aria-hidden={!isTop}
                tabIndex={isTop ? 0 : -1}
                onPointerDown={isTop ? onPointerDown : undefined}
                onPointerMove={isTop ? onPointerMove : undefined}
                onPointerUp={isTop ? endDrag : undefined}
                onPointerCancel={isTop ? endDrag : undefined}
                className={cn(
                  'absolute inset-0 rounded-[24px] [backface-visibility:hidden]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  isTop
                    ? gesturesOn
                      ? 'cursor-grab touch-none active:cursor-grabbing'
                      : 'touch-none'
                    : 'pointer-events-none',
                )}
                style={{
                  zIndex: 10 - depth,
                  willChange: isTop ? 'transform' : undefined,
                  transform: isTop
                    ? (enteringTransform ?? 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)')
                    : `translate3d(0px, ${d.y}px, 0) scale(${d.scale})`,
                  opacity: isTop && entering ? 0.35 : d.opacity,
                  transition: entering || reduced ? 'none' : BEHIND_TRANSITION,
                }}
              >
                <div className="pointer-events-none h-full w-full">
                  {renderCard(item, { depth, index: absolute })}
                </div>

                {isTop && (
                  <>
                    <DirectionStamp
                      ref={(el) => {
                        stampRefs.current.left = el;
                      }}
                      tone="mute"
                      align="right"
                      label={actionLabels.left}
                      icon={<XIcon size={18} />}
                    />
                    <DirectionStamp
                      ref={(el) => {
                        stampRefs.current.right = el;
                      }}
                      tone="gold"
                      align="left"
                      label={actionLabels.right}
                      icon={<CheckIcon size={18} />}
                    />
                    <DirectionStamp
                      ref={(el) => {
                        stampRefs.current.up = el;
                      }}
                      tone="love"
                      align="center"
                      label={actionLabels.up}
                      icon={<StarIcon size={18} />}
                    />
                  </>
                )}
              </div>
            );
          })}

        {/* committed card flying out */}
        {exiting && (
          <div
            key={`exit-${exiting.key}`}
            ref={exitRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[24px]"
            style={{
              zIndex: 20,
              willChange: 'transform, opacity',
              transform: `translate3d(${exiting.from.dx}px, ${exiting.from.dy}px, 0) rotate(${exitStartRotation}deg)`,
              opacity: 1,
            }}
          >
            <div className="h-full w-full">{renderCard(exiting.item, { depth: 0, index })}</div>
          </div>
        )}

        {/* celebration + parent-supplied decoration — never interactive, never in flow */}
        <Confetti burst={burst} data-testid="swipe-deck-burst" />
        {overlay && (
          <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">{overlay}</div>
        )}
      </div>

      {/* ------------------------------------------------------------------- action row */}
      <div className="shrink-0 pt-3">
        {top !== undefined && renderActions ? (
          renderActions(top, api)
        ) : (
          <DefaultActions
            api={api}
            labels={actionLabels}
            disabled={top === undefined}
            hint="Swipe the card, tap a button, or use the arrow keys."
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------- stamps */

const STAMP_TONE = {
  gold: 'border-accent bg-accent text-accent-foreground',
  love: 'border-accent bg-accent-muted text-accent',
  mute: 'border-border-strong bg-surface-2 text-muted-foreground',
} as const;

const STAMP_TINT = {
  gold: 'bg-[radial-gradient(120%_90%_at_100%_50%,var(--accent-muted),transparent_65%)]',
  love: 'bg-[radial-gradient(120%_90%_at_50%_0%,var(--accent-muted),transparent_65%)]',
  mute: 'bg-[radial-gradient(120%_90%_at_0%_50%,rgba(255,255,255,0.06),transparent_65%)]',
} as const;

/** Soft edge vignette that saturates once the drag is past the commit line. */
const STAMP_VIGNETTE = {
  gold: 'shadow-[inset_0_0_0_1px_rgba(228,184,77,0.35),inset_-40px_0_60px_-30px_rgba(228,184,77,0.75)] group-data-[armed=true]:shadow-[inset_0_0_0_2px_rgba(228,184,77,0.75),inset_-52px_0_78px_-24px_rgba(228,184,77,0.95)]',
  love: 'shadow-[inset_0_0_0_1px_rgba(228,184,77,0.35),inset_0_44px_66px_-34px_rgba(255,138,77,0.7)] group-data-[armed=true]:shadow-[inset_0_0_0_2px_rgba(240,198,95,0.85),inset_0_58px_86px_-26px_rgba(255,138,77,0.95)]',
  mute: 'shadow-[inset_0_0_0_1px_rgba(154,163,181,0.22),inset_40px_0_60px_-32px_rgba(154,163,181,0.5)] group-data-[armed=true]:shadow-[inset_0_0_0_2px_rgba(154,163,181,0.45),inset_52px_0_78px_-26px_rgba(154,163,181,0.7)]',
} as const;

const DirectionStamp = React.forwardRef<
  HTMLDivElement,
  {
    tone: keyof typeof STAMP_TONE;
    align: 'left' | 'right' | 'center';
    label: string;
    icon: React.ReactNode;
  }
>(function DirectionStamp({ tone, align, label, icon }, ref) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-armed="false"
      style={{ opacity: 0 }}
      className="group pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]"
    >
      <div className={cn('absolute inset-0 rounded-[24px]', STAMP_TINT[tone])} />
      <div
        className={cn(
          'absolute inset-0 rounded-[24px] transition-shadow duration-150',
          STAMP_VIGNETTE[tone],
        )}
      />
      <span
        className={cn(
          'absolute inline-flex items-center gap-1.5 rounded-chip border-2 px-3 py-1.5',
          'font-display text-xs font-bold uppercase tracking-[0.14em]',
          'transition-transform duration-150 group-data-[armed=true]:scale-110',
          STAMP_TONE[tone],
          align === 'left' && 'left-5 top-5 -rotate-12 origin-left',
          align === 'right' && 'right-5 top-5 rotate-12 origin-right',
          align === 'center' && 'left-1/2 top-5 -translate-x-1/2',
        )}
      >
        {icon}
        {label}
      </span>
    </div>
  );
});

/* ------------------------------------------------------------------------ default actions */

function ActionButton({
  tone,
  label,
  icon,
  onClick,
  disabled,
  testId,
}: {
  tone: 'mute' | 'love' | 'gold';
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        'group/act flex min-w-[92px] flex-col items-center gap-1.5 rounded-card px-2 py-1',
        'touch-manipulation transition-opacity duration-150 disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid h-[56px] w-[56px] place-items-center rounded-full border-2',
          'transition-transform duration-150 ease-out group-active/act:scale-90',
          tone === 'gold' && 'border-accent bg-accent text-accent-foreground',
          tone === 'love' && 'border-accent bg-accent-muted text-accent',
          tone === 'mute' && 'border-border-strong bg-surface-2 text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
    </button>
  );
}

function DefaultActions({
  api,
  labels,
  disabled,
  hint,
}: {
  api: SwipeDeckActionApi;
  labels: { left: string; right: string; up: string };
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-start justify-center gap-2" role="group" aria-label="Answer">
        <ActionButton
          tone="mute"
          label={labels.left}
          icon={<XIcon size={26} />}
          onClick={() => api.swipe('left')}
          disabled={disabled}
          testId="swipe-action-left"
        />
        <ActionButton
          tone="love"
          label={labels.up}
          icon={<StarIcon size={26} />}
          onClick={() => api.swipe('up')}
          disabled={disabled}
          testId="swipe-action-up"
        />
        <ActionButton
          tone="gold"
          label={labels.right}
          icon={<CheckIcon size={26} />}
          onClick={() => api.swipe('right')}
          disabled={disabled}
          testId="swipe-action-right"
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={api.undo}
          disabled={!api.canUndo}
          data-testid="swipe-action-undo"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-chip px-2 py-1.5 text-xs font-medium',
            'text-muted-foreground transition-opacity duration-150 disabled:opacity-30',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
        >
          <RepeatIcon size={14} />
          Undo
        </button>
        {hint && <p className="text-right text-[10px] leading-tight text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export { DefaultActions as SwipeDeckActions };
