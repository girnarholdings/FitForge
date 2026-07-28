import { test, expect } from '@playwright/test';
import { readDemoState, seedOnboarded } from './helpers';

/**
 * VIEWING AND EDITING OTHER DAYS.
 *
 * Two separate promises, and the tests are split along that line because they fail differently:
 *   · Today can SHOW any day's scheduled session, past or future.
 *   · Nutrition can EDIT any day, which is what makes "I forgot to log last night" recoverable.
 *
 * The load-bearing assertion throughout is which DATE a write lands on. A date picker that changes
 * the heading but writes to today is worse than no date picker at all — it silently corrupts the
 * day you were trying to fix.
 */

test.use({ viewport: { width: 390, height: 664 } });

/** Local `YYYY-MM-DD`, matching lib/demo/selectedDate — never `toISOString`, which shifts by UTC. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test.describe('day navigation', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('Today starts on today and says so', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByTestId('date-nav-label')).toHaveText('Today');
    // No "back to today" control when already there — it would be a no-op button.
    await expect(page.getByTestId('date-today')).toHaveCount(0);
  });

  test('stepping back and forward moves one day at a time', async ({ page }) => {
    await page.goto('/today');
    await page.getByTestId('date-prev').click();
    await expect(page.getByTestId('date-nav-label')).toHaveText('Yesterday');
    await page.getByTestId('date-prev').click();
    await page.getByTestId('date-next').click();
    await expect(page.getByTestId('date-nav-label')).toHaveText('Yesterday');
    await page.getByTestId('date-next').click();
    await expect(page.getByTestId('date-nav-label')).toHaveText('Today');
  });

  test('a future day shows its planned session but cannot be started', async ({ page }) => {
    await page.goto('/today');
    // Walk forward until a scheduled session turns up — which day that is depends on the split.
    let found = false;
    for (let i = 0; i < 7 && !found; i += 1) {
      await page.getByTestId('date-next').click();
      found = (await page.getByTestId('workout-not-today').count()) > 0;
    }
    expect(found, 'expected a scheduled session within the next week').toBe(true);

    // Starting is a today-only action: the player writes sets against the live clock.
    await expect(page.getByRole('link', { name: /start workout/i })).toHaveCount(0);
    await expect(page.getByTestId('workout-not-today')).toContainText(/planned for this day/i);
  });

  test('"back to today" returns from anywhere', async ({ page }) => {
    await page.goto('/today');
    for (let i = 0; i < 4; i += 1) await page.getByTestId('date-prev').click();
    await page.getByTestId('date-today').click();
    await expect(page.getByTestId('date-nav-label')).toHaveText('Today');
  });

  test('the day carries across from Today to Nutrition', async ({ page }) => {
    // Reviewing Tuesday should mean Tuesday's training AND Tuesday's food, not one of each.
    await page.goto('/today');
    await page.getByTestId('date-prev').click();
    await expect(page.getByTestId('date-nav-label')).toHaveText('Yesterday');
    await page.getByTestId('tab-nutrition').click();
    await page.waitForURL(/\/nutrition/);
    await expect(page.getByTestId('date-nav-label')).toHaveText('Yesterday');
  });
});

test.describe('backfilling a missed day', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('food logged while viewing yesterday is stored against YESTERDAY', async ({ page }) => {
    await page.goto('/nutrition');
    await page.getByTestId('date-prev').click();
    await expect(page.getByTestId('date-nav-label')).toHaveText('Yesterday');

    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await page.getByTestId('composer-submit').click();
    await page.getByTestId('review-confirm').click();

    const yesterday = isoOffset(-1);
    const today = isoOffset(0);
    const state = (await readDemoState(page)) as {
      logsByDate: Record<string, { logged_on: string }[]>;
    };

    // THE WHOLE POINT. The row must exist under yesterday and today must be untouched.
    expect(state.logsByDate[yesterday]?.length ?? 0, 'logged onto yesterday').toBeGreaterThan(0);
    expect(state.logsByDate[today]?.length ?? 0, 'today must not have been written').toBe(0);
    // And the row's own stamp must agree with the bucket it landed in.
    expect(state.logsByDate[yesterday]![0]!.logged_on).toBe(yesterday);
  });

  test('returning to today shows an empty day again', async ({ page }) => {
    await page.goto('/nutrition');
    await page.getByTestId('date-prev').click();
    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await page.getByTestId('composer-submit').click();
    await page.getByTestId('review-confirm').click();

    await page.getByTestId('date-today').click();
    await expect(page.getByTestId('date-nav-label')).toHaveText('Today');

    // Asserted against the STORE, not the screen. "Eggs" legitimately appears on today as a
    // quick-log chip — recents are drawn from history across every day, which is the feature
    // working — so searching the page for the word would fail on correct behaviour. What must be
    // true is that today's LOG is still empty.
    const state = (await readDemoState(page)) as { logsByDate: Record<string, unknown[]> };
    expect(state.logsByDate[isoOffset(0)]?.length ?? 0, "today's log stays empty").toBe(0);
    expect(state.logsByDate[isoOffset(-1)]?.length ?? 0, 'yesterday keeps its entry').toBeGreaterThan(0);
  });

  test('the strip marks days that already have food on them', async ({ page }) => {
    await page.goto('/nutrition');
    await page.getByTestId('date-prev').click();
    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await page.getByTestId('composer-submit').click();
    await page.getByTestId('review-confirm').click();
    // The dot is what makes the strip a map of which nights were missed.
    await expect(page.getByTestId(`date-cell-${isoOffset(-1)}`)).toBeVisible();
  });
});
