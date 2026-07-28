/**
 * "WHAT CAN I EAT?" — answered from the catalog and the day's arithmetic, never generated.
 *
 * This is deliberately NOT an AI feature. The question has a correct answer that follows from two
 * things the app already knows exactly: how much of each macro is left today, and what is in the
 * food catalog. A language model asked the same question invents plausible foods with invented
 * numbers, which is the one thing a nutrition tracker must never do — so the Coach answers this one
 * itself, and every gram and calorie below traces to a real catalog row.
 *
 * WHAT "HEALTHY" MEANS HERE, stated plainly because the word is doing real work:
 *   · PROTEIN FIRST. It is the macro people miss, the one with the strongest evidence base for
 *     body composition and satiety, and the hardest to fix late in the day.
 *   · FIBRE IS A POSITIVE. It tracks whole foods better than any single other field in the data.
 *   · SUGAR AND SODIUM ARE PENALTIES, in proportion to the energy they arrive with.
 *   · ENERGY DENSITY IS A MILD PENALTY, because the point is to close a gap without spending it
 *     all in three bites.
 *
 * THE HONEST LIMITS:
 *   · FDC reports TOTAL sugars, not added sugars. A banana and a biscuit are not distinguished on
 *     that field, which is why sugar is one weighted term among several rather than a veto.
 *   · Missing fibre/sugar/sodium are treated as unknown (neutral), not as zero. Scoring a row that
 *     simply lacks the field as if it contained none would flatter incomplete data.
 */
import type { Food } from './types';

