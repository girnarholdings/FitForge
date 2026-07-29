/**
 * A SIGNED-IN USER MUST NOT BE ASKED TO BUILD A PLAN THEY ALREADY HAVE.
 *
 * The reported bug, exactly: sign in, get marched through onboarding again. Two causes, both
 * structural rather than cosmetic.
 *
 *   1. The thing that restores an account (CloudSyncDriver) was mounted INSIDE the app shell, and
 *      the shell renders its children only after deciding onboarding is complete. On a device with
 *      an empty local store that decision is always "not complete", so the restorer never mounted.
 *      It now lives in the root layout and runs on every route.
 *
 *   2. The shell's gate read "this browser has no training data" as "this person is new". For a
 *      signed-in visitor those are different statements, separated by a network round trip.
 *
 * These specs pin the routing behaviour, which is where the bug lived. Firestore itself is blocked
 * rather than emulated: what has to be proven is that the app WAITS for the account and cannot be
 * trapped waiting, and both are visible from the routing alone.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded, resetDemo, readDemoState, DEMO_STORAGE_KEY } from './helpers';

const GOOGLE_AUTH = /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|apis\.google\.com/;
const FIRESTORE = /firestore\.googleapis\.com/;

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
    uid: 'restore-uid-1',
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

/**
 * A browser that is signed in and has NEVER completed onboarding — the second-device case, and
 * the exact state the bug fired in.
 */
async function signedInEmptyBrowser(
  page: Page,
  firestore: 'hang' | 'fail',
): Promise<{ firestoreHits: string[] }> {
  // Reach the origin first so localStorage is writable, then clear it completely.
  await resetDemo(page);
  const apiKey = await apiKeyFromBundle(page);
  expect(apiKey, 'this build has a Firebase project').toBeTruthy();

  // Auth stays offline so the restored session survives revalidation (see shell-account.spec).
  await page.context().route(GOOGLE_AUTH, (r) => r.abort());

  const firestoreHits: string[] = [];
  await page.context().route(FIRESTORE, async (route) => {
    firestoreHits.push(route.request().url());
    // 'hang' models a slow network — the restore is genuinely in flight, which is when the app
    // used to jump to conclusions. 'fail' models Firestore being unreachable.
    if (firestore === 'fail') return route.abort();
    await new Promise(() => {});
  });

  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: session(apiKey!) },
  );
  return { firestoreHits };
}

test.describe('cloud restore · a signed-in user on a new device', () => {
  test('waits for the account instead of routing straight into onboarding', async ({ page }) => {
    await signedInEmptyBrowser(page, 'hang');
    await page.goto('/today');

    // THE REGRESSION. This used to redirect to /onboarding/welcome within a frame, because the
    // local store was empty — while the plan was still on its way from Firestore.
    await expect(page.getByTestId('restoring-account')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/today/);

    // And it must stay put while the fetch is genuinely outstanding.
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/today/);
  });

  test('actually asks Firestore for the account', async ({ page }) => {
    // The restorer used to never mount at all on this path, so no request was ever made. Watching
    // for the request proves it is reachable now, independently of what the answer is.
    const { firestoreHits } = await signedInEmptyBrowser(page, 'hang');
    await page.goto('/today');
    await expect(page.getByTestId('restoring-account')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => firestoreHits.length, { timeout: 15000 }).toBeGreaterThan(0);
  });

  test('is released into onboarding when the account cannot be fetched', async ({ page }) => {
    // The other half of the rule: waiting must have an end. A Firestore outage cannot leave
    // someone staring at a spinner with no way into the app.
    await signedInEmptyBrowser(page, 'fail');
    await page.goto('/today');
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 20000 });
  });
});

