import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded } from './helpers';

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
    await seedOnboarded(page);
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

  /* ── the floating Coach button must not eat another control's taps ──────────────────────────
   *
   * REGRESSION TEST. The Coach button floats above the right end of the tab pill — the same corner
   * a composer puts its submit button in. The nav is z-40 and the composer z-30, so on /nutrition
   * the button silently swallowed every tap meant for "Review what you ate": the meal went
   * unlogged and the user landed on the Coach screen instead. Ten specs failed at once and not one
   * of them was about navigation, which is what made it expensive to place.
   *
   * The assertion is a real tap and where it lands, not a CSS property. `toBeHidden` would pass
   * against a button that is present but transparent, and stacking context is exactly the kind of
   * thing a later change gets wrong while every style assertion still reads correct.
   */
  test('the Coach button never covers the nutrition composer submit', async ({ page }) => {
    await page.getByTestId('tab-nutrition').click();
    await page.waitForURL(/\/nutrition/);

    const submit = page.getByTestId('composer-submit');
    await expect(submit).toBeVisible();

    // Whatever the browser would deliver a tap at the submit button's centre to must BE the submit
    // button. That is the exact question the original failure was an answer to.
    const box = (await submit.boundingBox())!;
    const owner = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? el?.tagName ?? 'nothing';
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(owner, 'the topmost element over the submit button').toBe('composer-submit');

    // And it still works from here, which is the user-visible half of the bug.
    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await submit.click();
    await expect(page.getByTestId('review-confirm')).toBeVisible();
  });

  test('Coach stays reachable on the screens that do show the button', async ({ page }) => {
    // The fix hides the button on two routes; it must not have hidden it everywhere.
    await expect(page.getByTestId('tab-coach')).toBeVisible();
    await page.getByTestId('tab-coach').click();
    await page.waitForURL(/\/coach/);
  });
});
