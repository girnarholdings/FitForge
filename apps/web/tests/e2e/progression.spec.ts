import { test, expect, type Page } from '@playwright/test';
import { resetDemo, enterDemo, completeOnboarding, readDemoState, WORKOUT_LOG_KEY } from './helpers';

/**
 * PROGRESSION SCHEMES — the shape of every set, not a label on a card.
 *
 * These specs exist to hold five promises:
 *   1. The choice CHANGES THE PRESCRIPTION. The same routine row must produce visibly different
 *      per-set targets under a different scheme, in the real player, on a real generated plan.
 *   2. A novice is never DEFAULTED into a heavy-first scheme, and a deliberate over-reach is
 *      warned about — in the PLAYER, at the moment it matters — rather than silently accepted.
 *   3. Nothing is written until the athlete chooses — an untouched store keeps tracking the
 *      recommendation, so changing your experience level later changes your training.
 *   4. WARM-UP RAMPS ARE NOT SETS. They live in their own list, they never renumber the working
 *      sets, and they never reach the logged session — which is where every weekly volume number
 *      in the app comes from.
 *   5. THREE schemes ship, and a stored `ascending_pyramid` migrates itself away silently.
 */

const cont = (page: Page) => page.getByTestId('onboarding-continue').click();

/** Walk to the progression step answering `experience`, leaving the page on that step. */
async function walkToProgression(page: Page, experience: string): Promise<void> {
  await enterDemo(page);
  await page.getByText('Build muscle').click();
  await cont(page);
  await page.waitForURL(/\/onboarding\/experience/);
  await page.getByText(experience, { exact: true }).click();
  await cont(page);
  await page.waitForURL(/\/onboarding\/schedule/);
  await cont(page);
  await page.waitForURL(/\/onboarding\/split/);
  await cont(page);
  await page.waitForURL(/\/onboarding\/progression/);
}

/** The "N reps · …" line of every working-set target currently on screen. */
async function setTargets(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="set-target-"]').allInnerTexts();
}

/** Every set logged in the persisted workout log, flattened to `reps×kg` strings. */
async function loggedSets(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      sessions: { exercises: { sets: { reps: number; weight_kg: number }[] }[] }[];
    };
    return parsed.sessions.flatMap((s) =>
      s.exercises.flatMap((e) => e.sets.map((x) => `${x.reps}x${x.weight_kg}`)),
    );
  }, WORKOUT_LOG_KEY);
}

test.describe('progression scheme · onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('a novice is put on straight sets, and nothing is written until they choose', async ({
    page,
  }) => {
    await walkToProgression(page, 'Beginner');

    // The one sentence that makes an unfamiliar choice safe to get wrong.
    await expect(page.getByTestId('progression-lede')).toContainText(/keep Straight sets/i);

    // The recommendation is preselected and named as such.
    const straight = page.getByRole('radio', { name: /Straight sets/ });
    await expect(straight).toHaveAttribute('aria-checked', 'true');
    await expect(straight).toContainText('recommended for you');
    await expect(page.getByRole('radio', { name: /Reverse pyramid/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    // THREE options, not four: the ascending pyramid was cut, not renamed.
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: /Ascending pyramid/ })).toHaveCount(0);

    // Straight sets are flat: four identical sets at 100 % of the working weight, and the RANGE
    // rather than the top of it, because double progression is what makes the load move.
    const preview = page.getByTestId('progression-preview');
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId('progression-preview-set-1')).toContainText('100%');
    await expect(preview.getByTestId('progression-preview-set-1')).toContainText('–');
    await expect(preview.getByTestId('progression-preview-set-4')).toContainText('100%');

    // No caution, because nothing above their level is selected.
    await expect(page.getByTestId('progression-caution')).toHaveCount(0);

    // Untouched = null in the store, i.e. "keep following the recommendation".
    const state = await readDemoState(page);
    expect((state as { progressionScheme: unknown }).progressionScheme).toBeNull();
  });

  test('choosing reverse pyramid re-shapes the sets, caps them at three, and warns a novice', async ({
    page,
  }) => {
    await walkToProgression(page, 'Beginner');

    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();

    // The prescription itself changes: heaviest first, load dropping, reps climbing.
    const preview = page.getByTestId('progression-preview');
    await expect(preview.getByTestId('progression-preview-set-1')).toContainText('100%');
    await expect(preview.getByTestId('progression-preview-set-2')).toContainText('90%');
    await expect(preview.getByTestId('progression-preview-set-3')).toContainText('81%');
    // A fourth set would land at 73% — junk volume, so the scheme refuses it and SAYS SO.
    await expect(preview.getByTestId('progression-preview-set-4')).toHaveCount(0);
    await expect(page.getByTestId('progression-trim')).toContainText('set 4 dropped');

    // The coaching caveat is shown rather than the choice being silently overruled.
    await expect(page.getByTestId('progression-caution')).toContainText(/heaviest set/i);

    const state = await readDemoState(page);
    expect((state as { progressionScheme: unknown }).progressionScheme).toBe('reverse_pyramid');
  });

  test('an experienced lifter is recommended a sharper scheme, with no warning', async ({
    page,
  }) => {
    await walkToProgression(page, 'Advanced');

    const reverse = page.getByRole('radio', { name: /Reverse pyramid/ });
    await expect(reverse).toContainText('recommended for you');
    await expect(reverse).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('progression-caution')).toHaveCount(0);
  });

  test('the numbers on screen carry their provenance, convention included', async ({ page }) => {
    await walkToProgression(page, 'Beginner');
    await page.getByTestId('progression-onboarding-evidence-toggle').click();
    const evidence = page.getByTestId('progression-onboarding-evidence');
    await expect(evidence).toContainText(/Angleri/);
    // The part that matters most: the app says where it is following convention, not evidence.
    await expect(evidence).toContainText(/convention/i);
  });
});

