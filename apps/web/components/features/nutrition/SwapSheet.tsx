'use client';

/**
 * SWAP SHEET — the pressure valve on a planned dish (RESEARCH-DIET §2: bounded choice beats an
 * open menu; §5: what makes two dishes swappable).
 *
 * The candidate list comes from W2's `swapCandidates` — same slot, absolute dietary
 * compatibility, kcal within band, protein guarded, 2-day no-repeat, ≤6 ranked. This sheet adds
 * no rules of its own; it only shows each candidate's signed distance from the outgoing dish
 * ("−40 kcal · +6 g protein") so the choice is informed, and applies a tap through
 * `applySwap` — the store is the single writer, the UI never edits the plan object directly.
 */
import * as React from 'react';
import { Sheet } from '@/components/ui';
import { SearchIcon } from '@/components/ui/icons';
import { FoodGlyph } from '@/components/ui/foodIcons';
import type { MealSlotName } from '@/lib/food/types';
import { applySwap } from '@/lib/diet/store';
import { swapCandidates } from '@/lib/diet/swaps';
import type { Recipe } from '@/lib/diet/recipes';
import { mealSlotLabel } from './mealSlots';
import { scaledMacros, swapDeltaLine, type PlanShape } from './planShared';

export function SwapSheet({
  open,
  plan,
  day,
  slot,
  outgoing,
  servings,
  onClose,
  onBrowse,
}: {
  open: boolean;
  plan: PlanShape;
  day: number;
  slot: MealSlotName;
  /** The dish being swapped out — the reference every delta is signed against. */
  outgoing: Recipe | null;
  servings: number;
  onClose: () => void;
  /** Open the full catalog instead — the honest exit when the ranked pool is thin. */
  onBrowse: () => void;
}) {
  const candidates = React.useMemo<Recipe[]>(
    () => (open ? swapCandidates(plan, day, slot) : []),
    [open, plan, day, slot],
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Swap ${mealSlotLabel(slot).toLowerCase()}`}>
      <div className="space-y-3" data-testid="swap-sheet">
        {outgoing && (
          <p className="text-sm text-muted-foreground">
            Now planned:{' '}
            <span className="font-medium text-foreground">{outgoing.name}</span>{' '}
            <span className="tabular">
              · {Math.round(scaledMacros(outgoing, servings).kcal)} kcal
            </span>
          </p>
        )}

        {candidates.length === 0 ? (
          /* Honest empty state: the ranked pool can genuinely be empty (a strict preference
             stack plus the no-repeat window). Say so, and offer the catalog — where an explicit
             pick is allowed to go outside the candidate band. */
          <div className="py-2">
            <p className="text-sm text-muted-foreground" data-testid="diet-swap-empty">
              No close matches for this dish right now — the ranked swaps keep the day’s calories
              and protein in band, and nothing qualifies today.
            </p>
            <button
              type="button"
              onClick={onBrowse}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-field px-2.5 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
            >
              <SearchIcon size={16} /> Browse the full catalog
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {candidates.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid="diet-swap-option"
                  data-recipe-id={r.id}
                  onClick={() => {
                    // The store applies and persists; subscribers (the plan card) re-render.
                    applySwap(day, slot, r.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-field border border-border bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-muted text-accent-soft"
                  >
                    <FoodGlyph food={{ name: r.name, category: 'dish' }} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.serving_label} · {r.effort}
                    </p>
                  </span>
                  {/* The signed distance from the outgoing dish — kcal and protein only, the
                      two numbers the swap rules actually constrain. */}
                  <span
                    data-testid="diet-swap-delta"
                    className="tabular shrink-0 text-right text-xs text-muted-foreground"
                  >
                    {outgoing ? swapDeltaLine(outgoing, r, servings) : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
