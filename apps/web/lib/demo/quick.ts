'use client';

/**
 * QUICK WORKOUTS — the options behind the "train anyway" button.
 *
 * Tapping "freestyle" used to link straight at `routine.days[0]`, which silently started day 1 of
 * the split whether or not that made any sense. A quick session is a decision, not a default, so
 * this module derives the real choices FROM THE USER'S OWN SPLIT:
 *
 *   1. **Pull forward** — the next scheduled day, done today. The most common real-world case
 *      (free evening now, busy tomorrow) and the only one that keeps the week's plan intact.
 *   2. **Isolate a day** — any single day of the split, run standalone.
 *   3. **Condense** — every day of the split compressed into one full-body session inside a time
 *      budget. This is the option for "I have 25 minutes and I do not want to skip the week".
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY CONDENSING IS SAFE TO OFFER
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Iversen et al. (2021), "No time to lift?", puts the minimum effective dose for hypertrophy at
 * ~4 hard sets per muscle per week near failure at 6–15 reps, and 2–3 sets per exercise per week
 * for strength — and specifically names SUPERSETS as a way to cut session time substantially
 * without cutting the dose. A condensed day therefore keeps one exercise per movement pattern
 * (breadth, so no muscle drops to zero) and pairs non-competing exercises rather than deleting
 * sets, which is why the budgets below can be as short as 20 minutes and still be honest.
 *
 * Every option is a real {@link RoutineDay}, so the workout player, the volume aggregation and the
 * logging path all treat a quick session exactly like a planned one — no parallel code path.
 */
import type { RoutineDay, RoutineExercise, Routine } from '@/components/features/_mock/data';
import { mockExerciseById, WEEKDAY_LABELS, blueprintWeekday } from '@/components/features/_mock/data';

/** How long a set takes end-to-end, excluding rest: work + re-rack + setup. Seconds. */
const SECONDS_PER_SET = 45;
/** Transition cost when moving to a new exercise (find kit, set up, first warm-up feel). */
const SECONDS_PER_EXERCISE = 60;

/**
 * Movement patterns in the order a full-body session should cover them: heaviest, most systemic
 * first, isolation last. Also the priority order when a time budget forces a trim — the first
 * entry to survive is the one that trains the most muscle per minute.
 */
const FULL_BODY_PRIORITY: readonly string[] = [
  'squat',
  'hinge',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'lunge',
  'core_stability',
  'core_flexion',
  'knee_flexion_iso',
  'knee_extension_iso',
  'hip_extension_iso',
  'shoulder_isolation',
  'elbow_flexion',
  'elbow_extension',
  'calf_raise',
  'carry',
  'cardio',
];

/**
 * Patterns that must not be supersetted together because they compete for the same muscles or the
 * same piece of kit. Anything NOT paired here can be alternated, which is where the time saving
 * comes from. Keyed both ways at lookup time.
 */
const COMPETING: readonly (readonly [string, string])[] = [
  ['squat', 'hinge'],
  ['squat', 'lunge'],
  ['hinge', 'lunge'],
  ['squat', 'knee_extension_iso'],
  ['hinge', 'knee_flexion_iso'],
  ['horizontal_push', 'vertical_push'],
  ['horizontal_push', 'elbow_extension'],
  ['vertical_push', 'elbow_extension'],
  ['vertical_push', 'shoulder_isolation'],
  ['horizontal_pull', 'vertical_pull'],
  ['horizontal_pull', 'elbow_flexion'],
  ['vertical_pull', 'elbow_flexion'],
];

