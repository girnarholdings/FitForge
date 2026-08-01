import { test, expect, type Page } from '@playwright/test';
import { resetDemo, readDemoState } from './helpers';

/**
 * AI-MODE ONBOARDING — the photo fork against a stubbed worker (docs/AIMODE-CONTRACT.md, W3).
 *
 * The worker is stubbed at the network edge (page.route) with the same endpoint-injection trick
 * as nutrition-ai.spec.ts, so these specs pin the CLIENT's contract: what rides the bodyscan
 * request (4 prepped JPEG data URIs), how bucket estimates pre-fill the confirm chips, which
 * midpoints land in the draft (Law 2), the ranked-goals cap, and that completion INVOKES diet
 * generation through its module boundary. Old School's own suite (onboarding.spec.ts) runs
 * unmodified beside this file — Law 1 is asserted by its continued existence.
 */

const ENDPOINT = 'https://coach-worker.fake/api';

const HEALTH = {
  ok: true,
  models: [],
  tasks: ['chat', 'macros', 'adapt', 'meal', 'bodyscan'],
};

/** A contract-shaped 200: the confirm screen must pre-fill exactly these buckets. */
const SCAN_OK = {
  ageBucket: '26-35',
  weightBandKg: { low: 70, high: 80 },
  bodyFatBand: '18-25',
  build: 'muscular',
  confidence: { age: 'low', weight: 'medium', bodyFat: 'medium' },
  notes: [],
  provider: 'mistral',
  model: 'mistral-small-latest',
};

/** A real, decodable 1×1 JPEG — `prepareScanImage` re-encodes it like any phone photo. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHR0fHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AKpn/9k=',
  'base64',
);

const SLOT_KEYS = ['front', 'back', 'left', 'right'] as const;

/** The static build reads NEXT_PUBLIC_AI_ENDPOINT through the webpack process polyfill at
 *  runtime, so a window.process planted before any chunk runs is this build's configuration. */
async function armEndpoint(page: Page): Promise<void> {
  await page.addInitScript((ep) => {
    (window as unknown as { process: unknown }).process = {
      env: { NEXT_PUBLIC_AI_ENDPOINT: ep },
    };
  }, ENDPOINT);
}

/**
 * Record every `fitforge:diet-generation` dispatch (request + outcome). This is the observable
 * face of the diet-generation module boundary while W2's engine is absent from this branch —
 * see components/onboarding/dietGeneration.ts for the integration checklist.
 */
async function armDietRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __ffDietGen?: unknown[] };
    w.__ffDietGen = [];
    window.addEventListener('fitforge:diet-generation', (e) => {
      w.__ffDietGen!.push((e as CustomEvent).detail);
    });
  });
}

async function readDietCalls(page: Page): Promise<
  { request: Record<string, unknown> | null; outcome: string }[]
> {
  return page.evaluate(
    () =>
      (window as unknown as { __ffDietGen?: { request: Record<string, unknown> | null; outcome: string }[] })
        .__ffDietGen ?? [],
  );
}

