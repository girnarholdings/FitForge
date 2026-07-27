'use client';

/**
 * Workout player (§2.3 · WS-F). One exercise per screen (pager); set list with last-session values
 * ghosted in as defaults; plate calculator; quick-swap to substitutes; and the P0-5 rest timer —
 * auto-starts on set completion, defaults by mechanics (compound 150s / isolation 90s), editable in
 * ±15s steps, skippable, big gold countdown, and dims everything but the active set while it runs.
 * Finishing persists the session (WS-F workoutLog) so the heatmap, PRs and streaks update, and PRs
 * beaten in-session fire the gold spark.
 */
import * as React from 'react';
import Link from 'next/link';
import { Button, Card, CardTitle, Sheet } from '@/components/ui';
import {
  ScaleIcon,
  CheckIcon,
  SwapIcon,
  TimerIcon,
  TrophyIcon,
  SparkIcon,
  XIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  DumbbellIcon,
} from '@/components/ui/icons';
import { SubstituteSheet } from '@/components/features/shared/SubstituteSheet';
import {
  mockPreviousSets,
  mockExerciseById,
  type RoutineDay,
  type RoutineExercise,
  type SubstituteRow,
  type Mechanics,
} from '@/components/features/_mock/data';
import { useActiveRoutine, useDemoState } from '@/lib/demo/useDemo';
import {
  logSession,
  getSessions,
  prsInSession,
  type WorkoutSession,
  type LoggedExercise,
  type PersonalRecord,
} from '@/components/features/shared/workoutLog';

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
}

/** Rest default by mechanics (§6 P0-5): compound 150s, isolation 90s. */
const REST_COMPOUND = 150;
const REST_ISOLATION = 90;
function restForMechanics(mechanics: Mechanics | undefined): number {
  return mechanics === 'isolation' ? REST_ISOLATION : REST_COMPOUND;
}
function mechanicsOf(exerciseId: string): Mechanics | undefined {
  return mockExerciseById(exerciseId)?.mechanics;
}

