'use client';

/**
 * MuscleMap (§4.1) — the data-driven anatomy map that doubles as the exercise "image", the
 * exercises muscle filter, and (via `heat` / `heatColors`) the weekly-volume heat view.
 * The FROZEN props contract lives in ./types and every existing call site keeps working.
 *
 * WHAT CHANGED IN THIS PASS
 * ------------------------------------------------------------------------------------------
 * `view="both"` used to mean "render two identical silhouettes side by side". On a 390 px phone
 * that produced two ~97 px-wide bodies you could not tell apart, with tap targets down to
 * 4 × 11 px. It now means:
 *
 *   · INTERACTIVE  → a {@link BodyExplorer}: ONE body at roughly double the width, a labelled
 *                    FRONT / BACK flip control, an on-body callout for the selection, and a
 *                    muscle rail as a second selection path. No caller had to change.
 *   · STATIC       → still two figures (a reference plate wants both faces at once), but now
 *                    visibly different bodies, each under a labelled orientation chip.
 *
 * Rendering itself lives in {@link BodyFigure}; this file is the contract + composition layer.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { MuscleSlug, MuscleView, MuscleMapProps } from './types';
import { BodyFigure } from './BodyFigure';
import { BodyExplorer, FrontGlyph, BackGlyph } from './BodyExplorer';
import {
  autoView,
  composeAriaLabel,
  slugsInView,
  styleFor,
  VIEW_CAPTION,
  VIEW_LABEL,
  type MuscleStyle,
} from './paint';

/**
 * ADDITIVE extension to the frozen {@link MuscleMapProps} contract (types.ts stays untouched).
 * Every existing caller passing `primary` / `secondary` / `heat` behaves exactly as before.
 */
export interface MuscleMapExtendedProps extends MuscleMapProps {
  /** per-muscle CSS colour (any valid SVG `fill`, including `var(--…)`) — powers the goal ramp */
  heatColors?: Partial<Record<MuscleSlug, string>>;
  /** the muscle currently selected — drawn with a gold ring and an on-body callout */
  selected?: MuscleSlug | null;
  /** accessible label override (heat modes otherwise get a generic one) */
  ariaLabel?: string;
  /**
   * Force the flip-one-body explorer on or off. Defaults to ON for interactive `view="both"`,
   * which is exactly the case that was unusable on a phone.
   */
  explorer?: boolean;
  /**
   * Which face the explorer opens on. Defaults to the auto pick. Surfaces where nearly every
   * muscle is painted (the goal heat map) should pass an explicit side, because "the view with
   * the most highlighted paths" is meaningless there — and an unpredictable opening view is
   * exactly the disorientation this redesign exists to remove.
   */
  initialView?: MuscleView;
  /** short badge per muscle for the explorer's rail + callout, e.g. "78%" */
  badges?: Partial<Record<MuscleSlug, string>>;
  /** rail dot colour per muscle */
  dotColors?: Partial<Record<MuscleSlug, string>>;
  /** explorer rail order (defaults to anatomical) */
  railOrder?: MuscleSlug[];
  /** hide the explorer's muscle rail */
  rail?: boolean;
  /** one-line prompt rendered under the explorer's figure */
  hint?: React.ReactNode;
  /** surface colour behind the explorer (used for the rail's scroll fade) */
  surface?: string;
}

/** The orientation chip that sits under a static figure — never leave a body unlabelled. */
export function OrientationChip({ view, className }: { view: MuscleView; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5',
        'text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground',
        className,
      )}
    >
      <span className="text-accent">{view === 'front' ? <FrontGlyph size={13} /> : <BackGlyph size={13} />}</span>
      {VIEW_LABEL[view]}
      <span className="font-medium normal-case tracking-normal opacity-70">{VIEW_CAPTION[view]}</span>
    </span>
  );
}

export function MuscleMap({
  primary = [],
  secondary = [],
  view = 'auto',
  heat,
  heatColors,
  selected = null,
  ariaLabel: ariaLabelProp,
  height = 260,
  interactive = false,
  onMuscleClick,
  labels = false,
  explorer,
  initialView,
  badges,
  dotColors,
  railOrder,
  rail,
  hint,
  surface,
  className,
}: MuscleMapExtendedProps) {
  const [hovered, setHovered] = React.useState<MuscleSlug | null>(null);
  const primarySet = React.useMemo(() => new Set(primary), [primary]);
  const secondarySet = React.useMemo(() => new Set(secondary), [secondary]);

  const styles = React.useMemo(() => {
    const out: Partial<Record<MuscleSlug, MuscleStyle>> = {};
    for (const slug of [...slugsInView('front'), ...slugsInView('back')]) {
      out[slug] = styleFor(slug, primarySet, secondarySet, heat, heatColors);
    }
    return out;
  }, [primarySet, secondarySet, heat, heatColors]);

  const resolved: MuscleView | 'both' =
    view === 'auto' ? autoView(primarySet, heat, heatColors) : view;
  const ariaLabel = ariaLabelProp ?? composeAriaLabel(primary, secondary, heat, heatColors);

  // The flip explorer replaces the unusable two-up whenever the map is interactive.
  const useExplorer = explorer ?? (resolved === 'both' && interactive);

  if (useExplorer) {
    return (
      <BodyExplorer
        className={className}
        styles={styles}
        selected={selected}
        onSelect={onMuscleClick}
        height={height}
        initialView={
          initialView ?? (resolved === 'both' ? autoView(primarySet, heat, heatColors) : resolved)
        }
        badges={badges}
        dotColors={dotColors}
        railOrder={railOrder}
        rail={rail}
        hint={hint}
        surface={surface}
        ariaLabel={ariaLabel}
      />
    );
  }

  const figure = (v: MuscleView, h: number) => (
    <BodyFigure
      key={v}
      view={v}
      height={h}
      styles={styles}
      selected={selected}
      hovered={hovered}
      interactive={interactive}
      labels={labels}
      onMuscleClick={onMuscleClick}
      onHover={setHovered}
    />
  );

  if (resolved === 'both') {
    // A static reference plate: both faces, each captioned, and 20 % larger than the caller's
    // height because the two-up layout has the room and the old size was unreadable.
    const h = Math.round(height * 1.2);
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn('flex items-start justify-center gap-3', className)}
      >
        {(['front', 'back'] as const).map((v) => (
          <figure key={v} className="flex flex-col items-center gap-1.5">
            {figure(v, h)}
            <figcaption>
              <OrientationChip view={v} />
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <div
      role={interactive ? 'group' : 'img'}
      aria-label={ariaLabel}
      className={cn('flex flex-col items-center justify-center gap-1.5', className)}
    >
      {figure(resolved, height)}
      <OrientationChip view={resolved} />
    </div>
  );
}
