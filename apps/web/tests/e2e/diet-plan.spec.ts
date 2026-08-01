import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedOnboarded, readDemoState } from './helpers';

/**
 * THE DIET-PLAN SURFACE — seeded storage, real components (AIMODE-CONTRACT "Diet UI + coach
 * tie-in" e2e).
 *
 * The store (`fitforge.diet.v1`) is seeded directly with a small rotating plan built from REAL
 * recipe ids out of fixtures/recipes.v1.json, exactly per the contract's store schema — these
 * specs pin the UI + store integration, not the generator (W2's unit tests own that). The plan
 * day rendered as "today" is blueprint weekday (0=Mon) modulo plan length; `todayIndex` below
 * replicates that rule so the specs are deterministic on any day of the week.
 */

const DIET_KEY = 'fitforge.diet.v1';

interface FixtureRecipe {
  id: string;
  name: string;
  slot: string;
  per_serving: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  serving_label: string;
  tags: string[];
  effort: string;
  ingredients: string[];
  method: string[];
}

/** The shipped corpus, read from the repo fixture — the same data `lib/diet/recipes` embeds. */
const CORPUS: FixtureRecipe[] = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../fixtures/recipes.v1.json'),
    'utf8',
  ),
) as FixtureRecipe[];
const byId = new Map(CORPUS.map((r) => [r.id, r]));
const recipe = (id: string): FixtureRecipe => {
  const r = byId.get(id);
  if (!r) throw new Error(`fixture drift: no recipe ${id} in recipes.v1.json`);
  return r;
};

interface SeedMeal {
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId: string;
  servings: number;
}

/** Two rotating days, omnivore — all ids verified against the corpus at module load. */
const OMNI_DAYS: { meals: SeedMeal[] }[] = [
  {
    meals: [
      { slot: 'breakfast', recipeId: 'masala-scrambled-eggs-toast', servings: 1 },
      { slot: 'lunch', recipeId: 'chicken-tikka-wrap', servings: 1 },
      { slot: 'dinner', recipeId: 'lighter-chicken-tikka-masala', servings: 1 },
      { slot: 'snack', recipeId: 'greek-yogurt-honey-walnuts', servings: 1 },
    ],
  },
  {
    meals: [
      { slot: 'breakfast', recipeId: 'spinach-feta-omelette', servings: 1 },
      { slot: 'lunch', recipeId: 'turkey-avocado-club', servings: 1 },
      { slot: 'dinner', recipeId: 'teriyaki-salmon-rice-bowl', servings: 1 },
      { slot: 'snack', recipeId: 'cottage-cheese-pineapple-bowl', servings: 1 },
    ],
  },
];

/** Two rotating days that satisfy a vegan hard filter. */
const VEGAN_DAYS: { meals: SeedMeal[] }[] = [
  {
    meals: [
      { slot: 'breakfast', recipeId: 'tofu-scramble-burrito', servings: 1 },
      { slot: 'lunch', recipeId: 'baked-falafel-hummus-bowl', servings: 1 },
      { slot: 'dinner', recipeId: 'thai-red-tofu-curry', servings: 1 },
      { slot: 'snack', recipeId: 'mango-chia-pudding', servings: 1 },
    ],
  },
  {
    meals: [
      { slot: 'breakfast', recipeId: 'besan-chilla', servings: 1 },
      { slot: 'lunch', recipeId: 'turkish-red-lentil-soup', servings: 1 },
      { slot: 'dinner', recipeId: 'dal-tadka', servings: 1 },
      { slot: 'snack', recipeId: 'apple-slices-peanut-butter', servings: 1 },
    ],
  },
];

for (const day of [...OMNI_DAYS, ...VEGAN_DAYS]) for (const m of day.meals) recipe(m.recipeId);

/** The exact `fitforge.diet.v1` record shape the store contract pins. */
function dietState(
  days: { meals: SeedMeal[] }[],
  prefs: { base: string; avoid: string[] },
  stance: string,
) {
  return { version: 1, plan: { days }, prefs, stance, generatedAt: '2026-08-01T08:00:00.000Z' };
}

/** The UI's today-mapping, replicated: blueprint weekday (0=Mon … 6=Sun) modulo plan length. */
const todayIndex = (planLength: number) => ((new Date().getDay() + 6) % 7) % planLength;

async function seedDiet(page: Page, state: unknown): Promise<void> {
  await seedOnboarded(page);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: DIET_KEY, value: state },
  );
}

async function readDiet(page: Page): Promise<{
  plan: { days: { meals: SeedMeal[] }[] };
} | null> {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'),
    DIET_KEY,
  );
}

