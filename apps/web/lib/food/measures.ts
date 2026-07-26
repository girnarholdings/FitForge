/**
 * Unit lexicon + household-measure → gram resolution (docs/RESEARCH-FOOD.md §C2.3 and §C4).
 *
 * Resolution order (§C2.5):
 *   explicit mass  >  explicit volume × density  >  count × the food's own household measure
 *   >  count × the global default table  >  the food's default serving.
 *
 * Every step reports a confidence so the confirm screen can flag guesses honestly:
 *   explicit mass 1.0 · food-specific measure 0.9 · global default 0.7 · inferred serving 0.5.
 */
import type { Food, FoodCategory, ParsedUnit, Portion, UnitKind } from './types';

/* ------------------------------------------------------------------------- unit lexicon */

const MASS_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.35,
  lb: 453.6,
};

const VOLUME_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  'fl oz': 30,
  glass: 250,
  mug: 250,
  bottle: 500,
  can: 330,
  shot: 44,
  pint: 473,
};

/** Count / household units — grams come from the food, or the §C4 table below. */
const COUNT_UNITS = [
  'slice',
  'piece',
  'serving',
  'portion',
  'scoop',
  'bar',
  'packet',
  'handful',
  'bowl',
  'plate',
  'pat',
  'knob',
  'stick',
  'wing',
  'drumstick',
  'breast',
  'thigh',
  'fillet',
  'patty',
  'bun',
  'roll',
  'taco',
  'wrap',
  'burrito',
  'cookie',
  'square',
  'wedge',
  'egg',
  'clove',
  'leaf',
  'link',
  'sandwich',
  'burger',
  'muffin',
  'bagel',
  'pancake',
  'waffle',
  'donut',
  'nugget',
  'cube',
  'ball',
  'tortilla',
  'pita',
  'biscuit',
  'cracker',
  'chip',
  'bag',
  'pack',
  'box',
  'container',
  'tub',
  'pot',
  'block',
  'whole',
  'meatball',
  'skewer',
  'dumpling',
  'sausage',
  'rasher',
  'steak',
  'chop',
  'pie',
  'cake',
  'cup',
] as const;

/**
 * alias → canonical. Plurals are generated below, so only irregulars are spelled out here.
 * NOTE `cup` is deliberately both a volume unit and a count unit: a food that owns a "cup"
 * household measure (rice, oats) resolves it exactly; everything else falls back to 240 ml.
 */
const UNIT_ALIASES: Record<string, string> = {
  // mass
  g: 'g',
  gr: 'g',
  gm: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mg: 'mg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  // volume
  ml: 'ml',
  mls: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tbs: 'tbsp',
  tblsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  tsps: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  'fl oz': 'fl oz',
  floz: 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  glass: 'glass',
  glasses: 'glass',
  mug: 'mug',
  mugs: 'mug',
  bottle: 'bottle',
  bottles: 'bottle',
  can: 'can',
  cans: 'can',
  tin: 'can',
  shot: 'shot',
  shots: 'shot',
  pint: 'pint',
  pints: 'pint',
};

/** Irregular plurals for the count units. */
const COUNT_PLURALS: Record<string, string> = {
  patties: 'patty',
  leaves: 'leaf',
  sandwiches: 'sandwich',
  boxes: 'box',
  loaves: 'loaf',
  slices: 'slice',
  pieces: 'piece',
};

const UNIT_LOOKUP: Map<string, ParsedUnit> = (() => {
  const map = new Map<string, ParsedUnit>();
  const add = (alias: string, canonical: string, kind: UnitKind) => {
    if (!map.has(alias)) map.set(alias, { canonical, kind });
  };
  for (const [alias, canonical] of Object.entries(UNIT_ALIASES)) {
    const kind: UnitKind = canonical in MASS_GRAMS ? 'mass' : 'volume';
    add(alias, canonical, kind);
  }
  for (const u of COUNT_UNITS) {
    // A count unit never overrides an existing mass/volume mapping (cup stays volume-first).
    add(u, u, 'count');
    add(`${u}s`, u, 'count');
    add(`${u}es`, u, 'count');
  }
  for (const [plural, singular] of Object.entries(COUNT_PLURALS)) {
    add(plural, singular, 'count');
  }
  return map;
})();

