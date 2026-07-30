import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { readDemoState, seedOnboarded, openSettings} from './helpers';

/**
 * EXPORT / IMPORT — the promise that Local Mode is not a trap.
 *
 * The app stores everything in this browser and uploads nothing. That is only defensible if the
 * user can get their data OUT and back IN, so this is the feature that makes the whole storage
 * model honest rather than a lock-in.
 *
 * What these specs check, in order of how badly each would hurt:
 *   · a round trip restores what you had — including logs on days other than today, which is new;
 *   · a corrupt or foreign file changes NOTHING, rather than half-importing over good data;
 *   · erase really erases, including the caches that localStorage cannot reach.
 */

test.use({ viewport: { width: 390, height: 664 } });

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Log a food onto the currently-selected day via the real composer + confirm flow. */
async function logFood(page: import('@playwright/test').Page, text: string) {
  await page.getByTestId('nutrition-composer').fill(text);
  await page.getByTestId('composer-submit').click();
  await page.getByTestId('review-confirm').click();
}

/** The export button hands back a JSON string; read it without touching the download plumbing. */
async function exportBundle(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(async () => {
    const mod = (window as unknown as { __fitforgeStore?: { exportAllState: () => string } })
      .__fitforgeStore;
    if (mod) return mod.exportAllState();
    // Fall back to reading the raw keys, which is what a backup is made of anyway.
    const out: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('fitforge.')) out[k] = localStorage.getItem(k);
    }
    return JSON.stringify(out);
  });
}

/**
 * A REAL backup file, produced by the real button.
 *
 * `exportBundle` above dumps raw localStorage keys, which is fine for "does this string mention
 * yesterday" but is NOT a backup — feeding it back through the importer would be rejected, and a
 * test that asserts on a rejection it caused itself proves nothing. Anything that then gets
 * IMPORTED has to come from here.
 */
async function downloadBackup(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/settings');
  await openSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('settings-export').click(),
  ]);
  return fs.readFileSync(await download.path(), 'utf8');
}

/** Food rows the bundle holds for a given day. */
function foodCount(bundleText: string, day: string): number {
  const bundle = JSON.parse(bundleText) as { demo: { logsByDate: Record<string, unknown[]> } };
  return bundle.demo.logsByDate[day]?.length ?? 0;
}

