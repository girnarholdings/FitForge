'use client';

/**
 * AI-FIRST MEAL PARSING — the client half of the worker's `meal` task.
 *
 * The deterministic parser matches WORDS, so "steak and eggs" landed on "Egg, whole, raw/boiled"
 * — a database row, not a breakfast. The meal task reads the sentence: one low-temperature call
 * splits it into items with the preparation the dish context implies (eggs beside a steak are
 * scrambled or fried), then the worker prices each item through the same three-sample consensus
 * loop as the single-food estimator. Tiering rides the existing coach plumbing: guests get
 * Workers AI, signed-in athletes Mistral, Pro uids DeepSeek — the worker resolves it from the
 * idToken and the preferred-model pick, same as chat.
 *
 * THE CATALOG IS THE FLOOR, NOT THE CEILING. This module never throws and every failure path
 * (off, unconfigured, offline, timeout, token limits, garbage) reports a status the caller turns
 * into the offline parse — the athlete always gets rows, the AI only decides how good they are.
 */
import { coachEndpoint, getPreferredModel } from '@/lib/kb/client';
import { currentIdToken } from '@/lib/auth/firebase';
import { searchFoods } from './search';
import { resolvePortion } from './measures';
import type { Food, ParsedItem } from './types';
import type { MacroField } from './aiEstimate';

/* ------------------------------------------------------------------------- the toggle */

const AI_PARSE_KEY = 'fitforge.nutrition.aiParse.v1';

/** ON unless the athlete turned it off — the whole point is that the smart path is the default. */
export function aiParseEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AI_PARSE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAiParseEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(AI_PARSE_KEY, on ? '1' : '0');
  } catch {
    /* private mode — the session default stands */
  }
}

/* ------------------------------------------------------------------------- the call */

export interface AiMealItem {
  food: string;
  qty: number;
  unit: string | null;
  grams: number;
  kcal?: MacroField;
  protein_g?: MacroField;
  carbs_g?: MacroField;
  fat_g?: MacroField;
  confidence?: 'high' | 'medium' | 'low';
  assumptions?: string[];
  samples?: number;
  /** present when this item's consensus estimate failed — the caller falls back for this row */
  error?: string;
}

export interface AiMeal {
  items: AiMealItem[];
  model?: string;
}

export type MealParseResult =
  | { status: 'ok'; meal: AiMeal }
  | { status: 'not-configured' }
  | { status: 'not-food' }
  | { status: 'timeout' }
  | { status: 'error'; detail: string };

/**
 * 35s: the worker runs one splitter round, then all items' three-sample estimates in parallel —
 * two sequential model rounds, each bounded by its slowest sample.
 */
export const MEAL_TIMEOUT_MS = 35_000;

function isField(v: unknown): v is MacroField {
  const f = v as MacroField;
  return (
    !!f &&
    [f.value, f.low, f.high].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  );
}

