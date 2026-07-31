import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessReadiness, isAdaptAction, type CheckIn } from './engine';

const base: CheckIn = {
  date: '2026-07-29',
  sleepHours: 8,
  soreness: 2,
  energy: 4,
  stress: 2,
  unwell: false,
};

test('a good morning is green, proceeds, and offers nothing dramatic', () => {
  const v = assessReadiness(base);
  assert.equal(v.band, 'green');
  assert.equal(v.action, 'proceed');
  assert.equal(v.safety, false);
  assert.ok(v.score >= 70);
});

test('the illness gate bypasses scoring entirely — unwell can NEVER produce a training edit', () => {
  // Even with every other input perfect, unwell → rest + safety. This is the highest-stakes rule
  // in the feature: "train through illness" must be structurally unreachable.
  const v = assessReadiness({ ...base, unwell: true });
  assert.equal(v.band, 'red');
  assert.equal(v.action, 'rest');
  assert.equal(v.safety, true);
});

test('one rough input alone stays green — the engine fires rarely by design', () => {
  assert.equal(assessReadiness({ ...base, stress: 4 }).action, 'proceed');
  assert.equal(assessReadiness({ ...base, soreness: 4 }).action, 'proceed');
});

test('short sleep + low energy is a yellow REDUCE with the causes named', () => {
  const v = assessReadiness({ ...base, sleepHours: 6, energy: 2, stress: 4 });
  assert.equal(v.band, 'yellow');
  assert.equal(v.action, 'reduce');
  assert.match(v.reason, /sleep|energy/i);
});

test('heavy soreness in the yellow band swaps the lever: technique day, not fewer sets', () => {
  const v = assessReadiness({ ...base, soreness: 5, sleepHours: 6.5 });
  assert.equal(v.band, 'yellow');
  assert.equal(v.action, 'technique');
});

test('a genuinely wrecked morning is a red REST without the illness flag', () => {
  const v = assessReadiness({ ...base, sleepHours: 4, energy: 1, soreness: 5 });
  assert.equal(v.band, 'red');
  assert.equal(v.action, 'rest');
  assert.equal(v.safety, false);
});

test('unanswered sleep deducts nothing — absent must never read as zero', () => {
  const v = assessReadiness({ ...base, sleepHours: null });
  assert.equal(v.band, 'green');
});

/* ── Apple Health observed fields (iOS shell contract) ─────────────────────────────────────── */

test('an elevated resting HR deducts modestly and names the number in the reason', () => {
  // Alone it must NOT change the verdict (fire rarely) — it is one more weight on the scale.
  const alone = assessReadiness({ ...base, rhrDeltaBpm: 6 });
  assert.equal(alone.band, 'green');
  assert.ok(alone.score <= 100 - 10 && alone.score >= 100 - 12, `modest deduction, got ${alone.score}`);

  // Stacked with a rough morning it tips the band, and the reason says why in the user's terms.
  // 12 (6h sleep) + 11 (RHR) + 10 (stress) = 33 → 67; the top-two causes are sleep and RHR.
  const stacked = assessReadiness({ ...base, sleepHours: 6, stress: 4, rhrDeltaBpm: 6 });
  assert.equal(stacked.band, 'yellow');
  assert.match(stacked.reason, /resting HR is up 6 over your usual/);
});

test('a resting HR below the +5 bpm threshold is natural variance — no deduction, no mention', () => {
  const v = assessReadiness({ ...base, rhrDeltaBpm: 4 });
  assert.equal(v.score, 100);
  assert.doesNotMatch(v.reason, /resting HR/);
});

test('HRV well below baseline adds its small deduction; above the −20% line it is silence', () => {
  const fired = assessReadiness({ ...base, sleepHours: 6, energy: 2, hrvDeltaPct: -25 });
  assert.equal(fired.band, 'yellow');
  // 12 (sleep) + 14 (energy) + 8 (HRV) = 34 → 66
  assert.equal(fired.score, 66);

  const quiet = assessReadiness({ ...base, hrvDeltaPct: -19 });
  assert.equal(quiet.score, 100);
});

test('health deltas NEVER fire when the fields are absent — no baseline means silence (Law 5)', () => {
  // A check-in without the optional fields must be byte-identical in outcome to one from a build
  // where the feature does not exist. This is the highest-stakes rule of the health integration.
  const without = assessReadiness({ ...base, sleepHours: 6, energy: 2 });
  const withUndefined = assessReadiness({
    ...base,
    sleepHours: 6,
    energy: 2,
    rhrDeltaBpm: undefined,
    hrvDeltaPct: undefined,
    externalWorkoutYesterday: undefined,
  });
  assert.deepEqual(withUndefined, without);
});

test('health deltas combine with the existing deductions into one arithmetic', () => {
  // 12 (6h sleep) + 11 (RHR) + 8 (HRV) = 31 → 69, one point into yellow.
  const v = assessReadiness({ ...base, sleepHours: 6, rhrDeltaBpm: 7, hrvDeltaPct: -22 });
  assert.equal(v.score, 69);
  assert.equal(v.band, 'yellow');
  assert.equal(v.action, 'reduce');
});

test('user-entered sleep always wins over the observed hours', () => {
  // The user says 8h; the watch says 4.5h. The watch loses — no sleep deduction at all.
  const v = assessReadiness({ ...base, sleepHours: 8, observedSleepHours: 4.5 });
  assert.equal(v.score, 100);
});

test('observed sleep fills in only when the user did not answer', () => {
  const v = assessReadiness({ ...base, sleepHours: null, observedSleepHours: 6 });
  assert.equal(v.score, 88); // the same 12-point short-sleep deduction a manual "6h" earns
  assert.equal(assessReadiness({ ...base, sleepHours: null }).score, 100);
});

test('an external workout yesterday adds context to the reason, never points', () => {
  // Green: score untouched AND the reason stays word-for-word quiet about it (fire rarely).
  const green = assessReadiness({ ...base, externalWorkoutYesterday: true });
  assert.equal(green.score, 100);
  assert.equal(green.reason, assessReadiness(base).reason);

  // Yellow: the score is identical with or without the flag; only the sentence changes.
  const yellowWithout = assessReadiness({ ...base, sleepHours: 6, energy: 2, stress: 4 });
  const yellowWith = assessReadiness({
    ...base,
    sleepHours: 6,
    energy: 2,
    stress: 4,
    externalWorkoutYesterday: true,
  });
  assert.equal(yellowWith.score, yellowWithout.score);
  assert.match(yellowWith.reason, /outside FitForge/);
  assert.doesNotMatch(yellowWithout.reason, /outside FitForge/);
});

test('the illness gate outranks every health delta — unwell is rest, whatever the wearable says', () => {
  const v = assessReadiness({ ...base, unwell: true, rhrDeltaBpm: 12, hrvDeltaPct: -40 });
  assert.equal(v.action, 'rest');
  assert.equal(v.safety, true);
});

test('the action whitelist accepts exactly the four actions', () => {
  for (const a of ['proceed', 'reduce', 'technique', 'rest']) assert.ok(isAdaptAction(a));
  assert.ok(!isAdaptAction('deload'));
  assert.ok(!isAdaptAction(''));
  assert.ok(!isAdaptAction(null));
});
