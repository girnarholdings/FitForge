/**
 * THE FIRST TEN SECONDS — how fast a stranger gets from a link to a question they can answer.
 *
 * The reported bug was that signing in with Google felt broken while "continue without signing in"
 * felt fine. Both symptoms were the same mechanism, and neither was in the sign-in code:
 *
 *   · An app route with an empty store loaded that route's whole bundle (224 kB for /today),
 *     hydrated it, discovered there was no plan, and only THEN redirected to onboarding — another
 *     272 kB. Measured on ordinary cellular: 5.7 s before the onboarding CTA was usable.
 *   · While that happened the shell rendered an EMPTY DIV. A blank screen is indistinguishable
 *     from a broken app, and it was the first thing a new user saw.
 *   · Google sign-in landed on `/today` specifically, so it paid the full price every time, while
 *     the Local Mode button beside it went straight to onboarding in ~230 ms. Same app, one door
 *     four seconds slower than the other.
 *
 * These specs pin the three fixes: the early gate (app/layout.tsx) decides before any bundle runs,
 * the shell never renders a void, and neither may fire when the answer is not certain — an
 * onboarded browser and a signed-in one must both be left alone.
 */
import { test, expect } from '@playwright/test';
import {
  resetDemo,
  seedOnboarded,
  firebaseApiKey,
  fakeGoogleSession,
  DEMO_STORAGE_KEY,
} from './helpers';

const GOOGLE_AUTH = /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|apis\.google\.com/;
const FIRESTORE = /firestore\.googleapis\.com/;

test.describe('onboarding entry · the first paint', () => {
  test('a stranger deep-linked into the app never renders the app they cannot use', async ({
    page,
  }) => {
    await resetDemo(page);

    // THE PROOF THAT THE EARLY GATE FIRED: /today's own view must never mount. Before the gate,
    // the whole Today bundle was downloaded, hydrated and thrown away — this asserts the visitor
    // is redirected on the strength of localStorage alone, before the router exists.
    let todayRendered = false;
    const watch = setInterval(() => {
      void page
        .locator('[data-testid="today-view"]')
        .count()
        .then((n) => {
          if (n > 0) todayRendered = true;
        })
        .catch(() => {});
    }, 30);

    await page.goto('/today');
    await page.waitForURL(/\/onboarding\/welcome/);
    await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
    clearInterval(watch);

    expect(todayRendered, 'the Today screen was rendered before the redirect').toBe(false);
  });

  test('the shell says something while it decides — never an empty screen', async ({ page }) => {
    // The wait is real on a slow connection; what must never happen is that it is SILENT. Firestore
    // is left hanging so the signed-in branch stays on screen long enough to read.
    await resetDemo(page);
    const apiKey = await firebaseApiKey(page);
    expect(apiKey, 'this build has a Firebase project').toBeTruthy();

    await page.context().route(GOOGLE_AUTH, (r) => r.abort());
    await page.context().route(FIRESTORE, async () => {
      await new Promise(() => {});
    });
    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, JSON.stringify(value));
      },
      {
        key: `firebase:authUser:${apiKey}:[DEFAULT]`,
        value: fakeGoogleSession(apiKey!, 'entry-uid-1'),
      },
    );

    await page.goto('/today');

    // Branded, and it names which wait this is rather than showing a bare spinner or nothing.
    const booting = page.getByTestId('shell-booting');
    await expect(booting).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('restoring-account')).toBeVisible();
    await expect(booting).toContainText(/Restoring your training/);
  });
});

test.describe('onboarding entry · the early gate abstains when it cannot be sure', () => {
  test('a signed-in browser is NOT bounced to onboarding — its account may hold a plan', async ({
    page,
  }) => {
    // This is the regression the early gate could most easily cause: a persisted Firebase session
    // means an account might arrive with training, so localStorage being empty proves nothing.
    await resetDemo(page);
    const apiKey = await firebaseApiKey(page);
    await page.context().route(GOOGLE_AUTH, (r) => r.abort());
    await page.context().route(FIRESTORE, async () => {
      await new Promise(() => {});
    });
    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, JSON.stringify(value));
      },
      {
        key: `firebase:authUser:${apiKey}:[DEFAULT]`,
        value: fakeGoogleSession(apiKey!, 'entry-uid-2'),
      },
    );

    await page.goto('/today');
    await expect(page.getByTestId('restoring-account')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);
    await expect(page, 'the early gate must not out-run a pending account').toHaveURL(/\/today/);
  });

  test('an onboarded browser opens the app it was asked for', async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/today');
    await expect(page.getByTestId('today-view')).toBeVisible();
    await expect(page).toHaveURL(/\/today/);
  });

  test('a store it cannot parse is not a store it may act on', async ({ page }) => {
    // Corrupt JSON must fall through to the React gate rather than being read as "new user" — the
    // app's own normalizer is the thing entitled to make that call.
    await resetDemo(page);
    await page.evaluate((key) => window.localStorage.setItem(key, '{ not json'), DEMO_STORAGE_KEY);
    await page.goto('/today');
    // It still ends up in onboarding (the store really is unusable), but via the app, which
    // repairs the state on the way rather than leaving the broken value behind.
    await page.waitForURL(/\/onboarding\/welcome/);
    await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
  });
});
