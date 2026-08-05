'use client';

/**
 * "YOUR LOG IS ABOUT TO BE TRIMMED" — the 30 days of notice that make the 180-day window fair.
 *
 * The cloud copy is one Firestore document with a hard ceiling, and an audit measured a committed
 * athlete crossing it at about a year of use — after which syncing froze silently and everything
 * newer lived on one phone only. Bounding the log fixes that; doing it without warning would
 * simply move the loss somewhere the athlete could not see it either.
 *
 * So this sits on Today — the screen every session and every sign-in lands on — from day 150, and
 * carries the one thing that actually helps: a full backup, one tap, including the part that is
 * about to go. It is dismissible, and dismissing it does NOT stop the warnings; it stops today's.
 *
 * The prune runs from here too, and only ever AFTER a warning has been recorded (`pruneOldData`
 * enforces that itself). When it does run, the athlete is told what went — a hole in the history
 * with no explanation is the thing this whole feature exists to avoid.
 */
import * as React from 'react';
import { Card, Button } from '@/components/ui';
import { ExportIcon, InfoIcon } from '@/components/ui/icons';
import { localISO } from '@/components/features/_mock/data';
import {
  exportAllState,
  markRetentionWarned,
  pruneOldData,
  retentionState,
  type PruneResult,
} from '@/lib/demo/store';
import { RETENTION_DAYS } from '@/lib/demo/retention';
import { useDemoState } from '@/lib/demo/useDemo';

/** Same download the Settings backup button produces — one file, everything in it. */
function downloadBackup() {
  const blob = new Blob([exportAllState()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitforge-backup-${localISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RetentionNotice() {
  // Reactive: logging a session can be what tips the log over the line, and the notice should
  // appear on that render rather than on the next visit.
  const state = useDemoState();
  const [dismissed, setDismissed] = React.useState(false);
  const [pruned, setPruned] = React.useState<PruneResult | null>(null);
  const ranRef = React.useRef(false);

  const status = retentionState();

  /**
   * The prune, once per mount, and never before a warning exists.
   *
   * Deliberately in an effect rather than at module load: it writes to two stores and must not run
   * during render. `pruneOldData` is the real gate — it re-checks the phase and the warning stamp
   * itself, so this cannot delete anything by arriving at the wrong moment.
   */
  React.useEffect(() => {
    if (ranRef.current || status.phase !== 'due') return;
    ranRef.current = true;
    const result = pruneOldData();
    if (result) setPruned(result);
    // No warning on record yet (an imported backup, or the first run after this shipped): the
    // notice below renders instead, and the trim waits for the next visit.
    else markRetentionWarned();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot, gated on the phase above
  }, [status.phase]);

  // Record that they have now been told — this is what later authorises the trim.
  React.useEffect(() => {
    if (status.phase === 'warn' && !state.retentionWarnedAt) markRetentionWarned();
  }, [status.phase, state.retentionWarnedAt]);

  if (pruned) {
    return (
      <Card className="border-border bg-surface-2" data-testid="retention-pruned">
        <div className="flex gap-3">
          <span className="mt-0.5 shrink-0 text-accent" aria-hidden>
            <InfoIcon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Older training has been trimmed
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {pruned.sessions > 0 && (
                <>
                  {pruned.sessions} {pruned.sessions === 1 ? 'session' : 'sessions'}
                  {pruned.foodDays > 0 ? ' and ' : ' '}
                </>
              )}
              {pruned.foodDays > 0 && (
                <>
                  {pruned.foodDays} {pruned.foodDays === 1 ? 'day' : 'days'} of food logs{' '}
                </>
              )}
              from before {pruned.cutoff} were removed to keep your backup within its size limit.
              Your plan, your weight history and your personal records are untouched.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2.5"
              onClick={downloadBackup}
              data-testid="retention-export"
            >
              <ExportIcon size={14} /> Export what is left
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (status.phase === 'ok' || dismissed) return null;

  return (
    <Card className="border-border bg-surface-2" data-testid="retention-warning">
      <div className="flex gap-3">
        <span className="mt-0.5 shrink-0 text-accent" aria-hidden>
          <InfoIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {status.daysUntilPrune > 0
              ? `Your oldest training is trimmed in ${status.daysUntilPrune} ${
                  status.daysUntilPrune === 1 ? 'day' : 'days'
                }`
              : 'Your oldest training is about to be trimmed'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            FitForge keeps {RETENTION_DAYS} days of workouts and food logs so your backup stays
            within its size limit and never stops syncing. Export a file now and you keep
            everything, permanently — your plan, weight history and PRs are never trimmed either
            way.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={downloadBackup} data-testid="retention-export">
              <ExportIcon size={14} /> Export a backup
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              data-testid="retention-dismiss"
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
