'use client';

/**
 * WHO IS SIGNED IN, as a store rather than a hook-per-component.
 *
 * Firebase's `onAuthStateChanged` is attached ONCE for the whole app, lazily, the first time
 * anything asks. Every consumer then reads the same snapshot through `useSyncExternalStore`, so
 * the header, the settings screen and the model picker can never disagree about whether someone
 * is signed in — and mounting three of them costs one listener, not three.
 *
 * `status` is three-valued on purpose. "Not signed in" and "we do not know yet" look identical to
 * a boolean, and conflating them makes the UI flash a Sign in button at someone who is already
 * signed in, on every single page load, for as long as Firebase takes to restore the session.
 */
import * as React from 'react';
import { hasPersistedSession, isAuthConfigured } from './firebase';

export interface AuthUser {
  uid: string;
  name: string | null;
  email: string | null;
  photoURL: string | null;
}

export type AuthStatus = 'unconfigured' | 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

/** Frozen constants: `useSyncExternalStore` requires a stable server snapshot identity. */
const UNCONFIGURED: AuthState = Object.freeze({ status: 'unconfigured', user: null });
const LOADING: AuthState = Object.freeze({ status: 'loading', user: null });
const SIGNED_OUT: AuthState = Object.freeze({ status: 'signed-out', user: null });

/**
 * `loading` only when a session might genuinely be restoring. In the browser that question is
 * answerable from localStorage at module-eval time (see hasPersistedSession), so the very first
 * client render already knows — no flash of a "Sign in" button at a signed-in user, and no
 * pretend-uncertainty for the far more common visitor who has no account at all. During prerender
 * `window` is absent, which is why `getServerSnapshot` below keeps returning LOADING: the static
 * HTML must not commit to an answer it cannot have.
 */
let state: AuthState = isAuthConfigured()
  ? typeof window !== 'undefined' && !hasPersistedSession()
    ? SIGNED_OUT
    : LOADING
  : UNCONFIGURED;
const listeners = new Set<() => void>();
let attached = false;

function emit(next: AuthState) {
  state = next;
  for (const l of listeners) l();
}

/** Attach the single auth listener. Idempotent, and a no-op on an unconfigured build. */
function attach(): void {
  if (attached || !isAuthConfigured() || typeof window === 'undefined') return;
  attached = true;

  /**
   * ANSWER SYNCHRONOUSLY WHEN THE ANSWER IS KNOWABLE, before touching the network.
   *
   * `loading` is not free: the app's fresh-visit gate refuses to route anyone while the answer is
   * unknown, so a brand-new visitor with no account sat on a blank screen until a ~200 kB SDK had
   * downloaded, initialised and reported the obvious. Measured on typical cellular that was ~6 s
   * of nothing, and the people paying it were the ones LEAST likely to ever sign in.
   *
   * No persisted session ⇒ the listener's first callback is guaranteed to be `null`, so say so
   * now. No `emit` — React re-reads the snapshot after `subscribe` returns, and there is nobody
   * subscribed yet on the first attach. The listener below still goes on to attach, so an actual
   * sign-in later updates this store exactly as before.
   */
  if (!hasPersistedSession()) state = SIGNED_OUT;

  void (async () => {
    try {
      const { getAuthClient } = await import('./firebase');
      const auth = await getAuthClient();
      if (!auth) return emit(UNCONFIGURED);
      const { onAuthStateChanged } = await import('firebase/auth');
      onAuthStateChanged(
        auth,
        (u) => {
          emit(
            u
              ? {
                  status: 'signed-in',
                  user: {
                    uid: u.uid,
                    name: u.displayName,
                    email: u.email,
                    photoURL: u.photoURL,
                  },
                }
              : SIGNED_OUT,
          );
        },
        // An SDK-level failure is not a reason to hang on "loading" forever; signed-out is the
        // honest reading and it keeps every gate closed.
        () => emit(SIGNED_OUT),
      );
    } catch {
      emit(SIGNED_OUT);
    }
  })();
}

function subscribe(listener: () => void): () => void {
  attach();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return React.useSyncExternalStore(
    subscribe,
    () => state,
    () => (isAuthConfigured() ? LOADING : UNCONFIGURED),
  );
}

/**
 * Just the boolean, for gates. `loading` reads as NOT signed in on purpose: a gate that opens
 * while the answer is still unknown is not a gate.
 */
export function useIsSignedIn(): boolean {
  return useAuth().status === 'signed-in';
}
