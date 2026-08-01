import type { ComponentType } from 'react';
import type { OnboardingStep } from '@fitforge/shared/schemas';
import { WelcomeStep } from './WelcomeStep';
import { GoalsStep } from './GoalsStep';
import { ExperienceStep } from './ExperienceStep';
import { ScheduleStep } from './ScheduleStep';
import { SplitStep } from './SplitStep';
import { ProgressionStep } from './ProgressionStep';
import { LocationStep } from './LocationStep';
import { EquipmentStep } from './EquipmentStep';
import { ExercisePrefsStep } from './ExercisePrefsStep';
import { ExclusionsStep } from './ExclusionsStep';
import { BodyMetricsStep } from './BodyMetricsStep';
import { NutritionPrefsStep } from './NutritionPrefsStep';
import { TargetsReviewStep } from './TargetsReviewStep';
import { PlanPreviewStep } from './PlanPreviewStep';
import { DoneStep } from './DoneStep';
import { AiPhotosStep } from './AiPhotosStep';
import { AiConfirmStep } from './AiConfirmStep';

/** Registry mapping each §2.2 step id to its screen component. */
export const STEP_COMPONENTS: Record<OnboardingStep, ComponentType> = {
  welcome: WelcomeStep,
  goals: GoalsStep,
  experience: ExperienceStep,
  schedule: ScheduleStep,
  split: SplitStep,
  progression: ProgressionStep,
  location: LocationStep,
  equipment: EquipmentStep,
  exercise_prefs: ExercisePrefsStep,
  exclusions: ExclusionsStep,
  body_metrics: BodyMetricsStep,
  nutrition_prefs: NutritionPrefsStep,
  targets_review: TargetsReviewStep,
  plan_preview: PlanPreviewStep,
  done: DoneStep,
  // AI-Mode fork (docs/AIMODE-CONTRACT.md): photos → confirm, then back into goals/plan_preview.
  ai_photos: AiPhotosStep,
  ai_confirm: AiConfirmStep,
};
