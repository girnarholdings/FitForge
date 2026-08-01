import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestSwapServing, swapCandidates } from './swaps';
import { satisfiesPrefs, RECIPE_BY_ID, type Recipe } from './recipes';
import type { DietPlan } from './plan';

/**
 * §5 SWAP RULES AT THEIR EDGES. The thresholds are contract numbers — |Δkcal| ≤ max(75, 15%),
 * protein ≥ −8 g, mains keep 0.4 g/kg, 2-day no-repeat, ≤6 ranked — so the tests sit exactly ON
 * the boundaries, where off-by-one regressions live.
 */

function makeRecipe(id: string, kcal: number, protein: number): Recipe {
  return {
    id,
    name: id,
    slot: 'dinner',
    cuisine: 'test',
    per_serving: { kcal, protein_g: protein, carbs_g: 10, fat_g: 10 },
    serving_label: '1 plate',
    tags: [],
    effort: 'quick',
    ingredients: [],
    method: [],
    swap_group: 'test',
  };
}

/* --------------------------------------------------------- bestSwapServing threshold edges */

test('kcal window: |Δ| ≤ max(75, 15%) — 75 in, 76 out (500 kcal outgoing)', () => {
  // 15% of 500 = 75, so the window is exactly 75 either way.
  assert.equal(bestSwapServing(makeRecipe('in', 575, 30), 500, 30, null), 1);
  assert.equal(bestSwapServing(makeRecipe('out', 576, 30), 500, 30, null), null);
  assert.equal(bestSwapServing(makeRecipe('in-low', 425, 30), 500, 30, null), 1);
  assert.equal(bestSwapServing(makeRecipe('out-low', 424, 30), 500, 30, null), null);
});

test('kcal window: the 15% branch takes over above 500 kcal', () => {
  // Outgoing 700 kcal → window 105, not 75.
  assert.equal(bestSwapServing(makeRecipe('in', 805, 30), 700, 30, null), 1);
  assert.equal(bestSwapServing(makeRecipe('out', 806, 30), 700, 30, null), null);
});

test('protein rule: candidate ≥ outgoing − 8 g, exactly −8 passes', () => {
  assert.equal(bestSwapServing(makeRecipe('in', 500, 22), 500, 30, null), 1);
  assert.equal(bestSwapServing(makeRecipe('out', 500, 21.9), 500, 30, null), null);
  // upward protein deviation is unbounded (within the kcal window)
  assert.equal(bestSwapServing(makeRecipe('up', 500, 60), 500, 30, null), 1);
});

test('mains keep the 0.4 g/kg floor after the swap', () => {
  assert.equal(bestSwapServing(makeRecipe('at-floor', 500, 32), 500, 30, 32), 1);
  assert.equal(bestSwapServing(makeRecipe('below', 500, 31.9), 500, 30, 32), null);
});

test('candidates scale: a 260-kcal dish swaps a 500-kcal dish at 2 servings', () => {
  // ×1 → Δ240 (out), ×1.5 → Δ110 (out), ×2 → Δ20 (in). Protein rides along: 20 g ×2 = 40 ≥ 22.
  assert.equal(bestSwapServing(makeRecipe('scaled', 260, 20), 500, 30, null), 2);
});

test('best serving minimizes |Δkcal| among the passing steps', () => {
  // 340 kcal: ×1 Δ160 out, ×1.5 = 510 Δ10, ×2 = 680 out — picks 1.5.
  assert.equal(bestSwapServing(makeRecipe('mid', 340, 30), 500, 30, null), 1.5);
});

/* -------------------------------------------------------------- plan-level rules & ranking */

