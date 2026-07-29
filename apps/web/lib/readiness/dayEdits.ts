/**
 * DAY EDITS — turn an adapt action (rules-engine or AI) into a REAL RoutineDay.
 *
 * The whole trick of the dynamic-split feature is that its output is not advice, it is a day the
 * existing machinery already understands: the player runs it, the volume heat map counts it and
 * the logger stores it with zero changes, because `setQuickSession` has accepted ad-hoc days
 * since the quick-workout picker shipped. These builders are the same idea as `lib/demo/quick`'s
 * condense — extension, not invention.
 *
 * Pure functions: day in, new day out, nothing stored here.
 */
import type { RoutineDay, RoutineExercise } from '@/components/features/_mock/data';
import type { AdaptAction } from './engine';

/** One optional exercise swap, already validated against the app's own substitution candidates. */
export interface AdaptSwap {
  from_slug: string;
  to_slug: string;
  to_name: string;
  to_id: string;
}

function cloneWith(
  day: RoutineDay,
  suffix: string,
  map: (e: RoutineExercise) => RoutineExercise,
): RoutineDay {
  return {
    ...day,
    id: `adapt-${day.id}`,
    name: `${day.name} · ${suffix}`,
    exercises: day.exercises.map(map),
  };
}

/** Half the sets (never below 2): the "show up, spend less" day. */
export function reduceDay(day: RoutineDay): RoutineDay {
  return cloneWith(day, 'reduced', (e) => ({
    ...e,
    sets: Math.max(2, Math.floor(e.sets / 2)),
  }));
}

/**
 * Technique day: two easy sets per movement at RPE 6 — grease the patterns, add nothing to the
 * recovery bill. Load guidance rides the notes field so the player shows it on every exercise.
 */
export function techniqueDay(day: RoutineDay): RoutineDay {
  return cloneWith(day, 'technique', (e) => ({
    ...e,
    sets: Math.min(e.sets, 2),
    target_rpe: 6,
    notes: e.notes ? `${e.notes} · Light — leave 4+ reps in the tank.` : 'Light — leave 4+ reps in the tank.',
  }));
}

/** Apply validated swaps (from the AI path) to a day, keeping the row's prescription. */
export function applySwaps(day: RoutineDay, swaps: AdaptSwap[]): RoutineDay {
  if (swaps.length === 0) return day;
  const bySlug = new Map(swaps.map((s) => [s.from_slug, s]));
  return {
    ...day,
    exercises: day.exercises.map((e) => {
      const swap = bySlug.get(e.exercise_slug);
      if (!swap) return e;
      return {
        ...e,
        exercise_id: swap.to_id,
        exercise_slug: swap.to_slug,
        exercise_name: swap.to_name,
        image_path: null,
      };
    }),
  };
}

/**
 * The one entry point the UI calls: action + optional swaps → the day to hand to
 * `setQuickSession`, or `null` when the action is rest (there is nothing to start).
 */
export function buildAdaptedDay(
  day: RoutineDay,
  action: AdaptAction,
  swaps: AdaptSwap[] = [],
): RoutineDay | null {
  const base = applySwaps(day, swaps);
  switch (action) {
    case 'proceed':
      return swaps.length > 0 ? { ...base, id: `adapt-${day.id}`, name: `${day.name} · adjusted` } : null;
    case 'reduce':
      return reduceDay(base);
    case 'technique':
      return techniqueDay(base);
    case 'rest':
      return null;
  }
}
