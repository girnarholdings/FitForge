'use client';

/**
 * DEMO MODE persistence layer.
 *
 * The entire app runs backend-free: all user data (a fake session, the onboarding draft, the
 * generated profile / routine / nutrition targets, and food logs) lives in `localStorage` under a
 * single versioned key. Everything here is SSR-safe — during static prerender there is no
 * `window`, so reads return the in-memory default state and writes are no-ops.
 *
 * There is exactly one demo user; auth is bypassed with a fixed id.
 *
 * Two invariants everything below exists to hold:
 *   1. NOTHING read out of `localStorage` is trusted. Every read is normalized (see "shape
 *      validation / repair") so a corrupted store can never crash a route or render `NaN`.
 *   2. Local Mode spans SEVERAL `fitforge.*` keys — this state, the workout log, and small
 *      caches. Backup, restore and erase all operate on the whole set, never just this key
 *      (see "Local Mode backup / restore / erase").
 */
import type {
  Profile,
  NutritionProfile,
  Routine,
  RoutineDay,
  RoutineExercise,
  NutritionLog,
  NutritionTargets,
} from '@/components/features/_mock/data';
import type { OnboardingDraft } from '@/components/onboarding/types';
import type { OnboardingStep } from '@fitforge/shared/schemas';
import {
  WORKOUT_LOG_KEY,
  readWorkoutLog,
  replaceWorkoutLog,
  clearWorkoutLog,
  validateWorkoutLog,
  isPlainObject,
  finiteNumber,
  nonEmptyString,
  noteIssue,
  describeIssues,
  type LogState,
  type ShapeIssues,
} from '@/components/features/shared/workoutLog';

export const DEMO_STORAGE_KEY = 'fitforge.demo.v1';
export const DEMO_USER_ID = 'demo-user';

export interface DemoState {
  version: 1;
  /** fake session — null until "Enter the demo" seeds it */
  userId: string | null;
  /** resume pointer for the onboarding wizard */
  onboardingStep: OnboardingStep;
  /** the working onboarding draft (superset of every step) */
  draft: Partial<OnboardingDraft>;
  /** stamped when onboarding finishes (ISO) */
  completedAt: string | null;
  /** generated on finish */
  profile: Profile | null;
  nutritionProfile: NutritionProfile | null;
  routine: Routine | null;
  targets: NutritionTargets | null;
  /** food logs keyed by YYYY-MM-DD */
  logsByDate: Record<string, NutritionLog[]>;
  /** body-weight log, ascending by date (empty for a fresh user) */
  weights: WeightEntry[];
  /**
   * Per-muscle weekly set targets the athlete calibrated for themselves, keyed by muscle slug.
   * Absent = use FitForge's recommendation. See `features/shared/volumeMath`.
   */
  volumeTargets: Record<string, number>;
  /**
   * A one-off session built by the quick-workout picker (pull tomorrow forward / isolate a split
   * day / condense the split into one full-body session). Transient by design: replaced every
   * time the picker runs, and read by the player when the route is `/workout/quick`.
   */
  quickSession: RoutineDay | null;
}

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  kg: number;
}

export function defaultState(): DemoState {
  return {
    version: 1,
    userId: null,
    onboardingStep: 'welcome',
    draft: {},
    completedAt: null,
    profile: null,
    nutritionProfile: null,
    routine: null,
    targets: null,
    logsByDate: {},
    weights: [],
    volumeTargets: {},
    quickSession: null,
  };
}

/* ══════════════════════════════════════════════════════════════ shape validation / repair
 *
 * `localStorage` is USER-WRITABLE INPUT. Its contents can come from a hand-edited backup, a
 * hostile file picked in Settings → Import, another tab running an older build, or a truncated
 * write. Trusting the parsed JSON to match `DemoState` is what let a payload like
 * `{"version":1,"routine":"hello","completedAt":"…"}` white-screen every authed route and survive
 * reloads — the user could not recover without clearing site data by hand.
 *
 * One normalizer serves both jobs:
 *   • READ   (`normalizeDemoState(value)`) — repair/drop what is broken, never throw.
 *   • IMPORT (`validateDemoState(value)`)  — same pass, but ANY repair is a rejection, so a bad
 *                                            file is refused before anything is persisted.
 */

/** Compile-time-exhaustive allowlist builder: the Record forces every union member to be listed. */
function allowed<T extends string>(members: Record<T, true>): ReadonlySet<string> {
  return new Set(Object.keys(members));
}

