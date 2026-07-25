'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui';
import { useOnboarding } from './OnboardingProvider';
import type { OnboardingStep } from '@fitforge/shared/schemas';

/**
 * The shell publishes its bottom dock node here; `OnboardingFooter` portals into it. That keeps
 * the CTA a REAL third flex zone of the 100svh shell — it can never overlap the step body the way
 * a `position: sticky` footer inside the scroll region did (the equipment grid used to disappear
 * underneath it). Falls back to an in-flow sticky bar if no dock is mounted.
 */
export const OnboardingDockContext = React.createContext<HTMLElement | null>(null);

export interface OnboardingFooterProps {
  step: OnboardingStep;
  /** primary CTA label (default "Continue") */
  continueLabel?: string;
  /** disable the primary CTA (validation gate) */
  canContinue?: boolean;
  /** show a secondary "Skip" link that commits current (possibly empty) draft and advances */
  skippable?: boolean;
  /** override the default commit-and-next behaviour (e.g. plan preview) */
  onContinue?: () => void | Promise<void>;
}

/**
 * Bottom-anchored primary CTA (§1.3 thumb-first). Reads `saving`/`error` from context so every
 * step gets consistent loading + error surfacing.
 */
export function OnboardingFooter({
  step,
  continueLabel = 'Continue',
  canContinue = true,
  skippable = false,
  onContinue,
}: OnboardingFooterProps) {
  const { commitAndNext, saving, error } = useOnboarding();
  const dock = React.useContext(OnboardingDockContext);

  const handle = () => (onContinue ? onContinue() : commitAndNext(step));

  const bar = (
    <>
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        size="lg"
        block
        glow
        loading={saving}
        disabled={!canContinue}
        onClick={handle}
        data-testid="onboarding-continue"
      >
        {continueLabel}
      </Button>
      {skippable && (
        <Button
          size="md"
          variant="ghost"
          block
          disabled={saving}
          onClick={() => commitAndNext(step)}
          data-testid="onboarding-skip"
        >
          Skip for now
        </Button>
      )}
    </>
  );

  if (dock) return createPortal(bar, dock);

  // Fallback (shell dock not mounted yet / footer used outside the shell).
  return <div className="cta-dock sticky bottom-0 mt-auto px-6">{bar}</div>;
}
