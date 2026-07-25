'use client';

import * as React from 'react';
import Link from 'next/link';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { StepArt } from '@/components/illustrations';

/**
 * Screen 1 · Local Mode entry (§5.3). Reframed as a choice: start in Local Mode (primary, seeds a
 * local session and advances to /onboarding/goals) or create an account / sign in (secondary).
 *
 * One viewport at 390 × 664: everything above the fine print is ~460px, so the `enter-demo` CTA
 * lands in the thumb zone without scrolling.
 */
export function AuthStep() {
  return (
    <div className="scroll-region safe-top flex flex-col px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <StepArt step="done" size={48} className="flex-none" />
      <h1 className="mt-3 flex-none font-display text-[clamp(1.375rem,5.6vw,1.75rem)] font-bold leading-[1.15] tracking-tight">
        Start in Local Mode
      </h1>
      <p className="mt-2 flex-none text-[0.8125rem] leading-snug text-muted-foreground">
        No sign-up required. Your plan and progress are saved in this browser only — pick up right
        where you left off on this device.
      </p>

      <div className="mt-6 flex-none">
        <AuthPanel next="/onboarding/goals" />
      </div>

      <div className="mt-5 flex-none rounded-2xl border border-border bg-surface-2 p-3.5">
        <p className="text-[13px] font-semibold text-foreground">Prefer an account?</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
          Accounts with cloud sync are part of the hosted build.{' '}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Create account or sign in
          </Link>
          .
        </p>
      </div>

      <div className="min-h-4 flex-1" />

      <p className="flex-none text-center text-[11px] leading-snug text-muted-foreground">
        By continuing you agree to train responsibly. FitForge is guidance, not medical advice.
      </p>
    </div>
  );
}
