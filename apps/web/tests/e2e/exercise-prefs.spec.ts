import { test, expect, type Page } from '@playwright/test';
import {
  DEMO_STORAGE_KEY,
  bareCompletedState,
  DEFAULT_DRAFT,
  seedDraft,
  resetDemo,
  regenerateFromSettings,
  pageOverflow,
} from './helpers';

/**
 * The ranked top-5 liked / top-5 disliked preference picker (screen 5, BEFORE the split step).
 *
 * What must hold, per docs/RESEARCH-PREFERENCES.md:
 *   · the liked pre-fill differs by sex and SAYS where it came from,
 *   · it is a pre-fill, never a filter — every exercise stays reachable for everyone,
 *   · an edit is respected permanently (the seed never re-asserts),
 *   · disliked starts empty for everyone and SUBSTITUTES rather than deletes.
 */

/** Land on the preference step with a chosen draft already in the store (resume-style visit). */
async function openPrefsWithDraft(page: Page, draft: Record<string, unknown>): Promise<void> {
  const state = {
    ...bareCompletedState(),
    completedAt: null,
    onboardingStep: 'exercise_prefs',
    draft: { ...DEFAULT_DRAFT, ...draft },
  };
  await page.goto('/onboarding/welcome');
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    },
    { key: DEMO_STORAGE_KEY, value: JSON.stringify(state) },
  );
  await page.goto('/onboarding/exercise_prefs');
  await expect(page.getByTestId('prefs-step')).toBeVisible();
}

const trayRows = (page: Page) => page.locator('[data-testid^="prefs-tray-row-"]');

