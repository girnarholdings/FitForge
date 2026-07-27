'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { clamp } from '@/lib/utils';
import { m, SPRING } from './motion';
import { PlateFace } from './PlateFace';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** unit label rendered after the number, e.g. "days" */
  unit?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Numeric −/+ stepper (days per week, meals per day, per-exercise sets).
 *
 * UPGRADED IN PLACE rather than forked into a variant, because that is the whole point: one edit
 * makes the onboarding week-length question, the nutrition meals question and every set count in
 * the routine editor read as gym equipment instead of as a form widget. Two square −/+ tiles
 * became two weight plates ({@link PlateFace}, shared with {@link PlateStepper} so the app has one
 * dialect for "load"), and a rail runs behind the whole row so the three parts read as one loaded
 * bar seen end-on rather than as a button, a number and another button.
 *
 * FROZEN — DO NOT TOUCH: the value node keeps `role="status"`, `aria-live="polite"` and the
 * caller's `aria-label`. `getByLabel('Days per week')` and `getByLabel('Meals per day')` both
 * resolve to exactly that div, in the onboarding and settings specs.
 *
 * The rail is an absolutely-positioned sibling div rather than a `::before`, so the whole
 * component stays Tailwind-only with no companion stylesheet.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 7,
  step = 1,
  unit,
  className,
  ...aria
}: StepperProps) {
  const set = (n: number) => onChange(clamp(n, min, max));
  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-2',
        className,
      )}
    >
      {/* THE SLEEVE. Scenery only — `pointer-events-none` so it can never intercept a tap meant
          for a plate, `aria-hidden` so it is not announced. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-7 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border-strong"
      />
      <PlateButton
        sign="−"
        label="Decrease"
        disabled={value <= min}
        onClick={() => set(value - step)}
      />
      <div
        className="relative z-10 min-w-16 rounded-field bg-surface-2 py-1 text-center tabular-nums"
        role="status"
        aria-live="polite"
        aria-label={aria['aria-label']}
      >
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}
      </div>
      <PlateButton
        sign="+"
        label="Increase"
        disabled={value >= max}
        onClick={() => set(value + step)}
      />
    </div>
  );
}

/** A 44 px plate that spins on the sleeve when pressed. */
function PlateButton({
  sign,
  label,
  disabled,
  onClick,
}: {
  sign: '−' | '+';
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <m.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.94, rotate: 14 }}
      transition={SPRING.press}
      className={cn(
        'relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground',
        'touch-manipulation transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        disabled ? 'opacity-40' : 'hover:text-accent',
      )}
    >
      <PlateFace sign={sign} size={40} />
    </m.button>
  );
}
