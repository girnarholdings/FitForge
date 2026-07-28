import { test, expect } from '@playwright/test';
import { resetDemo, readDemoState, seedOnboarded } from './helpers';

test.describe('workout', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('player renders exercises, logs sets, advances, and finishes', async ({ page }) => {
    await seedOnboarded(page);

    // Pick the first generated day that actually has exercises so the player never dead-ends.
    const state = await readDemoState(page);
    const routine = (state as {
      routine: { days: { id: string; exercises: unknown[] }[] };
    }).routine;
    const trainingDay = routine.days.find((d) => d.exercises.length > 0);
    expect(trainingDay, 'generated routine has a day with exercises').toBeTruthy();

    await page.goto(`/workout/${trainingDay!.id}`);

    // Exercise pager header.
    await expect(page.getByText(/Exercise \d+ of \d+/)).toBeVisible();
    await expect(page.getByText(/Target \d+ ×/)).toBeVisible();

    // Log the first set: fill weight + reps and mark done.
    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('40');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('10');
    const doneBtn = page.getByRole('button', { name: /Mark set 1/ }).first();
    await doneBtn.click();
    await expect(doneBtn).toHaveAttribute('aria-pressed', 'true');

    // The set counter reflects the logged set.
    await expect(page.getByText(/1\/\d+ sets/)).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/workout.png', fullPage: true });

    // Advance through remaining exercises until we can finish.
    for (let i = 0; i < 12; i++) {
      const finish = page.getByRole('button', { name: 'Finish workout' });
      if (await finish.isVisible().catch(() => false)) {
        await finish.click();
        break;
      }
      const next = page.getByRole('button', { name: /Next exercise/ });
      await next.click();
    }

    // Session summary.
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
    await expect(page.getByText('sets logged')).toBeVisible();
  });
});
