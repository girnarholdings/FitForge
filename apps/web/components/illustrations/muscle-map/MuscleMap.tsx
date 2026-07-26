'use client';

/**
 * MuscleMap (§4.1) — the data-driven front/back anatomy map that doubles as the exercise
 * "image", the onboarding body picker, the exercises muscle filter, and (via `heat`) the
 * weekly-volume / recovery heatmap. FROZEN props contract lives in ./types.
 *
 * Rendering: one <svg> per view (viewBox 0 0 200 440). Muscles are simplified closed
 * polygons filled var(--muscle-base); `side:'right'` shapes are drawn once as authored and
 * once mirrored (scale(-1,1) translate(-200,0)). Highlighted muscles fill gold. Interactive
 * mode wraps each muscle in a focusable <a role="button">.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { MuscleSlug, MuscleView, MuscleMapProps } from './types';
import { MUSCLE_NAMES, ALL_MUSCLE_SLUGS } from './types';
import { MUSCLE_PATHS, MUSCLE_LABEL_ANCHORS } from './paths';
import { BODY_OUTLINE, ABS_CROSSLINES } from './outline';

const RATIO = 200 / 440;
const MIRROR = 'scale(-1,1) translate(-200,0)';

/**
 * ADDITIVE extension to the frozen {@link MuscleMapProps} contract (types.ts stays untouched):
 * `heatColors` paints each muscle with an explicit CSS colour instead of the gold opacity ramp.
 * That is what powers the "% of weekly goal" yellow→orange→red gradient. Every existing caller
 * passing `primary` / `secondary` / `heat` behaves exactly as before.
 *
 * Precedence per muscle: `heatColors` ▸ `heat` ▸ `primary` ▸ `secondary` ▸ inert.
 */
export interface MuscleMapExtendedProps extends MuscleMapProps {
  /** per-muscle CSS colour (any valid SVG `fill`, including `var(--…)`) */
  heatColors?: Partial<Record<MuscleSlug, string>>;
  /** the muscle currently selected — drawn with a gold ring */
  selected?: MuscleSlug | null;
  /** accessible label override (heat modes otherwise get a generic one) */
  ariaLabel?: string;
}

interface MuscleStyle {
  fill: string;
  opacity: number;
  highlighted: boolean;
  /** true when the fill came from `heatColors` (non-inert) — those get a crisper outline */
  colored: boolean;
}

function styleFor(
  slug: MuscleSlug,
  primary: Set<MuscleSlug>,
  secondary: Set<MuscleSlug>,
  heat: MuscleMapProps['heat'],
  heatColors?: MuscleMapExtendedProps['heatColors'],
): MuscleStyle {
  const explicit = heatColors?.[slug];
  if (explicit) {
    const inert = explicit === 'var(--muscle-base)';
    return { fill: explicit, opacity: inert ? 1 : 0.92, highlighted: !inert, colored: !inert };
  }
  if (heat && heat[slug] != null) {
    const v = Math.max(0, Math.min(1, heat[slug] as number));
    return { fill: 'var(--accent)', opacity: 0.15 + 0.75 * v, highlighted: true, colored: false };
  }
  if (primary.has(slug))
    return { fill: 'var(--accent)', opacity: 0.95, highlighted: true, colored: false };
  if (secondary.has(slug))
    return { fill: 'var(--accent)', opacity: 0.38, highlighted: true, colored: false };
  return { fill: 'var(--muscle-base)', opacity: 1, highlighted: false, colored: false };
}

/** Pick the auto view: the one with the most primary paths; ties → front. */
function autoView(
  primary: Set<MuscleSlug>,
  heat: MuscleMapProps['heat'],
  heatColors?: MuscleMapExtendedProps['heatColors'],
): MuscleView {
  const keys =
    primary.size > 0
      ? [...primary]
      : heat && Object.keys(heat).length > 0
        ? (Object.keys(heat) as MuscleSlug[])
        : heatColors
          ? (Object.keys(heatColors) as MuscleSlug[])
          : [];
  let front = 0;
  let back = 0;
  for (const slug of keys) {
    for (const p of MUSCLE_PATHS[slug] ?? []) {
      if (p.view === 'front') front += 1;
      else back += 1;
    }
  }
  return back > front ? 'back' : 'front';
}

