/**
 * REAL PORTIONS — "what do I actually eat to close this gap?", answered in units people own.
 *
 * ─── the bug this replaces ──────────────────────────────────────────────────────────────────
 * The old gap suggester solved `grams = gapProtein / proteinPer100g × 100`: one food, scaled until
 * it closed the ENTIRE remaining protein target. With 110 g outstanding that produced "~150 g whey
 * protein powder" — five scoops in one sitting — and "350 g chicken breast". Both are arithmetically
 * correct and nutritionally absurd, and absurd advice teaches people to ignore the advice.
 *
 * ─── what replaces it, and why these numbers ────────────────────────────────────────────────
 * A portion is ONE STANDARD SERVING of a food, taken from the catalog's own `serving_name` /
 * `household_measures` (1 scoop = 31 g, 1 chicken breast = 172 g, 1 pot of skyr = 170 g). That data
 * is the same idea as the FDA's Reference Amounts Customarily Consumed (21 CFR 101.12) — the amount
 * customarily eaten on one occasion — so a portion here is a portion as a shopper understands it.
 *
 * A suggestion may stack a small number of those servings, but never more protein than one MEAL can
 * usefully carry. That ceiling is 0.4 g/kg of body weight: the dose-response work on muscle protein
 * synthesis puts maximal stimulation around 0.25 g/kg/meal in young adults, and 0.4 g/kg is that
 * figure plus two standard deviations — the number the review literature recommends per meal when
 * spreading 1.6–2.2 g/kg/day across three to four meals (Schoenfeld & Aragon, JISSN 2018). So the
 * app's answer to "110 g of protein left" stops being "eat 110 g now" and becomes "that is about
 * three more meals — here is what one of them looks like".
 *
 * Pure data + arithmetic. No React, no catalog import (candidates are injected), so it is testable
 * from a plain node script and cannot drift from what the screen renders.
 */
import type { Food } from './types';

/** Grams of protein worth putting in one meal, from body weight. */
export const PER_MEAL_G_PER_KG = 0.4;
/** Used when body weight is unknown — 0.4 g/kg for a ~88 kg adult, rounded. */
export const DEFAULT_PER_MEAL_PROTEIN = 35;
/** Nobody is served by "one meal" meaning 15 g or 70 g, whatever the arithmetic says. */
const PER_MEAL_FLOOR = 25;
const PER_MEAL_CEILING = 55;

/**
 * Backstop only: past half a kilo it is not one eating occasion whatever the arithmetic says.
 *
 * Deliberately loose, because the PROTEIN ceiling does the real work — it is what stops "350 g of
 * chicken" (108 g of protein) long before any weight limit would. A tight gram cap looks prudent and
 * is actually wrong for dilute foods: two 170 g pots of skyr is 340 g and an entirely ordinary snack.
 */
const MAX_PORTION_GRAMS = 500;
/** Hard cap on stacked servings, so "6 scoops" can never be phrased as a suggestion. */
const MAX_SERVINGS = 3;

/**
 * How much protein belongs in one meal for this athlete.
 *
 * Clamped at both ends on purpose: the linear rule is only sensible across ordinary body weights,
 * and the clamp is what keeps a 55 kg lifter from being told 22 g is a meal while a 140 kg lifter is
 * told to find 56 g of protein in one sitting.
 */
export function proteinPerMeal(bodyKg?: number | null): number {
  if (!bodyKg || !Number.isFinite(bodyKg) || bodyKg <= 0) return DEFAULT_PER_MEAL_PROTEIN;
  const raw = bodyKg * PER_MEAL_G_PER_KG;
  return Math.round(Math.min(PER_MEAL_CEILING, Math.max(PER_MEAL_FLOOR, raw)));
}

/** Meals (at `perMeal` each) still needed to cover `gapProtein`. 0 when the goal is met. */
export function mealsToClose(gapProtein: number, perMeal: number): number {
  if (gapProtein <= 0 || perMeal <= 0) return 0;
  return Math.max(1, Math.round(gapProtein / perMeal));
}