test.describe('nutrition · diet plan surface', () => {
  test("renders today's planned meals with names, macros and effort", async ({ page }) => {
    await seedDiet(page, dietState(OMNI_DAYS, { base: 'omnivore', avoid: [] }, 'cut'));
    await page.goto('/nutrition');

    const card = page.getByTestId('diet-plan-card');
    await expect(card).toBeVisible();

    const day = OMNI_DAYS[todayIndex(OMNI_DAYS.length)]!;
    for (const meal of day.meals) {
      const r = recipe(meal.recipeId);
      const row = card.locator(
        `[data-testid="diet-plan-meal"][data-recipe-id="${meal.recipeId}"]`,
      );
      await expect(row).toBeVisible();
      await expect(row).toContainText(r.name);
      // The house macro grammar: kcal on the right, "26P / 33C / 19F" in the meta line.
      await expect(row).toContainText(String(Math.round(r.per_serving.kcal)));
      await expect(row).toContainText(`${r.per_serving.protein_g}P`);
      await expect(row).toContainText(r.effort);
      await expect(row).toHaveAttribute('data-slot', meal.slot);
    }
  });

  test('"Log this meal" writes a NutritionLog row through the normal path and it lands in the meal card', async ({
    page,
  }) => {
    await seedDiet(page, dietState(OMNI_DAYS, { base: 'omnivore', avoid: [] }, 'cut'));
    await page.goto('/nutrition');

    const day = OMNI_DAYS[todayIndex(OMNI_DAYS.length)]!;
    const breakfast = day.meals.find((m) => m.slot === 'breakfast')!;
    const r = recipe(breakfast.recipeId);

    await page
      .locator(`[data-testid="diet-plan-meal"][data-recipe-id="${breakfast.recipeId}"]`)
      .getByTestId('diet-plan-log')
      .click();

    // The row is persisted with the contract's exact shape: custom row, no catalog id.
    await expect
      .poll(async () => {
        const state = (await readDemoState(page)) as {
          logsByDate: Record<string, { custom_name?: string | null }[]>;
        } | null;
        return Object.values(state?.logsByDate ?? {})
          .flat()
          .filter((l) => l.custom_name === r.name);
      })
      .toHaveLength(1);

    const state = (await readDemoState(page)) as {
      logsByDate: Record<
        string,
        {
          custom_name?: string | null;
          food_id?: string | null;
          meal_slot?: string;
          quantity_g?: number | null;
          kcal: number;
          protein_g: number;
          logged_at?: string;
        }[]
      >;
    };
    const row = Object.values(state.logsByDate)
      .flat()
      .find((l) => l.custom_name === r.name)!;
    expect(row.food_id).toBeNull();
    expect(row.meal_slot).toBe('breakfast');
    expect(Math.round(row.kcal)).toBe(Math.round(r.per_serving.kcal));
    expect(Math.round(row.protein_g)).toBe(Math.round(r.per_serving.protein_g));
    // entryStamp ran — the row records WHEN it was logged, like any hand-entered food.
    expect(typeof row.logged_at).toBe('string');

    // …and it is visible in the day's Breakfast card: two listitems now carry the name —
    // the plan row and the freshly logged ledger row.
    await expect(page.getByRole('listitem').filter({ hasText: r.name })).toHaveCount(2);
  });

  test('the swap sheet lists candidates with signed deltas, and applying one updates the stored plan', async ({
    page,
  }) => {
    await seedDiet(page, dietState(OMNI_DAYS, { base: 'omnivore', avoid: [] }, 'cut'));
    await page.goto('/nutrition');

    const idx = todayIndex(OMNI_DAYS.length);
    const dinner = OMNI_DAYS[idx]!.meals.find((m) => m.slot === 'dinner')!;

    await page
      .locator(`[data-testid="diet-plan-meal"][data-recipe-id="${dinner.recipeId}"]`)
      .getByTestId('diet-plan-swap')
      .click();

    const sheet = page.getByTestId('swap-sheet');
    await expect(sheet).toBeVisible();

    // The generator guarantees ≥3 valid swaps per planned dish; the seeded dinners sit in the
    // densest kcal band of the corpus, so a populated list is a fair assertion.
    const options = sheet.getByTestId('diet-swap-option');
    await expect.poll(() => options.count()).toBeGreaterThan(0);
    expect(await options.count()).toBeLessThanOrEqual(6);

    const first = options.first();
    const delta = first.getByTestId('diet-swap-delta');
    await expect(delta).toContainText('kcal');
    await expect(delta).toContainText('g protein');

    const pickedId = await first.getAttribute('data-recipe-id');
    expect(pickedId).toBeTruthy();
    await first.click();
    await expect(sheet).not.toBeVisible();

    // The tap went through applySwap: the persisted plan now names the picked recipe.
    const diet = await readDiet(page);
    const meal = diet!.plan.days[idx]!.meals.find((m) => m.slot === 'dinner')!;
    expect(meal.recipeId).toBe(pickedId);

    // The card re-rendered from the store — the new dish is on screen.
    await expect(
      page.locator(`[data-testid="diet-plan-meal"][data-recipe-id="${pickedId}"]`),
    ).toBeVisible();
  });

  test('the catalog hard-filters to vegan prefs, slot chips and search narrow it, and an explicit pick applies', async ({
    page,
  }) => {
    await seedDiet(page, dietState(VEGAN_DAYS, { base: 'vegan', avoid: [] }, 'maintain'));
    await page.goto('/nutrition');

    await page.getByTestId('diet-plan-browse').click();
    const catalog = page.getByTestId('diet-catalog');
    await expect(catalog).toBeVisible();

    const veganIds = new Set(CORPUS.filter((r) => r.tags.includes('vegan')).map((r) => r.id));

    // The hard filter is absolute: every listed row is vegan, none merely "close".
    const listedIds = await catalog
      .getByTestId('diet-catalog-row')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-recipe-id')));
    expect(listedIds.length).toBeGreaterThan(0);
    for (const id of listedIds) expect(veganIds.has(id!)).toBe(true);

    // Slot chip: breakfast only (still all vegan).
    await catalog.getByTestId('diet-catalog-slot-breakfast').click();
    const breakfastIds = await catalog
      .getByTestId('diet-catalog-row')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-recipe-id')));
    expect(breakfastIds.length).toBeGreaterThan(0);
    for (const id of breakfastIds) {
      expect(veganIds.has(id!)).toBe(true);
      expect(recipe(id!).slot).toBe('breakfast');
    }

    // Search narrows by name: "mango" + breakfast chip leaves exactly the smoothie.
    await catalog.getByTestId('diet-catalog-search').fill('mango');
    await expect(catalog.getByTestId('diet-catalog-row')).toHaveCount(1);
    await expect(catalog.getByTestId('diet-catalog-row')).toHaveAttribute(
      'data-recipe-id',
      'green-mango-smoothie',
    );

    // Tap → terse detail: ingredients + method, then "Use for breakfast today".
    await catalog.getByTestId('diet-catalog-row').click();
    const detail = page.getByTestId('diet-recipe-detail');
    await expect(detail).toBeVisible();
    const smoothie = recipe('green-mango-smoothie');
    await expect(detail).toContainText(smoothie.ingredients[0]!);
    await expect(detail).toContainText(smoothie.method[0]!);

    await detail.getByTestId('diet-catalog-use').click();

    // An explicit pick is sovereign: it lands in today's breakfast slot with no candidate gate.
    const diet = await readDiet(page);
    const idx = todayIndex(VEGAN_DAYS.length);
    expect(diet!.plan.days[idx]!.meals.find((m) => m.slot === 'breakfast')!.recipeId).toBe(
      'green-mango-smoothie',
    );
  });
});

