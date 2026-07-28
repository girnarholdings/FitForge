import { test, expect } from '@playwright/test';
import { pageOverflow, resetDemo, seedTrainingHistory, tapMuscle, seedOnboarded } from './helpers';

/**
 * Progress — the training-analytics surface (WS-B).
 *
 * Two populations are covered on purpose, because the honesty of this screen IS the feature:
 *   • a user WITH history gets real time-series and a plain-English verdict;
 *   • a user with NO history gets an explicitly-labelled projection and an empty state, never a
 *     zero-filled chart dressed up as history.
 */
test.describe('progress', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    // The (app) gate redirects non-onboarded visits to /onboarding/welcome, so
    // establish a completed onboarding before deep-linking into /progress.
    await seedOnboarded(page);
  });

  test('renders with weight chart and switchable tabs', async ({ page }) => {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();

    // Tabs are present.
    for (const label of ['Weight', 'Measurements', 'PRs', 'Photos']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // Switching to the PRs tab renders without error.
    await page.getByRole('button', { name: 'PRs', exact: true }).click();
    await expect(page.getByRole('button', { name: 'PRs', exact: true })).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/progress.png', fullPage: true });
  });

  /* ═══════════════════════════════════════════════════════ with real training history ══ */

  test.describe('with logged training history', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/progress');
      // ~5 weeks of progressively-heavier sessions written into the real workout-log slice.
      await seedTrainingHistory(page);
      await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
    });

    test('the Trends tab renders every time-series and the "how you’re doing" summary', async ({
      page,
    }) => {
      // Trends is the default tab, so the analytics are the first thing a returning user sees.
      await expect(page.getByTestId('progress-tab-trends')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('progress-trends')).toBeVisible();
      await expect(page.getByTestId('progress-trends-empty')).toHaveCount(0);

      /* 1 · the verdict — a real sentence, backed by the bullets beneath it. */
      const summary = page.getByTestId('progress-summary');
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('How you’re doing');
      const headline = (await page.getByTestId('progress-summary-headline').innerText()).trim();
      expect(headline.length).toBeGreaterThan(0);
      // With two-plus trained weeks logged, the verdict can no longer be the "no data" one.
      expect(headline).not.toContain('Just getting started');
      await expect(summary).toContainText(/Weekly volume (up|down|flat)/);
      await expect(summary).toContainText(/Consistency: \d+ of \d+ target days/);

      /* 2 · weekly volume columns, with a week-over-week pill and a tap read-out. */
      await expect(page.getByTestId('chart-weekly-volume')).toBeVisible();
      await expect(page.getByTestId('weekly-volume-trend')).toBeVisible();
      const volumeChart = page.getByTestId('weekly-volume-chart');
      await expect(volumeChart).toBeVisible();

      const bars = volumeChart.getByRole('button');
      const barCount = await bars.count();
      expect(barCount).toBeGreaterThan(1);
      // The final bar is the in-progress week, so tap the last COMPLETE one.
      const lastComplete = bars.nth(barCount - 2);
      const barLabel = (await lastComplete.getAttribute('aria-label')) ?? '';
      expect(barLabel).toMatch(/sets · \d+ session/);
      await lastComplete.click();
      await expect(page.getByTestId('chart-weekly-volume')).toContainText(barLabel.split(': ')[1]!);

      // The metric toggle redraws the same series against tonnage.
      await page.getByRole('button', { name: 'Tonnage', exact: true }).click();
      await expect(volumeChart.getByRole('button').first()).toHaveAttribute(
        'aria-label',
        /kg · \d+ sets/,
      );

      /* 3 · consistency vs the athlete's own target days. */
      const consistency = page.getByTestId('chart-consistency');
      await expect(consistency).toBeVisible();
      await expect(page.getByTestId('consistency-strip')).toBeVisible();
      await expect(consistency).toContainText(/hit your target in \d+ of \d+ trained weeks/);

      /* 4 · muscle-group balance over time, each group against its own goal. */
      const groups = page.getByTestId('chart-group-balance');
      await expect(groups).toBeVisible();
      await expect(groups).toContainText(/\d+% of goal/);

      /* 5 · strength — the seed adds 2.5 kg a session, so the e1RM trend must read UP. */
      await expect(page.getByTestId('chart-strength')).toBeVisible();
      await expect(page.getByTestId('strength-chart')).toBeVisible();
      await expect(page.getByTestId('strength-trend')).toContainText(/\+\d/);

      /* 6 · body weight is integrated here rather than duplicated. */
      await expect(page.getByTestId('chart-body-weight')).toBeVisible();

      // The stack scrolls vertically, but must never scroll sideways on a phone.
      expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);
    });

    test('the body heat view shows a % of goal legend and a muscle read-out on tap', async ({
      page,
    }) => {
      const heatCard = page.getByTestId('weekly-goal-heatmap');
      await expect(heatCard).toBeVisible();
      await expect(heatCard).toContainText('Weekly volume vs goal');

      // With history the view defaults to what was actually LOGGED, and offers the plan as a switch.
      await expect(heatCard).toContainText('last 7 days');
      await expect(page.getByTestId('heat-source-logged')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('heat-source-planned')).toBeVisible();

      // The legend is the continuous ramp, labelled in % of GOAL — not an arbitrary set count.
      const legend = page.getByTestId('heat-legend');
      await expect(legend).toBeVisible();
      for (const label of ['0%', '50%', '100%', '150%+']) {
        await expect(legend.getByText(label, { exact: true })).toBeVisible();
      }
      await expect(legend).toContainText('% of your weekly set goal');
      const gradient = await legend
        .locator('[style*="background-image"]')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(gradient).toContain('gradient');

      // Before a tap the detail slot is a prompt, not a fabricated number.
      const detail = page.getByTestId('muscle-goal-detail');
      await expect(detail).toContainText('Tap any muscle');

      // Tap a muscle the seeded history definitely trained (back squats → quads).
      await tapMuscle(page, 'quads');
      await expect(detail).toContainText('Quads');
      for (const stat of ['This week', 'Goal', 'Of goal']) {
        await expect(detail).toContainText(stat);
      }
      await expect(detail).toContainText(/\d+%/);
      await expect(page.getByTestId('muscle-goal-detail-status')).toHaveText(
        /(Not trained|Under-trained|Building|On target|Above target|Over target)/,
      );

      // Tapping the same muscle again clears it — a toggle, not a dead end.
      await tapMuscle(page, 'quads');
      await expect(detail).toContainText('Tap any muscle');

      // Switching the source to the plan keeps the legend and recolours the body.
      await page.getByTestId('heat-source-planned').click();
      await expect(heatCard).toContainText('planned week');
      await expect(page.getByTestId('heat-legend')).toBeVisible();

      expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);
    });
  });

  /* ═══════════════════════════════════════════════════════════ the honest empty state ══ */

  test('an empty-history user sees a labelled projection and an honest empty state, not fake data', async ({
    page,
  }) => {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();

    // The heat card is NOT blank — but it is explicitly the routine's PLAN, and it offers no
    // "last 7 days" source to switch to, because there is no logged week to show.
    const heatCard = page.getByTestId('weekly-goal-heatmap');
    await expect(heatCard).toBeVisible();
    await expect(heatCard).toContainText('planned week');
    await expect(heatCard).toContainText('No sets logged yet');
    await expect(heatCard).toContainText(/plans for a full\s+week/);
    await expect(page.getByTestId('heat-source-logged')).toHaveCount(0);
    await expect(page.getByTestId('heat-source-planned')).toHaveCount(0);
    // The legend still explains the scale in the projected state.
    await expect(page.getByTestId('heat-legend')).toBeVisible();

    // Trends refuses to draw a trend it does not have, and says what unlocks when.
    const empty = page.getByTestId('progress-trends-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('No training history yet');
    await expect(empty).toContainText('Nothing here is simulated');
    await expect(empty).toContainText('After 1 workout');
    await expect(empty).toContainText('After 2 weeks');
    await expect(empty).toContainText('After 4 weeks');

    // None of the time-series render — no zero-filled charts pretending to be history.
    for (const id of [
      'progress-trends',
      'progress-summary',
      'chart-weekly-volume',
      'weekly-volume-chart',
      'chart-consistency',
      'chart-strength',
      'chart-body-weight',
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }

    // PRs are equally honest.
    await page.getByTestId('progress-tab-prs').click();
    await expect(page.getByText('No personal records yet')).toBeVisible();

    expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);
  });
});
