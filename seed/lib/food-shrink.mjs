/**
 * DEDUPLICATION AND SIZE CONTROL for the tier-2 food catalog.
 *
 * FDC branded is 1.9M rows and is extraordinarily repetitive: the same product recurs in a dozen
 * pack sizes, and the same generic item ("chocolate chip cookies", "whole milk") recurs across
 * hundreds of manufacturers with nutrition that differs by less than a rounding error. Importing
 * that verbatim gives a search box where typing "chicken" returns forty near-identical rows and a
 * shard that takes a noticeable beat to fetch and parse on a phone.
 *
 * Two separate levers, deliberately kept apart:
 *
 *   · `duplicateSignature` collapses rows that are the SAME FOOD — same normalised name, same
 *     macros to within a rounding bucket. This is about answer quality; it would be worth doing
 *     even if bytes were free.
 *   · `rankForShard` + a per-shard cap bound what any single fetch can cost. This is about latency,
 *     and it decides WHICH rows survive when a bucket is over budget rather than truncating
 *     arbitrarily.
 *
 * Everything here is pure and side-effect free so it can be unit-tested without the 3.3 GB
 * download that produces its real input.
 */

/** Tokens that describe the PACKAGE rather than the food; never distinguish two foods. */
const PACKAGING = /\b\d+(?:\.\d+)?\s*(?:g|kg|mg|ml|l|oz|lb|lbs|fl\s*oz|ct|count|pk|pack|piece|pieces|serving|servings)\b/g;

/** Marketing qualifiers that recur across brands and rarely change the nutrition meaningfully. */
const FILLER = /\b(?:new|improved|original|classic|premium|value|family|size|jumbo|mini|assorted|variety|brand|inc|llc|co|company|the)\b/g;

/**
 * Normalise a food name down to what actually identifies the food.
 *
 * Aggressive on purpose — it is only ever used to compare two rows, never displayed. The displayed
 * name keeps its original wording.
 */
export function normaliseName(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // The "(Brand)" suffix the importer appends for display. Two manufacturers selling the same
    // formulation are the repetition being removed, so brand is not part of identity here.
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(PACKAGING, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bucket a macro so that "close enough" compares equal.
 *
 * FDC label data is rounded by the manufacturer before it ever reaches the dump, so two rows for
 * the same product routinely differ by a gram or a few kcal. Comparing exact values would treat
 * those as distinct foods and defeat the whole exercise.
 */
const bucket = (v, step) => Math.round((Number(v) || 0) / step) * step;

/**
 * Identity of a food for duplicate detection: what it is, plus what it contains.
 *
 * NAME ALONE IS NOT ENOUGH — "protein bar" spans 200 to 400 kcal across real products, and
 * collapsing those would hand the user a number that is wrong for the thing they ate. MACROS ALONE
 * are not enough either; thousands of unrelated foods share 0/0/0. Together they are specific
 * enough that a collision means the two rows really are interchangeable for logging.
 */
export function duplicateSignature(food) {
  const p = food.per_100g ?? {};
  return [
    normaliseName(food.name),
    bucket(p.kcal, 10),
    bucket(p.protein_g, 2),
    bucket(p.carbs_g, 2),
    bucket(p.fat_g, 2),
  ].join('|');
}

/** Source ranking. Lab-analysed generic foods are what people search for; brands are the tail. */
const SOURCE_SCORE = { foundation: 300, srLegacy: 250, other: 100, branded: 0 };

/**
 * Score a food for survival when its shard is over budget. Higher is kept.
 *
 * The shape of this is "what would a person typing three letters want to see first":
 *   · generic before branded — "Chicken, breast, raw" beats "Member's Mark Chicken Breast Bites"
 *   · short before long — a plain name is nearly always the more general food
 *   · described before bare — rows carrying household measures and fibre/sodium detail are more
 *     useful once selected, and their presence also correlates with a better-curated row
 */
export function rankForShard(food, source) {
  const p = food.per_100g ?? {};
  let score = SOURCE_SCORE[source] ?? 0;
  score -= String(food.name).length * 0.4;
  score -= (String(food.name).match(/,/g)?.length ?? 0) * 2;
  if ((food.household_measures?.length ?? 0) > 0) score += 25;
  if (p.fiber_g !== undefined) score += 4;
  if (p.sugar_g !== undefined) score += 3;
  if (p.sodium_mg !== undefined) score += 3;
  return score;
}

/**
 * Strip fields that are empty or recomputable, for the wire only.
 *
 * The importer never produces aliases, and most branded rows carry no household measures and a
 * serving name that is just the gram weight restated. Written out verbatim that is ~59 bytes per
 * row of pure ceremony — around 3.4 MB across the catalog, paid on every shard fetch.
 *
 * `hydrateFood` in apps/web/lib/food/tier2.ts is the exact inverse and MUST stay in step: the app's
 * `Food` type declares `aliases` and `household_measures` as required arrays and `measures.ts`
 * calls `.find` on them without guarding, so a row that reached the app slimmed would throw.
 */
export function slimFood(food) {
  const out = {
    id: food.id,
    name: food.name,
    category: food.category,
    per_100g: food.per_100g,
    serving_grams: food.serving_grams,
  };
  if (food.serving_name && food.serving_name !== `${food.serving_grams} g`) {
    out.serving_name = food.serving_name;
  }
  if (food.household_measures?.length) out.household_measures = food.household_measures;
  return out;
}
