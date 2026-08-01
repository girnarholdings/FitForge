import { describe, it, expect } from 'vitest';
import {
  computeNutritionTargets,
  activityFactor,
  goalAdjustment,
  calorieFloor,
  clampKcalToFloors,
  mifflinStJeorBmr,
  proteinPerKg,
} from './macros.js';
import { personaFixtures } from '../fixtures/index.js';

describe('§7.2.4 nutrition targets — persona fixtures', () => {
  for (const p of personaFixtures) {
    it(`${p.key} (${p.label}) matches expected targets`, () => {
      const out = computeNutritionTargets(p.input);
      expect(out.kcal).toBe(p.expected.kcal);
      expect(out.protein_g).toBe(p.expected.protein_g);
      expect(out.carbs_g).toBe(p.expected.carbs_g);
      expect(out.fat_g).toBe(p.expected.fat_g);
      expect(out.method).toBe(p.expected.method);
    });
  }
});

describe('§7.2.4 building blocks', () => {
  it('activity factor buckets', () => {
    expect(activityFactor(1)).toBe(1.35);
    expect(activityFactor(2)).toBe(1.35);
    expect(activityFactor(3)).toBe(1.5);
    expect(activityFactor(4)).toBe(1.5);
    expect(activityFactor(5)).toBe(1.65);
    expect(activityFactor(6)).toBe(1.65);
  });

  it('goal adjustment multipliers', () => {
    expect(goalAdjustment('fat_loss')).toBeCloseTo(0.8);
    expect(goalAdjustment('strength')).toBeCloseTo(1.08);
    expect(goalAdjustment('hypertrophy')).toBeCloseTo(1.08);
    expect(goalAdjustment('endurance')).toBeCloseTo(1.05);
    expect(goalAdjustment('general_health')).toBe(1);
  });

  it('calorie floors by sex', () => {
    expect(calorieFloor('male')).toBe(1500);
    expect(calorieFloor('female')).toBe(1200);
    expect(calorieFloor('other')).toBe(1200);
    expect(calorieFloor(null)).toBe(1200);
  });

  it('applies the calorie floor for a small/low-activity female profile', () => {
    const out = computeNutritionTargets({
      sex: 'female',
      weight_kg: 45,
      height_cm: 150,
      age: 60,
      days_per_week: 1,
      primary_goal: 'fat_loss',
    });
    // BMR ~ 10*45+6.25*150-5*60-161 = 450+937.5-300-161 = 926.5; TDEE*1.35*0.8 ~ 1000 < floor
    expect(out.kcal).toBe(1200);
  });

  it('keto uses 1.6 g/kg protein and 65% fat', () => {
    const out = computeNutritionTargets({
      sex: 'male',
      weight_kg: 80,
      height_cm: 178,
      age: 45,
      days_per_week: 3,
      primary_goal: 'general_health',
      diet_type: 'keto',
    });
    expect(out.method).toContain('keto');
    // fat should be the dominant macro under keto
    expect(out.fat_g * 9).toBeGreaterThan(out.carbs_g * 4);
  });

  it('uses documented fallbacks when metrics are missing', () => {
    const out = computeNutritionTargets({ sex: null, primary_goal: 'general_health' });
    // deterministic, non-NaN, above floor
    expect(Number.isFinite(out.kcal)).toBe(true);
    expect(out.kcal).toBeGreaterThanOrEqual(1200);
  });
});

/**
 * RESEARCH-DIET §1 — the four AI-Mode diet changes. Recomp and the vegan uplift ride the NEW
 * optional `stance` input; endurance fat and the BMR floor apply to the shipped pipeline. The
 * persona-fixture suite above doubles as the old-caller compatibility guarantee: none of those
 * pinned outputs may move.
 */
