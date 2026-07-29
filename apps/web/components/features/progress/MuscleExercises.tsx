'use client';

/**
 * The "what's behind this number" panel for the Progress heat map (§2.3).
 *
 * Tapping a body part on the weekly-goal heat map answers "how much?" — this panel answers the
 * immediate next question, "from WHAT?": every exercise that landed sets on the selected muscle,
 * from the same source the map is showing (last 7 days of logged sets, or the active routine's
 * planned week). It renders BETWEEN the heat card and the Trends tabs, so opening it pushes the
 * rest of the page down rather than covering anything.
 *
 * Honesty rules match the rest of Progress: the logged source only counts the same 7-day window
 * `setsPerMuscleLast7Days` counts, credit is stated per row (primary +1.0/set, secondary
 * +0.5/set — the exact weighting the heat map is built from), and an untrained muscle gets an
 * empty state that says so instead of a fabricated suggestion list.
 */
import * as React from 'react';
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui';
import { BodyIcon, ChevronRightIcon } from '@/components/ui/icons';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { slugForExercise } from '@/lib/equipment/slugForExercise';
import { MUSCLE_NAMES } from '@/components/illustrations';
import type { MuscleSlug } from '@/components/illustrations';
import type { WorkoutSession } from '@/components/features/shared/workoutLog';
import { fmtSets } from '@/components/features/shared/volumeMath';
import { mockExerciseBySlug, type Routine } from '@/components/features/_mock/data';

