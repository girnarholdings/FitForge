'use client';

/**
 * BodyFigure — ONE oriented body. The single SVG renderer behind every muscle-map surface.
 *
 * Layers, bottom to top:
 *   1 · silhouette FILL (the body reads as a solid form, so a muscle plate on top of it reads as
 *       a distinct, tappable region rather than a scribble on the background)
 *   2 · muscle plates — inert first, highlighted next, the selected one last so its ring is never
 *       clipped by a neighbour
 *   3 · anatomical line-work — the chin/clavicles/sternum/navel/kneecaps on the front, the
 *       spine/scapulae/sacrum/heel cords on the back. This is what makes the two views
 *       unmistakable at a glance, before anyone reads a label.
 *   4 · the "invite" sweep — a slow gold light crossing the body twice on mount, so a first-time
 *       user can see the thing is alive. CSS-gated on prefers-reduced-motion.
 *   5 · the HIT layer — invisible, deliberately FATTER copies of each muscle (see
 *       `MUSCLE_HIT_PAD`), stacked smallest-last so a sliver like the lateral delt always wins
 *       its overlap with a big neighbour. This is what turns 4 × 11 px targets into thumb-sized
 *       ones without inflating the artwork.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { MuscleSlug, MuscleView } from './types';
import { MUSCLE_NAMES } from './types';
import {
  MUSCLE_PATHS,
  MUSCLE_HIT_PAD,
  MUSCLE_HIT_ORDER,
  MUSCLE_LABEL_ANCHORS,
  DEFAULT_HIT_PAD,
} from './paths';
import { BODY_OUTLINE, BODY_DETAILS, ABS_CROSSLINES, MIRROR_TRANSFORM, VIEW_BOX } from './outline';
import { slugsInView, INERT_STYLE, type MuscleStyle } from './paint';

const M = MIRROR_TRANSFORM;

export interface BodyFigureProps {
  view: MuscleView;
  /** rendered height in px; width follows the viewBox ratio */
  height: number;
  /** resolved paint per muscle (missing → inert) */
  styles?: Partial<Record<MuscleSlug, MuscleStyle>>;
  selected?: MuscleSlug | null;
  hovered?: MuscleSlug | null;
  interactive?: boolean;
  onMuscleClick?: (slug: MuscleSlug) => void;
  onHover?: (slug: MuscleSlug | null) => void;
  /** leader-line labels for every highlighted muscle (widens the viewBox) */
  labels?: boolean;
  /** how much anatomical line-work to draw — `key` keeps only the orientation tells */
  detail?: 'full' | 'key' | 'none';
  /** one-shot gold sweep telling a first-time user the regions are live */
  invite?: boolean;
  /** thumbnails drop the separation strokes on unhighlighted muscles */
  thumb?: boolean;
  className?: string;
}

/** Injected once per SVG. Identical text in every instance, so duplication is free. */
const FIGURE_CSS = `
@keyframes ffMmSweep {
  0%   { transform: translateY(-200px); opacity: 0; }
  15%  { opacity: .9; }
  70%  { opacity: .9; }
  100% { transform: translateY(500px); opacity: 0; }
}
.ffMmSweep { animation: ffMmSweep 2400ms cubic-bezier(.36,.1,.2,1) 500ms 2 both; transform-box: view-box; }
@keyframes ffMmRing { 0% { stroke-width: 5; opacity: .55; } 100% { stroke-width: 11; opacity: 0; } }
.ffMmRing { animation: ffMmRing 620ms cubic-bezier(.2,.9,.3,1) 1 both; }
@media (prefers-reduced-motion: reduce) {
  .ffMmSweep { display: none; }
  .ffMmRing  { display: none; }
}
`;