describe('RESEARCH-DIET §1 — stance, vegan uplift, endurance fat, BMR floor', () => {
  const base = {
    sex: 'male' as const,
    weight_kg: 80,
    height_cm: 178,
    age: 30,
    days_per_week: 4,
  };

  it('recomp stance = maintenance kcal with protein doing the work (2.0 g/kg)', () => {
    const maintain = computeNutritionTargets({ ...base, primary_goal: 'general_health' });
    const recomp = computeNutritionTargets({
      ...base,
      primary_goal: 'general_health',
      stance: 'recomp',
    });
    expect(recomp.kcal).toBe(maintain.kcal); // ×1.00 — same maintenance calories
    expect(recomp.protein_g).toBe(160); // 2.0 g/kg × 80 kg
    expect(recomp.method).toContain('recomp');
  });

  it('stance overrides the goal when both are present', () => {
    const out = computeNutritionTargets({
      ...base,
      primary_goal: 'hypertrophy',
      stance: 'cut',
    });
    // ×0.8 from the stance, not ×1.08 from the goal
    expect(goalAdjustment('hypertrophy', 'cut')).toBeCloseTo(0.8);
    expect(out.method).toContain('− 20%');
    expect(out.method).toContain('cut');
  });

  it('vegan uplift: +0.2 g/kg on the stance path, capped at 2.2', () => {
    expect(proteinPerKg('general_health', 'vegan', 'maintain')).toBeCloseTo(1.8); // 1.6 + 0.2
    expect(proteinPerKg('fat_loss', 'vegan', 'cut')).toBeCloseTo(2.0); // 1.8 + 0.2
    expect(proteinPerKg('general_health', 'vegan', 'recomp')).toBeCloseTo(2.2); // 2.0 + 0.2, at cap
    const out = computeNutritionTargets({
      ...base,
      primary_goal: 'general_health',
      diet_type: 'vegan',
      stance: 'recomp',
    });
    expect(out.protein_g).toBe(175); // round5(2.2 × 80)
    expect(out.method).toContain('vegan');
  });

  it('vegan WITHOUT a stance keeps the shipped rows — old callers unchanged', () => {
    expect(proteinPerKg('general_health', 'vegan')).toBeCloseTo(1.6);
    expect(proteinPerKg('fat_loss', 'vegan')).toBeCloseTo(1.8);
    const out = computeNutritionTargets({
      ...base,
      primary_goal: 'general_health',
      diet_type: 'vegan',
    });
    expect(out.protein_g).toBe(130); // round5(1.6 × 80) — pre-AI-Mode behavior, byte-identical
    expect(out.method).not.toContain('vegan');
  });

  it('endurance runs on carbs: fat fraction 0.25, goal path and stance path alike', () => {
    const viaGoal = computeNutritionTargets({ ...base, primary_goal: 'endurance' });
    expect(viaGoal.fat_g).toBe(Math.round((viaGoal.kcal * 0.25) / 9 / 5) * 5);
    const viaStance = computeNutritionTargets({
      ...base,
      primary_goal: 'general_health',
      stance: 'endurance',
    });
    expect(viaStance.fat_g).toBe(Math.round((viaStance.kcal * 0.25) / 9 / 5) * 5);
    // and a non-endurance stance next to an endurance goal keeps the default 30% split
    const overridden = computeNutritionTargets({
      ...base,
      primary_goal: 'endurance',
      stance: 'maintain',
    });
    expect(overridden.fat_g).toBe(Math.round((overridden.kcal * 0.3) / 9 / 5) * 5);
  });

  it('kcal floor is max(BMR, sex floor) — the §6 red line, testable in isolation', () => {
    // The composed pipeline cannot reach sub-BMR today (activity ≥1.35 × deficit 0.8 = 1.08×BMR),
    // which is exactly why the clamp is asserted directly: it guards future multiplier changes.
    expect(clampKcalToFloors(1900, 'male', 2050)).toBe(2050); // BMR wins over the 1500 floor
    expect(clampKcalToFloors(1100, 'female', 1000)).toBe(1200); // sex floor wins over a low BMR
    expect(clampKcalToFloors(2500, 'male', 2050)).toBe(2500); // no clamp when already above both
  });

  it('every cut stays at or above the athlete BMR through the full pipeline', () => {
    for (const weight of [60, 82, 110, 140]) {
      const out = computeNutritionTargets({
        sex: 'male',
        weight_kg: weight,
        height_cm: 180,
        age: 55,
        days_per_week: 1,
        primary_goal: 'fat_loss',
      });
      const bmr = mifflinStJeorBmr('male', weight, 180, 55);
      expect(out.kcal).toBeGreaterThanOrEqual(Math.round(bmr / 50) * 50);
      expect(out.kcal).toBeGreaterThanOrEqual(calorieFloor('male'));
    }
  });
});