test.describe('cloud mirror · a finished workout reaches the account', () => {
  test('finishing a session triggers an upload', async ({ page }) => {
    /**
     * The third reported symptom — "the workout is not stored" — and it was true. The mirror
     * subscribed to the demo store only, but finished sessions live in a SEPARATE store
     * (`workoutLog`) with its own listeners. `exportAllState` always included them; nothing ever
     * asked for them to be sent. A workout uploaded only if some unrelated edit happened to fire
     * afterwards, so most of them sat on the device.
     *
     * Firestore is blocked here — the assertion is that the app TRIES, which is precisely what it
     * did not do before.
     */
    await seedOnboarded(page);
    const apiKey = await apiKeyFromBundle(page);
    expect(apiKey, 'this build has a Firebase project').toBeTruthy();
    await page.context().route(GOOGLE_AUTH, (r) => r.abort());

    const writes: string[] = [];
    await page.context().route(FIRESTORE, (route) => {
      writes.push(route.request().url());
      return route.abort();
    });

    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: session(apiKey!) },
    );

    const state = await readDemoState(page);
    const routine = (state as { routine: { days: { id: string; exercises: unknown[] }[] } }).routine;
    const day = routine.days.find((d) => d.exercises.length > 0);
    expect(day, 'the seeded routine has a training day').toBeTruthy();

    await page.goto(`/workout/${day!.id}`);
    await expect(page.getByText(/Exercise \d+ of \d+/)).toBeVisible();

    // Let the sign-in reconcile finish and drain its requests, so what we count afterwards is
    // attributable to the workout rather than to start-up.
    await expect.poll(() => writes.length, { timeout: 20000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    const beforeWorkout = writes.length;

    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('40');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('10');
    await page.getByRole('button', { name: /Mark set 1/ }).first().click();

    for (let i = 0; i < 12; i++) {
      const finish = page.getByRole('button', { name: 'Finish workout' });
      if (await finish.isVisible().catch(() => false)) {
        await finish.click();
        break;
      }
      await page.getByRole('button', { name: /Next exercise/ }).click();
    }
    await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();

    // The mirror is debounced by 4s; give it room, then require that it fired.
    await expect
      .poll(() => writes.length, { timeout: 20000 })
      .toBeGreaterThan(beforeWorkout);
  });
});

test.describe('cloud restore · everyone else is unaffected', () => {
  test('a signed-out empty browser still goes straight to onboarding', async ({ page }) => {
    await resetDemo(page);
    await page.goto('/today');
    await page.waitForURL(/\/onboarding\/welcome/);
    // No account, so nothing to wait for — the wait state must never appear here.
    await expect(page.getByTestId('restoring-account')).toHaveCount(0);
  });

  test('an onboarded browser opens the app without a restore gate', async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/today');
    await expect(page.getByTestId('mode-chip')).toBeVisible();
    await expect(page).toHaveURL(/\/today/);
  });

  test('a finished-looking store does NOT eject someone from the wizard', async ({ page }) => {
    /**
     * The trap this guards. Onboarding writes `completedAt` on the plan-preview screen, BEFORE the
     * user presses "Start plan" — so the obvious way to write the escape hatch above ("leave
     * onboarding once the store says onboarding is done") throws people out one screen early,
     * mid-review of the plan that was just built for them.
     *
     * It is not hypothetical: the first version keyed on exactly that, and the onboarding walk
     * broke instantly. The escape hatch is keyed on a real cloud pull instead, and this pins the
     * difference so it cannot be "simplified" back.
     */
    await resetDemo(page);
    await page.goto('/onboarding/welcome');
    await expect(page.getByTestId('onboarding-name')).toBeVisible();

    await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      const state = raw ? JSON.parse(raw) : {};
      state.completedAt = new Date().toISOString();
      window.localStorage.setItem(key, JSON.stringify(state));
    }, DEMO_STORAGE_KEY);

    await page.goto('/onboarding/goals');
    await expect(page.getByTestId('onboarding-scroll')).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(page, 'the wizard kept the user on the step they were answering').toHaveURL(
      /\/onboarding\/goals/,
    );
  });
});