/** Canonicalise a word (or two-word phrase) into a unit, or null when it is not one. */
export function lookupUnit(word: string): ParsedUnit | null {
  return UNIT_LOOKUP.get(word.trim().toLowerCase()) ?? null;
}

export function isMassUnit(canonical: string): boolean {
  return canonical in MASS_GRAMS;
}

/** Size adjectives → multiplier when the food has no matching named measure (§C2.2). */
export const SIZE_WORDS: Record<string, number> = {
  small: 0.75,
  tall: 0.75,
  mini: 0.6,
  regular: 1,
  medium: 1,
  grande: 1.25,
  standard: 1,
  big: 1.4,
  large: 1.4,
  venti: 1.6,
  jumbo: 1.5,
  extra: 1.4,
  huge: 1.5,
};

/* ------------------------------------------------- §C4 global household-measure defaults */

interface CountDefault {
  /** grams when the food's category has no override */
  g: number;
  byCategory?: Partial<Record<FoodCategory, number>>;
}

/**
 * Global fallbacks, used ONLY when the matched food does not carry the measure itself.
 * Gram weights transcribed from docs/RESEARCH-FOOD.md §C4 (USDA FNDDS `food_portion`).
 */
const COUNT_DEFAULTS: Record<string, CountDefault> = {
  slice: {
    g: 32,
    byCategory: { fastfood: 107, dairy: 21, meat: 20, vegetable: 20, fruit: 40, grain: 32 },
  },
  piece: { g: 60, byCategory: { fruit: 100, snack: 30, condiment: 10 } },
  serving: { g: 100 },
  portion: { g: 150 },
  scoop: { g: 31, byCategory: { snack: 66, dairy: 66, supplement: 31 } },
  bar: { g: 45, byCategory: { supplement: 60, snack: 45, grain: 35 } },
  packet: { g: 10, byCategory: { condiment: 9, grain: 40, supplement: 30 } },
  handful: { g: 28, byCategory: { fruit: 40, nuts: 28, snack: 28 } },
  bowl: {
    g: 245,
    byCategory: { soup: 245, grain: 200, dish: 300, fruit: 150, vegetable: 100, dairy: 200 },
  },
  plate: { g: 300 },
  pat: { g: 5 },
  knob: { g: 10 },
  stick: { g: 30, byCategory: { dairy: 113, fish: 28, snack: 10 } },
  wing: { g: 34 },
  drumstick: { g: 44 },
  breast: { g: 172 },
  thigh: { g: 52 },
  fillet: { g: 150, byCategory: { fish: 150, meat: 172 } },
  patty: { g: 90 },
  bun: { g: 55 },
  roll: { g: 40 },
  taco: { g: 100 },
  wrap: { g: 250 },
  burrito: { g: 400 },
  cookie: { g: 25 },
  square: { g: 12 },
  wedge: { g: 60 },
  egg: { g: 50 },
  clove: { g: 3 },
  leaf: { g: 8 },
  link: { g: 45 },
  sausage: { g: 45 },
  sandwich: { g: 180 },
  burger: { g: 160 },
  muffin: { g: 110 },
  bagel: { g: 95 },
  pancake: { g: 60 },
  waffle: { g: 75 },
  donut: { g: 60 },
  nugget: { g: 16 },
  cube: { g: 8 },
  ball: { g: 30 },
  tortilla: { g: 45 },
  pita: { g: 60 },
  biscuit: { g: 30 },
  cracker: { g: 3 },
  chip: { g: 2 },
  bag: { g: 40 },
  pack: { g: 40 },
  box: { g: 200 },
  container: { g: 300 },
  tub: { g: 200 },
  pot: { g: 125 },
  block: { g: 250 },
  meatball: { g: 30 },
  skewer: { g: 90 },
  dumpling: { g: 30 },
  rasher: { g: 12 },
  steak: { g: 220 },
  chop: { g: 140 },
  pie: { g: 217 },
  cake: { g: 80 },
  whole: { g: 0 }, // resolved from the food itself; the table entry only marks it as known
};

