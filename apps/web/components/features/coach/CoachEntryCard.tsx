'use client';

/**
 * Compact "Ask your coach" entry point for Today.
 *
 * Deliberately dependency-free (no `lib/kb` import) so the curated knowledge base is only ever
 * downloaded on the Coach route itself — Today stays as light as it was.
 */
import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { ChatIcon, ChevronRightIcon } from '@/components/ui/icons';

const PROMPTS = ['How much protein?', 'When do I add weight?', 'Why am I not losing fat?'];

export function CoachEntryCard() {
  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="today-coach-card">
      <Link
        href="/coach"
        className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-muted text-accent"
        >
          <ChatIcon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">Ask your coach</span>
          <span className="block text-sm text-muted-foreground">
            Curated answers, instantly and offline.
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-muted-foreground">
          <ChevronRightIcon size={18} />
        </span>
      </Link>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {PROMPTS.map((p) => (
          <li key={p}>
            <Link
              href="/coach"
              data-testid="today-coach-prompt"
              className="inline-block rounded-chip border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            >
              {p}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
