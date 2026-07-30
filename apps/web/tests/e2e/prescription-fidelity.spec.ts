import { test, expect, type Page } from '@playwright/test';
import { readDemoState, DEMO_STORAGE_KEY, WORKOUT_LOG_KEY, seedOnboarded, openSettings} from './helpers';

/**
 * PRESCRIPTION FIDELITY — the numbers the app SAYS and the numbers the app LOGS are one number.
 *
 * The existing progression spec asserts on `set-target-N` label text and nothing else, which is
 * why it passed through a class of bug it structurally could not see: under reverse pyramid the
 * labels read '6 reps · 100%' / '8 reps · 90%' / '10 reps · 81%' while the INPUTS underneath them
 * pre-filled 80/80/80 kg and 8/8/7 reps from last session's ghost, and tapping through persisted
 * three sets at one weight — straight sets. The app told the athlete to drop 10% a set and then
 * wrote down that they didn't, and every downstream number (e1RM, PRs, the heatmap, tonnage) was
 * computed from a session nobody was prescribed.
 *
 * So every test in this file asserts on a VALUE — an input's `inputValue()`, a persisted log entry,
 * a rendered counter — never on a label alone. Four promises:
 *
 *   1. The inputs carry the PRESCRIPTION, and what gets logged is the shaped session.
 *   2. Switching scheme mid-session RECONCILES the set list instead of silently deleting a set.
 *   3. Every set count in the app is the same number: the /routines chip, the week rollup and the
 *      player's counter denominator, under all three schemes.
 *   4. The first working set is reachable without scrolling on the phone the app is designed for.
 */

const setScheme = async (page: Page, scheme: string): Promise<void> => {
  await page.evaluate(
    ({ key, value }) => {
      const raw = window.localStorage.getItem(key);
      const state = raw ? JSON.parse(raw) : null;
      if (state) {
        state.progressionScheme = value;
        window.localStorage.setItem(key, JSON.stringify(state));
      }
    },
    { key: DEMO_STORAGE_KEY, value: scheme },
  );
};

/** The first day of the generated routine that actually has exercises. */
async function firstDayId(page: Page): Promise<string> {
  const state = await readDemoState(page);
  const routine = (state as { routine: { days: { id: string; exercises: unknown[] }[] } }).routine;
  const day = routine.days.find((d) => d.exercises.length > 0);
  expect(day, 'generated routine has a day with exercises').toBeTruthy();
  return day!.id;
}

/** `0/18 sets` → 18. */
async function counterDenominator(page: Page): Promise<number> {
  const text = await page.getByTestId('workout-set-counter').innerText();
  return Number(/\/(\d+)/.exec(text)?.[1]);
}

