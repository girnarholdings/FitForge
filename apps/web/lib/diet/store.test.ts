import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * THE DIET STORE'S LOAD-BEARING PROMISES:
 *
 *   · NORMALIZE-ON-READ — whatever localStorage hands back becomes a valid entry or null:
 *     unknown recipe ids are dropped (never blank cards), servings snap to 1/1.5/2, stance and
 *     prefs fall back to safe values. Normalizing twice changes nothing.
 *   · applySwap is IDEMPOTENT — re-applying the same swap is a no-op, so a double-tap on the
 *     swap sheet cannot silently re-portion a day.
 *   · writes go through safeSetItem under the `fitforge.diet.v1` key and survive a reload
 *     (cache drop) byte-identically.
 */

const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
  },
};

const {
  DIET_KEY,
  getDietPlan,
  setDietPlan,
  clearDietPlan,
  applySwap,
  _resetDietStoreForTests,
} = await import('./store');
const { generateDietPlan } = await import('./plan');
const { swapCandidates } = await import('./swaps');
const { RECIPE_BY_ID } = await import('./recipes');

function freshPlan() {
  return generateDietPlan({
    targets: { kcal_target: 2000, protein_g_target: 125, carbs_g_target: 213, fat_g_target: 67 },
    weightKg: 75,
    stance: 'maintain',
    prefs: { base: 'omnivore', avoid: [] },
  });
}

beforeEach(() => {
  storage.clear();
  _resetDietStoreForTests();
});

/* ------------------------------------------------------------------------ normalize-on-read */

test('no key, garbage JSON, or a non-plan object all read as null — never a throw', () => {
  assert.equal(getDietPlan(), null);

  storage.set(DIET_KEY, '{not json');
  _resetDietStoreForTests();
  assert.equal(getDietPlan(), null);

  storage.set(DIET_KEY, JSON.stringify({ version: 1, plan: { days: 'nope' } }));
  _resetDietStoreForTests();
  assert.equal(getDietPlan(), null);
});

test('normalize-on-read: unknown recipes dropped, servings snapped, enums defaulted', () => {
  storage.set(
    DIET_KEY,
    JSON.stringify({
      version: 1,
      stance: 'bulk-o-tron', // not a stance
      prefs: { base: 'carnivore', avoid: ['gluten_free', 'astrology_safe'] },
      generatedAt: 42, // not a string
      plan: {
        weightKg: 75,
        targets: { kcal_target: 2000, protein_g_target: 'lots' },
        days: [
          {
            meals: [
              { slot: 'breakfast', recipeId: 'masala-scrambled-eggs-toast', servings: 1.3 },
              { slot: 'lunch', recipeId: 'recipe-that-never-existed', servings: 1 },
              { slot: 'dinner', recipeId: 'dal-tadka', servings: 99 },
              { slot: 'astral', recipeId: 'dal-tadka', servings: 1 },
            ],
          },
        ],
      },
    }),
  );
  _resetDietStoreForTests();
  const entry = getDietPlan();
  assert.ok(entry, 'a structurally plausible entry survives');
  assert.equal(entry!.stance, 'maintain', 'unknown stance falls back');
  assert.deepEqual(entry!.prefs, { base: 'omnivore', avoid: ['gluten_free'] });
  assert.equal(entry!.generatedAt, '');
  const meals = entry!.plan.days[0]!.meals;
  assert.deepEqual(
    meals.map((m) => m.recipeId),
    ['masala-scrambled-eggs-toast', 'dal-tadka'],
    'unknown recipe and unknown slot are dropped',
  );
  assert.equal(meals[0]!.servings, 1.5, '1.3 snaps to the nearest legal step');
  assert.equal(meals[1]!.servings, 2, '99 clamps to the top step');
  assert.equal(entry!.plan.targets.protein_g_target, 0, 'non-numeric targets read as 0');
});

test('normalization is idempotent: normalized output re-read is byte-identical', () => {
  setDietPlan(freshPlan());
  const first = getDietPlan();
  storage.set(DIET_KEY, JSON.stringify(first));
  _resetDietStoreForTests();
  const second = getDietPlan();
  assert.deepEqual(second, first);
});

