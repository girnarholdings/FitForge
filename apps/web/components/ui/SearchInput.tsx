'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { SearchIcon } from './icons';

export interface SearchInputProps<T> {
  /** async fetcher; must honour the AbortSignal so stale requests cancel (§7.1) */
  search: (query: string, signal: AbortSignal) => Promise<T[]>;
  renderResult: (item: T, active: boolean) => React.ReactNode;
  onSelect: (item: T) => void;
  getKey: (item: T) => string;
  /** shown instantly at 0–1 chars (client-cached recents, §7.1) */
  recents?: T[];
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
  emptyLabel?: string;
  autoFocus?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Type-ahead search box (§7.1 client behavior: debounce 150 ms, cancel stale requests, show
 * top 8, recents at 0–1 chars). Fully controlled dropdown with keyboard navigation.
 */
export function SearchInput<T>({
  search,
  renderResult,
  onSelect,
  getKey,
  recents = [],
  placeholder = 'Search…',
  minChars = 2,
  debounceMs = 150,
  emptyLabel = 'No matches',
  autoFocus,
  className,
  ...aria
}: SearchInputProps<T>) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<T[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showRecents = query.trim().length < minChars;
  const items = showRecents ? recents : results;

  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const q = query.trim();
    if (q.length < minChars) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      search(q, controller.signal)
        .then((rows) => {
          if (!controller.signal.aborted) {
            setResults(rows.slice(0, 8));
            setActive(0);
          }
        })
        .catch(() => {
          /* aborted or failed — ignore, keep prior results */
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, minChars, debounceMs, search]);

  const choose = (item: T) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item) choose(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2 px-3">
        <span aria-hidden className="text-muted-foreground">
          <SearchIcon size={18} />
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label={aria['aria-label'] ?? placeholder}
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            // A pending blur-close must die on refocus: without this, blur-then-refocus inside
            // the 120ms window (e.g. a dialog moving initial focus, then the user typing) lets
            // the stale timer close the list while the input is focused — and nothing reopens it.
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        {loading && (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          />
        )}
      </div>

      {open && (items.length > 0 || (!showRecents && !loading)) && (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-border bg-surface p-1 shadow-xl"
        >
          {items.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</li>
          )}
          {items.map((item, i) => (
            <li key={getKey(item)} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm',
                  i === active ? 'bg-accent-muted text-accent' : 'text-foreground hover:bg-surface-2',
                )}
              >
                {renderResult(item, i === active)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
