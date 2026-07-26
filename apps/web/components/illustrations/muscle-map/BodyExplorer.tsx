'use client';

/**
 * BodyExplorer — ONE body you flip, instead of two look-alike bodies side by side.
 *
 * The problem this replaces: two silhouettes at ~97 px wide each on a 390 px phone, drawn from
 * the SAME outline path, unlabelled, with muscle regions as small as 4 × 11 px. Nobody could tell
 * which body was which, that the regions were tappable, or what a tap would do.
 *
 * The design:
 *   · ONE figure at roughly double the old width, so every region is a real target.
 *   · A FRONT / BACK segmented control with miniature orientation glyphs (a chest-and-collarbone
 *     torso vs. a spine-and-shoulder-blades torso) — you can read the switch without reading
 *     words, and the words are there anyway.
 *   · A physical flip between the two, so the two views are understood as one body turning round
 *     rather than two different people.
 *   · A caption naming the orientation AND what lives on that side.
 *   · A scrollable muscle rail: the second selection path for anything a thumb can't hit, which
 *     also FLIPS the body when you pick a muscle from the other side — the single most effective
 *     way to teach which muscles are on which face.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { MuscleSlug, MuscleView } from './types';
import { MUSCLE_NAMES, ALL_MUSCLE_SLUGS } from './types';
import { MUSCLE_LABEL_ANCHORS } from './paths';
import { VIEW_BOX } from './outline';
import { BodyFigure } from './BodyFigure';
import { slugsInView, viewOf, VIEW_LABEL, type MuscleStyle } from './paint';

const EXPLORER_CSS = `
@keyframes ffMmFlipL { from { transform: perspective(1000px) rotateY(-74deg); opacity: .15; } to { transform: none; opacity: 1; } }
@keyframes ffMmFlipR { from { transform: perspective(1000px) rotateY(74deg); opacity: .15; } to { transform: none; opacity: 1; } }
.ffMmFlipL { animation: ffMmFlipL 420ms cubic-bezier(.22,1,.36,1) both; }
.ffMmFlipR { animation: ffMmFlipR 420ms cubic-bezier(.22,1,.36,1) both; }
@media (prefers-reduced-motion: reduce) { .ffMmFlipL, .ffMmFlipR { animation: none; } }
`;

/** What a lifter actually finds on each face — the caption that makes the switch self-teaching. */
const VIEW_SUMMARY: Record<MuscleView, string> = {
  front: 'chest · abs · biceps · quads',
  back: 'traps · lats · glutes · hamstrings',
};

/* ------------------------------------------------------------------ orientation glyphs */

export function FrontGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="5.2" r="3.4" />
      {/* chin — curves toward you */}
      <path d="M10.2 6.9c.4.7 1 1.1 1.8 1.1s1.4-.4 1.8-1.1" />
      <path d="M6.4 20.5v-6.7c0-2.5 2.5-3.9 5.6-3.9s5.6 1.4 5.6 3.9v6.7" />
      {/* collarbones — the horizontal read that says "chest" */}
      <path d="M8.6 13.1h6.8" />
    </svg>
  );
}

export function BackGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="5.2" r="3.4" />
      {/* nape hairline — curves away from you */}
      <path d="M10.2 7.1c.4-.7 1-1.1 1.8-1.1s1.4.4 1.8 1.1" />
      <path d="M6.4 20.5v-6.7c0-2.5 2.5-3.9 5.6-3.9s5.6 1.4 5.6 3.9v6.7" />
      {/* spine — the vertical read that says "back" */}
      <path d="M12 11.4v8.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------------- the widget */

export interface BodyExplorerProps {
  /** resolved paint per muscle (see `paint.ts`) */
  styles?: Partial<Record<MuscleSlug, MuscleStyle>>;
  selected?: MuscleSlug | null;
  onSelect?: (slug: MuscleSlug) => void;
  /** figure height in px (the width follows the 200:440 ratio) */
  height?: number;
  /** which side to open on; the user can still flip */
  initialView?: MuscleView;
  /** short badge shown on the rail chip + the on-body callout, e.g. "78%" */
  badges?: Partial<Record<MuscleSlug, string>>;
  /** rail dot colour per muscle */
  dotColors?: Partial<Record<MuscleSlug, string>>;
  /** rail order (defaults to anatomical); muscles on the open side are hoisted first */
  railOrder?: MuscleSlug[];
  /** hide the muscle rail (e.g. when the caller already renders a full ranked list) */
  rail?: boolean;
  /** one-line prompt under the figure */
  hint?: React.ReactNode;
  /** CSS colour of the surface the explorer sits on — used for the rail's scroll fade */
  surface?: string;
  ariaLabel?: string;
  className?: string;
}

