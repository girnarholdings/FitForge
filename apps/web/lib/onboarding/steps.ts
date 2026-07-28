import { ONBOARDING_STEPS, type OnboardingStep } from '@fitforge/shared/schemas';

export type { OnboardingStep };
export { ONBOARDING_STEPS };

export interface StepMeta {
  step: OnboardingStep;
  /** screen number from §2.2 (0..15); `done` is terminal */
  screen: number;
  title: string;
  subtitle?: string;
  /** show the progress bar / back+next chrome (the questionnaire screens) */
  wizard: boolean;
}

/** §2.2 screen-by-screen metadata (order is contractual). */
export const STEP_META: Record<OnboardingStep, StepMeta> = {
  welcome: { step: 'welcome', screen: 0, title: 'Welcome to FitForge', wizard: false },
  auth: { step: 'auth', screen: 1, title: 'Create your account', wizard: false },
  goals: {
    step: 'goals',
    screen: 2,
    title: 'What are you training for?',
    subtitle: 'Tap every goal that applies. The first one you pick leads your plan.',
    wizard: true,
  },
  experience: {
    step: 'experience',
    screen: 3,
    title: 'How much lifting experience do you have?',
    subtitle: 'Be honest — this sets your starting difficulty and volume.',
    wizard: true,
  },
  schedule: {
    step: 'schedule',
    screen: 4,
    title: 'When can you train?',
    subtitle: 'Days per week, which days, and how long each session runs.',
    wizard: true,
  },
  // Moved BEFORE `split` (was screen 9): liked lifts feed split scoring on the next screen, so
  // asking afterwards was backwards (docs/RESEARCH-PREFERENCES.md §1).
  exercise_prefs: {
    step: 'exercise_prefs',
    screen: 5,
    title: 'Which lifts do you actually enjoy?',
    subtitle:
      'Pick your top five, in order — they shape which split we suggest and what goes in it.',
    wizard: true,
  },
  split: {
    step: 'split',
    screen: 6,
    title: 'Pick your training split',
    subtitle: 'Real programs, matched to your days and level. One is picked already.',
    wizard: true,
  },
  progression: {
    step: 'progression',
    screen: 7,
    title: 'How should your sets progress?',
    subtitle: 'This decides the weight and reps of every single set. One is picked for you already.',
    wizard: true,
  },
  location: {
    step: 'location',
    screen: 8,
    title: 'Where will you train?',
    subtitle: "We'll preselect the equipment that fits.",
    wizard: true,
  },
  equipment: {
    step: 'equipment',
    screen: 9,
    title: 'What equipment do you have?',
    subtitle: 'Swipe right if you have it, up if you love it. Presets work too.',
    wizard: true,
  },
  exclusions: {
    step: 'exclusions',
    screen: 10,
    title: 'Anything we should protect?',
    subtitle: "Pick sore areas or exercises to avoid — we'll substitute automatically.",
    wizard: true,
  },
  body_metrics: {
    step: 'body_metrics',
    screen: 11,
    title: 'A few body basics',
    subtitle: 'Used to compute your calorie and macro targets. All optional.',
    wizard: true,
  },
  nutrition_prefs: {
    step: 'nutrition_prefs',
    screen: 12,
    title: 'How do you eat?',
    subtitle: 'Diet style, allergies, and anything to avoid.',
    wizard: true,
  },
  targets_review: {
    step: 'targets_review',
    screen: 13,
    title: 'Your daily targets',
    subtitle: 'Computed from your profile. Adjust if you like.',
    wizard: true,
  },
  plan_preview: {
    step: 'plan_preview',
    screen: 14,
    title: 'Your starter plan',
    subtitle: 'Generated from everything you told us. Swap anything.',
    wizard: true,
  },
  done: { step: 'done', screen: 15, title: "You're all set", wizard: false },
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
