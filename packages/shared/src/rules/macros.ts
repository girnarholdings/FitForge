/**
 * §7.2.4 — Nutrition targets (pure-TS mirror of the `suggest_nutrition_targets` RPC).
 *
 * SQL is authoritative; this mirror is verified against the same persona fixtures
 * (src/fixtures/personas.json) that the pgTAP suite (WS-6) uses.
 *
 * AI-MODE DIET ADDITIONS (RESEARCH-DIET §1, docs/AIMODE-CONTRACT.md — client-only for now, the
 * RPC has not learned them yet; anyone syncing the SQL should mirror all four):
 *   1. optional diet STANCE — recomp is a real stance (maintenance kcal ×1.00, protein 2.0 g/kg)
 *      that no existing GoalType can express; the stance enters through a NEW optional input so
 *      every existing call site keeps its exact behavior,
 *   2. vegan protein uplift +0.2 g/kg capped at 2.2 (lower DIAAS/leucine of plant proteins) —
 *      applied on the stance path only, so old callers passing diet_type 'vegan' are unchanged,
 *   3. endurance fat fraction 0.25 (carbs get the remainder toward ~5 g/kg),
 *   4. kcal floor is max(BMR, sex floor) — a target below the athlete's own BMR is a product
 *      red line (§6), whatever the arithmetic says.
 */
import type { SexType, GoalType, DietType } from '../types/database.js';

/** RESEARCH-DIET §1.1 — the one energy stance the diet engine plans against. */
export type DietStance = 'cut' | 'lean-gain' | 'recomp' | 'endurance' | 'maintain';

export interface MacroProfileInput {
  sex: SexType | null | undefined;
  /** latest body weight in kg; falls back to sex median (82 male / 70 female / 76 other) */
  weight_kg?: number | null;
  /** height in cm; falls back to sex median (175 male / 162 female / 168.5 other) */
  height_cm?: number | null;
  /** age in years; falls back to 30 */
  age?: number | null;
  days_per_week?: number | null;
  primary_goal: GoalType;
  diet_type?: DietType | null;
  /**
   * AI-Mode diet stance (RESEARCH-DIET §1.1). When present it decides the kcal adjustment and
   * protein row instead of `primary_goal`, and enables the vegan +0.2 g/kg uplift. Omitted by
   * all pre-AI-Mode callers, whose outputs stay byte-identical.
   */
  stance?: DietStance | null;
}

export interface MacroTargets {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  method: string;
}

const round50 = (n: number): number => Math.round(n / 50) * 50;
const round5 = (n: number): number => Math.round(n / 5) * 5;

function isMale(sex: SexType | null | undefined): boolean {
  return sex === 'male';
}
function isFemale(sex: SexType | null | undefined): boolean {
  return sex === 'female';
}

/** Step 1 fallbacks (§7.2.4). */
export function fallbackWeightKg(sex: SexType | null | undefined): number {
  if (isMale(sex)) return 82;
  if (isFemale(sex)) return 70;
  return 76;
}
export function fallbackHeightCm(sex: SexType | null | undefined): number {
  if (isMale(sex)) return 175;
  if (isFemale(sex)) return 162;
  return 168.5;
}

/** Mifflin-St Jeor BMR (§7.2.4 step 1). other/unspecified = mean of the male & female formulas. */
export function mifflinStJeorBmr(
  sex: SexType | null | undefined,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (isMale(sex)) return base + 5;
  if (isFemale(sex)) return base - 161;
  // mean of +5 and -161
  return base + (5 - 161) / 2;
}

/** Step 2 — activity factor from days/week. */
export function activityFactor(daysPerWeek: number): number {
  if (daysPerWeek <= 2) return 1.35;
  if (daysPerWeek <= 4) return 1.5;
  return 1.65;
}

/**
 * Step 3 — goal calorie adjustment multiplier. A provided stance overrides the goal: the stance
 * table (§1.1) reuses the shipped multipliers, plus recomp at maintenance ×1.00.
 */
export function goalAdjustment(goal: GoalType, stance?: DietStance | null): number {
  if (stance) {
    switch (stance) {
      case 'cut':
        return 0.8; // −20% — Garthe 2011's lean-mass-preserving band
      case 'lean-gain':
        return 1.08; // +8% — Iraki 2019's small-surplus recommendation
      case 'recomp':
      case 'maintain':
        return 1.0; // recomp: maintenance kcal, protein does the work (Barakat 2020)
      case 'endurance':
        return 1.05;
    }
  }
  switch (goal) {
    case 'fat_loss':
      return 0.8; // −20%
    case 'strength':
    case 'hypertrophy':
      return 1.08; // +8%
    case 'endurance':
      return 1.05; // +5%
    case 'general_health':
      return 1.0;
  }
}

/** Step 3 — calorie floor. */
export function calorieFloor(sex: SexType | null | undefined): number {
  return isMale(sex) ? 1500 : 1200;
}

