'use client';

/**
 * MuscleMapThumb (§4.1) — the tiny (≈40–56 px) list-card "image". Single auto view, gold fills
 * only, no interaction. It now shares `BodyFigure` with the full map, so the thumb inherits the
 * same silhouette AND the orientation tells (chin vs. nape, sternum vs. spine) — the one cue that
 * still survives at 40 px and hints whether a lift is a push or a pull.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { MuscleSlug } from './types';
import { MUSCLE_NAMES } from './types';
import { BodyFigure } from './BodyFigure';
import { autoView, slugsInView, styleFor, type MuscleStyle } from './paint';

export interface MuscleMapThumbProps {
  primary?: MuscleSlug[];
  secondary?: MuscleSlug[];
  height?: number;
  className?: string;
}

export function MuscleMapThumb({
  primary = [],
  secondary = [],
  height = 56,
  className,
}: MuscleMapThumbProps) {
  const primarySet = React.useMemo(() => new Set(primary), [primary]);
  const secondarySet = React.useMemo(() => new Set(secondary), [secondary]);
  const view = autoView(primarySet);

  const styles = React.useMemo(() => {
    const out: Partial<Record<MuscleSlug, MuscleStyle>> = {};
    for (const slug of slugsInView(view)) {
      const s = styleFor(slug, primarySet, secondarySet);
      if (s.highlighted) out[slug] = s;
    }
    return out;
  }, [view, primarySet, secondarySet]);

  const label =
    primary.length > 0
      ? `Target muscles: ${primary.map((m) => MUSCLE_NAMES[m]).join(', ')}`
      : 'Muscle map';

  return (
    <span role="img" aria-label={label} className={cn('block', className)}>
      <BodyFigure view={view} height={height} styles={styles} detail="key" thumb />
    </span>
  );
}
