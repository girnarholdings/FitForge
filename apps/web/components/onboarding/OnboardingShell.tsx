'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ProgressBar } from '@/components/ui';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { StepArt } from '@/components/illustrations';
import { STEP_META, wizardProgressInMode } from '@/lib/onboarding/steps';
import type { OnboardingStep } from '@fitforge/shared/schemas';
import { getRestoreState, subscribeRestore } from '@/lib/auth/sync';
import { shouldLeaveOnboarding } from '@/lib/auth/reconcileRule';
import { isOnboarded } from '@/lib/demo/store';
import { useOnboarding } from './OnboardingProvider';
import { OnboardingDockContext } from './OnboardingFooter';
import { STEP_COMPONENTS } from './steps';

/**
 * Chrome for an onboarding screen — a STRICT 3-zone `100svh` column so nothing ever runs off an
 * iPhone Safari viewport (390 × 664 with the URL bar + toolbar showing):
 *
 *   1. header  — back + progress, fixed height, notch-safe.
 *   2. middle  — `.scroll-region`, the ONLY scroller (title, subtitle, step body).
 *   3. dock    — `.cta-dock`, a real flex zone the step's `OnboardingFooter` portals into, so the
 *                CTA is always in the thumb zone and can never sit on top of the step content.
 *
 * `welcome` / `done` get a bare `.screen` frame and lay out their own zones.
 */
export function OnboardingShell({ step }: { step: OnboardingStep }) {
  const meta = STEP_META[step];
  const { goBack, draft } = useOnboarding();
  // The AI-Mode fork reuses some wizard screens (goals, plan preview) with its own subtitle and
  // its own, shorter progress count. Old School (ai_mode falsy) resolves to the exact old values.
  const aiMode = !!draft.ai_mode;
  const subtitle = aiMode && meta.aiSubtitle ? meta.aiSubtitle : meta.subtitle;
  const StepBody = STEP_COMPONENTS[step];
  const [dock, setDock] = React.useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const restored = React.useSyncExternalStore(
    subscribeRestore,
    () => getRestoreState().pulled,
    () => false,
  );

  /**
   * A cloud restore landing mid-onboarding ends onboarding.
   *
   * Mostly a safety net — signing in now routes straight to the app, which waits for the account
   * before deciding anything. But someone can still arrive here first: a deep link, a redirect
   * sign-in that returns to this URL, or tapping Local Mode and signing in afterwards. If their
   * real plan arrives while they are answering questions, continuing to ask is absurd.
   *
   * KEYED ON AN ACTUAL PULL, not on the store looking finished. `finalizeOnboarding` runs on the
   * plan-preview screen — while the user is still reading the plan and has not pressed "Start
   * plan" — so a `completedAt`-based condition ejects them from the wizard one screen early. The
   * first version did exactly that and the onboarding walk failed on the spot.
   *
   * AND THE PULL HAS TO HAVE BROUGHT A PLAN. A pull alone is not a reason to leave: signing in
   * with a brand-new Google account creates the account document FROM THIS DEVICE's empty store,
   * so the very next reconcile pulls back a bundle with no finished onboarding in it. That
   * satisfied this rule, sent the athlete to /today, where the shell's own gate saw no plan and
   * sent them straight back here — a redirect loop, roughly a hundred round trips a second, that
   * every new Google user hit the moment they reloaded mid-wizard. Requiring an actual plan makes
   * the two rules agree: the shell ejects people WITHOUT one, this ejects people WITH one, and
   * nobody satisfies both.
   */
  React.useEffect(() => {
    if (shouldLeaveOnboarding(restored, isOnboarded())) router.replace('/today');
  }, [restored, router]);

  if (!meta.wizard) {
    return (
      <main className="screen mx-auto w-full max-w-[430px] sm:max-w-md">
        <StepBody />
      </main>
    );
  }

  const { current, total } = wizardProgressInMode(step, aiMode);

  return (
    <OnboardingDockContext.Provider value={dock}>
      <main className="screen mx-auto w-full max-w-[430px] sm:max-w-md">
        <header className="safe-top flex-none px-6 pb-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Back"
              onClick={() => goBack(step)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <ChevronLeftIcon size={22} />
            </button>
            <ProgressBar current={current} total={total} label={`Step ${current} of ${total}`} />
          </div>
        </header>

        <div className="scroll-region flex flex-col px-6 pb-2" data-testid="onboarding-scroll">
          <StepArt step={step} size={44} className="mb-1 -ml-1 flex-none" />
          <h1 className="flex-none font-display text-[clamp(1.375rem,5.6vw,1.75rem)] font-bold leading-[1.15] tracking-tight text-foreground">
            {meta.title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 flex-none text-[0.8125rem] leading-snug text-muted-foreground">
              {subtitle}
            </p>
          )}
          <div className="flex flex-1 flex-col pt-4">
            <StepBody />
          </div>
        </div>

        {/* Zone 3 — collapses to zero height until a step's OnboardingFooter portals in. */}
        <div ref={setDock} className="cta-dock px-6" data-testid="onboarding-dock" />
      </main>
    </OnboardingDockContext.Provider>
  );
}
