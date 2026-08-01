'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingStep } from '@fitforge/shared/schemas';
import { nextStepInMode, prevStepInMode } from '@/lib/onboarding/steps';
import { ensureSession, saveDraft, loadDraft, getState, DEMO_USER_ID } from '@/lib/demo/store';
import { finalizeOnboarding } from '@/lib/demo/generate';
import { runDietGenerationForDraft } from './dietGeneration';
import { emptyDraft, type OnboardingDraft } from './types';

interface OnboardingContextValue {
  draft: OnboardingDraft;
  patch: (partial: Partial<OnboardingDraft>) => void;
  userId: string;
  saving: boolean;
  error: string | null;
  /**
   * True once the localStorage draft (if any) has been merged in. A step that SEEDS the draft on
   * arrival (exercise prefs) must wait for this: its mount effect and the rehydration effect run
   * in the same commit, so seeding early gets silently overwritten by the stored draft — and if
   * the seed's inputs happen to match the empty draft's, the effect never re-fires.
   *
   * The same ordering makes any step that WRITES draft-derived state on mount actively
   * destructive, because React runs child effects BEFORE parent effects: the child sees
   * `emptyDraft()`, not the athlete's answers. `PlanPreviewStep` called `finalizeOnboarding(draft)`
   * from a []-dep effect and so persisted a default-draft plan over a completed profile on any
   * cold load of /onboarding/plan_preview — which is a reachable resume URL, not a corner case.
   * Any step doing draft-derived work on mount MUST gate on this.
   */
  hydrated: boolean;
  /** commit the given step (write-through to localStorage) then advance to the next screen */
  commitAndNext: (step: OnboardingStep) => Promise<void>;
  /** go back one screen without losing draft state (§2.2 "back never loses data") */
  goBack: (step: OnboardingStep) => void;
  /** navigate to an arbitrary step (used by resume) */
  goTo: (step: OnboardingStep) => void;
  /** compute + persist the plan and leave onboarding for /today (§2.2) */
  finish: () => Promise<void>;
}

const OnboardingContext = React.createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = React.useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within <OnboardingProvider>');
  return ctx;
}

export interface OnboardingProviderProps {
  /** unused in demo mode (kept for API stability) */
  userId?: string;
  initialDraft?: Partial<OnboardingDraft>;
  children: React.ReactNode;
}

export function OnboardingProvider({ initialDraft, children }: OnboardingProviderProps) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<OnboardingDraft>(() => ({
    ...emptyDraft(),
    ...initialDraft,
  }));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  // Rehydrate any prior draft from localStorage after mount (resume support).
  React.useEffect(() => {
    ensureSession();
    const stored = loadDraft();
    if (stored && Object.keys(stored).length > 0) {
      setDraft((d) => ({ ...d, ...stored }));
    }
    // Set LAST, and unconditionally: this means "hydration was attempted and is finished", NOT
    // "we found something". A genuinely new user has no stored draft, and gating steps on a flag
    // that never flips for them would hang the flow at the first step that waits on it.
    setHydrated(true);
  }, []);

  const patch = React.useCallback((partial: Partial<OnboardingDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  const goTo = React.useCallback(
    (step: OnboardingStep) => router.push(`/onboarding/${step}`),
    [router],
  );

  // The AI-Mode fork walks its own, shorter chain; Old School (ai_mode falsy — including every
  // draft written before the fork existed) resolves to exactly the classic index-based order.
  const aiMode = !!draft.ai_mode;

  const goBack = React.useCallback(
    (step: OnboardingStep) => router.push(`/onboarding/${prevStepInMode(step, aiMode)}`),
    [router, aiMode],
  );

  const commitAndNext = React.useCallback(
    async (step: OnboardingStep) => {
      setSaving(true);
      setError(null);
      try {
        const next = nextStepInMode(step, aiMode);
        ensureSession();
        saveDraft(draft, next);
        router.push(`/onboarding/${next}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong saving your progress.');
      } finally {
        setSaving(false);
      }
    },
    [draft, router, aiMode],
  );

  const finish = React.useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      ensureSession();
      finalizeOnboarding(draft);
      // AI Mode completion also forges the 7-day diet plan (contract: "generatePlan +
      // generateDietPlan both run"). Behind its own never-throw boundary, AFTER the training
      // plan is persisted: a missing/failing diet engine must not keep anyone off Today.
      if (aiMode) await runDietGenerationForDraft(draft, getState().targets);
      router.push('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish onboarding.');
    } finally {
      setSaving(false);
    }
  }, [draft, router, aiMode]);

  const value = React.useMemo<OnboardingContextValue>(
    () => ({
      draft,
      patch,
      userId: DEMO_USER_ID,
      saving,
      error,
      hydrated,
      commitAndNext,
      goBack,
      goTo,
      finish,
    }),
    [draft, patch, saving, error, hydrated, commitAndNext, goBack, goTo, finish],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
