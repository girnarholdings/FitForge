'use client';

/**
 * Compact "Ask your coach" entry point for Today.
 *
 * Deliberately dependency-free (no `lib/kb` import) so the curated knowledge base is only ever
 * downloaded on the Coach route itself — Today stays as light as it was.
 */
import * as React from 'react';
import Link from 'next/link';
import { ChevronRightIcon, CoachIcon } from '@/components/ui/icons';

/**
 * The env var read INLINE rather than via `lib/kb/client`, keeping this card dependency-free (the
 * whole point of this file — see the header). Next inlines the value at build time either way.
 *
 * The copy must match what tapping through actually delivers: with a Coach service configured the
 * product is an AI trainer grounded in the guide, and "curated answers, instantly and offline"
 * was selling the FALLBACK as the feature — the exact inversion the AI-first work removed
 * everywhere else. Offline copy remains for builds that genuinely are offline-only.
 */
const AI_CONFIGURED = ((process.env.NEXT_PUBLIC_AI_ENDPOINT ?? '').trim().length > 0);

export function CoachEntryCard() {
  return (
    <div data-testid="today-coach-card">
      {/* SHAPED LIKE THE COMPOSER IT LEADS TO — same ring, same coach glyph on the left, same
          filled accent circle on the right where the send button sits — and NOT wrapped in a
          card: the finish review named Today's uniform card stack, and a composer pill standing
          on the iron is a different object from a card in a pile. The prompt-chip row went with
          the shell; the Coach screen owns its own suggestions. */}
      <Link
        href="/coach"
        className="flex items-center gap-3 rounded-full border-2 border-border bg-surface-2 py-1.5 pl-3 pr-1.5 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden className="shrink-0 text-muted-foreground">
          <CoachIcon size={20} />
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className="block font-semibold text-foreground">
            {AI_CONFIGURED ? 'Ask your AI trainer' : 'Ask your coach'}
          </span>
          <span className="block text-sm text-muted-foreground">
            {AI_CONFIGURED
              ? 'Personalized to your plan, goals and gear.'
              : 'Curated answers, instantly and offline.'}
          </span>
        </span>
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"
        >
          <ChevronRightIcon size={18} />
        </span>
      </Link>
    </div>
  );
}
