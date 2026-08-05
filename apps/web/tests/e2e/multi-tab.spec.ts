/**
 * TWO TABS, ONE BROWSER — and the second one used to silently undo the first.
 *
 * Every read in the local stores is served from an in-memory cache that was populated once and
 * then only ever updated by THAT tab's own writes. So two tabs each held their own idea of the
 * truth, and whichever wrote last flattened the other: log a session in one, change something in
 * the other, and the second tab's next write — built from its stale snapshot — reverted the first.
 * Signed in, the cloud mirror then uploaded that reverted state, so the loss reached the account.
 *
 * The fix is a `storage` listener in each store: another tab's write drops the cache and notifies
 * subscribers, so the next read comes off disk and the screen re-renders.
 *
 * THESE SPECS ASSERT ON WHAT THE APP RENDERS, deliberately. Reading localStorage back would prove
 * nothing — the bug was never about the bytes on disk, which were always correct; it was about a
 * tab that could not see them. Only a rendered value goes through the cache that was stale.
 */
import { test, expect } from '@playwright/test';
import { seedOnboarded, DEMO_STORAGE_KEY } from './helpers';

const WORKOUT_LOG_KEY = 'fitforge.workoutlog.v1';

/** Write a key from `page`, then tell the OTHER page the way a real browser would. */
async function writeAndNotify(
  writer: import('@playwright/test').Page,
  reader: import('@playwright/test').Page,
  key: string,
  mutate: (raw: string | null) => string,
): Promise<void> {
  const next = await writer.evaluate(
    ({ k, fn }) => {
      // eslint-disable-next-line no-new-func -- the mutation is authored by the spec, not input
      const apply = new Function('raw', `return (${fn})(raw)`) as (r: string | null) => string;
      const value = apply(window.localStorage.getItem(k));
      window.localStorage.setItem(k, value);
      return value;
    },
    { k: key, fn: mutate.toString() },
  );
  // Playwright's pages share an origin but not a browsing-context group, so the real cross-tab
  // `storage` event does not cross between them. Dispatching it is what a second tab would
  // genuinely receive, and it is the exact signal the fix listens for.
  await reader.evaluate(
    ({ k, v }) =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: k, newValue: v, storageArea: window.localStorage }),
      ),
    { k: key, v: next },
  );
}

test.describe('multi-tab', () => {
  test("a second tab SEES the first tab's food log instead of showing an empty day", async ({
    context,
  }) => {
    const tabA = await context.newPage();
    await seedOnboarded(tabA);
    await tabA.goto('/today');
    await expect(tabA.getByTestId('today-view')).toBeVisible();

    // Tab B opens and settles — this is the moment it caches "nothing logged today".
    const tabB = await context.newPage();
    await tabB.goto('/today');
    await expect(tabB.getByText(/Nothing logged yet today/i)).toBeVisible();

    // Tab A logs breakfast.
    const today = await tabA.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await writeAndNotify(tabA, tabB, DEMO_STORAGE_KEY, (raw) => {
      const state = JSON.parse(raw!);
      const day = new Date();
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      state.logsByDate = {
        ...state.logsByDate,
        [iso]: [
          {
            id: 'nl-tabA',
            logged_on: iso,
            meal_slot: 'breakfast',
            food_id: null,
            custom_name: 'Oats',
            quantity_g: 100,
            kcal: 380,
            protein_g: 13,
            carbs_g: 67,
            fat_g: 7,
            created_at: `${iso}T08:00:00.000Z`,
            updated_at: `${iso}T08:00:00.000Z`,
          },
        ],
      };
      return JSON.stringify(state);
    });
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // THE ASSERTION. Before the fix tab B kept rendering the empty state forever, because its
    // cached snapshot had no idea the other tab had written.
    await expect(tabB.getByText(/Nothing logged yet today/i)).toHaveCount(0);
    await expect(tabB.getByTestId('today-ledger')).toContainText('380');
  });

  test("a second tab SEES the first tab's finished session in the streak", async ({ context }) => {
    const tabA = await context.newPage();
    await seedOnboarded(tabA);
    await tabA.goto('/today');
    await expect(tabA.getByTestId('today-view')).toBeVisible();

    const tabB = await context.newPage();
    await tabB.goto('/today');
    // A fresh log reads as the bottom of the ladder — this is tab B's cached view.
    await expect(tabB.getByTestId('forge-rank')).toContainText('0 strikes');

    await writeAndNotify(tabA, tabB, WORKOUT_LOG_KEY, () =>
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 's-tabA',
            dayId: 'd1',
            dayName: 'Push A',
            finishedAt: new Date().toISOString(),
            exercises: [],
          },
        ],
      }),
    );

    // The workout log is a SEPARATE store with its own cache and its own listener; this proves
    // the second one was wired too, not just the demo store.
    await expect(tabB.getByTestId('forge-rank')).toContainText('1 strike');
  });
});
