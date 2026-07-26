'use client';

/**
 * "Sources" row (§3 output handling): the knowledge-base entries that were attached to an AI
 * answer as grounding, rendered as tappable chips. Tapping one opens that entry's own KB answer,
 * so a user can always check the AI against the curated text it was given.
 */
import * as React from 'react';
import { BookIcon } from '@/components/ui/icons';
import type { KbEntry } from '@/lib/kb/types';

export function SourceChips({
  entries,
  onSelect,
  label = 'Sources',
}: {
  entries: KbEntry[];
  onSelect: (entry: KbEntry) => void;
  label?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-3" data-testid="coach-sources">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <li key={e.id} className="min-w-0 max-w-full">
            <button
              type="button"
              onClick={() => onSelect(e)}
              data-testid="coach-source-chip"
              className="inline-flex max-w-full items-center gap-1.5 rounded-chip border border-border bg-surface px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden className="shrink-0 text-accent-soft">
                <BookIcon size={13} />
              </span>
              <span className="min-w-0 truncate">{e.question}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