/** Density (g per ml) for volume→mass when the food owns no cup/tbsp measure. */
const CATEGORY_DENSITY: Partial<Record<FoodCategory, number>> = {
  beverage: 1.0,
  soup: 1.02,
  dairy: 1.03,
  condiment: 0.95,
  supplement: 0.5,
  grain: 0.7,
  vegetable: 0.6,
  fruit: 0.65,
  nuts: 0.55,
  snack: 0.4,
  legume: 0.7,
  dish: 0.8,
  fastfood: 0.8,
  meat: 0.8,
  fish: 0.8,
  breakfast: 0.7,
};

/* ------------------------------------------------------------------- measure matching */

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Find the food's own measure for `unit`. Exact name first ("slice"), then a name whose words
 * contain the unit ("thin slice", "cup, cooked"), preferring the shortest such name.
 */
export function findMeasure(food: Food, unit: string): { name: string; grams: number } | null {
  const u = norm(unit);
  const exact = food.household_measures.find((m) => norm(m.name) === u);
  if (exact) return { name: exact.name, grams: exact.grams };

  const contains = food.household_measures
    .filter((m) => norm(m.name).split(/[\s,]+/).includes(u))
    .sort((a, b) => a.name.length - b.name.length)[0];
  return contains ? { name: contains.name, grams: contains.grams } : null;
}

/** A measure that represents the WHOLE item ("whole pizza", "whole"), used for "half a pizza". */
function findWholeMeasure(food: Food): { name: string; grams: number } | null {
  const m = food.household_measures.find((x) => /^whole\b/.test(norm(x.name)));
  return m ? { name: m.name, grams: m.grams } : null;
}

/** A measure literally named "half …", so "half a pizza" lands on the dataset's own value. */
function findHalfMeasure(food: Food): { name: string; grams: number } | null {
  const m = food.household_measures.find((x) => /^half\b/.test(norm(x.name)));
  return m ? { name: m.name, grams: m.grams } : null;
}

function densityFor(food: Food): number {
  // Prefer the food's own cup weight — it encodes the real density (rice 158 g/cup ≈ 0.66).
  const cup = findMeasure(food, 'cup');
  if (cup) return cup.grams / 240;
  return CATEGORY_DENSITY[food.category] ?? 1;
}

function round(n: number): number {
  return n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
}

/** "2 × slice (107 g)" / "200 g" — what the confirm row shows under the food name. */
function label(qty: number, unitLabel: string | null, grams: number): string {
  const q = formatQuantity(qty);
  if (!unitLabel) return `${round(grams)} g`;
  return `${q} × ${unitLabel} · ${round(grams)} g`;
}

/** 0.5 → "½", 1.25 → "1¼", 2 → "2". */
export function formatQuantity(q: number): string {
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  const glyph =
    Math.abs(frac - 0.5) < 0.02
      ? '½'
      : Math.abs(frac - 0.25) < 0.02
        ? '¼'
        : Math.abs(frac - 0.75) < 0.02
          ? '¾'
          : Math.abs(frac - 1 / 3) < 0.02
            ? '⅓'
            : Math.abs(frac - 2 / 3) < 0.02
              ? '⅔'
              : '';
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  return String(Math.round(q * 100) / 100);
}

/** The food's default serving expressed as one of its own named measures, when it is one. */
function servingMeasure(food: Food): { name: string; grams: number } | null {
  const m = food.household_measures.find((x) => Math.abs(x.grams - food.serving_grams) < 0.5);
  return m ? { name: m.name, grams: m.grams } : null;
}

