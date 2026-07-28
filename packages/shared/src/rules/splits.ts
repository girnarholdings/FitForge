/**
 * §7.5 — Starter-routine split templates (pure-TS mirror; SQL `generate_starter_routine`
 * mirrors these exact templates).
 *
 * A split is an ordered list of ROLE SLOTS. Each slot names a primary movement pattern plus
 * optional `alt` patterns (acceptable substitutes when the primary has no feasible exercise) and
 * a `mechanics` hint / `note` used by the picker in §7.5 step 4.
 */
import type { MovementPattern, MechanicsType } from '../types/database.js';

export interface RoleSlot {
  pattern: MovementPattern;
  /** acceptable alternative patterns for this slot (the `|` options in §7.5 step 2) */
  alt?: MovementPattern[];
  /** mechanics preference for the slot, e.g. horizontal_push(iso) */
  mechanics?: MechanicsType;
  /** free-form hint, e.g. 'rear' for rear-delt shoulder isolation */
  note?: string;
}

export interface DayTemplate {
  key: string;
  focus: string;
  /**
   * Optional display name that overrides the generic "Day A — Focus" label. Named programs
   * (StrongLifts "Workout A · Squat · Bench · Row", 5/3/1 "Bench day", …) use this so the plan
   * reads the way the program is actually written. Purely cosmetic — the slots still drive
   * generation.
   */
  label?: string;
  slots: RoleSlot[];
}

/* ---------------------------------------------------------------- named day templates (§7.5 step 2) */

export const FULL_BODY_A: DayTemplate = {
  key: 'full_body_a',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'hinge' },
    { pattern: 'core_stability' },
  ],
};

export const FULL_BODY_B: DayTemplate = {
  key: 'full_body_b',
  focus: 'Full Body',
  slots: [
    { pattern: 'hinge' },
    { pattern: 'vertical_push' },
    { pattern: 'vertical_pull' },
    { pattern: 'lunge' },
    { pattern: 'core_flexion' },
  ],
};

export const FULL_BODY_C: DayTemplate = {
  key: 'full_body_c',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'hip_extension_iso' },
    { pattern: 'core_stability' },
  ],
};

export const UPPER: DayTemplate = {
  key: 'upper',
  focus: 'Upper',
  slots: [
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'vertical_push' },
    { pattern: 'vertical_pull' },
    { pattern: 'elbow_flexion' },
    { pattern: 'elbow_extension' },
  ],
};

export const LOWER: DayTemplate = {
  key: 'lower',
  focus: 'Lower',
  slots: [
    { pattern: 'squat' },
    { pattern: 'hinge' },
    { pattern: 'lunge' },
    { pattern: 'knee_flexion_iso', alt: ['hip_extension_iso'] },
    { pattern: 'calf_raise' },
    { pattern: 'core_stability', alt: ['core_flexion'] },
  ],
};

export const PUSH: DayTemplate = {
  key: 'push',
  focus: 'Push',
  slots: [
    { pattern: 'horizontal_push' },
    { pattern: 'vertical_push' },
    { pattern: 'horizontal_push', mechanics: 'isolation' },
    { pattern: 'elbow_extension' },
    { pattern: 'shoulder_isolation' },
  ],
};

export const PULL: DayTemplate = {
  key: 'pull',
  focus: 'Pull',
  slots: [
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_pull' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'elbow_flexion' },
    { pattern: 'carry', alt: ['core_stability', 'core_flexion'] },
  ],
};

export const LEGS: DayTemplate = {
  key: 'legs',
  focus: 'Legs',
  slots: [
    { pattern: 'squat' },
    { pattern: 'hinge' },
    { pattern: 'lunge' },
    { pattern: 'knee_extension_iso', alt: ['knee_flexion_iso'] },
    { pattern: 'calf_raise' },
    { pattern: 'core_stability', alt: ['core_flexion'] },
  ],
};

/** Optional rest/cardio day used as the 7th day when D = 7 (§7.2.5). */
export const REST_CARDIO: DayTemplate = {
  key: 'rest_cardio',
  focus: 'Rest / Cardio',
  slots: [{ pattern: 'cardio' }],
};

/* ---------------------------------------------------------------- day plan by days/week (§7.2.5) */

/**
 * Ordered day templates for D days/week (§7.2.5 split section):
 * 1–2 → Full Body A/B; 3 → Full Body A/B/C; 4 → Upper/Lower ×2;
 * 5 → Upper/Lower/Push/Pull/Legs; 6 → PPL ×2; 7 → PPL ×2 + Rest/Cardio.
 */
export function dayPlanForDays(daysPerWeek: number): DayTemplate[] {
  const d = Math.max(1, Math.min(7, Math.round(daysPerWeek)));
  switch (d) {
    case 1:
      return [FULL_BODY_A];
    case 2:
      return [FULL_BODY_A, FULL_BODY_B];
    case 3:
      return [FULL_BODY_A, FULL_BODY_B, FULL_BODY_C];
    case 4:
      return [UPPER, LOWER, UPPER, LOWER];
    case 5:
      return [UPPER, LOWER, PUSH, PULL, LEGS];
    case 6:
      return [PUSH, PULL, LEGS, PUSH, PULL, LEGS];
    default:
      return [PUSH, PULL, LEGS, PUSH, PULL, LEGS, REST_CARDIO];
  }
}

/**
 * §7.5 step 3 — session-length trim: 30 → first 4 slots, 45 → 5, 60 → 6, 75+ → all.
 * (The "+1 optional" for 75+ is realised by keeping all slots.)
 */
export function slotCountForSession(sessionMinutes: number): number {
  if (sessionMinutes <= 30) return 4;
  if (sessionMinutes <= 45) return 5;
  if (sessionMinutes <= 60) return 6;
  return Number.POSITIVE_INFINITY;
}

export function trimSlotsForSession(slots: RoleSlot[], sessionMinutes: number): RoleSlot[] {
  const n = slotCountForSession(sessionMinutes);
  return Number.isFinite(n) ? slots.slice(0, n) : slots;
}

/**
 * Build the full day plan for a profile: day templates for D, each trimmed to the session length,
 * with a display name ("Day A — Upper") and weekday pinned from `preferredDays` in order.
 */
export interface PlannedDay {
  day_index: number;
  name: string;
  focus: string;
  weekday: number | null;
  slots: RoleSlot[];
}

const DAY_LETTERS = 'ABCDEFG';

export function buildDayPlan(
  daysPerWeek: number,
  sessionMinutes: number,
  preferredDays: readonly number[] = [],
): PlannedDay[] {
  const templates = dayPlanForDays(daysPerWeek);
  return templates.map((tpl, i) => ({
    day_index: i,
    name: `Day ${DAY_LETTERS[i] ?? String(i + 1)} — ${tpl.focus}`,
    focus: tpl.focus,
    weekday: preferredDays[i] ?? null,
    slots: trimSlotsForSession(tpl.slots, sessionMinutes),
  }));
}