export async function askMealParse(
  text: string,
  external?: AbortSignal,
): Promise<MealParseResult> {
  const endpoint = coachEndpoint();
  if (!endpoint) return { status: 'not-configured' };
  const sentence = text.trim();
  if (!sentence) return { status: 'error', detail: 'empty text' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MEAL_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort);

  try {
    const idToken = await currentIdToken();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'meal',
        text: sentence,
        ...(getPreferredModel() ? { model: getPreferredModel() } : {}),
        ...(idToken ? { idToken } : {}),
      }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => null)) as
      | { items?: unknown; model?: unknown; error?: string }
      | null;

    if (res.status === 422 || body?.error === 'not_food') return { status: 'not-food' };
    if (!res.ok || !body || body.error || !Array.isArray(body.items))
      return { status: 'error', detail: body?.error ?? `HTTP ${res.status}` };

    const items: AiMealItem[] = [];
    for (const raw of body.items.slice(0, 6)) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const food = typeof r.food === 'string' ? r.food.trim().slice(0, 60) : '';
      const qty = Number(r.qty);
      const grams = Number(r.grams);
      if (food.length < 2 || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(grams) || grams <= 0)
        continue;
      const base: AiMealItem = {
        food,
        qty,
        unit: typeof r.unit === 'string' && r.unit ? r.unit : null,
        grams,
      };
      if (typeof r.error === 'string') {
        items.push({ ...base, error: r.error });
        continue;
      }
      // Numbers someone will eat get the hard shape gate, same as the single-food estimate.
      if (!isField(r.kcal) || !isField(r.protein_g) || !isField(r.carbs_g) || !isField(r.fat_g)) {
        items.push({ ...base, error: 'malformed_estimate' });
        continue;
      }
      items.push({
        ...base,
        kcal: r.kcal,
        protein_g: r.protein_g,
        carbs_g: r.carbs_g,
        fat_g: r.fat_g,
        confidence:
          r.confidence === 'high' || r.confidence === 'medium' ? r.confidence : 'low',
        assumptions: Array.isArray(r.assumptions) ? r.assumptions.map(String).slice(0, 4) : [],
        samples: typeof r.samples === 'number' ? r.samples : 0,
      });
    }

    if (items.length === 0) return { status: 'error', detail: 'empty meal' };
    return {
      status: 'ok',
      meal: { items, model: typeof body.model === 'string' ? body.model.slice(0, 120) : undefined },
    };
  } catch (err) {
    if (timedOut) return { status: 'timeout' };
    if (external?.aborted) return { status: 'error', detail: 'cancelled' };
    return { status: 'error', detail: String(err).slice(0, 160) };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

/* --------------------------------------------------------------- AI items → review rows */

const CONF_SCORE = { high: 0.95, medium: 0.75, low: 0.55 } as const;

let aiSeq = 0;

/**
 * Turn the worker's priced items into the SAME ParsedItem rows the offline parser produces, so
 * the review sheet needs no second rendering path: every row keeps Change / portion chips /
 * Edit macros, and the catalog's near-matches ride along as one-tap alternatives.
 *
 * The Food built here is synthetic: per-100g derived from the consensus estimate over the item's
 * total grams, with the single unit the athlete actually used as its serving. An item whose
 * estimate failed becomes an UNMATCHED row (food: null) — the sheet's search / AI-retry / manual
 * paths already know what to do with those.
 */
export function itemsFromAiMeal(meal: AiMeal): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const it of meal.items) {
    const id = `pi-ai-${Date.now().toString(36)}-${aiSeq++}`;
    const alternatives = searchFoods(it.food, { limit: 3 }).map((h) => h.food);

    if (it.error || !it.kcal || !it.protein_g || !it.carbs_g || !it.fat_g) {
      out.push({
        id,
        sourceText: it.food,
        quantity: it.qty,
        quantitySource: it.qty !== 1 ? 'numeric' : 'implicit',
        unit: null,
        size: null,
        query: it.food.toLowerCase(),
        food: null,
        alternatives,
        portion: null,
        matchConfidence: 0,
        confidence: 0,
        child: false,
      });
      continue;
    }

    const perUnitGrams = Math.max(1, Math.round(it.grams / it.qty));
    const scale = 100 / it.grams;
    const food: Food = {
      id,
      name: it.food,
      aliases: [],
      category: 'dish',
      per_100g: {
        kcal: Math.round(it.kcal.value * scale * 10) / 10,
        protein_g: Math.round(it.protein_g.value * scale * 10) / 10,
        carbs_g: Math.round(it.carbs_g.value * scale * 10) / 10,
        fat_g: Math.round(it.fat_g.value * scale * 10) / 10,
      },
      serving_name: it.unit ?? 'serving',
      serving_grams: perUnitGrams,
      household_measures: [{ name: it.unit ?? 'serving', grams: perUnitGrams }],
    };

    const match = CONF_SCORE[it.confidence ?? 'low'];
    out.push({
      id,
      sourceText: it.food,
      quantity: it.qty,
      quantitySource: it.qty !== 1 ? 'numeric' : 'implicit',
      unit: null,
      size: null,
      query: it.food.toLowerCase(),
      food,
      alternatives,
      portion: resolvePortion(food, it.qty, null, {}),
      matchConfidence: match,
      confidence: match,
      child: false,
    });
  }
  return out;
}
