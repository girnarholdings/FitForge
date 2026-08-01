import { ONBOARDING_STEPS, type OnboardingStep } from '@fitforge/shared/schemas';

export type { OnboardingStep };
export { ONBOARDING_STEPS };

export interface StepMeta {
  step: OnboardingStep;
  /** screen number from §2.2 (0..14); `done` is terminal */
  screen: number;
  title: string;
  subtitle?: string;
  /** show the progress bar / back+next chrome (the questionnaire screens) */
  wizard: boolean;
  /** subtitle override when the step renders inside the AI-Mode chain (a step the fork reuses) */
  aiSubtitle?: string;
}

/** §2.2 screen-by-screen metadata (order is contractual). */
export const STEP_META: Record<OnboardingStep, StepMeta> = {
  welcome: { step: 'welcome', screen: 0, title: 'Welcome to FitForge', wizard: false },
  goals: {
    step: 'goals',
    screen: 1,
    title: 'What are you training for?',
    subtitle: 'Tap every goal that applies. The first one you pick leads your plan.',
    // AI Mode reuses this screen with a cap: up to three, ranked (contract "ranked top-3 goals").
    aiSubtitle: 'Pick up to three, in order. The first one you tap leads your plan.',
    wizard: true,
  },
  experience: {
    step: 'experience',
    screen: 2,
    title: 'How much lifting experience do you have?',
    subtitle: 'Be honest — this sets your starting difficulty and volume.',
    wizard: true,
  },
  schedule: {
    step: 'schedule',
    screen: 3,
    title: 'When can you train?',
    subtitle: 'Days per week, which days, and how long each session runs.',
    wizard: true,
  },
  // Moved BEFORE `split` (was screen 9): liked lifts feed split scoring on the next screen, so
  // asking afterwards was backwards (docs/RESEARCH-PREFERENCES.md §1).
  exercise_prefs: {
    step: 'exercise_prefs',
    screen: 4,
    title: 'Which lifts do you actually enjoy?',
    subtitle:
      'Pick your top five, in order — they shape which split we suggest and what goes in it.',
    wizard: true,
  },
  split: {
    step: 'split',
    screen: 5,
    title: 'Pick your training split',
    subtitle: 'Real programs, matched to your days and level. One is picked already.',
    wizard: true,
  },
  progression: {
    step: 'progression',
    screen: 6,
    title: 'How should your sets progress?',
    subtitle: 'This decides the weight and reps of every single set. One is picked for you already.',
    wizard: true,
  },
  location: {
    step: 'location',
    screen: 7,
    title: 'Where will you train?',
    subtitle: "We'll preselect the equipment that fits.",
    wizard: true,
  },
  equipment: {
    step: 'equipment',
    screen: 8,
    title: 'What equipment do you have?',
    subtitle: 'Swipe right if you have it, up if you love it. Presets work too.',
    wizard: true,
  },
  exclusions: {
    step: 'exclusions',
    screen: 9,
    title: 'Anything we should protect?',
    subtitle: "Pick sore areas or exercises to avoid — we'll substitute automatically.",
    wizard: true,
  },
  body_metrics: {
    step: 'body_metrics',
    screen: 10,
    title: 'A few body basics',
    subtitle: 'Used to compute your calorie and macro targets. All optional.',
    wizard: true,
  },
  nutrition_prefs: {
    step: 'nutrition_prefs',
    screen: 11,
    title: 'How do you eat?',
    subtitle: 'Diet style, allergies, and anything to avoid.',
    wizard: true,
  },
  targets_review: {
    step: 'targets_review',
    screen: 12,
    title: 'Your daily targets',
    subtitle: 'Computed from your profile. Adjust if you like.',
    wizard: true,
  },
  plan_preview: {
    step: 'plan_preview',
    screen: 13,
    title: 'Your starter plan',
    subtitle: 'Generated from everything you told us. Swap anything.',
    wizard: true,
  },
  done: { step: 'done', screen: 14, title: "You're all set", wizard: false },
  // AI-MODE FORK (docs/AIMODE-CONTRACT.md). Non-wizard: both screens own their layout the way
  // welcome/done do — the guidance panel and the confirm chips need the whole viewport, and the
  // classic progress bar would count screens the AI path never visits.
  ai_photos: { step: 'ai_photos', screen: 15, title: 'Four photos. About thirty seconds.', wizard: false },
  ai_confirm: { step: 'ai_confirm', screen: 16, title: 'Here’s what we read', wizard: false },
};

/** The questionnaire steps that render progress + back/next chrome. */
export const WIZARD_STEPS = ONBOARDING_STEPS.filter((s) => STEP_META[s].wizard);

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = stepIndex(step);
  return ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, i + 1)]!;
}

export function prevStep(step: OnboardingStep): OnboardingStep {
  const i = stepIndex(step);
  return ONBOARDING_STEPS[Math.max(0, i - 1)]!;
}

/** 1-based position among wizard steps, for the progress bar. */
export function wizardProgress(step: OnboardingStep): { current: number; total: number } {
  const idx = WIZARD_STEPS.indexOf(step);
  return { current: idx < 0 ? 0 : idx + 1, total: WIZARD_STEPS.length };
}

/* ═══════════════════════════════════════════════════════════════════════ AI-Mode chain */

/**
 * The AI-Mode step order (contract "Onboarding fork"): photos → confirm → ranked goals →
 * plan preview → done. Everything the classic questionnaire asks screen-by-screen either comes
 * out of the scan (age/weight/body-fat buckets), is asked on ai_confirm (height, sex, diet,
 * where you train, experience), or is defaulted with editable-later copy (schedule).
 *
 * A SEPARATE chain rather than entries spliced into ONBOARDING_STEPS: next/prev are index-based
 * over that array, so splicing would reroute the classic flow, and Law 1 freezes it.
 */
export const AI_MODE_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'ai_photos',
  'ai_confirm',
  'goals',
  'plan_preview',
  'done',
];

function aiIndex(step: OnboardingStep): number {
  return AI_MODE_STEPS.indexOf(step);
}

/** Mode-aware next. With `aiMode` false this is exactly {@link nextStep} — Old School untouched. */
export function nextStepInMode(step: OnboardingStep, aiMode: boolean): OnboardingStep {
  if (!aiMode) return nextStep(step);
  const i = aiIndex(step);
  // A step outside the AI chain (deep link / stale resume) falls back to the classic order
  // rather than trapping the athlete on an unreachable screen.
  if (i < 0) return nextStep(step);
  return AI_MODE_STEPS[Math.min(AI_MODE_STEPS.length - 1, i + 1)]!;
}

/** Mode-aware prev. With `aiMode` false this is exactly {@link prevStep}. */
export function prevStepInMode(step: OnboardingStep, aiMode: boolean): OnboardingStep {
  if (!aiMode) return prevStep(step);
  const i = aiIndex(step);
  if (i < 0) return prevStep(step);
  return AI_MODE_STEPS[Math.max(0, i - 1)]!;
}

/**
 * Mode-aware progress for the shell's bar. The AI chain has exactly two wizard-chrome screens
 * (goals, plan preview); showing "Step 1 of 12" there would promise ten screens that never come.
 */
export function wizardProgressInMode(
  step: OnboardingStep,
  aiMode: boolean,
): { current: number; total: number } {
  if (!aiMode) return wizardProgress(step);
  const aiWizard = AI_MODE_STEPS.filter((s) => STEP_META[s].wizard);
  const idx = aiWizard.indexOf(step);
  if (idx < 0) return wizardProgress(step);
  return { current: idx + 1, total: aiWizard.length };
}
