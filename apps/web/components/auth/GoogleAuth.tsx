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
import { isAuthConfigured, signInWithGoogle, signOutUser } from '@/lib/auth/firebase';
import { useAuth } from '@/lib/auth/useUser';
import { getSyncStatus, startCloudMirror, subscribeSync, syncOnSignIn } from '@/lib/auth/sync';

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
 * The sign-in call to action, for the places where someone might start an account: the settings
 * screen and the login page.
 */
export function GoogleSignInButton({
  block = true,
  onDone,
}: {
  block?: boolean;
  onDone?: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!isAuthConfigured()) return null;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      onDone?.();
    } catch {
      // The popup flow's failures are environmental (blocked popup, unauthorised domain), and the
      // fix is never something the user can do from inside the app — so say what still works.
      setError('Google sign-in could not complete. Your data is safe in this browser.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={block ? 'w-full' : ''}>
      <Button
        variant="secondary"
        block={block}
        loading={busy}
        onClick={() => void go()}
        data-testid="google-signin"
      >
        <GoogleMark /> Continue with Google
      </Button>
      {error && <p className="mt-1.5 text-[11px] leading-snug text-danger">{error}</p>}
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
      Sign in for FitForge&apos;s faster model
    </span>
  );
}
