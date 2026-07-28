'use client';

/**
 * Nutrition day view — rebuilt around CONVERSATIONAL logging.
 *
 * The primary action is a sentence: "2 eggs and a slice of toast with butter". The deterministic
 * parser (`lib/food/parse`, docs/RESEARCH-FOOD.md §C2) turns it into items, the confirm sheet
 * shows what it thinks each one equates to, and only a confirm writes to the day. Manual search
 * over the 509-food catalog, recents, copy-yesterday and per-item editing all remain.
 *
 * Everything is local: the food index lives in RAM, corrections are learned into localStorage.
 */
import * as React from 'react';
import { Button, Card, CardTitle, Chip, Sheet } from '@/components/ui';
import { PlusIcon, RepeatIcon, SearchIcon, SparkleIcon, XIcon } from '@/components/ui/icons';
import {
  defaultMealSlot,
  type MealSlot,
  type NutritionLog,
} from '@/components/features/_mock/data';
import { useDemoState, useNutritionTargets, useLogsForDate } from '@/lib/demo/useDemo';
import { useSelectedDate, addDays, dayLabel, isToday } from '@/lib/demo/selectedDate';
import { DateNav } from '@/components/features/shared/DateNav';
import { foodById, FOOD_COUNT } from '@/lib/food/index';
import { computeMacros, formatMacros, sumMacros } from '@/lib/food/format';
import { resolvePortion, unitOptions } from '@/lib/food/measures';
import { parseFoodText } from '@/lib/food/parse';
import { learnedFoodIds } from '@/lib/food/learning';
import { popularFoods } from '@/lib/food/search';
import type { Food, ParsedItem } from '@/lib/food/types';
import { MEAL_SLOTS } from './mealSlots';
import { Composer } from './Composer';
import { DaySummary } from './DaySummary';
import { FoodPickerSheet } from './FoodPickerSheet';
import { ReviewSheet } from './ReviewSheet';

let logSeq = 1000;
const genLogId = () => `nl-new-${logSeq++}`;

