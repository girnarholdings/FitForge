/**
 * Knowledge-base types (docs/RESEARCH-KB.md §1).
 *
 * Pure types only — no runtime code, no data imports. Everything downstream (the offline
 * retrieval index, the routing thresholds, the Coach UI and the AI client) is typed from here.
 */

/** The ten curated FAQ categories shipped in `faq.json`. */
export type KbCategory =
  | 'getting-started'
  | 'technique-safety'
  | 'equipment-substitutions'
  | 'progression-plateaus'
  | 'nutrition'
  | 'recovery'
  | 'cardio'
  | 'body-composition'
  | 'demographics'
  | 'app';

/** One curated FAQ entry, exactly as authored in `faq.json`. */
export interface KbEntry {
  id: string;
  category: KbCategory;
  question: string;
  /** Alternate phrasings a user might type. Weighted ×2 in the index. */
  aliases: string[];
  answer: string;
  /** Ids of related entries, surfaced as tappable chips under an answer. */
  followups: string[];
  /** Authoring note: what a personalized (AI) answer should take into account. */
  personalize?: string;
}

/** A scored retrieval result. `conf` is the §1.3 normalized confidence in [0, 1]. */
export interface KbHit {
  entry: KbEntry;
  score: number;
  conf: number;
  /** Query stems that actually matched this entry (for debugging / explainability). */
  matched: string[];
}

/** Per-entry precomputed index data (§1.1). */
export interface KbDoc {
  /** stem → summed field weight (question ×3, alias ×2, answer ×1, category ×1) */
  tokens: Map<string, number>;
  /** stem sequences of the question and every alias, for the contiguous-bigram phrase bonus */
  phrases: string[];
  /** the same sequences joined, for the exact-question / exact-alias bonus */
  exact: Set<string>;
  /** the entry scored against its own question — the denominator for `conf` */
  selfScore: number;
}

/** The whole shipped index. Built once at module load; ~83 entries, so this is trivial. */
export interface KbIndex {
  entries: KbEntry[];
  docs: KbDoc[];
  /** stem → entry indexes (inverted index) */
  inverted: Map<string, number[]>;
  /** stem → log(1 + N / df) */
  idf: Map<string, number>;
  /** vocabulary stems of length ≥ 5, candidates for the edit-distance-1 typo rescue */
  fuzzyVocab: string[];
}

/* ------------------------------------------------------------------------------- routing */

/**
 * §1.3 decision:
 *  - `answer`      conf ≥ 0.55 — serve the KB answer instantly.
 *  - `disambiguate` 0.30 ≤ conf < 0.55 — offer the top 3 questions as buttons. No AI call.
 *  - `ai`          conf < 0.30, or the query carries first-person specifics the KB cannot know.
 */
export type KbRouteMode = 'answer' | 'disambiguate' | 'ai';

export interface KbRoute {
  mode: KbRouteMode;
  query: string;
  /** Top hits (≤ 3). Also the grounding snippets attached to an AI call. */
  hits: KbHit[];
  top: KbHit | null;
  conf: number;
  /** Which first-person cues fired (empty unless they forced the `ai` mode). */
  cues: string[];
  /** Short human-readable reason, used for the honest "why AI?" copy. */
  reason: string;
}

/* ---------------------------------------------------------------------------- AI payload */

/**
 * The training context sent to the Coach worker. Mirrors `workers/coach/src/index.ts`
 * `ChatRequest['profile']` exactly. Deliberately excludes the display name and every other
 * identifying field — the model only needs training context.
 */
export interface CoachProfile {
  goal?: string;
  experience?: string;
  split?: string;
  days_per_week?: number;
  equipment?: string[];
  kcal_target?: number;
  protein_target?: number;
  exclusions?: string[];
  /**
   * Compact diet-plan summary — stance, today's planned meals (name + kcal + protein), day
   * targets. Present only when an AI-Mode diet plan exists; built and clamped (≤600 chars) in
   * `lib/kb/profile.ts` so "what should I eat tonight"-shaped questions ground in THE plan
   * rather than a model's invention. The worker only ever READS this: coach-proposed diet edits
   * are out of v1 scope — the Swap UI is the sole writer of the plan.
   */
  diet?: string;
}

/** One retrieved note attached as grounding. Matches the worker's `snippets` contract. */
export interface CoachSnippet {
  question: string;
  answer: string;
}

export interface CoachHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CoachRequest {
  question: string;
  snippets: CoachSnippet[];
  profile: CoachProfile;
  /**
   * Client-declared intent hint. The worker trusts only 'personalize' and 'meal' — the states the
   * client genuinely knows (which button was pressed) — and classifies everything else itself.
   */
  intent?: 'personalize' | 'meal';
  /**
   * The conversation so far, oldest first — so "why?" and "what about dumbbells?" resolve against
   * what was actually said. Omitted when `lib/coach/history` judges the subject to have changed;
   * the worker clamps and re-validates it regardless.
   */
  history?: CoachHistoryMessage[];
}

/** Never throws to the caller — every failure mode is a value. */
export type CoachResult =
  | { status: 'ok'; answer: string }
  /** NEXT_PUBLIC_AI_ENDPOINT is not configured — the app must stay honest about this. */
  | { status: 'not-configured' }
  | { status: 'timeout' }
  | { status: 'error'; detail: string };
