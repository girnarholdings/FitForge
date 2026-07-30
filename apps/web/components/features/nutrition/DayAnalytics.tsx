'use client';

/**
 * DAY ANALYTICS — how to FINISH the day, IN FOOD.
 *
 * Editorially this card is the second half of a pair, and keeping the halves distinct is the whole
 * job — twice now this card has drifted into restating its neighbour:
 *
 *   · `DaySummary` (above) answers **where am I?** — rings, and a bar per macro reading
 *     "Protein 15 / 125 g · 12%".
 *   · this card answers **what do I eat?** — real portions that close the gap, and where today's
 *     calories landed.
 *
 * WHAT WAS REMOVED, AND WHY. This card used to open with a "Still to hit today" list: one bar per
 * macro with "110 g to go". That is the summary's own bar with the subtraction done — the same three
 * facts, in the same shape, a thumb-width apart. Numbers repeated in two places do not reinforce each
 * other, they compete, and neither one earns the space. The gap is now stated ONCE, as the sentence
 * that introduces the food.
 *
 * GRAMS ARE NOT AN INSTRUCTION. "110 g of protein to go" is a measurement; "3 more meals — one is a
 * chicken breast, a pot of skyr and a scoop of whey" is something you can act on. The portions come
 * from `lib/food/portions`, in the units the catalog itself names (scoops, breasts, pots), capped at
 * what one meal can usefully carry — which is what stopped this card recommending 150 g of whey
 * protein powder in one sitting.
 *
 * ONE MEANING PER UNIT still holds: every percentage on this screen is a percentage of a goal.
 *
 * Pure presentation + arithmetic on props; nothing here fetches or stores.
 */
import * as React from 'react';
import { Card, CardTitle } from '@/components/ui';
import { CheckIcon, PlusIcon, TrendingUpIcon } from '@/components/ui/icons';
import { FOODS } from '@/lib/food/index';
import { FoodGlyph } from '@/components/ui/foodIcons';
import { shortFoodName } from '@/lib/food/format';
import { isProteinDense, planPortions, type FoodPortion } from '@/lib/food/portions';
import type { Food, Macros } from '@/lib/food/types';
import type { NutritionLog, NutritionTargets } from '@/components/features/_mock/data';
import { MEAL_SLOTS } from './mealSlots';

/**
 * One tappable portion.
 *
 * The label leads with the UNIT ("1 scoop", "2 pots") because that is what the athlete measures
 * with; the grams ride in parentheses for anyone who owns a scale. Protein sits in its own column
 * because it is the currency this card deals in — the calorie cost is the fine print underneath.
 *
 * A "% of the gap" figure used to sit on the second line and was the only thing on the row still
 * truncating at 390 px. It went: "how far does one portion get me" is already answered better by the
 * meals sentence above and the combination below.
 */
function PortionButton({
  portion,
  onAdd,
}: {
  portion: FoodPortion;
  onAdd: (food: Food, grams: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAdd(portion.food, portion.grams)}
      data-testid="gap-suggestion"
      aria-label={`Add ${portion.label} of ${portion.food.name} — ${portion.protein_g} grams of protein, ${portion.kcal} calories`}
      className="flex w-full items-center gap-2.5 rounded-field border border-dashed border-border-strong/70 px-2 py-1.5 text-left transition-colors hover:border-accent hover:bg-accent-muted"
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-muted text-accent-soft"
      >
        <FoodGlyph food={portion.food} size={19} />
      </span>
      {/* TWO LINES, EACH WITH ONE JOB. Portion and protein on the first — those are the decision;
          the food's name and its calorie cost on the second. Everything on one line wrapped to
          three at 390 px, which cost more vertical space than the extra line saves. */}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="tabular min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {portion.label}
          </span>
          <span className="tabular shrink-0 text-sm font-bold text-accent">
            {portion.protein_g} g
          </span>
        </span>
        <span className="tabular block truncate text-[11px] text-muted-foreground">
          {shortFoodName(portion.food.name)} · {portion.kcal} kcal
        </span>
      </span>
      <span
        aria-hidden
        className="flex shrink-0 items-center gap-1 rounded-chip bg-accent-muted px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-accent"
      >
        <PlusIcon size={12} /> Add
      </span>
    </button>
  );
}

