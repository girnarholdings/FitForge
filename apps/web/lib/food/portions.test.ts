import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PER_MEAL_PROTEIN,
  isProteinDense,
  mealsToClose,
  planPortions,
  portionLabel,
  proteinPerMeal,
  standardPortion,
  suggestPortion,
} from './portions';
import type { Food } from './types';

/**
 * REALISTIC PORTIONS — the regression these tests exist for is a screenshot.
 *
 * The old suggester offered "~150 g Whey protein powder — would add 111 g protein · 570 kcal": five
 * scoops in one sitting, because it scaled a single food until it closed the whole remaining target.
 * The rule now is that a suggestion is whole standard servings, capped by what one meal can usefully
 * carry (0.4 g/kg). Every assertion below is a way of saying that.
 */

function food(over: Partial<Food> & { id: string }): Food {
  return {
    name: over.id,
    aliases: [],
    category: 'meat',
    per_100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
    serving_name: '100 g',
    serving_grams: 100,
    household_measures: [],
    ...over,
  } as Food;
}

const WHEY = food({
  id: 'whey-protein',
  name: 'Whey protein powder',
  category: 'supplement',
  per_100g: { kcal: 380, protein_g: 74, carbs_g: 8, fat_g: 5 },
  serving_name: '1 scoop',
  serving_grams: 31,
  household_measures: [
    { name: 'scoop', grams: 31 },
    { name: 'half scoop', grams: 15 },
  ],
});

const CHICKEN = food({
  id: 'chicken-breast',
  name: 'Chicken breast, grilled',
  category: 'meat',
  per_100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  serving_name: '1 breast',
  serving_grams: 172,
  household_measures: [
    { name: 'breast', grams: 172 },
    { name: 'oz', grams: 28 },
  ],
});

const SKYR = food({
  id: 'skyr',
  name: 'Skyr, plain',
  category: 'dairy',
  per_100g: { kcal: 63, protein_g: 11, carbs_g: 4, fat_g: 0.2 },
  serving_name: '1 pot',
  serving_grams: 170,
  household_measures: [{ name: 'pot', grams: 170 }],
});

const OLIVE_OIL = food({
  id: 'olive-oil',
  name: 'Olive oil',
  category: 'condiment',
  per_100g: { kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100 },
  serving_name: '1 tbsp',
  serving_grams: 14,
  household_measures: [{ name: 'tbsp', grams: 14 }],
});

test('a suggestion is never more protein than one meal can carry', () => {
  // THE SCREENSHOT CASE: 110 g of protein outstanding, plenty of calories left. The old code said
  // 150 g of whey. One scoop is 23 g of protein; a 35 g meal ceiling allows exactly one.
  const p = suggestPortion(WHEY, { perMeal: 35, kcalLeft: 1690, gapProtein: 110 });
  assert.ok(p);
  assert.equal(p.servings, 1);
  assert.equal(p.grams, 31);
  assert.ok(p.protein_g <= 35, `a portion may not exceed the meal ceiling (got ${p.protein_g} g)`);
  assert.equal(p.label, '1 scoop (31 g)');
});

test('small servings stack, but only to whole servings and only up to the ceiling', () => {
  // Skyr is 19 g of protein a pot, so a 35 g meal takes one pot — a second would be 37 g.
  const one = suggestPortion(SKYR, { perMeal: 35, kcalLeft: 2000, gapProtein: 100 });
  assert.equal(one?.servings, 1);
  assert.equal(one?.label, '1 pot (170 g)');

  // Raise the ceiling and the second pot becomes allowed — and is phrased as pots, not grams.
  const two = suggestPortion(SKYR, { perMeal: 45, kcalLeft: 2000, gapProtein: 100 });
  assert.equal(two?.servings, 2);
  assert.equal(two?.label, '2 pots (340 g)');
  assert.ok(two.protein_g <= 45);
});

test('the ceiling is the SMALLER of one meal and what is actually still needed', () => {
  // 12 g left: two pots of skyr would be a fine meal and a silly suggestion.
  const p = suggestPortion(SKYR, { perMeal: 45, kcalLeft: 2000, gapProtein: 12 });
  assert.equal(p?.servings, 1);
});

test('a food whose single serving busts the calorie budget is refused, not shrunk', () => {
  // One chicken breast is ~284 kcal. With 120 kcal left the answer is "not this", not "60 g of it".
  assert.equal(suggestPortion(CHICKEN, { perMeal: 35, kcalLeft: 120, gapProtein: 40 }), null);
  assert.ok(suggestPortion(CHICKEN, { perMeal: 35, kcalLeft: 900, gapProtein: 40 }));
});

