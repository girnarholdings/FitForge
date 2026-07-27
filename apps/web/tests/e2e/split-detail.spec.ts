import { test, expect, type Page } from '@playwright/test';
import { completeOnboarding, readDemoState, resetDemo, pageOverflow } from './helpers';

/**
 * "The splits are very hard to look at properly because even in onboarding the details are cut out,
 * it's just summary."
 *
 * The split card used to be a truncated name, a one-line blurb and a truncated day strip. These
 * tests hold the line on the three things that fix has to keep being true:
 *
 *   1. The detail is REACHABLE — an expander on every card, in onboarding AND in "Browse all".
 *   2. The detail is REAL — the exercises it previews are exactly the ones generation produces for
 *      that program. A card that shows plausible-looking exercises which then do not appear in the
 *      plan is worse than the truncation it replaced.
 *   3. Nothing is truncated or off-screen at 390 × 664, and the CTA is never covered.
 */
test.use({ viewport: { width: 390, height: 664 } });

/** The recommended-splits radiogroup on the onboarding step. */
function splitCards(page: Page) {
  return page
    .getByRole('radiogroup', { name: 'Recommended training splits' })
    .getByRole('radio');
}

test.describe('split detail', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('a split card opens the whole week: days, exercises, sets, reps, minutes and muscles', async ({
    page,
  }) => {
    await page.goto('/onboarding/split/');
    await expect(page.getByRole('heading', { name: 'Pick your training split' })).toBeVisible();

    const card = splitCards(page).first();
    const slug = await card.getAttribute('data-split-slug');
    expect(slug).toBeTruthy();
    const id = `split-option-${slug}`;

    // The card the assertions below open is NOT the preselected one, so "reading did not select"
    // is a real observation rather than a tautology about an already-checked radio.
    const unpicked = splitCards(page).nth(1);
    await expect(unpicked).toHaveAttribute('aria-checked', 'false');

    // 1 · The detail is a DISCLOSURE and starts closed, so the list still scans at a glance.
    const toggle = page.getByTestId(`${id}-toggle`);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId(`${id}-detail`)).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = page.getByTestId(`${id}-detail`);
    await expect(detail).toBeVisible();

    // 2 · Every reason the recommender gave, not just the first — the card used to drop the rest.
    await expect(detail.getByTestId(`${id}-reasons`).locator('li').first()).toBeVisible();

    // 3 · The week in numbers, pluralised. "1 sets" / "1 days" is the same defect class as the
    // "1 exercises" the generation regression suite already guards.
    const week = page.getByTestId(`${id}-week-summary`);
    await expect(week).toContainText(/\b\d+ days? a week\b/);
    await expect(week).toContainText(/\b\d+ sets?\b/);
    await expect(week).toContainText(/about \d+ min/);
    const weekText = await week.innerText();
    expect(weekText).not.toMatch(/\b1 sets\b/);
    expect(weekText).not.toMatch(/\b1 days\b/);

    // 4 · What the WEEK trains — counted AND drawn. A list of nine muscle names is the slowest
    // possible answer to "what does this program train?"; the silhouette answers it at a glance and
    // is painted from the same weighted-set aggregation, so the two can never disagree.
    await expect(page.getByTestId(`${id}-week-muscles`).locator('li').first()).toContainText(/\d/);
    await expect(
      page.getByTestId(`${id}-week-map`).getByRole('img', { name: /Target muscles:/ }),
    ).toBeVisible();

    // 5 · Day by day — the part that did not exist at all. Each day carries its own muscle map,
    // its own minute estimate and its own exercise list with real sets × rep ranges.
    const day0 = page.getByTestId(`${id}-day-0`);
    await expect(day0).toBeVisible();
    await expect(day0.getByRole('img', { name: /Target muscles:/ })).toBeVisible();
    const dayStats = page.getByTestId(`${id}-day-0-stats`);
    await expect(dayStats).toContainText(/\b\d+ sets?\b/);
    await expect(dayStats).toContainText(/~\d+ min/);
    // No leading \b — chip text concatenates in textContent ("~46 min5 exercises"), so there is
    // no word boundary in front of the digit.
    await expect(dayStats).toContainText(/\d+ exercises?\b/);
    // Pluralisation, the "no erroneous entries" bar: "1 sets" is the same defect as the "1
    // exercises" the generation regression suite already guards on /routines.
    expect(await dayStats.innerText()).not.toMatch(/\b1 (sets|exercises)\b/);
    await expect(page.getByTestId(`${id}-day-0-exercise-0`)).toContainText(/\d+ × \d+–\d+/);

    // 6 · How it advances, and what kit it wants — both present on the Workouts screen and both
    // previously missing from the screen where the choice is actually made.
    await expect(page.getByTestId(`${id}-progression`)).not.toBeEmpty();
    await expect(page.getByTestId('split-option-' + slug + '-detail')).toContainText(
      'What you need',
    );

    // 7 · Phone fit: no sideways scroll, and the CTA is still reachable in its own dock.
    expect((await pageOverflow(page)).horizontal).toBe(0);
    await expect(page.getByTestId('onboarding-continue')).toBeVisible();

    // 8 · It closes again.
    await toggle.click();
    await expect(page.getByTestId(`${id}-detail`)).toHaveCount(0);

    // 9 · Opening a card must never select anything — reading is not committing. The expander is a
    // sibling of the radio precisely so a tap on it cannot be swallowed by the option, and a plain
    // tap on the option body must still select (which is what the split spec relies on).
    const unpickedSlug = await unpicked.getAttribute('data-split-slug');
    await page.getByTestId(`split-option-${unpickedSlug}-toggle`).click();
    await expect(page.getByTestId(`split-option-${unpickedSlug}-detail`)).toBeVisible();
    await expect(unpicked).toHaveAttribute('aria-checked', 'false');
    await unpicked.click();
    await expect(unpicked).toHaveAttribute('aria-checked', 'true');
  });

  test('one card at a time stays open, so two programs never fight for a 664px screen', async ({
    page,
  }) => {
    await page.goto('/onboarding/split/');
    const cards = splitCards(page);
    expect(await cards.count()).toBeGreaterThan(1);
    const a = `split-option-${await cards.nth(0).getAttribute('data-split-slug')}`;
    const b = `split-option-${await cards.nth(1).getAttribute('data-split-slug')}`;

    await page.getByTestId(`${a}-toggle`).click();
    await expect(page.getByTestId(`${a}-detail`)).toBeVisible();
    await page.getByTestId(`${b}-toggle`).click();
    await expect(page.getByTestId(`${b}-detail`)).toBeVisible();
    await expect(page.getByTestId(`${a}-detail`)).toHaveCount(0);
  });

  test('in onboarding the preview promises the right SHAPE and says what it is still guessing', async ({
    page,
  }) => {
    // Onboarding asks about location, equipment and protected areas AFTER the split step, so at
    // that point the exercise names are what a well-equipped gym would give — an illustration, not
    // a promise. The card has to SAY that (quoting a barbell lift to someone one screen away from
    // telling us they own two dumbbells is the confident-wrong-answer failure mode), while the
    // thing it genuinely can promise — the shape of the week — has to hold all the way through.
    let chosenSlug = '';
    let previewDays = 0;

    await completeOnboarding(page, {
      onSplit: async (p) => {
        const target = splitCards(p).nth(1);
        chosenSlug = (await target.getAttribute('data-split-slug')) ?? '';
        expect(chosenSlug).not.toBe('');
        await target.click();

        const id = `split-option-${chosenSlug}`;
        await p.getByTestId(`${id}-toggle`).click();
        await expect(p.getByTestId(`${id}-detail`)).toBeVisible();
        await expect(p.getByTestId(`${id}-provisional`)).toBeVisible();

        previewDays = await p.getByTestId(`${id}-days`).locator('> li').count();
        expect(previewDays).toBeGreaterThan(0);

        const rows = await p
          .getByTestId(`${id}-days`)
          .locator('li[data-testid*="-exercise-"]')
          .allInnerTexts();
        expect(rows.length).toBeGreaterThan(0);
        // Every previewed row carries a real prescription, never a bare name.
        expect(rows.every((t) => /\d+ × \d+–\d+/.test(t))).toBe(true);
      },
    });

    const state = await readDemoState(page);
    const routine = (state as {
      routine: { days: { exercises: { exercise_name: string }[] }[] };
    }).routine;
    expect(routine.days.length).toBe(previewDays);
    expect(routine.days.reduce((n, d) => n + d.exercises.length, 0)).toBeGreaterThan(0);
  });

  test('the same detail is available from "Browse all", not just the four recommendations', async ({
    page,
  }) => {
    await page.goto('/onboarding/split/');
    await page.getByTestId('split-browse-all').click();
    const sheet = page.getByTestId('split-library');
    await expect(sheet).toBeVisible();

    const card = sheet.getByRole('radio').first();
    const slug = await card.getAttribute('data-split-slug');
    const id = `split-option-${slug}`;

    await sheet.getByTestId(`${id}-toggle`).click();
    const detail = sheet.getByTestId(`${id}-detail`);
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId(`${id}-day-0`)).toContainText(/~\d+ min/);
    await expect(sheet.getByTestId(`${id}-progression`)).not.toBeEmpty();
    expect((await pageOverflow(page)).horizontal).toBe(0);
  });

  test('the plan preview shows each day in full — no clipped names, no discarded stats', async ({
    page,
  }) => {
    // The LAST screen of onboarding, and the last one still answering "what am I committing to?"
    // with a truncated line. It computed a full `dayStats` per day and rendered two fields of it,
    // then clipped both the day name and the summary with `truncate`. These assertions hold the
    // line on all three halves of that fix: nothing clipped, the numbers shown, patterns unabridged.
    await completeOnboarding(page, {
      onPlanPreview: async (p) => {
        // 1 · The week, in the currency the app's targets are actually expressed in.
        await expect(p.getByText('sets / week')).toBeVisible();
        const weekSummary = p.getByTestId('plan-week-summary');
        await expect(weekSummary).toContainText(/\d+ exercises? across the week/);
        await expect(weekSummary).toContainText(/about \d+ min/);
        expect(await weekSummary.innerText()).not.toMatch(/\b1 exercises\b/);

        // 2 · NOTHING ON THE DAY FACE IS CLIPPED. Measured, not eyeballed: `truncate` leaves
        // scrollWidth past clientWidth, which is exactly the "the details are cut out" defect.
        const clipped = (el: Element) => el.scrollWidth > el.clientWidth + 1;
        await expect(p.getByTestId('plan-day-name-0')).toBeVisible();
        expect(await p.getByTestId('plan-day-name-0').evaluate(clipped)).toBe(false);
        const summary = p.getByTestId('plan-day-summary-0');
        await expect(summary).toBeVisible();
        expect(await summary.evaluate(clipped)).toBe(false);
        expect(await summary.innerText()).not.toMatch(/\b1 exercises\b/);

        // 3 · The hard-set count and the minute estimate were derived and thrown away on the one
        // screen where "can I actually do this week?" is the question being asked.
        const stats = p.getByTestId('plan-day-stats-0');
        await expect(stats).toContainText(/\b\d+ sets?\b/);
        await expect(stats).toContainText(/~\d+ min/);
        expect(await stats.innerText()).not.toMatch(/\b1 sets\b/);

        // 4 · The first day opens by default, with real prescriptions and unabridged coverage.
        const detail = p.getByTestId('plan-day-detail-0');
        await expect(detail).toBeVisible();
        await expect(detail).toContainText(/\d+ × \d+–\d+/);
        await expect(p.getByTestId('plan-day-patterns-0')).toContainText(/^Covers /);

        // 5 · …and it is a real disclosure, so a seven-day plan still fits a 390 × 664 phone.
        await p.getByTestId('plan-day-toggle-0').click();
        await expect(p.getByTestId('plan-day-detail-0')).toHaveCount(0);

        // 6 · Phone fit: no sideways scroll, CTA still docked and reachable.
        expect((await pageOverflow(p)).horizontal).toBe(0);
        await expect(p.getByTestId('onboarding-continue')).toBeVisible();
      },
    });
  });

  test('the Workouts "Change split" sheet previews against the real, finished profile', async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page.goto('/routines');
    await page.getByTestId('change-split').click();
    const sheet = page.getByTestId('split-library');
    await expect(sheet).toBeVisible();

    const card = sheet.getByRole('radio').first();
    const slug = await card.getAttribute('data-split-slug');
    const id = `split-option-${slug}`;
    await sheet.getByTestId(`${id}-toggle`).click();
    await expect(sheet.getByTestId(`${id}-day-0-exercise-0`)).toContainText(/\d+ × \d+–\d+/);

    // Onboarding is finished, so nothing here is a guess any more — the provisional caveat that
    // the split STEP shows must be gone.
    await expect(sheet.getByTestId(`${id}-provisional`)).toHaveCount(0);

    // THE HONESTY GUARANTEE, in the one place it can be checked exactly: with the profile complete,
    // the exercises the card previewed must be precisely the ones applying the split produces. The
    // preview runs the same pure generator `applySplit` runs, so any drift here means the card is
    // showing training data the athlete will never actually be given.
    const previewed = (
      await sheet.getByTestId(`${id}-days`).locator('li[data-testid*="-exercise-"]').allInnerTexts()
    ).map((t) => t.split('\n')[0]!.replace(/^\d+\.\s*/, '').trim());
    expect(previewed.length).toBeGreaterThan(0);

    await card.click();
    await expect(sheet).toHaveCount(0);

    const state = await readDemoState(page);
    const routine = (state as {
      routine: { days: { exercises: { exercise_name: string }[] }[] };
    }).routine;
    const built = routine.days.flatMap((d) => d.exercises.map((e) => e.exercise_name));
    expect(built).toEqual(previewed);
  });
});
