/**
 * volumeMath — WEEKLY SET GOALS + the yellow→orange→red heat gradient.
 *
 * The app's training currency is **hard sets per muscle per week** (primary set = 1.0, secondary
 * set = 0.5). This module turns that raw number into the two things the UI actually needs:
 *
 *   1. a per-muscle **weekly goal** (evidence-informed, adjusted for the athlete), and
 *   2. a **continuous colour** for "% of that goal" so a silhouette reads as a heat map.
 *
 * Pure, dependency-free, SSR-safe. No React, no storage, no fetching.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHERE THE NUMBERS COME FROM
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * The dose-response literature on resistance-training volume (Schoenfeld/Krieger meta-analyses;
 * Baz-Valle et al. 2022) converges on roughly **10–20 hard sets per muscle per week** as the
 * productive range for hypertrophy in trained lifters, with benefit plateauing and recovery cost
 * rising beyond ~20. Practitioner volume-landmark frameworks (Israetel's MEV/MAV/MRV) put small
 * or heavily-indirectly-trained muscles lower (forearms, hip flexors, rear/front delts) and the
 * big pulling/pushing/leg muscles higher.
 *
 * So each muscle gets a single BASE weekly goal placed inside that range according to (a) muscle
 * size and (b) how much indirect volume it already absorbs from compounds — e.g. front delts sit
 * low because every press hits them, side delts sit high because almost nothing else does.
 *
 * The base is then scaled by GOAL and EXPERIENCE (and gently by training days available), because
 * a 2-day/week beginner training for general health should not be told they are 70 % under target
 * on twenty muscles. Every factor is declared below and documented on-screen.
 */
import type { MuscleSlug } from '@/components/illustrations';
import { MUSCLE_NAMES, ALL_MUSCLE_SLUGS } from '@/components/illustrations';
import type { Difficulty, GoalType, Profile } from '@/components/features/_mock/data';

/* ══════════════════════════════════════════════════════════════════════ weekly set goals ══ */

/**
 * BASE weekly hard-set goal per muscle for an INTERMEDIATE lifter training for general fitness on
 * ~4 days a week. Units: weighted sets (primary 1.0 / secondary 0.5) per 7 days.
 *
 * Large prime movers 12–14 · mid-size 10–12 · small / heavily-indirect 6–8.
 */
export const BASE_WEEKLY_SET_GOAL: Record<MuscleSlug, number> = {
  // Torso — large prime movers, the classic 10–20 band.
  pecs: 14,
  lats: 14,
  traps: 10,
  rhomboids: 12,
  'lower-back': 8, // heavily loaded by hinges/squats already; direct work adds up fast
  // Shoulders — front delts ride along on every press, side delts almost never do.
  'front-delts': 8,
  'side-delts': 14,
  'rear-delts': 12,
  // Arms — meaningful indirect volume from every push/pull.
  biceps: 12,
  triceps: 12,
  forearms: 6, // every grip-limited pull trains these; direct work is a top-up
  // Core.
  abs: 10,
  obliques: 8,
  'hip-flexors': 6,
  // Legs.
  'glute-max': 12,
  'glute-med': 8,
  quads: 14,
  adductors: 6,
  hamstrings: 12,
  calves: 10,
};

/**
 * GOAL scaling. Hypertrophy is the volume-driven goal, so it sits highest. Strength trades volume
 * for intensity (fewer, heavier sets). Fat-loss and general-health plans are shorter and prioritise
 * adherence over accumulation, so their goals are deliberately reachable.
 */
export const GOAL_VOLUME_FACTOR: Record<GoalType, number> = {
  hypertrophy: 1.15,
  strength: 0.9,
  endurance: 1.0,
  fat_loss: 0.85,
  general_health: 0.75,
};

/**
 * EXPERIENCE scaling. Beginners grow on far less volume and cannot yet recover from much;
 * advanced lifters need (and tolerate) more before the stimulus plateaus.
 */
export const EXPERIENCE_VOLUME_FACTOR: Record<Difficulty, number> = {
  beginner: 0.7,
  intermediate: 1.0,
  advanced: 1.2,
};

