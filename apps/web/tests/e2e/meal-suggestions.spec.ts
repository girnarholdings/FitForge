import { test, expect } from '@playwright/test';
import { resetDemo, completeOnboarding } from './helpers';

/**
 * "WHAT CAN I EAT?" — answered from the day's arithmetic, not generated.
 *
 * The tests that matter here are about PROVENANCE and ARITHMETIC, not phrasing:
 *   · the answer must appear on a build with no AI endpoint configured, because it is computed
 *     locally — if it only worked with a worker, it would be the exact feature the app promises
 *     never to depend on;
 *   · no suggestion may propose more calories than the user actually has left, which is the one
 *     way this feature could give actively harmful advice.
 */

test.use({ viewport: { width: 390, height: 664 } });

test.describe('coach · meal suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await completeOnboarding(page);
  });

  test('asking what to eat returns real foods with no AI configured', async ({ page }) => {
    await page.goto('/coach');
    await page.getByTestId('coach-input').fill('what can I eat to hit my protein today?');
    await page.getByTestId('coach-submit').click();

    const card = page.getByTestId('meal-suggestions');
    await expect(card).toBeVisible();
    // Real rows from the curated catalog, not prose.
    await expect(page.getByTestId('meal-suggestion').first()).toBeVisible();
    // And it says where the numbers came from, because that is the reason to trust them.
    await expect(card).toContainText(/nothing here is generated/i);
  });

  test('no suggestion spends more calories than remain', async ({ page }) => {
    await page.goto('/coach');
    await page.getByTestId('coach-input').fill('what should I eat?');
    await page.getByTestId('coach-submit').click();
    await expect(page.getByTestId('meal-suggestions')).toBeVisible();

    const note = await page.getByTestId('meal-note').innerText();
    const remaining = Number(note.match(/(\d[\d,]*)\s*kcal/i)?.[1]?.replace(/,/g, '') ?? '0');
    expect(remaining, 'the note must quote the remaining calories').toBeGreaterThan(0);

    const rows = await page.getByTestId('meal-suggestion').allInnerTexts();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const kcal = Number(row.match(/(\d+)\s*kcal/)?.[1] ?? '0');
      // A single suggestion that eats the whole remaining budget is not a suggestion, it is a dare.
      expect(kcal, `"${row.split('\n')[0]}" must fit inside ${remaining} kcal`).toBeLessThanOrEqual(
        remaining,
      );
    }
  });

  test('an ordinary training question is NOT hijacked by the food intercept', async ({ page }) => {
    // The intercept is narrow on purpose: stealing a question the guide answers well is worse
    // than missing one, because the user loses a good answer and gets a food list instead.
    await page.goto('/coach');
    await page.getByTestId('coach-input').fill('how many sets per muscle per week?');
    await page.getByTestId('coach-submit').click();
    await expect(page.getByTestId('meal-suggestions')).toHaveCount(0);
  });
});
