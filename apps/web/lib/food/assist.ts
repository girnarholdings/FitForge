'use client';

/**
 * OPTIONAL AI garnish (docs/RESEARCH-FOOD.md §C2.8).
 *
 * When — and only when — `NEXT_PUBLIC_AI_ENDPOINT` is configured, very messy free text can be
 * reshaped into the SAME `(quantity, unit, food)` fragments the deterministic parser produces.
 * Hard rules, enforced here rather than trusted to a prompt:
 *
 *   · it never returns nutrient numbers — grams and macros always come from `measures.ts` +
 *     `core.json`, so a model can never invent a calorie count;
 *   · it is never on the critical path: the deterministic parse has already happened and stands
 *     on its own if this returns null, times out, or the endpoint is absent (the default);
 *   · every failure is a value, never a throw.
 */
import { resolveFragment, type ParseOptions } from './parse';
import type { ParsedItem } from './types';

const AI_ENDPOINT = process.env.NEXT_PUBLIC_AI_ENDPOINT ?? '';
const TIMEOUT_MS = 6_000;

/** True when this build has a Workers-AI endpoint configured (it usually does not). */
export function isAssistConfigured(): boolean {
  return AI_ENDPOINT.trim().length > 0;
}

interface AssistFragment {
  quantity?: number | string;
  unit?: string | null;
  food?: string;
}

/** Rebuild a plain "2 cup rice"-style fragment string from whatever the model returned. */
function toFragmentText(raw: AssistFragment): string | null {
  const food = typeof raw.food === 'string' ? raw.food.trim() : '';
  if (!food) return null;
  const qty =
    typeof raw.quantity === 'number' && Number.isFinite(raw.quantity)
      ? String(raw.quantity)
      : typeof raw.quantity === 'string' && /^[\d./ ]+$/.test(raw.quantity.trim())
        ? raw.quantity.trim()
        : '';
  const unit = typeof raw.unit === 'string' ? raw.unit.trim().replace(/[^a-z ]/gi, '') : '';
  return [qty, unit, food].filter(Boolean).join(' ').slice(0, 80);
}

/**
 * Ask the endpoint to segment `text`, then resolve every fragment through the ordinary local
 * resolver. Returns null when unconfigured or on any failure.
 */
export async function assistParse(
  text: string,
  opts: ParseOptions = {},
): Promise<ParsedItem[] | null> {
  if (!isAssistConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(AI_ENDPOINT.trim(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'food-fragments', text }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: AssistFragment[] };
    if (!Array.isArray(body.items) || body.items.length === 0) return null;

    const out: ParsedItem[] = [];
    for (const raw of body.items.slice(0, 12)) {
      const fragment = toFragmentText(raw);
      if (!fragment) continue;
      const item = resolveFragment({ text: fragment.toLowerCase(), child: false }, opts);
      if (item) out.push(item);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
