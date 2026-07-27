import type * as React from 'react';
import type { EquipmentCategory } from '@fitforge/shared/types';

/**
 * Equipment illustration system (§4.2). The 31 seed equipment slugs, authored as
 * 48×48 inline-SVG "object portraits": muted round-capped strokes (`currentColor`,
 * inheriting `text-muted-foreground`) plus exactly ONE gold accent element per item.
 * Selected → the whole glyph turns gold (host sets `color: var(--accent)`) and the
 * tile gets the `.border-gradient-gold` treatment.
 */
export type EquipmentSlug =
  // free weights
  | 'barbell'
  | 'ez-curl-bar'
  | 'dumbbell'
  | 'kettlebell'
  | 'weight-plates'
  // benches & racks
  | 'flat-bench'
  | 'adjustable-bench'
  | 'squat-rack'
  // machines
  | 'smith-machine'
  | 'leg-press'
  | 'hack-squat-machine'
  | 'leg-extension-machine'
  | 'leg-curl-machine'
  | 'chest-press-machine'
  | 'pec-deck'
  | 'shoulder-press-machine'
  | 'hip-thrust-machine'
  | 'calf-raise-machine'
  // cables
  | 'cable-machine'
  | 'lat-pulldown'
  | 'seated-row-machine'
  // bodyweight & accessories
  | 'pull-up-bar'
  | 'dip-station'
  | 'resistance-bands'
  | 'suspension-trainer'
  | 'ab-wheel'
  | 'medicine-ball'
  // cardio
  | 'treadmill'
  | 'stationary-bike'
  | 'rowing-machine'
  // other
  | 'plyo-box';

/** Public props for the wrapper component. */
export interface IllustrationProps {
  /** slug of the equipment to draw. Unknown slugs fall back via the registry (§4.2). */
  slug: EquipmentSlug | (string & {});
  /** px size of the square SVG (default 48). */
  size?: number;
  /** selected state → glyph turns full gold. */
  selected?: boolean;
  /**
   * "Render this portrait as an ICON, not a picture": fattens the stroke and drops the ground
   * line so the glyph survives at row/chip sizes. Defaults to on at ≤28 px — pass `false` to
   * force the delicate treatment, `true` to force the dense one at a larger size.
   */
  dense?: boolean;
  className?: string;
}

/**
 * A single equipment glyph draws only the inner SVG shapes (no `<svg>` wrapper).
 * The wrapper (`EquipmentIllustration`) supplies the viewBox, sizing, and the
 * `currentColor`/accent color context so all glyphs stay visually consistent.
 */
export type EquipmentGlyph = React.FC;

export type { EquipmentCategory };
