'use client';

/**
 * DAY ANALYTICS — the numbers UNDER the rings, and the shortest path to the goal.
 *
 * The summary card answers "how much is left?". This card answers the two follow-ups an
 * analytical app owes its user the moment food is on the log:
 *
 *   1. **Where are my calories coming from?** — the energy-split bar: % of consumed kcal from
 *      protein / carbs / fat (4·4·9 kcal per gram), with the target split marked on the same
 *      axis, so drift reads at a glance ("today is fattier than the plan").
 *   2. **How do I close the gap?** — remaining protein translated into REAL portions of real
 *      foods ("~180 g chicken breast"), each with a one-tap Add that lands in the normal
 *      confirm flow pre-filled to exactly that portion. Suggestions prefer foods the user
 *      actually logs (recents) and only fall back to the catalog's protein-dense staples.
 *   3. **When did I eat it?** — kcal per meal as bars scaled to the biggest meal, with each
 *      meal's share of the day.
 *
 * Pure presentation + arithmetic on props; nothing here fetches or stores.
 */
import * as React from 'react';
import { Card, CardTitle } from '@/components/ui';
import { CheckIcon, PlusIcon, TrendingUpIcon } from '@/components/ui/icons';
import { FOODS } from '@/lib/food/index';
import { emojiForFood } from '@/lib/food/emoji';
import { formatGrams } from '@/lib/food/format';
import type { Food, Macros } from '@/lib/food/types';
import type { NutritionLog, NutritionTargets } from '@/components/features/_mock/data';
import { MEAL_SLOTS } from './mealSlots';

const KCAL_PER_G = { p: 4, c: 4, f: 9 } as const;