const ONBOARDING_STEP_VALUES = allowed<OnboardingStep>({
  welcome: true,
  auth: true,
  goals: true,
  experience: true,
  schedule: true,
  split: true,
  location: true,
  equipment: true,
  exercise_prefs: true,
  exclusions: true,
  body_metrics: true,
  nutrition_prefs: true,
  targets_review: true,
  plan_preview: true,
  done: true,
});
const GOAL_VALUES = allowed<Profile['primary_goal']>({
  strength: true,
  hypertrophy: true,
  fat_loss: true,
  endurance: true,
  general_health: true,
});
const SEX_VALUES = allowed<Profile['sex']>({
  male: true,
  female: true,
  other: true,
  prefer_not_to_say: true,
});
const DIFFICULTY_VALUES = allowed<Profile['experience_level']>({
  beginner: true,
  intermediate: true,
  advanced: true,
});
const LOCATION_VALUES = allowed<Profile['training_location']>({
  home: true,
  commercial_gym: true,
  minimal: true,
});
const UNIT_VALUES = allowed<Profile['unit_system']>({ metric: true, imperial: true });
const DIET_VALUES = allowed<NutritionProfile['diet_type']>({
  omnivore: true,
  vegetarian: true,
  vegan: true,
  pescatarian: true,
  keto: true,
  mediterranean: true,
  none: true,
});
const MEAL_SLOT_VALUES = allowed<NutritionLog['meal_slot']>({
  breakfast: true,
  lunch: true,
  dinner: true,
  snack: true,
});
const ROUTINE_SOURCE_VALUES = allowed<Routine['source']>({ generated: true, custom: true });

/* ------------------------------------------------------------------------- field readers
 * Every reader takes the raw value, a dotted path (for the error message) and the issue sink.
 * `undefined` is always "absent" — absent optional fields fall back silently so an OLD backup
 * missing a newer field still imports cleanly. A field that is PRESENT but wrong is an issue. */

function readString(v: unknown, path: string, issues: ShapeIssues, fallback: string): string {
  if (v === undefined) return fallback;
  if (typeof v === 'string') return v;
  noteIssue(issues, path, 'expected a string');
  return fallback;
}

function readStringOrNull(v: unknown, path: string, issues: ShapeIssues): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  noteIssue(issues, path, 'expected a string or null');
  return null;
}

function readEnum<T extends string>(
  v: unknown,
  path: string,
  issues: ShapeIssues,
  values: ReadonlySet<string>,
  fallback: T,
): T {
  if (v === undefined) return fallback;
  if (typeof v === 'string' && values.has(v)) return v as T;
  noteIssue(issues, path, `expected one of ${[...values].join(' | ')}`);
  return fallback;
}

function readEnumOrNull<T extends string>(
  v: unknown,
  path: string,
  issues: ShapeIssues,
  values: ReadonlySet<string>,
): T | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && values.has(v)) return v as T;
  noteIssue(issues, path, `expected one of ${[...values].join(' | ')}, or null`);
  return null;
}

/**
 * A finite number. `NaN` / `Infinity` / `"abc"` / objects are the direct source of every
 * "NaN of 2000 kcal" the UI has ever rendered, so they never survive a read.
 */
function readNumber(v: unknown, path: string, issues: ShapeIssues, fallback: number): number {
  if (v === undefined) return fallback;
  const n = finiteNumber(v);
  if (n !== null && typeof v === 'number') return n;
  noteIssue(issues, path, 'expected a finite number');
  return n ?? fallback;
}

function readNumberOrNull(v: unknown, path: string, issues: ShapeIssues): number | null {
  if (v === undefined || v === null) return null;
  const n = finiteNumber(v);
  if (n !== null && typeof v === 'number') return n;
  noteIssue(issues, path, 'expected a finite number or null');
  return n;
}

function readBoolean(v: unknown, path: string, issues: ShapeIssues, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  noteIssue(issues, path, 'expected a boolean');
  return fallback;
}

/** Map a JSON array, dropping entries the item reader refuses. A non-array is an issue → []. */
function readArray<T>(
  v: unknown,
  path: string,
  issues: ShapeIssues,
  item: (raw: unknown, itemPath: string, index: number) => T | null,
): T[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    noteIssue(issues, path, 'expected an array');
    return [];
  }
  const out: T[] = [];
  v.forEach((raw, i) => {
    const parsed = item(raw, `${path}[${i}]`, i);
    if (parsed !== null) out.push(parsed);
  });
  return out;
}

function readStringArray(v: unknown, path: string, issues: ShapeIssues): string[] {
  return readArray(v, path, issues, (raw, p) => {
    if (typeof raw === 'string') return raw;
    noteIssue(issues, p, 'expected a string');
    return null;
  });
}

function readNumberArray(v: unknown, path: string, issues: ShapeIssues): number[] {
  return readArray(v, path, issues, (raw, p) => {
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    if (n === null) noteIssue(issues, p, 'expected a finite number');
    return n;
  });
}

