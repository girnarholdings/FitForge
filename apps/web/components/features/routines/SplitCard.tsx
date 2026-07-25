'use client';

/**
 * Shared presentation for a split-library program (WS-5).
 *
 * Used by the onboarding "Pick your training split" step AND the Workouts screen's
 * "Change split" sheet, so a program looks identical everywhere it appears.
 *
 * Phone-first: the whole card is ~112px tall at 390px wide — five of them fit the onboarding
 * scroll region without the CTA ever covering content (the shell's dock is a real flex zone).
 */
import * as React from 'react';
import type { SplitDefinition } from '@fitforge/shared/rules';
import { splitDayStrip } from '@fitforge/shared/rules';
import { Card } from '@/components/ui';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** Shortest honest level label: "Beginner", or "Beginner–Advanced" for a range. */
export function levelLabel(levels: readonly string[]): string {
  if (levels.length === 0) return '';
  if (levels.length === 1) return LEVEL_LABEL[levels[0]!] ?? levels[0]!;
  const first = LEVEL_LABEL[levels[0]!] ?? levels[0]!;
  const last = LEVEL_LABEL[levels[levels.length - 1]!] ?? levels[levels.length - 1]!;
  return `${first}–${last}`;
}

export function daysLabel(split: SplitDefinition): string {
  const opts = split.days_options;
  if (opts.length > 1) {
    return `${Math.min(...opts)}–${Math.max(...opts)} days/wk`;
  }
  return `${split.days_per_week} days/wk`;
}

/** The "Push · Pull · Legs · Push · Pull · Legs" strip. Truncates gracefully on narrow phones. */
export function DayStrip({ split, className }: { split: SplitDefinition; className?: string }) {
  const strip = splitDayStrip(split);
  return (
    <p
      className={cn('truncate text-[11px] leading-tight text-muted-foreground', className)}
      title={strip.join(' · ')}
    >
      {strip.join(' · ')}
    </p>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export interface SplitCardProps {
  split: SplitDefinition;
  selected: boolean;
  onSelect: () => void;
  /** short "why this" line, e.g. "Fits 4 days/week · Built for intermediates" */
  reason?: string;
  testId?: string;
}

export function SplitCard({ split, selected, onSelect, reason, testId }: SplitCardProps) {
  return (
    <Card
      interactive
      selected={selected}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      data-testid={testId}
      data-split-slug={split.slug}
      className="!p-3"
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold leading-tight text-foreground">
            {split.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge>{daysLabel(split)}</Badge>
            <Badge>{levelLabel(split.levels)}</Badge>
          </div>
          <p className="mt-1.5 text-[0.75rem] leading-snug text-muted-foreground">
            {split.description}
          </p>
          <DayStrip split={split} className="mt-1.5" />
          {reason && <p className="mt-1 text-[10px] font-medium text-accent">{reason}</p>}
        </div>
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors',
            selected
              ? 'border-accent bg-accent text-surface'
              : 'border-border bg-surface text-transparent',
          )}
        >
          <CheckIcon size={14} />
        </span>
      </div>
    </Card>
  );
}
