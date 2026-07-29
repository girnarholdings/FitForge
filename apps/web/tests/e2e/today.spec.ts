import { test, expect } from '@playwright/test';
import { resetDemo, seedOnboarded } from './helpers';

test.describe('today', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('shows the generated plan, macro ring targets, and a way into a workout', async ({
    page,
  }) => {
    await seedOnboarded(page);
    await page.goto('/today');

    // Header greeting + today's plan heading.
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

    // Fresh user: the nutrition card shows the first-run empty state with the REAL kcal target
    // (proving the macros rule ran) and a clear CTA — nothing is auto-logged.
    await expect(page.getByText(/Nothing logged yet today/i)).toBeVisible();
    const targetLabel = await page.getByText(/Your target is \d+ kcal/).innerText();
    const kcalTarget = parseInt((targetLabel.match(/(\d+)\s*kcal/) ?? ['', '0'])[1], 10);
    expect(kcalTarget).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /Log your first meal/i })).toBeVisible();

    // A CTA into a workout exists whether today is a training or rest day. DATE-DEPENDENT ON
    // PURPOSE: which branch renders depends on the weekday the suite runs on, so both real labels
    // are accepted. ("Start a freestyle workout" was the rest-day CTA before the quick-workout
    // picker replaced it; the stale alternative kept this green only on training days, and the
    // first rest-day run caught it.)
    const startBtn = page.getByRole('button', {
      name: /Start workout|Quick workout/,
    });
    await expect(startBtn).toBeVisible();

    // The smith-rank ladder, fresh-user state: rank Spark, zero strikes, first rung 3 away.
    // The crest and the progress line are real data off the workout log, not decoration — a
    // fresh log must read as the BOTTOM of the ladder, never as missing UI.
    const rank = page.getByTestId('forge-rank');
    await expect(rank).toContainText('Spark');
    await expect(rank).toContainText('0 strikes');
    await expect(page.getByTestId('forge-to-next')).toContainText('3 workouts away');

    await page.screenshot({ path: 'tests/screenshots/today.png', fullPage: true });
  });
});
