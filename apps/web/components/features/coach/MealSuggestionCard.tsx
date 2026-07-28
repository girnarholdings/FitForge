'use client';

/**
 * "What can I eat?" — answered from the day's own numbers.
 *
 * This card intercepts a question the knowledge base cannot usefully answer and the AI must not:
 * the reply depends entirely on what YOU have already eaten today, and every figure in it has to
 * be real. So it is computed here from the live log and the curated catalog, and it carries the
 * "from your day" provenance rather than a curated-guide or AI badge.
 *
 * It is also the reason this question never reaches the worker even when one is configured. A
 * model asked "what should I eat to hit my protein?" answers with confident, invented grams.
 */
import * as React from 'react';
import Link from 'next/link';
import { Card, CardTitle, Button } from '@/components/ui';
import { ShakerIcon, ArrowRightIcon } from '@/components/ui/icons';
import { suggestForGap } from '@/lib/food/suggest';
import { FOODS, FOOD_COUNT } from '@/lib/food/index';
import { useSelectedDate, dayLabel } from '@/lib/demo/selectedDate';
import { useNutritionTargets, useLogsForDate } from '@/lib/demo/useDemo';

const CATALOG = FOODS.map((f) => f.food);

export function MealSuggestionCard() {
  // Reads the day's state itself rather than taking it as props: the Coach's turn renderer has no
  // business knowing about nutrition targets, and threading them through every turn would put
  // food state into the one component that handles safety routing.
  const [date] = useSelectedDate();
  const targets = useNutritionTargets();
  const { logs } = useLogsForDate(date);

  // FOODS is the SEARCH index (each row wraps its food with tokens and priors); the suggester
  // wants the plain catalog rows. Unwrapped once at module scope rather than on every render.
  const result = React.useMemo(() => {
    const eaten = logs.reduce(
      (a, l) => ({
        kcal: a.kcal + l.kcal,
        protein_g: a.protein_g + l.protein_g,
        carbs_g: a.carbs_g + l.carbs_g,
        fat_g: a.fat_g + l.fat_g,
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    return suggestForGap(
      {
        kcal: targets.kcal_target - eaten.kcal,
        protein_g: targets.protein_g_target - eaten.protein_g,
        carbs_g: targets.carbs_g_target - eaten.carbs_g,
        fat_g: targets.fat_g_target - eaten.fat_g,
      },
      CATALOG,
      5,
    );
  }, [logs, targets]);

  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="meal-suggestions">
      <div className="flex items-center gap-2">
        <span className="text-accent" aria-hidden>
          <ShakerIcon size={18} />
        </span>
        <CardTitle>What to eat {dayLabel(date).toLowerCase()}</CardTitle>
      </div>

      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground" data-testid="meal-note">
        {result.note}
      </p>

      {result.suggestions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {result.suggestions.map((s) => (
            <li
              key={s.food.id}
              className="rounded-card border border-border bg-surface-2 px-3 py-2.5"
              data-testid="meal-suggestion"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold text-foreground">{s.food.name}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {s.grams} g
                </p>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.reason}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Every figure above comes from the same catalog the logger uses, so saying so is not a
          disclaimer — it is the reason to trust the numbers. */}
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Worked out from what you have logged and the {FOOD_COUNT} foods in the curated catalog.
        Nothing here is generated.
      </p>

      <Link href="/nutrition" className="mt-3 block">
        <Button variant="secondary" block data-testid="meal-goto-nutrition">
          Log something <ArrowRightIcon size={16} />
        </Button>
      </Link>
    </Card>
  );
}

/**
 * Does this question want a meal suggestion?
 *
 * Deliberately narrow. A false positive hijacks a question the knowledge base would have answered
 * well, which is worse than a false negative — a miss still gets a useful curated answer, whereas
 * a wrong intercept replaces it with a food list nobody asked for. So this requires an EATING verb
 * together with a request-shaped phrase, rather than firing on the word "eat" alone.
 */
export function wantsMealSuggestion(q: string): boolean {
  const s = q.toLowerCase().trim();
  if (!/\b(eat|food|meal|snack|dinner|lunch|breakfast)\b/.test(s)) return false;
  return (
    /\bwhat (can|should|could)\b/.test(s) ||
    /\bwhat (do|to)\b.*\b(eat|have)\b/.test(s) ||
    /\b(suggest|recommend|ideas?|options?)\b/.test(s) ||
    /\bhit (my|the)\b.*\b(protein|macro|calorie|target|goal)/.test(s) ||
    /\b(left|remaining)\b.*\b(today|day)\b/.test(s)
  );
}
