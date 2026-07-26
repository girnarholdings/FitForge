/**
 * The deterministic offline food-sentence parser (docs/RESEARCH-FOOD.md §C2).
 *
 *   input → segment → per fragment (quantity, unit, food words) → resolve food → resolve grams
 *         → per-item confidence → confirm UI
 *
 * No AI, no network, no server: it runs entirely against the in-RAM tier-1 index, so it works
 * offline and on first paint. `assist.ts` can optionally reshape very messy text into the same
 * fragments when a Workers-AI endpoint is configured, but it never produces nutrient numbers and
 * this module is fully functional without it.
 *
 * Worked examples the parser handles by itself (§C2):
 *   "2 eggs and a slice of toast with butter" · "chicken breast 200g, rice 1 cup" ·
 *   "large latte" · "half a pizza" · "bowl of oatmeal with banana"
 */
import { exactKeyMatches, fold, foodById, singular } from './index';
import { learnedFoodId } from './learning';
import { lookupUnit, resolvePortion, SIZE_WORDS } from './measures';
import { bestMatch, searchFoods } from './search';
import type { Food, MealSlotName, ParseResult, ParsedItem, QuantitySource } from './types';

/* ------------------------------------------------------------------ normalisation */

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': ' 1/2',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
  '¼': ' 1/4',
  '¾': ' 3/4',
  '⅛': ' 1/8',
  '⅜': ' 3/8',
  '⅝': ' 5/8',
  '⅞': ' 7/8',
};

/** Conversational noise that carries no food information. */
const LEAD_FILLERS = [
  /^\s*(?:i\s+)?(?:just\s+)?(?:had|ate|have\s+eaten|eaten|got|grabbed|made|drank|took)\s+/,
  /^\s*(?:today|this\s+morning|this\s+afternoon|this\s+evening|tonight)\s+/,
  /^\s*(?:log|add|track)\s+/,
];

const SLOT_PATTERNS: { re: RegExp; slot: MealSlotName }[] = [
  { re: /\bfor\s+breakfast\b|^breakfast\s*[:-]\s*/, slot: 'breakfast' },
  { re: /\bfor\s+lunch\b|^lunch\s*[:-]\s*/, slot: 'lunch' },
  { re: /\bfor\s+dinner\b|\bfor\s+supper\b|^dinner\s*[:-]\s*/, slot: 'dinner' },
  { re: /\bas\s+a\s+snack\b|\bfor\s+a\s+snack\b|^snack\s*[:-]\s*/, slot: 'snack' },
];

/** Dish names that contain "and" — these must survive segmentation (§C2.1). */
const COMPOUNDS = [
  'mac and cheese',
  'macaroni and cheese',
  'fish and chips',
  'rice and beans',
  'salt and vinegar',
  'peanut butter and jelly',
  'surf and turf',
  'bangers and mash',
  'sweet and sour',
  'chicken and waffles',
  'biscuits and gravy',
  'ham and cheese',
  'cookies and cream',
  'chips and salsa',
  'chips and guacamole',
  'spaghetti and meatballs',
  'bacon egg and cheese',
  'egg and cheese',
  'oil and vinegar',
  'beans and toast',
  'cheese and crackers',
  'milk and cookies',
];

/** Stand-in for the "and" inside a whitelisted compound, restored after splitting. */
const AND_SENTINEL = '\u0001';

/** Words the food query never needs. */
const QUERY_STOPWORDS = new Set([
  'of',
  'a',
  'an',
  'the',
  'some',
  'my',
  'with',
  'from',
  'about',
  'approx',
  'approximately',
  'roughly',
  'maybe',
]);

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
};

/** Multi-word quantity phrases, longest first so "a couple of" beats "a". */
const QUANTITY_PHRASES: { words: string[]; value: number; source: QuantitySource }[] = [
  { words: ['a', 'couple', 'of'], value: 2, source: 'word' },
  { words: ['a', 'couple'], value: 2, source: 'word' },
  { words: ['couple', 'of'], value: 2, source: 'word' },
  { words: ['couple'], value: 2, source: 'word' },
  { words: ['a', 'few'], value: 3, source: 'word' },
  { words: ['few'], value: 3, source: 'word' },
  { words: ['several'], value: 3, source: 'word' },
  { words: ['half', 'of', 'a'], value: 0.5, source: 'word' },
  { words: ['half', 'of', 'an'], value: 0.5, source: 'word' },
  { words: ['half', 'a'], value: 0.5, source: 'word' },
  { words: ['half', 'an'], value: 0.5, source: 'word' },
  { words: ['a', 'half'], value: 0.5, source: 'word' },
  { words: ['half'], value: 0.5, source: 'word' },
  { words: ['quarter', 'of', 'a'], value: 0.25, source: 'word' },
  { words: ['a', 'quarter', 'of'], value: 0.25, source: 'word' },
  { words: ['a', 'quarter'], value: 0.25, source: 'word' },
  { words: ['quarter'], value: 0.25, source: 'word' },
  { words: ['a', 'dozen'], value: 12, source: 'word' },
  { words: ['a'], value: 1, source: 'word' },
  { words: ['an'], value: 1, source: 'word' },
];

