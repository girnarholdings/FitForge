import { test, expect } from '@playwright/test';
import { advanceToEquipment, completeOnboarding, resetDemo } from './helpers';

/**
 * Canonical docs screenshots for the UX overhaul, all captured at the phone viewport the user
 * actually complained about (390 × 664 — iPhone Safari with the URL bar and toolbar showing).
 *
 * This file is the single owner of these six files so parallel workers can never race on them.
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
    await page.waitForTimeout(500);

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
});
