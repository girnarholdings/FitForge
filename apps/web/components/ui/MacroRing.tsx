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
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          dy={sublabel != null ? -size * 0.06 : 0}
          className="fill-foreground font-display font-bold tabular"
          style={{ fontSize: size * 0.24 }}
        >
          {caption ?? `${Math.round(value)}`}
        </text>
        {sublabel != null && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            dy={size * 0.13}
            className="fill-muted-foreground font-semibold uppercase"
            style={{ fontSize: size * 0.1, letterSpacing: '0.06em' }}
          >
            {sublabel}
          </text>
        )}
      </svg>
      {label && <span className="mt-1 text-xs font-medium text-muted-foreground">{label}</span>}
    </div>
  );
}
