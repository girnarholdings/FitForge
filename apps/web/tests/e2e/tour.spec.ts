import { test, expect, type Page } from '@playwright/test';
import {
  resetDemo,
  completeOnboarding,
  readDemoState,
  bareCompletedState,
  pageOverflow,
  DEMO_STORAGE_KEY,
  dismissViaScrim,
} from './helpers';

/**
 * FIRST-RUN TOUR (`components/features/today/FirstRunTour.tsx`).
 *
 * This is the ONE spec that lets the tour open — `completeOnboarding()` dismisses it everywhere
 * else, because it is a modal over the screen most specs go on to interact with.
 *
 * Two properties carry the whole feature and are asserted from several directions each:
 *
 *   · SKIPPABLE — there is always an escape, on every screen, from the first frame.
 *   · NEVER TWICE — *every* way out persists `tourSeenAt`, including the ones that are not buttons
 *     on the tour (Escape, the scrim). A close path that does not write is exactly how a first-run
 *     tour becomes a recurring one, and it is invisible until a user complains.
 */

/** Land on `/today` as a completed user whose tour is still owed. */
async function armTourAndVisitToday(page: Page): Promise<void> {
  await page.goto('/today');
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    },
    {
      key: DEMO_STORAGE_KEY,
      value: JSON.stringify({ ...bareCompletedState(), tourSeenAt: null }),
    },
  );
  await page.goto('/today');
}

const tour = (page: Page) => page.getByTestId('first-run-tour');

