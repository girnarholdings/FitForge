/**
 * BODY METRICS · type it your way.
 *
 * The promise under test: the height and weight fields accept the notations people actually use
 * (5'10", 180 lb, 12st 7…), the unit dropdowns rendered from the units dictionary state how a
 * bare number is read, an explicit unit in the text beats the dropdown, and the echo underneath
 * says what was understood in BOTH systems — because the echo is the user's only defence against
 * a mis-read number silently becoming their calorie math.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetDemo, enterDemo } from './helpers';

async function openBodyMetrics(page: Page): Promise<void> {
  await enterDemo(page); // seeds the session; the step is directly addressable after that
  await page.goto('/onboarding/body_metrics');
  await expect(page.getByTestId('height-field')).toBeVisible();
}

test.describe('onboarding · body metrics', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test(`5'10" typed with apostrophes parses, echoes both systems, and survives Continue`, async ({
    page,
  }) => {
    await openBodyMetrics(page);

    const height = page.getByLabel('Height', { exact: true });
    await height.fill(`5'10"`);
    // The echo names what was understood — imperial AND metric.
    await expect(page.getByTestId('height-field-echo')).toContainText('5′10″');
    await expect(page.getByTestId('height-field-echo')).toContainText('178 cm');

    const weight = page.getByLabel('Weight', { exact: true });
    await weight.fill('180 lb');
    await expect(page.getByTestId('weight-field-echo')).toContainText('81.6 kg');

    // Continue commits the draft; the stored values are canonical metric.
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/nutrition_prefs/);
    const draft = await page.evaluate(() => {
      const raw = window.localStorage.getItem('fitforge.demo.v1');
      return raw ? (JSON.parse(raw).draft ?? null) : null;
    });
    expect(Math.round(draft.height_cm)).toBe(178);
    expect(Math.round(draft.weight_kg)).toBe(82);
  });

  test('stones parse; an explicit unit beats the dropdown', async ({ page }) => {
    await openBodyMetrics(page);
    // Dropdown stays on kg; the TEXT says stones — the text wins.
    await page.getByLabel('Weight', { exact: true }).fill('12st 7');
    await expect(page.getByTestId('weight-field-echo')).toContainText('79.4 kg');
  });

  test('switching the unit dropdown translates the value instead of wiping it', async ({
    page,
  }) => {
    await openBodyMetrics(page);
    const height = page.getByLabel('Height', { exact: true });
    await height.fill('178');
    await expect(page.getByTestId('height-field-echo')).toContainText('5′10″');
    await page.getByTestId('height-field-unit').selectOption('ftin');
    // The field re-renders the SAME height in the chosen unit.
    await expect(height).toHaveValue('5′10″');
  });

  test('unreadable input is refused with a hint, not guessed at', async ({ page }) => {
    await openBodyMetrics(page);
    const height = page.getByLabel('Height', { exact: true });
    await height.fill('tall-ish');
    await height.blur();
    await expect(page.getByTestId('height-field-invalid')).toBeVisible();
  });
});
