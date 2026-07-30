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

/* ── entry timestamps ─────────────────────────────────────────────────────────
   A food row carries TWO different times and conflating them loses information:
   `logged_on` is the day the food counts toward, `logged_at` is the moment it was recorded. The
   pair is what distinguishes "logged as I ate it" from "backfilled the whole day at midnight",
   and it is what lets the day view say when breakfast actually went in. */

/** The fields to spread onto a new log row: a full local timestamp with offset, plus the zone. */
export function entryStamp(now: Date = new Date()): { logged_at: string; logged_tz: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -now.getTimezoneOffset(); // JS reports the inverse of the ISO sign
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    /* engine without resolvedOptions — the offset in the stamp still carries the truth */
  }
  return { logged_at: stamp, logged_tz: tz };
}

/** "8:42 am" in the reader's locale, or null when the row predates entry timestamps. */
export function formatEntryTime(logged_at: string | undefined): string | null {
  if (!logged_at) return null;
  const t = new Date(logged_at);
  if (Number.isNaN(t.getTime())) return null;
  return t
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?([AP])M/i, (_, m: string) => ` ${m.toLowerCase()}m`);
}

/**
 * Sort key for a row within its day: entry time when known, else Infinity so undated rows (older
 * data, or a copied day) settle at the end rather than jumping to 1970 and above real entries.
 */
export function entryOrder(logged_at: string | undefined): number {
  if (!logged_at) return Number.POSITIVE_INFINITY;
  const t = Date.parse(logged_at);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * The everyday half of a catalog name.
 *
 * Catalog rows carry USDA-style qualifiers — "Chicken breast, grilled/roasted, skinless", "Yogurt,
 * Greek, plain, nonfat" — which are exactly right in a search result and unreadable in a 390 px row
 * next to a portion and two macros. The part before the first comma is the part people say out loud.
 *
 * Truncation is a LAST resort at 28 characters, because a hard cap on a name that happens to have no
 * comma ("Cottage cheese low fat") beats letting the row wrap to three lines.
 */
export function shortFoodName(name: string): string {
  const head = name.split(',')[0]!.trim();
  const short = head.length > 0 ? head : name.trim();
  return short.length > 28 ? `${short.slice(0, 27).trimEnd()}…` : short;
}
