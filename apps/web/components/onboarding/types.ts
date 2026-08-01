import type {
  GoalType,
  ExperienceLevel,
  TrainingLocation,
  UnitSystem,
  SexType,
  DietType,
  MovementPattern,
  ExclusionReason,
} from '@fitforge/shared/types';
import type { BodyArea } from '@fitforge/shared/types';
import type {
  AiAgeBucket,
  AiBodyFatBand,
  AiBuild,
  AiDietBase,
  AiDietAvoid,
} from '@fitforge/shared/schemas';

/** Lightweight display record kept alongside ids so chips can render names without a re-fetch. */
export interface NamedRef {
  id: string;
  slug: string;
  name: string;
}

export interface DraftMovementExclusion {
  movement_pattern: MovementPattern;
  reason: ExclusionReason;
  source_body_area: BodyArea | null;
  /** soft exclusions are pre-checked but individually removable (§7.2.2) */
  soft: boolean;
}

export interface DraftExcludedExercise extends NamedRef {
  exclusion_reason: ExclusionReason;
  preferred_substitute_id: string | null;
}

/**
 * The full client-held onboarding draft — a superset of every step's fields (§2.2). Pre-auth it
 * lives only in memory; post-auth each step is written through to Supabase and this mirrors it so
 * "back never loses data" and resume can rehydrate.
 */
export interface OnboardingDraft {
  // step 0 · welcome — optional Local Mode name capture (§5.4)
  display_name: string | null;

  // step 2 · goals
  /**
   * Every goal the user picked, in the order they picked them. This is the real answer now —
   * the step is a multi-select, so someone can want strength AND fat loss without ranking them
   * in a separate question at the bottom of the screen.
   *
   * `primary_goal` / `secondary_goal` are kept in sync as `goals[0]` / `goals[1]` so every
   * existing consumer (generation, macros, split scoring, settings) keeps working untouched.
   */
  goals: GoalType[];
  primary_goal: GoalType | null;
  secondary_goal: GoalType | null;

  // step 3 · experience
  experience_level: ExperienceLevel | null;

  // step 4 · schedule
  days_per_week: number | null;
  session_minutes: number | null;
  preferred_days: number[];

  // step 4b · split — a slug from SPLIT_LIBRARY (@fitforge/shared/rules), or 'auto' to let
  // FitForge derive the week from days/week (the pre-split behaviour).
  split_slug: string | null;

  // step 5 · location
  training_location: TrainingLocation | null;

  // step 6 · equipment
  /** everything the user has access to (an up-swiped "love it" item is also a "have it") */
  equipment_slugs: string[];
  /**
   * Subset of `equipment_slugs` the user actively enjoys (swipe-deck up-gesture). A *preference*
   * signal on top of availability — plan generation can bias toward these.
   */
  loved_equipment_slugs: string[];

  // step 7 · exercises you enjoy
  /**
   * LEGACY open "any exercises you love?" multi-select. Kept because older drafts (and older
   * backups) carry it and generation still reads it as a fallback — but `liked_exercises` is the
   * answer of record now. See `preferencesForDraft` in `lib/demo/generate.ts` for the precedence.
   */
  favorites: NamedRef[];

  /**
   * TOP 5 LIKED — RANKED, index 0 = favourite. Asked BEFORE the split step, because the split is
   * the single biggest determinant of what someone actually does and it used to be chosen before
   * the app knew one thing about what they enjoy.
   *
   * Drives BOTH split scoring (`recommendSplits`) and per-slot exercise selection.
   */
  liked_exercises: NamedRef[];

  /**
   * TOP 5 DISLIKED — RANKED, index 0 = most disliked. **NOT an exclusion list.**
   *
   * The app already has a real exclusion step ("anything we should protect?", `body_areas` /
   * `excluded_exercises`) and that one REMOVES work. This one does not: a disliked movement is
   * down-ranked and swapped for a LOWER-DIFFICULTY option that trains the same pattern and
   * muscles, so the coverage survives and only the specific lift changes. Where nothing suitable
   * exists the original stays and `PlanCoverage.keptDislikes` says so.
   *
   * Starts EMPTY for everyone, forever — see `dislikedDefaults()` in `@fitforge/shared/rules`.
   */
  disliked_exercises: NamedRef[];

