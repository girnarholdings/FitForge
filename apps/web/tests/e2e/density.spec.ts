import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded, pageOverflow, signInFakeUser, openSettings} from './helpers';

/**
 * DENSITY — measured, because "too big" is a measurement.
 *
 * Three complaints, three assertions, all geometric rather than visual:
 *   · the ring read-outs ("4g / PROTEIN LEFT") ran into the ring stroke;
 *   · Today and Nutrition read zoomed-in at the house type scale;
 *   · the bottom bar took more height than its content needed.
 *
 * The ring test is the one that could not be caught by eye at review time: it depends on the
 * rendered advance width of a particular string in a particular face, so it is asserted against
 * the SVG's own `getComputedTextLength` and the ring's actual inner diameter.
 */

/** Font size in px of a testid, as resolved by the cascade (which is where `ff-dense` acts). */
async function fontSizePx(page: Page, testId: string): Promise<number> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
}

test.describe('density', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('the day-summary header fits its card: hero numeral and heat bar, no overflow', async ({
    page,
  }) => {
    /* The rings this test used to measure are GONE — the finish review retired the donut-gauge
       header for the heat grammar (hero kcal numeral + heat bars). What still deserves a
       measured guarantee is the same failure class in the new form: the display-face numeral and
       its trailing label sharing one row without wrapping or escaping the card. */
    await page.goto('/nutrition');
    const summary = page.getByTestId('day-summary');
    await expect(summary).toBeVisible();

    const m = await summary.evaluate((card) => {
      const cardBox = card.getBoundingClientRect();
      const numeral = card.querySelector('p');
      const numeralBox = numeral?.getBoundingClientRect();
      const bars = [...card.querySelectorAll('.ff-heat, dl [style*="scaleX"]')].length;
      return {
        cardRight: cardBox.right,
        numeralRight: numeralBox?.right ?? 0,
        numeralFont: numeral ? parseFloat(getComputedStyle(numeral).fontSize) : 0,
        overflowX: card.scrollWidth > card.clientWidth + 1,
        bars,
      };
    });

    // Hero numeral at genuine display scale, inside the card, and nothing scrolls sideways.
    expect(m.numeralFont).toBeGreaterThanOrEqual(28);
    expect(m.numeralRight).toBeLessThanOrEqual(m.cardRight);
    expect(m.overflowX, 'day-summary must not overflow horizontally').toBe(false);
    // The heat grammar is present: the kcal bar plus three macro rows.
    expect(m.bars).toBeGreaterThanOrEqual(4);
    // And no donut gauge came back.
    expect(await summary.locator('svg circle').count(), 'rings are retired').toBe(0);
  });

  test('Today and Nutrition render at the dense type scale', async ({ page }) => {
    // The house scale is 16px body / 28px display; dense is 15 / 24. Asserting the RESOLVED size
    // proves the cascade reached the leaves, which is the part that would silently break if the
    // wrapper class were dropped or the token renamed.
    await page.goto('/nutrition');
    await expect(page.getByTestId('nutrition-view')).toBeVisible();
    const nutritionHeading = await page
      .getByRole('heading', { name: 'Nutrition' })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(nutritionHeading).toBeLessThanOrEqual(25);

    await page.goto('/today');
    await expect(page.getByTestId('today-view')).toBeVisible();
    const todayHeading = await fontSizePx(page, 'today-heading');
    expect(todayHeading).toBeLessThanOrEqual(25);
    // …and the supporting line came down with it rather than staying at the old body size.
    expect(await fontSizePx(page, 'today-subheading')).toBeLessThanOrEqual(13.5);

    // A screen NOT opted in keeps the house scale — this is a per-screen choice, not a sneaky
    // global restyle, and the assertion is what stops it becoming one.
    await page.goto('/progress');
    const progressHeading = await page
      .getByRole('heading', { name: 'Progress' })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(progressHeading).toBeGreaterThan(25);
  });

  test('the bottom bar is compact, and every tab still clears 44px to a finger', async ({
    page,
  }) => {
    await page.goto('/today');
    const bar = page.getByTestId('tab-bar');
    await expect(bar).toBeVisible();

    // The pill row itself — not the positioning layer, which also holds the Coach badge.
    const row = bar.locator('ul');
    const rowBox = (await row.boundingBox())!;
    expect(rowBox.height, 'the tab row is compact').toBeLessThanOrEqual(54);

    // COMPACT MUST NOT MEAN SMALL TO A THUMB. Each of the five tabs keeps a 44px-wide target,
    // which is what the shortening could plausibly have cost.
    for (const label of ['today', 'workouts', 'exercises', 'nutrition', 'progress']) {
      const box = (await page.getByTestId(`tab-${label}`).boundingBox())!;
      expect(box.width, `${label} tab width`).toBeGreaterThanOrEqual(44);
    }

    // The whole floating stack (Coach badge + bar + safe area) leaves the page usable.
    const navBox = (await bar.boundingBox())!;
    expect(navBox.height, 'the floating nav stack').toBeLessThanOrEqual(130);
    expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);

    // A viewport shot, because `fullPage` hoists fixed chrome out of the fold and never captures
    // this bar where it actually lives.
    await page.screenshot({ path: 'tests/screenshots/tab-bar-compact.png' });
  });

  test('every percentage on the nutrition screen means % of a GOAL', async ({ page }) => {
    /**
     * THE CARDINAL-SIN GUARD. The deleted visual showed each macro's share of CONSUMED energy
     * against the share the plan wants — so 20 g of protein and nothing else rendered as "89%,
     * plan 26%", reading as triumphantly on-plan while 105 g short. It sat directly beneath
     * "Protein 121/125 g · 97%", so the same word and the same `%` sign carried two meanings a
     * thumb-width apart.
     *
     * The invariant, asserted rather than trusted: for any macro name paired with a percentage on
     * this screen, that percentage must be consistent with progress toward the target — never a
     * share of energy. The gaps list therefore states GRAMS TO GO, and the only percentages left
     * belong to the summary rows (x/y g) and the by-meal split (explicitly "% of day").
     */
    await page.goto('/nutrition');
    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await page.getByTestId('composer-submit').click();
    await page.getByTestId('review-confirm').click();

    const analytics = page.getByTestId('day-analytics');
    await expect(analytics).toBeVisible();

    /**
     * NO SECOND COPY OF THE SUMMARY. This card used to open with its own per-macro bars ("Protein
     * 110 g to go") sitting directly under the summary's ("Protein 15 / 125 g · 12%") — the same
     * three facts in the same shape, one subtraction apart. The duplicate is gone, and this is what
     * keeps it gone: the analytics card may talk about protein (it is closing that gap) but must not
     * restate carbs and fat progress, and must carry no "eaten / target" row of its own.
     */
    const analyticsText = await analytics.innerText();
    expect(analyticsText, 'the card must not re-run the summary per-macro list').not.toMatch(
      /\d+\s*\/\s*\d+\s*g/,
    );
    for (const macro of ['Carbs', 'Fat']) {
      expect(analyticsText, `${macro} progress belongs to the summary card alone`).not.toContain(
        macro,
      );
    }
    // What it says instead: the gap as MEALS, which is the reframe.
    await expect(page.getByTestId('meals-left')).toContainText(/\d+ more meals?/);

    /* Cross-check the one place both cards describe protein: the summary's percentage must equal
       eaten/target, which is what makes it safe to sit above a grams-to-go figure. Two eggs is
       ~12.6 g against a 3-figure target, so a share-of-energy number (~35%) and a share-of-goal
       number (~10%) are far apart — this assertion would have caught the old visual. */
    const summaryText = await page.getByTestId('day-summary').innerText();
    // `g10%` — innerText puts no whitespace between the row's value span and its percentage span.
    const row = summaryText.match(/Protein\s+(\d+)\s*\/\s*(\d+)\s*g\s*(\d+)%/);
    expect(row, `summary protein row parsed from:\n${summaryText}`).toBeTruthy();
    const [eaten, target, shown] = [Number(row![1]), Number(row![2]), Number(row![3])];
    expect(Math.abs(shown - Math.round((eaten / target) * 100))).toBeLessThanOrEqual(1);
  });

  test('the gap suggestions read as recommendations, not as food already logged', async ({
    page,
  }) => {
    // Three rows of foods with grams and macros, in a screen whose every other list is "what you
    // ate", read as a log. The heading, the "would add" phrasing and a labelled Add pill are what
    // separate the two — all three are asserted because any one of them alone was not enough.
    await page.goto('/nutrition');
    await page.getByTestId('nutrition-composer').fill('2 eggs');
    await page.getByTestId('composer-submit').click();
    await page.getByTestId('review-confirm').click();

    const gap = page.getByTestId('close-gap');
    await expect(gap).toContainText(/not logged yet/i);
    await expect(gap).toContainText(/tap to add/i);
    const suggestion = page.getByTestId('gap-suggestion').first();
    await expect(suggestion).toContainText(/Add/);

    /**
     * AND THE PORTION IS SOMETHING A PERSON WOULD EAT. The old row said "~150 g Whey protein
     * powder — would add 111 g protein", i.e. five scoops, because the portion was scaled to close
     * the whole remaining gap. Every row now leads with whole standard servings in the unit the food
     * is sold in, so the label is countable ("1 breast (172 g)", "2 scoops (62 g)") and the protein
     * it carries is a meal's worth, not a day's.
     */
    const rowText = await suggestion.innerText();
    // The portion label is countable: a number, a unit, and the grams in parentheses.
    expect(rowText, `portion label should read "N unit (N g)":\n${rowText}`).toMatch(
      /\d+\s+[A-Za-z][^()\n]*\(\d+ g\)/,
    );
    // The protein column stands alone on its own line. It is a MEAL's worth — the old row's 111 g
    // (five scoops of whey, scaled to close the whole day's gap) is what this number rules out.
    const proteinLine = rowText.match(/^(\d+) g$/m);
    expect(proteinLine, `expected a protein column in:\n${rowText}`).toBeTruthy();
    expect(Number(proteinLine![1]), 'no single portion is a whole day of protein').toBeLessThan(70);

    // The accessible name says what tapping does, for anyone who never sees the pill.
    await expect(suggestion).toHaveAttribute('aria-label', /^Add \d+ /);
  });
});

