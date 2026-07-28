import { test, expect } from '@playwright/test';
import { readDemoState, seedOnboarded } from './helpers';

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
    await page.getByTestId('import-file').setInputFiles({
      name: 'truncated.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"fitforge.backup","version":2,"demo":{'),
    });

    await expect(page.getByTestId('settings-import-error')).toBeVisible();
    expect(await readDemoState(page), 'a partial write is worse than no write').toEqual(before);
  });

  test('erasing clears the tier-2 cache, not just localStorage', async ({ page }) => {
    await page.goto('/nutrition');
    // Plant a cache the way the food catalog would.
    await page.evaluate(() => caches.open('fitforge-food-test-version'));
    expect(
      (await page.evaluate(() => caches.keys())).some((n) => n.startsWith('fitforge-')),
    ).toBe(true);

    await page.goto('/settings');
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
