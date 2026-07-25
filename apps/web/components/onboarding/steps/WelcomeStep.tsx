'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { TargetIcon, SwapIcon, AppleIcon, SparkleIcon } from '@/components/ui/icons';
import { LogoLockup } from '@/components/illustrations';
import { patchDraft } from '@/lib/demo/store';
import { useOnboarding } from '../OnboardingProvider';

const HIGHLIGHTS = [
  {
    Icon: TargetIcon,
    title: 'A plan forged around you',
    body: 'Your goals, schedule, and the exact gear you have.',
  },
  {
    Icon: SwapIcon,
    title: 'Swap anything, instantly',
    body: 'Missing a machine? Get an equal alternative.',
  },
  {
    Icon: AppleIcon,
    title: 'Nutrition that matches',
    body: 'Calorie and macro targets from your body and goal.',
  },
];

/**
 * Screen 0 · Welcome (§5.2 / §5.4). Stacked logo, optional name capture, then "Get started".
 * Laid out as the two lower zones of the shell's `.screen`: a scroll region plus a pinned dock,
 * so the CTA stays in the thumb zone at 390 × 664 even if the highlights need to scroll.
 */
export function WelcomeStep() {
  const { goTo, patch } = useOnboarding();
  const [name, setName] = React.useState('');

  const start = () => {
    const trimmed = name.trim();
    const value = trimmed ? trimmed : null;
    patch({ display_name: value });
    patchDraft({ display_name: value });
    goTo('auth');
  };

  return (
    <>
      <div className="scroll-region safe-top flex flex-col px-6">
        <div className="flex flex-none flex-col items-center">
          <LogoLockup size={24} stacked />
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-muted px-3 py-1 text-[11px] font-semibold text-accent">
            <SparkleIcon size={13} /> Personalized in ~2 minutes
          </span>
        </div>

        <h1 className="mt-4 flex-none text-center font-display text-[clamp(1.5rem,6.6vw,2rem)] font-bold leading-[1.1] tracking-tight text-foreground">
          Your personal trainer,
          <br />
          <span className="text-gradient-gold">forged around you.</span>
        </h1>
        <p className="mt-2 flex-none text-center text-[0.9375rem] leading-snug text-muted-foreground">
          A few quick questions about your goals, gear, and preferences — we&apos;ll forge the rest.
        </p>

        <label className="mt-5 block flex-none">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            What should we call you?
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            autoComplete="given-name"
            data-testid="onboarding-name"
            /* 16px min font-size — anything smaller triggers iOS auto-zoom on focus. */
            className="mt-1.5 h-12 w-full rounded-[var(--radius-field)] border border-border bg-surface-2 px-4 text-base text-foreground outline-none transition-colors focus:border-accent"
          />
        </label>

        <ul className="mt-4 flex-none space-y-1.5">
          {HIGHLIGHTS.map(({ Icon, title, body }) => (
            <li
              key={title}
              className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2 shadow-[var(--shadow-card)]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-muted text-accent">
                <Icon size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight text-foreground">{title}</p>
                <p className="text-[11.5px] leading-tight text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="min-h-2 flex-1" />
      </div>

      <div className="cta-dock px-6">
        <Button size="lg" block glow onClick={start}>
          Get started
        </Button>
        <Link href="/login" className="block">
          <Button size="lg" variant="ghost" block>
            I already have an account
          </Button>
        </Link>
      </div>
    </>
  );
}