test.describe('progression scheme · the workout player', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
  });

  /** The first day of the generated routine that actually has exercises. */
  async function firstDayId(page: Page): Promise<string> {
    const state = await readDemoState(page);
    const routine = (state as { routine: { days: { id: string; exercises: unknown[] }[] } })
      .routine;
    const day = routine.days.find((d) => d.exercises.length > 0);
    expect(day, 'generated routine has a day with exercises').toBeTruthy();
    return day!.id;
  }

  test('the chosen scheme changes the per-set targets of a real session', async ({ page }) => {
    const dayId = await firstDayId(page);

    // Straight sets (the recommendation for this persona): the range, at one weight.
    await page.goto(`/workout/${dayId}`);
    await expect(page.getByTestId('progression-headline')).toContainText('Straight sets');
    const flat = await setTargets(page);
    expect(flat.length).toBeGreaterThan(1);
    // Double progression is stated as a range, not as a hard top-of-range number.
    expect(flat.every((t) => t.includes('same weight'))).toBe(true);
    expect(flat.every((t) => t.includes('–'))).toBe(true);
    // The rule that moves the weight is stated, not implied.
    await expect(page.getByTestId('progression-next-session')).toContainText(/rep range/i);

    // Switch scheme in Settings…
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();
    await expect(page.getByTestId('settings-progression-shape')).toContainText('90%');

    // …and the SAME session is prescribed differently.
    await page.goto(`/workout/${dayId}`);
    await expect(page.getByTestId('progression-headline')).toContainText('Reverse pyramid');
    const pyramid = await setTargets(page);
    expect(pyramid[0]).toContain('100%');
    expect(pyramid.some((t) => !t.includes('100%'))).toBe(true);
    expect(pyramid).not.toEqual(flat);
    // The heaviest set is called out on the row itself.
    await expect(page.getByTestId('set-cue-1')).toContainText(/heaviest/i);
  });

  test('the warm-up ramp is its own list, and never renumbers the working sets', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();
    const dayId = await firstDayId(page);
    await page.goto(`/workout/${dayId}`);

    // IT STARTS FOLDED, and that is the fix for "the first working set is 930 px down a 664 px
    // screen". The summary states what is required; the steps are one tap away, not gone.
    await expect(page.getByTestId('warmup-summary')).toBeVisible();
    await expect(page.getByTestId('warmup-row-1')).toHaveCount(0);
    await page.getByTestId('warmup-toggle').click();

    // Four ramp steps under a heavy-first scheme (the extra 90 % single), in their OWN list.
    await expect(page.getByTestId('warmup-row-1')).toBeVisible();
    await expect(page.getByTestId('warmup-row-4')).toBeVisible();
    await expect(page.getByTestId('warmup-row-1')).toContainText('40%');

    // Working sets keep 1-based numbering, counting working sets only.
    await expect(page.getByTestId('set-row-1')).toBeVisible();
    await expect(page.getByTestId('set-target-1')).toContainText('100%');

    // The header count is HARD SETS: the ramp does not inflate it.
    const counter = page.getByTestId('workout-set-counter');
    const before = await counter.innerText();
    await page.getByTestId('warmup-latch-0').click();
    await expect(counter).toHaveText(before);
    // …and folding it back reports the ramp as done rather than as outstanding.
    const rampRows = await page.locator('[data-testid^="warmup-latch-"]').count();
    for (let i = 1; i < rampRows; i++) await page.getByTestId(`warmup-latch-${i}`).click();
    await page.getByTestId('warmup-toggle').click();
    await expect(page.getByTestId('warmup-summary')).toContainText(/sets? done/);
    await expect(page.getByTestId('warmup-row-1')).toHaveCount(0);
  });

  /* THE POSITIONAL TAPER is asserted as a UNIT test, in packages/shared/src/rules/progression.test.ts
   * ("warmupRamp · position"), and deliberately not here. The generator picks one exercise per
   * movement pattern per day and the catalog's compounds each carry a single primary muscle, so a
   * DEFAULT generated day never repeats a pattern — an e2e that walked the pager looking for an
   * already-warm lift would be asserting on a state this persona's plan cannot reach, which is a
   * test that passes for the wrong reason on the day someone changes the generator. The taper fires
   * on hand-edited routines and on splits that deliberately double up a pattern (a push day with
   * bench AND incline press), and the rule that decides it is pure. Test it where it lives. */

  test('the heavy first set is dimmed until the athlete warms up — never disabled', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();
    const dayId = await firstDayId(page);
    await page.goto(`/workout/${dayId}`);

    // The gate is a caption plus a way past it, on the top set only.
    await expect(page.getByTestId('set-gate-1')).toContainText(/Warm up first/i);
    // Dimmed, NOT disabled: the latch is still there and still works.
    await expect(page.getByTestId('set-latch-0')).toBeEnabled();

    await page.getByTestId('warmup-ack').click();
    await expect(page.getByTestId('set-gate-1')).toHaveCount(0);
  });

  test('the caution appears in the player, with a one-tap way out', async ({ page }) => {
    // A beginner who deliberately over-reaches must meet the warning when it matters, not weeks
    // earlier in onboarding.
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Beginner/ }).click();
    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();
    const dayId = await firstDayId(page);
    await page.goto(`/workout/${dayId}`);

    await expect(page.getByTestId('workout-scheme-caution')).toContainText(/heaviest set/i);
    await page.getByTestId('workout-scheme-switch').click();
    await expect(page.getByTestId('progression-headline')).toContainText('Straight sets');
    expect(
      ((await readDemoState(page)) as { progressionScheme: unknown }).progressionScheme,
    ).toBe('straight_sets');
  });

  test('a logged ramp adds NOTHING to the training log', async ({ page }) => {
    // The regression that matters most: the app's whole training currency is hard sets per muscle
    // per week. A warm-up leaking into it would inflate every weekly goal, heat colour and target
    // bar in the app.
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();
    const dayId = await firstDayId(page);

    // Run 1 — one working set, no warm-up ticked.
    await page.goto(`/workout/${dayId}`);
    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('40');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('6');
    await page.getByTestId('set-latch-0').click();
    await page.getByRole('button', { name: 'Skip rest' }).click();
    while (await page.getByRole('button', { name: /Next exercise/ }).isVisible()) {
      await page.getByRole('button', { name: /Next exercise/ }).click();
    }
    await page.getByRole('button', { name: 'Finish workout' }).click();
    const withoutRamp = await loggedSets(page);
    expect(withoutRamp).toEqual(['6x40']);

    // Run 2 — the identical working set, with every warm-up step ticked.
    await page.goto(`/workout/${dayId}`);
    // The ramp starts folded now, so open it before ticking every step.
    await page.getByTestId('warmup-toggle').click();
    const rampRows = await page.locator('[data-testid^="warmup-latch-"]').count();
    expect(rampRows).toBeGreaterThan(0);
    for (let i = 0; i < rampRows; i++) await page.getByTestId(`warmup-latch-${i}`).click();
    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('40');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('6');
    await page.getByTestId('set-latch-0').click();
    await page.getByRole('button', { name: 'Skip rest' }).click();
    while (await page.getByRole('button', { name: /Next exercise/ }).isVisible()) {
      await page.getByRole('button', { name: /Next exercise/ }).click();
    }
    await page.getByRole('button', { name: 'Finish workout' }).click();

    // Two sessions, two logged sets — the four ramp steps are nowhere.
    expect(await loggedSets(page)).toEqual(['6x40', '6x40']);
  });
});

