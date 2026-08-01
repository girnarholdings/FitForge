'use client';

/**
 * THE DIET-GENERATION BOUNDARY — the single seam between AI-Mode onboarding completion (W3) and
 * the diet engine (W2, `apps/web/lib/diet/**`).
 *
 * Completion calls exactly one function here ({@link runDietGenerationForDraft}); everything the
 * contract's `generateDietPlan`/`stanceForGoals`/`setDietPlan` need is assembled in this file
 * from the confirmed draft, and the actual lib/diet imports live in ONE place — `./dietBridge.ts`
 * — loaded lazily below. (The seam predates the engine's merge: while W2 built on a parallel
 * branch this loader was build-time-ignored and completion honestly reported `engine-absent`.
 * The indirection stays because it is also what makes the call mockable and observable.)
 *
 * Every attempt — stored or failed — dispatches a `fitforge:diet-generation` CustomEvent with
 * the request and outcome: the e2e suite's proof-of-invocation, and a free debugging trace.
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
  /** height-band midpoint — lets the bridge apply the §6 BMI<18.5 cut refusal deterministically */
  heightCm?: number;
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
    // Lazy on purpose: the recipe corpus rides with the engine, and only an AI-Mode completion
    // ever needs it — the classic flow should not pay for it in its bundle.
    const mod = (await import('./dietBridge')) as DietBridge;
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
    ...(typeof draft.height_cm === 'number' && draft.height_cm > 0
      ? { heightCm: draft.height_cm }
      : {}),
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
