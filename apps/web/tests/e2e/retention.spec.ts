/**
 * THE 180-DAY LOG BOUND, from the athlete's side.
 *
 * Why it exists: the cloud copy is one Firestore document with a 1 MiB ceiling, and a committed
 * athlete was measured crossing it at roughly a year of use — after which syncing froze silently
 * and everything newer lived on one phone only.
 *
 * Why it is safe: nothing is removed without 30 days of warning, and the code REFUSES to trim
 * anyone who has not actually been shown that warning. These specs pin both halves, because a
 * retention feature that is wrong in either direction — deleting too eagerly, or never bounding
 * anything — costs real training.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded, readDemoState, DEMO_STORAGE_KEY } from './helpers';

const WORKOUT_LOG_KEY = 'fitforge.workoutlog.v1';

/** `daysAgo` days before today, as YYYY-MM-DD in the browser's own local reckoning. */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Give this browser a log that reaches `oldestDaysAgo` back: one food day and one finished
 * session at that age, plus a recent pair that must always survive.
 */
async function seedHistory(
  page: Page,
  oldestDaysAgo: number,
  opts: { warned?: boolean } = {},
): Promise<void> {
  await seedOnboarded(page);
  await page.evaluate(
    ({ demoKey, logKey, oldDay, recentDay, warned }) => {
      const state = JSON.parse(window.localStorage.getItem(demoKey)!);
      const row = (id: string) => ({
        id,
        logged_on: id,
        meal_slot: 'breakfast',
        food_id: null,
        custom_name: 'Oats',
        quantity_g: 100,
        kcal: 380,
        protein_g: 13,
        carbs_g: 67,
        fat_g: 7,
        created_at: `${id}T08:00:00.000Z`,
        updated_at: `${id}T08:00:00.000Z`,
      });
      state.logsByDate = { [oldDay]: [row(oldDay)], [recentDay]: [row(recentDay)] };
      // Weigh-ins are never trimmed — seeded so the specs can prove that.
      state.weights = [{ date: oldDay, kg: 80 }, { date: recentDay, kg: 79 }];
      if (warned) state.retentionWarnedAt = new Date().toISOString();
      window.localStorage.setItem(demoKey, JSON.stringify(state));

      const session = (day: string, id: string) => ({
        id,
        dayId: 'd1',
        dayName: 'Push A',
        finishedAt: `${day}T18:00:00.000Z`,
        exercises: [],
      });
      window.localStorage.setItem(
        logKey,
        JSON.stringify({
          version: 1,
          sessions: [session(oldDay, 's-old'), session(recentDay, 's-recent')],
        }),
      );
    },
    {
      demoKey: DEMO_STORAGE_KEY,
      logKey: WORKOUT_LOG_KEY,
      oldDay: isoDaysAgo(oldestDaysAgo),
      recentDay: isoDaysAgo(3),
      warned: opts.warned ?? false,
    },
  );
}

test.describe('retention · the warning', () => {
  test('a log under 150 days says nothing at all', async ({ page }) => {
    await seedHistory(page, 100);
    await page.goto('/today');
    await expect(page.getByTestId('today-view')).toBeVisible();
    await expect(page.getByTestId('retention-warning')).toHaveCount(0);
    await expect(page.getByTestId('retention-pruned')).toHaveCount(0);
  });

  test('at 150 days it warns, counts down, and offers the backup', async ({ page }) => {
    await seedHistory(page, 160);
    await page.goto('/today');

    const warning = page.getByTestId('retention-warning');
    await expect(warning).toBeVisible();
    // The countdown is the point: 180 − 160 = 20 days left.
    await expect(warning).toContainText('20 days');
    await expect(warning).toContainText('180 days');
    await expect(page.getByTestId('retention-export')).toBeVisible();

    // The export is a real file, not a link to somewhere else.
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('retention-export').click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/^fitforge-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // Seeing it is what later authorises the trim.
    await expect
      .poll(async () => (await readDemoState(page))?.retentionWarnedAt)
      .toEqual(expect.any(String));
  });

  test('"Not now" clears it for this visit and keeps the training', async ({ page }) => {
    await seedHistory(page, 160);
    await page.goto('/today');
    await page.getByTestId('retention-dismiss').click();
    await expect(page.getByTestId('retention-warning')).toHaveCount(0);

    const state = (await readDemoState(page)) as { logsByDate: Record<string, unknown[]> };
    expect(Object.keys(state.logsByDate), 'dismissing must never delete anything').toHaveLength(2);
  });
});

test.describe('retention · the trim', () => {
  test('never runs on someone who was never warned', async ({ page }) => {
    // THE GATE. An imported old backup, or the first load after this feature shipped, is 200 days
    // deep with no warning on record. It must warn, and leave every byte alone.
    await seedHistory(page, 200, { warned: false });
    await page.goto('/today');

    await expect(page.getByTestId('retention-warning')).toBeVisible();
    await expect(page.getByTestId('retention-pruned')).toHaveCount(0);

    const state = (await readDemoState(page)) as { logsByDate: Record<string, unknown[]> };
    expect(Object.keys(state.logsByDate)).toHaveLength(2);
    const sessions = await page.evaluate(
      (k) => JSON.parse(window.localStorage.getItem(k)!).sessions.length,
      WORKOUT_LOG_KEY,
    );
    expect(sessions, 'no session may be removed before a warning was shown').toBe(2);
  });

  test('trims what is past the window once the warning has been seen, and says what went', async ({
    page,
  }) => {
    await seedHistory(page, 200, { warned: true });
    await page.goto('/today');

    const notice = page.getByTestId('retention-pruned');
    await expect(notice).toBeVisible();
    // It accounts for what it removed rather than leaving an unexplained hole.
    await expect(notice).toContainText('1 session');
    await expect(notice).toContainText('1 day');

    const state = (await readDemoState(page)) as {
      logsByDate: Record<string, unknown[]>;
      weights: { date: string }[];
      retentionPrunedAt: string | null;
    };
    // The 200-day-old day is gone; the recent one stays.
    expect(Object.keys(state.logsByDate)).toEqual([isoDaysAgo(3)]);
    expect(state.retentionPrunedAt).toEqual(expect.any(String));

    const sessions = await page.evaluate(
      (k) => JSON.parse(window.localStorage.getItem(k)!).sessions.map((s: { id: string }) => s.id),
      WORKOUT_LOG_KEY,
    );
    expect(sessions).toEqual(['s-recent']);

    // WEIGH-INS ARE NEVER TRIMMED — thirty bytes each, and the hardest record to reconstruct.
    expect(state.weights.map((w) => w.date)).toEqual([isoDaysAgo(200), isoDaysAgo(3)]);
  });

  test('the plan itself is never touched', async ({ page }) => {
    await seedHistory(page, 200, { warned: true });
    await page.goto('/today');
    await expect(page.getByTestId('retention-pruned')).toBeVisible();

    const state = (await readDemoState(page)) as {
      routine: { days: unknown[] } | null;
      targets: Record<string, number> | null;
      completedAt: string | null;
    };
    expect(state.routine, 'the routine survives a trim').toBeTruthy();
    expect(state.targets?.kcal_target).toBeGreaterThan(0);
    expect(state.completedAt).toEqual(expect.any(String));
    // …and the athlete is still in the app, not bounced anywhere.
    await expect(page).toHaveURL(/\/today/);
  });
});
