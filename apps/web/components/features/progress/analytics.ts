'use client';

/**
 * The "how you're doing" engine.
 *
 * Charts show *what happened*; this module answers *what it means*, in a sentence a person can act
 * on. Everything here is derived from REAL logged sessions (`workoutLog`), the REAL body-weight log
 * (Local Mode store) and the athlete's REAL weekly set goals (`volumeMath`). Nothing is invented:
 * when there is not enough history for a claim, the claim is simply not made.
 *
 * Pure functions — no React, no storage access, no fetching.
 */
import type { MuscleSlug } from '@/components/illustrations';
import type { WeightEntry } from '@/lib/demo/store';
import {
  bucketWeightedSets,
  completedWeekTrend,
  exerciseFrequency,
  e1rmSeries,
  trendOf,
  type Trend,
  type WeekBucket,
  type WorkoutSession,
} from '@/components/features/shared/workoutLog';
import {
  buildGoalRows,
  fmtPct,
  fmtSets,
  groupWeeklyGoal,
  MUSCLE_GROUP_NAME,
  MUSCLE_GROUP_ORDER,
  setsByGroup,
  type MuscleGroup,
  type VolumeGoalContext,
} from '@/components/features/shared/volumeMath';

/* ----------------------------------------------------------------------- muscle-group series */

export interface GroupSeries {
  group: MuscleGroup;
  name: string;
  /** weighted sets per week, oldest → newest (one entry per bucket) */
  values: number[];
  /** the current (in-progress) week's sets */
  current: number;
  /** last completed week's sets */
  lastComplete: number;
  /** the weekly set goal for the whole group */
  goal: number;
  /** lastComplete / goal */
  pct: number;
  trend: Trend;
}

/** Sets per muscle GROUP over time — the view that makes long-running imbalances visible. */
export function groupSeries(buckets: WeekBucket[], ctx: VolumeGoalContext): GroupSeries[] {
  const perBucket = buckets.map((b) => setsByGroup(b.setsByMuscle));
  const completedIdx = buckets.map((b, i) => (b.isCurrent ? -1 : i)).filter((i) => i >= 0);
  const lastIdx = completedIdx[completedIdx.length - 1] ?? -1;
  const prevIdx = completedIdx[completedIdx.length - 2] ?? -1;

  return MUSCLE_GROUP_ORDER.map((group) => {
    const values = perBucket.map((p) => Math.round(p[group] * 10) / 10);
    const goal = groupWeeklyGoal(group, ctx);
    const lastComplete = lastIdx >= 0 ? values[lastIdx]! : 0;
    const prev = prevIdx >= 0 ? values[prevIdx]! : 0;
    return {
      group,
      name: MUSCLE_GROUP_NAME[group],
      values,
      current: values[values.length - 1] ?? 0,
      lastComplete,
      goal,
      pct: goal > 0 ? lastComplete / goal : 0,
      trend: trendOf(lastComplete, prev, 0.1),
    };
  });
}

/* ------------------------------------------------------------------------- strength progress */

export interface StrengthTrend {
  exercise_id: string;
  exercise_name: string;
  /** oldest → newest per-session best e1RM */
  points: { label: string; value: number; display: string }[];
  first: number;
  last: number;
  /** absolute kg change across the logged window */
  deltaKg: number;
  /** percentage change across the logged window */
  deltaPct: number;
}

/**
 * Estimated-1RM trend for the most-trained exercises. Only exercises with ≥ 2 logged sessions
 * qualify — a single data point is not a trend and must not be drawn as one.
 */
