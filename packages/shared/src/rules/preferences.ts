/**
 * EXERCISE PREFERENCES — the liked/disliked model, and everything the plan derives from it.
 *
 * Spec + citations: `docs/RESEARCH-PREFERENCES.md`. This module owns FIVE things and nothing else,
 * so the one place a reviewer has to look to check the guardrail is this file:
 *
 *   1. the sex-leaning LIKED default sets, and the neutral fallback,
 *   2. LIKED → split scoring (`likedSplitBonus`, consumed by `recommendSplits`),
 *   3. LIKED → selection weighting (`likedSelectionBonus`, consumed by the generator),
 *   4. DISLIKED → an EASIER SAME-PATTERN substitution (`substituteDisliked`), and
 *   5. the sex-aware rest/rep adjustment (`sexAdjustedPrescription`).
 *
 * ─── THE GUARDRAIL, IN CODE ──────────────────────────────────────────────────────────────────
 * A sex default is a PRE-FILL, NEVER A FILTER. There is deliberately no function in this file
 * that takes a sex and returns a *subset of the catalog*; the only sex-shaped output is an ORDERED
 * LIST OF SLUGS to seed a list the user is about to edit. `selectablePreferenceCatalog` exists so
 * the property is testable rather than merely asserted in prose: it takes no sex at all, and the
 * suite proves every one of the catalog's exercises is reachable for every `SexType`.
 *
 * ─── WHY DISLIKED IS NOT AN EXCLUSION ────────────────────────────────────────────────────────
 * The app already has a real exclusion step ("anything we should protect?"), and that one REMOVES
 * work. "I don't like this" is a different sentence, and frequently means "I cannot do this well
 * yet" — so the movement is down-ranked and swapped for a LOWER-DIFFICULTY option that trains the
 * same pattern and muscles. The muscle/pattern coverage survives; only the specific lift changes.
 * When the catalog has nothing suitable the ORIGINAL STAYS and the caller is told, because a
 * silent hole in someone's plan is worse than an exercise they grumble about.
 *
 * ─── EVIDENCE TIERS (same convention as `volumeMath` / RESEARCH-VOLUME.md) ────────────────────
 *   A — women recover more between sets, less fatigable at matched relative intensity  → §4
 *   B — population tendencies in body-part preference by sex                           → §3
 *   C — which specific five exercises to pre-fill                                      → §5
 * Only tier A is allowed to change the PLAN's numbers. Tiers B/C only order a list the user edits.
 */
import type { MovementPattern, SexType, DifficultyLevel } from '../types/database.js';
import type { CatalogExercise, SubstitutionEdge, SubstitutionContext } from './substitution.js';
import { suggestSubstitutes } from './substitution.js';

/** How many exercises each preference list holds. Both lists, same cap. */
export const PREFERENCE_LIST_SIZE = 5;

const DIFFICULTY_ORDER: Record<DifficultyLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

/* ══════════════════════════════════════════════════════════ 1 · the pre-fill (tiers B and C) */

/** Which default set produced a pre-fill. Recorded so the screen can say where it came from. */
export type PreferenceSource = 'male_leaning' | 'female_leaning' | 'neutral';

/**
 * The sex-leaning LIKED sets (RESEARCH-PREFERENCES §5). Slugs, in rank order.
 *
 * The female set is POSTERIOR CHAIN — which INCLUDES BACK — not "legs and glutes". That is the one
 * correction the research made to the original brief: the documented tendency is posterior-chain
 * emphasis, and a five-item list with no pulling in it would under-serve the very pattern it was
 * meant to reflect. Hence `lat-pulldown` alongside the hip thrust and the RDL.
 *
 * Tier C: our judgement about which five, drawn from the catalog's highest-popularity movements in
 * the areas each group tends to prioritise. Editable by design.
 */