/* ------------------------------------------------------------------------- write & reload */

test('setDietPlan persists under fitforge.diet.v1 and survives a cache drop', () => {
  const plan = freshPlan();
  setDietPlan(plan);
  assert.ok(storage.has(DIET_KEY), 'written to the pinned key');

  _resetDietStoreForTests(); // simulate a reload — next read must come from storage
  const entry = getDietPlan();
  assert.ok(entry);
  assert.equal(entry!.version, 1);
  assert.deepEqual(entry!.plan.days, plan.days);
  assert.deepEqual(entry!.prefs, plan.prefs, 'prefs lifted from the plan');
  assert.equal(entry!.stance, plan.stance, 'stance lifted from the plan');
  assert.ok(!Number.isNaN(Date.parse(entry!.generatedAt)), 'generatedAt is a real timestamp');
});

test('clearDietPlan removes the key and reads as null', () => {
  setDietPlan(freshPlan());
  clearDietPlan();
  assert.equal(getDietPlan(), null);
  assert.equal(storage.has(DIET_KEY), false);
});

/* ------------------------------------------------------------------------------- applySwap */

test('applySwap replaces the dish with a legal serving step and is idempotent', () => {
  setDietPlan(freshPlan());
  const before = getDietPlan()!;
  const candidates = swapCandidates(before.plan, 0, 'dinner');
  assert.ok(candidates.length > 0, 'the generated plan has dinner swaps');
  const incoming = candidates[0]!;

  applySwap(0, 'dinner', incoming.id);
  const after = getDietPlan()!;
  const dinner = after.plan.days[0]!.meals.find((m) => m.slot === 'dinner')!;
  assert.equal(dinner.recipeId, incoming.id);
  assert.ok([1, 1.5, 2].includes(dinner.servings), 'servings stay on the legal steps');
  // every other meal is untouched
  const others = (p: typeof after) =>
    p.plan.days.flatMap((d, i) => d.meals.filter((m) => !(i === 0 && m.slot === 'dinner')));
  assert.deepEqual(others(after), others(before));

  // idempotent: same swap again changes nothing (generatedAt included — no re-stamp)
  const snapshot = JSON.stringify(after);
  applySwap(0, 'dinner', incoming.id);
  assert.equal(JSON.stringify(getDietPlan()), snapshot);
});

test('applySwap ignores unknown recipes, days, and empty slots', () => {
  setDietPlan(freshPlan());
  const snapshot = JSON.stringify(getDietPlan());
  applySwap(0, 'dinner', 'recipe-that-never-existed');
  applySwap(42, 'dinner', 'dal-tadka');
  assert.equal(JSON.stringify(getDietPlan()), snapshot);
});

test('a swapped leftover lunch stops claiming to be a leftover', () => {
  setDietPlan(freshPlan());
  const entry = getDietPlan()!;
  const dayIdx = entry.plan.days.findIndex((d) => d.meals.some((m) => m.slot === 'lunch' && m.leftover));
  assert.ok(dayIdx >= 0, 'the omnivore template leftover-pairs some lunches');
  const candidates = swapCandidates(entry.plan, dayIdx, 'lunch');
  assert.ok(candidates.length > 0);
  applySwap(dayIdx, 'lunch', candidates[0]!.id);
  const lunch = getDietPlan()!.plan.days[dayIdx]!.meals.find((m) => m.slot === 'lunch')!;
  assert.equal(lunch.recipeId, candidates[0]!.id);
  assert.ok(!lunch.leftover, 'leftover flag cleared — it is no longer yesterday\'s dinner');
});

test('the store only ever hands out corpus recipes', () => {
  setDietPlan(freshPlan());
  for (const dayEntry of getDietPlan()!.plan.days) {
    for (const meal of dayEntry.meals) {
      assert.ok(RECIPE_BY_ID.has(meal.recipeId));
    }
  }
});
