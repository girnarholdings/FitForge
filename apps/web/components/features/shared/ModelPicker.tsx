'use client';

/**
 * THE MODEL PICKER, shared by every surface that spends an AI call.
 *
 * There is exactly ONE preference (see `lib/kb/client`: a single localStorage key, a single
 * subscribe/notify store), and this component is the only way to change it. That is the point of
 * putting it here rather than re-implementing a `<select>` per screen: the Coach chat and the
 * nutrition macro estimator are two doors onto the same worker, and a user who picks a model in
 * one and finds the other still on the old one would be right to call that broken.
 *
 * WHAT IT MAY OFFER IS NOT THIS COMPONENT'S DECISION. The options come from the worker's health
 * check, which advertises only what its own configuration can honour — the free Workers AI chain,
 * plus a Mistral entry while the deployer's key is live. When the worker is unreachable,
 * unconfigured, or predates the catalog, {@link useCoachModels} returns an empty list and this
 * renders NOTHING. A picker offering a backend the worker will refuse is worse than no picker.
 */
import * as React from 'react';
import {
  fetchCoachStatus,
  getPreferredModel,
  isCoachConfigured,
  setPreferredModel,
  subscribeModelPref,
  type CoachModelChoice,
} from '@/lib/kb/client';
import { useIsSignedIn } from '@/lib/auth/useUser';

/**
 * The catalog THIS visitor may use, or `[]` when there is nothing to choose between.
 *
 * Members-only entries (FitForge's own model allowance) are filtered out while signed out. That
 * is presentation, not protection: the worker refuses them without a verified Firebase token, and
 * has to, since anyone can post to it directly. What the filter buys is honesty — never offering
 * a choice that would be silently ignored.
 *
 * The underlying health probe is cached in sessionStorage for an hour by `fetchCoachStatus`, so
 * mounting this on several screens costs one request per session, not one per screen.
 */
export function useCoachModels(): CoachModelChoice[] {
  const [models, setModels] = React.useState<CoachModelChoice[]>([]);
  const signedIn = useIsSignedIn();
  React.useEffect(() => {
    if (!isCoachConfigured()) return;
    let alive = true;
    void fetchCoachStatus().then((s) => {
      if (alive && s?.online && s.models?.length) setModels(s.models);
    });
    return () => {
      alive = false;
    };
  }, []);
  return React.useMemo(
    () => models.filter((m) => signedIn || !m.requiresAuth),
    [models, signedIn],
  );
}

/** True when a members-only model exists that this visitor cannot use yet — the reason to sign in. */
export function useHasLockedModels(): boolean {
  const [models, setModels] = React.useState<CoachModelChoice[]>([]);
  const signedIn = useIsSignedIn();
  React.useEffect(() => {
    if (!isCoachConfigured()) return;
    let alive = true;
    void fetchCoachStatus().then((s) => {
      if (alive && s?.online && s.models?.length) setModels(s.models);
    });
    return () => {
      alive = false;
    };
  }, []);
  return !signedIn && models.some((m) => m.requiresAuth);
}

/** The current pick ('' = Auto), live across every mounted picker. */
export function usePreferredModel(): string {
  return React.useSyncExternalStore(
    subscribeModelPref,
    () => getPreferredModel() ?? '',
    () => '',
  );
}

/** Human label for a model id — used to say which model produced a given answer. */
export function labelForModel(models: CoachModelChoice[], id: string | undefined): string | null {
  if (!id) return null;
  return models.find((m) => m.id === id)?.label ?? id.split('/').pop() ?? null;
}

export function ModelPicker({
  /** Visible text before the control. Pass null for the compact, label-less form. */
  label = 'Model',
  className,
  testId = 'model-select',
}: {
  label?: string | null;
  className?: string;
  testId?: string;
}) {
  const models = useCoachModels();
  const preferred = usePreferredModel();
  if (models.length === 0) return null;

  return (
    <label
      className={
        'inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground ' +
        (className ?? '')
      }
    >
      {/* The accessible name is always present; `label={null}` only hides the ink. */}
      <span className={label == null ? 'sr-only' : ''}>{label ?? 'AI model'}</span>
      <select
        value={preferred}
        onChange={(e) => setPreferredModel(e.target.value || null)}
        data-testid={testId}
        aria-label="AI model"
        className="h-8 min-w-0 max-w-[11rem] flex-1 cursor-pointer truncate rounded-chip border border-border bg-surface-2 px-1.5 text-[11px] font-semibold text-foreground outline-none transition-colors hover:border-border-strong focus-visible:border-accent"
      >
        {/* Auto is first and is the recommendation: it lets the worker apply its own policy,
            which is the only setting that stays correct when a model is retired. */}
        <option value="">Auto — coach picks</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
