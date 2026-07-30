/**
 * REGRESSION · Local Mode data integrity (blocker B2, major M4).
 *
 * B2 — `importState` accepted ANY payload carrying `version: 1`, persisted it, routed to /today
 *      and permanently white-screened the app. Separately, a store corrupted by any means
 *      (a bad build, a half-written write, a hand-edited key) crashed /today, /routines and
 *      /progress on every load with no recovery path, and garbage food-log numbers rendered
 *      literal "NaN".
 * M4 — the backup contained only `fitforge.demo.v1`, so it silently omitted every logged
 *      workout; and "Yes, erase everything" left the whole workout log on disk.
 *
 * Everything below goes through the REAL Settings controls (file input, export button, erase
 * confirm sheet) — the original bug was in the wiring as much as the validator.
 */
import { test, expect } from '@playwright/test';
import {
  resetDemo,
  writeRawStore,
  expectRouteHealthy,
  probeRoute,
  bareCompletedState,
  seedDraft,
  regenerateFromSettings,
  DEMO_STORAGE_KEY,
  WORKOUT_LOG_KEY,
} from './helpers';

/** The exact payload from the review that used to be swallowed whole. */
const MALFORMED_BACKUP = JSON.stringify({
  version: 1,
  routine: 'hello',
  completedAt: '2026-01-01T00:00:00.000Z',
  userId: 'demo-user',
});

const APP_ROUTES = ['/today', '/routines', '/progress', '/nutrition'];

test.describe('regression · malformed import', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('B2 · a malformed backup is REJECTED with a visible reason and changes nothing', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Start from a real, generated state so we can prove it survives the rejection intact.
    await seedDraft(page, { days_per_week: 3, training_location: 'home', equipment_slugs: ['dumbbell'] });
    await regenerateFromSettings(page);
    const before = await page.evaluate((k) => window.localStorage.getItem(k), DEMO_STORAGE_KEY);
    expect(before).toBeTruthy();

    await page.goto('/settings');
    await expect(page.getByTestId('settings-import')).toBeVisible();
    await page.setInputFiles('[data-testid="import-file"]', {
      name: 'malformed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(MALFORMED_BACKUP),
    });

    // A specific, user-facing reason — not a silent failure and not a generic shrug.
    const error = page.getByTestId('settings-import-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(/\S/);

    // It must NOT have routed into the app as though the import worked.
    await expect(page).toHaveURL(/\/settings/);

    // Nothing was written.
    const after = await page.evaluate((k) => window.localStorage.getItem(k), DEMO_STORAGE_KEY);
    expect(after, 'a rejected import mutated the good state').toBe(before);

    // And the app still works.
    for (const route of [...APP_ROUTES, '/settings']) {
      await expectRouteHealthy(page, route);
    }
  });

  test('B2 · a JSON file that is not a backup at all is rejected the same way', async ({ page }) => {
    await page.goto('/today');
    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, value);
      },
      { key: DEMO_STORAGE_KEY, value: JSON.stringify(bareCompletedState()) },
    );
    await page.goto('/settings');
    await page.setInputFiles('[data-testid="import-file"]', {
      name: 'notabackup.json',
      mimeType: 'application/json',
      buffer: Buffer.from('this is not json at all'),
    });
    await expect(page.getByTestId('settings-import-error')).toBeVisible();
    await expect(page).toHaveURL(/\/settings/);
  });
});

