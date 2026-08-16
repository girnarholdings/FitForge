import { test, expect, type Page, type Locator } from '@playwright/test';
import { resetDemo, seedOnboarded, dismissFirstRunTour } from './helpers';

/**
 * THE GESTURE LAYER.
 *
 * These specs exist because the failure they guard against is invisible to every other kind of
 * test: a sheet that renders perfectly, passes its accessibility assertions, and simply does not
 * move when you drag it. The grabber pill was drawn for a year with nothing behind it and no test
 * noticed, because no test ever put a finger on it.
 *
 * Everything here drives real pointer events at a phone viewport rather than calling handlers, so
 * a regression in the claim thresholds, the scroll-position rule, or the pointer capture shows up
 * as a failure rather than as a green suite over a dead gesture.
 */

/** Drag with enough intermediate points that the velocity tracker sees a real gesture. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { steps?: number; holdBeforeRelease?: number } = {},
) {
  const { steps = 12, holdBeforeRelease = 0 } = opts;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
  }
  if (holdBeforeRelease) await page.waitForTimeout(holdBeforeRelease);
  await page.mouse.up();
}

/**
 * A flick with a GUARANTEED speed, dispatched through CDP with explicit event timestamps.
 *
 * `page.mouse` cannot express "fast": its moves are paced by the test runner, so on a loaded CI
 * runner the same call that is a 1400px/s flick locally arrives as a 200px/s haul, the projection
 * correctly declines to commit, and the test fails having proved nothing about the code. CDP takes
 * the timestamp as a parameter and Chromium passes it straight through to `event.timeStamp`, which
 * is the value the velocity tracker reads — so the gesture's speed is stated, not hoped for.
 *
 * The physics itself is unit-tested in `lib/gesture/physics.test.ts`; what this proves is that a
 * real browser gesture at a known speed reaches the hook and resolves the way the maths says.
 */
async function flick(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { durationMs?: number; steps?: number; holdMs?: number } = {},
) {
  const { durationMs = 50, steps = 6, holdMs = 0 } = opts;
  const cdp = await page.context().newCDPSession(page);
  const base = Date.now() / 1000;

  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: from.x,
    y: from.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    timestamp: base,
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
      button: 'left',
      buttons: 1,
      timestamp: base + (durationMs / 1000) * (i / steps),
    });
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: to.x,
    y: to.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    timestamp: base + (durationMs + holdMs) / 1000,
  });
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('expected the element to be laid out');
  return box;
}

/**
 * Wait until the element has stopped moving, then return its box.
 *
 * A sheet is in flight for the length of its entrance spring, so measuring the instant it becomes
 * visible captures a position it is only passing through — every later comparison against that
 * number is then off by whatever travel remained. Polling for two identical frames is the honest
 * way to ask "where does this thing actually rest".
 */
async function restingBox(locator: Locator) {
  let previous = await boxOf(locator);
  for (let i = 0; i < 40; i++) {
    await locator.page().waitForTimeout(50);
    const next = await boxOf(locator);
    if (Math.abs(next.y - previous.y) < 0.5) return next;
    previous = next;
  }
  throw new Error('element never came to rest');
}

