'use client';

/**
 * Food search sheet — the manual path and the "that's not what I meant" correction path.
 *
 * THREE CATALOGS, ONE BOX, in trust order. MY FOODS first: entries the user wrote themselves are
 * their own words and outrank everything. Tier 1 (509 curated foods) is in RAM and answers on the
 * keystroke, so there is never a spinner between typing and seeing something. Tier 2 (the ~50–60k
 * USDA catalog, lazily fetched one shard at a time through the Cloudflare cache worker) is merged
 * in behind for the long tail.
 *
 * Every row wears a food emoji (lib/food/emoji.ts — deliberately not photos; see that file) and
 * carries protein alongside kcal, because "which of these five chickens" is usually a protein
 * question. And when nothing fits, the box itself offers to create the food rather than dead-
 * ending: the escape hatch lives where the failure happens.
 */
import * as React from 'react';
import { Sheet, SearchInput, Button } from '@/components/ui';
import { PlusIcon } from '@/components/ui/icons';
import { searchFoods } from '@/lib/food/search';
import { popularFoods } from '@/lib/food/search';
import { searchTier2, catalogLabel } from '@/lib/food/tier2';
import { searchMyFoods } from '@/lib/food/custom';
import { emojiForFood } from '@/lib/food/emoji';
import type { Food } from '@/lib/food/types';
import { CustomFoodSheet } from './CustomFoodSheet';

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
  const [creating, setCreating] = React.useState(false);
  const [lastQuery, setLastQuery] = React.useState('');

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
    setLastQuery(q);
    const mine = searchMyFoods(q, 3);
    const tier1 = searchFoods(q, { limit: 8 }).map((h) => h.food);
    // Tier 2 must never make the box feel slow. If the shard fetch has not landed within a beat,
    // the curated results ship on their own and the long tail arrives on the next keystroke.
    const tier2 = await Promise.race([
      searchTier2(q, 8),
      new Promise<Food[]>((resolve) => setTimeout(() => resolve([]), 250)),
    ]);
    const seen = new Set(mine.map((f) => f.id));
    const merged = [...mine];
    for (const f of [...tier1, ...tier2]) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        merged.push(f);
      }
    }
    return merged.slice(0, 12);
  }, []);

  return (
    <>
      <Sheet open={open} onClose={onClose} title={title}>
        {open && (
          <>
            {initialQuery ? (
              <p className="mb-2 text-sm text-muted-foreground">
                You typed “<span className="text-foreground">{initialQuery}</span>”
              </p>
            ) : null}
            {/* ABOVE the box, deliberately: SearchInput's result list is an absolute overlay
                that covers whatever renders beneath it, so an escape hatch placed below the input
                would be unreachable at the exact moment results are on screen. */}
            <Button
              block
              variant="secondary"
              size="sm"
              className="mb-2.5"
              data-testid="picker-create-own"
              onClick={() => setCreating(true)}
            >
              <PlusIcon size={15} /> Create your own
              {lastQuery.trim() ? ` — “${lastQuery.trim().slice(0, 30)}”` : ''}
            </Button>
            <SearchInput<Food>
              autoFocus
              minChars={1}
              debounceMs={60}
              recents={fallback}
              search={search}
              getKey={(f) => f.id}
              onSelect={onSelect}
              renderResult={(f) => (
                <span className="flex w-full items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-base"
                  >
                    {emojiForFood(f)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {f.name}
                      {f.id.startsWith('my-') && (
                        <span className="ml-1.5 rounded-chip bg-accent-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          Mine
                        </span>
                      )}
                    </span>
                    <span className="tabular block text-[11px] text-muted-foreground">
                      {Math.round(f.per_100g.kcal)} kcal · {Math.round(f.per_100g.protein_g)}g
                      protein /100g
                    </span>
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

      <CustomFoodSheet
        open={creating}
        title="Create your own food"
        name={lastQuery.trim() || initialQuery || ''}
        defaultSave
        onDone={({ food }) => {
          setCreating(false);
          onSelect(food);
        }}
        onCancel={() => setCreating(false)}
      />
    </>
  );
}
