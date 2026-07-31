import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded, resetDemo, DEMO_STORAGE_KEY } from './helpers';

/**
 * APPLE HEALTH → DASHBOARDS (iOS shell contract) — runs WITHOUT the shell.
 *
 * The shell's only job web-side is to fill `fitforge.health.v1`; everything the product does with
 * it is plain web code. So these specs seed that key directly and assert the three surfaces:
 *
 *   · TODAY gets one hairline "Overnight" ledger row — only on days with data, sleep as H:MM,
 *     resting HR only against a ≥14-day baseline (Law 5), and NEVER dashes when data is missing;
 *   · the CHECK-IN sleep chips arrive pre-selected with a "from Apple Health" tag, and correcting
 *     removes the claim — the user's pick is theirs;
 *   · the PROFILE "Apple Health" card exists ONLY inside the shell (faked here via the injected
 *     `window.ForgeShell` global — detection is the global, never the user agent).
 *
 * THE SEED SHAPE below matches the store's real schema (lib/health/store.ts): `daily` holds
 * day-grained `DailyMetricPoint {date, value, unit}` arrays per quantity metric, `samples` holds
 * `hkUuid`-keyed `{hkUuid, start, end, value, unit, kind}` rows for sleep/workouts, and `meta`
 * carries the permission map + sync stamps the Profile card states. The store's normalize()
 * validates this shape on load, so a drifted seed fails loudly here rather than silently.
 */

const HEALTH_KEY = 'fitforge.health.v1';

/** Make TODAY a guaranteed training day (same trick as readiness.spec.ts). */
async function trainingToday(page: Page): Promise<void> {
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
}

/**
 * Write a `fitforge.health.v1` store: last night's sleep (6h12m, so H:MM formatting is visibly
 * not a decimal) and `rhrDays` of resting-HR history — 21 days yields a 51 bpm baseline under
 * today's 54; fewer than 14 must yield NO baseline and therefore no RHR clause anywhere.
 */
async function seedHealth(
  page: Page,
  opts: { sleep?: boolean; rhrDays?: number; permissions?: boolean } = {},
): Promise<void> {
  const { sleep = true, rhrDays = 21, permissions = false } = opts;
  await page.evaluate(
    ({ key, sleep, rhrDays, permissions }) => {
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
      const daysAgo = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d;
      };

      // Resting HR: flat 51 bpm history, 54 this morning → baseline (14-day median) = 51.
      // ASCENDING by date, as the store's ingestion writes it — the seed bypasses ingestion, so
      // it must honour the store's own ordering invariant.
      const restingHeartRate = Array.from({ length: rhrDays }, (_, idx) => {
        const i = rhrDays - 1 - idx;
        return { date: iso(daysAgo(i)), value: i === 0 ? 54 : 51, unit: 'bpm' };
      });

      // Last night: 23:50 → 06:02 = 6h12m, ENDING on this morning's calendar date (the
      // selector keys a session to the morning its end falls on). The value carries the hours;
      // the timestamps carry the local offset so `.slice(0, 10)` is the local date.
      const start = daysAgo(1);
      start.setHours(23, 50, 0, 0);
      const end = daysAgo(0);
      end.setHours(6, 2, 0, 0);
      const localIso = (d: Date) => {
        const offMin = -d.getTimezoneOffset();
        const sign = offMin >= 0 ? '+' : '-';
        const abs = Math.abs(offMin);
        const hh = String(Math.floor(abs / 60)).padStart(2, '0');
        const mm = String(abs % 60).padStart(2, '0');
        const t = (n: number) => String(n).padStart(2, '0');
        return `${iso(d)}T${t(d.getHours())}:${t(d.getMinutes())}:00${sign}${hh}:${mm}`;
      };
      const sleepSamples = sleep
        ? [
            {
              hkUuid: 'spec-sleep-1',
              start: localIso(start),
              end: localIso(end),
              value: 6.2,
              unit: 'hr',
              kind: 'asleep',
            },
          ]
        : [];

      const state = {
        version: 1,
        daily: {
          restingHeartRate,
        },
        samples: {
          sleep: sleepSamples,
          workouts: [],
        },
        meta: {
          permissions: permissions
            ? {
                sleep: { requested: true, determined: true, yieldedData: true },
                restingHeartRate: { requested: true, determined: true, yieldedData: true },
                hrvSdnn: { requested: true, determined: true, yieldedData: false },
                bodyMass: { requested: true, determined: true, yieldedData: false },
                steps: { requested: true, determined: true, yieldedData: true },
                activeEnergy: { requested: true, determined: true, yieldedData: true },
                workouts: { requested: true, determined: true, yieldedData: false },
              }
            : null,
          permissionsUpdatedAt: permissions ? new Date().toISOString() : null,
          lastBatchAt: new Date().toISOString(),
          lastSyncCompleteAt: new Date().toISOString(),
          staleSince: null,
          disconnected: false,
          healthWeightDates: [],
        },
      };
      window.localStorage.setItem(key, JSON.stringify(state));
    },
    { key: HEALTH_KEY, sleep, rhrDays, permissions },
  );
  await page.reload();
}