test.describe('regression · corrupted store resilience', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  const good = () => ({
    ...bareCompletedState(),
    routine: {
      id: 'demo',
      name: 'Seed',
      description: 'x',
      source: 'generated',
      is_active: true,
      start_date: '2026-07-01',
      days: [
        {
          id: 'demo-day-1',
          name: 'Day A',
          position: 1,
          weekday: 0,
          exercises: [
            {
              id: 're-1',
              position: 1,
              exercise_id: 'ex-plank',
              exercise_slug: 'plank',
              exercise_name: 'Plank',
              image_path: null,
              sets: 3,
              rep_min: 8,
              rep_max: 12,
              target_rpe: null,
              rest_seconds: 60,
              superset_group: null,
              notes: null,
            },
          ],
        },
      ],
    },
  });

  const NOW = '2026-07-20T18:30:00.000Z';
  // The app keys days by the LOCAL calendar date, so a UTC read here would build a store the app
  // never looks at — the case would "pass" without exercising anything.
  const today = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  /**
   * Each case is a shape that crashed a real route before the hardening. They are written as RAW
   * strings because that is how a corrupt store actually arrives — never through a typed writer.
   */
  const CASES: { label: string; demo: () => string | null; log: string | null }[] = [
    {
      label: 'routine is a string',
      demo: () => JSON.stringify({ ...good(), routine: 'hello' }),
      log: null,
    },
    {
      label: 'routine.days is a number',
      demo: () => JSON.stringify({ ...good(), routine: { ...good().routine, days: 5 } }),
      log: null,
    },
    {
      label: 'routine.days entries have no exercises array',
      demo: () =>
        JSON.stringify({ ...good(), routine: { ...good().routine, days: [{ id: 'x', name: 'X' }] } }),
      log: null,
    },
    {
      label: 'garbage food-log values',
      demo: () =>
        JSON.stringify({
          ...good(),
          logsByDate: {
            [today()]: [
              { id: 'x1', food_name: 'Junk', servings: 'abc', kcal: 'abc', protein_g: 'abc', carbs_g: 'zzz', fat_g: 'qqq', meal_slot: 'breakfast', logged_at: NOW },
              { id: 'x2', food_name: 'Junk2', servings: null, kcal: null, protein_g: 'x', carbs_g: null, fat_g: 'y', meal_slot: 'lunch', logged_at: 'nope' },
            ],
          },
        }),
      log: null,
    },
    {
      label: 'a null entry inside workoutlog sessions[]',
      demo: () => JSON.stringify(good()),
      log: JSON.stringify({
        version: 1,
        sessions: [null, { id: 'ok', dayId: 'd', dayName: 'Day A', finishedAt: NOW, exercises: [] }],
      }),
    },
    {
      label: 'a session with no exercises[] and NaN-ish set values',
      demo: () => JSON.stringify(good()),
      log: JSON.stringify({
        version: 1,
        sessions: [
          { id: 'a', dayId: 'd', dayName: 'Day A', finishedAt: NOW },
          {
            id: 'b',
            dayId: 'd',
            dayName: 'Day B',
            finishedAt: 'garbage',
            exercises: [{ exercise_id: 'e', exercise_name: 'X', sets: [{ reps: 'abc', weight_kg: 'abc' }] }],
          },
        ],
      }),
    },
    {
      label: 'every field corrupt at once',
      demo: () =>
        JSON.stringify({
          ...good(),
          routine: 42,
          profile: 'nope',
          targets: [],
          weights: 'x',
          logsByDate: { bad: 7 },
          onboardingStep: 'nonsense',
        }),
      log: JSON.stringify({ version: 1, sessions: 'broken' }),
    },
    {
      label: 'both stores are unparseable junk',
      demo: () => '{{{not json',
      log: 'also not json',
    },
  ];

  for (const c of CASES) {
    test(`B2 · survives: ${c.label}`, async ({ page }) => {
      test.setTimeout(60_000);
      await writeRawStore(page, {
        [DEMO_STORAGE_KEY]: c.demo(),
        [WORKOUT_LOG_KEY]: c.log,
      });
      for (const route of APP_ROUTES) {
        await expectRouteHealthy(page, route);
      }
    });
  }

  test('B2 · a corrupted store is repaired, not merely survived once', async ({ page }) => {
    await writeRawStore(page, {
      [DEMO_STORAGE_KEY]: JSON.stringify({ ...good(), routine: 'hello' }),
      [WORKOUT_LOG_KEY]: null,
    });
    await expectRouteHealthy(page, '/today');
    // A second load must not re-crash either — the defensive read writes the repaired shape back.
    await expectRouteHealthy(page, '/today');
    const repaired = await page.evaluate((k) => {
      const raw = window.localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as { routine: unknown }).routine : 'MISSING';
    }, DEMO_STORAGE_KEY);
    expect(repaired, 'the invalid routine should have been normalised away').not.toBe('hello');
  });
});

