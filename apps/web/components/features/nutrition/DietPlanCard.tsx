'use client';

/**
 * TODAY'S DIET PLAN — the "Plan" surface on Nutrition (AIMODE-CONTRACT, "Diet UI + coach tie-in").
 *
 * Renders ONLY when `useDietPlan()` has a plan (AI-Mode onboarding wrote one); every other user
 * sees the Nutrition screen exactly as it was — the plan is an addition, never a gate. The card
 * speaks the existing grammar: one card, hairline ledger rows inside it, the same glyph tile and
 * macro line every logged row wears. No new visual language, no rings, no scores.
 *
 * Two actions per dish, and their division of labor is the contract's:
 *  · "Log this meal" — the plan meets the ledger. Rows are written through the EXISTING logging
 *    path (the same `setLogs` the review sheet commits through), as custom rows: `food_id` null,
 *    `custom_name` = recipe name, macros = per_serving × servings, stamped with `entryStamp` like
 *    any other entry. The log stays the record of what was EATEN; the plan is only a suggestion
 *    until this button says otherwise.
 *  · "Swap" — opens the bounded-choice sheet (`SwapSheet`, ≤6 ranked candidates per research §2).
 *
 * "Browse all recipes" opens the full prefs-filtered catalog (`RecipeCatalogSheet`).
 */
import * as React from 'react';
import { Card, CardTitle } from '@/components/ui';
import { PlusIcon, SearchIcon, SwapIcon } from '@/components/ui/icons';
import { FoodGlyph } from '@/components/ui/foodIcons';
import { entryStamp, formatMacros } from '@/lib/food/format';
import type { NutritionLog } from '@/components/features/_mock/data';
import type { MealSlotName } from '@/lib/food/types';
import { useDietPlan } from '@/lib/diet/store';
import type { Recipe } from '@/lib/diet/recipes';
import { MEAL_SLOTS, mealSlotLabel } from './mealSlots';
import {
  planDayIndex,
  recipeById,
  scaledMacros,
  servingGrams,
  type DietPlanRecord,
  type PlanMeal,
} from './planShared';
import { SwapSheet } from './SwapSheet';
import { RecipeCatalogSheet } from './RecipeCatalogSheet';

let planLogSeq = 0;
/** Distinct prefix from NutritionView's `nl-new-*` so the two writers can never collide. */
const genPlanLogId = () => `nl-plan-${Date.now()}-${planLogSeq++}`;

const SLOT_ORDER = new Map(MEAL_SLOTS.map((s, i) => [s.slot, i]));