test.describe('exercise preferences — ranked top-5 picker', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('pre-fill differs by sex, names its provenance, and disliked starts empty for everyone', async ({
    page,
  }) => {
    // FEMALE — posterior chain INCLUDING back, hip thrust ranked #1.
    await openPrefsWithDraft(page, { sex: 'female' });
    await expect(trayRows(page)).toHaveCount(5);
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-barbell-hip-thrust',
    );
    // Back work is in the female seed — the "not just glutes" correction from the research.
    await expect(page.getByTestId('prefs-tray-row-lat-pulldown')).toBeVisible();
    await expect(page.getByTestId('prefs-seed-banner')).toContainText(
      'A starting point, not a verdict.',
    );
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('among women');
    // Disliked: EMPTY, with the substitute-not-delete promise spelled out.
    await page.getByTestId('prefs-mode-disliked').click();
    await expect(trayRows(page)).toHaveCount(0);
    await expect(page.getByText('We never just delete it.')).toBeVisible();

    // MALE — bench first, provenance says men.
    await openPrefsWithDraft(page, { sex: 'male' });
    await expect(trayRows(page)).toHaveCount(5);
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-bench-press',
    );
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('among men');
    await page.getByTestId('prefs-mode-disliked').click();
    await expect(trayRows(page)).toHaveCount(0);

    // UNKNOWN sex (the real first-pass case — sex is asked later at body metrics): the NEUTRAL
    // seed, framed as coverage rather than a guess about the person.
    await openPrefsWithDraft(page, { sex: null });
    await expect(trayRows(page)).toHaveCount(5);
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('all-round lifts');
    await expect(page.getByTestId('prefs-seed-banner')).toContainText(
      'squat, hinge, push, pull and carry',
    );

    // 390 × 664 contract: the step never scrolls sideways, and the CTA lives in the shell dock.
    const overflow = await pageOverflow(page);
    expect(overflow.horizontal).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('onboarding-dock')).toBeVisible();
    await expect(page.getByTestId('onboarding-continue')).toBeVisible();
  });

  test('the pre-fill is editable — remove, re-add, promote — and the edit sticks across visits', async ({
    page,
  }) => {
    await openPrefsWithDraft(page, { sex: 'female' });
    await expect(trayRows(page)).toHaveCount(5);

    // Remove the #1 seed pick. The banner collapses to the "you're in control" footnote.
    await page.getByTestId('prefs-remove-barbell-hip-thrust').click();
    await expect(trayRows(page)).toHaveCount(4);
    await expect(page.getByTestId('prefs-seed-banner')).toHaveCount(0);
    await expect(page.getByTestId('prefs-seed-footnote')).toBeVisible();

    // The removed exercise is offered back in the suggestion grid; re-adding appends at rank 5 —
    // order of tap IS the rank.
    await page.getByTestId('prefs-card-barbell-hip-thrust').click();
    await expect(trayRows(page)).toHaveCount(5);
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-romanian-deadlift',
    );
    await expect(trayRows(page).nth(4)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-barbell-hip-thrust',
    );

    // Promote row 2 (goblet squat) — single control, swaps with the row above.
    await page.getByTestId('prefs-promote-goblet-squat').click();
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-goblet-squat',
    );
    await expect(trayRows(page).nth(1)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-romanian-deadlift',
    );
    // Row 1's promote is a dead end, not a wraparound.
    await expect(page.getByTestId('prefs-promote-goblet-squat')).toBeDisabled();

    // Continue persists the answer; a FRESH visit to the step must show the edited ranking and
    // must NOT re-assert the female seed (hip thrust stays at rank 5).
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/onboarding\/split/);
    await page.goto('/onboarding/exercise_prefs');
    await expect(trayRows(page)).toHaveCount(5);
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-goblet-squat',
    );
    await expect(trayRows(page).nth(4)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-barbell-hip-thrust',
    );
    await expect(page.getByTestId('prefs-seed-banner')).toHaveCount(0);

    // "Clear all five" also sticks: a deliberately empty list is an answer, not a missing one.
    for (const slug of [
      'goblet-squat',
      'romanian-deadlift',
      'lat-pulldown',
      'walking-lunge',
      'barbell-hip-thrust',
    ]) {
      await page.getByTestId(`prefs-remove-${slug}`).click();
    }
    await expect(trayRows(page)).toHaveCount(0);
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/onboarding\/split/);
    await page.goto('/onboarding/exercise_prefs');
    await expect(page.getByTestId('prefs-step')).toBeVisible();
    await expect(trayRows(page)).toHaveCount(0);
    await expect(page.getByTestId('prefs-seed-banner')).toHaveCount(0);
  });

  test('every exercise is reachable regardless of sex — the pre-fill is never a filter', async ({
    page,
  }) => {
    await openPrefsWithDraft(page, { sex: 'female' });
    await expect(trayRows(page)).toHaveCount(5);

    // The browse sheet lists the ENTIRE catalog — no sex-based subsetting anywhere.
    await page.getByTestId('prefs-browse-all').click();
    await expect(page.getByTestId('prefs-browse-sheet')).toBeVisible();
    const sheetRows = page.locator('[data-testid^="prefs-sheet-row-"]');
    expect(await sheetRows.count()).toBe(91);

    // A woman who wants to bench reaches it in one tap. The list is full, so first free a slot
    // (tapping a selected row toggles it out), then add bench press.
    await page.getByTestId('prefs-sheet-row-walking-lunge').click();
    await page.getByTestId('prefs-sheet-row-bench-press').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('prefs-browse-sheet')).toHaveCount(0);
    await expect(page.getByTestId('prefs-tray-row-bench-press')).toBeVisible();
    await expect(trayRows(page)).toHaveCount(5);
  });

  test('a disliked exercise is SUBSTITUTED in the generated plan, never deleted', async ({
    page,
  }) => {
    const backSquat = {
      id: 'ex-barbell-back-squat',
      slug: 'barbell-back-squat',
      name: 'Barbell Back Squat',
    };
    // Pin the split so the liked/disliked signal cannot change the program shape between runs —
    // this test is about slot substitution, not split scoring.
    const base = {
      experience_level: 'intermediate',
      days_per_week: 4,
      split_slug: 'upper-lower-4',
      training_location: 'commercial_gym',
      exercise_prefs_source: 'custom',
    };

    // Baseline: LIKED back squat → it is selected into the plan.
    await seedDraft(page, {
      ...base,
      liked_exercises: [backSquat],
      disliked_exercises: [],
    });
    const withLiked = await regenerateFromSettings(page);
    const likedNames = withLiked.days.flatMap((d) => d.names);
    expect(likedNames).toContain('Barbell Back Squat');
    const likedTotal = withLiked.days.reduce((n, d) => n + d.count, 0);

    // Same profile, back squat DISLIKED: the lift goes, the slot does not — an easier
    // same-pattern movement stands in and the day keeps its size.
    await seedDraft(page, {
      ...base,
      liked_exercises: [],
      disliked_exercises: [backSquat],
    });
    const withDisliked = await regenerateFromSettings(page);
    const dislikedNames = withDisliked.days.flatMap((d) => d.names);
    expect(dislikedNames).not.toContain('Barbell Back Squat');
    const dislikedTotal = withDisliked.days.reduce((n, d) => n + d.count, 0);
    // Nothing was deleted: the week holds exactly as many exercises as the baseline.
    expect(dislikedTotal).toBe(likedTotal);
    // The squat pattern is still trained — by an easier stand-in from the substitution ladder.
    const easierSquats = [
      'Goblet Squat',
      'Leg Press',
      'Bodyweight Squat',
      'Front Squat',
      'Hack Squat',
      'Bulgarian Split Squat',
      'Dumbbell Bulgarian Split Squat',
    ];
    expect(dislikedNames.some((n) => easierSquats.some((s) => n.includes(s)))).toBe(true);
  });

  /**
   * REGRESSION — the sexed seed used to be unreachable for the only user who matters here: a
   * first-timer. `sex` was written for the first time at body metrics, SIX screens after this one,
   * so every new athlete got the neutral five and the male/female lists never rendered for anyone.
   */
  test('the tailoring control re-seeds on a FIRST pass, and never overwrites an edit', async ({
    page,
  }) => {
    // A genuine first-pass draft: no sex answered yet → the neutral seed.
    await openPrefsWithDraft(page, { sex: null });
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('all-round lifts');
    await expect(page.getByTestId('prefs-tray-row-barbell-hip-thrust')).toHaveCount(0);

    // Answering it HERE re-seeds immediately — this is the whole point of the control.
    await page.getByTestId('prefs-tailor-female').click();
    await expect(trayRows(page)).toHaveCount(5);
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-barbell-hip-thrust',
    );
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('among women');

    // Changing the answer re-seeds again — an untouched seed is ours to redraw.
    await page.getByTestId('prefs-tailor-male').click();
    await expect(trayRows(page).nth(0)).toHaveAttribute('data-testid', 'prefs-tray-row-bench-press');
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('among men');

    // Declining is an ANSWER, not a gap: it yields the neutral seed rather than leaving the male one.
    await page.getByTestId('prefs-tailor-prefer_not_to_say').click();
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('all-round lifts');

    // THE GUARDRAIL. Once the athlete edits, the control disappears and no later sex answer may
    // ever redraw their list — the pre-fill is a suggestion, and an edit ends the conversation.
    await page.getByTestId('prefs-tailor-female').click();
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-barbell-hip-thrust',
    );
    await page.getByTestId('prefs-remove-barbell-hip-thrust').click();
    await expect(trayRows(page)).toHaveCount(4);
    await expect(page.getByTestId('prefs-tailor')).toHaveCount(0);
    await expect(page.getByTestId('prefs-seed-footnote')).toBeVisible();
  });

  /**
   * REGRESSION — the other half of the same bug. Answering sex at body metrics used to be silently
   * ignored because the first seed to land locked the list forever, so coming BACK to this screen
   * still showed the neutral five. Re-seeding is keyed on provenance now, not emptiness.
   */
  test('a sex answered later upgrades an untouched seed on return', async ({ page }) => {
    await openPrefsWithDraft(page, { sex: null });
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('all-round lifts');

    // Walk forward WITHOUT touching the list — the neutral seed is persisted as-is.
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/onboarding\/split/);

    // Answer sex where the flow actually asks for it, then come back. Continue is what COMMITS the
    // draft to storage (`patch` alone is React state), so a bare `goto` here would drop the answer
    // and test nothing.
    await page.goto('/onboarding/body_metrics');
    await page.getByRole('button', { name: 'Female', exact: true }).click();
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/onboarding\/nutrition_prefs/);
    await page.goto('/onboarding/exercise_prefs');

    await expect(trayRows(page)).toHaveCount(5);
    await expect(trayRows(page).nth(0)).toHaveAttribute(
      'data-testid',
      'prefs-tray-row-barbell-hip-thrust',
    );
    await expect(page.getByTestId('prefs-seed-banner')).toContainText('among women');
  });
});

