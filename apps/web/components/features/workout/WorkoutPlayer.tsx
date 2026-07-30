'use client';

/**
 * Workout player (§2.3 · WS-F). One exercise per screen (pager); a specific WARM-UP RAMP in the
 * movement being trained; PER-SET targets from the athlete's progression scheme; set list with
 * last-session values ghosted in as defaults; plate calculator; quick-swap to substitutes; and the
 * P0-5 rest timer — auto-starts on set completion, sized by the ROUTINE ROW's own `rest_seconds`,
 * editable in ±15s steps, skippable, big gold countdown, and dims everything but the active set
 * while it runs. Finishing persists the session (WS-F workoutLog) so the heatmap, PRs and streaks
 * update, and PRs beaten in-session fire the gold spark.
 *
 * TWO RULES THIS FILE MUST NEVER BREAK:
 *
 *  1. WARM-UP RAMPS ARE NOT SETS. They live in their own list with their own `warmup-row-N`
 *     testids, they are excluded from `totalSets`/`doneSets`, and they are never written to the
 *     logged session. The app's entire training currency is HARD SETS per muscle per week,
 *     calibrated against the Pelland / Baz-Valle bands — a ramp leaking into that count would
 *     silently inflate every weekly goal reading, every heat colour and every PlanTargets bar in
 *     the app. (It would also renumber every `set-row-N` the Playwright suite addresses.)
 *
 *  2. REST COMES FROM THE ROW. `routineExercise.rest_seconds` is goal-aware — a hypertrophy
 *     compound rests 90s, not 150s — and this file used to ignore it in favour of a mechanics
 *     constant, so the session card's minute estimate, the header text and the timer that actually
 *     ran were three different numbers for the same session.
 */
import * as React from 'react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardTitle,
  Sheet,
  ProgressBar,
  PlateStepper,
  CollarLatch,
} from '@/components/ui';
import {
  PlateIcon,
  CheckIcon,
  SwapIcon,
  TimerIcon,
  MedalIcon,
  SparkIcon,
  XIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  DumbbellIcon,
  HammerIcon,
} from '@/components/ui/icons';
import { haptic } from '@/components/ui/motion';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { slugForExercise } from '@/lib/equipment/slugForExercise';
import { SubstituteSheet } from '@/components/features/shared/SubstituteSheet';
import { GlossaryTerm } from '@/components/features/shared/GlossaryTerm';
import { SetField, SetFieldCell } from './SetField';
import { FirstSetExplainer, FIRST_SET_EXPLAINER_ID } from './FirstSetExplainer';
import { dismissExplainer } from '@/components/features/shared/explainers';
import {
  mockPreviousSets,
  mockExerciseById,
  type RoutineDay,
  type RoutineExercise,
  type SubstituteRow,
  type Mechanics,
} from '@/components/features/_mock/data';
import type { SetTarget } from '@fitforge/shared/rules';
import { ProgressionEvidenceNote } from '@/components/features/shared/ProgressionEvidence';
import { useActiveRoutine, useDemoState } from '@/lib/demo/useDemo';
import { resolveProgressionScheme, setProgressionScheme } from '@/lib/demo/store';
import { isBodyweightOnly, dayPrescriptions } from '@/lib/demo/prescription';
import { prepForDay, PREP_EVIDENCE, type PrepItem } from '@/lib/demo/prep';
import { dayStats } from '@/lib/demo/insights';
import {
  prescribeSets,
  restSecondsForSet,
  schemeCaution,
  suggestedLoadKg,
  trimNoticeFor,
  warmupRamp,
  type Prescription,
  type ProgressionScheme,
  type WarmupSet,
} from '@fitforge/shared/rules';
import type { ExperienceLevel } from '@fitforge/shared/types';
import {
  logSession,
  getSessions,
  prsInSession,
  type WorkoutSession,
  type LoggedExercise,
  type PersonalRecord,
} from '@/components/features/shared/workoutLog';
import { rankFor } from '@/components/features/shared/forgeRank';
import {
  activeSessionFor,
  clearActiveSession,
  saveActiveSession,
} from '@/lib/workout/activeSession';
import { Confetti, usePrefersReducedMotion, type BurstSpec } from '@/components/ui/Confetti';

/** What the summary needs to tell the strike/rank story, frozen at finish time. */
interface StrikeInfo {
  strikes: number;
  rankName: string;
  rankedUp: boolean;
}

interface SetEntry {
  reps: number;
  weight_kg: number;
  rpe: number | null;
  done: boolean;
}
interface ExerciseState {
  routineExercise: RoutineExercise;
  /** overridden name/id when the user swaps */
  exerciseId: string;
  exerciseName: string;
  sets: SetEntry[];
  /**
   * Which warm-up ramp steps have been ticked. Deliberately a SEPARATE array from `sets` — see the
   * file header: a warm-up is not a working set, and the two must never share an index space.
   */
  warmups: boolean[];
  /**
   * "I warmed up already" — the escape hatch for someone who warmed up on another lift. The heavy
   * first set of a reverse pyramid is DIMMED until this or a ramp row is ticked, never disabled.
   */
  warmupAck: boolean;
  /**
   * Whether an EARLIER exercise in this session already trained this pattern. Carried on the state
   * rather than recomputed per render because it is a property of the day's running order, and the
   * running order does not change mid-session — see `dayPrescriptions`.
   */
  patternAlreadyWarm: boolean;
}

function mechanicsOf(exerciseId: string): Mechanics | undefined {
  return mockExerciseById(exerciseId)?.mechanics;
}

/**
 * The exercise's own equipment, for the header portrait. "What am I standing in front of" is the
 * first thing you check when you look up mid-session, and it was being answered by a hardcoded
 * generic dumbbell regardless of whether the movement was a cable row or a leg press.
 *
 * Falls back to `barbell` only when the row genuinely carries no equipment (bodyweight work still
 * resolves through the registry's keyword guess), so the header can never render blank.
 *
 * The LOOKUP is shared with the swap sheet and the PR list via `lib/equipment/slugForExercise` —
 * one exercise must never show a barbell on one screen and a cable on another. The FALLBACK stays
 * here because it is this surface's own call: a planned working set skews barbell.
 */
function equipmentSlugOf(exerciseId: string): string {
  return slugForExercise(exerciseId, 'barbell');
}

/**
 * The prescription for one routine row under the athlete's scheme. Mechanics decide whether a
 * compound-only scheme (reverse pyramid, top set + back-offs) applies at all — accessories quietly
 * run straight sets, which is the coaching call, not a limitation.
 */
function prescriptionFor(
  re: RoutineExercise,
  exerciseId: string,
  scheme: ProgressionScheme,
  setCount: number,
  experience: ExperienceLevel,
): Prescription {
  return prescribeSets(
    {
      sets: setCount,
      rep_min: re.rep_min,
      rep_max: re.rep_max,
      target_rpe: re.target_rpe,
      mechanics: mechanicsOf(exerciseId) ?? null,
      isBodyweight: isBodyweightOnly(exerciseId),
      experience,
    },
    scheme,
  );
}

/**
 * The warm-up steps for one exercise, in the movement being trained.
 *
 * `topSetKg` is whatever weight is on working set 1 right now, so the ramp's kilos follow the
 * athlete's own number as they type it. With no number there is nothing honest to print and the
 * steps show percentages alone — the ramp itself never disappears, because the athlete with no
 * history is the one most likely to need it.
 *
 * `patternAlreadyWarm` comes from the DAY, not from this row: a lat pulldown that follows bent-over
 * rows does not need the same four steps as the first lift of the session. It is computed once in
 * `dayPrescriptions` so the player and the minute estimate size the ramp identically.
 */
function rampFor(
  plan: Prescription,
  exerciseId: string,
  topSetKg: number | null,
  patternAlreadyWarm: boolean,
): WarmupSet[] {
  return warmupRamp({
    topSetKg,
    mechanics: mechanicsOf(exerciseId) ?? null,
    scheme: plan.scheme,
    isBodyweight: plan.isBodyweight,
    targetReps: plan.sets[0]?.reps ?? null,
    patternAlreadyWarm,
  });
}

/**
 * One set entry, pre-filled FROM THE PRESCRIPTION with last session as the fallback.
 *
 * THE BUG THIS FIXES WAS THE WORST ONE IN THE APP. Under reverse pyramid the row rendered targets
 * of 'Set 1 · 6 reps · 100%', 'Set 2 · 8 reps · 90%', 'Set 3 · 10 reps · 81%' and then pre-filled
 * the inputs underneath them from last session's ghost — 80/80/80 kg and 8/8/7 reps. Tapping the
 * three collars persisted three sets at one weight: straight sets. The app told the athlete to drop
 * 10% a set and then wrote down that they didn't, and every downstream number (e1RM, PRs, the
 * heatmap, tonnage) was computed from a session nobody prescribed.
 *
 * So the ghost is now an ANCHOR for set 1 and a fallback everywhere else, never an override:
 *
 *  · WEIGHT — always derived: `topSetKg × loadPct`. Under straight sets `loadPct` is 100, so this
 *    is last session's top set on every row, which is exactly what straight sets prescribes.
 *  · REPS — taken from the target only where the target is a single number (the shaped schemes say
 *    "8 reps on set 2", which is an instruction). Under straight sets the prescription is a RANGE,
 *    8–12; asserting the top of it would log 12 reps for an athlete who got 9, so the ghost's
 *    achieved reps stay the default there. That is byte-identical to the previous behaviour under
 *    the scheme 100% of athletes start on.
 *  · RPE — from the target, which varies by role and is capped on a heavy first set.
 *
 * The ghost keeps its real job in the `placeholder`, which is what the "greyed numbers are last
 * session's sets" hint has always promised.
 */
function entryFor(
  target: SetTarget | undefined,
  ghost: { reps: number; weight_kg: number; rpe: number | null } | undefined,
  topKg: number | null,
  re: RoutineExercise,
): SetEntry {
  const shapedReps = target != null && target.repsLow === target.repsHigh;
  return {
    reps: shapedReps ? target.reps : (ghost?.reps ?? target?.reps ?? re.rep_max),
    // A bodyweight target carries `loadPct: null`, so there is nothing to scale and the field stays
    // empty rather than offering a fabricated 0 kg.
    weight_kg: suggestedLoadKg(topKg, target?.loadPct) ?? ghost?.weight_kg ?? 0,
    rpe: target?.rpe ?? ghost?.rpe ?? re.target_rpe,
    done: false,
  };
}

