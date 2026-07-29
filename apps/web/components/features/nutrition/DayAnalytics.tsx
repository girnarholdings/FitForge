'use client';

/**
 * DAY ANALYTICS — how to FINISH the day.
 *
 * Editorially this card is the second half of a pair, and keeping the halves distinct is what
 * stops the screen contradicting itself:
 *
 *   · `DaySummary` (above) answers **where am I?** — rings and per-macro progress against target.
 *   · this card answers **how do I finish?** — what is still owed, what to eat to close it, and
 *     where today's calories landed.
 *
 * ONE MEANING PER UNIT. Every percentage rendered here, and in the summary above, is a percentage
 * of a GOAL. That rule is why the old stacked "energy split vs target split" bar was deleted
 * rather than relabelled: it expressed percentages of CONSUMED ENERGY, which can read as perfectly
 * on-plan while the athlete is 100 g of protein short — and it sat inches under a progress row
 * using the same word and the same `%` sign for the other meaning. See the block comment on the
 * gaps list.
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

const MACRO_COLORS = {
  p: 'var(--color-accent)',
  c: 'var(--color-success)',
  f: 'var(--color-energy)',
} as const;

/** One macro's standing: how much is left, and how far along its OWN target it is. */
interface MacroGap {
  key: 'p' | 'c' | 'f';
  label: string;
  eaten: number;
  target: number;
  /** grams still owed — 0 once the target is met */
  left: number;
  /** 0..1+ of this macro's target */
  pct: number;
}

function macroGaps(totals: Macros, targets: NutritionTargets): MacroGap[] {
  const rows: [MacroGap['key'], string, number, number][] = [
    ['p', 'Protein', totals.protein_g, targets.protein_g_target],
    ['c', 'Carbs', totals.carbs_g, targets.carbs_g_target],
    ['f', 'Fat', totals.fat_g, targets.fat_g_target],
  ];
  return rows.map(([key, label, eaten, target]) => ({
    key,
    label,
    eaten,
    target,
    left: Math.max(0, Math.round(target - eaten)),
    pct: target > 0 ? eaten / target : 0,
  }));
}

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
  const gaps = React.useMemo(() => macroGaps(totals, targets), [totals, targets]);
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

      {/* 1 · WHAT IS STILL OWED, per macro.
          This replaces a stacked "energy split vs target split" bar, which was actively
          misleading and had to go. It showed the SHARE of calories coming from each macro
          against the share the plan wants — so eating 20 g of protein and nothing else read as
          "89% protein, plan says 26%", i.e. gloriously on-ratio while 105 g short of the actual
          target. Worse, it sat directly under the summary card's "Protein 121/125 g · 97%", so
          two numbers labelled Protein and written as percentages meant entirely different
          things a thumb-width apart.

          The rule now: EVERY percentage on this screen is a percentage of a goal. The hero
          figure here is grams still owed, because that is the question this card exists to
          answer and it is what the suggestions underneath act on. */}
      <div className="mt-3" data-testid="macro-gaps">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Still to hit today
        </p>
        <ul className="space-y-1.5">
          {gaps.map((g) => {
            const hit = g.left === 0;
            const width = Math.min(100, Math.max(g.eaten > 0 ? 3 : 0, g.pct * 100));
            return (
              <li key={g.key} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 font-medium text-foreground">{g.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full origin-left rounded-full transition-transform duration-300"
                    style={{
                      transform: `scaleX(${width / 100})`,
                      backgroundColor: hit ? 'var(--color-success)' : MACRO_COLORS[g.key],
                    }}
                  />
                </span>
                <span
                  className="tabular w-[6.5rem] shrink-0 text-right"
                  data-testid={`macro-gap-${g.key}`}
                >
                  {hit ? (
                    <span className="font-semibold text-success">goal hit</span>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground">{g.left} g</span>
                      <span className="text-muted-foreground"> to go</span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 2 · the shortest path to the goal */}
      <div className="mt-4 rounded-field border border-border bg-surface p-3" data-testid="close-gap">
        {proteinGap >= 8 ? (
          <>
            {/* The gaps list directly above already says "112 g to go", so restating it verbatim
                here was the same fact twice in two inches. This line's job is the BUDGET the
                suggestions have to fit inside. */}
            <p className="text-sm font-semibold text-foreground">
              Closing the last <span className="tabular text-accent">{proteinGap} g protein</span>
              {kcalLeft > 0 && (
                <>
                  {' '}
                  with <span className="tabular">{kcalLeft.toLocaleString()}</span> kcal left to
                  spend
                </>
              )}
            </p>
            {suggestions.length > 0 && (
              <>
                {/* THESE ARE SUGGESTIONS, NOT A LOG. Sitting in a nutrition screen whose every
                    other list is "what you ate", three food rows with grams and macros read as
                    already-eaten — the + was the only hint otherwise, and a small circular glyph
                    is not a sentence. So: an explicit heading that says what the rows are and
                    what tapping does, a DASHED outline (nothing else in the app's food lists is
                    dashed — solid means logged), and a labelled Add pill rather than a bare
                    icon. */}
                <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
                  <span className="font-semibold text-foreground">Suggestions</span> — not logged
                  yet. Tap one to add it and close the gap:
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {suggestions.map((s) => (
                    <li key={s.food.id}>
                      <button
                        type="button"
                        onClick={() => onAddFood(s.food, s.grams)}
                        data-testid="gap-suggestion"
                        aria-label={`Add about ${formatGrams(s.grams)} of ${s.food.name} — ${s.protein_g} grams of protein, ${s.kcal} calories`}
                        className="flex w-full items-center gap-2.5 rounded-field border border-dashed border-border-strong/70 px-2 py-1.5 text-left transition-colors hover:border-accent hover:bg-accent-muted"
                      >
                        <span aria-hidden className="text-lg leading-none opacity-80">
                          {emojiForFood(s.food)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            ~{formatGrams(s.grams)} {s.food.name}
                          </span>
                          <span className="tabular block text-[11px] text-muted-foreground">
                            would add {s.protein_g} g protein · {s.kcal} kcal
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className="flex shrink-0 items-center gap-1 rounded-chip bg-accent-muted px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-accent"
                        >
                          <PlusIcon size={12} /> Add
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
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