/**
 * DAYS-AVAILABLE scaling. A weekly goal you cannot physically fit into your week is not a goal,
 * it is a guilt generator. Anchored at 4 days = 1.0.
 */
export function daysVolumeFactor(daysPerWeek: number | null | undefined): number {
  if (!daysPerWeek || daysPerWeek <= 0) return 1;
  if (daysPerWeek <= 2) return 0.75;
  if (daysPerWeek === 3) return 0.9;
  if (daysPerWeek === 4) return 1;
  if (daysPerWeek === 5) return 1.08;
  return 1.15;
}

/** Everything that personalises a weekly goal. All fields optional — omitted = neutral. */
export interface VolumeGoalContext {
  goal?: GoalType | null;
  experience?: Difficulty | null;
  daysPerWeek?: number | null;
}

/** Pull a {@link VolumeGoalContext} out of the Local Mode profile (null-safe). */
export function goalContextFromProfile(profile: Profile | null | undefined): VolumeGoalContext {
  if (!profile) return {};
  return {
    goal: profile.primary_goal,
    experience: profile.experience_level,
    daysPerWeek: profile.days_per_week,
  };
}

/** The combined multiplier applied to every base goal. */
export function volumeGoalMultiplier(ctx: VolumeGoalContext = {}): number {
  const g = ctx.goal ? (GOAL_VOLUME_FACTOR[ctx.goal] ?? 1) : 1;
  const e = ctx.experience ? (EXPERIENCE_VOLUME_FACTOR[ctx.experience] ?? 1) : 1;
  return g * e * daysVolumeFactor(ctx.daysPerWeek);
}

/**
 * Personalised weekly set goal for one muscle. Rounded to a whole set and floored at 4 — below
 * that a "goal" is noise (one exercise clears it).
 */
export function weeklySetGoal(slug: MuscleSlug, ctx: VolumeGoalContext = {}): number {
  const base = BASE_WEEKLY_SET_GOAL[slug] ?? 10;
  return Math.max(4, Math.round(base * volumeGoalMultiplier(ctx)));
}

/** Personalised weekly set goals for all 20 muscles. */
export function weeklySetGoals(ctx: VolumeGoalContext = {}): Record<MuscleSlug, number> {
  const out = {} as Record<MuscleSlug, number>;
  for (const slug of ALL_MUSCLE_SLUGS) out[slug] = weeklySetGoal(slug, ctx);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════ goal attainment ══ */

export type GoalStatus = 'none' | 'under' | 'building' | 'on-target' | 'above' | 'over';

/** Status thresholds, expressed as a fraction of the weekly goal. */
export const GOAL_THRESHOLDS = {
  /** below this = clearly under-trained */
  under: 0.6,
  /** below this = climbing but not there yet */
  building: 0.85,
  /** up to this = on target */
  onTarget: 1.15,
  /** up to this = above target (fine if recovery is fine) */
  above: 1.35,
  /** beyond `above` = over target / overreaching territory */
} as const;

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  none: 'Not trained',
  under: 'Under-trained',
  building: 'Building',
  'on-target': 'On target',
  above: 'Above target',
  over: 'Over target',
};

export const GOAL_STATUS_HELP: Record<GoalStatus, string> = {
  none: 'No sets landed here this week.',
  under: 'Well under your weekly goal — add a set or two if this muscle matters to you.',
  building: 'Close. One more working set or one more exposure clears the goal.',
  'on-target': 'Right in the productive range for your goal and experience.',
  above: 'Above goal. Great, as long as you are recovering and sleeping.',
  over: 'Well past goal. Watch for stalled reps and joint niggles — more is not always better.',
};

export function goalStatus(pct: number, sets: number): GoalStatus {
  if (sets <= 0) return 'none';
  if (pct < GOAL_THRESHOLDS.under) return 'under';
  if (pct < GOAL_THRESHOLDS.building) return 'building';
  if (pct <= GOAL_THRESHOLDS.onTarget) return 'on-target';
  if (pct <= GOAL_THRESHOLDS.above) return 'above';
  return 'over';
}

