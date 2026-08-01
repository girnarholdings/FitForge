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
import { setDietPlan } from '@/lib/diet/store';
import type { DietGenerationRequest } from './dietGeneration';

export function generateAndStoreDietPlan(req: DietGenerationRequest): void {
  const decision = stanceForGoals(req.rankedGoals, req.bodyFatBand);
  const { stance } = req.heightCm
    ? guardStanceForBmi(decision, req.weightKg, req.heightCm)
    : decision;
  const plan = generateDietPlan({
    targets: req.targets,
    weightKg: req.weightKg,
    stance,
    prefs: req.prefs,
  });
  // The plan carries prefs + stance; the store stamps generatedAt (fitforge.diet.v1 shape).
  setDietPlan(plan);
}
