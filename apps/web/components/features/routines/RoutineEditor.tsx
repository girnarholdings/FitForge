'use client';

/**
 * Routine editor (§2.3): switch days, reorder/edit/remove exercises, add via type-ahead search,
 * swap via substitutes. Reorder is exposed as up/down controls (keyboard- & touch-friendly stand-in
 * for the drag interaction; INTEGRATION: wire a drag lib if desired).
 *
 * TWO THINGS WERE WRONG HERE AND ARE FIXED IN THIS PASS.
 *
 * 1. IT SHOWED SOMEONE ELSE'S PLAN. The editor read `mockRoutineById(routineId)`, which for any id
 *    other than the mock's own returns the hard-coded Upper/Lower fixture with the id swapped in.
 *    The generated routine's id is `demo`, so tapping "Edit routine" on your own plan opened a
 *    fabricated week of exercises you had never been prescribed. Fabricated training data is the
 *    one thing this app must never render, so the active routine from the Local Mode store now
 *    wins whenever its id matches; `mockRoutineById` survives only for the unreachable sample ids
 *    that `generateStaticParams` still prerenders.
 *
 * 2. SAVE DID NOTHING. Every edit lived in React state and "Save changes" only flipped a flag, so
 *    the athlete's changes were silently discarded on navigation. Saving now writes back through
 *    `update()`. Where there is genuinely nothing to write to — the pre-onboarding sample plan —
 *    the button is not offered at all rather than lying about persisting.
 *
 * The per-day read-out (`SessionSummary`) is live: it recomputes as sets are edited, so the cost
 * of a change is visible while it is being made.
 *
 * 3. IT ONLY EVER ANSWERED FOR ONE DAY. This route is the "routine detail" — the screen you open
 *    to understand the PLAN — and everything on it was scoped to whichever day tab happened to be
 *    selected. An athlete could delete every pulling exercise in the week and nothing on screen
 *    would say so. `PlanTargets` now sits above the day rail, computed from the SAME local edit
 *    state, so the week's hard sets, its minutes and its heaviest muscles move as the plan is
 *    edited — and it is the identical component the Workouts hub uses, so the two screens cannot
 *    quote different figures for the same routine.
 */
import * as React from 'react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardTitle,
  Chip,
  SearchInput,
  Stepper,
} from '@/components/ui';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  SwapIcon,
  XIcon,
} from '@/components/ui/icons';
import { SubstituteSheet } from '@/components/features/shared/SubstituteSheet';
import { useActiveRoutine, useDemoState } from '@/lib/demo/useDemo';
import { update, resolveProgressionScheme } from '@/lib/demo/store';
import { prescriptionAdjustmentForDraft } from '@/lib/demo/generate';
import type { ProgressionScheme } from '@fitforge/shared/rules';
import { SessionSummary } from './SessionCard';
import { PlanTargets } from './PlanTargets';
import {
  mockRoutineById,
  mockSearchExercises,
  mockExerciseById,
  type Routine,
  type RoutineExercise,
  type RoutineDay,
  type ExerciseSearchRow,
  type SubstituteRow,
} from '@/components/features/_mock/data';

let nextId = 1;
const genId = () => `new-rex-${nextId++}`;

const cloneDays = (days: readonly RoutineDay[]): RoutineDay[] =>
  days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) }));

/**
 * HYDRATION GATE, and it is load-bearing rather than cosmetic.
 *
 * `useSyncExternalStore` deliberately serves the SERVER snapshot during hydration, so the first
 * client render of this route sees the default sample routine and only the render after it sees
 * localStorage. An editor that seeded its React state from that first render would then have to
 * re-seed itself, and re-seeding races the user: tap "+" in the gap and either the edit is thrown
 * away, or the edit wins and the SAMPLE plan is frozen on screen with the athlete's own routine
 * never loading. That second outcome is the fabricated-data bug wearing a different hat.
 *
 * So the form is not mounted until the real routine is in hand. `key` guarantees a fresh, correctly
 * seeded editor if the underlying routine is ever replaced (e.g. "Re-generate my plan").
 */
export function RoutineEditor({ routineId }: { routineId: string }) {
  const state = useDemoState();
  const active = useActiveRoutine();
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  /** The athlete's real plan when this route IS their plan; the sample fixture only otherwise. */
  const source: Routine = React.useMemo(
    () => (active.id === routineId ? active : mockRoutineById(routineId)),
    [active, routineId],
  );

  // The editor's live read-outs are only useful if they are the numbers the PLAYER will run, so the
  // scheme has to reach both the day summary and the week panel. Without it, dropping a set from a
  // reverse-pyramid compound moved a figure the athlete never performs.
  const scheme = React.useMemo(() => resolveProgressionScheme(state), [state]);

  // The rep and rest defaults this plan was built with are sex-adjusted for a female draft. This
  // screen owns the CONTROLS that change them, which is where `sexAdjustedPrescription` argues the
  // reason belongs — an athlete asking "why is my rest 75s?" is standing on this screen. Empty
  // string for every draft the rule did not adjust, which is all of them except female.
  const prescriptionNote = React.useMemo(() => {
    const adj = prescriptionAdjustmentForDraft(state.draft);
    return adj.adjusted ? adj.label : '';
  }, [state.draft]);

  if (!hydrated) {
    return (
      <div className="space-y-5 pb-4">
        <Link href="/routines" className="text-sm font-medium text-muted-foreground">
          ← Workouts
        </Link>
        <p className="text-sm text-muted-foreground">Loading your routine…</p>
      </div>
    );
  }

  return (
    <RoutineEditorForm
      key={source.id}
      routineId={routineId}
      source={source}
      scheme={scheme}
      prescriptionNote={prescriptionNote}
      /** Only a routine that exists in the store can be written back to it. */
      canPersist={state.routine != null && state.routine.id === routineId}
    />
  );
}

