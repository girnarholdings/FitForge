import * as React from 'react';
import { cn } from '@/lib/utils';
import { clamp } from '@/lib/utils';

export interface ProgressBarProps {
  /** current step (1-based) */
  current: number;
  /** total steps */
  total: number;
  className?: string;
  label?: string;
  /**
   * `'bar'` puts a collar cap on each end of the track, so a progress bar filling up reads as a
   * BARBELL loading — which is the most on-theme possible drawing of "progress" in this app.
   * Reserved for training progress (sets logged, weekly volume); the onboarding step counter keeps
   * the plain track, because an onboarding flow is not a lift.
   */
  variant?: 'bar';
}

/** Thin progress bar — onboarding step counter (§2.2), workout set progress, volume meters. */
export function ProgressBar({ current, total, className, label, variant }: ProgressBarProps) {
  const pct = clamp((current / Math.max(1, total)) * 100, 0, 100);
  const loaded = variant === 'bar';
  return (
    <div className={cn('w-full', loaded && 'relative px-1.5', className)}>
      {loaded && (
        // The collars. `aria-hidden` scenery, and outside the clipped track so they read as caps
        // ON the bar rather than as fill inside it.
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-2 -translate-y-1/2 rounded-sm bg-border-strong"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-2 -translate-y-1/2 rounded-sm bg-border-strong"
          />
        </>
      )}
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label ?? `Step ${current} of ${total}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-300 ease-out"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
}
