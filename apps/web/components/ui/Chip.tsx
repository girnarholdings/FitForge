'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** show a small leading icon/emoji */
  leading?: React.ReactNode;
  /** render a removable "×" affordance (used for selected type-ahead tokens) */
  removable?: boolean;
  onRemove?: () => void;
}

/**
 * A capsule toggle. Selectable equipment / allergen / weekday / suggestion chip (§2.2).
 * Renders as a button with `aria-pressed` so it is accessible as a toggle.
 *
 * SELECTED CHIPS GET A COLLAR MARKER: a short accent bar clamped onto the leading edge, the way a
 * collar sits on a sleeve. It is the most-used toggle in the app and it was carrying its state in
 * colour alone; a physical marker gives the eye something to scan a wrapped row of chips by.
 *
 * ANYTHING ADDED TO A CHIP MUST BE `aria-hidden` AND MUST NOT ADD A TEXT NODE. The settings and
 * equipment specs match `getByRole('button', { name: 'Barbell', exact: true })` — an exact
 * accessible name. A stray glyph or label here breaks them silently. Hit area, padding and text
 * are all unchanged; the marker is absolutely positioned inside the existing capsule.
 */
export function Chip({
  selected,
  leading,
  removable,
  onRemove,
  className,
  children,
  type,
  ...rest
}: ChipProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={selected}
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-chip border px-3.5 py-2 text-sm font-medium',
        'ff-press transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'touch-manipulation',
        selected
          ? 'border-accent bg-accent-muted text-accent'
          : 'border-border bg-surface-2 text-foreground hover:border-border-strong',
        className,
      )}
      {...rest}
    >
      {selected && (
        <span
          aria-hidden
          // left-1.5 rather than hard against the edge: the capsule is `rounded-full`, so a marker
          // flush left visually collides with the border's curve.
          className="pointer-events-none absolute left-1.5 top-1/2 h-[55%] w-[3px] -translate-y-1/2 rounded-full bg-accent"
        />
      )}
      {leading && <span aria-hidden>{leading}</span>}
      {children}
      {removable && (
        <span
          role="button"
          aria-label="Remove"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 grid h-4 w-4 place-items-center rounded-full text-current/70 hover:text-current"
        >
          ×
        </span>
      )}
    </button>
  );
}
