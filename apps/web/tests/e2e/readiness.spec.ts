import { test, expect, type Page } from '@playwright/test';
import { readDemoState, resetDemo, seedOnboarded, DEMO_STORAGE_KEY } from './helpers';

/**
 * MORNING CHECK-IN → DYNAMIC SPLIT (phase 3 of the iOS/HealthKit prewalk, no iOS required).
 *
 * The contract under test, in the feature's own terms:
 *   · a green morning changes NOTHING (fire rarely, high precision);
 *   · a rough morning offers ONE accept/reject edit, and ACCEPT hands a real, edited RoutineDay
 *     to the quick-session machinery — the player runs it like any planned day;
 *   · "under the weather" can only ever produce REST plus the see-a-doctor line (the safety gate
 *     is separate from scoring);
 *   · rejections are recorded — they are the recalibration signal;
 *   · the AI describe-it path simply does not exist on a build with no Coach endpoint.
 */

/** Make TODAY a guaranteed training day: pin the first non-empty routine day to today's weekday. */
async function trainingToday(page: Page): Promise<void> {
  await seedOnboarded(page);
  await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    const s = JSON.parse(raw!) as {
      routine: { days: { weekday: number | null; exercises: unknown[] }[] };
    };
    const appDay = (new Date().getDay() + 6) % 7; // JS 0=Sun → blueprint 0=Mon
    const target = s.routine.days.find((d) => d.exercises.length > 0)!;
    for (const d of s.routine.days) if (d.weekday === appDay) d.weekday = (appDay + 1) % 7;
    target.weekday = appDay;
    window.localStorage.setItem(key, JSON.stringify(s));
  }, DEMO_STORAGE_KEY);
  await page.goto('/today');
  await expect(page.getByTestId('morning-checkin')).toBeVisible();
}

async function readReadinessLog(page: Page): Promise<{ entries: { offered: string; decision: string | null; source: string }[] }> {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('fitforge.readiness.v1') ?? '{"entries":[]}'));
}

test.describe('morning check-in', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('a good morning is green, offers nothing, and collapses to a quiet chip', async ({ page }) => {
    await trainingToday(page);
    await page.getByTestId('checkin-open').click();

    // Defaults describe a fine morning; no AI section on this build (no Coach endpoint baked in).
    await expect(page.getByTestId('adapt-feeling')).toHaveCount(0);
    await page.getByTestId('checkin-submit').click();

    const verdict = page.getByTestId('readiness-verdict');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText(/Readiness \d+/);
    await expect(page.getByTestId('offer-action')).toHaveText('Train as planned');
    await page.getByTestId('adapt-accept').click();

    // The card collapses to a summary; nothing about the plan changed.
    await expect(page.getByTestId('checkin-summary')).toContainText(/train as planned/i);
    const state = (await readDemoState(page)) as { quickSession?: unknown };
    expect(state.quickSession ?? null, 'a green day must not stage any session').toBeNull();
  });

  test('a rough morning offers HALF THE SETS, and accepting starts a genuinely reduced session', async ({
    page,
  }) => {
    await trainingToday(page);
    const before = (await readDemoState(page)) as {
      routine: { days: { exercises: { sets: number }[] }[] };
    };

    await page.getByTestId('checkin-open').click();
    await page.getByRole('button', { name: '5–6h' }).click();
    await page.getByRole('button', { name: 'Energy 2 of 5' }).click();
    await page.getByRole('button', { name: 'Stress 4 of 5' }).click();
    await page.getByTestId('checkin-submit').click();

    await expect(page.getByTestId('offer-action')).toHaveText('Half the sets today');
    await expect(page.getByTestId('offer-reason')).toContainText(/sleep|energy/i);
    await page.getByTestId('adapt-accept').click();

    // ONE CLICK LATER: we are in the quick-session player, on an edited but REAL day.
    await page.waitForURL(/\/workout\/quick/);
    const state = (await readDemoState(page)) as {
      quickSession: { name: string; exercises: { sets: number }[] } | null;
    };
    expect(state.quickSession, 'accept staged a quick session').toBeTruthy();
    expect(state.quickSession!.name).toMatch(/· reduced$/);
    const originalSets = before.routine.days
      .find((d) => d.exercises.length > 0)!
      .exercises.map((e) => e.sets);
    const reducedSets = state.quickSession!.exercises.map((e) => e.sets);
    for (let i = 0; i < reducedSets.length; i++) {
      expect(reducedSets[i]!).toBe(Math.max(2, Math.floor(originalSets[i]! / 2)));
    }

    const log = await readReadinessLog(page);
    expect(log.entries[0]!.offered).toBe('reduce');
    expect(log.entries[0]!.decision).toBe('accepted');
    expect(log.entries[0]!.source).toBe('rules');
  });

  test('"under the weather" can only produce REST + the doctor line, and a rejection is recorded', async ({
    page,
  }) => {
    await trainingToday(page);
    await page.getByTestId('checkin-open').click();
    await page.getByTestId('checkin-unwell').click();
    await page.getByTestId('checkin-submit').click();

    await expect(page.getByTestId('offer-action')).toHaveText('Take a rest day');
    await expect(page.getByTestId('offer-safety')).toContainText(/doctor/i);

    await page.getByTestId('adapt-reject').click();
    await expect(page.getByTestId('checkin-summary')).toContainText(/kept the plan/i);

    const log = await readReadinessLog(page);
    expect(log.entries[0]!.offered).toBe('rest');
    expect(log.entries[0]!.decision).toBe('rejected');
    // And nothing was staged: rejecting means the plan stands exactly as it was.
    const state = (await readDemoState(page)) as { quickSession?: unknown };
    expect(state.quickSession ?? null).toBeNull();
  });

  test('the check-in never appears on a rest day — its offers edit TODAY’s session only', async ({
    page,
  }) => {
    await seedOnboarded(page);
    // Pin every training day AWAY from today, making today a guaranteed rest day.
    await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      const s = JSON.parse(raw!) as { routine: { days: { weekday: number | null }[] } };
      const appDay = (new Date().getDay() + 6) % 7;
      for (const d of s.routine.days) if (d.weekday === appDay) d.weekday = (appDay + 1) % 7;
      window.localStorage.setItem(key, JSON.stringify(s));
    }, DEMO_STORAGE_KEY);
    await page.goto('/today');
    await expect(page.getByText('Rest day').first()).toBeVisible();
    await expect(page.getByTestId('morning-checkin')).toHaveCount(0);
  });
});