/* ================================================================================================
 * SPLIT LIBRARY (§7.5 extension) — named, real-world programs.
 *
 * Everything below is ADDITIVE: the exports above (day templates, `dayPlanForDays`,
 * `slotCountForSession`, `trimSlotsForSession`, `buildDayPlan`) keep their exact signatures and
 * behaviour, so a user who never chooses a split gets the identical days-per-week plan.
 *
 * Source: docs/RESEARCH-EXERCISES.md §3 "SPLIT LIBRARY TABLE". Each program's day-by-day structure
 * is expressed with the SAME role-slot vocabulary as the generic templates — no second engine.
 * `seed/data/splits.json` is generated verbatim from `SPLIT_LIBRARY` (see seed/generate-splits.mjs).
 * ============================================================================================= */

import type { GoalType, ExperienceLevel, TrainingLocation } from '../types/database.js';
import type { CatalogExercise } from './substitution.js';
import { likedSplitBonus } from './preferences.js';

/* ---------------------------------------------------------------- extra named day templates */

export const UPPER_B: DayTemplate = {
  key: 'upper_b',
  focus: 'Upper',
  slots: [
    { pattern: 'vertical_push' },
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'elbow_flexion' },
  ],
};

export const LOWER_B: DayTemplate = {
  key: 'lower_b',
  focus: 'Lower',
  slots: [
    { pattern: 'hinge' },
    { pattern: 'squat' },
    { pattern: 'lunge' },
    { pattern: 'hip_extension_iso', alt: ['knee_flexion_iso'] },
    { pattern: 'knee_extension_iso' },
    { pattern: 'calf_raise' },
  ],
};

export const UPPER_POWER: DayTemplate = {
  key: 'upper_power',
  focus: 'Upper Power',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull', mechanics: 'compound' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'vertical_pull', mechanics: 'compound' },
    { pattern: 'elbow_flexion' },
    { pattern: 'elbow_extension' },
  ],
};

export const LOWER_POWER: DayTemplate = {
  key: 'lower_power',
  focus: 'Lower Power',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'lunge' },
    { pattern: 'knee_flexion_iso', alt: ['hip_extension_iso'] },
    { pattern: 'calf_raise' },
    { pattern: 'core_stability' },
  ],
};

export const UPPER_HYPERTROPHY: DayTemplate = {
  key: 'upper_hypertrophy',
  focus: 'Upper Hypertrophy',
  slots: [
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'vertical_pull' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'elbow_flexion' },
    { pattern: 'elbow_extension' },
  ],
};

export const LOWER_HYPERTROPHY: DayTemplate = {
  key: 'lower_hypertrophy',
  focus: 'Lower Hypertrophy',
  slots: [
    { pattern: 'squat' },
    { pattern: 'lunge' },
    { pattern: 'knee_extension_iso' },
    { pattern: 'knee_flexion_iso', alt: ['hip_extension_iso'] },
    { pattern: 'calf_raise' },
    { pattern: 'core_flexion' },
  ],
};

export const BACK_SHOULDERS_HYPERTROPHY: DayTemplate = {
  key: 'back_shoulders_hypertrophy',
  focus: 'Back & Shoulders',
  slots: [
    { pattern: 'horizontal_pull' },
    { pattern: 'vertical_pull' },
    { pattern: 'vertical_push' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'carry', alt: ['core_stability'] },
  ],
};

export const CHEST_ARMS_HYPERTROPHY: DayTemplate = {
  key: 'chest_arms_hypertrophy',
  focus: 'Chest & Arms',
  slots: [
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_push', mechanics: 'isolation' },
    { pattern: 'elbow_extension' },
    { pattern: 'elbow_flexion' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'core_flexion' },
  ],
};

export const LEGS_HYPERTROPHY: DayTemplate = {
  key: 'legs_hypertrophy',
  focus: 'Legs Hypertrophy',
  slots: [
    { pattern: 'squat' },
    { pattern: 'lunge' },
    { pattern: 'knee_extension_iso' },
    { pattern: 'knee_flexion_iso', alt: ['hip_extension_iso'] },
    { pattern: 'calf_raise' },
    { pattern: 'core_stability' },
  ],
};

export const CHEST_DAY: DayTemplate = {
  key: 'chest_day',
  focus: 'Chest',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_push', mechanics: 'isolation' },
    { pattern: 'vertical_push' },
    { pattern: 'elbow_extension' },
    { pattern: 'core_stability' },
  ],
};

export const BACK_DAY: DayTemplate = {
  key: 'back_day',
  focus: 'Back',
  slots: [
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_pull' },
    { pattern: 'horizontal_pull', mechanics: 'isolation' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'elbow_flexion' },
    { pattern: 'core_stability' },
  ],
};

export const SHOULDERS_DAY: DayTemplate = {
  key: 'shoulders_day',
  focus: 'Shoulders',
  slots: [
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'vertical_push' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'carry', alt: ['core_stability'] },
    { pattern: 'core_flexion' },
  ],
};

export const ARMS_DAY: DayTemplate = {
  key: 'arms_day',
  focus: 'Arms',
  slots: [
    { pattern: 'elbow_flexion' },
    { pattern: 'elbow_extension' },
    { pattern: 'elbow_flexion' },
    { pattern: 'elbow_extension' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'core_flexion' },
  ],
};

export const CHEST_BACK: DayTemplate = {
  key: 'chest_back',
  focus: 'Chest & Back',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull', mechanics: 'compound' },
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_push', mechanics: 'isolation' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'core_stability' },
  ],
};

export const SHOULDERS_ARMS: DayTemplate = {
  key: 'shoulders_arms',
  focus: 'Shoulders & Arms',
  slots: [
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'elbow_flexion' },
    { pattern: 'elbow_extension' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'core_flexion' },
  ],
};

export const PUSH_LOWER: DayTemplate = {
  key: 'push_lower',
  focus: 'Push',
  slots: [
    { pattern: 'horizontal_push' },
    { pattern: 'vertical_push' },
    { pattern: 'squat' },
    { pattern: 'elbow_extension' },
    { pattern: 'calf_raise' },
    { pattern: 'core_stability' },
  ],
};

export const PULL_LOWER: DayTemplate = {
  key: 'pull_lower',
  focus: 'Pull',
  slots: [
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_pull' },
    { pattern: 'hinge' },
    { pattern: 'elbow_flexion' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'core_flexion' },
  ],
};

/* --- linear-progression barbell programs ------------------------------------------------- */

export const STRONGLIFTS_A: DayTemplate = {
  key: 'stronglifts_a',
  label: 'Workout A · Squat · Bench · Row',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull', mechanics: 'compound' },
    { pattern: 'core_stability' },
  ],
};

export const STRONGLIFTS_B: DayTemplate = {
  key: 'stronglifts_b',
  label: 'Workout B · Squat · Press · Deadlift',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'core_stability' },
  ],
};

export const STARTING_STRENGTH_A: DayTemplate = {
  key: 'starting_strength_a',
  label: 'Workout A · Squat · Press · Deadlift',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
  ],
};

export const STARTING_STRENGTH_B: DayTemplate = {
  key: 'starting_strength_b',
  label: 'Workout B · Squat · Bench · Deadlift',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
  ],
};

