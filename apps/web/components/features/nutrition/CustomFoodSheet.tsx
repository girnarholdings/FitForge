'use client';

/**
 * ONE EDITOR, THREE JOBS: enter a food the catalogs don't know, correct the macros of one they
 * do, or write down a recipe once and keep it. The same four boxes serve all three because they
 * ARE the same act — stating what a serving contains — and two near-identical forms would drift
 * apart the first time one of them got a fix.
 *
 * "Save to My foods" is the difference between a one-off and a recipe. On for creations (you
 * typed a name the catalog lacks — you will type it again), off for corrections (halving the oil
 * in a curry is tonight's truth, not the dish's). Saved entries live in `fitforge.customFoods.v1`,
 * which the backup bundle and cloud sync already carry — see lib/food/custom.ts for why that
 * means signed-in users get their recipes on every device with no Firestore schema change.
 */
import * as React from 'react';
import { Button, Sheet } from '@/components/ui';
import { saveMyFood } from '@/lib/food/custom';
import { FoodGlyph } from '@/components/ui/foodIcons';
import type { Food } from '@/lib/food/types';

export interface CustomFoodResult {
  food: Food;
  saved: boolean;
}

export function CustomFoodSheet({
  open,
  title,
  name: initialName,
  /** Pre-fill for "edit macros" — the values of the serving being corrected. */
  prefill,
  defaultSave,
  onDone,
  onCancel,
}: {
  open: boolean;
  title: string;
  name: string;
  prefill?: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
  defaultSave: boolean;
  onDone: (result: CustomFoodResult) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [kcal, setKcal] = React.useState(0);
  const [p, setP] = React.useState(0);
  const [c, setC] = React.useState(0);
  const [f, setF] = React.useState(0);
  const [save, setSave] = React.useState(defaultSave);

  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setKcal(Math.round(prefill?.kcal ?? 0));
      setP(Math.round((prefill?.protein_g ?? 0) * 10) / 10);
      setC(Math.round((prefill?.carbs_g ?? 0) * 10) / 10);
      setF(Math.round((prefill?.fat_g ?? 0) * 10) / 10);
      setSave(defaultSave);
    }
  }, [open, initialName, prefill, defaultSave]);

  if (!open) return null;


  const done = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const values = { name: trimmed, kcal, protein_g: p, carbs_g: c, fat_g: f };
    if (save) {
      onDone({ food: saveMyFood(values), saved: true });
      return;
    }
    // A one-off: same shape, never persisted.
    onDone({
      food: {
        id: `custom-${Date.now().toString(36)}`,
        name: trimmed,
        aliases: [],
        category: 'dish',
        per_100g: { kcal, protein_g: p, carbs_g: c, fat_g: f },
        serving_name: '1 serving',
        serving_grams: 100,
        household_measures: [{ name: 'serving', grams: 100 }],
      },
      saved: false,
    });
  };

  return (
    <Sheet open onClose={onCancel} title={title}>
      <div className="space-y-3" data-testid="custom-food-sheet">
        <p className="text-sm text-muted-foreground">
          Per serving, straight off the packet or your own recipe math. Nothing is invented for
          you.
        </p>
        <div className="flex items-center gap-2">
          {/* The face updates live as they type — "chicken curry" earns the drumstick before
              they finish the word. Same resolver every logged row uses. */}
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent-soft"
          >
            <FoodGlyph food={{ name, category: 'dish' }} size={22} />
          </span>
          {/* maxLength mirrors the store's 80-point cap (lib/food/custom.ts clampName) — the
              limit is enforced where the user can see it, not silently at save time. */}
          <input
            value={name}
            aria-label="Food name"
            placeholder="What is it? e.g. Mum's dal"
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ['kcal', kcal, setKcal],
              ['P', p, setP],
              ['C', c, setC],
              ['F', f, setF],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                {label}
              </span>
              <input
                type="number"
                inputMode="decimal"
                aria-label={label}
                value={value || ''}
                onChange={(e) => set(Math.max(0, Number(e.target.value)))}
                className="h-11 w-full rounded-xl border border-border bg-surface px-2 text-base tabular-nums outline-none focus:border-accent"
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={save}
          data-testid="custom-save-toggle"
          onClick={() => setSave((s) => !s)}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Save to My foods</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">
              Searchable next time
              {/* the honest consequence, stated where the choice is made */}
              {' '}— and backed up with your account when you are signed in.
            </span>
          </span>
          <span
            aria-hidden
            className={
              'relative ml-3 shrink-0 rounded-full transition-colors ' +
              (save ? 'bg-accent' : 'bg-muted')
            }
            style={{ height: 18, width: 32 }}
          >
            <span
              className={
                'absolute top-[2px] h-3.5 w-3.5 rounded-full bg-surface transition-transform ' +
                (save ? 'translate-x-[16px]' : 'translate-x-[2px]')
              }
            />
          </span>
        </button>

        <Button
          block
          size="lg"
          disabled={name.trim().length === 0}
          data-testid="custom-add"
          onClick={done}
        >
          {save ? 'Save & use' : 'Use once'}
        </Button>
      </div>
    </Sheet>
  );
}
