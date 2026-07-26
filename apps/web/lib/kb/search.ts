/**
 * Offline KB retrieval — the exact strategy in docs/RESEARCH-KB.md §1.1–§1.2.
 *
 * Weighted token bag + inverted index + IDF, with a contiguous-bigram phrase bonus, a flat
 * exact-question/alias bonus, a sqrt length penalty, and an edit-distance-1 typo rescue.
 * No embeddings, no network, no dependencies — everything runs in the browser on 83 entries.
 *
 * This module is DATA-FREE on purpose (it never imports `faq.json`), so it can be exercised by a
 * plain node harness and so `index.ts` owns the single module-scope index build.
 */
import type { KbDoc, KbEntry, KbHit, KbIndex } from './types';
import { editDistanceAtMostOne, tokenize } from './text';

/** Field weights from §1.1: question ×3, each alias ×2, answer ×1, category ×1. */
const W_QUESTION = 3;
const W_ALIAS = 2;
const W_ANSWER = 1;
const W_CATEGORY = 1;

/** §1.2 scoring constants. */
const PHRASE_MULTIPLIER = 1.5;
const EXACT_BONUS = 5;
/** Only vocabulary stems at least this long are typo-rescue candidates (§1.2). */
const FUZZY_MIN_LEN = 5;

function addTokens(bag: Map<string, number>, text: string, weight: number): string[] {
  const stems = tokenize(text);
  for (const s of stems) bag.set(s, (bag.get(s) ?? 0) + weight);
  return stems;
}

/**
 * Build the shipped index. O(entries × tokens); for 83 entries this is well under a millisecond,
 * so it runs at module load rather than being precomputed into a JSON artifact.
 */
export function buildKbIndex(entries: KbEntry[]): KbIndex {
  const docs: KbDoc[] = [];
  const inverted = new Map<string, number[]>();

  entries.forEach((entry, i) => {
    const tokens = new Map<string, number>();
    const phrases: string[] = [];
    const exact = new Set<string>();

    const qStems = addTokens(tokens, entry.question, W_QUESTION);
    phrases.push(qStems.join(' '));
    exact.add(qStems.join(' '));

    for (const alias of entry.aliases) {
      const aStems = addTokens(tokens, alias, W_ALIAS);
      phrases.push(aStems.join(' '));
      exact.add(aStems.join(' '));
    }

    addTokens(tokens, entry.answer, W_ANSWER);
    addTokens(tokens, entry.category.replace(/-/g, ' '), W_CATEGORY);

    for (const stem of tokens.keys()) {
      const list = inverted.get(stem);
      if (list) list.push(i);
      else inverted.set(stem, [i]);
    }

    docs.push({ tokens, phrases, exact, selfScore: 1 });
  });

  const n = entries.length;
  const idf = new Map<string, number>();
  for (const [stem, postings] of inverted) {
    idf.set(stem, Math.log(1 + n / postings.length));
  }

  const fuzzyVocab = [...inverted.keys()].filter((s) => s.length >= FUZZY_MIN_LEN);

  const index: KbIndex = { entries, docs, inverted, idf, fuzzyVocab };

  // §1.3: conf = topScore / selfScore, where selfScore is the entry scored against its OWN
  // question through the identical scoring function (so an exact question match scores 1.0).
  entries.forEach((entry, i) => {
    const doc = docs[i];
    if (!doc) return;
    doc.selfScore = Math.max(1e-6, scoreEntry(index, i, prepareQuery(index, entry.question)).score);
  });

  return index;
}

interface PreparedQuery {
  /** Ordered stems after the typo rescue (order matters for the bigram phrase bonus). */
  stems: string[];
  /** Distinct stems — the length penalty divisor. */
  unique: string[];
  /** Contiguous 2-grams of `stems`. */
  bigrams: string[];
  /** `stems.join(' ')` — compared against each entry's exact question/alias sequences. */
  joined: string[];
}

