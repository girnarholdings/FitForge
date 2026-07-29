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

test('the action whitelist accepts exactly the four actions', () => {
  for (const a of ['proceed', 'reduce', 'technique', 'rest']) assert.ok(isAdaptAction(a));
  assert.ok(!isAdaptAction('deload'));
  assert.ok(!isAdaptAction(''));
  assert.ok(!isAdaptAction(null));
});