export function BodyFigure({
  view,
  height,
  styles,
  selected = null,
  hovered = null,
  interactive = false,
  onMuscleClick,
  onHover,
  labels = false,
  detail = 'full',
  invite = false,
  thumb = false,
  className,
}: BodyFigureProps) {
  const uid = React.useId().replace(/[:]/g, '');
  const inView = slugsInView(view);

  const vbX = labels ? -66 : VIEW_BOX.x;
  const vbW = labels ? 332 : VIEW_BOX.w;
  const width = (height * vbW) / VIEW_BOX.h;

  const styled = inView.map((slug) => ({ slug, style: styles?.[slug] ?? INERT_STYLE }));
  const ordered = [
    ...styled.filter((s) => !s.style.highlighted && s.slug !== selected),
    ...styled.filter((s) => s.style.highlighted && s.slug !== selected),
    ...styled.filter((s) => s.slug === selected),
  ];

  const details = detail === 'none' ? [] : BODY_DETAILS[view].filter((d) => detail !== 'key' || d.key);

  /* ---------------------------------------------------------------- one muscle, painted */
  const paintMuscle = (slug: MuscleSlug, style: MuscleStyle) => {
    const isHover = interactive && hovered === slug;
    const isSelected = selected === slug;
    const stroke = isSelected
      ? 'var(--accent)'
      : isHover
        ? 'var(--accent-soft)'
        : thumb && !style.highlighted
          ? 'none'
          : style.colored
            ? 'var(--surface)'
            : style.highlighted
              ? 'var(--muscle-line)'
              : // an untouched muscle still has to read as a REGION, or nobody knows it is a
                // target: outline it in the silhouette colour rather than the near-invisible
                // separation grey.
                'var(--body-outline)';
    const strokeWidth = isSelected ? 2.6 : isHover ? 2 : style.highlighted ? 1 : 1.4;

    return (MUSCLE_PATHS[slug] ?? [])
      .filter((p) => p.view === view)
      .flatMap((p, i) => {
        const shape = (key: string, transform?: string) => (
          <path
            key={key}
            d={p.d}
            transform={transform}
            fill={style.fill}
            fillOpacity={isSelected ? Math.min(1, style.opacity + 0.06) : style.opacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            className="motion-safe:transition-[fill,fill-opacity,stroke] motion-safe:duration-400"
          />
        );
        return p.side === 'center'
          ? [shape(`${i}a`)]
          : [shape(`${i}a`), shape(`${i}b`, M)];
      });
  };

  /* ------------------------------------------------------------------- the hit targets */
  const hitOrder = MUSCLE_HIT_ORDER.filter((s) => inView.includes(s));
  const hitShapes = (slug: MuscleSlug) => {
    const pad = MUSCLE_HIT_PAD[slug] ?? DEFAULT_HIT_PAD;
    return (MUSCLE_PATHS[slug] ?? [])
      .filter((p) => p.view === view)
      .flatMap((p, i) => {
        const hit = (key: string, transform?: string) => (
          <path
            key={key}
            d={p.d}
            transform={transform}
            fill="none"
            stroke="transparent"
            strokeWidth={pad * 2}
            strokeLinejoin="round"
            pointerEvents="all"
          />
        );
        return p.side === 'center' ? [hit(`${i}a`)] : [hit(`${i}a`), hit(`${i}b`, M)];
      });
  };

  const outline = BODY_OUTLINE[view];

  return (
    <svg
      viewBox={`${vbX} ${VIEW_BOX.y} ${vbW} ${VIEW_BOX.h}`}
      width={width}
      height={height}
      role="presentation"
      focusable="false"
      className={cn('block overflow-visible', className)}
    >
      <defs>
        <style>{FIGURE_CSS}</style>
        <clipPath id={`${uid}-body`}>
          <path d={outline} />
          <path d={outline} transform={M} />
        </clipPath>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 1 · the body as a solid form. Translucent `--muscle-base` sits between the page surface
             and a muscle plate in BOTH themes, so the silhouette reads on `surface` (sheets) and
             on `surface-2` (cards) without the caller telling us which it is. */}
      <g fill="var(--muscle-base)" fillOpacity={0.5}>
        <path d={outline} />
        <path d={outline} transform={M} />
      </g>

      {/* 2 · muscle plates */}
      <g>{ordered.map(({ slug, style }) => <g key={slug}>{paintMuscle(slug, style)}</g>)}</g>

      {/* the abdominal "wall" reads as a front-only landmark */}
      {view === 'front' && detail === 'full' && (
        <path
          d={ABS_CROSSLINES}
          fill="none"
          stroke="var(--muscle-line)"
          strokeWidth={1.1}
          strokeLinecap="round"
          opacity={0.9}
        />
      )}

      {/* 3 · orientation line-work, painted OVER the plates so it survives a hot fill */}
      <g fill="none" stroke="var(--body-outline)" strokeLinecap="round" strokeLinejoin="round">
        {details.flatMap((d, i) =>
          d.side === 'center'
            ? [<path key={`d${i}`} d={d.d} strokeWidth={d.weight ?? 1} />]
            : [
                <path key={`d${i}a`} d={d.d} strokeWidth={d.weight ?? 1} />,
                <path key={`d${i}b`} d={d.d} transform={M} strokeWidth={d.weight ?? 1} />,
              ],
        )}
      </g>

      {/* the silhouette edge, last so nothing bleeds past it */}
      <g fill="none" stroke="var(--body-outline)" strokeLinejoin="round" strokeLinecap="round">
        <path d={outline} strokeWidth={1.6} />
        <path d={outline} transform={M} strokeWidth={1.6} />
      </g>

      {/* 4 · "these are live" — one gold pass down the body, twice, then it stops */}
      {invite && interactive && !selected && (
        <g clipPath={`url(#${uid}-body)`} pointerEvents="none" aria-hidden>
          <rect
            x={0}
            y={0}
            width={VIEW_BOX.w}
            height={120}
            fill={`url(#${uid}-sweep)`}
            className="ffMmSweep"
          />
        </g>
      )}

      {/* the selected muscle gets a one-shot expanding gold ring on top of its solid ring */}
      {selected && inView.includes(selected) && (
        <g pointerEvents="none" aria-hidden fill="none" stroke="var(--accent)">
          {(MUSCLE_PATHS[selected] ?? [])
            .filter((p) => p.view === view)
            .flatMap((p, i) =>
              p.side === 'center'
                ? [<path key={`r${i}`} d={p.d} className="ffMmRing" />]
                : [
                    <path key={`r${i}a`} d={p.d} className="ffMmRing" />,
                    <path key={`r${i}b`} d={p.d} transform={M} className="ffMmRing" />,
                  ],
            )}
        </g>
      )}

      {/* 5 · hit targets — invisible, fattened, small-muscle-wins ordering */}
      {interactive && (
        <g>
          {hitOrder.map((slug) => (
            <a
              key={slug}
              role="button"
              tabIndex={0}
              aria-label={MUSCLE_NAMES[slug]}
              aria-pressed={selected === slug || undefined}
              data-testid={`muscle-map-shape-${slug}`}
              className="cursor-pointer outline-none"
              onClick={() => onMuscleClick?.(slug)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onMuscleClick?.(slug);
                }
              }}
              onMouseEnter={() => onHover?.(slug)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(slug)}
              onBlur={() => onHover?.(null)}
            >
              {hitShapes(slug)}
            </a>
          ))}
        </g>
      )}

      {labels && <Labels view={view} slugs={styled.filter((s) => s.style.highlighted).map((s) => s.slug)} />}
    </svg>
  );
}

