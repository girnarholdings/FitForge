import { test, expect, type Page } from '@playwright/test';
import {
  advanceToEquipment,
  pageOverflow,
  readDemoState,
  recordTransientTestIds,
  resetDemo,
  seenTransientTestIds,
} from './helpers';

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

/** "42 unlocked" → 42. Reads the header chip, whose number counts up rather than snapping. */
async function unlockedCount(page: Page): Promise<number> {
  const text = await page.getByTestId('equipment-unlocked-counter').innerText();
  return parseInt((text.match(/(\d+)/) ?? ['', '0'])[1]!, 10);
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
    // Exercise prefs moved before split; equipment now hands off to exclusions.
    await page.waitForURL(/\/onboarding\/exclusions/);

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

  /**
   * WS-A — the reward loop rides ON TOP of the answering contract, it does not replace it.
   *
   * Every effect (commit burst, streak chip, milestone toast, count-up counter, pace nudge) is an
   * absolutely-positioned `pointer-events-none` overlay, so this asserts three things at once:
   * the buttons STILL record have / love / don't-have, the feedback actually fires for BUTTON
   * answers (not just drags), and the deck screen is still a bounded, non-scrolling 100svh surface
   * afterwards.
   *
   * The effects are deliberately short-lived (burst 780 ms, chip 1400 ms), so their appearance is
   * captured with a MutationObserver installed before the interaction rather than polled for.
   */
  test('answering with the buttons fires the reward layer without breaking the deck', async ({
    page,
  }) => {
    const kit0 = await kitSize(page);

    await page.getByTestId('equipment-start-swiping').click();
    await expect(page.getByTestId('equipment-deck-screen')).toBeVisible();

    const counter = page.getByTestId('equipment-unlocked-counter');
    await expect(counter).toBeVisible();
    const unlocked0 = await unlockedCount(page);

    await recordTransientTestIds(page);

    // The pace nudge is honest, shrinking copy — never a fake urgency badge.
    const nudge = page.getByTestId('equipment-deck-nudge');
    await expect(nudge).toBeVisible();
    await expect(nudge).toHaveText(/(\d+ left · about \d+s|Last one|All answered)/);
    const nudgeBefore = await nudge.innerText();

    // Two "have" and one "love" — a 3-answer streak, which is exactly where the combo chip starts.
    await swipe(page, 'right');
    await swipe(page, 'up');
    await ensureItemCard(page);
    await page.getByTestId('swipe-action-right').click();

    // The streak chip is on screen for ~1.4 s from this third answer.
    const combo = page.getByTestId('equipment-combo-chip');
    await expect(combo).toBeVisible();
    await expect(combo).toHaveText(/(\d+ in a row|On a roll · \d+|Blazing · \d+|Unstoppable · \d+)/);

    // …and a commit burst fired at least once along the way (right → ripple, up → spark).
    await expect
      .poll(async () => (await seenTransientTestIds(page)).includes('swipe-deck-burst'))
      .toBe(true);

    // The counter counts UP rather than snapping, so poll it to its settled value.
    await expect.poll(() => unlockedCount(page)).toBeGreaterThan(unlocked0);
    expect(await nudge.innerText()).not.toBe(nudgeBefore);

    // ZERO layout cost: the deck screen is still exactly one bounded, non-scrolling viewport.
    await page.waitForTimeout(600);
    const overflow = await pageOverflow(page);
    expect(overflow.vertical).toBeLessThanOrEqual(1);
    expect(overflow.horizontal).toBeLessThanOrEqual(1);

    // The answers themselves survived the fireworks: 2 × have + 1 × love = kit + 3, loved = 1.
    await page.getByTestId('equipment-deck-review').click();
    await expect(page.getByTestId('equipment-review-screen')).toBeVisible();
    expect(await page.locator('[data-testid^="equipment-chip-"]').count()).toBe(kit0 + 3);

    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/onboarding\/exclusions/);
    const draft = await draftEquipment(page);
    expect(draft.equipment_slugs).toHaveLength(kit0 + 3);
    expect(draft.loved_equipment_slugs).toHaveLength(1);
  });

  /**
   * WS-A's new `celebrate` phase sits between deck-exhaustion and review. It auto-advances after
   * 3.4 s so it can never strand the wizard — but the CTA must also work, and the phase must not
   * lose the answers the deck collected.
   */
  test('exhausting the deck reaches the celebration screen and hands off to review', async ({
    page,
  }) => {
    await page.getByTestId('equipment-start-swiping').click();
    await expect(page.getByTestId('equipment-deck-screen')).toBeVisible();
    await recordTransientTestIds(page);

    // Burn the deck down: "Have all" clears a whole category at once, the rest go one at a time.
    const finish = page.getByTestId('equipment-finish-screen');
    for (let i = 0; i < 40; i++) {
      if (await finish.isVisible().catch(() => false)) break;
      const all = page.getByTestId('equipment-category-all');
      if (await all.isVisible().catch(() => false)) {
        await all.click();
      } else {
        const right = page.getByTestId('swipe-action-right');
        if (!(await right.isVisible().catch(() => false))) break;
        await right.click();
      }
      await page.waitForTimeout(320);
    }

    await expect(finish).toBeVisible();
    const overflow = await pageOverflow(page);
    expect(overflow.vertical).toBeLessThanOrEqual(1);
    expect(overflow.horizontal).toBeLessThanOrEqual(1);

    // The payoff number is real — it is the exercise count the answered kit unlocks, counted up
    // from zero.
    await expect
      .poll(async () =>
        parseInt(
          (await page.getByTestId('equipment-finish-count').innerText()).replace(/\D/g, ''),
          10,
        ),
      )
      .toBeGreaterThan(0);
    // The celebration burst fires 280 ms into the phase, so poll the recorder rather than race it.
    await expect
      .poll(async () => (await seenTransientTestIds(page)).includes('equipment-finish-burst'))
      .toBe(true);

    // The CTA skips the 3.4 s auto-advance; either path must land on review with the kit intact
    // (the auto-advance is what guarantees the wizard can never be stranded here).
    const cta = page.getByTestId('equipment-finish-continue');
    if (await cta.isVisible().catch(() => false)) await cta.click();
    await expect(page.getByTestId('equipment-review-screen')).toBeVisible();
    expect(await page.locator('[data-testid^="equipment-chip-"]').count()).toBeGreaterThan(0);
  });
});
