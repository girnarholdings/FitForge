'use client';

/**
 * SESSION INSIGHTS — the derived answer to "what IS this session?", in one place.
 *
 * The Workouts surface used to offer a day's name and a Start link, which asks the athlete to
 * commit to an hour of work they cannot see. A coach handing over a session says four things
 * first: what it trains, how many hard sets it costs, roughly how long it takes, and which
 * movement patterns it covers. Those four numbers now come from HERE, so the routine list, the
 * routine editor and anything built on them can never quote different figures for the same day.
 *
 * NOTHING is computed from scratch in this module. Every number is composed from the existing
 * canonical implementation:
 *   · sets per muscle  → `aggregateSets` (primary 1.0 / secondary 0.5, the app-wide currency)
 *   · wall-clock time  → `estimateMinutes` (already accounts for supersets and transitions)
 *   · movement patterns→ `dayPatternLabels` (the same label table `describeDay` uses)
 * A second implementation of any of those is how two screens end up disagreeing about the same
 * plan, which is exactly the class of "erroneous entry" this app exists not to ship.
 *
 * Client-only because `estimateMinutes` lives in a `'use client'` module.
 */
import {
  mockExerciseById,
  type Routine,
  type RoutineDay,
} from '@/components/features/_mock/data';
import { MUSCLE_NAMES } from '@/components/illustrations';
import type { MuscleSlug } from '@/components/illustrations';
import { aggregateSets, type VolumeSource } from '@/components/features/shared/MuscleVolume';
import type { WorkoutSession } from '@/components/features/shared/workoutLog';
import { estimateMinutes, estimatePrepSeconds } from './quick';
import { dayPatternLabels } from './generate';
import { dayPrescriptions } from './prescription';
import type { ProgressionScheme } from '@fitforge/shared/rules';
import type { ExperienceLevel } from '@fitforge/shared/types';

/* ────────────────────────────────────────────────────────────────────────────── pluralisation */

/**
 * "1 set" / "12 sets". Trivial, and that is the point: `${n} sets` written inline is how
 * "1 exercises" shipped once already (see the regression test that now guards /routines).
 */
export function setCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'set' : 'sets'}`;
}

/** "1 muscle" / "9 muscles". */
export function muscleCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'muscle' : 'muscles'}`;
}

/** "1 day" / "4 days". */
export function dayCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/* ─────────────────────────────────────────────────────────────────────────────── attribution */

/**
 * The canonical routine-row → volume-source shape. Copied nowhere: `ExerciseCatalog` and
 * `ProgressView` both already build exactly this, so the Workouts screen's "what this hits" is
 * guaranteed to agree with the numbers on Progress and Exercises.
 *
 * SCHEME-AWARE, and this is the fix for the worst number in the app. `e.sets` is what the ROW asked
 * for; a scheme with a working-set cap (reverse pyramid runs three, full stop) performs fewer. With
 * the row count, a reverse-pyramid week reported "Chest 8/14 · 57%" for a week in which bench and
 * incline press each drop 4→3 and the athlete actually performs 6/14 = 43%. Every downstream
 * surface inherits this function — MuscleVolume, the heatmap, PlanTargets, SessionSummary,
 * SplitDetail — so a confidently wrong percentage appeared on the exact screen the volume-
 * calibration feature exists to serve.
 *
 * With NO scheme passed the row count is used verbatim, exactly as before, so every scheme-unaware
 * caller keeps its current behaviour rather than silently switching to a straight-sets assumption.
 */
export function volumeSourcesForDay(
  day: RoutineDay,
  scheme?: ProgressionScheme,
  experience?: ExperienceLevel,
): VolumeSource[] {
  if (!scheme) return day.exercises.map((e) => ({ slug: e.exercise_slug, sets: e.sets }));
  return dayPrescriptions(day, scheme, experience).map((p) => ({
    slug: p.row.exercise_slug,
    sets: p.prescription.sets.length,
  }));
}

/** Every set in the routine, as one week's worth of sources. */
export function volumeSourcesForRoutine(
  routine: Routine,
  scheme?: ProgressionScheme,
  experience?: ExperienceLevel,
): VolumeSource[] {
  return routine.days.flatMap((d) => volumeSourcesForDay(d, scheme, experience));
}

/** One muscle's share of a session (or a week), in the weighted-set currency. */
export interface MuscleLoad {
  slug: MuscleSlug;
  name: string;
  /** weighted sets: 1.0 per set for a primary muscle, 0.5 for a secondary one */
  sets: number;
  /** of those, the sets from exercises that train this muscle DIRECTLY */
  direct: number;
}

