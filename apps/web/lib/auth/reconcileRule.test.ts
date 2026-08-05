import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideReconcile,
  mayPushToCloud,
  shouldLeaveOnboarding,
  type ReconcileFacts,
} from './reconcileRule';

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

/* ── the two guards added after the signed-in audit ──────────────────────────────────────────── */

test('a device that has never read the account may not overwrite it', () => {
  const ok = { configured: true, erased: false, conflictPending: false, readOk: true };
  assert.equal(mayPushToCloud(ok), true, 'the ordinary case still uploads');

  // THE DATA-LOSS PATH: the sign-in reconcile could not read users/{uid} (Firestore hiccup, a
  // moment offline). The app releases the user — correctly — and the mirror must NOT then treat
  // this browser's empty state as the truth.
  assert.equal(
    mayPushToCloud({ ...ok, readOk: false }),
    false,
    'an unread account must never be overwritten',
  );
});

test('the other three refusals still hold, independently', () => {
  const ok = { configured: true, erased: false, conflictPending: false, readOk: true };
  assert.equal(mayPushToCloud({ ...ok, configured: false }), false, 'no project, no account');
  assert.equal(
    mayPushToCloud({ ...ok, erased: true }),
    false,
    'a deliberate erasure must not be undone by a queued push',
  );
  assert.equal(
    mayPushToCloud({ ...ok, conflictPending: true }),
    false,
    'writing while the athlete is still being asked makes the question a lie',
  );
});

test('leaving onboarding needs a pull that actually brought a plan', () => {
  // The redirect loop, as a truth table. A new Google account's document is written from the
  // signing-in device's EMPTY store, so "a pull happened" and "there is a plan" come apart — and
  // when they did, the wizard and the app shell bounced the user between them forever.
  assert.equal(shouldLeaveOnboarding(true, true), true, 'a real plan arrived: stop asking');
  assert.equal(
    shouldLeaveOnboarding(true, false),
    false,
    'an empty account pulled back is not a reason to end onboarding',
  );
  assert.equal(shouldLeaveOnboarding(false, true), false, 'no pull: the wizard owns the screen');
  assert.equal(shouldLeaveOnboarding(false, false), false);
});

test('a shared phone never uploads the previous athlete to the next one', () => {
  // The whole point of lastPushedUid. This browser holds training that provably went to account
  // A; account B is signing in. Before this, an EMPTY account B took the "nothing in the cloud →
  // push" branch and adopted A's entire history without a word.
  const foreign: ReconcileFacts = {
    uid: 'athlete-B',
    cloudExists: false,
    cloudHasBundle: false,
    cloudAt: 0,
    localIsEmpty: false,
    lastPushedAt: 1_000,
    lastPushedUid: 'athlete-A',
  };
  assert.equal(decideReconcile(foreign), 'ask', 'a new account must not inherit a stranger’s data');
  // …and the same holds when B's account DOES have training: still two unrelated histories.
  assert.equal(
    decideReconcile({ ...foreign, cloudExists: true, cloudHasBundle: true, cloudAt: 5_000 }),
    'ask',
  );
});

test('the foreign-data guard does not fire on the cases it would ruin', () => {
  const base: ReconcileFacts = {
    uid: 'athlete-A',
    cloudExists: false,
    cloudHasBundle: false,
    cloudAt: 0,
    localIsEmpty: false,
    lastPushedAt: 1_000,
    lastPushedUid: 'athlete-A',
  };
  // My own device, my own account: push, as always.
  assert.equal(decideReconcile(base), 'push');
  // An upgrade from before the uid key existed is not a stranger (see the field's doc).
  assert.equal(decideReconcile({ ...base, lastPushedUid: null }), 'push');
  // An empty browser has no data to be foreign, whoever pushed from it last.
  assert.equal(
    decideReconcile({ ...base, localIsEmpty: true, lastPushedUid: 'athlete-B' }),
    'push',
  );
  // A first-ever sign-in on a device with local training: never pushed anywhere, so it is theirs.
  assert.equal(decideReconcile({ ...base, lastPushedAt: 0, lastPushedUid: null }), 'push');
});
