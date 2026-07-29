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
};

/** True when this build was given a Firebase project. Safe to call during render. */
export function isAuthConfigured(): boolean {
  return CONFIG.apiKey.length > 0 && CONFIG.projectId.length > 0 && CONFIG.authDomain.length > 0;
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

export async function getAuthClient(): Promise<Auth | null> {
  if (!isAuthConfigured()) return null;
  const { getAuth, browserLocalPersistence, setPersistence } = await import('firebase/auth');
  const auth = getAuth(await getApp());
  // Survive a reload — a training app that signed you out every visit would be worse than one
  // that never offered accounts.
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  return auth;
}

export async function getDb(): Promise<Firestore | null> {
  if (!isAuthConfigured()) return null;
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(await getApp());
}

/**
 * Google sign-in, via popup.
 *
 * POPUP RATHER THAN REDIRECT, deliberately. `signInWithRedirect` depends on third-party storage
 * that Safari's ITP and Chrome's third-party-cookie work now partition, which breaks it on
 * exactly the mobile browsers this app is built for unless the auth domain is proxied under the
 * app's own origin. The popup flow has no such dependency.
 *
 * Returns null when the user closes the popup — a cancelled sign-in is a choice, not an error,
 * and must not raise anything the UI would have to dress up as a failure.
 */
export async function signInWithGoogle(): Promise<User | null> {
  const auth = await getAuthClient();
  if (!auth) return null;
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  // Always ask which account — people share devices, and silently reusing the last Google session
  // is how someone logs their workout into a partner's account.
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (/popup-closed-by-user|cancelled-popup-request|popup-blocked/.test(code)) return null;
    throw err;
  }
}

export async function signOutUser(): Promise<void> {
  const auth = await getAuthClient();
  if (!auth) return;
  const { signOut } = await import('firebase/auth');
  await signOut(auth);
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
