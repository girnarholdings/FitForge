'use client';

/**
 * DEMO MODE plan generation.
 *
 * Turns a completed onboarding draft into the same artefacts the backend RPCs would have produced:
 *   - nutrition targets via the §7.2.4 macros rule (Mifflin–St Jeor), and
 *   - a starter routine via the §7.5 split templates over the fixture catalog, honouring the
 *     user's equipment, movement/exercise exclusions and liked exercises.
 * Results are persisted to the demo store.
 */
import {
  computeNutritionTargets,
  suggestOnboardingDefaults,
  planDays,
  getSplit,
  restSeconds,
  splitNameForDays,
  type RoleSlot,
} from '@fitforge/shared/rules';
import type { GoalType, ExperienceLevel, MovementPattern } from '@fitforge/shared/types';
import {
  EXERCISES,
  type ExerciseFull,
  type Routine,
  type RoutineDay,
  type RoutineExercise,
  type Profile,
  type NutritionProfile,
  type NutritionTargets,
  type Difficulty,
} from '@/components/features/_mock/data';
import type { OnboardingDraft } from '@/components/onboarding/types';
import { getState, update } from './store';
import { DEMO_ROUTINE_ID, demoDayId } from './ids';

export { DEMO_ROUTINE_ID, demoDayId };

function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

const DIFFICULTY_RANK: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

function feasible(ex: ExerciseFull, owned: Set<string>, gymDefault: boolean): boolean {
  if (ex.is_bodyweight_ok) return true;
  if (ex.equipment.length === 0) return true;
  if (owned.size === 0 && gymDefault) return true;
  return ex.equipment.every((group) => group.slugs.some((s) => owned.has(s)));
}

function patternMatches(ex: ExerciseFull, slot: RoleSlot): boolean {
  if (ex.movement_pattern === slot.pattern) return true;
  return (slot.alt ?? []).includes(ex.movement_pattern as MovementPattern);
}

/** Compute nutrition targets for a draft (also used for live previews). */
export function targetsForDraft(draft: Partial<OnboardingDraft>): NutritionTargets & { method: string } {
  const t = computeNutritionTargets({
    sex: draft.sex ?? null,
    weight_kg: draft.weight_kg ?? null,
    height_cm: draft.height_cm ?? null,
    age: ageFromBirthdate(draft.birthdate),
    days_per_week: draft.days_per_week ?? null,
    primary_goal: (draft.primary_goal ?? 'general_health') as GoalType,
    diet_type: draft.diet_type ?? null,
  });
  return {
    kcal_target: t.kcal,
    protein_g_target: t.protein_g,
    carbs_g_target: t.carbs_g,
    fat_g_target: t.fat_g,
    method: t.method,
  };
}

/** Build the starter routine tree from the draft (§7.5). */
export function routineForDraft(draft: Partial<OnboardingDraft>): Routine {
  const goal = (draft.primary_goal ?? 'general_health') as GoalType;
  const experience = (draft.experience_level ?? 'beginner') as ExperienceLevel;
  const defaults = suggestOnboardingDefaults(goal, experience);
  const daysPerWeek = draft.days_per_week ?? defaults.days_per_week;
  const sessionMinutes = draft.session_minutes ?? defaults.session_minutes;
  const preferredDays = draft.preferred_days ?? [];

  const owned = new Set<string>(draft.equipment_slugs ?? []);
  const gymDefault = draft.training_location === 'commercial_gym' || draft.training_location == null;
  const excludedSlugs = new Set<string>((draft.excluded_exercises ?? []).map((e) => e.slug));
  const excludedPatterns = new Set<MovementPattern>(
    (draft.movement_exclusions ?? []).map((m) => m.movement_pattern),
  );
  const favoriteSlugs = new Set<string>((draft.favorites ?? []).map((f) => f.slug));
  const ceiling = DIFFICULTY_RANK[experience as Difficulty] ?? 0;

  // A chosen split (§ WS-5 SPLIT_LIBRARY) supplies the week's day structure. With no split — or
  // the explicit 'auto' sentinel — `planDays` is exactly the old days-per-week behaviour.
  const split = getSplit(draft.split_slug ?? null);
  const plan = planDays({ daysPerWeek, sessionMinutes, preferredDays, split });

  const days: RoutineDay[] = plan.map((planned, dayIdx) => {
    const usedSlugs = new Set<string>();
    const exercises: RoutineExercise[] = [];

    for (const slot of planned.slots) {
      if (excludedPatterns.has(slot.pattern)) continue;

      const candidates = EXERCISES.filter((ex) => {
        if (usedSlugs.has(ex.slug)) return false;
        if (excludedSlugs.has(ex.slug)) return false;
        if (excludedPatterns.has(ex.movement_pattern as MovementPattern)) return false;
        if ((DIFFICULTY_RANK[ex.difficulty] ?? 0) > ceiling + 1) return false;
        if (!patternMatches(ex, slot)) return false;
        if (!feasible(ex, owned, gymDefault)) return false;
        return true;
      });

      if (candidates.length === 0) continue;

      candidates.sort((a, b) => {
        const favA = favoriteSlugs.has(a.slug) ? 1 : 0;
        const favB = favoriteSlugs.has(b.slug) ? 1 : 0;
        if (favA !== favB) return favB - favA;
        // prefer the slot's mechanics hint when present
        if (slot.mechanics) {
          const mA = a.mechanics === slot.mechanics ? 1 : 0;
          const mB = b.mechanics === slot.mechanics ? 1 : 0;
          if (mA !== mB) return mB - mA;
        }
        // prefer the exact primary pattern over an alt
        const pA = a.movement_pattern === slot.pattern ? 1 : 0;
        const pB = b.movement_pattern === slot.pattern ? 1 : 0;
        if (pA !== pB) return pB - pA;
        return b.popularity - a.popularity;
      });

      const pick = candidates[0]!;
      usedSlugs.add(pick.slug);
      const mechanics = pick.mechanics === 'compound' ? 'compound' : 'isolation';
      exercises.push({
        id: `${demoDayId(dayIdx)}-ex-${exercises.length + 1}`,
        position: exercises.length + 1,
        exercise_id: pick.id,
        exercise_slug: pick.slug,
        exercise_name: pick.name,
        image_path: pick.image_path,
        sets: mechanics === 'compound' ? 4 : 3,
        rep_min: defaults.rep_min,
        rep_max: defaults.rep_max,
        target_rpe: 7,
        rest_seconds: restSeconds(goal, mechanics),
        superset_group: null,
        notes: null,
      });
    }

    return {
      id: demoDayId(dayIdx),
      day_index: dayIdx,
      name: planned.name,
      focus: planned.focus,
      weekday: planned.weekday,
      exercises,
    };
  });

  return {
    id: DEMO_ROUTINE_ID,
    name: split ? split.name : `${splitNameForDays(daysPerWeek)} — ${daysPerWeek}-day plan`,
    description: split ? split.description : 'Generated from your onboarding answers.',
    goal,
    source: 'generated',
    is_active: true,
    start_date: new Date().toISOString().slice(0, 10),
    days,
  };
}