/** Units that are already plural or never take an -s. */
const INVARIANT_UNITS = new Set(['oz', 'tbsp', 'tsp', 'ml', 'g', 'kg', 'fl oz', 'slices', 'pieces']);

function pluralise(unit: string, count: number): string {
  if (count === 1) return unit;
  const u = unit.toLowerCase();
  if (INVARIANT_UNITS.has(u)) return unit;
  if (/(s|x|ch|sh)$/.test(u)) return `${unit}es`;
  return `${unit}s`;
}

export interface StandardPortion {
  grams: number;
  /** The unit a person counts in ("scoop", "breast", "pot"), when the food names one. */
  unit: string | null;
  /** The catalog's own label for one serving, e.g. "1 scoop" or "3 oz". */
  servingName: string;
}

/**
 * ONE standard serving of a food.
 *
 * `household_measures` is preferred over `serving_grams` when it offers a countable unit, because a
 * unit is what makes multiples speakable: "2 scoops" is a sentence, "62 g of whey" is a calculation.
 * The first measure is the food's primary one by construction of the catalog (see RESEARCH-FOOD §C4).
 */
export function standardPortion(food: Food): StandardPortion {
  const measure = food.household_measures.find((m) => m.grams > 0);
  const servingName = food.serving_name?.trim() || (measure ? `1 ${measure.name}` : '100 g');
  // The measure is only usable as a COUNTING unit when it agrees with the default serving; a
  // "tbsp" measure under a "1 cup" serving would otherwise turn one serving into sixteen units.
  const usable = measure && Math.abs(measure.grams - food.serving_grams) <= 1 ? measure : null;
  const grams = food.serving_grams > 0 ? food.serving_grams : (measure?.grams ?? 100);
  return { grams, unit: usable ? usable.name : null, servingName };
}

export interface FoodPortion {
  food: Food;
  /** How many standard servings — at least 1, never more than {@link MAX_SERVINGS}. */
  servings: number;
  /** Total grams for `servings` servings. */
  grams: number;
  /** What to say out loud: "2 scoops (62 g)", "1 chicken breast (172 g)". */
  label: string;
  protein_g: number;
  kcal: number;
}

/** "2 scoops (62 g)" — the unit first, because that is what the athlete measures with. */
export function portionLabel(food: Food, servings: number, grams: number): string {
  const { unit, servingName } = standardPortion(food);
  const amount = `${Math.round(grams)} g`;
  if (unit) return `${servings} ${pluralise(unit, servings)} (${amount})`;
  if (servings === 1) return `${servingName} (${amount})`;
  return `${servings} × ${servingName} (${amount})`;
}

function portionFor(food: Food, servings: number): FoodPortion {
  const { grams: unitGrams } = standardPortion(food);
  const grams = Math.round(unitGrams * servings);
  const f = grams / 100;
  return {
    food,
    servings,
    grams,
    label: portionLabel(food, servings, grams),
    protein_g: Math.round(food.per_100g.protein_g * f),
    kcal: Math.round(food.per_100g.kcal * f),
  };
}

/**
 * Build the portion of `food` to suggest: whole servings, stopping at whichever comes first —
 * the meal's protein ceiling, the calories left, {@link MAX_SERVINGS}, or {@link MAX_PORTION_GRAMS}.
 *
 * ONE STANDARD SERVING IS ALWAYS ALLOWED, even when it carries more protein than the meal ceiling.
 * A whole 172 g chicken breast is 53 g of protein and is also exactly what people put on a plate;
 * refusing it would mean suggesting two thirds of a chicken breast, which nobody weighs out. The
 * ceiling governs STACKING — and stacking, unbounded, is what produced five scoops of whey.
 *
 * Returns null when even ONE serving busts the calorie budget, because the honest answer there is
 * "not this food", not a fractional serving.
 */
