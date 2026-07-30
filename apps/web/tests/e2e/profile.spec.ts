import { test, expect } from '@playwright/test';
import { seedOnboarded, signInFakeUser, openSettings } from './helpers';

/**
 * THE PROFILE SCREEN — identity first, controls behind a door.
 *
 * `/settings` used to open as nineteen sections of knobs under the word "Settings", which made the
 * two questions people actually arrive with — "am I signed in / is my training backed up?" and "what
 * plan am I on?" — the last two things they could answer. It now opens as a profile card and keeps
 * everything editable behind one disclosure.
 *
 * These specs hold the three properties that make that a fix rather than a reshuffle: the card states
 * the RELEVANT facts for the mode you are in, the controls are genuinely out of the way until asked
 * for, and identity is rendered exactly once.
 */

test.use({ viewport: { width: 390, height: 780 } });

test.describe('profile screen', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('opens with the profile, not with a wall of settings', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    const card = page.getByTestId('profile-card');
    await expect(card).toBeVisible();

    // The training, at a glance — the facts that used to require scrolling past every control.
    await expect(page.getByTestId('profile-goal')).not.toBeEmpty();
    await expect(page.getByTestId('profile-plan')).not.toBeEmpty();
    await expect(page.getByTestId('profile-days')).toContainText(/a week|—/);
    await expect(page.getByTestId('profile-workouts')).toContainText(/^\d+$/);

    // And the controls are actually away, not merely lower down: nothing from the settings body is
    // in the DOM until the disclosure is opened.
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    for (const id of ['settings-import', 'erase-local-data', 'settings-display-name']) {
      await expect(page.getByTestId(id), `${id} must be behind the disclosure`).toHaveCount(0);
    }
    const toggle = page.getByTestId('settings-open');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('the Settings button opens, closes, and survives a reload', async ({ page }) => {
    await page.goto('/settings');
    const toggle = page.getByTestId('settings-open');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await expect(page.getByTestId('settings-display-name')).toBeVisible();

    /* Reload with it open. The state lives in sessionStorage — a tab's lifetime is the right
       lifetime for a disclosure, and refreshing mid-edit should not throw you back to the card. */
    await page.reload();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await expect(page.getByTestId('settings-open')).toHaveAttribute('aria-expanded', 'true');

    await page.getByTestId('settings-open').click();
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
  });

  test('in Local Mode the card is about you, and says what having no account costs', async ({
    page,
  }) => {
    await page.goto('/settings');

    // Identity, not an advertisement. The signed-out AccountCard leads with a four-line pitch for
    // accounts; a profile card whose first words sell you something tells you nothing about yourself.
    await expect(page.getByTestId('profile-local-identity')).toContainText(/Local Mode/i);
    await expect(page.getByTestId('profile-mode-note')).toContainText(/no account yet/i);
    // The trade-off is stated where it can still be acted on.
    await expect(page.getByTestId('profile-mode-note')).toContainText(/erases your training/i);

    // The Local Mode data controls still exist — one door away.
    await openSettings(page);
    await expect(page.getByTestId('settings-export')).toBeVisible();
    await expect(page.getByTestId('erase-local-data')).toContainText(/Erase Local Mode data/);
  });

  test('the top-right control is a profile dropdown that toggles — open, and CLOSED AGAIN', async ({
    page,
  }) => {
    /* The owner's exact complaint about the old gear: "the settings button does not collapse
       back if you hit it again." It was a plain link, so a second tap on /settings did nothing.
       It is a menu now, and every tap must answer. */
    await page.goto('/today');
    const control = page.getByTestId('mobile-settings');
    await expect(control).toHaveAttribute('aria-haspopup', 'menu');
    await expect(control).toHaveAttribute('aria-expanded', 'false');

    await control.click();
    await expect(page.getByTestId('profile-menu')).toBeVisible();
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    // Identity leads: the menu says who you are and where the data lives before it offers links.
    await expect(page.getByTestId('profile-menu')).toContainText(/Local Mode/i);

    // THE FIX: hitting it again collapses it.
    await control.click();
    await expect(page.getByTestId('profile-menu')).toHaveCount(0);
    await expect(control).toHaveAttribute('aria-expanded', 'false');

    // Escape and outside taps also close it — a dropdown that only its own button can dismiss
    // is a modal wearing a menu's clothes.
    await control.click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('profile-menu')).toHaveCount(0);
    await control.click();
    // A point genuinely outside the 240px panel (the heading's CENTER sits under it at 390px,
    // which is a fact about the click target, not about the menu).
    await page.mouse.click(20, 400);
    await expect(page.getByTestId('profile-menu')).toHaveCount(0);

    // And the menu still reaches the profile screen in two taps.
    await control.click();
    await page.getByTestId('profile-menu-settings').click();
    await page.waitForURL(/\/settings/);
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  });

  test("Today's body-weight Add lands on the WEIGHT tab, not on Trends", async ({ page }) => {
    await page.goto('/today');
    // The ledger's Add action promises weight logging; dumping the athlete on Trends to hunt for
    // a second tap breaks that promise.
    // A LINK, not a button: navigation CTAs stopped nesting <button> inside <a> (invalid HTML,
    // double tab stops) — the control is one real anchor wearing the button's dress now.
    await page.getByRole('link', { name: /^Add/ }).click();
    // The static host serves directories, so the URL lands with a trailing slash.
    await page.waitForURL(/\/progress\/?\?tab=weight/);
    await expect(page.getByTestId('progress-tab-weight')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('progress-tab-trends')).toHaveAttribute('aria-pressed', 'false');
  });

  test('signed in, identity is rendered once and the local-only warning is gone', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const signedIn = await signInFakeUser(page, 'profile-uid-1');
    test.skip(!signedIn, 'build has no Firebase project — there is no signed-in state to test');

    await page.getByTestId('mobile-settings').click(); // opens the profile dropdown
    await page.getByTestId('profile-menu-settings').click();
    await page.waitForURL(/\/settings/);

    // The account block is IN the profile card, and there is exactly one of it. The settings body
    // used to carry its own copy, which meant two places able to disagree about whether you are
    // signed in, and two "Sign out" buttons a scroll apart.
    await expect(page.getByTestId('profile-card').getByTestId('account-signed-in')).toBeVisible();
    await openSettings(page);
    await expect(page.getByTestId('account-signed-in')).toHaveCount(1);
    await expect(page.getByTestId('signout')).toHaveCount(1);

    // A signed-in athlete is not warned about having no account.
    await expect(page.getByTestId('profile-mode-note')).toHaveCount(0);
    await expect(page.getByTestId('profile-local-identity')).toHaveCount(0);
  });
});