test.describe('settings · signed-in relevance', () => {
  test('a signed-in athlete is not told their data is browser-only, and cannot "sign out" into an erase', async ({
    page,
  }) => {
    // The session restore is a real async round trip through the SDK, and it happens before the
    // first assertion rather than inside it — so the budget has to cover both, not just the wait.
    test.setTimeout(90_000);
    /**
     * Signed in, the old screen said three untrue or dangerous things: a "Local Mode" heading over
     * their data, "Nothing is uploaded" (it is — that is the point of the account), and a second
     * "Sign out" button that actually erased the browser, one screen below the Account card's real
     * sign-out. Same word, opposite consequences.
     */
    /**
     * SIGN IN THROUGH THE SHARED HELPER, which does not return until the app confirms the restore.
     *
     * This test used to seed the persistence key and then `goto('/settings')` — a full reload, which
     * restarts the async session restore, so the first assertion raced it. When the race was lost
     * the page showed its (momentarily correct) signed-out copy and the failure read like a product
     * bug; it flaked locally and then in CI. The helper waits on the app's own signal and Settings is
     * reached by tapping the in-app link, so the signed-in state is settled before anything is read.
     */
    await seedOnboarded(page);
    const signedIn = await signInFakeUser(page, 'settings-uid-1');
    test.skip(!signedIn, 'build has no Firebase project — there is no signed-in state to test');

    await page.getByTestId('mobile-settings').click(); // opens the profile dropdown
    await page.getByTestId('profile-menu-settings').click();
    await openSettings(page);
    await page.waitForURL(/\/settings/);
    await expect(page.getByTestId('account-signed-in')).toBeVisible();

    const body = page.locator('main');
    await expect(body).toContainText('Your data');
    await expect(body).toContainText(/synced to your Google account/i);
    await expect(body, 'the browser-only promise is false for an account holder').not.toContainText(
      'Nothing is uploaded',
    );

    // The erase button states its true reach…
    await expect(page.getByTestId('erase-local-data')).toContainText(/everywhere/i);
    // …and the destructive look-alike "Sign out" is gone, leaving the account card's real one.
    await expect(page.getByTestId('demo-signout')).toHaveCount(0);
    await expect(page.getByTestId('signout')).toBeVisible();
  });

  test('signed out, the Local Mode language and its erase button are untouched', async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/settings');
    await openSettings(page);
    const body = page.locator('main');
    await expect(body).toContainText('Local Mode');
    await expect(body).toContainText('Nothing is uploaded');
    await expect(page.getByRole('button', { name: 'Erase Local Mode data' })).toBeVisible();
    await expect(page.getByTestId('demo-signout')).toBeVisible();
  });
});
