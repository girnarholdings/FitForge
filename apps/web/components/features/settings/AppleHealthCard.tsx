'use client';

/**
 * THE APPLE HEALTH CARD — shell only (iOS contract, surface 3 of 3).
 *
 * Where the health connection is STATED, not configured: what is connected, which metrics are
 * actually yielding data, when the last sync landed, and the one honest path to changing any of
 * it. Two facts shape every line of copy:
 *
 *   · HEALTHKIT NEVER REVEALS DENIAL. iOS will not tell an app which read permissions were
 *     refused, so "yieldedData" — did anything ever arrive — is the only per-metric signal we can
 *     print without guessing. A quiet metric might be switched off, or might simply have nothing
 *     to read; the copy says so instead of pretending to know.
 *   · PERMISSIONS LIVE IN iOS, NOT HERE. The card points at Settings → Health → Data Access
 *     rather than offering toggles that could only lie. The one switch the web side truly owns
 *     is Disconnect: stop ingesting, keep everything already imported — and the copy says both.
 *     (Resume is the same switch's other half, so a disconnected card never dead-ends.)
 *
 * Rendered ONLY inside the iOS shell (`inShell()` — detection is the injected global, never the
 * user agent). In a browser this component returns null and the profile screen is unchanged.
 */
import * as React from 'react';
import { Button, Card, CardTitle } from '@/components/ui';
import { HeartIcon } from '@/components/ui/icons';
import { inShell } from '@/lib/native/forgeBridge';
import { disconnect, permissionState, reconnect, useHealthData } from '@/lib/health/store';

/** The v1 metric set, trainer-ranked as in the contract, with the product's names for them. */
const METRIC_LABELS: [key: string, label: string][] = [
  ['sleep', 'Sleep'],
  ['restingHeartRate', 'Resting heart rate'],
  ['hrvSdnn', 'Heart rate variability'],
  ['bodyMass', 'Body weight'],
  ['steps', 'Steps'],
  ['activeEnergy', 'Active energy'],
  ['workouts', 'Workouts'],
];

/** "3 Aug, 07:12" — enough to trust the data's freshness, no false precision. */
function syncLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AppleHealthCard() {
  /* Shell detection in an effect: the page is prerendered, and the injected `window.ForgeShell`
   * global only exists on the client — the first render must match the static HTML (no card). */
  const [shell, setShell] = React.useState(false);
  React.useEffect(() => setShell(inShell()), []);

  // The subscription: permission pushes, sync completions and the disconnect toggle all land in
  // the store's meta, so the card re-renders as they do.
  const health = useHealthData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- health is the subscription tick
  const perms = React.useMemo(() => permissionState(), [health]);

  if (!shell) return null;

  const disconnected = health.meta.disconnected;
  const connected = perms != null && !disconnected;
  // A completed sync is the stronger claim; the latest batch still counts as data arriving.
  const lastSync = syncLabel(health.meta.lastSyncCompleteAt ?? health.meta.lastBatchAt);

  return (
    <Card className="space-y-3 shadow-[var(--shadow-card)]" data-testid="apple-health-card">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent">
          <HeartIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle>Apple Health</CardTitle>
          <p className="text-xs text-muted-foreground" data-testid="apple-health-status">
            {disconnected
              ? 'Disconnected — nothing new is being read.'
              : connected
                ? lastSync
                  ? `Connected · last sync ${lastSync}`
                  : 'Connected · first sync pending'
                : 'Not connected — nothing is being read.'}
          </p>
        </div>
      </div>

      {connected && perms && (
        <ul className="space-y-1 border-t border-border pt-3">
          {METRIC_LABELS.map(([key, label]) => {
            const m = perms[key as keyof typeof perms];
            if (!m || !m.requested) return null;
            return (
              <li
                key={key}
                className="flex items-baseline justify-between gap-3 text-sm"
                data-testid={`apple-health-metric-${key}`}
              >
                <span className="min-w-0 truncate text-foreground">{label}</span>
                <span
                  className={
                    'shrink-0 text-xs font-semibold ' +
                    (m.yieldedData ? 'text-success' : 'text-muted-foreground')
                  }
                >
                  {m.yieldedData ? 'coming through' : 'quiet'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* The honest limits, stated where the question arises: what "quiet" means, and where the
          real switches live. iOS never tells an app which reads were refused, so we don't guess. */}
      <p className="text-[11px] leading-snug text-muted-foreground">
        A quiet metric means no data has arrived — it may be switched off for FitForge, or there
        may be nothing to read; iOS doesn&rsquo;t tell apps which. Permissions live in iOS:{' '}
        <span className="font-semibold text-foreground">
          Settings → Health → Data Access &amp; Devices → FitForge
        </span>
        .
      </p>

      {connected && (
        <div className="border-t border-border pt-3">
          <Button
            size="lg"
            variant="secondary"
            block
            onClick={() => disconnect()}
            data-testid="apple-health-disconnect"
          >
            Disconnect Apple Health
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Stops reading anything new. Everything already imported stays on this device.
          </p>
        </div>
      )}

      {disconnected && (
        <div className="border-t border-border pt-3">
          <Button
            size="lg"
            variant="secondary"
            block
            onClick={() => reconnect()}
            data-testid="apple-health-reconnect"
          >
            Resume Apple Health
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Picks up where it left off — nothing was deleted while disconnected.
          </p>
        </div>
      )}
    </Card>
  );
}
