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
import { isAuthConfigured } from './firebase';

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

let state: AuthState = isAuthConfigured() ? LOADING : UNCONFIGURED;
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