/** `null` | plain object. Anything else (a string, a number, an array) is an issue → null. */
function readObjectOrNull(
  v: unknown,
  path: string,
  issues: ShapeIssues,
): Record<string, unknown> | null {
  if (v === undefined || v === null) return null;
  if (isPlainObject(v)) return v;
  noteIssue(issues, path, 'expected an object or null');
  return null;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* -------------------------------------------------------------------------- sub-shapes */

function readRoutineExercise(
  raw: unknown,
  path: string,
  issues: ShapeIssues,
): RoutineExercise | null {
  if (!isPlainObject(raw)) {
    noteIssue(issues, path, 'expected an exercise object');
    return null;
  }
  const id = nonEmptyString(raw.exercise_id) ?? nonEmptyString(raw.id);
  if (id === null) {
    noteIssue(issues, `${path}.exercise_id`, 'expected a non-empty string');
    return null;
  }
  return {
    id: readString(raw.id, `${path}.id`, issues, id),
    position: readNumber(raw.position, `${path}.position`, issues, 0),
    exercise_id: id,
    exercise_slug: readString(raw.exercise_slug, `${path}.exercise_slug`, issues, id),
    exercise_name: readString(raw.exercise_name, `${path}.exercise_name`, issues, id),
    image_path: readStringOrNull(raw.image_path, `${path}.image_path`, issues),
    sets: Math.max(0, readNumber(raw.sets, `${path}.sets`, issues, 3)),
    rep_min: Math.max(0, readNumber(raw.rep_min, `${path}.rep_min`, issues, 8)),
    rep_max: Math.max(0, readNumber(raw.rep_max, `${path}.rep_max`, issues, 12)),
    target_rpe: readNumberOrNull(raw.target_rpe, `${path}.target_rpe`, issues),
    rest_seconds: Math.max(0, readNumber(raw.rest_seconds, `${path}.rest_seconds`, issues, 90)),
    superset_group: readNumberOrNull(raw.superset_group, `${path}.superset_group`, issues),
    notes: readStringOrNull(raw.notes, `${path}.notes`, issues),
  };
}

function readRoutineDay(
  raw: unknown,
  path: string,
  issues: ShapeIssues,
  index: number,
): RoutineDay | null {
  if (!isPlainObject(raw)) {
    noteIssue(issues, path, 'expected a day object');
    return null;
  }
  // `exercises` MUST be an array — `day.exercises.map(…)` runs on Today, Workouts and Progress.
  if (raw.exercises !== undefined && !Array.isArray(raw.exercises)) {
    noteIssue(issues, `${path}.exercises`, 'expected an array');
  }
  return {
    id: readString(raw.id, `${path}.id`, issues, `day-${index}`),
    day_index: readNumber(raw.day_index, `${path}.day_index`, issues, index),
    name: readString(raw.name, `${path}.name`, issues, `Day ${index + 1}`),
    focus: readStringOrNull(raw.focus, `${path}.focus`, issues),
    weekday: readNumberOrNull(raw.weekday, `${path}.weekday`, issues),
    exercises: readArray(raw.exercises, `${path}.exercises`, issues, (r, p) =>
      readRoutineExercise(r, p, issues),
    ),
  };
}

/**
 * The routine is the most load-bearing object in the store: Today, Workouts, Routines, Exercises
 * and Progress all walk `routine.days[].exercises[]`. A routine that is a string, or whose `days`
 * is a number, is unrepairable — it becomes `null`, which every consumer already handles
 * (`useActiveRoutine()` falls back to the demo routine).
 */
function readRoutine(v: unknown, path: string, issues: ShapeIssues): Routine | null {
  if (v === undefined || v === null) return null;
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected a routine object or null');
    return null;
  }
  if (!Array.isArray(v.days)) {
    noteIssue(issues, `${path}.days`, 'expected an array of days');
    return null;
  }
  return {
    id: readString(v.id, `${path}.id`, issues, 'routine-local'),
    name: readString(v.name, `${path}.name`, issues, 'My routine'),
    description: readStringOrNull(v.description, `${path}.description`, issues),
    goal: readEnumOrNull(v.goal, `${path}.goal`, issues, GOAL_VALUES),
    source: readEnum(v.source, `${path}.source`, issues, ROUTINE_SOURCE_VALUES, 'generated'),
    is_active: readBoolean(v.is_active, `${path}.is_active`, issues, true),
    start_date: readStringOrNull(v.start_date, `${path}.start_date`, issues),
    days: readArray(v.days, `${path}.days`, issues, (raw, p, i) =>
      readRoutineDay(raw, p, issues, i),
    ),
  };
}