export const GREYSKULL_A: DayTemplate = {
  key: 'greyskull_a',
  label: 'Workout A · Bench · Squat · Row',
  focus: 'Full Body',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_pull' },
    { pattern: 'elbow_flexion' },
    { pattern: 'core_stability' },
  ],
};

export const GREYSKULL_B: DayTemplate = {
  key: 'greyskull_b',
  label: 'Workout B · Press · Deadlift · Chin',
  focus: 'Full Body',
  slots: [
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'vertical_pull' },
    { pattern: 'elbow_extension' },
    { pattern: 'core_flexion' },
  ],
};

export const BEGINNER_ROUTINE_A: DayTemplate = {
  key: 'beginner_routine_a',
  label: 'Workout A · Row · Bench · Squat',
  focus: 'Full Body',
  slots: [
    { pattern: 'horizontal_pull', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'core_stability' },
  ],
};

export const BEGINNER_ROUTINE_B: DayTemplate = {
  key: 'beginner_routine_b',
  label: 'Workout B · Chin-up · Press · Deadlift',
  focus: 'Full Body',
  slots: [
    { pattern: 'vertical_pull', mechanics: 'compound' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'core_flexion' },
  ],
};

/* --- percentage / tiered programs --------------------------------------------------------- */

export const WENDLER_PRESS: DayTemplate = {
  key: 'wendler_press',
  label: 'Press day · 5/3/1 + 5×10',
  focus: 'Press',
  slots: [
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'vertical_push' },
    { pattern: 'vertical_pull' },
    { pattern: 'elbow_flexion' },
    { pattern: 'core_stability' },
  ],
};

export const WENDLER_DEADLIFT: DayTemplate = {
  key: 'wendler_deadlift',
  label: 'Deadlift day · 5/3/1 + 5×10',
  focus: 'Deadlift',
  slots: [
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'hinge' },
    { pattern: 'lunge' },
    { pattern: 'core_flexion' },
    { pattern: 'calf_raise' },
  ],
};

export const WENDLER_BENCH: DayTemplate = {
  key: 'wendler_bench',
  label: 'Bench day · 5/3/1 + 5×10',
  focus: 'Bench',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'elbow_extension' },
    { pattern: 'core_stability' },
  ],
};

export const WENDLER_SQUAT: DayTemplate = {
  key: 'wendler_squat',
  label: 'Squat day · 5/3/1 + 5×10',
  focus: 'Squat',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'squat' },
    { pattern: 'knee_flexion_iso', alt: ['hip_extension_iso'] },
    { pattern: 'calf_raise' },
    { pattern: 'core_stability' },
  ],
};

export const GZCLP_D1: DayTemplate = {
  key: 'gzclp_d1',
  label: 'Day 1 · Squat T1 · Bench T2',
  focus: 'Squat / Bench',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'vertical_pull' },
    { pattern: 'core_stability' },
  ],
};

export const GZCLP_D2: DayTemplate = {
  key: 'gzclp_d2',
  label: 'Day 2 · OHP T1 · Deadlift T2',
  focus: 'Press / Deadlift',
  slots: [
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'horizontal_pull' },
    { pattern: 'core_flexion' },
  ],
};

export const GZCLP_D3: DayTemplate = {
  key: 'gzclp_d3',
  label: 'Day 3 · Bench T1 · Squat T2',
  focus: 'Bench / Squat',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'vertical_pull' },
    { pattern: 'elbow_extension' },
  ],
};

export const GZCLP_D4: DayTemplate = {
  key: 'gzclp_d4',
  label: 'Day 4 · Deadlift T1 · OHP T2',
  focus: 'Deadlift / Press',
  slots: [
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull' },
    { pattern: 'elbow_flexion' },
  ],
};

export const NSUNS_BENCH_OHP: DayTemplate = {
  key: 'nsuns_bench_ohp',
  label: 'Bench T1 · OHP T2',
  focus: 'Bench / Press',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull' },
    { pattern: 'elbow_extension' },
    { pattern: 'shoulder_isolation' },
  ],
};

export const NSUNS_SQUAT_SUMO: DayTemplate = {
  key: 'nsuns_squat_sumo',
  label: 'Squat T1 · Sumo Deadlift T2',
  focus: 'Squat / Deadlift',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'knee_flexion_iso', alt: ['hip_extension_iso'] },
    { pattern: 'calf_raise' },
    { pattern: 'core_stability' },
  ],
};

export const NSUNS_OHP_INCLINE: DayTemplate = {
  key: 'nsuns_ohp_incline',
  label: 'OHP T1 · Incline Bench T2',
  focus: 'Press / Incline',
  slots: [
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'elbow_extension' },
    { pattern: 'core_stability' },
  ],
};

export const NSUNS_DEADLIFT_FRONT: DayTemplate = {
  key: 'nsuns_deadlift_front',
  label: 'Deadlift T1 · Front Squat T2',
  focus: 'Deadlift / Front Squat',
  slots: [
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'lunge' },
    { pattern: 'core_flexion' },
    { pattern: 'calf_raise' },
  ],
};

export const NSUNS_BENCH_CGBP: DayTemplate = {
  key: 'nsuns_bench_cgbp',
  label: 'Bench T1 · Close-Grip T2',
  focus: 'Bench / Arms',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'elbow_extension' },
    { pattern: 'vertical_pull' },
    { pattern: 'elbow_flexion' },
    { pattern: 'shoulder_isolation', note: 'rear' },
  ],
};

export const TEXAS_VOLUME: DayTemplate = {
  key: 'texas_volume',
  label: 'Volume day · 5×5 @ 90%',
  focus: 'Volume',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'core_stability' },
  ],
};

export const TEXAS_RECOVERY: DayTemplate = {
  key: 'texas_recovery',
  label: 'Recovery day · light',
  focus: 'Recovery',
  slots: [
    { pattern: 'squat' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'vertical_pull' },
    { pattern: 'core_flexion' },
  ],
};

export const TEXAS_INTENSITY: DayTemplate = {
  key: 'texas_intensity',
  label: 'Intensity day · new 5RM',
  focus: 'Intensity',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull' },
    { pattern: 'elbow_flexion' },
  ],
};

export const MADCOW_HEAVY: DayTemplate = {
  key: 'madcow_heavy',
  label: 'Heavy day · ramped 5×5',
  focus: 'Heavy',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull', mechanics: 'compound' },
    { pattern: 'core_stability' },
  ],
};

export const MADCOW_LIGHT: DayTemplate = {
  key: 'madcow_light',
  label: 'Light day · 4×5',
  focus: 'Light',
  slots: [
    { pattern: 'squat' },
    { pattern: 'vertical_push', mechanics: 'compound' },
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'core_flexion' },
  ],
};

export const MADCOW_PR: DayTemplate = {
  key: 'madcow_pr',
  label: 'PR day · ramp to 1×5',
  focus: 'PR',
  slots: [
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull', mechanics: 'compound' },
    { pattern: 'elbow_flexion' },
  ],
};

/* --- equipment-constrained + specialty templates ------------------------------------------ */

