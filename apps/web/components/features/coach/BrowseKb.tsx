'use client';

/**
 * BROWSE mode — the knowledge base as a real wiki.
 *
 * The Coach is not "a chat box with a KB behind it": all 83 curated entries are browsable by
 * category, filterable by text, and expandable in place. A user who does not know what to ask
 * can read their way to the answer, which is also the cheapest possible interaction (no AI, no
 * retrieval ambiguity).
 */
import * as React from 'react';
import { Chip } from '@/components/ui';
import { ChevronDownIcon, SearchIcon, XIcon } from '@/components/ui/icons';
import {
  KB_CATEGORIES,
  KB_ENTRIES,
  browseKb,
  entryById,
} from '@/lib/kb';
import type { KbCategory, KbEntry } from '@/lib/kb/types';

const CATEGORY_LABEL = new Map(KB_CATEGORIES.map((c) => [c.slug, c.label]));

export function BrowseKb({
  expandedId,
  onExpand,
}: {
  /** Controlled from the parent so "open this entry" works from an answer's source chips. */
  expandedId: string | null;
  onExpand: (id: string | null) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState<KbCategory | 'all'>('all');

  const results = React.useMemo(() => {
    const base = query.trim() ? browseKb(query) : KB_ENTRIES;
    return category === 'all' ? base : base.filter((e) => e.category === category);
  }, [query, category]);

  const grouped = React.useMemo(() => {
    const map = new Map<KbCategory, KbEntry[]>();
    for (const e of results) {
      const list = map.get(e.category);
      if (list) list.push(e);
      else map.set(e.category, [e]);
    }
    return KB_CATEGORIES.filter((c) => map.has(c.slug)).map((c) => ({
      ...c,
      entries: map.get(c.slug) ?? [],
    }));
  }, [results]);

  return (
    <div data-testid="coach-browse" className="space-y-4">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2 px-3">
        <span aria-hidden className="text-muted-foreground">
          <SearchIcon size={18} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide…"
          aria-label="Search the guide"
          data-testid="coach-browse-search"
          className="h-12 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2 pb-1">
          <Chip selected={category === 'all'} onClick={() => setCategory('all')}>
            All {KB_ENTRIES.length}
          </Chip>
          {KB_CATEGORIES.map((c) => (
            <Chip
              key={c.slug}
              selected={category === c.slug}
              onClick={() => setCategory(c.slug)}
              data-testid={`coach-category-${c.slug}`}
              className="whitespace-nowrap"
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground tabular" data-testid="coach-browse-count">
        {results.length} {results.length === 1 ? 'entry' : 'entries'}
        {query.trim() ? ` matching “${query.trim()}”` : ''}
      </p>

      {grouped.length === 0 && (
        <p className="rounded-card border border-border bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing in the guide matches that yet. Try the Ask tab — the coach can work from the
          closest entries.
        </p>
      )}

      {grouped.map((group) => (
        <section key={group.slug} data-testid={`coach-group-${group.slug}`}>
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-accent-soft">
            {group.label}
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">{group.blurb}</p>
          <ul className="space-y-2">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <KbDisclosure
                  entry={entry}
                  open={expandedId === entry.id}
                  onToggle={() => onExpand(expandedId === entry.id ? null : entry.id)}
                  onFollowup={(id) => onExpand(id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function KbDisclosure({
  entry,
  open,
  onToggle,
  onFollowup,
}: {
  entry: KbEntry;
  open: boolean;
  onToggle: () => void;
  onFollowup: (id: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  const followups = entry.followups
    .map((id) => entryById(id))
    .filter((e): e is KbEntry => Boolean(e));

  return (
    <div
      ref={ref}
      data-testid={`coach-entry-${entry.id}`}
      className={
        'rounded-card border bg-surface-2 transition-colors ' +
        (open ? 'border-accent' : 'border-border')
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {entry.question}
        </span>
        <span
          aria-hidden
          className={
            'shrink-0 text-muted-foreground transition-transform ' + (open ? 'rotate-180' : '')
          }
        >
          <ChevronDownIcon size={18} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4" data-testid={`coach-entry-answer-${entry.id}`}>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{entry.answer}</p>
          {followups.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {followups.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onFollowup(f.id)}
                    data-testid="coach-followup-chip"
                    className="max-w-full rounded-chip border border-border bg-surface px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                  >
                    {f.question}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABEL.get(entry.category) ?? entry.category}
          </p>
        </div>
      )}
    </div>
  );
}
