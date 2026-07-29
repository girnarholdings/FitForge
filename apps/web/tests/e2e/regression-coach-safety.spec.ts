/**
 * REGRESSION · Coach safety routing (major M5) and weak-evidence matching (minor m2).
 *
 * M5 — the Coach answered pain, injury and medical questions with confident curated entries (or
 *      sent them to a language model). "My knee hurts when I squat" returned a knees-past-toes
 *      myth-busting answer; "I have chest pain during exercise" returned a disambiguation list.
 *      A red-flag query must now lead with a safety card, must never render a curated/AI answer
 *      card as the primary response, and must never reach the network.
 * m2 — a non-English question fuzzy-rescued its way to a confident, wrong English answer.
 *
 * The false-positive side matters as much: ordinary training questions must be untouched, or the
 * gate would be worthless in practice.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetDemo, bareCompletedState, DEMO_STORAGE_KEY } from './helpers';

const RED_FLAG_QUERIES = [
  { q: 'My knee hurts when I squat, what should I do?', level: 'injury' },
  { q: 'I have chest pain during exercise', level: 'urgent' },
  { q: 'I tore my rotator cuff, can I keep benching?', level: 'injury' },
];

/** Ordinary questions that must keep working exactly as before. */
const NORMAL_QUERIES = ['How much protein do I need?', 'What is progressive overload?'];

/**
 * @param armed cleared immediately before /coach is loaded, so the off-origin ledger covers the
 *   Coach page load and everything after it — and nothing before.
 *
 *   That boundary matters. The ledger used to open at the top of the test, which meant it also
 *   covered the landing page `resetDemo` leaves behind, and the landing page legitimately talks to
 *   Google: it carries the "Continue with Google" button, and that button warms the sign-in popup
 *   so it is not blocked when someone taps it. Under parallel load that warm-up could still be in
 *   flight when the ledger opened, and the test failed for something the previous page did.
 *
 *   Narrowing it does not weaken what this assertion is for. The regression it was written to
 *   catch — `getAuth()` pulling `apis.google.com/js/api.js` into EVERY page load — happened on
 *   the Coach page's own load, which is still inside the window.
 */
async function openCoach(page: Page, armed?: string[]): Promise<void> {
  await page.goto('/today');
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    },
    { key: DEMO_STORAGE_KEY, value: JSON.stringify(bareCompletedState()) },
  );
  armed?.splice(0, armed.length);
  await page.goto('/coach');
  // Generous mount wait: on a Firebase-configured build the coach route hydrates behind the
  // lazy KB bundle AND the firebase chunks, and under four parallel workers that occasionally
  // clears 10s — a load flake, not a product signal. Everything after this uses default timeouts.
  await expect(page.getByTestId('coach-input')).toBeVisible({ timeout: 25000 });
}

async function ask(page: Page, question: string): Promise<void> {
  await page.getByTestId('coach-input').fill(question);
  await page.getByTestId('coach-submit').click();
  await expect(page.getByTestId('coach-turn').last()).toBeVisible();
}

