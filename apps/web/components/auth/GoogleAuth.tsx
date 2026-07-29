'use client';

/**
 * SIGN IN WITH GOOGLE — the button, the account row, and the thing that keeps the cloud copy in
 * step.
 *
 * The whole file renders NOTHING when the build has no Firebase project (`isAuthConfigured()`),
 * which is the default for a fork and for local development. FitForge without an account is not
 * a degraded FitForge: Local Mode is the product, and an account only adds a copy of it that
 * survives losing the device.
 */
import * as React from 'react';
import { Button } from '@/components/ui';
import { SparkIcon, LogOutIcon, CheckIcon } from '@/components/ui/icons';
import {
  completeRedirectSignIn,
  isAuthConfigured,
  signInWithGoogle,
  signOutUser,
  warmGoogleScript,
  warmSignIn,
} from '@/lib/auth/firebase';
import { useAuth } from '@/lib/auth/useUser';
import { getSyncStatus, startCloudMirror, subscribeSync, syncOnSignIn } from '@/lib/auth/sync';

/**
 * A sign-in that went out via redirect finishes on a PAGE LOAD, not in the click handler that
 * started it — by then the component that made the call is long gone. So the outcome lands here,
 * in a one-slot store, and the button picks it up whenever it next mounts. Without this a redirect
 * that came back rejected (an unauthorised domain, say) would fail completely silently, which is
 * the exact failure mode this whole change exists to remove.
 */
let redirectError: string | null = null;
const redirectListeners = new Set<() => void>();

function setRedirectError(message: string | null) {
  redirectError = message;
  for (const l of redirectListeners) l();
}

function subscribeRedirectError(listener: () => void) {
  redirectListeners.add(listener);
  return () => redirectListeners.delete(listener);
}

function useRedirectError() {
  return React.useSyncExternalStore(
    subscribeRedirectError,
    () => redirectError,
    () => null,
  );
}

/** Google's mark, inline. An external image would be a third-party request on the sign-in path. */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.3 0-1.3-.1-2.3-.4-4.5z"
      />
    </svg>
  );
}

/**
 * THE SYNC DRIVER. Mounted once (in the app shell): reconciles on sign-in and mirrors local
 * changes up afterwards. Rendered as a component rather than called in a hook somewhere arbitrary
 * so the listener's lifetime is a mounted element, and it renders nothing.
 */
export function CloudSyncDriver() {
  const { status, user } = useAuth();

  // Finish a redirect sign-in if one is landing on this page load. Mounted app-wide because the
  // redirect returns to wherever it started, and free when nothing is pending — the SDK checks a
  // session flag before it touches the network, so ordinary page loads pay nothing and contact
  // nobody. That "contact nobody" is load-bearing: regression-coach-safety asserts a red-flag
  // question produces no off-origin request at all, and this component is on that page too.
  React.useEffect(() => {
    void completeRedirectSignIn().then((outcome) => {
      if (outcome && !outcome.ok && outcome.reason === 'failed') setRedirectError(outcome.message);
    });
  }, []);

  React.useEffect(() => {
    if (status !== 'signed-in' || !user) return;
    let stop = () => {};
    void syncOnSignIn(user.uid).then(() => {
      stop = startCloudMirror(user.uid);
    });
    return () => stop();
  }, [status, user?.uid]);
  return null;
}

function useSyncStatus() {
  return React.useSyncExternalStore(
    subscribeSync,
    getSyncStatus,
    () => ({ state: 'idle' }) as ReturnType<typeof getSyncStatus>,
  );
}

/**
 * The sign-in call to action, for the two places someone might start an account: the landing page
 * and Settings.
 *
 * `warmOnMount` decides when the popup machinery is prepared, and the two callers want different
 * answers. Warming means fetching Google's script and opening an iframe on the auth domain, which
 * is what lets `window.open` fire inside the click's user-activation window on a phone — but it is
 * also a third-party request made on behalf of someone who has not asked for one.
 *
 * On SETTINGS that is a fair trade: you navigated into account territory deliberately, and the
 * account card is the reason you are looking at the screen.
 *
 * On the LANDING PAGE it is not. That page's own copy says "Free, no account", most of its
 * visitors will choose Local Mode, and making every one of them talk to Google to prepare a button
 * they will not press is exactly the kind of thing this app has been careful not to do. So there
 * it warms on the first sign of intent — pointer down or keyboard focus — and a popup that gets
 * blocked anyway falls back to a redirect, which needs no warming at all.
 */
