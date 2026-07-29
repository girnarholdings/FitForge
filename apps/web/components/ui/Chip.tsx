'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon } from './icons';

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
 * SELECTED CHIPS GET A CHECK, not a bar. The previous marker was a 3px accent line clamped to the
 * leading edge — meant as a "collar", read by an actual user as "a straight line I can't tell the
 * meaning of". A selection indicator that has to be explained has already failed; a check mark is
 * the one glyph every human reads as "chosen" without being taught. It springs from zero width so
 * toggling FEELS like the chip acknowledged you, and the CSS-only transition keeps this hot
 * primitive free of the motion runtime.
 *
 * ANYTHING ADDED TO A CHIP MUST BE `aria-hidden` AND MUST NOT ADD A TEXT NODE. The settings and
 * equipment specs match `getByRole('button', { name: 'Barbell', exact: true })` — an exact
 * accessible name. A stray glyph or label here breaks them silently; an aria-hidden SVG
 * contributes nothing to the name, which is what makes the check safe where a "✓" character
 * would not be.
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
      {/* Always mounted so the width can TRANSITION; grid-with-0fr would be heavier than this. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none -my-1 inline-flex shrink-0 items-center overflow-hidden transition-all duration-200 ease-out',
          selected ? 'w-[15px] scale-100 opacity-100' : 'w-0 scale-50 opacity-0',
        )}
      >
        <CheckIcon size={14} strokeWidth={3} />
      </span>
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