/**
 * Muscles this work lands on, ranked, zero-volume muscles dropped.
 *
 * RANKED BY DIRECT VOLUME FIRST, and that ordering is the whole difference between a useful
 * answer and a misleading one. Ranking by TOTAL weighted sets sounds more sophisticated and is
 * wrong: a deadlift/carry/press day returns "Forearms, Abs, Lower back" at the top, because those
 * three collect half-set credit from almost everything, while the quads and glutes the session was
 * actually built around sit below the fold. No coach describes that session as a forearm day.
 *
 * So the ranking asks "what was this work CHOSEN to train" (direct sets, where the muscle is a
 * primary mover), and only falls back to total credit to break ties — which also handles the case
 * where nothing has a primary mover, e.g. a pure conditioning day. The number DISPLAYED stays the
 * total weighted count, because that is the currency Progress and the goal targets are in.
 */
export function muscleLoads(sources: VolumeSource[], weeks = 1): MuscleLoad[] {
  const { total, direct } = aggregateSets(sources, weeks);
  const out: MuscleLoad[] = [];
  for (const [slug, sets] of Object.entries(total) as [MuscleSlug, number][]) {
    if (sets > 0) out.push({ slug, name: MUSCLE_NAMES[slug], sets, direct: direct[slug] ?? 0 });
  }
  // name is the final tie-break purely so the order is stable across renders
  return out.sort(
    (a, b) => b.direct - a.direct || b.sets - a.sets || a.name.localeCompare(b.name),
  );
}

/** The two silhouette payloads: full-fill muscles and the wash behind them. */
export interface MusclePaint {
  /** muscles with DIRECT work — what `MuscleMapThumb` should light up in full */
  primary: MuscleSlug[];
  /** muscles that only pick up indirect credit — the secondary wash */
  secondary: MuscleSlug[];
}

/**
 * Ranked loads → the two arrays `MuscleMapThumb` takes.
 *
 * Extracted so a WEEK can be painted by exactly the rule that paints a DAY. The split detail lights
 * up "what this program trains" from `SplitPreview.loads`, and a day card lights up from
 * `DayStats.loads`; if those two ever used different thresholds, the same plan would show one
 * silhouette on the split card and another on the session card, which is the drift this module
 * exists to prevent. Directness is the threshold because that is the ranking rule too — see
 * {@link muscleLoads} for why "trained" means "chosen to be trained", not "collected half-credit".
 */
export function musclePaint(loads: readonly MuscleLoad[]): MusclePaint {
  return {
    primary: loads.filter((l) => l.direct > 0).map((l) => l.slug),
    secondary: loads.filter((l) => l.direct <= 0).map((l) => l.slug),
  };
}

/* ──────────────────────────────────────────────────────────────────────────── the anchor lift */

/** The lift a session is really built around — see {@link dayAnchor}. */
export interface DayAnchor {
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  sets: number;
  rep_min: number;
  rep_max: number;
}

/**
 * Patterns that can never BE the anchor lift, however hard they are.
 *
 * A treadmill run is a compound movement by the catalog's own classification, and on an intervals
 * day it is the first compound row — so the naive rule prints "Anchored by Jump Rope", which is a
 * category error: the anchor lift is the loaded movement you check your readiness against, and a
 * skipping rope is not one. Mobility and static stretching are excluded for the same reason from
 * the other end (World's Greatest Stretch is also classified compound). Everything else stays in,
 * including conditioning — a thruster or a wall ball genuinely IS the hard piece of its session.
 */
const NON_ANCHOR_PATTERNS = new Set(['cardio', 'mobility', 'static_stretch']);

/**
 * The hardest lift of the day, by name.
 *
 * "Leg day" and "squat day" are the same session and completely different decisions. The lift an
 * athlete checks their readiness against is the heavy compound at the front of the session, and it
 * is the single fact that most often decides whether they go — so it belongs on the card face,
 * beside the numbers, rather than three taps down inside the exercise list.
 *
 * DEFINITION: the first `compound` row in POSITION order, ignoring {@link NON_ANCHOR_PATTERNS}.
 * The generator already sorts each day hardest-first, so position order is doing real work here
 * rather than being a proxy — and because position is a total order there is never a tie to break.
 * (A tie-break on the athlete's own best logged e1RM was considered and deliberately not
 * implemented: it would only ever fire on a hand-edited day with two rows at the same position,
 * and inventing a rule for a state the editor cannot produce is how a plausible-but-wrong answer
 * gets shipped.)
 *
 * `null` on a day with no qualifying compound at all. An arms-and-abs day HAS no anchor lift, and
 * promoting a lateral raise to the role would be a confident wrong answer — print nothing instead.
 */
