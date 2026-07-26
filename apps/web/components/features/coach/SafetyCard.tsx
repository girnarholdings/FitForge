'use client';

/**
 * SAFETY CARD — what the Coach says when someone reports pain, injury or a medical situation.
 *
 * This is not a styled disclaimer. It is the ANSWER for those questions: the retrieval path is
 * cut off upstream (`lib/kb/safety.ts` → `lib/kb/route.ts`), so nothing else can claim the primary
 * slot. Curated entries may appear underneath, but only below a hard rule, under an explicit
 * "general information" heading, and never phrased as a reply to the symptom.
 *
 * Two visual tiers, matching the two things the user needs to do:
 *  · `urgent`                    — danger red. Stop, and get medical attention now.
 *  · `injury` / `medical-general` — energy amber. Stop the aggravating movement, see a professional.
 */
import * as React from 'react';
import { Card } from '@/components/ui';
import { safetyBadge, safetyCopy } from '@/lib/kb/safety';
import type { SafetyFlag, SafetyLevel } from '@/lib/kb/safety';
import type { KbEntry } from '@/lib/kb/types';
import { AlertIcon, StethoscopeIcon } from './safetyIcons';

export interface SafetyCardProps {
  flag: SafetyFlag;
  /** Genuinely related curated entries, offered as SECONDARY general information only. */
  entries?: KbEntry[];
  onOpenEntry?: (entry: KbEntry) => void;
}

const TONE: Record<
  SafetyLevel,
  { ring: string; chip: string; icon: string; bullet: string; wrap: string }
> = {
  urgent: {
    ring: 'border-danger',
    chip: 'bg-danger/15 text-danger',
    icon: 'bg-danger/15 text-danger',
    bullet: 'text-danger',
    wrap: 'bg-danger/[0.06]',
  },
  injury: {
    ring: 'border-[color-mix(in_srgb,var(--energy)_55%,var(--border))]',
    chip: 'bg-energy-muted text-energy',
    icon: 'bg-energy-muted text-energy',
    bullet: 'text-energy',
    wrap: '',
  },
  'medical-general': {
    ring: 'border-[color-mix(in_srgb,var(--energy)_35%,var(--border))]',
    chip: 'bg-energy-muted text-energy',
    icon: 'bg-energy-muted text-energy',
    bullet: 'text-energy',
    wrap: '',
  },
};

export function SafetyCard({ flag, entries = [], onOpenEntry }: SafetyCardProps) {
  const copy = safetyCopy(flag.level);
  const tone = TONE[flag.level];
  const urgent = flag.level === 'urgent';

  return (
    <Card
      role="alert"
      data-testid="coach-safety-card"
      data-safety-level={flag.level}
      className={`${tone.ring} ${tone.wrap}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone.icon}`}
        >
          {urgent ? <AlertIcon size={19} /> : <StethoscopeIcon size={19} />}
        </span>
        <div className="min-w-0">
          <span
            data-testid="coach-safety-badge"
            className={`inline-flex items-center rounded-chip px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone.chip}`}
          >
            {safetyBadge(flag.level)}
          </span>
          <h2
            data-testid="coach-safety-headline"
            className="mt-2 font-display text-[17px] font-bold leading-snug text-foreground"
          >
            {copy.headline}
          </h2>
        </div>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-foreground">{copy.lead}</p>

      <ul className="mt-3 space-y-2.5" data-testid="coach-safety-steps">
        {copy.steps.map((s) => (
          <li key={s} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
            <span aria-hidden className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${tone.bullet} bg-current`} />
            <span data-testid="coach-safety-step">{s}</span>
          </li>
        ))}
      </ul>

      <p
        data-testid="coach-safety-footnote"
        className="mt-3.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground"
      >
        {copy.footnote}
      </p>

      {/* SECONDARY, and unmistakably so: below a rule, labelled as general information, and never
          auto-expanded. Reading one is a deliberate tap, not something we answered them with. */}
      {entries.length > 0 && onOpenEntry && (
        <div className="mt-4 border-t border-border pt-3.5" data-testid="coach-safety-secondary">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.secondaryLabel}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.secondaryNote}</p>
          <ul className="mt-2.5 space-y-2">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpenEntry(e)}
                  data-testid="coach-safety-secondary-option"
                  className="w-full rounded-field border border-border bg-surface px-3.5 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {e.question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