/**
 * Tokenize a query and apply the §1.2 fuzzy assist: any stem that is absent from the vocabulary
 * is retried against vocabulary stems of length ≥ 5 at edit distance 1 (`protien`, `platue`,
 * `sorness`). The most common matching vocabulary stem wins.
 */
export function prepareQuery(index: KbIndex, query: string): PreparedQuery {
  const stems = tokenize(query).map((s) => {
    if (index.inverted.has(s)) return s;
    if (s.length < 4) return s;
    let best: string | null = null;
    let bestDf = 0;
    for (const cand of index.fuzzyVocab) {
      if (Math.abs(cand.length - s.length) > 1) continue;
      if (!editDistanceAtMostOne(s, cand)) continue;
      const df = index.inverted.get(cand)?.length ?? 0;
      if (df > bestDf) {
        best = cand;
        bestDf = df;
      }
    }
    return best ?? s;
  });

  const bigrams: string[] = [];
  for (let i = 0; i + 1 < stems.length; i += 1) bigrams.push(`${stems[i]} ${stems[i + 1]}`);

  return {
    stems,
    unique: [...new Set(stems)],
    bigrams,
    joined: [stems.join(' ')],
  };
}

function scoreEntry(
  index: KbIndex,
  entryIdx: number,
  q: PreparedQuery,
): { score: number; matched: string[] } {
  const doc = index.docs[entryIdx];
  if (!doc) return { score: 0, matched: [] };

  let sum = 0;
  const matched: string[] = [];
  for (const stem of q.unique) {
    const weight = doc.tokens.get(stem);
    if (!weight) continue;
    sum += (index.idf.get(stem) ?? 0) * weight;
    matched.push(stem);
  }
  if (sum === 0) return { score: 0, matched };

  // Phrase bonus — a 2+ word bigram from the query appearing contiguously in the question or
  // any alias is strong evidence the user is asking THIS question, not a topically related one.
  const hasPhrase = q.bigrams.some((bg) =>
    doc.phrases.some((p) => p === bg || ` ${p} `.includes(` ${bg} `)),
  );
  let score = hasPhrase ? sum * PHRASE_MULTIPLIER : sum;

  // Exact question / alias match.
  if (q.joined.some((j) => j.length > 0 && doc.exact.has(j))) score += EXACT_BONUS;

  // Length penalty — long rambling queries accumulate matches, so normalize by √(unique stems).
  return { score: score / Math.sqrt(Math.max(1, q.unique.length)), matched };
}

/**
 * Rank the KB against a free-text query. Returns hits sorted by score descending, each carrying
 * the §1.3 normalized confidence.
 */
export function searchIndex(index: KbIndex, query: string, limit = 8): KbHit[] {
  const q = prepareQuery(index, query);
  if (q.stems.length === 0) return [];

  // Candidate set from the inverted index — never score all 83 entries for a 2-word query.
  const candidates = new Set<number>();
  for (const stem of q.unique) {
    for (const i of index.inverted.get(stem) ?? []) candidates.add(i);
  }

  const hits: KbHit[] = [];
  for (const i of candidates) {
    const entry = index.entries[i];
    const doc = index.docs[i];
    if (!entry || !doc) continue;
    const { score, matched } = scoreEntry(index, i, q);
    if (score <= 0) continue;
    hits.push({
      entry,
      score,
      conf: Math.min(1, score / doc.selfScore),
      matched,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  return hits.slice(0, limit);
}

/**
 * Substring/stem search used by the wiki BROWSE mode — cheaper and more literal than
 * {@link searchIndex} (a browsing user is filtering a list, not asking a question).
 */
export function filterEntries(entries: KbEntry[], query: string): KbEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const stems = tokenize(q);
  return entries.filter((e) => {
    const hay = `${e.question} ${e.aliases.join(' ')} ${e.answer}`.toLowerCase();
    if (hay.includes(q)) return true;
    if (stems.length === 0) return false;
    const bag = new Set(tokenize(hay));
    return stems.every((s) => bag.has(s));
  });
}
