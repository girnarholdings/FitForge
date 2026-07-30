import { test, expect, type Page } from '@playwright/test';
import { readDemoState, seedOnboarded, openSettings } from './helpers';

/**
 * STORAGE AT QUOTA — the two silent-loss paths, made loud.
 *
 * Local Mode's whole promise is "everything lives in this browser". At quota that promise breaks
 * in the worst possible way: `setItem` throws, the stores keep serving their in-memory copy, and
 * the UI happily confirms a food log (or an import) that never reached disk. The user discovers
 * the gap on reload, long after the meal they can no longer remember.
 *
 * What these specs pin:
 *   · logging a food that cannot persist still shows the row (the session keeps working) but ALSO
 *     shows the plain-voice "storage is full" warning — and truly writes nothing;
 *   · an import that cannot persist REFUSES to claim success: no navigation, an error that says
 *     nothing was changed, and prior data byte-for-byte intact.
 */

test.use({ viewport: { width: 390, height: 664 } });

/**
 * Make every `fitforge.*` localStorage write throw, as a full disk does.
 *
 * Installed as an init script so it survives navigations; scoped to the app's own keys so
 * framework bookkeeping (Next's sessionStorage scroll state) stays out of the blast radius —
 * the finding under test is the app's writes, not the router's.
 */
async function simulateQuotaExceeded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('fitforge.')) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
}

/** Log a food onto the currently-selected day via the real composer + confirm flow. */
async function logFood(page: Page, text: string) {
  await page.getByTestId('nutrition-composer').fill(text);
  await page.getByTestId('composer-submit').click();
  await page.getByTestId('review-confirm').click();
}

test.describe('storage at quota', () => {
  test('logging a food that cannot persist shows the storage-full warning, not silent loss', async ({
    page,
  }) => {
    await seedOnboarded(page);
    await simulateQuotaExceeded(page);
    await page.goto('/nutrition');
    const before = await readDemoState(page);

    // Nothing is claiming trouble before a write actually fails.
    await expect(page.getByTestId('storage-full-banner')).toHaveCount(0);

    await logFood(page, '2 eggs');

    // The session keeps working — the row renders from the in-memory store...
    await expect(page.getByText(/Egg, whole/i).first()).toBeVisible();

    // ...but the user is TOLD, in plain words, that it did not save to this browser.
    const banner = page.getByTestId('storage-full-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/storage is full/i);
    await expect(banner).toContainText(/didn.t save/i);

    // And the warning is honest: the disk really holds exactly what it held before.
    expect(
      await readDemoState(page),
      'a failed write must leave the persisted state untouched',
    ).toEqual(before);
  });

  test('an import that cannot persist refuses success and changes nothing', async ({ page }) => {
    await seedOnboarded(page);

    // A shape-valid backup that DIFFERS from the device (an extra weigh-in), built from the real
    // persisted state so the strict import validator accepts it — the failure under test must be
    // quota, not shape.
    const state = (await readDemoState(page)) as Record<string, unknown>;
    const fileText = JSON.stringify({
      format: 'fitforge.backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      demo: { ...state, weights: [{ date: '2020-01-01', kg: 77 }] },
      workoutLog: { version: 1, sessions: [] },
      extras: {},
    });
    const before = await readDemoState(page);

    await simulateQuotaExceeded(page);
    await page.goto('/settings');
    await openSettings(page);
    await page.getByTestId('import-file').setInputFiles({
      name: 'fitforge-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileText),
    });

    // Inspection writes nothing, so the confirm sheet appears even with storage full.
    await expect(page.getByTestId('import-overwrite')).toBeVisible();
    await page.getByTestId('import-overwrite').click();

    // Refusal, in words: the error names the cause and states that nothing was changed.
    const error = page.getByTestId('settings-import-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/storage is full/i);
    await expect(error).toContainText(/Nothing was changed/);

    // No success theatre: the import flow navigates to /today only when it actually applied.
    await expect(page).toHaveURL(/\/settings/);

    // "Nothing was changed" is literal — reload (a fresh read of the disk) shows the old data,
    // and the file's weigh-in is nowhere.
    await page.reload();
    const after = await readDemoState(page);
    expect(after).toEqual(before);
    expect(JSON.stringify(after), "the file's weigh-in must not have landed").not.toContain(
      '2020-01-01',
    );
  });
});
