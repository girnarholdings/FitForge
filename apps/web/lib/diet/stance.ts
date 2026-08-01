'use client';

/**
 * GOALS → ONE ENERGY STANCE (RESEARCH-DIET §1.1).
 *
 * AI-Mode collects up to three ranked goals; the diet engine needs exactly one stance. The table:
 *
 *   · fat loss AND muscle/strength both in the top-3 → RECOMP — with the §1.1 nuance that recomp
 *     is for the lean-ish middle body-fat buckets. In the higher-fat buckets a plain cut also
 *     recomps, so the combo resolves to CUT there.
 *   · fat loss first (muscle absent)                → CUT
 *   · muscle/strength first (fat loss absent)       → LEAN GAIN
 *   · endurance first                               → ENDURANCE
 *   · general health / anything else / no goals     → MAINTAIN
 *
 * Each stance also names the existing GoalType whose kcal multiplier it rides on (§1.1 third
 * column) — recomp is maintenance ×1.00 with protein doing the work, so it maps to
 * `general_health` for kcal while `computeNutritionTargets` gets the stance for the protein row.
 */
import type { GoalType } from '@fitforge/shared/types';

export type DietStance = 'cut' | 'lean-gain' | 'recomp' | 'endurance' | 'maintain';

export interface StanceDecision {
  stance: DietStance;
  /** The existing GoalType whose kcal adjustment this stance uses (§1.1 table, third column). */
  kcalGoal: GoalType;
}

const MUSCLE_GOALS: GoalType[] = ['strength', 'hypertrophy'];

/** The body-fat buckets where a plain cut already recomps (§1.1: "higher body fat"). */
const HIGHER_FAT_BANDS = ['25-32', '32+'];

export function stanceForGoals(rankedGoals: GoalType[], bodyFatBand?: string): StanceDecision {
  const top3 = rankedGoals.slice(0, 3);
  const first = top3[0];
  const hasFatLoss = top3.includes('fat_loss');
  const muscleGoal = top3.find((g) => MUSCLE_GOALS.includes(g));

  // Recomp detection: both fat loss and muscle in the top-3. In the higher-fat buckets the
  // deficit itself recomps (§1.1), so pick the plain cut there; recomp proper is for the
  // lean-ish middle (and for unknown bands — the user asked for both, honor both).
  if (hasFatLoss && muscleGoal) {
    if (bodyFatBand !== undefined && HIGHER_FAT_BANDS.includes(bodyFatBand)) {
      return { stance: 'cut', kcalGoal: 'fat_loss' };
    }
    return { stance: 'recomp', kcalGoal: 'general_health' };
  }
  if (first === 'fat_loss') return { stance: 'cut', kcalGoal: 'fat_loss' };
  if (first !== undefined && MUSCLE_GOALS.includes(first)) {
    return { stance: 'lean-gain', kcalGoal: first };
  }
  if (first === 'endurance') return { stance: 'endurance', kcalGoal: 'endurance' };
  return { stance: 'maintain', kcalGoal: 'general_health' };
}

/**
 * §6 red line, deterministic, not an AI judgment call: if the confirmed buckets imply BMI < 18.5
 * the engine refuses a cut — the stance quietly becomes MAINTAIN and the caller shows one calm
 * sentence suggesting a professional. Bucket midpoints feed this the same way they feed the
 * macro math.
 */
export function guardStanceForBmi(
  decision: StanceDecision,
  weightKg: number,
  heightCm: number,
): StanceDecision & { refusedCut: boolean } {
  const heightM = heightCm / 100;
  const bmi = heightM > 0 ? weightKg / (heightM * heightM) : NaN;
  if (decision.stance === 'cut' && Number.isFinite(bmi) && bmi < 18.5) {
    return { stance: 'maintain', kcalGoal: 'general_health', refusedCut: true };
  }
  return { ...decision, refusedCut: false };
}
