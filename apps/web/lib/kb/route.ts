/**
 * §1.3 decision logic — which answering path a query takes.
 *
 *   RED FLAG (pain / injury / medical)  → `disambiguate` + `safety`, ALWAYS, before anything else
 *   conf ≥ 0.55                 → `answer`       serve the KB entry instantly
 *   0.30 ≤ conf < 0.55          → `disambiguate` show the top 3 questions as buttons, no AI call
 *   conf < 0.30                 → `ai`           call the coach with the top 3 as grounding
 *   …or the query carries first-person specifics the KB cannot possibly know, which forces `ai`
 *   REGARDLESS of confidence (a confident generic answer to "my knee hurts when I squat" is
 *   exactly the failure mode this rule exists to prevent).
 *   …or the top hit's evidence is too thin to be trusted (see `weakEvidence`), which discards the
 *   hits entirely so the UI shows its honest no-match state instead of a confident wrong answer.
 *
 * SAFETY ORDERING. The red-flag gate runs FIRST and never resolves to `answer`, so no consumer —
 * including one that knows nothing about `safety` — can serve a curated entry, or fire an AI call,
 * as the response to someone reporting symptoms. The Coach surface reads `safety` and renders a
 * purpose-built card; anything else degrades to a "pick what you meant" list. Both are safe.
 *
 * Pure: takes hits in, returns a decision. `index.ts` binds it to the shipped index.
 */
import { classifyQuery } from './safety';
import type { SafetyFlag } from './safety';
import { tokenize } from './text';
import type { KbHit, KbRoute } from './types';

export const CONF_ANSWER = 0.55;
export const CONF_DISAMBIGUATE = 0.3;

/**
 * Near-exact match. Above this the user has essentially typed a curated question verbatim, so the
 * curated entry IS the answer and a first-person cue is a false positive — several curated
 * questions legitimately contain "my knees" / "my program" / "my routine", and routing those to
 * the AI denied the user the very entry written for them. Below it cues still win (e.g. "my knee
 * hurts when I squat" scores ~0.44 and must stay personal).
 */
export const CONF_EXACT = 0.85;

/** How many entries are shown for disambiguation / attached to an AI call as grounding. */
export const TOP_N = 3;

/**
 * First-person cues (§1.3). Each is a named probe so the UI can explain WHY it went to the AI
 * and so the harness can assert on them.
 */
export const FIRST_PERSON_CUES: { name: string; test: (q: string) => boolean }[] = [
  {
    // §1.3's `my (knee|shoulder|back|routine)`, widened to the adjacent joints and plan words.
    // Deliberately NOT widened to `my form` / `my body` / `my diet` — those read as generic
    // questions the KB answers perfectly well, and sending them to the AI would be a regression.
    name: 'personal body part or plan',
    test: (q) =>
      /\bmy\s+(knee|knees|shoulder|shoulders|back|elbow|elbows|wrist|wrists|hip|hips|ankle|ankles|neck|spine|routine|program|plan|split|schedule)\b/i.test(
        q,
      ),
  },
  {
    // "I'm 47", "I am 16 years old", "at 62" — age-specific guidance.
    name: 'stated age',
    test: (q) =>
      /\b(?:i\s?a?m|im)\s+\d{1,2}\b/i.test(q) ||
      /\b\d{1,2}\s*(?:years?\s*old|yo|y\/o)\b/i.test(q) ||
      /\bat\s+(?:age\s+)?\d{2}\b/i.test(q),
  },
  {
    // Explicit requests for individual advice.
    name: 'request for individual advice',
    test: (q) =>
      /\b(should i personally|for me specifically|in my case|for my situation|my specific|personali[sz]ed?|tailored to me|given my)\b/i.test(
        q,
      ),
  },
  {
    // Several constraints stacked into one long question — the KB answers one thing at a time.
    name: 'multiple combined constraints',
    test: (q) => {
      const words = q.trim().split(/\s+/).length;
      if (words < 12) return false;
      const markers = [
        /\bonly\b/i,
        /\bwithout\b/i,
        /\bbut\b/i,
        /\bhowever\b/i,
        /\balso\b/i,
        /\bexcept\b/i,
        /\bplus\b/i,
        /\band i\b/i,
        /\bwhile (?:i|also)\b/i,
      ].filter((re) => re.test(q)).length;
      return markers >= 2;
    },
  },
];

/** Which first-person cues a query trips (empty for an ordinary informational question). */
export function firstPersonCues(query: string): string[] {
  return FIRST_PERSON_CUES.filter((c) => c.test(query)).map((c) => c.name);
}

/* --------------------------------------------------------------- spurious-match suppression */

/**
 * Minimum share of the query's own stems the top entry must actually match before a sub-threshold
 * hit is worth showing at all.
 */
