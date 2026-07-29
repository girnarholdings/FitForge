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
      <div className="flex items-center justify-center gap-5">
        {/* THE SUBLABEL SAYS WHAT THE NUMBER IS, NOT WHAT THE RING IS. "protein left" inside a ring
            captioned `Protein` underneath said the same word twice and needed ~81px of glyphs in a
            76px opening — the crowding the athlete noticed. `left` is the part that isn't already
            on screen. (MacroRing now also shrinks anything that would still overflow, so this is
            a copy fix on top of a structural one, not instead of it.) */}
        <MacroRing
          value={totals.kcal}
          target={targets.kcal_target}
          size={116}
          stroke={11}
          color="var(--color-foreground)"
          caption={remainingKcal.toLocaleString()}
          sublabel={remainingKcal < 0 ? 'over' : 'kcal left'}
          label="Calories"
        />
        <MacroRing
          value={totals.protein_g}
          target={targets.protein_g_target}
          size={90}
          stroke={9}
          color="var(--color-accent)"
          caption={`${Math.max(0, remainingProtein)}g`}
          sublabel="left"
          label="Protein"
        />
      </div>

      <dl className="mt-3.5 space-y-2">
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
          className="h-full w-full origin-left rounded-full transition-transform duration-300"
          style={{ transform: `scaleX(${pct / 100})`, backgroundColor: over ? 'var(--color-energy)' : color }}
        />
      </div>
    </div>
  );
}
