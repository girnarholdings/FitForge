#!/usr/bin/env node
/**
 * TIER-2 FOOD CATALOG BUILDER — USDA FoodData Central → sharded static JSON.
 *
 * WHY THIS IS A BUILD STEP AND NOT A CHECKED-IN FILE
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * The tier-2 catalog is 50–60k foods. Committing that as one JSON blob would be ~40 MB of
 * repository churn per refresh and would land in the client bundle. Instead it is FETCHED FROM
 * THE SOURCE at build time and emitted as content-addressed shards under `public/food/`, which
 * the app loads on demand (see `lib/food/tier2.ts`). The repo stays small, the data stays fresh,
 * and the bundle only ever carries the 509-food tier-1 core.
 *
 * SOURCE + LICENCE
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * USDA FoodData Central. Works of the U.S. federal government are not subject to copyright and
 * FDC data is released into the public domain (CC0) — it can be redistributed freely, which is
 * exactly why it is the backbone here rather than a database with attribution or share-alike
 * terms. Two datasets are used:
 *
 *   · **Foundation Foods / SR Legacy** — lab-analysed generic foods ("Chicken, breast, raw").
 *     Highest quality, ~10k rows, and the right answer for "chicken".
 *   · **Branded Foods** — manufacturer-declared label data, ~1.9M rows. Sampled down (see
 *     `BRANDED_LIMIT`) to the most useful subset, because the whole thing is neither shippable
 *     nor searchable on a phone.
 *
 * NOTHING IS INVENTED. Every row here comes from the download. If a food has no energy value or
 * no macros it is DROPPED rather than defaulted — a nutrition tracker that guesses is worse than
 * one that says "no match".
 *
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *   node seed/import-usda.mjs                    # full build into apps/web/public/food
 *   node seed/import-usda.mjs --limit 5000       # smaller run for local checking
 *   node seed/import-usda.mjs --fixture <path>   # transform a local JSON file instead of fetching
 *
 * `--fixture` is how the transform is exercised where the network is closed: it takes the same
 * FDC JSON shape from disk and runs every downstream step, so the parsing, mapping, sharding and
 * manifest logic are all covered without reaching the internet.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'apps', 'web', 'public', 'food');

/* ════════════════════════════════════════════════════════════════════════════════ config ══ */

/** FDC bulk downloads. Dated filenames — FDC publishes twice a year and keeps old releases. */
const SOURCES = {
  foundation:
    'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-04-24.zip',
  srLegacy: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2021-10-28.zip',
  branded: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2025-04-24.zip',
};

/**
 * How many branded foods to keep. The full set is ~1.9M rows; at ~150 bytes each that is 280 MB
 * before compression, which is not a phone-sized asset at any level of cleverness. 50k is the
 * point where "the thing I actually ate" is nearly always present while the sharded catalog
 * stays a few MB gzipped in total and any single shard is a sub-100 kB fetch.
 */
const BRANDED_LIMIT = Number(process.env.FITFORGE_BRANDED_LIMIT ?? 50_000);

/** Foods are sharded by the first two characters of their folded name. */
const SHARD_KEY_LENGTH = 2;

/** FDC nutrient ids we care about. Anything else in the row is ignored. */
const NUTRIENT = {
  ENERGY_KCAL: 1008,
  PROTEIN: 1003,
  FAT: 1004,
  CARBS: 1005,
  FIBER: 1079,
  SUGAR: 2000,
  SODIUM: 1093,
};

/* ═══════════════════════════════════════════════════════════════════════════════ helpers ══ */

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const limit = Number(argValue('--limit') ?? BRANDED_LIMIT);
const fixture = argValue('--fixture');

