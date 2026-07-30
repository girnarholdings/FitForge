import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideReconcile, type ReconcileFacts } from './reconcileRule';

/**
 * WHAT HAPPENS WHEN YOU SIGN IN — every branch, including the one that used to lose data silently.
 *
 * The regression being locked down: a device with real training signing into an account that also
 * has real training used to compare two timestamps and overwrite the loser without a word. On a
 * shared laptop that is somebody's history gone. It must now be an `'ask'`.
 */
const base: ReconcileFacts = {
  uid: 'me',
  cloudExists: true,
  cloudHasBundle: true,
  cloudAt: 2_000,
  localIsEmpty: false,
  lastPushedAt: 1_000,
  lastPushedUid: 'me',
};

test('an account with no document yet takes this device as its starting point', () => {
  assert.equal(decideReconcile({ ...base, cloudExists: false, cloudAt: 0 }), 'push');
  // Even a brand-new browser: pushing an empty state is harmless, and pulling nothing is a no-op.
  assert.equal(
    decideReconcile({ ...base, cloudExists: false, cloudAt: 0, localIsEmpty: true }),
    'push',
  );
});

test('a fresh browser adopts the account — the new-device case', () => {
  assert.equal(decideReconcile({ ...base, localIsEmpty: true, lastPushedAt: 0, lastPushedUid: null }), 'pull');
});

test('same account, sibling device moved ahead: pull, silently', () => {
  assert.equal(decideReconcile({ ...base, cloudAt: 5_000, lastPushedAt: 1_000 }), 'pull');
});

test('same account, this device is ahead: push', () => {
  assert.equal(decideReconcile({ ...base, cloudAt: 1_000, lastPushedAt: 5_000 }), 'push');
  // Exactly in step is not "newer" — a needless pull would churn the store for nothing.
  assert.equal(decideReconcile({ ...base, cloudAt: 3_000, lastPushedAt: 3_000 }), 'push');
});

test('two real histories and no shared past: ASK', () => {
  // Never pushed anywhere — an export restored onto a device that then signs in.
  assert.equal(decideReconcile({ ...base, lastPushedAt: 0, lastPushedUid: null }), 'ask');
  // Pushed, but to somebody else's account: a second athlete on a shared device.
  assert.equal(decideReconcile({ ...base, lastPushedUid: 'someone-else' }), 'ask');
  // …and the direction of the clock is irrelevant to that. Both ways round, still ask.
  assert.equal(decideReconcile({ ...base, lastPushedUid: 'someone-else', cloudAt: 1 }), 'ask');
});

test('upgrading the app does not manufacture a conflict', () => {
  // A device that pushed before the uid key existed has `lastPushedUid: null` with a real stamp.
  // It is a participant, so the ordinary timestamp rule applies and nobody gets a sheet.
  assert.equal(decideReconcile({ ...base, lastPushedUid: null, cloudAt: 5_000 }), 'pull');
  assert.equal(decideReconcile({ ...base, lastPushedUid: null, cloudAt: 500 }), 'push');
});

test('an unreadable cloud document is never offered as a choice', () => {
  // Nothing adoptable exists, so the data in front of the athlete stands — no prompt, no pull.
  assert.equal(decideReconcile({ ...base, cloudHasBundle: false, lastPushedAt: 0, lastPushedUid: null }), 'push');
  assert.equal(decideReconcile({ ...base, cloudHasBundle: false, cloudAt: 9_999 }), 'push');
  // …but an empty browser still tries the pull, which reports the read failure honestly.
  assert.equal(decideReconcile({ ...base, cloudHasBundle: false, localIsEmpty: true }), 'pull');
});
