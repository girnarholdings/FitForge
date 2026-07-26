/**
 * §1.3 decision logic — which of the three answering paths a query takes.
 *
 *   conf ≥ 0.55                 → `answer`       serve the KB entry instantly
 *   0.30 ≤ conf < 0.55          → `disambiguate` show the top 3 questions as buttons, no AI call
 *   conf < 0.30                 → `ai`           call the coach with the top 3 as grounding
 *   …or the query carries first-person specifics the KB cannot possibly know, which forces `ai`
 *   REGARDLESS of confidence (a confident generic answer to "my knee hurts when I squat" is
 *   exactly the failure mode this rule exists to prevent).
 *
 * Pure: takes hits in, returns a decision. `index.ts` binds it to the shipped index.
 */
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

/**
 * Apply the §1.3 thresholds. `hits` must be sorted by score descending (as `searchKb` returns).
 */
export function routeQuery(query: string, hits: KbHit[]): KbRoute {
  const top = hits[0] ?? null;
  const conf = top?.conf ?? 0;
  const cues = firstPersonCues(query);
  const shortlist = hits.slice(0, TOP_N);

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
      reason: 'No entry in the guide closely matches this question.',
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
    reason: 'A guide entry matches this question closely.',
  };
}