export const MIN_COVERAGE = 0.5;

/**
 * Why a top hit was discarded as untrustworthy, or `null` when it stands.
 *
 * Retrieval is lexical, so a query in another language (or plain nonsense) can still land on an
 * entry through one incidental stem — the typo rescue in `search.ts` is happy to map an unknown
 * word onto a same-length vocabulary word, which is how "Wie viel Eiweiß brauche ich pro Tag?"
 * reached "What can I do with only dumbbells?" ("brauche" → "barbell") and was then rendered in
 * full as the answer. Confidence alone did not catch it: the UI showed the entry anyway because a
 * hit existed. So the evidence itself is inspected:
 *
 *   · `typo-rescue-only` — nothing the user actually typed matched; every matched stem was a
 *     fuzzy substitution the index invented. That is a coincidence, not a retrieval.
 *   · `thin-overlap`     — a sub-threshold hit that matched under half of the query's stems.
 *
 * Either way the hits are dropped and the surface falls back to its honest no-match state.
 */
export function weakEvidence(query: string, top: KbHit | null): string | null {
  if (!top) return null;
  const asked = new Set(tokenize(query));
  if (asked.size === 0) return null;

  const matched = top.matched;
  if (matched.length === 0) return 'no-overlap';

  // Stems the user literally typed (post-normalization), as opposed to fuzzy substitutions.
  const native = matched.filter((m) => asked.has(m)).length;
  const coverage = matched.length / asked.size;

  if (native === 0 && asked.size >= 2) return 'typo-rescue-only';
  if (top.conf < CONF_DISAMBIGUATE && coverage < MIN_COVERAGE) return 'thin-overlap';
  return null;
}

/* ------------------------------------------------------------------------------- the router */

/** `routeQuery`'s result: a `KbRoute` plus the two gates this module adds on top of §1.3. */
export interface KbRoutePlus extends KbRoute {
  /** Non-null when the query reports pain, injury or a medical situation (see `safety.ts`). */
  safety: SafetyFlag | null;
  /** Non-null when the top hit was discarded as a spurious match (see `weakEvidence`). */
  guard: string | null;
}

/**
 * Apply the red-flag gate, the spurious-match guard and the §1.3 thresholds, in that order.
 * `hits` must be sorted by score descending (as `searchKb` returns).
 */
export function routeQuery(query: string, hits: KbHit[]): KbRoutePlus {
  const cues = firstPersonCues(query);
  const safety = classifyQuery(query);
  const guard = weakEvidence(query, hits[0] ?? null);

  // A hit whose evidence does not survive inspection is no hit at all — never grounding for an AI
  // call, never a "closest match" card.
  const kept = guard ? [] : hits;
  const top = kept[0] ?? null;
  const conf = top?.conf ?? 0;
  const shortlist = kept.slice(0, TOP_N);

  // ── RED FLAG. Runs before every confidence test, and deliberately cannot resolve to `answer`
  //    or to `ai`: a curated entry must never be served as the response to reported symptoms, and
  //    an urgent medical question must never be handed to a small model for a freeform reply.
  if (safety) {
    return {
      mode: 'disambiguate',
      query,
      hits: shortlist,
      top,
      conf,
      cues,
      safety,
      guard,
      reason:
        safety.level === 'urgent'
          ? 'This sounds like it needs medical attention, not training advice.'
          : 'This describes pain, injury or a medical situation, which the guide must not answer as if it were a training question.',
    };
  }

  // A near-exact hit outranks the cues: the user typed a curated question almost verbatim, so
  // hand them the curated answer instead of an "ask the AI" detour.
  if (cues.length > 0 && conf < CONF_EXACT) {
    return {
      mode: 'ai',
      query,
      hits: shortlist,
      top,
      conf,
      cues,
      safety: null,
      guard,
      reason: `This is specific to you (${cues[0]}), which the guide can't know.`,
    };
  }

  if (conf < CONF_DISAMBIGUATE) {
    return {
      mode: 'ai',
      query,
      hits: shortlist,
      top,
      conf,
      cues,
      safety: null,
      guard,
      reason: guard
        ? 'Nothing in the guide genuinely matches this question.'
        : 'No entry in the guide closely matches this question.',
    };
  }

  if (conf < CONF_ANSWER) {
    return {
      mode: 'disambiguate',
      query,
      hits: shortlist,
      top,
      conf,
      cues,
      safety: null,
      guard,
      reason: 'Several entries match about equally well.',
    };
  }

  return {
    mode: 'answer',
    query,
    hits: shortlist,
    top,
    conf,
    cues,
    safety: null,
    guard,
    reason: 'A guide entry matches this question closely.',
  };
}