export const DB_FULL_A: DayTemplate = {
  key: 'db_full_a',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'hinge' },
    { pattern: 'shoulder_isolation' },
    { pattern: 'core_stability' },
  ],
};

export const DB_FULL_B: DayTemplate = {
  key: 'db_full_b',
  focus: 'Full Body',
  slots: [
    { pattern: 'lunge' },
    { pattern: 'vertical_push' },
    { pattern: 'vertical_pull', alt: ['horizontal_pull'] },
    { pattern: 'hip_extension_iso' },
    { pattern: 'elbow_flexion' },
    { pattern: 'core_flexion' },
  ],
};

export const DB_FULL_C: DayTemplate = {
  key: 'db_full_c',
  focus: 'Full Body',
  slots: [
    { pattern: 'squat' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'calf_raise' },
    { pattern: 'elbow_extension' },
    { pattern: 'core_stability' },
  ],
};

export const BW_FULL_A: DayTemplate = {
  key: 'bw_full_a',
  label: 'RR Workout A',
  focus: 'Full Body',
  slots: [
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_push' },
    { pattern: 'squat' },
    { pattern: 'hinge', alt: ['hip_extension_iso'] },
    { pattern: 'core_stability' },
  ],
};

export const BW_FULL_B: DayTemplate = {
  key: 'bw_full_b',
  label: 'RR Workout B',
  focus: 'Full Body',
  slots: [
    { pattern: 'horizontal_pull', alt: ['vertical_pull'] },
    { pattern: 'vertical_push', alt: ['horizontal_push'] },
    { pattern: 'lunge' },
    { pattern: 'hip_extension_iso' },
    { pattern: 'core_flexion' },
  ],
};

export const BW_FULL_C: DayTemplate = {
  key: 'bw_full_c',
  label: 'RR Workout C',
  focus: 'Full Body',
  slots: [
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_push' },
    { pattern: 'lunge', alt: ['squat'] },
    { pattern: 'hinge', alt: ['hip_extension_iso'] },
    { pattern: 'core_stability' },
  ],
};

export const KB_SWING_GETUP: DayTemplate = {
  key: 'kb_swing_getup',
  label: 'Simple · Swings + Get-ups',
  focus: 'Ballistics',
  slots: [
    { pattern: 'hinge' },
    { pattern: 'core_stability' },
    { pattern: 'carry', alt: ['core_stability'] },
  ],
};

export const KB_PRESS_SQUAT: DayTemplate = {
  key: 'kb_press_squat',
  label: 'Press + Front Squat',
  focus: 'Grind',
  slots: [
    { pattern: 'vertical_push' },
    { pattern: 'squat' },
    { pattern: 'horizontal_pull', alt: ['vertical_pull'] },
    { pattern: 'core_stability' },
  ],
};

export const KB_COMPLEX: DayTemplate = {
  key: 'kb_complex',
  label: 'Complex + Conditioning',
  focus: 'Conditioning',
  slots: [
    { pattern: 'hinge' },
    { pattern: 'lunge' },
    { pattern: 'vertical_push' },
    { pattern: 'carry', alt: ['core_stability'] },
    { pattern: 'cardio' },
  ],
};

export const ATHLETIC_POWER_A: DayTemplate = {
  key: 'athletic_power_a',
  label: 'Power day · lower emphasis',
  focus: 'Power',
  slots: [
    { pattern: 'hinge', mechanics: 'compound' },
    { pattern: 'squat', mechanics: 'compound' },
    { pattern: 'vertical_push' },
    { pattern: 'carry', alt: ['core_stability'] },
    { pattern: 'core_stability' },
  ],
};

export const ATHLETIC_POWER_B: DayTemplate = {
  key: 'athletic_power_b',
  label: 'Power day · upper emphasis',
  focus: 'Power',
  slots: [
    { pattern: 'horizontal_push', mechanics: 'compound' },
    { pattern: 'horizontal_pull', mechanics: 'compound' },
    { pattern: 'lunge' },
    { pattern: 'vertical_pull' },
    { pattern: 'core_flexion' },
  ],
};

export const CONDITIONING_DAY: DayTemplate = {
  key: 'conditioning_day',
  label: 'Engine day · intervals + carries',
  focus: 'Conditioning',
  slots: [
    { pattern: 'cardio' },
    { pattern: 'carry', alt: ['core_stability'] },
    { pattern: 'core_stability' },
  ],
};

export const GLUTE_FULL_A: DayTemplate = {
  key: 'glute_full_a',
  label: 'Glute day A · thrust anchor',
  focus: 'Glutes & Upper',
  slots: [
    { pattern: 'hip_extension_iso' },
    { pattern: 'squat' },
    { pattern: 'horizontal_push' },
    { pattern: 'horizontal_pull' },
    { pattern: 'core_stability' },
  ],
};

export const GLUTE_FULL_B: DayTemplate = {
  key: 'glute_full_b',
  label: 'Glute day B · hinge anchor',
  focus: 'Glutes & Hamstrings',
  slots: [
    { pattern: 'hip_extension_iso' },
    { pattern: 'hinge' },
    { pattern: 'lunge' },
    { pattern: 'vertical_pull' },
    { pattern: 'core_flexion' },
  ],
};

export const GLUTE_FULL_C: DayTemplate = {
  key: 'glute_full_c',
  label: 'Glute day C · quad accent',
  focus: 'Glutes & Quads',
  slots: [
    { pattern: 'hip_extension_iso' },
    { pattern: 'lunge' },
    { pattern: 'knee_extension_iso', alt: ['squat'] },
    { pattern: 'vertical_push' },
    { pattern: 'calf_raise' },
  ],
};

export const GLUTE_UPPER: DayTemplate = {
  key: 'glute_upper',
  label: 'Upper day · posture accent',
  focus: 'Upper',
  slots: [
    { pattern: 'horizontal_pull' },
    { pattern: 'vertical_pull' },
    { pattern: 'horizontal_push' },
    { pattern: 'shoulder_isolation', note: 'rear' },
    { pattern: 'elbow_flexion' },
    { pattern: 'core_stability' },
  ],
};

/* ---------------------------------------------------------------- split library types */

/** Broad equipment demand of a program — drives the "will this work where I train?" filter. */
export type SplitEquipmentProfile =
  | 'full_gym'
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'bodyweight'
  | 'minimal';

export interface SplitDefinition {
  /** stable id used in the onboarding draft (`split_slug`) and the routine name */
  slug: string;
  name: string;
  /** one-liner shown on the split card */
  description: string;
  /** the canonical training frequency; `days_options` lists supported variants */
  days_per_week: number;
  days_options: number[];
  /** experience levels this program is appropriate for */
  levels: ExperienceLevel[];
  /** goals this program fits */
  goals: GoalType[];
  /** broad equipment demand */
  equipment_profile: SplitEquipmentProfile;
  /** equipment slugs (seed/data/equipment.json) the program really needs */
  required_equipment: string[];
  /** how load/reps advance — one line, shown on the detail row */
  progression: string;
  /** free-form search/filter tags */
  tags: string[];
  /** ordered day templates; `days.length === days_per_week` */
  days: DayTemplate[];
}

