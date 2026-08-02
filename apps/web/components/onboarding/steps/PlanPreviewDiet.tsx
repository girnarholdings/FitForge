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
import { kcalBand, proteinBand } from '@/lib/diet/plan';
import type { Recipe } from '@/lib/diet/recipes';
import { todayISO } from '@/components/features/_mock/data';
import { MEAL_SLOTS, mealSlotLabel } from '@/components/features/nutrition/mealSlots';
import {
  planDayIndex,
  recipeById,
  scaledMacros,
  type PlanMeal,
} from '@/components/features/nutrition/planShared';
import { SwapSheet } from '@/components/features/nutrition/SwapSheet';
import { RecipeCatalogSheet } from '@/components/features/nutrition/RecipeCatalogSheet';
import { useOnboarding } from '../OnboardingProvider';

const SLOT_ORDER = new Map(MEAL_SLOTS.map((s, i) => [s.slot, i]));

export function PlanPreviewDiet() {
  const diet = useDietPlan();
  const { draft } = useOnboarding();
  const [swapSlot, setSwapSlot] = React.useState<MealSlotName | null>(null);
  const [catalogOpen, setCatalogOpen] = React.useState(false);

  // The day previewed is the day they land on — `todayISO` is the LOCAL calendar date, the same
  // helper Nutrition resolves its day from. `new Date().toISOString()` sat here first and is the
  // UTC date: for a US-evening user it previewed — and WROTE SWAPS TO — tomorrow's plan day,
  // which then "vanished" when Nutrition showed today's.
  const iso = todayISO();
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

  // HONESTY OVER SILENCE (research §6): a strict preference stack can make the closest possible
  // week genuinely miss the targets shown two cards above — vegan + no-gluten was the measured
  // case. When today's planned totals sit outside the engine's own bands, say so in one plain
  // line instead of letting the two cards quietly contradict each other.
  const targets = diet.plan.targets;
  const kBand = kcalBand(targets.kcal_target);
  const pBand = proteinBand(targets.protein_g_target);
  const kcalMiss =
    totals.kcal < kBand.lo ? Math.round(targets.kcal_target - totals.kcal) : totals.kcal > kBand.hi ? -Math.round(totals.kcal - targets.kcal_target) : 0;
  const proteinShort = totals.protein_g < pBand.lo ? Math.round(pBand.lo - totals.protein_g) : 0;

  // keto / mediterranean name eating STYLES the recipe lattice cannot express; the plan is
  // honest arithmetic on calories and protein, and this says so rather than implying the
  // library follows the style.
  const styleNote =
    draft.diet_type === 'keto'
      ? 'The library isn’t keto-specific — this plan hits your calories and protein, but carbs will run above a strict keto split.'
      : draft.diet_type === 'mediterranean'
        ? 'The library isn’t Mediterranean-specific — this plan is built to your calories and protein.'
        : null;

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
                  {/* The multiplier sits OUTSIDE the truncating span: inside it, a long name
                      ate the "× 1.5" first on narrow screens — the one number that changes
                      what the row means. */}
                  <p className="flex items-baseline gap-1 text-sm font-medium text-foreground">
                    <span className="min-w-0 truncate">{recipe.name}</span>
                    {meal.servings !== 1 && (
                      <span className="tabular shrink-0 text-muted-foreground">
                        × {meal.servings}
                      </span>
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

        {(kcalMiss !== 0 || proteinShort > 0 || styleNote) && (
          <div className="border-t border-border px-4 py-2.5" data-testid="preview-diet-note">
            {(kcalMiss !== 0 || proteinShort > 0) && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                With these preferences, the closest day the library can build runs{' '}
                {kcalMiss > 0 && (
                  <>
                    about <span className="font-semibold text-foreground">{kcalMiss} kcal</span>{' '}
                    short of your target
                  </>
                )}
                {kcalMiss < 0 && (
                  <>
                    about <span className="font-semibold text-foreground">{-kcalMiss} kcal</span>{' '}
                    over your target
                  </>
                )}
                {kcalMiss !== 0 && proteinShort > 0 && ' and '}
                {proteinShort > 0 && (
                  <>
                    <span className="font-semibold text-foreground">{proteinShort} g</span> protein
                    under
                  </>
                )}
                . Swaps and portion sizes can close some of the gap.
              </p>
            )}
            {styleNote && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{styleNote}</p>
            )}
          </div>
        )}

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
            or any time from Nutrition. Diet filters read each recipe&rsquo;s ingredient list —
            not an allergy guarantee, so check labels if an allergy is serious.
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
