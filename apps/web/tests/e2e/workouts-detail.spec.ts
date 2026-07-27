import { test, expect } from '@playwright/test';
import {
  completeOnboarding,
  pageOverflow,
  resetDemo,
  DEMO_STORAGE_KEY,
  WORKOUT_LOG_KEY,
} from './helpers';

/**
 * THE WORKOUTS SURFACE SHOWS WHAT A SESSION IS.
 *
 * The complaint this guards: "the workouts section doesn't really show you quick workout stats.
 * What it hits etc. Don't just give the option to start." A day row that offers only a name and a
 * Start link asks the athlete to commit an hour on trust, so every assertion below is about the
 * information being ON SCREEN before anything is started.
 *
 * It also guards the fabricated-data defect on the routine detail route: that screen used to read
 * `mockRoutineById`, which returns the hard-coded Upper/Lower fixture for any unknown id — so
 * "Edit routine" showed the user a week of exercises they had never been prescribed, and its Save
 * button silently discarded every edit.
 */
test.use({ viewport: { width: 390, height: 664 } });

test.describe('workouts · session stats', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
  });

  test('every session shows sets, duration, muscles and its exercise list without starting it', async ({
    page,
  }) => {
    await page.goto('/routines');
    await expect(page.getByTestId('routine-days')).toBeVisible();

    // Working sets and estimated duration, pluralised — never "1 sets".
    const stats = page.getByTestId('routine-day-stats-0');
    await expect(stats).toBeVisible();
    await expect(stats).toContainText(/\b\d+ sets?\b/);
    await expect(stats).toContainText(/~\d+ min/);
    expect(await stats.innerText()).not.toMatch(/\b1 sets\b/);

    // What it trains, in words, with the weighted set count per muscle.
    await expect(page.getByTestId('routine-day-muscles-0')).toContainText(/\d/);

    // HOW IT RUNS — the progression scheme chosen in onboarding, surfaced where the session is
    // chosen. A heavy-first scheme whose "set 1 is your hardest set" only appears in the player is
    // a warning nobody reads at the moment it matters.
    await expect(page.getByTestId('routine-day-scheme-0')).toBeVisible();

    // THE ANCHOR LIFT, by name — "leg day" and "squat day" are different decisions. Assert it is a
    // REAL exercise from this day rather than a label, by finding it in the day's own list.
    const anchor = page.getByTestId('routine-day-anchor-0');
    await expect(anchor).toBeVisible();
    const anchorName = (await anchor.innerText()).replace(/^Anchored by\s*/, '').trim();
    expect(anchorName.length).toBeGreaterThan(0);

    // WHEN IT WAS LAST TRAINED, as a date and nothing more. A fresh account has no history, and
    // the honest answer to that is "Not trained yet" — never a fabricated recovery percentage.
    await expect(page.getByTestId('routine-day-last-0')).toHaveText('Not trained yet');

    // ...and as a picture. The thumb labels itself with the muscles it lights up.
    await expect(
      page.getByTestId('routine-day-0').getByRole('img', { name: /Target muscles:/ }),
    ).toBeVisible();

    // The exercise list is a disclosure, not a navigation: still on /routines afterwards.
    const toggle = page.getByTestId('routine-day-toggle-0');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = page.getByTestId('routine-day-detail-0');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(/\d+ × \d+–\d+/);
    await expect(detail).toContainText(anchorName);
    expect(page.url()).toContain('/routines');

    // The kit list, in words — the accessible answer the drawn portraits on the face cannot give,
    // and the one that decides whether a session is doable at 6pm.
    await expect(page.getByTestId('routine-day-needs-0')).toContainText(/Needs\s+\S+/);

    // What the scheme DOES to the rows above it, in the athlete's words.
    await expect(page.getByTestId('routine-day-scheme-note-0')).toBeVisible();

    // Starting is still one tap, it is simply no longer the only thing on offer.
    await expect(page.getByTestId('routine-day-0').getByRole('link', { name: 'Start' })).toBeVisible();

    // The week's total volume against the athlete's own goals.
    await expect(page.getByTestId('plan-targets-summary')).toContainText(/\d+ sets? a week across/);

    // Nothing on this screen may run off the side of a 390 px phone.
    expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);
  });

  test('a session that HAS been trained reports when, from the real log', async ({ page }) => {
    // `seedTrainingHistory` writes sessions under its own `seed-day-*` ids, so it cannot make a
    // generated day look trained. Re-point the newest session at this athlete's real first day —
    // the same field `WorkoutPlayer.finishWorkout()` writes — and the card must pick it up.
    await page.goto('/routines');
    const dayId = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      const routine = raw ? (JSON.parse(raw) as { routine: { days: { id: string }[] } }).routine : null;
      return routine?.days[0]?.id ?? null;
    }, DEMO_STORAGE_KEY);
    expect(dayId).not.toBeNull();

    await page.evaluate(
      ({ key, id }) => {
        const at = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        window.localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            sessions: [
              { id: 'trained-1', dayId: id, dayName: 'Day A', finishedAt: at, exercises: [] },
            ],
          }),
        );
      },
      { key: WORKOUT_LOG_KEY, id: dayId },
    );
    await page.reload();

    await expect(page.getByTestId('routine-day-last-0')).toHaveText('Last trained 3 days ago');
  });

  test('a capped scheme says how many of the sets it advertises are actually performed', async ({
    page,
  }) => {
    // Reverse pyramid runs THREE working sets on the big lifts, full stop, while the generator
    // writes four for a compound. Without this line the card would advertise a set count the
    // player never runs — two screens disagreeing about the same session, which is exactly the
    // class of erroneous entry this surface exists to eliminate.
    await page.goto('/routines');
    await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      const state = raw ? JSON.parse(raw) : null;
      if (state) {
        state.progressionScheme = 'reverse_pyramid';
        window.localStorage.setItem(key, JSON.stringify(state));
      }
    }, DEMO_STORAGE_KEY);
    await page.reload();

    await expect(page.getByTestId('routine-day-scheme-0')).toContainText('Reverse pyramid');
    await page.getByTestId('routine-day-toggle-0').click();
    const note = page.getByTestId('routine-day-scheme-note-0');
    await expect(note).toContainText('Reverse pyramid');
    await expect(note).toContainText(/Only \d+ sets? of the \d+ prescribed above are performed/);
    // …and the number it names is a real cap from the rules, never a stray "null".
    await expect(note).toContainText(/caps the big lifts at \d+ working sets/);
  });

  test('the routine detail edits the REAL plan and its Save button actually saves', async ({
    page,
  }) => {
    await page.goto('/routines');
    await expect(page.getByTestId('routine-days')).toBeVisible();
    const planName = await page.getByTestId('active-split-name').innerText();
    const setsBefore = await page.getByTestId('routine-day-stats-0').innerText();

    await page.getByRole('link', { name: 'Edit routine' }).click();
    await expect(page.getByTestId('routine-day-stats')).toBeVisible();

    // The generated plan, NOT the Upper/Lower fixture. `mockRoutineById` would have renamed the
    // routine and filled it with bench-press / barbell-row / overhead-press.
    await expect(page.getByLabel('Routine name')).toHaveValue(planName);

    // The per-day read-out is live: adding a set moves the numbers immediately.
    const setsOf = async (testId: string) =>
      Number(/(\d+) sets?/.exec(await page.getByTestId(testId).innerText())?.[1]);
    const editorSetsBefore = await setsOf('routine-day-stats');

    // The routine detail answers the WEEK too, not only the open day tab — and it answers it from
    // the same unsaved edit state, so an edit that guts the plan says so before it is saved.
    await expect(page.getByTestId('plan-targets')).toBeVisible();
    const weekSetsBefore = await setsOf('plan-targets-summary');
    expect(weekSetsBefore).toBeGreaterThanOrEqual(editorSetsBefore);

    await page.getByRole('button', { name: 'Increase' }).first().click();
    await expect
      .poll(async () => await setsOf('routine-day-stats'))
      .toBe(editorSetsBefore + 1);
    await expect.poll(async () => await setsOf('plan-targets-summary')).toBe(weekSetsBefore + 1);

    // ...and saving survives a reload, which it did not before: Save used to flip a flag and
    // discard every edit.
    await page.getByTestId('routine-save').click();
    await page.reload();
    await expect(page.getByTestId('routine-day-stats')).toBeVisible();
    expect(await setsOf('routine-day-stats')).toBe(editorSetsBefore + 1);

    // The workouts list agrees with the editor — one source of truth for the numbers.
    await page.goto('/routines');
    await expect(page.getByTestId('routine-day-stats-0')).toBeVisible();
    expect(await setsOf('routine-day-stats-0')).toBe(
      Number(/(\d+) sets?/.exec(setsBefore)?.[1]) + 1,
    );
  });
});
