/**
 * The in-memory food index (docs/RESEARCH-FOOD.md §B3, tier-0/tier-1).
 *
 * `core.json` is 509 foods / ~33 KB gzipped, so the whole tier-1 catalog lives in RAM and every
 * keystroke is answered without a fetch — which is what makes the parser work fully offline.
 * The index is built ONCE at module scope:
 *
 *   · `FOODS`      — the dataset, each row decorated with folded search keys + tokens + a prior
 *   · `VOCAB`      — every distinct token, sorted, so a prefix query is a binary-search range
 *   · `POSTINGS`   — token → food indices (the classic static inverted index)
 *   · `EXACT_KEYS` — full folded name/alias → food indices, for the exact-match tier
 */
import coreJson from './core.json';
import type { Food, FoodCategory, FoodCoreFile } from './types';

const core = coreJson as unknown as FoodCoreFile;

export const DATASET_VERSION = core.version;
export const DATASET_LICENSE = core.license;

/** Words that carry no discriminating power in a food name. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'with',
  'or',
  'in',
  'on',
  'to',
  'style',
  'plain',
]);

/** ASCII-fold + lowercase + collapse punctuation to single spaces. */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%/. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude English singulariser — good enough for food nouns ("eggs" → "egg"). */
export function singular(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('ches')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('es') && !token.endsWith('ses')) return token.slice(0, -1);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokenize(s: string): string[] {
  return fold(s)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map(singular);
}

/* ------------------------------------------------------------------------------- priors */

/**
 * Category prior — a staple ingredient should beat a niche condiment on an equal text match.
 * (§B3: `score = matchQuality + popularityPrior + tierPrior + userHistory`.)
 */
const CATEGORY_PRIOR: Record<FoodCategory, number> = {
  meat: 6,
  grain: 6,
  dairy: 6,
  fruit: 6,
  vegetable: 5,
  fish: 5,
  beverage: 5,
  breakfast: 5,
  legume: 4,
  nuts: 4,
  fastfood: 4,
  dish: 4,
  snack: 3,
  soup: 3,
  supplement: 3,
  condiment: 2,
};

/**
 * Hand-set popularity for the foods people log constantly (§B3 "hand-set 0–100 in core").
 * This is what makes "chick" surface *Chicken breast* rather than *Chicken pot pie*.
 */
const POPULAR: Record<string, number> = {
  'chicken-breast': 14,
  egg: 14,
  'white-rice': 12,
  banana: 12,
  apple: 11,
  oatmeal: 11,
  'coffee-black': 12,
  'latte-whole': 10,
  'pizza-cheese': 11,
  hamburger: 10,
  'white-bread': 10,
  'whole-wheat-bread': 10,
  'milk-whole': 9,
  'greek-yogurt-nonfat': 10,
  'whey-protein': 10,
  'protein-shake-water': 8,
  salmon: 9,
  'ground-beef-85': 9,
  broccoli: 9,
  'potato-baked': 8,
  'pasta-cooked': 9,
  'peanut-butter': 9,
  avocado: 9,
  almonds: 8,
  'olive-oil': 8,
  butter: 8,
  cheddar: 8,
  'tuna-canned': 8,
  'orange-juice': 7,
  beer: 8,
  'garden-salad': 8,
  'protein-bar': 8,
  'sweet-potato': 8,
  'brown-rice': 8,
  'oats-dry': 8,
  'scrambled-eggs': 8,
  'french-fries': 8,
  'cheeseburger': 8,
  'chicken-thigh': 7,
  'cottage-cheese': 7,
  'tea-black': 7,
  water: 7,
  'dark-chocolate': 6,
  'chicken-caesar-salad': 6,
  'pizza-pepperoni': 8,
};

function priorFor(food: Food): number {
  const base = CATEGORY_PRIOR[food.category] ?? 3;
  const popular = POPULAR[food.id] ?? 0;
  // Shorter, more generic names are the ones people mean ("Bread, white" > "Banana bread").
  const brevity = Math.max(0, 4 - Math.floor(fold(food.name).split(' ').length / 2));
  return base + popular + brevity;
}

