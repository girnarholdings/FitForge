'use client';

/**
 * RECIPE CATALOG — the full library behind the plan (AIMODE-CONTRACT "full catalog browser").
 *
 * The list is HARD-FILTERED to the plan's dietary preferences before anything else happens —
 * base diet plus every exclusion tag (research §3/§5: compatibility is absolute, not a ranking
 * signal). On top of that sit the two soft controls: slot chips and a name search.
 *
 * Tapping a recipe opens its detail IN THE SHEET — serving, macros, ingredients, method — terse,
 * the way a recipe card on a fridge is terse. "Use for <slot> today" applies it to today's plan
 * through the SAME `applySwap` the swap sheet uses. Deliberately NOT gated through
 * `swapCandidates`: the candidate rules exist to keep a ranked shortlist inside the day's bands,
 * but an explicit user pick from the full catalog is sovereign — the user's choice wins and the
 * numbers adapt (research §5 rule 8), so the only filter that still applies here is the dietary
 * one, which is never waived for anyone.
 */
import * as React from 'react';
import { Button, Chip, Sheet } from '@/components/ui';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { FoodGlyph } from '@/components/ui/foodIcons';
import type { MealSlotName } from '@/lib/food/types';
import { applySwap } from '@/lib/diet/store';
import { RECIPES, type Recipe } from '@/lib/diet/recipes';
import { MEAL_SLOTS, mealSlotLabel } from './mealSlots';
import { recipeMatchesPrefs, scaledMacros, type PrefsShape } from './planShared';

export function RecipeCatalogSheet({
  open,
  prefs,
  dayIndex,
  onClose,
}: {
  open: boolean;
  prefs: PrefsShape;
  /** Today's plan day — where "Use for <slot> today" lands. */
  dayIndex: number;
  onClose: () => void;
}) {
  const [slotFilter, setSlotFilter] = React.useState<MealSlotName | null>(null);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<Recipe | null>(null);

  // The hard filter, applied once. Everything below only ever narrows this set further.
  const eligible = React.useMemo(
    () => RECIPES.filter((r: Recipe) => recipeMatchesPrefs(r, prefs)),
    [prefs],
  );

  const q = query.trim().toLowerCase();
  const listed = eligible.filter(
    (r: Recipe) =>
      (slotFilter == null || r.slot === slotFilter) &&
      (q === '' || r.name.toLowerCase().includes(q)),
  );

  function close() {
    setSelected(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title={selected ? selected.name : 'Recipes'}>
      {selected ? (
        <RecipeDetail
          recipe={selected}
          onBack={() => setSelected(null)}
          onUse={() => {
            // An explicit pick is sovereign — see the header comment. Same slot as the recipe,
            // today's day, through the store's one write path.
            applySwap(dayIndex, selected.slot, selected.id);
            close();
          }}
        />
      ) : (
        <div className="space-y-3" data-testid="diet-catalog">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes"
            aria-label="Search recipes"
            data-testid="diet-catalog-search"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-accent"
          />

          <div className="flex flex-wrap gap-2">
            <Chip
              selected={slotFilter == null}
              data-testid="diet-catalog-slot-all"
              onClick={() => setSlotFilter(null)}
            >
              All
            </Chip>
            {MEAL_SLOTS.map(({ slot, label }) => (
              <Chip
                key={slot}
                selected={slotFilter === slot}
                data-testid={`diet-catalog-slot-${slot}`}
                onClick={() => setSlotFilter((prev) => (prev === slot ? null : slot))}
              >
                {label}
              </Chip>
            ))}
          </div>

          {/* Honest count: how much of the library this user's preferences leave open. */}
          <p className="tabular text-xs text-muted-foreground">
            {listed.length} of {eligible.length} recipes match your preferences
          </p>

          {listed.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground" data-testid="diet-catalog-empty">
              Nothing here matches that search — try fewer letters or another meal.
            </p>
          ) : (
            <ul className="max-h-[45dvh] space-y-2 overflow-y-auto pr-0.5">
              {listed.map((r: Recipe) => (
                <li key={r.id}>
                  <button
                    type="button"
                    data-testid="diet-catalog-row"
                    data-recipe-id={r.id}
                    onClick={() => setSelected(r)}
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
                        {mealSlotLabel(r.slot as MealSlotName)} · {r.effort}
                      </p>
                    </span>
                    <span className="tabular shrink-0 text-right text-xs text-muted-foreground">
                      {Math.round(r.per_serving.kcal)} kcal
                      <br />
                      <span className="font-semibold text-accent">
                        {Math.round(r.per_serving.protein_g)}P
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Recipe detail, terse by design: serving, macros, what goes in, what you do. No headnotes, no
 * story — the corpus's `method` steps are already written as single sentences and are rendered
 * exactly as authored.
 */
function RecipeDetail({
  recipe,
  onBack,
  onUse,
}: {
  recipe: Recipe;
  onBack: () => void;
  onUse: () => void;
}) {
  const macros = scaledMacros(recipe, 1);
  return (
    <div className="space-y-4" data-testid="diet-recipe-detail">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-1 rounded-field px-2 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
      >
        <ChevronLeftIcon size={16} /> All recipes
      </button>

      <p className="tabular text-sm text-muted-foreground">
        {recipe.serving_label} ·{' '}
        <span className="font-semibold text-foreground">{Math.round(macros.kcal)} kcal</span> ·{' '}
        {Math.round(macros.protein_g)}P / {Math.round(macros.carbs_g)}C / {Math.round(macros.fat_g)}
        F · {recipe.effort}
      </p>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ingredients
        </p>
        <ul className="mt-1.5 space-y-1 text-sm text-foreground">
          {recipe.ingredients.map((ing: string) => (
            <li key={ing}>{ing}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-foreground">
          {recipe.method.map((step: string) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <Button block data-testid="diet-catalog-use" onClick={onUse}>
        Use for {recipe.slot} today
      </Button>
    </div>
  );
}
