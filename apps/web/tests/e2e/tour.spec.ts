import { test, expect, type Page } from '@playwright/test';
import {
  resetDemo,
  completeOnboarding,
  readDemoState,
  bareCompletedState,
  pageOverflow,
  DEMO_STORAGE_KEY,
  dismissViaScrim,
  openSettings
} from './helpers';

/**
 * FIRST-RUN TOUR (`components/features/today/FirstRunTour.tsx`) — the SPOTLIGHT rebuild.
 *
 * This is the ONE spec that lets the tour open — `completeOnboarding()` dismisses it everywhere
 * else, because it is a modal over the screen most specs go on to interact with.
 *
 * Three properties carry the feature:
 *
 *   · SKIPPABLE — an escape exists at every stop, from the first frame, and *every* way out
 *     persists `tourSeenAt` (Escape and the scrim included). A close path that does not write is
 *     exactly how a first-run tour becomes a recurring one.
 *   · IT POINTS AT REAL THINGS — each stop cuts a spotlight over the live element it explains
 *     (`[data-tour]` anchors), so the specs assert the cutout actually lands on the element
 *     rather than trusting the copy.
 *   · NEVER TWICE — reloads stay quiet after any dismissal.
 */

/**
 * Land on `/today` as a completed user whose tour is still owed.
 *
 * The seed happens on `/` (where `resetDemo` already left us) — NOT on a first `/today` visit.
 * Visiting `/today` with an empty store starts a client redirect into onboarding, and on a
 * Firebase-configured build the auth `loading` state delays that redirect just enough for it to
 * land AFTER this function had seeded the store — at which point the onboarding wizard's own
 * writes clobber the seeded `completedAt` and the second `/today` visit bounces straight back to
 * the welcome screen. The landing page neither redirects nor writes, so it is where to seed.
 */
async function armTourAndVisitToday(page: Page): Promise<void> {
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

/** The spotlight's cutout rect, read straight out of the overlay's SVG mask. */
async function cutoutRect(page: Page): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return page.evaluate(() => {
    const r = document.querySelector('[data-testid="first-run-tour"] mask rect[fill="black"]');
    if (!r) return null;
    return {
      x: parseFloat(r.getAttribute('x') ?? '0'),
      y: parseFloat(r.getAttribute('y') ?? '0'),
      w: parseFloat(r.getAttribute('width') ?? '0'),
      h: parseFloat(r.getAttribute('height') ?? '0'),
    };
  });
}

