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
  favorites: NamedRef[];

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
  };
}
