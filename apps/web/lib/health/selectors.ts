'use client';

/**
 * HEALTH SELECTORS — the ONLY way dashboards read health data (contract law).
 *
 * The store holds raw metric history; this layer holds the product's rules about SPEAKING:
 *
 *   · NO VERDICTS FROM SINGLE READINGS. RHR gets a baseline only against ≥14 days of personal
 *     history, HRV only against ≥30 — under those minimums the baseline is null and the app
 *     stays silent about the comparison. Both are trailing MEDIANS: one rough night must move
 *     "your usual" barely, not drag it like a mean would.
 *   · MISSING DATA IS SILENCE, NOT ZEROES. Every selector returns null for "nothing to say";
 *     none ever fabricates a 0 that would read as "you slept zero hours".
 *
 * Signatures here are a contract with the dashboard consumers built in parallel — extend
 * additively, never reshape.
 */
import { dailyPoints, healthSamples, addDaysISO } from './store';
import type { DailyMetricPoint, HealthSample } from '@/lib/native/forgeBridge';

/** Baseline minimums, straight from the contract. */
export const RHR_BASELINE_DAYS = 14;
export const HRV_BASELINE_DAYS = 30;

const LB_TO_KG = 0.45359237;

/* -------------------------------------------------------------------------------- baselines */

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Trailing median over the most recent `count` day-points (optionally only days strictly
 * BEFORE `beforeDate`, so "your usual" never includes the morning being judged). Under
 * `count` points there is no personal baseline yet — null, and the app stays quiet.
 */
function trailingMedian(
  points: DailyMetricPoint[],
  count: number,
  beforeDate?: string,
): number | null {
  const eligible = beforeDate ? points.filter((p) => p.date < beforeDate) : points;
  if (eligible.length < count) return null;
  return median(eligible.slice(-count).map((p) => p.value));
}

export interface Baselines {
  /** trailing 14-day median resting HR (bpm); null under 14 days of history */
  rhr: number | null;
  /** trailing 30-day median HRV SDNN (ms); null under 30 days of history */
  hrv: number | null;
}

/** The CURRENT personal baselines, over all stored history. */
export function baselines(): Baselines {
  return {
    rhr: trailingMedian(dailyPoints('restingHeartRate'), RHR_BASELINE_DAYS),
    hrv: trailingMedian(dailyPoints('hrvSdnn'), HRV_BASELINE_DAYS),
  };
}

/* -------------------------------------------------------------------------------- overnight */

export interface OvernightReading {
  /** hours asleep for the night ENDING that morning — non-null by construction (see overnight) */
  sleepHours: number;
  sleepSource: 'health';
  /** that day's resting HR (bpm); null when absent */
  rhr: number | null;
  /** trailing 14-day median from the days BEFORE this one; null under the 14-day minimum */
  rhrBaseline: number | null;
  /** HRV deviation vs the trailing 30-day baseline, in percent; null under the minimum */
  hrvPct: number | null;
}

function pointFor(points: DailyMetricPoint[], dateISO: string): DailyMetricPoint | undefined {
  return points.find((p) => p.date === dateISO);
}

/**
 * The morning's overnight ledger row ("Slept 6:12 · resting HR 54 (usual 51)").
 *
 * NULL WHEN THE NIGHT IS SILENT — the row disappears rather than showing dashes or zeros, and
 * a non-null reading GUARANTEES `sleepHours`: the surface leads with "Slept …", so a morning
 * with no sleep session has no row, even if an RHR point exists (RHR still reaches Trends via
 * its own series and the readiness engine via baselines). A sleep session belongs to the
 * morning its END falls on: the night of the 30th→31st answers `overnight('…-31')`.
 */
