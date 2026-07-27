'use client';

/**
 * Food search sheet — the manual path and the "that's not what I meant" correction path.
 *
 * TWO CATALOGS, ONE BOX. Tier 1 (509 curated foods) is in RAM and answers on the keystroke, so
 * there is never a spinner between typing and seeing something. Tier 2 (the ~50–60k-row USDA
 * catalog, lazily fetched one shard at a time) is merged in behind it for the long tail. Tier-1
 * hits stay first because they are curated, aliased and far likelier to be what someone means by
 * "chicken" than a branded row that happens to start with the same letters.
 */
import * as React from 'react';
import { Sheet, SearchInput } from '@/components/ui';
import { searchFoods } from '@/lib/food/search';
import { popularFoods } from '@/lib/food/search';
import { searchTier2, catalogLabel } from '@/lib/food/tier2';
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

  // What the footer claims about coverage is read from the deployed manifest, never hardcoded —
  // tier 2 is a build artefact and can legitimately be absent.
  const [label, setLabel] = React.useState('509 curated foods');
  React.useEffect(() => {
    let live = true;
    void catalogLabel().then((l) => live && setLabel(l));
    return () => {
      live = false;
    };
  }, []);

  const search = React.useCallback(async (q: string) => {
    const tier1 = searchFoods(q, { limit: 8 }).map((h) => h.food);
    // Tier 2 must never make the box feel slow. If the shard fetch has not landed within a beat,
    // the curated results ship on their own and the long tail arrives on the next keystroke.
    const tier2 = await Promise.race([
      searchTier2(q, 8),
      new Promise<Food[]>((resolve) => setTimeout(() => resolve([]), 250)),
    ]);
    const seen = new Set(tier1.map((f) => f.id));
    return [...tier1, ...tier2.filter((f) => !seen.has(f.id))].slice(0, 12);
  }, []);

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
          <p className="mt-3 text-xs text-muted-foreground" data-testid="food-catalog-label">
            {label} · exact names, aliases and nicknames all match. Picking one here teaches the
            app what your words mean.
          </p>
        </>
      )}
    </Sheet>
  );
}
