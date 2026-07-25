/**
 * Zod schemas for every onboarding form step (BLUEPRINT §2.2 state machine).
 *
 * These validate the client-held draft for each screen before it is written through to Supabase.
 * Field names match the `profiles` / `nutrition_profiles` / preference table columns (§4.3) so a
 * validated step can be spread directly into a PATCH/upsert.
 */
import { z } from 'zod';
import {
  GOAL_TYPES,
  EXPERIENCE_LEVELS,
  TRAINING_LOCATIONS,
  UNIT_SYSTEMS,
  SEX_TYPES,
  DIET_TYPES,
  MOVEMENT_PATTERNS,
  EXCLUSION_REASONS,
  MEAL_SLOTS,
  TARGETS_SOURCES,
  BODY_AREAS,
} from '../types/enums.js';

const uuid = z.string().uuid();

/** Onboarding state-machine step ids (§2.2). `profiles.onboarding_step` resume pointer. */
export const ONBOARDING_STEPS = [
  'welcome',
  'auth',
  'goals',
  'experience',
  'schedule',
  // WS-5: choose a named program from the split library (or let FitForge pick).
  'split',
  'location',
  'equipment',
  'exercise_prefs',
  'exclusions',
  'body_metrics',
  'nutrition_prefs',
  'targets_review',
  'plan_preview',
  'done',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);

/* -------------------------------------------------------------- step 2 · goals */

export const goalsStepSchema = z
  .object({
    primary_goal: z.enum(GOAL_TYPES),
    secondary_goal: z.enum(GOAL_TYPES).nullish(),
  })
  .refine((v) => v.secondary_goal == null || v.secondary_goal !== v.primary_goal, {
    message: 'secondary_goal must differ from primary_goal',
    path: ['secondary_goal'],
  });
export type GoalsStep = z.infer<typeof goalsStepSchema>;

/* -------------------------------------------------------------- step 3 · experience */

export const experienceStepSchema = z.object({
  experience_level: z.enum(EXPERIENCE_LEVELS),
});
export type ExperienceStep = z.infer<typeof experienceStepSchema>;

/* -------------------------------------------------------------- step 4 · schedule */

export const SESSION_MINUTE_OPTIONS = [30, 45, 60, 75, 90] as const;

export const scheduleStepSchema = z.object({
  days_per_week: z.number().int().min(1).max(7),
  /** 0 = Mon … 6 = Sun (§4.3). Unique weekday indices. */
  preferred_days: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .refine((d) => new Set(d).size === d.length, { message: 'preferred_days must be unique' }),
  session_minutes: z
    .number()
    .int()
    .refine((n) => (SESSION_MINUTE_OPTIONS as readonly number[]).includes(n), {
      message: 'session_minutes must be one of 30/45/60/75/90',
    }),
});
export type ScheduleStep = z.infer<typeof scheduleStepSchema>;

/* -------------------------------------------------------------- step 5 · location */

export const locationStepSchema = z.object({
  training_location: z.enum(TRAINING_LOCATIONS),
});
export type LocationStep = z.infer<typeof locationStepSchema>;

/* -------------------------------------------------------------- step 6 · equipment */

export const equipmentStepSchema = z.object({
  /** equipment slugs the user owns/has access to */
  equipment_slugs: z.array(z.string().min(1)),
});
export type EquipmentStep = z.infer<typeof equipmentStepSchema>;

/* -------------------------------------------------------------- step 7 · exercise prefs */

export const exercisePrefsStepSchema = z.object({
  /** exercise ids marked favorite → user_exercise_preferences(preference='favorite') */
  favorite_exercise_ids: z.array(uuid).default([]),
});
export type ExercisePrefsStep = z.infer<typeof exercisePrefsStepSchema>;

/* -------------------------------------------------------------- step 8 · exclusions */

export const movementExclusionSchema = z.object({
  movement_pattern: z.enum(MOVEMENT_PATTERNS),
  reason: z.enum(EXCLUSION_REASONS).default('injury'),
  source_body_area: z.enum(BODY_AREAS).nullish(),
});

export const excludedExerciseSchema = z.object({
  exercise_id: uuid,
  exclusion_reason: z.enum(EXCLUSION_REASONS).default('dislike'),
  preferred_substitute_id: uuid.nullish(),
});

export const exclusionsStepSchema = z.object({
  /** body-area chips picked on screen 8a */
  body_areas: z.array(z.enum(BODY_AREAS)).default([]),
  /** pattern-level exclusions derived from body areas (+ user un-checks) → user_movement_exclusions */
  movement_exclusions: z.array(movementExclusionSchema).default([]),
  /** individual exercises to avoid → user_exercise_preferences(preference='excluded') */
  excluded_exercises: z.array(excludedExerciseSchema).default([]),
});
export type ExclusionsStep = z.infer<typeof exclusionsStepSchema>;

/* -------------------------------------------------------------- step 9 · body metrics */

export const bodyMetricsStepSchema = z.object({
  sex: z.enum(SEX_TYPES).nullish(),
  /** ISO date (YYYY-MM-DD) */
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'birthdate must be YYYY-MM-DD')
    .nullish(),
  height_cm: z.number().min(60).max(260).nullish(),
  weight_kg: z.number().min(25).max(400).nullish(),
  unit_system: z.enum(UNIT_SYSTEMS).default('metric'),
});
export type BodyMetricsStep = z.infer<typeof bodyMetricsStepSchema>;

/* -------------------------------------------------------------- step 10 · nutrition prefs */

export const nutritionPrefsStepSchema = z.object({
  diet_type: z.enum(DIET_TYPES).default('none'),
  /** allergen tag slugs (§6.6 allergen vocabulary) */
  allergies: z.array(z.string().min(1)).default([]),
  meals_per_day: z.number().int().min(1).max(6).default(3),
  /** food ids to avoid → user_food_preferences(preference='excluded') */
  avoid_food_ids: z.array(uuid).default([]),
});
export type NutritionPrefsStep = z.infer<typeof nutritionPrefsStepSchema>;

/* -------------------------------------------------------------- step 11 · targets review */

export const targetsReviewStepSchema = z.object({
  kcal_target: z.number().int().min(800).max(6000),
  protein_g_target: z.number().int().min(0).max(400),
  carbs_g_target: z.number().int().min(0).max(1000),
  fat_g_target: z.number().int().min(0).max(400),
  targets_source: z.enum(TARGETS_SOURCES).default('suggested'),
});
export type TargetsReviewStep = z.infer<typeof targetsReviewStepSchema>;

/* -------------------------------------------------------------- meal_slot helper (§2.3 log food) */

export const mealSlotSchema = z.enum(MEAL_SLOTS);

/** All step schemas keyed by step id, for generic step-by-step validation. */
export const onboardingStepSchemas = {
  goals: goalsStepSchema,
  experience: experienceStepSchema,
  schedule: scheduleStepSchema,
  location: locationStepSchema,
  equipment: equipmentStepSchema,
  exercise_prefs: exercisePrefsStepSchema,
  exclusions: exclusionsStepSchema,
  body_metrics: bodyMetricsStepSchema,
  nutrition_prefs: nutritionPrefsStepSchema,
  targets_review: targetsReviewStepSchema,
} as const;