/** Words that make a measure a VOLUME/container rather than a countable item. */
const VOLUME_WORDS = new Set([
  'cup',
  'bowl',
  'plate',
  'glass',
  'bottle',
  'can',
  'pint',
  'mug',
  'oz',
  'tbsp',
  'tsp',
  'ml',
  'container',
  'takeout',
  'shot',
  'carton',
  'tub',
  'pot',
  'box',
  'bag',
  'portion',
  'serving',
  'scoop',
  'handful',
]);

function isVolumeMeasure(name: string): boolean {
  return norm(name)
    .split(/[\s,]+/)
    .some((w) => VOLUME_WORDS.has(w));
}

/** The smallest measure that names a single countable item ("berry", "grape", "egg"). */
function countableMeasure(food: Food): { name: string; grams: number } | null {
  const items = food.household_measures
    .filter((m) => {
      const words = norm(m.name).split(/[\s,]+/);
      return words.length <= 2 && !words.some((w) => VOLUME_WORDS.has(w));
    })
    .sort((a, b) => a.grams - b.grams);
  const first = items[0];
  return first ? { name: first.name, grams: first.grams } : null;
}

/** "1 medium" → "medium" — the serving name without its leading count. */
function servingLabel(food: Food): string {
  return food.serving_name.replace(/^1\s+/, '');
}

/* ------------------------------------------------------------------- gram resolution */

export interface ResolveOptions {
  /** size adjective from the sentence ("large latte") */
  size?: string | null;
  /** true when the fragment came from a "with …" clause — condiment-sized default portions */
  child?: boolean;
}

/**
 * Turn (food, quantity, unit) into grams + a human label + a confidence, per §C2.5.
 * `unit` must already be canonical (see {@link lookupUnit}); pass null when the user gave none.
 */