function day(meals: Array<{ slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'; id: string; servings?: number; leftover?: boolean }>) {
  return {
    meals: meals.map((m) => ({
      slot: m.slot,
      recipeId: m.id,
      servings: m.servings ?? 1,
      ...(m.leftover ? { leftover: true } : {}),
    })),
  };
}

/** A hand-built omnivore plan around real corpus dishes (weights/macros are corpus facts). */
const OMNI_PLAN: DietPlan = {
  stance: 'maintain',
  prefs: { base: 'omnivore', avoid: [] },
  weightKg: 80, // mains floor = 32 g
  targets: { kcal_target: 2000, protein_g_target: 130, carbs_g_target: 200, fat_g_target: 67 },
  days: [
    day([
      { slot: 'breakfast', id: 'masala-scrambled-eggs-toast' },
      { slot: 'lunch', id: 'chicken-tikka-wrap' },
      { slot: 'dinner', id: 'beef-broccoli-stir-fry' },
      { slot: 'snack', id: 'apple-slices-peanut-butter' },
    ]),
    day([
      { slot: 'breakfast', id: 'spinach-feta-omelette' },
      { slot: 'lunch', id: 'beef-broccoli-stir-fry', leftover: true },
      { slot: 'dinner', id: 'lighter-chicken-tikka-masala' },
      { slot: 'snack', id: 'greek-yogurt-honey-walnuts' },
    ]),
    day([
      { slot: 'breakfast', id: 'masala-scrambled-eggs-toast' },
      { slot: 'lunch', id: 'tuna-white-bean-salad' },
      { slot: 'dinner', id: 'steak-chimichurri-potatoes' },
      { slot: 'snack', id: 'apple-slices-peanut-butter' },
    ]),
  ],
};

test('2-day no-repeat: nothing planned in a main slot on days d−1..d+1 comes back', () => {
  // Outgoing: day 1 dinner, lighter-chicken-tikka-masala (500 kcal / 43 g).
  const candidates = swapCandidates(OMNI_PLAN, 1, 'dinner');
  const ids = candidates.map((c) => c.id);
  assert.ok(!ids.includes('beef-broccoli-stir-fry'), 'day-0 dinner (and day-1 leftover) blocked');
  assert.ok(!ids.includes('steak-chimichurri-potatoes'), 'day-2 dinner blocked');
  assert.ok(!ids.includes('chicken-tikka-wrap'), 'day-0 lunch blocked');
  assert.ok(!ids.includes('tuna-white-bean-salad'), 'day-2 lunch blocked');
  assert.ok(!ids.includes('lighter-chicken-tikka-masala'), 'a dish is not its own swap');
  assert.ok(ids.length > 0 && ids.length <= 6, `≤6 shown, got ${ids.length}`);
});

test('ranked by macro distance — closest total-macro neighbour first', () => {
  const candidates = swapCandidates(OMNI_PLAN, 1, 'dinner');
  // harissa-chicken-traybake is 500 kcal / 41 g vs 500/43 — Δkcal 0, Δprotein 2. Nothing beats it.
  assert.equal(candidates[0]?.id, 'harissa-chicken-traybake');
  // and every candidate passes the §5 checks against the outgoing dish
  for (const c of candidates) {
    const s = bestSwapServing(c, 500, 43, 32);
    assert.notEqual(s, null, `${c.id} must have a passing serving step`);
  }
});

test('breakfasts are exempt from the variety window (repetition is a feature)', () => {
  // vegan+GF leaves exactly two servable breakfasts in the corpus — so if the adjacent-day
  // besan-chilla shows up as a swap for day-0's smoothie, it can only be because breakfasts
  // ignore the 2-day window that would have blocked a lunch/dinner.
  const plan: DietPlan = {
    stance: 'maintain',
    prefs: { base: 'vegan', avoid: ['gluten_free'] },
    weightKg: 45, // mains floor = 18 g: chilla ×1 (18 g) sits exactly ON the floor
    targets: { kcal_target: 1500, protein_g_target: 80, carbs_g_target: 180, fat_g_target: 50 },
    days: [
      day([
        { slot: 'breakfast', id: 'green-mango-smoothie' },
        { slot: 'lunch', id: 'misir-wot' },
        { slot: 'dinner', id: 'chana-masala' },
        { slot: 'snack', id: 'chilli-lime-edamame' },
      ]),
      day([
        { slot: 'breakfast', id: 'besan-chilla' },
        { slot: 'lunch', id: 'chana-masala', leftover: true },
        { slot: 'dinner', id: 'dal-tadka' },
        { slot: 'snack', id: 'crispy-paprika-chickpeas' },
      ]),
    ],
  };
  const ids = swapCandidates(plan, 0, 'breakfast').map((c) => c.id);
  assert.deepEqual(ids, ['besan-chilla']);
});

test('dietary compatibility is absolute — every candidate satisfies the stack, or the list is empty', () => {
  const veganGfPlan: DietPlan = {
    stance: 'maintain',
    prefs: { base: 'vegan', avoid: ['gluten_free'] },
    weightKg: 45, // mains floor = 18 g
    targets: { kcal_target: 1500, protein_g_target: 80, carbs_g_target: 180, fat_g_target: 50 },
    days: [
      day([
        { slot: 'breakfast', id: 'besan-chilla' },
        { slot: 'lunch', id: 'misir-wot' },
        { slot: 'dinner', id: 'chana-masala' },
        { slot: 'snack', id: 'chilli-lime-edamame' },
      ]),
    ],
  };
  const gfCandidates = swapCandidates(veganGfPlan, 0, 'dinner');
  for (const c of gfCandidates) {
    assert.ok(satisfiesPrefs(c, veganGfPlan.prefs), `${c.id} must be vegan and gluten_free`);
    assert.ok(c.tags.includes('gluten_free'), `${c.id} carries the gluten_free tag`);
  }

  // Same plan, vegan only (no GF): chickpea-apricot-tagine (485/18) is the closest macro
  // neighbour of chana-masala (480/18) and must rank first; black-bean-sweet-potato-tacos
  // (425/15) is kcal-legal but sits under the 18 g mains floor.
  const veganPlan: DietPlan = { ...veganGfPlan, prefs: { base: 'vegan', avoid: [] } };
  const ids = swapCandidates(veganPlan, 0, 'dinner').map((c) => c.id);
  assert.equal(ids[0], 'chickpea-apricot-tagine');
  assert.equal(ids.length, 6, 'a full pool still caps at 6');
  assert.ok(!ids.includes('black-bean-sweet-potato-tacos'), 'mains floor filters 15 g dishes');
  assert.ok(!ids.includes('teriyaki-salmon-rice-bowl'), 'fish never reaches a vegan');
  for (const id of ids) {
    assert.ok(satisfiesPrefs(RECIPE_BY_ID.get(id)!, veganPlan.prefs), `${id} is vegan-servable`);
  }
});

test('missing day/slot/recipe answers with an empty list, never a throw', () => {
  assert.deepEqual(swapCandidates(OMNI_PLAN, 9, 'dinner'), []);
  assert.deepEqual(swapCandidates(OMNI_PLAN, 0, 'snack' as never, { prefs: { base: 'omnivore', avoid: [] } }).some((c) => !RECIPE_BY_ID.has(c.id)), false);
});