test.describe('first-run tour', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('opens on the first landing on /today and spotlights the real session card', async ({ page }) => {
    await completeOnboarding(page, { keepTour: true });

    await expect(tour(page)).toBeVisible();
    await expect(page.getByTestId('tour-step-1')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('1 of 5');
    await expect(page.getByTestId('tour-step-1')).toContainText('Start workout');

    // THE POINT OF THE REBUILD: the first stop's cutout lands ON the live session card — the
    // element itself, not a drawing of it. Compared with tolerance for the spotlight padding.
    const cut = await cutoutRect(page);
    expect(cut, 'step 1 must cut a spotlight').not.toBeNull();
    const card = await page.locator('[data-tour="today-card"]:visible').first().boundingBox();
    expect(card).not.toBeNull();
    expect(Math.abs(cut!.y - (card!.y - 8))).toBeLessThanOrEqual(2);
    expect(Math.abs(cut!.h - (card!.height + 16))).toBeLessThanOrEqual(4);

    // An escape exists from the very first frame.
    await expect(page.getByTestId('tour-skip')).toBeVisible();
  });

  test('walks all five stops forward and back, then finishes', async ({ page }) => {
    await armTourAndVisitToday(page);
    await expect(page.getByTestId('tour-step-1')).toBeVisible();

    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-2')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('2 of 5');
    await expect(page.getByTestId('tour-step-2')).toContainText('how you slept');

    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-3')).toBeVisible();
    await expect(page.getByTestId('tour-step-3')).toContainText('Nutrition');

    // The tab-bar stop still names all five destinations AT ONCE — the one genuine strength of
    // the old drawn map, kept: the whole pill is highlighted and the tooltip is the legend.
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-4')).toBeVisible();
    for (const label of ['Today', 'Workouts', 'Exercises', 'Nutrition', 'Progress']) {
      await expect(
        page.getByTestId('tour-step-4').getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }

    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-5')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('5 of 5');
    // The two destinations NOT in the bottom bar are accounted for, and Local Mode is stated
    // where it can still be acted on.
    await expect(page.getByTestId('tour-step-5')).toContainText(
      'Settings and Coach live in the bar at the top',
    );
    await expect(page.getByTestId('tour-step-5')).toContainText('this browser only');
    // The last stop swaps Next for the finish control.
    await expect(page.getByTestId('tour-next')).toHaveCount(0);

    // Back is real navigation, not a re-open.
    await page.getByTestId('tour-back').click();
    await expect(page.getByTestId('tour-step-4')).toBeVisible();
    await expect(page.getByTestId('tour-progress')).toHaveText('4 of 5');
    // Stop 1 has no Back — there is nowhere behind it.
    await page.getByTestId('tour-back').click();
    await page.getByTestId('tour-back').click();
    await page.getByTestId('tour-back').click();
    await expect(page.getByTestId('tour-step-1')).toBeVisible();
    await expect(page.getByTestId('tour-back')).toHaveCount(0);

    for (let i = 0; i < 4; i++) await page.getByTestId('tour-next').click();
    await page.getByTestId('tour-finish').click();
    await expect(tour(page)).toBeHidden();

    const state = await readDemoState(page);
    expect(typeof state?.tourSeenAt, 'finishing must stamp tourSeenAt').toBe('string');
  });

  test('the spotlight moves between stops — the tab-bar stop highlights the pill itself', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await armTourAndVisitToday(page);
    await expect(page.getByTestId('tour-step-1')).toBeVisible();
    const first = await cutoutRect(page);

    for (let i = 0; i < 3; i++) await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-4')).toBeVisible();

    const tabCut = await cutoutRect(page);
    expect(tabCut, 'the tab-bar stop must cut a spotlight').not.toBeNull();
    expect(tabCut!.y).not.toBe(first?.y);
    // The pill sits at the bottom of a 664px viewport; its spotlight must too.
    expect(tabCut!.y).toBeGreaterThan(664 / 2);
    const pill = await page.locator('[data-tour="tab-bar"]:visible').first().boundingBox();
    expect(pill).not.toBeNull();
    expect(Math.abs(tabCut!.y - (pill!.y - 8))).toBeLessThanOrEqual(2);
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
          for (let i = 0; i < 4; i++) await p.getByTestId('tour-next').click();
          await p.getByTestId('tour-finish').click();
        },
      },
      { label: 'escape', run: async (p) => p.keyboard.press('Escape') },
      // The scrim is an `aria-label="Close"` button covering the dimmed area; tapping outside
      // the tooltip is the most natural dismissal on a phone and the easiest to forget to wire.
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

  test('fits a 390×664 screen: no horizontal overflow, and every tooltip stays inside the viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await armTourAndVisitToday(page);
    await expect(tour(page)).toBeVisible();

    for (const step of [1, 2, 3, 4, 5]) {
      const card = page.getByTestId(`tour-step-${step}`);
      await expect(card).toBeVisible();

      const overflow = await pageOverflow(page);
      expect(overflow.horizontal, `stop ${step} overflows sideways`).toBeLessThanOrEqual(1);

      // The tooltip is positioned beside a moving spotlight — the failure mode is a card shoved
      // off the bottom of a short phone, which no page-level overflow check would notice.
      const box = await card.boundingBox();
      expect(box, `stop ${step} tooltip must render`).not.toBeNull();
      expect(box!.y, `stop ${step} tooltip starts above the viewport`).toBeGreaterThanOrEqual(0);
      expect(
        box!.y + box!.height,
        `stop ${step} tooltip runs off the bottom`,
      ).toBeLessThanOrEqual(664 + 1);

      if (step < 5) await page.getByTestId('tour-next').click();
    }
  });

  test('Settings → "Replay the app tour" brings it back over Today', async ({ page }) => {
    await completeOnboarding(page); // dismisses the tour on the way through
    expect(typeof (await readDemoState(page))?.tourSeenAt).toBe('string');

    await page.goto('/settings');
    await openSettings(page);
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

    // Seed on `/` (post-resetDemo), for the same clobber-race reason as armTourAndVisitToday.
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
    await openSettings(page);
    await page.setInputFiles('[data-testid="import-file"]', {
      name: 'fitforge-pre-tour-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    // The confirm step: a pre-tour file is a full restore, so overwrite.
    await page.getByTestId('import-overwrite').click();

    // A successful import navigates to /today; a rejected one stays put and renders the reason.
    await page.waitForURL(/\/today/);
    await expect(page.getByTestId('settings-import-error')).toHaveCount(0);
    // …and because the restored state genuinely has no `tourSeenAt`, that user is owed the tour.
    await expect(tour(page)).toBeVisible();
  });
});