export const SEX_LIKED_DEFAULT_SLUGS: Readonly<Record<'male' | 'female', readonly string[]>> = {
  male: [
    'bench-press',
    'lat-pulldown',
    'barbell-back-squat',
    'seated-cable-row',
    'seated-dumbbell-shoulder-press',
  ],
  female: [
    'barbell-hip-thrust',
    'romanian-deadlift',
    'goblet-squat',
    'lat-pulldown',
    'walking-lunge',
  ],
};

/**
 * The neutral set is built from PATTERN COVERAGE rather than a body-part bias: the most popular
 * compound in each of squat / hinge / push / pull / carry. `prefer_not_to_say` and `other` are real
 * answers, not missing data, and must not be resolved by a coin flip between the two leaning sets.
 */
export const NEUTRAL_PATTERN_GROUPS: readonly {
  key: string;
  patterns: readonly MovementPattern[];
}[] = [
  { key: 'squat', patterns: ['squat'] },
  { key: 'hinge', patterns: ['hinge'] },
  { key: 'push', patterns: ['horizontal_push', 'vertical_push'] },
  { key: 'pull', patterns: ['vertical_pull', 'horizontal_pull'] },
  { key: 'carry', patterns: ['carry'] },
];

function activeOnly(catalog: readonly CatalogExercise[]): readonly CatalogExercise[] {
  return catalog.filter((e) => e.is_active !== false);
}

/**
 * The catalog a preference picker may browse. Takes NO sex — that is the whole point. Retired rows
 * (`is_active === false`) are the only thing ever removed, and that is a data-quality filter, not a
 * demographic one.
 */
export function selectablePreferenceCatalog(
  catalog: readonly CatalogExercise[],
): readonly CatalogExercise[] {
  return activeOnly(catalog);
}

/**
 * The five highest-popularity COMPOUNDS spanning squat / hinge / push / pull / carry.
 *
 * Computed from the catalog rather than hardcoded so the claim "highest popularity" stays TRUE as
 * the catalog grows. Ties break toward the EASIER movement (a neutral default should not open with
 * an advanced lift), then alphabetically so the result is deterministic.
 */
export function neutralLikedDefaults(catalog: readonly CatalogExercise[]): string[] {
  const pool = activeOnly(catalog);
  const out: string[] = [];
  for (const group of NEUTRAL_PATTERN_GROUPS) {
    const best = pool
      .filter(
        (e) =>
          e.mechanics === 'compound' &&
          group.patterns.includes(e.movement_pattern) &&
          !out.includes(e.slug),
      )
      .sort(
        (a, b) =>
          b.popularity - a.popularity ||
          DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
          a.slug.localeCompare(b.slug),
      )[0];
    if (best) out.push(best.slug);
  }
  return out.slice(0, PREFERENCE_LIST_SIZE);
}

/** Which default set a sex maps to. `null`, `other` and `prefer_not_to_say` all get neutral. */
export function preferenceSourceForSex(sex: SexType | null | undefined): PreferenceSource {
  if (sex === 'male') return 'male_leaning';
  if (sex === 'female') return 'female_leaning';
  return 'neutral';
}

/**
 * The DISLIKED pre-fill. Empty for everyone, permanently, and this function exists so that fact is
 * a documented decision rather than an omission someone later "fixes".
 *
 * Suggesting what somebody hates puts words in their mouth, and — unlike a liked suggestion, which
 * only reorders what they already get — it actively REMOVES work from their plan. That asymmetry is
 * the whole argument.
 */
export function dislikedDefaults(): string[] {
  return [];
}

export interface PreferencePrefill {
  /** ranked slugs, best-guess first; index 0 is rank 1 */
  liked: string[];
  /** always empty — see `dislikedDefaults` */
  disliked: string[];
  source: PreferenceSource;
  /** the sentence the screen shows so the suggestion never reads as a rule */
  note: string;
  /** evidence tier for the LIKED list (RESEARCH-PREFERENCES §4) */
  tier: 'C';
}