function competes(a: string, b: string): boolean {
  return COMPETING.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function patternOf(row: RoutineExercise): string {
  return mockExerciseById(row.exercise_id)?.movement_pattern ?? 'cardio';
}

/** Estimated wall-clock minutes for a day, counting sets, rest and per-exercise transitions. */
export function estimateMinutes(day: RoutineDay): number {
  let seconds = 0;
  // Supersetted exercises alternate, so their rest is spent doing the other movement. Count each
  // superset group's rest ONCE rather than once per member.
  const countedGroups = new Set<number>();
  for (const ex of day.exercises) {
    seconds += SECONDS_PER_EXERCISE + ex.sets * SECONDS_PER_SET;
    if (ex.superset_group !== null) {
      if (countedGroups.has(ex.superset_group)) continue;
      countedGroups.add(ex.superset_group);
    }
    seconds += ex.sets * ex.rest_seconds;
  }
  return Math.max(1, Math.round(seconds / 60));
}

/* ═══════════════════════════════════════════════════════════════════════════ the condenser ══ */

/** Time budgets offered in the picker. */
export const QUICK_BUDGETS = [20, 35, 50] as const;
export type QuickBudget = (typeof QUICK_BUDGETS)[number];

/**
 * Compress a whole split into one full-body day inside `budgetMinutes`.
 *
 * Breadth beats depth here: one exercise per movement pattern (best example across the split, by
 * position — the generator already ordered each day hardest-first), then supersets on
 * non-competing neighbours, then a set trim if it still does not fit, and only then do the
 * lowest-priority patterns get dropped. Nothing is trimmed below 2 sets, which is the per-exercise
 * strength floor in Iversen et al.
 */
export function condenseToFullBody(routine: Routine, budgetMinutes: number): RoutineDay {
  // Best exercise per pattern — earliest position across the split wins (compounds lead each day).
  const bestByPattern = new Map<string, RoutineExercise>();
  for (const day of routine.days) {
    for (const ex of day.exercises) {
      const pattern = patternOf(ex);
      const held = bestByPattern.get(pattern);
      if (!held || ex.position < held.position) bestByPattern.set(pattern, ex);
    }
  }

  let picked = FULL_BODY_PRIORITY.map((p) => bestByPattern.get(p)).filter(
    (e): e is RoutineExercise => Boolean(e),
  );
  // Patterns the split uses that the priority list does not know about — keep them, last.
  for (const [pattern, ex] of bestByPattern) {
    if (!FULL_BODY_PRIORITY.includes(pattern)) picked.push(ex);
  }

  // Superset non-competing neighbours. Alternating pairs is where the minutes come back.
  const groups = new Map<string, number>();
  let group = 1;
  for (let i = 0; i < picked.length - 1; i++) {
    const a = picked[i]!;
    const b = picked[i + 1]!;
    if (groups.has(a.id) || groups.has(b.id)) continue;
    if (competes(patternOf(a), patternOf(b))) continue;
    groups.set(a.id, group);
    groups.set(b.id, group);
    group += 1;
  }

  const build = (rows: RoutineExercise[], setCap: number): RoutineDay => ({
    id: 'quick',
    day_index: 0,
    name: 'Full body express',
    focus: 'full_body',
    weekday: null,
    exercises: rows.map((ex, i) => ({
      ...ex,
      id: `quick-${i}`,
      position: i,
      sets: Math.max(2, Math.min(ex.sets, setCap)),
      // Supersetted work needs less inter-set rest because the pair provides it.
      rest_seconds: groups.has(ex.id) ? Math.min(ex.rest_seconds, 60) : ex.rest_seconds,
      superset_group: groups.get(ex.id) ?? null,
    })),
  });

  // Trim in the order that costs the least: sets first (3 → 2), then the tail of the priority list.
  for (const setCap of [4, 3, 2]) {
    const candidate = build(picked, setCap);
    if (estimateMinutes(candidate) <= budgetMinutes) return candidate;
  }
  while (picked.length > 3) {
    picked = picked.slice(0, -1);
    const candidate = build(picked, 2);
    if (estimateMinutes(candidate) <= budgetMinutes) return candidate;
  }
  // Floor: three compounds at two sets. Shorter than this is not a workout, and the picker shows
  // the real estimate rather than pretending it fits.
  return build(picked, 2);
}

/* ═════════════════════════════════════════════════════════════════════════════ the options ══ */

export type QuickKind = 'pull-forward' | 'isolate' | 'condense';

export interface QuickOption {
  kind: QuickKind;
  /** stable id for test hooks and React keys */
  id: string;
  title: string;
  /** one line of "what this actually is" */
  subtitle: string;
  /** estimated wall-clock minutes */
  minutes: number;
  /** the session itself — a real routine day */
  day: RoutineDay;
}

/**
 * The next scheduled day AFTER today, searching forward through the week. Days without a weekday
 * fall back to their order in the split, so an unscheduled routine still yields "the next one".
 */
export function nextScheduledDay(routine: Routine, todayWeekday = blueprintWeekday()): {
  day: RoutineDay;
  weekday: number | null;
} | null {
  const scheduled = routine.days.filter((d) => d.weekday !== null);
  if (scheduled.length > 0) {
    for (let step = 1; step <= 7; step++) {
      const wd = (todayWeekday + step) % 7;
      const hit = scheduled.find((d) => d.weekday === wd);
      if (hit) return { day: hit, weekday: wd };
    }
  }
  const first = routine.days[0];
  return first ? { day: first, weekday: first.weekday } : null;
}

/** Everything the picker offers, in the order it should be shown. */
export function quickOptions(
  routine: Routine,
  budget: QuickBudget,
  todayWeekday = blueprintWeekday(),
): QuickOption[] {
  const out: QuickOption[] = [];
  const todaysDay = routine.days.find((d) => d.weekday === todayWeekday) ?? null;

  const next = nextScheduledDay(routine, todayWeekday);
  // Only offer "pull forward" when it means something: there must be a NEXT day distinct from
  // whatever is already scheduled today.
  if (next && next.day.id !== todaysDay?.id) {
    const label = next.weekday !== null ? WEEKDAY_LABELS[next.weekday] : 'Next';
    out.push({
      kind: 'pull-forward',
      id: `pull-${next.day.id}`,
      title: `Pull ${label}'s session forward`,
      subtitle: `${next.day.name} — done today, so tomorrow is free`,
      minutes: estimateMinutes(next.day),
      day: { ...next.day, id: 'quick' },
    });
  }

  const condensed = condenseToFullBody(routine, budget);
  out.push({
    kind: 'condense',
    id: 'condense',
    title: 'Condense the split into one full-body',
    subtitle: `${condensed.exercises.length} movements from across ${routine.name}, supersetted to fit`,
    minutes: estimateMinutes(condensed),
    day: condensed,
  });

  for (const day of routine.days) {
    if (next && day.id === next.day.id) continue;
    out.push({
      kind: 'isolate',
      id: `isolate-${day.id}`,
      title: day.name,
      subtitle: `Run this ${routine.name} day on its own`,
      minutes: estimateMinutes(day),
      day: { ...day, id: 'quick' },
    });
  }

  return out;
}
