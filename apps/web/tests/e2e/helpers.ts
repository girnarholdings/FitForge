import { type Page, expect } from '@playwright/test';

export const DEMO_STORAGE_KEY = 'fitforge.demo.v1';
/** WS-F's additive workout-session slice (see `components/features/shared/workoutLog.ts`). */
export const WORKOUT_LOG_KEY = 'fitforge.workoutlog.v1';

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

/* ══════════════════════════════════════════════════════ training history (analytics fixtures) */

/**
 * Three real catalog lifts (ids/slugs/muscles copied verbatim from
 * `packages/shared/src/fixtures/catalog.json`) so seeded history aggregates through the same
 * muscle attribution the app uses at runtime.
 */
interface HistoryLift {
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  mechanics: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  /** starting working weight; every later session adds 2.5 kg */
  baseKg: number;
}

const HISTORY_LIFTS: HistoryLift[] = [
  {
    exercise_id: 'ex-barbell-back-squat',
    exercise_slug: 'barbell-back-squat',
    exercise_name: 'Barbell Back Squat',
    mechanics: 'compound',
    primary_muscles: ['quads'],
    secondary_muscles: ['glute-max', 'lower-back', 'adductors'],
    baseKg: 80,
  },
  {
    exercise_id: 'ex-dumbbell-bench-press',
    exercise_slug: 'dumbbell-bench-press',
    exercise_name: 'Dumbbell Bench Press',
    mechanics: 'compound',
    primary_muscles: ['pecs'],
    secondary_muscles: ['front-delts', 'triceps'],
    baseKg: 30,
  },
  {
    exercise_id: 'ex-barbell-row',
    exercise_slug: 'barbell-row',
    exercise_name: 'Barbell Bent-over Row',
    mechanics: 'compound',
    primary_muscles: ['lats'],
    secondary_muscles: ['rhomboids', 'rear-delts', 'biceps', 'lower-back'],
    baseKg: 60,
  },
];

/**
 * Days-before-now for each seeded session. Spans ~5 Monday-anchored weeks with 3 sessions a week,
 * including two inside the last 7 days (so the heat map has a LOGGED source) — enough history for
 * a week-over-week trend, a consistency strip and a ≥2-session strength trend on every lift.
 */
const HISTORY_DAY_OFFSETS = [2, 4, 6, 9, 11, 13, 16, 18, 20, 23, 25, 27, 30, 32, 34];

/**
 * Write a deterministic, PROGRESSING block of training history straight into WS-F's
 * `fitforge.workoutlog.v1` slice, then reload so the store re-reads it.
 *
 * This is a fixture, not a fake: it is the exact shape `WorkoutPlayer.finishWorkout()` persists,
 * so every analytic under test (`weeklyBuckets`, `strengthTrends`, `buildSummary`,
 * `setsPerMuscleLast7Days`) runs over real production code paths. Weights step up over time so the
 * estimated-1RM trend has a genuine, assertable direction.
 *
 * Must be called on a page served from the app origin. Leaves the page reloaded at the same URL.
 */
export async function seedTrainingHistory(page: Page): Promise<void> {
  await page.evaluate(
    ({ key, lifts, offsets }) => {
      const DAY = 24 * 60 * 60 * 1000;
      const sessions = offsets.map((daysAgo, i) => {
        // oldest session = highest index → smallest progression step
        const step = offsets.length - 1 - i;
        const at = new Date(Date.now() - daysAgo * DAY);
        at.setHours(18, 30, 0, 0);
        return {
          id: `seed-sess-${daysAgo}`,
          dayId: `seed-day-${i % 3}`,
          dayName: ['Day A', 'Day B', 'Day C'][i % 3]!,
          finishedAt: at.toISOString(),
          exercises: lifts.map((l) => ({
            exercise_id: l.exercise_id,
            exercise_slug: l.exercise_slug,
            exercise_name: l.exercise_name,
            mechanics: l.mechanics,
            primary_muscles: [...l.primary_muscles],
            secondary_muscles: [...l.secondary_muscles],
            sets: [0, 1, 2].map(() => ({ reps: 8, weight_kg: l.baseKg + step * 2.5 })),
          })),
        };
      });
      window.localStorage.setItem(key, JSON.stringify({ version: 1, sessions }));
    },
    { key: WORKOUT_LOG_KEY, lifts: HISTORY_LIFTS, offsets: HISTORY_DAY_OFFSETS },
  );
  await page.reload();
}

/* ═══════════════════════════════════════════════════ transient-DOM recorder (reward effects) */

/**
 * Start recording which `data-testid`s ever get attached to the document.
 *
 * The gamification layer is deliberately short-lived — a burst lives 780 ms, the combo chip
 * 1400 ms — so polling for it with a normal locator is a race. A `MutationObserver` installed
 * BEFORE the interaction records the appearance instead, which is both non-flaky and a stronger
 * assertion (it proves the effect fired, not merely that it lingered).
 *
 * Survives no navigation: call it after the page you want to observe has loaded.
 */
export async function recordTransientTestIds(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __ffSeen?: Set<string>; __ffObs?: MutationObserver };
    w.__ffObs?.disconnect();
    const seen = new Set<string>();
    w.__ffSeen = seen;
    const note = (node: Node) => {
      if (!(node instanceof Element)) return;
      const own = node.getAttribute('data-testid');
      if (own) seen.add(own);
      node.querySelectorAll('[data-testid]').forEach((el) => {
        const id = el.getAttribute('data-testid');
        if (id) seen.add(id);
      });
    };
    document.querySelectorAll('[data-testid]').forEach((el) => {
      const id = el.getAttribute('data-testid');
      if (id) seen.add(id);
    });
    const obs = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(note);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    w.__ffObs = obs;
  });
}

/** Every `data-testid` seen since {@link recordTransientTestIds}, including ones already gone. */
export async function seenTransientTestIds(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...((window as unknown as { __ffSeen?: Set<string> }).__ffSeen ?? new Set<string>()),
  ]);
}

/**
 * Tap a muscle on an interactive `MuscleMap` silhouette.
 *
 * Each muscle is ONE `<a>` wrapping a path AND its mirrored twin, so the element's bounding box
 * spans both sides of the body and its geometric centre falls in the gap between them — where a
 * neighbouring shape (the inner thigh, between the two quads) legitimately sits on top. Aiming at
 * the left-hand copy is what a real thumb does.
 */
export async function tapMuscle(page: Page, slug: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const shape = page.getByTestId(`muscle-map-shape-${slug}`).first();
  await expect(shape).toBeVisible();
  const box = (await shape.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.45);
}

/** `{ vertical, horizontal }` page overflow in px — both must be ≤ 1 on a well-behaved screen. */
export async function pageOverflow(
  page: Page,
): Promise<{ vertical: number; horizontal: number }> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return {
      vertical: el.scrollHeight - el.clientHeight,
      horizontal: el.scrollWidth - el.clientWidth,
    };
  });
}
