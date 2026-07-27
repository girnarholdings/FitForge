/**
 * Runtime enum value lists (BLUEPRINT §4.1). These are the single runtime source used by the
 * zod schemas in `../schemas`. The `satisfies readonly <Union>[]` assertions guarantee each
 * list stays exhaustive and in sync with the string-literal unions in `./database.ts`.
 */
import type {
  GoalType,
  ExperienceLevel,
  TrainingLocation,
  UnitSystem,
  SexType,
  EquipmentCategory,
  MuscleRegion,
  MovementPattern,
  MechanicsType,
  DifficultyLevel,
  MuscleRole,
  PreferenceType,
  ExclusionReason,
  RoutineSource,
  FoodCategory,
  DietType,
  MealSlot,
  TargetsSource,
  PhotoPose,
} from './database.js';

export const GOAL_TYPES = [
  'strength',
  'hypertrophy',
  'fat_loss',
  'endurance',
  'general_health',
] as const satisfies readonly GoalType[];

export const EXPERIENCE_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
] as const satisfies readonly ExperienceLevel[];

export const TRAINING_LOCATIONS = [
  'home',
  'commercial_gym',
  'minimal',
] as const satisfies readonly TrainingLocation[];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const satisfies readonly UnitSystem[];

export const SEX_TYPES = [
  'male',
  'female',
  'other',
  'prefer_not_to_say',
] as const satisfies readonly SexType[];

export const EQUIPMENT_CATEGORIES = [
  'free_weights',
  'machines',
  'cables',
  'bodyweight_accessories',
  'cardio',
  'benches_racks',
  'other',
] as const satisfies readonly EquipmentCategory[];

export const MUSCLE_REGIONS = ['upper', 'lower', 'core'] as const satisfies readonly MuscleRegion[];

export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'elbow_flexion',
  'elbow_extension',
  'shoulder_isolation',
  'core_flexion',
  'core_stability',
  'carry',
  'hip_extension_iso',
  'knee_flexion_iso',
  'knee_extension_iso',
  'calf_raise',
  'cardio',
  // The 59→91 catalog expansion introduced three patterns that are trained, not lifted:
  // 'conditioning' (burpee, thruster, wall-ball — metabolic work with no single hinge/push
  // classification), 'mobility' (the dynamic pre-session ramp) and 'static_stretch' (the
  // post-session cooldown). They are separate patterns rather than squeezed into an existing
  // one because the prep builder keys off them to pick warm-up vs cooldown movements.
  'conditioning',
  'mobility',
  'static_stretch',
] as const satisfies readonly MovementPattern[];

export const MECHANICS_TYPES = [
  'compound',
  'isolation',
] as const satisfies readonly MechanicsType[];

export const DIFFICULTY_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
] as const satisfies readonly DifficultyLevel[];

export const MUSCLE_ROLES = ['primary', 'secondary'] as const satisfies readonly MuscleRole[];

export const PREFERENCE_TYPES = [
  'favorite',
  'excluded',
] as const satisfies readonly PreferenceType[];

export const EXCLUSION_REASONS = [
  'injury',
  'dislike',
  'no_equipment',
  'other',
] as const satisfies readonly ExclusionReason[];

export const ROUTINE_SOURCES = [
  'generated',
  'custom',
] as const satisfies readonly RoutineSource[];

export const FOOD_CATEGORIES = [
  'protein',
  'grain',
  'vegetable',
  'fruit',
  'dairy',
  'fat_oil',
  'legume',
  'nut_seed',
  'beverage',
  'snack',
  'condiment',
] as const satisfies readonly FoodCategory[];

export const DIET_TYPES = [
  'omnivore',
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'mediterranean',
  'none',
] as const satisfies readonly DietType[];

export const MEAL_SLOTS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const satisfies readonly MealSlot[];

export const TARGETS_SOURCES = [
  'suggested',
  'custom',
] as const satisfies readonly TargetsSource[];

export const PHOTO_POSES = ['front', 'side', 'back'] as const satisfies readonly PhotoPose[];

/** Body-area chip slugs used on onboarding screen 8a (§2.2 / §7.2.2). */
export const BODY_AREAS = [
  'shoulders',
  'lower_back',
  'knees',
  'wrists',
  'hips',
  'neck',
  'elbows',
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

/** Diet-tag open vocabulary seen in seed foods (§3.1 / §6.6). */
export const DIET_TAGS = [
  'vegan',
  'vegetarian',
  'pescatarian_ok',
  'keto_friendly',
  'gluten_free',
  'dairy_free',
] as const;

/** Allergen-tag vocabulary (§3.1 / §6.6). */
export const ALLERGEN_TAGS = [
  'peanut',
  'tree_nut',
  'dairy',
  'gluten',
  'egg',
  'soy',
  'shellfish',
  'fish',
  'sesame',
] as const;
export type AllergenTag = (typeof ALLERGEN_TAGS)[number];
