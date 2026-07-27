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
 * Walk onboarding as far as the EQUIPMENT step (goals → experience → schedule → split →
 * progression → location), leaving the page on `/onboarding/equipment` with the "Home gym" preset
 * already seeded.
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
  // Progression — a scheme is already selected (the recommendation), so Continue alone advances.
  await page.waitForURL(/\/onboarding\/progression/);
  await cont(page);
  await page.waitForURL(/\/onboarding\/location/);
  await page.getByText('Home gym').click();
  await cont(page);
  await page.waitForURL(/\/onboarding\/equipment/);
}

export interface OnboardingHooks {
  /** Runs on the split step, before Continue — e.g. to pick a specific program. */
  onSplit?: (page: Page) => Promise<void>;
  /** Runs on the progression step, before Continue — e.g. to pick a specific scheme. */
  onProgression?: (page: Page) => Promise<void>;
  /**
   * Runs on the FINAL plan-preview step, before "Start plan" — the only place the generated week
   * can be inspected against a fully-answered profile without re-walking the wizard by hand.
   */
  onPlanPreview?: (page: Page) => Promise<void>;
}

/**
 * Complete the FULL onboarding wizard with real answers, exercising every step, and land on
 * `/today` with a generated routine + non-zero nutrition targets persisted to the store.
 */
export async function completeOnboarding(page: Page, hooks: OnboardingHooks = {}): Promise<void> {
  await enterDemo(page);

  // 2 · Goals — pick a primary goal.
  await expect(page.getByText("What are you training for?")).toBeVisible();
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

  // 6 · Progression (NEW, WS-P) — a scheme is always selected: the athlete's explicit choice, or
  // the recommendation for their level and goal. Assert the step really did prescribe something
  // (the per-set preview) rather than just rendering a list of names.
  await page.waitForURL(/\/onboarding\/progression/);
  await expect(page.getByTestId('progression-preview')).toBeVisible();
  if (hooks.onProgression) await hooks.onProgression(page);
  await cont(page);

  // 7 · Location — home gym.
  await page.waitForURL(/\/onboarding\/location/);
  await page.getByText('Home gym').click();
  await cont(page);

  // 8 · Equipment — now a SWIPE DECK (WS-1). Walk it via the accessible buttons, then continue
  // from the review screen.
  await page.waitForURL(/\/onboarding\/equipment/);
  await answerEquipmentDeck(page);
  await cont(page);

  // 9 · Exercise prefs — add a favorite from the suggestion chips.
  await page.waitForURL(/\/onboarding\/exercise_prefs/);
  const popular = page
    .locator('section')
    .filter({ hasText: 'Popular with your equipment' });
  if (await popular.count()) {
    await popular.getByRole('button').first().click();
  }
  await cont(page);

  // 10 · Exclusions — protect a body area + exclude an exercise and accept a substitution.
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

  // 11 · Body metrics — medians pre-filled; set sex and continue.
  await page.waitForURL(/\/onboarding\/body_metrics/);
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await cont(page);

  // 12 · Nutrition prefs — diet + allergy.
  await page.waitForURL(/\/onboarding\/nutrition_prefs/);
  await page.getByText('Vegetarian', { exact: true }).click();
  await page.getByRole('button', { name: 'Tree nut' }).click();
  await cont(page);

  // 13 · Targets review — computed by the shared macros rule.
  await page.waitForURL(/\/onboarding\/targets_review/);
  await expect(page.getByText('kcal / day')).toBeVisible();
  await cont(page);

  // 14 · Plan preview — routine generated; "Start plan" → /today.
  await page.waitForURL(/\/onboarding\/plan_preview/);
  await expect(page.getByTestId('onboarding-continue')).toBeEnabled();
  if (hooks.onPlanPreview) await hooks.onPlanPreview(page);
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

/* ═══════════════════════════════════════════════ regression fixtures (adversarial-review pass)
 *
 * The helpers below exist so the blockers found in the adversarial review can never silently
 * come back. They deliberately drive REAL production code paths (the onboarding wizard, the
 * Settings screen's regenerate button, the Settings file input) rather than asserting on
 * internals, because every one of those defects was invisible to unit-level checks.
 */

/**
 * A completed Local Mode state with NO routine and NO answers — just enough to get past the
 * "you haven't onboarded" gate so a test can land directly on an app route.
 */
export function bareCompletedState(): Record<string, unknown> {
  return {
    version: 1,
    userId: 'demo-user',
    onboardingStep: 'done',
    completedAt: '2026-07-01T10:00:00.000Z',
    draft: null,
    profile: null,
    nutritionProfile: null,
    routine: null,
    targets: null,
    logsByDate: {},
    weights: [],
  };
}

/** Write a raw string straight into a `fitforge.*` key, bypassing every store write path. */
export async function writeRawStore(
  page: Page,
  entries: Record<string, string | null>,
): Promise<void> {
  await page.goto('/today');
  await page.evaluate((rows) => {
    window.localStorage.clear();
    for (const [k, v] of Object.entries(rows)) {
      if (v !== null) window.localStorage.setItem(k, v);
    }
  }, entries);
}

/**
 * Seed a completed Local Mode state whose ONBOARDING DRAFT holds `draft`, so Settings and the
 * generator both see real answers. Leaves the page on `/today`.
 */
export async function seedDraft(page: Page, draft: Record<string, unknown>): Promise<void> {
  const state = { ...bareCompletedState(), draft: { ...DEFAULT_DRAFT, ...draft } };
  await page.goto('/today');
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    },
    { key: DEMO_STORAGE_KEY, value: JSON.stringify(state) },
  );
}

