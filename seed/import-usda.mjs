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
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { ARRAY_KEYS, streamArrayObjects } from './lib/stream-json.mjs';
import {
  duplicateSignature,
  planShards,
  rankForShard,
  slimFood,
} from './lib/food-shrink.mjs';

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

/**
 * Hard ceiling on rows in any one shard, and therefore on what a single search can cost.
 *
 * A shard is fetched and parsed in full the first time a query lands in it, so the BIGGEST bucket
 * is what "does search feel instant?" actually depends on — the average is irrelevant.
 *
 * MEASURED ON THE REAL CATALOG, not estimated: 46,612 foods over 517 shards, and the largest
 * bucket (`be.json`) sits exactly on this cap at 190 kB raw, so a slimmed row averages ~324 bytes
 * rather than the ~190 this comment previously guessed. 190 kB parses in single-digit milliseconds
 * and travels as ~40 kB gzipped, which is comfortably inside "instant" — so the cap stays at 600.
 * Lowering it to hit a rounder byte figure would delete real foods for no latency a user could
 * perceive.
 *
 * Buckets over the cap keep their highest-ranked rows (see `rankForShard`), which in practice
 * means the generic lab-analysed foods and the shorter, more general names survive and the long
 * tail of near-identical branded rows is what goes. `dropped` in the manifest records how many
 * that was, so the cost of this cap stays visible on every build rather than being inferred.
 */
const MAX_SHARD_ROWS = Number(process.env.FITFORGE_MAX_SHARD_ROWS ?? 600);

/**
 * How many characters a shard key may grow to before rows are dropped instead of split.
 *
 * Six, not four. Four sounds generous until you count how many food names share a long head:
 * "chocolate" is nine characters before it distinguishes anything, and a bucket with no finer key
 * to split on is a bucket that gets truncated instead. Extra depth costs only more and smaller
 * files — Pages serves them as static assets and the client still fetches exactly one — so this is
 * a termination guarantee rather than a budget.
 *
 * It cannot drive drops to zero: names identical past the limit have nothing left to divide on,
 * and that residue is exactly what `dropped.over_cap` in the manifest reports.
 */
const MAX_SHARD_DEPTH = Number(process.env.FITFORGE_MAX_SHARD_DEPTH ?? 6);

/**
 * Rows kept in a SPLIT bucket's own shard, for queries too short to reach the deeper keys.
 *
 * Typing "be" gives the client no third character to key on, so without this the busiest prefixes
 * would answer a two-letter query with nothing at all. 150 highest-ranked rows — generic foods,
 * short names — is the right answer to a deliberately vague query, and costs one small duplicated
 * shard per split bucket rather than a second copy of the whole bucket.
 */
const HEAD_SHARD_ROWS = Number(process.env.FITFORGE_HEAD_SHARD_ROWS ?? 150);

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
  return { zip: tmpZip, dir: tmpDir, files: files.map((f) => join(tmpDir, f)) };
}


/**
 * Download a dataset and stream its rows, cleaning up the multi-GB scratch files afterwards.
 *
 * The cleanup sits in `finally` because the consumer is expected to STOP EARLY: `ingest` breaks
 * out of its loop once the branded cap is reached, which finalises this generator. Without the
 * `finally` an early break would leave a 3.3 GB unpacked tree inside apps/web/public/, which Next
 * copies verbatim into the static export.
 */