export interface MacroGap {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FoodSuggestion {
  food: Food;
  /** Portion proposed, in grams — a real serving, rounded to something you can picture. */
  grams: number;
  /** What that portion actually contains. Computed, never estimated. */
  macros: MacroGap;
  /** Share of the remaining protein this portion covers, 0–1. */
  proteinShare: number;
  /** Share of the remaining calories this portion spends, 0–1. */
  kcalShare: number;
  /** Plain-language justification, shown to the user. */
  reason: string;
}

/** Below this many calories left, there is nothing useful to suggest. */
const MIN_USEFUL_KCAL = 60;

/** Never propose a portion that spends more than this share of the remaining calories. */
const MAX_KCAL_SHARE = 0.55;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Nutritional quality per 100 kcal, so a portion size cannot buy a better score.
 *
 * Per-100-kcal rather than per-100-g throughout: comparing lettuce to peanut butter by weight says
 * only that lettuce is mostly water. What matters when closing a calorie budget is what each
 * calorie brings with it.
 */
export function qualityScore(food: Food): number {
  const p = food.per_100g;
  const kcal = p.kcal;
  if (!(kcal > 0)) return 0;
  const per100kcal = (v: number) => (v * 100) / kcal;

  let score = 0;
  // Protein density. 10 g per 100 kcal is lean-meat territory; 2 g is bread.
  score += clamp(per100kcal(p.protein_g) / 10, 0, 1) * 60;
  // Fibre, when the row reports it. `undefined` means unmeasured, not absent.
  if (p.fiber_g !== undefined) score += clamp(per100kcal(p.fiber_g) / 4, 0, 1) * 25;
  // Sugar, likewise only when reported. TOTAL sugars — see the header note.
  if (p.sugar_g !== undefined) score -= clamp(per100kcal(p.sugar_g) / 15, 0, 1) * 25;
  // Sodium in mg per 100 kcal; 600 is a heavily salted processed food.
  if (p.sodium_mg !== undefined) score -= clamp(per100kcal(p.sodium_mg) / 600, 0, 1) * 15;
  // Energy density, mild: 400 kcal/100 g and up is oils, nuts, confectionery.
  score -= clamp(kcal / 400, 0, 1) * 10;
  return score;
}

/** Portion that closes the gap sensibly: the food's own serving, shrunk if it would overshoot. */
function portionFor(food: Food, gap: MacroGap): number {
  const base = food.serving_grams > 0 ? food.serving_grams : 100;
  const kcalPerGram = food.per_100g.kcal / 100;
  if (!(kcalPerGram > 0)) return base;

  const budget = gap.kcal * MAX_KCAL_SHARE;
  const maxGrams = budget / kcalPerGram;
  const grams = Math.min(base, maxGrams);

  // Round to something a person can act on rather than to a false precision like 63.4 g.
  if (grams >= 100) return Math.round(grams / 25) * 25;
  if (grams >= 20) return Math.round(grams / 5) * 5;
  return Math.max(5, Math.round(grams));
}

function macrosFor(food: Food, grams: number): MacroGap {
  const f = grams / 100;
  const r = (v: number) => Math.round(v * f * 10) / 10;
  return {
    kcal: Math.round(food.per_100g.kcal * f),
    protein_g: r(food.per_100g.protein_g),
    carbs_g: r(food.per_100g.carbs_g),
    fat_g: r(food.per_100g.fat_g),
  };
}

function reasonFor(s: Omit<FoodSuggestion, 'reason'>, proteinLed: boolean): string {
  const pct = Math.round(s.proteinShare * 100);
  if (proteinLed && pct >= 15) {
    return `${s.macros.protein_g} g protein for ${s.macros.kcal} kcal — about ${pct}% of what you have left`;
  }
  const fibre = s.food.per_100g.fiber_g;
  if (fibre !== undefined && fibre >= 4) {
    return `${s.macros.kcal} kcal and high in fibre — fills the gap without much sugar`;
  }
  return `${s.macros.kcal} kcal · ${s.macros.protein_g} g protein · ${s.macros.carbs_g} g carbs · ${s.macros.fat_g} g fat`;
}

export interface SuggestResult {
  /** Empty when there is nothing sensible to propose; `note` says why. */
  suggestions: FoodSuggestion[];
  note: string;
  /** True when protein is the binding constraint — drives the copy and the ranking. */
  proteinLed: boolean;
}

/**
 * Rank foods that help close `gap`.
 *
 * `catalog` is injected rather than imported so this stays pure and testable, and so the caller
 * decides whether that is the curated tier-1 core or something wider.
 */
export function suggestForGap(gap: MacroGap, catalog: Food[], limit = 5): SuggestResult {
  if (gap.kcal <= 0) {
    return {
      suggestions: [],
      proteinLed: false,
      note: "You're at your calorie target for the day. If you're hungry, something high in protein or fibre will cost you the least.",
    };
  }
  if (gap.kcal < MIN_USEFUL_KCAL) {
    return {
      suggestions: [],
      proteinLed: false,
      note: `Only about ${Math.round(gap.kcal)} kcal left — not really enough for another item. Worth leaving it.`,
    };
  }

  // Protein leads whenever a larger share of it is outstanding than of calories: that is precisely
  // the situation where what you eat next matters more than whether you eat.
  const proteinNeed = Math.max(0, gap.protein_g);
  const proteinLed = proteinNeed > 0 && proteinNeed / Math.max(1, gap.kcal / 100) > 1.2;

  // The score is ranking scaffolding, not part of what a caller receives, so it rides alongside
  // the suggestion rather than being cast onto it.
  const scored: { s: Omit<FoodSuggestion, 'reason'>; score: number }[] = [];
  for (const food of catalog) {
    if (!(food.per_100g.kcal > 0)) continue;

    const grams = portionFor(food, gap);
    if (grams <= 0) continue;
    const macros = macrosFor(food, grams);
    if (macros.kcal <= 0) continue;

    const kcalShare = macros.kcal / gap.kcal;
    if (kcalShare > MAX_KCAL_SHARE + 0.01) continue;
    const proteinShare = proteinNeed > 0 ? clamp(macros.protein_g / proteinNeed, 0, 1) : 0;

    // Fit: how much of the outstanding protein this buys per calorie spent. When protein is
    // already met, quality stands alone so the answer does not degenerate into "more chicken".
    const fit = proteinLed ? (proteinShare / Math.max(0.05, kcalShare)) * 40 : 0;
    scored.push({
      s: { food, grams, macros, proteinShare, kcalShare },
      score: qualityScore(food) + clamp(fit, 0, 60),
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // ONE PER CATEGORY. Without this the list is five cuts of chicken — technically the top five by
  // score, useless as a set of options to choose between.
  const seenCategory = new Set<string>();
  const picked: FoodSuggestion[] = [];
  for (const { s } of scored) {
    if (seenCategory.has(s.food.category)) continue;
    seenCategory.add(s.food.category);
    picked.push({ ...s, reason: reasonFor(s, proteinLed) });
    if (picked.length >= limit) break;
  }

  const note = proteinLed
    ? `You have about ${Math.round(gap.kcal)} kcal and ${Math.round(proteinNeed)} g of protein left. These give you the most protein for the fewest calories.`
    : `You have about ${Math.round(gap.kcal)} kcal left. These are the most nutrient-dense options that fit.`;

  return { suggestions: picked, note, proteinLed };
}
