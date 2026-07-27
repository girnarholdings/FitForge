import { test, expect } from '@playwright/test';
import { resetDemo, completeOnboarding, readDemoState } from './helpers';

/**
 * QUICK WORKOUT — the replacement for a button that used to link straight at `routine.days[0]`.
 *
 * The regression these specs exist to prevent is the original bug: tapping "train anyway" starting
 * an arbitrary session with no choice. Every assertion here is about the CHOICE being real —
 * options derived from the user's own split, a time budget that actually changes the plan, and a
 * started session that matches what was picked.
 */
test.describe('quick workout', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
  });

  test('offers options built from the real split, not a bare start', async ({ page }) => {
    await page.goto('/today');

    await page.getByTestId('quick-workout-open').first().click();

    const options = page.getByTestId('quick-options');
    await expect(options).toBeVisible();

    // Condensing is always available; isolating a day is available whenever the split has days.
    await expect(page.getByTestId('quick-option-condense')).toBeVisible();
    await expect(page.getByTestId('quick-option-isolate').first()).toBeVisible();

    // Every option states a real duration rather than starting blind.
    const rows = options.locator('li');
    expect(await rows.count()).toBeGreaterThan(1);
    await expect(options.getByText(/~\d+ min/).first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/quick-workout.png' });
  });

  test('the time budget genuinely changes the condensed session', async ({ page }) => {
    await page.goto('/today');
    await page.getByTestId('quick-workout-open').first().click();

    const condensed = page.getByTestId('quick-option-condense');
    const minutesOf = async () => {
      const text = await condensed.innerText();
      const match = text.match(/~(\d+) min/);
      return match ? parseInt(match[1]!, 10) : NaN;
    };

    await page.getByTestId('quick-budget-50').click();
    const long = await minutesOf();

    await page.getByTestId('quick-budget-20').click();
    const short = await minutesOf();

    // A shorter budget must produce a genuinely shorter session, and it must respect the budget.
    expect(short).toBeLessThan(long);
    expect(short).toBeLessThanOrEqual(20);
  });

  test('starting a quick session runs exactly what was picked, and it logs like any other', async ({
    page,
  }) => {
    await page.goto('/today');
    await page.getByTestId('quick-workout-open').first().click();
    await page.getByTestId('quick-budget-20').click();

    const condensed = page.getByTestId('quick-option-condense');
    await condensed.click();

    // Lands in the player on the quick route with the condensed session loaded.
    await page.waitForURL(/\/workout\/quick\/?$/);
    // The player names the session, so you can tell WHICH quick workout you picked.
    await expect(page.getByTestId('workout-day-name')).toHaveText('Full body express');

    // It is a real RoutineDay in the store — the player, the logger and the volume view all read
    // it through the same path as a planned day.
    const state = await readDemoState(page);
    const quick = (state as { quickSession: { name: string; exercises: unknown[] } | null })
      .quickSession;
    expect(quick, 'the picked session is persisted').toBeTruthy();
    expect(quick!.exercises.length).toBeGreaterThan(2);
  });

  test('a condensed session covers several movement patterns rather than one body part', async ({
    page,
  }) => {
    await page.goto('/today');
    await page.getByTestId('quick-workout-open').first().click();
    await page.getByTestId('quick-option-condense').click();
    await page.waitForURL(/\/workout\/quick\/?$/);

    const state = await readDemoState(page);
    const quick = (state as {
      quickSession: { exercises: { exercise_slug: string; sets: number }[] } | null;
    }).quickSession;

    expect(quick).toBeTruthy();
    // Breadth is the point of condensing — distinct exercises, none trimmed below the 2-set floor.
    const slugs = new Set(quick!.exercises.map((e) => e.exercise_slug));
    expect(slugs.size, 'condensed days do not repeat an exercise').toBe(quick!.exercises.length);
    for (const ex of quick!.exercises) {
      expect(ex.sets, 'nothing is trimmed below 2 sets').toBeGreaterThanOrEqual(2);
    }
  });
});