function buildInitialState(
  day: RoutineDay,
  scheme: ProgressionScheme,
  experience: ExperienceLevel,
): ExerciseState[] {
  // Walked through `dayPrescriptions` so the ramp knows its POSITION in the session — the fourth
  // compound of a day does not get the same four-step ramp as the first.
  const plans = dayPrescriptions(day, scheme, experience);
  const warmByRowId = new Map(plans.map((p) => [p.row.id, p.patternAlreadyWarm]));

  return day.exercises.map((re) => {
    const prev = mockPreviousSets(re.exercise_slug, re.sets);
    const plan = prescriptionFor(re, re.exercise_id, scheme, re.sets, experience);
    // The athlete's own heaviest logged set is the only honest anchor for a relative load — the
    // app never invents a starting weight (see `suggestedLoadKg`).
    const topKg = prev[0]?.weight_kg ?? null;
    const warm = warmByRowId.get(re.id) ?? false;
    // The SCHEME decides how many working sets there are, not the row: reverse pyramid caps at 3,
    // and rendering a 4th input the prescription does not contain would be a set nobody prescribed.
    const sets: SetEntry[] = plan.sets.map((target, i) =>
      entryFor(target, prev[i], topKg, re),
    );
    return {
      routineExercise: re,
      exerciseId: re.exercise_id,
      exerciseName: re.exercise_name,
      sets,
      warmups: rampFor(plan, re.exercise_id, topKg, warm).map(() => false),
      warmupAck: false,
      patternAlreadyWarm: warm,
    };
  });
}

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_KG = 20;
const KG_PER_LB = 0.45359237;

function plateBreakdown(total: number): { plate: number; count: number }[] {
  let perSide = (total - BAR_KG) / 2;
  if (perSide <= 0) return [];
  const out: { plate: number; count: number }[] = [];
  for (const p of PLATES) {
    const count = Math.floor(perSide / p + 1e-9);
    if (count > 0) {
      out.push({ plate: p, count });
      perSide = +(perSide - count * p).toFixed(4);
    }
  }
  return out;
}

