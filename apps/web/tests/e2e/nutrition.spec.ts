import { test, expect } from '@playwright/test';
import { resetDemo, readDemoState, DEMO_STORAGE_KEY, seedOnboarded } from './helpers';

/**
 * Nutrition — CONVERSATIONAL logging.
 *
 * The primary path is now: type a sentence → the deterministic parser (`lib/food/parse`) turns it
 * into items → a confirm sheet shows what it thinks each one equates to → the user confirms, and
 * only then is anything written to the day. These specs drive that path end-to-end, plus the
 * honest "no match" surface, real search over the 509-food catalog, and copy-yesterday.
 */

const yesterdayISO = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

test.describe('nutrition', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('typing a sentence parses it, the confirm step shows the maths, and confirming logs the day', async ({
    page,
  }) => {
    await seedOnboarded(page);
    await page.goto('/nutrition');

    await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible();

    // 1 · say what you ate, in words.
    const composer = page.getByTestId('nutrition-composer');
    await expect(composer).toBeVisible();
    await composer.fill('2 eggs and a slice of toast with butter');
    await page.getByTestId('composer-submit').click();

    // 2 · the confirm step lists every item it understood, with its computed nutrition.
    const review = page.getByTestId('review-sheet');
    await expect(review).toBeVisible();
    await expect(review.getByTestId('review-row')).toHaveCount(3);
    await expect(review.getByText(/Egg, whole/i)).toBeVisible();
    await expect(review.getByText(/Bread, white/i)).toBeVisible();
    await expect(review.getByText(/Butter/i).first()).toBeVisible();
    await expect(page.getByTestId('review-total')).toContainText(/kcal/);

    // Nothing is logged until confirm.
    const beforeState = await readDemoState(page);
    const beforeLogs =
      (beforeState as { logsByDate: Record<string, unknown[]> }).logsByDate[todayISO()] ?? [];
    expect(beforeLogs.length).toBe(0);

    await page.screenshot({ path: 'tests/screenshots/nutrition-confirm.png' });

    // 3 · confirm commits everything at once.
    await page.getByTestId('review-confirm').click();
    await expect(review).toBeHidden();
    await expect(page.getByText(/Egg, whole/i).first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/nutrition.png', fullPage: true });

    const state = await readDemoState(page);
    const logsByDate = (state as { logsByDate: Record<string, unknown[]> }).logsByDate;
    expect(logsByDate[todayISO()], 'today has persisted food logs').toBeTruthy();
    expect(logsByDate[todayISO()]?.length ?? 0).toBe(3);

    // Survives a reload.
    await page.reload();
    await expect(page.getByText(/Egg, whole/i).first()).toBeVisible();
  });

  test('a phrase the parser cannot match is surfaced honestly, never guessed', async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/nutrition');

    await page.getByTestId('nutrition-composer').fill('asdfgh and 2 eggs');
    await page.getByTestId('composer-submit').click();

    const review = page.getByTestId('review-sheet');
    await expect(review).toBeVisible();
    await expect(review.getByText(/No match in the food database/i)).toBeVisible();
    await expect(review.getByTestId('unmatched-search')).toBeVisible();

    // Only the item it actually recognised is logged.
    await page.getByTestId('review-confirm').click();
    const state = await readDemoState(page);
    const logs = (state as { logsByDate: Record<string, unknown[]> }).logsByDate[todayISO()] ?? [];
    expect(logs.length).toBe(1);
  });

  test('search returns real results for the everyday queries that used to return nothing', async ({
    page,
  }) => {
    await seedOnboarded(page);
    await page.goto('/nutrition');

    await page.getByRole('button', { name: /search the food list/i }).click();
    const search = page.getByRole('combobox', { name: 'Search foods' });
    await expect(search).toBeVisible();

    for (const [query, expected] of [
      ['chicken', /Chicken/i],
      ['pizza', /Pizza/i],
      ['coffee', /Coffee/i],
      ['burger', /burger/i],
    ] as const) {
      await search.fill(query);
      await expect(page.getByRole('option').first()).toBeVisible();
      await expect(page.getByRole('option', { name: expected }).first()).toBeVisible();
    }

    // Picking a result still goes through the confirm step.
    await search.fill('chicken');
    await page.getByRole('option', { name: /Chicken/i }).first().click();
    await expect(page.getByTestId('review-sheet')).toBeVisible();
    await page.getByTestId('review-confirm').click();
    await expect(page.getByText(/Chicken/i).first()).toBeVisible();

    const state = await readDemoState(page);
    const logs = (state as { logsByDate: Record<string, unknown[]> }).logsByDate[todayISO()] ?? [];
    expect(logs.length).toBeGreaterThan(0);
  });

  test('correcting a match teaches the parser — the same words resolve to the fixed food next time', async ({
    page,
  }) => {
    await seedOnboarded(page);
    await page.goto('/nutrition');

    // "bread" resolves to the generic white bread…
    await page.getByTestId('nutrition-composer').fill('bread');
    await page.getByTestId('composer-submit').click();
    const review = page.getByTestId('review-sheet');
    await expect(review.getByText(/Bread, white/i)).toBeVisible();

    // …the user corrects it to sourdough.
    await review.getByTestId('review-row-food').first().click();
    const search = page.getByRole('combobox', { name: 'Search foods' });
    await search.fill('sourdough');
    await page.getByRole('option', { name: /sourdough/i }).first().click();
    await expect(review.getByText(/Bread, sourdough/i)).toBeVisible();
    await page.getByTestId('review-confirm').click();

    // The correction is remembered locally…
    const aliases = await page.evaluate(() =>
      window.localStorage.getItem('fitforge.foodAliases.v1'),
    );
    expect(aliases).toContain('sourdough');

    // …and the same phrase now resolves to sourdough without any correction.
    await page.getByTestId('nutrition-composer').fill('bread');
    await page.getByTestId('composer-submit').click();
    await expect(review.getByText(/Bread, sourdough/i)).toBeVisible();
  });

  test('copy-yesterday re-logs the previous day’s meals into today and persists', async ({
    page,
  }) => {
    await seedOnboarded(page);

    const y = yesterdayISO();
    await page.evaluate(
      ({ key, date }) => {
        const raw = window.localStorage.getItem(key);
        const state = raw ? JSON.parse(raw) : {};
        state.logsByDate = state.logsByDate ?? {};
        state.logsByDate[date] = [
          {
            id: 'nl-yesterday-1',
            logged_on: date,
            meal_slot: 'lunch',
            food_id: 'salmon',
            custom_name: 'Atlantic Salmon, cooked',
            quantity_g: 150,
            kcal: 312,
            protein_g: 30,
            carbs_g: 0,
            fat_g: 19.5,
          },
        ];
        window.localStorage.setItem(key, JSON.stringify(state));
      },
      { key: DEMO_STORAGE_KEY, date: y },
    );

    await page.goto('/nutrition');

    const copyBtn = page.getByTestId('copy-yesterday');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    await expect(page.getByText('Atlantic Salmon, cooked').first()).toBeVisible();

    const state = await readDemoState(page);
    const logsByDate = (state as { logsByDate: Record<string, unknown[]> }).logsByDate;
    expect(logsByDate[todayISO()]?.length ?? 0).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByText('Atlantic Salmon, cooked').first()).toBeVisible();
  });
});
