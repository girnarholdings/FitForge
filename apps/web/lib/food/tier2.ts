/**
 * TIER-2 FOOD CATALOG — the long tail, loaded on demand.
 *
 * Tier 1 (`core.json`, 509 curated foods) is in the bundle and answers instantly. Tier 2 is the
 * ~50–60k-row USDA FoodData Central catalog, which is far too large to ship in a bundle a phone
 * has to parse before it can render. It is therefore:
 *
 *   · built at DEPLOY time by `seed/import-usda.mjs` (see that file for the licence and the
 *     rejection rules — nothing in it is invented),
 *   · emitted as static shards under `public/food/<key>.json`, keyed by the first two letters of
 *     the folded food name,
 *   · fetched only when a query actually needs one, and cached in memory for the session.
 *
 * A single shard is tens of kilobytes. Typing "chick" fetches `ch.json` once; every later query
 * starting `ch` is answered from RAM.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * DEGRADING WITHOUT LYING
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * The shards are a BUILD ARTEFACT and are not committed (see `.gitignore`) — the import needs
 * network access to fdc.nal.usda.gov, which CI has and a dev machine may not. So tier 2 can
 * legitimately be absent, and every path here treats that as normal: `available()` reports it,
 * search silently falls back to tier 1, and the UI says which catalog answered rather than
 * pretending the long tail was consulted.
 */
import { withBase } from '@/lib/utils';
import { fold } from './index';
import type { Food } from './types';

export interface Tier2Manifest {
  version: string;
  total: number;
  /** shard key → row count */
  shards: Record<string, number>;
  /**
   * Rows the build deliberately did not ship: `duplicates` covered by another row, `over_cap`
   * dropped to bound shard size. Diagnostic only — nothing in the app branches on it — but it is
   * in the manifest so the cost of those two rules is recorded next to the total they produced.
   * Optional because a manifest written before this field existed is still perfectly valid.
   */
  dropped?: { duplicates: number; over_cap: number };
  license: string;
  source: string;
  shard_key_length: number;
  /**
   * Deepest key length the build emitted. Absent on a manifest written before buckets could be
   * split, which is why `bestShardKey` falls back to `shard_key_length` — an older manifest then
   * behaves exactly as it did before, with every key the same length.
   */
  max_shard_depth?: number;
}

/** Resolved once per session. `null` = checked and genuinely not deployed. */
let manifestPromise: Promise<Tier2Manifest | null> | null = null;
const shardCache = new Map<string, Promise<Food[]>>();

function manifestUrl(): string {
  return withBase('/food/manifest.json');
}

/**
 * Load the manifest, at most once. A 404 is an expected outcome (no tier-2 build), not an error
 * worth surfacing — it just means the app is tier-1 only for this deployment.
 */
export function loadManifest(): Promise<Tier2Manifest | null> {
  if (manifestPromise) return manifestPromise;
  if (typeof fetch === 'undefined') return Promise.resolve(null);
  manifestPromise = fetch(manifestUrl())
    .then((res) => (res.ok ? (res.json() as Promise<Tier2Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/** True when a tier-2 catalog is deployed alongside this build. */
export async function available(): Promise<boolean> {
  return (await loadManifest()) !== null;
}

/** The shard key a folded query falls in — mirrors `shardKeyFor` in the importer exactly. */
export function shardKeyFor(folded: string, keyLength = 2): string {
  const key = folded.replace(/[^a-z0-9]/g, '').slice(0, keyLength);
  return key.length === keyLength ? key : '_';
}

/**
 * The most specific shard that can answer this query, or null if none exists.
 *
 * Shard keys are NOT all the same length. The importer splits over-subscribed buckets deeper —
 * `be` holds beef, beans and beverages, far more than one shard should carry — so the catalog
 * contains `be` alongside `bee`, `beef` and so on. Taking the longest key the manifest actually
 * has means a specific query fetches a small, specific shard, while a two-letter query still
 * lands on the bucket's head shard.
 *
 * Longest-first, because the deeper shard holds the FULL contents of its prefix while the head
 * shard holds only the highest-ranked sample of it; searching the head when a deeper shard exists
 * would quietly miss most of the matches.
 */
export function bestShardKey(folded: string, manifest: Tier2Manifest): string | null {
  const minDepth = manifest.shard_key_length ?? 2;
  const maxDepth = manifest.max_shard_depth ?? minDepth;
  for (let depth = maxDepth; depth >= minDepth; depth -= 1) {
    const key = shardKeyFor(folded, depth);
    if (key in manifest.shards) return key;
  }
  return null;
}

/** A shard row as it travels: fields that are empty or recomputable are omitted by the importer. */
type SlimFood = Omit<Food, 'aliases' | 'serving_name' | 'household_measures'> &
  Partial<Pick<Food, 'aliases' | 'serving_name' | 'household_measures'>>;

/**
 * Put back what `slimFood` in seed/lib/food-shrink.mjs left out.
 *
 * The wire format drops `aliases` (the importer never generates any), `household_measures` when
 * empty, and `serving_name` when it only restates the gram weight — about 59 bytes a row, ~3.4 MB
 * across the catalog, paid on every shard fetch.
 *
 * This is NOT cosmetic tidying. `Food` declares those two as required arrays and `measures.ts`
 * calls `.find` on them without a guard, so a slimmed row reaching the app is a TypeError the
 * moment anyone picks it. The two functions are inverses and have to be changed together.
 */
function hydrateFood(row: SlimFood): Food {
  return {
    ...row,
    aliases: row.aliases ?? [],
    serving_name: row.serving_name ?? `${row.serving_grams} g`,
    household_measures: row.household_measures ?? [],
  };
}

/* ──────────────────────────────────────────────────────────────────── persistent shard cache ── */

const CACHE_PREFIX = 'fitforge-food-';

/**
 * Cache API rather than localStorage, versioned by the catalog build.
 *
 * A shard is up to ~190 kB of JSON and a session touches several, so re-downloading them on every
 * visit is the largest avoidable cost in food search. localStorage is the wrong home: it is
 * SYNCHRONOUS, so every read and write blocks the main thread — precisely the stutter being
 * removed here — and its ~5 MB budget is already shared with the app's own state. The Cache API is
 * async, off-thread, and sized for response bodies.
 *
 * VERSIONING MATTERS MORE THAN THE CACHING. Shard URLs are stable across builds (`be.json` is
 * always `be.json`) while their CONTENTS change every time the catalog is rebuilt, so a plain URL
 * cache would happily serve last month's food data forever. Keying the cache NAME on
 * `manifest.version` means a new build writes into a new cache and the previous one is dropped.
 */
async function shardCacheName(): Promise<string | null> {
  const manifest = await loadManifest();
  return manifest ? `${CACHE_PREFIX}${manifest.version}` : null;
}

/** Drop caches from earlier catalog builds. Fire-and-forget; failing is never fatal. */
async function evictStaleCaches(current: string): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current).map((n) => caches.delete(n)),
    );
  } catch {
    /* Storage pressure or a private-mode restriction. The in-memory cache still works. */
  }
}

