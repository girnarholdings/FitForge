'use client';

/**
 * FIREBASE, LAZILY AND OPTIONALLY.
 *
 * ─── optional ───────────────────────────────────────────────────────────────────────────────
 * Every export here degrades to "not configured" when the `NEXT_PUBLIC_FIREBASE_*` variables are
 * absent, exactly as the Coach worker does. A build with no Firebase project behaves as the app
 * always has: Local Mode, no sign-in UI, nothing uploaded. That is not a fallback for a broken
 * state — it is a supported way to run FitForge, and it is what every fork gets by default.
 *
 * ─── lazily ─────────────────────────────────────────────────────────────────────────────────
 * The Firebase SDK is ~200 KB of JavaScript that a signed-out visitor reading the landing page
 * has no use for. Every entry point below `import()`s it on demand, so it lands in its own chunk
 * and is fetched the first time someone actually touches auth. The app's whole performance story
 * is "don't make people download what they aren't using"; a sign-in feature must not undo it.
 *
 * ─── the config is public, and that is fine ─────────────────────────────────────────────────
 * A Firebase web config (apiKey included) is designed to ship in client code — it identifies the
 * project, it does not authorise anything. What protects the data is Firestore security rules
 * plus the authorised-domains list, both of which live in the Firebase console. See
 * docs/FIREBASE-SETUP.md. The MISTRAL key, by contrast, is a real credential and stays on the
 * worker; the distinction is the whole reason the model gate is enforced server-side.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  /**
   * Present so Analytics is one call away, and DELIBERATELY UNUSED.
   *
   * `getAnalytics(app)` would start sending page views and device identifiers to Google and set
   * its own cookies. This app's landing page, its onboarding and its Local Mode explainer all
   * tell people their data stays in this browser and nothing is uploaded. Turning on analytics
   * without a consent flow would make those sentences false — and they are the product's main
   * claim, not marketing garnish. If it is wanted later it needs a consent banner and a copy
   * change, which is a decision, not a config toggle.
   */
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
};

/** True when this build was given a Firebase project. Safe to call during render. */
export function isAuthConfigured(): boolean {
  return CONFIG.apiKey.length > 0 && CONFIG.projectId.length > 0 && CONFIG.authDomain.length > 0;
}

/**
 * COULD THIS BROWSER POSSIBLY HAVE A SIGNED-IN USER? Answered synchronously, from localStorage,
 * WITHOUT loading a byte of the Firebase SDK.
 *
 * This exists because "we do not know yet" was costing every visitor — signed in or not — a
 * ~200 kB third-party download before the app would decide anything. `browserLocalPersistence`
 * (see getAuthClient) keeps the session under a key the SDK builds as
 * `firebase:authUser:{apiKey}:{appName}` (@firebase/auth `_persistenceKeyName`), and the main
 * client is the default app. No key ⇒ `onAuthStateChanged` is going to fire with `null`; there is
 * nothing to wait for and no reason to make a new user wait for it.
 *
 * FAILS TOWARD "MAYBE": an unreadable localStorage (private mode, storage disabled) returns true,
 * so the caller takes the slow, correct path rather than declaring a signed-in user signed out.
 */
export function hasPersistedSession(): boolean {
  if (!isAuthConfigured() || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`firebase:authUser:${CONFIG.apiKey}:[DEFAULT]`) !== null;
  } catch {
    return true;
  }
}

export type { User };

let appPromise: Promise<FirebaseApp> | null = null;

async function getApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps, getApp: existing } = await import('firebase/app');
      // getApps() first: React strict mode double-invokes effects in development, and
      // initializeApp twice with the same name throws.
      return getApps().length > 0 ? existing() : initializeApp(CONFIG);
    })();
  }
  return appPromise;
}

let authPromise: Promise<Auth> | null = null;

/**
 * The Auth client — built WITHOUT a popup/redirect resolver, deliberately.
 *
 * `getAuth()` registers `browserPopupRedirectResolver` by default, and that resolver boots
 * Google's `apis.google.com/js/api.js` iframe machinery as soon as an auth listener attaches —
 * i.e. a third-party script fetched on EVERY page load, for every visitor, signed in or not, on
 * an app whose landing page promises the opposite. A safety spec caught it: the rule that a
 * red-flag medical question must not produce any off-origin request started failing, and it was
 * right to.
 *
 * `initializeAuth` with only a persistence layer skips all of that. The resolver is passed
 * explicitly to `signInWithPopup` instead, so the Google script is fetched at the moment someone
 * chooses to sign in and never before.
 */
