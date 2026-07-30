'use client';

/**
 * MY FOODS — the user's own catalog entries: home recipes, restaurant specials, packet foods the
 * shared catalogs do not carry, and personal corrections to entries they do.
 *
 * Stored under a `fitforge.*` key on purpose: `exportAllState()` sweeps every such key into the
 * backup bundle, which is also EXACTLY what cloud sync uploads to `users/{uid}`. So a custom food
 * created here survives a backup/restore AND follows a signed-in user to their next device with no
 * schema work — and, pointedly, with NO Firestore rules change: the rules already say "one
 * document per user, owner-only", and these entries live inside that document rather than in a
 * collection of their own. A separate `recipes` collection would have needed new rules, new
 * validation, and a second sync path, to store what fits in the one that exists.
 *
 * Capped and validated like every other user-writable store: localStorage is attacker-writable in
 * the sense that any old build or extension can have scribbled here, so nothing is trusted shape-
 * unseen. The cap also keeps the bundle under the extras byte ceiling — a thousand recipes would
 * otherwise silently knock the whole key out of the backup.
 */
import type { Food } from './types';
import { safeSetItem } from '@/lib/storage/safeWrite';

const KEY = 'fitforge.customFoods.v1';
const MAX_FOODS = 200;

export interface CustomFoodInput {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** what one serving is called, e.g. "1 bowl", "1 slice" — defaults to "1 serving" */
  serving_name?: string;
}

const listeners = new Set<() => void>();
let cache: Food[] | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function clampMacro(v: unknown, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.min(Math.max(0, n), max);
}

/** Repair-don't-throw: one bad row must not cost the user their other 40 recipes. */
function normalize(value: unknown): Food[] {
  if (!Array.isArray(value)) return [];
  const out: Food[] = [];
  for (const row of value) {
    if (out.length >= MAX_FOODS) break;
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? clampName(r.name) : '';
    const per = (typeof r.per_100g === 'object' && r.per_100g !== null ? r.per_100g : {}) as Record<
      string,
      unknown
    >;
    if (!name) continue;
    out.push({
      id:
        typeof r.id === 'string' && r.id.startsWith('my-')
          ? r.id.slice(0, 40)
          : `my-${Math.random().toString(36).slice(2, 10)}`,
      name,
      aliases: [],
      category: 'dish',
      per_100g: {
        kcal: clampMacro(per.kcal, 2000),
        protein_g: clampMacro(per.protein_g, 200),
        carbs_g: clampMacro(per.carbs_g, 200),
        fat_g: clampMacro(per.fat_g, 200),
      },
      serving_name:
        typeof r.serving_name === 'string' && r.serving_name.trim()
          ? r.serving_name.trim().slice(0, 40)
          : '1 serving',
      serving_grams: 100,
      household_measures: [{ name: 'serving', grams: 100 }],
    });
  }
  return out;
}

function load(): Food[] {
  if (cache) return cache;
  if (!isBrowser()) return [];
  try {
    cache = normalize(JSON.parse(window.localStorage.getItem(KEY) ?? '[]'));
  } catch {
    cache = [];
  }
  return cache;
}

function persist(next: Food[]) {
  cache = next.slice(0, MAX_FOODS);
  // A recipe the user just saved is data, not a cache: a write that fails must raise the shared
  // storage-health flag (lib/storage/safeWrite) so the "storage is full" surface tells them.
  // The in-memory copy still works this session either way.
  safeSetItem(KEY, JSON.stringify(cache));
  for (const l of listeners) l();
}

export function listMyFoods(): Food[] {
  return load();
}

export function subscribeMyFoods(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Save (or re-save) a food. Same-name entries REPLACE rather than accumulate: editing your
 * "Mum's dal" three times should leave one dal, not a graveyard of near-duplicates that all
 * match the same search.
 */
/**
 * 80 code POINTS, cut at a word edge where one exists. String.slice counts code units, so a name
 * whose 80th character was an emoji could be cut through the surrogate pair — storing a broken
 * glyph. The sheet's input carries the same limit as maxLength, so in normal use nothing is ever
 * silently amputated; this is the belt for imported/parsed names.
 */
export function clampName(raw: string): string {
  const points = Array.from(raw.trim());
  if (points.length <= 80) return points.join('');
  const cut = points.slice(0, 80).join('');
  const atWord = cut.lastIndexOf(' ');
  return (atWord > 40 ? cut.slice(0, atWord) : cut).trimEnd();
}

export function saveMyFood(input: CustomFoodInput): Food {
  const foods = load();
  const name = clampName(input.name);
  const existing = foods.find((f) => f.name.toLowerCase() === name.toLowerCase());
  const food: Food = {
    id: existing?.id ?? `my-${Date.now().toString(36)}`,
    name,
    aliases: [],
    category: 'dish',
    per_100g: {
      kcal: clampMacro(input.kcal, 2000),
      protein_g: clampMacro(input.protein_g, 200),
      carbs_g: clampMacro(input.carbs_g, 200),
      fat_g: clampMacro(input.fat_g, 200),
    },
    serving_name: input.serving_name?.trim() || '1 serving',
    serving_grams: 100,
    household_measures: [{ name: 'serving', grams: 100 }],
  };
  // Newest first: "the recipe I just made" is the one about to be logged again tomorrow.
  persist([food, ...foods.filter((f) => f.id !== food.id)]);
  return food;
}

export function deleteMyFood(id: string): void {
  persist(load().filter((f) => f.id !== id));
}

/** Substring match over the user's own entries — always searched first, they are THEIR words. */
export function searchMyFoods(query: string, limit = 4): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return load()
    .filter((f) => f.name.toLowerCase().includes(q))
    .slice(0, limit);
}
