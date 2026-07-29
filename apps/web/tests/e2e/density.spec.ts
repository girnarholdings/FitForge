import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded, pageOverflow } from './helpers';

/**
 * DENSITY — measured, because "too big" is a measurement.
 *
 * Three complaints, three assertions, all geometric rather than visual:
 *   · the ring read-outs ("4g / PROTEIN LEFT") ran into the ring stroke;
 *   · Today and Nutrition read zoomed-in at the house type scale;
 *   · the bottom bar took more height than its content needed.
 *
 * The ring test is the one that could not be caught by eye at review time: it depends on the
 * rendered advance width of a particular string in a particular face, so it is asserted against
 * the SVG's own `getComputedTextLength` and the ring's actual inner diameter.
 */

/** Font size in px of a testid, as resolved by the cascade (which is where `ff-dense` acts). */
async function fontSizePx(page: Page, testId: string): Promise<number> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
}

test.describe('density', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('ring read-outs stay inside the ring, never touching the stroke', async ({ page }) => {
    await page.goto('/nutrition');
    await expect(page.getByTestId('day-summary')).toBeVisible();

    /* For every ring on the screen, compare each text run's rendered width against the opening
       available at its own vertical offset — a circle gives less room the further you are from the
       middle, which is exactly why the sublabel was the line that overflowed. */
    const results = await page.evaluate(() => {
      const out: { kind: string; width: number; opening: number; text: string }[] = [];
      for (const svg of Array.from(document.querySelectorAll('[data-testid="day-summary"] svg'))) {
        const track = svg.querySelector('circle');
        if (!track) continue;
        const size = parseFloat(svg.getAttribute('width') ?? '0');
        const stroke = parseFloat(track.getAttribute('stroke-width') ?? '0');
        const innerRadius = (size - 2 * stroke) / 2;
        for (const kind of ['ring-caption', 'ring-sublabel']) {
          const el = svg.querySelector<SVGTextElement>(`[data-testid="${kind}"]`);
          if (!el) continue;
          // Worst case for a line of text is its far edge from the centre, not its baseline.
          const fs = parseFloat(getComputedStyle(el).fontSize);
          const dy = Math.abs(parseFloat(el.getAttribute('dy') ?? '0')) + fs * 0.5;
          const opening = 2 * Math.sqrt(Math.max(0, innerRadius * innerRadius - dy * dy));
          out.push({
            kind,
            width: el.getComputedTextLength(),
            opening,
            text: el.textContent ?? '',
          });
        }
      }
      return out;
    });

    expect(results.length, 'both rings expose a caption and a sublabel').toBeGreaterThanOrEqual(4);
    for (const r of results) {
      expect(
        r.width,
        `"${r.text}" (${r.kind}) is ${r.width.toFixed(1)}px wide in a ${r.opening.toFixed(1)}px opening`,
      ).toBeLessThanOrEqual(r.opening);
    }
  });

  test('Today and Nutrition render at the dense type scale', async ({ page }) => {
    // The house scale is 16px body / 28px display; dense is 15 / 24. Asserting the RESOLVED size
    // proves the cascade reached the leaves, which is the part that would silently break if the
    // wrapper class were dropped or the token renamed.
    await page.goto('/nutrition');
    await expect(page.getByTestId('nutrition-view')).toBeVisible();
    const nutritionHeading = await page
      .getByRole('heading', { name: 'Nutrition' })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(nutritionHeading).toBeLessThanOrEqual(25);

    await page.goto('/today');
    await expect(page.getByTestId('today-view')).toBeVisible();
    const todayHeading = await fontSizePx(page, 'today-heading');
    expect(todayHeading).toBeLessThanOrEqual(25);
    // …and the supporting line came down with it rather than staying at the old body size.
    expect(await fontSizePx(page, 'today-subheading')).toBeLessThanOrEqual(13.5);

    // A screen NOT opted in keeps the house scale — this is a per-screen choice, not a sneaky
    // global restyle, and the assertion is what stops it becoming one.
    await page.goto('/progress');
    const progressHeading = await page
      .getByRole('heading', { name: 'Progress' })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(progressHeading).toBeGreaterThan(25);
  });

  test('the bottom bar is compact, and every tab still clears 44px to a finger', async ({
    page,
  }) => {
    await page.goto('/today');
    const bar = page.getByTestId('tab-bar');
    await expect(bar).toBeVisible();

    // The pill row itself — not the positioning layer, which also holds the Coach badge.
    const row = bar.locator('ul');
    const rowBox = (await row.boundingBox())!;
    expect(rowBox.height, 'the tab row is compact').toBeLessThanOrEqual(54);

    // COMPACT MUST NOT MEAN SMALL TO A THUMB. Each of the five tabs keeps a 44px-wide target,
    // which is what the shortening could plausibly have cost.
    for (const label of ['today', 'workouts', 'exercises', 'nutrition', 'progress']) {
      const box = (await page.getByTestId(`tab-${label}`).boundingBox())!;
      expect(box.width, `${label} tab width`).toBeGreaterThanOrEqual(44);
    }

    // The whole floating stack (Coach badge + bar + safe area) leaves the page usable.
    const navBox = (await bar.boundingBox())!;
    expect(navBox.height, 'the floating nav stack').toBeLessThanOrEqual(130);
    expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);

    // A viewport shot, because `fullPage` hoists fixed chrome out of the fold and never captures
    // this bar where it actually lives.
    await page.screenshot({ path: 'tests/screenshots/tab-bar-compact.png' });
  });
});
