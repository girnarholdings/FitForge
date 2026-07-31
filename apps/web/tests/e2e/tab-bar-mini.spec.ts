import { test, expect } from '@playwright/test';
import { seedOnboarded } from './helpers';

test.use({ viewport: { width: 390, height: 664 } });

/**
 * THE MINI TAB BAR. Scrolling down is reading; the bar answers by folding to icons and letting
 * its fill go translucent, handing the row's height and attention back to the page. Scrolling
 * up — the gesture of reaching for navigation — or returning to the top restores it. The
 * targets never shrink below the 44px floor, and the labels collapse visually while staying in
 * the accessibility tree.
 */
test.describe('tab bar · mini on scroll', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/today');
  });

  test('folds to icons on scroll down, restores on scroll up, and keeps 44px targets', async ({
    page,
  }) => {
    const bar = page.getByTestId('tab-bar').locator('ul');
    const label = page.getByTestId('tab-nutrition').locator('span').last();

    // At rest: full bar, labels visible, no mini flag.
    await expect(bar).not.toHaveAttribute('data-mini', 'true');
    await expect(label).toBeVisible();
    const fullBox = (await bar.boundingBox())!;

    // Scroll down — one real scroll event with a downward delta.
    await page.evaluate(() => window.scrollTo({ top: 500 }));
    await expect(bar).toHaveAttribute('data-mini', 'true');
    // The label row is collapsed out of sight (zero-height, not display:none).
    await expect(label).not.toBeVisible();
    // The bar genuinely got shorter and narrower…
    await expect
      .poll(async () => (await bar.boundingBox())!.height)
      .toBeLessThan(fullBox.height - 4);
    await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(fullBox.width - 40);
    // …but every tab still clears the 44px target floor.
    const tab = (await page.getByTestId('tab-today').boundingBox())!;
    expect(tab.height).toBeGreaterThanOrEqual(44);
    // The accessible name survives the visual collapse.
    await expect(page.getByTestId('tab-nutrition')).toHaveText(/Nutrition/);

    // Any upward scroll brings the full bar back.
    await page.evaluate(() => window.scrollTo({ top: 300 }));
    await expect(bar).not.toHaveAttribute('data-mini', 'true');
    await expect(label).toBeVisible();
  });

  test('a route change never leaves the bar hiding', async ({ page }) => {
    const bar = page.getByTestId('tab-bar').locator('ul');
    await page.evaluate(() => window.scrollTo({ top: 500 }));
    await expect(bar).toHaveAttribute('data-mini', 'true');

    // Client-side navigation lands a new page at the top — the bar must arrive full.
    await page.getByTestId('tab-nutrition').click();
    await expect(bar).not.toHaveAttribute('data-mini', 'true');
  });
});
