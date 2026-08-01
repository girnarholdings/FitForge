'use client';

/**
 * THE DIET-GENERATION BOUNDARY — the single seam between AI-Mode onboarding completion (W3) and
 * the diet engine (W2, `apps/web/lib/diet/**`, built on a parallel branch).
 *
 * Completion calls exactly one function here ({@link runDietGenerationForDraft}); everything the
 * contract's `generateDietPlan`/`stanceForGoals`/`setDietPlan` need is assembled in this file
 * from the confirmed draft, and the actual contract imports live in ONE place —
 * `./dietBridge.ts` — behind the loader below.
 *
 * WHY THE LOADER IS INDIRECT (read before "fixing" it): W2's engine does not exist on this
 * branch, and a static (or statically-analyzable dynamic) import of `@/lib/diet/*` fails the
 * whole `next build`, which would take every Old School screen down with it — the exact opposite
 * of Law 1. The `webpackIgnore` comment keeps the bridge out of the bundle graph so this branch
 * builds and its e2e suite runs; at runtime the native import fails, is caught, and completion
 * reports `engine-absent`.
 *
 * ── INTEGRATION (the edits this seam needs once W2's branch is merged) ─────────────────────────
 *   1. In {@link loadDietBridge}, DELETE the `webpackIgnore` comment so webpack bundles
 *      `./dietBridge` (whose imports are the contract's exact module paths + signatures).
 *   2. In `./dietBridge.ts`, DELETE the leading `@ts-nocheck` so the contract imports are
 *      type-checked for real.
 *   3. Verify `setDietPlan`'s real signature in `lib/diet/store.ts` matches the call in
 *      `dietBridge.ts` (the contract pins the store shape but not that function's parameters).
 *   4. Flip the e2e assertion in `tests/e2e/onboarding-ai.spec.ts` from the invocation event to
 *      `localStorage['fitforge.diet.v1']` existing (the spec says exactly where).
 *
 * Every attempt — stored, absent, or failed — dispatches a `fitforge:diet-generation`
 * CustomEvent with the request and outcome. That is the observable proof-of-invocation the e2e
 * suite asserts on while the engine is absent, and a free debugging trace afterwards.
 */
import type { GoalType } from '@fitforge/shared/types';
import type { AiDietBase, AiDietAvoid } from '@fitforge/shared/schemas';
import type { OnboardingDraft } from './types';

/* ----------------------------------------------------- contract-mirror types (W2 owns the real ones) */

/** Mirror of the contract's `DietPrefs` (lib/diet/plan.ts, W2). */
export interface DietPrefs {
  base: AiDietBase;
  avoid: AiDietAvoid[];
}

/** The nutrition targets shape the existing generators persist (components/features/_mock/data). */
export interface DietTargets {
  kcal_target: number;
  protein_g_target: number;
  carbs_g_target: number;
  fat_g_target: number;
}

export interface DietGenerationRequest {
  targets: DietTargets;
  /** the confirmed weight-band MIDPOINT (Law 2) — same number the training math uses */
  weightKg: number;
  /** ranked goals, index 0 = leader — `stanceForGoals` derives the single energy stance */
  rankedGoals: GoalType[];
  /** confirmed body-fat band, for recomp detection (RESEARCH-DIET §1.1) */
  bodyFatBand?: string;
  prefs: DietPrefs;
}

export type DietGenerationOutcome = 'stored' | 'engine-absent' | 'failed';

export const DIET_GENERATION_EVENT = 'fitforge:diet-generation';

/* --------------------------------------------------------------------------- the loader seam */

type DietBridge = {
  generateAndStoreDietPlan: (req: DietGenerationRequest) => void;
};

async function loadDietBridge(): Promise<DietBridge | null> {
  try {
    // INTEGRATION: delete the webpackIgnore comment (see the header note). With it, the browser
    // attempts a native import that fails on this branch by design; without it, webpack bundles
    // the bridge and the contract imports inside it.
    const mod = (await import(/* webpackIgnore: true */ './dietBridge')) as DietBridge;
    return typeof mod.generateAndStoreDietPlan === 'function' ? mod : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------- request assembly */

/** diet_avoid → the existing allergen vocabulary, where the two overlap (nut → both nut tags). */
export const AVOID_TO_ALLERGENS: Record<AiDietAvoid, string[]> = {
  dairy_free: ['dairy'],
  gluten_free: ['gluten'],
  nut_free: ['tree_nut', 'peanut'],
  shellfish_free: ['shellfish'],
  halal_friendly: [], // a sourcing rule, not an allergen — the diet engine's filter handles it
};

/**
 * Build the engine's input from a completed AI-Mode draft. Null when the draft cannot honestly
 * feed the engine (no targets yet, no weight midpoint) — the caller reports `failed` rather
 * than inventing numbers, because "AI advises, arithmetic decides" cuts both ways.
 */
export function dietRequestFromDraft(
  draft: Partial<OnboardingDraft>,
  targets: DietTargets | null,
): DietGenerationRequest | null {
  if (!targets || targets.kcal_target <= 0) return null;
  const weightKg = draft.weight_kg;
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  const rankedGoals = (draft.goals?.length
    ? draft.goals
    : [draft.primary_goal, draft.secondary_goal].filter(Boolean)) as GoalType[];
  return {
    targets,
    weightKg,
    rankedGoals,
    ...(draft.ai_body_fat_band ? { bodyFatBand: draft.ai_body_fat_band } : {}),
    prefs: {
      base: draft.diet_base ?? 'omnivore',
      avoid: draft.diet_avoid ?? [],
    },
  };
}

/* --------------------------------------------------------------------------- the entry point */

/**
 * Generate + persist the 7-day diet plan for a finished AI-Mode draft. NEVER throws — a missing
 * or failing engine must not stop the athlete landing on Today with their training plan, the
 * same "the app never depends on the worker" posture as everywhere else.
 */
export async function runDietGenerationForDraft(
  draft: Partial<OnboardingDraft>,
  targets: DietTargets | null,
): Promise<DietGenerationOutcome> {
  const request = dietRequestFromDraft(draft, targets);
  let outcome: DietGenerationOutcome = 'failed';
  if (request) {
    const bridge = await loadDietBridge();
    if (!bridge) {
      outcome = 'engine-absent';
    } else {
      try {
        bridge.generateAndStoreDietPlan(request);
        outcome = 'stored';
      } catch {
        outcome = 'failed';
      }
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent(DIET_GENERATION_EVENT, { detail: { request, outcome } }),
    );
  } catch {
    /* an event that cannot dispatch changes nothing about the outcome */
  }
  return outcome;
}
