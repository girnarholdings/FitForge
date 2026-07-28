import { test, expect, type Page } from '@playwright/test';
import { resetDemo, completeOnboarding } from './helpers';

/**
 * THE FLOATING TAB BAR and its long-press gesture.
 *
 * The gesture is an accelerator layered on top of real `<Link>`s, so the tests are written in two
 * halves: the ordinary affordances must keep working exactly as before (that is what everyone
 * actually uses), and the gesture must do what it claims on top.
 *
 * Pointer events are dispatched by hand with `pointerType: 'touch'`. Playwright's `touchscreen`
 * API only taps, and the bar deliberately ignores `pointerType: 'mouse'` — so a mouse-driven test
 * would exercise nothing.
 */

test.use({ viewport: { width: 390, height: 664 } });

/** Long-press over `fromTestId`, drag to `toTestId`, release. */
async function longPressSwipe(page: Page, fromTestId: string, toTestId: string, holdMs = 450) {
  const from = await page.getByTestId(fromTestId).boundingBox();
  const to = await page.getByTestId(toTestId).boundingBox();
  expect(from, `${fromTestId} must be on screen`).toBeTruthy();
  expect(to, `${toTestId} must be on screen`).toBeTruthy();

  const send = (type: string, x: number, y: number) =>
    page.evaluate(
      ({ type, x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) throw new Error(`nothing at (${x}, ${y})`);
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { type, x, y },
    );

  const fx = from!.x + from!.width / 2;
  const fy = from!.y + from!.height / 2;
  const tx = to!.x + to!.width / 2;

  await send('pointerdown', fx, fy);
  // Hold past the long-press threshold without moving, or it reads as a scroll.
  await page.waitForTimeout(holdMs);
  // Intermediate move, then the target — one jump could be mistaken for a teleport.
  await send('pointermove', (fx + tx) / 2, fy);
  await send('pointermove', tx, fy);
  await send('pointerup', tx, fy);
}

test.describe('floating tab bar', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
    await page.goto('/today');
  });

  test('floats clear of the viewport edges rather than spanning them', async ({ page }) => {
    const bar = page.getByTestId('tab-bar').locator('ul');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    // Detached on both sides and off the bottom — this is what makes it read as floating, and it
    // is the property a careless "make it full width again" change would destroy.
    expect(box!.x, 'gap on the left').toBeGreaterThan(4);
    expect(box!.x + box!.width, 'gap on the right').toBeLessThan(390 - 4);
    expect(box!.y + box!.height, 'lifted off the bottom edge').toBeLessThan(664);
  });

  test('a plain tap still navigates — the gesture is additive, not a replacement', async ({
    page,
  }) => {
    await page.getByTestId('tab-exercises').click();
    await page.waitForURL(/\/exercises\/?$/);
    await expect(page.getByTestId('tab-exercises')).toHaveAttribute('aria-current', 'page');
  });

  test('long-press then swipe moves to the section under the finger', async ({ page }) => {
    await longPressSwipe(page, 'tab-today', 'tab-nutrition');
    await page.waitForURL(/\/nutrition/);
    await expect(page.getByTestId('tab-nutrition')).toHaveAttribute('aria-current', 'page');
  });

  test('a short press with no hold does not scrub', async ({ page }) => {
    // Below the long-press threshold the bar must behave like plain links: releasing over another
    // tab after a quick brush must NOT navigate somewhere the user did not tap.
    await longPressSwipe(page, 'tab-today', 'tab-progress', 60);
    await expect(page).toHaveURL(/\/today/);
  });

  test('every tab remains a real link for keyboard and assistive tech', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const label of ['Today', 'Workouts', 'Exercises', 'Nutrition', 'Progress']) {
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', /\/\w+/);
    }
  });
});