test.describe('prescription fidelity', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('under reverse pyramid the weight INPUTS drop, not just the labels', async ({ page }) => {
    await page.goto('/routines');
    await setScheme(page, 'reverse_pyramid');
    const dayId = await firstDayId(page);
    await page.goto(`/workout/${dayId}`);

    await expect(page.getByTestId('progression-headline')).toContainText('Reverse pyramid');

    // A first-time athlete has no history, so the app ASKS for the anchor rather than inventing
    // one — and then every relative load has to actually follow it.
    const top = page.getByRole('spinbutton', { name: 'Set 1 weight' });
    if ((await top.inputValue()) === '') {
      await expect(page.getByTestId('workout-anchor-prompt')).toBeVisible();
      await page.getByRole('spinbutton', { name: 'Working weight' }).fill('100');
    }
    const anchor = Number(await top.inputValue());
    expect(anchor, 'set 1 carries a real working weight').toBeGreaterThan(0);

    // THE ASSERTION THE OLD SUITE COULD NOT MAKE. Set 2 is 90% of set 1 and set 3 is 81%, in the
    // FIELD, not merely in the label above it. These read 80/80/80 under a 100/90/81 prescription.
    const two = Number(await page.getByRole('spinbutton', { name: 'Set 2 weight' }).inputValue());
    const three = Number(await page.getByRole('spinbutton', { name: 'Set 3 weight' }).inputValue());
    expect(two).toBeLessThan(anchor);
    expect(three).toBeLessThan(two);
    // Rounded to the nearest 2.5 kg plate step, so compare against that grid rather than exactly.
    expect(two).toBeCloseTo(Math.round((anchor * 0.9) / 2.5) * 2.5, 2);
    expect(three).toBeCloseTo(Math.round((anchor * 0.81) / 2.5) * 2.5, 2);

    // And the reps follow the scheme rather than last session's achieved reps: the drop buys reps.
    const r1 = Number(await page.getByRole('spinbutton', { name: 'Set 1 reps' }).inputValue());
    const r2 = Number(await page.getByRole('spinbutton', { name: 'Set 2 reps' }).inputValue());
    expect(r2).toBeGreaterThan(r1);

    // What actually reaches the log is the shaped session — three sets at ONE weight is the bug.
    await page.getByTestId('set-latch-0').click();
    await page.getByRole('button', { name: 'Skip rest' }).click();
    await page.getByTestId('set-latch-1').click();
    await page.getByRole('button', { name: 'Skip rest' }).click();
    while (await page.getByRole('button', { name: /Next exercise/ }).isVisible()) {
      await page.getByRole('button', { name: /Next exercise/ }).click();
    }
    await page.getByRole('button', { name: 'Finish workout' }).click();

    const logged = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [] as number[];
      const parsed = JSON.parse(raw) as {
        sessions: { exercises: { sets: { weight_kg: number }[] }[] }[];
      };
      return parsed.sessions.flatMap((s) =>
        s.exercises.flatMap((e) => e.sets.map((x) => x.weight_kg)),
      );
    }, WORKOUT_LOG_KEY);
    expect(logged.length).toBe(2);
    expect(logged[0]).toBeGreaterThan(logged[1]!);
  });

  test('the percentage is resolved into kilos the athlete can load', async ({ page }) => {
    // "40% of what?" The whole prescription was expressed as a fraction of a number the screen
    // never printed, so an athlete read "8 reps · 90%" and did the arithmetic themselves mid-set.
    await page.goto('/routines');
    await setScheme(page, 'reverse_pyramid');
    const dayId = await firstDayId(page);
    await page.goto(`/workout/${dayId}`);

    const top = page.getByRole('spinbutton', { name: 'Set 1 weight' });
    if ((await top.inputValue()) === '') {
      await page.getByRole('spinbutton', { name: 'Working weight' }).fill('100');
    }

    await expect(page.getByTestId('set-target-2')).toContainText('90%');
    await expect(page.getByTestId('set-target-2')).toContainText(/\d+(\.\d+)? kg/);

    await page.getByTestId('warmup-toggle').click();
    await expect(page.getByTestId('warmup-row-1')).toContainText('40%');
    await expect(page.getByTestId('warmup-row-1')).toContainText(/\d+(\.\d+)? kg/);
  });

  test('switching to straight sets mid-session GROWS the set list back, it does not delete a set', async ({
    page,
  }) => {
    // THE SAFETY ESCAPE HATCH USED TO PUNISH THE ATHLETE WHO TOOK IT. Tapping the caution's own
    // "Switch to straight sets" flipped the headline and the target line to 4 × 6-10 while only
    // THREE set rows rendered, and left the counter reading 0/18 instead of 0/20.
    await page.goto('/settings');
    await openSettings(page);
    await page.getByRole('radio', { name: /Beginner/ }).click();
    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();
    const dayId = await firstDayId(page);
    await page.goto(`/workout/${dayId}`);

    const cappedRows = await page.locator('[data-testid^="set-row-"]').count();
    const cappedTotal = await counterDenominator(page);

    await page.getByTestId('workout-scheme-switch').click();
    await expect(page.getByTestId('progression-headline')).toContainText('Straight sets');

    // The row the scheme was capping is BACK, and the counter agrees with the rows on screen.
    await expect(page.getByTestId(`set-row-${cappedRows + 1}`)).toBeVisible();
    expect(await counterDenominator(page)).toBeGreaterThan(cappedTotal);
    // The warm-up count resizes with it rather than reporting "4/3".
    const progress = await page.getByTestId('warmup-progress').innerText();
    const [done, total] = progress.split('/').map(Number);
    expect(done!).toBeLessThanOrEqual(total!);
  });

  test('the /routines chip, the week rollup and the player counter are ONE number', async ({
    page,
  }) => {
    // Every set count, minute estimate and weekly volume bar used to ignore the scheme's set cap:
    // /routines said "20 sets" under straight sets AND under reverse pyramid, while the player for
    // the same day reported 0/18. Under reverse pyramid the chest work drops 8 → 6 of a 14-set
    // target, so the app was reporting 57% for a week that delivers 43%.
    for (const scheme of ['straight_sets', 'top_set_backoff', 'reverse_pyramid']) {
      await page.goto('/routines');
      await setScheme(page, scheme);
      await page.reload();

      const chip = await page.getByTestId('routine-day-stats-0').innerText();
      const chipSets = Number(/(\d+) sets?/.exec(chip)?.[1]);
      expect(chipSets, `${scheme}: the day chip states a set count`).toBeGreaterThan(0);

      const state = await readDemoState(page);
      const routine = (state as { routine: { days: { id: string }[] } }).routine;
      await page.goto(`/workout/${routine.days[0]!.id}`);
      expect(
        await counterDenominator(page),
        `${scheme}: the player runs exactly the sets the card advertised`,
      ).toBe(chipSets);
    }
  });

  test('a capped scheme moves the weekly volume panel, it does not leave it frozen', async ({
    page,
  }) => {
    await page.goto('/routines');
    await setScheme(page, 'straight_sets');
    await page.reload();
    const flat = await page.getByTestId('plan-targets-summary').innerText();

    await setScheme(page, 'reverse_pyramid');
    await page.reload();
    const pyramid = await page.getByTestId('plan-targets-summary').innerText();

    // It reported the identical string under all three schemes, on the one screen whose entire job
    // is calibrating weekly volume.
    expect(pyramid).not.toEqual(flat);
    const setsOf = (s: string): number => Number(/(\d+) sets?/.exec(s)?.[1]);
    expect(setsOf(pyramid)).toBeLessThan(setsOf(flat));
  });

  test('the minute estimate accounts for the warm-up ramps the app mandates', async ({ page }) => {
    await page.goto('/routines');
    await page.getByTestId('routine-day-toggle-0').click();
    // The total is the total; the disclosure breaks out the preparation half rather than leaving
    // the athlete to discover that "~49 min" describes a ~62-minute session.
    await expect(page.getByTestId('routine-day-prep-0')).toContainText(/min of that is warm-up/);
  });

  test('the first working set is reachable without scrolling on a 390 × 664 phone', async ({
    page,
  }) => {
    // Measured at 672 px under straight sets and ~930 px under reverse pyramid — the primary action
    // of the screen was off-screen the moment a workout opened, and it repeated on every exercise
    // transition, mid-workout, with chalky hands.
    for (const scheme of ['straight_sets', 'reverse_pyramid']) {
      await page.goto('/routines');
      await setScheme(page, scheme);
      const dayId = await firstDayId(page);
      await page.goto(`/workout/${dayId}`);

      const box = await page.getByTestId('set-row-1').boundingBox();
      expect(box, `${scheme}: set 1 renders`).not.toBeNull();
      const viewport = page.viewportSize();
      expect(
        box!.y,
        `${scheme}: set 1 sits at ${Math.round(box!.y)} px inside a ${viewport?.height} px viewport`,
      ).toBeLessThan(viewport!.height);
    }
  });

  test('the mobility block the ramp promises actually exists', async ({ page }) => {
    // The ramp's footer told the athlete, verbatim, "under a heavy-first scheme you need both" —
    // while the app supplied no mobility work at all and all 15 mobility/stretch rows in the
    // catalog were unreachable from any session. An app must not name a prerequisite it withholds.
    const dayId = await firstDayId(page);
    await page.goto(`/workout/${dayId}`);

    await expect(page.getByTestId('workout-prep-pre')).toBeVisible();
    await page.getByTestId('workout-prep-pre-toggle').click();
    await expect(page.locator('[data-testid^="workout-prep-pre-row-"]').first()).toBeVisible();

    // The cooldown is on the LAST exercise and never before the sets — the order is the finding.
    while (await page.getByRole('button', { name: /Next exercise/ }).isVisible()) {
      await page.getByRole('button', { name: /Next exercise/ }).click();
    }
    const post = page.getByTestId('workout-prep-post');
    await expect(post).toBeVisible();
    const setList = await page.getByTestId('set-row-1').boundingBox();
    const postBox = await post.boundingBox();
    expect(postBox!.y).toBeGreaterThan(setList!.y);

    // …and neither block leaks into the set counter.
    const before = await counterDenominator(page);
    await page.getByTestId('workout-prep-post-toggle').click();
    expect(await counterDenominator(page)).toBe(before);
  });
});
