'use client';

/**
 * The day's headline: "Remaining = Goal − Food" with the calorie + protein rings and per-macro
 * %-of-target bars. Presentational — totals are computed by the caller.
 */
import * as React from 'react';
import { Card, MacroRing } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Macros } from '@/lib/food/types';
import type { NutritionTargets } from '@/components/features/_mock/data';

export function DaySummary({ totals, targets }: { totals: Macros; targets: NutritionTargets }) {
  const remainingKcal = Math.round(targets.kcal_target - totals.kcal);
  const remainingProtein = Math.round(targets.protein_g_target - totals.protein_g);

  return (
    <Card premium data-testid="day-summary">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Remaining = Goal − Food
      </p>

      <div className="mt-3 flex items-center justify-center gap-4">
        <MacroRing
          value={totals.kcal}
          target={targets.kcal_target}
          size={126}
          stroke={12}
          color="var(--color-foreground)"
          caption={remainingKcal.toLocaleString()}
          sublabel={remainingKcal < 0 ? 'over' : 'kcal left'}
          label="Calories"
        />
        <MacroRing
          value={totals.protein_g}
          target={targets.protein_g_target}
          size={96}
          stroke={10}
          color="var(--color-accent)"
          caption={`${Math.max(0, remainingProtein)}g`}
          sublabel="protein left"
          label="Protein"
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-field bg-surface/60 px-3 py-2.5 text-center">
        <FormulaCell label="Goal" value={targets.kcal_target} />
        <FormulaCell label="Food" value={Math.round(totals.kcal)} />
        <FormulaCell label="Remaining" value={remainingKcal} emphasize over={remainingKcal < 0} />
      </div>

      <dl className="mt-4 space-y-2.5">
        <MacroRow
          label="Protein"
          value={totals.protein_g}
          target={targets.protein_g_target}
          color="var(--color-accent)"
        />
        <MacroRow
          label="Carbs"
          value={totals.carbs_g}
          target={targets.carbs_g_target}
          color="var(--color-success)"
        />
        <MacroRow
          label="Fat"
          value={totals.fat_g}
          target={targets.fat_g_target}
          color="var(--color-energy)"
        />
      </dl>
    </Card>
  );
}

function FormulaCell({
  label,
  value,
  emphasize,
  over,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  over?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'font-display tabular text-lg font-bold',
          over ? 'text-energy' : emphasize ? 'text-accent' : 'text-foreground',
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function MacroRow({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  const rawPct = Math.round((value / Math.max(1, target)) * 100);
  const pct = Math.min(100, rawPct);
  const over = rawPct > 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular text-muted-foreground">
          {Math.round(value)} / {target} g
          <span className={cn('ml-1.5 font-semibold', over ? 'text-energy' : 'text-foreground')}>
            {rawPct}%
          </span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: over ? 'var(--color-energy)' : color }}
        />
      </div>
    </div>
  );
}