export function resolvePortion(
  food: Food,
  quantity: number,
  unit: string | null,
  opts: ResolveOptions = {},
): Portion {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

  /* 1 · explicit mass — nothing to infer. */
  if (unit && isMassUnit(unit)) {
    const grams = qty * (MASS_GRAMS[unit] ?? 1);
    return {
      grams: round(grams),
      label: `${round(grams)} g`,
      measureName: null,
      confidence: 1,
    };
  }

  /* 2 · explicit volume — the food's own measure first, then density. */
  if (unit && unit in VOLUME_ML) {
    const own = findMeasure(food, unit);
    if (own) {
      return {
        grams: round(qty * own.grams),
        label: label(qty, own.name, qty * own.grams),
        measureName: own.name,
        confidence: 0.95,
      };
    }
    const ml = qty * (VOLUME_ML[unit] ?? 240);
    const grams = ml * densityFor(food);
    return {
      grams: round(grams),
      label: label(qty, unit, grams),
      measureName: null,
      confidence: 0.75,
    };
  }

  /* 3 · count / household unit. */
  if (unit) {
    const own = findMeasure(food, unit);
    if (own) {
      return {
        grams: round(qty * own.grams),
        label: label(qty, own.name, qty * own.grams),
        measureName: own.name,
        confidence: 0.95,
      };
    }
    if (unit === 'whole') {
      const whole = findWholeMeasure(food);
      const grams = qty * (whole?.grams ?? food.serving_grams);
      return {
        grams: round(grams),
        label: label(qty, whole?.name ?? 'whole', grams),
        measureName: whole?.name ?? null,
        confidence: whole ? 0.95 : 0.65,
      };
    }
    const def = COUNT_DEFAULTS[unit];
    if (def) {
      const g = def.byCategory?.[food.category] ?? def.g;
      return {
        grams: round(qty * g),
        label: label(qty, unit, qty * g),
        measureName: null,
        confidence: 0.75,
      };
    }
    // Unknown word used as a unit — treat it as "servings of".
    const grams = qty * food.serving_grams;
    return {
      grams: round(grams),
      label: label(qty, food.serving_name, grams),
      measureName: null,
      confidence: 0.55,
    };
  }

  /* 4 · no unit — size word, fraction-of-whole, countable item, then the default serving. */
  const size = opts.size ? norm(opts.size) : null;
  if (size) {
    const own = findMeasure(food, size);
    if (own) {
      return {
        grams: round(qty * own.grams),
        label: label(qty, own.name, qty * own.grams),
        measureName: own.name,
        confidence: 0.95,
      };
    }
    const mult = SIZE_WORDS[size];
    if (mult != null) {
      const grams = qty * food.serving_grams * mult;
      return {
        grams: round(grams),
        label: label(qty, `${size} ${servingLabel(food)}`, grams),
        measureName: null,
        confidence: 0.7,
      };
    }
  }

  // "half a pizza" — use the dataset's own half/whole measure rather than half a SLICE.
  if (qty < 1) {
    const half = findHalfMeasure(food);
    if (half && Math.abs(qty - 0.5) < 0.02) {
      return {
        grams: round(half.grams),
        label: `${half.name} · ${round(half.grams)} g`,
        measureName: half.name,
        confidence: 0.8,
      };
    }
    const whole = findWholeMeasure(food);
    if (whole) {
      return {
        grams: round(qty * whole.grams),
        label: label(qty, whole.name, qty * whole.grams),
        measureName: whole.name,
        confidence: 0.8,
      };
    }
  }

  // A "with butter"-style child with no quantity gets a dab, not a full serving.
  if (opts.child && qty === 1) {
    const dab =
      findMeasure(food, 'splash') ??
      findMeasure(food, 'pat') ??
      (food.category === 'condiment' || food.category === 'nuts' || food.category === 'dairy'
        ? findMeasure(food, 'tbsp')
        : null) ??
      findMeasure(food, 'tsp');
    if (dab) {
      return {
        grams: round(dab.grams),
        label: label(1, dab.name, dab.grams),
        measureName: dab.name,
        confidence: 0.8,
      };
    }
  }

  const serving = servingMeasure(food);

  // "a few strawberries" must mean berries, not three CUPS of berries: when the default serving
  // is a volume and the food owns a countable item measure, counting wins.
  if (qty !== 1 && (!serving || isVolumeMeasure(serving.name))) {
    const item = countableMeasure(food);
    if (item) {
      return {
        grams: round(qty * item.grams),
        label: label(qty, item.name, qty * item.grams),
        measureName: item.name,
        confidence: 0.75,
      };
    }
  }

  // The dataset's default serving IS a named portion ("1 large egg" ↔ measure "egg") — a much
  // better answer than an anonymous "1 serving".
  if (serving) {
    return {
      grams: round(qty * serving.grams),
      label: label(qty, serving.name, qty * serving.grams),
      measureName: serving.name,
      confidence: 0.9,
    };
  }

  const grams = qty * food.serving_grams;
  return {
    grams: round(grams),
    label: label(qty, servingLabel(food), grams),
    measureName: null,
    confidence: 0.7,
  };
}

/**
 * The unit chips offered on a confirm row: the food's own measures first, then g/oz and the
 * generic count units that make sense for it.
 */
export function unitOptions(food: Food): { unit: string; label: string; grams: number | null }[] {
  const own = food.household_measures.map((m) => ({
    unit: m.name,
    label: m.name,
    grams: m.grams,
  }));
  const has = new Set(own.map((o) => o.unit.toLowerCase()));
  const extras: { unit: string; label: string; grams: number | null }[] = [];
  const servingLabelText = servingLabel(food).toLowerCase();
  if (!has.has('serving') && !has.has(servingLabelText)) {
    extras.push({
      unit: '__serving',
      label: food.serving_name.replace(/^1\s+/, ''),
      grams: food.serving_grams,
    });
  }
  extras.push({ unit: 'g', label: 'g', grams: null });
  extras.push({ unit: 'oz', label: 'oz', grams: null });
  return [...own, ...extras];
}
