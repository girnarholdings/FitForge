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

    // A CTA into a workout exists whether today is a training or rest day.
    const startBtn = page.getByRole('button', {
      name: /Start workout|Start a freestyle workout/,
    });
    await expect(startBtn).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/today.png', fullPage: true });
  });
});
