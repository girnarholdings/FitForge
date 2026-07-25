'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon, XIcon, RepeatIcon } from './icons';

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
/** the card only claims the pointer after this much movement */
const CLAIM_PX = 10;
const MAX_ROTATE_DEG = 8;
const ROTATE_PER_PX = 0.06;
const EXIT_MS = 220;
const EXIT_MS_REDUCED = 120;
const SNAP_MS = 250;

const DEPTH_STYLE = [
  { scale: 1, y: 0, opacity: 1 },
  { scale: 0.94, y: 12, opacity: 0.85 },
  { scale: 0.88, y: 24, opacity: 0.6 },
] as const;

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

const ArrowUpIcon = ({ size = 22, ...p }: React.SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable="false"
    {...p}
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

/* ---------------------------------------------------------------------------------- hook */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/* --------------------------------------------------------------------------------- deck */

interface DragBookkeeping {
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
  claimed: boolean;
}

/**
 * A Tinder-style, fully keyboard- and button-accessible swipe deck (research §3).
 *
 * Gestures: drag LEFT / RIGHT / UP past ~35% of the card (or fling ≥ 0.4 px/ms) to commit;
 * anything less springs back. Every gesture has a single-tap equivalent in the button row and
 * an arrow-key equivalent on the focused card (WCAG 2.5.1 / 2.5.7), and undo is unlimited as
 * long as the parent keeps the history.
 *
 * Drag is applied imperatively (no React re-render per pointermove) so the card tracks the
 * finger on a phone; only commit/undo re-render. `prefers-reduced-motion` swaps the fling for
 * a short crossfade.
 *
 * The deck owns its own layout: a flexible card region plus a fixed action row, so a parent
 * can drop it into a `100svh` flex column and it will never create a scroll wall.
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
  className,
  'data-testid': testId,
}: SwipeDeckProps<T>) {
  const reduced = usePrefersReducedMotion();
  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const stampRefs = React.useRef<Record<SwipeDirection, HTMLDivElement | null>>({
    left: null,
    right: null,
    up: null,
  });
  const drag = React.useRef<DragBookkeeping>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    vx: 0,
    vy: 0,
    claimed: false,
  });

  const [size, setSize] = React.useState({ w: 320, h: 420 });
  const [exiting, setExiting] = React.useState<{
    key: string;
    item: T;
    dir: SwipeDirection;
    from: { dx: number; dy: number };
  } | null>(null);
  const [entering, setEntering] = React.useState<{ key: string; dir: SwipeDirection } | null>(null);

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

  const top = index >= 0 && index < items.length ? items[index] : undefined;
  const topKey = top !== undefined ? getKey(top) : null;
  const gesturesOn = top !== undefined && (isSwipeable ? isSwipeable(top) : true);

  /* --------------------------------------------------------------- imperative drag paint */

  const paint = React.useCallback(
    (dx: number, dy: number, animate: boolean) => {
      const el = cardRef.current;
      if (!el) return;
      const rot = Math.max(-MAX_ROTATE_DEG, Math.min(MAX_ROTATE_DEG, dx * ROTATE_PER_PX));
      el.style.transition = animate
        ? `transform ${SNAP_MS}ms cubic-bezier(0.22, 1.2, 0.36, 1)`
        : 'none';
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg)`;

      const upDominant = dy < 0 && Math.abs(dy) > 1.5 * Math.abs(dx);
      const o = {
        left: upDominant || dx >= 0 ? 0 : clamp01(-dx / thresholdX),
        right: upDominant || dx <= 0 ? 0 : clamp01(dx / thresholdX),
        up: upDominant ? clamp01(-dy / thresholdY) : 0,
      };
      (['left', 'right', 'up'] as const).forEach((d) => {
        const s = stampRefs.current[d];
        if (!s) return;
        s.style.transition = animate ? `opacity ${SNAP_MS}ms ease-out` : 'none';
        s.style.opacity = String(o[d]);
      });
    },
    [thresholdX, thresholdY],
  );

  const resetPaint = React.useCallback(() => paint(0, 0, true), [paint]);

  /* ------------------------------------------------------------------------- committing */

  const exitRef = React.useRef<HTMLDivElement | null>(null);

  const exitStartRotation = exiting
    ? Math.max(-MAX_ROTATE_DEG, Math.min(MAX_ROTATE_DEG, exiting.from.dx * ROTATE_PER_PX))
    : 0;

  const exitTransform = React.useMemo(() => {
    if (!exiting) return '';
    if (exiting.dir === 'up') {
      return `translate3d(${exiting.from.dx}px, ${-(size.h + 180)}px, 0) rotate(-4deg)`;
    }
    const sign = exiting.dir === 'right' ? 1 : -1;
    return `translate3d(${sign * (size.w + 160)}px, ${exiting.from.dy}px, 0) rotate(${sign * MAX_ROTATE_DEG * 1.6}deg)`;
  }, [exiting, size.h, size.w]);

  // Keyboard users must not lose the deck when the answered card unmounts.
  const refocus = React.useRef(false);

  const commit = React.useCallback(
    (dir: SwipeDirection, from: { dx: number; dy: number } = { dx: 0, dy: 0 }) => {
      if (top === undefined || topKey === null) return;
      refocus.current =
        typeof document !== 'undefined' && cardRef.current === document.activeElement;
      setEntering(null);
      setExiting({ key: topKey, item: top, dir, from });
      onSwipe(top, dir, index);
    },
    [index, onSwipe, top, topKey],
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
        : `transform ${EXIT_MS}ms cubic-bezier(0.32, 0, 0.67, 0), opacity ${EXIT_MS}ms ease-in`;
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
    setExiting(null);
    if (dir) setEntering({ key: `undo-${index}-${Date.now()}`, dir });
  }, [canUndo, index, onUndo]);

  // Clear the fly-in transform on the next frame so the restored card animates home.
  React.useEffect(() => {
    if (!entering) return;
    const raf = requestAnimationFrame(() => {
      const el = cardRef.current;
      if (!el) return;
      el.style.transition = `transform ${reduced ? EXIT_MS_REDUCED : SNAP_MS}ms cubic-bezier(0.22, 1.2, 0.36, 1), opacity 150ms ease-out`;
      el.style.transform = 'translate3d(0px, 0px, 0) rotate(0deg)';
      el.style.opacity = '1';
    });
    const t = window.setTimeout(() => setEntering(null), SNAP_MS + 60);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [entering, reduced]);

  /* --------------------------------------------------------------------- pointer events */

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gesturesOn || exiting) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const d = drag.current;
    d.pointerId = e.pointerId;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.vx = 0;
    d.vy = 0;
    d.claimed = false;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.claimed) {
      if (Math.abs(dx) < CLAIM_PX && Math.abs(dy) < CLAIM_PX) return;
      d.claimed = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.vx = (e.clientX - d.lastX) / dt;
    d.vy = (e.clientY - d.lastY) / dt;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    paint(dx, dy, false);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const claimed = d.claimed;
    d.pointerId = null;
    d.claimed = false;
    if (!claimed) return;

    const upDominant = dy < 0 && Math.abs(dy) > 1.5 * Math.abs(dx);
    if (upDominant && (Math.abs(dy) >= thresholdY || -d.vy >= FLING_VELOCITY)) {
      commit('up', { dx, dy });
      return;
    }
    if (!upDominant && (Math.abs(dx) >= thresholdX || Math.abs(d.vx) >= FLING_VELOCITY)) {
      commit(dx > 0 ? 'right' : 'left', { dx, dy });
      return;
    }
    resetPaint();
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
                ref={isTop ? cardRef : undefined}
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
                  'absolute inset-0 rounded-[24px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  isTop
                    ? gesturesOn
                      ? 'cursor-grab touch-none active:cursor-grabbing'
                      : 'touch-none'
                    : 'pointer-events-none',
                )}
                style={{
                  zIndex: 10 - depth,
                  transform: isTop
                    ? (enteringTransform ?? 'translate3d(0px, 0px, 0) rotate(0deg)')
                    : `translate3d(0px, ${d.y}px, 0) scale(${d.scale})`,
                  opacity: isTop && entering ? 0.35 : d.opacity,
                  transition:
                    entering || reduced
                      ? 'none'
                      : 'transform 180ms ease-out, opacity 180ms ease-out',
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
              transform: `translate3d(${exiting.from.dx}px, ${exiting.from.dy}px, 0) rotate(${exitStartRotation}deg)`,
              opacity: 1,
            }}
          >
            <div className="h-full w-full">{renderCard(exiting.item, { depth: 0, index })}</div>
          </div>
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
      style={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]"
    >
      <div className={cn('absolute inset-0 rounded-[24px]', STAMP_TINT[tone])} />
      <span
        className={cn(
          'absolute inline-flex items-center gap-1.5 rounded-chip border-2 px-3 py-1.5',
          'font-display text-xs font-bold uppercase tracking-[0.14em]',
          STAMP_TONE[tone],
          align === 'left' && 'left-5 top-5 -rotate-12',
          align === 'right' && 'right-5 top-5 rotate-12',
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
        'flex min-w-[92px] flex-col items-center gap-1.5 rounded-card px-2 py-1',
        'touch-manipulation transition-opacity duration-150 disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid h-[56px] w-[56px] place-items-center rounded-full border-2 transition-colors duration-150',
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
