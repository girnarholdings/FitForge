import { test, expect } from '@playwright/test';
import { resetDemo, completeOnboarding } from './helpers';

/**
 * TOUCH TARGET SIZES — measured, not eyeballed.
 *
 * WCAG 2.5.8 (AA) sets 24x24 CSS px as the floor; this app's house rule is 44x44, which is Apple's
 * HIG figure and the right one for a phone used with sweaty hands mid-set.
 *
 * THE SUBTLETY these specs exist to protect: several of these controls are deliberately SMALL
 * VISUALLY and large only to a finger. The top-bar icons are 36px pills in a dense row beside the
 * Local Mode badge; the glossary "i" is a 20px glyph on a 10px label line. Growing their boxes
 * would wreck those layouts, so the hit area is extended with a transparent `::before` overlay
 * instead. `boundingBox()` reports the BORDER BOX and would therefore still read 20px and prove
 * nothing — so these tests measure what a tap actually LANDS ON, via elementFromPoint at the
 * corners of the required region.
 *
 * TWO THRESHOLDS, DELIBERATELY. The house 44px applies wherever the layout can accommodate it.
 * The glossary button is held to the AA 24px instead, because it sits between two 44px
 * `PlateStepper` rows whose centres are ~21px away: a 44px pad there does not add a target, it
 * STEALS one from the input the athlete is trying to type into. Asserting 44px here would be
 * asserting a regression. See the note on `GlossaryInfoButton`.
 */

/** House rule — anywhere with room for it. */
const HOUSE = 44;
/** WCAG 2.5.8 AA floor — the bar for controls wedged between larger ones. */
const AA = 24;

/**
 * Does a tap at (x, y) reach `el` — directly or through a pseudo-element/child of it?
 * This is the question a bounding box cannot answer.
 */
async function tapReaches(
  page: import('@playwright/test').Page,
  testId: string,
  dx: number,
  dy: number,
): Promise<boolean> {
  return page.evaluate(
    ({ id, ox, oy }) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2 + ox;
      const cy = r.top + r.height / 2 + oy;
      const hit = document.elementFromPoint(cx, cy);
      return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)));
    },
    { id: testId, ox: dx, oy: dy },
  );
}

/**
 * Assert the full `size` x `size` region around an element's centre is tappable.
 *
 * The element is scrolled into view FIRST: `elementFromPoint` is viewport-relative and returns
 * null for anything outside it, so probing an off-screen control silently reports "not tappable"
 * for every offset — including the centre — and the failure looks like a product bug rather than
 * a harness one.
 */
async function expectTarget(
  page: import('@playwright/test').Page,
  testId: string,
  size: number,
) {
  await page.locator(`[data-testid="${testId}"]`).first().scrollIntoViewIfNeeded();
  const edge = size / 2 - 1; // 1px inside the required box, to avoid boundary rounding
  for (const [dx, dy] of [
    [0, 0],
    [-edge, -edge],
    [edge, -edge],
    [-edge, edge],
    [edge, edge],
  ] as const) {
    expect(
      await tapReaches(page, testId, dx, dy),
      `${testId}: a tap at offset (${dx}, ${dy}) from centre must land on the control (${size}px target)`,
    ).toBe(true);
  }
}

test.use({ viewport: { width: 390, height: 664 } });

test.describe('touch targets', () => {
  test('the top-bar Coach and Settings controls are 44px to a finger', async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
    await page.goto('/today');

    await expect(page.getByTestId('mobile-coach')).toBeVisible();
    await expectTarget(page, 'mobile-coach', HOUSE);
    await expectTarget(page, 'mobile-settings', HOUSE);
  });

  test('the glossary info button clears the AA minimum despite being a 20px glyph', async ({
    page,
  }) => {
    await resetDemo(page);
    await completeOnboarding(page);

    // Into a real session, where the glossary buttons live next to the set-row labels.
    await page.goto('/today');
    const start = page.getByRole('link', { name: /start workout/i }).first();
    if ((await start.count()) === 0) test.skip(true, 'no scheduled session today');
    await start.click();
    await page.waitForURL(/\/workout\//);

    const info = page.locator('[data-testid^="glossary-info-"]').first();
    await expect(info).toBeVisible();

    // It must still LOOK small — this guards the fix from being "solved" by making it a 44px
    // circle, which is what would push the set-row header apart.
    const box = await info.boundingBox();
    expect(box, 'the info button renders').toBeTruthy();
    expect(box!.width, 'stays visually compact').toBeLessThan(28);

    const id = await info.getAttribute('data-testid');
    await expectTarget(page, id!, AA);
  });
});
