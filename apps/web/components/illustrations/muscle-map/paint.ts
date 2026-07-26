/**
 * Shared paint resolution for every muscle-map surface (map, thumb, explorer).
 *
 * Precedence per muscle: `heatColors` ▸ `heat` ▸ `primary` ▸ `secondary` ▸ inert.
 * Kept in its own module so the full map, the 40 px thumb and the interactive explorer can
 * never drift apart on what "highlighted" means.
 */
import type { MuscleSlug, MuscleView, MuscleMapProps } from './types';
import { MUSCLE_NAMES, ALL_MUSCLE_SLUGS } from './types';
import { MUSCLE_PATHS } from './paths';

export interface MuscleStyle {
  fill: string;
  opacity: number;
  highlighted: boolean;
  /** true when the fill came from `heatColors` (non-inert) — those get a crisper outline */
  colored: boolean;
}

export const INERT_STYLE: MuscleStyle = {
  fill: 'var(--muscle-base)',
  opacity: 1,
  highlighted: false,
  colored: false,
};

export function styleFor(
  slug: MuscleSlug,
  primary: Set<MuscleSlug>,
  secondary: Set<MuscleSlug>,
  heat?: MuscleMapProps['heat'],
  heatColors?: Partial<Record<MuscleSlug, string>>,
): MuscleStyle {
  const explicit = heatColors?.[slug];
  if (explicit) {
    const inert = explicit === 'var(--muscle-base)';
    return { fill: explicit, opacity: inert ? 1 : 0.94, highlighted: !inert, colored: !inert };
  }
  if (heat && heat[slug] != null) {
    const v = Math.max(0, Math.min(1, heat[slug] as number));
    return { fill: 'var(--accent)', opacity: 0.15 + 0.75 * v, highlighted: true, colored: false };
  }
  if (primary.has(slug))
    return { fill: 'var(--accent)', opacity: 0.95, highlighted: true, colored: false };
  if (secondary.has(slug))
    return { fill: 'var(--accent)', opacity: 0.38, highlighted: true, colored: false };
  return INERT_STYLE;
}

/** Every slug that has artwork in `view`, in stable anatomical order. */
export function slugsInView(view: MuscleView): MuscleSlug[] {
  return ALL_MUSCLE_SLUGS.filter((slug) => (MUSCLE_PATHS[slug] ?? []).some((p) => p.view === view));
}

/** Which view a slug lives on. Muscles present on both (delts, forearms) report `both`. */
export function viewOf(slug: MuscleSlug): MuscleView | 'both' {
  const paths = MUSCLE_PATHS[slug] ?? [];
  const front = paths.some((p) => p.view === 'front');
  const back = paths.some((p) => p.view === 'back');
  return front && back ? 'both' : back ? 'back' : 'front';
}

/** Pick the auto view: the one with the most highlighted paths; ties → front. */
export function autoView(
  primary: Set<MuscleSlug>,
  heat?: MuscleMapProps['heat'],
  heatColors?: Partial<Record<MuscleSlug, string>>,
): MuscleView {
  const keys =
    primary.size > 0
      ? [...primary]
      : heat && Object.keys(heat).length > 0
        ? (Object.keys(heat) as MuscleSlug[])
        : heatColors
          ? (Object.entries(heatColors)
              .filter(([, c]) => c && c !== INERT_STYLE.fill)
              .map(([k]) => k) as MuscleSlug[])
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

export function composeAriaLabel(
  primary: MuscleSlug[],
  secondary: MuscleSlug[],
  heat?: MuscleMapProps['heat'],
  heatColors?: Partial<Record<MuscleSlug, string>>,
): string {
  if (heatColors && Object.keys(heatColors).length > 0) return 'Muscle heat map';
  if (heat && Object.keys(heat).length > 0) return 'Muscle activity map';
  const parts: string[] = [];
  if (primary.length) parts.push(`primary: ${primary.map((m) => MUSCLE_NAMES[m]).join(', ')}`);
  if (secondary.length) parts.push(`secondary: ${secondary.map((m) => MUSCLE_NAMES[m]).join(', ')}`);
  return parts.length ? `Muscles worked — ${parts.join('; ')}` : 'Muscle map';
}

/** Human copy for the orientation of a view — used by tabs, captions and a11y labels. */
export const VIEW_LABEL: Record<MuscleView, string> = { front: 'Front', back: 'Back' };
export const VIEW_CAPTION: Record<MuscleView, string> = {
  front: 'facing you',
  back: 'facing away',
};