function readProfile(v: unknown, path: string, issues: ShapeIssues): Profile | null {
  const o = readObjectOrNull(v, path, issues);
  if (!o) return null;
  return {
    display_name: readStringOrNull(o.display_name, `${path}.display_name`, issues),
    sex: readEnum(o.sex, `${path}.sex`, issues, SEX_VALUES, 'prefer_not_to_say'),
    birthdate: readString(o.birthdate, `${path}.birthdate`, issues, ''),
    height_cm: readNumber(o.height_cm, `${path}.height_cm`, issues, 175),
    unit_system: readEnum(o.unit_system, `${path}.unit_system`, issues, UNIT_VALUES, 'metric'),
    experience_level: readEnum(
      o.experience_level,
      `${path}.experience_level`,
      issues,
      DIFFICULTY_VALUES,
      'beginner',
    ),
    primary_goal: readEnum(
      o.primary_goal,
      `${path}.primary_goal`,
      issues,
      GOAL_VALUES,
      'hypertrophy',
    ),
    secondary_goal: readEnumOrNull(o.secondary_goal, `${path}.secondary_goal`, issues, GOAL_VALUES),
    training_location: readEnum(
      o.training_location,
      `${path}.training_location`,
      issues,
      LOCATION_VALUES,
      'commercial_gym',
    ),
    days_per_week: clampInt(readNumber(o.days_per_week, `${path}.days_per_week`, issues, 4), 1, 7),
    session_minutes: clampInt(
      readNumber(o.session_minutes, `${path}.session_minutes`, issues, 60),
      5,
      600,
    ),
    preferred_days: readNumberArray(o.preferred_days, `${path}.preferred_days`, issues),
  };
}

function readNutritionProfile(
  v: unknown,
  path: string,
  issues: ShapeIssues,
): NutritionProfile | null {
  const o = readObjectOrNull(v, path, issues);
  if (!o) return null;
  const targetsSource: NutritionProfile['targets_source'] =
    o.targets_source === 'custom' || o.targets_source === 'suggested'
      ? o.targets_source
      : (o.targets_source === undefined
          ? 'suggested'
          : (noteIssue(issues, `${path}.targets_source`, 'expected "suggested" or "custom"'),
            'suggested'));
  return {
    diet_type: readEnum(o.diet_type, `${path}.diet_type`, issues, DIET_VALUES, 'none'),
    allergies: readStringArray(o.allergies, `${path}.allergies`, issues),
    meals_per_day: clampInt(readNumber(o.meals_per_day, `${path}.meals_per_day`, issues, 3), 1, 12),
    kcal_target: Math.max(0, readNumber(o.kcal_target, `${path}.kcal_target`, issues, 2000)),
    protein_g_target: Math.max(
      0,
      readNumber(o.protein_g_target, `${path}.protein_g_target`, issues, 150),
    ),
    carbs_g_target: Math.max(0, readNumber(o.carbs_g_target, `${path}.carbs_g_target`, issues, 200)),
    fat_g_target: Math.max(0, readNumber(o.fat_g_target, `${path}.fat_g_target`, issues, 60)),
    targets_source: targetsSource,
  };
}

function readTargets(v: unknown, path: string, issues: ShapeIssues): NutritionTargets | null {
  const o = readObjectOrNull(v, path, issues);
  if (!o) return null;
  return {
    kcal_target: Math.max(0, readNumber(o.kcal_target, `${path}.kcal_target`, issues, 2000)),
    protein_g_target: Math.max(
      0,
      readNumber(o.protein_g_target, `${path}.protein_g_target`, issues, 150),
    ),
    carbs_g_target: Math.max(0, readNumber(o.carbs_g_target, `${path}.carbs_g_target`, issues, 200)),
    fat_g_target: Math.max(0, readNumber(o.fat_g_target, `${path}.fat_g_target`, issues, 60)),
  };
}

function readNutritionLog(raw: unknown, path: string, issues: ShapeIssues): NutritionLog | null {
  if (!isPlainObject(raw)) {
    noteIssue(issues, path, 'expected a food-log object');
    return null;
  }
  return {
    id: readString(raw.id, `${path}.id`, issues, `log-${path}`),
    logged_on: readString(raw.logged_on, `${path}.logged_on`, issues, ''),
    meal_slot: readEnum(raw.meal_slot, `${path}.meal_slot`, issues, MEAL_SLOT_VALUES, 'snack'),
    food_id: readStringOrNull(raw.food_id, `${path}.food_id`, issues),
    custom_name: readStringOrNull(raw.custom_name, `${path}.custom_name`, issues),
    quantity_g: readNumberOrNull(raw.quantity_g, `${path}.quantity_g`, issues),
    // Macros are summed and rendered directly — one NaN here poisons the whole day's ring.
    kcal: Math.max(0, readNumber(raw.kcal, `${path}.kcal`, issues, 0)),
    protein_g: Math.max(0, readNumber(raw.protein_g, `${path}.protein_g`, issues, 0)),
    carbs_g: Math.max(0, readNumber(raw.carbs_g, `${path}.carbs_g`, issues, 0)),
    fat_g: Math.max(0, readNumber(raw.fat_g, `${path}.fat_g`, issues, 0)),
  };
}

