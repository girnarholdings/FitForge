'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { StepArt } from '@/components/illustrations';
import { useOnboarding } from '../OnboardingProvider';

/** Terminal screen (§2.2 `done`). Reached only if the redirect to /today hasn't happened yet. */
export function DoneStep() {
  const { finish, saving } = useOnboarding();
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
      </div>

      <div className="cta-dock px-6">
        <Button size="lg" block glow loading={saving} onClick={finish}>
          Go to Today
        </Button>
      </div>
    </>
  );
}
