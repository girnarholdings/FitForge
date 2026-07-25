'use client';

/**
 * "Browse all splits" — the full 26-program library in a bottom sheet, filterable by days/week
 * and experience level (WS-5, complaint #5: "the options of workouts generically are very low").
 *
 * Shared by the onboarding split step and the Workouts screen's "Change split" flow.
 */
import * as React from 'react';
import {
  SPLIT_LIBRARY,
  AUTO_SPLIT_SLUG,
  recommendSplits,
  type SplitDefinition,
  type SplitRecommendationInput,
} from '@fitforge/shared/rules';
import { Sheet, Chip, Button } from '@/components/ui';
import { SplitCard } from './SplitCard';

const LEVEL_FILTERS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const;

export interface SplitLibrarySheetProps {
  open: boolean;
  onClose: () => void;
  /** currently chosen slug (or `'auto'` / null) */
  value: string | null;
  onSelect: (slug: string) => void;
  /** profile used to sort the list best-first; omit for plain library order */
  profile?: SplitRecommendationInput;
  /** show the "Let FitForge pick" row at the top (onboarding does; the Workouts sheet does too) */
  includeAuto?: boolean;
  title?: string;
}

export function SplitLibrarySheet({
  open,
  onClose,
  value,
  onSelect,
  profile,
  includeAuto = true,
  title = 'All training splits',
}: SplitLibrarySheetProps) {
  const [days, setDays] = React.useState<number | null>(null);
  const [level, setLevel] = React.useState<string | null>(null);

  // Best-first when we know the profile, library order otherwise.
  const ordered = React.useMemo<SplitDefinition[]>(() => {
    if (!profile) return [...SPLIT_LIBRARY];
    return recommendSplits(profile).map((r) => r.split);
  }, [profile]);

  const visible = React.useMemo(
    () =>
      ordered.filter((s) => {
        if (days != null && !s.days_options.includes(days)) return false;
        if (level != null && !s.levels.includes(level as SplitDefinition['levels'][number]))
          return false;
        return true;
      }),
    [ordered, days, level],
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3" data-testid="split-library">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by days per week">
            <Chip selected={days === null} onClick={() => setDays(null)} className="!px-3 !py-1.5">
              Any days
            </Chip>
            {[2, 3, 4, 5, 6].map((d) => (
              <Chip
                key={d}
                selected={days === d}
                onClick={() => setDays(days === d ? null : d)}
                className="!px-3 !py-1.5"
                data-testid={`split-filter-days-${d}`}
              >
                {d}/wk
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by level">
            <Chip
              selected={level === null}
              onClick={() => setLevel(null)}
              className="!px-3 !py-1.5"
            >
              Any level
            </Chip>
            {LEVEL_FILTERS.map((l) => (
              <Chip
                key={l.value}
                selected={level === l.value}
                onClick={() => setLevel(level === l.value ? null : l.value)}
                className="!px-3 !py-1.5"
                data-testid={`split-filter-level-${l.value}`}
              >
                {l.label}
              </Chip>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {visible.length} of {SPLIT_LIBRARY.length} programs
        </p>

        <div className="space-y-2" role="radiogroup" aria-label="All training splits">
          {includeAuto && (
            <button
              type="button"
              onClick={() => {
                onSelect(AUTO_SPLIT_SLUG);
                onClose();
              }}
              data-testid="split-option-auto-browse"
              className={`w-full rounded-card border p-3 text-left transition-colors ${
                value === AUTO_SPLIT_SLUG || value == null
                  ? 'border-accent bg-accent-muted'
                  : 'border-border bg-surface-2'
              }`}
            >
              <p className="text-[0.9375rem] font-semibold text-foreground">Pick for me</p>
              <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                FitForge builds the week from your days, goal and equipment.
              </p>
            </button>
          )}

          {visible.map((split) => (
            <SplitCard
              key={split.slug}
              split={split}
              selected={value === split.slug}
              onSelect={() => {
                onSelect(split.slug);
                onClose();
              }}
              testId={`split-option-${split.slug}`}
            />
          ))}

          {visible.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No program matches those filters. Try widening them.
            </p>
          )}
        </div>

        <Button variant="secondary" block onClick={onClose} data-testid="split-library-close">
          Done
        </Button>
      </div>
    </Sheet>
  );
}
