import { test, expect } from '@playwright/test';
import { resetDemo, readDemoState, seedOnboarded } from './helpers';

test.describe('persistence', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('completed state survives a reload; reset clears it', async ({ page }) => {
    await seedOnboarded(page);

    // State written on finish.
    let state = await readDemoState(page);
    expect((state as { completedAt: string | null }).completedAt).toBeTruthy();
    const kcal = (state as { targets: { kcal_target: number } }).targets.kcal_target;
    expect(kcal).toBeGreaterThan(0);

    // Reload Today — the generated plan + targets persist.
    await page.goto('/today');
    await page.reload();
    await expect(page.getByText(new RegExp(`Your target is ${kcal} kcal`))).toBeVisible();

    state = await readDemoState(page);
    expect((state as { routine: unknown }).routine).toBeTruthy();

    // Start over via Settings → Erase Local Mode data (§5.1).
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Erase Local Mode data' }).click();
    await page.getByRole('button', { name: 'Yes, erase everything' }).click();

    // Routed back to the landing page and storage cleared.
    await page.waitForURL(/\/$|\/index\.html$/);
    const cleared = await readDemoState(page);
    expect(cleared).toBeNull();
  });
});
