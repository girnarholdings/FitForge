import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — plain .mjs, deliberately untyped: import-usda.mjs runs under bare `node`.
import {
  normaliseName,
  duplicateSignature,
  rankForShard,
  slimFood,
  planShards,
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

/* ── shard planning ───────────────────────────────────────────────────────────────────────── */

const fold = (s: string) =>
  String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();

const entries = (names: string[], source = 'branded') =>
  names.map((name, i) => ({ food: food({ id: `fdc-${i}`, name }), source }));

type Entry = { food: { name: string } };

/**
 * Every food must live in a shard the CLIENT would actually fetch for it — i.e. under one of the
 * prefixes of its own folded name. This is the invariant the whole scheme rests on: a food filed
 * under a key nobody derives is deleted as surely as one that was dropped, just less visibly.
 */
function assertReachable(shards: Map<string, Entry[]>, all: Entry[], maxDepth = 4) {
  for (const e of all) {
    const f = fold(e.food.name).replace(/[^a-z0-9]/g, '');
    let found = false;
    for (let d = maxDepth; d >= 2 && !found; d -= 1) {
      const key = f.length >= d ? f.slice(0, d) : '_';
      found = (shards.get(key) ?? []).some((r) => r.food.name === e.food.name);
    }
    assert.ok(found, `"${e.food.name}" is in no shard the client would fetch`);
  }
}

/** Names sharing a two-letter prefix but diverging at the third, so splitting terminates. */
const BE_WORDS = ['Beef', 'Beans', 'Beer', 'Belgian waffle', 'Berry mix', 'Bento box'];
const spread = (n: number) =>
  Array.from({ length: n }, (_, i) => `${BE_WORDS[i % BE_WORDS.length]} item ${i}`);

test('a bucket under the cap is emitted as one shard at the minimum depth', () => {
  const all = entries(['Beef stew', 'Beans, black', 'Beverage, cola']);
  const { shards, dropped } = planShards(all, { maxRows: 600, foldName: fold });
  assert.equal(dropped, 0);
  assert.deepEqual([...shards.keys()], ['be']);
  assert.equal(shards.get('be')!.length, 3);
});

test('an over-full bucket splits deeper instead of dropping rows', () => {
  const all = entries(spread(120));
  const { shards, dropped } = planShards(all, { maxRows: 30, headRows: 10, foldName: fold });
  assert.equal(dropped, 0, 'splitting must not lose anything');
  assert.ok(shards.has('bee'), 'expected a depth-3 shard');
  assert.ok(shards.has('ber'), 'expected sibling depth-3 shards');
  assertReachable(shards, all);
});

test('a split bucket keeps a head shard so short queries still answer', () => {
  const all = entries(spread(120));
  const { shards } = planShards(all, { maxRows: 30, headRows: 10, foldName: fold });
  assert.ok(shards.has('be'), 'a two-letter query must still find a shard');
  assert.equal(shards.get('be')!.length, 10, 'head shard is a ranked sample, not the whole bucket');
  assert.ok(shards.get('be')!.length < all.length);
});

test('no shard anywhere exceeds the cap', () => {
  const all = entries([...spread(240), ...Array.from({ length: 90 }, (_, i) => `Chocolate bar ${i}`)]);
  const { shards } = planShards(all, { maxRows: 40, headRows: 15, foldName: fold });
  for (const [key, rows] of shards) {
    assert.ok(rows.length <= 40, `shard ${key} has ${rows.length} rows, over the 40 cap`);
  }
});

test('names too short to key deeper stay reachable in the head shard', () => {
  // "Be" has no third character, so depth 3 can never hold it — it must remain in `be` or it is
  // silently gone. This is the case that made an earlier draft lose rows into a colliding `_`.
  const all = entries(['Be', ...spread(120)]);
  const { shards } = planShards(all, { maxRows: 30, headRows: 10, foldName: fold });
  assert.ok(shards.get('be')!.some((r) => r.food.name === 'Be'), '"Be" fell out of every shard');
});

test('rows are dropped only once no finer key exists', () => {
  // 200 names identical well past the depth limit: there is nothing left to split on, so this is
  // the one place the cap still bites.
  const all = entries(Array.from({ length: 200 }, (_, i) => `Beefsteak ${i}`));
  const { shards, dropped } = planShards(all, { maxRows: 50, headRows: 10, maxDepth: 4, foldName: fold });
  assert.ok(dropped > 0, 'expected the depth limit to force drops');
  for (const [, rows] of shards) assert.ok(rows.length <= 50);
});