/* ---------------------------------------------------------------- the library (25 programs) */

/**
 * The named-program library (docs/RESEARCH-EXERCISES.md §3). Ordered roughly beginner → advanced
 * → specialty so "Browse all" reads sensibly with no sort applied.
 */
export const SPLIT_LIBRARY: readonly SplitDefinition[] = [
  {
    slug: 'full-body-3',
    name: 'Full Body 3-Day',
    description: 'Every session hits squat, hinge, push and pull — the highest-frequency start.',
    days_per_week: 3,
    days_options: [3],
    levels: ['beginner', 'intermediate'],
    goals: ['strength', 'hypertrophy', 'general_health', 'fat_loss'],
    equipment_profile: 'minimal',
    required_equipment: [],
    progression: 'Add a small load each session while all reps stay crisp.',
    tags: ['full body', 'beginner', 'classic', 'high frequency'],
    days: [FULL_BODY_A, FULL_BODY_B, FULL_BODY_C],
  },
  {
    slug: 'full-body-2',
    name: 'Full Body 2-Day (Minimalist)',
    description: 'Two hard full-body sessions a week — enough to build, easy to actually keep.',
    days_per_week: 2,
    days_options: [2],
    levels: ['beginner', 'intermediate'],
    goals: ['general_health', 'strength', 'hypertrophy'],
    equipment_profile: 'minimal',
    required_equipment: [],
    progression: 'Add reps until the top of the range, then add load and reset reps.',
    tags: ['full body', 'minimalist', 'busy', 'maintenance'],
    days: [FULL_BODY_A, FULL_BODY_B],
  },
  {
    slug: 'stronglifts-5x5',
    name: 'StrongLifts 5×5',
    description: 'Two alternating barbell workouts, five sets of five, add weight every session.',
    days_per_week: 3,
    days_options: [3],
    levels: ['beginner'],
    goals: ['strength'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'Linear: +2.5 kg per session, deload 10% after three stalls.',
    tags: ['barbell', 'linear progression', '5x5', 'strength'],
    days: [STRONGLIFTS_A, STRONGLIFTS_B, STRONGLIFTS_A],
  },
  {
    slug: 'starting-strength',
    name: 'Starting Strength',
    description: "Rippetoe's barbell novice LP — squat every session, three lifts, 3×5.",
    days_per_week: 3,
    days_options: [3],
    levels: ['beginner'],
    goals: ['strength'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'Linear: add weight every workout; squat 3×5, deadlift 1×5.',
    tags: ['barbell', 'linear progression', 'novice', 'strength'],
    days: [STARTING_STRENGTH_A, STARTING_STRENGTH_B, STARTING_STRENGTH_A],
  },
  {
    slug: 'greyskull-lp',
    name: 'GreySkull LP',
    description: 'Novice LP with an AMRAP last set and more upper-body volume than the classics.',
    days_per_week: 3,
    days_options: [3],
    levels: ['beginner'],
    goals: ['strength', 'hypertrophy'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'Last set AMRAP: 5+ reps → add load; miss twice → reset 10%.',
    tags: ['barbell', 'linear progression', 'amrap', 'autoregulated'],
    days: [GREYSKULL_A, GREYSKULL_B, GREYSKULL_A],
  },
  {
    slug: 'basic-beginner-routine',
    name: 'r/Fitness Basic Beginner',
    description: "Reddit's default starter: two alternating full-body days, 3×5 plus an AMRAP.",
    days_per_week: 3,
    days_options: [3],
    levels: ['beginner'],
    goals: ['strength', 'general_health'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'flat-bench'],
    progression: 'Add load whenever the AMRAP set clears the target reps.',
    tags: ['barbell', 'beginner', 'reddit', 'linear progression'],
    days: [BEGINNER_ROUTINE_A, BEGINNER_ROUTINE_B, BEGINNER_ROUTINE_A],
  },
  {
    slug: 'upper-lower-4',
    name: 'Upper / Lower 4-Day',
    description: 'The intermediate workhorse: every muscle twice a week, easy to balance.',
    days_per_week: 4,
    days_options: [4],
    levels: ['intermediate', 'advanced'],
    goals: ['strength', 'hypertrophy', 'general_health'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Double progression: add reps to the top of the range, then load.',
    tags: ['upper lower', 'intermediate', 'balanced', '2x frequency'],
    days: [UPPER, LOWER, UPPER_B, LOWER_B],
  },
  {
    slug: 'phul',
    name: 'PHUL — Power Hypertrophy Upper Lower',
    description: 'Two heavy power days plus two volume days — strength and size in one week.',
    days_per_week: 4,
    days_options: [4],
    levels: ['intermediate', 'advanced'],
    goals: ['strength', 'hypertrophy'],
    equipment_profile: 'full_gym',
    required_equipment: ['barbell', 'weight-plates', 'flat-bench'],
    progression: 'Power days 3–5 reps and add load weekly; hypertrophy days 8–12 reps.',
    tags: ['powerbuilding', 'upper lower', 'phul', 'intermediate'],
    days: [UPPER_POWER, LOWER_POWER, UPPER_HYPERTROPHY, LOWER_HYPERTROPHY],
  },
  {
    slug: 'ppl-3',
    name: 'Push / Pull / Legs 3-Day',
    description: 'One push, one pull, one leg day — the gentlest way into body-part training.',
    days_per_week: 3,
    days_options: [3],
    levels: ['beginner', 'intermediate'],
    goals: ['hypertrophy', 'general_health'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Double progression per exercise; one hard set added every few weeks.',
    tags: ['ppl', 'push pull legs', 'hypertrophy'],
    days: [PUSH, PULL, LEGS],
  },
  {
    slug: 'ppl-5',
    name: 'Push / Pull / Legs 5-Day Rotation',
    description: 'PPL on a rolling five-day week — high frequency without a six-day commitment.',
    days_per_week: 5,
    days_options: [5],
    levels: ['intermediate', 'advanced'],
    goals: ['hypertrophy', 'strength'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Rotate the cycle forward each week; add load when all sets hit the top rep.',
    tags: ['ppl', 'rotation', 'hypertrophy', 'high frequency'],
    days: [PUSH, PULL, LEGS, PUSH, PULL],
  },
  {
    slug: 'reddit-ppl-6',
    name: 'Reddit PPL (Metallicadpa) 6-Day',
    description: 'Push/pull/legs twice over, each day anchored by a heavy barbell lift.',
    days_per_week: 6,
    days_options: [6],
    levels: ['beginner', 'intermediate'],
    goals: ['hypertrophy', 'strength'],
    equipment_profile: 'full_gym',
    required_equipment: ['barbell', 'weight-plates', 'flat-bench', 'squat-rack'],
    progression: 'Anchor lift 5×5 into an AMRAP; +2.5 kg when the AMRAP clears.',
    tags: ['ppl', 'reddit', 'high volume', 'six day'],
    days: [PUSH, PULL, LEGS, PUSH, PULL, LEGS],
  },
  {
    slug: 'phat',
    name: 'PHAT — Power Hypertrophy Adaptive Training',
    description: "Layne Norton's powerbuilding week: two power days plus three volume days.",
    days_per_week: 5,
    days_options: [5],
    levels: ['intermediate', 'advanced'],
    goals: ['strength', 'hypertrophy'],
    equipment_profile: 'full_gym',
    required_equipment: ['barbell', 'weight-plates', 'flat-bench', 'squat-rack'],
    progression: 'Power days 3–5 reps; hypertrophy days start with speed work then 8–15 reps.',
    tags: ['powerbuilding', 'phat', 'advanced', 'high volume'],
    days: [
      UPPER_POWER,
      LOWER_POWER,
      BACK_SHOULDERS_HYPERTROPHY,
      CHEST_ARMS_HYPERTROPHY,
      LEGS_HYPERTROPHY,
    ],
  },
  {
    slug: 'bro-split-5',
    name: 'Bro Split (5-Day Body Part)',
    description: 'One muscle per day, big per-session volume — chest, back, shoulders, arms, legs.',
    days_per_week: 5,
    days_options: [5],
    levels: ['intermediate', 'advanced'],
    goals: ['hypertrophy'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Add a set or reps weekly; each muscle gets one very thorough session.',
    tags: ['bro split', 'body part', 'hypertrophy', 'bodybuilding'],
    days: [CHEST_DAY, BACK_DAY, SHOULDERS_DAY, ARMS_DAY, LEGS],
  },
  {
    slug: 'arnold-split-6',
    name: 'Arnold Split',
    description: 'Golden-era antagonist pairings twice a week — chest/back, shoulders/arms, legs.',
    days_per_week: 6,
    days_options: [6],
    levels: ['advanced'],
    goals: ['hypertrophy'],
    equipment_profile: 'full_gym',
    required_equipment: ['barbell', 'dumbbell', 'flat-bench'],
    progression: 'Very high volume; superset the antagonist pairs and progress reps first.',
    tags: ['arnold', 'bodybuilding', 'high volume', 'six day'],
    days: [CHEST_BACK, SHOULDERS_ARMS, LEGS, CHEST_BACK, SHOULDERS_ARMS, LEGS],
  },
  {
    slug: 'nsuns-531-lp',
    name: 'nSuns 5/3/1 LP',
    description: 'A nine-set T1 wave plus a secondary lift each day — 5/3/1 with weekly jumps.',
    days_per_week: 5,
    days_options: [4, 5, 6],
    levels: ['intermediate', 'advanced'],
    goals: ['strength'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'Weekly: the 1+ AMRAP set decides the next training-max bump.',
    tags: ['nsuns', '531', 'barbell', 'high volume', 'strength'],
    days: [
      NSUNS_BENCH_OHP,
      NSUNS_SQUAT_SUMO,
      NSUNS_OHP_INCLINE,
      NSUNS_DEADLIFT_FRONT,
      NSUNS_BENCH_CGBP,
    ],
  },
  {
    slug: 'wendler-531-bbb',
    name: '5/3/1 Boring But Big',
    description: "Wendler's slow cooker: one main lift per day at 5/3/1, then 5×10 supplemental.",
    days_per_week: 4,
    days_options: [4],
    levels: ['intermediate', 'advanced'],
    goals: ['strength', 'hypertrophy'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'Monthly cycles off a training max; +2.5 kg upper / +5 kg lower per cycle.',
    tags: ['531', 'wendler', 'bbb', 'percentage based'],
    days: [WENDLER_PRESS, WENDLER_DEADLIFT, WENDLER_BENCH, WENDLER_SQUAT],
  },
  {
    slug: 'gzclp',
    name: 'GZCLP',
    description: 'Tiered T1/T2/T3 days that handle their own stalls — LP that refuses to die.',
    days_per_week: 4,
    days_options: [3, 4],
    levels: ['beginner', 'intermediate'],
    goals: ['strength', 'hypertrophy'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'T1 5×3+ → 6×2+ → 10×1+ stage drops; T2 3×10 → 3×8 → 3×6; T3 3×15+.',
    tags: ['gzcl', 'gzclp', 'tiered', 'barbell', 'strength'],
    days: [GZCLP_D1, GZCLP_D2, GZCLP_D3, GZCLP_D4],
  },
  {
    slug: 'texas-method',
    name: 'Texas Method',
    description: 'Volume Monday, light Wednesday, a new 5RM Friday — weekly, not daily, progress.',
    days_per_week: 3,
    days_options: [3],
    levels: ['intermediate'],
    goals: ['strength'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'Weekly: 5×5 @ 90% volume day feeds a new 5RM on intensity day.',
    tags: ['texas method', 'intermediate', 'weekly progression', 'barbell'],
    days: [TEXAS_VOLUME, TEXAS_RECOVERY, TEXAS_INTENSITY],
  },
  {
    slug: 'madcow-5x5',
    name: 'Madcow 5×5',
    description: 'The intermediate 5×5: ramped sets, heavy/light/PR week, +2.5% every Friday.',
    days_per_week: 3,
    days_options: [3],
    levels: ['intermediate'],
    goals: ['strength'],
    equipment_profile: 'barbell',
    required_equipment: ['barbell', 'weight-plates', 'squat-rack', 'flat-bench'],
    progression: 'Weekly +2.5% on the PR-day top set; ramp the working sets underneath.',
    tags: ['madcow', '5x5', 'ramped', 'weekly progression'],
    days: [MADCOW_HEAVY, MADCOW_LIGHT, MADCOW_PR],
  },
  {
    slug: 'upper-lower-ppl-hybrid',
    name: 'Upper / Lower + PPL Hybrid',
    description: 'Upper, lower, then push/pull/legs — the best-of-both five-day week.',
    days_per_week: 5,
    days_options: [5],
    levels: ['intermediate', 'advanced'],
    goals: ['hypertrophy', 'strength'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Heavier compounds on the upper/lower days, higher reps on the PPL days.',
    tags: ['hybrid', 'upper lower', 'ppl', 'five day'],
    days: [UPPER, LOWER, PUSH, PULL, LEGS],
  },
  {
    slug: 'push-pull-4',
    name: 'Push / Pull 4-Day',
    description: 'Two push days, two pull days, legs folded in — simple, symmetrical, sturdy.',
    days_per_week: 4,
    days_options: [4],
    levels: ['beginner', 'intermediate'],
    goals: ['hypertrophy', 'strength', 'general_health'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Double progression; alternate a heavy and a lighter week per movement.',
    tags: ['push pull', 'four day', 'balanced'],
    days: [PUSH_LOWER, PULL_LOWER, PUSH_LOWER, PULL_LOWER],
  },
  {
    slug: 'dumbbell-home-3',
    name: 'Dumbbell-Only Home 3-Day',
    description: 'Every pattern covered with one pair of dumbbells and a bench — no barbell needed.',
    days_per_week: 3,
    days_options: [3, 4],
    levels: ['beginner', 'intermediate'],
    goals: ['hypertrophy', 'fat_loss', 'general_health'],
    equipment_profile: 'dumbbell',
    required_equipment: ['dumbbell'],
    progression: 'Reps first (8 → 15), then the next dumbbell up; slow tempo when load caps out.',
    tags: ['home', 'dumbbell', 'no barbell', 'apartment friendly'],
    days: [DB_FULL_A, DB_FULL_B, DB_FULL_C],
  },
  {
    slug: 'bodyweight-rr-3',
    name: 'Bodyweight Recommended Routine',
    description: 'Calisthenics progressions three times a week — leverage replaces load.',
    days_per_week: 3,
    days_options: [3],
    levels: ['beginner', 'intermediate'],
    goals: ['strength', 'hypertrophy', 'general_health'],
    equipment_profile: 'bodyweight',
    required_equipment: [],
    progression: 'Move to the next progression once you own 3×8 with clean form.',
    tags: ['bodyweight', 'calisthenics', 'home', 'no equipment'],
    days: [BW_FULL_A, BW_FULL_B, BW_FULL_C],
  },
  {
    slug: 'kettlebell-minimalist-3',
    name: 'Kettlebell Minimalist',
    description: 'Swings, get-ups and presses — 20–30 minute sessions with one implement.',
    days_per_week: 3,
    days_options: [3, 4, 5],
    levels: ['beginner', 'intermediate'],
    goals: ['endurance', 'fat_loss', 'strength'],
    equipment_profile: 'kettlebell',
    required_equipment: ['kettlebell'],
    progression: 'Compress rest first, then move up a bell size.',
    tags: ['kettlebell', 'minimalist', 'conditioning', 'short sessions'],
    days: [KB_SWING_GETUP, KB_PRESS_SQUAT, KB_COMPLEX],
  },
  {
    slug: 'athletic-conditioning-4',
    name: 'Athletic Conditioning Hybrid',
    description: 'Two full-body power days plus two engine days — strength kept, cardio built.',
    days_per_week: 4,
    days_options: [4],
    levels: ['intermediate', 'advanced'],
    goals: ['fat_loss', 'endurance', 'strength'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Lift days move load; conditioning days move work density.',
    tags: ['athletic', 'conditioning', 'gpp', 'hybrid'],
    days: [ATHLETIC_POWER_A, CONDITIONING_DAY, ATHLETIC_POWER_B, CONDITIONING_DAY],
  },
  {
    slug: 'strong-curves-4',
    name: 'Glute-Focused Strength (Strong Curves style)',
    description: 'Hip-thrust-anchored days with full-body support — lower-body emphasis throughout.',
    days_per_week: 4,
    days_options: [3, 4],
    levels: ['beginner', 'intermediate'],
    goals: ['hypertrophy', 'general_health', 'fat_loss'],
    equipment_profile: 'full_gym',
    required_equipment: [],
    progression: 'Thrust and hinge lead the session; add load there before anything else.',
    tags: ['glutes', 'strong curves', 'lower body', 'womens programming'],
    days: [GLUTE_FULL_A, GLUTE_UPPER, GLUTE_FULL_B, GLUTE_FULL_C],
  },
];

/** Slug → definition. */
export const SPLIT_BY_SLUG: Readonly<Record<string, SplitDefinition>> = Object.fromEntries(
  SPLIT_LIBRARY.map((s) => [s.slug, s]),
);

/** The sentinel stored when the user asks FitForge to choose (keeps the generic day plan). */
export const AUTO_SPLIT_SLUG = 'auto';

export function getSplit(slug: string | null | undefined): SplitDefinition | null {
  if (!slug || slug === AUTO_SPLIT_SLUG) return null;
  return SPLIT_BY_SLUG[slug] ?? null;
}

/** Day-strip labels for a split card, e.g. ['Push','Pull','Legs','Push','Pull','Legs']. */
export function splitDayStrip(split: SplitDefinition): string[] {
  return split.days.map((d) => d.focus);
}

/* ---------------------------------------------------------------- recommendation */

export interface SplitRecommendationInput {
  days_per_week?: number | null;
  experience_level?: ExperienceLevel | null;
  /**
   * Every goal the user picked, in pick order (the goals step is a multi-select). When present
   * this wins over `primary_goal`/`secondary_goal`, which are kept for older callers.
   */
  goals?: readonly GoalType[] | null;
  primary_goal?: GoalType | null;
  secondary_goal?: GoalType | null;
  equipment_slugs?: readonly string[] | null;
  training_location?: TrainingLocation | null;
  session_minutes?: number | null;
  /**
   * The athlete's RANKED liked exercises (index 0 = favourite). The exercise-preference step now
   * runs BEFORE this one, which is the whole point of moving it: the split is the single biggest
   * determinant of what someone actually does, and it used to be chosen before the app knew one
   * thing about what they enjoy.
   *
   * Bounded by `LIKED_SPLIT_MAX_BONUS` so it breaks ties without ever outweighing days/week,
   * experience or goal — see `preferences.ts`.
   */
  liked_exercise_slugs?: readonly string[] | null;
  /** Catalog to resolve `liked_exercise_slugs` against. Without it the liked bonus is simply 0. */
  catalog?: readonly CatalogExercise[] | null;
}

export interface SplitRecommendation {
  split: SplitDefinition;
  score: number;
  /** short human reasons, best first — safe to render as chips under the card */
  reasons: string[];
}

/**
 * Does the user plausibly have the kit this program needs? A commercial gym (or an empty
 * equipment list, which is how onboarding represents "assume a normal gym") satisfies everything;
 * otherwise every `required_equipment` slug must be owned.
 */
export function splitIsFeasible(
  split: SplitDefinition,
  equipmentSlugs: readonly string[] | null | undefined,
  location: TrainingLocation | null | undefined,
): boolean {
  if (split.required_equipment.length === 0) return true;
  const owned = new Set(equipmentSlugs ?? []);
  if (owned.size === 0) return location !== 'home' && location !== 'minimal';
  return split.required_equipment.every((slug) => owned.has(slug));
}

function supportsDays(split: SplitDefinition, days: number): boolean {
  return split.days_options.includes(days);
}

/** Equipment profiles that feel native to where the user actually trains. */
const GYM_PROFILES: readonly SplitEquipmentProfile[] = ['full_gym', 'barbell', 'minimal'];
const HOME_PROFILES: readonly SplitEquipmentProfile[] = [
  'dumbbell',
  'kettlebell',
  'bodyweight',
  'minimal',
];

/**
 * Is this program's kit profile a natural fit for where they train? Keeps a kettlebell-only
 * program from out-ranking Push/Pull/Legs for someone standing in a commercial gym, and vice
 * versa for someone training in a spare room.
 */
function suitsContext(split: SplitDefinition, location: TrainingLocation | null | undefined): boolean {
  const list = location === 'home' || location === 'minimal' ? HOME_PROFILES : GYM_PROFILES;
  return list.includes(split.equipment_profile);
}

/**
 * Rank the library for a profile. Deterministic and total — every split gets a score, so callers
 * can either take the top N (the onboarding "Recommended" list) or use the scores to sort a
 * full browse list. Scoring, highest weight first:
 *   • days/week  : supported +40 (and +8 more when it is the program's canonical frequency),
 *                  one day off +18, else 0
 *   • equipment  : feasible +25, otherwise −40 (never recommend what they cannot do)
 *   • context    : kit profile suits where they train (+10)
 *   • level      : match +18, adjacent +6
 *   • goal       : primary +15, secondary +6
 *   • liked      : up to +12, scaled by how much of the split is the patterns they like
 *   • tie-break  : library order (stable)
 */
export function recommendSplits(
  input: SplitRecommendationInput,
  limit = SPLIT_LIBRARY.length,
): SplitRecommendation[] {
  const days = input.days_per_week ?? 3;
  const level = input.experience_level ?? 'beginner';
  const goal = input.primary_goal ?? 'general_health';
  const liked = input.liked_exercise_slugs ?? [];
  const catalog = input.catalog ?? [];
  const levelRank: Record<ExperienceLevel, number> = {
    beginner: 0,
    intermediate: 1,
    advanced: 2,
  };

  const scored = SPLIT_LIBRARY.map((split, index) => {
    const reasons: string[] = [];
    let score = 0;

    if (supportsDays(split, days)) {
      score += 40;
      if (split.days_per_week === days) score += 8;
      reasons.push(`Fits ${days} days/week`);
    } else {
      const nearest = split.days_options.reduce((best, d) =>
        Math.abs(d - days) < Math.abs(best - days) ? d : best,
      );
      if (Math.abs(nearest - days) === 1) {
        score += 18;
        reasons.push(`Runs on ${nearest} days/week`);
      }
    }

    const feasible = splitIsFeasible(split, input.equipment_slugs, input.training_location);
    if (feasible) {
      score += 25;
    } else {
      score -= 40;
      reasons.push('Needs kit you have not listed');
    }
    if (suitsContext(split, input.training_location)) score += 10;

    if (split.levels.includes(level)) {
      score += 18;
      reasons.push(`Built for ${level}s`);
    } else if (split.levels.some((l) => Math.abs(levelRank[l] - levelRank[level]) === 1)) {
      score += 6;
    }

    // Goals are a MULTI-SELECT now: score every goal the user picked, weighting the first-picked
    // heaviest and later picks progressively less. `goals` is the answer of record; primary /
    // secondary stay supported for callers that predate it.
    const picked: readonly GoalType[] =
      input.goals && input.goals.length > 0
        ? input.goals
        : ([input.primary_goal, input.secondary_goal].filter(Boolean) as GoalType[]);
    const ranked = picked.length > 0 ? picked : [goal];
    const GOAL_WEIGHTS = [15, 6, 4, 3];
    let creditedSecondary = false;
    ranked.forEach((g, i) => {
      if (!split.goals.includes(g)) return;
      score += GOAL_WEIGHTS[i] ?? 2;
      if (i === 0) {
        reasons.push('Matches your goal');
      } else if (!creditedSecondary) {
        creditedSecondary = true;
        reasons.push('Also fits your other goals');
      }
    });

    // Liked exercises come LAST in the scoring order on purpose: capped at
    // LIKED_SPLIT_MAX_BONUS (12), it is smaller than the goal match (15) and the level match (18),
    // so it can reorder two programs that are already both appropriate but cannot promote one that
    // is not.
    if (liked.length > 0 && catalog.length > 0) {
      const likedScore = likedSplitBonus(split, liked, catalog);
      if (likedScore.bonus > 0) {
        score += likedScore.bonus;
        if (likedScore.reason) reasons.push(likedScore.reason);
      }
    }

    return { split, score, reasons, index };
  });

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
  return scored.slice(0, limit).map(({ split, score, reasons }) => ({ split, score, reasons }));
}

/** Convenience: the single best split for a profile (never null — the library is non-empty). */
export function bestSplitFor(input: SplitRecommendationInput): SplitDefinition {
  return recommendSplits(input, 1)[0]!.split;
}

/* ---------------------------------------------------------------- day plans from a split */

/**
 * The ordered day templates a split yields for `daysPerWeek` sessions. When the requested count
 * differs from the program's own length the cycle is repeated / truncated, so a user who picks
 * "Push/Pull/Legs 3-day" but trains 5 days still gets P/P/L/P/P instead of a broken week.
 */
export function dayTemplatesForSplit(
  split: SplitDefinition,
  daysPerWeek?: number | null,
): DayTemplate[] {
  const base = split.days;
  const want = Math.max(1, Math.min(7, Math.round(daysPerWeek ?? base.length)));
  if (want === base.length) return [...base];
  const out: DayTemplate[] = [];
  for (let i = 0; i < want; i++) out.push(base[i % base.length]!);
  return out;
}

function nameFor(tpl: DayTemplate, letterIndex: number, occurrence: number): string {
  if (tpl.label) return occurrence > 1 ? `${tpl.label} (${occurrence})` : tpl.label;
  return `Day ${DAY_LETTERS[letterIndex] ?? String(letterIndex + 1)} — ${tpl.focus}`;
}

function toPlannedDays(
  templates: readonly DayTemplate[],
  sessionMinutes: number,
  preferredDays: readonly number[],
): PlannedDay[] {
  const seen = new Map<string, number>();
  return templates.map((tpl, i) => {
    const occurrence = (seen.get(tpl.key) ?? 0) + 1;
    seen.set(tpl.key, occurrence);
    return {
      day_index: i,
      name: nameFor(tpl, i, occurrence),
      focus: tpl.focus,
      weekday: preferredDays[i] ?? null,
      slots: trimSlotsForSession(tpl.slots, sessionMinutes),
    };
  });
}

/** Build the planned week for an explicitly chosen split. */
export function buildDayPlanForSplit(
  split: SplitDefinition,
  sessionMinutes: number,
  preferredDays: readonly number[] = [],
  daysPerWeek?: number | null,
): PlannedDay[] {
  return toPlannedDays(dayTemplatesForSplit(split, daysPerWeek), sessionMinutes, preferredDays);
}

export interface PlanDaysOptions {
  daysPerWeek: number;
  sessionMinutes: number;
  preferredDays?: readonly number[];
  /** a `SplitDefinition`, a library slug, `'auto'`, or null/undefined for the generic plan */
  split?: SplitDefinition | string | null;
}

/**
 * The one entry point plan generation should call. With no split (or `'auto'`) it is EXACTLY
 * `buildDayPlan(daysPerWeek, sessionMinutes, preferredDays)`; with a split it uses that program's
 * day structure instead.
 */
export function planDays(opts: PlanDaysOptions): PlannedDay[] {
  const preferred = opts.preferredDays ?? [];
  const split =
    typeof opts.split === 'string' || opts.split == null ? getSplit(opts.split ?? null) : opts.split;
  if (!split) return buildDayPlan(opts.daysPerWeek, opts.sessionMinutes, preferred);
  return buildDayPlanForSplit(split, opts.sessionMinutes, preferred, opts.daysPerWeek);
}

/** The display name for a plan built from `split` (falls back to the days-per-week name). */
export function splitDisplayName(
  split: SplitDefinition | null,
  daysPerWeek: number,
  fallback: string,
): string {
  return split ? split.name : `${fallback} — ${daysPerWeek}-day plan`;
}
