'use client';

/**
 * Inline-SVG charts (no chart library — §2.3 "charts via a light lib or inline SVG").
 * Pure/presentational, theme-aware via the design tokens (accent/muted/foreground CSS vars).
 */
import * as React from 'react';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
}

/** Compact trend line for the Today weight card (§2.3). */
export function Sparkline({
  data,
  width = 160,
  height = 44,
  className,
  strokeWidth = 2,
}: SparklineProps) {
  if (data.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth;
  const stepX = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="Trend"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={strokeWidth + 1} fill="var(--color-accent)" />
    </svg>
  );
}

export interface LinePoint {
  label: string;
  value: number;
}
export interface LineChartProps {
  data: LinePoint[];
  height?: number;
  className?: string;
  unit?: string;
  color?: string;
}

/** Full-width responsive line chart (weight / measurement history). */
export function LineChart({
  data,
  height = 200,
  className,
  unit = '',
  color = 'var(--color-accent)',
}: LineChartProps) {
  const width = 320;
  const padL = 34;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  if (data.length < 2) {
    return <div className={cn('text-sm text-muted-foreground', className)}>Not enough data yet.</div>;
  }
  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    /* A flat series — two identical weigh-ins is the normal case, not an edge — must read as a
       level line through the middle of the plot. Without the pad it maps to the plot FLOOR with
       three identical axis labels overprinted, which reads as an empty chart. (TrendLine already
       pads; this keeps the two charts telling the same story.) */
    const pad = Math.max(1, Math.abs(max) * 0.05);
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const stepX = plotW / (data.length - 1);
  const pts = data.map((d, i) => {
    const x = padL + i * stepX;
    const y = padT + (1 - (d.value - min) / span) * plotH;
    return [x, y] as const;
  });
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1]![0].toFixed(1)} ${padT + plotH} L${pts[0]![0].toFixed(1)} ${padT + plotH} Z`;
  const gridVals = [max, (max + min) / 2, min];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      role="img"
      aria-label="History chart"
      preserveAspectRatio="none"
    >
      {gridVals.map((gv, i) => {
        const y = padT + (1 - (gv - min) / span) * plotH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--color-border)" strokeWidth={1} />
            <text x={2} y={y + 3} fontSize={9} fill="var(--color-muted-foreground)">
              {Math.round(gv)}
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.4} fill={color} />
      ))}
      {data.map((d, i) =>
        i % Math.ceil(data.length / 6) === 0 || i === data.length - 1 ? (
          <text
            key={i}
            x={padL + i * stepX}
            y={height - 6}
            fontSize={8}
            textAnchor="middle"
            fill="var(--color-muted-foreground)"
          >
            {d.label}
          </text>
        ) : null,
      )}
      {unit && (
        <text x={width - padR} y={padT + 6} fontSize={9} textAnchor="end" fill="var(--color-muted-foreground)">
          {unit}
        </text>
      )}
    </svg>
  );
}

export interface BarPoint {
  label: string;
  value: number;
  color?: string;
}
export interface MiniBarsProps {
  data: BarPoint[];
  height?: number;
  className?: string;
}

/** Small labelled bar row (macro split, per-muscle volume). */
export function MiniBars({ data, height = 120, className }: MiniBarsProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn('flex items-end gap-3', className)} style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${(d.value / max) * 100}%`,
                backgroundColor: d.color ?? 'var(--color-accent)',
                minHeight: 4,
              }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════ time-series primitives (phone-first, tappable) ══ */

/**
 * Every chart below is authored inline (no chart library, no runtime deps) and sized for a 390 px
 * phone: a 320-unit viewBox scaled to 100 % width, ~11 px minimum type, and a tap target per
 * datum that publishes a value read-out to the parent. Selection is plain React state, so the
 * charts work identically with `prefers-reduced-motion` (the only motion is an opt-in
 * `motion-safe` bar grow).
 */

const VB_W = 320;

