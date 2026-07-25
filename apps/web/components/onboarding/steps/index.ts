import type { ComponentType } from 'react';
import type { OnboardingStep } from '@fitforge/shared/schemas';
import { WelcomeStep } from './WelcomeStep';
import { AuthStep } from './AuthStep';
import { GoalsStep } from './GoalsStep';
import { ExperienceStep } from './ExperienceStep';
import { ScheduleStep } from './ScheduleStep';
import { SplitStep } from './SplitStep';
import { LocationStep } from './LocationStep';
import { EquipmentStep } from './EquipmentStep';
import { ExercisePrefsStep } from './ExercisePrefsStep';
import { ExclusionsStep } from './ExclusionsStep';
import { BodyMetricsStep } from './BodyMetricsStep';
import { NutritionPrefsStep } from './NutritionPrefsStep';
import { TargetsReviewStep } from './TargetsReviewStep';
import { PlanPreviewStep } from './PlanPreviewStep';
import { DoneStep } from './DoneStep';

/** Registry mapping each §2.2 step id to its screen component. */
export const STEP_COMPONENTS: Record<OnboardingStep, ComponentType> = {
  welcome: WelcomeStep,
  auth: AuthStep,
  goals: GoalsStep,
  experience: ExperienceStep,
  schedule: ScheduleStep,
  split: SplitStep,
  location: LocationStep,
  equipment: EquipmentStep,
  exercise_prefs: ExercisePrefsStep,
  exclusions: ExclusionsStep,
  body_metrics: BodyMetricsStep,
  nutrition_prefs: NutritionPrefsStep,
  targets_review: TargetsReviewStep,
  plan_preview: PlanPreviewStep,
  done: DoneStep,
};
