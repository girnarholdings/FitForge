'use client';

/**
 * Personal alias learning (docs/RESEARCH-FOOD.md §C2.7 "every correction is written back").
 *
 * When the user corrects what a phrase matched to, the phrase → food id mapping is remembered in
 * localStorage under `fitforge.foodAliases.v1`, so the same words resolve correctly next time.
 * Purely local, no server, and it degrades to a no-op in private mode / on the server.
 */
import { safeSetItem } from '@/lib/storage/safeWrite';

const KEY = 'fitforge.foodAliases.v1';
const MAX_ALIASES = 300;

interface AliasFile {
  version: 1;
  /** folded phrase → food id */
  aliases: Record<string, string>;
}

const EMPTY: AliasFile = { version: 1, aliases: {} };

function read(): AliasFile {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as AliasFile;
    if (parsed?.version === 1 && parsed.aliases && typeof parsed.aliases === 'object') {
      return { version: 1, aliases: { ...parsed.aliases } };
    }
  } catch {
    /* corrupt or unavailable — learning is a nicety, never a hard failure */
  }
  return EMPTY;
}

function write(next: AliasFile): void {
  // Learning is a nicety, but a failing write here still means the browser is out of room — the
  // shared storage-health flag (lib/storage/safeWrite) carries that fact to the one surface
  // that reports it. SSR-safe: safeSetItem is a no-op without a window.
  safeSetItem(KEY, JSON.stringify(next));
}

/** All learned phrase → food id pairs. */
export function learnedAliases(): Record<string, string> {
  return read().aliases;
}

/** The food id this user has previously bound to `phrase`, if any. */
export function learnedFoodId(phrase: string): string | null {
  const key = phrase.trim().toLowerCase();
  if (!key) return null;
  return read().aliases[key] ?? null;
}

/** Remember that `phrase` means `foodId` (called when a confirm row's food is changed). */
export function rememberAlias(phrase: string, foodId: string): void {
  const key = phrase.trim().toLowerCase();
  if (!key || key.length > 60 || !foodId) return;
  const file = read();
  file.aliases[key] = foodId;
  const keys = Object.keys(file.aliases);
  if (keys.length > MAX_ALIASES) {
    for (const k of keys.slice(0, keys.length - MAX_ALIASES)) delete file.aliases[k];
  }
  write(file);
}

export function forgetAlias(phrase: string): void {
  const file = read();
  delete file.aliases[phrase.trim().toLowerCase()];
  write(file);
}

/** Every food id the user has ever bound a phrase to — a free personal-history ranking boost. */
export function learnedFoodIds(): string[] {
  return [...new Set(Object.values(read().aliases))];
}