export async function getAuthClient(): Promise<Auth | null> {
  if (!isAuthConfigured()) return null;
  if (!authPromise) {
    authPromise = (async () => {
      const { initializeAuth, getAuth, browserLocalPersistence } = await import('firebase/auth');
      const app = await getApp();
      try {
        // Persistence survives a reload — a training app that signed you out every visit would be
        // worse than one that never offered accounts.
        return initializeAuth(app, { persistence: browserLocalPersistence });
      } catch {
        // Already initialised (React strict mode double-invokes effects in development).
        return getAuth(app);
      }
    })();
  }
  return authPromise;
}

/**
 * THE SIGN-IN CLIENT — a second Auth instance that DOES carry the popup resolver.
 *
 * Why a second one instead of just adding the resolver to the first: registering the resolver at
 * construction is what makes Firebase call `_shouldInitProactively` and, on mobile browsers, Safari
 * and iOS, load Google's iframe machinery immediately. That is the behaviour that lets
 * `signInWithPopup` reach `window.open` while the click's user activation is still alive — and it
 * is the behaviour this app lost when it stopped using `getAuth()`. Losing it is why the button did
 * nothing on a phone: three round trips inside the click handler, activation expired, popup
 * blocked, no error worth showing.
 *
 * Putting the resolver back on the MAIN instance would restore the eager Google script on every
 * page for every visitor, which is the privacy regression that made this app stop using `getAuth()`
 * in the first place. A separate instance, created only where sign-in is actually offered, gets
 * both: /coach still contacts nobody, and the sign-in screen has the popup machinery warm before
 * anyone touches the button.
 *
 * `inMemoryPersistence` on purpose — this client exists to run one popup. The session it produces
 * is handed to the main client via `signInWithCredential`, which owns persistence, sync and every
 * other consumer's view of who is signed in. Two instances writing session state under two storage
 * keys is how you get an app that disagrees with itself about whether you are logged in.
 */
let popupAuthPromise: Promise<Auth> | null = null;
const SIGNIN_APP = 'fitforge-signin';

async function getPopupAuth(): Promise<Auth | null> {
  if (!isAuthConfigured()) return null;
  if (!popupAuthPromise) {
    popupAuthPromise = (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      const { initializeAuth, getAuth, browserPopupRedirectResolver, inMemoryPersistence } =
        await import('firebase/auth');
      const app = getApps().find((a) => a.name === SIGNIN_APP) ?? initializeApp(CONFIG, SIGNIN_APP);
      try {
        return initializeAuth(app, {
          persistence: inMemoryPersistence,
          popupRedirectResolver: browserPopupRedirectResolver,
        });
      } catch {
        return getAuth(app);
      }
    })();
    popupAuthPromise.catch(() => {
      popupAuthPromise = null;
    });
  }
  return popupAuthPromise;
}

export async function getDb(): Promise<Firestore | null> {
  if (!isAuthConfigured()) return null;
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(await getApp());
}

/**
 * What a sign-in attempt did. Deliberately NOT `User | null`.
 *
 * The first version of this returned null for "cancelled", null for "blocked popup" and threw for
 * everything else, so the UI could only ever say "could not complete". That is precisely the shape
 * of a bug report that reads "sign-in does not work" with nothing to act on: a blocked popup, a
 * domain missing from the Firebase console and a disabled provider all rendered the same sentence.
 * The cause has to survive the trip to the UI, because for two of those three the fix is in a
 * console the user is looking at, not in this code.
 */
export type SignInOutcome =
  | { ok: true; user: User }
  /** The person closed the popup. A choice, not a failure — the UI says nothing. */
  | { ok: false; reason: 'cancelled' }
  /** The popup was blocked; we have handed off to a full-page redirect and are navigating away. */
  | { ok: false; reason: 'redirecting' }
  | { ok: false; reason: 'unconfigured' }
  | { ok: false; reason: 'failed'; code: string; message: string };

const CANCELLED = /popup-closed-by-user|cancelled-popup-request|user-cancelled/;

/**
 * Turn a Firebase error code into something that names the actual problem AND where it is fixed.
 * Most of these are configuration in the Firebase console rather than anything the app can repair
 * at runtime, so the message's job is to point at the right screen.
 */
