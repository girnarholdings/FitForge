import { test, expect } from '@playwright/test';
import { resetDemo, seedOnboarded, openSettings} from './helpers';

async function exerciseCount(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('exercise-count').innerText();
  return parseInt(text, 10);
}

test.describe('exercises', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    // The (app) gate redirects non-onboarded visits to /onboarding/welcome, so
    // establish a completed onboarding before deep-linking into /exercises.
    await seedOnboarded(page);
  });

  test('catalog lists exercises and a category filter narrows the list', async ({ page }) => {
    await page.goto('/exercises');
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();

    const total = await exerciseCount(page);
    expect(total).toBeGreaterThan(1);

    // At least one catalog row links to a detail page (scope to main; the nav also links here).
    await expect(page.locator('main a[href^="/exercises/"]').first()).toBeVisible();

    // Apply a category filter; the count must not exceed the unfiltered total,
    // and the filtered set is smaller (fixture catalog spans multiple categories).
    // "Legs" is unique to the category facet row (avoids the Chest/Glutes muscle-facet clash).
    await page.getByRole('button', { name: 'Legs', exact: true }).click();
    const filtered = await exerciseCount(page);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
  });

  test('detail page shows the exercise, muscles, and substitution suggestions', async ({
    page,
  }) => {
    await page.goto('/exercises');
    const firstRow = page.locator('main a[href^="/exercises/"]').first();
    const name = (await firstRow.locator('p.font-semibold').first().innerText()).trim();
    await firstRow.click();

    await page.waitForURL(/\/exercises\/[^/]+\/?$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Muscles worked')).toBeVisible();
    await expect(page.getByText('Equipment', { exact: true })).toBeVisible();

    // Substitutes section with at least one real suggestion.
    await expect(page.getByText('Swap / similar exercises')).toBeVisible();
    const subsCard = page.locator('div.rounded-card', { hasText: 'Swap / similar' }).first();
    await expect(subsCard.locator('a[href^="/exercises/"]').first()).toBeVisible();

    // NOTE: exercise-detail.png is captured by screenshots.spec.ts at 390x664.

    // "See all" opens the full swap sheet (titled "Swap <exercise>").
    await page.getByRole('button', { name: 'See all' }).click();
    await expect(page.getByText(`Swap ${name}`)).toBeVisible();
  });

  /**
   * The body-shape filter is MULTI-select: several muscles can be tapped in one visit to the
   * map, the sheet stays open while you pick, and the result set is the UNION (OR) of them —
   * an AND across muscles would return near-nothing on a 59-row catalog.
   */
  test('muscle-map filter is multi-select and unions the tapped muscles', async ({ page }) => {
    await page.goto('/exercises');
    const total = await exerciseCount(page);

    const sheetMap = page.getByTestId('muscle-map-picker');
    const selection = page.getByTestId('map-selection');
    // dispatchEvent avoids SVG hit-testing (mirrored muscle groups have a centre gap).
    const tapMuscle = (name: string) =>
      sheetMap.getByRole('button', { name, exact: true }).first().dispatchEvent('click');

    await page.getByTestId('muscle-filter-open').click();
    await expect(page.getByText(/tap as many muscles as you like/i)).toBeVisible();
    await expect(selection).toContainText('No muscles selected');

    // 1 · first muscle — the sheet must STAY OPEN so a second one can be picked.
    await tapMuscle('Calves');
    await expect(sheetMap).toBeVisible();
    await expect(selection.getByRole('button', { name: 'Calves', exact: true })).toBeVisible();

    await page.getByTestId('map-done').click();
    const calvesOnly = await exerciseCount(page);
    expect(calvesOnly).toBeGreaterThan(0);
    expect(calvesOnly).toBeLessThan(total);

    // 2 · add a second, unrelated muscle. The count must GROW (union), not collapse.
    await page.getByTestId('muscle-filter-open').click();
    await tapMuscle('Chest');
    await expect(selection.getByRole('button', { name: 'Calves', exact: true })).toBeVisible();
    await expect(selection.getByRole('button', { name: 'Chest', exact: true })).toBeVisible();
    await page.getByTestId('map-done').click();

    const both = await exerciseCount(page);
    expect(both).toBeGreaterThan(calvesOnly);
    expect(both).toBeLessThanOrEqual(total);

    // Each selection is its own removable chip, and the Filters badge counts them all.
    // (Scope to the active-filter row: "Chest" is also a body-part category chip.)
    const active = page.getByTestId('active-filters');
    await expect(page.getByTestId('exercise-filters-open')).toContainText('2');
    await expect(active.getByRole('button', { name: 'Calves', exact: true })).toBeVisible();
    await expect(active.getByRole('button', { name: 'Chest', exact: true })).toBeVisible();

    // 3 · removing one chip leaves the other filter in place…
    await active.getByRole('button', { name: 'Chest', exact: true }).click();
    expect(await exerciseCount(page)).toBe(calvesOnly);

    // …and removing the last one restores the full list.
    await active.getByRole('button', { name: 'Calves', exact: true }).click();
    expect(await exerciseCount(page)).toBe(total);
  });

  test('tapping the same muscle twice deselects it, and Clear all empties the selection', async ({
    page,
  }) => {
    await page.goto('/exercises');
    const total = await exerciseCount(page);

    const sheetMap = page.getByTestId('muscle-map-picker');
    const selection = page.getByTestId('map-selection');
    const tapMuscle = (name: string) =>
      sheetMap.getByRole('button', { name, exact: true }).first().dispatchEvent('click');

    await page.getByTestId('muscle-filter-open').click();
    await tapMuscle('Calves');
    await expect(selection.getByRole('button', { name: 'Calves', exact: true })).toBeVisible();

    // Tap it again → toggled back off.
    await tapMuscle('Calves');
    await expect(selection).toContainText('No muscles selected');

    // Two muscles, then Clear all wipes both at once.
    await tapMuscle('Calves');
    await tapMuscle('Chest');
    await page.getByTestId('map-clear-muscles').click();
    await expect(selection).toContainText('No muscles selected');
    await expect(page.getByTestId('map-clear-muscles')).toBeHidden();

    await page.getByTestId('map-done').click();
    expect(await exerciseCount(page)).toBe(total);
  });
});

