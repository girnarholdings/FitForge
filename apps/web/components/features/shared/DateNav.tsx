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
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  hasContent?: (iso: string) => boolean;
  className?: string;
}) {
  const days = React.useMemo(() => {
    const half = Math.floor(STRIP_DAYS / 2);
    return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(value, i - half));
  }, [value]);

  const offset = dayOffset(value);

  return (
    <div className={cn('space-y-2', className)} data-testid="date-nav">
      <div className="flex items-center justify-between gap-2">
        <Pressable
          onClick={() => onChange(addDays(value, -1))}
          aria-label="Previous day"
          data-testid="date-prev"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <ChevronLeftIcon size={18} />
        </Pressable>

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

        <Pressable
          onClick={() => onChange(addDays(value, 1))}
          aria-label="Next day"
          data-testid="date-next"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <ChevronRightIcon size={18} />
        </Pressable>
      </div>

      <div className="flex items-stretch gap-1">
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
                  ? 'bg-accent text-accent-foreground'
                  : today
                    ? 'bg-accent-muted text-accent'
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
                  marked ? (selected ? 'bg-accent-foreground' : 'bg-accent') : 'bg-transparent',
                )}
              />
            </Pressable>
          );
        })}
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