export interface MuscleExerciseRow {
  exercise_id: string;
  slug: string;
  name: string;
  role: 'primary' | 'secondary';
  /** raw sets in the window (not credit-weighted) */
  sets: number;
  /** sets × credit — the number that actually feeds the heat map */
  weighted: number;
  /** where the sets came from: "3 sessions" or the routine day names */
  detail: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Exercises that hit `muscle` in the last 7 days of logged sessions — the heat map's window. */
export function loggedMuscleExercises(
  sessions: WorkoutSession[],
  muscle: MuscleSlug,
): MuscleExerciseRow[] {
  const cutoff = Date.now() - 7 * DAY_MS;
  const acc = new Map<
    string,
    { exercise_id: string; name: string; role: 'primary' | 'secondary'; sets: number; visits: number }
  >();
  for (const sess of sessions) {
    const t = new Date(sess.finishedAt).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    for (const ex of sess.exercises) {
      const n = ex.sets.length;
      if (n === 0) continue;
      const role = ex.primary_muscles.includes(muscle)
        ? 'primary'
        : ex.secondary_muscles.includes(muscle)
          ? 'secondary'
          : null;
      if (!role) continue;
      const cur = acc.get(ex.exercise_slug) ?? {
        exercise_id: ex.exercise_id,
        name: ex.exercise_name,
        role,
        sets: 0,
        visits: 0,
      };
      cur.sets += n;
      cur.visits += 1;
      acc.set(ex.exercise_slug, cur);
    }
  }
  return finishRows(
    [...acc.entries()].map(([slug, r]) => ({
      exercise_id: r.exercise_id,
      slug,
      name: r.name,
      role: r.role,
      sets: r.sets,
      detail: `${r.visits} session${r.visits === 1 ? '' : 's'}`,
    })),
  );
}

/** Exercises in the active routine's planned week that hit `muscle` (catalog-resolved). */
export function plannedMuscleExercises(routine: Routine, muscle: MuscleSlug): MuscleExerciseRow[] {
  const acc = new Map<
    string,
    { exercise_id: string; name: string; role: 'primary' | 'secondary'; sets: number; days: string[] }
  >();
  for (const day of routine.days) {
    for (const row of day.exercises) {
      const ex = mockExerciseBySlug(row.exercise_slug);
      if (!ex) continue;
      const role = ex.primary_muscles.includes(muscle)
        ? 'primary'
        : ex.secondary_muscles.includes(muscle)
          ? 'secondary'
          : null;
      if (!role) continue;
      const cur = acc.get(row.exercise_slug) ?? {
        exercise_id: row.exercise_id,
        name: row.exercise_name,
        role,
        sets: 0,
        days: [],
      };
      cur.sets += row.sets;
      if (!cur.days.includes(day.name)) cur.days.push(day.name);
      acc.set(row.exercise_slug, cur);
    }
  }
  return finishRows(
    [...acc.entries()].map(([slug, r]) => ({
      exercise_id: r.exercise_id,
      slug,
      name: r.name,
      role: r.role,
      sets: r.sets,
      detail: r.days.length > 2 ? `${r.days.length} days` : r.days.join(' · '),
    })),
  );
}

/** Weight, then sort: primary movers first, then by contribution — the heat map's own order. */
function finishRows(rows: Omit<MuscleExerciseRow, 'weighted'>[]): MuscleExerciseRow[] {
  return rows
    .map((r) => ({ ...r, weighted: r.role === 'primary' ? r.sets : r.sets * 0.5 }))
    .sort(
      (a, b) =>
        (a.role === 'primary' ? 0 : 1) - (b.role === 'primary' ? 0 : 1) ||
        b.weighted - a.weighted ||
        a.name.localeCompare(b.name),
    );
}

export function MuscleExercisesPanel({
  muscle,
  source,
  sessions,
  routine,
  onClose,
}: {
  muscle: MuscleSlug;
  source: 'logged' | 'planned';
  sessions: WorkoutSession[];
  routine: Routine;
  onClose: () => void;
}) {
  const name = MUSCLE_NAMES[muscle];
  const rows = React.useMemo(
    () =>
      source === 'logged'
        ? loggedMuscleExercises(sessions, muscle)
        : plannedMuscleExercises(routine, muscle),
    [source, sessions, routine, muscle],
  );
  const weightedTotal = rows.reduce((n, r) => n + r.weighted, 0);

  return (
    // `flat` on purpose: the caller height-animates this card inside an overflow-hidden wrapper,
    // which would clip a drop shadow into a hard edge. The border alone carries the surface.
    <Card flat className="!p-0" data-testid="muscle-exercises">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-accent">
          <BodyIcon size={18} />
          <div className="min-w-0">
            <CardTitle className="truncate">{name} exercises</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground" data-testid="muscle-exercises-context">
              {source === 'logged' ? (
                <>Your last 7 days of logged sets.</>
              ) : (
                <>
                  What <span className="font-semibold text-foreground">{routine.name}</span> plans
                  for a week.
                </>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="muscle-exercises-close"
          aria-label={`Hide ${name} exercises`}
          className="shrink-0 rounded-chip border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          Hide
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-semibold text-foreground">
            {source === 'logged'
              ? `Nothing hit your ${name.toLowerCase()} in the last 7 days.`
              : `${routine.name} has no exercise that hits your ${name.toLowerCase()}.`}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {source === 'logged'
              ? 'Sets land here the moment a logged exercise trains this muscle — directly or as support.'
              : 'If this muscle matters to you, add an accessory for it to your plan.'}
          </p>
          <Link
            href="/exercises"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent"
          >
            Browse exercises <ChevronRightIcon size={14} />
          </Link>
        </div>
      ) : (
        <>
          <ul>
            {rows.map((r) => (
              <li key={r.slug} className="border-b border-border last:border-b-0">
                <Link
                  href={`/exercises/${r.slug}`}
                  data-testid={`muscle-exercise-row-${r.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <EquipmentIllustration
                      slug={slugForExercise(r.exercise_id, 'barbell')}
                      size={18}
                      className="shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {r.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {r.role === 'primary' ? 'Primary mover' : 'Support'} · {r.detail}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-right">
                    <span>
                      <span className="block font-display text-base font-bold tabular-nums text-accent">
                        {fmtSets(r.sets)}
                        <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                          sets
                        </span>
                      </span>
                      <span className="block text-[11px] tabular-nums text-muted-foreground">
                        +{fmtSets(r.weighted)} to {name}
                      </span>
                    </span>
                    <ChevronRightIcon size={14} className="text-muted-foreground" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
            <span className="tabular font-semibold text-foreground">{fmtSets(weightedTotal)}</span>{' '}
            weighted sets on {name} — each set counts{' '}
            <span className="font-semibold text-foreground">1.0</span> from a primary mover,{' '}
            <span className="font-semibold text-foreground">0.5</span> from support work. Tap an
            exercise for its how-to.
          </p>
        </>
      )}
    </Card>
  );
}
