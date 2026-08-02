'use client';

/**
 * THE MEAL HALF OF THE PLAN PREVIEW. The training week always had its cards and its swaps here;
 * the meals it is built to fuel were generated silently after the last tap and first seen days
 * later, if ever. This card puts the diet beside the training on the one screen that asks
 * "what am I committing to?" — same ledger grammar as Nutrition's own plan card, same swap
 * sheet, same catalog, so the first meeting with the meal plan IS the meal-plan planner.
 *
 * Renders nothing when no plan is stored (engine absent or the draft could not feed it) — the
 * preview then simply shows training, which is honest. No "Log this meal" here: nothing has
 * been eaten; logging belongs to the day it happens, on Nutrition.
 */
import * as React from 'react';
import { Card, CardTitle } from '@/components/ui';
import { SearchIcon, SwapIcon } from '@/components/ui/icons';
import { FoodGlyph } from '@/components/ui/foodIcons';
import { formatMacros } from '@/lib/food/format';
import type { MealSlotName } from '@/lib/food/types';
import { useDietPlan } from '@/lib/diet/store';
import type { Recipe } from '@/lib/diet/recipes';
import { MEAL_SLOTS, mealSlotLabel } from '@/components/features/nutrition/mealSlots';
import {
  planDayIndex,
  recipeById,
  scaledMacros,
  type PlanMeal,
} from '@/components/features/nutrition/planShared';
import { SwapSheet } from '@/components/features/nutrition/SwapSheet';
import { RecipeCatalogSheet } from '@/components/features/nutrition/RecipeCatalogSheet';

const SLOT_ORDER = new Map(MEAL_SLOTS.map((s, i) => [s.slot, i]));

export function PlanPreviewDiet() {
  const diet = useDietPlan();
  const [swapSlot, setSwapSlot] = React.useState<MealSlotName | null>(null);
  const [catalogOpen, setCatalogOpen] = React.useState(false);

  // The day previewed is the day they land on — the same weekday mapping Nutrition uses, so
  // what this card promises is exactly what Today's plan card shows an hour from now.
  const iso = new Date().toISOString().slice(0, 10);
  const dayIndex = diet ? planDayIndex(diet.plan, iso) : 0;

  const meals = React.useMemo(() => {
    const day = diet?.plan.days[dayIndex];
    if (!day) return [];
    return day.meals
      .map((meal) => ({ meal, recipe: recipeById(meal.recipeId) }))
      .filter((m): m is { meal: PlanMeal; recipe: Recipe } => m.recipe != null)
      .sort((a, b) => (SLOT_ORDER.get(a.meal.slot) ?? 9) - (SLOT_ORDER.get(b.meal.slot) ?? 9));
  }, [diet, dayIndex]);

  if (!diet || meals.length === 0) return null;

  const totals = meals.reduce(
    (acc, { meal, recipe }) => {
      const m = scaledMacros(recipe, meal.servings);
      return { kcal: acc.kcal + m.kcal, protein_g: acc.protein_g + m.protein_g };
    },
    { kcal: 0, protein_g: 0 },
  );

  const swapping = swapSlot ? meals.find((m) => m.meal.slot === swapSlot) : undefined;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Your meals are planned too — swap any dish you don’t fancy.
      </p>
      <Card className="!p-0 shadow-[var(--shadow-card)]" data-testid="preview-diet-card">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <CardTitle className="text-base">A day of eating</CardTitle>
          <span className="tabular text-xs text-muted-foreground">
            <span className="text-sm font-semibold text-foreground">
              {Math.round(totals.kcal)}
            </span>{' '}
            kcal ·{' '}
            <span className="font-semibold text-accent">{Math.round(totals.protein_g)}P</span>
          </span>
        </div>

        <ul className="divide-y divide-border">
          {meals.map(({ meal, recipe }) => {
            const macros = scaledMacros(recipe, meal.servings);
            return (
              <li
                key={meal.slot}
                data-testid="preview-diet-meal"
                data-slot={meal.slot}
                data-recipe-id={recipe.id}
                className="flex items-center gap-2.5 px-4 py-2.5"
              >
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
                  <p className="text-xs text-muted-foreground">{formatMacros(macros)}</p>
                </span>
                <button
                  type="button"
                  data-testid="preview-diet-swap"
                  aria-label={`Swap ${recipe.name}`}
                  onClick={() => setSwapSlot(meal.slot)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-field px-2.5 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
                >
                  <SwapIcon size={15} /> Swap
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            data-testid="preview-diet-browse"
            onClick={() => setCatalogOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl py-1 text-sm font-semibold text-accent"
          >
            <SearchIcon size={17} /> Browse all recipes
          </button>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            The week rotates so it never gets boring — this is one day of it. Swap anything now,
            or any time from Nutrition.
          </p>
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
