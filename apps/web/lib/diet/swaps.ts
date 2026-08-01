'use client';

/**
 * PER-DISH SWAPS — the pressure valve that makes a fixed weekly template livable (§5).
 *
 * A swap must preserve the DAY's integrity without recomputing the whole plan, so every rule here
 * is local to the outgoing dish:
 *
 *   1. same slot (lunch accepts dinner recipes — leftover pairing already made them lunches),
 *   2. dietary compatibility is ABSOLUTE (base lattice + avoid tags; no "97% match"),
 *   3. |Δkcal| ≤ max(75 kcal, 15% of the outgoing dish's kcal) — inside the day band by
 *      construction when the original day was,
 *   4. protein ≥ outgoing − 8 g, and a main must still clear 0.4 g/kg after the swap
 *      (upward deviation unbounded within the kcal check),
 *   5. carbs/fat unconstrained — chicken-rice ↔ salmon-salad is a legitimate swap,
 *   6. no duplicate lunch/dinner recipe within the 2-day window around the target day
 *      (breakfasts and snacks are exempt — repetition there is a feature, §2),
 *   7. ≤ 6 shown, ranked by macro distance (bounded choice beats a wall of options).
 *
 * Candidates are evaluated at their best serving step (1 / 1.5 / 2) against the outgoing dish AS
 * PLANNED (its per-serving macros × its planned servings).
 */
import type { MealSlotName } from '@/lib/food/types';
import { mainProteinFloor, SERVING_STEPS, type DietPlan } from './plan';
import { satisfiesPrefs, slotPool, RECIPE_BY_ID, type DietPrefs, type Recipe } from './recipes';

const MAX_SHOWN = 6;
const MAIN_SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner'];

export interface SwapContext {
  /** Overrides for plans that lack the embedded context (e.g. seeded fixtures). */
  prefs?: DietPrefs;
  weightKg?: number;
}

/**
 * The serving step at which a candidate best matches the outgoing dish's planned kcal, honoring
 * the §5 checks; null when no step passes them.
 */
export function bestSwapServing(
  candidate: Recipe,
  outgoingKcal: number,
  outgoingProtein: number,
  proteinFloor: number | null,
): number | null {
  const window = Math.max(75, outgoingKcal * 0.15);
  let best: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const s of SERVING_STEPS) {
    const kcal = candidate.per_serving.kcal * s;
    const protein = candidate.per_serving.protein_g * s;
    const delta = Math.abs(kcal - outgoingKcal);
    if (delta > window) continue;
    if (protein < outgoingProtein - 8) continue;
    if (proteinFloor !== null && protein < proteinFloor - 1e-9) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = s;
    }
  }
  return best;
}

/**
 * ≤6 candidates for the planned dish at `plan.days[day]`, slot `slot` (the first meal of that
 * slot when a day carries two snacks), ranked by macro distance at each candidate's best serving.
 */
export function swapCandidates(
  plan: DietPlan,
  day: number,
  slot: MealSlotName,
  context?: SwapContext,
): Recipe[] {
  const planDay = plan.days[day];
  if (!planDay) return [];
  const meal = planDay.meals.find((m) => m.slot === slot);
  if (!meal) return [];
  const outgoing = RECIPE_BY_ID.get(meal.recipeId);
  if (!outgoing) return [];

  const prefs = context?.prefs ?? plan.prefs;
  const weightKg = context?.weightKg ?? plan.weightKg;
  const isMain = MAIN_SLOTS.includes(slot);
  const proteinFloor = isMain && Number.isFinite(weightKg) ? mainProteinFloor(weightKg) : null;

  const outgoingKcal = outgoing.per_serving.kcal * meal.servings;
  const outgoingProtein = outgoing.per_serving.protein_g * meal.servings;

  // Rule 6 — the 2-day variety window: a swapped-in lunch/dinner must not duplicate anything
  // planned in a main slot the day before, the day itself, or the day after. Breakfasts and
  // snacks are exempt from the window (repetition there is a feature) but never duplicate a dish
  // already planned on the SAME day — "swap this snack for the other snack" is not a swap.
  const blocked = new Set<string>();
  if (slot === 'lunch' || slot === 'dinner') {
    for (let d = Math.max(0, day - 1); d <= Math.min(plan.days.length - 1, day + 1); d++) {
      for (const m of plan.days[d]?.meals ?? []) {
        if (m.slot === 'lunch' || m.slot === 'dinner') blocked.add(m.recipeId);
      }
    }
  }
  for (const m of planDay.meals) blocked.add(m.recipeId);
  blocked.delete(outgoing.id); // the outgoing dish is excluded separately, not "blocked"

  const ranked: { recipe: Recipe; distance: number }[] = [];
  for (const candidate of slotPool(slot)) {
    if (candidate.id === outgoing.id) continue;
    if (blocked.has(candidate.id)) continue;
    if (prefs && !satisfiesPrefs(candidate, prefs)) continue;
    const servings = bestSwapServing(candidate, outgoingKcal, outgoingProtein, proteinFloor);
    if (servings === null) continue;
    const kcalDelta = Math.abs(candidate.per_serving.kcal * servings - outgoingKcal);
    const proteinDelta = Math.abs(candidate.per_serving.protein_g * servings - outgoingProtein);
    // Macro distance: kcal is the unit; protein counts 4× (a gram of protein is the macro the
    // whole plan is built around). Carbs/fat stay out of the metric — §5 rule 5.
    const distance = kcalDelta + proteinDelta * 4;
    ranked.push({ recipe: candidate, distance });
  }

  ranked.sort(
    (a, b) => a.distance - b.distance || (a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0),
  );
  return ranked.slice(0, MAX_SHOWN).map((r) => r.recipe);
}
