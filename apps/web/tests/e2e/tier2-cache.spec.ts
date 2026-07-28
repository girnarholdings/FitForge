import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded } from './helpers';

/**
 * TIER-2 SHARD CACHING — measured by counting network requests, not by trusting the code.
 *
 * The persistent cache is the difference between food search costing a round trip on every visit
 * and costing one ever. "The code calls caches.put" is not evidence of that; the only evidence is
 * that the SECOND visit does not go to the network.
 *
 * These specs require the tier-2 catalog to exist under `apps/web/public/food`, which is a build
 * artefact (see .gitignore). Build it before running:
 *
 *     npm run food:import:fixture -w @fitforge/seed
 *     NEXT_PUBLIC_BASE_PATH="" NEXT_PUBLIC_DEMO=1 npm run build -w @fitforge/web
 *
 * When it is absent every test here SKIPS rather than fails: a missing tier 2 is a legitimate
 * deployment state the app is built to tolerate, so its absence must not read as a broken cache.
 */

test.use({ viewport: { width: 390, height: 664 } });

/** Shard/manifest requests the browser actually put on the wire. */
function trackFoodRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/\/food\/[^/]+\.json(\?|$)/.test(u)) urls.push(u);
  });
  return urls;
}

async function tier2Present(page: Page): Promise<boolean> {
  const res = await page.request.get('/food/manifest.json');
  return res.ok();
}

/**
 * Open the food picker and search — the ONLY path in the product that consults tier 2.
 *
 * The composer does not: it runs the deterministic parser over the curated tier-1 index. Driving
 * the composer instead (as an earlier version of this spec did) exercises no shard fetch at all
 * and the cache assertions pass vacuously.
 */
async function searchInPicker(page: Page, query: string): Promise<void> {
  await page.getByRole('button', { name: /search the food list|add food/i }).first().click();
  const box = page.getByLabel('Search foods');
  await expect(box).toBeVisible();
  await box.fill(query);
  // The picker debounces at 60 ms and races tier 2 against a short budget; this is comfortably
  // past both without being a blind sleep of arbitrary length.
  await page.waitForTimeout(900);
}

test.describe('tier-2 shard cache', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('the manifest is fetched and reports a catalog', async ({ page }) => {
    test.skip(!(await tier2Present(page)), 'no tier-2 catalog built');
    const res = await page.request.get('/food/manifest.json');
    const manifest = (await res.json()) as { total: number; version: string; shards: object };
    expect(manifest.total).toBeGreaterThan(0);
    // The version is what names the cache; a date-only value would collide across same-day builds.
    expect(manifest.version, 'version must be per-build, not per-day').toMatch(/T\d\d:\d\d/);
    expect(Object.keys(manifest.shards).length).toBeGreaterThan(0);
  });

  test('a shard is fetched once, then served from the Cache API on a fresh page load', async ({
    page,
  }) => {
    test.skip(!(await tier2Present(page)), 'no tier-2 catalog built');

    // Pick a real shard key from the manifest so this does not depend on which foods exist.
    const manifest = (await (await page.request.get('/food/manifest.json')).json()) as {
      shards: Record<string, number>;
    };
    const key = Object.keys(manifest.shards).find((k) => k !== '_');
    expect(key, 'expected at least one usable shard').toBeTruthy();

    const first = trackFoodRequests(page);
    await page.goto('/nutrition');
    // Driven through the UI on purpose. Fetching the shard by hand would prove the file is
    // reachable and nothing about whether the APP's cache path is the one being exercised.
    await searchInPicker(page, key!);
    const firstCount = first.filter((u) => u.includes(`/food/${key}.json`)).length;
    expect(firstCount, 'first visit must go to the network for the shard').toBeGreaterThan(0);

    // SECOND VISIT, same browser context — the Cache API persists across navigations.
    const second = trackFoodRequests(page);
    second.length = 0;
    await page.goto('/nutrition');
    await searchInPicker(page, key!);
    const secondCount = second.filter((u) => u.includes(`/food/${key}.json`)).length;

    expect(
      secondCount,
      'second visit must be served from the Cache API, not the network',
    ).toBe(0);
  });

  test('the cache is named after the catalog build, so a rebuild invalidates it', async ({
    page,
  }) => {
    test.skip(!(await tier2Present(page)), 'no tier-2 catalog built');

    await page.goto('/nutrition');
    await searchInPicker(page, 'ap');

    const names = await page.evaluate(() => caches.keys());
    const foodCaches = names.filter((n) => n.startsWith('fitforge-food-'));
    expect(foodCaches.length, 'a versioned food cache must exist').toBeGreaterThan(0);

    const manifest = (await (await page.request.get('/food/manifest.json')).json()) as {
      version: string;
    };
    // The name must carry THIS build's version — that is the whole invalidation mechanism.
    expect(foodCaches.some((n) => n === `fitforge-food-${manifest.version}`)).toBe(true);
  });

  test('a cache from an older build is evicted rather than left to accumulate', async ({
    page,
  }) => {
    test.skip(!(await tier2Present(page)), 'no tier-2 catalog built');

    // Plant a cache as though a previous build had left one behind.
    await page.goto('/nutrition');
    await page.evaluate(() => caches.open('fitforge-food-1999-01-01T00:00:00.000Z'));
    expect(
      (await page.evaluate(() => caches.keys())).some((n) => n.includes('1999')),
      'the stale cache should exist before the app runs',
    ).toBe(true);

    // Reload and touch tier 2 — eviction runs on the first shard read.
    await page.goto('/nutrition');
    await searchInPicker(page, 'ap');

    const after = await page.evaluate(() => caches.keys());
    expect(
      after.some((n) => n.includes('1999')),
      'a cache from an older catalog build must be deleted',
    ).toBe(false);
  });
});
