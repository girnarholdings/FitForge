/**
 * A FAILED READ MUST NEVER BECOME A WRITE.
 *
 * Found by an audit of the signed-in paths, and the most expensive bug in the app: when the
 * sign-in reconcile could not read `users/{uid}` — a transient Firestore failure, a moment offline
 * — sync released the user into the app (correct: nobody may be trapped on a spinner) and then
 * started mirroring anyway. Four seconds later this device's state, which on a new device is
 * EMPTY, replaced the athlete's entire training history in the cloud. One network wobble, and
 * nothing on screen ever said so.
 *
 * WHY THIS FILE IS SMALL. Firestore's wire protocol is not worth faking: a stub that returns a
 * plausible document does not prove the SDK accepted it, so a green test could mean nothing
 * happened at all. What IS reliable is blocking Firestore and watching what the app does with the
 * failure — which is exactly the shape of this bug. The decision tables behind it (`mayPushToCloud`,
 * `shouldLeaveOnboarding` in lib/auth/reconcileRule.ts) are pure functions with unit tests that
 * cover every combination, including the redirect loop that a successful-but-empty pull caused.
 */
import { test, expect } from '@playwright/test';
import { resetDemo, firebaseApiKey, fakeGoogleSession } from './helpers';

const GOOGLE_AUTH = /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|apis\.google\.com/;
const FIRESTORE = /firestore\.googleapis\.com/;

test.describe('auth integrity', () => {
  test('a Firestore outage at sign-in does not let this device overwrite the account', async ({
    page,
  }) => {
    await resetDemo(page);
    const apiKey = await firebaseApiKey(page);
    expect(apiKey, 'this build has a Firebase project').toBeTruthy();
    await page.context().route(GOOGLE_AUTH, (r) => r.abort());

    // Every Firestore call fails — reads included, which is the precondition for the bug.
    const attempts: { method: string; url: string }[] = [];
    await page.context().route(FIRESTORE, (route) => {
      attempts.push({ method: route.request().method(), url: route.request().url() });
      return route.abort();
    });

    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, JSON.stringify(value));
      },
      {
        key: `firebase:authUser:${apiKey}:[DEFAULT]`,
        value: fakeGoogleSession(apiKey!, 'integrity-uid'),
      },
    );

    await page.goto('/today');
    // Released rather than trapped: the wait has an end even when the account cannot be reached.
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 25000 });

    // Now do what a real person does next — start answering. Every edit the store notifies about
    // schedules a mirror push, so this is when the overwrite used to happen.
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.waitForTimeout(6000); // comfortably past the mirror's 4s debounce

    /**
     * The assertion is about WRITES specifically. Reads are expected and fine — the app is
     * entitled to keep asking for the account. What it is not entitled to do is replace an
     * account it has never managed to read. Firestore's SDK sends mutations to `/Write` or
     * `:commit`; a GET is never a mutation.
     */
    const writes = attempts.filter(
      (a) => a.method !== 'GET' && /\/Write|:commit/i.test(a.url),
    );
    expect(
      writes.map((w) => w.url),
      'this device tried to overwrite an account it could not read',
    ).toHaveLength(0);
  });

  test('the wizard and the app shell never bounce a signed-in user between them', async ({
    page,
  }) => {
    /**
     * The redirect loop, as a smoke test. Its exact trigger needs a successful pull of an
     * un-onboarded account (see the unit tests), but the property worth watching in a real browser
     * is cheap and general: a signed-in user with an empty store must SETTLE somewhere, whatever
     * the account says. A navigation storm here is the symptom every variant of this bug shares.
     */
    await resetDemo(page);
    const apiKey = await firebaseApiKey(page);
    await page.context().route(GOOGLE_AUTH, (r) => r.abort());
    await page.context().route(FIRESTORE, (r) => r.abort());
    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, JSON.stringify(value));
      },
      { key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: fakeGoogleSession(apiKey!, 'loop-uid') },
    );

    const visited: string[] = [];
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) visited.push(new URL(f.url()).pathname);
    });

    await page.goto('/onboarding/welcome');
    await page.waitForTimeout(5000);

    const flips = visited.filter((p) => /\/(today|onboarding)/.test(p)).length;
    expect(flips, `navigation storm: ${visited.slice(0, 12).join(' → ')}`).toBeLessThan(6);
    await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
  });
});