function buildInitialState(day: RoutineDay): ExerciseState[] {
  return day.exercises.map((re) => {
    const prev = mockPreviousSets(re.exercise_slug, re.sets);
    const sets: SetEntry[] = Array.from({ length: re.sets }, (_, i) => {
      const p = prev[i];
      return {
        reps: p ? p.reps : re.rep_max,
        weight_kg: p ? p.weight_kg : 0,
        rpe: p ? p.rpe : re.target_rpe,
        done: false,
      };
    });
    return {
      routineExercise: re,
      exerciseId: re.exercise_id,
      exerciseName: re.exercise_name,
      sets,
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
  const quick = useDemoState().quickSession;
  const day = React.useMemo<RoutineDay | undefined>(() => {
    // `/workout/quick` runs the one-off session the quick-workout picker built. It is a real
    // RoutineDay, so logging, volume credit and PRs all treat it identically to a planned day.
    // A missing one (deep link, cleared store) falls through rather than dead-ending.
    if (sessionId === 'quick' && quick) return quick;
    return routine.days.find((d) => d.id === sessionId) ?? routine.days[0];
  }, [routine, sessionId, quick]);

  const [exercises, setExercises] = React.useState<ExerciseState[]>(() =>
    day ? buildInitialState(day) : [],
  );
  const [index, setIndex] = React.useState(0);
  const [finished, setFinished] = React.useState(false);
  const [startedAt] = React.useState(() => Date.now());
  const [finishedSession, setFinishedSession] = React.useState<WorkoutSession | null>(null);
  const [prs, setPrs] = React.useState<PersonalRecord[]>([]);

  // Rest timer -------------------------------------------------------------
  const [restLeft, setRestLeft] = React.useState<number | null>(null);
  const restTotalRef = React.useRef(0);
  React.useEffect(() => {
    if (restLeft == null) return;
    if (restLeft <= 0) {
      // Buzz on completion where supported (§6 P0-5).
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(120);
      }
      setRestLeft(null);
      return;
    }
    const t = setTimeout(() => setRestLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  // Sheets -----------------------------------------------------------------
  const [swapOpen, setSwapOpen] = React.useState(false);
  const [plateForSet, setPlateForSet] = React.useState<number | null>(null);

  // Keep the pager index inside the exercise list at all times (belt and braces for the guard
  // below — a stale index must never be able to read past the end of the array).
  React.useEffect(() => {
    setIndex((i) => (i > 0 && i > exercises.length - 1 ? Math.max(0, exercises.length - 1) : i));
  }, [exercises.length]);

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

  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const resting = restLeft != null;

  function updateSet(exIdx: number, setIdx: number, patch: Partial<SetEntry>) {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) }
          : ex,
      ),
    );
  }

  function completeSet(setIdx: number) {
    const active = exercises[index];
    const s = active?.sets[setIdx];
    if (!active || !s) return;
    const nextDone = !s.done;
    updateSet(index, setIdx, { done: nextDone });
    if (nextDone) {
      // Rest timer auto-starts on set completion (§6 P0-5), sized by mechanics.
      const total = restForMechanics(mechanicsOf(active.exerciseId));
      restTotalRef.current = total;
      setRestLeft(total);
    }
  }

  function addSet() {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== index) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              reps: last?.reps ?? ex.routineExercise.rep_max,
              weight_kg: last?.weight_kg ?? 0,
              rpe: last?.rpe ?? ex.routineExercise.target_rpe,
              done: false,
            },
          ],
        };
      }),
    );
  }

  function onSwap(sub: SubstituteRow) {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === index ? { ...ex, exerciseId: sub.exercise_id, exerciseName: sub.name } : ex,
      ),
    );
  }

  function finishWorkout() {
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
      />
    );
  }

  const re = current.routineExercise;
  const isLast = index === exercises.length - 1;

  return (
    <div className="space-y-4 pb-4">
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
        <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
          {doneSets}/{totalSets} sets
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }}
        />
      </div>

      {/* Active exercise block. Mid-workout discipline (§6 P0-5): while resting, the current set
          card glows and the surrounding chrome dims — but nothing is disabled, so the pager and
          skip stay reachable. */}
      <div className="space-y-4">
        {/* Exercise header */}
        <div
          className={
            'flex items-start justify-between gap-3 transition-opacity duration-300 ' +
            (resting ? 'opacity-40' : 'opacity-100')
          }
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
              Exercise {index + 1} of {exercises.length}
            </p>
            <h1 className="truncate font-display text-2xl font-bold tracking-tight">
              {current.exerciseName}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Target {re.sets} × {re.rep_min}–{re.rep_max}
              {re.target_rpe ? ` · RPE ${re.target_rpe}` : ''} · rest{' '}
              {restForMechanics(mechanicsOf(current.exerciseId))}s
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setSwapOpen(true)}>
            <SwapIcon size={16} /> Swap
          </Button>
        </div>

        {/* Set list — the "current set card"; glows while resting */}
        <Card
          premium
          className={
            '!p-0 transition-shadow duration-300 ' +
            (resting ? 'shadow-[var(--shadow-glow)]' : '')
          }
        >
          <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem_2.75rem] items-center gap-2 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Set</span>
            <span>Weight (kg)</span>
            <span>Reps</span>
            <span>RPE</span>
            <span className="text-right">Done</span>
          </div>
          <ul>
            {current.sets.map((s, i) => {
              const ghost = mockPreviousSets(re.exercise_slug, current.sets.length)[i];
              return (
                <li
                  key={i}
                  className={
                    'grid grid-cols-[2rem_1fr_1fr_2.5rem_2.75rem] items-center gap-2 border-b border-border px-4 py-2 last:border-b-0 transition-colors ' +
                    (s.done ? 'bg-accent-muted/40' : '')
                  }
                >
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`Set ${i + 1} weight`}
                      value={s.weight_kg || ''}
                      placeholder={ghost ? String(ghost.weight_kg) : '0'}
                      onChange={(e) => updateSet(index, i, { weight_kg: Number(e.target.value) })}
                      className="h-9 w-full rounded-field border border-border bg-surface px-2 text-sm tabular-nums outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      aria-label={`Plate math for set ${i + 1}`}
                      onClick={() => setPlateForSet(i)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-field border border-border bg-surface-2 text-muted-foreground transition-colors hover:text-accent"
                    >
                      <ScaleIcon size={16} />
                    </button>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Set ${i + 1} reps`}
                    value={s.reps || ''}
                    placeholder={ghost ? String(ghost.reps) : String(re.rep_max)}
                    onChange={(e) => updateSet(index, i, { reps: Number(e.target.value) })}
                    className="h-9 w-full rounded-field border border-border bg-surface px-2 text-sm tabular-nums outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`Set ${i + 1} RPE`}
                    value={s.rpe ?? ''}
                    placeholder={ghost?.rpe != null ? String(ghost.rpe) : '—'}
                    onChange={(e) =>
                      updateSet(index, i, { rpe: e.target.value ? Number(e.target.value) : null })
                    }
                    className="h-9 w-full rounded-field border border-border bg-surface px-1 text-center text-sm tabular-nums outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    aria-label={`Mark set ${i + 1} ${s.done ? 'not done' : 'done'}`}
                    aria-pressed={s.done}
                    onClick={() => completeSet(i)}
                    className={
                      'ml-auto grid h-9 w-9 place-items-center rounded-field border transition-colors ' +
                      (s.done
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border bg-surface text-muted-foreground hover:border-accent')
                    }
                  >
                    <CheckIcon size={16} />
                  </button>
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

        {/* Ghost hint */}
        <p
          className={
            'text-xs text-muted-foreground transition-opacity duration-300 ' +
            (resting ? 'opacity-40' : 'opacity-100')
          }
        >
          Greyed numbers are last session&rsquo;s sets — tap ✓ to log the same, or edit first.
        </p>

        {/* Pager controls — dimmed (never disabled) while the rest timer holds focus */}
        <div
          className={
            'flex items-center gap-3 transition-opacity duration-300 ' +
            (resting ? 'opacity-40' : 'opacity-100')
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
            <Button block glow={!resting} onClick={finishWorkout}>
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
      {restLeft != null && (
        <RestTimer
          left={restLeft}
          total={restTotalRef.current}
          onSkip={() => setRestLeft(null)}
          onAdjust={(delta) =>
            setRestLeft((s) => (s == null ? null : Math.max(1, s + delta)))
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
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Loading{' '}
          <span className="font-semibold text-foreground tabular-nums">
            {totalDisplay} {unit}
          </span>{' '}
          on a {barDisplay} {unit} bar
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

function RestTimer({
  left,
  total,
  onSkip,
  onAdjust,
}: {
  left: number;
  total: number;
  onSkip: () => void;
  onAdjust: (delta: number) => void;
}) {
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
            <svg viewBox="0 0 104 104" className="h-24 w-24 -rotate-90">
              <circle cx={52} cy={52} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={7} />
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

function Summary({
  day,
  exercises,
  elapsedMs,
  prs,
}: {
  day: RoutineDay;
  exercises: ExerciseState[];
  elapsedMs: number;
  prs: PersonalRecord[];
}) {
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const volume = exercises.reduce(
    (v, e) => v + e.sets.filter((s) => s.done).reduce((a, s) => a + s.reps * s.weight_kg, 0),
    0,
  );
  const mins = Math.max(1, Math.round(elapsedMs / 60000));
  const hasPRs = prs.length > 0;

  return (
    <div className="space-y-5">
      <div className="relative text-center">
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
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Workout complete</h1>
        <p className="mt-1 text-sm text-muted-foreground">{day.name}</p>
      </div>

      {hasPRs && (
        <Card premium>
          <div className="flex items-center gap-2 text-accent">
            <TrophyIcon size={18} />
            <CardTitle className="text-gradient-gold">
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

      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="font-display text-2xl font-bold tabular-nums text-accent">{doneSets}</p>
          <p className="text-xs text-muted-foreground">sets logged</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl font-bold tabular-nums">
            {Math.round(volume).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">kg volume</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl font-bold tabular-nums">{mins}</p>
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
      ctx.fillStyle = '#0A0D14';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(200, 120, 40, 200, 120, 900);
      glow.addColorStop(0, 'rgba(228,184,77,0.16)');
      glow.addColorStop(1, 'rgba(228,184,77,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Wordmark.
      ctx.font = '700 44px "Space Grotesk", system-ui, sans-serif';
      ctx.fillStyle = '#F4F1E8';
      ctx.fillText('Fit', 80, 150);
      const fitW = ctx.measureText('Fit').width;
      ctx.fillStyle = '#E4B84D';
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
        ctx.fillStyle = '#E4B84D';
        ctx.font = '700 92px "Space Grotesk", system-ui, sans-serif';
        ctx.fillText(val, x, 640);
        ctx.fillStyle = '#9AA3B5';
        ctx.font = '600 26px Inter, system-ui, sans-serif';
        ctx.fillText(label, x, 690);
      });

      // PR banner.
      let y = 820;
      if (prs.length > 0) {
        ctx.fillStyle = '#E4B84D';
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