function RoutineEditorForm({
  routineId,
  source,
  scheme,
  prescriptionNote,
  canPersist,
}: {
  routineId: string;
  source: Routine;
  /** the progression scheme in force — see the read-outs below, which must match the player */
  scheme: ProgressionScheme;
  /** why the rep/rest defaults differ from the goal defaults; '' when they do not */
  prescriptionNote: string;
  canPersist: boolean;
}) {
  const [name, setName] = React.useState(source.name);
  const [days, setDays] = React.useState<RoutineDay[]>(() => cloneDays(source.days));
  const [activeDayId, setActiveDayId] = React.useState(source.days[0]?.id ?? '');
  const [swapFor, setSwapFor] = React.useState<RoutineExercise | null>(null);
  const [dirty, setDirty] = React.useState(false);

  const activeDay = days.find((d) => d.id === activeDayId) ?? days[0] ?? null;

  /** The routine AS EDITED — so the week-level read-out reflects unsaved changes, not the store. */
  const edited: Routine = React.useMemo(() => ({ ...source, name, days }), [source, name, days]);

  function save() {
    if (!canPersist) return;
    update((s) =>
      s.routine && s.routine.id === routineId
        ? { ...s, routine: { ...s.routine, name, days: cloneDays(days) } }
        : s,
    );
    setDirty(false);
  }

  function mutateDay(dayId: string, fn: (d: RoutineDay) => RoutineDay) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? fn(d) : d)));
    setDirty(true);
  }
  function mutateExercise(dayId: string, rexId: string, patch: Partial<RoutineExercise>) {
    mutateDay(dayId, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.id === rexId ? { ...e, ...patch } : e)),
    }));
  }
  function move(dayId: string, rexId: string, dir: -1 | 1) {
    mutateDay(dayId, (d) => {
      const idx = d.exercises.findIndex((e) => e.id === rexId);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= d.exercises.length) return d;
      const next = [...d.exercises];
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item!);
      return { ...d, exercises: next.map((e, i) => ({ ...e, position: i + 1 })) };
    });
  }
  function remove(dayId: string, rexId: string) {
    mutateDay(dayId, (d) => ({
      ...d,
      exercises: d.exercises
        .filter((e) => e.id !== rexId)
        .map((e, i) => ({ ...e, position: i + 1 })),
    }));
  }
  function addExercise(dayId: string, row: ExerciseSearchRow) {
    const ex = mockExerciseById(row.exercise_id);
    if (!ex) return;
    mutateDay(dayId, (d) => ({
      ...d,
      exercises: [
        ...d.exercises,
        {
          id: genId(),
          position: d.exercises.length + 1,
          exercise_id: ex.id,
          exercise_slug: ex.slug,
          exercise_name: ex.name,
          image_path: ex.image_path,
          sets: 3,
          rep_min: 8,
          rep_max: 12,
          target_rpe: 7,
          rest_seconds: 90,
          superset_group: null,
          notes: null,
        },
      ],
    }));
  }
  function applySwap(sub: SubstituteRow) {
    if (!swapFor || !activeDay) return;
    const ex = mockExerciseById(sub.exercise_id);
    mutateExercise(activeDay.id, swapFor.id, {
      exercise_id: sub.exercise_id,
      exercise_slug: ex?.slug ?? swapFor.exercise_slug,
      exercise_name: sub.name,
    });
  }

  return (
    <div className="space-y-5 pb-4">
      <header className="space-y-3">
        <Link href="/routines" className="text-sm font-medium text-muted-foreground">
          ← Workouts
        </Link>
        <input
          value={name}
          aria-label="Routine name"
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-xl font-extrabold tracking-tight outline-none focus:border-accent"
        />
        {canPersist ? (
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!dirty} onClick={save} data-testid="routine-save">
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="routine-editor-sample-notice">
            This is the sample plan — finish setup and your own routine will be editable here.
          </p>
        )}
      </header>

      {/* Day tabs. `whitespace-nowrap` because a generated day is called "Power day · lower
          emphasis", not "Day A" — without it every tab wrapped into a four-line lozenge and the
          rail became taller than the exercise it was there to select. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <Chip
            key={d.id}
            selected={d.id === activeDayId}
            onClick={() => setActiveDayId(d.id)}
            className="shrink-0 whitespace-nowrap"
          >
            {d.name.replace(/^Day /, '')}
          </Chip>
        ))}
      </div>

      {/* WHAT THIS DAY IS, before the row-by-row editing: muscles, hard sets, minutes, the anchor
          lift, patterns and kit. Recomputed from local state, so it tracks every edit as made. */}
      {activeDay && <SessionSummary day={activeDay} scheme={scheme} testId="routine-day-stats" />}

      {/* …AND WHAT THE WEEK IS. Placed between the day read-out and the exercise rows on purpose:
          the day you are editing comes first, the week it sits inside comes second, and the rows
          you came to change start immediately after. Fed from the same unsaved edit state, so
          gutting every pulling exercise shows up here before it is saved rather than being
          discovered on the Workouts screen a week later. */}
      <PlanTargets routine={edited} scheme={scheme} />

      {/* ONCE, directly above the rows whose rep/rest steppers it explains — not per exercise, or
          the same sentence would repeat twenty-four times. It has to be here rather than only on
          the plan preview: this is the screen where the numbers are actually changed, and a
          personalisation about the athlete's body with no stated reason reads as a bug. */}
      {prescriptionNote && (
        <p
          className="rounded-2xl border border-border bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
          data-testid="routine-prescription-note"
        >
          {prescriptionNote}
        </p>
      )}

      {/* Active day exercises */}
      <div className="space-y-3">
        {activeDay?.exercises.map((e, i) => (
          <Card key={e.id} className="!p-0">
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/exercises/${e.exercise_slug}`}
                  className="block truncate text-sm font-semibold text-foreground hover:text-accent"
                >
                  {i + 1}. {e.exercise_name}
                </Link>
                {e.superset_group != null && (
                  <span className="text-xs text-accent">Superset {e.superset_group}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* These four used to be literal typographic characters (↑ ↓ ⇄ ✕) passed as button
                    labels — the row's controls rendered in whatever fallback font the phone chose,
                    at an optical weight matching nothing else on screen. Real icons from the house
                    family now; every `label` (and so every aria-label) is unchanged. */}
                <IconBtn label="Move up" disabled={i === 0} onClick={() => move(activeDay.id, e.id, -1)}>
                  <ChevronUpIcon size={16} />
                </IconBtn>
                <IconBtn
                  label="Move down"
                  disabled={i === activeDay.exercises.length - 1}
                  onClick={() => move(activeDay.id, e.id, 1)}
                >
                  <ChevronDownIcon size={16} />
                </IconBtn>
                <IconBtn label="Swap" onClick={() => setSwapFor(e)}>
                  <SwapIcon size={16} />
                </IconBtn>
                <IconBtn label="Remove" onClick={() => remove(activeDay.id, e.id)}>
                  <XIcon size={16} />
                </IconBtn>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
              <Field label="Sets">
                <Stepper
                  value={e.sets}
                  min={1}
                  max={10}
                  onChange={(v) => mutateExercise(activeDay.id, e.id, { sets: v })}
                  aria-label={`${e.exercise_name} sets`}
                />
              </Field>
              <Field label="Rep min">
                <NumberBox
                  value={e.rep_min}
                  onChange={(v) =>
                    mutateExercise(activeDay.id, e.id, { rep_min: v, rep_max: Math.max(v, e.rep_max) })
                  }
                />
              </Field>
              <Field label="Rep max">
                <NumberBox
                  value={e.rep_max}
                  onChange={(v) =>
                    mutateExercise(activeDay.id, e.id, { rep_max: Math.max(v, e.rep_min) })
                  }
                />
              </Field>
              <Field label="Rest (s)">
                <NumberBox
                  value={e.rest_seconds}
                  step={15}
                  onChange={(v) => mutateExercise(activeDay.id, e.id, { rest_seconds: v })}
                />
              </Field>
            </div>
          </Card>
        ))}
      </div>

      {/* Add exercise via type-ahead */}
      {activeDay && (
        <Card>
          <CardTitle className="mb-2 text-sm">Add exercise</CardTitle>
          <SearchInput<ExerciseSearchRow>
            search={async (q) => mockSearchExercises(q, 8)}
            getKey={(r) => r.exercise_id}
            onSelect={(r) => addExercise(activeDay.id, r)}
            renderResult={(r) => <span className="font-medium">{r.name}</span>}
            placeholder="Search the catalog…"
            aria-label="Add exercise to day"
          />
        </Card>
      )}

      <SubstituteSheet
        open={swapFor != null}
        onClose={() => setSwapFor(null)}
        exerciseId={swapFor?.exercise_id ?? ''}
        exerciseName={swapFor?.exercise_name ?? ''}
        onPick={applySwap}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberBox({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base tabular-nums outline-none focus:border-accent"
    />
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-sm text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