/** Welcome → AI card → Get started → the photos screen. */
async function enterAiMode(page: Page): Promise<void> {
  await page.goto('/onboarding/welcome');
  await page.getByTestId('welcome-mode-ai').click();
  await expect(page.getByTestId('welcome-mode-ai')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForURL(/\/onboarding\/ai_photos/);
}

/** Fill all four capture slots with the fixture JPEG and wait for the client-side prep. */
async function uploadPhotos(page: Page): Promise<void> {
  for (const key of SLOT_KEYS) {
    await page.getByTestId(`ai-photo-input-${key}`).setInputFiles({
      name: `${key}.jpg`,
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });
    await expect(page.getByTestId(`ai-photo-slot-${key}`)).toHaveAttribute('data-filled', 'true');
  }
}

test.describe('onboarding · AI Mode', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('photos → pre-filled buckets → capped goals → Today, with midpoints in the draft and diet generation invoked', async ({
    page,
  }) => {
    await armEndpoint(page);
    await armDietRecorder(page);
    const scanCalls: { images?: string[] }[] = [];
    await page.route(`${ENDPOINT}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET')
        return route.fulfill({ json: HEALTH, contentType: 'application/json' });
      const body = req.postDataJSON() as { task?: string; images?: string[] };
      if (body.task === 'bodyscan') {
        scanCalls.push(body);
        return route.fulfill({ json: SCAN_OK, contentType: 'application/json' });
      }
      return route.fulfill({ status: 400, json: { error: 'unexpected_task' } });
    });

    await enterAiMode(page);

    // The guidance panel speaks the research copy: face hidden is the NORMAL way to do this,
    // and the privacy claim (read once, never stored) is on screen before any camera opens.
    await expect(page.getByText(/Keep your face out of the shot/)).toBeVisible();
    await expect(page.getByTestId('ai-photos-privacy')).toContainText(/read once/i);

    await uploadPhotos(page);
    await page.getByTestId('ai-photos-scan').click();
    await page.waitForURL(/\/onboarding\/ai_confirm/);

    // What actually rode the wire: exactly 4 client-prepped JPEG data URIs (downscaled,
    // EXIF-stripped by re-encode), never the raw files.
    expect(scanCalls).toHaveLength(1);
    expect(scanCalls[0]!.images).toHaveLength(4);
    for (const img of scanCalls[0]!.images!) {
      expect(img.startsWith('data:image/jpeg;base64,')).toBe(true);
    }

    // Law 3 on screen: the scan only PRE-FILLS chips, each tagged as an estimate.
    await expect(page.getByTestId('ai-chip-age-26-35')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ai-chip-weight-70-80')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ai-chip-bodyfat-18-25')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ai-estimated-age')).toBeVisible();
    await expect(page.getByTestId('ai-estimated-weight')).toBeVisible();
    // build 'muscular' → intermediate, changeable and labeled as a guess.
    await expect(page.getByTestId('ai-chip-experience-intermediate')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('ai-estimated-experience')).toBeVisible();

    // The questions vision cannot answer.
    await page.getByTestId('ai-chip-height-175-180').click();
    await page.getByTestId('ai-chip-sex-male').click();
    await page.getByTestId('ai-chip-diet-vegetarian').click();
    await page.getByTestId('ai-chip-avoid-nut_free').click();
    await page.getByTestId('ai-chip-train-commercial_gym').click();
    // Schedule is defaulted, not asked — and the copy says where to change it.
    await expect(page.getByTestId('ai-schedule-note')).toContainText(/Settings/);

    await page.getByTestId('ai-confirm-continue').click();

    // Goals, reused with the AI cap: up to three, ranked, first leads.
    await page.waitForURL(/\/onboarding\/goals/);
    await expect(page.getByTestId('goals-ai-cap')).toBeVisible();
    await page.getByText('Lose fat').click();
    await page.getByText('Build muscle').click();
    await page.getByText('Get stronger').click();
    // A fourth tap is a no-op — never an eviction of an earlier rank.
    await page.getByText('Build endurance').click();
    await expect(page.getByTestId('goals-ai-cap')).toContainText(/your three/);
    await page.getByTestId('onboarding-continue').click();

    // Straight to the plan preview (the AI chain skips the ten classic question screens).
    await page.waitForURL(/\/onboarding\/plan_preview/);
    await expect(page.getByTestId('onboarding-continue')).toBeEnabled();
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/today/);

    // LAW 2 IN THE STORE: confirmed buckets as the answer of record, midpoints in the numeric
    // fields the deterministic generators read. (26–35 → 30 → birth year now−30; 70–80 → 75 kg;
    // 175–180 → 177.5 cm.)
    const state = (await readDemoState(page)) as {
      draft: Record<string, unknown>;
      targets: Record<string, number>;
      routine: { source: string; days: { exercises: unknown[] }[] };
    };
    const draft = state.draft;
    expect(draft.ai_mode).toBe(true);
    expect(draft.ai_age_bucket).toBe('26-35');
    expect(draft.ai_weight_band).toBe('70-80');
    expect(draft.ai_body_fat_band).toBe('18-25');
    expect(draft.ai_build).toBe('muscular');
    expect(draft.ai_height_band).toBe('175-180');
    expect(draft.weight_kg).toBe(75);
    expect(draft.height_cm).toBe(177.5);
    expect(draft.birthdate).toBe(`${new Date().getFullYear() - 30}-01-01`);
    expect(draft.sex).toBe('male');
    expect(draft.experience_level).toBe('intermediate');
    expect(draft.training_location).toBe('commercial_gym');
    expect((draft.equipment_slugs as string[]).length).toBeGreaterThan(0);
    expect(draft.days_per_week).toBe(4);
    expect(draft.preferred_days).toEqual([0, 1, 3, 4]);
    expect(draft.session_minutes).toBe(60);
    expect(draft.diet_base).toBe('vegetarian');
    expect(draft.diet_avoid).toEqual(['nut_free']);
    expect(draft.diet_type).toBe('vegetarian');
    expect(draft.allergies).toEqual(expect.arrayContaining(['tree_nut', 'peanut']));
    expect(draft.goals).toEqual(['fat_loss', 'hypertrophy', 'strength']);
    expect(draft.primary_goal).toBe('fat_loss');

    // The EXISTING generators ran on those midpoints: real targets, a real routine.
    expect(state.targets.kcal_target).toBeGreaterThan(0);
    expect(state.routine.source).toBe('generated');
    expect(state.routine.days.reduce((n, d) => n + d.exercises.length, 0)).toBeGreaterThan(0);

    // DIET GENERATION WAS INVOKED through the contracted boundary, with the contract's inputs.
    // W2's engine is absent from this worktree, so the assertion is on the boundary event;
    // INTEGRATION MUST FLIP the outcome branch below to require 'stored' + the storage key
    // (see components/onboarding/dietGeneration.ts, integration step 4).
    const dietCalls = await readDietCalls(page);
    expect(dietCalls).toHaveLength(1);
    const call = dietCalls[0]!;
    const request = call.request as {
      weightKg: number;
      rankedGoals: string[];
      bodyFatBand?: string;
      prefs: { base: string; avoid: string[] };
      targets: { kcal_target: number };
    };
    expect(request.weightKg).toBe(75);
    expect(request.rankedGoals).toEqual(['fat_loss', 'hypertrophy', 'strength']);
    expect(request.bodyFatBand).toBe('18-25');
    expect(request.prefs).toEqual({ base: 'vegetarian', avoid: ['nut_free'] });
    expect(request.targets.kcal_target).toBe(state.targets.kcal_target);
    expect(['stored', 'engine-absent']).toContain(call.outcome);
    if (call.outcome === 'stored') {
      // The engine was present (post-integration): the plan must actually be in the store.
      const dietRaw = await page.evaluate(() => window.localStorage.getItem('fitforge.diet.v1'));
      expect(dietRaw).not.toBeNull();
    }
  });

  test('a refusal exits gracefully to Old School — and the classic flow is intact from there', async ({
    page,
  }) => {
    await armEndpoint(page);
    await page.route(`${ENDPOINT}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET')
        return route.fulfill({ json: HEALTH, contentType: 'application/json' });
      // The safety path succeeding (422), not an outage.
      return route.fulfill({ status: 422, json: { error: 'refused', reason: 'unreadable' } });
    });

    await enterAiMode(page);
    await uploadPhotos(page);
    await page.getByTestId('ai-photos-scan').click();

    // Plain coach voice, reason-specific, with retake still on the table for 'unreadable'.
    const error = page.getByTestId('ai-scan-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('data-kind', 'unreadable');
    await expect(error).toContainText(/Too dark or blurry/);
    await expect(page.getByTestId('ai-photos-scan')).toContainText('Try again');

    // The Old School door: flips the fork flag and joins the CLASSIC chain.
    await page.getByTestId('ai-photos-oldschool').click();
    await page.waitForURL(/\/onboarding\/goals/);
    // Classic copy, no AI cap — the fork flag is really off.
    await expect(page.getByText('Tap every goal that applies. The first one you pick leads your plan.')).toBeVisible();
    await expect(page.getByTestId('goals-ai-cap')).toHaveCount(0);
    const state = (await readDemoState(page)) as { draft: { ai_mode?: boolean } };
    expect(state.draft.ai_mode).toBe(false);

    // And the classic order really runs: goals → experience, exactly as before the fork existed.
    await page.getByText('Lose fat').click();
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/onboarding\/experience/);
  });

  test('a worker outage reads as "scanner unreachable" with the same Old School door', async ({
    page,
  }) => {
    await armEndpoint(page);
    await page.route(`${ENDPOINT}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET')
        return route.fulfill({ json: HEALTH, contentType: 'application/json' });
      return route.fulfill({ status: 503, json: { error: 'ai_unavailable' } });
    });

    await enterAiMode(page);
    await uploadPhotos(page);
    await page.getByTestId('ai-photos-scan').click();

    const error = page.getByTestId('ai-scan-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('data-kind', 'ai_unavailable');
    await expect(error).toContainText(/isn’t reachable/);
    await expect(page.getByTestId('ai-photos-oldschool')).toBeVisible();
  });
});
