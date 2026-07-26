'use client';

/**
 * Food search sheet — the manual path and the "that's not what I meant" correction path.
 * Searches the 509-food tier-1 index in RAM (`lib/food/search`), so results appear as fast as
 * the user can type.
 */
import * as React from 'react';
import { Sheet, SearchInput } from '@/components/ui';
import { searchFoods } from '@/lib/food/search';
import { popularFoods } from '@/lib/food/search';
import type { Food } from '@/lib/food/types';

export function FoodPickerSheet({
  open,
  title = 'Find a food',
  initialQuery,
  recents = [],
  onSelect,
  onClose,
}: {
  open: boolean;
  title?: string;
  initialQuery?: string;
  recents?: Food[];
  onSelect: (food: Food) => void;
  onClose: () => void;
}) {
  const fallback = React.useMemo(() => (recents.length > 0 ? recents : popularFoods(6)), [recents]);

  const search = React.useCallback(async (q: string) => searchFoods(q, { limit: 8 }).map((h) => h.food), []);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && (
        <>
          {initialQuery ? (
            <p className="mb-2 text-sm text-muted-foreground">
              You typed “<span className="text-foreground">{initialQuery}</span>”
            </p>
          ) : null}
          <SearchInput<Food>
            autoFocus
            minChars={1}
            debounceMs={60}
            recents={fallback}
            search={search}
            getKey={(f) => f.id}
            onSelect={onSelect}
            renderResult={(f) => (
              <span className="flex w-full items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{f.name}</span>
                <span className="shrink-0 tabular text-xs text-muted-foreground">
                  {Math.round(f.per_100g.kcal)} kcal /100g
                </span>
              </span>
            )}
            placeholder="Search foods…"
            aria-label="Search foods"
          />
          <p className="mt-3 text-xs text-muted-foreground">
            509 foods · exact names, aliases and nicknames all match. Picking one here teaches the
            app what your words mean.
          </p>
        </>
      )}
    </Sheet>
  );
}