test('portion labels lead with the unit a person measures in', () => {
  assert.equal(portionLabel(CHICKEN, 1, 172), '1 breast (172 g)');
  assert.equal(portionLabel(WHEY, 2, 62), '2 scoops (62 g)');
  // No countable unit → the catalog's own serving name, still with the grams attached.
  const rice = food({ id: 'rice', serving_name: '1 cup cooked', serving_grams: 158 });
  assert.equal(portionLabel(rice, 1, 158), '1 cup cooked (158 g)');
  assert.equal(portionLabel(rice, 2, 316), '2 × 1 cup cooked (316 g)');
});

test('a measure that disagrees with the serving is not used as a counting unit', () => {
  // A tbsp measure under a 1-cup serving would make one serving read as "16 tbsp".
  const peanutButter = food({
    id: 'peanut-butter',
    serving_name: '2 tbsp',
    serving_grams: 32,
    household_measures: [{ name: 'tbsp', grams: 16 }],
  });
  assert.equal(standardPortion(peanutButter).unit, null);
  assert.equal(portionLabel(peanutButter, 1, 32), '2 tbsp (32 g)');
});

test('per-meal protein follows body weight, clamped at both ends', () => {
  assert.equal(proteinPerMeal(80), 32); // 0.4 g/kg
  assert.equal(proteinPerMeal(100), 40);
  // A 50 kg lifter is not told 20 g is a meal, and a 160 kg lifter is not told to find 64 g.
  assert.equal(proteinPerMeal(50), 25);
  assert.equal(proteinPerMeal(160), 55);
  // Unknown weight falls back rather than guessing from nothing.
  assert.equal(proteinPerMeal(null), DEFAULT_PER_MEAL_PROTEIN);
  assert.equal(proteinPerMeal(0), DEFAULT_PER_MEAL_PROTEIN);
});

test('the gap is expressed in meals, which is the point of the reframe', () => {
  assert.equal(mealsToClose(110, 35), 3);
  assert.equal(mealsToClose(35, 35), 1);
  assert.equal(mealsToClose(6, 35), 1, 'anything outstanding is at least one eating occasion');
  assert.equal(mealsToClose(0, 35), 0);
});

test('protein density gates what may be offered as a protein fix', () => {
  assert.ok(isProteinDense(CHICKEN));
  assert.ok(isProteinDense(WHEY));
  assert.ok(isProteinDense(SKYR));
  assert.ok(!isProteinDense(OLIVE_OIL));
});

test('a plan offers one portion per category and a combination that closes the gap', () => {
  const plan = planPortions(110, 1690, [CHICKEN, SKYR, WHEY, OLIVE_OIL], { bodyKg: 80 });

  assert.equal(plan.perMeal, 32);
  assert.equal(plan.meals, 3, '110 g at 32 g a meal is three more meals');
  assert.deepEqual(
    plan.options.map((o) => o.food.id),
    ['chicken-breast', 'skyr', 'whey-protein'],
    'one per category, in candidate order; the oil is not a protein fix',
  );
  for (const o of plan.options) {
    assert.ok(o.servings >= 1 && o.servings <= 3);
    // ONE standard serving is always allowed — a whole 172 g chicken breast is 53 g of protein and
    // is nonetheless exactly what people put on a plate. The meal ceiling governs STACKING, which is
    // the thing that produced five scoops of whey. So: anything above the ceiling is a single serving.
    if (o.protein_g > plan.perMeal) {
      assert.equal(o.servings, 1, `${o.food.id} stacked past the meal ceiling`);
    }
  }

  // The plate is a worked combination, and its arithmetic is the sum of its rows.
  assert.ok(plan.plate.length >= 2);
  assert.equal(
    plan.plateProtein,
    plan.plate.reduce((n, p) => n + p.protein_g, 0),
  );
  assert.equal(
    plan.plateKcal,
    plan.plate.reduce((n, p) => n + p.kcal, 0),
  );
  assert.ok(plan.plateKcal <= 1690, 'the plate stays inside the calorie budget');
});

test('nothing is suggested for a gap not worth a suggestion', () => {
  const plan = planPortions(5, 900, [CHICKEN, SKYR, WHEY], { bodyKg: 80 });
  assert.deepEqual(plan.options, []);
  assert.deepEqual(plan.plate, []);
});

test('a tiny calorie budget yields options that fit it, or none at all', () => {
  const plan = planPortions(60, 130, [CHICKEN, SKYR, WHEY], { bodyKg: 80 });
  for (const o of plan.options) assert.ok(o.kcal <= 130, `${o.food.id} busts a 130 kcal budget`);
  assert.deepEqual(plan.plate, [], 'two portions cannot fit in 130 kcal');
});