let evicted = false;

async function readShard(url: string): Promise<SlimFood[]> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return [];
  return ((await res.json()) as { foods?: SlimFood[] }).foods ?? [];
}

async function fetchShard(key: string): Promise<SlimFood[]> {
  const url = withBase(`/food/${key}.json`);

  // Everything below is an optimisation and never a requirement: an older browser, a private mode
  // or a non-secure origin simply goes to the network.
  if (typeof caches === 'undefined') return readShard(url);

  const name = await shardCacheName();
  if (!name) return [];

  try {
    const cache = await caches.open(name);
    if (!evicted) {
      evicted = true;
      void evictStaleCaches(name);
    }
    const hit = await cache.match(url);
    if (hit) return ((await hit.json()) as { foods?: SlimFood[] }).foods ?? [];

    const res = await fetch(url);
    if (!res.ok) return [];
    // Clone BEFORE reading. A Response body can be consumed once, so storing the original after
    // `.json()` would cache an already-drained response that reads back as empty.
    void cache.put(url, res.clone()).catch(() => {});
    return ((await res.json()) as { foods?: SlimFood[] }).foods ?? [];
  } catch {
    return readShard(url);
  }
}

function loadShard(key: string): Promise<Food[]> {
  // In-memory first: within a session the same shard is consulted on nearly every keystroke, and
  // this skips even the async cache round-trip.
  const cached = shardCache.get(key);
  if (cached) return cached;
  const p = fetchShard(key)
    .then((rows) => rows.map(hydrateFood))
    .catch(() => [] as Food[]);
  shardCache.set(key, p);
  return p;
}

/**
 * Foods from the long tail whose name plausibly matches `query`.
 *
 * Only the shard the query itself falls in is fetched — searching "chick" does not drag in the
 * whole catalog. That is a deliberate limitation and it is why tier 2 supplements tier 1 rather
 * than replacing it: a query that matches a food's SECOND word ("greek yogurt" → "Yogurt, Greek")
 * is answered by the curated tier-1 index, which is fully in RAM and indexes every token.
 */
export async function searchTier2(query: string, limit = 20): Promise<Food[]> {
  const manifest = await loadManifest();
  if (!manifest) return [];

  const folded = fold(query);
  if (folded.length < 2) return [];

  const key = bestShardKey(folded, manifest);
  if (!key) return [];

  const rows = await loadShard(key);
  const hits: { food: Food; score: number }[] = [];
  for (const food of rows) {
    const name = fold(food.name);
    if (name === folded) hits.push({ food, score: 100 });
    else if (name.startsWith(folded)) hits.push({ food, score: 80 - name.length * 0.05 });
    else if (name.includes(folded)) hits.push({ food, score: 50 - name.length * 0.05 });
    if (hits.length > limit * 8) break;
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.food);
}

/** Human label for where a result came from, so the UI never implies more coverage than it has. */
export async function catalogLabel(): Promise<string> {
  const manifest = await loadManifest();
  return manifest
    ? `${manifest.total.toLocaleString()} foods · USDA FoodData Central`
    : '509 curated foods';
}
