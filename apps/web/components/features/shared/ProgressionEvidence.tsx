'use client';

/**
 * WHERE THE SCHEME NUMBERS COME FROM.
 *
 * The app already sets the standard that a training number asserted on screen owes the user its
 * provenance — "Tune target → Where these numbers come from" does exactly this for weekly volume.
 * Progression schemes rest on LESS evidence than volume targets do (there is no trial behind a
 * 10%-per-set drop, and the one trial that compared pyramid to constant load found no difference
 * at equated volume), so shipping them without the same treatment would be a step backwards.
 *
 * Collapsed by default: available on demand, never in the way on a 390 px screen. Long-form in
 * `docs/RESEARCH-PROGRESSION.md`.
 */
import * as React from 'react';
import { PROGRESSION_EVIDENCE } from '@fitforge/shared/rules';
import { InfoIcon } from '@/components/ui/icons';
import { m, SPRING } from '@/components/ui/motion';

export function ProgressionEvidenceNote({ testId = 'progression-evidence' }: { testId?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
        /* min-h-[44px] + py-3: this measured 214 × 16 in all three places it ships (the onboarding
           progression step, Settings and the workout player) — a 16 px tap target on a phone. One
           change here fixes every call site, which is the reason this is a shared component. */
        className="flex min-h-[44px] items-center gap-1.5 py-3 text-xs font-semibold text-muted-foreground"
      >
        <InfoIcon size={14} /> Where these numbers come from
      </button>
      {open && (
        <m.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={SPRING.panel}
          className="mt-2 space-y-2 overflow-hidden"
          data-testid={testId}
        >
          {PROGRESSION_EVIDENCE.map((e) => (
            <li key={e.cite} className="text-[11px] leading-snug text-muted-foreground">
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent"
              >
                {e.cite}
              </a>
              <span className="text-muted-foreground"> · {e.where}</span>
              <br />
              {e.claim}
            </li>
          ))}
        </m.ul>
      )}
    </div>
  );
}