export function describeAuthError(code: string, host: string): string {
  switch (code) {
    case 'auth/unauthorized-domain':
      return `${host} is not in the Firebase console's Authentication → Settings → Authorized domains list. Add it there, then try again.`;
    case 'auth/operation-not-allowed':
      return 'Google sign-in is switched off for this Firebase project. Enable it under Authentication → Sign-in method.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.';
    case 'auth/network-request-failed':
      return 'Could not reach Google. Check your connection and try again.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'This build has an invalid Firebase API key.';
    case 'auth/internal-error':
      // In the popup flow this almost always means Google's sign-in script never loaded — a
      // content blocker, a corporate proxy or a dropped connection — rather than anything wrong
      // inside Google. Naming the real suspects beats repeating the SDK's own word for it.
      return "Could not load Google's sign-in script. A content blocker or network filter is the usual cause — try again with those off.";
    case 'auth/no-credential':
      return 'Google signed you in but returned no credential to keep. Try again.';
    case 'auth/account-exists-with-different-credential':
      return 'That email is already registered with a different sign-in method.';
    default:
      // Never swallow an unknown code: an unrecognised failure that prints its own name can be
      // searched for, and a generic apology cannot.
      return `Sign-in failed (${code || 'unknown error'}).`;
  }
}

/**
 * PRE-WARM THE POPUP PATH. Call when a sign-in surface mounts.
 *
 * `signInWithPopup` does not call `window.open` first — it loads Google's `apis.google.com/js/api.js`,
 * opens an iframe on the auth domain and fetches the project config, and only THEN opens the
 * window. That is three round trips sitting between the click and the popup, and browsers only
 * honour `window.open` while the click's user activation is still live. On a phone on cellular
 * that budget is routinely blown, and the popup is blocked through no fault of the person pressing
 * the button. `getAuth()` hides this by registering the resolver at construction so the warm-up has
 * usually finished before anyone clicks; this app cannot use `getAuth()` (see getAuthClient), so it
 * has to do the warming itself.
 *
 * Split in two by cost:
 *   `warmSignIn`      — builds the sign-in client (see getPopupAuth), which on a phone makes the
 *                       SDK load the iframe machinery there and then. This is the one that
 *                       actually fixes the blocked popup.
 *   `warmGoogleScript`— for desktop, where the SDK declines to warm anything by itself. Waits for
 *                       a sign of intent (pointer down or focus) rather than firing at every
 *                       visitor who opens Settings, because it is a third-party fetch. `loadGapi`
 *                       takes a no-network branch when `window.gapi.load` already exists, which is
 *                       exactly what this leaves behind.
 *
 * Neither runs on /coach: nothing there renders a sign-in surface, which is what keeps the
 * regression-coach-safety rule (a red-flag question makes no off-origin request) true.
 */
export async function warmSignIn(): Promise<void> {
  if (!isAuthConfigured()) return;
  try {
    await Promise.all([getAuthClient(), getPopupAuth()]);
  } catch {
    // Warming is an optimisation. Failing to warm must never block the real attempt.
  }
}

let gapiWarmed = false;

export function warmGoogleScript(): void {
  if (gapiWarmed || !isAuthConfigured() || typeof document === 'undefined') return;
  gapiWarmed = true;
  const w = window as unknown as { gapi?: { load?: unknown } };
  if (w.gapi?.load) return;
  const s = document.createElement('script');
  s.src = 'https://apis.google.com/js/api.js';
  s.async = true;
  // A failed warm is silent on purpose: the SDK will load the script itself on click, and an error
  // banner about a preload nobody asked for would be noise.
  s.onerror = () => {};
  document.head.appendChild(s);
}

/**
 * Google sign-in: popup first, full-page redirect if the popup is blocked.
 *
 * POPUP FIRST, deliberately. `signInWithRedirect` leans on third-party storage that Safari's ITP
 * and Chrome's cookie partitioning now split, so with a `*.firebaseapp.com` auth domain it is the
 * less reliable flow, not the safer one. It is here strictly as the answer to a blocked popup,
 * where the alternative is a button that does nothing at all.
 */
