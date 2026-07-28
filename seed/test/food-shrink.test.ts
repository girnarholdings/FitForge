import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — plain .mjs, deliberately untyped: import-usda.mjs runs under bare `node`.
import {
  normaliseName,
  duplicateSignature,
  rankForShard,
  slimFood,
} from '../lib/food-shrink.mjs';

/**
 * The rules that decide what the tier-2 catalog actually contains.
 *
 * These matter more than they look. `duplicateSignature` deciding two rows are the same food
 * DELETES one of them, and `rankForShard` decides who survives when a bucket is over its cap — so
 * a careless change here quietly removes foods from the app rather than breaking a build.
 */

const food = (over: Record<string, unknown> = {}) => ({
  id: 'fdc-1',
  name: 'Cookies, chocolate chip',
  category: 'snack',
  per_100g: { kcal: 480, protein_g: 5, carbs_g: 64, fat_g: 24 },
  serving_name: '30 g',
  serving_grams: 30,
  household_measures: [],
  ...over,
});

/* ── normalisation ────────────────────────────────────────────────────────────────────────── */

test('normalisation strips case, punctuation and the display brand suffix', () => {
  assert.equal(normaliseName('Cookies, Chocolate Chip (Nabisco)'), 'cookies chocolate chip');
});

test('normalisation strips pack sizes, which never distinguish two foods', () => {
  assert.equal(normaliseName('Greek Yogurt 500 g'), normaliseName('Greek Yogurt 12 oz'));
  assert.equal(normaliseName('Soda 2 L'), normaliseName('Soda 12 fl oz'));
});

test('normalisation strips marketing filler', () => {
  assert.equal(normaliseName('NEW! Original Premium Hummus'), 'hummus');
});

test('normalisation keeps words that identify the food', () => {
  assert.notEqual(normaliseName('Chicken breast'), normaliseName('Chicken thigh'));
  assert.notEqual(normaliseName('Whole milk'), normaliseName('Skim milk'));
});

/* ── duplicate detection ──────────────────────────────────────────────────────────────────── */

test('the same product from two brands collapses', () => {
  const a = food({ id: 'fdc-1', name: 'Cookies, Chocolate Chip (Brand A)' });
  const b = food({ id: 'fdc-2', name: 'COOKIES CHOCOLATE CHIP 12 oz (Brand B)' });
  assert.equal(duplicateSignature(a), duplicateSignature(b));
});

test('rounding-level macro differences still collapse', () => {
  // Manufacturers round label values before FDC ever sees them, so identical products routinely
  // differ by a gram or a few kcal.
  const a = food({ per_100g: { kcal: 480, protein_g: 5, carbs_g: 64, fat_g: 24 } });
  const b = food({ per_100g: { kcal: 483, protein_g: 5.4, carbs_g: 63.2, fat_g: 24.6 } });
  assert.equal(duplicateSignature(a), duplicateSignature(b));
});

test('the same name with genuinely different nutrition does NOT collapse', () => {
  // THE IMPORTANT ONE. "Protein bar" spans 200–400 kcal across real products; collapsing those
  // would log the user a number that is simply wrong for what they ate.
  const a = food({ name: 'Protein Bar', per_100g: { kcal: 200, protein_g: 20, carbs_g: 20, fat_g: 5 } });
  const b = food({ name: 'Protein Bar', per_100g: { kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 14 } });
  assert.notEqual(duplicateSignature(a), duplicateSignature(b));
});

test('different foods that share macros do NOT collapse', () => {
  const a = food({ name: 'Water' , per_100g: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } });
  const b = food({ name: 'Black coffee', per_100g: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } });
  assert.notEqual(duplicateSignature(a), duplicateSignature(b));
});

/* ── ranking ──────────────────────────────────────────────────────────────────────────────── */

test('generic lab-analysed foods outrank branded ones', () => {
  const generic = food({ name: 'Chicken, breast, raw' });
  const brand = food({ name: 'Chicken, breast, raw' });
  assert.ok(rankForShard(generic, 'foundation') > rankForShard(brand, 'branded'));
  assert.ok(rankForShard(generic, 'srLegacy') > rankForShard(brand, 'branded'));
});

test('shorter, simpler names outrank long qualified ones within a source', () => {
  const plain = food({ name: 'Chicken breast' });
  const laden = food({ name: "Chicken Breast Bites, Boneless, Skinless, Frozen, Family Size" });
  assert.ok(rankForShard(plain, 'branded') > rankForShard(laden, 'branded'));
});

test('rows carrying household measures outrank bare ones', () => {
  const bare = food();
  const measured = food({ household_measures: [{ name: 'cookie', grams: 16 }] });
  assert.ok(rankForShard(measured, 'branded') > rankForShard(bare, 'branded'));
});

/* ── slimming ─────────────────────────────────────────────────────────────────────────────── */

test('empty and recomputable fields are dropped from the wire format', () => {
  const slim = slimFood(food());
  assert.equal('aliases' in slim, false);
  assert.equal('household_measures' in slim, false, 'empty measures should be omitted');
  assert.equal('serving_name' in slim, false, '"30 g" restates serving_grams');
  // Everything that cannot be recomputed must survive.
  assert.equal(slim.id, 'fdc-1');
  assert.equal(slim.name, 'Cookies, chocolate chip');
  assert.equal(slim.category, 'snack');
  assert.equal(slim.serving_grams, 30);
  assert.deepEqual(slim.per_100g, { kcal: 480, protein_g: 5, carbs_g: 64, fat_g: 24 });
});

test('a meaningful serving name is kept', () => {
  const slim = slimFood(food({ serving_name: '1 cookie', serving_grams: 16 }));
  assert.equal(slim.serving_name, '1 cookie');
});

test('household measures are kept when present', () => {
  const measures = [{ name: 'cookie', grams: 16 }];
  const slim = slimFood(food({ household_measures: measures }));
  assert.deepEqual(slim.household_measures, measures);
});

test('slimming round-trips through the app-side hydration contract', () => {
  // Mirrors hydrateFood in apps/web/lib/food/tier2.ts. The app's Food type declares these as
  // required arrays and measures.ts calls .find on them unguarded, so the inverse must be exact.
  const original = food({ serving_name: '30 g' });
  const slim = slimFood(original);
  const hydrated = {
    ...slim,
    aliases: slim.aliases ?? [],
    serving_name: slim.serving_name ?? `${slim.serving_grams} g`,
    household_measures: slim.household_measures ?? [],
  };
  assert.deepEqual(hydrated, { ...original, aliases: [] });
  assert.ok(Array.isArray(hydrated.household_measures));
  assert.ok(Array.isArray(hydrated.aliases));
});