test.describe('regression · coach safety routing', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  for (const { q, level } of RED_FLAG_QUERIES) {
    test(`M5 · "${q}" leads with a safety card`, async ({ page }) => {
      // Any off-origin request would mean a red-flag query reached a model.
      const offOrigin: string[] = [];
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (!/^http:\/\/localhost:/.test(url)) {
          offOrigin.push(url);
          return route.abort();
        }
        return route.continue();
      });

      await openCoach(page, offOrigin);
      await ask(page, q);

      const turn = page.getByTestId('coach-turn').last();
      const safety = turn.getByTestId('coach-safety-card');
      await expect(safety, 'no safety card was rendered').toBeVisible();
      await expect(safety).toHaveAttribute('data-safety-level', level);
      await expect(turn.getByTestId('coach-safety-headline')).toHaveText(/\S/);

      // No curated or AI answer card may be the response to a red-flag query.
      await expect(turn.getByTestId('coach-answer-kb')).toHaveCount(0);
      await expect(turn.getByTestId('coach-answer-ai')).toHaveCount(0);
      await expect(turn.getByTestId('coach-ai-pending')).toHaveCount(0);

      // The safety card is FIRST in the turn, not buried under something else.
      const firstCard = await turn.evaluate((el) => {
        const known = ['coach-safety-card', 'coach-answer-kb', 'coach-answer-ai', 'coach-disambiguate', 'coach-no-match'];
        for (const node of el.querySelectorAll('[data-testid]')) {
          const id = node.getAttribute('data-testid')!;
          if (known.includes(id)) return id;
        }
        return null;
      });
      expect(firstCard, 'the safety card is not the primary response').toBe('coach-safety-card');

      // NOT NARROWED TO THE COACH ENDPOINT, on purpose. Any off-origin request at all from the
      // moment the Coach page loads is worth failing on, and this caught something real: adding
      // Firebase Auth made every page load fetch `apis.google.com/js/api.js`, because `getAuth()`
      // registers a popup resolver that boots Google's iframe machinery eagerly. That was a
      // third-party script on an app that promises your data stays in your browser, and no
      // narrower assertion would have noticed. See lib/auth/firebase.ts: the resolver now lives on
      // a separate Auth client that only the sign-in screens ever build, which is what keeps this
      // page silent while still letting the popup open in time when someone does sign in.
      expect(offOrigin, 'a red-flag query hit the network').toEqual([]);
    });
  }

  test('M5 · curated reading is still offered, clearly as secondary information', async ({
    page,
  }) => {
    await openCoach(page);
    await ask(page, RED_FLAG_QUERIES[0]!.q);
    const turn = page.getByTestId('coach-turn').last();
    await expect(turn.getByTestId('coach-safety-secondary')).toBeVisible();
    await expect(turn.getByTestId('coach-safety-secondary-option').first()).toBeVisible();
  });

  for (const q of NORMAL_QUERIES) {
    test(`M5 · ordinary question is unaffected: "${q}"`, async ({ page }) => {
      await openCoach(page);
      await ask(page, q);
      const turn = page.getByTestId('coach-turn').last();
      await expect(turn.getByTestId('coach-safety-card'), 'false-positive safety gate').toHaveCount(0);
      await expect(turn.getByTestId('coach-answer-kb')).toBeVisible();
    });
  }

  test('M5 · plain soreness is NOT treated as a red flag', async ({ page }) => {
    await openCoach(page);
    await ask(page, 'what should I do if I am sore');
    const turn = page.getByTestId('coach-turn').last();
    await expect(turn.getByTestId('coach-safety-card')).toHaveCount(0);
  });

  test('m2 · a non-English question says "no match" instead of a confident wrong answer', async ({
    page,
  }) => {
    await openCoach(page);
    await ask(page, 'Wie viel Eiweiß brauche ich pro Tag?');
    const turn = page.getByTestId('coach-turn').last();
    await expect(turn.getByTestId('coach-answer-kb'), 'rendered a wrong curated answer').toHaveCount(0);
    await expect(turn.getByTestId('coach-no-match')).toBeVisible();
    // …and it names the real problem (language), rather than claiming the question was personal.
    await expect(turn.getByTestId('coach-no-match-language')).toBeVisible();
    await expect(
      turn.getByTestId('coach-ai-unavailable'),
      'a language mismatch was framed as a "needs the Coach service" personal question',
    ).toHaveCount(0);
  });

  test('m2 · a genuine typo is still rescued', async ({ page }) => {
    // The fuzzy assist has to stay useful — the fix narrows it, it does not remove it.
    await openCoach(page);
    await ask(page, 'how much protien do I need');
    const turn = page.getByTestId('coach-turn').last();
    await expect(turn.getByTestId('coach-answer-kb')).toBeVisible();
  });
});