export function DietPlanCard({
  date,
  onLog,
}: {
  /** The day on screen (`useSelectedDate`) — the plan day AND the day a logged meal lands on. */
  date: string;
  /** NutritionView's own `setLogs` appender — the one existing write path for food rows. */
  onLog: (rows: NutritionLog[]) => void;
}) {
  // The whole stored record: plan + prefs + stance travel together (store contract, W2).
  const diet = useDietPlan() as DietPlanRecord | null;
  const [swapSlot, setSwapSlot] = React.useState<MealSlotName | null>(null);
  const [catalogOpen, setCatalogOpen] = React.useState(false);

  const dayIndex = diet ? planDayIndex(diet.plan, date) : 0;

  const meals = React.useMemo(() => {
    const day = diet?.plan.days[dayIndex];
    if (!day) return [];
    return day.meals
      .map((meal) => ({ meal, recipe: recipeById(meal.recipeId) }))
      .filter((m): m is { meal: PlanMeal; recipe: Recipe } => m.recipe != null)
      .sort(
        (a, b) => (SLOT_ORDER.get(a.meal.slot) ?? 9) - (SLOT_ORDER.get(b.meal.slot) ?? 9),
      );
  }, [diet, dayIndex]);

  // No plan → no surface. The rest of Nutrition neither knows nor cares.
  if (!diet || meals.length === 0) return null;

  const dayTotals = meals.reduce(
    (acc, { meal, recipe }) => {
      const m = scaledMacros(recipe, meal.servings);
      return { kcal: acc.kcal + m.kcal, protein_g: acc.protein_g + m.protein_g };
    },
    { kcal: 0, protein_g: 0 },
  );

  /** The plan row → NutritionLog rows, through the same shape `commitDraft` writes. */
  function logMeal(meal: PlanMeal, recipe: Recipe) {
    const macros = scaledMacros(recipe, meal.servings);
    onLog([
      {
        id: genPlanLogId(),
        logged_on: date,
        meal_slot: meal.slot,
        food_id: null,
        custom_name: recipe.name,
        quantity_g: servingGrams(recipe, meal.servings),
        ...macros,
        ...entryStamp(),
      },
    ]);
  }

  const swapping = swapSlot ? meals.find((m) => m.meal.slot === swapSlot) : undefined;

  return (
    <>
      <Card className="!p-0 shadow-[var(--shadow-card)]" data-testid="diet-plan-card">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <CardTitle className="text-base">Today’s plan</CardTitle>
          {/* The header is the same stat line grammar the meal cards use: what the day adds up
              to if eaten as planned — kcal and protein, the two numbers the plan is built on. */}
          <span className="tabular text-xs text-muted-foreground">
            <span className="text-sm font-semibold text-foreground">
              {Math.round(dayTotals.kcal)}
            </span>{' '}
            kcal planned ·{' '}
            <span className="font-semibold text-accent">{Math.round(dayTotals.protein_g)}P</span>
          </span>
        </div>

        <ul className="divide-y divide-border">
          {meals.map(({ meal, recipe }) => {
            const macros = scaledMacros(recipe, meal.servings);
            return (
              <li
                key={meal.slot}
                data-testid="diet-plan-meal"
                data-slot={meal.slot}
                data-recipe-id={recipe.id}
                className="px-4 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  {/* Same drawn glyph tile every logged food row wears — keyword match on the
                      recipe name, `dish` (the plate) as the honest fallback. */}
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-muted text-accent-soft"
                  >
                    <FoodGlyph food={{ name: recipe.name, category: 'dish' }} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {mealSlotLabel(meal.slot)}
                    </p>
                    <p className="truncate text-sm font-medium text-foreground">
                      {recipe.name}
                      {meal.servings !== 1 && (
                        <span className="tabular text-muted-foreground"> × {meal.servings}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recipe.serving_label} · {recipe.effort} · {formatMacros(macros)}
                    </p>
                  </span>
                  <span className="tabular shrink-0 text-sm text-muted-foreground">
                    {Math.round(macros.kcal)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 pl-[42px]">
                  <button
                    type="button"
                    data-testid="diet-plan-log"
                    onClick={() => logMeal(meal, recipe)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-field px-2.5 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
                  >
                    <PlusIcon size={16} /> Log this meal
                  </button>
                  <button
                    type="button"
                    data-testid="diet-plan-swap"
                    aria-label={`Swap ${recipe.name}`}
                    onClick={() => setSwapSlot(meal.slot)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-field px-2.5 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
                  >
                    <SwapIcon size={16} /> Swap
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="px-3 py-2">
          <button
            type="button"
            data-testid="diet-plan-browse"
            onClick={() => setCatalogOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
          >
            <SearchIcon size={18} /> Browse all recipes
          </button>
        </div>
      </Card>

      <SwapSheet
        open={swapping != null}
        plan={diet.plan}
        day={dayIndex}
        slot={swapSlot ?? 'dinner'}
        outgoing={swapping?.recipe ?? null}
        servings={swapping?.meal.servings ?? 1}
        onClose={() => setSwapSlot(null)}
        onBrowse={() => {
          setSwapSlot(null);
          setCatalogOpen(true);
        }}
      />

      <RecipeCatalogSheet
        open={catalogOpen}
        prefs={diet.prefs}
        dayIndex={dayIndex}
        onClose={() => setCatalogOpen(false)}
      />
    </>
  );
}
