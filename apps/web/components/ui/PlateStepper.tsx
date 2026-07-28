'use client';

import * as React from 'react';
import { cn, clamp } from '@/lib/utils';
import { m, SPRING, haptic } from './motion';
import { PlateFace } from './PlateFace';

export interface PlateStepperProps {
  value: number;
  onChange: (next: number) => void;
  /**
   * How much one tap adds. NOT a made-up default: 2.5 kg is a PAIR of 1.25 kg micro-plates, the
   * smallest jump you can actually make on a barbell with standard gym plates. A caller working
   * in pounds should pass 5 (a pair of 2.5s). We do not invent training numbers.
   */
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  /**
   * DOM id for the inner `<input>`, so a caller's `<label htmlFor>` binds to the field itself
   * rather than to the wrapper. Without it a visible label can only ever sit NEAR this control,
   * which is precisely the drift the set-entry form was rebuilt to make impossible.
   */
  id?: string;
  /** REQUIRED and passed straight through to the input — the E2E suite matches on it. */
  'aria-label': string;
}

/** Hold-to-repeat: a beat of intent, then a steady tick. */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 90;

/**
 * THE WEIGHT CONTROL, as a loaded bar rather than a form field.
 *
 * A −/+ pill is a web widget. This is a plate on each end of a sleeve: two round plate faces
 * joined by a rail that runs BEHIND the number, so the three parts read as one bar seen end-on
 * rather than as three separate buttons. Tapping a plate spins it on the sleeve
 * (`rotate: 14` under the press spring), which is the gesture the object actually makes.
 *
 * WHAT IS DELIBERATELY NOT DECORATIVE:
 *
 *   · The centre is a REAL `<input type="number">`. That is non-negotiable — it keeps the numeric
 *     keypad on a phone, keeps arrow keys and paste working, and keeps the accessible name the
 *     workout spec matches (`getByRole('spinbutton', { name: 'Set 1 weight' })`). A div with a
 *     value in it would look identical and be a downgrade in every way that matters.
 *   · Both plates are 44 px buttons, i.e. a real touch target, with their own aria-labels.
 *   · The rail is `aria-hidden` and `pointer-events-none`: it is scenery, and it must never eat a
 *     tap meant for the field it sits behind.
 *
 * Motion goes through `m.*` so the root `MotionConfig reducedMotion="user"` drops the spin for
 * anyone who asked for that — and losing the spin costs nothing, because the number itself is the
 * feedback.
 */
export function PlateStepper({
  value,
  onChange,
  step = 2.5,
  min = 0,
  max = 999,
  placeholder,
  className,
  id,
  ...aria
}: PlateStepperProps) {
  // `onChange` and the bounds are read through a ref by the repeat timer, so a hold that outlives
  // a re-render keeps stepping from the CURRENT value instead of the one captured at pointerdown.
  const latest = React.useRef({ value, onChange, step, min, max });
  latest.current = { value, onChange, step, min, max };

  const timers = React.useRef<{ delay?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});

  const stopRepeat = React.useCallback(() => {
    if (timers.current.delay) clearTimeout(timers.current.delay);
    if (timers.current.tick) clearInterval(timers.current.tick);
    timers.current = {};
  }, []);

  // A held button whose component unmounts (the set was completed, the pager moved on) must not
  // leave an interval running against a stale setState.
  React.useEffect(() => stopRepeat, [stopRepeat]);

  const bump = React.useCallback((dir: -1 | 1) => {
    const s = latest.current;
    // Round to the step grid: 42.5 − 2.5 must be 40, not 39.99999999999999.
    const next = clamp(Math.round((s.value + dir * s.step) * 1000) / 1000, s.min, s.max);
    if (next !== s.value) s.onChange(next);
  }, []);

  const startRepeat = React.useCallback(
    (dir: -1 | 1) => {
      bump(dir);
      haptic();
      stopRepeat();
      timers.current.delay = setTimeout(() => {
        timers.current.tick = setInterval(() => bump(dir), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    },
    [bump, stopRepeat],
  );

  const label = aria['aria-label'];

  return (
    <div className={cn('relative flex items-center gap-1.5', className)}>
      {/* THE SLEEVE. Sits behind the field and between the two plates, which is what turns three
          controls into one object. Inset by the plate radius so it emerges from under each plate
          rather than butting against it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border-strong"
      />
      <Plate
        sign="−"
        label={`Decrease ${label}`}
        disabled={value <= min}
        onStart={() => startRepeat(-1)}
        onStop={stopRepeat}
      />
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(Number(e.target.value))}
        // h-10, NOT h-11. Matching the 44px plates either side is tempting and was tried; it
        // grows every set row by 4px and eats the `mb-1` breathing room the label line above uses
        // for its own hit area. 40px is already well past the WCAG 2.5.8 minimum for a field that
        // is usually driven by the plates rather than typed into.
        className="relative z-10 h-10 min-w-0 flex-1 rounded-field border border-border bg-surface px-1 text-center text-base font-semibold tabular-nums outline-none focus:border-accent"
        {...aria}
      />
      <Plate
        sign="+"
        label={`Increase ${label}`}
        disabled={value >= max}
        onStart={() => startRepeat(1)}
        onStop={stopRepeat}
      />
    </div>
  );
}

/**
 * One 44 px plate button. `onPointerDown` rather than `onClick` so the first step lands the
 * instant the finger does and the hold-to-repeat can start from the same event; `onPointerUp`,
 * `onPointerLeave` and `onPointerCancel` all stop it, because a finger that slides off a button
 * mid-hold must not leave it counting.
 */
function Plate({
  sign,
  label,
  disabled,
  onStart,
  onStop,
}: {
  sign: '−' | '+';
  label: string;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <m.button
      type="button"
      aria-label={label}
      disabled={disabled}
      // The plate SPINS on the sleeve. Shallow scale so it still reads as a press, not a bounce.
      whileTap={disabled ? undefined : { scale: 0.94, rotate: 14 }}
      transition={SPRING.press}
      onPointerDown={(e) => {
        if (disabled) return;
        // Keeps the hold alive if the finger drifts, and stops the browser turning it into a
        // text-selection / scroll gesture.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onStart();
      }}
      onPointerUp={onStop}
      onPointerLeave={onStop}
      onPointerCancel={onStop}
      // Keyboard users get discrete steps: no repeat, one press one plate.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStart();
          onStop();
        }
      }}
      className={cn(
        'relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground',
        'touch-manipulation transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        disabled ? 'opacity-35' : 'hover:text-accent active:text-accent',
      )}
    >
      <PlateFace sign={sign} size={40} />
    </m.button>
  );
}
