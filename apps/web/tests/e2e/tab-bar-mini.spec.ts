import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded } from './helpers';

test.use({ viewport: { width: 390, height: 664 } });

/**
 * THE MINI TAB BAR. Scrolling down is reading; the bar answers by folding to icons and letting
 * its fill go translucent, handing the row's height and attention back to the page. Scrolling
 * up — the gesture of reaching for navigation — or returning to the top restores it. The
 * targets never shrink below the 44px floor, and the labels collapse visually while staying in
 * the accessibility tree.
 */
/**
 * Scroll, then PROVE the scroll landed.
 *
 * `window.scrollTo` silently clamps to the maximum scrollable offset. Before React mounts, the
 * prerendered body of this static export is exactly one viewport tall, so a scroll to 500 clamps
 * to 0 — and because the bar folds on scroll DELTA (FloatingTabBar.tsx: `dy = y - lastY`), the
 * event that never fired never comes back. The bar then sits unfolded forever and the failure
 * reads as "the tab bar is broken" rather than "the page had not mounted yet".
 *
 * Asserting scrollY makes a clamp fail as itself. Deliberately NOT an expect.poll around the
 * scroll+assert pair: retrying the scroll would also go green, while silently tolerating a bar
 * that only folds on the second attempt.
 */
async function scrollWindowTo(page: Page, top: number) {
  await page.evaluate((t) => window.scrollTo({ top: t }), top);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(top);
}

test.describe('tab bar · mini on scroll', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/today');
    // `goto` resolves on `load`, which here precedes hydration: no tab bar exists yet, so its
    // scroll listener is not attached to hear anything. Wait for the bar itself — the sibling
    // test got this gate for free from its first assertion; this makes it explicit and shared.
    await expect(page.getByTestId('tab-today')).toBeVisible();
    // And guard the premise: if /today ever gets short enough that 500px is unreachable, this
    // should fail loudly here rather than intermittently as a phantom tab-bar bug.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
    ).toBeGreaterThan(500);
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
    await scrollWindowTo(page, 500);
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
    await scrollWindowTo(page, 300);
    await expect(bar).not.toHaveAttribute('data-mini', 'true');
    await expect(label).toBeVisible();
  });

  test('a route change never leaves the bar hiding', async ({ page }) => {
    const bar = page.getByTestId('tab-bar').locator('ul');
    await scrollWindowTo(page, 500);
    await expect(bar).toHaveAttribute('data-mini', 'true');

    // Client-side navigation lands a new page at the top — the bar must arrive full.
    await page.getByTestId('tab-nutrition').click();
    await expect(bar).not.toHaveAttribute('data-mini', 'true');
  });
});
