'use client';

/**
 * "THIS ACCOUNT ALREADY HAS TRAINING IN IT." — the sign-in half of the merge-or-overwrite question.
 *
 * Signing in used to be a silent, irreversible merge decision made by comparing two timestamps. On
 * a shared device, or after restoring somebody's export, that is a data-loss bug wearing the mask
 * of a convenience feature: the newer copy won and the other one was gone with no record that it
 * had ever existed. `syncOnSignIn` now stops on that case and writes nothing; this sheet is where
 * it gets settled, on the numbers, by the person whose training it is.
 *
 * Mounted app-wide (next to the sync driver) rather than inside Settings, because the conflict is
 * detected wherever the athlete happened to sign in — usually the landing page.
 */
import * as React from 'react';
import { Button, Sheet } from '@/components/ui';
import { SummaryColumn } from '@/components/features/shared/BackupSummary';
import {
  getSyncConflict,
  resolveSyncConflict,
  subscribeConflict,
  type ConflictResolution,
} from '@/lib/auth/sync';

export function SyncConflictSheet() {
  const conflict = React.useSyncExternalStore(subscribeConflict, getSyncConflict, () => null);
  const [busy, setBusy] = React.useState<ConflictResolution | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function choose(choice: ConflictResolution) {
    setBusy(choice);
    setError(null);
    void resolveSyncConflict(choice).then((ok) => {
      setBusy(null);
      // A failure leaves the sheet open with the conflict intact — nothing was written, and the
      // athlete can try again or pick differently. Silently closing it would imply a decision.
      if (!ok) setError('That did not go through. Check your connection and try again.');
    });
  }

  return (
    <Sheet
      open={conflict !== null}
      /* NOT DISMISSIBLE. Every other sheet in the app closes on a backdrop tap, because closing
         them costs nothing. Closing this one would leave sync latched off with no way back to the
         question until the next sign-in — one of the three buttons is the way out. */
      onClose={() => {}}
      title="This account already has training in it"
    >
      {conflict && (
        <>
          <p className="text-sm text-muted-foreground">
            Your account holds a different set of training from what is in this browser. Nothing has
            been changed yet — pick what should happen.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2" data-testid="conflict-compare">
            <SummaryColumn
              label="Your account"
              summary={conflict.cloud}
              testid="conflict-summary-cloud"
            />
            <SummaryColumn
              label="This device"
              summary={conflict.local}
              testid="conflict-summary-local"
            />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              block
              disabled={busy !== null}
              onClick={() => choose('merge')}
              data-testid="conflict-merge"
            >
              {busy === 'merge' ? 'Merging…' : 'Merge them'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Keeps this device&apos;s plan and profile, and adds every workout, food entry and
              weigh-in from the account that is missing here. Nothing is deleted.
            </p>
            <Button
              variant="secondary"
              block
              disabled={busy !== null}
              onClick={() => choose('cloud')}
              data-testid="conflict-use-cloud"
            >
              {busy === 'cloud' ? 'Restoring…' : "Use my account's copy"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Replaces what is in this browser with the account&apos;s copy. The right choice on a
              device that is not yours.
            </p>
            <Button
              variant="secondary"
              block
              disabled={busy !== null}
              onClick={() => choose('local')}
              data-testid="conflict-keep-local"
            >
              {busy === 'local' ? 'Uploading…' : "Keep this device's data"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Uploads what is here and replaces the account&apos;s copy. Everything the account held
              and this device does not is lost.
            </p>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger" data-testid="conflict-error">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
