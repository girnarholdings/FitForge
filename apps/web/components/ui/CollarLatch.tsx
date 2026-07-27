'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { m, SPRING } from './motion';
import { CollarIcon } from './icons';

export interface CollarLatchProps {
  /** is the set logged? */
  done: boolean;
  onClick: () => void;
  /**
   * REQUIRED, and frozen at the call site: the workout spec matches
   * `getByRole('button', { name: /Mark set 1/ })`. Passed through untouched.
   */
  'aria-label': string;
  'data-testid'?: string;
  className?: string;
}

/**
 * THE SET-COMPLETION CONTROL.
 *
 * Logging a set is the single most repeated physical act in the app, and until now it looked like
 * a to-do list checkbox — a tick in a rounded square, the same control a grocery app uses. This is
 * a SPRING COLLAR: open (a C with a gap and the lever ears splayed) while the set is outstanding,
 * clamped shut and filled gold once it is logged. Closing a collar is the gesture a lifter already
 * performs to lock a bar, so the control finally matches the act.
 *
 * ACCESSIBILITY IS UNCHANGED FROM THE CHECKBOX IT REPLACES: still a real `<button>`, still
 * `aria-pressed`, still the same accessible name, still keyboard-operable, and now 44×44 rather
 * than 36×36 — the row's Done column was already 2.75rem wide, so the bigger target costs no
 * layout.
 *
 * THE COLOUR CARRIES THE STATE ON ITS OWN. The rotate/scale is garnish: under
 * `MotionConfig reducedMotion="user"` the transform is dropped and the gold fill still says
 * "logged", so nobody loses the state change. That is also why this is `m.*` and not a CSS
 * keyframe — a `both`-filled CSS animation under the global reduced-motion rule would park on its
 * end frame, which the globals.css comment already warns about.
 */
export function CollarLatch({
  done,
  onClick,
  className,
  ...rest
}: CollarLatchProps) {
  return (
    <m.button
      type="button"
      aria-pressed={done}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={SPRING.press}
      className={cn(
        'grid h-11 w-11 place-items-center rounded-field border touch-manipulation',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        done
          ? 'border-accent bg-accent text-accent-foreground'
          : 'border-border bg-surface text-muted-foreground hover:border-accent hover:text-accent',
        className,
      )}
      {...rest}
    >
      {/* The collar itself rotates into place as it clamps — a quarter-turn of the lever. */}
      <m.span
        aria-hidden
        className="grid place-items-center"
        animate={{ rotate: done ? 0 : -18, scale: done ? 1 : 0.9 }}
        transition={SPRING.press}
      >
        <CollarIcon open={!done} size={22} />
      </m.span>
    </m.button>
  );
}
