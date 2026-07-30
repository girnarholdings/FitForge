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

/**
 * LOCAL calendar days, the same way the app computes them.
 *
 * These used to be `toISOString().slice(0, 10)`, i.e. UTC. That passes in a UTC CI box and lies
 * everywhere else: run the suite from Mumbai after 5:30am or from California before 5pm and the
 * spec's "today" is a different day from the app's, so it asserts against a key the app never
 * wrote. The app reads local calendar fields (`localISO`), so the spec must too.
 */
const localISO = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const yesterdayISO = () => localISO(new Date(Date.now() - 86400000));
const todayISO = () => localISO(new Date());

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

  test('a logged day gets the analytics layer: the gap in meals, real portions, one-tap fixes', async ({
    page,
  }) => {
    await seedOnboarded(page);
    await page.goto('/nutrition');

    // An empty day shows NO analytics — no walls of zeroes.
    await expect(page.getByTestId('day-analytics')).toHaveCount(0);

    // Log breakfast: two eggs, pinned to the Breakfast slot.
    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await page.getByTestId('composer-submit').click();
    const review = page.getByTestId('review-sheet');
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Breakfast', exact: true }).click();
    await page.getByTestId('review-confirm').click();
    await expect(review).toBeHidden();

    /* 1 · the analytics card appears, and it does NOT restate the summary.
       It used to open with its own per-macro bars ("Protein 110 g to go") under the summary's
       ("Protein 15 / 125 g · 12%") — same facts, same shape, one subtraction apart. Its job now is
       food: the gap expressed as MEALS, then real portions. */
    const analytics = page.getByTestId('day-analytics');
    await expect(analytics).toBeVisible();
    await expect(analytics).toContainText(/left to eat/i);
    await expect(page.getByTestId('meals-left')).toContainText(/\d+ more meals?/);

    /* 2 · the gap to the protein goal, then portions in units a person owns. */
    const gap = page.getByTestId('close-gap');
    await expect(gap).toContainText(/\d+ g protein/);
    const gapBefore = parseInt((await gap.innerText()).match(/(\d+) g protein/)?.[1] ?? '0', 10);
    expect(gapBefore).toBeGreaterThan(0);
    const suggestion = page.getByTestId('gap-suggestion').first();
    await expect(suggestion).toBeVisible();
    // A countable standard serving — "1 breast (172 g)" — not a gram figure scaled to close the day.
    await expect(suggestion).toContainText(/\d+\s+[A-Za-z][^()]*\(\d+ g\)/);

    /* 2b · THE WORKED COMBINATION, when no single portion covers the gap: the arithmetic on screen
       has to be the sum of the chips above it, or it is a different, hidden recommendation. */
    const plate = page.getByTestId('portion-plate');
    if (await plate.count()) {
      const plateText = await plate.innerText();
      expect(plateText).toMatch(/=\s*\d+ g protein/);
      const plateProtein = Number(
        (await page.getByTestId('plate-protein').innerText()).match(/(\d+)/)?.[1] ?? '0',
      );
      expect(plateProtein).toBeGreaterThan(0);
      expect(plateProtein, 'the plate never claims more than the gap needs').toBeLessThanOrEqual(
        gapBefore,
      );
    }

    // Element shot with the suggestion list on screen. Nudge the card below the sticky chrome
    // first — element screenshots composite any fixed overlay that intersects the box.
    await analytics.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await analytics.screenshot({ path: 'tests/screenshots/nutrition-analytics-card.png' });

    /* 3 · every logged row carries a face and its macro line. The face is a DRAWN icon from the
       food set (one stroke grammar with the rest of the app), never an emoji — asserted by
       checking the row renders an SVG glyph, which an emoji text node cannot satisfy. */
    const eggRow = page.getByText(/Egg, whole/i).first();
    await expect(eggRow).toBeVisible();
    await expect(
      page.getByTestId('nutrition-view').locator('.bg-accent-muted svg').first(),
    ).toBeVisible();
    // The meal header is a stat line: kcal, share of the day, protein.
    await expect(page.getByText(/% of day/).first()).toBeVisible();

    /* 4 · tapping a suggestion opens the normal confirm flow pre-filled to the suggested
       portion; confirming shrinks the gap. Pin it to Dinner so the day has TWO meals. */
    await suggestion.click();
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Dinner', exact: true }).click();
    await page.getByTestId('review-confirm').click();
    await expect(review).toBeHidden();

    await expect
      .poll(async () => {
        const text = await gap.innerText();
        const m = text.match(/(\d+) g protein/);
        return m ? parseInt(m[1]!, 10) : 0;
      })
      .toBeLessThan(gapBefore);

    /* 5 · with two meals on the day, the by-meal distribution renders with shares. */
    const dist = page.getByTestId('meal-distribution');
    await expect(dist).toBeVisible();
    await expect(dist).toContainText('Breakfast');
    await expect(dist).toContainText('Dinner');
    await expect(dist).toContainText(/%/);

    await page.screenshot({ path: 'tests/screenshots/nutrition-analytics.png', fullPage: true });
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
    // The AI-estimate path exists ONLY on builds with a Coach endpoint. This build has none, so
    // the button must be absent — "nothing was guessed" includes "no model was asked".
    await expect(review.getByTestId('unmatched-ai')).toHaveCount(0);

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

  test('every entry records WHEN it was logged, and the day lists them in that order', async ({
    page,
  }) => {
    /**
     * `logged_on` is the day the food counts toward; `logged_at` is the moment the athlete recorded
     * it. Keeping both is what lets Nutrition say "you logged breakfast at 8:42" — and it is the
     * difference between food entered as it was eaten and a whole day backfilled at midnight.
     */
    await seedOnboarded(page);
    await page.goto('/nutrition');

    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await page.getByTestId('composer-submit').click();
    await page.getByTestId('review-confirm').click();

    // On screen, beside the food: a real local clock time.
    const stamp = page.getByTestId('log-entry-time').first();
    await expect(stamp).toBeVisible();
    await expect(stamp).toHaveText(/^\d{1,2}:\d{2}(\s?[ap]m)?$/i);

    // In storage: a full device timestamp WITH an offset, plus the zone it was made in. The offset
    // is what keeps the time honest after the athlete flies somewhere else.
    const rows = await page.evaluate(
      ({ key, day }) => {
        const raw = window.localStorage.getItem(key);
        const state = raw ? (JSON.parse(raw) as { logsByDate: Record<string, { logged_at?: string; logged_tz?: string; logged_on: string }[]> }) : null;
        return state?.logsByDate[day] ?? [];
      },
      { key: DEMO_STORAGE_KEY, day: todayISO() },
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.logged_on, 'the day it counts toward is the LOCAL day').toBe(todayISO());
      expect(row.logged_at, 'every new row carries the moment it was entered').toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
      );
      expect(row.logged_at?.slice(0, 10)).toBe(todayISO());
      expect(typeof row.logged_tz).toBe('string');
    }

    // A row logged BEFORE this feature existed has no stamp, and must render as absent rather than
    // as a fabricated midnight. Same day, one unstamped row appended.
    await page.evaluate(
      ({ key, day }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return;
        const state = JSON.parse(raw) as { logsByDate: Record<string, unknown[]> };
        state.logsByDate[day] = [
          ...(state.logsByDate[day] ?? []),
          {
            id: 'nl-legacy-1',
            logged_on: day,
            meal_slot: 'breakfast',
            food_id: 'salmon',
            custom_name: 'Legacy row',
            quantity_g: 100,
            kcal: 200,
            protein_g: 20,
            carbs_g: 0,
            fat_g: 13,
          },
        ];
        window.localStorage.setItem(key, JSON.stringify(state));
      },
      { key: DEMO_STORAGE_KEY, day: todayISO() },
    );
    await page.reload();
    await expect(page.getByText('Legacy row').first()).toBeVisible();
    // The stamped rows still show a time; the legacy one shows none — so the count is unchanged.
    await expect(page.getByTestId('log-entry-time')).toHaveCount(rows.length);
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
    const logsByDate = (state as {
      logsByDate: Record<string, { logged_at?: string; logged_on: string }[]>;
    }).logsByDate;
    expect(logsByDate[todayISO()]?.length ?? 0).toBeGreaterThan(0);

    // Copying yesterday is an entry made NOW. The seeded source row had no stamp at all, so the
    // copies must be stamped fresh rather than inheriting (or faking) yesterday's time.
    for (const row of logsByDate[todayISO()] ?? []) {
      expect(row.logged_on).toBe(todayISO());
      expect(row.logged_at?.slice(0, 10), 'a copied row is stamped today, not yesterday').toBe(
        todayISO(),
      );
    }

    await page.reload();
    await expect(page.getByText('Atlantic Salmon, cooked').first()).toBeVisible();
  });
});