function composeAriaLabel(
  primary: MuscleSlug[],
  secondary: MuscleSlug[],
  heat?: MuscleMapProps['heat'],
  heatColors?: MuscleMapExtendedProps['heatColors'],
): string {
  if (heatColors && Object.keys(heatColors).length > 0) return 'Muscle heat map';
  if (heat && Object.keys(heat).length > 0) return 'Muscle activity map';
  const parts: string[] = [];
  if (primary.length) parts.push(`primary: ${primary.map((m) => MUSCLE_NAMES[m]).join(', ')}`);
  if (secondary.length) parts.push(`secondary: ${secondary.map((m) => MUSCLE_NAMES[m]).join(', ')}`);
  return parts.length ? `Muscles worked — ${parts.join('; ')}` : 'Muscle map';
}

interface ViewFigureProps {
  view: MuscleView;
  primary: Set<MuscleSlug>;
  secondary: Set<MuscleSlug>;
  heat: MuscleMapProps['heat'];
  heatColors?: MuscleMapExtendedProps['heatColors'];
  selected?: MuscleSlug | null;
  interactive: boolean;
  labels: boolean;
  thumb: boolean;
  height: number;
  hovered: MuscleSlug | null;
  setHovered: React.Dispatch<React.SetStateAction<MuscleSlug | null>>;
  onMuscleClick?: (slug: MuscleSlug) => void;
}

function ViewFigure({
  view,
  primary,
  secondary,
  heat,
  heatColors,
  selected,
  interactive,
  labels,
  thumb,
  height,
  hovered,
  setHovered,
  onMuscleClick,
}: ViewFigureProps) {
  const slugsInView = ALL_MUSCLE_SLUGS.filter((slug) =>
    (MUSCLE_PATHS[slug] ?? []).some((p) => p.view === view),
  );
  // Draw unhighlighted first, highlighted on top so gold never gets overdrawn.
  const styled = slugsInView.map((slug) => ({
    slug,
    style: styleFor(slug, primary, secondary, heat, heatColors),
  }));
  const ordered = [
    ...styled.filter((s) => !s.style.highlighted && s.slug !== selected),
    ...styled.filter((s) => s.style.highlighted && s.slug !== selected),
    // the selected muscle always paints last so its gold ring is never clipped by a neighbour
    ...styled.filter((s) => s.slug === selected),
  ];

  const vb = labels ? '-66 0 332 440' : '0 0 200 440';
  const width = height * (labels ? 332 / 440 : RATIO);

  const renderMuscle = (slug: MuscleSlug, style: MuscleStyle) => {
    const paths = (MUSCLE_PATHS[slug] ?? []).filter((p) => p.view === view);
    const isHover = interactive && hovered === slug;
    const isSelected = selected === slug;
    const stroke =
      isHover || isSelected
        ? 'var(--accent)'
        : thumb && !style.highlighted
          ? 'none'
          : style.colored
            ? 'var(--body-outline)'
            : 'var(--muscle-line)';
    const strokeWidth = isSelected ? 2 : isHover ? 1.6 : 1;
    const shapes = paths.flatMap((p, i) => {
      const el = (
        <path
          key={`${i}-a`}
          d={p.d}
          fill={style.fill}
          fillOpacity={style.opacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          className="motion-safe:transition-[fill,fill-opacity] motion-safe:duration-500"
        />
      );
      if (p.side === 'center') return [el];
      return [
        el,
        <path
          key={`${i}-b`}
          d={p.d}
          transform={MIRROR}
          fill={style.fill}
          fillOpacity={style.opacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          className="motion-safe:transition-[fill,fill-opacity] motion-safe:duration-500"
        />,
      ];
    });

    if (!interactive) return <g key={slug}>{shapes}</g>;
    return (
      <a
        key={slug}
        role="button"
        tabIndex={0}
        aria-label={MUSCLE_NAMES[slug]}
        aria-pressed={isSelected || undefined}
        data-testid={`muscle-map-shape-${slug}`}
        className="cursor-pointer outline-none"
        onClick={() => onMuscleClick?.(slug)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onMuscleClick?.(slug);
          }
        }}
        onMouseEnter={() => setHovered(slug)}
        onMouseLeave={() => setHovered((cur) => (cur === slug ? null : cur))}
        onFocus={() => setHovered(slug)}
        onBlur={() => setHovered((cur) => (cur === slug ? null : cur))}
      >
        {shapes}
      </a>
    );
  };

  return (
    <svg
      viewBox={vb}
      width={width}
      height={height}
      role="presentation"
      className="block overflow-visible"
    >
      {/* silhouette outline */}
      <path
        d={BODY_OUTLINE[view]}
        fill="none"
        stroke="var(--body-outline)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {ordered.map(({ slug, style }) => renderMuscle(slug, style))}
      {/* abs "wall" crosslines (front only) */}
      {view === 'front' && !thumb && (
        <path d={ABS_CROSSLINES} fill="none" stroke="var(--muscle-line)" strokeWidth={1.1} strokeLinecap="round" />
      )}
      {/* leader-line labels */}
      {labels && !thumb && <Labels view={view} primary={primary} secondary={secondary} />}
    </svg>
  );
}