test.describe('regression · backup round trip (M4)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('M4 · export → erase → import keeps every logged workout, and erase clears all fitforge keys', async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await seedDraft(page, { days_per_week: 3, training_location: 'home', equipment_slugs: ['dumbbell'] });
    await regenerateFromSettings(page);

    // Seed a small, explicit training history.
    const SESSIONS = 3;
    await page.evaluate(
      ({ key, n }) => {
        const DAY = 86_400_000;
        const sessions = Array.from({ length: n }, (_, i) => ({
          id: `sess-${i}`,
          dayId: 'd',
          dayName: 'Day A',
          finishedAt: new Date(Date.now() - (i + 1) * DAY).toISOString(),
          exercises: [
            {
              exercise_id: 'ex-push-up',
              exercise_slug: 'push-up',
              exercise_name: 'Push-up',
              mechanics: 'compound',
              primary_muscles: ['pecs'],
              secondary_muscles: [],
              sets: [{ reps: 10, weight_kg: 0 }],
            },
          ],
        }));
        window.localStorage.setItem(key, JSON.stringify({ version: 1, sessions }));
      },
      { key: WORKOUT_LOG_KEY, n: SESSIONS },
    );

    const countSessions = () =>
      page.evaluate((k) => {
        const raw = window.localStorage.getItem(k);
        if (!raw) return 0;
        try {
          const parsed = JSON.parse(raw) as { sessions?: unknown[] };
          return Array.isArray(parsed.sessions) ? parsed.sessions.length : -1;
        } catch {
          return -1;
        }
      }, WORKOUT_LOG_KEY);

    const before = await countSessions();
    expect(before).toBe(SESSIONS);

    // ── export through the real button ──
    await page.goto('/settings');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('settings-export').click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const backupText = Buffer.concat(chunks).toString('utf8');
    const backup = JSON.parse(backupText) as { workoutLog?: { sessions?: unknown[] } };

    expect(
      backup.workoutLog?.sessions?.length,
      'the backup must contain the training history, not just the demo state',
    ).toBe(SESSIONS);

    // ── erase through the real confirm flow ──
    await page.getByRole('button', { name: /Erase Local Mode data/ }).click();
    await page.getByRole('button', { name: 'Yes, erase everything' }).click();
    await page.waitForURL(/\/$/);

    const leftover = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.startsWith('fitforge')),
    );
    expect(leftover, 'erase left fitforge.* keys behind').toEqual([]);

    // ── restore ──
    // Erasing gates the app back to onboarding, so a restore needs a session flag first. This
    // mirrors the documented recovery path; the assertion under test is the DATA round trip.
    await page.goto('/today');
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: DEMO_STORAGE_KEY, value: JSON.stringify(bareCompletedState()) },
    );
    await page.goto('/settings');
    await page.setInputFiles('[data-testid="import-file"]', {
      name: 'fitforge-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backupText),
    });
    // Import ASKS before it writes now, and this is the restore-onto-a-blank-device case, so the
    // answer is overwrite. The confirm step is asserted properly in portability.spec.
    await page.getByTestId('import-overwrite').click();
    await page.waitForURL(/\/today/);

    const after = await countSessions();
    expect(after, `session count changed across the round trip (${before} → ${after})`).toBe(before);

    for (const route of APP_ROUTES) {
      await expectRouteHealthy(page, route);
    }
  });
});