function readLogsByDate(
  v: unknown,
  path: string,
  issues: ShapeIssues,
): Record<string, NutritionLog[]> {
  if (v === undefined || v === null) return {};
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected an object keyed by YYYY-MM-DD');
    return {};
  }
  const out: Record<string, NutritionLog[]> = {};
  for (const [date, logs] of Object.entries(v)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      noteIssue(issues, `${path}.${date}`, 'expected a YYYY-MM-DD key');
      continue;
    }
    if (!Array.isArray(logs)) {
      noteIssue(issues, `${path}.${date}`, 'expected an array of food logs');
      continue;
    }
    out[date] = readArray(logs, `${path}.${date}`, issues, (raw, p) =>
      readNutritionLog(raw, p, issues),
    );
  }
  return out;
}

function readWeights(v: unknown, path: string, issues: ShapeIssues): WeightEntry[] {
  const entries = readArray(v, path, issues, (raw, p) => {
    if (!isPlainObject(raw)) {
      noteIssue(issues, p, 'expected a { date, kg } object');
      return null;
    }
    const date = nonEmptyString(raw.date);
    const kg = typeof raw.kg === 'number' && Number.isFinite(raw.kg) ? raw.kg : null;
    if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      noteIssue(issues, `${p}.date`, 'expected a YYYY-MM-DD string');
      return null;
    }
    if (kg === null || kg <= 0) {
      noteIssue(issues, `${p}.kg`, 'expected a positive finite number');
      return null;
    }
    return { date, kg };
  });
  return entries.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* The onboarding draft is a wide, evolving bag of optional fields. Rather than restate all 28,
 * enforce the shape that MATTERS: it must be an object, its numbers must be finite, and its lists
 * must be lists — everything downstream reads it with `?.` and its own defaults. */
const DRAFT_NULLABLE_NUMBERS = [
  'days_per_week',
  'session_minutes',
  'height_cm',
  'weight_kg',
  'kcal_target',
  'protein_g_target',
  'carbs_g_target',
  'fat_g_target',
] as const;
const DRAFT_NUMBERS = ['meals_per_day'] as const;
const DRAFT_NUMBER_ARRAYS = ['preferred_days'] as const;
const DRAFT_STRING_ARRAYS = [
  'equipment_slugs',
  'loved_equipment_slugs',
  'allergies',
  'body_areas',
] as const;
const DRAFT_OBJECT_ARRAYS = [
  'favorites',
  'avoid_foods',
  'movement_exclusions',
  'excluded_exercises',
] as const;

function readDraft(v: unknown, path: string, issues: ShapeIssues): Partial<OnboardingDraft> {
  if (v === undefined || v === null) return {};
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected an object');
    return {};
  }
  const draft: Record<string, unknown> = { ...v };
  for (const k of DRAFT_NULLABLE_NUMBERS) {
    if (draft[k] !== undefined) draft[k] = readNumberOrNull(draft[k], `${path}.${k}`, issues);
  }
  for (const k of DRAFT_NUMBERS) {
    if (draft[k] !== undefined) draft[k] = readNumber(draft[k], `${path}.${k}`, issues, 0);
  }
  for (const k of DRAFT_NUMBER_ARRAYS) {
    if (draft[k] !== undefined) draft[k] = readNumberArray(draft[k], `${path}.${k}`, issues);
  }
  for (const k of DRAFT_STRING_ARRAYS) {
    if (draft[k] !== undefined) draft[k] = readStringArray(draft[k], `${path}.${k}`, issues);
  }
  for (const k of DRAFT_OBJECT_ARRAYS) {
    if (draft[k] !== undefined) {
      draft[k] = readArray(draft[k], `${path}.${k}`, issues, (raw, p) => {
        if (isPlainObject(raw)) return raw;
        noteIssue(issues, p, 'expected an object');
        return null;
      });
    }
  }
  return draft as Partial<OnboardingDraft>;
}

/* --------------------------------------------------------------------- the two entry points */

/**
 * Coerce ANY value into a usable {@link DemoState}: repair what can be repaired, drop what cannot.
 * Never throws. Pass an `issues` array to learn whether anything had to be touched.
 */
