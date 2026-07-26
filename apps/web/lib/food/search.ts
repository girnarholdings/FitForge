/**
 * Ranked food search over the tier-1 index (docs/RESEARCH-FOOD.md §B3).
 *
 * Ranking tiers, highest first: exact name → exact alias → name prefix → alias prefix →
 * word prefix → substring → all-tokens-present → fuzzy (edit distance ≤ 1). On top of the match
 * quality sits `prior` (category + hand-set popularity + brevity) and the caller's boosts
 * (foods this user has logged before, or a phrase they have corrected in the past).
 *
 * Everything runs in RAM over 509 foods — a query costs well under a millisecond, so the UI can
 * search on every keystroke with no debounce-shaped lag and the parser can call it per fragment.
 */
import {
  FOODS,
  candidatesForPrefix,
  editDistance,
  exactKeyMatches,
  fold,
  singular,
  tokenize,
  type IndexedFood,
} from './index';
import type { Food, MatchKind, SearchHit } from './types';

export interface SearchOptions {
  limit?: number;
  /** food ids to promote — user history, learned aliases (§B3 `w4·userHistory`) */
  boostIds?: Iterable<string>;
  /** a canonical unit from the parser: foods owning that measure are better answers */
  unitHint?: string | null;
  /** drop hits whose match confidence is below this (parser uses 0.35) */
  minConfidence?: number;
}

/** Match quality per tier, and the 0–1 confidence the confirm screen shows. */
const TIER: Record<MatchKind, { score: number; confidence: number }> = {
  learned: { score: 120, confidence: 1 },
  exact: { score: 100, confidence: 1 },
  'alias-exact': { score: 96, confidence: 1 },
  prefix: { score: 82, confidence: 0.9 },
  'alias-prefix': { score: 76, confidence: 0.85 },
  'word-prefix': { score: 68, confidence: 0.8 },
  substring: { score: 52, confidence: 0.65 },
  tokens: { score: 46, confidence: 0.6 },
  fuzzy: { score: 55, confidence: 0.5 },
};

interface KeyMatch {
  kind: MatchKind;
  score: number;
  confidence: number;
  matchedOn: string;
}

/** Best phrase-level match of `q` against one food's name + aliases. */
function matchKeys(entry: IndexedFood, q: string): KeyMatch | null {
  let best: KeyMatch | null = null;
  const take = (kind: MatchKind, matchedOn: string, penalty = 0) => {
    const tier = TIER[kind];
    const score = tier.score - penalty;
    if (!best || score > best.score) {
      best = { kind, score, confidence: tier.confidence, matchedOn };
    }
  };

  for (const key of entry.keys) {
    if (key.text === q) {
      take(key.alias ? 'alias-exact' : 'exact', key.text);
      continue;
    }
    if (key.text.startsWith(q)) {
      // "chicken breast" against "chicken breast, grilled…" — the shorter the tail, the better.
      const tail = key.text.length - q.length;
      take(key.alias ? 'alias-prefix' : 'prefix', key.text, Math.min(8, tail / 6));
      continue;
    }
    const words = key.text.split(' ');
    if (words.some((w) => w.startsWith(q))) {
      take('word-prefix', key.text, key.alias ? 6 : 0);
      continue;
    }
    if (key.text.includes(q)) {
      take('substring', key.text, key.alias ? 6 : 0);
    }
  }
  return best;
}

/** All query tokens present as token-prefixes → a real, if weaker, match ("grilled chicken"). */
function matchTokens(entry: IndexedFood, queryTokens: string[]): KeyMatch | null {
  if (queryTokens.length === 0) return null;
  let hit = 0;
  for (const qt of queryTokens) {
    if (entry.tokens.some((t) => t.startsWith(qt) || qt.startsWith(t))) hit++;
  }
  if (hit === 0) return null;
  const coverage = hit / queryTokens.length;
  if (coverage < 0.5) return null;
  const base = TIER.tokens;
  return {
    kind: 'tokens',
    score: base.score * coverage + (coverage === 1 ? 14 : 0),
    confidence: base.confidence * coverage + (coverage === 1 ? 0.2 : 0),
    matchedOn: entry.food.name,
  };
}

/** Single-token typo tolerance ("chickn", "brocolli"). */
function matchFuzzy(entry: IndexedFood, queryTokens: string[]): KeyMatch | null {
  if (queryTokens.length !== 1) return null;
  const q = queryTokens[0] as string;
  if (q.length < 4) return null;
  for (const t of entry.tokens) {
    if (Math.abs(t.length - q.length) <= 1 && editDistance(t, q, 1) <= 1) {
      return { ...TIER.fuzzy, kind: 'fuzzy', matchedOn: entry.food.name };
    }
  }
  return null;
}

/**
 * Search the catalog. Returns hits sorted by score, each carrying a 0–1 `confidence` that the
 * parser folds into its per-item confidence.
 */
export function searchFoods(query: string, opts: SearchOptions = {}): SearchHit[] {
  const limit = opts.limit ?? 8;
  const q = fold(query);
  if (q.length === 0) return [];

  const queryTokens = tokenize(q);
  const boost = new Set(opts.boostIds ?? []);

  // Candidate generation: every food sharing a token prefix with any query token, plus the
  // exact-key hits (which can come from an alias whose tokens were all stopwords).
  const candidates = new Set<number>(exactKeyMatches(q));
  for (const t of queryTokens) {
    for (const idx of candidatesForPrefix(t)) candidates.add(idx);
    // typo tolerance widens the net by one leading character
    if (t.length >= 4) for (const idx of candidatesForPrefix(t.slice(0, t.length - 1))) candidates.add(idx);
  }
  if (candidates.size === 0) {
    for (const idx of candidatesForPrefix(q.slice(0, 3))) candidates.add(idx);
  }

  const hits: SearchHit[] = [];
  for (const idx of candidates) {
    const entry = FOODS[idx];
    if (!entry) continue;

    const phrase = matchKeys(entry, q);
    const tokens = matchTokens(entry, queryTokens);
    // Fuzzy is scored alongside the others: an edit-distance-1 hit on the whole word
    // ('chickn' → chicken) beats a coincidental short-token prefix ('chick fil a').
    const fuzzy = matchFuzzy(entry, queryTokens);
    const best = [phrase, tokens, fuzzy]
      .filter((m): m is KeyMatch => m != null)
      .sort((a, b) => b.score - a.score)[0];
    if (!best) continue;

    let score = best.score + entry.prior;
    if (boost.has(entry.food.id)) score += 14;
    if (opts.unitHint && entry.measureWords.has(singular(fold(opts.unitHint)))) score += 7;

    const confidence = Math.min(1, best.confidence + (boost.has(entry.food.id) ? 0.1 : 0));
    if (opts.minConfidence != null && confidence < opts.minConfidence) continue;

    hits.push({ food: entry.food, score, confidence, kind: best.kind, matchedOn: best.matchedOn });
  }

  hits.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return hits.slice(0, limit);
}

/** Convenience: the single best match, or null. */
export function bestMatch(query: string, opts: SearchOptions = {}): SearchHit | null {
  return searchFoods(query, { ...opts, limit: 1 })[0] ?? null;
}

/** A short, sensible starter list for an empty search box. */
export function popularFoods(limit = 8): Food[] {
  return [...FOODS]
    .sort((a, b) => b.prior - a.prior || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((f) => f.food);
}