export function GoogleSignInButton({
  block = true,
  warmOnMount = true,
  onDone,
}: {
  block?: boolean;
  warmOnMount?: boolean;
  onDone?: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [redirecting, setRedirecting] = React.useState(false);
  const fromRedirect = useRedirectError();

  React.useEffect(() => {
    if (warmOnMount) void warmSignIn();
  }, [warmOnMount]);

  /** Someone is reaching for the button. Prepare everything, whether or not mount already did. */
  const warmNow = () => {
    void warmSignIn();
    warmGoogleScript();
  };

  if (!isAuthConfigured()) return null;

  const go = async () => {
    setBusy(true);
    setError(null);
    setRedirectError(null);
    // signInWithGoogle is total, but this is the one place where being wrong means a button that
    // spins forever and says nothing — the exact symptom being fixed. Belt as well as braces.
    const outcome = await signInWithGoogle().catch(
      (e: unknown) =>
        ({
          ok: false,
          reason: 'failed',
          code: 'auth/unexpected',
          message: `Sign-in failed unexpectedly (${String((e as { code?: string })?.code ?? e).slice(0, 80)}).`,
        }) as const,
    );
    if (outcome.ok) {
      setBusy(false);
      onDone?.();
      return;
    }
    if (outcome.reason === 'redirecting') {
      // The page is navigating to Google. Keep the button disabled so the last thing on screen is
      // "taking you to Google" rather than an idle button that appears to have ignored the click.
      setRedirecting(true);
      return;
    }
    setBusy(false);
    // 'cancelled' is a decision, not a failure, and gets no message at all.
    if (outcome.reason === 'failed') setError(outcome.message);
  };

  const shown = error ?? fromRedirect;

  return (
    <div className={block ? 'w-full' : ''}>
      <Button
        variant="secondary"
        block={block}
        loading={busy || redirecting}
        // The intent signals. On Settings this tops up a warm that already happened at mount; on
        // the landing page it IS the warm-up, and it is the earliest honest moment to start one.
        onPointerDown={warmNow}
        onFocus={warmNow}
        onClick={() => void go()}
        data-testid="google-signin"
      >
        <GoogleMark /> {redirecting ? 'Taking you to Google…' : 'Continue with Google'}
      </Button>
      {shown && (
        <p className="mt-1.5 text-[11px] leading-snug text-danger" data-testid="signin-error">
          {shown} Your data is safe in this browser either way.
        </p>
      )}
    </div>
  );
}

/**
 * The signed-in account row: who you are, what syncing is doing, and the way out. Shown in
 * Settings; collapses to the sign-in pitch when signed out.
 */
export function AccountCard() {
  const { status, user } = useAuth();
  const sync = useSyncStatus();
  if (!isAuthConfigured()) return null;

  if (status !== 'signed-in' || !user) {
    return (
      <div data-testid="account-signed-out" className="space-y-2.5">
        <p className="text-sm text-muted-foreground">
          Sign in to back your training up to your Google account and pick it up on another
          device. Your data stays in this browser either way — an account just adds a copy.
        </p>
        <GoogleSignInButton />
      </div>
    );
  }

  return (
    <div data-testid="account-signed-in" className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-sm font-bold text-accent-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer */}
          {user.photoURL ? (
            <img src={user.photoURL} alt="" width={40} height={40} referrerPolicy="no-referrer" />
          ) : (
            (user.name ?? user.email ?? 'A').slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {user.name ?? 'Signed in'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground" data-testid="sync-status">
        {sync.state === 'syncing' && 'Syncing…'}
        {sync.state === 'synced' && (
          <span className="inline-flex items-center gap-1 text-success">
            <CheckIcon size={12} />
            {sync.direction === 'pull' ? 'Restored from your account' : 'Backed up to your account'}
          </span>
        )}
        {sync.state === 'error' && <span className="text-danger">{sync.detail}</span>}
        {sync.state === 'idle' && 'Your training backs up automatically.'}
      </p>

      <Button variant="ghost" size="sm" onClick={() => void signOutUser()} data-testid="signout">
        <LogOutIcon size={15} /> Sign out
      </Button>
    </div>
  );
}

/**
 * The one-line nudge shown beside the model picker when a members-only model exists that this
 * visitor cannot reach. States the actual reason rather than dangling a locked feature: the free
 * tier is shared and can run out, and signing in moves you off it.
 */
export function MembersModelHint() {
  if (!isAuthConfigured()) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" data-testid="members-hint">
      <SparkIcon size={11} className="text-accent" />
      Sign in for a faster model
    </span>
  );
}
