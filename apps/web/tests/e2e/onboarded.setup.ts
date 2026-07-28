import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { completeOnboarding, resetDemo, ONBOARDED_STATE_FILE, STORE_KEYS } from './helpers';

/**
 * WALK ONBOARDING ONCE, FOR THE WHOLE SUITE.
 *
 * Most of the specs need "a user who has finished onboarding" as a PRECONDITION — and each one was
 * getting there by clicking through all fourteen wizard steps: goals, experience, schedule,
 * exercise prefs, split, progression, location, a swipe deck with a 400 ms settle per card,
 * exclusions with a combobox search, body metrics, nutrition prefs, targets, plan preview.
 * Identical every time, and by far the largest single cost in the run.
 *
 * This project performs that walk exactly once, through the REAL wizard, and snapshots the
 * localStorage it produces. Every other spec loads the snapshot.
 *
 * WHY THIS DOES NOT WEAKEN THE SUITE — the usual objection to a fixture like this is that it lets
 * the real flow rot untested. Two things prevent that here:
 *
 *  1. The snapshot is produced BY `completeOnboarding`, the same function the specs used to call,
 *     driving the same production wizard. The state is not hand-written, so it cannot drift from
 *     what the app actually persists — if the wizard starts writing a different shape, so does this.
 *  2. If onboarding breaks, this project fails, and the `dependencies` in playwright.config.ts mean
 *     the rest of the suite does not run at all rather than running against a stale file. The flow
 *     is not merely still covered; it is now a hard gate in front of everything else.
 *
 * `onboarding.spec.ts` continues to walk the wizard for real, because there it is the subject
 * rather than the setup. So does every spec that passes hooks to `completeOnboarding` — those ask
 * about a specific path through it, which one shared snapshot cannot answer.
 */
setup('capture an onboarded local-mode state', async ({ page }) => {
  await resetDemo(page);
  await completeOnboarding(page);

  // Prove onboarding really finished before anything is written. A snapshot taken from a
  // half-finished wizard would poison every spec at once, and the failures would point anywhere
  // but here.
  await expect(page).toHaveURL(/\/today/);

  const snapshot = await page.evaluate((keys) => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = window.localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
    return out;
  }, STORE_KEYS);

  const state = snapshot['fitforge.demo.v1'];
  expect(state, 'the demo store must be present in the snapshot').toBeTruthy();
  const parsed = JSON.parse(state!) as { onboardingStep?: string; routine?: unknown };
  expect(parsed.onboardingStep, 'onboarding must be complete').toBe('done');
  expect(parsed.routine, 'a routine must have been generated').toBeTruthy();

  fs.mkdirSync(path.dirname(ONBOARDED_STATE_FILE), { recursive: true });
  fs.writeFileSync(ONBOARDED_STATE_FILE, JSON.stringify(snapshot, null, 2));
});