/** Every field the onboarding wizard writes, at its neutral default. */
export const DEFAULT_DRAFT: Record<string, unknown> = {
  display_name: null,
  primary_goal: 'general_health',
  secondary_goal: null,
  experience_level: 'beginner',
  days_per_week: 3,
  session_minutes: 45,
  preferred_days: [],
  split_slug: null,
  training_location: 'commercial_gym',
  equipment_slugs: [],
  loved_equipment_slugs: [],
  favorites: [],
  body_areas: [],
  movement_exclusions: [],
  excluded_exercises: [],
  sex: 'male',
  birthdate: '1990-01-01',
  height_cm: 175,
  weight_kg: 80,
  unit_system: 'metric',
  diet_type: 'none',
  allergies: [],
  meals_per_day: 3,
  kcal_target: null,
  protein_g_target: null,
  carbs_g_target: null,
  fat_g_target: null,
  targets_source: 'suggested',
};

/**
 * The three movement exclusions the §7.2.2 rule derives from protecting Knees — two HARD, one
 * SOFT. Written out longhand so a regression that silently flips `soft` is caught here.
 */
export const KNEES_EXCLUSIONS = [
  { movement_pattern: 'lunge', reason: 'injury', source_body_area: 'knees', soft: false },
  { movement_pattern: 'knee_extension_iso', reason: 'injury', source_body_area: 'knees', soft: false },
  { movement_pattern: 'squat', reason: 'injury', source_body_area: 'knees', soft: true },
];

/** Knees + Lower back + Shoulders — the exact protection set from the B1 repro. */
export const THREE_AREA_EXCLUSIONS = [
  ...KNEES_EXCLUSIONS,
  { movement_pattern: 'hinge', reason: 'injury', source_body_area: 'lower_back', soft: true },
  { movement_pattern: 'core_flexion', reason: 'injury', source_body_area: 'lower_back', soft: true },
  { movement_pattern: 'vertical_push', reason: 'injury', source_body_area: 'shoulders', soft: false },
  { movement_pattern: 'shoulder_isolation', reason: 'injury', source_body_area: 'shoulders', soft: true },
];

/**
 * Run the REAL generator by pressing Settings' "Re-generate my plan", then read back the routine
 * that was persisted. This is the only way to exercise generation end-to-end from a spec: it goes
 * through the same `routineForDraft` the wizard uses and proves the result actually reaches the
 * store (M2d regressed precisely because the button was decorative).
 */
export interface GeneratedRoutine {
  name: string;
  days: { id: string; name: string; count: number; names: string[] }[];
}

export async function regenerateFromSettings(page: Page): Promise<GeneratedRoutine> {
  await page.goto('/settings');
  const button = page.getByTestId('settings-regenerate');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByTestId('settings-plan-name')).toBeVisible();
  return readRoutine(page);
}

/** Read the persisted active routine, flattened to what the regression specs assert on. */
export async function readRoutine(page: Page): Promise<GeneratedRoutine> {
  const routine = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { routine: unknown }).routine : null;
  }, DEMO_STORAGE_KEY);
  const r = routine as {
    name: string;
    days: { id: string; name: string; exercises: { exercise_name: string }[] }[];
  } | null;
  if (!r) throw new Error('no routine persisted');
  return {
    name: r.name,
    days: r.days.map((d) => ({
      id: d.id,
      name: d.name,
      count: d.exercises.length,
      names: d.exercises.map((e) => e.exercise_name),
    })),
  };
}

/**
 * Load `path` and report whether the app broke: an uncaught exception, Next's "Application
 * error" bail-out screen, or a literal `NaN` rendered into the page.
 *
 * A crash on a corrupted store used to be silent in CI because the route still returned HTTP 200
 * — the failure only existed in the client. This asserts on the client.
 */
export async function probeRoute(
  page: Page,
  path: string,
): Promise<{ errors: string[]; applicationError: boolean; renderedNaN: boolean; text: string }> {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(e.message);
  page.on('pageerror', onError);
  try {
    // `load` (not `networkidle`): networkidle is a heuristic that can never settle and turns a
    // healthy page into a timeout. Quiet is then waited for BEST-EFFORT, and a fixed settle
    // window afterwards gives hydration — and any crash it triggers — time to happen.
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const probe = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return {
        applicationError: /Application error/i.test(text),
        // word-boundary NaN, so "NaNo" style copy could never false-positive
        renderedNaN: /(^|[^A-Za-z])NaN([^A-Za-z]|$)/.test(text),
        text,
      };
    });
    return { errors, ...probe };
  } finally {
    page.off('pageerror', onError);
  }
}

/** Assert a route renders cleanly: no uncaught error, no bail-out screen, no `NaN` on screen. */
export async function expectRouteHealthy(page: Page, path: string): Promise<void> {
  const r = await probeRoute(page, path);
  expect(r.errors, `${path} threw`).toEqual([]);
  expect(r.applicationError, `${path} showed the "Application error" screen`).toBe(false);
  expect(r.renderedNaN, `${path} rendered NaN`).toBe(false);
}