const SOURCE_NOTES: Record<PreferenceSource, string> = {
  male_leaning:
    'A starting suggestion, from what men most often say they train in gym-goer surveys. It is a guess about averages, not about you — reorder it, or swap any of the five for anything in the catalogue.',
  female_leaning:
    'A starting suggestion, from what women most often say they train in gym-goer surveys — posterior chain, which includes back as well as glutes and hamstrings. It is a guess about averages, not about you — reorder it, or swap any of the five for anything in the catalogue.',
  neutral:
    'A starting suggestion built for coverage, not for a body type: the most popular compound lift in each of squat, hinge, push, pull and carry. Reorder it, or swap any of the five for anything in the catalogue.',
};

/**
 * Seed both preference lists for a sex.
 *
 * A leaning set is filtered against the catalog (a slug that no longer exists is dropped rather
 * than rendered as a dead chip) and topped up from the neutral set if that leaves it short, so the
 * user always opens the screen with five real suggestions.
 */
export function preferencePrefill(
  sex: SexType | null | undefined,
  catalog: readonly CatalogExercise[],
): PreferencePrefill {
  const source = preferenceSourceForSex(sex);
  const known = new Set(activeOnly(catalog).map((e) => e.slug));

  const seed =
    source === 'male_leaning'
      ? SEX_LIKED_DEFAULT_SLUGS.male
      : source === 'female_leaning'
        ? SEX_LIKED_DEFAULT_SLUGS.female
        : [];

  const liked = seed.filter((slug) => known.has(slug));
  for (const slug of neutralLikedDefaults(catalog)) {
    if (liked.length >= PREFERENCE_LIST_SIZE) break;
    if (!liked.includes(slug)) liked.push(slug);
  }

  return {
    liked: liked.slice(0, PREFERENCE_LIST_SIZE),
    disliked: dislikedDefaults(),
    source,
    note: SOURCE_NOTES[source],
    tier: 'C',
  };
}

/* ══════════════════════════════════════════════════════════════════ 2 · ranking weights */

/**
 * Rank weights for a five-long ranked list. Rank 1 counts five times what rank 5 does, which is the
 * only reason to ask for a RANKED list rather than a set.
 */
export const RANK_WEIGHTS: readonly number[] = [5, 4, 3, 2, 1];
const RANK_WEIGHT_TOTAL = RANK_WEIGHTS.reduce((a, b) => a + b, 0);

/** Weight of `slug` in a ranked list — 0 when absent, `RANK_WEIGHTS[0]` when it is the top pick. */
export function rankWeight(slug: string, ranked: readonly string[]): number {
  const i = ranked.indexOf(slug);
  if (i < 0) return 0;
  return RANK_WEIGHTS[i] ?? 1;
}

/**
 * The selection bonus a LIKED exercise earns, scaled by its rank: the #1 pick gets the full
 * `base`, the #5 pick gets a fifth of it. The generator passes its own `W_FAVORITE` as `base` so
 * the relative ordering of ITS weights stays that file's business.
 */
export function likedSelectionBonus(
  slug: string,
  liked: readonly string[],
  base: number,
): number {
  const w = rankWeight(slug, liked);
  return w === 0 ? 0 : (base * w) / RANK_WEIGHTS[0]!;
}

/**
 * The selection PENALTY a DISLIKED exercise earns, scaled by rank the same way.
 *
 * Deliberately a penalty and not a ban: it sinks the movement below every alternative for its slot
 * while leaving it selectable, so a pattern whose only feasible option is disliked still gets
 * trained rather than silently dropped.
 */
export function dislikedSelectionPenalty(
  slug: string,
  disliked: readonly string[],
  base: number,
): number {
  const w = rankWeight(slug, disliked);
  return w === 0 ? 0 : (base * w) / RANK_WEIGHTS[0]!;
}

