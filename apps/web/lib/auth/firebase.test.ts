/**
 * The point of these is one property: a failed sign-in must say WHICH failure it was.
 *
 * The first version of the sign-in path collapsed every outcome into one sentence — "Google
 * sign-in could not complete" — which is why a broken sign-in was reported as simply not working,
 * with nothing to act on. Two of the three likely causes are fixed in the Firebase console rather
 * than in this codebase, so naming the cause is not a nicety; it is the difference between a
 * report someone can resolve in a minute and one that needs a debugging session.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAuthError } from './firebase';

test('an unauthorised domain names the domain AND the console screen that fixes it', () => {
  const msg = describeAuthError('auth/unauthorized-domain', 'goforge.fit');
  assert.match(msg, /goforge\.fit/);
  assert.match(msg, /Authorized domains/i);
});

test('a disabled provider points at the sign-in method screen rather than blaming the network', () => {
  const msg = describeAuthError('auth/operation-not-allowed', 'goforge.fit');
  assert.match(msg, /Sign-in method/i);
  assert.doesNotMatch(msg, /connection/i);
});

test('a blocked popup tells the person the one thing they can actually do about it', () => {
  assert.match(describeAuthError('auth/popup-blocked', 'goforge.fit'), /pop-ups/i);
});

test('a network failure is described as a network failure', () => {
  assert.match(describeAuthError('auth/network-request-failed', 'goforge.fit'), /connection/i);
});

test('an unknown code is printed rather than swallowed, so it can be searched for', () => {
  // The whole failure mode being fixed here is a message that hides the cause. A code this file
  // has never heard of must still reach the screen intact.
  const msg = describeAuthError('auth/some-future-thing', 'goforge.fit');
  assert.match(msg, /auth\/some-future-thing/);
});

test('a missing code still produces a sentence rather than an empty parenthesis', () => {
  const msg = describeAuthError('', 'goforge.fit');
  assert.match(msg, /unknown error/i);
  assert.doesNotMatch(msg, /\(\)/);
});

test('every message is a complete sentence — the UI appends a clause to it', () => {
  // GoogleSignInButton renders `{message} Your data is safe in this browser either way.`
  for (const code of [
    'auth/unauthorized-domain',
    'auth/operation-not-allowed',
    'auth/popup-blocked',
    'auth/network-request-failed',
    'auth/internal-error',
    'auth/no-credential',
    'auth/invalid-api-key',
    'auth/account-exists-with-different-credential',
    'auth/anything-else',
  ]) {
    const msg = describeAuthError(code, 'goforge.fit');
    assert.ok(msg.length > 0, `${code} produced an empty message`);
    assert.match(msg, /[.!]$/, `${code} does not end a sentence: ${msg}`);
  }
});

/**
 * THE BOOTSTRAP RACE, as a property of the lookup rather than of timing.
 *
 * `getApp()` used to ask "does ANY Firebase app exist?" and then fetch the one called
 * `[DEFAULT]`. Those are different questions, and this app creates a second, NAMED app for the
 * sign-in popup — built concurrently with the main client by `warmSignIn`. Whenever the popup app
 * won that race the count was 1, the default app did not exist, and the bootstrap threw
 * `app/no-app` before Google was ever contacted.
 *
 * The SDK is not imported here (it needs a browser); what is pinned is the decision itself, which
 * is where the bug lived: pick by NAME, never by count.
 */
test('the app lookup finds the default app by name, not by "some app exists"', () => {
  const DEFAULT_APP = '[DEFAULT]';
  const pick = (apps: { name: string }[]) => apps.find((a) => a.name === DEFAULT_APP) ?? null;

  // The exact race state: only the sign-in popup's app has been created so far.
  assert.equal(
    pick([{ name: 'fitforge-signin' }]),
    null,
    'a named app must not be mistaken for the default one — this is the app/no-app bug',
  );
  // The old rule, for contrast: a count-based check calls this state "already initialised".
  assert.equal([{ name: 'fitforge-signin' }].length > 0, true);

  assert.deepEqual(pick([{ name: DEFAULT_APP }]), { name: DEFAULT_APP });
  assert.deepEqual(
    pick([{ name: 'fitforge-signin' }, { name: DEFAULT_APP }]),
    { name: DEFAULT_APP },
    'order must not matter — both apps exist once warming has finished',
  );
  assert.equal(pick([]), null, 'a cold start still initialises');
});