function profileForDraft(draft: Partial<OnboardingDraft>): Profile {
  const defaults = suggestOnboardingDefaults(
    (draft.primary_goal ?? 'general_health') as GoalType,
    (draft.experience_level ?? 'beginner') as ExperienceLevel,
  );
  const name = draft.display_name?.trim();
  return {
    display_name: name ? name : null,
    sex: (draft.sex ?? 'prefer_not_to_say') as Profile['sex'],
    birthdate: draft.birthdate ?? '1990-01-01',
    height_cm: draft.height_cm ?? 170,
    unit_system: draft.unit_system ?? 'metric',
    experience_level: (draft.experience_level ?? 'beginner') as Difficulty,
    primary_goal: (draft.primary_goal ?? 'general_health') as GoalType,
    secondary_goal: (draft.secondary_goal ?? null) as Profile['secondary_goal'],
    training_location: (draft.training_location ?? 'commercial_gym') as Profile['training_location'],
    days_per_week: draft.days_per_week ?? defaults.days_per_week,
    session_minutes: draft.session_minutes ?? defaults.session_minutes,
    preferred_days: draft.preferred_days ?? [],
  };
}

function nutritionProfileForDraft(
  draft: Partial<OnboardingDraft>,
  targets: NutritionTargets,
): NutritionProfile {
  return {
    diet_type: (draft.diet_type ?? 'none') as NutritionProfile['diet_type'],
    allergies: draft.allergies ?? [],
    meals_per_day: draft.meals_per_day ?? 3,
    kcal_target: targets.kcal_target,
    protein_g_target: targets.protein_g_target,
    carbs_g_target: targets.carbs_g_target,
    fat_g_target: targets.fat_g_target,
    targets_source: draft.targets_source ?? 'suggested',
  };
}

/**
 * Finish onboarding: compute + persist profile / routine / targets from the draft, stamp the
 * completion contract, and return the generated routine.
 */
export function finalizeOnboarding(draft: Partial<OnboardingDraft>): Routine {
  const targetsFull = targetsForDraft(draft);
  const targets: NutritionTargets = {
    kcal_target: draft.kcal_target ?? targetsFull.kcal_target,
    protein_g_target: draft.protein_g_target ?? targetsFull.protein_g_target,
    carbs_g_target: draft.carbs_g_target ?? targetsFull.carbs_g_target,
    fat_g_target: draft.fat_g_target ?? targetsFull.fat_g_target,
  };
  const routine = routineForDraft(draft);
  const profile = profileForDraft(draft);
  const nutritionProfile = nutritionProfileForDraft(draft, targets);

  update((s) => ({
    ...s,
    draft,
    onboardingStep: 'done',
    completedAt: new Date().toISOString(),
    profile,
    nutritionProfile,
    routine,
    targets,
  }));

  return routine;
}

/**
 * Switch the active training split AFTER onboarding (Workouts → "Change split") and rebuild the
 * routine from the stored draft. Everything else the user told us — equipment, exclusions, liked
 * exercises, session length, preferred weekdays — is honoured exactly as during onboarding.
 *
 * `slug` may be a SPLIT_LIBRARY slug or `'auto'` / null to go back to the automatic day plan.
 */
export function applySplit(slug: string | null): Routine {
  const state = getState();
  const draft: Partial<OnboardingDraft> = { ...state.draft, split_slug: slug };
  const routine = routineForDraft(draft);
  update((s) => ({ ...s, draft, routine }));
  return routine;
}
