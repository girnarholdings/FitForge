import { test, expect } from '@playwright/test';
import {
  advanceToEquipment,
  completeOnboarding,
  resetDemo,
  seedTrainingHistory,
  tapMuscle,
} from './helpers';

/**
 * Canonical docs screenshots for the UX overhaul, all captured at the phone viewport the user
 * actually complained about (390 × 664 — iPhone Safari with the URL bar and toolbar showing).
 *
 * This file is the single owner of these files so parallel workers can never race on them.
 */
test.use({ viewport: { width: 390, height: 664 } });

const SHOTS = 'tests/screenshots';

test.describe('screenshots @ 390x664', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('landing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start in Local Mode' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/landing.png` });
  });

  test('onboarding — equipment swipe deck', async ({ page }) => {
    await advanceToEquipment(page);
    await page.getByTestId('equipment-start-swiping').click();
    await expect(page.getByTestId('equipment-deck-screen')).toBeVisible();

    // Skip the category interstitial so the shot shows a real equipment card.
    const oneByOne = page.getByTestId('equipment-category-one-by-one');
    if (await oneByOne.isVisible().catch(() => false)) await oneByOne.click();
    await expect(page.getByTestId('swipe-deck-card')).toBeVisible();
    await page.waitForTimeout(400);

    // GAMIFIED STATE (WS-A): three answers in a row pops the streak chip, advances the progress
    // fill and the "unlocked" count-up, and leaves the commit burst mid-flight. The chip lives
    // ~1.4 s, so the shot is taken while it is still on screen.
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('swipe-action-right').click();
      await page.waitForTimeout(400);
      const skip = page.getByTestId('equipment-category-one-by-one');
      if (await skip.isVisible().catch(() => false)) await skip.click();
    }
    await page.getByTestId('swipe-action-up').click();
    await expect(page.getByTestId('equipment-combo-chip')).toBeVisible();
    await page.waitForTimeout(340);

    await page.screenshot({ path: `${SHOTS}/onboarding-equipment.png` });
  });

  test('onboarding — split library', async ({ page }) => {
    await page.goto('/onboarding/split/');
    await expect(page.getByRole('heading', { name: 'Pick your training split' })).toBeVisible();
    await expect(page.getByTestId('split-option-auto')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/onboarding-split.png` });
  });

  test('exercises — catalog, detail how-to, and aggregated targeting', async ({ page }) => {
    await completeOnboarding(page);

    await page.goto('/exercises');
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();
    await expect(page.getByTestId('exercise-count')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/exercises-catalog.png` });

    // Aggregated targeting — the "Plan targets" tab.
    await page.getByTestId('exercises-tab-targets').click();
    await expect(page.getByTestId('muscle-volume-bars')).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/targeting-aggregate.png` });

    // Exercise detail — the "How to perform" pose frames.
    await page.goto('/exercises/barbell-back-squat/');
    await expect(page.getByTestId('how-to-perform')).toBeVisible();
    await expect(page.getByTestId('pose-frames')).toBeVisible();
    await page.getByTestId('how-to-perform').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/exercise-detail.png` });
  });

  /**
   * WS-B — the analytics surface, shot against ~5 weeks of seeded (real-shaped) history so the
   * charts contain actual data rather than an empty state.
   */
  test('progress — heat gradient and analytics time-series', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/progress');
    await seedTrainingHistory(page);
    await expect(page.getByTestId('weekly-goal-heatmap')).toBeVisible();

    // 1 · the % of goal heat body — gradient silhouette, continuous legend and the read-out for a
    // tapped muscle, all in one frame.
    await tapMuscle(page, 'quads');
    await expect(page.getByTestId('muscle-goal-detail-status')).toBeVisible();
    await page.getByTestId('muscle-goal-detail').scrollIntoViewIfNeeded();
    // Clear the fixed bottom dock so the whole read-out card is in frame.
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/progress-heat.png` });

    // 2 · the Trends analytics — the weekly-volume time series with its trend pill and axis.
    await page.getByTestId('progress-tab-trends').click();
    await expect(page.getByTestId('progress-summary')).toBeVisible();
    const chart = page.getByTestId('chart-weekly-volume');
    await expect(chart).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/progress-analytics.png` });
  });
});