export function dayAnchor(day: RoutineDay): DayAnchor | null {
  const row = [...day.exercises].sort((a, b) => a.position - b.position).find((e) => {
    const ex = mockExerciseById(e.exercise_id);
    return (
      ex != null && ex.mechanics === 'compound' && !NON_ANCHOR_PATTERNS.has(ex.movement_pattern)
    );
  });
  if (!row) return null;
  return {
    exercise_id: row.exercise_id,
    exercise_slug: row.exercise_slug,
    exercise_name: row.exercise_name,
    sets: row.sets,
    rep_min: row.rep_min,
    rep_max: row.rep_max,
  };
}

/* ───────────────────────────────────────────────────────────────────────────────── equipment */

/**
 * Everything a day requires, in plain words — "Barbell, Weight Plates, Squat Rack".
 *
 * "What will I be queuing for at 6pm" is a scheduling fact, and until now it was only recoverable
 * by opening the day and reading every exercise name. UNCAPPED on purpose: this is the text answer
 * that lives inside the disclosure, where there is room, and a capped kit list is the one shape
 * that can send someone to a gym missing the thing they needed.
 *
 * The catalog's `equipment` is a list of REQUIREMENT SLOTS, and the slugs inside one slot are
 * interchangeable alternatives (`['dumbbell', 'kettlebell']`), so alternatives are joined with
 * "or" and slots with commas. An exercise that names no equipment contributes nothing, which is
 * how a bodyweight day correctly comes back empty rather than guessing a dumbbell.
 */
