import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded, DEMO_STORAGE_KEY } from './helpers';

/**
 * SHEET FOCUS MANAGEMENT — the keyboard half of the `aria-modal` promise.
 *
 * The shared `Sheet` primitive tells assistive tech the page behind the scrim does not exist
 * (`aria-modal="true"`), so the keyboard has to agree: opening a sheet must move focus INTO it,
 * Tab must cycle within it in both directions, and closing must hand focus back to the control
 * that opened it — otherwise a keyboard or screen-reader user is left tabbing through a page
 * they have been told is not there.
 *
 * Driven through the morning check-in sheet because it is a real, always-on-Today consumer, but
 * the behaviour lives in the primitive (`components/ui/Sheet.tsx`), so every sheet — quick-workout
 * picker, food review, filters — inherits exactly what is asserted here.
 */

/** Mirrors the primitive's own focusable query, so the spec and the trap agree on the edges. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Make TODAY a training day (same pinning as readiness.spec) so the check-in row renders. */
async function trainingToday(page: Page): Promise<void> {
  await seedOnboarded(page);
  await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    const s = JSON.parse(raw!) as {
      routine: { days: { weekday: number | null; exercises: unknown[] }[] };
    };
    const appDay = (new Date().getDay() + 6) % 7; // JS 0=Sun → blueprint 0=Mon
    const target = s.routine.days.find((d) => d.exercises.length > 0)!;
    for (const d of s.routine.days) if (d.weekday === appDay) d.weekday = (appDay + 1) % 7;
    target.weekday = appDay;
    window.localStorage.setItem(key, JSON.stringify(s));
  }, DEMO_STORAGE_KEY);
  await page.goto('/today');
  await expect(page.getByTestId('morning-checkin')).toBeVisible();
}

/** Is the document's focus inside the open dialog? */
async function focusInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return !!d && d.contains(document.activeElement);
  });
}

/** Index of `document.activeElement` in the dialog's visible focusables (-1 if elsewhere). */
async function activeFocusableIndex(page: Page): Promise<{ index: number; count: number }> {
  return page.evaluate((sel) => {
    const d = document.querySelector('[role="dialog"]')!;
    const f = [...d.querySelectorAll<HTMLElement>(sel)].filter(
      (el) => el.getClientRects().length > 0,
    );
    return { index: f.indexOf(document.activeElement as HTMLElement), count: f.length };
  }, FOCUSABLE);
}

/** Focus the dialog's Nth visible focusable directly (negative counts from the end). */
async function focusFocusableAt(page: Page, n: number): Promise<void> {
  await page.evaluate(
    ({ sel, n }) => {
      const d = document.querySelector('[role="dialog"]')!;
      const f = [...d.querySelectorAll<HTMLElement>(sel)].filter(
        (el) => el.getClientRects().length > 0,
      );
      f.at(n)!.focus();
    },
    { sel: FOCUSABLE, n },
  );
}

test.describe('sheet focus management', () => {
  test('keyboard open moves focus in, Tab wraps both directions, Escape returns to the trigger', async ({
    page,
  }) => {
    await trainingToday(page);

    // Open via keyboard only — the trigger element is what focus must come back to.
    await page.getByTestId('checkin-open').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Initial focus lands inside the sheet. Polled, because the primitive focuses the panel on a
    // rAF after AnimatePresence mounts it.
    await expect.poll(() => focusInsideDialog(page)).toBe(true);

    // FORWARD WRAP: from the last focusable, Tab must land on the first — not on the page behind.
    await focusFocusableAt(page, -1);
    await page.keyboard.press('Tab');
    expect(await activeFocusableIndex(page)).toMatchObject({ index: 0 });

    // BACKWARD WRAP: Shift+Tab from the first must land on the last.
    await page.keyboard.press('Shift+Tab');
    const { index, count } = await activeFocusableIndex(page);
    expect(count).toBeGreaterThan(1);
    expect(index).toBe(count - 1);

    // Escape closes the sheet and hands focus back to the control that opened it.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid ?? null),
      )
      .toBe('checkin-open');
  });

  test('Tab can never walk out of an open sheet onto the page behind', async ({ page }) => {
    await trainingToday(page);

    await page.getByTestId('checkin-open').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(() => focusInsideDialog(page)).toBe(true);

    // More presses than the sheet has focusables, so the cycle provably loops. Today's page
    // behind the scrim is full of tabbable controls — any escape would be caught here.
    const { count } = await activeFocusableIndex(page);
    for (let i = 0; i < count + 3; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInsideDialog(page), `Tab press ${i + 1} left the dialog`).toBe(true);
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInsideDialog(page), `Shift+Tab press ${i + 1} left the dialog`).toBe(true);
    }
  });
});