/** One muscle, resolved against its weekly goal. */
export interface MuscleGoalRow {
  slug: MuscleSlug;
  name: string;
  /** weighted sets landed this week */
  sets: number;
  /** personalised weekly goal in sets */
  goal: number;
  /** sets / goal (0 = untouched, 1 = exactly on goal, >1 = over) */
  pct: number;
  status: GoalStatus;
  /** the gradient colour for this row/muscle */
  color: string;
}

/** Build the goal-resolved rows from raw weighted sets per muscle. Untouched muscles included. */
export function buildGoalRows(
  setsByMuscle: Partial<Record<MuscleSlug, number>>,
  ctx: VolumeGoalContext = {},
): MuscleGoalRow[] {
  return ALL_MUSCLE_SLUGS.map((slug) => {
    const sets = Math.round((setsByMuscle[slug] ?? 0) * 10) / 10;
    const goal = weeklySetGoal(slug, ctx);
    const pct = goal > 0 ? sets / goal : 0;
    return {
      slug,
      name: MUSCLE_NAMES[slug],
      sets,
      goal,
      pct,
      status: goalStatus(pct, sets),
      color: heatColor(pct, sets),
    };
  });
}

/** `heatColors` payload for `MuscleMap` — every muscle gets a colour, including the untouched. */
export function goalHeatColors(rows: MuscleGoalRow[]): Partial<Record<MuscleSlug, string>> {
  const out: Partial<Record<MuscleSlug, string>> = {};
  for (const r of rows) out[r.slug] = r.color;
  return out;
}

/* ═════════════════════════════════════════════════════════════ the heat colour gradient ══ */
/*
 * A CONTINUOUS ramp — not a handful of bands. Colours are interpolated in OKLab, which is
 * perceptually uniform, so the yellow→orange→red walk has no muddy dead zone the way naive sRGB
 * lerping does. Anchors were chosen so the reading is unambiguous:
 *
 *     0 %  ▸ inert (the untouched muscle fill)
 *    25 %  ▸ dark gold      — "you touched it"
 *    50 %  ▸ YELLOW         — halfway to goal
 *    75 %  ▸ amber
 *   100 %  ▸ ORANGE         — on goal
 *   115 %  ▸ orange-red
 *   130 %  ▸ RED            — over target
 *   170 %+ ▸ deep red       — hard overreaching
 */

interface Stop {
  at: number;
  hex: string;
}

/** The gradient anchors, ascending by `at` (fraction of weekly goal). */
export const HEAT_STOPS: readonly Stop[] = [
  { at: 0.02, hex: '#544427' },
  { at: 0.25, hex: '#a8802a' },
  { at: 0.5, hex: '#f2d044' },
  { at: 0.75, hex: '#ffb03a' },
  { at: 1.0, hex: '#ff7a33' },
  { at: 1.15, hex: '#f4522c' },
  { at: 1.3, hex: '#e12b2b' },
  { at: 1.7, hex: '#b41d24' },
] as const;

/** The colour used for a muscle with zero sets — the inert silhouette fill. */
export const HEAT_INERT = 'var(--muscle-base)';