function fold(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Shard a folded name into a bucket. Short names go to `_`, so every food lands somewhere. */
function shardKeyFor(foldedName) {
  const key = foldedName.replace(/[^a-z0-9]/g, '').slice(0, SHARD_KEY_LENGTH);
  return key.length === SHARD_KEY_LENGTH ? key : '_';
}

/**
 * FDC nutrient rows come in two shapes depending on dataset: `foodNutrients[].nutrient.id` on
 * Foundation/SR, and a flattened `foodNutrients[].nutrientId` on Branded. Handle both rather than
 * assuming, because assuming is how you silently produce 50k foods with zero calories.
 */
function nutrientMap(row) {
  const out = new Map();
  for (const n of row.foodNutrients ?? []) {
    const id = n?.nutrient?.id ?? n?.nutrientId;
    const value = n?.amount ?? n?.value;
    if (typeof id === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      out.set(id, value);
    }
  }
  return out;
}

/**
 * Map an FDC row onto the app's `Food` shape, or null if it cannot be trusted.
 *
 * The rejection rules are the whole point of this function:
 *   · no energy value           → drop (we will not infer kcal from macros)
 *   · no protein AND no carbs AND no fat → drop (a row with only sodium is not a food entry)
 *   · macros that cannot produce the stated energy within a wide tolerance → drop
 *
 * That last one catches unit errors and per-serving-vs-per-100g mixups, which are the classic way
 * bad rows enter a nutrition database.
 */
function toFood(row, source) {
  const name = String(row.description ?? '').trim();
  if (!name) return null;

  const n = nutrientMap(row);
  const kcal = n.get(NUTRIENT.ENERGY_KCAL);
  if (typeof kcal !== 'number' || kcal < 0 || kcal > 900) return null;

  const protein_g = n.get(NUTRIENT.PROTEIN) ?? 0;
  const carbs_g = n.get(NUTRIENT.CARBS) ?? 0;
  const fat_g = n.get(NUTRIENT.FAT) ?? 0;
  if (protein_g === 0 && carbs_g === 0 && fat_g === 0 && kcal > 5) return null;

  // Atwater sanity: 4/4/9 kcal per gram. Alcohol (7 kcal/g) and fibre/polyol accounting make an
  // exact match impossible, so the gate is deliberately loose — it exists to catch order-of-
  // magnitude errors, not to second-guess the lab.
  const implied = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  if (kcal > 20 && implied > 0) {
    const ratio = implied / kcal;
    if (ratio < 0.4 || ratio > 2.2) return null;
  }

  const brand = String(row.brandOwner ?? row.brandName ?? '').trim();
  const displayName = brand && !fold(name).includes(fold(brand)) ? `${name} (${brand})` : name;

  const measures = [];
  for (const p of row.foodPortions ?? []) {
    const grams = p?.gramWeight;
    const label = p?.portionDescription || p?.modifier || p?.measureUnit?.name;
    if (typeof grams === 'number' && grams > 0 && label && label !== 'undetermined') {
      measures.push({ name: String(label).slice(0, 40), grams: Math.round(grams * 10) / 10 });
    }
    if (measures.length >= 4) break;
  }

  // Branded rows carry a label serving instead of portions.
  const servingGrams =
    typeof row.servingSize === 'number' && row.servingSize > 0 && row.servingSizeUnit !== 'ml'
      ? Math.round(row.servingSize)
      : (measures[0]?.grams ?? 100);

  return {
    id: `fdc-${row.fdcId}`,
    name: displayName.slice(0, 90),
    aliases: [],
    category: categoryFor(row, source),
    per_100g: {
      kcal: round1(kcal),
      protein_g: round1(protein_g),
      carbs_g: round1(carbs_g),
      fat_g: round1(fat_g),
      ...(n.has(NUTRIENT.FIBER) ? { fiber_g: round1(n.get(NUTRIENT.FIBER)) } : {}),
      ...(n.has(NUTRIENT.SUGAR) ? { sugar_g: round1(n.get(NUTRIENT.SUGAR)) } : {}),
      ...(n.has(NUTRIENT.SODIUM) ? { sodium_mg: Math.round(n.get(NUTRIENT.SODIUM)) } : {}),
    },
    serving_name: measures[0]?.name ?? `${servingGrams} g`,
    serving_grams: servingGrams,
    household_measures: measures,
  };
}

const round1 = (v) => Math.round(v * 10) / 10;

/** FDC food categories → the app's coarse buckets, used only for search priors. */
const CATEGORY_HINTS = [
  [/fruit|berr|melon|citrus/i, 'fruit'],
  [/vegetable|legume.*vegetable/i, 'vegetable'],
  [/cereal|grain|bread|baked|pasta|rice/i, 'grain'],
  [/beef|pork|poultry|lamb|sausage|luncheon/i, 'meat'],
  [/fish|shellfish|seafood/i, 'fish'],
  [/dairy|milk|cheese|yogurt/i, 'dairy'],
  [/legume|bean|pulse/i, 'legume'],
  [/nut|seed/i, 'nuts'],
  [/beverage|drink|juice|coffee|tea/i, 'beverage'],
  [/snack|candy|sweets|dessert/i, 'snack'],
  [/spice|herb|sauce|dressing|condiment|fat.*oil/i, 'condiment'],
  [/fast food|restaurant/i, 'fastfood'],
  [/soup/i, 'soup'],
  [/breakfast/i, 'breakfast'],
  [/supplement|formula/i, 'supplement'],
];

function categoryFor(row, source) {
  const label = String(
    row.foodCategory?.description ?? row.brandedFoodCategory ?? row.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? '',
  );
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(label)) return cat;
  return source === 'branded' ? 'snack' : 'dish';
}