/* ══════════════════════════════════════════════════════════ 3 · LIKED → split scoring */

/** The shape `likedSplitBonus` needs from a split. Structural on purpose: no import from splits.ts,
 *  so `splits.ts` can depend on this module without a cycle. */
export interface SplitShape {
  days: readonly {
    slots: readonly { pattern: MovementPattern; alt?: readonly MovementPattern[] }[];
  }[];
}

/**
 * Ceiling for the liked-exercise bonus in `recommendSplits`.
 *
 * DELIBERATELY BELOW the primary-goal weight (15), the experience-level match (18) and far below
 * days/week (40 + 8). Enjoying an exercise is a real signal and it should break ties between two
 * otherwise-comparable programs — but it must never talk a 3-day beginner into a 6-day advanced
 * split because one bench variation appears in it.
 */
export const LIKED_SPLIT_MAX_BONUS = 12;

/**
 * How concentrated a pattern has to be in a split before a liked exercise earns FULL credit for it.
 * 1/6 of the split's slots ⇒ full credit. Without this every split scores the same, because almost
 * every program contains a squat, a push and a pull somewhere — the useful question is not "does
 * this program touch the thing I like" but "how much of it is the thing I like".
 */
const PATTERN_SHARE_SCALE = 6;

export interface LikedSplitScore {
  /** 0 … `LIKED_SPLIT_MAX_BONUS` */
  bonus: number;
  /** liked slugs whose pattern this split actually trains, best-ranked first */
  matched: string[];
  /** a chip-length reason, or null when nothing matched */
  reason: string | null;
}

/**
 * Score a split against the user's ranked LIKED list, by movement pattern.
 *
 * Patterns, not slugs, because a split template names ROLE SLOTS — it does not name exercises, and
 * pretending otherwise would mean scoring on a promise the generator has not made yet.
 */
export function likedSplitBonus(
  split: SplitShape,
  liked: readonly string[],
  catalog: readonly CatalogExercise[],
): LikedSplitScore {
  if (liked.length === 0 || split.days.length === 0) {
    return { bonus: 0, matched: [], reason: null };
  }
  const bySlug = new Map(catalog.map((e) => [e.slug, e] as const));

  // Share of the split's slots that can be filled by each pattern (alt patterns count).
  const slotCount = new Map<MovementPattern, number>();
  let totalSlots = 0;
  for (const day of split.days) {
    for (const slot of day.slots) {
      totalSlots++;
      const patterns = new Set<MovementPattern>([slot.pattern, ...(slot.alt ?? [])]);
      for (const p of patterns) slotCount.set(p, (slotCount.get(p) ?? 0) + 1);
    }
  }
  if (totalSlots === 0) return { bonus: 0, matched: [], reason: null };

  let credit = 0;
  let possible = 0;
  const matched: string[] = [];

  liked.forEach((slug, i) => {
    const w = RANK_WEIGHTS[i] ?? 1;
    possible += w;
    const ex = bySlug.get(slug);
    if (!ex) return; // unknown slug contributes nothing but still counts against `possible`
    const share = (slotCount.get(ex.movement_pattern) ?? 0) / totalSlots;
    if (share <= 0) return;
    matched.push(slug);
    credit += w * Math.min(1, share * PATTERN_SHARE_SCALE);
  });

  if (possible === 0 || credit === 0) return { bonus: 0, matched, reason: null };
  const bonus = Number(((LIKED_SPLIT_MAX_BONUS * credit) / possible).toFixed(2));
  return {
    bonus,
    matched,
    reason: matched.length > 0 ? 'Built around movements you like' : null,
  };
}

/** Exported for tests / callers that want the same normalisation without a split. */
export const RANK_WEIGHT_SUM = RANK_WEIGHT_TOTAL;

/* ═════════════════════════════════════════════════ 4 · DISLIKED → easier same-pattern swap */

