'use client';

/**
 * The day's headline: "Remaining = Goal − Food", spoken in the forge's own grammar.
 *
 * This used to be two donut gauges over three percent bars — the stock macro-dashboard header,
 * and the exact template the redesign exists to refuse (the finish review named it: "big number,
 * small caps label" rings are the floor's refused default). The heat grammar replaces it: the
 * calories left as a hero numeral in the display face, the day's energy as one HEAT BAR (stock
 * heating toward the goal, ember at the leading edge), and the three macros as rows of the same
 * material. One progress language, everywhere in the app.
 *
 * THREE METALS. The UI accent stays copper alone, but a data SERIES needs hues a glance can
 * separate, and soft-copper carbs sat a few percent from protein's heat bar (owner-reported).
 * The triad now: protein = copper heat (the bar the athlete acts on), carbs = steel
 * (--macro-carbs, the one cool hue), fat = ember. Green stays a success STATE elsewhere, never
 * an identity hue. Presentational — totals are computed by the caller.
 */
import * as React from 'react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Macros } from '@/lib/food/types';
import type { NutritionTargets } from '@/components/features/_mock/data';

export function DaySummary({ totals, targets }: { totals: Macros; targets: NutritionTargets }) {
  const remainingKcal = Math.round(targets.kcal_target - totals.kcal);
  const kcalShare = Math.min(1, totals.kcal / Math.max(1, targets.kcal_target));

  return (
    <Card premium data-testid="day-summary">
      <div className="flex items-baseline justify-between gap-3">
        <p className="tabular font-display text-4xl font-bold leading-none text-foreground">
          {Math.abs(remainingKcal).toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">
          {remainingKcal < 0 ? 'kcal over' : 'kcal left'}{' '}
          <span className="tabular">· of {targets.kcal_target.toLocaleString()}</span>
        </p>
      </div>
      {/* The day's energy as heated stock: the consumed share fills copper-to-ember. Over target
          the whole bar reads ember — the metal is past temperature, and that is the honest
          signal. */}
      <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn(
            'h-full w-full origin-left rounded-full transition-transform duration-300',
            remainingKcal < 0 ? 'bg-energy' : 'ff-heat',
          )}
          style={{ transform: `scaleX(${kcalShare})` }}
        />
      </div>

      {/* THREE METALS, three unmistakable hues. Carbs used to wear soft copper — a few percent
          away from protein's heat bar, which the owner rightly called indistinguishable. The
          triad is now copper heat (protein), STEEL (carbs — the cool one), ember (fat), each
          named again by a dot on its label so the mapping survives a glance. */}
      <dl className="mt-4 space-y-2">
        <MacroRow label="Protein" value={totals.protein_g} target={targets.protein_g_target} heat />
        <MacroRow
          label="Carbs"
          value={totals.carbs_g}
          target={targets.carbs_g_target}
          color="var(--macro-carbs)"
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
  heat = false,
}: {
  label: string;
  value: number;
  target: number;
  color?: string;
  /** Protein wears the full heat fill — it is the bar the athlete acts on. */
  heat?: boolean;
}) {
  const rawPct = Math.round((value / Math.max(1, target)) * 100);
  const pct = Math.min(100, rawPct);
  const over = rawPct > 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: heat ? 'var(--color-accent)' : color }}
          />
          {label}
        </span>
        <span className="tabular text-muted-foreground">
          {Math.round(value)} / {target} g
          <span className={cn('ml-1.5 font-semibold', over ? 'text-energy' : 'text-foreground')}>
            {rawPct}%
          </span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full w-full origin-left rounded-full transition-transform duration-300',
            heat && !over && 'ff-heat',
          )}
          style={{
            transform: `scaleX(${pct / 100})`,
            backgroundColor: over ? 'var(--color-energy)' : heat ? undefined : color,
          }}
        />
      </div>
    </div>
  );
}