export function dayEquipmentNames(day: RoutineDay): string[] {
  const out: string[] = [];
  for (const row of day.exercises) {
    for (const group of mockExerciseById(row.exercise_id)?.equipment ?? []) {
      const label = group.names.join(' or ');
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────────── recency */

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (t: number): number => new Date(t).setHours(0, 0, 0, 0);

/**
 * "Last trained 5 days ago" / "Not trained yet" — the honest half of "am I recovered for this?".
 *
 * A recovery percentage or a readiness score would be an invented number wearing the clothes of a
 * measurement, so this reports the DATE and stops. No colour, no verdict: how recovered someone is
 * after five days is a judgement the athlete makes, and the app's job is to hand them the fact.
 *
 * Compared in CALENDAR days, not elapsed hours: a session finished at 8pm yesterday reads
 * "yesterday" at 9am today, which is what a human means by it — "0 days ago" would be nonsense.
 */
export function lastTrainedLabel(
  sessions: readonly WorkoutSession[],
  dayId: string,
  now: number = Date.now(),
): string {
  let latest = Number.NEGATIVE_INFINITY;
  for (const s of sessions) {
    if (s.dayId !== dayId) continue;
    const t = Date.parse(s.finishedAt);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  if (latest === Number.NEGATIVE_INFINITY) return 'Not trained yet';
  const days = Math.round((startOfDay(now) - startOfDay(latest)) / DAY_MS);
  if (days <= 0) return 'Last trained today';
  if (days === 1) return 'Last trained yesterday';
  return `Last trained ${days} days ago`;
}

/* ───────────────────────────────────────────────────────────────────────────────── one day */

export interface DayStats {
  exerciseCount: number;
  /**
   * Hard sets the athlete will actually PERFORM — the honest cost of the session.
   *
   * Not what the rows add up to: under a capped scheme those differ, and this is the number every
   * surface quotes (the card chip, the week rollup, the per-muscle attribution), so it has to be
   * the one the player's `0/N sets` counter also shows.
   */
  setCount: number;
  /** what the ROWS asked for, before any scheme cap — only ever shown beside {@link droppedSets} */
  prescribedSetCount: number;
  /** prescribed sets the scheme will not run; 0 under straight sets, which is everyone's default */
  droppedSets: number;
  /** estimated wall-clock minutes INCLUDING the warm-up ramps, or 0 for an empty day */
  minutes: number;
  /** of {@link minutes}, the part spent on warm-up ramps — surfaced so the total is inspectable */
  prepMinutes: number;
  /** every movement pattern the day covers, unabridged, in performance order */
  patterns: string[];
  /** ranked muscle loads (weighted sets), heaviest first */
  loads: MuscleLoad[];
  /** muscles with DIRECT work — what the silhouette should light up in full */
  primary: MuscleSlug[];
  /** muscles that only pick up indirect credit — the secondary wash on the silhouette */
  secondary: MuscleSlug[];
  /** the heavy lift the session is built around, or `null` — see {@link dayAnchor} */
  anchor: DayAnchor | null;
  /** everything the day requires, in plain words — see {@link dayEquipmentNames} */
  equipment: string[];
  /** nothing scheduled: a rest day, or a day the generator could not fill */
  empty: boolean;
}

/**
 * Everything a session card needs, computed once.
 *
 * A generated day is allowed to be EMPTY (rest, or an equipment-starved plan), so every field
 * here is defined for a zero-exercise day — `minutes` reports 0 rather than `estimateMinutes`'
 * one-minute floor, because "~1 min" on a rest day is a wrong number, not a small one.
 */
export function dayStats(
  day: RoutineDay,
  scheme?: ProgressionScheme,
  experience?: ExperienceLevel,
): DayStats {
  const sources = volumeSourcesForDay(day, scheme, experience);
  const loads = muscleLoads(sources);
  const prescribedSetCount = day.exercises.reduce((n, e) => n + Math.max(0, e.sets), 0);
  // The performed count and the attribution above come from the SAME sources array, so the chip on
  // the card face and the per-muscle bars underneath it can never quote different set counts.
  const setCount = sources.reduce((n, s) => n + Math.max(0, s.sets), 0);
  const empty = day.exercises.length === 0;
  return {
    exerciseCount: day.exercises.length,
    setCount,
    prescribedSetCount,
    droppedSets: Math.max(0, prescribedSetCount - setCount),
    minutes: empty ? 0 : estimateMinutes(day, scheme, experience),
    prepMinutes: empty ? 0 : Math.round(estimatePrepSeconds(day, scheme, experience) / 60),
    patterns: dayPatternLabels(day),
    loads,
    ...musclePaint(loads),
    anchor: dayAnchor(day),
    equipment: dayEquipmentNames(day),
    empty,
  };
}

/**
 * The union of a day's directly-trained muscles, ranked by volume — the `primary` payload for
 * `MuscleMapThumb`.
 *
 * `PlanPreviewStep` used to carry a private `dayPrimaryMuscles` computing the same union unranked
 * and with no secondary wash; it now reads `dayStats` like everything else, so the plan preview,
 * the routine list and the split detail cannot light up different muscles for the same day. Keep
 * it that way — a second copy of this rule is exactly how those three screens would drift apart.
 */
export function dayMuscles(day: RoutineDay): MuscleSlug[] {
  return dayStats(day).primary;
}

/* ──────────────────────────────────────────────────────────────────────────── a whole week */

export interface RoutineStats {
  /** days that actually contain work — rest days are not training days */
  trainingDays: number;
  exerciseCount: number;
  /** hard sets actually PERFORMED across the week, under the scheme in force */
  setCount: number;
  /** what the rows asked for, before any scheme cap */
  prescribedSetCount: number;
  /** prescribed sets the scheme will not run across the week */
  droppedSets: number;
  /** estimated minutes across the whole week, warm-up ramps included */
  minutes: number;
  /** of {@link minutes}, the part spent on warm-up ramps */
  prepMinutes: number;
  /** ranked weekly muscle loads */
  loads: MuscleLoad[];
}

/**
 * The same four questions, asked of the whole week.
 *
 * Composed from {@link dayStats} rather than re-summing the rows, so the week headline and the day
 * chips underneath it are arithmetically the same number by construction. They were not: the header
 * read "79 sets a week · about 196 min" identically under all three schemes while the player ran 18
 * of a day's 20.
 */
export function routineStats(
  routine: Routine,
  scheme?: ProgressionScheme,
  experience?: ExperienceLevel,
): RoutineStats {
  const days = routine.days.map((d) => dayStats(d, scheme, experience));
  const sum = (pick: (s: DayStats) => number): number => days.reduce((n, s) => n + pick(s), 0);
  return {
    trainingDays: days.filter((s) => !s.empty).length,
    exerciseCount: sum((s) => s.exerciseCount),
    setCount: sum((s) => s.setCount),
    prescribedSetCount: sum((s) => s.prescribedSetCount),
    droppedSets: sum((s) => s.droppedSets),
    minutes: sum((s) => s.minutes),
    prepMinutes: sum((s) => s.prepMinutes),
    loads: muscleLoads(volumeSourcesForRoutine(routine, scheme, experience)),
  };
}
