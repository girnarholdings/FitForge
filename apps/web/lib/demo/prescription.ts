'use client';

/**
 * WHAT A DAY ACTUALLY PRESCRIBES — one implementation, read by every screen that quotes a number.
 *
 * The bug this module exists to make impossible: the Workouts screen advertised "20 sets · ~49 min"
 * for a session the player then ran as "0/18 sets", and the weekly volume bars said Chest 8/14 =
 * 57% for a week in which the athlete would actually perform 6/14 = 43%. Three surfaces were each
 * reading `row.sets` straight off the routine row while a fourth (the player) ran the scheme's
 * capped prescription. The scheme was real in one place and a label everywhere else.
 *
 * So the rule is now: NOTHING outside this module may read `row.sets` as "how many sets get done".
 * `row.sets` is what the row ASKED for; `RowPlan.prescription.sets.length` is what the athlete
 * performs, and the gap between them is `droppedSets`, which is stated on screen rather than
 * silently swallowed.
 *
 * It also owns the WARM-UP RAMP for a day, because a ramp's size depends on POSITION — a lat
 * pulldown after bent-over rows does not need the same four steps as the first lift of the session
 * — and position is a property of the day, not of the row. The player renders these ramps and the
 * minute estimate counts them; both call this, so they cannot disagree.
 */
import {
  prescribeSets,
  warmupRamp,
  DEFAULT_PROGRESSION_SCHEME,
  type Prescription,
  type ProgressionScheme,
  type WarmupSet,
} from '@fitforge/shared/rules';
import type { ExperienceLevel } from '@fitforge/shared/types';
import {
  mockExerciseById,
  type RoutineDay,
  type RoutineExercise,
} from '@/components/features/_mock/data';

/**
 * Equipment that actually CARRIES LOAD. Everything else in the catalog — a pull-up bar, a dip
 * station, a bench, a plyo box — is support: it holds you up, it does not add kilos.
 *
 * This is how the app knows a percentage would be a lie. On a chin-up it once printed
 * "Set 2 · 10 reps · 90%" beside a 0 kg weight field, because `suggestedLoadKg(null, 90)` returns
 * null and the placeholder fell through to zero. You cannot do 90% of your bodyweight.
 *
 * LIVES HERE, not in the player, because the minute estimate and the volume accounting need the
 * same answer: a bodyweight movement gets a one-step ramp, a loaded compound gets three or four,
 * and a card that guessed differently from the player would mis-state the session length.
 */
const LOADABLE_EQUIPMENT = new Set([
  'barbell',
  'dumbbell',
  'kettlebell',
  'weight-plates',
  'ez-curl-bar',
  'medicine-ball',
  'resistance-bands',
  'cable-machine',
  'lat-pulldown',
  'leg-press',
  'hack-squat-machine',
  'chest-press-machine',
  'shoulder-press-machine',
  'seated-row-machine',
  'leg-curl-machine',
  'leg-extension-machine',
  'calf-raise-machine',
  'hip-thrust-machine',
  'pec-deck',
  'rowing-machine',
  'stationary-bike',
  'treadmill',
]);

/** True when nothing in the movement's equipment can hold a plate — chin-ups, dips, push-ups. */
export function isBodyweightOnly(exerciseId: string): boolean {
  const full = mockExerciseById(exerciseId);
  if (!full) return false;
  return full.equipment.every((group) => group.slugs.every((s) => !LOADABLE_EQUIPMENT.has(s)));
}

/** Everything one routine row becomes once a scheme and a running order are applied to it. */
export interface RowPlan {
  row: RoutineExercise;
  /** per-set targets under the scheme — `sets.length` is the count actually performed */
  prescription: Prescription;
  /** the warm-up steps for this row, sized by its position in the day. Never working sets. */
  ramp: WarmupSet[];
  /** true when an earlier row already trained this pattern or a shared primary muscle */
  patternAlreadyWarm: boolean;
}

/**
 * Is this movement's pattern already warm, given everything performed before it today?
 *
 * TWO signals, because either one on its own misses the obvious case. Matching the MOVEMENT PATTERN
 * catches bench → incline press. Matching a PRIMARY MUSCLE catches bent-over row → lat pulldown,
 * which are different patterns (horizontal vs vertical pull) landing on the same already-fatigued
 * lats. Secondary muscles are deliberately NOT consulted: almost everything picks up secondary
 * credit somewhere, so including them would mark the third exercise of every session warm and
 * quietly delete the ramp from lifts that genuinely still need it.
 */
function alreadyWarm(
  exerciseId: string,
  seenPatterns: ReadonlySet<string>,
  seenPrimaries: ReadonlySet<string>,
): boolean {
  const ex = mockExerciseById(exerciseId);
  if (!ex) return false;
  if (seenPatterns.has(ex.movement_pattern)) return true;
  return ex.primary_muscles.some((slug) => seenPrimaries.has(slug));
}

/**
 * The whole day, prescribed.
 *
 * Rows are walked in POSITION order (the generator already sorts each day hardest-first) because
 * the ramp taper depends on what came before. The returned array is in that same order, so a caller
 * that needs the routine's original order should key off `row.id` rather than the index.
 *
 * `scheme` is optional and defaults to straight sets — the app-wide default — so a caller with no
 * store access (a static preview, a test) gets the untrimmed shape rather than a crash.
 */
export function dayPrescriptions(
  day: RoutineDay,
  scheme: ProgressionScheme = DEFAULT_PROGRESSION_SCHEME,
  experience: ExperienceLevel = 'beginner',
): RowPlan[] {
  const rows = [...day.exercises].sort((a, b) => a.position - b.position);
  const seenPatterns = new Set<string>();
  const seenPrimaries = new Set<string>();
  const out: RowPlan[] = [];

  for (const row of rows) {
    const ex = mockExerciseById(row.exercise_id);
    const warm = alreadyWarm(row.exercise_id, seenPatterns, seenPrimaries);
    const prescription = prescribeSets(
      {
        sets: row.sets,
        rep_min: row.rep_min,
        rep_max: row.rep_max,
        target_rpe: row.target_rpe,
        mechanics: ex?.mechanics ?? null,
        isBodyweight: isBodyweightOnly(row.exercise_id),
        experience,
      },
      scheme,
    );
    out.push({
      row,
      prescription,
      // `topSetKg` is deliberately absent: the kilos beside a ramp step follow whatever the athlete
      // has typed into working set 1 RIGHT NOW, which only the player knows. Every consumer of this
      // function needs the ramp's LENGTH (for the minute estimate and the warm-up list), and the
      // player recomputes the loads itself against the live value.
      ramp: warmupRamp({
        mechanics: ex?.mechanics ?? null,
        scheme,
        isBodyweight: prescription.isBodyweight,
        targetReps: prescription.sets[0]?.reps ?? null,
        patternAlreadyWarm: warm,
      }),
      patternAlreadyWarm: warm,
    });

    if (ex) {
      seenPatterns.add(ex.movement_pattern);
      for (const slug of ex.primary_muscles) seenPrimaries.add(slug);
    }
  }
  return out;
}

/** Working sets the athlete will actually perform in this day under `scheme`. */
export function performedSetCount(
  day: RoutineDay,
  scheme?: ProgressionScheme,
  experience?: ExperienceLevel,
): number {
  return dayPrescriptions(day, scheme, experience).reduce(
    (n, p) => n + p.prescription.sets.length,
    0,
  );
}
