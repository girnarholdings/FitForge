import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSeed,
  validateSeed,
  isMacroConsistent,
  atwaterKcal,
  type Food,
  type SeedData,
} from '../lib/validate.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'data');

const goodFood = (over: Partial<Food> = {}): Food => ({
  slug: 'test-food',
  name: 'Test Food',
  brand: null,
  category: 'protein',
  kcal: 165,
  protein_g: 31,
  carbs_g: 0,
  fat_g: 3.6,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 0,
  serving_name: '100 g',
  serving_grams: 100,
  diet_tags: ['gluten_free', 'dairy_free'],
  allergen_tags: [],
  ...over,
});

test('the real seed data validates with zero errors', () => {
  const data = loadSeed(DATA_DIR);
  const { errors } = validateSeed(data);
  assert.deepEqual(errors, [], `expected no errors, got:\n${errors.join('\n')}`);
});

test('the real seed data has the expected row counts', () => {
  const data = loadSeed(DATA_DIR);
  // Floors, not equalities, for the catalogs we expect to KEEP GROWING (equipment, categories,
  // exercises). Exact counts here made every legitimate catalog expansion break CI, which is how
  // this job ended up red-and-ignored after the 59→91 exercise commit. What actually needs
  // guarding is accidental LOSS — a bad merge or a truncated write dropping rows — and a floor
  // catches that. Anatomy (groups/muscles) stays exact because it is a closed set, not a catalog.
  assert.ok(data.equipment.length >= 31, 'at least 31 equipment');
  assert.equal(data.muscles.groups.length, 7, 'muscle group count');
  assert.equal(data.muscles.muscles.length, 20, 'muscle count');
  assert.ok(data.categories.length >= 12, 'at least 12 categories');
  assert.ok(data.exercises.length >= 91, 'at least 91 exercises');
  assert.equal(data.foods.length, 32, 'food count');
});

test('a deliberately bad fixture fails the macro-consistency check', () => {
  // 500 kcal claimed, but 4*5 + 4*5 + 9*5 = 85 kcal from macros — wildly off.
  const bad = goodFood({ slug: 'bad-macros', kcal: 500, protein_g: 5, carbs_g: 5, fat_g: 5 });
  assert.equal(isMacroConsistent(bad), false, 'bad fixture must be macro-inconsistent');

  const data: SeedData = {
    equipment: [],
    muscles: { groups: [], muscles: [] },
    categories: [],
    exercises: [],
    substitutions: [],
    foods: [bad],
  };
  const { errors } = validateSeed(data);
  assert.ok(
    errors.some((e) => e.includes('bad-macros') && e.includes('macro inconsistency')),
    `expected a macro-inconsistency error for bad-macros, got:\n${errors.join('\n')}`,
  );
});

test('borderline macro foods within tolerance pass', () => {
  // Low-calorie, high-fiber vegetable (broccoli-like): Atwater over-estimates but
  // stays within the absolute floor allowance.
  const broccoli = goodFood({
    slug: 'veg', category: 'vegetable', kcal: 35, protein_g: 2.4, carbs_g: 7.2, fat_g: 0.4,
  });
  assert.ok(atwaterKcal(broccoli) - broccoli.kcal > 5, 'sanity: Atwater is higher than stated');
  assert.equal(isMacroConsistent(broccoli), true, 'low-cal veg should pass via absolute floor');
});

test('macro tolerance rejects a large relative error on a high-calorie food', () => {
  const bad = goodFood({ slug: 'oil-ish', category: 'fat_oil', kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 50 });
  // Atwater = 450, delta 434, tolerance = 15% of 884 = 132.6 -> inconsistent.
  assert.equal(isMacroConsistent(bad), false);
});

test('unknown allergen and diet tags are rejected', () => {
  const data: SeedData = {
    equipment: [],
    muscles: { groups: [], muscles: [] },
    categories: [],
    exercises: [],
    substitutions: [],
    foods: [goodFood({ slug: 'typo', allergen_tags: ['penut'], diet_tags: ['vegam'] })],
  };
  const { errors } = validateSeed(data);
  assert.ok(errors.some((e) => e.includes('unknown allergen_tag')), 'catches bad allergen tag');
  assert.ok(errors.some((e) => e.includes('unknown diet_tag')), 'catches bad diet tag');
});
