'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * THE PLATE FACE — one drawing, two controls.
 *
 * {@link Stepper} and {@link PlateStepper} both put a weight plate seen end-on where a stock −/+
 * pill used to be, and they must be the SAME plate or the app has two dialects for one idea. So
 * the geometry lives here once: an outer rim, four grip cut-outs, and a filled hub big enough to
 * carry a legible sign.
 *
 * WHY THE HUB IS FILLED. `PlateIcon` in ui/icons.tsx has a hollow r=2.7 hub, correct at 24 px and
 * far too small to sit a 13 px bold "−" inside. Scaling that icon up and overlaying a character
 * would land the character on top of the spokes. A control needs its own drawing, so it has one.
 *
 * Decorative: the sign is drawn, not typed, and the accessible name comes from the button that
 * wraps this.
 */
export function PlateFace({
  sign,
  size = 40,
  className,
}: {
  sign: '−' | '+';
  /** px diameter of the drawn plate (the BUTTON around it is what must clear 44). */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {/* rim */}
      <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="2.4" />
      {/*
        Grip cut-outs, DIAGONAL and deliberately so. Drawn on the vertical/horizontal axes they
        line up perfectly with the − and + strokes in the hub and the whole control stops reading
        as a plate and starts reading as a rifle scope — which is exactly what the first pass
        looked like on a phone. Off-axis at 45°, the sign owns the cross and the plate owns the
        grip holes.
      */}
      <path
        d="M27.4 12.6 30.6 9.4M27.4 27.4 30.6 30.6M12.6 27.4 9.4 30.6M12.6 12.6 9.4 9.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* hub: filled so the sign has solid ground and never sits over a spoke */}
      <circle cx="20" cy="20" r="9.6" fill="currentColor" />
      {sign === '+' ? (
        <path
          d="M20 14.6v10.8M14.6 20h10.8"
          stroke="var(--color-surface)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M14.6 20h10.8"
          stroke="var(--color-surface)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
