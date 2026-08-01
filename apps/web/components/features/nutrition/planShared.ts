'use client';

/**
 * Shared plumbing for the diet-plan surface (AIMODE-CONTRACT "Diet UI + coach tie-in").
 *
 * The plan itself is W2's: `lib/diet/store` owns the persisted `fitforge.diet.v1` record and
 * `lib/diet/recipes` owns the validated 100-recipe corpus. Everything in this file is the UI-side
 * arithmetic those components share — which plan day "today" is, whether a recipe survives the
 * user's dietary preferences, per-serving scaling, and the signed-delta line the swap sheet shows.
 *
 * The Plan* interfaces are STRUCTURAL mirrors of the contract's pinned `DietPlan` / `DietPrefs`
 * shapes, declared locally so this branch compiles against the contract rather than against
 * whichever type names W2's branch happens to export. TypeScript's structural typing makes the two
 * interchangeable at integration; if they ever drift, the compiler says so at the seam.
 */
import { RECIPES, type Recipe } from '@/lib/diet/recipes';
import type { MealSlotName } from '@/lib/food/types';

/** One planned dish: contract `DietPlan.days[].meals[]`. Servings usually 1, may be 1.5/2. */
export interface PlanMeal {
  slot: MealSlotName;
  recipeId: string;
  servings: number;
}

export interface PlanDay {
  meals: PlanMeal[];
}

/** Contract `DietPlan` — 7 rotating days from the generator (seeds may carry fewer). */
export interface PlanShape {
  days: PlanDay[];
}

/** Contract `DietPrefs` — one base diet plus stackable exclusion tags. HARD filters, both. */
export interface PrefsShape {
  base: 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan';
  avoid: string[];
}

/** The persisted `fitforge.diet.v1` record as `useDietPlan()` surfaces it. */
export interface DietPlanRecord {
  version: 1;
  plan: PlanShape;
  prefs: PrefsShape;
  stance: string;
  generatedAt: string;
}

/* ------------------------------------------------------------------------------ recipe lookup */

const RECIPE_BY_ID = new Map<string, Recipe>(RECIPES.map((r: Recipe) => [r.id, r]));

export function recipeById(id: string): Recipe | null {
  return RECIPE_BY_ID.get(id) ?? null;
}

/* ---------------------------------------------------------------------------------- plan days */

/**
 * Which plan day a calendar date lands on: blueprint weekday (0=Mon … 6=Sun, the same mapping the
 * training blueprint uses) modulo the plan length. A full 7-day plan therefore reads
 * Monday→days[0]; a shorter seed still resolves deterministically instead of crashing.
 * The e2e specs replicate this rule, so it must not change casually.
 */
export function planDayIndex(plan: PlanShape, isoDate: string): number {
  const len = plan.days.length;
  if (len === 0) return 0;
  const [y, m, d] = isoDate.split('-').map(Number);
  const date =
    y != null && m != null && d != null && Number.isFinite(y + m + d)
      ? new Date(y, m - 1, d)
      : new Date();
  return ((date.getDay() + 6) % 7) % len;
}

/* ------------------------------------------------------------------------- preference filter */

/**
 * Base-diet subset lattice (RESEARCH-DIET §3): vegan ⊂ vegetarian ⊂ omnivore and
 * pescatarian ⊂ omnivore — a vegetarian can eat every vegan dish, an omnivore anything.
 */
const BASE_ACCEPTS: Record<PrefsShape['base'], readonly string[] | null> = {
  omnivore: null, // no base restriction
  pescatarian: ['pescatarian', 'vegetarian', 'vegan'],
  vegetarian: ['vegetarian', 'vegan'],
  vegan: ['vegan'],
};

/**
 * Dietary compatibility is ABSOLUTE (research §5 rule 2): the base diet must be satisfied and
 * every exclusion tag must be present on the recipe. No scoring, no "97% match" — a dish either
 * passes the whole stack or is not shown.
 */
export function recipeMatchesPrefs(recipe: Recipe, prefs: PrefsShape): boolean {
  const accepted = BASE_ACCEPTS[prefs.base];
  if (accepted && !accepted.some((t) => recipe.tags.includes(t))) return false;
  return prefs.avoid.every((tag) => recipe.tags.includes(tag));
}

/* -------------------------------------------------------------------------------- arithmetic */

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per-serving macros × the planned servings — the numbers a "Log this meal" writes. */
export function scaledMacros(recipe: Recipe, servings: number): Macros {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    kcal: Math.round(recipe.per_serving.kcal * s),
    protein_g: round1(recipe.per_serving.protein_g * s),
    carbs_g: round1(recipe.per_serving.carbs_g * s),
    fat_g: round1(recipe.per_serving.fat_g * s),
  };
}

/**
 * Grams for the NutritionLog row, read out of the corpus's serving_label ("1 plate (~320 g)").
 * `null` when the label carries no weight — an honest absence beats an invented number, and the
 * log row renders fine without it (the macro line is the load-bearing part).
 */
export function servingGrams(recipe: Recipe, servings: number): number | null {
  const m = recipe.serving_label.match(/~?\s*(\d+(?:\.\d+)?)\s*g\b/);
  if (!m?.[1]) return null;
  const grams = Number(m[1]) * (Number.isFinite(servings) && servings > 0 ? servings : 1);
  return Number.isFinite(grams) ? Math.round(grams) : null;
}

/* ------------------------------------------------------------------------------ delta display */

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');

/**
 * The swap sheet's signed comparison line: "−40 kcal · +6 g protein".
 *
 * Both sides are compared at the OUTGOING dish's planned servings — `applySwap` keeps the slot's
 * servings, so that is the honest like-for-like. Only kcal and protein are shown: those are the
 * two numbers the swap rules actually constrain (research §5 — carbs/fat deltas are deliberately
 * unpoliced, so displaying them would imply a rule that does not exist).
 */
export function swapDeltaLine(outgoing: Recipe, candidate: Recipe, servings: number): string {
  const from = scaledMacros(outgoing, servings);
  const to = scaledMacros(candidate, servings);
  const dKcal = Math.round(to.kcal - from.kcal);
  const dProtein = Math.round(to.protein_g - from.protein_g);
  return `${signed(dKcal)} kcal · ${signed(dProtein)} g protein`;
}