export async function signInWithGoogle(): Promise<SignInOutcome> {
  const host = typeof location === 'undefined' ? 'this site' : location.hostname;

  // EVERYTHING is inside the try, including building the clients and loading the SDK chunk. This
  // function's contract is that it RETURNS an outcome; if it can throw, the caller has to hold a
  // second error path, and the version of this code that left the setup outside the try did
  // exactly that — a throw there left the button spinning forever with nothing on screen, which is
  // indistinguishable from the bug being fixed.
  try {
    const auth = await getAuthClient();
    const popupAuth = await getPopupAuth();
    if (!auth || !popupAuth) return { ok: false, reason: 'unconfigured' };
    const {
      GoogleAuthProvider,
      signInWithPopup,
      signInWithCredential,
      signInWithRedirect,
      browserPopupRedirectResolver,
    } = await import('firebase/auth');

    const provider = () => {
      const p = new GoogleAuthProvider();
      // Always ask which account — people share devices, and silently reusing the last Google
      // session is how someone logs their workout into a partner's account.
      p.setCustomParameters({ prompt: 'select_account' });
      return p;
    };

    try {
      // Run on the sign-in client, whose resolver was registered at construction so the popup
      // machinery is already warm and `window.open` happens inside the click's activation window.
      const cred = await signInWithPopup(popupAuth, provider(), browserPopupRedirectResolver);
      // Hand the credential to the main client, which is the one everything else reads.
      const credential = GoogleAuthProvider.credentialFromResult(cred);
      if (!credential) {
        return {
          ok: false,
          reason: 'failed',
          code: 'auth/no-credential',
          message: describeAuthError('auth/no-credential', host),
        };
      }
      const bridged = await signInWithCredential(auth, credential);
      return { ok: true, user: bridged.user };
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (CANCELLED.test(code)) return { ok: false, reason: 'cancelled' };

      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider(), browserPopupRedirectResolver);
          // The browser is now navigating to Google; nothing after this runs.
          return { ok: false, reason: 'redirecting' };
        } catch (redirectErr) {
          const rCode = (redirectErr as { code?: string }).code ?? code;
          return {
            ok: false,
            reason: 'failed',
            code: rCode,
            message: describeAuthError(rCode, host),
          };
        }
      }

      return { ok: false, reason: 'failed', code, message: describeAuthError(code, host) };
    }
  } catch (setupErr) {
    // Building the clients or fetching the SDK chunk failed. Rare, but it must still surface as a
    // named outcome rather than a rejected promise.
    const code = (setupErr as { code?: string }).code ?? 'auth/setup-failed';
    return { ok: false, reason: 'failed', code, message: describeAuthError(code, host) };
  }
}

/**
 * Finish a sign-in that went out via redirect. Mounted app-wide, and FREE when there is nothing to
 * finish: the SDK checks a session-storage flag first and returns without touching the network or
 * loading Google's script unless a redirect is genuinely pending. That is what makes it safe to
 * call on every page rather than only on the ones with a sign-in button — the redirect can land
 * anywhere, so anywhere has to be able to complete it.
 */
export async function completeRedirectSignIn(): Promise<SignInOutcome | null> {
  if (!isAuthConfigured()) return null;
  const host = typeof location === 'undefined' ? 'this site' : location.hostname;
  try {
    const auth = await getAuthClient();
    if (!auth) return null;
    const { getRedirectResult, browserPopupRedirectResolver } = await import('firebase/auth');
    const cred = await getRedirectResult(auth, browserPopupRedirectResolver);
    return cred ? { ok: true, user: cred.user } : null;
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (CANCELLED.test(code)) return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'failed', code, message: describeAuthError(code, host) };
  }
}

export async function signOutUser(): Promise<void> {
  const auth = await getAuthClient();
  if (!auth) return;
  const { signOut } = await import('firebase/auth');
  await signOut(auth);
  // AND the sign-in client. It holds its own in-memory user from the popup that created this
  // session; leaving it authenticated means "sign out" left half the app's auth state standing,
  // which is the sort of thing that is invisible until it is a support ticket about a shared
  // phone. Its failure cannot undo the real sign-out above, so it is deliberately swallowed.
  try {
    const popupAuth = await popupAuthPromise;
    if (popupAuth) await signOut(popupAuth);
  } catch {
    /* the main session is already gone, which is what "signed out" means */
  }
}

/**
 * A fresh ID token for the current user, or null.
 *
 * Not cached here: the SDK already caches and refreshes it, and re-using an expired copy would
 * silently demote a signed-in user to the free tier — the one failure this whole path exists to
 * avoid.
 */
export async function currentIdToken(): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  try {
    const auth = await getAuthClient();
    return (await auth?.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}