/** Distributed leader-line labels for highlighted muscles, on the nearer margin. */
function Labels({
  view,
  primary,
  secondary,
}: {
  view: MuscleView;
  primary: Set<MuscleSlug>;
  secondary: Set<MuscleSlug>;
}) {
  const highlighted = ALL_MUSCLE_SLUGS.filter((s) => primary.has(s) || secondary.has(s));
  const anchored = highlighted
    .map((slug) => {
      const a = MUSCLE_LABEL_ANCHORS[slug]?.[view];
      return a ? { slug, x: a[0], y: a[1] } : null;
    })
    .filter((v): v is { slug: MuscleSlug; x: number; y: number } => v !== null);

  const left = anchored.filter((a) => a.x < 100).sort((p, q) => p.y - q.y);
  const right = anchored.filter((a) => a.x >= 100).sort((p, q) => p.y - q.y);

  const place = (items: typeof anchored, side: 'left' | 'right') => {
    const gap = 22;
    const labelX = side === 'left' ? -62 : 262;
    const ys: number[] = [];
    let last = -Infinity;
    for (const it of items) {
      const y = Math.max(it.y, last + gap);
      ys.push(y);
      last = y;
    }
    return items.map((it, i) => {
      const ly = ys[i]!;
      const knee = side === 'left' ? it.x - 12 : it.x + 12;
      return (
        <g key={it.slug} aria-hidden>
          <path
            d={`M${it.x} ${it.y} L${knee} ${ly} L${labelX + (side === 'left' ? 6 : -6)} ${ly}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={0.8}
          />
          <circle cx={it.x} cy={it.y} r={1.6} fill="var(--accent)" />
          <text
            x={labelX}
            y={ly}
            dy="0.32em"
            textAnchor={side === 'left' ? 'end' : 'start'}
            fontSize={11}
            fontWeight={600}
            fill="var(--muted-foreground)"
          >
            {MUSCLE_NAMES[it.slug]}
          </text>
        </g>
      );
    });
  };

  return (
    <>
      {place(left, 'left')}
      {place(right, 'right')}
    </>
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
  className,
}: MuscleMapExtendedProps) {
  const [hovered, setHovered] = React.useState<MuscleSlug | null>(null);
  const primarySet = React.useMemo(() => new Set(primary), [primary]);
  const secondarySet = React.useMemo(() => new Set(secondary), [secondary]);

  const resolved: MuscleView | 'both' =
    view === 'auto' ? autoView(primarySet, heat, heatColors) : view;
  const ariaLabel = ariaLabelProp ?? composeAriaLabel(primary, secondary, heat, heatColors);

  const figure = (v: MuscleView) => (
    <ViewFigure
      key={v}
      view={v}
      primary={primarySet}
      secondary={secondarySet}
      heat={heat}
      heatColors={heatColors}
      selected={selected}
      interactive={interactive}
      labels={labels}
      thumb={false}
      height={height}
      hovered={hovered}
      setHovered={setHovered}
      onMuscleClick={onMuscleClick}
    />
  );

  return (
    <div role="img" aria-label={ariaLabel} className={cn('flex items-start justify-center gap-4', className)}>
      {resolved === 'both' ? (
        <>
          {figure('front')}
          {figure('back')}
        </>
      ) : (
        figure(resolved)
      )}
    </div>
  );
}
