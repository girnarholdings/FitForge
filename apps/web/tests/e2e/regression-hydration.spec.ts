import { test, expect } from '@playwright/test';
import { resetDemo, readDemoState, DEMO_STORAGE_KEY } from './helpers';

/**
 * REGRESSION — a cold load onto a mid-onboarding URL must never overwrite stored answers.
 *
 * THE BUG: `PlanPreviewStep` called `finalizeOnboarding(draft)` in a []-dep mount effect, and
 * `finalizeOnboarding` WRITES whatever draft it is handed straight into the store. React runs
 * CHILD effects before PARENT effects, so that fired before `OnboardingProvider`'s hydration
 * effect had read localStorage — with `draft` still `emptyDraft()`.
 *
 * The consequence was silent and total: opening /onboarding/plan_preview directly (a reachable
 * resume URL, and exactly what a bookmark or a refresh produces) generated a plan from DEFAULTS
 * and persisted it over a completed profile. Sex, split and every equipment answer came back as
 * defaults. Nothing errored, so nothing surfaced it.
 *
 * These specs drive the real failure mode — a COLD LOAD, not client-side navigation, because
 * navigating in-app already had a hydrated provider and never reproduced it.
 */
test.describe('regression · onboarding hydration', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  /** Seed a distinctive, definitely-not-default draft straight into storage. */
  const seedDraft = async (page: import('@playwright/test').Page) => {
    await page.addInitScript(
      ({ key }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            userId: 'demo-user',
            onboardingStep: 'plan_preview',
            draft: {
              sex: 'female',
              split_slug: 'full-body-3',
              days_per_week: 3,
              experience_level: 'advanced',
              primary_goal: 'strength',
            },
            completedAt: null,
            profile: null,
            nutritionProfile: null,
            routine: null,
            targets: null,
            logsByDate: {},
            weights: [],
            volumeTargets: {},
            progressionScheme: null,
            quickSession: null,
          }),
        );
      },
      { key: DEMO_STORAGE_KEY },
    );
  };

  test('a cold load onto plan_preview keeps the stored answers instead of defaulting them', async ({
    page,
  }) => {
    await seedDraft(page);

    // COLD LOAD — the reproduction. Not a client-side push.
    await page.goto('/onboarding/plan_preview');
    await expect(page.getByTestId('plan-preview')).toBeAttached();

    const state = (await readDemoState(page)) as {
      draft: { sex?: string | null; split_slug?: string | null; experience_level?: string | null };
    };

    // The exact fields the bug flattened.
    expect(state.draft.sex, 'sex survived the cold load').toBe('female');
    expect(state.draft.split_slug, 'chosen split survived').toBe('full-body-3');
    expect(state.draft.experience_level, 'experience survived').toBe('advanced');
  });

  test('the plan generated on a cold load is built from the stored draft, not from defaults', async ({
    page,
  }) => {
    await seedDraft(page);
    await page.goto('/onboarding/plan_preview');
    await expect(page.getByTestId('plan-preview')).toBeAttached();

    const state = (await readDemoState(page)) as {
      routine: { days: unknown[] } | null;
    };

    // 3 days/week was the stored answer; the default draft would not produce it. This is the
    // assertion that would have caught the original bug — the previous one only proves the draft
    // was not clobbered, this proves the PLAN actually used it.
    expect(state.routine, 'a routine was generated').toBeTruthy();
    expect(state.routine!.days.length, 'the plan honours the stored 3 days/week').toBe(3);
  });

  test('a genuinely new user is not left waiting on a hydration flag that never flips', async ({
    page,
  }) => {
    // The failure mode of the FIX: gating on "we found a stored draft" rather than "hydration
    // finished" would hang forever for someone with nothing stored.
    await page.goto('/onboarding/plan_preview');
    await expect(page.getByTestId('plan-preview')).toBeAttached({ timeout: 10_000 });

    const state = (await readDemoState(page)) as { routine: unknown };
    expect(state.routine, 'a fresh user still gets a plan').toBeTruthy();
  });
});