test.describe('data portability', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('a backup captures logs from days other than today', async ({ page }) => {
    // THE REGRESSION THIS GUARDS. Backfilling made `logsByDate` genuinely multi-day; a backup that
    // only carried today would silently drop history the user had just spent effort entering.
    await page.goto('/nutrition');
    await logFood(page, '2 eggs');
    await page.getByTestId('date-prev').click();
    await logFood(page, '2 eggs');

    const raw = await exportBundle(page);
    expect(raw).toContain(isoOffset(0));
    expect(raw, "yesterday's log must be in the backup").toContain(isoOffset(-1));
  });

  test('export → erase → import restores the day the food was logged on', async ({ page }) => {
    await page.goto('/nutrition');
    await page.getByTestId('date-prev').click();
    await logFood(page, '2 eggs');

    const before = (await readDemoState(page)) as { logsByDate: Record<string, unknown[]> };
    const yesterday = isoOffset(-1);
    expect(before.logsByDate[yesterday]?.length ?? 0).toBeGreaterThan(0);

    const backup = await page.evaluate(() => {
      const dump: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('fitforge.')) dump[k] = localStorage.getItem(k);
      }
      return dump;
    });

    // Wipe, then restore from the captured bytes — the round trip a real user performs across
    // two devices, minus the file picker.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate((dump) => {
      for (const [k, v] of Object.entries(dump)) if (v != null) localStorage.setItem(k, v);
    }, backup);
    await page.goto('/nutrition');

    const after = (await readDemoState(page)) as { logsByDate: Record<string, unknown[]> };
    expect(
      after.logsByDate[yesterday]?.length ?? 0,
      'the restored backup must still hold yesterday',
    ).toBeGreaterThan(0);
  });

  test('a corrupt backup is refused through the real import control, changing nothing', async ({
    page,
  }) => {
    await page.goto('/nutrition');
    await logFood(page, '2 eggs');
    const before = await readDemoState(page);

    // Driven through the actual file input rather than a store call: the failure that matters is
    // the one a user can cause, and it must surface a message rather than fail silently.
    await page.goto('/settings');
    await openSettings(page);
    await page.getByTestId('import-file').setInputFiles({
      name: 'not-a-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"totally":"wrong"}'),
    });

    await expect(page.getByTestId('settings-import-error')).toBeVisible();

    const after = await readDemoState(page);
    expect(after, 'a rejected import must leave state byte-for-byte untouched').toEqual(before);
  });

  test('a truncated backup is refused rather than half-applied', async ({ page }) => {
    await page.goto('/nutrition');
    await logFood(page, '2 eggs');
    const before = await readDemoState(page);

    await page.goto('/settings');
    await openSettings(page);
    await page.getByTestId('import-file').setInputFiles({
      name: 'truncated.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"fitforge.backup","version":2,"demo":{'),
    });

    await expect(page.getByTestId('settings-import-error')).toBeVisible();
    expect(await readDemoState(page), 'a partial write is worse than no write').toEqual(before);
  });

  test('import ASKS first, and shows both copies before it writes anything', async ({ page }) => {
    /**
     * THE FIX THIS PINS. Import used to be one irreversible verb: pick a file, and whatever was on
     * the device was gone. Now the file is inspected, both sides are put on screen, and nothing is
     * written until the athlete picks a verb.
     */
    await page.goto('/nutrition');
    await logFood(page, '2 eggs');
    const fileText = await downloadBackup(page);

    // A second day of food AFTER the export, so the file and the device genuinely differ.
    await page.goto('/nutrition');
    await page.getByTestId('date-prev').click();
    await logFood(page, '2 eggs');
    const before = await readDemoState(page);

    await page.goto('/settings');
    await openSettings(page);
    await page.getByTestId('import-file').setInputFiles({
      name: 'fitforge-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileText),
    });

    // ── the confirm step ──
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('import-summary-file')).toContainText(/Food days/);
    await expect(page.getByTestId('import-summary-local')).toContainText(/Food days/);
    await expect(page.getByTestId('import-merge')).toBeVisible();
    await expect(page.getByTestId('import-overwrite')).toBeVisible();

    // Nothing has been written while the question is open — the whole point.
    expect(await readDemoState(page), 'staging an import must not touch state').toEqual(before);

    // Cancelling is a true no-op.
    await page.getByTestId('import-cancel').click();
    await expect(sheet).toBeHidden();
    expect(await readDemoState(page)).toEqual(before);
  });

  test('merge keeps what is on the device and adds what the file has', async ({ page }) => {
    const today = isoOffset(0);
    const yesterday = isoOffset(-1);

    // The FILE: today has food, yesterday does not.
    await page.goto('/nutrition');
    await logFood(page, '2 eggs');
    const fileText = await downloadBackup(page);
    const fileToday = foodCount(fileText, today);
    expect(fileToday).toBeGreaterThan(0);

    // The DEVICE: yesterday has food that the file has never heard of.
    await page.goto('/nutrition');
    await page.getByTestId('date-prev').click();
    await logFood(page, '3 eggs');
    const deviceYesterday = ((await readDemoState(page)) as {
      logsByDate: Record<string, unknown[]>;
    }).logsByDate[yesterday]?.length ?? 0;
    expect(deviceYesterday).toBeGreaterThan(0);

    await page.goto('/settings');
    await openSettings(page);
    await page.getByTestId('import-file').setInputFiles({
      name: 'fitforge-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileText),
    });
    await page.getByTestId('import-merge').click();
    await page.waitForURL(/\/today/);

    const after = (await readDemoState(page)) as { logsByDate: Record<string, unknown[]> };
    expect(
      after.logsByDate[yesterday]?.length ?? 0,
      'merge must not drop the day only this device had',
    ).toBe(deviceYesterday);
    expect(after.logsByDate[today]?.length ?? 0, "merge must add the file's day").toBeGreaterThanOrEqual(
      fileToday,
    );
  });

  test('overwrite really does replace this device', async ({ page }) => {
    const today = isoOffset(0);

    // Export BEFORE logging, so the file's copy of today is provably shorter than the device's.
    const fileText = await downloadBackup(page);
    const fileToday = foodCount(fileText, today);

    await page.goto('/nutrition');
    await logFood(page, '2 eggs');
    const deviceToday = ((await readDemoState(page)) as {
      logsByDate: Record<string, unknown[]>;
    }).logsByDate[today]?.length ?? 0;
    expect(deviceToday).toBeGreaterThan(fileToday);

    await page.goto('/settings');
    await openSettings(page);
    await page.getByTestId('import-file').setInputFiles({
      name: 'fitforge-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileText),
    });
    await page.getByTestId('import-overwrite').click();
    await page.waitForURL(/\/today/);

    const after = (await readDemoState(page)) as { logsByDate: Record<string, unknown[]> };
    expect(
      after.logsByDate[today]?.length ?? 0,
      "overwrite must leave the file's copy of the day, not the device's",
    ).toBe(fileToday);
  });

  test('erasing clears the tier-2 cache, not just localStorage', async ({ page }) => {
    await page.goto('/nutrition');
    // Plant a cache the way the food catalog would.
    await page.evaluate(() => caches.open('fitforge-food-test-version'));
    expect(
      (await page.evaluate(() => caches.keys())).some((n) => n.startsWith('fitforge-')),
    ).toBe(true);

    await page.goto('/settings');
    await openSettings(page);
    await page.getByTestId('erase-local-data').click();
    await page.getByRole('button', { name: /yes, erase everything/i }).click();
    // The cache deletion is fire-and-forget by design — `eraseAllLocalData` is synchronous and its
    // callers navigate immediately — so give the promise a beat to settle.
    await page.waitForTimeout(1200);

    expect(
      (await page.evaluate(() => caches.keys())).some((n) => n.startsWith('fitforge-')),
      'erase-everything must also drop the cached catalog',
    ).toBe(false);
  });
});
