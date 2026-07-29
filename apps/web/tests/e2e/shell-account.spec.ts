/**
 * THE SHELL MUST SAY WHICH MODE YOU ARE ACTUALLY IN.
 *
 * The chip in the top bar is the only place the app states where your data lives, and it said
 * "Local" to everyone — including someone who had just signed in with Google and whose training was
 * being backed up to their account. Stating that wrongly is worse than not stating it.
 *
 * HOW THE SIGNED-IN CASE IS FAKED, and why it is honest: Firebase restores a session from
 * `firebase:authUser:<apiKey>:[DEFAULT]` in localStorage and revalidates it against Google on
 * startup. On a NETWORK failure it deliberately KEEPS the restored user (only a real auth error
 * signs you out — see `reloadAndSetCurrentUserOrClear` in @firebase/auth). Aborting Google's hosts
 * therefore drives the app's own production code path into a genuinely signed-in state, with no
 * test seam in the product and no account required. It is deterministic in CI too, because the
 * abort happens in the browser rather than depending on whether Google is reachable.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded } from './helpers';

/** Google's hosts, blocked so the restored session survives and no test needs real credentials. */
const GOOGLE = /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|apis\.google\.com|firestore\.googleapis\.com/;

/**
 * The Firebase web API key, read out of the served bundle rather than hard-coded — the persistence
 * key is derived from it, and pinning one project into a spec would break every fork.
 * Null on a build with no Firebase project, where these tests do not apply.
 */
async function apiKeyFromBundle(page: Page): Promise<string | null> {
  const html = await (await page.request.get('/today/')).text();
  for (const m of html.matchAll(/\/_next\/[A-Za-z0-9/._-]+\.js/g)) {
    const js = await (await page.request.get(m[0])).text();
    const key = js.match(/AIza[0-9A-Za-z_-]{35}/);
    if (key) return key[0];
  }
  return null;
}

function session(apiKey: string) {
  return {
    uid: 'spec-uid-1',
    email: 'lifter@example.com',
    displayName: 'Kai',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [
      {
        providerId: 'google.com',
        uid: 'g-1',
        displayName: 'Kai',
        email: 'lifter@example.com',
        phoneNumber: null,
        photoURL: null,
      },
    ],
    // Far-future expiry so the SDK does not try to refresh before it has even restored.
    stsTokenManager: {
      refreshToken: 'spec-refresh',
      accessToken: 'spec-access',
      expirationTime: 4102444800000,
    },
    createdAt: '1700000000000',
    lastLoginAt: '1700000000000',
    apiKey,
    appName: '[DEFAULT]',
  };
}

test.describe('shell · which mode you are in', () => {
  test('signed out, the chip says Local and offers no sync', async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/today');
    const chip = page.getByTestId('mode-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-mode', 'local');
    // Nothing to sync to — a button here would be a promise the app cannot keep.
    await expect(page.getByTestId('sync-now')).toHaveCount(0);
  });

  test('signed in, the chip says Google and a sync control appears beside it', async ({ page }) => {
    await seedOnboarded(page);
    const apiKey = await apiKeyFromBundle(page);
    test.skip(!apiKey, 'build has no Firebase project — sign-in cannot happen at all');

    await page.context().route(GOOGLE, (r) => r.abort());
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: session(apiKey!) },
    );
    await page.goto('/today');

    await expect(page.getByTestId('mode-chip')).toHaveAttribute('data-mode', 'google');
    await expect(page.getByTestId('mode-chip')).toContainText(/google/i);
    await expect(page.getByTestId('sync-now')).toBeVisible();

    // Four controls now share a 390px bar: chip, sync, Coach, Settings. None may spill off it.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(overflow).toBeLessThanOrEqual(391);
    for (const id of ['mode-chip', 'sync-now', 'mobile-coach', 'mobile-settings']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, `${id} has no box`).not.toBeNull();
      expect(box!.x + box!.width, `${id} is off screen`).toBeLessThanOrEqual(390);
    }

    // The explainer must describe the account, not Local Mode, and name which account it is.
    await page.getByTestId('mode-chip').click();
    await expect(page.getByTestId('mode-sheet-google')).toContainText('lifter@example.com');
  });

  test('pressing sync says what happened, in words', async ({ page }) => {
    /**
     * A spinner that flashes a colour for two seconds answers "did anything happen", not "did it
     * work" — and it was easy to miss entirely. Pressing sync is a deliberate act with a question
     * behind it, so the answer is written out.
     */
    await seedOnboarded(page);
    const apiKey = await apiKeyFromBundle(page);
    test.skip(!apiKey, 'build has no Firebase project');
    await page.context().route(GOOGLE, (r) => r.abort());
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: session(apiKey!) },
    );
    await page.goto('/today');

    // Nothing narrated until asked: background pushes fire every few seconds while you train, and
    // reporting those would turn the top of the screen into a status log.
    await expect(page.getByTestId('sync-now')).toBeVisible();
    await expect(page.getByTestId('sync-announcement')).toHaveCount(0);

    await page.getByTestId('sync-now').click();
    const announcement = page.getByTestId('sync-announcement');
    await expect(announcement).toBeVisible();
    // Firestore is unreachable here, so it must settle on a REASON rather than on "Syncing…".
    await expect(announcement).toHaveAttribute('data-state', 'error');
    await expect(announcement).not.toHaveText(/^syncing/i);
    // A real sentence, not a shrug.
    expect(((await announcement.textContent()) ?? '').trim().length).toBeGreaterThan(15);
  });

  test('the wordless top-bar buttons can say their names', async ({ page }) => {
    // A phone has no hover at all, so `title` renders nothing there and an icon-only bar is a
    // permanent guessing game. Holding the button is the closest touch equivalent.
    await seedOnboarded(page);
    await page.goto('/today');
    const button = page.getByTestId('mobile-settings');
    await expect(button).toBeVisible();
    const label = page
      .locator('span.group', { has: button })
      .locator('span[aria-hidden]')
      .first();
    await expect(label).toHaveText('Settings');
    expect(await label.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect
      .poll(() => label.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    await page.mouse.up();
  });

  test('the sync button reports the OUTCOME, never a bare acknowledgement', async ({ page }) => {
    await seedOnboarded(page);
    const apiKey = await apiKeyFromBundle(page);
    test.skip(!apiKey, 'build has no Firebase project');

    await page.context().route(GOOGLE, (r) => r.abort());
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: session(apiKey!) },
    );
    await page.goto('/today');

    const sync = page.getByTestId('sync-now');
    await expect(sync).toBeVisible();
    await sync.click();

    // Firestore is blocked here, so the sync CANNOT have succeeded. The first version of this
    // button showed a green tick the moment the call returned, which made a failed sync look
    // exactly like a successful one — the specific thing being guarded against.
    await expect(sync).toHaveAttribute('data-state', 'error');
    // And the reason has to be reachable, not merely hinted at by a colour.
    await page.getByTestId('mode-chip').click();
    await expect(page.getByTestId('mode-sheet-sync-error')).toBeVisible();
  });
});

test.describe('shell · the logo goes home', () => {
  test('tapping the wordmark from another tab returns to Today', async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/exercises');
    await page.getByTestId('logo-home-mobile').click();
    await page.waitForURL(/\/today/);
  });
});