/**
 * Leader-line labels for highlighted muscles. Every muscle is bilateral, so half of them are
 * labelled off the LEFT copy (anchor mirrored to `200 - x`) and half off the right — which fills
 * both margins instead of stacking every label down one side.
 */
function Labels({ view, slugs }: { view: MuscleView; slugs: MuscleSlug[] }) {
  const anchored = slugs
    .map((slug) => {
      const a = MUSCLE_LABEL_ANCHORS[slug]?.[view];
      return a ? { slug, x: a[0], y: a[1] } : null;
    })
    .filter((v): v is { slug: MuscleSlug; x: number; y: number } => v !== null)
    .sort((p, q) => p.y - q.y);

  const half = Math.ceil(anchored.length / 2);
  const groups: { side: 'left' | 'right'; items: typeof anchored }[] = [
    { side: 'left', items: anchored.filter((_, i) => i % 2 === 0).slice(0, half) },
    { side: 'right', items: anchored.filter((_, i) => i % 2 === 1) },
  ];

  return (
    <>
      {groups.flatMap(({ side, items }) => {
        const gap = 21;
        let last = -Infinity;
        return items.map((it) => {
          const ly = Math.max(it.y, last + gap);
          last = ly;
          const ax = side === 'left' ? 200 - it.x : it.x;
          const knee = side === 'left' ? ax - 12 : ax + 12;
          const edge = side === 'left' ? -58 : 258;
          return (
            <g key={`${side}-${it.slug}`} aria-hidden>
              <path
                d={`M${ax} ${it.y} L${knee} ${ly} L${edge} ${ly}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth={0.8}
              />
              <circle cx={ax} cy={it.y} r={1.8} fill="var(--accent)" />
              <text
                x={side === 'left' ? -62 : 262}
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
      })}
    </>
  );
}
