/**
 * REGRESSION · plan generation (blockers B1 / B1a, minor m1).
 *
 * B1  — an equipment-poor, heavily-protected onboarding run produced a training day with ZERO
 *       exercises, and opening that day white-screened the workout player.
 * B1a — protecting "Knees" was applied as a HARD exclusion, deleting every squat variant
 *       (including the bodyweight one), which is what emptied the day in the first place.
 * m1  — a one-exercise day rendered "1 exercises".
 *
 * These assert on OUTCOMES a user can see (day contents, the workout screen, the rendered
 * label), not on generator internals, because every one of these shipped past internal checks.
 */
import { test, expect } from '@playwright/test';
import {
  resetDemo,
  completeOnboarding,
  readRoutine,
  regenerateFromSettings,
  seedDraft,
  probeRoute,
  expectRouteHealthy,
  bareCompletedState,
  DEMO_STORAGE_KEY,
  KNEES_EXCLUSIONS,
  THREE_AREA_EXCLUSIONS,
} from './helpers';

const cont = (page: import('@playwright/test').Page) =>
  page.getByTestId('onboarding-continue').click();

test.describe('regression · generation', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  /**
   * The literal B1 repro, walked through the real wizard: General health · 30-min sessions ·
   * Minimal / travel · "Don't have" for EVERY piece of equipment · Knees + Lower back +
   * Shoulders protected.
   */
  test('B1 · the exact empty-day repro produces no empty day, and every day opens', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.goto('/onboarding/welcome');
    await page.getByRole('button', { name: 'Get started' }).click();

    await page.waitForURL(/\/onboarding\/goals/);
    await page.getByText('General health', { exact: true }).click();
    await cont(page);

    await page.waitForURL(/\/onboarding\/experience/);
    await page.getByText('Beginner', { exact: true }).click();
    await cont(page);

    await page.waitForURL(/\/onboarding\/schedule/);
    await page.getByRole('button', { name: '30 min', exact: true }).click();
    await cont(page);

    // Exercise prefs — now BEFORE the split (the liked list feeds split scoring); the seeded
    // tray keeps the step continue-able untouched.
    await page.waitForURL(/\/onboarding\/exercise_prefs/);
    await cont(page);

    await page.waitForURL(/\/onboarding\/split/);
    await cont(page);

    // Progression (WS-P) — the recommendation is already selected for this novice persona.
    await page.waitForURL(/\/onboarding\/progression/);
    await cont(page);

    await page.waitForURL(/\/onboarding\/location/);
    await page.getByText('Minimal / travel', { exact: true }).click();
    await cont(page);

    // Equipment — answer "don't have" to every single card.
    await page.waitForURL(/\/onboarding\/equipment/);
    await page.getByTestId('equipment-start-swiping').click();
    await expect(page.getByTestId('equipment-deck-screen')).toBeVisible();
    for (let guard = 0; guard < 200; guard++) {
      const none = page.getByTestId('equipment-category-none');
      if (await none.isVisible().catch(() => false)) {
        await none.click();
        await page.waitForTimeout(220);
        continue;
      }
      const left = page.getByTestId('swipe-action-left');
      const usable =
        (await left.isVisible().catch(() => false)) && (await left.isEnabled().catch(() => false));
      if (!usable) break;
      await left.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
    // The deck may hand off to a celebration screen before the review screen.
    for (let guard = 0; guard < 40; guard++) {
      if (await page.getByTestId('equipment-review-screen').isVisible().catch(() => false)) break;
      for (const id of ['equipment-finish-continue', 'equipment-deck-review']) {
        const btn = page.getByTestId(id);
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 4_000 }).catch(() => undefined);
          break;
        }
      }
      await page.waitForTimeout(400);
    }
    await expect(page.getByTestId('equipment-review-screen')).toBeVisible();
    await cont(page);

    // Exclusions — protect three areas at once.
    await page.waitForURL(/\/onboarding\/exclusions/);
    for (const area of ['Knees', 'Lower back', 'Shoulders']) {
      await page.getByRole('button', { name: area, exact: true }).click();
    }
    await cont(page);

    await page.waitForURL(/\/onboarding\/body_metrics/);
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await cont(page);

    await page.waitForURL(/\/onboarding\/nutrition_prefs/);
    await cont(page);
    await page.waitForURL(/\/onboarding\/targets_review/);
    await cont(page);
    await page.waitForURL(/\/onboarding\/plan_preview/);
    await cont(page);
    await page.waitForURL(/\/today/);

    const routine = await readRoutine(page);
    expect(routine.days.length, 'a plan was generated').toBeGreaterThan(0);

    const empty = routine.days.filter((d) => d.count === 0);
    expect(
      empty,
      `every generated day must hold at least one exercise; empty: ${JSON.stringify(empty)}`,
    ).toEqual([]);

    // …and every one of them has to actually open. B1's second half was the player crashing.
    for (const day of routine.days) {
      const probe = await probeRoute(page, `/workout/${day.id}`);
      expect(probe.errors, `/workout/${day.id} threw`).toEqual([]);
      expect(probe.applicationError, `/workout/${day.id} bailed out`).toBe(false);
    }
  });

  /**
   * The generation matrix that used to produce ~25k empty days: no equipment, minimal location,
   * multiple protected areas, across the full days-per-week range. Driven through the Settings
   * "Re-generate my plan" button so the button itself stays honest too.
   */
  test('B1 · no combination of poor equipment × protections can empty a day', async ({ page }) => {
    test.setTimeout(180_000);

    const cases = [
      { label: 'minimal · nothing owned · 3 areas · 30min · 1 day', days_per_week: 1, session_minutes: 30, training_location: 'minimal', equipment_slugs: [] as string[], movement_exclusions: THREE_AREA_EXCLUSIONS },
      { label: 'minimal · nothing owned · 3 areas · 30min · 3 days', days_per_week: 3, session_minutes: 30, training_location: 'minimal', equipment_slugs: [], movement_exclusions: THREE_AREA_EXCLUSIONS },
      { label: 'minimal · nothing owned · 3 areas · 20min · 5 days', days_per_week: 5, session_minutes: 30, training_location: 'minimal', equipment_slugs: [], movement_exclusions: THREE_AREA_EXCLUSIONS },
      { label: 'minimal · nothing owned · 3 areas · 90min · 7 days', days_per_week: 7, session_minutes: 90, training_location: 'minimal', equipment_slugs: [], movement_exclusions: THREE_AREA_EXCLUSIONS },
      { label: 'home · one dumbbell · knees · 6 days', days_per_week: 6, session_minutes: 45, training_location: 'home', equipment_slugs: ['dumbbell'], movement_exclusions: KNEES_EXCLUSIONS },
      { label: 'minimal · nothing owned · no protections · 4 days', days_per_week: 4, session_minutes: 45, training_location: 'minimal', equipment_slugs: [], movement_exclusions: [] },
    ];

    for (const c of cases) {
      const { label, ...draft } = c;
      await seedDraft(page, draft);
      const routine = await regenerateFromSettings(page);
      const empty = routine.days.filter((d) => d.count === 0);
      expect(empty, `${label} produced empty day(s): ${JSON.stringify(empty)}`).toEqual([]);
      expect(routine.days.length, `${label} produced no days`).toBeGreaterThan(0);
    }
  });

  /**
   * B1a — "protect my knees" must DE-PRIORITISE the squat pattern, not delete it. The hard
   * exclusions it derives (lunge, knee extension) must still be honoured absolutely.
   */
  test('B1a · protecting Knees does not eliminate bodyweight squat variants', async ({ page }) => {
    test.setTimeout(90_000);

    await seedDraft(page, {
      training_location: 'minimal',
      equipment_slugs: [],
      days_per_week: 3,
      session_minutes: 30,
      body_areas: ['knees'],
      movement_exclusions: KNEES_EXCLUSIONS,
    });
    const routine = await regenerateFromSettings(page);
    const picks = routine.days.flatMap((d) => d.names);

    // The soft-excluded pattern survives: with no equipment the only squat left IS the
    // bodyweight one, so its absence would mean the soft flag was treated as hard again.
    expect(
      picks.filter((n) => /Bodyweight Squat/.test(n)).length,
      `bodyweight squat variants were eliminated by a SOFT exclusion; picks: ${JSON.stringify(picks)}`,
    ).toBeGreaterThan(0);

    // The hard-excluded patterns are still gone.
    expect(
      picks.filter((n) => /Lunge|Split Squat|Leg Extension/.test(n)),
      'a HARD knee exclusion leaked into the plan',
    ).toEqual([]);
  });

  /**
   * m1 — a day with exactly one exercise is reachable in production (the one-slot
   * "Rest / Cardio" template day), so the count label has to be pluralised everywhere it is
   * rendered. `/today` shipped with a raw `{n} exercises`.
   */
  test('m1 · a one-exercise day never renders "1 exercises"', async ({ page }) => {
    const oneExerciseDay = (i: number) => ({
      id: `demo-day-${i}`,
      name: `Day ${'ABCDEFG'[i - 1]} — Rest / Cardio`,
      position: i,
      weekday: i - 1,
      exercises: [
        {
          id: `re-${i}`,
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
    });
    const state = {
      ...bareCompletedState(),
      targets: { kcal_target: 2000, protein_g_target: 150, carbs_g_target: 200, fat_g_target: 60 },
      routine: {
        id: 'demo',
        name: 'One-slot plan',
        description: 'x',
        source: 'generated',
        is_active: true,
        start_date: '2026-07-01',
        days: [1, 2, 3, 4, 5, 6, 7].map(oneExerciseDay),
      },
    };
    await page.goto('/today');
    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, value);
      },
      { key: DEMO_STORAGE_KEY, value: JSON.stringify(state) },
    );

    for (const route of ['/today', '/routines']) {
      const probe = await probeRoute(page, route);
      expect(probe.text, `${route} renders "1 exercises"`).not.toMatch(/\b1 exercises\b/);
      expect(probe.text, `${route} never rendered a count at all`).toMatch(/\b1 exercise\b/);
    }
  });

  /** A generated plan must leave every app surface healthy — no crash, no NaN. */
  test('a freshly generated equipment-poor plan leaves every route healthy', async ({ page }) => {
    test.setTimeout(90_000);
    await seedDraft(page, {
      training_location: 'minimal',
      equipment_slugs: [],
      days_per_week: 4,
      session_minutes: 30,
      body_areas: ['knees', 'lower_back', 'shoulders'],
      movement_exclusions: THREE_AREA_EXCLUSIONS,
    });
    await regenerateFromSettings(page);
    for (const route of ['/today', '/routines', '/progress', '/nutrition', '/settings']) {
      await expectRouteHealthy(page, route);
    }
  });
});