/**
 * Step 3 — kcal never lands below the athlete's own BMR or the sex floor (§6 red line: sub-BMR
 * targets wreck adherence, and "eat less than your body burns at rest" is not advice we give).
 * Exported on its own because the composed pipeline (activity factor ≥ 1.35, deficit cap −20%)
 * can't reach sub-BMR on current inputs — the clamp is the guarantee, not the common path.
 */
export function clampKcalToFloors(
  kcal: number,
  sex: SexType | null | undefined,
  bmr: number,
): number {
  return Math.max(kcal, calorieFloor(sex), round50(bmr));
}

/**
 * Step 4 — protein g per kg bodyweight. keto forces 1.6 g/kg. A provided stance overrides the
 * goal row (recomp leans on protein — 2.0 g/kg, Longland 2016) and enables the vegan uplift:
 * +0.2 g/kg capped at 2.2 (plant-protein DIAAS/leucine correction, van Vliet 2015;
 * Hevia-Larraín 2021 — vegans match omnivores when total protein is high).
 */
export function proteinPerKg(
  goal: GoalType,
  diet: DietType | null | undefined,
  stance?: DietStance | null,
): number {
  if (diet === 'keto') return 1.6;
  let perKg: number;
  if (stance) {
    switch (stance) {
      case 'cut':
      case 'lean-gain':
        perKg = 1.8;
        break;
      case 'recomp':
        perKg = 2.0;
        break;
      case 'endurance':
        perKg = 1.4;
        break;
      case 'maintain':
        perKg = 1.6;
        break;
    }
    if (diet === 'vegan') perKg = Math.min(perKg + 0.2, 2.2);
    return perKg;
  }
  switch (goal) {
    case 'fat_loss':
    case 'strength':
    case 'hypertrophy':
      return 1.8;
    case 'endurance':
      return 1.4;
    case 'general_health':
      return 1.6;
  }
}

const GOAL_LABEL: Record<GoalType, string> = {
  strength: 'strength',
  hypertrophy: 'hypertrophy',
  fat_loss: 'fat loss',
  endurance: 'endurance',
  general_health: 'general health',
};

function adjustmentSuffix(goal: GoalType): string {
  switch (goal) {
    case 'fat_loss':
      return ' − 20%';
    case 'strength':
    case 'hypertrophy':
      return ' + 8%';
    case 'endurance':
      return ' + 5%';
    case 'general_health':
      return '';
  }
}

const STANCE_LABEL: Record<DietStance, string> = {
  cut: 'cut',
  'lean-gain': 'lean gain',
  recomp: 'recomp',
  endurance: 'endurance',
  maintain: 'maintain',
};

function stanceSuffix(stance: DietStance): string {
  switch (stance) {
    case 'cut':
      return ' − 20%';
    case 'lean-gain':
      return ' + 8%';
    case 'endurance':
      return ' + 5%';
    case 'recomp':
    case 'maintain':
      return '';
  }
}

/**
 * Deterministic macro target computation (§7.2.4). Mirrors `suggest_nutrition_targets`.
 */
export function computeNutritionTargets(input: MacroProfileInput): MacroTargets {
  const sex = input.sex ?? null;
  const weight = input.weight_kg ?? fallbackWeightKg(sex);
  const height = input.height_cm ?? fallbackHeightCm(sex);
  const age = input.age ?? 30;
  const days = input.days_per_week ?? 3;
  const goal = input.primary_goal;
  const diet = input.diet_type ?? null;
  const stance = input.stance ?? null;

  // 1. BMR
  const bmr = mifflinStJeorBmr(sex, weight, height, age);
  // 2. TDEE
  const factor = activityFactor(days);
  const tdee = bmr * factor;
  // 3. Goal adjustment + floors (sex floor AND the athlete's own BMR — §6) + round to nearest 50
  const adjusted = tdee * goalAdjustment(goal, stance);
  const clamped = clampKcalToFloors(adjusted, sex, bmr);
  const kcal = round50(clamped);
  // 4. Macros — endurance work runs on carbs, so its fat share drops to 25% (§1.5)
  const perKg = proteinPerKg(goal, diet, stance);
  const protein_g = round5(Math.min(perKg * weight, 220));
  const enduranceFat = stance ? stance === 'endurance' : goal === 'endurance';
  const fatFraction = diet === 'keto' ? 0.65 : enduranceFat ? 0.25 : 0.3;
  const fat_g = round5((kcal * fatFraction) / 9);
  const carbs_g = round5(Math.max(0, (kcal - 4 * protein_g - 9 * fat_g) / 4));
  // 5. Method
  const ketoNote = diet === 'keto' ? ', keto' : '';
  const veganNote = stance && diet === 'vegan' ? ', vegan +0.2 g/kg protein' : '';
  const method = stance
    ? `Mifflin-St Jeor × ${factor}${stanceSuffix(stance)} (${STANCE_LABEL[stance]})${ketoNote}${veganNote}`
    : `Mifflin-St Jeor × ${factor}${adjustmentSuffix(goal)} (${GOAL_LABEL[goal]})${ketoNote}`;

  return { kcal, protein_g, carbs_g, fat_g, method };
}
