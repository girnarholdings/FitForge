/**
 * Food data + conversational-logging types (docs/RESEARCH-FOOD.md §B3, §C2).
 *
 * `core.json` is the tier-1 dataset: 509 curated foods with aliases, per-100 g macros, a default
 * serving and per-food household measures. Everything here is pure data/logic — no React, no
 * network — so the parser and the search index can be exercised from a plain node script.
 */

/** Per-100 g (or per-100 ml for liquids) nutrient block. */
export interface PerHundred {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
}

/** A named portion with its gram weight ("slice" → 107 g). */
export interface HouseholdMeasure {
  name: string;
  grams: number;
}

/** One row of `core.json`. */
export interface Food {
  id: string;
  name: string;
  aliases: string[];
  category: FoodCategory;
  per_100g: PerHundred;
  /** human label for the default portion, e.g. "1 slice (1/8 of 14in)" */
  serving_name: string;
  /** grams of the default portion — used when the user gives no quantity at all */
  serving_grams: number;
  household_measures: HouseholdMeasure[];
}

export type FoodCategory =
  | 'fruit'
  | 'vegetable'
  | 'grain'
  | 'meat'
  | 'fish'
  | 'dairy'
  | 'legume'
  | 'nuts'
  | 'beverage'
  | 'snack'
  | 'condiment'
  | 'fastfood'
  | 'dish'
  | 'soup'
  | 'breakfast'
  | 'supplement';

/** Shape of `core.json` itself. */
export interface FoodCoreFile {
  $schema: string;
  name: string;
  version: string;
  generated: string;
  license: string;
  source_note: string;
  food_count?: number;
  foods: Food[];
}

/* --------------------------------------------------------------------------------- search */

/** How a query matched a food — drives the ranking tiers (exact > prefix > alias > substring). */
export type MatchKind =
  | 'exact'
  | 'alias-exact'
  | 'prefix'
  | 'alias-prefix'
  | 'word-prefix'
  | 'substring'
  | 'tokens'
  | 'fuzzy'
  | 'learned';

export interface SearchHit {
  food: Food;
  /** raw ranking score (higher is better; ~0–120) */
  score: number;
  /** 0–1 normalised match quality, fed into the parser's per-item confidence */
  confidence: number;
  kind: MatchKind;
  /** the name/alias string that produced the match */
  matchedOn: string;
}

/* ------------------------------------------------------------------------------- portions */

export type UnitKind = 'mass' | 'volume' | 'count';

/** A unit recognised by the parser, already canonicalised ("tablespoons" → "tbsp"). */
export interface ParsedUnit {
  canonical: string;
  kind: UnitKind;
}

/** The outcome of turning (quantity, unit, food) into grams. */
export interface Portion {
  grams: number;
  /** what the row shows under the food name, e.g. "2 × large egg (50 g)" */
  label: string;
  /** the measure actually used, when it came from the food's own `household_measures` */
  measureName: string | null;
  /** 0–1: explicit mass 1.0 · food measure .9 · global default .7 · inferred serving .5 */
  confidence: number;
}

/* --------------------------------------------------------------------------------- parser */

/** Where a fragment's quantity came from — drives quantity confidence (§C2.6). */
export type QuantitySource = 'numeric' | 'fraction' | 'word' | 'range' | 'implicit' | 'none';

export interface ParsedItem {
  /** stable id for React keys / edit tracking */
  id: string;
  /** the exact words this item came from, shown back to the user */
  sourceText: string;
  quantity: number;
  quantitySource: QuantitySource;
  /** canonical unit token, or null when the user gave none */
  unit: string | null;
  /** size adjective picked up from the text ("large latte") */
  size: string | null;
  /** the food-name words handed to the search index */
  query: string;
  /** best match, or null when nothing scored above the floor — NEVER silently dropped */
  food: Food | null;
  /** next-best matches, offered inline as one-tap swaps */
  alternatives: Food[];
  portion: Portion | null;
  /** how sure the search index is about `food` alone (exact alias = 1.0) */
  matchConfidence: number;
  /** quantityConf × unitConf × matchConf, 0–1 */
  confidence: number;
  /** true when this fragment came from a "with …" clause attached to the previous item */
  child: boolean;
}

/** The four meal slots (mirrors the store's `meal_slot` enum). */
export type MealSlotName = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface ParseResult {
  input: string;
  items: ParsedItem[];
  /** meal slot detected from the sentence ("… for breakfast"), else null */
  mealSlot: MealSlotName | null;
}

/** The macro snapshot written to a log row. */
export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
