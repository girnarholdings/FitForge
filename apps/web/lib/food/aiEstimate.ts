'use client';

/**
 * AI MACRO ESTIMATION — the client half of the worker's `macros` task.
 *
 * Called only for foods the catalog could not match, and only on user request: the button says
 * "Estimate with AI", the result arrives as a MEDIAN WITH A RANGE from three independent model
 * samples (the worker's consensus loop), and nothing reaches the day's log until the user accepts
 * it. That ordering is the whole ethics of the feature — the app never silently swaps a guess in
 * where the parser honestly said "no match".
 *
 * Like every Coach call: never throws, hard timeout, unconfigured builds short-circuit locally.
 */
import { coachEndpoint, getPreferredModel } from '@/lib/kb/client';

export interface MacroField {
  value: number;
  low: number;
  high: number;
}

export interface MacroEstimate {
  per: string;
  kcal: MacroField;
  protein_g: MacroField;
  carbs_g: MacroField;
  fat_g: MacroField;
  confidence: 'high' | 'medium' | 'low';
  assumptions: string[];
  samples: number;
}

export type MacroEstimateResult =
  | { status: 'ok'; estimate: MacroEstimate }
  | { status: 'not-configured' }
  | { status: 'not-food' }
  | { status: 'timeout' }
  | { status: 'error'; detail: string };

/**
 * 25s, deliberately longer than the chat call's 10s: the worker fans out THREE model samples for
 * one estimate. They run in parallel server-side, but the slowest sample sets the wall clock.
 */
export const MACRO_TIMEOUT_MS = 25_000;

function isField(v: unknown): v is MacroField {
  const f = v as MacroField;
  return (
    !!f &&
    [f.value, f.low, f.high].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  );
}

export async function askMacroEstimate(
  food: string,
  quantity?: string,
  external?: AbortSignal,
): Promise<MacroEstimateResult> {
  const endpoint = coachEndpoint();
  if (!endpoint) return { status: 'not-configured' };
  const name = food.trim();
  if (!name) return { status: 'error', detail: 'empty food' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MACRO_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'macros',
        food: name,
        quantity,
        // The user's picked model rides along; the worker whitelists it against its own catalog.
        ...(getPreferredModel() ? { model: getPreferredModel() } : {}),
      }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => null)) as
      | (Partial<MacroEstimate> & { error?: string; detail?: string })
      | null;

    if (res.status === 422 || body?.error === 'not_food') return { status: 'not-food' };
    if (!res.ok || !body || body.error)
      return { status: 'error', detail: body?.error ?? `HTTP ${res.status}` };

    // Validate the shape hard: numbers about food someone will EAT deserve more suspicion than a
    // chat answer, and a half-shaped body silently coerced would put NaN into a day's total.
    if (
      !isField(body.kcal) ||
      !isField(body.protein_g) ||
      !isField(body.carbs_g) ||
      !isField(body.fat_g)
    )
      return { status: 'error', detail: 'malformed estimate' };

    return {
      status: 'ok',
      estimate: {
        per: typeof body.per === 'string' && body.per ? body.per : 'one serving',
        kcal: body.kcal,
        protein_g: body.protein_g,
        carbs_g: body.carbs_g,
        fat_g: body.fat_g,
        confidence:
          body.confidence === 'high' || body.confidence === 'medium' ? body.confidence : 'low',
        assumptions: Array.isArray(body.assumptions) ? body.assumptions.map(String) : [],
        samples: typeof body.samples === 'number' ? body.samples : 0,
      },
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