test.describe('first-run tour', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('opens on the first landing on /today and names all five tabs at once', async ({ page }) => {
    await completeOnboarding(page, { keepTour: true });

    await expect(tour(page)).toBeVisible();
    await expect(page.getByTestId('tour-step-1')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('1 of 3');

    // The whole reason this is a sheet and not a coach-mark tour: one screen, five destinations.
    const step = page.getByTestId('tour-step-1');
    for (const label of ['Today', 'Workouts', 'Exercises', 'Nutrition', 'Progress']) {
      await expect(step.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // …and the two destinations that are NOT in the bottom bar are accounted for, because
    // "what is where" is unanswered if two of the seven are simply missing.
    await expect(step).toContainText('Settings and Coach live in the bar at the top.');

    // An escape exists from the very first frame.
    await expect(page.getByTestId('tour-skip')).toBeVisible();
  });

  test('walks all three screens forward and back, then finishes', async ({ page }) => {
    await armTourAndVisitToday(page);
    await expect(page.getByTestId('tour-step-1')).toBeVisible();

    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-2')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('2 of 3');
    await expect(page.getByTestId('tour-step-2')).toContainText('Start workout');

    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-3')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('3 of 3');
    await expect(page.getByTestId('tour-step-3')).toContainText('this browser only');
    // The last screen swaps Next for the finish control.
    await expect(page.getByTestId('tour-next')).toHaveCount(0);

    // Back is real navigation, not a re-open.
    await page.getByTestId('tour-back').click();
    await expect(page.getByTestId('tour-step-2')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('2 of 3');
    // Screen 1 has no Back — there is nowhere behind it.
    await page.getByTestId('tour-back').click();
    await expect(page.getByTestId('tour-step-1')).toBeVisible();
    await expect(page.getByTestId('tour-back')).toHaveCount(0);

    await page.getByTestId('tour-next').click();
    await page.getByTestId('tour-next').click();
    await page.getByTestId('tour-finish').click();
    await expect(tour(page)).toBeHidden();

    const state = await readDemoState(page);
    expect(typeof state?.tourSeenAt, 'finishing must stamp tourSeenAt').toBe('string');
  });

  test('every dismissal path persists — skip, finish, Escape and the scrim alike', async ({
    page,
  }) => {
    // A dismissal that does NOT persist is invisible until the tour comes back, so each exit is
    // driven separately from a freshly armed state.
    const paths: { label: string; run: (p: Page) => Promise<void> }[] = [
      { label: 'skip', run: async (p) => p.getByTestId('tour-skip').click() },
      {
        label: 'finish',
        run: async (p) => {
          await p.getByTestId('tour-next').click();
          await p.getByTestId('tour-next').click();
          await p.getByTestId('tour-finish').click();
        },
      },
      { label: 'escape', run: async (p) => p.keyboard.press('Escape') },
      // `Sheet` renders its scrim as a button labelled "Close"; tapping outside the panel is the
      // most natural dismissal on a phone and the easiest one to forget to wire up.
      {
        label: 'scrim',
        run: async (p) => dismissViaScrim(p),
      },
    ];

    for (const path of paths) {
      await armTourAndVisitToday(page);
      await expect(tour(page), `${path.label}: tour should be open first`).toBeVisible();
      await path.run(page);
      await expect(tour(page), `${path.label}: tour should close`).toBeHidden();

      const state = await readDemoState(page);
      expect(typeof state?.tourSeenAt, `${path.label} did not persist tourSeenAt`).toBe('string');

      // …and it stays gone across a reload, which is the property a user actually feels.
      await page.reload();
      await expect(page.locator('main')).toBeVisible();
      // A NEGATIVE assertion about a deliberately-delayed dialog needs a real window to be worth
      // anything: asserting "hidden" on the first frame would pass even if the tour were about to
      // open. This is the one place a fixed wait is correct.
      await page.waitForTimeout(700);
      await expect(tour(page), `${path.label}: tour came back after a reload`).toBeHidden();
    }
  });

  test('fits a 390×664 screen: no horizontal overflow, and no screen scrolls inside the sheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await armTourAndVisitToday(page);
    await expect(tour(page)).toBeVisible();

    for (const step of [1, 2, 3]) {
      await expect(page.getByTestId(`tour-step-${step}`)).toBeVisible();

      const overflow = await pageOverflow(page);
      expect(overflow.horizontal, `screen ${step} overflows sideways`).toBeLessThanOrEqual(1);

      // The sheet's own panel is `overflow-y-auto`, so a blown copy budget hides content below the
      // fold WITHOUT showing up in a page-level overflow check. Measure the panel itself.
      const panelOverflow = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="first-run-tour"]')?.parentElement;
        return el ? el.scrollHeight - el.clientHeight : -1;
      });
      expect(panelOverflow, `screen ${step} does not fit the sheet`).toBeLessThanOrEqual(1);

      if (step < 3) await page.getByTestId('tour-next').click();
    }
  });

  test('Settings → "Replay the app tour" brings it back over Today', async ({ page }) => {
    await completeOnboarding(page); // dismisses the tour on the way through
    expect(typeof (await readDemoState(page))?.tourSeenAt).toBe('string');

    await page.goto('/settings');
    await page.getByTestId('settings-replay-tour').click();

    await page.waitForURL(/\/today/);
    await expect(tour(page)).toBeVisible();
    await expect(page.getByTestId('tour-step-1')).toBeVisible();
    expect(
      (await readDemoState(page))?.tourSeenAt,
      'replaying must clear the flag, not merely open the sheet',
    ).toBeNull();
  });

  test('a store with a corrupt tourSeenAt is repaired, not fatal', async ({ page }) => {
    // A hand-edited backup or an older build can put anything in this field. The normalizer must
    // reduce it to "unseen" and Today must still render — no crash, no bail-out screen.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/today');
    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, value);
      },
      {
        key: DEMO_STORAGE_KEY,
        value: JSON.stringify({ ...bareCompletedState(), tourSeenAt: 12345 }),
      },
    );
    await page.goto('/today');

    await expect(tour(page)).toBeVisible();
    expect(errors, '/today threw on a corrupt tourSeenAt').toEqual([]);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('a backup exported before the tour existed still imports', async ({ page }) => {
    // `readStringOrNull` returns null for an ABSENT field without noting an issue, which is the
    // only reason a pre-tour file survives the strict `validateDemoState()` gate on import. If
    // anyone swaps that reader for one that flags absence, this fails and says why.
    await completeOnboarding(page);
    const legacy = { ...bareCompletedState() } as Record<string, unknown>;
    delete legacy.tourSeenAt;

    await page.goto('/settings');
    await page.setInputFiles('[data-testid="import-file"]', {
      name: 'fitforge-pre-tour-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    });

    // A successful import navigates to /today; a rejected one stays put and renders the reason.
    await page.waitForURL(/\/today/);
    await expect(page.getByTestId('settings-import-error')).toHaveCount(0);
    // …and because the restored state genuinely has no `tourSeenAt`, that user is owed the tour.
    await expect(tour(page)).toBeVisible();
  });
});
