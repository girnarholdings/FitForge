'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { ExportIcon, CheckIcon } from '@/components/ui/icons';
import { StepArt } from '@/components/illustrations';
import { exportAllState } from '@/lib/demo/store';
import { useAuth } from '@/lib/auth/useUser';
import { useOnboarding } from '../OnboardingProvider';

/**
 * Terminal screen (§2.2 `done`) — and, for a Local Mode user, the first moment there is anything
 * worth backing up.
 *
 * The welcome screen told them their data lives in this browser and showed them Import; that was
 * the right moment for Import (a returning user has a file) and the wrong moment for Export
 * (there was nothing in it yet). Here it is the other way round: the plan and targets exist, and
 * one tap writes them to a file. Saying it once at the start and never again is how "export your
 * data" becomes advice nobody acts on.
 *
 * Signed-in users see none of it — the account is the backup, and telling them to manage files
 * would be inventing a chore.
 */
export function DoneStep() {
  const { finish, saving } = useOnboarding();
  const { status } = useAuth();
  const [exported, setExported] = React.useState(false);

  const exportBackup = () => {
    const blob = new Blob([exportAllState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitforge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  return (
    <>
      <div className="scroll-region safe-top flex flex-col items-center justify-center px-6 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-accent-muted shadow-[var(--shadow-glow)]">
          <StepArt step="done" size={48} />
        </span>
        <h1 className="mt-5 font-display text-[clamp(1.375rem,5.6vw,1.75rem)] font-bold tracking-tight">
          You&apos;re all set!
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-snug text-muted-foreground">
          Your starter plan and daily targets are forged. Time to train.
        </p>

        {status !== 'signed-in' && (
          <div
            className="mt-5 w-full max-w-xs rounded-2xl border border-border bg-surface-2 p-3 text-left"
            data-testid="done-local-backup"
          >
            <p className="text-[12.5px] font-semibold leading-tight text-foreground">
              Save a copy while it&apos;s fresh
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              Your plan lives in this browser only. One file keeps it safe — and restores it on any
              other device from the welcome screen.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2.5"
              onClick={exportBackup}
              data-testid="done-export"
            >
              {exported ? <CheckIcon size={14} /> : <ExportIcon size={14} />}
              {exported ? 'Backup saved' : 'Export a backup'}
            </Button>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              You can do this again any time from Settings → Local Mode.
            </p>
          </div>
        )}
      </div>

      <div className="cta-dock px-6">
        <Button size="lg" block glow loading={saving} onClick={finish}>
          Go to Today
        </Button>
      </div>
    </>
  );
}