/** The muscle-filter sheet on Exercises — reachable from a clean account with no logged data. */
async function openASheet(page: Page) {
  await page.goto('/exercises');
  await page.getByTestId('muscle-filter-open').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The PANEL, not the dialog — `role="dialog"` is on the full-screen container, whose box never
  // moves however far the sheet inside it travels.
  const panel = page.getByTestId('sheet-panel');
  await expect(panel).toBeVisible();
  await restingBox(panel);
  return panel;
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.describe('bottom sheet drag-to-dismiss', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await seedOnboarded(page);
    // The first-run tour spotlights the screen and swallows pointer events; a gesture spec has to
    // start from the state a returning user is actually in.
    await dismissFirstRunTour(page);
  });

  test('the grabber is shown and the sheet follows a downward drag', async ({ page }) => {
    const panel = await openASheet(page);
    await expect(page.getByTestId('sheet-grabber')).toBeVisible();

    const box = await restingBox(panel);
    const startY = box.y + 8;
    const x = box.x + box.width / 2;

    await page.mouse.move(x, startY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, startY + i * 12);

    // Mid-gesture, the panel must have MOVED — this is the assertion the old sheet failed.
    const dragged = await boxOf(panel);
    expect(dragged.y).toBeGreaterThan(box.y + 40);

    await page.mouse.up();
  });

  test('a slow short drag returns the sheet home instead of dismissing it', async ({ page }) => {
    const panel = await openASheet(page);
    const box = await restingBox(panel);
    const x = box.x + box.width / 2;

    // 30px, then a pause so the release velocity is genuinely zero. Neither distance nor
    // momentum justifies a dismissal, so the sheet must come back.
    await drag(page, { x, y: box.y + 8 }, { x, y: box.y + 38 }, { holdBeforeRelease: 220 });

    await expect(panel).toBeVisible();
    await expect
      .poll(async () => (await boxOf(panel)).y, { timeout: 2000 })
      .toBeCloseTo(box.y, -1);
  });

  test('a fast short flick dismisses it — momentum, not distance', async ({ page }) => {
    const panel = await openASheet(page);
    const box = await restingBox(panel);
    const x = box.x + box.width / 2;

    // Only 70px of travel, well under the distance threshold, but delivered at 1400px/s and
    // released while still moving. Projection is the only thing that can turn this into a
    // dismissal, which is exactly what the test is for.
    await flick(page, { x, y: box.y + 8 }, { x, y: box.y + 78 }, { durationMs: 50 });

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 });
  });

  test('a long haul past the threshold dismisses it', async ({ page }) => {
    const panel = await openASheet(page);
    const box = await restingBox(panel);
    const x = box.x + box.width / 2;

    await drag(page, { x, y: box.y + 8 }, { x, y: box.y + 260 }, { holdBeforeRelease: 220 });

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 });
  });

  test('dragging UP is resisted and never tears the sheet off its edge', async ({ page }) => {
    const panel = await openASheet(page);
    const box = await restingBox(panel);
    const x = box.x + box.width / 2;

    await page.mouse.move(x, box.y + 8);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, box.y + 8 - i * 20);

    // 200px of upward finger travel must produce far less upward movement — that is the
    // rubber-band. And it must produce SOME, or the boundary reads as frozen.
    const pulled = await boxOf(panel);
    const lifted = box.y - pulled.y;
    expect(lifted).toBeGreaterThan(0);
    expect(lifted).toBeLessThan(120);

    await page.mouse.up();
    await expect(panel).toBeVisible();
  });

  test('dismissing inside the entrance frame still closes it', async ({ page }) => {
    /**
     * The regression this exists for: the entrance defers its spring by one frame, and a dismissal
     * landing INSIDE that frame used to let the entrance cancel the exit — and the exit's
     * completion callback is what unmounts the sheet. The sheet stayed on screen forever,
     * swallowing every click on the page behind it. No delay here on purpose.
     */
    await page.goto('/exercises');
    await page.getByTestId('muscle-filter-open').click();
    await expect(page.getByTestId('sheet-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 });
  });

  test('open, dismiss, reopen leaves a sheet that still drags', async ({ page }) => {
    // The exit latch must be cleared by the next entrance, or the second open is undismissable.
    await openASheet(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 });

    const panel = await openASheet(page);
    const box = await restingBox(panel);
    const x = box.x + box.width / 2;
    await flick(page, { x, y: box.y + 8 }, { x, y: box.y + 78 }, { durationMs: 50 });
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 });
  });

  test('the escape hatch still works and focus returns to the trigger', async ({ page }) => {
    await openASheet(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 });
    await expect(page.getByTestId('muscle-filter-open')).toBeFocused();
  });
});

test.describe('swipe between days', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await seedOnboarded(page);
    // The first-run tour spotlights the screen and swallows pointer events; a gesture spec has to
    // start from the state a returning user is actually in.
    await dismissFirstRunTour(page);
  });

  test('swiping left on Today moves to the next day, right moves back', async ({ page }) => {
    await page.goto('/today');
    const label = page.getByTestId('date-nav-date');
    const start = await label.textContent();

    const view = page.getByTestId('today-view');
    const box = await boxOf(view);
    const y = box.y + 140;

    await drag(page, { x: box.x + box.width - 30, y }, { x: box.x + 40, y }, { steps: 6 });
    await expect.poll(async () => label.textContent(), { timeout: 3000 }).not.toBe(start);

    await drag(page, { x: box.x + 40, y }, { x: box.x + box.width - 30, y }, { steps: 6 });
    await expect.poll(async () => label.textContent(), { timeout: 3000 }).toBe(start);
  });

  test('a vertical drag scrolls the page and never changes the day', async ({ page }) => {
    await page.goto('/today');
    const label = page.getByTestId('date-nav-date');
    const start = await label.textContent();

    const box = await boxOf(page.getByTestId('today-view'));
    const x = box.x + box.width / 2;
    await drag(page, { x, y: box.y + 300 }, { x, y: box.y + 60 }, { steps: 10 });

    await page.waitForTimeout(300);
    expect(await label.textContent()).toBe(start);
  });

  test('a small horizontal wobble is a tap, not a day change', async ({ page }) => {
    await page.goto('/nutrition');
    const label = page.getByTestId('date-nav-date');
    const start = await label.textContent();

    const box = await boxOf(page.getByTestId('nutrition-view'));
    const y = box.y + 120;
    await drag(page, { x: box.x + 200, y }, { x: box.x + 192, y }, { steps: 3 });

    await page.waitForTimeout(300);
    expect(await label.textContent()).toBe(start);
  });
});