export interface DislikeContext extends SubstitutionContext {
  /** every disliked slug — a replacement must never be another thing they said they dislike */
  disliked: ReadonlySet<string>;
}

/** Why a replacement was (or was not) made — the string the plan is allowed to show the user. */
export type DislikeOutcome =
  /** found something strictly easier that trains the same pattern */
  | 'easier_same_pattern'
  /** same pattern, same difficulty — nothing easier exists, but at least it is a different lift */
  | 'same_pattern'
  /** different pattern, but it still trains the muscles the disliked lift trained */
  | 'same_muscles'
  /** nothing suitable: the ORIGINAL STAYS, and the caller must say so */
  | 'kept_original';

export interface DislikeSubstitution {
  /** the disliked slug */
  from: string;
  fromName: string;
  /** the replacement slug, or `null` when the original has to stay */
  to: string | null;
  toName: string | null;
  outcome: DislikeOutcome;
  /** true only when `to` is STRICTLY lower difficulty than `from` */
  easier: boolean;
  /** the pattern that must remain covered either way */
  pattern: MovementPattern | null;
  /** the primary muscles that must remain covered either way */
  primaryMuscles: readonly string[];
  reason: string;
}

const KEPT_ORIGINAL_REASON =
  'We could not find an easier movement that trains the same thing, so this one stays — dropping it would leave a hole in your week.';

/**
 * Patterns that are NOT resistance training.
 *
 * The catalog carries warm-up, mobility and stretching rows alongside the lifts, and they list real
 * `primary_muscles` — `standing-hamstring-stretch` claims `hamstrings`, `childs-pose` claims `lats`.
 * That is correct data for a warm-up picker and a trap for this one: every stretch is `beginner`
 * difficulty, and the ladder below sorts EASIEST FIRST, so without this guard a stretch beats every
 * real lift and "an easier hinge" resolves to a hamstring stretch. The plan then reads as covered
 * while the muscle is not trained at all — a worse failure than the disliked lift simply staying,
 * because it is invisible.
 */
const NON_STRENGTH_PATTERNS: ReadonlySet<MovementPattern> = new Set([
  'mobility',
  'static_stretch',
  'cardio',
  'conditioning',
] as MovementPattern[]);

/**
 * Can `candidate` stand in for `target`?
 *
 * Only across the same trainability class: a lift may only be replaced by a lift. Disliking a
 * cardio or mobility row is still substitutable within its own class (bike for treadmill), which is
 * why this compares classes rather than banning the patterns outright.
 */
function sameTrainabilityClass(target: CatalogExercise, candidate: CatalogExercise): boolean {
  return (
    NON_STRENGTH_PATTERNS.has(target.movement_pattern) ===
    NON_STRENGTH_PATTERNS.has(candidate.movement_pattern)
  );
}

function notFound(slug: string): DislikeSubstitution {
  return {
    from: slug,
    fromName: slug,
    to: null,
    toName: null,
    outcome: 'kept_original',
    easier: false,
    pattern: null,
    primaryMuscles: [],
    reason: KEPT_ORIGINAL_REASON,
  };
}

/**
 * Find the EASIER, SAME-PATTERN replacement for one disliked exercise.
 *
 * Runs the §7.4 substitution scorer (which already ranks by pattern + muscle overlap, honours
 * equipment and hard exclusions, and penalises anything above the athlete's level) and then walks
 * its results down a three-rung ladder:
 *
 *   1. same movement pattern, STRICTLY lower difficulty, shares a primary muscle  ← what we want
 *   2. same movement pattern, no harder than the original
 *   3. any candidate that still trains one of the original's primary muscles
 *
 * Falling off the bottom returns `outcome: 'kept_original'` with `to: null`. It never returns
 * another disliked exercise, and it never returns something the user excluded (step 2 of §7.4
 * removes those before we see them).
 */