/* ───────────────────────────────────────────────────────────── coach tie-in (stubbed worker) */

const ENDPOINT = 'https://coach-worker.fake/api';

test.describe('coach · diet plan grounding', () => {
  test('the chat request profile carries the compact diet summary when a plan exists', async ({
    page,
  }) => {
    /** The static build reads NEXT_PUBLIC_AI_ENDPOINT through the webpack process polyfill at
     *  runtime, so a window.process planted before any chunk runs is this build's configuration
     *  (same trick as nutrition-ai.spec.ts). */
    await page.addInitScript((ep) => {
      (window as unknown as { process: unknown }).process = {
        env: { NEXT_PUBLIC_AI_ENDPOINT: ep },
      };
    }, ENDPOINT);

    const chatBodies: { profile?: { diet?: unknown } }[] = [];
    await page.route(`${ENDPOINT}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET')
        return route.fulfill({
          json: { ok: true, provider: 'mistral', model: 'stub', models: [] },
          contentType: 'application/json',
        });
      const body = req.postDataJSON() as { task?: string; profile?: { diet?: unknown } };
      if (!body.task) {
        chatBodies.push(body);
        return route.fulfill({
          json: { answer: 'Your planned dinner covers it.' },
          contentType: 'application/json',
        });
      }
      return route.fulfill({ status: 400, json: { error: 'unexpected_task' } });
    });

    await seedDiet(page, dietState(OMNI_DAYS, { base: 'omnivore', avoid: [] }, 'cut'));
    await page.goto('/coach');

    // Phrased to reach the worker: the "what should I eat"-shaped questions are answered
    // LOCALLY by the meal-suggestion card (deterministic macros) and never leave the device.
    await page
      .getByTestId('coach-input')
      .fill("Is tonight's planned dinner enough protein for me?");
    await page.getByTestId('coach-submit').click();

    await expect.poll(() => chatBodies.length).toBeGreaterThan(0);
    const diet = chatBodies[0]!.profile?.diet;
    expect(typeof diet).toBe('string');
    const summary = diet as string;

    const idx = todayIndex(OMNI_DAYS.length);
    const dinner = recipe(OMNI_DAYS[idx]!.meals.find((m) => m.slot === 'dinner')!.recipeId);
    // Stance, today's actual dinner by name, and the payload stays compact (≤600 chars).
    expect(summary).toContain('cut');
    expect(summary).toContain(dinner.name);
    expect(summary).toContain(String(Math.round(dinner.per_serving.kcal)));
    expect(summary.length).toBeLessThanOrEqual(600);
  });
});