export function WorkoutPlayer({ sessionId }: { sessionId: string }) {
  // DEMO MODE: resolve the day from the active (generated or default) routine; fall back to the
  // first day so a stale/unknown session id never dead-ends.
  const routine = useActiveRoutine();
  const state = useDemoState();
  const quick = state.quickSession;
  // The scheme in force right now (explicit choice, else the recommendation for this athlete).
  const scheme = resolveProgressionScheme(state);
  // Drives the RPE cap on a heavy first set, and whether the coaching caution applies at all.
  const experience: ExperienceLevel =
    state.draft.experience_level ?? state.profile?.experience_level ?? 'beginner';
  const day = React.useMemo<RoutineDay | undefined>(() => {
    // `/workout/quick` runs the one-off session the quick-workout picker built. It is a real
    // RoutineDay, so logging, volume credit and PRs all treat it identically to a planned day.
    // A missing one (deep link, cleared store) falls through rather than dead-ending.
    if (sessionId === 'quick' && quick) return quick;
    return routine.days.find((d) => d.id === sessionId) ?? routine.days[0];
  }, [routine, sessionId, quick]);

  const [exercises, setExercises] = React.useState<ExerciseState[]>(() =>
    day ? buildInitialState(day, scheme, experience) : [],
  );
  /* The coaching caution, shown HERE and not only in onboarding. A warning read weeks before the
   * first heavy-first session is a warning nobody reads at the moment it matters. Dismissible for
   * the session, because repeating it on every exercise would train the athlete to ignore it. */
  const [cautionDismissed, setCautionDismissed] = React.useState(false);
  /* The scheme explainer + trim notice, behind the scheme chip. One-time explanations do not earn
   * permanent space above the primary action of the screen — see the chip's own comment. */
  const [schemeInfoOpen, setSchemeInfoOpen] = React.useState(false);
  /** The caution's full text. Clamped to two lines by default — see its own comment. */
  const [cautionOpen, setCautionOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [finished, setFinished] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(() => Date.now());
  const [finishedSession, setFinishedSession] = React.useState<WorkoutSession | null>(null);
  const [prs, setPrs] = React.useState<PersonalRecord[]>([]);
  /** Strike count + ladder standing at the moment the session landed — see finishWorkout. */
  const [strike, setStrike] = React.useState<StrikeInfo | null>(null);

  // Rest timer -------------------------------------------------------------
  const [rest, setRest] = React.useState<{ endsAt: number; total: number } | null>(null);

  // Sheets -----------------------------------------------------------------
  const [swapOpen, setSwapOpen] = React.useState(false);
  const [plateForSet, setPlateForSet] = React.useState<number | null>(null);

  /* THE PREP BLOCKS — dynamic mobility before, static stretches after. Session-level, not
   * exercise-level, so they render once each rather than on every pager step. The cooldown is keyed
   * off the muscles this day actually loads DIRECTLY, which is why `dayStats().loads` is threaded
   * in rather than recomputed. Like the ramp, neither block is a set: they carry their own testids
   * and never reach `totalSets`, `doneSets` or the logged session. */
  const prep = React.useMemo(
    () => (day ? prepForDay(day, dayStats(day, scheme, experience).loads) : { pre: [], post: [] }),
    [day, scheme, experience],
  );

  // Keep the pager index inside the exercise list at all times (belt and braces for the guard
  // below — a stale index must never be able to read past the end of the array).
  React.useEffect(() => {
    setIndex((i) => (i > 0 && i > exercises.length - 1 ? Math.max(0, exercises.length - 1) : i));
  }, [exercises.length]);

  /* ═══════════════════════════════════════════════ RECONCILE THE SESSION WHEN THE SCHEME CHANGES
   *
   * THE SAFETY ESCAPE HATCH USED TO DELETE A WORKING SET. `exercises` was built once in a useState
   * initializer and never rebuilt, while `plan` recomputed every render — so a novice who followed
   * the caution banner's own advice and tapped "Switch to straight sets" mid-session got a header
   * reading "Target 4 × 6–10" above only THREE set rows, and a counter still stuck on 0/18 instead
   * of 0/20. Every compound in the day silently lost its fourth set. The warm-up desynced the same
   * way: four booleans against a three-step ramp, so a fully ticked ramp could display "4/3". The
   * athlete who took the app's safety advice was punished with less training than one who ignored
   * it, which is the exact opposite of what a safety affordance is for.
   *
   * RECONCILE, NEVER REBUILD. A rebuild would wipe every set the athlete has already logged. This
   * grows or truncates each list and preserves what survives:
   *   · `sets` grows with entries pre-filled from the NEW targets, or truncates from the end
   *   · `done` is carried on every surviving row
   *   · a row whose target changed but which is NOT yet done is re-prefilled, so switching scheme
   *     actually changes the numbers you are about to log; a row already logged is left alone,
   *     because a performed set is a record, not a prescription
   *   · `warmups` resizes to the new ramp length, keeping the ticks that survive
   */
  const reconcileKey = `${scheme}|${day?.id ?? ''}|${experience}`;
  const lastReconcileKey = React.useRef(reconcileKey);
  React.useEffect(() => {
    // Guard the initial mount: the useState initializer already built this exact shape, and running
    // the reconcile over it would re-prefill rows for no reason.
    if (lastReconcileKey.current === reconcileKey) return;
    lastReconcileKey.current = reconcileKey;
    if (!day) return;

    const plans = dayPrescriptions(day, scheme, experience);
    const warmByRowId = new Map(plans.map((p) => [p.row.id, p.patternAlreadyWarm]));

    setExercises((prev) =>
      prev.map((ex) => {
        const re = ex.routineExercise;
        const warm = warmByRowId.get(re.id) ?? false;
        // `Math.max` keeps any sets the athlete added by hand: the scheme changed, their intent
        // did not.
        const next = prescriptionFor(
          re,
          ex.exerciseId,
          scheme,
          Math.max(re.sets, ex.sets.length),
          experience,
        );
        const topKg = ex.sets[0]?.weight_kg ?? null;
        const prevGhost = mockPreviousSets(re.exercise_slug, re.sets);

        const sets: SetEntry[] = next.sets.map((target, i) => {
          const existing = ex.sets[i];
          if (existing?.done) return existing;
          const fresh = entryFor(target, prevGhost[i], topKg, re);
          return existing ? { ...fresh, done: false } : fresh;
        });

        const rampLen = rampFor(next, ex.exerciseId, topKg, warm).length;
        const warmups = Array.from({ length: rampLen }, (_, i) => ex.warmups[i] ?? false);

        return { ...ex, sets, warmups, patternAlreadyWarm: warm };
      }),
    );
  }, [reconcileKey, day, scheme, experience]);

  /* ══════════════════════════════════════════ SURVIVE THE RELOAD (`fitforge.activeSession.v1`)
   *
   * Everything above lives in React state, so until this pair of effects existed a reload, an
   * accidental Back or a Safari tab eviction between sets destroyed every logged set with no way
   * back. The contract (see `lib/workout/activeSession`):
   *
   *   · SAVE on every mutation — but only once the athlete has actually TOUCHED the session
   *     (`sessionDirty`). Opening the player to look at the day and leaving writes nothing, so
   *     browsing can never manufacture a phantom in-progress workout.
   *   · RESTORE on mount, gated on the DAY ID and joined per row by `RoutineExercise.id`. A
   *     snapshot from a different day is never merged in — it just sits until the athlete's next
   *     real session supersedes it or the TTL expires it. One athlete, one live session: starting
   *     to log a different day IS abandoning the old one, so no resume-vs-discard dialog.
   *   · CLEAR on finish — the workout log owns the sets from that moment.
   */
  const sessionDirty = React.useRef(false);
  const sessionRestored = React.useRef(false);
  /** finishWorkout's re-entry latch — a ref, because state commits a render too late (see there). */
  const finishGuard = React.useRef(false);

  React.useEffect(() => {
    if (sessionRestored.current || !day) return;
    sessionRestored.current = true;
    const saved = activeSessionFor(day.id);
    if (!saved) return;
    const byRow = new Map(saved.exercises.map((e) => [e.rowId, e]));
    // A snapshot none of whose rows exist any more (plan regenerated under the same day id) has
    // nothing to restore into; leave it to be superseded rather than resurrecting orphan sets.
    if (!exercises.some((ex) => byRow.has(ex.routineExercise.id))) return;
    sessionDirty.current = true;
    setExercises((prev) =>
      prev.map((ex) => {
        const s = byRow.get(ex.routineExercise.id);
        if (!s || s.sets.length === 0) return ex;
        return {
          ...ex,
          // The swap survives the reload too — the athlete is standing at the substitute machine.
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName,
          sets: s.sets.map((t) => ({ ...t })),
          // Clamped to the ramp built for THIS mount, so a snapshot can never desync the tick
          // list from the steps on screen (the 4-ticks-against-3-steps bug the reconcile fixed).
          warmups: ex.warmups.map((_, i) => s.warmups[i] ?? false),
          warmupAck: s.warmupAck,
        };
      }),
    );
    setIndex(Math.max(0, Math.min(exercises.length - 1, saved.exerciseIndex)));
    // The original start time, so the summary's elapsed minutes span the real session.
    setStartedAt(saved.startedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, against the mount-built state
  }, [day]);

  React.useEffect(() => {
    if (!day || finished || !sessionDirty.current) return;
    saveActiveSession({
      dayId: day.id,
      startedAt,
      exerciseIndex: index,
      exercises: exercises.map((ex) => ({
        rowId: ex.routineExercise.id,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        sets: ex.sets.map((s) => ({
          reps: s.reps,
          weight_kg: s.weight_kg,
          rpe: s.rpe,
          done: s.done,
        })),
        warmups: [...ex.warmups],
        warmupAck: ex.warmupAck,
      })),
    });
  }, [exercises, index, day, startedAt, finished]);

  if (!day) {
    return (
      <PlayerFallback
        testId="workout-not-found"
        title="Workout not found"
        body="We couldn't find that session. It may have been removed when your plan changed."
      />
    );
  }

  // DEFENSIVE GUARD: the generator now guarantees every day has exercises, but a routine restored
  // from an older localStorage snapshot (or hand-edited to empty) must never white-screen the app.
  // Never index blindly — `exercises[index]` used to throw straight into "Application error".
  const current = exercises[index];
  if (!current) {
    return (
      <PlayerFallback
        testId="workout-empty"
        title={`${day.name} has no exercises yet`}
        body="This session came out empty — usually because the equipment or protected areas on file rule everything out. Add exercises to it, or review your setup and we'll rebuild the plan."
        secondary={{ href: '/routines', label: 'Open Workouts' }}
      />
    );
  }

  /* WORKING SETS ONLY — see the file header. `e.warmups` is deliberately not summed here: the
   * progress bar, the "3/12 sets" counter and everything downstream of them are denominated in
   * hard sets. */
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const resting = rest != null;

  /**
   * Edit one set — and, when that set is the ANCHOR, re-derive the sets that hang off it.
   *
   * Set 1's weight is not just another field: every relative load on this screen is a percentage
   * of it. An athlete with no logged history is asked for exactly this number ("what can you do
   * for about 10 solid reps?"), and if typing it left sets 2 and 3 empty, the app would have asked
   * for an anchor and then anchored nothing to it — the original complaint with an extra step in
   * front of it.
   *
   * Only sets that are NOT YET DONE move. A logged set is a record of what happened; no later edit
   * gets to rewrite it.
   */
  function updateSet(exIdx: number, setIdx: number, patch: Partial<SetEntry>) {
    sessionDirty.current = true;
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const sets = ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s));
        if (setIdx !== 0 || patch.weight_kg == null) return { ...ex, sets };

        const anchor = patch.weight_kg;
        const shape = prescriptionFor(
          ex.routineExercise,
          ex.exerciseId,
          scheme,
          Math.max(ex.routineExercise.sets, ex.sets.length),
          experience,
        );
        return {
          ...ex,
          sets: sets.map((s, j) => {
            if (j === 0 || s.done) return s;
            const derived = suggestedLoadKg(anchor, shape.sets[j]?.loadPct);
            return derived == null ? s : { ...s, weight_kg: derived };
          }),
        };
      }),
    );
  }

  function completeSet(setIdx: number) {
    const active = exercises[index];
    const s = active?.sets[setIdx];
    if (!active || !s) return;
    const nextDone = !s.done;
    updateSet(index, setIdx, { done: nextDone });
    if (nextDone) {
      // The most repeated act in the app answers the finger. 'confirm', not 'tick' — a logged
      // set is a commit, and the duller thud under the row's visual state-change is the payoff
      // the audit found missing.
      haptic('confirm');
      /* Rest timer auto-starts on set completion (§6 P0-5), sized by the ROW's own goal-aware
       * `rest_seconds` — a hypertrophy compound rests 90s, and running 150s for it made the
       * session card's "~45 min" promise and the session the athlete actually got disagree by
       * minutes. The heaviest set of the day earns 1.25× that, because the set after a top set is
       * the one most likely to be cut short by a timer sized for an average set. */
      const role = plan.sets[setIdx]?.role ?? 'work';
      const total = restSecondsForSet(
        active.routineExercise.rest_seconds,
        role,
        mechanicsOf(active.exerciseId) ?? null,
      );
      setRest({ endsAt: Date.now() + total * 1000, total });
    }
  }

  /**
   * Tick a warm-up step. NO REST TIMER: a ramp step is 5 easy reps, and dropping a 90-second
   * countdown over the screen between them would turn a two-minute warm-up into a six-minute one.
   */
  function toggleWarmup(stepIdx: number) {
    sessionDirty.current = true;
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === index
          ? { ...ex, warmups: ex.warmups.map((w, j) => (j === stepIdx ? !w : w)) }
          : ex,
      ),
    );
  }

  function ackWarmup() {
    sessionDirty.current = true;
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, warmupAck: true } : ex)),
    );
  }

  function addSet() {
    sessionDirty.current = true;
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== index) return ex;
        const last = ex.sets[ex.sets.length - 1];
        // An extra set keeps the SHAPE: under a pyramid the new set continues the drop instead of
        // copying the previous one and flattening the scheme. A scheme with a hard set cap
        // (reverse pyramid) prescribes nothing for the extra set, so it inherits the last one —
        // the athlete asked for it, and the app does not pretend to have programmed it.
        const plan = prescriptionFor(
          ex.routineExercise,
          ex.exerciseId,
          scheme,
          Math.max(ex.routineExercise.sets, ex.sets.length + 1),
          experience,
        );
        const target = plan.sets[ex.sets.length];
        const topKg = ex.sets[0]?.weight_kg ?? null;
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              reps: target?.reps ?? last?.reps ?? ex.routineExercise.rep_max,
              weight_kg:
                suggestedLoadKg(topKg, target?.loadPct) ?? last?.weight_kg ?? 0,
              rpe: target?.rpe ?? last?.rpe ?? ex.routineExercise.target_rpe,
              done: false,
            },
          ],
        };
      }),
    );
  }

  function onSwap(sub: SubstituteRow) {
    sessionDirty.current = true;
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === index ? { ...ex, exerciseId: sub.exercise_id, exerciseName: sub.name } : ex,
      ),
    );
  }

  function finishWorkout() {
    /* IDEMPOTENT, VIA THE REF. Two click dispatches in one task (a double-tap, a dispatched
     * synthetic click) both read `finished === false` — state commits a render too late to stop
     * the second one — and each would `logSession` its own copy of the day. The ref flips
     * synchronously, so re-entry is a no-op and exactly one session can ever be persisted. */
    if (finishGuard.current) return;
    finishGuard.current = true;
    // Persist the session (completed sets only) so heatmap / PRs / streaks pick it up.
    const loggedExercises: LoggedExercise[] = exercises.map((e) => {
      const full = mockExerciseById(e.exerciseId);
      return {
        exercise_id: e.exerciseId,
        exercise_slug: full?.slug ?? e.routineExercise.exercise_slug,
        exercise_name: e.exerciseName,
        mechanics: full?.mechanics ?? 'compound',
        primary_muscles: full?.primary_muscles ?? [],
        secondary_muscles: full?.secondary_muscles ?? [],
        sets: e.sets
          .filter((s) => s.done)
          .map((s) => ({ reps: s.reps, weight_kg: s.weight_kg })),
      };
    });
    const session: WorkoutSession = {
      id: `sess-${Date.now()}`,
      dayId: day!.id,
      dayName: day!.name,
      finishedAt: new Date().toISOString(),
      exercises: loggedExercises,
    };
    // Compute PRs against everything logged *before* this session, then persist.
    const beaten = prsInSession(session, getSessions());
    logSession(session);
    // The ladder is counted off the log AFTER this session lands, so the summary's strike number
    // and the Today card can never disagree about what a "strike" is. Rank-up = the boundary
    // between strike N-1 and strike N.
    const strikes = getSessions().length;
    const standing = rankFor(strikes);
    setStrike({
      strikes,
      rankName: standing.rank.name,
      rankedUp: standing.rank.index > rankFor(strikes - 1).rank.index,
    });
    // The first-workout explainer has done its job the moment a workout is finished, whether or not
    // the athlete ever tapped its X. Without this, someone who simply ignored the card would meet
    // it again on session two — and a "read this once" card that shows twice is worse than none.
    dismissExplainer(FIRST_SET_EXPLAINER_ID);
    // The workout log owns these sets from here; a surviving scratch copy would offer to "resume"
    // a session that is already history. Dirty flips off too, so the save effect cannot re-write
    // the key on the renders that follow.
    sessionDirty.current = false;
    clearActiveSession();
    setFinishedSession(session);
    setPrs(beaten);
    setFinished(true);
  }

  if (finished && finishedSession) {
    return (
      <Summary
        day={day}
        exercises={exercises}
        elapsedMs={Date.now() - startedAt}
        prs={prs}
        strike={strike}
      />
    );
  }

  const re = current.routineExercise;
  const isLast = index === exercises.length - 1;
  // Per-set targets for the exercise on screen. Recomputed every render (it is a pure function of
  // the row + the scheme + how many sets are on screen), so "+ Add set" and a mid-session scheme
  // change are both reflected immediately.
  /* The prescription is computed from what the ROW asked for, not from how many rows are on
   * screen. Those differ whenever a scheme caps the set count (reverse pyramid runs 3), and
   * feeding the already-trimmed number back in would make the prescription forget it had trimmed
   * anything — so the "set 4 dropped" notice would never appear on the one screen that owes the
   * athlete the explanation. `Math.max` keeps "+ Add set" working. */
  const plan = prescriptionFor(
    re,
    current.exerciseId,
    scheme,
    Math.max(re.sets, current.sets.length),
    experience,
  );
  // Relative loads need an anchor, and the only honest one is a weight the athlete owns: whatever
  // is on set 1 right now. Type 100 into the top set and every back-off suggestion follows it.
  const topSetKg = current.sets[0]?.weight_kg ?? null;
  // "The set you are on" = the first one not yet logged. −1 once the exercise is finished, which
  // correctly collapses every row back to compact.
  const activeSetIdx = current.sets.findIndex((s) => !s.done);
  // The specific warm-up for THIS lift. Its kilos follow whatever is on working set 1 right now,
  // and its LENGTH follows where the lift sits in the session — a fourth compound on an already-
  // warm pattern gets one feeler step, not the full four.
  const ramp = rampFor(plan, current.exerciseId, topSetKg, current.patternAlreadyWarm);
  const rampDone = current.warmups.filter(Boolean).length;
  /* THE ANCHOR PROBLEM, stated. Every number this screen prints for a loaded lift is a PERCENTAGE
   * of the top set — "5 × 40%", "8 reps · 90%" — and with no logged history there was nothing for
   * those percentages to be a percentage OF. All four weight fields came back empty, the helper
   * copy promised "the load your scheme suggests", and no load was suggested. The app must never
   * invent a starting weight, so it asks for one instead, once, in the athlete's own terms. */
  const needsAnchor = !plan.isBodyweight && !(topSetKg != null && topSetKg > 0);
  /* THE SOFT GATE. Reverse pyramid walks the athlete into their heaviest set of the day as set 1,
   * so that row is dimmed with a "warm up first" helper until a ramp step is ticked or they say
   * they warmed up elsewhere. DIMMED, NEVER DISABLED — the house pattern (the rest timer dims the
   * pager but leaves it reachable), and someone who warmed up on another lift has to be able to
   * proceed. */
  const warmupSatisfied = current.warmupAck || rampDone > 0 || ramp.length === 0;
  const topSetGated = plan.scheme === 'reverse_pyramid' && !warmupSatisfied;
  // The caution, at the moment it matters rather than weeks earlier in onboarding.
  const caution = cautionDismissed ? null : schemeCaution(plan.scheme, experience);
  const trimNotice = trimNoticeFor(plan);
  const baseRest = restSecondsForSet(re.rest_seconds, 'work', mechanicsOf(current.exerciseId) ?? null);

  return (
    /* space-y-3, not 4. Four gaps of 16 px sit between the top of this screen and the first working
       set; at 12 px they buy back the last dozen pixels that kept set 1 off a 664 px viewport, and
       nothing on the screen reads as crowded at 12. */
    <div className="space-y-3 pb-4">
      {/* Header / progress */}
      <div className="flex items-center justify-between">
        <Link
          href="/today"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <XIcon size={15} /> Close
        </Link>
        {/* Which session am I actually in? Obvious when you arrived from a named plan card, not at
            all obvious for a quick workout you picked from a sheet — and landing in an unnamed
            session is the same disorientation the quick-workout picker exists to fix. */}
        <span
          className="min-w-0 flex-1 truncate px-3 text-center text-sm font-semibold text-foreground"
          data-testid="workout-day-name"
        >
          {day.name}
        </span>
        <span
          className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground"
          data-testid="workout-set-counter"
        >
          {doneSets}/{totalSets} sets
        </span>
      </div>
      {/* A hand-rolled div became the shared primitive, in its `bar` dress: collars on each end, so
          a session filling up reads as a barbell loading rather than as a browser download. */}
      <ProgressBar
        current={doneSets}
        total={totalSets}
        variant="bar"
        label={`${doneSets} of ${totalSets} sets logged`}
      />

      {/* Active exercise block. Mid-workout discipline (§6 P0-5): while resting, the current set
          card glows and the surrounding chrome dims — but nothing is disabled, so the pager and
          skip stay reachable. */}
      <div className="space-y-3">
        {/* Exercise header */}
        <div
          className={
            'flex items-start justify-between gap-3 transition-opacity duration-300 ' +
            (resting ? 'opacity-70' : 'opacity-100')
          }
        >
          {/* THE OBJECT YOU ARE ABOUT TO PICK UP. This was a hardcoded generic dumbbell for every
              exercise in the app; it is now the movement's real equipment portrait, at row size
              with the dense treatment so the 48-unit strokes survive. */}
          <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent">
            <EquipmentIllustration slug={equipmentSlugOf(current.exerciseId)} size={28} dense selected />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
              Exercise {index + 1} of {exercises.length}
            </p>
            {/* TWO LINES, NOT ELLIPSIS. This was `truncate`, so "Conventional Deadlift" rendered
                as "Conventional De…" (203 px of clientWidth against 239 px of scrollWidth) — and
                day 1 of the DEFAULT generated plan contains both that and "Barbell Overhead
                Press", making it the out-of-the-box first impression rather than an edge case.
                The Swap control beside it went icon-only in the same pass, which returns ~60 px. */}
            <h1 className="line-clamp-2 font-display text-2xl font-bold leading-tight tracking-tight">
              {current.exerciseName}
            </h1>
            {/* The rest figure here is the ROW's, which is the same number the session card's
                minute estimate is built from and the same number the timer counts down. Three
                surfaces, one source.

                It is also THE FIRST LINE OF GYM VOCABULARY ON THE SCREEN, so it is the first line
                that gets the dotted underline: a rep range carries a RULE ("get the top of it on
                every set, THEN go heavier"), which is unguessable from two numbers and a dash. */}
            <p className="mt-0.5 text-sm text-muted-foreground" data-testid="workout-target-line">
              Target {plan.sets.length} ×{' '}
              <GlossaryTerm id="rep-range" label={`${re.rep_min}–${re.rep_max}`} />
              {re.target_rpe ? (
                <>
                  {' · '}
                  <GlossaryTerm id="rpe" label="RPE" /> {re.target_rpe}
                </>
              ) : (
                ''
              )}{' '}
              · rest {baseRest}s
            </p>
            {/* THE SCHEME CHIP IS NOW THE DISCLOSURE. The chip already names the scheme; the
                two-line explainer and the three-line trim notice underneath it were rendered on
                every exercise transition, on every session, forever — one-time explanations
                occupying permanent space above the primary action. Together with the folded ramp
                they are what pushed set 1 to 672 px (straight sets) and ~930 px (reverse pyramid)
                on a 664 px-tall phone. Tap the chip to read them; they are never removed. */}
            <button
              type="button"
              onClick={() => setSchemeInfoOpen((v) => !v)}
              aria-expanded={schemeInfoOpen}
              aria-controls="progression-explainer"
              data-testid="progression-headline"
              className="mt-1.5 inline-flex min-h-[44px] items-center gap-1 rounded-chip bg-accent-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent"
            >
              {plan.headline}
              <ChevronDownIcon
                size={13}
                aria-hidden
                className={'transition-transform duration-200 ' + (schemeInfoOpen ? 'rotate-180' : '')}
              />
            </button>
            {schemeInfoOpen && (
              <div id="progression-explainer">
                <p
                  className="mt-1 text-xs leading-snug text-muted-foreground"
                  data-testid="progression-explainer-text"
                >
                  {plan.explainer}
                </p>
                {/* A set the row asked for that the scheme will not run. Said out loud: a set
                    disappearing without explanation reads as a bug, not as coaching. */}
                {trimNotice && (
                  <p
                    className="mt-1 text-xs leading-snug text-muted-foreground"
                    data-testid="progression-trim"
                  >
                    {trimNotice}
                  </p>
                )}
              </div>
            )}
          </div>
          {/* ICON-ONLY, 44 × 44. The labelled button cost ~60 px of title width on a 390 px phone,
              which is most of what "Conventional Deadlift" was missing. The accessible name is
              carried by aria-label, so the swap spec's /Swap/ matcher is unaffected. */}
          <button
            type="button"
            aria-label="Swap exercise"
            onClick={() => setSwapOpen(true)}
            data-testid="workout-swap"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-field border border-border bg-surface-2 text-muted-foreground transition-colors hover:text-accent"
          >
            <SwapIcon size={18} />
          </button>
        </div>

        {/* THE CAUTION, HERE. It was only ever shown in onboarding — weeks before the first
            heavy-first session, which is not when anyone needs it. It carries the one-tap way out,
            because a warning with no action is decoration. */}
        {caution && (
          <div
            className="rounded-card border border-accent bg-accent-muted px-3 py-2"
            role="status"
            data-testid="workout-scheme-caution"
          >
            {/* Clamped to two lines with the rest one tap away. The full text is five lines plus
                two buttons, and it rendered on EVERY exercise transition — a warning that costs a
                fifth of the screen every time you page forward is a warning people learn to scroll
                past. The actionable half (the two buttons) stays visible unconditionally. */}
            <p
              className={
                'text-xs leading-snug text-accent ' + (cautionOpen ? '' : 'line-clamp-2')
              }
            >
              {caution}
            </p>
            <button
              type="button"
              onClick={() => setCautionOpen((v) => !v)}
              data-testid="workout-scheme-caution-more"
              className="mt-0.5 text-[11px] font-semibold text-accent underline"
            >
              {cautionOpen ? 'Less' : 'Read all'}
            </button>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setProgressionScheme('straight_sets');
                  setCautionDismissed(true);
                }}
                data-testid="workout-scheme-switch"
                className="min-h-[44px] rounded-field bg-accent px-3 py-2 text-[11px] font-bold text-accent-foreground"
              >
                Switch to straight sets
              </button>
              <button
                type="button"
                onClick={() => setCautionDismissed(true)}
                data-testid="workout-scheme-caution-dismiss"
                className="min-h-[44px] rounded-field border border-accent px-3 py-2 text-[11px] font-semibold text-accent"
              >
                Keep {plan.scheme === 'reverse_pyramid' ? 'reverse pyramid' : 'this scheme'}
              </button>
            </div>
          </div>
        )}

        {/* THE MOBILITY BLOCK, BEFORE THE SESSION. Only on the first exercise, because it belongs
            to the session and not to each lift. Rendered here rather than nowhere because the ramp
            card below tells the athlete verbatim that they need both — an app that names a
            prerequisite it does not supply sends a beginner to look for it somewhere else. */}
        {index === 0 && prep.pre.length > 0 && (
          <PrepBlock
            testId="workout-prep-pre"
            title="Before you start · mobility"
            note="Dynamic work first — it warms the body. The ramp below warms the lift. Neither replaces the other, and neither counts as a set."
            items={prep.pre}
            dimmed={resting}
          />
        )}

        {/* THE WARM-UP RAMP — its own list, its own numbering, its own testids. Never folded into
            the working sets: a warm-up is not a hard set, and the app counts hard sets. */}
        {ramp.length > 0 && (
          <WarmupList
            steps={ramp}
            done={current.warmups}
            onToggle={toggleWarmup}
            dimmed={resting}
            required={plan.scheme === 'reverse_pyramid'}
            alreadyWarm={current.patternAlreadyWarm}
          />
        )}

        {/* THE ANCHOR. With no logged history there is no honest number behind "40%" or "81%", and
            the app must not invent one — so it asks, once, in terms an athlete can answer without
            a calculator. Everything on the screen (ramp kilos, back-off suggestions, the plate
            math) derives from whatever goes in here. */}
        {needsAnchor && (
          <div
            className="rounded-card border border-accent bg-accent-muted px-4 py-3"
            data-testid="workout-anchor-prompt"
          >
            <p className="text-xs font-semibold text-accent">
              What can you {plan.isBodyweight ? 'do' : 'lift'} for about{' '}
              {plan.sets[0]?.repsHigh ?? re.rep_max} solid reps?
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Every percentage on this screen — the warm-up ramp and the back-off sets — is worked
              out from this one number. We have nothing logged for {current.exerciseName} yet, and
              we will not guess a starting weight for you. A best estimate is fine; it is a starting
              point, not a commitment.
            </p>
            <PlateStepper
              className="mt-2"
              aria-label="Working weight"
              value={current.sets[0]?.weight_kg ?? 0}
              onChange={(v) => updateSet(index, 0, { weight_kg: v })}
              placeholder=""
            />
          </div>
        )}

        {/* Set list — the "current set card"; glows while resting.
            STEEL, NOT GOLD. This panel now holds the plate stepper and the collar latches, so it
            wants to read as the machined faceplate they are bolted to. Handing the gold hairline
            back also makes it scarce again — it stays for the genuinely premium moments (plan
            preview, PR card, streak) instead of being the default for "important". The
            glow-while-resting treatment is unaffected; it rides on the className.

            THERE IS NO COLUMN HEADER ANY MORE, and that is the fix rather than an omission. A fixed
            `Weight (kg) | Reps | RPE | Done` strip sat over a grid template that every row
            re-declared for itself, so the active row — which lifts its weight input onto its own
            line as a plate stepper — put the "Plate math" trigger under the word "Weight". Two
            independent declarations of one contract. Every control now emits its own label from the
            same props (see `SetField`), so a label describing a control it does not contain is not
            a thing this file can express. */}
        <Card
          variant="steel"
          className={
            '!p-0 transition-shadow duration-300 ' +
            (resting ? 'shadow-[var(--shadow-glow)]' : '')
          }
        >
          <ul>
            {current.sets.map((s, i) => {
              const ghost = mockPreviousSets(re.exercise_slug, current.sets.length)[i];
              const target = plan.sets[i];
              // THE PLATE STEPPER ONLY EXPANDS THE SET YOU ARE ACTUALLY ON, and that is a
              // measurement rather than a taste. At 390 px the row grid is
              // [1fr 1fr 2.5rem 2.75rem] with gap-2 inside a px-4 card inside a px-4 page:
              // ~326 px of usable width, 84 px of fixed columns and 24 px of gaps, leaving ~109 px
              // per flexible column. A plate stepper is two 44 px plates plus a legible field —
              // 150 px minimum. It cannot fit five times over, and forcing it would collapse reps
              // and RPE to unusable widths. Expanding one row keeps the control AND keeps the
              // screen readable.
              const isActive = i === activeSetIdx;
              /* The heavy first set of a reverse pyramid, before any warm-up has been ticked.
                 Dimmed and captioned, never disabled — see `topSetGated`. */
              const gated = topSetGated && target?.role === 'top';
              /* A percentage on an unloadable movement is a fabricated number, so there is no
                 weight to suggest either — the field stays empty instead of offering 0 kg. */
              const suggested = suggestedLoadKg(topSetKg, target?.loadPct);
              const placeholder = ghost
                ? String(ghost.weight_kg)
                : suggested != null
                  ? String(suggested)
                  : '';
              const setNo = i + 1;
              /* CAPTION DEDUP. A caption line appears exactly where the row SHAPE changes — the
                 first row always, the active row (its stepper layout is a different shape), and
                 the first plain row after it. A row that repeats the shape above inherits its
                 caption instead of re-printing WEIGHT·REPS·RPE·DONE at 10px four times over.
                 The `<label for>` stays in the DOM on every row (SetField clips it), so nothing
                 about the accessibility contract or the label-walk spec changes. */
              const rowShape = (row: number) =>
                row === activeSetIdx && !plan.isBodyweight ? 'stepper' : 'grid';
              const captionsHidden = i > 0 && rowShape(i) === rowShape(i - 1);
              /* The three fields, built ONCE and placed by the row shape rather than re-declared
                 per shape. Each one carries its own label — that is the invariant this card is
                 built around, and building them here is what stops a future shape re-inventing
                 them slightly differently. */
              const repsField = (
                <SetField
                  id={`set-${setNo}-reps`}
                  label="Reps"
                  name={`Set ${setNo} reps`}
                  inputMode="numeric"
                  value={s.reps || null}
                  labelHidden={captionsHidden}
                  /* GHOST FIRST in the placeholder, because the target is now in the VALUE. The
                     hint under this card promises the greyed numbers are last session's sets, so
                     the greyed number has to be last session's set. */
                  placeholder={String(ghost?.reps ?? target?.reps ?? re.rep_max)}
                  onChange={(v) => updateSet(index, i, { reps: v ?? 0 })}
                />
              );
              const rpeField = (
                <SetField
                  id={`set-${setNo}-rpe`}
                  label="RPE"
                  name={`Set ${setNo} RPE`}
                  /* The one word on this card a beginner cannot guess, and the app asks for it in
                     a box. The `?` rides the caption line, so a row that inherits the caption
                     above inherits its `?` too — every VISIBLE "RPE" still has one. */
                  glossary="rpe"
                  align="center"
                  value={s.rpe}
                  labelHidden={captionsHidden}
                  placeholder={ghost?.rpe != null ? String(ghost.rpe) : '—'}
                  onChange={(v) => updateSet(index, i, { rpe: v })}
                />
              );
              const doneCell = (
                <SetFieldCell label="Done" align="center" labelHidden={captionsHidden}>
                  {/* Was a to-do-list checkbox. Now a spring collar that closes — the gesture a
                      lifter already performs to lock a bar. aria-label and aria-pressed are
                      byte-for-byte what they were; the workout spec matches /Mark set 1/. */}
                  <CollarLatch
                    className="mx-auto"
                    done={s.done}
                    onClick={() => completeSet(i)}
                    aria-label={`Mark set ${setNo} ${s.done ? 'not done' : 'done'}`}
                    data-testid={`set-latch-${i}`}
                  />
                </SetFieldCell>
              );
              const plateMathButton = plan.isBodyweight ? null : (
                <button
                  type="button"
                  aria-label={`Plate math for set ${setNo}`}
                  onClick={() => setPlateForSet(i)}
                  /* 44 × 44 on every row. A bathroom-scale glyph on the button that opens a BARBELL
                     PLATE diagram was a straight semantic mismatch; ScaleIcon keeps its job on the
                     weigh-in card. A movement with no bar has no plate math, so it is simply
                     absent. */
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-field border border-border bg-surface-2 text-muted-foreground transition-colors hover:text-accent"
                >
                  <PlateIcon size={16} />
                </button>
              );
              return (
                <li
                  key={i}
                  data-testid={`set-row-${setNo}`}
                  /* The row's shape, said out loud, so a spec can assert on the state rather than
                     on the pixels that express it. */
                  data-state={s.done ? 'logged' : isActive ? 'current' : 'upcoming'}
                  className={
                    'border-b border-border px-4 py-2 last:border-b-0 transition-colors ' +
                    (s.done ? 'bg-accent-muted/40 ' : '') +
                    (gated ? 'opacity-50' : '')
                  }
                >
                  {/* THE PRESCRIPTION, per set. A relative load rather than kilos: the app knows
                      the shape of the session, the athlete's own history supplies the weight.
                      Straight sets print the RANGE — double progression means "work up the range,
                      THEN add load", and a hard 12 makes a lifter who got 9 on set 4 read a
                      success as a failure. */}
                  {target && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums">Set {i + 1}</span>
                      <span
                        className="text-[11px] font-semibold tabular-nums text-accent"
                        data-testid={`set-target-${i + 1}`}
                      >
                        {target.repsLow === target.repsHigh
                          ? `${target.reps} reps`
                          : `${target.repsLow}–${target.repsHigh} reps`}
                        {target.loadPct == null
                          ? ''
                          : target.role === 'work'
                            ? ' · same weight'
                            : ` · ${target.loadPct}%`}
                        {/* THE PERCENTAGE, RESOLVED. "81%" of what? The whole prescription was
                            expressed as a fraction of a number the screen never printed, so an
                            athlete reading "8 reps · 90%" had to do the arithmetic themselves —
                            mid-set, on a phone. `suggested` is null only when there is genuinely
                            nothing to anchor on, and the prompt above handles that case. */}
                        {suggested != null && target.role !== 'work' ? ` · ${suggested} kg` : ''}
                        {target.rpe == null ? '' : ` · RPE ${target.rpe}`}
                      </span>
                    </div>
                  )}
                  {/* The cue is the coaching, so it only appears where the scheme actually shapes
                      the set — straight sets would just repeat themselves four times. */}
                  {target && target.role !== 'work' && (
                    <p
                      className="mt-0.5 text-[11px] leading-snug text-muted-foreground"
                      data-testid={`set-cue-${setNo}`}
                    >
                      {/* THE SCHEME NAMES THE CONCEPT IT JUST USED. "Top set" and "back-off" are
                          the two words this app prints most and defined least — and they are
                          printed by a scheme the athlete may have picked five screens ago. The
                          word itself is the button. */}
                      <GlossaryTerm
                        id={target.role === 'top' ? 'top-set' : 'backoff-set'}
                        label={target.role === 'top' ? 'Top set' : 'Back-off set'}
                        className="font-semibold text-foreground"
                      />{' '}
                      — {target.cue}
                    </p>
                  )}
                  {/* The gate, stated. A dimmed row with no explanation is a bug; a dimmed row that
                      says why, and offers the way past, is coaching. */}
                  {gated && (
                    <div className="mt-1 flex flex-wrap items-center gap-2" data-testid={`set-gate-${i + 1}`}>
                      <span className="text-[11px] font-semibold text-accent">Warm up first</span>
                      <button
                        type="button"
                        onClick={ackWarmup}
                        data-testid="warmup-ack"
                        /* min-h-[44px]: measured 130 × 31. This is the escape hatch on the
                           SAFETY gate — the one control on the row a hurried athlete reaches
                           for — and it was the smallest target on the screen. */
                        className="min-h-[44px] rounded-field border border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-accent"
                      >
                        I warmed up already
                      </button>
                    </div>
                  )}
                  {/* THE FIELDS. Two shapes, no shared header — see the card's comment.
                      THE ACTIVE SET gets the loaded bar: two plates you spin on a sleeve either
                      side of the weight, on its own line so the control has room to be a real 44 px
                      target. The centre stays a genuine <input type="number"> — the numeric keypad,
                      the arrow keys and the `Set N weight` spinbutton name all depend on it. A
                      bodyweight movement has no plates to spin, so it does not get one. */}
                  <div className="mt-1.5" data-testid={`set-fields-${setNo}`}>
                    {isActive && !plan.isBodyweight ? (
                      <>
                        <SetField
                          id={`set-${setNo}-weight`}
                          label="Weight"
                          name={`Set ${setNo} weight`}
                          unit="kg"
                          variant="stepper"
                          value={s.weight_kg || null}
                          placeholder={placeholder}
                          onChange={(v) => updateSet(index, i, { weight_kg: v ?? 0 })}
                          trailing={plateMathButton}
                        />
                        <div className="mt-1.5 grid grid-cols-[1fr_1fr_2.75rem] items-end gap-2">
                          {repsField}
                          {rpeField}
                          {doneCell}
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-[1fr_1fr_2.5rem_2.75rem] items-end gap-2">
                        <SetField
                          id={`set-${setNo}-weight`}
                          label="Weight"
                          name={`Set ${setNo} weight`}
                          /* On a chin-up the weight is not "the weight" — it is whatever you HUNG
                             on a belt, usually nothing. The unit says so, outside the <label>, so
                             the visible label stays a subset of the accessible name. */
                          unit={plan.isBodyweight ? 'added kg' : 'kg'}
                          value={s.weight_kg || null}
                          placeholder={placeholder}
                          onChange={(v) => updateSet(index, i, { weight_kg: v ?? 0 })}
                          trailing={plateMathButton}
                        />
                        {repsField}
                        {rpeField}
                        {doneCell}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2">
            <button type="button" onClick={addSet} className="text-sm font-semibold text-accent">
              + Add set
            </button>
          </div>
        </Card>

        {/* THE FOUR SENTENCES SOMEONE NEEDS BEFORE THEIR FIRST EVER LOGGED SET — first session
            only, dismissible, and it teaches the dotted-underline affordance the rest of this
            screen depends on.

            DIRECTLY UNDER THE SET LIST, NOT ABOVE IT, and that placement is measured rather than
            chosen. The card is 326 px tall; on a 390 × 664 phone the first working set already sits
            at ~633 px (mobility block, warm-up ramp and the no-history anchor prompt are all above
            it), so putting an explainer in front of the fields pushes the primary action of the
            screen to ~961 px — off-screen, for the exact user least equipped to go looking for it.
            An explanation you scroll INTO on your way down beats one that buries what it explains.
            `prescription-fidelity.spec.ts` holds that line. */}
        <FirstSetExplainer />

        {/* Ghost hint */}
        <p
          className={
            'text-xs text-muted-foreground transition-opacity duration-300 ' +
            (resting ? 'opacity-70' : 'opacity-100')
          }
        >
          {/* THE COPY HAS TO MATCH THE FIELDS. It used to promise "the load your scheme suggests"
              to an athlete looking at four empty boxes, because with no history there was nothing
              to suggest. Now the fields carry the PRESCRIPTION and the greyed numbers behind them
              carry last session, which is exactly what this sentence says. */}
          Boxes are pre-filled with what your scheme prescribes today. Greyed numbers behind them
          are last session&rsquo;s sets.{' '}
          <GlossaryTerm id="log-the-set" label="Close the collar" /> to log what you actually did —
          edit first if it differs.
        </p>

        {/* What makes the weight go up. Without this a scheme is decoration. */}
        <p
          className={
            'text-xs leading-snug text-muted-foreground transition-opacity duration-300 ' +
            (resting ? 'opacity-70' : 'opacity-100')
          }
          data-testid="progression-next-session"
        >
          <span className="font-semibold text-foreground">Next session:</span> {plan.nextSession}
        </p>

        {/* THE COOLDOWN, AFTER THE WORK. Only on the last exercise, and only ever below the set
            list — the position IS the coaching (Behm 2016: static stretching before lifting costs
            about 3.7% of subsequent performance, dynamic warm-up adds about 1.3%). Rendering it
            anywhere above the sets would contradict the rule it exists to teach. */}
        {isLast && prep.post.length > 0 && (
          <PrepBlock
            testId="workout-prep-post"
            title="After you finish · stretches"
            note={`Hold each for about 30 seconds, AFTER training — never before. ${PREP_EVIDENCE.cite}: static stretching beforehand costs strength, dynamic warm-up adds a little. These do not count as sets.`}
            items={prep.post}
            dimmed={resting}
          />
        )}

        {/* Every percentage on this screen is asserted by the app, so the app shows its working —
            including where the number is coaching convention rather than a trial result. */}
        <div
          className={
            'transition-opacity duration-300 ' + (resting ? 'opacity-70' : 'opacity-100')
          }
        >
          <ProgressionEvidenceNote testId="workout-progression-evidence" />
        </div>

        {/* Pager controls — dimmed (never disabled) while the rest timer holds focus */}
        <div
          className={
            'flex items-center gap-3 transition-opacity duration-300 ' +
            (resting ? 'opacity-70' : 'opacity-100')
          }
        >
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeftIcon size={16} /> Prev
          </Button>
          {isLast ? (
            <Button block texture glow={!resting} onClick={finishWorkout}>
              Finish workout
            </Button>
          ) : (
            <Button block onClick={() => setIndex((i) => Math.min(exercises.length - 1, i + 1))}>
              Next exercise <ArrowRightIcon size={16} />
            </Button>
          )}
        </div>
      </div>

      {/* Rest timer overlay */}
      {rest != null && (
        <RestTimer
          endsAt={rest.endsAt}
          total={rest.total}
          onDone={() => setRest(null)}
          onSkip={() => setRest(null)}
          onAdjust={(delta) =>
            setRest((s) => (s == null ? null : { ...s, endsAt: Math.max(Date.now() + 1000, s.endsAt + delta * 1000) }))
          }
        />
      )}

      {/* Swap sheet */}
      <SubstituteSheet
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        exerciseId={current.exerciseId}
        exerciseName={current.exerciseName}
        onPick={onSwap}
      />

      {/* Plate math sheet */}
      <Sheet open={plateForSet != null} onClose={() => setPlateForSet(null)} title="Plate calculator">
        {plateForSet != null && (
          <PlateCalculator total={current.sets[plateForSet]?.weight_kg ?? 0} />
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------------------ warm-up ramp */

/**
 * The warm-up ramp, in its OWN list.
 *
 * Two reasons it is not folded into the working sets, and both are load-bearing:
 *
 *   COACHING — a warm-up is not a hard set. The app's whole training currency is hard sets per
 *   muscle per week; a ramp counted as work would inflate every weekly goal reading, every heat
 *   colour and every target bar in the app against bands calibrated in hard sets.
 *
 *   ENGINEERING — the Playwright suite addresses working sets by 1-based index (`set-row-1`,
 *   `set-latch-0`). Sharing a list would renumber all of them.
 *
 * IT STARTS FOLDED. It used to fold only AFTER every step was ticked, which helps at the end of a
 * warm-up and not at all at the start — and the start is precisely when a first-time reverse-
 * pyramid athlete arrives, with the first working set roughly 930 px down a 664 px screen. The
 * summary row states what is required and how many steps there are, the soft gate on set 1 still
 * points at it, and one tap opens it. Nothing is hidden; it is one tap instead of ~190 px.
 */
function WarmupList({
  steps,
  done,
  onToggle,
  dimmed,
  required,
  alreadyWarm,
}: {
  steps: WarmupSet[];
  done: boolean[];
  onToggle: (i: number) => void;
  dimmed: boolean;
  required: boolean;
  /** true when an earlier lift already trained this pattern — the ramp is tapered, and says so */
  alreadyWarm: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const doneCount = done.filter(Boolean).length;
  const allDone = doneCount === steps.length && steps.length > 0;
  const collapsed = !expanded;

  return (
    <div
      className={
        'rounded-card border border-border bg-surface-2 transition-opacity duration-300 ' +
        (dimmed ? 'opacity-70' : 'opacity-100')
      }
      data-testid="warmup-block"
    >
      {/* The whole header IS the toggle, at a full 44 px, because on a folded card the header is
          the only thing to tap and a 16 px "Show" link is not a target with chalky hands. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="warmup-toggle"
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Warm-up{required ? ' · required' : ''}{' '}
          <span className="tabular-nums" data-testid="warmup-progress">
            {doneCount}/{steps.length}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
          {expanded ? 'Hide' : allDone ? 'Show' : 'Open'}
          <ChevronDownIcon
            size={13}
            aria-hidden
            className={'transition-transform duration-200 ' + (expanded ? 'rotate-180' : '')}
          />
        </span>
      </button>

      {collapsed ? (
        <p
          className="border-t border-border px-4 py-2 text-xs text-muted-foreground"
          data-testid="warmup-summary"
        >
          {allDone
            ? `Warm-up · ${steps.length} ${steps.length === 1 ? 'set' : 'sets'} done.`
            : `${steps.length} ${steps.length === 1 ? 'step' : 'steps'} in the movement you are about to train${alreadyWarm ? ' — tapered, because an earlier lift already warmed this pattern' : ''}. Tap to open.`}{' '}
          {/* The two words that decide whether this block makes sense at all. "Warm-up set" and
              "working set" are the app's own distinction — it is what the whole set counter is
              denominated in — and it was stated nowhere. */}
          These are <GlossaryTerm id="warmup-set" label="warm-up sets" />, so they do not count
          towards your <GlossaryTerm id="working-set" label="working sets" />.
        </p>
      ) : (
        <>
          <ul>
            {steps.map((w, i) => (
              <li
                key={w.index}
                data-testid={`warmup-row-${w.index}`}
                className={
                  'flex items-center gap-2 border-t border-border px-4 py-2 ' +
                  (done[i] ? 'bg-accent-muted/30' : '')
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold tabular-nums text-foreground">
                    {/* Percentage and reps always; kilos only when the athlete's own history
                        supplies one. Nothing here invents a starting weight. */}
                    {w.loadPct == null ? `${w.reps} reps` : `${w.reps} × ${w.loadPct}%`}
                    {w.loadKg != null ? ` · ${w.loadKg} kg` : ''}
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{w.cue}</p>
                </div>
                <CollarLatch
                  done={done[i] ?? false}
                  onClick={() => onToggle(i)}
                  aria-label={`Mark warm-up ${w.index} ${done[i] ? 'not done' : 'done'}`}
                  data-testid={`warmup-latch-${i}`}
                />
              </li>
            ))}
          </ul>
          {/* Mobility warms the BODY. This warms the LIFT. That sentence used to end "under a
              heavy-first scheme you need both" while the app supplied no mobility block at all —
              naming a prerequisite it did not provide. It provides one now (the block above the
              ramp on exercise 1), so the sentence points at it instead of at nothing. */}
          <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-muted-foreground">
            These don&rsquo;t count towards your{' '}
            <GlossaryTerm id="working-set" label="working sets" />. Mobility work warms your body;
            this warms the lift &mdash; under a heavy-first scheme you need both, and the mobility
            block for this session is at the top of exercise 1.
          </p>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------------- prep blocks */

/**
 * A prep block — dynamic mobility before the session, static stretches after it.
 *
 * NOT SETS, and the rule is identical to the ramp's: its own testids, excluded from `totalSets` /
 * `doneSets`, never written to the logged session. The app's currency is hard sets per muscle per
 * week, and a cat-cow counted as one would inflate every weekly reading in the product.
 *
 * NO LATCHES either, deliberately. A tick per stretch is five more taps in a session that is
 * already asking for a lot of them, and unlike a ramp step there is no gate that depends on knowing
 * whether it was done. The rows link out to the real how-to page instead, which is the thing a
 * beginner actually needs from "World's Greatest Stretch".
 */
function PrepBlock({
  testId,
  title,
  note,
  items,
  dimmed,
}: {
  testId: string;
  title: string;
  note: string;
  items: readonly PrepItem[];
  dimmed: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={
        'rounded-card border border-border bg-surface-2 transition-opacity duration-300 ' +
        (dimmed ? 'opacity-70' : 'opacity-100')
      }
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid={`${testId}-toggle`}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}{' '}
          <span className="tabular-nums">
            {items.length} {items.length === 1 ? 'move' : 'moves'}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
          {expanded ? 'Hide' : 'Open'}
          <ChevronDownIcon
            size={13}
            aria-hidden
            className={'transition-transform duration-200 ' + (expanded ? 'rotate-180' : '')}
          />
        </span>
      </button>
      {expanded && (
        <>
          <ul>
            {items.map((item) => (
              <li
                key={item.slug}
                data-testid={`${testId}-row-${item.slug}`}
                className="border-t border-border px-4 py-2"
              >
                <Link
                  href={`/exercises/${item.slug}`}
                  className="text-xs font-semibold text-foreground hover:text-accent"
                >
                  {item.name}
                </Link>{' '}
                <span className="text-xs tabular-nums text-accent">{item.seconds}s</span>
                <p className="text-[11px] leading-snug text-muted-foreground">{item.cue}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-muted-foreground">
            {note}
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- player empty states */

/**
 * The player can never white-screen (B1c). Whenever there is nothing to train — an unknown session
 * id, or a day that somehow holds no exercises — we say so plainly and always give a way out.
 */
function PlayerFallback({
  testId,
  title,
  body,
  secondary,
}: {
  testId: string;
  title: string;
  body: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="space-y-4" data-testid={testId}>
      <Link
        href="/today"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon size={15} /> Today
      </Link>
      <Card premium>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-muted text-accent">
          <DumbbellIcon size={22} />
        </div>
        <CardTitle className="mt-3">{title}</CardTitle>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/today">
            <Button size="sm">Back to Today</Button>
          </Link>
          {secondary && (
            <Link href={secondary.href}>
              <Button size="sm" variant="secondary">
                {secondary.label}
              </Button>
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------------------- plate calculator */

const PLATE_COLORS: Record<number, string> = {
  25: 'var(--color-accent)',
  20: 'var(--color-accent)',
  15: 'var(--color-accent-soft)',
  10: 'var(--color-info)',
  5: 'var(--color-success)',
  2.5: 'var(--color-muted-foreground)',
  1.25: 'var(--color-muted-foreground)',
};

/** Per-side plate stack drawn as a mini SVG (§6 P1-8), with a kg/lb display toggle. */
function PlateCalculator({ total }: { total: number }) {
  const [unit, setUnit] = React.useState<'kg' | 'lb'>('kg');
  const bd = plateBreakdown(total);
  const toDisplay = (kg: number) => (unit === 'kg' ? kg : +(kg / KG_PER_LB).toFixed(1));
  const barDisplay = unit === 'kg' ? BAR_KG : Math.round(BAR_KG / KG_PER_LB);
  const totalDisplay = unit === 'kg' ? total : +(total / KG_PER_LB).toFixed(1);

  // Flatten to one entry per physical plate for the drawing (largest → smallest, from the collar).
  const plates: number[] = [];
  for (const b of bd) for (let i = 0; i < b.count; i++) plates.push(b.plate);
  const maxPlate = Math.max(1, ...plates);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {/* The object the sheet is about, drawn rather than named. */}
          <EquipmentIllustration slug="barbell" size={22} selected />
          <span>
            Loading{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {totalDisplay} {unit}
            </span>{' '}
            on a {barDisplay} {unit} bar
          </span>
        </p>
        <div className="flex overflow-hidden rounded-chip border border-border text-xs font-semibold">
          {(['kg', 'lb'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              className={
                'px-3 py-1 transition-colors ' +
                (unit === u ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')
              }
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {plates.length === 0 ? (
        <p className="rounded-card bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
          Just the bar (or add micro-plates).
        </p>
      ) : (
        <>
          {/* Barbell diagram: sleeve + plates descending in size from the collar outward */}
          <div className="overflow-x-auto rounded-card border border-border bg-surface-2 p-4">
            <svg
              viewBox={`0 0 ${40 + plates.length * 16} 96`}
              className="h-24"
              role="img"
              aria-label={`Per side: ${bd.map((b) => `${b.count} times ${toDisplay(b.plate)} ${unit}`).join(', ')}`}
            >
              {/* sleeve */}
              <rect x={0} y={44} width={40 + plates.length * 16} height={8} rx={4} fill="var(--color-border-strong)" />
              {/* collar */}
              <rect x={4} y={40} width={6} height={16} rx={2} fill="var(--color-muted-foreground)" />
              {plates.map((p, i) => {
                const h = 24 + (p / maxPlate) * 56;
                const x = 14 + i * 16;
                return (
                  <g key={i}>
                    <rect
                      x={x}
                      y={48 - h / 2}
                      width={12}
                      height={h}
                      rx={3}
                      fill={PLATE_COLORS[p] ?? 'var(--color-accent)'}
                    />
                    <text
                      x={x + 6}
                      y={48}
                      fontSize={6}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--color-surface)"
                    >
                      {toDisplay(p)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Plates shown are per side.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {bd.map((b) => (
              <li
                key={b.plate}
                className="flex items-center gap-1.5 rounded-chip border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold tabular-nums"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: PLATE_COLORS[b.plate] ?? 'var(--color-accent)' }}
                />
                {b.count} × {toDisplay(b.plate)} {unit}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------- rest timer */

/** Eight evenly-spaced grip ticks around the rest ring — what makes it read as a plate face. */
const TICKS = [0, 45, 90, 135, 180, 225, 270, 315];

function RestTimer({
  endsAt,
  total,
  onDone,
  onSkip,
  onAdjust,
}: {
  endsAt: number;
  total: number;
  onDone: () => void;
  onSkip: () => void;
  onAdjust: (delta: number) => void;
}) {
  // The clock lives HERE, not in the player: this overlay is nine SVG nodes and a numeral, so a
  // once-per-second re-render costs nothing — where the same tick in the player's own state was
  // re-running prescriptions and set lists ~120× per rest. Deadline-derived, so a background tab
  // that throttles timers still lands on the right number when it wakes.
  const remaining = () => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const [left, setLeft] = React.useState(remaining);
  React.useEffect(() => {
    setLeft(remaining());
    const t = setInterval(() => {
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(next);
      if (next <= 0) {
        clearInterval(t);
        // Buzz on completion where supported (§6 P0-5).
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(120);
        }
        onDone();
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- endsAt is the full identity of one rest
  }, [endsAt]);

  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  // Gold ring geometry.
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[720px] px-4 md:bottom-4">
      <div className="rounded-card border-gradient-gold bg-surface-2 p-4 shadow-[var(--shadow-glow)]">
        <div className="flex items-center gap-4">
          <div className="relative grid h-24 w-24 shrink-0 place-items-center">
            {/* THE RING IS A PLATE FACE. It is the largest single object on screen mid-workout, so
                making it the app's own object costs nine SVG nodes and no layout: eight grip ticks
                around the rim, and a filled hub under the countdown. The numeral is more legible
                for it — it finally sits on solid ground instead of over a moving track. */}
            <svg viewBox="0 0 104 104" className="h-24 w-24 -rotate-90">
              <circle cx={52} cy={52} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={7} />
              {TICKS.map((deg) => (
                <line
                  key={deg}
                  x1={52 + (r - 9.5) * Math.cos((deg * Math.PI) / 180)}
                  y1={52 + (r - 9.5) * Math.sin((deg * Math.PI) / 180)}
                  x2={52 + (r - 5.5) * Math.cos((deg * Math.PI) / 180)}
                  y2={52 + (r - 5.5) * Math.sin((deg * Math.PI) / 180)}
                  stroke="var(--color-border-strong)"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              ))}
              <circle cx={52} cy={52} r={22} fill="var(--color-surface)" />
              <circle
                cx={52}
                cy={52}
                r={r}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - pct / 100)}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <span className="absolute font-display text-2xl font-bold tabular-nums text-accent">
              {mm}:{ss}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-accent">
              <TimerIcon size={16} />
              <p className="text-sm font-semibold">Rest</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Next set unlocks when the forge cools. Adjust or skip anytime.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                aria-label="Subtract 15 seconds"
                onClick={() => onAdjust(-15)}
                className="pointer-events-auto rounded-field bg-surface px-3 py-2 text-xs font-semibold tabular-nums transition-colors hover:text-accent"
              >
                −15s
              </button>
              <button
                type="button"
                aria-label="Add 15 seconds"
                onClick={() => onAdjust(15)}
                className="pointer-events-auto rounded-field bg-surface px-3 py-2 text-xs font-semibold tabular-nums transition-colors hover:text-accent"
              >
                +15s
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="pointer-events-auto ml-auto rounded-field bg-accent px-4 py-2 text-xs font-bold text-accent-foreground"
              >
                Skip rest
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------- summary */

/**
 * Count a numeral up from 0 over ~650ms. Pure flair — but the honest kind: it always LANDS on the
 * true value, reduced-motion users get the value immediately, and anything reading the text mid-
 * flight (a spec, a screen reader) sees a number that is merely still settling.
 */
function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (reduced || value <= 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 650;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <>{(format ?? String)(shown)}</>;
}

function Summary({
  day,
  exercises,
  elapsedMs,
  prs,
  strike,
}: {
  day: RoutineDay;
  exercises: ExerciseState[];
  elapsedMs: number;
  prs: PersonalRecord[];
  strike: StrikeInfo | null;
}) {
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const volume = exercises.reduce(
    (v, e) => v + e.sets.filter((s) => s.done).reduce((a, s) => a + s.reps * s.weight_kg, 0),
    0,
  );
  const mins = Math.max(1, Math.round(elapsedMs / 60000));
  const hasPRs = prs.length > 0;
  const rankedUp = strike?.rankedUp ?? false;

  // One gold burst out of the check badge when there is genuinely something to celebrate — a PR
  // or a rank-up — a beat after the screen settles. Confetti no-ops for reduced motion.
  const [burst, setBurst] = React.useState<BurstSpec | null>(null);
  React.useEffect(() => {
    if (!hasPRs && !rankedUp) return;
    const t = window.setTimeout(
      () => setBurst({ id: 1, x: 32, y: 32, kind: 'spark', power: 2 }),
      260,
    );
    return () => window.clearTimeout(t);
  }, [hasPRs, rankedUp]);

  return (
    <div className="space-y-5">
      <div className="ff-rise-in relative text-center">
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-muted text-accent shadow-[var(--shadow-glow)]">
          <CheckIcon size={32} />
          {hasPRs && (
            <span
              className="pointer-events-none absolute -right-1 -top-1 text-accent motion-safe:animate-ping"
              aria-hidden
            >
              <SparkIcon size={22} />
            </span>
          )}
          <Confetti burst={burst} />
        </div>
        <h1 className="mt-3 font-display text-display font-bold">Workout complete</h1>
        <p className="mt-1 text-sm text-muted-foreground">{day.name}</p>
        {/* The ladder, advanced. Every session is one strike — the number that Today's rank crest
            counts — so the summary names the blow it just landed. */}
        {strike && (
          <p
            className="mt-2 inline-flex items-center gap-1.5 rounded-chip border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-accent-muted px-3 py-1 text-xs font-bold text-accent"
            data-testid="summary-strike"
          >
            <HammerIcon size={13} />
            Strike #{strike.strikes} · {strike.rankName}
          </p>
        )}
      </div>

      {rankedUp && strike && (
        <Card
          premium
          className="ff-rise-in border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-center"
          style={{ '--ff-delay': '90ms' } as React.CSSProperties}
          data-testid="summary-rank-up"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Rank up
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-accent-soft">
            {strike.rankName}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Forged over {strike.strikes} {strike.strikes === 1 ? 'workout' : 'workouts'}. Keep
            striking.
          </p>
        </Card>
      )}

      {hasPRs && (
        <Card premium className="ff-rise-in" style={{ '--ff-delay': '140ms' } as React.CSSProperties}>
          <div className="flex items-center gap-2 text-accent">
            {/* A medal is a record. The trophy now means one thing only — session complete — and
                is no longer doing double duty for goals, PRs and finishing. */}
            <MedalIcon size={18} />
            <CardTitle className="text-accent-soft">
              New {prs.length === 1 ? 'PR' : 'PRs'}!
            </CardTitle>
          </div>
          <ul className="mt-3 space-y-2">
            {prs.map((p) => (
              <li key={p.exercise_id} className="flex items-center justify-between text-sm">
                <span className="truncate pr-3 font-semibold">{p.exercise_name}</span>
                <span className="shrink-0 rounded-chip bg-accent-muted px-2.5 py-0.5 text-xs font-bold tabular-nums text-accent">
                  {p.best_weight_kg}kg × {p.best_reps} · e1RM {Math.round(p.best_e1rm)}kg
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div
        className="ff-rise-in grid grid-cols-3 gap-3"
        style={{ '--ff-delay': '190ms' } as React.CSSProperties}
      >
        <Card className="text-center">
          <p className="font-display text-2xl font-bold tabular-nums text-accent">
            <CountUp value={doneSets} />
          </p>
          <p className="text-xs text-muted-foreground">sets logged</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl font-bold tabular-nums">
            <CountUp value={Math.round(volume)} format={(n) => n.toLocaleString()} />
          </p>
          <p className="text-xs text-muted-foreground">kg volume</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl font-bold tabular-nums">
            <CountUp value={mins} />
          </p>
          <p className="text-xs text-muted-foreground">minutes</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Session detail</CardTitle>
        <ul className="mt-3 space-y-2 text-sm">
          {exercises.map((e) => {
            const done = e.sets.filter((s) => s.done);
            return (
              <li key={e.routineExercise.id} className="flex justify-between">
                <span className="truncate pr-3">{e.exerciseName}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {done.length > 0
                    ? done.map((s) => `${s.reps}×${s.weight_kg}`).join(', ')
                    : 'skipped'}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <ShareCardButton
        dayName={day.name}
        doneSets={doneSets}
        volume={Math.round(volume)}
        mins={mins}
        prs={prs}
      />

      <Link href="/today" className="block">
        <Button size="lg" block>
          Done
        </Button>
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------- shareable session card (P2-18) */

function ShareCardButton({
  dayName,
  doneSets,
  volume,
  mins,
  prs,
}: {
  dayName: string;
  doneSets: number;
  volume: number;
  mins: number;
  prs: PersonalRecord[];
}) {
  const [busy, setBusy] = React.useState(false);

  function drawAndDownload() {
    setBusy(true);
    try {
      const W = 1080;
      const H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Brand background.
      ctx.fillStyle = '#0B121A';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(200, 120, 40, 200, 120, 900);
      glow.addColorStop(0, 'rgba(226,112,58,0.16)');
      glow.addColorStop(1, 'rgba(226,112,58,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Wordmark.
      ctx.font = '700 44px "Space Grotesk", system-ui, sans-serif';
      ctx.fillStyle = '#F4F1E8';
      ctx.fillText('Fit', 80, 150);
      const fitW = ctx.measureText('Fit').width;
      ctx.fillStyle = '#C98963';
      ctx.fillText('Forge', 80 + fitW, 150);

      // Session title.
      ctx.fillStyle = '#9AA3B5';
      ctx.font = '600 30px "Space Grotesk", system-ui, sans-serif';
      ctx.fillText('SESSION COMPLETE', 80, 320);
      ctx.fillStyle = '#F4F1E8';
      ctx.font = '700 84px "Space Grotesk", system-ui, sans-serif';
      ctx.fillText(dayName, 80, 420);

      // Stat trio.
      const stats: [string, string][] = [
        [String(doneSets), 'SETS'],
        [volume.toLocaleString(), 'KG VOLUME'],
        [String(mins), 'MINUTES'],
      ];
      stats.forEach(([val, label], i) => {
        const x = 80 + i * 320;
        ctx.fillStyle = '#C98963';
        ctx.font = '700 92px "Space Grotesk", system-ui, sans-serif';
        ctx.fillText(val, x, 640);
        ctx.fillStyle = '#9AA3B5';
        ctx.font = '600 26px Inter, system-ui, sans-serif';
        ctx.fillText(label, x, 690);
      });

      // PR banner.
      let y = 820;
      if (prs.length > 0) {
        ctx.fillStyle = '#C98963';
        // On-brand 4-point gold spark (mirrors WS-A SparkIcon) in place of an emoji.
        const sx = 96;
        const sy = y - 14;
        const sr = 22;
        ctx.beginPath();
        ctx.moveTo(sx, sy - sr);
        ctx.quadraticCurveTo(sx + sr * 0.18, sy - sr * 0.18, sx + sr, sy);
        ctx.quadraticCurveTo(sx + sr * 0.18, sy + sr * 0.18, sx, sy + sr);
        ctx.quadraticCurveTo(sx - sr * 0.18, sy + sr * 0.18, sx - sr, sy);
        ctx.quadraticCurveTo(sx - sr * 0.18, sy - sr * 0.18, sx, sy - sr);
        ctx.closePath();
        ctx.fill();
        ctx.font = '700 40px "Space Grotesk", system-ui, sans-serif';
        ctx.fillText(`${prs.length} New PR${prs.length > 1 ? 's' : ''}`, 132, y);
        y += 60;
        ctx.font = '500 30px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#F4F1E8';
        for (const p of prs.slice(0, 4)) {
          ctx.fillText(`${p.exercise_name} — ${p.best_weight_kg}kg × ${p.best_reps}`, 80, y);
          y += 46;
        }
      }

      // Footer.
      ctx.fillStyle = '#9AA3B5';
      ctx.font = '500 26px Inter, system-ui, sans-serif';
      ctx.fillText('Forged in Local Mode · your data stays in your browser', 80, H - 80);

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitforge-${dayName.toLowerCase().replace(/\s+/g, '-')}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" block onClick={drawAndDownload} disabled={busy} data-testid="share-session">
      {busy ? 'Rendering…' : 'Save image'}
    </Button>
  );
}