export function overnight(dateISO: string): OvernightReading | null {
  // In-bed time is filtered native-side, but a defensive skip here keeps a future shell's
  // 'inBed' samples from inflating "slept" — the one number athletes cross-check nightly.
  const asleep = healthSamples('sleep').filter(
    (s) => s.kind !== 'inBed' && s.end.slice(0, 10) === dateISO,
  );
  if (!asleep.length) return null;
  const sleepHours =
    Math.round(asleep.reduce((sum, s) => sum + (s.unit === 'min' ? s.value / 60 : s.value), 0) * 100) / 100;

  const rhrPoints = dailyPoints('restingHeartRate');
  const rhr = pointFor(rhrPoints, dateISO)?.value ?? null;
  const rhrBaseline = trailingMedian(rhrPoints, RHR_BASELINE_DAYS, dateISO);

  const hrvPoints = dailyPoints('hrvSdnn');
  const hrvToday = pointFor(hrvPoints, dateISO)?.value ?? null;
  const hrvBaseline = trailingMedian(hrvPoints, HRV_BASELINE_DAYS, dateISO);
  const hrvPct =
    hrvToday !== null && hrvBaseline !== null && hrvBaseline > 0
      ? Math.round(((hrvToday - hrvBaseline) / hrvBaseline) * 100)
      : null;

  return { sleepHours, sleepSource: 'health', rhr, rhrBaseline, hrvPct };
}

/* ----------------------------------------------------------------------------------- weight */

/**
 * The Health-imported body weight for a date, in kg (lb converted). Null when Health has no
 * reading that day — this reads the HEALTH history only; the merged one-entry-per-day log the
 * product charts is lib/demo's `weights`, which bodyMass ingestion writes through `logWeight`.
 */
export function weightFor(dateISO: string): number | null {
  const p = pointFor(dailyPoints('bodyMass'), dateISO);
  if (!p) return null;
  const kg = p.unit === 'lb' ? p.value * LB_TO_KG : p.value;
  return Math.round(kg * 10) / 10;
}

/* --------------------------------------------------------------------------------- activity */

export interface WeeklyActivity {
  weekStart: string;
  /** total steps across days that reported; null when NO day in the week did */
  steps: number | null;
  /** total active energy (kcal) across days that reported; null when none did */
  activeKcal: number | null;
  /** external workouts whose start falls inside the week, ascending */
  workouts: HealthSample[];
  /** how many of the 7 days had any step data — "4 of 7 days" honesty for the UI */
  daysWithSteps: number;
}

/**
 * One week of movement, `weekStartISO` through the following 6 days. Null when the whole week
 * is silent — an empty week disappears rather than rendering a row of zeros.
 */
export function weeklyActivity(weekStartISO: string): WeeklyActivity | null {
  const weekEnd = addDaysISO(weekStartISO, 6);
  const inWeek = (date: string) => date >= weekStartISO && date <= weekEnd;

  const stepDays = dailyPoints('steps').filter((p) => inWeek(p.date));
  const kcalDays = dailyPoints('activeEnergy').filter((p) => inWeek(p.date));
  const workouts = healthSamples('workouts').filter((s) => inWeek(s.start.slice(0, 10)));

  if (!stepDays.length && !kcalDays.length && !workouts.length) return null;
  return {
    weekStart: weekStartISO,
    steps: stepDays.length ? Math.round(stepDays.reduce((sum, p) => sum + p.value, 0)) : null,
    activeKcal: kcalDays.length ? Math.round(kcalDays.reduce((sum, p) => sum + p.value, 0)) : null,
    workouts,
    daysWithSteps: stepDays.length,
  };
}

/**
 * Whether an EXTERNAL workout (logged by another app/Watch into Apple Health) landed on this
 * calendar day. Feeds the check-in's `externalWorkoutYesterday` context line — a boolean, not
 * the samples: the check-in states the fact, it does not itemize someone else's training log.
 */
export function externalWorkoutOn(dateISO: string): boolean {
  return healthSamples('workouts').some((s) => s.start.slice(0, 10) === dateISO);
}

/**
 * Daily resting-HR series for the Trends card, most recent `days` calendar days ascending.
 * Deliberately independent of `overnight()`: that selector is gated on a sleep session, and an
 * RHR-only day (watch worn all day, slept without it) must still appear in the trend.
 */
export function rhrSeries(days: number): DailyMetricPoint[] {
  const points = dailyPoints('restingHeartRate');
  if (points.length === 0) return [];
  const cutoff = addDaysISO(points[points.length - 1]!.date, -(days - 1));
  return points.filter((p) => p.date >= cutoff);
}

/* ------------------------------------------------------------------------------ permissions */

/**
 * The shell's last per-metric permission push, for the Profile "Apple Health" card. Lives in
 * the store (it is meta, not a derivation) and is re-exported here so the selector layer stays
 * the one import for reading health.
 */
export { permissionState } from './store';