/** Confidence contributed by how the quantity was expressed (§C2.6). */
const QUANTITY_CONFIDENCE: Record<QuantitySource, number> = {
  numeric: 1,
  fraction: 1,
  word: 0.95,
  implicit: 0.92,
  range: 0.75,
  none: 0.8,
};

/* ------------------------------------------------------------------- segmentation */

function preclean(raw: string): { text: string; slot: MealSlotName | null } {
  let text = raw ?? '';
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.split(glyph).join(ascii);
  }
  text = text
    .toLowerCase()
    .replace(/[!?."'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let slot: MealSlotName | null = null;
  for (const { re, slot: s } of SLOT_PATTERNS) {
    if (re.test(text)) {
      slot = s;
      text = text.replace(re, ' ');
    }
  }
  for (const re of LEAD_FILLERS) text = text.replace(re, '');
  text = text.replace(/\s+/g, ' ').trim();
  return { text, slot };
}

export interface Fragment {
  text: string;
  child: boolean;
}

/** Split a sentence into item fragments, keeping "with …" clauses as children (§C2.1). */
export function segment(input: string): Fragment[] {
  let text = input;
  for (const compound of COMPOUNDS) {
    if (text.includes(compound)) {
      text = text.split(compound).join(compound.split(' and ').join(AND_SENTINEL));
    }
  }

  const pieces = text
    .split(/\s*(?:,|;|\+|&|\n|\band\b|\bplus\b|\bthen\b|\balso\b)\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const out: Fragment[] = [];
  for (const piece of pieces) {
    const parts = piece
      .split(/\s+(?:topped\s+with|with\s+a\s+side\s+of|side\s+of|with)\s+/)
      .map((p) => p.split(AND_SENTINEL).join(' and ').trim())
      .filter((p) => p.length > 0);
    parts.forEach((p, i) => out.push({ text: p, child: i > 0 }));
  }
  return out;
}

/* --------------------------------------------------------------- fragment grammar */

export interface FragmentParse {
  quantity: number;
  source: QuantitySource;
  unit: string | null;
  size: string | null;
  query: string;
}

function evalFraction(token: string): number {
  const [a, b] = token.split('/').map(Number);
  return a != null && b ? a / b : 0;
}

function matchNumberToken(token: string): { value: number; source: QuantitySource } | null {
  if (/^\d+\/\d+$/.test(token)) return { value: evalFraction(token), source: 'fraction' };
  if (/^\d+(?:\.\d+)?-\d+(?:\.\d+)?$/.test(token)) {
    const [a, b] = token.split('-').map(Number);
    if (a != null && b != null) return { value: (a + b) / 2, source: 'range' };
  }
  if (/^\d+(?:\.\d+)?$/.test(token)) return { value: Number(token), source: 'numeric' };
  const word = NUMBER_WORDS[token];
  if (word != null) return { value: word, source: 'word' };
  return null;
}

/** "200g" / "1.5kg" / "12oz" written without a space. */
function splitNumberUnit(token: string): { value: number; unit: string } | null {
  const m = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(token);
  if (!m) return null;
  const unit = lookupUnit(m[2] as string);
  if (!unit) return null;
  return { value: Number(m[1]), unit: unit.canonical };
}

/** Consume the unit sitting at `i`, honouring the two-word "fl oz". */
function unitAt(tokens: string[], i: number): { canonical: string; consumed: number } | null {
  const a = tokens[i];
  if (!a) return null;
  const b = tokens[i + 1];
  if (b) {
    const two = lookupUnit(`${a} ${b}`);
    if (two) return { canonical: two.canonical, consumed: 2 };
  }
  const one = lookupUnit(a);
  return one ? { canonical: one.canonical, consumed: 1 } : null;
}

/**
 * True when the WHOLE phrase is itself a food ("egg roll", "big mac", "ice cream sandwich"), so
 * its leading word must not be stripped as a unit or a size adjective.
 */
function phraseIsFood(tokens: string[], tail: string[]): boolean {
  const full = tokens.join(' ');
  if (!full) return false;
  if (exactKeyMatches(fold(full)).length > 0) return true;
  const whole = bestMatch(full)?.confidence ?? 0;
  if (whole < 0.9) return false;
  const rest = tail.length > 0 ? (bestMatch(tail.join(' '))?.confidence ?? 0) : 0;
  return whole >= rest;
}

/**
 * Parse one fragment into (quantity, unit, food words). Quantity + unit may sit at EITHER end —
 * "200g chicken" and "chicken breast 200g" are both idiomatic (§C2.2).
 */
export function parseFragment(fragmentText: string): FragmentParse {
  let tokens = fragmentText.split(' ').filter(Boolean);
  let quantity = 1;
  let source: QuantitySource = 'none';
  let unit: string | null = null;

  /* 1 · leading quantity — multi-word phrases first ("a couple of", "half a") */
  const phrase = QUANTITY_PHRASES.find(
    (p) => p.words.every((w, i) => tokens[i] === w) && tokens.length > p.words.length,
  );
  if (phrase) {
    quantity = phrase.value;
    source = phrase.source;
    tokens = tokens.slice(phrase.words.length);
  } else {
    const first = tokens[0];
    const second = tokens[1];
    if (first && /^\d+$/.test(first) && second && /^\d+\/\d+$/.test(second) && tokens.length > 2) {
      quantity = Number(first) + evalFraction(second);
      source = 'fraction';
      tokens = tokens.slice(2);
    } else if (first) {
      const glued = splitNumberUnit(first);
      if (glued && tokens.length > 1) {
        quantity = glued.value;
        source = 'numeric';
        unit = glued.unit;
        tokens = tokens.slice(1);
      } else {
        const num = matchNumberToken(first);
        if (num && tokens.length > 1) {
          quantity = num.value;
          source = num.source;
          tokens = tokens.slice(1);
        }
      }
    }
  }

  /* 2 · unit right after the quantity — never swallow the food itself ("2 eggs" keeps "eggs") */
  if (!unit) {
    const u = unitAt(tokens, 0);
    if (u && tokens.length > u.consumed) {
      const tail = tokens.slice(u.consumed);
      const isCountWord = lookupUnit(tokens[0] as string)?.kind === 'count';
      if (!(isCountWord && phraseIsFood(tokens, tail))) {
        unit = u.canonical;
        tokens = tail;
        if (source === 'none') source = 'implicit';
      }
    }
  }
  if (tokens[0] === 'of') tokens = tokens.slice(1);

  /* 3 · trailing "200g" / "1 cup" when nothing was given up front */
  if (source === 'none' && tokens.length > 1) {
    const last = tokens[tokens.length - 1] as string;
    const glued = splitNumberUnit(last);
    if (glued) {
      quantity = glued.value;
      source = 'numeric';
      unit = glued.unit;
      tokens = tokens.slice(0, -1);
    } else {
      const u = lookupUnit(last);
      const prev = tokens[tokens.length - 2];
      const num = prev ? matchNumberToken(prev) : null;
      if (u && num && tokens.length > 2) {
        quantity = num.value;
        source = num.source;
        unit = u.canonical;
        tokens = tokens.slice(0, -2);
      } else {
        const n = matchNumberToken(last);
        if (n && (n.source === 'numeric' || n.source === 'fraction')) {
          quantity = n.value;
          source = n.source;
          tokens = tokens.slice(0, -1);
        }
      }
    }
  }

  /* 4 · size adjective ("large latte", "medium fries") — unless it belongs to the name */
  let size: string | null = null;
  const sizeIdx = tokens.findIndex((t) => SIZE_WORDS[t] != null);
  if (sizeIdx >= 0 && tokens.length > 1) {
    const tail = [...tokens.slice(0, sizeIdx), ...tokens.slice(sizeIdx + 1)];
    if (!phraseIsFood(tokens, tail)) {
      size = tokens[sizeIdx] as string;
      tokens = tail;
      // "large latte" states a portion, so the implied count of 1 is not a wild guess.
      if (source === 'none') source = 'implicit';
      if (size === 'extra' && tokens[0] && SIZE_WORDS[tokens[0] as string] != null) {
        size = tokens[0] as string;
        tokens = tokens.slice(1);
      }
    }
  }

  const stripped = tokens.filter((t) => !QUERY_STOPWORDS.has(t)).join(' ').trim();
  return { quantity, source, unit, size, query: stripped || tokens.join(' ').trim() };
}

/* ------------------------------------------------------------------------ resolution */

/**
 * "2 scrambled eggs" names its own unit inside the food words: when the user counted something
 * and the matched food owns a measure with exactly that name, count THAT (2 × 61 g), never 2 ×
 * the default serving (which for scrambled eggs is already "2 eggs").
 */
function impliedUnit(food: Food, query: string, source: QuantitySource): string | null {
  if (source === 'none') return null;
  const names = new Set(food.household_measures.map((m) => m.name.toLowerCase()));
  for (const raw of query.split(' ')) {
    const token = singular(fold(raw));
    if (token.length >= 3 && names.has(token)) return token;
  }
  return null;
}

export interface ParseOptions {
  /** food ids to promote in ranking — the user's own history */
  boostIds?: string[];
  /** below this match confidence a fragment is reported UNMATCHED rather than guessed */
  matchFloor?: number;
}

let seq = 0;
const nextId = () => `pi-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Resolve one already-segmented fragment into a confirm-screen row. */
export function resolveFragment(fragment: Fragment, opts: ParseOptions = {}): ParsedItem | null {
  const parsed = parseFragment(fragment.text);
  if (!parsed.query) return null;

  const floor = opts.matchFloor ?? 0.35;
  const learned = foodById(learnedFoodId(parsed.query) ?? learnedFoodId(fragment.text));

  const hits = searchFoods(parsed.query, {
    limit: 5,
    unitHint: parsed.unit,
    boostIds: opts.boostIds,
  });

  let food: Food | null = null;
  let matchConfidence = 0;
  const top = hits[0];
  if (learned) {
    food = learned;
    matchConfidence = 1;
  } else if (top && top.confidence >= floor) {
    food = top.food;
    matchConfidence = top.confidence;
  }

  const alternatives = hits
    .map((h) => h.food)
    .filter((f) => f.id !== food?.id)
    .slice(0, 4);

  const unit =
    parsed.unit ?? (food ? impliedUnit(food, parsed.query, parsed.source) : null);

  const portion = food
    ? resolvePortion(food, parsed.quantity, unit, {
        size: parsed.size,
        child: fragment.child,
      })
    : null;

  const confidence = portion
    ? Math.round(QUANTITY_CONFIDENCE[parsed.source] * portion.confidence * matchConfidence * 100) /
      100
    : 0;

  return {
    id: nextId(),
    sourceText: fragment.text,
    quantity: parsed.quantity,
    quantitySource: parsed.source,
    unit,
    size: parsed.size,
    query: parsed.query,
    food,
    alternatives,
    portion,
    matchConfidence,
    confidence,
    child: fragment.child,
  };
}

/**
 * Parse a whole sentence into confirm-screen rows. Fragments that match nothing come back with
 * `food: null` — surfaced honestly in the UI as "we couldn't find this", never dropped.
 */
export function parseFoodText(input: string, opts: ParseOptions = {}): ParseResult {
  const { text, slot } = preclean(input);
  if (!text) return { input, items: [], mealSlot: slot };

  const items: ParsedItem[] = [];
  for (const fragment of segment(text)) {
    const item = resolveFragment(fragment, opts);
    if (item) items.push(item);
  }
  return { input, items, mealSlot: slot };
}

/**
 * Re-resolve a row after the user edits its food / quantity / unit on the confirm screen.
 * A field the user set is certain by definition, so its confidence contribution becomes 1.
 */
export function reprice(
  item: ParsedItem,
  patch: { food?: Food; quantity?: number; unit?: string | null; size?: string | null },
): ParsedItem {
  const food = patch.food ?? item.food;
  const quantity = patch.quantity ?? item.quantity;
  const unit = patch.unit === undefined ? item.unit : patch.unit;
  const size = patch.size === undefined ? (patch.unit === undefined ? item.size : null) : patch.size;
  const matchConfidence = patch.food ? 1 : item.matchConfidence;
  const quantitySource: QuantitySource =
    patch.quantity != null ? 'numeric' : item.quantitySource;

  if (!food) {
    return { ...item, quantity, unit, size, quantitySource, matchConfidence, confidence: 0 };
  }

  const portion = resolvePortion(food, quantity, unit, { size, child: item.child });
  const unitConfidence = patch.unit !== undefined ? 1 : portion.confidence;
  const confidence =
    Math.round(QUANTITY_CONFIDENCE[quantitySource] * unitConfidence * matchConfidence * 100) / 100;

  return {
    ...item,
    food,
    quantity,
    quantitySource,
    unit,
    size,
    portion,
    matchConfidence,
    confidence,
  };
}
