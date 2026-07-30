'use client';

/**
 * DAY PICKER for Today and Nutrition.
 *
 * Two affordances, because they answer different questions:
 *   · the arrows step one day, which is what "I forgot to log last night's dinner" needs;
 *   · the week strip shows where you are and jumps several days at once, which is what
 *     "what am I training on Friday?" needs.
 *
 * NO UPPER BOUND ON THE FUTURE and no lower bound on the past. The plan is generated from a weekly
 * blueprint, so every future date already has an answer, and refusing to show it would be an
 * artificial wall. Logging food onto a future day is allowed for the same reason it is allowed onto
 * a past one — the app records what you tell it, and prepping tomorrow's meals is a real habit.
 */
import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';
import { Pressable } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { addDays, dayLabel, dateLabel, dayOffset, isToday, parseISO } from '@/lib/demo/selectedDate';

/** How many days the strip shows, centred on the selection. Odd so "today" can sit in the middle. */
const STRIP_DAYS = 7;

export function DateNav({
  value,
  onChange,
  /** Marks days that have something recorded, so the strip is a map and not just a ruler. */
  hasContent,
  /**
   * One-row layout for screens whose own header already names the selected day (Today's h1 is the
   * weekday and its subheading carries the "· Yesterday" relative word). The full layout printed
   * the day name a third and fourth time directly underneath that header — the label block stays
   * in the DOM for assistive tech and the date-integrity specs, but stops costing 60px of chrome.
   */
  compact = false,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  hasContent?: (iso: string) => boolean;
  compact?: boolean;
  className?: string;
}) {
  const days = React.useMemo(() => {
    const half = Math.floor(STRIP_DAYS / 2);
    return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(value, i - half));
  }, [value]);

  const offset = dayOffset(value);

  const arrow = (dir: -1 | 1) => (
    <Pressable
      onClick={() => onChange(addDays(value, dir))}
      aria-label={dir === -1 ? 'Previous day' : 'Next day'}
      data-testid={dir === -1 ? 'date-prev' : 'date-next'}
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-muted-foreground transition-[color,transform] duration-150 active:scale-90 hover:text-foreground',
        // The visible circle stays small so the strip fits a 390px row; a transparent ::before
        // pads the TARGET to ≥44px, same treatment as the top-bar circles (WCAG 2.5.8).
        'relative touch-manipulation before:absolute before:-inset-1 before:content-[""]',
        compact ? 'h-9 w-9' : 'h-10 w-10 border border-border hover:border-border-strong',
      )}
    >
      {dir === -1 ? <ChevronLeftIcon size={18} /> : <ChevronRightIcon size={18} />}
    </Pressable>
  );

  return (
    <div className={cn('space-y-2', className)} data-testid="date-nav">
      {compact ? (
        // The label pair survives for the specs and screen readers; the HOST header is the visible
        // statement of the selected day in this mode.
        <span className="sr-only">
          <span data-testid="date-nav-label">{dayLabel(value)}</span>
          <span data-testid="date-nav-date">{dateLabel(value)}</span>
        </span>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {arrow(-1)}
          <div className="min-w-0 text-center">
            <p
              className="truncate font-display text-lg font-bold leading-tight text-foreground"
              data-testid="date-nav-label"
            >
              {dayLabel(value)}
            </p>
            {/* The absolute date is ALWAYS shown, even under "Today". Relative words are easy to
                misread when you have been tapping the arrows, and this is the line that stops you
                logging a meal onto the wrong day. */}
            <p className="truncate text-xs text-muted-foreground" data-testid="date-nav-date">
              {dateLabel(value)}
            </p>
          </div>
          {arrow(1)}
        </div>
      )}

      <div className="flex items-stretch gap-1">
        {compact && arrow(-1)}
        {days.map((iso) => {
          const selected = iso === value;
          const today = isToday(iso);
          const marked = hasContent?.(iso) ?? false;
          const d = parseISO(iso);
          return (
            <Pressable
              key={iso}
              onClick={() => onChange(iso)}
              aria-label={dateLabel(iso)}
              aria-current={selected ? 'date' : undefined}
              data-testid={`date-cell-${iso}`}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-field py-1.5 text-[11px] font-semibold transition-colors',
                selected
                  ? 'bg-elevated text-foreground shadow-[inset_0_-3px_0_var(--accent)]'
                  : today
                    ? 'text-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="opacity-70">
                {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
              <span className="tabular-nums">{d.getDate()}</span>
              {/* A dot, not a number: the strip says "something is here", and the screen below says
                  what. Reserved space either way so selecting a day never shifts the row. */}
              <span
                aria-hidden
                className={cn(
                  'h-1 w-1 rounded-full',
                  marked ? 'bg-accent' : 'bg-transparent',
                )}
              />
            </Pressable>
          );
        })}
        {compact && arrow(1)}
      </div>

      {/* Only when it does something. A permanent "Today" button next to a screen already showing
          today is a control that punishes reading it. */}
      {offset !== 0 && (
        <Pressable
          onClick={() => onChange(addDays(value, -offset))}
          data-testid="date-today"
          className="mx-auto block rounded-chip border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-accent transition-colors hover:border-accent"
        >
          Back to today
        </Pressable>
      )}
    </div>
  );
}
