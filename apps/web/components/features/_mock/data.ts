/**
 * WS-5 mock data plane.
 *
 * All WS-5 pages render against MOCKED data (per the brief: "Render with mocked data where a live
 * DB is needed"). This module simulates the §5.1 PostgREST reads, the §5.2 views
 * (`v_exercise_full`, `v_daily_nutrition`, `v_exercise_prs`) and the §5.3 RPCs
 * (`search_exercises`, `search_foods`, `suggest_substitutes`, `log_food`, `previous_sets`, …).
 *
 * INTEGRATION: at wire-up time each `mock*` accessor is replaced by a Supabase client call /
 * `@fitforge/shared` RPC wrapper of the same shape. Slugs/enum values are transcribed verbatim
 * from BLUEPRINT §6 so the swap needs no data remapping. Nothing here writes to disk or network.
 *
 * DEMO MODE: the exercise catalog + substitution ranking are derived from the `@fitforge/shared`
 * §6/§7 fixtures & rule mirrors (the same data the pure-TS rules were verified against), so the
 * static demo browses/computes against real shared data with no backend.
 */
import catalogFixtureJson from '@fitforge/shared/fixtures/catalog.json';
import substitutionEdgesJson from '@fitforge/shared/fixtures/substitution-edges.json';
import {
  suggestSubstitutes,
  type CatalogExercise,
  type SubstitutionEdge,
  type SubstitutionContext,
} from '@fitforge/shared/rules';

const catalogFixture = catalogFixtureJson as unknown as CatalogExercise[];
const substitutionEdges = substitutionEdgesJson as unknown as SubstitutionEdge[];

/* ------------------------------------------------------------------ enum-ish string unions */
export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'shoulder_isolation'
  | 'core_flexion'
  | 'core_stability'
  | 'carry'
  | 'hip_extension_iso'
  | 'knee_flexion_iso'
  | 'knee_extension_iso'
  | 'calf_raise'
  | 'cardio'
  | 'conditioning'
  | 'mobility'
  | 'static_stretch';
export type Mechanics = 'compound' | 'isolation';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type GoalType = 'strength' | 'hypertrophy' | 'fat_loss' | 'endurance' | 'general_health';
export type PhotoPose = 'front' | 'side' | 'back';
export type DietType =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'keto'
  | 'mediterranean'
  | 'none';

/* --------------------------------------------------------------------- catalog read models */
export interface EquipmentGroup {
  alt_group: number;
  slugs: string[];
  names: string[];
}

/** Mirror of §5.2 `v_exercise_full` (one-shot exercise read). */
export interface ExerciseFull {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  category_slug: string;
  category_name: string;
  movement_pattern: MovementPattern;
  mechanics: Mechanics;
  difficulty: Difficulty;
  is_unilateral: boolean;
  is_bodyweight_ok: boolean;
  instructions: string;
  image_path: string | null;
  tags: string[];
  popularity: number;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: EquipmentGroup[];
}

export interface ExerciseSearchRow {
  exercise_id: string;
  slug: string;
  name: string;
  matched_alias: string | null;
  score: number;
}

export interface SubstituteRow {
  exercise_id: string;
  slug: string;
  name: string;
  score: number;
  reason: string;
}

/* ----------------------------------------------------------------------- routine read model */
export interface RoutineExercise {
  id: string;
  position: number;
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  image_path: string | null;
  sets: number;
  rep_min: number;
  rep_max: number;
  target_rpe: number | null;
  rest_seconds: number;
  superset_group: number | null;
  notes: string | null;
}
export interface RoutineDay {
  id: string;
  day_index: number;
  name: string;
  focus: string | null;
  /** 0=Mon … 6=Sun (BLUEPRINT §3.2) */
  weekday: number | null;
  exercises: RoutineExercise[];
}
export interface Routine {
  id: string;
  name: string;
  description: string | null;
  goal: GoalType | null;
  source: 'generated' | 'custom';
  is_active: boolean;
  start_date: string | null;
  days: RoutineDay[];
}