export function BodyExplorer({
  styles,
  selected = null,
  onSelect,
  height = 316,
  initialView = 'front',
  badges,
  dotColors,
  railOrder,
  rail = true,
  hint,
  surface = 'var(--surface-2)',
  ariaLabel = 'Muscle map',
  className,
}: BodyExplorerProps) {
  const [view, setView] = React.useState<MuscleView>(initialView);
  const [dir, setDir] = React.useState<'L' | 'R'>('L');
  const [hovered, setHovered] = React.useState<MuscleSlug | null>(null);
  const [flipped, setFlipped] = React.useState(false);

  const flipTo = React.useCallback(
    (next: MuscleView) => {
      if (next === view) return;
      setDir(next === 'back' ? 'L' : 'R');
      setFlipped(true);
      setView(next);
    },
    [view],
  );

  /** Selecting a muscle that lives on the other face turns the body round to show it. */
  const select = React.useCallback(
    (slug: MuscleSlug) => {
      const home = viewOf(slug);
      if (home !== 'both' && home !== view) flipTo(home);
      onSelect?.(slug);
    },
    [onSelect, view, flipTo],
  );

  const figW = (height * VIEW_BOX.w) / VIEW_BOX.h;
  const visible = slugsInView(view);

  // the on-body callout for the selected muscle
  const anchor = selected ? MUSCLE_LABEL_ANCHORS[selected]?.[view] : undefined;
  const pin = selected && visible.includes(selected) && anchor ? { slug: selected, anchor } : null;

  const order = railOrder ?? ALL_MUSCLE_SLUGS;
  const railSlugs = React.useMemo(() => {
    const here = order.filter((s) => visible.includes(s));
    const there = order.filter((s) => !visible.includes(s));
    return [...here, ...there];
  }, [order, visible]);

  return (
    <div className={cn('w-full', className)} data-testid="body-explorer">
      <style>{EXPLORER_CSS}</style>

      {/* ── orientation switch ─────────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Body orientation"
        className="mx-auto grid max-w-[300px] grid-cols-2 gap-1 rounded-full bg-surface p-1"
      >
        {(['front', 'back'] as const).map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`muscle-view-${v}`}
              onClick={() => flipTo(v)}
              className={cn(
                'flex min-h-[38px] items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors',
                active
                  ? 'bg-accent text-accent-foreground shadow-[0_1px_10px_-2px_var(--accent)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'front' ? <FrontGlyph /> : <BackGlyph />}
              {VIEW_LABEL[v]}
            </button>
          );
        })}
      </div>

      {/* ── the stage ──────────────────────────────────────────────────────────────────── */}
      <div
        className="relative mt-2 flex w-full justify-center"
        role="group"
        aria-label={ariaLabel}
        style={{ height }}
      >
        <div
          key={view}
          className={cn('relative', flipped && `ffMmFlip${dir}`)}
          style={{ width: figW, height }}
        >
          <BodyFigure
            view={view}
            height={height}
            styles={styles}
            selected={selected}
            hovered={hovered}
            interactive
            invite
            onMuscleClick={select}
            onHover={setHovered}
          />
          {pin && (
            <>
              {/* leader line out to the callout — an anatomy-plate pointer, not a headlight */}
              <span
                aria-hidden
                className="pointer-events-none absolute h-px -translate-y-1/2 bg-accent/60"
                style={{
                  left: `${(pin.anchor[0] / VIEW_BOX.w) * 100}%`,
                  right: '-14px',
                  top: `${(pin.anchor[1] / VIEW_BOX.h) * 100}%`,
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--surface)] ring-[1.5px] ring-accent"
                style={{
                  left: `${(pin.anchor[0] / VIEW_BOX.w) * 100}%`,
                  top: `${(pin.anchor[1] / VIEW_BOX.h) * 100}%`,
                }}
              />
            </>
          )}
        </div>

        {/* callout in the dead space beside the figure — instant, local feedback on tap */}
        {pin && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 max-w-[104px] -translate-y-1/2 rounded-full border border-accent/70 bg-elevated px-2 py-1 text-right text-[10px] font-bold leading-tight text-foreground shadow-[var(--shadow-card)]"
            style={{ top: `${(pin.anchor[1] / VIEW_BOX.h) * 100}%` }}
          >
            {MUSCLE_NAMES[pin.slug]}
            {badges?.[pin.slug] && (
              <span className="ml-1 tabular text-accent">{badges[pin.slug]}</span>
            )}
          </span>
        )}
      </div>

      {/* ── caption: which way is this, and what is on it ──────────────────────────────── */}
      <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="text-accent">{VIEW_LABEL[view]}</span>
        <span className="mx-1.5 opacity-40">·</span>
        <span className="normal-case tracking-normal">{VIEW_SUMMARY[view]}</span>
      </p>

      {hint && <div className="mt-1.5">{hint}</div>}

      {/* ── the second selection path ──────────────────────────────────────────────────── */}
      {rail && (
        <div className="relative mt-2.5">
          <ul
            data-testid="muscle-rail"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {railSlugs.map((slug) => {
              const active = selected === slug;
              const here = visible.includes(slug);
              const badge = badges?.[slug];
              return (
                <li key={slug} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => select(slug)}
                    aria-pressed={active}
                    aria-label={badge ? `${MUSCLE_NAMES[slug]}, ${badge}` : MUSCLE_NAMES[slug]}
                    className={cn(
                      'flex min-h-[38px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                      active
                        ? 'border-accent bg-accent-muted text-foreground'
                        : here
                          ? 'border-border bg-surface-2 text-muted-foreground hover:border-accent/50 hover:text-foreground'
                          : 'border-border/60 bg-surface text-muted-foreground/70 hover:text-foreground',
                    )}
                  >
                    {dotColors?.[slug] && (
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: dotColors[slug] }}
                      />
                    )}
                    <span className="whitespace-nowrap">{MUSCLE_NAMES[slug]}</span>
                    {badge && <span className="tabular text-[11px] opacity-80">{badge}</span>}
                    {!here && (
                      <span aria-hidden className="text-[10px] opacity-60">
                        ↻
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {/* right-edge fade so it is obvious the rail scrolls */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8"
            style={{ backgroundImage: `linear-gradient(to left, ${surface}, transparent)` }}
          />
        </div>
      )}
    </div>
  );
}
