/**
 * Nutrition maths + display formatting shared by the day view, the confirm screen and the tests.
 * Pure functions only, so the parser script can print exactly what the UI shows.
 */
import type { Food, Macros } from './types';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Macros for `grams` of a food (per-100 g values scaled). */
export function computeMacros(food: Food, grams: number): Macros {
  const factor = (Number.isFinite(grams) ? Math.max(0, grams) : 0) / 100;
  return {
    kcal: Math.round(food.per_100g.kcal * factor),
    protein_g: round1(food.per_100g.protein_g * factor),
    carbs_g: round1(food.per_100g.carbs_g * factor),
    fat_g: round1(food.per_100g.fat_g * factor),
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: round1(a.protein_g + b.protein_g),
    carbs_g: round1(a.carbs_g + b.carbs_g),
    fat_g: round1(a.fat_g + b.fat_g),
  };
}

export const ZERO_MACROS: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export function sumMacros(rows: Macros[]): Macros {
  return rows.reduce(addMacros, ZERO_MACROS);
}

/** "12.6P / 0.7C / 9.9F" — the compact macro line used on every row. */
export function formatMacros(m: Macros): string {
  return `${round1(m.protein_g)}P / ${round1(m.carbs_g)}C / ${round1(m.fat_g)}F`;
}

/** "143 kcal · 12.6P / 0.7C / 9.9F" */
export function formatNutrition(m: Macros): string {
  return `${Math.round(m.kcal)} kcal · ${formatMacros(m)}`;
}

export function formatGrams(grams: number): string {
  return grams >= 100 ? `${Math.round(grams)} g` : `${round1(grams)} g`;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** §C2.6 thresholds: ≥.8 green (pre-checked) · .5–.8 amber (best guess) · <.5 red (unchecked). */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

export function confidenceHint(level: ConfidenceLevel): string {
  if (level === 'high') return 'Looks right';
  if (level === 'medium') return 'Best guess — tap to change';
  return 'Not sure — tap to fix';
}
