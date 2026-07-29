import { test, expect, type Page } from '@playwright/test';
import { readDemoState, pageOverflow, seedOnboarded, dismissViaScrim } from './helpers';

/**
 * THE SET-ENTRY FORM, and the glossary hanging off it.
 *
 * These specs exist to hold three promises that the old column header could not:
 *
 *  1. A LABEL CAN NEVER DESCRIBE A CONTROL IT DOES NOT CONTAIN. The card used to carry one
 *     `Weight (kg) | Reps | RPE | Done` strip over a grid template that every row separately
 *     re-declared, so the active row's plate stepper drifted out from under its own header and
 *     "Weight (kg)" ended up over a button that opens a plate diagram. Test 1 walks EVERY
 *     `<label for>` on screen and proves it resolves to a real control whose accessible name
 *     contains the label — a structural assertion, not a screenshot, so it holds for row shapes
 *     nobody has written yet.
 *  2. The accessible names the rest of the suite depends on (`Set N weight|reps|RPE`,
 *     `Mark set N …`) survive every row shape.
 *  3. Every gym word the player prints can be tapped for a plain-English sentence, and the first
 *     session gets the four-line explainer exactly once.
 */

/** Open the player on the first generated day that actually has exercises. */
async function openPlayer(page: Page): Promise<void> {
  const state = await readDemoState(page);
  const routine = (state as { routine: { days: { id: string; exercises: unknown[] }[] } }).routine;
  const day = routine.days.find((d) => d.exercises.length > 0);
  expect(day, 'generated routine has a day with exercises').toBeTruthy();
  await page.goto(`/workout/${day!.id}`);
  await expect(page.getByTestId('set-row-1')).toBeVisible();
}

/**
 * Every `<label for>` on screen, with the control it points at.
 *
 * The accessible name is read off `aria-label` because that is what wins the accname computation
 * for these fields — and it is the name the whole suite locates them by.
 */
async function labelBindings(
  page: Page,
): Promise<{ label: string; id: string; found: boolean; accName: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('label[for]')].map((l) => {
      const target = document.getElementById((l as HTMLLabelElement).htmlFor);
      return {
        label: (l as HTMLElement).innerText.trim(),
        id: (l as HTMLLabelElement).htmlFor,
        found: Boolean(target),
        accName: target?.getAttribute('aria-label') ?? '',
      };
    }),
  );
}

function assertLabelsBound(
  bindings: { label: string; id: string; found: boolean; accName: string }[],
  when: string,
): void {
  expect(bindings.length, `${when}: the row renders labelled fields`).toBeGreaterThan(2);
  for (const b of bindings) {
    expect(b.found, `${when}: label "${b.label}" points at #${b.id}, which does not exist`).toBe(
      true,
    );
    // WCAG 2.5.3 Label in Name — the visible word has to be sayable at the control it names.
    expect(
      b.accName.toLowerCase().includes(b.label.toLowerCase()),
      `${when}: visible label "${b.label}" is not contained in accessible name "${b.accName}"`,
    ).toBe(true);
  }
  // Ids are unique — two labels pointing at one input is the same class of bug.
  const ids = bindings.map((b) => b.id);
  expect(new Set(ids).size, `${when}: duplicate field ids`).toBe(ids.length);
}

