import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded, readDemoState } from './helpers';

/**
 * AI-FIRST MEAL PARSING — the client contract against a stubbed worker.
 *
 * The complaint that built this feature: "steak and eggs" matched the catalog row "Egg, whole,
 * raw/boiled" — a database's idea of an egg, not a breakfast. With the toggle on, the sentence
 * goes to the worker's `meal` task and comes back as PREPARED items with consensus numbers; the
 * offline parser is strictly the fallback, and the sheet always says which one produced the rows.
 *
 * The worker is stubbed at the network edge (page.route), so these specs pin the client's
 * behavior — endpoint wiring, fallback policy, the toggle, and what gets logged — not the model.
 */

const ENDPOINT = 'https://coach-worker.fake/api';

const MEAL_OK = {
  items: [
    {
      food: 'Steak, sirloin, grilled',
      qty: 1,
      unit: 'steak',
      grams: 170,
      per: 'as stated',
      kcal: { value: 420, low: 390, high: 450 },
      protein_g: { value: 46, low: 44, high: 50 },
      carbs_g: { value: 0, low: 0, high: 2 },
      fat_g: { value: 26, low: 24, high: 28 },
      confidence: 'high',
      assumptions: ['grilled, no added oil'],
      samples: 3,
    },
    {
      food: 'Eggs, scrambled',
      qty: 2,
      unit: 'egg',
      grams: 100,
      per: 'as stated',
      kcal: { value: 180, low: 170, high: 200 },
      protein_g: { value: 12, low: 12, high: 14 },
      carbs_g: { value: 2, low: 1, high: 2 },
      fat_g: { value: 14, low: 12, high: 15 },
      confidence: 'high',
      assumptions: ['cooked in butter'],
      samples: 3,
    },
  ],
  provider: 'workers-ai',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

const HEALTH = {
  status: 'ok',
  models: [],
  tasks: ['chat', 'macros', 'adapt', 'meal'],
};

/** The static build reads NEXT_PUBLIC_AI_ENDPOINT through the webpack process polyfill at
 *  runtime, so a window.process planted before any chunk runs is this build's configuration. */
async function armEndpoint(page: Page): Promise<void> {
  await page.addInitScript((ep) => {
    (window as unknown as { process: unknown }).process = {
      env: { NEXT_PUBLIC_AI_ENDPOINT: ep },
    };
  }, ENDPOINT);
}

test.describe('nutrition · AI-first parsing', () => {
  test('with AI on, the sentence is read whole — the eggs come back SCRAMBLED, priced by consensus', async ({
    page,
  }) => {
    await armEndpoint(page);
    const mealCalls: unknown[] = [];
    await page.route(`${ENDPOINT}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET')
        return route.fulfill({ json: HEALTH, contentType: 'application/json' });
      const body = req.postDataJSON() as { task?: string };
      if (body.task === 'meal') {
        mealCalls.push(body);
        return route.fulfill({ json: MEAL_OK, contentType: 'application/json' });
      }
      return route.fulfill({ status: 400, json: { error: 'unexpected_task' } });
    });

    await seedOnboarded(page);
    await page.goto('/nutrition');

    // The toggle exists on a configured build and defaults ON.
    await expect(page.getByTestId('composer-ai-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('nutrition-composer').fill('steak and eggs');
    await page.getByTestId('composer-submit').click();

    const review = page.getByTestId('review-sheet');
    await expect(review).toBeVisible();
    // Provenance states the AI read it…
    await expect(page.getByTestId('review-via')).toHaveAttribute('data-kind', 'ai');
    // …and THE FIX is visible: prepared items, not the raw/boiled database row.
    await expect(review.getByText('Eggs, scrambled').first()).toBeVisible();
    await expect(review.getByText('Steak, sirloin, grilled').first()).toBeVisible();
    await expect(review.getByText(/raw\/boiled/)).toHaveCount(0);
    expect(mealCalls.length).toBe(1);

    // Logging keeps the AI's numbers: 420 + 180 kcal, under the names the AI gave.
    await page.getByTestId('review-confirm').click();
    await expect
      .poll(async () => {
        const state = (await readDemoState(page)) as {
          logsByDate: Record<string, { custom_name?: string; kcal: number }[]>;
        };
        return Object.values(state.logsByDate)
          .flat()
          .filter((l) => /scrambled|sirloin/i.test(l.custom_name ?? ''));
      })
      .toHaveLength(2);
    const state = (await readDemoState(page)) as {
      logsByDate: Record<string, { custom_name?: string; kcal: number }[]>;
    };
    const rows = Object.values(state.logsByDate).flat();
    const eggs = rows.find((l) => /scrambled/i.test(l.custom_name ?? ''));
    expect(Math.round(eggs!.kcal)).toBe(180);
  });

  test('when the worker fails, the catalog answers instead — and the sheet says so', async ({
    page,
  }) => {
    await armEndpoint(page);
    await page.route(`${ENDPOINT}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET')
        return route.fulfill({ json: HEALTH, contentType: 'application/json' });
      // Token limit, quota, outage — any of them looks like this to the client.
      return route.fulfill({ status: 503, json: { error: 'ai_unavailable' } });
    });

    await seedOnboarded(page);
    await page.goto('/nutrition');
    await page.getByTestId('nutrition-composer').fill('steak and eggs');
    await page.getByTestId('composer-submit').click();

    const review = page.getByTestId('review-sheet');
    await expect(review).toBeVisible();
    // The fallback is stated, never silent…
    await expect(page.getByTestId('review-via')).toHaveAttribute('data-kind', 'offline');
    // …and the offline rows are real catalog matches, still editable.
    await expect(review.getByTestId('review-row').first()).toBeVisible();
  });

  test('with the toggle OFF, no request leaves the device', async ({ page }) => {
    await armEndpoint(page);
    let mealCalls = 0;
    await page.route(`${ENDPOINT}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET')
        return route.fulfill({ json: HEALTH, contentType: 'application/json' });
      if ((req.postDataJSON() as { task?: string }).task === 'meal') mealCalls += 1;
      return route.fulfill({ json: MEAL_OK, contentType: 'application/json' });
    });

    await seedOnboarded(page);
    await page.goto('/nutrition');

    const toggle = page.getByTestId('composer-ai-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('nutrition-composer').fill('steak and eggs');
    await page.getByTestId('composer-submit').click();

    await expect(page.getByTestId('review-sheet')).toBeVisible();
    await expect(page.getByTestId('review-via')).toHaveAttribute('data-kind', 'offline');
    expect(mealCalls).toBe(0);

    // The choice sticks across a reload.
    await page.reload();
    await expect(page.getByTestId('composer-ai-toggle')).toHaveAttribute('aria-pressed', 'false');
  });
});