test.describe('the Overnight ledger row', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await seedOnboarded(page);
  });

  test('states last night as a fact — sleep as H:MM, resting HR against the usual', async ({
    page,
  }) => {
    await seedHealth(page, { sleep: true, rhrDays: 21 });
    await page.goto('/today');
    const row = page.getByTestId('overnight-row');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Overnight');
    await expect(row).toContainText('Slept 6:12'); // H:MM, never "6.2"
    await expect(row).toContainText('resting HR 54 (usual 51)');
    // A fact line, not a control: nothing tappable rides in it.
    expect(await row.getByRole('button').count()).toBe(0);
    expect(await row.getByRole('link').count()).toBe(0);
  });

  test('below the 14-day baseline the RHR clause is omitted — sleep stands alone (Law 5)', async ({
    page,
  }) => {
    await seedHealth(page, { sleep: true, rhrDays: 5 });
    await page.goto('/today');
    const row = page.getByTestId('overnight-row');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Slept 6:12');
    await expect(row).not.toContainText('resting HR');
    await expect(row).not.toContainText('—');
  });

  test('no data means NO row — silence, never dashes', async ({ page }) => {
    // No health key at all: the row must not exist, and Today must not grow placeholder dashes.
    await page.goto('/today');
    await expect(page.getByTestId('today-view')).toBeVisible();
    await expect(page.getByTestId('overnight-row')).toHaveCount(0);
    await expect(page.getByTestId('today-view')).not.toContainText('Overnight');
  });
});

test.describe('check-in sleep chips from Apple Health', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await seedOnboarded(page);
    await trainingToday(page);
  });

  test('arrive pre-selected and tagged — and correcting removes the claim', async ({ page }) => {
    await seedHealth(page, { sleep: true });
    await page.goto('/today');
    await page.getByTestId('checkin-open').click();

    // 6.2h observed → the "5–6h" (6h) chip is the nearest and arrives already pressed.
    const prefilled = page.getByRole('button', { name: '5–6h' });
    await expect(prefilled).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('sleep-health-tag')).toHaveText('from Apple Health');

    // The user's pick is theirs: tapping a different chip removes the provenance tag.
    await page.getByRole('button', { name: '8h', exact: true }).click();
    await expect(page.getByRole('button', { name: '8h', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(prefilled).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('sleep-health-tag')).toHaveCount(0);
  });

  test('without health data the sheet is byte-identical to before — no tag, nothing selected', async ({
    page,
  }) => {
    await page.goto('/today');
    await page.getByTestId('checkin-open').click();
    await expect(page.getByTestId('sleep-health-tag')).toHaveCount(0);
    for (const name of ['< 5h', '5–6h', '7h', '8h', '9h+']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
  });
});

test.describe('the Apple Health profile card', () => {
  test('renders inside the shell: status, per-metric yielded/quiet, last sync, disconnect', async ({
    page,
  }) => {
    /* The shell is its injected global, so a fake `window.ForgeShell` planted before any app
     * script IS being "in the shell" as far as detection is concerned (the contract forbids
     * user-agent sniffing precisely so that this remains true). */
    await page.addInitScript(() => {
      (window as unknown as { ForgeShell: object }).ForgeShell = { _receive: () => {} };
    });
    await resetDemo(page);
    await seedOnboarded(page);
    await seedHealth(page, { sleep: true, permissions: true });
    await page.goto('/settings');

    const card = page.getByTestId('apple-health-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Apple Health');
    await expect(page.getByTestId('apple-health-status')).toContainText(/Connected · last sync/);

    // Yielded metrics say so; quiet ones say "quiet" — never a claim about denial.
    await expect(page.getByTestId('apple-health-metric-sleep')).toContainText('coming through');
    await expect(page.getByTestId('apple-health-metric-hrvSdnn')).toContainText('quiet');

    // The honest path to the switches, and the disconnect that keeps imported data.
    await expect(card).toContainText('Settings → Health → Data Access');
    await expect(page.getByTestId('apple-health-disconnect')).toBeVisible();
    await expect(card).toContainText('Everything already imported stays');
  });

  test('does not exist in the browser — no ForgeShell global, no card', async ({ page }) => {
    await resetDemo(page);
    await seedOnboarded(page);
    // Even with health data present: the card states the CONNECTION, and a browser has none.
    await seedHealth(page, { sleep: true, permissions: true });
    await page.goto('/settings');
    await expect(page.getByTestId('profile-card')).toBeVisible();
    await expect(page.getByTestId('apple-health-card')).toHaveCount(0);
  });
});