export function normalizeDemoState(value: unknown, issues: ShapeIssues = []): DemoState {
  if (!isPlainObject(value)) {
    noteIssue(issues, 'state', 'expected an object');
    return defaultState();
  }
  if (value.version !== undefined && value.version !== 1) {
    noteIssue(issues, 'state.version', 'expected 1');
  }
  return {
    version: 1,
    userId: readStringOrNull(value.userId, 'state.userId', issues),
    onboardingStep: readEnum(
      value.onboardingStep,
      'state.onboardingStep',
      issues,
      ONBOARDING_STEP_VALUES,
      'welcome',
    ),
    draft: readDraft(value.draft, 'state.draft', issues),
    completedAt: readStringOrNull(value.completedAt, 'state.completedAt', issues),
    profile: readProfile(value.profile, 'state.profile', issues),
    nutritionProfile: readNutritionProfile(value.nutritionProfile, 'state.nutritionProfile', issues),
    routine: readRoutine(value.routine, 'state.routine', issues),
    targets: readTargets(value.targets, 'state.targets', issues),
    logsByDate: readLogsByDate(value.logsByDate, 'state.logsByDate', issues),
    weights: readWeights(value.weights, 'state.weights', issues),
    volumeTargets: readVolumeTargets(value.volumeTargets, 'state.volumeTargets', issues),
    quickSession: readQuickSession(value.quickSession, 'state.quickSession', issues),
  };
}

/**
 * Calibrated per-muscle weekly set targets. Values are clamped to the range the evidence supports
 * (see `volumeMath.MED_WEEKLY_SETS` / `MAX_WEEKLY_SETS`) rather than trusted: a hand-edited backup
 * saying `{"quads": 1e9}` must not paint the whole silhouette red forever.
 */
function readVolumeTargets(v: unknown, path: string, issues: ShapeIssues): Record<string, number> {
  if (v === undefined || v === null) return {};
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected an object of muscle → weekly sets');
    return {};
  }
  const out: Record<string, number> = {};
  for (const [slug, raw] of Object.entries(v)) {
    const n = finiteNumber(raw);
    if (n === null) {
      noteIssue(issues, `${path}.${slug}`, 'expected a finite number');
      continue;
    }
    // VOLUME_TARGET_MIN/MAX mirror volumeMath's MED_WEEKLY_SETS / MAX_WEEKLY_SETS. Duplicated as
    // literals so the persistence layer stays free of feature imports.
    const clamped = Math.min(30, Math.max(4, Math.round(n)));
    if (clamped !== n) noteIssue(issues, `${path}.${slug}`, 'out of the supported 4–30 set range');
    out[slug] = clamped;
  }
  return out;
}

/** The transient quick-workout session. Anything malformed simply means "no quick session". */
function readQuickSession(v: unknown, path: string, issues: ShapeIssues): RoutineDay | null {
  if (v === undefined || v === null) return null;
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected a routine-day object or null');
    return null;
  }
  return readRoutineDay(v, path, issues, 0);
}

/**
 * Strict gate for anything crossing the trust boundary (Settings → Import). Runs the same pass as
 * {@link normalizeDemoState} but treats ANY repair as a rejection, so nothing is persisted from a
 * file whose shape we do not fully understand.
 */
export function validateDemoState(
  value: unknown,
): { ok: true; value: DemoState } | { ok: false; error: string } {
  const issues: ShapeIssues = [];
  const state = normalizeDemoState(value, issues);
  if (issues.length > 0) return { ok: false, error: describeIssues(issues) };
  return { ok: true, value: state };
}

/** A frozen default used as the server snapshot (stable identity for useSyncExternalStore). */
const SERVER_STATE: DemoState = defaultState();

let cache: DemoState | null = null;
const listeners = new Set<() => void>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * DEFENSIVE READ. Whatever is on disk — a good state, an older build's shape, a hand-edited file,
 * or outright garbage — comes back as a valid {@link DemoState}. When anything had to be repaired
 * the cleaned shape is written straight back, so the corruption is healed once instead of being
 * re-parsed (and re-crashed on) by every route, tab and reload.
 */
function load(): DemoState {
  if (!isBrowser()) return SERVER_STATE;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      const issues: ShapeIssues = [];
      cache = normalizeDemoState(JSON.parse(raw), issues);
      // Storage-only: `load()` runs inside render (via `getSnapshot`), so it must not notify.
      if (issues.length > 0) writeStorage(cache);
    } else {
      cache = defaultState();
    }
  } catch {
    cache = defaultState();
  }
  return cache;
}

function writeStorage(next: DemoState) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — keep in-memory only */
  }
}

function persist(next: DemoState) {
  cache = next;
  writeStorage(next);
  for (const l of listeners) l();
}

/* ----------------------------------------------------------------- external-store contract */

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Client snapshot (stable ref until a write happens). */
export function getSnapshot(): DemoState {
  return load();
}

/** Server / prerender snapshot (constant identity). */
export function getServerSnapshot(): DemoState {
  return SERVER_STATE;
}