test.describe('progression scheme · settings', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
  });

  test('the choice persists, and can be handed back to the recommendation', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-progression-current')).toContainText(
      /recommendation/i,
    );

    await page.getByRole('radio', { name: /Top set/ }).click();
    await expect(page.getByTestId('settings-progression-current')).toContainText('You chose');
    expect(
      ((await readDemoState(page)) as { progressionScheme: unknown }).progressionScheme,
    ).toBe('top_set_backoff');

    // It survives a reload (Local Mode has no server to fall back on).
    await page.reload();
    await expect(page.getByRole('radio', { name: /Top set/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.getByTestId('settings-progression-reset').click();
    expect(
      ((await readDemoState(page)) as { progressionScheme: unknown }).progressionScheme,
    ).toBeNull();
    await expect(page.getByTestId('settings-progression-current')).toContainText(
      /recommendation/i,
    );
  });

  test('a stored ascending_pyramid migrates itself, with no error and no data step', async ({
    page,
  }) => {
    // The scheme shipped once. An athlete carrying it in localStorage did nothing wrong, so it
    // reads as "no choice made" and falls back to the recommendation.
    await page.evaluate(() => {
      const key = 'fitforge.demo.v1';
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const state = JSON.parse(raw) as Record<string, unknown>;
      state.progressionScheme = 'ascending_pyramid';
      window.localStorage.setItem(key, JSON.stringify(state));
    });
    await page.goto('/settings');

    await expect(page.getByTestId('settings-progression-current')).toContainText(/recommendation/i);
    await expect(page.getByRole('radio', { name: /Ascending pyramid/ })).toHaveCount(0);
    expect(
      ((await readDemoState(page)) as { progressionScheme: unknown }).progressionScheme,
    ).toBeNull();
  });
});