export function NutritionView() {
  const targets = useNutritionTargets();
  // THE DAY BEING EDITED, not necessarily today. Everything below — the summary, the meal cards,
  // what a confirmed draft is stamped with — follows this one value, so backfilling last night's
  // dinner is the same flow as logging lunch now.
  const [date, setDate] = useSelectedDate();
  const { logs, setLogs } = useLogsForDate(date);
  const state = useDemoState();

  const [draft, setDraft] = React.useState<{ input: string; items: ParsedItem[] } | null>(null);
  const [draftSlot, setDraftSlot] = React.useState<MealSlot>('lunch');
  const [pickerSlot, setPickerSlot] = React.useState<MealSlot | null>(null);
  const [editing, setEditing] = React.useState<NutritionLog | null>(null);

  const totals = React.useMemo(() => sumMacros(logs), [logs]);

  /**
   * Group once, not once per meal.
   *
   * Each meal card ran its own `logs.filter` plus a `reduce` in the middle of the render, so every
   * keystroke in the composer walked the whole day's log five times over. Small in absolute terms,
   * but it is work repeated on a component that re-renders on every input change.
   */
  const bySlot = React.useMemo(() => {
    const map = new Map<MealSlot, { rows: NutritionLog[]; kcal: number }>();
    for (const { slot } of MEAL_SLOTS) map.set(slot, { rows: [], kcal: 0 });
    for (const l of logs) {
      const bucket = map.get(l.meal_slot);
      if (!bucket) continue;
      bucket.rows.push(l);
      bucket.kcal += l.kcal;
    }
    return map;
  }, [logs]);

  /* ------------------------------------------------------------------ history + recents */

  const historyIds = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const dayLogs of Object.values(state.logsByDate)) {
      for (const l of dayLogs) {
        if (l.food_id) counts.set(l.food_id, (counts.get(l.food_id) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [state.logsByDate]);

  const recents = React.useMemo<Food[]>(() => {
    const fromHistory = historyIds.map((id) => foodById(id)).filter((f): f is Food => f != null);
    return fromHistory.length > 0 ? fromHistory.slice(0, 8) : popularFoods(6);
  }, [historyIds]);

  // "Yesterday" relative to the day on screen, not to the wall clock: while reviewing Tuesday,
  // "copy yesterday" must mean Monday or the button is quietly lying about what it will do.
  const previousDay = addDays(date, -1);
  const previousDayLogs = state.logsByDate[previousDay] ?? [];

  /* --------------------------------------------------------------------------- actions */

  const parseAndReview = React.useCallback(
    (text: string) => {
      const boostIds = [...historyIds, ...learnedFoodIds()];
      const result = parseFoodText(text, { boostIds });
      setDraftSlot(result.mealSlot ?? defaultMealSlot());
      setDraft({ input: text, items: result.items });
    },
    [historyIds],
  );

  /** A one-tap recent/search pick still goes through the confirm step, pre-filled. */
  function reviewSingleFood(food: Food, slot: MealSlot) {
    const portion = resolvePortion(food, 1, null, {});
    setDraftSlot(slot);
    setDraft({
      input: food.name,
      items: [
        {
          id: `pi-manual-${logSeq++}`,
          sourceText: food.name,
          quantity: 1,
          quantitySource: 'implicit',
          unit: null,
          size: null,
          query: food.name.toLowerCase(),
          food,
          alternatives: [],
          portion,
          matchConfidence: 1,
          confidence: 1,
          child: false,
        },
      ],
    });
  }

  function commitDraft() {
    if (!draft) return;
    const rows: NutritionLog[] = [];
    for (const item of draft.items) {
      if (!item.food || !item.portion) continue;
      const macros = computeMacros(item.food, item.portion.grams);
      rows.push({
        id: genLogId(),
        logged_on: date,
        meal_slot: draftSlot,
        food_id: item.food.id,
        custom_name: item.food.name,
        quantity_g: item.portion.grams,
        ...macros,
      });
    }
    if (rows.length > 0) setLogs((prev) => [...prev, ...rows]);
    setDraft(null);
  }

  function copyPreviousDay() {
    const src = state.logsByDate[previousDay] ?? [];
    if (src.length === 0) return;
    setLogs((prev) => [...prev, ...src.map((l) => ({ ...l, id: genLogId(), logged_on: date }))]);
  }

  function removeLog(id: string) {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setEditing(null);
  }

  function updateLog(next: NutritionLog) {
    setLogs((prev) => prev.map((l) => (l.id === next.id ? next : l)));
    setEditing(null);
  }

  return (
    /* Extra bottom room on mobile only: the composer is fixed above the floating tab bar, so the
       last meal card would otherwise sit permanently under it with no way to scroll clear. */
    <div className="space-y-4 pb-20 md:pb-0">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Nutrition</h1>
      </header>

      {/* `hasContent` marks days that already have food on them, so scrubbing the strip shows at a
          glance which nights were missed — which is the whole reason someone comes here to
          backfill. */}
      <DateNav
        value={date}
        onChange={setDate}
        hasContent={(iso) => (state.logsByDate[iso]?.length ?? 0) > 0}
      />

      <DaySummary totals={totals} targets={targets} />

      {/* The headline input. Fixed to the thumb zone on phones, in-flow on desktop. */}
      <Composer onSubmit={parseAndReview} showExamples={logs.length === 0} />

      {logs.length === 0 && (
        <Card className="border-2 border-dashed border-border bg-surface-2/60 text-center shadow-none">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-muted text-accent">
            <SparkleIcon size={26} />
          </span>
          <CardTitle className="mt-3">Just tell it what you ate</CardTitle>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Type a sentence like “2 eggs and a slice of toast with butter”. FitForge works out the
            portions and macros from {FOOD_COUNT} foods, shows you what it understood, and logs it
            only once you confirm.
          </p>
          <Button
            variant="secondary"
            className="mx-auto mt-4"
            onClick={() => setPickerSlot(defaultMealSlot())}
          >
            <SearchIcon size={18} /> Or search the food list
          </Button>
        </Card>
      )}

      {(previousDayLogs.length > 0 || recents.length > 0) && (
        <Card className="!py-3">
          <div className="mb-2 flex items-center justify-between">
            <CardTitle className="text-sm">Quick log</CardTitle>
            {previousDayLogs.length > 0 && (
              <button
                type="button"
                data-testid="copy-yesterday"
                onClick={copyPreviousDay}
                className="inline-flex items-center gap-1.5 rounded-field px-2.5 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
              >
                <RepeatIcon size={16} /> Copy {dayLabel(previousDay).toLowerCase()}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {recents.map((f) => (
              <Chip
                key={f.id}
                leading={<PlusIcon size={14} />}
                onClick={() => reviewSingleFood(f, defaultMealSlot())}
              >
                {f.name}
              </Chip>
            ))}
          </div>
        </Card>
      )}

      {MEAL_SLOTS.map(({ slot, label }) => {
        const { rows: slotLogs, kcal: slotKcal } = bySlot.get(slot) ?? { rows: [], kcal: 0 };
        return (
          <Card
            key={slot}
            className="!p-0 shadow-[var(--shadow-card)]"
            // Meal cards are a stack below the fold. `content-visibility: auto` lets the browser
            // skip layout, style and paint for the off-screen ones; `contain-intrinsic-size` gives
            // a placeholder height so skipping them does not make the scrollbar jump. The estimate
            // only has to be close — the real height replaces it once the card scrolls in.
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <CardTitle className="text-base">{label}</CardTitle>
              <span className="tabular text-sm text-muted-foreground">
                {Math.round(slotKcal)} kcal
              </span>
            </div>
            {slotLogs.length > 0 && (
              <ul className="divide-y divide-border">
                {slotLogs.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setEditing(l)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium text-foreground">
                        {l.custom_name ?? 'Food'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {l.quantity_g != null ? `${Math.round(l.quantity_g)} g · ` : ''}
                        {formatMacros(l)}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-sm text-muted-foreground">
                        {Math.round(l.kcal)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${l.custom_name ?? 'food'}`}
                        onClick={() => removeLog(l.id)}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors hover:text-danger"
                      >
                        <XIcon size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="px-3 py-2">
              <button
                type="button"
                onClick={() => setPickerSlot(slot)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
              >
                <PlusIcon size={18} /> Add food
              </button>
            </div>
          </Card>
        );
      })}

      {/* Confirm step */}
      <ReviewSheet
        open={draft != null}
        input={draft?.input ?? ''}
        items={draft?.items ?? []}
        slot={draftSlot}
        recents={recents}
        onSlotChange={setDraftSlot}
        onItemsChange={(items) => setDraft((d) => (d ? { ...d, items } : d))}
        onConfirm={commitDraft}
        onClose={() => setDraft(null)}
      />

      {/* Manual search */}
      <FoodPickerSheet
        open={pickerSlot != null}
        title="Add food"
        recents={recents}
        onSelect={(food) => {
          const slot = pickerSlot ?? defaultMealSlot();
          setPickerSlot(null);
          reviewSingleFood(food, slot);
        }}
        onClose={() => setPickerSlot(null)}
      />

      {/* Edit an already-logged item */}
      {editing && (
        <EditLogSheet
          log={editing}
          onClose={() => setEditing(null)}
          onSave={updateLog}
          onRemove={() => removeLog(editing.id)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- edit a logged row */

function EditLogSheet({
  log,
  onClose,
  onSave,
  onRemove,
}: {
  log: NutritionLog;
  onClose: () => void;
  onSave: (next: NutritionLog) => void;
  onRemove: () => void;
}) {
  const food = foodById(log.food_id);
  const [grams, setGrams] = React.useState(Math.round(log.quantity_g ?? 100));
  const [slot, setSlot] = React.useState<MealSlot>(log.meal_slot);

  const macros = food
    ? computeMacros(food, grams)
    : { kcal: log.kcal, protein_g: log.protein_g, carbs_g: log.carbs_g, fat_g: log.fat_g };

  return (
    <Sheet open onClose={onClose} title={log.custom_name ?? 'Edit item'}>
      <div className="space-y-4">
        <p className="tabular text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{Math.round(macros.kcal)} kcal</span> ·{' '}
          {formatMacros(macros)}
        </p>

        {food && (
          <div className="flex flex-wrap gap-1.5">
            {unitOptions(food)
              .filter((u) => u.grams != null)
              .slice(0, 6)
              .map((u) => (
                <Chip
                  key={u.unit}
                  selected={Math.abs(grams - (u.grams ?? 0)) < 0.5}
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => setGrams(Math.round(u.grams ?? grams))}
                >
                  1 {u.label}
                </Chip>
              ))}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Grams
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={grams}
            aria-label="Grams"
            onChange={(e) => setGrams(Math.max(0, Number(e.target.value)))}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base tabular-nums outline-none focus:border-accent"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Meal
          </span>
          <div className="flex flex-wrap gap-2">
            {MEAL_SLOTS.map((s) => (
              <Chip key={s.slot} selected={slot === s.slot} onClick={() => setSlot(s.slot)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onRemove}>
            Remove
          </Button>
          <Button
            block
            onClick={() =>
              onSave({
                ...log,
                meal_slot: slot,
                quantity_g: food ? grams : log.quantity_g,
                ...macros,
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