/* ------------------------------------------------------------------------------ mutations */

export function update(mutator: (draft: DemoState) => DemoState): DemoState {
  const next = mutator(load());
  persist(next);
  return next;
}

export function getState(): DemoState {
  return load();
}

/** Seed the fake session (called by "Enter the demo"). Idempotent. */
export function ensureSession(): void {
  update((s) => (s.userId ? s : { ...s, userId: DEMO_USER_ID }));
}

export function hasSession(): boolean {
  return load().userId != null;
}

export function isOnboarded(): boolean {
  return load().completedAt != null;
}

/**
 * Wipe all Local Mode data (used by "Start over" / Settings → "Erase everything").
 *
 * Delegates to {@link eraseAllLocalData}: erasing only `fitforge.demo.v1` left the entire workout
 * log — every logged set, PR and streak — on disk, so a "reset" user still saw their old training
 * history in Progress.
 */
export function resetDemo(): void {
  eraseAllLocalData();
}

/* ------------------------------------------------------------------------ onboarding draft */

export function saveDraft(draft: Partial<OnboardingDraft>, step: OnboardingStep): void {
  update((s) => ({ ...s, draft: { ...s.draft, ...draft }, onboardingStep: step }));
}

/** Merge a partial draft without moving the resume pointer (used by early name capture). */
export function patchDraft(draft: Partial<OnboardingDraft>): void {
  update((s) => ({ ...s, draft: { ...s.draft, ...draft } }));
}

export function loadDraft(): Partial<OnboardingDraft> {
  return load().draft;
}

/* ═══════════════════════════════════════════ Local Mode backup / restore / erase (§5.1, P2-16)
 *
 * Local Mode owns SEVERAL `localStorage` keys, not one: the demo state here, WS-F's workout log
 * (`fitforge.workoutlog.v1` — the source of every PR, streak and analytics number), and small
 * ancillary caches (recent exercises, coach answers). A backup covering only the first key is a
 * backup that silently loses the user's entire training history, and an "erase everything" that
 * clears only the first key leaves that history on disk.
 *
 * So: ONE bundle, every key, validated on the way in.
 */

/** Everything under this prefix belongs to Local Mode and is covered by backup + erase. */
const LOCAL_KEY_PREFIX = 'fitforge.';
const BACKUP_FORMAT = 'fitforge.backup';
const BACKUP_VERSION = 2;

/** Keys with a dedicated, validated section; every other `fitforge.*` key rides in `extras`. */
const FIRST_CLASS_KEYS: readonly string[] = [DEMO_STORAGE_KEY, WORKOUT_LOG_KEY];
const MAX_EXTRA_KEYS = 32;
const MAX_EXTRA_BYTES = 512 * 1024;

export interface LocalBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  demo: DemoState;
  workoutLog: LogState;
  /** other `fitforge.*` keys (opaque caches), kept as raw JSON strings */
  extras: Record<string, string>;
}

function isLocalKey(key: string): boolean {
  return key.startsWith(LOCAL_KEY_PREFIX);
}

/** Every `fitforge.*` key currently in localStorage (snapshotted before any mutation). */
function localKeys(): string[] {
  if (!isBrowser()) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && isLocalKey(k)) keys.push(k);
    }
  } catch {
    /* private mode */
  }
  return keys;
}

function readExtras(): Record<string, string> {
  const extras: Record<string, string> = {};
  if (!isBrowser()) return extras;
  for (const key of localKeys()) {
    if (FIRST_CLASS_KEYS.includes(key)) continue;
    if (Object.keys(extras).length >= MAX_EXTRA_KEYS) break;
    try {
      const value = window.localStorage.getItem(key);
      if (typeof value === 'string' && value.length <= MAX_EXTRA_BYTES) extras[key] = value;
    } catch {
      /* skip unreadable key */
    }
  }
  return extras;
}

/**
 * Serialize EVERY Local Mode key into a single pretty-printed backup bundle
 * (Settings → Export data): the demo state, the full workout log, and any ancillary
 * `fitforge.*` caches.
 */