type Triple = [number, number, number];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hexToRgb(hex: string): Triple {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB (0..1) → OKLab. */
function rgbToOklab(rgb: Triple): Triple {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB (0..1, gamut-clamped). */
function oklabToRgb(lab: Triple): Triple {
  const l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
  const m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
  const s_ = lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2];
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    clamp01(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

function rgbToCss(rgb: Triple): string {
  const to255 = (v: number) => Math.round(clamp01(v) * 255);
  return `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`;
}

/** Precomputed OKLab for each stop — the ramp is evaluated on every render, so do this once. */
const STOPS_LAB: { at: number; lab: Triple }[] = HEAT_STOPS.map((s) => ({
  at: s.at,
  lab: rgbToOklab(hexToRgb(s.hex)),
}));

/**
 * The gradient itself: a fraction of the weekly goal → a CSS colour, interpolated in OKLab.
 * `pct` is a RATIO (0.5 = 50 % of goal), not a percentage. Values above the last stop clamp.
 *
 * Below ~2 % of goal the muscle is treated as untouched and the inert silhouette fill is returned,
 * so "trained a little" never looks the same as "not trained at all".
 */
export function heatColorAt(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0.02) return HEAT_INERT;
  const first = STOPS_LAB[0]!;
  const last = STOPS_LAB[STOPS_LAB.length - 1]!;
  if (pct <= first.at) return rgbToCss(oklabToRgb(first.lab));
  if (pct >= last.at) return rgbToCss(oklabToRgb(last.lab));
  for (let i = 0; i < STOPS_LAB.length - 1; i++) {
    const a = STOPS_LAB[i]!;
    const b = STOPS_LAB[i + 1]!;
    if (pct >= a.at && pct <= b.at) {
      const t = (pct - a.at) / (b.at - a.at);
      const lab: Triple = [
        a.lab[0] + (b.lab[0] - a.lab[0]) * t,
        a.lab[1] + (b.lab[1] - a.lab[1]) * t,
        a.lab[2] + (b.lab[2] - a.lab[2]) * t,
      ];
      return rgbToCss(oklabToRgb(lab));
    }
  }
  return rgbToCss(oklabToRgb(last.lab));
}

/** Convenience: colour for a muscle, forcing the inert fill when literally nothing was logged. */
export function heatColor(pct: number, sets: number): string {
  return sets <= 0 ? HEAT_INERT : heatColorAt(pct);
}

/**
 * A CSS `linear-gradient(...)` string sampling the SAME ramp the silhouette uses, so the legend can
 * never drift from the body. Spans 0 → `max` (default 150 % of goal).
 */
export function heatGradientCss(max = 1.5, steps = 24, angle = '90deg'): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pct = t * max;
    const color = pct <= 0.02 ? HEAT_INERT : heatColorAt(pct);
    parts.push(`${color} ${(t * 100).toFixed(1)}%`);
  }
  return `linear-gradient(${angle}, ${parts.join(', ')})`;
}

/* ═══════════════════════════════════════════════════════════════════════ muscle groupings ══ */

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

export const MUSCLE_GROUP_ORDER: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
];

export const MUSCLE_GROUP_NAME: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

/** Which coarse group each of the 20 seed muscles rolls up into (for the over-time charts). */
export const MUSCLE_GROUP_OF: Record<MuscleSlug, MuscleGroup> = {
  pecs: 'chest',
  lats: 'back',
  traps: 'back',
  rhomboids: 'back',
  'lower-back': 'back',
  'front-delts': 'shoulders',
  'side-delts': 'shoulders',
  'rear-delts': 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  abs: 'core',
  obliques: 'core',
  'hip-flexors': 'core',
  'glute-max': 'legs',
  'glute-med': 'legs',
  quads: 'legs',
  adductors: 'legs',
  hamstrings: 'legs',
  calves: 'legs',
};

/** Weekly set goal for a whole group = the sum of its muscles' goals. */
export function groupWeeklyGoal(group: MuscleGroup, ctx: VolumeGoalContext = {}): number {
  let total = 0;
  for (const slug of ALL_MUSCLE_SLUGS) {
    if (MUSCLE_GROUP_OF[slug] === group) total += weeklySetGoal(slug, ctx);
  }
  return total;
}

/** Roll weighted per-muscle sets up into the six coarse groups. */
export function setsByGroup(
  setsByMuscle: Partial<Record<MuscleSlug, number>>,
): Record<MuscleGroup, number> {
  const out: Record<MuscleGroup, number> = {
    chest: 0,
    back: 0,
    shoulders: 0,
    arms: 0,
    legs: 0,
    core: 0,
  };
  for (const slug of ALL_MUSCLE_SLUGS) {
    const v = setsByMuscle[slug] ?? 0;
    if (v > 0) out[MUSCLE_GROUP_OF[slug]] += v;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════ formatting ══ */

/** 12.0 → "12", 12.5 → "12.5". */
export function fmtSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 0.837 → "84%". Clamped at 0 so rounding never produces "-0%". */
export function fmtPct(pct: number): string {
  return `${Math.max(0, Math.round(pct * 100))}%`;
}
