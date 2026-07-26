/**
 * REGRESSION · Settings is a facade (major M2).
 *
 * Settings rendered MOCK_PROFILE / MOCK_NUTRITION_PROFILE and a hard-coded equipment list, so it
 * showed the same fabricated answers to every user; its controls were local React state that
 * persisted nothing; "Save changes" had no handler at all; and "Re-generate my plan" only closed
 * the sheet. Each of those is asserted here against a deliberately NON-DEFAULT seeded profile —
 * a default-shaped fixture would have passed against the broken build.
 */
import { test, expect } from '@playwright/test';
import { resetDemo, seedDraft, readRoutine, expectRouteHealthy, KNEES_EXCLUSIONS } from './helpers';

/** Deliberately unlike every fixture and every default. */
const SEEDED = {
  display_name: 'Seed Athlete',
  primary_goal: 'fat_loss',
  experience_level: 'advanced',
  days_per_week: 2,
  session_minutes: 30,
  preferred_days: [1, 4],
  training_location: 'minimal',
  equipment_slugs: [] as string[],
  loved_equipment_slugs: [] as string[],
  body_areas: ['knees'],
  movement_exclusions: KNEES_EXCLUSIONS,
  sex: 'female',
  birthdate: '1994-03-02',
  height_cm: 162,
  weight_kg: 58,
  diet_type: 'vegan',
  allergies: ['peanut', 'soy'],
  meals_per_day: 5,
  kcal_target: 1500,
  protein_g_target: 120,
  carbs_g_target: 150,
  fat_g_target: 45,
  targets_source: 'custom',
};

test.describe('regression · settings reflects the real profile', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await seedDraft(page, SEEDED);
    await page.goto('/settings');
  });

  test('M2a · every control shows the SEEDED answers, not fixture data', async ({ page }) => {
    // Selected option cards / chips.
    for (const label of ['Lose fat', 'Advanced', 'Minimal', 'Vegan', 'Knees', 'Peanut', 'Soy', '30 min']) {
      await expect(
        page.getByText(label, { exact: false }).first(),
        `settings does not show "${label}"`,
      ).toBeVisible();
    }

    // Text + number inputs.
    await expect(page.getByTestId('settings-display-name')).toHaveValue('Seed Athlete');
    await expect(page.getByTestId('settings-kcal')).toHaveValue('1500');
    await expect(page.getByTestId('settings-protein')).toHaveValue('120');
    await expect(page.getByTestId('settings-carbs')).toHaveValue('150');
    await expect(page.getByTestId('settings-fat')).toHaveValue('45');
    await expect(page.getByTestId('settings-height')).toHaveValue('162');
    await expect(page.getByTestId('settings-birthdate')).toHaveValue('1994-03-02');
    await expect(page.getByTestId('settings-weight')).toHaveValue('58');

    // Steppers.
    await expect(page.getByLabel('Days per week')).toContainText('2');
    await expect(page.getByLabel('Meals per day')).toContainText('5');

    // The equipment section reflects an EMPTY kit rather than the old hard-coded four items.
    await expect(page.getByTestId('settings-equipment-count')).toBeVisible();
    for (const fixtureChip of ['Cable Machine', 'Pull-up Bar']) {
      const chip = page.getByRole('button', { name: fixtureChip, exact: true });
      if (await chip.count()) {
        await expect(
          chip.first(),
          `"${fixtureChip}" is shown as owned although the seeded kit is empty`,
        ).not.toHaveAttribute('aria-pressed', 'true');
      }
    }
  });

  test('M2b/M2c · an edit persists immediately and survives a reload', async ({ page }) => {
    await page.getByTestId('settings-display-name').fill('Renamed Athlete');
    await page.getByTestId('settings-kcal').fill('1750');
    await page.getByText('Pescatarian', { exact: true }).click();

    // Written through to the store — draft AND the derived rows the rest of the app reads.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const s = JSON.parse(window.localStorage.getItem('fitforge.demo.v1')!) as {
            draft: { display_name: string; kcal_target: number; diet_type: string };
            nutritionProfile: { diet_type: string } | null;
            targets: { kcal_target: number } | null;
          };
          return {
            name: s.draft.display_name,
            kcal: s.draft.kcal_target,
            diet: s.draft.diet_type,
            derivedDiet: s.nutritionProfile?.diet_type ?? null,
            derivedKcal: s.targets?.kcal_target ?? null,
          };
        }),
      )
      .toEqual({
        name: 'Renamed Athlete',
        kcal: 1750,
        diet: 'pescatarian',
        derivedDiet: 'pescatarian',
        derivedKcal: 1750,
      });

    await page.reload();
    await expect(page.getByTestId('settings-display-name')).toHaveValue('Renamed Athlete');
    await expect(page.getByTestId('settings-kcal')).toHaveValue('1750');
    await expect(page.getByText('Pescatarian', { exact: true })).toBeVisible();
  });

  test('M2d · "Re-generate my plan" really replaces the routine, and it sticks', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.evaluate(() => {
      const s = JSON.parse(window.localStorage.getItem('fitforge.demo.v1')!) as Record<string, unknown>;
      s.routine = {
        id: 'demo',
        name: 'Seeded starter routine',
        description: 'seed',
        source: 'generated',
        is_active: true,
        start_date: '2026-07-01',
        days: [
          {
            id: 'demo-day-1',
            name: 'Day A — Seed',
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
      };
      window.localStorage.setItem('fitforge.demo.v1', JSON.stringify(s));
    });
    await page.reload();

    const before = await readRoutine(page);
    expect(before.name).toBe('Seeded starter routine');

    await page.getByTestId('settings-regenerate').click();
    await expect(page.getByTestId('settings-plan-name')).toBeVisible();

    const after = await readRoutine(page);
    expect(after.name, 'the routine was not replaced').not.toBe(before.name);
    // It honours the seeded answer (2 days a week), not a fixture default.
    expect(after.days.length, 'the new plan ignores days_per_week').toBe(SEEDED.days_per_week);
    expect(after.days.filter((d) => d.count === 0), 'regeneration produced an empty day').toEqual([]);

    // Persisted, not just component state.
    await page.reload();
    await expect(page.getByTestId('settings-plan-name')).toContainText(after.name);
  });

  test('settings itself stays healthy on a non-default profile', async ({ page }) => {
    await expectRouteHealthy(page, '/settings');
  });
});