export function DayAnalytics({
  logs,
  totals,
  targets,
  recents,
  bodyKg,
  onAddFood,
}: {
  logs: NutritionLog[];
  totals: Macros;
  targets: NutritionTargets;
  recents: Food[];
  /** Body weight, when the athlete has given one — sets the per-meal protein figure (0.4 g/kg). */
  bodyKg?: number | null;
  /** open the normal confirm flow pre-filled to `grams` of `food` */
  onAddFood: (food: Food, grams: number) => void;
}) {
  const kcalLeft = Math.round(targets.kcal_target - totals.kcal);
  const proteinGap = Math.round(targets.protein_g_target - totals.protein_g);

  /**
   * Candidates: the athlete's OWN recent foods first — a portion of something you already eat is a
   * portion you might actually eat — then the catalog's protein-dense rows in popularity order.
   * Popularity first and protein-density second is deliberate: ranked purely by density the list
   * opens with collagen peptides and gelatin, which are protein-dense the way a lab is food-adjacent.
   */
  const candidates = React.useMemo(() => {
    const dense = FOODS.filter((i) => isProteinDense(i.food))
      .sort((a, b) => b.prior - a.prior || b.food.per_100g.protein_g - a.food.per_100g.protein_g)
      .map((i) => i.food);
    return [...recents.filter(isProteinDense), ...dense];
  }, [recents]);

  const plan = React.useMemo(
    () => planPortions(proteinGap, kcalLeft, candidates, { bodyKg }),
    [proteinGap, kcalLeft, candidates, bodyKg],
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
        {/* The card is no longer a second read-out of the same numbers, so it no longer claims to be
            one. "What's left to eat" says what it now does. */}
        <CardTitle>What&rsquo;s left to eat</CardTitle>
      </div>

      {/* 1 · THE GAP, STATED ONCE, IN MEALS.
          A "Still to hit today" list used to live here — one bar per macro reading "110 g to go" —
          directly under the summary card's own bars reading "Protein 15 / 125 g · 12%". Same three
          facts, same shape, one subtraction apart. It went, and the gap is now the sentence that
          introduces the food.

          MEALS, NOT GRAMS, because grams are a measurement and meals are a plan. The per-meal figure
          is 0.4 g/kg of body weight — maximal MPS stimulation sits nearer 0.25 g/kg/meal and 0.4 is
          that plus two SD, the figure the distribution literature recommends when spreading
          1.6–2.2 g/kg/day over three to four meals. Body weight unknown → a stated 35 g default. */}
      <div className="mt-3 rounded-field border border-border bg-surface p-3" data-testid="close-gap">
        {proteinGap >= 8 ? (
          <>
            <p className="text-sm text-foreground">
              <span className="font-semibold">
                <span className="tabular text-accent">{proteinGap} g protein</span> left
              </span>{' '}
              <span className="text-muted-foreground">
                — about{' '}
                <span className="tabular font-semibold text-foreground" data-testid="meals-left">
                  {plan.meals} more {plan.meals === 1 ? 'meal' : 'meals'}
                </span>{' '}
                at ~{plan.perMeal} g each
                {kcalLeft > 0 && (
                  <>
                    , inside <span className="tabular">{kcalLeft.toLocaleString()}</span> kcal
                  </>
                )}
                .
              </span>
            </p>

            {plan.options.length > 0 && (
              <>
                {/* THESE ARE SUGGESTIONS, NOT A LOG. In a screen whose every other list is "what you
                    ate", food rows with macros read as already-eaten — so: an explicit heading, a
                    DASHED outline (solid means logged, everywhere in this app), and a labelled Add
                    pill rather than a bare glyph.

                    PORTIONS, NOT GRAMS. The old rows said "~150 g Whey protein powder" because the
                    portion was computed to close the WHOLE gap: five scoops, presented as a
                    suggestion. Each row is now whole standard servings named the way the food is
                    sold — "1 scoop (31 g)", "1 breast (172 g)" — with the grams kept in parentheses
                    for anyone who weighs their food. */}
                <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
                  <span className="font-semibold text-foreground">One portion of any of these</span>{' '}
                  — not logged yet, tap to add:
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {plan.options.map((o) => (
                    <li key={o.food.id}>
                      <PortionButton portion={o} onAdd={onAddFood} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* 2 · THE WORKED COMBINATION. Individually none of the portions closes a 110 g gap, and
                a list of options that each cover a third of it invites the obvious question — "so
                what do I actually do?". This answers it in one line, out of the same rows above so
                nothing here is a second, hidden recommendation. */}
            {plan.plate.length > 1 && (
              <div className="mt-3 border-t border-border pt-2.5" data-testid="portion-plate">
                <p className="text-xs font-semibold text-foreground">Or all three across the day</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-foreground">
                  {plan.plate.map((o, i) => (
                    <React.Fragment key={o.food.id}>
                      {i > 0 && <span className="text-muted-foreground">+</span>}
                      <span className="inline-flex items-center gap-1.5 rounded-chip bg-muted px-2 py-1">
                        <span aria-hidden className="text-accent-soft">
                          <FoodGlyph food={o.food} size={14} />
                        </span>
                        <span className="text-xs font-medium">{o.label}</span>
                      </span>
                    </React.Fragment>
                  ))}
                </p>
                <p className="tabular mt-1.5 text-[11px] text-muted-foreground">
                  ={' '}
                  <span className="font-semibold text-accent" data-testid="plate-protein">
                    {plan.plateProtein} g protein
                  </span>{' '}
                  · {plan.plateKcal.toLocaleString()} kcal
                  {plan.plateProtein >= proteinGap ? ' — that closes it' : ` of the ${proteinGap} g`}
                </p>
              </div>
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