export function suggestPortion(
  food: Food,
  opts: { perMeal: number; kcalLeft: number; gapProtein: number },
): FoodPortion | null {
  const single = portionFor(food, 1);
  if (single.protein_g <= 0) return null;
  // A budget of 0 or less means "over target" — suggestions are still allowed to exist (protein
  // matters after the calories run out) but they may not stack.
  const budget = opts.kcalLeft > 0 ? opts.kcalLeft : 0;
  if (budget > 0 && single.kcal > budget) return null;
  if (single.grams > MAX_PORTION_GRAMS) return null;

  // The ceiling is the SMALLER of "one meal's protein" and "what is actually still needed": with
  // 12 g outstanding, two scoops is not a helpful suggestion even though a meal could hold them.
  const target = Math.max(1, Math.min(opts.perMeal, opts.gapProtein));
  let best = single;
  for (let n = 2; n <= MAX_SERVINGS; n++) {
    const p = portionFor(food, n);
    if (p.protein_g > target) break;
    if (p.grams > MAX_PORTION_GRAMS) break;
    if (budget > 0 && p.kcal > budget) break;
    best = p;
  }
  return best;
}

/** Protein-dense enough to be a protein suggestion: over half its energy, and a real amount of it. */
export function isProteinDense(food: Food): boolean {
  const kcal = food.per_100g.kcal;
  return kcal > 0 && (food.per_100g.protein_g * 4) / kcal >= 0.5 && food.per_100g.protein_g >= 8;
}

export interface PortionPlan {
  /** Single portions to offer, one per food category so it reads as a choice. */
  options: FoodPortion[];
  /**
   * A worked combination that closes the gap: 2–3 different portions whose protein sums to at least
   * most of what is left. Empty when one portion already does it, or when nothing fits the budget.
   */
  plate: FoodPortion[];
  /** Protein the plate delivers. */
  plateProtein: number;
  /** Calories the plate spends. */
  plateKcal: number;
  /** Meals the remaining protein represents, at this athlete's per-meal figure. */
  meals: number;
  perMeal: number;
}

/**
 * Turn "N g of protein left" into portions a person can picture, and one worked combination.
 *
 * `candidates` is injected (recents first, then the catalog) so ranking policy stays with the caller
 * and this function stays pure. One portion per category, because five cuts of chicken is a list,
 * not a choice.
 */
export function planPortions(
  gapProtein: number,
  kcalLeft: number,
  candidates: Food[],
  opts: { bodyKg?: number | null; limit?: number } = {},
): PortionPlan {
  const perMeal = proteinPerMeal(opts.bodyKg);
  const meals = mealsToClose(gapProtein, perMeal);
  const limit = opts.limit ?? 3;
  const empty: PortionPlan = { options: [], plate: [], plateProtein: 0, plateKcal: 0, meals, perMeal };
  if (gapProtein < 8) return empty;

  const options: FoodPortion[] = [];
  const seenFood = new Set<string>();
  const seenCategory = new Set<string>();
  for (const food of candidates) {
    if (seenFood.has(food.id)) continue;
    seenFood.add(food.id);
    if (!isProteinDense(food)) continue;
    if (seenCategory.has(food.category)) continue;
    const portion = suggestPortion(food, { perMeal, kcalLeft, gapProtein });
    if (!portion) continue;
    seenCategory.add(food.category);
    options.push(portion);
    if (options.length >= limit) break;
  }

  /**
   * THE PLATE: greedy over the same options, which is deliberate — the combination has to be made of
   * things the athlete can see and tap, or it reads as a different, hidden recommendation.
   */
  const plate: FoodPortion[] = [];
  let remaining = gapProtein;
  let spent = 0;
  for (const option of options) {
    if (plate.length >= 3 || remaining < 8) break;
    if (kcalLeft > 0 && spent + option.kcal > kcalLeft) continue;
    plate.push(option);
    remaining -= option.protein_g;
    spent += option.kcal;
  }
  const plateProtein = plate.reduce((n, p) => n + p.protein_g, 0);

  return {
    options,
    // One portion that already covers the gap needs no combination — the option row says it.
    plate: plate.length > 1 ? plate : [],
    plateProtein: plate.length > 1 ? plateProtein : 0,
    plateKcal: plate.length > 1 ? spent : 0,
    meals,
    perMeal,
  };
}