export function strengthTrends(sessions: WorkoutSession[], limit = 4): StrengthTrend[] {
  const out: StrengthTrend[] = [];
  for (const ex of exerciseFrequency(sessions)) {
    if (ex.sessions < 2) continue;
    const series = e1rmSeries(sessions, ex.exercise_id);
    if (series.length < 2) continue;
    const first = series[0]!.e1rm;
    const last = series[series.length - 1]!.e1rm;
    out.push({
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      points: series.map((p) => ({
        label: p.label,
        value: p.e1rm,
        display: `${p.e1rm} kg (${p.weight_kg}×${p.reps})`,
      })),
      first,
      last,
      deltaKg: Math.round((last - first) * 10) / 10,
      deltaPct: first > 0 ? ((last - first) / first) * 100 : 0,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------------------------- the verdict */

export type Verdict = 'progressing' | 'steady' | 'slipping' | 'starting';

export interface ProgressSummary {
  /** false when there is no logged history at all */
  hasData: boolean;
  /** true once at least one week other than the in-progress one has training in it */
  hasWeekOverWeek: boolean;
  verdict: Verdict;
  headline: string;
  /** ordered, plain-English observations — each one is backed by a number above */
  bullets: string[];
  volumeTrend: Trend;
  tonnageTrend: Trend;
  /** distinct days trained in the current (in-progress) week */
  daysThisWeek: number;
  /** average distinct training days per completed week in the window */
  avgDays: number;
  targetDays: number;
  /** groups that finished last completed week under 85 % of their goal */
  underGroups: GroupSeries[];
  strength: StrengthTrend[];
}

const VERDICT_HEADLINE: Record<Verdict, string> = {
  progressing: 'You’re moving forward',
  steady: 'Holding steady',
  slipping: 'Losing ground',
  starting: 'Just getting started',
};

function fmtDelta(pct: number): string {
  const v = Math.abs(Math.round(pct));
  return `${v}%`;
}

export interface SummaryInput {
  buckets: WeekBucket[];
  sessions: WorkoutSession[];
  ctx: VolumeGoalContext;
  targetDays: number;
  weights: WeightEntry[];
}

/**
 * The paragraph at the top of the analytics view. Built strictly from what is logged:
 * volume trend, consistency vs the athlete's own target days, strength trend on their most-trained
 * lifts, muscle-group balance, and body weight if they log it.
 */
export function buildSummary({
  buckets,
  sessions,
  ctx,
  targetDays,
  weights,
}: SummaryInput): ProgressSummary {
  const volumeTrend = completedWeekTrend(buckets, bucketWeightedSets);
  const tonnageTrend = completedWeekTrend(buckets, (b) => b.tonnage);
  const completed = buckets.filter((b) => !b.isCurrent);
  const current = buckets[buckets.length - 1];
  const trainedWeeks = completed.filter((b) => b.sets > 0);
  const hasData = sessions.some((s) => s.exercises.some((e) => e.sets.length > 0));
  const hasWeekOverWeek = trainedWeeks.length >= 2;

  const daysThisWeek = current?.days ?? 0;
  const avgDays =
    trainedWeeks.length > 0
      ? Math.round((trainedWeeks.reduce((n, b) => n + b.days, 0) / trainedWeeks.length) * 10) / 10
      : 0;

  const groups = groupSeries(buckets, ctx);
  const underGroups = groups
    .filter((g) => g.pct < 0.85)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);
  const strength = strengthTrends(sessions, 4);

  /* ---- verdict ---- */
  let score = 0;
  if (volumeTrend.direction === 'up') score += 1;
  if (volumeTrend.direction === 'down') score -= 1;
  if (avgDays >= targetDays) score += 1;
  else if (avgDays > 0 && avgDays < targetDays - 1) score -= 1;
  const improving = strength.filter((s) => s.deltaKg > 0).length;
  const regressing = strength.filter((s) => s.deltaKg < 0).length;
  if (improving > regressing) score += 1;
  else if (regressing > improving) score -= 1;

  const verdict: Verdict = !hasData
    ? 'starting'
    : !hasWeekOverWeek
      ? 'starting'
      : score >= 2
        ? 'progressing'
        : score <= -2
          ? 'slipping'
          : 'steady';

  /* ---- bullets ---- */
  const bullets: string[] = [];

  if (hasWeekOverWeek) {
    const dir =
      volumeTrend.direction === 'up'
        ? `up ${fmtDelta(volumeTrend.pctChange)}`
        : volumeTrend.direction === 'down'
          ? `down ${fmtDelta(volumeTrend.pctChange)}`
          : 'flat';
    bullets.push(
      `Weekly volume ${dir} — ${fmtSets(Math.round(volumeTrend.current))} weighted sets last week vs ${fmtSets(Math.round(volumeTrend.previous))} the week before.`,
    );
    if (tonnageTrend.direction !== 'none' && tonnageTrend.current > 0) {
      const tdir =
        tonnageTrend.direction === 'up'
          ? `up ${fmtDelta(tonnageTrend.pctChange)}`
          : tonnageTrend.direction === 'down'
            ? `down ${fmtDelta(tonnageTrend.pctChange)}`
            : 'flat';
      bullets.push(
        `Total load ${tdir} — ${Math.round(tonnageTrend.current).toLocaleString()} kg moved last week.`,
      );
    }
  } else if (hasData) {
    const soFar = buckets.reduce((n, b) => n + bucketWeightedSets(b), 0);
    bullets.push(
      `First numbers are in: ${fmtSets(Math.round(soFar))} weighted sets logged so far. One more training week unlocks the week-over-week trend.`,
    );
  }

  if (hasData) {
    bullets.push(
      daysThisWeek >= targetDays
        ? `Consistency: ${daysThisWeek} of ${targetDays} target days already done this week${avgDays > 0 ? ` (${avgDays}/week average)` : ''}.`
        : `Consistency: ${daysThisWeek} of ${targetDays} target days done this week${avgDays > 0 ? `, ${avgDays}/week on average` : ''}.`,
    );
  }

  if (strength.length > 0) {
    const best = [...strength].sort((a, b) => b.deltaKg - a.deltaKg)[0]!;
    if (best.deltaKg > 0) {
      bullets.push(
        `${best.exercise_name} estimated 1RM up ${best.deltaKg} kg (${fmtDelta(best.deltaPct)}) across ${best.points.length} sessions.`,
      );
    } else if (best.deltaKg < 0) {
      bullets.push(
        `${best.exercise_name} estimated 1RM is down ${Math.abs(best.deltaKg)} kg — check sleep, food and how close your sets are to failure.`,
      );
    } else {
      bullets.push(
        `${best.exercise_name} estimated 1RM is unchanged across ${best.points.length} sessions — time to add a rep or a small plate.`,
      );
    }
  }

  if (hasWeekOverWeek && underGroups.length > 0) {
    bullets.push(
      `Under target last week: ${underGroups.map((g) => `${g.name} (${fmtPct(g.pct)})`).join(', ')}.`,
    );
  }

  if (weights.length >= 2) {
    const first = weights[0]!;
    const last = weights[weights.length - 1]!;
    const delta = Math.round((last.kg - first.kg) * 10) / 10;
    const word = delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged';
    bullets.push(
      delta === 0
        ? `Body weight unchanged at ${last.kg} kg across ${weights.length} weigh-ins.`
        : `Body weight ${word} ${Math.abs(delta)} kg across ${weights.length} weigh-ins (${first.kg} → ${last.kg} kg).`,
    );
  }

  return {
    hasData,
    hasWeekOverWeek,
    verdict,
    headline: VERDICT_HEADLINE[verdict],
    bullets,
    volumeTrend,
    tonnageTrend,
    daysThisWeek,
    avgDays,
    targetDays,
    underGroups,
    strength,
  };
}

/* ------------------------------------------------------------ planned-volume projection */

export interface PlannedSource {
  slug: string;
  sets: number;
}

/**
 * Weighted sets per muscle a routine PLANS for one week. Used so a brand-new user's heat view is
 * never blank — it is clearly labelled "planned", never presented as history.
 */
export function plannedWeeklySets(
  sources: PlannedSource[],
  resolve: (slug: string) => { primary_muscles: string[]; secondary_muscles: string[] } | undefined,
): Partial<Record<MuscleSlug, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const s of sources) {
    const ex = resolve(s.slug);
    if (!ex) continue;
    for (const m of ex.primary_muscles) out[m] = (out[m] ?? 0) + s.sets;
    for (const m of ex.secondary_muscles) out[m] = (out[m] ?? 0) + s.sets * 0.5;
  }
  return out as Partial<Record<MuscleSlug, number>>;
}

/** Convenience: goal rows for a planned week (same shape the heat view consumes). */
export function plannedGoalRows(
  sources: PlannedSource[],
  resolve: (slug: string) => { primary_muscles: string[]; secondary_muscles: string[] } | undefined,
  ctx: VolumeGoalContext,
) {
  return buildGoalRows(plannedWeeklySets(sources, resolve), ctx);
}