export function exportAllState(): string {
  const bundle: LocalBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    demo: load(),
    workoutLog: readWorkoutLog(),
    extras: readExtras(),
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Restore every Local Mode key from a backup produced by {@link exportAllState}.
 *
 * Accepts BOTH shapes:
 *   • v2 bundle — `{ format: "fitforge.backup", version: 2, demo, workoutLog, extras }`
 *   • v1 backup — a bare `DemoState` (what older builds exported). The workout log is left alone:
 *                 an old file carries no history to restore, and wiping it would destroy data the
 *                 user still has.
 *
 * NOTHING is written unless every section validates. On failure the previous state is untouched
 * and a specific, user-actionable reason is returned.
 */
export function importAllState(raw: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON. Pick a FitForge backup file.' };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'That backup is not a FitForge backup object.' };
  }

  const isBundle = parsed.format === BACKUP_FORMAT;
  if (!isBundle && parsed.version !== 1) {
    return {
      ok: false,
      error: 'Unrecognised backup format — expected a file exported from FitForge Settings.',
    };
  }
  if (isBundle && parsed.version !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version ${String(parsed.version)} (expected ${BACKUP_VERSION}).`,
    };
  }

  /* -- validate EVERYTHING before touching storage ------------------------------------------ */
  const demoResult = validateDemoState(isBundle ? parsed.demo : parsed);
  if (!demoResult.ok) {
    return { ok: false, error: `Backup is malformed — ${demoResult.error}. Nothing was changed.` };
  }

  let nextLog: LogState | null = null;
  if (isBundle && parsed.workoutLog !== undefined) {
    const logResult = validateWorkoutLog(parsed.workoutLog);
    if (!logResult.ok) {
      return {
        ok: false,
        error: `Backup is malformed — workoutLog ${logResult.error}. Nothing was changed.`,
      };
    }
    nextLog = logResult.value;
  }

  const nextExtras: [string, string][] = [];
  if (isBundle && parsed.extras !== undefined) {
    if (!isPlainObject(parsed.extras)) {
      return { ok: false, error: 'Backup is malformed — `extras` must be an object.' };
    }
    for (const [key, value] of Object.entries(parsed.extras)) {
      if (!isLocalKey(key) || FIRST_CLASS_KEYS.includes(key)) continue; // ignore foreign keys
      if (typeof value !== 'string' || value.length > MAX_EXTRA_BYTES) continue;
      try {
        JSON.parse(value); // caches are JSON; anything else is dropped rather than restored
      } catch {
        continue;
      }
      nextExtras.push([key, value]);
      if (nextExtras.length >= MAX_EXTRA_KEYS) break;
    }
  }

  /* -- commit ------------------------------------------------------------------------------- */
  persist(demoResult.value);
  if (nextLog) replaceWorkoutLog(nextLog);
  if (isBrowser()) {
    for (const [key, value] of nextExtras) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* quota — the important sections are already in */
      }
    }
  }
  return { ok: true };
}

/**
 * Erase EVERY Local Mode key: the demo state, the workout log and every other `fitforge.*` key
 * this app owns. This is what "Yes, erase everything" must actually do.
 */
export function eraseAllLocalData(): void {
  const keys = localKeys();
  cache = defaultState();
  clearWorkoutLog();
  if (isBrowser()) {
    for (const key of keys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
  for (const l of listeners) l();
}

/** @deprecated Use {@link exportAllState} — kept so existing callers get the full bundle too. */
export function exportState(): string {
  return exportAllState();
}

/** @deprecated Use {@link importAllState}, which explains *why* a file was rejected. */
export function importState(raw: string): boolean {
  return importAllState(raw).ok;
}

/* ---------------------------------------------------------------------------- food logging */

export function getLogsFor(date: string): NutritionLog[] | undefined {
  return load().logsByDate[date];
}

export function setLogsFor(date: string, logs: NutritionLog[]): void {
  update((s) => ({ ...s, logsByDate: { ...s.logsByDate, [date]: logs } }));
}

/* --------------------------------------------------------------------------- weight logging */

/** Upsert a body-weight entry for a date; keeps the list sorted ascending. */
export function logWeight(date: string, kg: number): void {
  update((s) => {
    const others = s.weights.filter((w) => w.date !== date);
    const next = [...others, { date, kg }].sort((a, b) => (a.date < b.date ? -1 : 1));
    return { ...s, weights: next };
  });
}

/* ------------------------------------------------------------------ calibrated volume targets */

/**
 * Set one muscle's weekly set target. Passing `null` clears the calibration, which puts that
 * muscle back on FitForge's recommendation — deleting the key rather than storing the current
 * recommended value, so the target keeps tracking the recommendation as the profile changes.
 */
export function setVolumeTarget(muscle: string, sets: number | null): void {
  update((s) => {
    const next = { ...s.volumeTargets };
    if (sets === null) delete next[muscle];
    else next[muscle] = Math.min(30, Math.max(4, Math.round(sets)));
    return { ...s, volumeTargets: next };
  });
}

/** Drop every calibration at once — "use the recommendations for everything". */
export function resetVolumeTargets(): void {
  update((s) => ({ ...s, volumeTargets: {} }));
}

/* ------------------------------------------------------------------------ the quick session */

/** Stash the session the quick-workout picker built; `/workout/quick` reads it. */
export function setQuickSession(day: RoutineDay | null): void {
  update((s) => ({ ...s, quickSession: day }));
}
