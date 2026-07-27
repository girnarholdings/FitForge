import { test, expect } from '@playwright/test';
import { resetDemo, completeOnboarding, readDemoState } from './helpers';

/**
 * VOLUME TARGET CALIBRATION.
 *
 * The defect: a muscle reading "Above target" / "Over target" was a diagnosis with no treatment —
 * the app asserted a number, coloured the silhouette red, and offered no way to act. These specs
 * pin the two things that fixes it:
 *
 *   · a calibrated target genuinely RE-PLANS (the status recomputes against it and persists), and
 *   · the advice attached to it is ACTIONABLE — in particular it must not tell someone to drop
 *     sets of a muscle they do no direct work for.
 */
test.describe('weekly volume targets', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
    await page.goto('/exercises');
    await page.getByTestId('exercises-tab-targets').click();
    await expect(page.getByTestId('muscle-volume-bars')).toBeVisible();
  });

  test('every ranked muscle offers a way to tune its target', async ({ page }) => {
    const bars = page.getByTestId('muscle-volume-bars');
    const rows = bars.locator('li');
    const count = await rows.count();
    expect(count).toBeGreaterThan(2);

    // The tune affordance is per-row, not buried behind a settings screen.
    const tuners = page.locator('[data-testid^="muscle-tune-"]');
    expect(await tuners.count()).toBe(count);
  });

  test('calibrating a target re-plans: status recomputes, and it survives a reload', async ({
    page,
  }) => {
    // Target a NAMED muscle, never "the first row": the list is ranked by % of goal, so
    // calibrating re-sorts it and "first" is a different muscle on the way back in.
    await page.getByTestId('muscle-volume-toggle').click();
    await page.getByTestId('muscle-tune-quads').click();

    const preview = page.getByTestId('tuner-preview-status');
    await expect(preview).toBeVisible();
    const before = await preview.innerText();

    // Opening on the recommendation is the honest default.
    await expect(page.getByTestId('tuner-recommendation')).toContainText(/recommendation/i);

    // Push the target to the ceiling — with sets held fixed, the status must move DOWN the scale.
    await page.getByTestId('tuner-slider').fill('30');
    await expect(preview).not.toHaveText(before);
    await expect(preview).toContainText(/Under-trained|Building|On target/);

    await page.getByTestId('tuner-save').click();

    // Persisted as a calibration, not as a re-labelled recommendation.
    const state = await readDemoState(page);
    const targets = (state as { volumeTargets: Record<string, number> }).volumeTargets;
    expect(Object.values(targets)).toContain(30);

    // …and it is still in force after a reload: the row reads against 30, not the recommendation.
    await page.reload();
    await page.getByTestId('exercises-tab-targets').click();
    await page.getByTestId('muscle-volume-toggle').click();
    await expect(page.getByTestId('muscle-volume-row-quads')).toContainText('/30');
  });

  test('"use recommended" clears the calibration rather than freezing today\'s number', async ({
    page,
  }) => {
    // Named muscle again — the ranked list re-sorts after a calibration.
    // Expanding must be IDEMPOTENT: the toggle is a switch, and blindly clicking it a second time
    // collapses the list back and hides the row.
    const openQuads = async () => {
      const toggle = page.getByTestId('muscle-volume-toggle');
      if (/Show all/i.test(await toggle.innerText())) await toggle.click();
      await page.getByTestId('muscle-tune-quads').click();
    };

    await openQuads();
    await page.getByTestId('tuner-slider').fill('29');
    await page.getByTestId('tuner-save').click();

    await openQuads();
    // The reset only appears once a calibration exists.
    await page.getByTestId('tuner-reset').click();

    // The KEY is deleted, so the target keeps tracking the recommendation as the profile changes.
    const state = await readDemoState(page);
    const targets = (state as { volumeTargets: Record<string, number> }).volumeTargets;
    expect(Object.values(targets)).not.toContain(29);
  });

  test('over-target advice never tells you to drop sets you are not doing', async ({ page }) => {
    // Forearms are the canonical case: a normal pulling week piles up indirect credit there
    // without a single direct exercise. "Drop 11 sets" would mean deleting the rows and pull-ups
    // that produced it — so the copy has to say there is nothing to drop.
    const forearms = page.getByTestId('muscle-tune-forearms');
    if ((await forearms.count()) === 0) test.skip(true, 'forearms not in the ranked list');

    // Show every muscle so forearms is definitely rendered.
    const toggle = page.getByTestId('muscle-volume-toggle');
    if (await toggle.isVisible()) await toggle.click();

    await page.getByTestId('muscle-tune-forearms').click();

    const action = page.getByTestId('tuner-action');
    await expect(action).toBeVisible();

    const text = await action.innerText();
    if (/Nothing to drop/i.test(text)) {
      // The honest branch: no direct work, so no instruction to remove any.
      await expect(action).toContainText(/all of it is indirect/i);
      await expect(page.getByTestId('tuner-show-exercises')).toHaveCount(0);
    } else if (/Drop about/i.test(text)) {
      // If it does say "drop", it must be bounded by the DIRECT sets actually being done.
      await expect(action).toContainText(/direct/i);
    }
  });

  test('the evidence behind the numbers is one tap away and cites real sources', async ({
    page,
  }) => {
    await page.locator('[data-testid^="muscle-tune-"]').first().click();
    await page.getByTestId('tuner-evidence-toggle').click();

    const evidence = page.getByTestId('tuner-evidence');
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText(/Pelland/);
    await expect(evidence).toContainText(/Baz-Valle/);
    await expect(evidence).toContainText(/Iversen/);

    // Every citation links out, and the practitioner-tier source is flagged as such rather than
    // presented alongside the meta-analyses as equivalent evidence.
    const links = evidence.locator('a[href^="http"]');
    expect(await links.count()).toBeGreaterThanOrEqual(3);
    await expect(evidence).toContainText(/lower evidence tier/i);
  });
});