async function* streamDataset(url, label, expectedKey) {
  const { zip, dir, files } = await fetchDataset(url, label);
  let rows = 0;
  try {
    for (const file of files) {
      // The EXPECTED key first, and usually only. A miss costs a full pass over the file — the
      // scanner slides to the end looking for a needle that is not there — so blindly probing all
      // four keys against the 3.3 GB branded dump would read it three times to find the array on
      // the third try. The remaining keys stay as a fallback in case FDC renames a property, which
      // is cheap when it never happens and better than importing nothing when it does.
      const keys = [expectedKey, ...ARRAY_KEYS.filter((k) => k !== expectedKey)];
      for (const key of keys) {
        let sawAny = false;
        for await (const row of streamArrayObjects(file, key)) {
          sawAny = true;
          rows += 1;
          yield row;
        }
        if (sawAny) break;
        if (key === expectedKey) {
          console.warn(`  ! ${label}: no "${expectedKey}" array; falling back to other FDC keys`);
        }
      }
    }
  } finally {
    console.log(`${rows.toLocaleString()} rows`);
    await rm(zip, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════ the run ══ */

async function main() {
  const foods = [];
  const seenNames = new Set();
  let duplicates = 0;

  // `for await` so this accepts both the plain arrays the fixture supplies and the async
  // generators the network path supplies. Breaking out of the loop finalises a generator, which
  // is what triggers streamDataset's cleanup of the unpacked scratch tree.
  const ingest = async (rows, source, cap = Infinity) => {
    let kept = 0;
    let rejected = 0;
    for await (const row of rows) {
      if (kept >= cap) break;
      const food = toFood(row, source);
      if (!food) {
        rejected += 1;
        continue;
      }
      // NEAR-duplicates, not just exact name matches. FDC repeats the same product across pack
      // sizes and the same generic item across manufacturers; an exact-name check catches almost
      // none of that, because the repetition arrives as "Cookies, chocolate chip (Brand A)" versus
      // "COOKIES CHOCOLATE CHIP 12 oz (Brand B)". See lib/food-shrink.mjs for what counts as the
      // same food — it takes agreement on BOTH the normalised name and the macros.
      const key = duplicateSignature(food);
      if (seenNames.has(key)) {
        duplicates += 1;
        continue;
      }
      seenNames.add(key);
      // `source` rides along so the shard cap can prefer generic foods over brands. Stripped again
      // before anything is written.
      foods.push({ food, source });
      kept += 1;
    }
    console.log(`  ${source}: kept ${kept.toLocaleString()}, rejected ${rejected.toLocaleString()}`);
  };

  if (fixture) {
    console.log(`· fixture mode: ${fixture}`);
    // Every array, not the first one that matches: the fixture deliberately carries BOTH dataset
    // shapes (nested `nutrient.id` and flat `nutrientId`) and short-circuiting would leave the
    // branded path — the one that supplies 50k of the 60k rows — completely unexercised.
    //
    // Read through the SAME streaming scanner the network path uses, rather than JSON.parse-ing
    // the fixture. The scanner is the piece that was silently broken for the entire life of this
    // importer; a fixture that bypasses it can only ever prove the mapping works, never that the
    // thing which actually failed in CI works.
    await ingest(streamArrayObjects(fixture, 'FoundationFoods'), 'foundation');
    await ingest(streamArrayObjects(fixture, 'SRLegacyFoods'), 'srLegacy');
    await ingest(streamArrayObjects(fixture, 'BrandedFoods'), 'branded');
    await ingest(streamArrayObjects(fixture, 'foods'), 'other');
  } else {
    await ingest(streamDataset(SOURCES.foundation, 'foundation', 'FoundationFoods'), 'foundation');
    await ingest(streamDataset(SOURCES.srLegacy, 'srLegacy', 'SRLegacyFoods'), 'srLegacy');
    await ingest(streamDataset(SOURCES.branded, 'branded', 'BrandedFoods'), 'branded', limit);
  }

  if (foods.length === 0) {
    // FAIL LOUDLY. A silently-empty catalog would ship a nutrition app that finds nothing and
    // gives no indication anything is wrong.
    throw new Error('no foods survived the import — refusing to write an empty catalog');
  }

  // ── shard ──────────────────────────────────────────────────────────────────────────────────
  // Over-full buckets are split DEEPER, not truncated. Food names are nowhere near uniformly
  // distributed over their first two letters — `be` alone draws beef, beans and beverages — and a
  // flat cap at two characters threw away 11,156 real foods on the first build against live data.
  // See planShards.
  const { shards, dropped: capped } = planShards(foods, {
    maxRows: MAX_SHARD_ROWS,
    minDepth: SHARD_KEY_LENGTH,
    maxDepth: MAX_SHARD_DEPTH,
    headRows: HEAD_SHARD_ROWS,
    foldName: fold,
  });

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  let bytes = 0;
  let shipped = 0;
  let largest = { key: null, rows: 0, bytes: 0 };
  const shardCounts = {};

  for (const [key, entries] of [...shards].sort(([a], [b]) => (a < b ? -1 : 1))) {
    // Alphabetical on the wire regardless of how ranking ordered things: the client scans the
    // array in order and shows the first matches, so this is the order the user sees.
    entries.sort((a, b) => a.food.name.localeCompare(b.food.name));

    const rows = entries.map((e) => slimFood(e.food));
    const json = JSON.stringify({ key, foods: rows });
    await writeFile(join(OUT_DIR, `${key}.json`), json);
    shardCounts[key] = rows.length;
    shipped += rows.length;
    const gz = gzipSync(json).length;
    bytes += gz;
    if (json.length > largest.bytes) largest = { key, rows: rows.length, bytes: json.length };
  }

  const manifest = {
    // FULL TIMESTAMP, not just the date. The client names its persistent shard cache after this
    // (see lib/food/tier2.ts), and shard URLs are stable across builds while their contents are
    // not — so anything coarser than "one value per build" means a second deploy on the same day
    // reuses the previous build's cache and serves its food data indefinitely. This repo deploys
    // several times a day, so a date alone defeated the invalidation it existed to provide.
    version: new Date().toISOString(),
    // What was SHIPPED, not what was parsed. `catalogLabel` puts this number in front of the user
    // as "N foods · USDA FoodData Central", and quoting the pre-cap figure would overstate the
    // catalog by everything the shard cap dropped.
    total: shipped,
    // WHAT THIS CATALOG COST. Both of these delete real rows, so they are recorded rather than
    // left to be inferred from a total that looks plausible: `duplicates` is how many rows another
    // row already covered, `over_cap` is how many were dropped purely to bound shard size. If the
    // second ever grows large relative to `total`, the cap is trading away more than it is buying.
    dropped: { duplicates, over_cap: capped },
    shards: shardCounts,
  };

  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        ...manifest,
        license: 'Public domain (CC0) — USDA FoodData Central',
        source: 'https://fdc.nal.usda.gov/',
        shard_key_length: SHARD_KEY_LENGTH,
        max_shard_depth: MAX_SHARD_DEPTH,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n✓ ${shipped.toLocaleString()} foods across ${shards.size} shards · ${(bytes / 1024 / 1024).toFixed(1)} MB gzipped total`,
  );
  console.log(
    `  collapsed ${duplicates.toLocaleString()} duplicate rows · dropped ${capped.toLocaleString()} over the ${MAX_SHARD_ROWS}/shard cap`,
  );
  // The number that decides whether search feels instant: one shard is one fetch and one parse.
  // Printed every run so a distribution change shows up in the build log rather than as a phone
  // that got slower for no visible reason.
  console.log(
    `  largest shard: ${largest.key}.json — ${largest.rows} rows, ${(largest.bytes / 1024).toFixed(0)} kB raw`,
  );
  console.log(`  → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
