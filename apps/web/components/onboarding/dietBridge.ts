'use client';

/**
 * THE CONTRACT IMPORTS, in one file (docs/AIMODE-CONTRACT.md "Diet engine", owner W2) — wired
 * for real now that the engine is merged. This bridge was born on the parallel branch behind a
 * build-time seam; the seam is gone, and this is the ONLY place onboarding touches lib/diet.
 *
 * Stance first — with the §6/§1.1 red lines applied where the engine's own API puts them
 * (`guardStanceForBmi`: BMI < 18.5 refuses a cut and quietly maintains) — then the deterministic
 * plan, then the store. The scan's only influence on food is the CONFIRMED body-fat band feeding
 * recomp detection (Law 3: AI advises, arithmetic decides).
 */
import { generateDietPlan } from '@/lib/diet/plan';
import { stanceForGoals, guardStanceForBmi } from '@/lib/diet/stance';
import { getDietPlan, setDietPlan } from '@/lib/diet/store';
import type { DietGenerationRequest } from './dietGeneration';

export function generateAndStoreDietPlan(req: DietGenerationRequest): void {
  const decision = stanceForGoals(req.rankedGoals, req.bodyFatBand);
  const { stance } = req.heightCm
    ? guardStanceForBmi(decision, req.weightKg, req.heightCm)
    : decision;

  // IDEMPOTENT AGAINST AN EQUAL-INPUT STORED PLAN. Every onboarding step is its own route, so
  // back-navigating from plan_preview and returning REMOUNTS the screen and re-runs generation
  // — which, before this guard, silently regenerated over any dish the athlete had just
  // swapped. The generator is deterministic on exactly (targets, weightKg, stance, prefs), so
  // when a stored plan matches all four, a re-run can only ever destroy swaps, never improve
  // the plan: keep what is stored. Changed answers (different targets, weight, goals or prefs)
  // still regenerate, as they must.
  const existing = getDietPlan();
  if (
    existing &&
    existing.stance === stance &&
    existing.plan.days.length === 7 &&
    existing.plan.days.every((d) => d.meals.length > 0) &&
    existing.plan.weightKg === req.weightKg &&
    JSON.stringify(existing.plan.targets) === JSON.stringify(req.targets) &&
    existing.prefs.base === req.prefs.base &&
    JSON.stringify([...existing.prefs.avoid].sort()) ===
      JSON.stringify([...req.prefs.avoid].sort())
  ) {
    return;
  }

  const plan = generateDietPlan({
    targets: req.targets,
    weightKg: req.weightKg,
    stance,
    prefs: req.prefs,
  });
  // The plan carries prefs + stance; the store stamps generatedAt (fitforge.diet.v1 shape).
  setDietPlan(plan);
}