export function substituteDisliked(
  dislikedSlug: string,
  catalog: readonly CatalogExercise[],
  edges: readonly SubstitutionEdge[],
  ctx: DislikeContext,
): DislikeSubstitution {
  const bySlug = new Map(catalog.map((e) => [e.slug, e] as const));
  const target = bySlug.get(dislikedSlug);
  if (!target) return notFound(dislikedSlug);

  const base: Omit<DislikeSubstitution, 'to' | 'toName' | 'outcome' | 'easier' | 'reason'> = {
    from: target.slug,
    fromName: target.name,
    pattern: target.movement_pattern,
    primaryMuscles: target.primary_muscles,
  };

  // Ask for a generous slate: the top-scored substitute is not necessarily the EASIER one, and the
  // whole point here is difficulty, not raw similarity.
  const results = suggestSubstitutes(dislikedSlug, catalog, edges, ctx, 20)
    .map((r) => bySlug.get(r.slug))
    .filter(
      (e): e is CatalogExercise =>
        !!e && !ctx.disliked.has(e.slug) && sameTrainabilityClass(target, e),
    );

  const targetRank = DIFFICULTY_ORDER[target.difficulty];
  const sharesMuscle = (c: CatalogExercise) =>
    c.primary_muscles.some((m) => target.primary_muscles.includes(m));

  // Rung 1 — the ask: easier, same pattern, same muscles. Easiest first, then most popular.
  const easier = results
    .filter(
      (c) =>
        c.movement_pattern === target.movement_pattern &&
        DIFFICULTY_ORDER[c.difficulty] < targetRank &&
        sharesMuscle(c),
    )
    .sort(
      (a, b) =>
        DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
        b.popularity - a.popularity ||
        a.slug.localeCompare(b.slug),
    );
  if (easier[0]) {
    const pick = easier[0];
    return {
      ...base,
      to: pick.slug,
      toName: pick.name,
      outcome: 'easier_same_pattern',
      easier: true,
      reason: `An easier ${labelPattern(target.movement_pattern)} that trains the same muscles as ${target.name}.`,
    };
  }

  // Rung 2 — same pattern, no harder. Different lift, same job, same level.
  const sideways = results
    .filter(
      (c) =>
        c.movement_pattern === target.movement_pattern &&
        DIFFICULTY_ORDER[c.difficulty] <= targetRank,
    )
    .sort((a, b) => b.popularity - a.popularity || a.slug.localeCompare(b.slug));
  if (sideways[0]) {
    const pick = sideways[0];
    return {
      ...base,
      to: pick.slug,
      toName: pick.name,
      outcome: 'same_pattern',
      easier: false,
      reason: `Nothing easier trains this pattern, so we swapped ${target.name} for another ${labelPattern(target.movement_pattern)} at the same level.`,
    };
  }

  // Rung 3 — different pattern, but the muscles still get trained.
  const sameMuscles = results
    .filter((c) => sharesMuscle(c) && DIFFICULTY_ORDER[c.difficulty] <= targetRank)
    .sort(
      (a, b) =>
        DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
        b.popularity - a.popularity ||
        a.slug.localeCompare(b.slug),
    );
  if (sameMuscles[0]) {
    const pick = sameMuscles[0];
    return {
      ...base,
      to: pick.slug,
      toName: pick.name,
      outcome: 'same_muscles',
      easier: DIFFICULTY_ORDER[pick.difficulty] < targetRank,
      reason: `Trains the same muscles as ${target.name} without the movement you disliked.`,
    };
  }

  return {
    ...base,
    to: null,
    toName: null,
    outcome: 'kept_original',
    easier: false,
    reason: KEPT_ORIGINAL_REASON,
  };
}

/** Resolve every disliked exercise at once, in rank order. */
export function substituteAllDisliked(
  disliked: readonly string[],
  catalog: readonly CatalogExercise[],
  edges: readonly SubstitutionEdge[],
  ctx: Omit<DislikeContext, 'disliked'>,
): DislikeSubstitution[] {
  const full: DislikeContext = { ...ctx, disliked: new Set(disliked) };
  return disliked.map((slug) => substituteDisliked(slug, catalog, edges, full));
}