/**
 * WS-3 / WS-4 — the library has to be REACHABLE, each exercise has to explain how it is
 * performed, and the plan's aggregated muscle volume has to render for a freshly onboarded user.
 */
test.describe('exercise library access, how-to, and aggregated targeting', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('Exercises is reachable from the mobile bottom tab bar (WS-4)', async ({ page }) => {
    await page.goto('/today');

    // The bottom tab bar is the mobile primary nav; Exercises used to be missing from it.
    const tabBar = page.getByRole('navigation', { name: 'Primary' });
    await expect(tabBar).toBeVisible();

    const exercisesTab = tabBar.getByRole('link', { name: 'Exercises' });
    await expect(exercisesTab).toBeVisible();
    await exercisesTab.click();

    await page.waitForURL(/\/exercises\/?$/);
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();
    // ...and it reads as the current tab.
    await expect(tabBar.getByRole('link', { name: 'Exercises' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Settings left the tab bar but is still one tap away via the mobile top-bar gear.
    await page.getByTestId('mobile-settings').click();
    await openSettings(page);
    await page.waitForURL(/\/settings/);
    // The gear lands on the PROFILE screen, whose settings live behind a disclosure.
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
  });

  test('exercise detail explains how to perform the movement with pose frames (WS-3)', async ({
    page,
  }) => {
    await page.goto('/exercises/barbell-back-squat/');

    const howTo = page.getByTestId('how-to-perform');
    await expect(howTo).toBeVisible();
    await expect(howTo.getByText('How to perform')).toBeVisible();

    // Self-authored SVG pose frames (no external assets). The animated loop is hidden under
    // prefers-reduced-motion by design, so assert the always-present static strip.
    await expect(page.getByTestId('pose-frames')).toBeVisible();
    await expect(page.getByTestId('pose-strip')).toBeVisible();
    await expect(page.getByTestId('pose-frame-0')).toBeVisible();
    await expect(page.getByTestId('pose-frame-0').locator('svg')).toBeVisible();

    // Numbered execution steps derived from the authored instructions.
    const steps = page.getByTestId('howto-steps').locator('li');
    expect(await steps.count()).toBeGreaterThanOrEqual(2);
    await expect(steps.first()).not.toBeEmpty();

    // Set-up / breathing / tempo coaching lines.
    await expect(howTo.getByText('Set up')).toBeVisible();
    await expect(howTo.getByText(/Breathing/)).toBeVisible();
    await expect(howTo.getByText(/Tempo/)).toBeVisible();
  });

  test('the aggregated targeting view renders real muscle volume for the plan (WS-4)', async ({
    page,
  }) => {
    await page.goto('/exercises');

    await page.getByTestId('exercises-tab-targets').click();

    const volume = page.getByTestId('muscle-volume');
    await expect(volume).toBeVisible();
    // It must be the REAL aggregate, not the "nothing to aggregate yet" fallback.
    await expect(volume).not.toContainText('Nothing to aggregate yet');
    await expect(volume.getByText(/sets a week across/)).toBeVisible();

    const bars = page.getByTestId('muscle-volume-bars');
    await expect(bars).toBeVisible();
    const rows = bars.locator('li');
    expect(await rows.count()).toBeGreaterThan(2);

    // Every row carries a weighted sets-per-week number and at least one is non-zero.
    const numbers = await bars.locator('span.tabular').allInnerTexts();
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.some((t) => parseFloat(t) > 0)).toBe(true);

    // The heat silhouette renders alongside the bars.
    await expect(volume.locator('svg').first()).toBeVisible();

    // Drilling into a muscle jumps back to the Library filtered to it.
    const firstRow = bars.locator('button[data-testid^="muscle-volume-row-"]').first();
    const muscleName = (await firstRow.locator('span.font-semibold').first().innerText()).trim();
    await firstRow.click();
    await expect(page.getByTestId('exercise-search')).toBeVisible();
    await expect(
      page.getByRole('button', { name: muscleName, exact: true }).first(),
    ).toBeVisible();
    const filtered = await exerciseCount(page);
    expect(filtered).toBeGreaterThan(0);
  });
});
