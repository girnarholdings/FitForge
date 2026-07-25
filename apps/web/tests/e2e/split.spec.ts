import { test, expect } from '@playwright/test';
import { completeOnboarding, readDemoState, resetDemo } from './helpers';

/**
 * WS-5 — the split library step. Picking a real program has to travel all the way through to the
 * generated routine (name + day structure) and be visible/changeable on the Workouts screen.
 */
test.describe('training split', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('picking a split on the new step names and shapes the generated routine', async ({
    page,
  }) => {
    let chosenSlug = '';
    let chosenName = '';

    await completeOnboarding(page, {
      onSplit: async (p) => {
        // The step preselects the best match; deliberately choose a DIFFERENT recommendation so
        // the assertion proves the user's choice was honoured, not the default.
        await expect(p.getByRole('heading', { name: 'Pick your training split' })).toBeVisible();
        await expect(p.getByTestId('split-option-auto')).toBeVisible();

        const cards = p.getByRole('radiogroup', { name: 'Recommended training splits' })
          .getByRole('radio');
        await expect(cards.first()).toBeVisible();
        expect(await cards.count()).toBeGreaterThan(1);

        const target = cards.nth(1);
        chosenSlug = (await target.getAttribute('data-split-slug')) ?? '';
        chosenName = (await target.locator('p.font-semibold').first().innerText()).trim();
        expect(chosenSlug).not.toBe('');

        await target.click();
        await expect(target).toHaveAttribute('aria-checked', 'true');
      },
    });

    // The choice persisted, and the generated routine is named after the program.
    const state = await readDemoState(page);
    const draft = (state as { draft: { split_slug: string | null } }).draft;
    expect(draft.split_slug).toBe(chosenSlug);

    const routine = (state as {
      routine: { name: string; source: string; days: { exercises: unknown[] }[] };
    }).routine;
    expect(routine.source).toBe('generated');
    expect(routine.name).toBe(chosenName);
    expect(routine.days.reduce((n, d) => n + d.exercises.length, 0)).toBeGreaterThan(0);

    // ...and it is surfaced on the Workouts screen as the active split.
    await page.goto('/routines');
    await expect(page.getByTestId('active-split')).toBeVisible();
    await expect(page.getByTestId('active-split-name')).toHaveText(chosenName);

    // The library is reachable from there to change it.
    await page.getByTestId('change-split').click();
    await expect(page.getByTestId('split-library')).toBeVisible();
  });
});
