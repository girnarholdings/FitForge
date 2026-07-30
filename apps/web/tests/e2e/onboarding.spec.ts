import { test, expect } from '@playwright/test';
import { completeOnboarding, enterDemo, resetDemo, readDemoState } from './helpers';

test.describe('onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('progress advances and back preserves answers', async ({ page }) => {
    await enterDemo(page);

    // Goals — step 1 of the wizard.
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await page.getByText('Lose fat').click();
    // Selecting shows the confirmation note.
    await expect(page.getByText(/we'll tune your plan for fat loss/i)).toBeVisible();
    await page.getByTestId('onboarding-continue').click();

    // Experience — step 2; progress advanced.
    await page.waitForURL(/\/onboarding\/experience/);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    await page.getByText('Advanced').click();
    await page.getByTestId('onboarding-continue').click();

    // Schedule — step 3. Go BACK and confirm the experience answer is preserved.
    await page.waitForURL(/\/onboarding\/schedule/);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForURL(/\/onboarding\/experience/);
    // The Advanced card stays selected (aria-checked on the radio).
    await expect(page.getByRole('radio', { name: /Advanced/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Back again to goals — the primary goal is still selected.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForURL(/\/onboarding\/goals/);
    await expect(page.getByText(/we'll tune your plan for fat loss/i)).toBeVisible();
  });

  test('captures an optional name on welcome and writes it to the draft (§5.4)', async ({ page }) => {
    await page.goto('/onboarding/welcome');
    await page.getByTestId('onboarding-name').fill('Kai');
    await page.getByRole('button', { name: 'Get started' }).click();
    // Straight to the first question now — the auth step it used to pass through is gone.
    await page.waitForURL(/\/onboarding\/goals/);

    const state = await readDemoState(page);
    const draft = (state as { draft: { display_name: string | null } }).draft;
    expect(draft.display_name).toBe('Kai');
  });

  test('completing the full flow lands on /today with a generated plan and real targets', async ({
    page,
  }) => {
    await completeOnboarding(page);

    // Landed on Today with the generated routine visible.
    // The heading is the WEEKDAY IN FULL and the line under it is the calendar date. Asserted
    // against a locally-computed date rather than a fixed string, so this keeps working tomorrow —
    // and it is stronger than the `/plan$/` it replaces, which passed for any heading ending in
    // "plan" regardless of whether the date shown was the right one.
    const today = new Date();
    const weekday = today.toLocaleDateString(undefined, { weekday: 'long' });
    await expect(page.getByTestId('today-heading')).toHaveText(weekday);
    await expect(page.getByTestId('today-subheading')).toContainText(
      String(today.getDate()),
    );
    /* The workout card no longer wears a "Today's workout" kicker — the day's NAME is the
       heading and the CTA is the proof it is enterable. Rest days keep their card. */
    await expect(
      page.getByRole('button', { name: /Start workout|Quick workout/ }).or(page.getByText(/Rest day/)).first(),
    ).toBeVisible();

    // Non-zero nutrition targets prove the shared macros rule ran.
    const state = await readDemoState(page);
    expect(state).not.toBeNull();
    const targets = (state as { targets: Record<string, number> }).targets;
    expect(targets).toBeTruthy();
    expect(targets.kcal_target).toBeGreaterThan(0);
    expect(targets.protein_g_target).toBeGreaterThan(0);
    expect(targets.carbs_g_target).toBeGreaterThan(0);
    expect(targets.fat_g_target).toBeGreaterThan(0);

    // A generated routine with at least one day + exercise was persisted.
    const routine = (state as { routine: { days: { exercises: unknown[] }[]; source: string } })
      .routine;
    expect(routine).toBeTruthy();
    expect(routine.source).toBe('generated');
    const totalExercises = routine.days.reduce((n, d) => n + d.exercises.length, 0);
    expect(totalExercises).toBeGreaterThan(0);

    // The kcal target is surfaced on Today's first-run nutrition card.
    await expect(page.getByText(new RegExp(`Your target is ${targets.kcal_target} kcal`))).toBeVisible();
  });

  test('captures the targets-review screenshot with computed macros', async ({ page }) => {
    await enterDemo(page);
    await page.getByText('Lose fat').click();
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/experience/);
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/schedule/);
    await page.getByTestId('onboarding-continue').click();
    // Exercise prefs now precede the split (they feed its scoring); the neutral seed makes the
    // step continue-able with zero interaction.
    await page.waitForURL(/exercise_prefs/);
    await page.getByTestId('onboarding-continue').click();
    // WS-5: the split library preselects the best-matching program on mount.
    await page.waitForURL(/split/);
    await page.getByTestId('onboarding-continue').click();
    // WS-P: the progression scheme, likewise preselected with the recommendation.
    await page.waitForURL(/progression/);
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/location/);
    await page.getByText('Home gym').click();
    await page.getByTestId('onboarding-continue').click();
    // Equipment is a swipe deck now; the intro phase still carries the shell CTA.
    await page.waitForURL(/equipment/);
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/exclusions/);
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/body_metrics/);
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/nutrition_prefs/);
    await page.getByText('Vegetarian', { exact: true }).click();
    await page.getByTestId('onboarding-continue').click();

    await page.waitForURL(/targets_review/);
    await expect(page.getByText('kcal / day')).toBeVisible();
    // The kcal hero number is a real positive integer.
    const kcalText = await page.locator('p.text-4xl').first().innerText();
    expect(parseInt(kcalText, 10)).toBeGreaterThan(0);
    await page.screenshot({ path: 'tests/screenshots/onboarding-targets.png', fullPage: true });

    // Also capture a questionnaire step screenshot (goals) for docs.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.screenshot({ path: 'tests/screenshots/onboarding-step.png', fullPage: true });
  });
});
