import { test, expect, type Page } from '@playwright/test';
import { resetDemo, readDemoState, seedOnboarded, WORKOUT_LOG_KEY } from './helpers';

/** The player's crash-belt slice (see `lib/workout/activeSession.ts`). */
const ACTIVE_SESSION_KEY = 'fitforge.activeSession.v1';

/**
 * A LIVE SESSION MUST SURVIVE THE BROWSER. The player used to hold every logged set in React
 * state alone, so a reload or an accidental Back mid-workout silently destroyed the session —
 * on a phone, in a gym, where tab eviction is routine. These specs pin the whole persistence
 * contract: sets and pager position come back after a reload, finishing writes EXACTLY ONE
 * session to the log however many times Finish fires, and the scratch slice is cleared the
 * moment the log owns the sets.
 */
test.describe('workout resume', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await seedOnboarded(page);
  });

  /** The first generated day that can drive the full flow (has exercises to page through). */
  async function trainingDayId(page: Page): Promise<string> {
    const state = await readDemoState(page);
    const routine = (state as {
      routine: { days: { id: string; exercises: unknown[] }[] };
    }).routine;
    const day = routine.days.find((d) => d.exercises.length > 1);
    expect(day, 'generated routine has a day with several exercises').toBeTruthy();
    return day!.id;
  }

  async function logSet(page: Page, n: number): Promise<void> {
    // Bound to the stable testid, NOT the accessible name: the latch's label flips to
    // "Mark set N not done" the moment it closes, so a name-bound locator stops resolving
    // exactly when the assertion needs it.
    const latch = page.getByTestId(`set-latch-${n - 1}`).first();
    await latch.click();
    await expect(latch).toHaveAttribute('aria-pressed', 'true');
    // The auto-started rest timer overlays the dock; skip it so the next tap is unobstructed.
    await page.getByRole('button', { name: 'Skip rest' }).click();
  }

  /** Page forward until Finish is reachable, then press it once. */
  async function walkToFinishAndPress(page: Page): Promise<void> {
    for (let i = 0; i < 12; i++) {
      const finish = page.getByRole('button', { name: 'Finish workout' });
      if (await finish.isVisible().catch(() => false)) {
        await finish.click();
        return;
      }
      await page.getByRole('button', { name: /Next exercise/ }).click();
    }
    throw new Error('never reached the Finish button');
  }

  test('a mid-session reload restores every logged set, the pager position, and finishing clears the slice', async ({
    page,
  }) => {
    const dayId = await trainingDayId(page);
    await page.goto(`/workout/${dayId}`);

    // Log two sets on exercise 1 with an athlete-typed weight.
    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('40');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('10');
    await logSet(page, 1);
    await logSet(page, 2);
    await expect(page.getByText(/2\/\d+ sets/)).toBeVisible();

    // Move to exercise 2, so the reload has a pager position to lose.
    await page.getByRole('button', { name: /Next exercise/ }).click();
    await expect(page.getByText(/Exercise 2 of \d+/)).toBeVisible();

    // The scratch slice exists while the session is live.
    const midSession = await page.evaluate((k) => window.localStorage.getItem(k), ACTIVE_SESSION_KEY);
    expect(midSession, 'active-session slice is written mid-session').toBeTruthy();

    // THE FINDING: this reload used to cost the athlete both sets.
    await page.reload();

    // Resumes on the exercise the athlete was looking at, with the counter intact.
    await expect(page.getByText(/Exercise 2 of \d+/)).toBeVisible();
    await expect(page.getByText(/2\/\d+ sets/)).toBeVisible();

    // Both sets are still logged, with the typed weight, back on exercise 1.
    await page.getByRole('button', { name: 'Prev' }).click();
    await expect(page.getByRole('button', { name: /Mark set 1/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: /Mark set 2/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight' })).toHaveValue('40');

    // Finish: exactly one session lands in the log, carrying exactly the two logged sets.
    await walkToFinishAndPress(page);
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();

    const log = (await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as unknown) : null;
    }, WORKOUT_LOG_KEY)) as { sessions: { exercises: { sets: unknown[] }[] }[] } | null;
    expect(log, 'workout log persisted').toBeTruthy();
    expect(log!.sessions.length, 'exactly one finished session').toBe(1);
    expect(
      log!.sessions[0]!.exercises.reduce((n, e) => n + e.sets.length, 0),
      'the finished session holds the two logged sets',
    ).toBe(2);

    // The log owns the sets now — the scratch slice must be gone.
    const after = await page.evaluate((k) => window.localStorage.getItem(k), ACTIVE_SESSION_KEY);
    expect(after, 'active-session slice cleared on finish').toBeNull();
  });

  test('double-dispatched Finish clicks persist exactly one session', async ({ page }) => {
    const dayId = await trainingDayId(page);
    await page.goto(`/workout/${dayId}`);

    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('40');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('10');
    await logSet(page, 1);

    for (let i = 0; i < 12; i++) {
      if (
        await page
          .getByRole('button', { name: 'Finish workout' })
          .isVisible()
          .catch(() => false)
      ) {
        break;
      }
      await page.getByRole('button', { name: /Next exercise/ }).click();
    }

    // Two clicks in ONE task — both dispatch before React can re-render to the summary, which is
    // the exact re-entry a state flag cannot catch (state commits a render too late).
    await page
      .getByRole('button', { name: 'Finish workout' })
      .evaluate((el) => {
        (el as HTMLButtonElement).click();
        (el as HTMLButtonElement).click();
      });

    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();

    const log = (await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as unknown) : null;
    }, WORKOUT_LOG_KEY)) as { sessions: unknown[] } | null;
    expect(log!.sessions.length, 'a double-fired Finish persists one session, not two').toBe(1);

    const active = await page.evaluate((k) => window.localStorage.getItem(k), ACTIVE_SESSION_KEY);
    expect(active).toBeNull();
  });
});