const PATTERN_WORDS: Partial<Record<MovementPattern, string>> = {
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'lunge',
  horizontal_push: 'press',
  vertical_push: 'overhead press',
  horizontal_pull: 'row',
  vertical_pull: 'pulldown',
  elbow_flexion: 'curl',
  elbow_extension: 'triceps movement',
  shoulder_isolation: 'delt movement',
  core_flexion: 'core movement',
  core_stability: 'core movement',
  carry: 'carry',
  hip_extension_iso: 'glute movement',
  knee_flexion_iso: 'hamstring movement',
  knee_extension_iso: 'quad movement',
  calf_raise: 'calf movement',
};

function labelPattern(p: MovementPattern): string {
  return PATTERN_WORDS[p] ?? 'movement';
}

/* ═══════════════════════════════════════════════ 5 · sex-aware rest / reps (tier A) */

/**
 * Rest multiplier for female athletes. Women recover MORE between sets and fatigue less at matched
 * relative intensity (PeerJ 2025; PMC6206044) — so the same rest interval leaves more on the table.
 * 15% is deliberately modest: it is a nudge to a default the athlete can change, not a prescription.
 */
export const FEMALE_REST_MULTIPLIER = 0.85;
/** Reps the default range shifts up by, at BOTH ends — the range widens by nothing, it moves. */
export const FEMALE_REP_SHIFT = 1;
/** Nothing may drop a default below this; a rest that short stops being rest. */
export const MIN_REST_SECONDS = 30;

export interface SexPrescriptionInput {
  sex: SexType | null | undefined;
  rest_seconds: number;
  rep_min: number;
  rep_max: number;
}

export interface SexPrescriptionAdjustment {
  rest_seconds: number;
  rep_min: number;
  rep_max: number;
  /** true when anything moved off the goal/experience default */
  adjusted: boolean;
  /** the sentence that MUST be shown next to the adjusted numbers. Empty when nothing changed. */
  label: string;
  /** evidence tier, or null when nothing changed */
  tier: 'A' | null;
}

const FEMALE_LABEL =
  'Slightly shorter rest and a slightly higher rep range: at the same relative intensity women recover more between sets. Both are defaults you can change.';

/**
 * Apply the ONE sex difference the evidence actually supports to a prescription.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, and must never be extended to do: cap load, remove or hide a
 * compound lift, lower a volume target, or assume a smaller goal. When training variables are
 * matched, sex differences in adaptation are minimal — so nothing here is allowed to REDUCE what a
 * female athlete is offered. The only outputs are a rest interval and a rep range, and both are
 * returned alongside the reason so the UI can never present them as unexplained.
 */
export function sexAdjustedPrescription(
  input: SexPrescriptionInput,
): SexPrescriptionAdjustment {
  const unchanged: SexPrescriptionAdjustment = {
    rest_seconds: input.rest_seconds,
    rep_min: input.rep_min,
    rep_max: input.rep_max,
    adjusted: false,
    label: '',
    tier: null,
  };
  if (input.sex !== 'female') return unchanged;

  const rest = Math.max(
    MIN_REST_SECONDS,
    Math.round((input.rest_seconds * FEMALE_REST_MULTIPLIER) / 5) * 5,
  );
  const repMin = input.rep_min + FEMALE_REP_SHIFT;
  const repMax = Math.max(repMin, input.rep_max + FEMALE_REP_SHIFT);

  return {
    rest_seconds: rest,
    rep_min: repMin,
    rep_max: repMax,
    adjusted: rest !== input.rest_seconds || repMin !== input.rep_min || repMax !== input.rep_max,
    label: FEMALE_LABEL,
    tier: 'A',
  };
}
