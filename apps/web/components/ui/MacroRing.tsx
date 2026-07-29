'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { clamp } from '@/lib/utils';

export interface MacroRingProps {
  /** consumed value */
  value: number;
  /** target value */
  target: number;
  label?: string;
  /** center caption, defaults to `value / target` */
  caption?: React.ReactNode;
  /** small line rendered inside the ring, just under the caption (e.g. a unit like "left") */
  sublabel?: React.ReactNode;
  size?: number;
  stroke?: number;
  /** ring color CSS value; defaults to the accent token */
  color?: string;
  /** track (unfilled) color CSS value; defaults to the muted token */
  trackColor?: string;
  className?: string;
}

/* ── fitting text inside a circle ─────────────────────────────────────────────
   A ring is the one container where "it fits" is not a width check: the room available to a line
   of text depends on how far that line sits from the centre. The sublabel is the casualty —
   "PROTEIN LEFT" at the old fixed ratio was ~81px of glyphs inside a 76px opening, so it ran into
   the stroke on both sides.

   Fitting is done TWICE on purpose:

     1. An ESTIMATE from the character count, applied during render. Server-rendered HTML and the
        first client frame both get it, so nothing is ever painted overflowing — this is a static
        export, and a first frame that overflows then snaps is worse than one that is simply right.
     2. A MEASUREMENT (`getComputedTextLength`) in a layout effect, which corrects the estimate for
        the actual font, and covers captions that are elements rather than plain strings.

   Both only ever shrink. A short caption keeps its full size. */

/** Half-width of the circle's opening at vertical offset `dy` from the centre, minus breathing room. */
function openingAt(size: number, stroke: number, dy: number): number {
  const innerRadius = (size - 2 * stroke) / 2;
  const half = Math.sqrt(Math.max(0, innerRadius * innerRadius - dy * dy));
  // 3px each side so glyphs never sit ON the stroke, which reads as touching even when it isn't.
  return Math.max(8, 2 * (half - 3));
}

/** Plain text inside a node, when there is any — `"1,363"`, `142`, `<>{142}</>`. */
function textOf(node: React.ReactNode): string | null {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    const parts = node.map(textOf);
    return parts.every((p) => p !== null) ? parts.join('') : null;
  }
  if (React.isValidElement(node)) {
    const children = (node.props as { children?: React.ReactNode }).children;
    return children === undefined ? null : textOf(children);
  }
  return null;
}

/**
 * The font size to render at, so `node` fits an opening of `available` px.
 * `perChar` is the average glyph advance in em for the face in question — 0.58 for the bold
 * display numerals, ~0.66 for the letter-spaced uppercase sublabel.
 */
function fittedSize(node: React.ReactNode, base: number, available: number, perChar: number): number {
  const text = textOf(node);
  if (!text) return base;
  const estimated = text.length * perChar * base;
  return estimated <= available ? base : Math.max(base * 0.6, (available / estimated) * base);
}

/**
 * SVG progress ring for the calorie/macro dashboard (§2.3 Today). Pure/presentational so it can
 * be reused by WS-5's Today view. Overfill (>100%) is clamped visually but shown in the caption.
 */
export function MacroRing({
  value,
  target,
  label,
  caption,
  sublabel,
  size = 120,
  stroke = 10,
  color = 'var(--color-accent)',
  trackColor = 'var(--color-muted)',
  className,
}: MacroRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target > 0 ? clamp(value / target, 0, 1) : 0;
  const dash = circumference * pct;

  const hasSub = sublabel != null;
  const captionDy = hasSub ? -size * 0.06 : 0;
  const subDy = size * 0.13;

  /* Base ratios, a notch down from the originals: at 0.24 the caption crowded a 3-figure calorie
     number, which is the normal case on this screen rather than an edge one. */
  const captionRoom = openingAt(size, stroke, Math.abs(captionDy) + size * 0.11);
  const subRoom = openingAt(size, stroke, subDy + size * 0.05);
  const captionBase = fittedSize(caption ?? Math.round(value), size * 0.22, captionRoom, 0.58);
  const subBase = fittedSize(sublabel, size * 0.088, subRoom, 0.66);

  /* Measured correction. Starts at 1 so SSR and the first paint use the estimate above.
     IDEMPOTENT BY CONSTRUCTION: the measurement is divided by the font size it was taken at,
     giving glyph-width-per-px — a property of the string, not of the current scale — so the
     absolute answer is recomputed from `base` every time. An earlier version folded each
     measurement into the previous factor, which meant re-running the effect could shrink text
     twice and needed a reset pass to undo; this version can run any number of times and lands
     on the same number. */
  const captionRef = React.useRef<SVGTextElement>(null);
  const subRef = React.useRef<SVGTextElement>(null);
  const [scale, setScale] = React.useState({ caption: 1, sub: 1 });

  React.useLayoutEffect(() => {
    const fit = (el: SVGTextElement | null, applied: number, base: number, room: number): number => {
      if (!el || typeof el.getComputedTextLength !== 'function' || applied <= 0) return 1;
      const width = el.getComputedTextLength();
      if (!Number.isFinite(width) || width <= 0) return 1;
      const widthAtBase = (width / applied) * base;
      return widthAtBase > room ? Math.max(0.6, room / widthAtBase) : 1;
    };
    const next = {
      caption: fit(captionRef.current, captionBase * scale.caption, captionBase, captionRoom),
      sub: fit(subRef.current, subBase * scale.sub, subBase, subRoom),
    };
    setScale((prev) =>
      Math.abs(prev.caption - next.caption) < 0.01 && Math.abs(prev.sub - next.sub) < 0.01
        ? prev
        : next,
    );
  });

  return (
    <div className={cn('inline-flex flex-col items-center', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${value} of ${target}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {dash > stroke / 2 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text
          ref={captionRef}
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          dy={captionDy}
          className="fill-foreground font-display font-bold tabular"
          style={{ fontSize: captionBase * scale.caption }}
          data-testid="ring-caption"
        >
          {caption ?? `${Math.round(value)}`}
        </text>
        {hasSub && (
          <text
            ref={subRef}
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            dy={subDy}
            className="fill-muted-foreground font-semibold uppercase"
            style={{ fontSize: subBase * scale.sub, letterSpacing: '0.04em' }}
            data-testid="ring-sublabel"
          >
            {sublabel}
          </text>
        )}
      </svg>
      {label && <span className="mt-1 text-xs font-medium text-muted-foreground">{label}</span>}
    </div>
  );
}
