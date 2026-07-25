import { test, expect, type Page } from '@playwright/test';
import { advanceToEquipment, readDemoState, resetDemo } from './helpers';

/**
 * WS-1 — the Tinder-style equipment swipe deck.
 *
 * Everything here drives the deck through its ACCESSIBLE BUTTONS (`swipe-action-*`), never a drag
 * gesture: the buttons are the WCAG 2.5.1 single-pointer equivalent and are what a keyboard or
 * switch user hits, so they are also the right thing to regression-test.
 *
 * Persistence contract: `OnboardingProvider.patch()` is in-memory; the draft is written to
 * localStorage by `commitAndNext` when the step's Continue is pressed. So the deck's answers are
 * asserted on-screen while swiping, and in localStorage after Continue.
 */

interface EquipmentDraft {
  equipment_slugs: string[];
  loved_equipment_slugs: string[];
}

async function draftEquipment(page: Page): Promise<EquipmentDraft> {
  const state = await readDemoState(page);
  const draft = (state as { draft: EquipmentDraft } | null)?.draft;
  return {
    equipment_slugs: draft?.equipment_slugs ?? [],
    loved_equipment_slugs: draft?.loved_equipment_slugs ?? [],
  };
}

/** "My kit (12)" → 12. */
async function kitSize(page: Page): Promise<number> {
  const label = await page.getByTestId('equipment-open-review').innerText();
  return parseInt((label.match(/\((\d+)\)/) ?? ['', '0'])[1]!, 10);
}

/** "7 of 30" → [7, 30]. */
async function deckProgress(page: Page): Promise<[number, number]> {
  const text = await page.getByTestId('equipment-deck-screen').innerText();
  const m = text.match(/(\d+)\s+of\s+(\d+)/);
  return [parseInt(m![1]!, 10), parseInt(m![2]!, 10)];
}

/** Skip past a category interstitial so the top card is a real equipment item. */
async function ensureItemCard(page: Page): Promise<void> {
  const oneByOne = page.getByTestId('equipment-category-one-by-one');
  if (await oneByOne.isVisible().catch(() => false)) {
    await oneByOne.click();
  }
  await expect(page.getByTestId('swipe-action-right')).toBeVisible();
  await expect(page.getByTestId('swipe-deck-card')).toBeVisible();
}

/** Answer the top item card and let the fly-out animation settle. */
async function swipe(page: Page, dir: 'left' | 'right' | 'up'): Promise<void> {
  await ensureItemCard(page);
  await page.getByTestId(`swipe-action-${dir}`).click();
  await page.waitForTimeout(400);
}

test.describe('equipment swipe deck', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await advanceToEquipment(page);
  });

  test('the deck records have / love / don’t-have via its buttons and persists to the draft', async ({
    page,
  }) => {
    // Intro phase — still the continue-able in-shell screen, with the live unlocked counter.
    await expect(page.getByTestId('equipment-intro-screen')).toBeVisible();
    await expect(page.getByTestId('equipment-unlocked-banner')).toBeVisible();

    // The "Home gym" location preset already seeded a kit.
    const kit0 = await kitSize(page);
    expect(kit0).toBeGreaterThan(0);

    await page.getByTestId('equipment-start-swiping').click();
    await expect(page.getByTestId('equipment-deck-screen')).toBeVisible();
    await expect(page.getByTestId('equipment-swipe-deck')).toBeVisible();
    await expect(page.getByTestId('equipment-unlocked-counter')).toBeVisible();

    const [done0, total] = await deckProgress(page);
    expect(total).toBeGreaterThan(0);

    // RIGHT = have it, UP = love it, LEFT = don't have.
    await swipe(page, 'right');
    await swipe(page, 'up');
    await swipe(page, 'left');

    const [done3] = await deckProgress(page);
    expect(done3).toBe(done0 + 3);

    // UNDO walks the "don't have" back — the deck restores the card and the counter rewinds.
    await page.getByTestId('swipe-action-undo').click();
    await page.waitForTimeout(400);
    await expect.poll(async () => (await deckProgress(page))[0]).toBe(done0 + 2);

    // Re-answer it as "have" so the kit grew by exactly 3 (2 × have + 1 × love).
    await swipe(page, 'right');

    // REVIEW shows every have/love as a chip.
    await page.getByTestId('equipment-deck-review').click();
    await expect(page.getByTestId('equipment-review-screen')).toBeVisible();
    await expect(page.getByTestId('equipment-review-chips')).toBeVisible();
    const chips = page.locator('[data-testid^="equipment-chip-"]');
    expect(await chips.count()).toBe(kit0 + 3);

    // The review screen's CTA must be reachable — the overlay is fixed/z-60 and would otherwise
    // paint over the shell's portalled dock.
    const cta = page.getByTestId('onboarding-continue');
    await expect(cta).toBeVisible();
    await cta.click();
    await page.waitForURL(/\/onboarding\/exercise_prefs/);

    // Committing the step persists BOTH lists: love implies have, and only the up-swiped item
    // is loved.
    const draft = await draftEquipment(page);
    expect(draft.equipment_slugs).toHaveLength(kit0 + 3);
    expect(draft.loved_equipment_slugs).toHaveLength(1);
    expect(draft.equipment_slugs).toContain(draft.loved_equipment_slugs[0]);

    // Going back re-hydrates the deck from the draft, star and all.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForURL(/\/onboarding\/equipment/);
    await page.getByTestId('equipment-open-review').click();
    await expect(
      page.getByTestId(`equipment-chip-${draft.loved_equipment_slugs[0]}`),
    ).toBeVisible();
  });

  test('a preset pre-answers the kit and the deck overlay never scrolls the page', async ({
    page,
  }) => {
    await page.getByTestId('equipment-preset-bodyweight').click();

    // Presets land straight on review with a non-empty kit.
    await expect(page.getByTestId('equipment-review-screen')).toBeVisible();
    await expect(page.getByTestId('equipment-review-chips')).toBeVisible();
    expect(await page.locator('[data-testid^="equipment-chip-"]').count()).toBeGreaterThan(0);

    // Back to the deck for the unanswered remainder — the overlay is a bounded 100svh screen, so
    // the page itself must not scroll at the iPhone viewport (the old 2211px scroll wall).
    await page.getByTestId('equipment-swipe-remaining').click();
    await expect(page.getByTestId('equipment-deck-screen')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