/**
 * Land on the plan preview with a chosen draft already in the store.
 *
 * It seeds the step BEFORE the preview and clicks through, rather than loading /plan_preview
 * directly. That is not fussiness: the preview generates and persists the plan from `draft` in a
 * mount effect, and on a cold page load that effect runs before the provider has rehydrated, so a
 * direct visit builds the plan from the DEFAULT draft. Arriving by client-side navigation is both
 * the real user path and the only one where the seeded answers are actually in hand.
 */
async function openPlanPreview(page: Page, draft: Record<string, unknown>): Promise<void> {
  const state = {
    ...bareCompletedState(),
    completedAt: null,
    onboardingStep: 'targets_review',
    // Pre-answered targets only so that step's Continue is enabled — it is the vehicle here, not
    // the subject.
    draft: {
      ...DEFAULT_DRAFT,
      kcal_target: 2400,
      protein_g_target: 160,
      carbs_g_target: 260,
      fat_g_target: 80,
      targets_source: 'custom',
      ...draft,
    },
  };
  await page.goto('/onboarding/welcome');
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    },
    { key: DEMO_STORAGE_KEY, value: JSON.stringify(state) },
  );
  await page.goto('/onboarding/targets_review');
  await expect(page.getByTestId('onboarding-continue')).toBeEnabled();
  await page.getByTestId('onboarding-continue').click();
  await page.waitForURL(/\/onboarding\/plan_preview/);
  await expect(page.getByTestId('plan-week-summary')).toBeVisible();
}

