// @ts-nocheck — CROSS-BRANCH FILE, checked at integration, not before. W2 builds `@/lib/diet/**`
// on a parallel branch, so the three imports below cannot resolve here; without this directive
// their TS2307s would fail `next build` and take the whole Old School flow's e2e suite down with
// them (Law 1 says that flow stays shippable at all times). DELETE THIS LINE when the branches
// merge — the imports then resolve and this file gets type-checked like any other.
'use client';

/**
 * THE CONTRACT IMPORTS, in one file (docs/AIMODE-CONTRACT.md "Diet engine", owner W2):
 *
 *   - `generateDietPlan({ targets, weightKg, stance, prefs })` from `@/lib/diet/plan`
 *   - `stanceForGoals(rankedGoals, bodyFatBand?)`               from `@/lib/diet/stance`
 *   - `setDietPlan(...)`                                        from `@/lib/diet/store`
 *
 * The file is kept out of the bundle graph until integration by the `webpackIgnore` seam in
 * `./dietGeneration.ts` (its header documents the full integration checklist).
 *
 * INTEGRATION MUST VERIFY: the `setDietPlan` call below. The contract pins the STORE SHAPE
 * (`fitforge.diet.v1` = `{version:1, plan, prefs, stance, generatedAt}`) but not the function's
 * parameter list; the object form used here is a best guess, and the compile error that appears
 * once `@ts-nocheck` is removed is the intended way any mismatch surfaces.
 */
import { generateDietPlan } from '@/lib/diet/plan';
import { stanceForGoals } from '@/lib/diet/stance';
import { setDietPlan } from '@/lib/diet/store';
import type { DietGenerationRequest } from './dietGeneration';

/**
 * Stance first, then the plan, then the store — deterministic end to end: the scan's only
 * influence on food is the confirmed body-fat BAND feeding recomp detection (Law 3).
 */
export function generateAndStoreDietPlan(req: DietGenerationRequest): void {
  const stance = stanceForGoals(req.rankedGoals, req.bodyFatBand);
  const plan = generateDietPlan({
    targets: req.targets,
    weightKg: req.weightKg,
    stance,
    prefs: req.prefs,
  });
  setDietPlan({ plan, prefs: req.prefs, stance });
}