/** % of energy from protein / carbs / fat. Always sums to 1 (guarded for the empty day). */
export function energySplit(m: {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): { p: number; c: number; f: number } {
  const p = m.protein_g * KCAL_PER_G.p;
  const c = m.carbs_g * KCAL_PER_G.c;
  const f = m.fat_g * KCAL_PER_G.f;
  const total = p + c + f;
  if (total <= 0) return { p: 0, c: 0, f: 0 };
  return { p: p / total, c: c / total, f: f / total };
}

export interface GapSuggestion {
  food: Food;
  grams: number;
  kcal: number;
  protein_g: number;
}

/**
 * Turn "you still need N g protein" into 2–3 real portions.
 *
 * Candidates = the user's own recents first (people repeat foods; a suggestion you already eat
 * is one you might actually log), then the catalog's most protein-dense foods (≥55 % of energy
 * from protein — chicken breast, skyr, whey territory). Portion = the grams that close the gap,
 * rounded to 10 g and capped at a plate-sized 350 g; anything whose closing portion busts the
 * remaining kcal budget by more than ~120 kcal is dropped, because "eat 600 kcal of cheese" is
 * not a path to this goal.
 */
export function proteinGapSuggestions(
  gapProtein: number,
  kcalLeft: number,
  recents: Food[],
  limit = 3,
): GapSuggestion[] {
  if (gapProtein < 8) return [];
  const dense = (f: Food) => {
    const kcal = f.per_100g.kcal;
    return kcal > 0 && (f.per_100g.protein_g * 4) / kcal >= 0.55 && f.per_100g.protein_g >= 10;
  };
  // Among the dense, EVERYDAY beats extreme: ranked by the search index's popularity prior first
  // (chicken breast, skyr, whey), raw protein-per-100g second — otherwise the list leads with
  // collagen peptides and gelatin, which are protein-dense the way a lab is food-adjacent.
  const catalogDense = FOODS.filter((i) => dense(i.food))
    .sort((a, b) => b.prior - a.prior || b.food.per_100g.protein_g - a.food.per_100g.protein_g)
    .map((i) => i.food);
  const candidates = [...recents.filter(dense), ...catalogDense];

  const out: GapSuggestion[] = [];
  const seen = new Set<string>();
  for (const food of candidates) {
    if (seen.has(food.id)) continue;
    seen.add(food.id);
    const grams = Math.min(350, Math.max(30, Math.round((gapProtein / food.per_100g.protein_g) * 10) * 10));
    const kcal = Math.round((food.per_100g.kcal * grams) / 100);
    const protein = Math.round((food.per_100g.protein_g * grams) / 100);
    // Respect the calorie budget when there is one to respect.
    if (kcalLeft > 0 && kcal > kcalLeft + 120) continue;
    out.push({ food, grams, kcal, protein_g: protein });
    if (out.length >= limit) break;
  }
  return out;
}

const SPLIT_COLORS = {
  p: 'var(--color-accent)',
  c: 'var(--color-success)',
  f: 'var(--color-energy)',
} as const;

export function DayAnalytics({
  logs,
  totals,
  targets,
  recents,
  onAddFood,
}: {
  logs: NutritionLog[];
  totals: Macros;
  targets: NutritionTargets;
  recents: Food[];
  /** open the normal confirm flow pre-filled to `grams` of `food` */
  onAddFood: (food: Food, grams: number) => void;
}) {
  const split = energySplit(totals);
  const targetSplit = energySplit({
    protein_g: targets.protein_g_target,
    carbs_g: targets.carbs_g_target,
    fat_g: targets.fat_g_target,
  });
  const kcalLeft = Math.round(targets.kcal_target - totals.kcal);
  const proteinGap = Math.round(targets.protein_g_target - totals.protein_g);
  const suggestions = React.useMemo(
    () => proteinGapSuggestions(proteinGap, kcalLeft, recents),
    [proteinGap, kcalLeft, recents],
  );

  const byMeal = React.useMemo(() => {
    const acc = new Map<string, { label: string; kcal: number; protein_g: number }>();
    for (const { slot, label } of MEAL_SLOTS) acc.set(slot, { label, kcal: 0, protein_g: 0 });
    for (const l of logs) {
      const b = acc.get(l.meal_slot);
      if (!b) continue;
      b.kcal += l.kcal;
      b.protein_g += l.protein_g;
    }
    return [...acc.values()].filter((b) => b.kcal > 0);
  }, [logs]);
  const maxMealKcal = Math.max(1, ...byMeal.map((b) => b.kcal));
  const dayKcal = Math.max(1, totals.kcal);

  if (logs.length === 0) return null;

  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="day-analytics">
      <div className="flex items-center gap-2 text-accent">
        <TrendingUpIcon size={18} />
        <CardTitle>Today in numbers</CardTitle>
      </div>

      {/* 1 · energy split vs target split */}
      <div className="mt-3" data-testid="energy-split">
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-border bg-muted">
          {(['p', 'c', 'f'] as const).map((k) => (
            <div
              key={k}
              className="h-full transition-[width] duration-300"
              style={{ width: `${split[k] * 100}%`, backgroundColor: SPLIT_COLORS[k] }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {(
            [
              ['p', 'Protein'],
              ['c', 'Carbs'],
              ['f', 'Fat'],
            ] as const
          ).map(([k, label]) => (
            <span key={k} className="flex items-center gap-1">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: SPLIT_COLORS[k] }}
              />
              <span className="font-medium text-foreground">{label}</span>
              <span className="tabular font-semibold" style={{ color: SPLIT_COLORS[k] }}>
                {Math.round(split[k] * 100)}%
              </span>
              <span className="tabular">/ {Math.round(targetSplit[k] * 100)}% goal</span>
            </span>
          ))}
        </div>
      </div>

      {/* 2 · the shortest path to the goal */}
      <div className="mt-4 rounded-field border border-border bg-surface p-3" data-testid="close-gap">
        {proteinGap >= 8 ? (
          <>
            <p className="text-sm font-semibold text-foreground">
              <span className="tabular text-accent">{proteinGap} g protein</span> to go
              {kcalLeft > 0 && (
                <>
                  {' '}
                  · <span className="tabular">{kcalLeft.toLocaleString()}</span> kcal left
                </>
              )}
            </p>
            {suggestions.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {suggestions.map((s) => (
                  <li key={s.food.id}>
                    <button
                      type="button"
                      onClick={() => onAddFood(s.food, s.grams)}
                      data-testid="gap-suggestion"
                      className="flex w-full items-center gap-2.5 rounded-field px-2 py-1.5 text-left transition-colors hover:bg-accent-muted"
                    >
                      <span aria-hidden className="text-lg leading-none">
                        {emojiForFood(s.food)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          ~{formatGrams(s.grams)} {s.food.name}
                        </span>
                        <span className="tabular block text-[11px] text-muted-foreground">
                          +{s.protein_g} g protein · {s.kcal} kcal
                        </span>
                      </span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-muted text-accent">
                        <PlusIcon size={14} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : kcalLeft >= 0 ? (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CheckIcon size={16} className="shrink-0 text-success" />
            <span>
              <span className="font-semibold">Protein goal hit.</span>{' '}
              <span className="tabular text-muted-foreground">
                {kcalLeft.toLocaleString()} kcal left for the day.
              </span>
            </span>
          </p>
        ) : (
          <p className="text-sm text-foreground">
            <span className="font-semibold">
              <span className="tabular">{Math.abs(kcalLeft).toLocaleString()}</span> kcal over
              target.
            </span>{' '}
            <span className="text-muted-foreground">
              One day doesn&rsquo;t undo a week — tomorrow starts at zero.
            </span>
          </p>
        )}
      </div>

      {/* 3 · when the calories landed */}
      {byMeal.length > 1 && (
        <div className="mt-4" data-testid="meal-distribution">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            By meal
          </p>
          <ul className="space-y-1.5">
            {byMeal.map((b) => (
              <li key={b.label} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 font-medium text-foreground">{b.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full origin-left rounded-full bg-accent transition-transform duration-300"
                    style={{ transform: `scaleX(${b.kcal / maxMealKcal})` }}
                  />
                </span>
                <span className="tabular w-24 shrink-0 text-right text-muted-foreground">
                  {Math.round(b.kcal)} kcal ·{' '}
                  <span className="font-semibold text-foreground">
                    {Math.round((b.kcal / dayKcal) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