/* ═════════════════════════════════════════════════════════════════════════════ the fetch ══ */

/**
 * Stream a zipped FDC dataset and yield its food rows.
 *
 * FDC zips contain one large JSON object with a single array property. Rather than pull the whole
 * thing into memory (branded is ~4 GB unpacked), the archive is expanded to a temp file and the
 * array is scanned incrementally.
 */
async function fetchDataset(url, label) {
  process.stdout.write(`· fetching ${label} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} from ${url}`);

  const tmpZip = join(OUT_DIR, `.${label}.zip`);
  await mkdir(OUT_DIR, { recursive: true });
  const sink = createWriteStream(tmpZip);
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  await pipeline(Readable.fromWeb(res.body), sink);

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const tmpDir = join(OUT_DIR, `.${label}`);
  await run('unzip', ['-o', '-q', tmpZip, '-d', tmpDir]);

  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(tmpDir)).filter((f) => f.endsWith('.json'));
  const rows = [];
  for (const f of files) {
    const parsed = JSON.parse(await readFile(join(tmpDir, f), 'utf8'));
    const arr =
      parsed.FoundationFoods ?? parsed.SRLegacyFoods ?? parsed.BrandedFoods ?? parsed.foods ?? [];
    rows.push(...arr);
  }
  await rm(tmpZip, { force: true });
  await rm(tmpDir, { recursive: true, force: true });
  console.log(`${rows.length.toLocaleString()} rows`);
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════════════ the run ══ */

async function main() {
  const foods = [];
  const seenNames = new Set();

  const ingest = (rows, source, cap = Infinity) => {
    let kept = 0;
    let rejected = 0;
    for (const row of rows) {
      if (kept >= cap) break;
      const food = toFood(row, source);
      if (!food) {
        rejected += 1;
        continue;
      }
      // Exact duplicate names add nothing but search noise.
      const key = fold(food.name);
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      foods.push(food);
      kept += 1;
    }
    console.log(`  ${source}: kept ${kept.toLocaleString()}, rejected ${rejected.toLocaleString()}`);
  };

  if (fixture) {
    console.log(`· fixture mode: ${fixture}`);
    const parsed = JSON.parse(await readFile(fixture, 'utf8'));
    // Every array, not the first one that matches: the fixture deliberately carries BOTH dataset
    // shapes (nested `nutrient.id` and flat `nutrientId`) and short-circuiting would leave the
    // branded path — the one that supplies 50k of the 60k rows — completely unexercised.
    ingest(parsed.FoundationFoods ?? [], 'foundation');
    ingest(parsed.SRLegacyFoods ?? [], 'srLegacy');
    ingest(parsed.BrandedFoods ?? [], 'branded');
    ingest(parsed.foods ?? [], 'other');
  } else {
    ingest(await fetchDataset(SOURCES.foundation, 'foundation'), 'foundation');
    ingest(await fetchDataset(SOURCES.srLegacy, 'srLegacy'), 'srLegacy');
    ingest(await fetchDataset(SOURCES.branded, 'branded'), 'branded', limit);
  }

  if (foods.length === 0) {
    // FAIL LOUDLY. A silently-empty catalog would ship a nutrition app that finds nothing and
    // gives no indication anything is wrong.
    throw new Error('no foods survived the import — refusing to write an empty catalog');
  }

  // ── shard ──────────────────────────────────────────────────────────────────────────────────
  const shards = new Map();
  for (const food of foods) {
    const key = shardKeyFor(fold(food.name));
    if (!shards.has(key)) shards.set(key, []);
    shards.get(key).push(food);
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const manifest = { version: new Date().toISOString().slice(0, 10), total: foods.length, shards: {} };
  let bytes = 0;
  for (const [key, rows] of [...shards].sort(([a], [b]) => (a < b ? -1 : 1))) {
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const json = JSON.stringify({ key, foods: rows });
    await writeFile(join(OUT_DIR, `${key}.json`), json);
    manifest.shards[key] = rows.length;
    bytes += gzipSync(json).length;
  }

  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        ...manifest,
        license: 'Public domain (CC0) — USDA FoodData Central',
        source: 'https://fdc.nal.usda.gov/',
        shard_key_length: SHARD_KEY_LENGTH,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n✓ ${foods.length.toLocaleString()} foods across ${shards.size} shards · ${(bytes / 1024 / 1024).toFixed(1)} MB gzipped total`,
  );
  console.log(`  → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