/* ------------------------------------------------------------------------------- index */

export interface FoodKey {
  /** folded text of the name or alias */
  text: string;
  /** true when this key came from `aliases[]` rather than the display name */
  alias: boolean;
}

export interface IndexedFood {
  food: Food;
  keys: FoodKey[];
  tokens: string[];
  prior: number;
  /** lower-cased set of the food's own household-measure words, for the parser's unit boost */
  measureWords: Set<string>;
}

function buildIndexedFood(food: Food): IndexedFood {
  const keys: FoodKey[] = [{ text: fold(food.name), alias: false }];
  for (const a of food.aliases) keys.push({ text: fold(a), alias: true });

  const tokenSet = new Set<string>();
  for (const k of keys) for (const t of tokenize(k.text)) tokenSet.add(t);
  // the id itself is a useful token source ("pizza-cheese" → pizza, cheese)
  for (const t of tokenize(food.id.replace(/-/g, ' '))) tokenSet.add(t);

  const measureWords = new Set<string>();
  for (const m of food.household_measures) {
    for (const w of fold(m.name).split(' ')) if (w) measureWords.add(w);
  }

  return { food, keys, tokens: [...tokenSet], prior: priorFor(food), measureWords };
}

/** Every food in the tier-1 catalog, decorated for search. Built once, at module load. */
export const FOODS: IndexedFood[] = core.foods.map(buildIndexedFood);

export const FOOD_COUNT = FOODS.length;

const BY_ID = new Map<string, IndexedFood>(FOODS.map((f) => [f.food.id, f]));

export function foodById(id: string | null | undefined): Food | undefined {
  return id ? BY_ID.get(id)?.food : undefined;
}

export function indexedById(id: string): IndexedFood | undefined {
  return BY_ID.get(id);
}

/** token → indices into {@link FOODS}. */
const POSTINGS = new Map<string, number[]>();
FOODS.forEach((f, i) => {
  for (const t of f.tokens) {
    const list = POSTINGS.get(t);
    if (list) list.push(i);
    else POSTINGS.set(t, [i]);
  }
});

/** Sorted vocabulary — prefix lookups are a binary-search range over this array (§B3). */
export const VOCAB: string[] = [...POSTINGS.keys()].sort();

/** Whole folded name/alias → food indices, for the exact-match tier. */
const EXACT_KEYS = new Map<string, number[]>();
FOODS.forEach((f, i) => {
  for (const k of f.keys) {
    const list = EXACT_KEYS.get(k.text);
    if (list) list.push(i);
    else EXACT_KEYS.set(k.text, [i]);
  }
});

export function exactKeyMatches(folded: string): number[] {
  return EXACT_KEYS.get(folded) ?? [];
}

/** First index in VOCAB whose token is ≥ `prefix`. */
function lowerBound(prefix: string): number {
  let lo = 0;
  let hi = VOCAB.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((VOCAB[mid] as string) < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Every food index whose vocabulary contains a token starting with `prefix`. */
export function candidatesForPrefix(prefix: string, cap = 400): Set<number> {
  const out = new Set<number>();
  if (!prefix) return out;
  for (let i = lowerBound(prefix); i < VOCAB.length; i++) {
    const token = VOCAB[i] as string;
    if (!token.startsWith(prefix)) break;
    for (const idx of POSTINGS.get(token) ?? []) {
      out.add(idx);
      if (out.size >= cap) return out;
    }
  }
  return out;
}

/** Damerau–Levenshtein distance capped at `max` (cheap early-out, §B3 misspellings). */
export function editDistance(a: string, b: string, max = 1): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rowLen = b.length + 1;
  let prev = new Array<number>(rowLen);
  let cur = new Array<number>(rowLen);
  for (let j = 0; j < rowLen; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0] as number;
    for (let j = 1; j < rowLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length] as number;
}

export type { Food } from './types';
