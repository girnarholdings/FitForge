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
  license: string;
  source: string;
  shard_key_length: number;
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

function loadShard(key: string): Promise<Food[]> {
  const cached = shardCache.get(key);
  if (cached) return cached;
  const p = fetch(withBase(`/food/${key}.json`))
    .then((res) => (res.ok ? res.json() : { foods: [] }))
    .then((data: { foods?: Food[] }) => data.foods ?? [])
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

  const key = shardKeyFor(folded, manifest.shard_key_length);
  if (!(key in manifest.shards)) return [];

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
