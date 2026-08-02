import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import type { OnboardingStep } from '@fitforge/shared/schemas';
import { WelcomeStep } from './WelcomeStep';
import { GoalsStep } from './GoalsStep';
import { ExperienceStep } from './ExperienceStep';
import { ScheduleStep } from './ScheduleStep';
import { SplitStep } from './SplitStep';
import { ProgressionStep } from './ProgressionStep';
import { LocationStep } from './LocationStep';
import { BodyMetricsStep } from './BodyMetricsStep';
import { TargetsReviewStep } from './TargetsReviewStep';
import { DoneStep } from './DoneStep';
import { AiPhotosStep } from './AiPhotosStep';
import { AiConfirmStep } from './AiConfirmStep';

/**
 * THE CORPUS-HEAVY STEPS LOAD LAZILY. A static registry shipped every step — and the data each
 * one drags in — on the FIRST onboarding screen: the exercise catalog + pose art (~40 kB gz via
 * ExercisePrefs/Exclusions), the 509-food catalog (~33 kB gz via the food-search steps), and
 * the plan-preview machinery. Measured cost on /onboarding/welcome: ~93 kB gz that a brand-new
 * user paid before answering a single question. As async chunks each loads on step ENTRY —
 * behind the tap that navigates there, where the fetch hides inside the route transition.
 */
const EquipmentStep = dynamic(() => import('./EquipmentStep').then((m) => m.EquipmentStep));
const ExercisePrefsStep = dynamic(
  () => import('./ExercisePrefsStep').then((m) => m.ExercisePrefsStep),
);
const ExclusionsStep = dynamic(() => import('./ExclusionsStep').then((m) => m.ExclusionsStep));
const NutritionPrefsStep = dynamic(
  () => import('./NutritionPrefsStep').then((m) => m.NutritionPrefsStep),
);
const PlanPreviewStep = dynamic(() => import('./PlanPreviewStep').then((m) => m.PlanPreviewStep));

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