test.describe('the plan preview explains what it did to you', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  /**
   * REGRESSION — "if no substitute exists, keep the original and SAY SO" was computed and then
   * never rendered: every consumer gated the note behind `coverage.limited`, which generation
   * deliberately keeps it out of. A disliked lift silently stayed in the plan with no explanation
   * anywhere, which is the exact hole the copy was written to close.
   */
  test('a dislike that could not be swapped is named, and does not fire the "running lean" banner', async ({
    page,
  }) => {
    const rdl = { id: 'ex-romanian-deadlift', slug: 'romanian-deadlift', name: 'Romanian Deadlift' };
    // A thin home kit: nothing in the catalogue trains the hinge more easily than the RDL here, so
    // the honest outcome is to KEEP it — and to say why.
    await openPlanPreview(page, {
      experience_level: 'beginner',
      days_per_week: 3,
      split_slug: 'full-body-3',
      training_location: 'home',
      equipment_slugs: ['dumbbell', 'bench', 'bodyweight'],
      exercise_prefs_source: 'custom',
      liked_exercises: [],
      disliked_exercises: [rdl],
    });

    const note = page.getByTestId('plan-kept-dislikes');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Romanian Deadlift');
    // It must point at the step that would ACTUALLY remove it, not pretend it was swapped.
    await expect(note).toContainText('protected');
    // And it is a much smaller thing than a thinned plan — it may not borrow that banner.
    await expect(page.getByTestId('plan-limited-notice')).toHaveCount(0);
  });

  /**
   * REGRESSION — the sex-adjusted rest/rep numbers shipped with no label. `sexAdjustedPrescription`
   * returns the reason precisely so they cannot, and every caller had been ignoring it: a woman saw
   * different figures from the defaults with nothing on screen saying why.
   */
  test('sex-adjusted rest and reps carry their reason', async ({ page }) => {
    const base = {
      primary_goal: 'hypertrophy',
      experience_level: 'beginner',
      days_per_week: 3,
      split_slug: 'full-body-3',
      training_location: 'commercial_gym',
    };

    await openPlanPreview(page, { ...base, sex: 'female' });
    const note = page.getByTestId('plan-prescription-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('shorter rest');
    // The label must also say the numbers are the athlete's to change — a default, not a verdict.
    await expect(note).toContainText('defaults you can change');

    // Nothing was adjusted for anyone else, so there is nothing to explain and no note.
    await openPlanPreview(page, { ...base, sex: 'male' });
    await expect(page.getByTestId('plan-prescription-note')).toHaveCount(0);
  });

  /** The label belongs next to the CONTROLS that change the numbers, not only next to the values. */
  test('the routine editor repeats the reason where the numbers are actually edited', async ({
    page,
  }) => {
    await openPlanPreview(page, {
      primary_goal: 'hypertrophy',
      experience_level: 'beginner',
      days_per_week: 3,
      split_slug: 'full-body-3',
      training_location: 'commercial_gym',
      sex: 'female',
    });
    // Finish onboarding so the routine exists in the store, then open its editor.
    await page.getByTestId('onboarding-continue').click();
    await page.waitForURL(/\/today/);
    await page.goto('/routines/demo');

    const note = page.getByTestId('routine-prescription-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('defaults you can change');
    // Once, not once per exercise row.
    await expect(note).toHaveCount(1);
  });
});