test.describe('set-entry form', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('every visible field label is bound to its own control', async ({ page }) => {
    await openPlayer(page);

    assertLabelsBound(await labelBindings(page), 'on open');

    // And the names the rest of the suite locates by are all present on the row you are on.
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Set 1 reps' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Set 1 RPE' })).toBeVisible();

    // CAPTION DEDUP: a caption line paints exactly where the row shape changes. On open, row 1 is
    // the stepper shape and row 2 is the first plain row — both caption. Row 3 repeats row 2's
    // shape, so its caption is clipped to a 1px sr-only rect — in the DOM (assertLabelsBound
    // above already walked it) but painting nothing. Playwright counts a 1×1 clipped box as
    // "visible", so the assertion is on the painted SIZE, not the visibility bit.
    const row2Box = await page
      .getByTestId('set-fields-2')
      .locator('label[for="set-2-reps"]')
      .boundingBox();
    expect(row2Box && row2Box.width > 8, 'row 2 caption paints').toBe(true);
    const row3Label = page.getByTestId('set-fields-3').locator('label[for="set-3-reps"]');
    if (await row3Label.count()) {
      const row3Box = await row3Label.boundingBox();
      expect(row3Box == null || row3Box.width <= 1, 'row 3 caption is clipped').toBe(true);
    }

    // Nothing may push the page sideways at 390 px.
    expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);
  });

  test('tapping a field label focuses that field', async ({ page }) => {
    await openPlayer(page);

    await page.locator('label[for="set-1-reps"]').click();
    await expect(page.getByRole('spinbutton', { name: 'Set 1 reps' })).toBeFocused();

    // The active row's weight is a plate stepper rather than a bare box, and its label has to reach
    // the input inside it — that is exactly the binding the old header could not make.
    await page.locator('label[for="set-1-weight"]').click();
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight' })).toBeFocused();
  });

  test('the row changes shape as it is logged, and the labels move with it', async ({ page }) => {
    await openPlayer(page);

    await expect(page.getByTestId('set-row-1')).toHaveAttribute('data-state', 'current');
    await expect(page.getByTestId('set-row-2')).toHaveAttribute('data-state', 'upcoming');

    // THE SHAPE DIFFERENCE THAT BROKE THE OLD HEADER: only the row you are on gets the loaded bar,
    // and the plate buttons are part of the stepper, so there is exactly one pair on screen.
    await expect(page.getByRole('button', { name: 'Decrease Set 1 weight' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Decrease Set \d+ weight$/ })).toHaveCount(1);

    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('60');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('10');
    await page.getByRole('button', { name: 'Mark set 1 done' }).click();

    // Logging promotes set 2 to the current shape — the stepper MOVES rather than multiplying.
    await expect(page.getByTestId('set-row-1')).toHaveAttribute('data-state', 'logged');
    await expect(page.getByTestId('set-row-2')).toHaveAttribute('data-state', 'current');
    await expect(page.getByRole('button', { name: 'Decrease Set 2 weight' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Decrease Set \d+ weight$/ })).toHaveCount(1);

    // Set 1 is now the OTHER shape, and it kept both its label binding and its value.
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight' })).toHaveValue('60');
    assertLabelsBound(await labelBindings(page), 'after logging set 1');

    // The target chip is on every row in every state, so anything enumerating them still can.
    await expect(page.getByTestId('set-target-1')).toBeVisible();

    // Un-logging hands the row back, and the shape returns with it.
    await page.getByRole('button', { name: 'Mark set 1 not done' }).click();
    await expect(page.getByTestId('set-row-1')).toHaveAttribute('data-state', 'current');
    await expect(page.getByRole('button', { name: 'Decrease Set 1 weight' })).toBeVisible();
  });

  test('the plate-math trigger never stands in for the weight field', async ({ page }) => {
    await openPlayer(page);

    // The precise regression: the header said "Weight (kg)" and the control under it opened a plate
    // diagram. Whatever else is on the row, the thing `set-1-weight` names must be a number field.
    const tag = await page.evaluate(() => {
      const el = document.getElementById('set-1-weight');
      return { tag: el?.tagName, type: el?.getAttribute('type') };
    });
    expect(tag).toEqual({ tag: 'INPUT', type: 'number' });

    // …and the plate button is still there, next to it, with its own name.
    await expect(page.getByRole('button', { name: 'Plate math for set 1' })).toBeVisible();
  });
});

test.describe('glossary', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('a term explains itself in one sentence and links on to the Coach', async ({ page }) => {
    await openPlayer(page);

    // The `?` beside the RPE field label.
    await page.getByTestId('set-fields-1').getByTestId('glossary-info-rpe').click();
    const sheet = page.getByTestId('glossary-sheet-rpe');
    await expect(sheet).toBeVisible();
    // ACTIONABLE, not a translation: it says what to do when you cannot judge it.
    await expect(sheet).toContainText('leave it blank');
    // The long answer is NOT copied into the glossary — it is the shipped KB entry, pulled in by
    // id. If this text ever stops matching faq.json, the two have forked.
    await expect(sheet).toContainText('What do RPE and RIR mean?');
    await expect(page.getByTestId('glossary-ask-rpe')).toBeVisible();
    // Closed by tapping its scrim — see dismissViaScrim for why the tap POSITION is load-bearing.
    await dismissViaScrim(page);
    await expect(sheet).toHaveCount(0);

    // A dotted term in prose. The rep range carries a RULE, so it earns one.
    await page.getByTestId('glossary-term-rep-range').click();
    await expect(page.getByTestId('glossary-sheet-rep-range')).toContainText('go heavier');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('glossary-sheet-rep-range')).toHaveCount(0);
  });

  test('the words the app invented for itself are defined where it uses them', async ({ page }) => {
    // Reverse pyramid puts a "top set" on row 1 and back-offs under it — the two words the app
    // prints most and defined least — and it always ramps, so the warm-up card is on screen.
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Reverse pyramid/ }).click();
    await openPlayer(page);

    await expect(page.getByTestId('set-cue-1')).toContainText(/heaviest/i);
    await page.getByTestId('set-row-1').getByTestId('glossary-term-top-set').click();
    await expect(page.getByTestId('glossary-sheet-top-set')).toContainText('heaviest set');
    await page.keyboard.press('Escape');

    // "Working set" is the unit the entire set counter is denominated in, and it was stated
    // nowhere. It is defined on the card that depends on the distinction.
    await page.getByTestId('warmup-block').getByTestId('glossary-term-working-set').click();
    await expect(page.getByTestId('glossary-sheet-working-set')).toContainText('do not count');
    await page.keyboard.press('Escape');

    await page.getByTestId('warmup-block').getByTestId('glossary-term-warmup-set').click();
    await expect(page.getByTestId('glossary-sheet-warmup-set')).toContainText('lighter');
  });
});

test.describe('first-workout explainer', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('shows on the first session, and stays dismissed', async ({ page }) => {
    await openPlayer(page);
    const card = page.getByTestId('first-set-explainer');
    await expect(card).toBeVisible();
    // The point of the card: the boxes are a suggestion, and you type what you really did.
    await expect(card).toContainText('actually');

    await page.getByTestId('first-set-explainer-dismiss').click();
    await expect(card).toHaveCount(0);

    // Local Mode has no server to fall back on: the dismissal has to survive a reload.
    await page.reload();
    await expect(page.getByTestId('set-row-1')).toBeVisible();
    await expect(page.getByTestId('first-set-explainer')).toHaveCount(0);
  });
});