export interface SeriesPoint {
  /** x-axis label, e.g. "Jul 20" */
  label: string;
  value: number;
  /** rendered in the read-out instead of `value` */
  display?: string;
  /** dim the datum (used for the in-progress week) */
  provisional?: boolean;
}

export interface ColumnChartProps {
  data: SeriesPoint[];
  height?: number;
  /** horizontal reference line, e.g. the 8-week average */
  reference?: { value: number; label: string } | null;
  /** index the parent considers selected (null = none) */
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  color?: string;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}

/**
 * Weekly column chart with a dashed reference line and a tap target per column.
 * The in-progress week is drawn hatched so a half-finished week never reads as a collapse.
 */
export function ColumnChart({
  data,
  height = 148,
  reference = null,
  selected = null,
  onSelect,
  color = 'var(--color-accent)',
  ariaLabel = 'Weekly totals',
  className,
  testId,
}: ColumnChartProps) {
  const padT = 8;
  const padB = 18;
  const plotH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value), reference?.value ?? 0);
  const n = Math.max(1, data.length);
  const slot = VB_W / n;
  const barW = Math.min(26, Math.max(6, slot * 0.62));
  // Unique per instance — several ColumnCharts share a page and SVG ids are document-global.
  const hatchId = `ff-hatch-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${height}`}
      className={cn('block h-auto w-full', className)}
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <defs>
        <pattern id={hatchId} width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill={color} opacity={0.22} />
          <line x1="0" y1="0" x2="0" y2="4" stroke={color} strokeWidth="2" opacity={0.75} />
        </pattern>
      </defs>

      {/* baseline */}
      <line
        x1={0}
        y1={padT + plotH}
        x2={VB_W}
        y2={padT + plotH}
        stroke="var(--color-border)"
        strokeWidth={1}
      />

      {reference && reference.value > 0 && (
        <g>
          <line
            x1={0}
            y1={padT + plotH - (reference.value / max) * plotH}
            x2={VB_W}
            y2={padT + plotH - (reference.value / max) * plotH}
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.7}
          />
          <text
            // 2 units in from the viewBox edge — flush against it the final glyph gets clipped.
            x={VB_W - 2}
            y={padT + plotH - (reference.value / max) * plotH - 3}
            fontSize={9}
            textAnchor="end"
            fill="var(--color-muted-foreground)"
          >
            {reference.label}
          </text>
        </g>
      )}

      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0;
        const x = i * slot + (slot - barW) / 2;
        const y = padT + plotH - h;
        const isSel = selected === i;
        return (
          <g key={`${d.label}-${i}`}>
            {isSel && (
              <rect
                x={x - 2}
                y={padT}
                width={barW + 4}
                height={plotH}
                rx={4}
                fill="var(--color-accent)"
                opacity={0.12}
              />
            )}
            {h > 0 && (
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                fill={d.provisional ? `url(#${hatchId})` : color}
                opacity={isSel || selected === null ? 1 : 0.45}
                className="motion-safe:transition-[height,y,opacity] motion-safe:duration-500"
              />
            )}
            {/* full-height tap target */}
            <rect
              x={i * slot}
              y={0}
              width={slot}
              height={height}
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={`${d.label}: ${d.display ?? d.value}`}
              className="cursor-pointer outline-none"
              onClick={() => onSelect?.(isSel ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(isSel ? null : i);
                }
              }}
            />
          </g>
        );
      })}

      {data.map((d, i) => {
        const every = Math.max(1, Math.ceil(n / 5));
        if (i % every !== 0 && i !== n - 1) return null;
        return (
          <text
            key={`lab-${i}`}
            x={i * slot + slot / 2}
            y={height - 5}
            fontSize={9}
            textAnchor="middle"
            fill="var(--color-muted-foreground)"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

export interface TrendLineProps {
  data: SeriesPoint[];
  height?: number;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  color?: string;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}

/**
 * Compact line chart with a filled area, per-point tap targets, and min/max gridlines.
 * Used for the estimated-1RM strength trend and the body-weight trend.
 */
export function TrendLine({
  data,
  height = 150,
  selected = null,
  onSelect,
  color = 'var(--color-accent)',
  ariaLabel = 'Trend',
  className,
  testId,
}: TrendLineProps) {
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const plotW = VB_W - padL - padR;
  const plotH = height - padT - padB;

  if (data.length === 0) {
    return <div className={cn('text-sm text-muted-foreground', className)}>No data yet.</div>;
  }

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.15 || Math.max(1, rawMax * 0.05);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const span = max - min || 1;
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const pts = data.map((d, i) => {
    const x = padL + (data.length > 1 ? i * stepX : plotW / 2);
    const y = padT + (1 - (d.value - min) / span) * plotH;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)} ${padT + plotH} L${pts[0]![0].toFixed(1)} ${padT + plotH} Z`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${height}`}
      className={cn('block h-auto w-full', className)}
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {[rawMax, rawMin].map((gv, i) => {
        const y = padT + (1 - (gv - min) / span) * plotH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={VB_W - padR} y2={y} stroke="var(--color-border)" strokeWidth={1} />
            <text x={0} y={y + 3} fontSize={9} fill="var(--color-muted-foreground)">
              {Math.round(gv * 10) / 10}
            </text>
          </g>
        );
      })}

      {data.length > 1 && <path d={area} fill={color} opacity={0.12} />}
      {data.length > 1 && (
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {pts.map(([x, y], i) => (
        <g key={`p-${i}`}>
          <circle
            cx={x}
            cy={y}
            r={selected === i ? 4.5 : 2.6}
            fill={color}
            stroke="var(--color-surface)"
            strokeWidth={selected === i ? 1.5 : 0}
          />
          <rect
            x={x - Math.max(10, stepX / 2)}
            y={0}
            width={Math.max(20, stepX)}
            height={height}
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={`${data[i]!.label}: ${data[i]!.display ?? data[i]!.value}`}
            className="cursor-pointer outline-none"
            onClick={() => onSelect?.(selected === i ? null : i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(selected === i ? null : i);
              }
            }}
          />
        </g>
      ))}

      {data.map((d, i) => {
        const every = Math.max(1, Math.ceil(data.length / 4));
        if (i % every !== 0 && i !== data.length - 1) return null;
        return (
          <text
            key={`l-${i}`}
            x={pts[i]![0]}
            y={height - 5}
            fontSize={9}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            fill="var(--color-muted-foreground)"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

export interface ConsistencyWeek {
  label: string;
  /** distinct days trained */
  days: number;
  isCurrent?: boolean;
}

export interface ConsistencyStripProps {
  weeks: ConsistencyWeek[];
  /** the athlete's target training days per week */
  target: number;
  className?: string;
  testId?: string;
}

/**
 * Sessions-per-week vs target, as a dot calendar strip: one column per week, one dot per target
 * day. Filled = trained, hollow = missed, extra dots beyond target render in gold.
 */
export function ConsistencyStrip({ weeks, target, className, testId }: ConsistencyStripProps) {
  const slots = Math.max(target, ...weeks.map((w) => w.days), 1);
  return (
    <div
      className={cn('flex items-end justify-between gap-1 overflow-hidden', className)}
      data-testid={testId}
    >
      {weeks.map((w, i) => (
        <div key={`${w.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex flex-col-reverse items-center gap-[3px]">
            {Array.from({ length: slots }).map((_, s) => {
              const filled = s < w.days;
              const beyond = s >= target;
              return (
                <span
                  key={s}
                  className={cn(
                    'block h-[7px] w-[7px] rounded-full border',
                    filled && beyond && 'border-accent bg-accent',
                    filled && !beyond && 'border-success bg-success',
                    !filled && 'border-border bg-transparent',
                  )}
                />
              );
            })}
          </div>
          <span
            className={cn(
              'w-full truncate text-center text-[8px] font-medium',
              w.isCurrent ? 'text-accent' : 'text-muted-foreground',
            )}
          >
            {w.label}
          </span>
        </div>
      ))}
    </div>
  );
}