/* -------------------------------------------------------------------- nutrition read models
 *
 * The FOOD CATALOG has moved out of this mock plane: `lib/food/core.json` (509 curated foods with
 * aliases, per-100 g macros and household measures) plus `lib/food/{index,search,parse,measures}`
 * is the real thing the nutrition surface reads. Only the LOG shape — what the user recorded —
 * stays here, because the demo store persists it.
 */
export interface NutritionLog {
  id: string;
  /** the LOCAL calendar day this food belongs to (`YYYY-MM-DD`) */
  logged_on: string;
  meal_slot: MealSlot;
  food_id: string | null;
  custom_name: string | null;
  quantity_g: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /**
   * WHEN THE ENTRY WAS MADE, as a full device timestamp (ISO 8601 with offset, e.g.
   * `2026-07-30T08:42:11+05:30`). Distinct from `logged_on` on purpose: that is the day the food
   * counts toward, this is the moment the athlete recorded it — which is what makes "you logged
   * breakfast at 8:42" possible, and what tells the difference between food entered as it was
   * eaten and a whole day backfilled at midnight.
   *
   * Optional because every row written before this existed has no honest value for it, and
   * inventing one (the day's midnight, say) would be fabricating data the app never had.
   */
  logged_at?: string;
  /** IANA zone of the device at entry time, so a timestamp survives the user changing timezone. */
  logged_tz?: string;
}
/** Mirror of §5.2 `v_daily_nutrition`. */
export interface DailyNutrition {
  logged_on: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
export interface NutritionTargets {
  kcal_target: number;
  protein_g_target: number;
  carbs_g_target: number;
  fat_g_target: number;
}
/* -------------------------------------------------------------------- progress read models */
export interface BodyMetric {
  measured_on: string;
  weight_kg: number | null;
}
/** Mirror of §5.2 `v_exercise_prs` (best Epley e1RM + best weight per exercise). */
export interface ExercisePR {
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  best_e1rm: number;
  best_weight_kg: number;
  best_reps: number;
}
export interface ProgressPhoto {
  id: string;
  taken_on: string;
  pose: PhotoPose;
  storage_path: string;
}

/* ------------------------------------------------------------------------ workout logging */
export interface PreviousSet {
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
}

/* ------------------------------------------------------------------------- user profile */
export interface Profile {
  /** Optional self-chosen name (Local Mode). Null when the user skipped name capture. */
  display_name: string | null;
  sex: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  birthdate: string;
  height_cm: number;
  unit_system: 'metric' | 'imperial';
  experience_level: Difficulty;
  primary_goal: GoalType;
  secondary_goal: GoalType | null;
  training_location: 'home' | 'commercial_gym' | 'minimal';
  days_per_week: number;
  session_minutes: number;
  preferred_days: number[]; // 0=Mon … 6=Sun
}
export interface NutritionProfile {
  diet_type: DietType;
  allergies: string[];
  meals_per_day: number;
  kcal_target: number;
  protein_g_target: number;
  carbs_g_target: number;
  fat_g_target: number;
  targets_source: 'suggested' | 'custom';
}

/* ====================================================================================== */
/*  Seed-derived catalog (subset of §6.4, verbatim slugs / names / patterns / popularity)  */
/* ====================================================================================== */

const INSTR =
  'Set up under control, brace, and move through a full range of motion. Keep the working muscle under tension and finish each rep with intent.';

/* ------------------------------------------------------------------ fixture-derived catalog */
/**
 * The exercise catalog is derived from the `@fitforge/shared` §6.4 fixture (59 exercises) so the
 * demo browses the *same* catalog the rule mirrors were verified against. We enrich each row into
 * the `v_exercise_full` read-model the UI expects (category, grouped/named equipment, etc.).
 */

/** movement_pattern → catalog category facet (matches EXERCISE_CATEGORIES below). */
const PATTERN_CATEGORY: Record<MovementPattern, { slug: string; name: string }> = {
  squat: { slug: 'legs', name: 'Legs' },
  lunge: { slug: 'legs', name: 'Legs' },
  hinge: { slug: 'legs', name: 'Legs' },
  knee_extension_iso: { slug: 'legs', name: 'Legs' },
  knee_flexion_iso: { slug: 'legs', name: 'Legs' },
  calf_raise: { slug: 'legs', name: 'Legs' },
  hip_extension_iso: { slug: 'glutes', name: 'Glutes' },
  horizontal_push: { slug: 'chest', name: 'Chest' },
  vertical_push: { slug: 'shoulders', name: 'Shoulders' },
  shoulder_isolation: { slug: 'shoulders', name: 'Shoulders' },
  horizontal_pull: { slug: 'back', name: 'Back' },
  vertical_pull: { slug: 'back', name: 'Back' },
  elbow_flexion: { slug: 'arms', name: 'Arms' },
  elbow_extension: { slug: 'arms', name: 'Arms' },
  core_flexion: { slug: 'core', name: 'Core' },
  core_stability: { slug: 'core', name: 'Core' },
  carry: { slug: 'full-body', name: 'Full Body' },
  cardio: { slug: 'cardio', name: 'Cardio' },
  conditioning: { slug: 'conditioning', name: 'Conditioning' },
  mobility: { slug: 'mobility', name: 'Warm-up' },
  static_stretch: { slug: 'stretch', name: 'Cooldown' },
};

/** Pretty display names for equipment slugs used across the fixture catalog. */
const EQUIPMENT_NAMES: Record<string, string> = {
  barbell: 'Barbell',
  'weight-plates': 'Weight Plates',
  'squat-rack': 'Squat / Power Rack',
  dumbbell: 'Dumbbells',
  kettlebell: 'Kettlebell',
  'leg-press': 'Leg Press Machine',
  'hack-squat-machine': 'Hack Squat Machine',
  'flat-bench': 'Flat Bench',
  'leg-curl-machine': 'Leg Curl Machine',
  'leg-extension-machine': 'Leg Extension Machine',
  'calf-raise-machine': 'Calf Raise Machine',
  'adjustable-bench': 'Adjustable Bench',
  'chest-press-machine': 'Chest Press Machine',
  'cable-machine': 'Cable Machine / Crossover',
  'pec-deck': 'Pec Deck',
  'dip-station': 'Dip Station',
  'shoulder-press-machine': 'Shoulder Press Machine',
  'resistance-bands': 'Resistance Bands',
  'pull-up-bar': 'Pull-up Bar',
  'lat-pulldown': 'Lat Pulldown Machine',
  'seated-row-machine': 'Seated Cable Row',
  'suspension-trainer': 'Suspension Trainer',
  'ez-curl-bar': 'EZ-Curl Bar',
  'ab-wheel': 'Ab Wheel',
  'medicine-ball': 'Medicine Ball',
  treadmill: 'Treadmill',
  'stationary-bike': 'Stationary Bike',
  'rowing-machine': 'Rowing Machine',
  'plyo-box': 'Plyo Box',
};

function equipmentName(slug: string): string {
  return (
    EQUIPMENT_NAMES[slug] ??
    slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

interface CatalogFixtureRow {
  id: string;
  slug: string;
  name: string;
  movement_pattern: MovementPattern;
  mechanics: Mechanics;
  difficulty: Difficulty;
  popularity: number;
  is_bodyweight_ok: boolean;
  equipment: string[][];
  primary_muscles: string[];
  secondary_muscles: string[];
  is_active?: boolean;
}

function fromFixture(row: CatalogFixtureRow): ExerciseFull {
  const cat = PATTERN_CATEGORY[row.movement_pattern] ?? { slug: 'full-body', name: 'Full Body' };
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    aliases: [],
    category_slug: cat.slug,
    category_name: cat.name,
    movement_pattern: row.movement_pattern,
    mechanics: row.mechanics,
    difficulty: row.difficulty,
    is_unilateral: /split|lunge|one-arm|single/i.test(row.name),
    is_bodyweight_ok: row.is_bodyweight_ok,
    instructions: INSTR,
    image_path: null,
    tags: [],
    popularity: row.popularity,
    primary_muscles: [...row.primary_muscles],
    secondary_muscles: [...row.secondary_muscles],
    equipment: row.equipment.map((slugs, i) => ({
      alt_group: i + 1,
      slugs: [...slugs],
      names: slugs.map(equipmentName),
    })),
  };
}

export const EXERCISES: ExerciseFull[] = (catalogFixture as CatalogFixtureRow[])
  .filter((r) => r.is_active !== false)
  .map(fromFixture);


const BY_SLUG = new Map(EXERCISES.map((e) => [e.slug, e]));
const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function mockExerciseBySlug(slug: string): ExerciseFull | undefined {
  return BY_SLUG.get(slug);
}
export function mockExerciseById(id: string): ExerciseFull | undefined {
  return BY_ID.get(id);
}
export function mockAllExercises(): ExerciseFull[] {
  return EXERCISES;
}

/** Distinct filter facets for the /exercises catalog. */
export const EXERCISE_CATEGORIES = [
  { slug: 'chest', name: 'Chest' },
  { slug: 'back', name: 'Back' },
  { slug: 'shoulders', name: 'Shoulders' },
  { slug: 'arms', name: 'Arms' },
  { slug: 'legs', name: 'Legs' },
  { slug: 'glutes', name: 'Glutes' },
  { slug: 'core', name: 'Core' },
  { slug: 'cardio', name: 'Cardio' },
  { slug: 'conditioning', name: 'Conditioning' },
  { slug: 'full-body', name: 'Full Body' },
  // Warm-up and cooldown sit at the END of the chip row deliberately: they are what you reach
  // for around a session, not the thing you browse first.
  { slug: 'mobility', name: 'Warm-up' },
  { slug: 'stretch', name: 'Cooldown' },
];
export const EQUIPMENT_FACETS = [
  { slug: 'barbell', name: 'Barbell' },
  { slug: 'dumbbell', name: 'Dumbbells' },
  { slug: 'kettlebell', name: 'Kettlebell' },
  { slug: 'cable-machine', name: 'Cable Machine' },
  { slug: 'pull-up-bar', name: 'Pull-up Bar' },
  { slug: 'resistance-bands', name: 'Resistance Bands' },
  { slug: 'bodyweight', name: 'Bodyweight only' },
];
export const MUSCLE_FACETS = [
  { slug: 'pecs', name: 'Chest' },
  { slug: 'lats', name: 'Lats' },
  { slug: 'quads', name: 'Quads' },
  { slug: 'hamstrings', name: 'Hamstrings' },
  { slug: 'glute-max', name: 'Glutes' },
  { slug: 'biceps', name: 'Biceps' },
  { slug: 'triceps', name: 'Triceps' },
  { slug: 'front-delts', name: 'Front Delts' },
  { slug: 'side-delts', name: 'Side Delts' },
  { slug: 'abs', name: 'Abs' },
];

/* ------------------------------------------------------ mock search_exercises (§7.1 ranking) */
export function mockSearchExercises(q: string, limit = 8): ExerciseSearchRow[] {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  return EXERCISES.map((e) => {
    const name = e.name.toLowerCase();
    let score = 0;
    if (name === query) score += 100;
    if (name.startsWith(query)) score += 60;
    if (new RegExp(`\\b${escapeRe(query)}`).test(name)) score += 40;
    if (name.includes(query)) score += 20;
    score += e.popularity * 0.2;
    return { exercise_id: e.id, slug: e.slug, name: e.name, matched_alias: null, score };
  })
    .filter((r) => r.score > 15)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/* ------------------------------------------------ suggest_substitutes via §7.4 shared rule */

/**
 * Default substitution context for the demo: assume a commercial-gym athlete with everything
 * available and nothing excluded, so the ranking is driven purely by the §7.4 scorer over the
 * fixture catalog + curated edges. Callers (onboarding, workout) can pass a narrower context.
 */
export const DEMO_SUB_CONTEXT: SubstitutionContext = {
  ownedEquipment: new Set<string>(),
  trainingLocation: 'commercial_gym',
  experience: 'advanced',
  excludedExercises: new Set<string>(),
  excludedPatterns: new Set(),
  favorites: new Set<string>(),
  preferredSubstitute: null,
};

export function mockSuggestSubstitutes(
  exerciseId: string,
  limit = 5,
  ctx: SubstitutionContext = DEMO_SUB_CONTEXT,
): SubstituteRow[] {
  const target = BY_ID.get(exerciseId);
  if (!target) return [];
  const results = suggestSubstitutes(target.slug, catalogFixture, substitutionEdges, ctx, limit);
  return results
    .map((r) => {
      const ex = BY_SLUG.get(r.slug);
      return ex
        ? { exercise_id: ex.id, slug: ex.slug, name: ex.name, score: r.score, reason: r.reason }
        : null;
    })
    .filter((r): r is SubstituteRow => r !== null);
}

/* ====================================================================================== */
/*  User plane — default profile shape used for Settings fallbacks & SSR snapshots.        */
/*  No hardcoded identity: the real name comes from Local Mode name capture (§5.4).         */
/* ====================================================================================== */

export const MOCK_PROFILE: Profile = {
  display_name: null,
  sex: 'male',
  birthdate: '1999-03-14',
  height_cm: 180,
  unit_system: 'metric',
  experience_level: 'advanced',
  primary_goal: 'hypertrophy',
  secondary_goal: 'strength',
  training_location: 'commercial_gym',
  days_per_week: 4,
  session_minutes: 60,
  preferred_days: [0, 1, 3, 4], // Mon, Tue, Thu, Fri
};

export const MOCK_NUTRITION_PROFILE: NutritionProfile = {
  diet_type: 'omnivore',
  allergies: [],
  meals_per_day: 3,
  kcal_target: 2600,
  protein_g_target: 195,
  carbs_g_target: 285,
  fat_g_target: 80,
  targets_source: 'suggested',
};

export function mockNutritionTargets(): NutritionTargets {
  return {
    kcal_target: MOCK_NUTRITION_PROFILE.kcal_target,
    protein_g_target: MOCK_NUTRITION_PROFILE.protein_g_target,
    carbs_g_target: MOCK_NUTRITION_PROFILE.carbs_g_target,
    fat_g_target: MOCK_NUTRITION_PROFILE.fat_g_target,
  };
}

/* ------------------------------------------------------------------ the active routine tree */
function rex(
  id: string,
  position: number,
  slug: string,
  sets: number,
  rep_min: number,
  rep_max: number,
  rest_seconds: number,
  target_rpe: number | null = 7,
  superset_group: number | null = null,
): RoutineExercise {
  const e = BY_SLUG.get(slug)!;
  return {
    id,
    position,
    exercise_id: e.id,
    exercise_slug: e.slug,
    exercise_name: e.name,
    image_path: e.image_path,
    sets,
    rep_min,
    rep_max,
    target_rpe,
    rest_seconds,
    superset_group,
    notes: null,
  };
}

export const MOCK_ROUTINE: Routine = {
  id: 'rt-active',
  name: 'Upper / Lower — Hypertrophy',
  description: 'A 4-day upper/lower split generated from your profile.',
  goal: 'hypertrophy',
  source: 'generated',
  is_active: true,
  start_date: '2026-07-06',
  days: [
    {
      id: 'day-a',
      day_index: 0,
      name: 'Day A — Upper',
      focus: 'Upper body',
      weekday: 0, // Mon
      exercises: [
        rex('rex-a1', 1, 'bench-press', 4, 6, 10, 120),
        rex('rex-a2', 2, 'barbell-row', 4, 8, 12, 120),
        rex('rex-a3', 3, 'overhead-press', 3, 8, 12, 90),
        rex('rex-a4', 4, 'lat-pulldown', 3, 10, 15, 90),
        rex('rex-a5', 5, 'dumbbell-curl', 3, 10, 15, 60, 8, 1),
        rex('rex-a6', 6, 'triceps-pushdown', 3, 10, 15, 60, 8, 1),
      ],
    },
    {
      id: 'day-b',
      day_index: 1,
      name: 'Day B — Lower',
      focus: 'Lower body',
      weekday: 1, // Tue
      exercises: [
        rex('rex-b1', 1, 'barbell-back-squat', 4, 6, 10, 150),
        rex('rex-b2', 2, 'romanian-deadlift', 3, 8, 12, 120),
        rex('rex-b3', 3, 'leg-press', 3, 10, 15, 90),
        rex('rex-b4', 4, 'leg-curl', 3, 10, 15, 60),
        rex('rex-b5', 5, 'standing-calf-raise', 4, 12, 20, 45),
        rex('rex-b6', 6, 'plank', 3, 30, 60, 45),
      ],
    },
    {
      id: 'day-c',
      day_index: 2,
      name: 'Day C — Upper',
      focus: 'Upper body',
      weekday: 3, // Thu
      exercises: [
        rex('rex-c1', 1, 'incline-dumbbell-press', 4, 8, 12, 120),
        rex('rex-c2', 2, 'seated-cable-row', 4, 10, 15, 90),
        rex('rex-c3', 3, 'seated-dumbbell-shoulder-press', 3, 8, 12, 90),
        rex('rex-c4', 4, 'pull-up', 3, 6, 10, 120),
        rex('rex-c5', 5, 'lateral-raise', 3, 12, 20, 45),
        rex('rex-c6', 6, 'face-pull', 3, 12, 20, 45),
      ],
    },
    {
      id: 'day-d',
      day_index: 3,
      name: 'Day D — Lower',
      focus: 'Lower body',
      weekday: 4, // Fri
      exercises: [
        rex('rex-d1', 1, 'conventional-deadlift', 3, 4, 6, 180),
        rex('rex-d2', 2, 'bulgarian-split-squat', 3, 8, 12, 90),
        rex('rex-d3', 3, 'barbell-hip-thrust', 3, 8, 12, 90),
        rex('rex-d4', 4, 'leg-extension', 3, 12, 20, 60),
        rex('rex-d5', 5, 'standing-calf-raise', 4, 12, 20, 45),
        rex('rex-d6', 6, 'hanging-leg-raise', 3, 8, 15, 60),
      ],
    },
  ],
};

export function mockActiveRoutine(): Routine {
  return MOCK_ROUTINE;
}

export const MOCK_ROUTINES_LIST: Pick<
  Routine,
  'id' | 'name' | 'description' | 'goal' | 'source' | 'is_active'
>[] = [
  {
    id: MOCK_ROUTINE.id,
    name: MOCK_ROUTINE.name,
    description: MOCK_ROUTINE.description,
    goal: MOCK_ROUTINE.goal,
    source: MOCK_ROUTINE.source,
    is_active: true,
  },
  {
    id: 'rt-ppl',
    name: 'Push / Pull / Legs',
    description: 'A 6-day PPL you built last month.',
    goal: 'hypertrophy',
    source: 'custom',
    is_active: false,
  },
  {
    id: 'rt-fullbody',
    name: 'Full Body A/B/C',
    description: 'A 3-day starter full-body plan.',
    goal: 'general_health',
    source: 'generated',
    is_active: false,
  },
];

export function mockRoutineById(id: string): Routine {
  if (id === MOCK_ROUTINE.id) return MOCK_ROUTINE;
  // For other ids, return a light clone so the editor renders coherently.
  const meta = MOCK_ROUTINES_LIST.find((r) => r.id === id) ?? MOCK_ROUTINES_LIST[0]!;
  return { ...MOCK_ROUTINE, id, name: meta.name, description: meta.description, is_active: meta.is_active, source: meta.source, goal: meta.goal };
}

/* ------------------------------------------------------------------------ workout / logging */
const PREV_SETS: Record<string, PreviousSet[]> = {
  'bench-press': [
    { set_number: 1, reps: 8, weight_kg: 80, rpe: 7 },
    { set_number: 2, reps: 8, weight_kg: 80, rpe: 8 },
    { set_number: 3, reps: 7, weight_kg: 80, rpe: 9 },
    { set_number: 4, reps: 6, weight_kg: 80, rpe: 9.5 },
  ],
  'barbell-row': [
    { set_number: 1, reps: 10, weight_kg: 70, rpe: 7 },
    { set_number: 2, reps: 10, weight_kg: 70, rpe: 8 },
    { set_number: 3, reps: 9, weight_kg: 70, rpe: 8 },
    { set_number: 4, reps: 8, weight_kg: 70, rpe: 9 },
  ],
  'barbell-back-squat': [
    { set_number: 1, reps: 8, weight_kg: 110, rpe: 7 },
    { set_number: 2, reps: 8, weight_kg: 110, rpe: 8 },
    { set_number: 3, reps: 7, weight_kg: 110, rpe: 9 },
    { set_number: 4, reps: 6, weight_kg: 110, rpe: 9 },
  ],
};

export function mockPreviousSets(exerciseSlug: string, sets: number): PreviousSet[] {
  const stored = PREV_SETS[exerciseSlug];
  if (stored) return stored.slice(0, sets);
  return [];
}

/** Look up the routine day whose id matches; used by the workout player. */
export function mockRoutineDay(dayId: string): RoutineDay | undefined {
  return MOCK_ROUTINE.days.find((d) => d.id === dayId);
}

/* ----------------------------------------------------------------------------- nutrition
 * Foods, search, portion maths and the natural-language parser all live in `@/lib/food` now.
 * See `lib/food/index.ts` (the in-RAM catalog + inverted index), `search.ts`, `parse.ts`,
 * `measures.ts` and `format.ts`.
 */

/* ----------------------------------------------------------------------------- progress */
export const MOCK_BODY_METRICS: BodyMetric[] = buildWeightSeries();

function buildWeightSeries(): BodyMetric[] {
  // 12 weekly points trending gently down from 84.2 → 82.1 kg.
  const start = new Date('2026-05-03T00:00:00Z');
  const weights = [84.2, 84.0, 83.9, 83.5, 83.6, 83.2, 83.0, 82.9, 82.6, 82.4, 82.3, 82.1];
  return weights.map((w, i) => {
    const d = new Date(start.getTime() + i * 7 * 86400000);
    return { measured_on: d.toISOString().slice(0, 10), weight_kg: w };
  });
}

export function mockWeightSparkline(): number[] {
  return MOCK_BODY_METRICS.map((b) => b.weight_kg ?? 0);
}

export const MOCK_PRS: ExercisePR[] = [
  pr('bench-press', 100, 8),
  pr('barbell-back-squat', 140, 5),
  pr('conventional-deadlift', 180, 3),
  pr('overhead-press', 60, 6),
  pr('barbell-row', 90, 8),
  pr('romanian-deadlift', 120, 8),
  pr('lat-pulldown', 75, 10),
  pr('barbell-curl', 40, 10),
];

function pr(slug: string, weight: number, reps: number): ExercisePR {
  const e = BY_SLUG.get(slug)!;
  const e1rm = Math.round(weight * (1 + reps / 30));
  return {
    exercise_id: e.id,
    exercise_slug: e.slug,
    exercise_name: e.name,
    best_e1rm: e1rm,
    best_weight_kg: weight,
    best_reps: reps,
  };
}

export const MOCK_PHOTOS: ProgressPhoto[] = [
  { id: 'p1', taken_on: '2026-05-03', pose: 'front', storage_path: 'mock/front-1.jpg' },
  { id: 'p2', taken_on: '2026-05-03', pose: 'side', storage_path: 'mock/side-1.jpg' },
  { id: 'p3', taken_on: '2026-06-07', pose: 'front', storage_path: 'mock/front-2.jpg' },
  { id: 'p4', taken_on: '2026-06-07', pose: 'side', storage_path: 'mock/side-2.jpg' },
  { id: 'p5', taken_on: '2026-07-12', pose: 'front', storage_path: 'mock/front-3.jpg' },
  { id: 'p6', taken_on: '2026-07-12', pose: 'back', storage_path: 'mock/back-1.jpg' },
];

export const MOCK_MEASUREMENTS = [
  { key: 'waist_cm', label: 'Waist', series: [88, 87.5, 87, 86.4, 86, 85.6] },
  { key: 'chest_cm', label: 'Chest', series: [104, 104.4, 104.8, 105.1, 105.3, 105.6] },
  { key: 'arm_cm', label: 'Arm', series: [38.5, 38.7, 38.9, 39.1, 39.2, 39.4] },
];

export const MOCK_STREAK = 5;

/* ------------------------------------------------------------------------- date helpers */

/**
 * `YYYY-MM-DD` for a `Date` IN THE DEVICE'S OWN TIMEZONE.
 *
 * This used to be `toISOString().slice(0, 10)`, which is UTC, and that is a real bug rather than a
 * pedantic one: everything in the app hangs off `todayISO()` — which day Today shows, which day
 * food is filed under, which entry the morning check-in belongs to. In UTC+5:30 the app rolled
 * over to "tomorrow" at 5:30am and, more visibly, still called it Wednesday for the first five and
 * a half hours of Thursday. Anywhere west of Greenwich it flips the other way and files the
 * evening's dinner onto tomorrow.
 *
 * A calendar day is a LOCAL idea — it is the day on the wall clock of the person logging — so it
 * is read from the local getters. `lib/demo/selectedDate` already did this correctly for every
 * date it derived; it just anchored them all to a UTC "today".
 */
export function localISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return localISO();
}

/**
 * The device's IANA zone (e.g. "Asia/Kolkata"), recorded alongside timestamps so a log can still
 * be explained after the user travels. Falls back to the empty string on the rare engine without
 * `resolvedOptions`; callers treat that as "unknown", never as UTC.
 */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Map JS `Date.getDay()` (0=Sun … 6=Sat) → blueprint weekday (0=Mon … 6=Sun). */
export function blueprintWeekday(d = new Date()): number {
  return (d.getDay() + 6) % 7;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Default meal slot by time of day (§2.3): <10:30 breakfast, <15:00 lunch, <21:00 dinner, else snack. */
export function defaultMealSlot(d = new Date()): MealSlot {
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins < 10 * 60 + 30) return 'breakfast';
  if (mins < 15 * 60) return 'lunch';
  if (mins < 21 * 60) return 'dinner';
  return 'snack';
}

/** Find today's routine day from the active routine via weekday mapping (§2.3). */
export function todaysRoutineDay(routine: Routine, d = new Date()): RoutineDay | null {
  const wd = blueprintWeekday(d);
  return routine.days.find((day) => day.weekday === wd) ?? null;
}

/* ------------------------------------------------------------------------- tiny utils */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
