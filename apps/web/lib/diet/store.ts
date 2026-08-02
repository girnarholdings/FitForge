'use client';

/**
 * DIET PLAN STORE — `fitforge.diet.v1`.
 *
 * One entry: the generated 7-day plan plus the prefs/stance it was generated under and when.
 * Normalize-on-read like lib/readiness/store.ts: whatever localStorage hands back is coerced into
 * a valid shape or dropped — unknown recipe ids are removed (a plan referencing a recipe this
 * build doesn't ship must not render blank cards), servings snap to the legal 1/1.5/2 steps,
 * prefs/stance fall back to their safest values.
 *
 * NOT on the sync denylist — a meal plan is not health data (unlike readiness check-ins), so it
 * rides the normal export/sync paths like any other `fitforge.*` key.
 */
import * as React from 'react';
import { safeSetItem } from '@/lib/storage/safeWrite';
import type { MealSlotName } from '@/lib/food/types';
import {
  RECIPE_BY_ID,
  type AvoidTag,
  type DietPrefs,
  type RecipeBaseDiet,
} from './recipes';
import {
  SERVING_STEPS,
  type DietDay,
  type DietPlan,
  type DietStance,
  type PlannedMeal,
} from './plan';
import { bestSwapServing } from './swaps';

export const DIET_KEY = 'fitforge.diet.v1';

export interface DietPlanEntry {
  version: 1;
  plan: DietPlan;
  prefs: DietPrefs;
  stance: DietStance;
  generatedAt: string;
}

const listeners = new Set<() => void>();
let cache: DietPlanEntry | null | undefined;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/* -------------------------------------------------------------------- normalize-on-read */

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const BASES: RecipeBaseDiet[] = ['omnivore', 'pescatarian', 'vegetarian', 'vegan'];
const AVOID_TAGS: AvoidTag[] = [
  'dairy_free',
  'gluten_free',
  'halal_friendly',
  'nut_free',
  'shellfish_free',
  'egg_free',
  'soy_free',
  'fish_free',
  'sesame_free',
];
const STANCES: DietStance[] = ['cut', 'lean-gain', 'recomp', 'endurance', 'maintain'];

function normalizeServings(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  let best = 1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const s of SERVING_STEPS) {
    const delta = Math.abs(s - n);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = s;
    }
  }
  return best;
}

function normalizeMeal(value: unknown): PlannedMeal | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const slot = raw.slot;
  if (typeof slot !== 'string' || !SLOTS.includes(slot as MealSlotName)) return null;
  const recipeId = raw.recipeId;
  if (typeof recipeId !== 'string' || !RECIPE_BY_ID.has(recipeId)) return null;
  const meal: PlannedMeal = {
    slot: slot as MealSlotName,
    recipeId,
    servings: normalizeServings(raw.servings),
  };
  if (raw.leftover === true) meal.leftover = true;
  return meal;
}

function normalizePrefs(value: unknown): DietPrefs {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const base = BASES.includes(raw.base as RecipeBaseDiet) ? (raw.base as RecipeBaseDiet) : 'omnivore';
  const avoid = Array.isArray(raw.avoid)
    ? (raw.avoid.filter((t) => AVOID_TAGS.includes(t as AvoidTag)) as AvoidTag[])
    : [];
  return { base, avoid };
}

function normalizeStance(value: unknown): DietStance {
  return STANCES.includes(value as DietStance) ? (value as DietStance) : 'maintain';
}

function normalizePlan(value: unknown, prefs: DietPrefs, stance: DietStance): DietPlan | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.days)) return null;
  const days: DietDay[] = [];
  for (const rawDay of raw.days.slice(0, 7)) {
    const meals = Array.isArray((rawDay as Record<string, unknown>)?.meals)
      ? ((rawDay as Record<string, unknown>).meals as unknown[])
      : [];
    days.push({ meals: meals.map(normalizeMeal).filter((m): m is PlannedMeal => m !== null) });
  }
  if (days.length === 0) return null;
  const rawTargets =
    typeof raw.targets === 'object' && raw.targets !== null
      ? (raw.targets as Record<string, unknown>)
      : {};
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    days,
    stance,
    prefs,
    weightKg: num(raw.weightKg),
    targets: {
      kcal_target: num(rawTargets.kcal_target),
      protein_g_target: num(rawTargets.protein_g_target),
      carbs_g_target: num(rawTargets.carbs_g_target),
      fat_g_target: num(rawTargets.fat_g_target),
    },
  };
}

