import * as React from 'react';
import { cn } from '@/lib/utils';
import type { IllustrationProps } from './types';
import { resolveEquipmentGlyph } from './registry';

/**
 * 48×48 equipment "object portrait" (§4.2). Muted round-capped strokes
 * (`currentColor`, inheriting `text-muted-foreground`) with exactly one gold
 * accent element per item. When `selected`, the whole glyph turns gold
 * (`text-accent`) — pair it with the tile's `.border-gradient-gold` treatment.
 *
 * Decorative by default (`aria-hidden`): the picker tile supplies the visible
 * name, which is the accessible label.
 *
 * DENSE MODE exists because these portraits are now reused as ROW ICONS — catalog rows, filter
 * chips, the player header, substitute rows — at 16–22 px. At those sizes a 2px stroke on a
 * 48-unit canvas resolves to well under 1 CSS px and the whole glyph greys into a smudge, and the
 * decorative ground line stops reading as a shadow and starts reading as an underline beneath
 * whatever label sits next to it. Dense fattens the stroke to 3 and hides the ground (see the
 * `[data-dense] .ff-ground` rule in globals.css). It is ON automatically at ≤28 px so no call
 * site can forget it.
 */
export function EquipmentIllustration({
  slug,
  size = 48,
  selected = false,
  dense,
  className,
}: IllustrationProps) {
  const Glyph = resolveEquipmentGlyph(slug);
  // ≤24 is "icon territory" — the same canvas the ui/icons.tsx family is drawn on. Sizes above
  // that (the 26–48 px picker tiles) keep the delicate original treatment untouched.
  const isDense = dense ?? size <= 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={isDense ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-dense={isDense ? '' : undefined}
      className={cn(
        'shrink-0 transition-colors duration-150',
        selected ? 'text-accent' : 'text-muted-foreground',
        className,
      )}
    >
      <Glyph />
    </svg>
  );
}
