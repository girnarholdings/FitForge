import { type Page, expect } from '@playwright/test';

export const DEMO_STORAGE_KEY = 'fitforge.demo.v1';

/**
 * Clear all demo state (localStorage key `fitforge.demo.v1`) for test isolation. Must be called
 * while on a page served from the app origin.
 */
export async function resetDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
}

/**
 * Enter the demo from the landing page: `/` → onboarding welcome → auth → goals. Seeds the fake
 * local session. Lands on `/onboarding/goals`.
 */
export async function enterDemo(page: Page): Promise<void> {
  await page.goto('/onboarding/welcome');
  // Welcome screen "Get started" advances to the auth (enter-demo) screen.
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForURL(/\/onboarding\/auth/);
  await page.getByTestId('enter-demo').click();
  await page.waitForURL(/\/onboarding\/goals/);
}

const cont = (page: Page) => page.getByTestId('onboarding-continue').click();

/**
 * Answer the equipment step's Tinder-style swipe deck using its ACCESSIBLE BUTTONS (never drag
 * gestures — those are pointer-physics dependent and flaky in CI).
 *
 * Flow: intro → `equipment-start-swiping` → deck. The deck interleaves category interstitial
 * cards (which expose `equipment-category-*` actions) with item cards (which expose
 * `swipe-action-left/right/up`). We answer `count` item cards, taking "have all" on the first
 * category card so the run is quick, then land on the review screen.
 *
 * Leaves the page on the equipment REVIEW screen, where `onboarding-continue` is available.
 */
export async function answerEquipmentDeck(page: Page, count = 3): Promise<void> {
  await expect(page.getByTestId('equipment-intro-screen')).toBeVisible();
  await page.getByTestId('equipment-start-swiping').click();
  await expect(page.getByTestId('equipment-deck-screen')).toBeVisible();

  const dirs = ['right', 'up', 'left'] as const;
  for (let i = 0; i < count; i++) {
    const categoryAll = page.getByTestId('equipment-category-all');
    if (await categoryAll.isVisible().catch(() => false)) {
      // An interstitial for a ≥3-item category — "Show me one by one" keeps the deck on items.
      await page.getByTestId('equipment-category-one-by-one').click();
    }
    const action = page.getByTestId(`swipe-action-${dirs[i % dirs.length]}`);
    if (!(await action.isVisible().catch(() => false))) break;
    await action.click();
    // The card fly-out animation must settle before the next click targets the new top card.
    await page.waitForTimeout(400);
  }

  await page.getByTestId('equipment-deck-review').click();
  await expect(page.getByTestId('equipment-review-screen')).toBeVisible();
}

/**
 * Walk onboarding as far as the EQUIPMENT step (goals → experience → schedule → split → location),
 * leaving the page on `/onboarding/equipment` with the "Home gym" preset already seeded.
 */
export async function advanceToEquipment(page: Page): Promise<void> {
  await enterDemo(page);
  await page.getByText('Lose fat').click();
  await cont(page);
  await page.waitForURL(/\/onboarding\/experience/);
  await page.getByText('Intermediate').click();
  await cont(page);
  await page.waitForURL(/\/onboarding\/schedule/);
  await cont(page);
  await page.waitForURL(/\/onboarding\/split/);
  await cont(page);
  await page.waitForURL(/\/onboarding\/location/);
  await page.getByText('Home gym').click();
  await cont(page);
  await page.waitForURL(/\/onboarding\/equipment/);
}

export interface OnboardingHooks {
  /** Runs on the split step, before Continue — e.g. to pick a specific program. */
  onSplit?: (page: Page) => Promise<void>;
}

/**
 * Complete the FULL onboarding wizard with real answers, exercising every step, and land on
 * `/today` with a generated routine + non-zero nutrition targets persisted to the store.
 */
export async function completeOnboarding(page: Page, hooks: OnboardingHooks = {}): Promise<void> {
  await enterDemo(page);

  // 2 · Goals — pick a primary goal.
  await expect(page.getByText("What's your main goal?")).toBeVisible();
  await page.getByText('Lose fat').click();
  await cont(page);

  // 3 · Experience — beginner is the seeded default.
  await page.waitForURL(/\/onboarding\/experience/);
  await page.getByText('Intermediate').click();
  await cont(page);

  // 4 · Schedule — defaults (days/weekdays/length) are seeded from goal × experience.
  await page.waitForURL(/\/onboarding\/schedule/);
  await cont(page);

  // 5 · Split (NEW, WS-5) — the best-matching program is preselected on mount, so Continue alone
  // advances. Assert something was actually chosen before moving on.
  await page.waitForURL(/\/onboarding\/split/);
  await expect(page.getByTestId('onboarding-continue')).toBeEnabled();
  if (hooks.onSplit) await hooks.onSplit(page);
  await cont(page);

  // 6 · Location — home gym.
  await page.waitForURL(/\/onboarding\/location/);
  await page.getByText('Home gym').click();
  await cont(page);

  // 7 · Equipment — now a SWIPE DECK (WS-1). Walk it via the accessible buttons, then continue
  // from the review screen.
  await page.waitForURL(/\/onboarding\/equipment/);
  await answerEquipmentDeck(page);
  await cont(page);

  // 8 · Exercise prefs — add a favorite from the suggestion chips.
  await page.waitForURL(/\/onboarding\/exercise_prefs/);
  const popular = page
    .locator('section')
    .filter({ hasText: 'Popular with your equipment' });
  if (await popular.count()) {
    await popular.getByRole('button').first().click();
  }
  await cont(page);

  // 9 · Exclusions — protect a body area + exclude an exercise and accept a substitution.
  await page.waitForURL(/\/onboarding\/exclusions/);
  await page.getByRole('button', { name: 'Knees' }).click();
  const avoid = page.getByRole('combobox', { name: 'Search exercises to avoid' });
  await avoid.click();
  await avoid.fill('Squat');
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  await option.click();
  // The excluded card renders "Auto" + substitute chips. Accept a concrete substitute if offered.
  const excludedCard = page.locator('div.rounded-card', { hasText: 'Substitute with:' }).first();
  await expect(excludedCard).toBeVisible();
  const subChips = excludedCard.getByRole('button');
  if ((await subChips.count()) > 2) {
    // index 0 = Remove, index 1 = Auto, index 2+ = concrete substitutes
    await subChips.nth(2).click();
  }
  await cont(page);

  // 10 · Body metrics — medians pre-filled; set sex and continue.
  await page.waitForURL(/\/onboarding\/body_metrics/);
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await cont(page);

  // 11 · Nutrition prefs — diet + allergy.
  await page.waitForURL(/\/onboarding\/nutrition_prefs/);
  await page.getByText('Vegetarian', { exact: true }).click();
  await page.getByRole('button', { name: 'Tree nut' }).click();
  await cont(page);

  // 12 · Targets review — computed by the shared macros rule.
  await page.waitForURL(/\/onboarding\/targets_review/);
  await expect(page.getByText('kcal / day')).toBeVisible();
  await cont(page);

  // 13 · Plan preview — routine generated; "Start plan" → /today.
  await page.waitForURL(/\/onboarding\/plan_preview/);
  await expect(page.getByTestId('onboarding-continue')).toBeEnabled();
  await cont(page);

  await page.waitForURL(/\/today/);
}

/** Read the persisted demo state from localStorage. */
export async function readDemoState(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }, DEMO_STORAGE_KEY);
}