  /**
   * Whether the two lists above are still FitForge's suggestion or the athlete's own answer.
   * Mirrors `targets_source`. Once this reads `'custom'` the sex pre-fill must never re-assert
   * itself — an edit is respected permanently, including on a later visit to the screen.
   */
  exercise_prefs_source: 'suggested' | 'custom';

  // step 8 · exclusions
  body_areas: BodyArea[];
  movement_exclusions: DraftMovementExclusion[];
  excluded_exercises: DraftExcludedExercise[];

  // step 9 · body metrics
  sex: SexType | null;
  birthdate: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  unit_system: UnitSystem;

  // step 10 · nutrition preferences
  diet_type: DietType;
  allergies: string[];
  meals_per_day: number;
  avoid_foods: NamedRef[];

  // step 11 · targets review
  kcal_target: number | null;
  protein_g_target: number | null;
  carbs_g_target: number | null;
  fat_g_target: number | null;
  targets_source: 'suggested' | 'custom';

  // ═══════════════════════════════════════ AI-Mode fork (docs/AIMODE-CONTRACT.md, W3) ═══════
  /**
   * Which door the athlete took at the welcome fork. False/absent = Old School — every draft
   * written before the fork existed reads as Old School, so nothing changes for anyone (Law 1).
   * Steers next/prev (`nextStepInMode`) and the goals cap; flipped back to false by every
   * "Continue with Old School" exit.
   */
  ai_mode: boolean;

  /**
   * The USER-CONFIRMED buckets from ai_confirm — the answer of record for AI Mode, and the only
   * scan-derived thing that is ever persisted (contract §F1: never the photos, never the model's
   * raw pre-confirmation guesses). Buckets, never numbers (Law 2): the numeric draft fields
   * above (`weight_kg`, `height_cm`, `birthdate`) carry the bucket MIDPOINTS so the existing
   * deterministic generators run unchanged, but no UI copy ever renders those numbers.
   */
  ai_age_bucket: AiAgeBucket | null;
  /** 10 kg band id, e.g. '70-80' ('under-50' / 'over-120' at the ends) */
  ai_weight_band: string | null;
  ai_body_fat_band: AiBodyFatBand | null;
  /** the scan's build word — feeds the experience pre-fill and stance detection, changeable */
  ai_build: AiBuild | null;
  /** 5 cm height band id, e.g. '170-175' — `height_cm` holds its midpoint */
  ai_height_band: string | null;

  /**
   * DietPrefs for the W2 diet engine, in the contract's exact vocabulary (base + avoid are HARD
   * filters there). `diet_type`/`allergies` above are kept in sync where the vocabularies map,
   * so the existing catalog filtering keeps working on an AI-Mode draft too.
   */
  diet_base: AiDietBase | null;
  diet_avoid: AiDietAvoid[];
}

export function emptyDraft(): OnboardingDraft {
  return {
    display_name: null,
    goals: [],
    primary_goal: null,
    secondary_goal: null,
    experience_level: null,
    days_per_week: null,
    session_minutes: null,
    preferred_days: [],
    split_slug: null,
    training_location: null,
    equipment_slugs: [],
    loved_equipment_slugs: [],
    favorites: [],
    liked_exercises: [],
    disliked_exercises: [],
    exercise_prefs_source: 'suggested',
    body_areas: [],
    movement_exclusions: [],
    excluded_exercises: [],
    sex: null,
    birthdate: null,
    height_cm: null,
    weight_kg: null,
    unit_system: 'metric',
    diet_type: 'none',
    allergies: [],
    meals_per_day: 3,
    avoid_foods: [],
    kcal_target: null,
    protein_g_target: null,
    carbs_g_target: null,
    fat_g_target: null,
    targets_source: 'suggested',
    ai_mode: false,
    ai_age_bucket: null,
    ai_weight_band: null,
    ai_body_fat_band: null,
    ai_build: null,
    ai_height_band: null,
    diet_base: null,
    diet_avoid: [],
  };
}