function normalizeEntry(value: unknown): DietPlanEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const prefs = normalizePrefs(raw.prefs);
  const stance = normalizeStance(raw.stance);
  const plan = normalizePlan(raw.plan, prefs, stance);
  if (!plan) return null;
  return {
    version: 1,
    plan,
    prefs,
    stance,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
  };
}

function load(): DietPlanEntry | null {
  if (cache !== undefined) return cache;
  cache = null;
  if (!isBrowser()) {
    cache = undefined; // do not pin the server's "nothing" as this client's answer
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DIET_KEY);
    cache = raw ? normalizeEntry(JSON.parse(raw)) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function save(next: DietPlanEntry | null): void {
  cache = next;
  // A write that fails must be SAID, not swallowed — safeSetItem raises the app-wide
  // storage-full flag; the in-memory copy still serves this session either way.
  if (isBrowser() && next) safeSetItem(DIET_KEY, JSON.stringify(next));
  if (isBrowser() && !next) window.localStorage.removeItem(DIET_KEY);
  for (const l of listeners) l();
}

/* ------------------------------------------------------------------------------ public API */

export function getDietPlan(): DietPlanEntry | null {
  return load();
}

/** Store a freshly generated plan; prefs/stance are lifted from the plan itself. */
export function setDietPlan(plan: DietPlan): void {
  save({
    version: 1,
    plan,
    prefs: plan.prefs,
    stance: plan.stance,
    generatedAt: new Date().toISOString(),
  });
}

export function clearDietPlan(): void {
  save(null);
}

/**
 * Apply a swap chosen from {@link swapCandidates}: the meal keeps its slot, the incoming recipe
 * takes the serving step that best matches the outgoing dish's planned kcal (so the day's totals
 * move as little as possible — §5 rule 8's spirit without silent re-portioning of other dishes).
 * The user's choice always wins: an id that fails the candidate checks is still applied at its
 * kcal-closest serving. Applying the same swap twice is a no-op.
 */
export function applySwap(day: number, slot: MealSlotName, recipeId: string): void {
  const entry = load();
  if (!entry) return;
  const incoming = RECIPE_BY_ID.get(recipeId);
  const planDay = entry.plan.days[day];
  if (!incoming || !planDay) return;
  const index = planDay.meals.findIndex((m) => m.slot === slot);
  if (index === -1) return;
  const outgoing = planDay.meals[index]!;
  const outgoingRecipe = RECIPE_BY_ID.get(outgoing.recipeId);
  const outgoingKcal = (outgoingRecipe?.per_serving.kcal ?? incoming.per_serving.kcal) * outgoing.servings;
  const outgoingProtein = (outgoingRecipe?.per_serving.protein_g ?? 0) * outgoing.servings;

  let servings = bestSwapServing(incoming, outgoingKcal, outgoingProtein, null);
  if (servings === null) {
    // Never block the swap — fall back to the kcal-closest step.
    let bestDelta = Number.POSITIVE_INFINITY;
    servings = 1;
    for (const s of SERVING_STEPS) {
      const delta = Math.abs(incoming.per_serving.kcal * s - outgoingKcal);
      if (delta < bestDelta) {
        bestDelta = delta;
        servings = s;
      }
    }
  }

  const meals = planDay.meals.slice();
  meals[index] = { slot, recipeId, servings };
  const days = entry.plan.days.slice();
  days[day] = { meals };
  save({ ...entry, plan: { ...entry.plan, days } });
}

export function subscribeDietPlan(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDietPlan(): DietPlanEntry | null {
  return React.useSyncExternalStore(
    subscribeDietPlan,
    () => load(),
    () => null,
  );
}

/** Test hook — drops the in-memory cache so the next read hits (mocked) localStorage again. */
export function _resetDietStoreForTests(): void {
  cache = undefined;
}
