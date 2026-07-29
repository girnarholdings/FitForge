'use client';

/**
 * THE CONFIRM STEP (docs/RESEARCH-FOOD.md §C2.7) — "ask to confirm what you entered and what it
 * thinks that equates to".
 *
 * Every parsed item is an EDITABLE row: what it matched, the portion it assumed, the computed
 * calories/macros, and a confidence signal. One tap changes the food (opens search), the quantity
 * (stepper) or the unit (chips). Anything the parser could not match is shown honestly as an
 * unmatched row with a "search for it" action — never dropped, never guessed. Nothing reaches the
 * day until "Log …" is pressed.
 */
import * as React from 'react';
import { Button, Card, Chip, Sheet } from '@/components/ui';
import { CheckIcon, PlusIcon, SearchIcon, SparkleIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { askMacroEstimate, type MacroEstimate } from '@/lib/food/aiEstimate';
import { ModelPicker, labelForModel, useCoachModels } from '@/components/features/shared/ModelPicker';
import { isCoachConfigured } from '@/lib/kb/client';
import { computeMacros, confidenceHint, confidenceLevel, formatMacros, sumMacros } from '@/lib/food/format';
import { formatQuantity, unitOptions } from '@/lib/food/measures';
import { reprice } from '@/lib/food/parse';
import { rememberAlias } from '@/lib/food/learning';
import type { Food, ParsedItem } from '@/lib/food/types';
import type { MealSlot } from '@/components/features/_mock/data';
import { MEAL_SLOTS } from './mealSlots';
import { FoodPickerSheet } from './FoodPickerSheet';
import { CustomFoodSheet, type CustomFoodResult } from './CustomFoodSheet';
import { emojiForFood } from '@/lib/food/emoji';

const LEVEL_STYLES = {
  high: { dot: 'bg-success', text: 'text-success' },
  medium: { dot: 'bg-energy', text: 'text-energy' },
  low: { dot: 'bg-danger', text: 'text-danger' },
} as const;

export function ReviewSheet({
  open,
  input,
  items,
  slot,
  recents,
  onSlotChange,
  onItemsChange,
  onConfirm,
  onClose,
}: {
  open: boolean;
  input: string;
  items: ParsedItem[];
  slot: MealSlot;
  recents: Food[];
  onSlotChange: (slot: MealSlot) => void;
  onItemsChange: (items: ParsedItem[]) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [pickerFor, setPickerFor] = React.useState<string | null>(null);
  const [customFor, setCustomFor] = React.useState<string | null>(null);
  const [editFor, setEditFor] = React.useState<string | null>(null);

  const matched = items.filter((i) => i.food && i.portion);
  const totals = sumMacros(
    matched.map((i) => computeMacros(i.food as Food, i.portion?.grams ?? 0)),
  );
  const unmatchedCount = items.length - matched.length;

  function patch(id: string, next: ParsedItem) {
    onItemsChange(items.map((i) => (i.id === id ? next : i)));
  }
  function remove(id: string) {
    onItemsChange(items.filter((i) => i.id !== id));
  }
  function chooseFood(id: string, food: Food) {
    const item = items.find((i) => i.id === id);
    setPickerFor(null);
    if (!item) return;
    // Learning (§C2.7): these words mean this food, from now on.
    if (item.query) rememberAlias(item.query, food.id);
    patch(id, reprice(item, { food }));
  }

  /**
   * Accept an AI estimate. Identical plumbing to a hand-typed custom entry — one serving stored
   * per-100g — with two deliberate differences: the name carries "(AI estimate)" so the
   * provenance survives into the day log, and the serving label is the model's own "per" string,
   * so what the user logs is what the estimate was actually FOR.
   */
  function acceptAiEstimate(id: string, est: MacroEstimate) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const food: Food = {
      id: `ai-${Date.now().toString(36)}`,
      name: `${item.sourceText} (AI estimate)`,
      aliases: [],
      category: 'dish',
      per_100g: {
        kcal: est.kcal.value,
        protein_g: est.protein_g.value,
        carbs_g: est.carbs_g.value,
        fat_g: est.fat_g.value,
      },
      serving_name: est.per,
      serving_grams: 100,
      household_measures: [{ name: 'serving', grams: 100 }],
    };
    patch(id, reprice(item, { food, quantity: 1, unit: null }));
  }

  /** Nothing in the catalog fits — let the user type the numbers off the packet. */
  function addCustom(id: string, result: CustomFoodResult) {
    const item = items.find((i) => i.id === id);
    setCustomFor(null);
    if (!item) return;
    patch(id, reprice(item, { food: result.food, quantity: 1, unit: null }));
  }

  /**
   * EDIT THE MACROS of a matched item. The picked entry's numbers are a database's opinion of an
   * average serving; the plate in front of you is not average. The editor opens pre-filled with
   * the CURRENT portion's computed values, and what comes back replaces this row's pricing —
   * logged as one serving of exactly what was typed. "Save to My foods" (off by default here —
   * tonight's tweak is not the recipe) turns a one-off correction into a reusable entry.
   */
  function applyEdit(id: string, result: CustomFoodResult) {
    const item = items.find((i) => i.id === id);
    setEditFor(null);
    if (!item) return;
    patch(id, reprice(item, { food: result.food, quantity: 1, unit: null }));
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Does this look right?">
        <div data-testid="review-sheet" className="flex max-h-[68dvh] flex-col">
          <p className="-mt-2 mb-3 line-clamp-2 shrink-0 text-sm text-muted-foreground">
            You said “<span className="text-foreground">{input}</span>” · tap anything to fix it.
          </p>

          {/* WHICH MODEL WILL ESTIMATE. Only when something actually needs estimating — with every
              item matched there is no AI in this flow and a model dropdown would be noise. One
              control for the whole sheet rather than one per row: the preference is global (it is
              the same setting the Coach chat shows), so N copies of it would be N chances to
              disagree with each other. */}
          {unmatchedCount > 0 && (
            <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
              <ModelPicker label="Estimate with" testId="review-model-select" />
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto">
            {items.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing to log yet.</p>
            )}
            {items.map((item) =>
              item.food && item.portion ? (
                <MatchedRow
                  key={item.id}
                  item={item}
                  onChange={(next) => patch(item.id, next)}
                  onRemove={() => remove(item.id)}
                  onOpenPicker={() => setPickerFor(item.id)}
                  onPickAlternative={(food) => chooseFood(item.id, food)}
                  onEditMacros={() => setEditFor(item.id)}
                />
              ) : (
                <UnmatchedRow
                  key={item.id}
                  item={item}
                  onSearch={() => setPickerFor(item.id)}
                  onCustom={() => setCustomFor(item.id)}
                  onRemove={() => remove(item.id)}
                  onAiAccept={(est) => acceptAiEstimate(item.id, est)}
                />
              ),
            )}
          </div>

          <div className="-mx-5 mt-3 shrink-0 space-y-2 border-t border-border bg-surface px-5 pt-3">
            <div className="flex flex-wrap gap-1.5">
              {MEAL_SLOTS.map((s) => (
                <Chip
                  key={s.slot}
                  selected={slot === s.slot}
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => onSlotChange(s.slot)}
                >
                  {s.label}
                </Chip>
              ))}
            </div>

            <div data-testid="review-total">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-muted-foreground">
                  {matched.length} item{matched.length === 1 ? '' : 's'}
                  {unmatchedCount > 0 ? ` · ${unmatchedCount} unmatched` : ''}
                </span>
                <span className="tabular shrink-0 font-semibold text-foreground">
                  {Math.round(totals.kcal)} kcal
                </span>
              </div>
              <p className="tabular text-right text-[11px] text-muted-foreground">
                {formatMacros(totals)}
              </p>
            </div>

            <Button
              block
              size="lg"
              glow
              data-testid="review-confirm"
              disabled={matched.length === 0}
              onClick={onConfirm}
            >
              <CheckIcon size={18} />
              Log {matched.length} item{matched.length === 1 ? '' : 's'} · {Math.round(totals.kcal)}{' '}
              kcal
            </Button>
          </div>
        </div>
      </Sheet>

      <CustomFoodSheet
        open={customFor != null}
        title="Enter it yourself"
        name={items.find((i) => i.id === customFor)?.sourceText ?? ''}
        defaultSave
        onCancel={() => setCustomFor(null)}
        onDone={(result) => customFor && addCustom(customFor, result)}
      />

      <CustomFoodSheet
        open={editFor != null}
        title="Edit macros"
        name={items.find((i) => i.id === editFor)?.food?.name ?? ''}
        prefill={(() => {
          const item = items.find((i) => i.id === editFor);
          if (!item?.food || !item.portion) return null;
          return computeMacros(item.food, item.portion.grams);
        })()}
        defaultSave={false}
        onCancel={() => setEditFor(null)}
        onDone={(result) => editFor && applyEdit(editFor, result)}
      />

      <FoodPickerSheet
        open={pickerFor != null}
        title="Which food was it?"
        initialQuery={items.find((i) => i.id === pickerFor)?.sourceText}
        recents={recents}
        onSelect={(food) => pickerFor && chooseFood(pickerFor, food)}
        onClose={() => setPickerFor(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------------ matched row */

function MatchedRow({
  item,
  onChange,
  onRemove,
  onOpenPicker,
  onPickAlternative,
  onEditMacros,
}: {
  item: ParsedItem;
  onChange: (next: ParsedItem) => void;
  onRemove: () => void;
  onOpenPicker: () => void;
  onPickAlternative: (food: Food) => void;
  onEditMacros: () => void;
}) {
  const food = item.food as Food;
  const grams = item.portion?.grams ?? 0;
  const macros = computeMacros(food, grams);
  const level = confidenceLevel(item.confidence);
  const styles = LEVEL_STYLES[level];
  const units = React.useMemo(() => unitOptions(food), [food]);

  const step = item.unit === 'g' || item.unit === 'ml' ? 25 : item.unit === 'oz' ? 1 : 0.5;
  const setQuantity = (q: number) =>
    onChange(reprice(item, { quantity: Math.max(step, Math.round(q * 100) / 100) }));

  // With no explicit unit the portion still came from a named measure ('large', 'medium').
  const selectedUnit = item.unit ?? item.portion?.measureName ?? '__serving';

  // Keep the unit actually in use visible in the horizontally scrolling chip strip.
  const chipsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const strip = chipsRef.current;
    const chip = strip?.querySelector<HTMLElement>('[data-selected="true"]');
    if (strip && chip) strip.scrollLeft = Math.max(0, chip.offsetLeft - strip.offsetLeft - 8);
  }, [selectedUnit]);

  return (
    <Card
      data-testid="review-row"
      data-confidence={level}
      className="!p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {item.child ? '↳ ' : ''}“{item.sourceText}”
        </p>
        <button
          type="button"
          aria-label={`Remove ${food.name}`}
          onClick={onRemove}
          className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors hover:text-danger"
        >
          <XIcon size={14} />
        </button>
      </div>

      <button
        type="button"
        data-testid="review-row-food"
        onClick={onOpenPicker}
        className="mt-1 flex w-full items-center gap-2 text-left"
      >
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-base">
          {emojiForFood(food)}
        </span>
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', styles.dot)} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {food.name}
        </span>
        <span className="shrink-0 text-xs font-semibold text-accent">Change</span>
      </button>

      <p className="mt-1 pl-4 text-xs text-muted-foreground">
        {item.portion?.label} ·{' '}
        <span className="tabular text-foreground">{Math.round(macros.kcal)} kcal</span> ·{' '}
        <span className="tabular">{formatMacros(macros)}</span>
        {' · '}
        <button
          type="button"
          data-testid="review-row-edit-macros"
          onClick={onEditMacros}
          className="font-semibold text-accent hover:underline"
        >
          Edit macros
        </button>
      </p>

      {level !== 'high' && (
        <p className={cn('mt-1 pl-4 text-[11px] font-medium', styles.text)}>
          {confidenceHint(level)}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center rounded-field border border-border bg-surface">
          <button
            type="button"
            aria-label={`Decrease ${food.name}`}
            onClick={() => setQuantity(item.quantity - step)}
            className="grid h-9 w-9 place-items-center rounded-l-field text-lg font-semibold text-foreground hover:bg-elevated"
          >
            −
          </button>
          <span className="tabular min-w-10 text-center text-sm font-semibold">
            {formatQuantity(item.quantity)}
          </span>
          <button
            type="button"
            aria-label={`Increase ${food.name}`}
            onClick={() => setQuantity(item.quantity + step)}
            className="grid h-9 w-9 place-items-center rounded-r-field text-lg font-semibold text-foreground hover:bg-elevated"
          >
            +
          </button>
        </div>

        <div
          ref={chipsRef}
          className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5"
        >
          {units.map((u) => (
            <button
              key={u.unit}
              type="button"
              data-selected={selectedUnit === u.unit}
              onClick={() =>
                onChange(
                  reprice(item, {
                    unit: u.unit === '__serving' ? null : u.unit,
                    quantity: u.unit === 'g' ? Math.round(grams) : item.quantity,
                  }),
                )
              }
              className={cn(
                'shrink-0 rounded-chip border px-2.5 py-1.5 text-xs font-medium transition-colors',
                selectedUnit === u.unit
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-border bg-surface-2 text-muted-foreground',
              )}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      {level === 'low' && item.alternatives.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {item.alternatives.slice(0, 3).map((alt) => (
            <button
              key={alt.id}
              type="button"
              onClick={() => onPickAlternative(alt)}
              className="shrink-0 rounded-chip border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted-foreground"
            >
              {alt.name}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------- unmatched row */

type AiPhase =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'done'; est: MacroEstimate }
  | { phase: 'failed'; why: string };

function UnmatchedRow({
  item,
  onSearch,
  onCustom,
  onRemove,
  onAiAccept,
}: {
  item: ParsedItem;
  onSearch: () => void;
  onCustom: () => void;
  onRemove: () => void;
  onAiAccept: (est: MacroEstimate) => void;
}) {
  const configured = isCoachConfigured();
  const [ai, setAi] = React.useState<AiPhase>({ phase: 'idle' });

  async function estimate() {
    setAi({ phase: 'pending' });
    const r = await askMacroEstimate(item.sourceText);
    if (r.status === 'ok') setAi({ phase: 'done', est: r.estimate });
    else if (r.status === 'not-food')
      setAi({ phase: 'failed', why: 'The AI does not think this is a food.' });
    else if (r.status === 'timeout')
      setAi({ phase: 'failed', why: 'The AI took too long — try again.' });
    else setAi({ phase: 'failed', why: 'The AI service could not be reached.' });
  }

  return (
    <Card
      data-testid="review-row"
      data-confidence="none"
      className="!p-3 border-danger/50 bg-danger/5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">“{item.sourceText}”</p>
          <p className="mt-0.5 text-xs text-danger">
            No match in the food database — nothing was guessed.
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${item.sourceText}`}
          onClick={onRemove}
          className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors hover:text-danger"
        >
          <XIcon size={14} />
        </button>
      </div>

      {ai.phase === 'done' ? (
        <AiEstimatePanel
          est={ai.est}
          onAccept={() => onAiAccept(ai.est)}
          onDiscard={() => setAi({ phase: 'idle' })}
        />
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {configured && (
            <button
              type="button"
              data-testid="unmatched-ai"
              disabled={ai.phase === 'pending'}
              onClick={() => void estimate()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-chip px-3 py-1.5 text-xs font-semibold text-[color:var(--accent-foreground)] shadow-[var(--shadow-glow)] transition-transform active:scale-95 disabled:opacity-60"
              style={{ background: 'var(--gradient-gold)' }}
            >
              <SparkleIcon size={14} />
              {ai.phase === 'pending' ? 'Asking 3 AI samples…' : 'Estimate with AI'}
            </button>
          )}
          <Button size="sm" variant="secondary" data-testid="unmatched-search" onClick={onSearch}>
            <SearchIcon size={15} /> Search for it
          </Button>
          <Button size="sm" variant="ghost" data-testid="unmatched-custom" onClick={onCustom}>
            <PlusIcon size={15} /> Enter macros
          </Button>
        </div>
      )}

      {ai.phase === 'failed' && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {ai.why}{' '}
          <button type="button" onClick={() => void estimate()} className="font-semibold text-accent">
            Retry
          </button>
        </p>
      )}
    </Card>
  );
}

/**
 * The estimate, shown as what it is: a median across independent AI samples, with the honest
 * min–max range beside every number. Nothing logs until "Use estimate" — the AI proposes, the
 * user disposes.
 */
function AiEstimatePanel({
  est,
  onAccept,
  onDiscard,
}: {
  est: MacroEstimate;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const styles = LEVEL_STYLES[est.confidence];
  const models = useCoachModels();
  // Which model REALLY answered, which is not always the one that was picked — a retired choice
  // falls through the chain. Attributing the number honestly is the same principle as printing
  // the min–max range instead of a single confident figure.
  const by = labelForModel(models, est.model);
  return (
    <div data-testid="unmatched-ai-result" className="mt-2 rounded-field border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-surface p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
        <SparkleIcon size={12} /> AI estimate · {est.samples} samples
        <span aria-hidden className={cn('ml-auto h-2 w-2 rounded-full', styles.dot)} />
        <span className={cn('text-[10px] normal-case', styles.text)}>{est.confidence} confidence</span>
      </div>
      {by && (
        <p className="mt-0.5 text-[10px] text-muted-foreground" data-testid="unmatched-ai-model">
          by {by}
        </p>
      )}
      <p className="tabular mt-1.5 text-sm font-semibold text-foreground">
        ≈ {Math.round(est.kcal.value)} kcal{' '}
        <span className="font-normal text-muted-foreground">
          ({Math.round(est.kcal.low)}–{Math.round(est.kcal.high)})
        </span>
      </p>
      <p className="tabular text-xs text-muted-foreground">
        P {Math.round(est.protein_g.value)}g · C {Math.round(est.carbs_g.value)}g · F{' '}
        {Math.round(est.fat_g.value)}g · per {est.per}
      </p>
      {est.assumptions.length > 0 && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Assumes: {est.assumptions.join('; ')}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" data-testid="unmatched-ai-accept" onClick={onAccept}>
          <CheckIcon size={14} /> Use estimate
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
