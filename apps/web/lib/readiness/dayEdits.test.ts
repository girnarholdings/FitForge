import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceDay, techniqueDay, applySwaps, buildAdaptedDay } from './dayEdits';
import type { RoutineDay } from '@/components/features/_mock/data';

function day(): RoutineDay {
  return {
    id: 'day-a',
    day_index: 0,
    name: 'Push',
    focus: 'Push',
    weekday: 1,
    exercises: [
      row('r1', 'bench', 'Bench Press', 4),
      row('r2', 'ohp', 'Overhead Press', 3),
      row('r3', 'lateral-raise', 'Lateral Raise', 2),
    ],
  };
}

function row(id: string, slug: string, name: string, sets: number) {
  return {
    id,
    position: 0,
    exercise_id: `ex-${slug}`,
    exercise_slug: slug,
    exercise_name: name,
    image_path: null,
    sets,
    rep_min: 8,
    rep_max: 12,
    target_rpe: 8,
    rest_seconds: 120,
    superset_group: null,
    notes: null,
  };
}

test('reduceDay halves sets with a floor of 2, renames, and re-ids', () => {
  const d = reduceDay(day());
  assert.deepEqual(
    d.exercises.map((e) => e.sets),
    [2, 2, 2],
    '4→2, 3→2 (floor via max(2, floor(n/2))), 2→2',
  );
  assert.equal(d.name, 'Push · reduced');
  assert.equal(d.id, 'adapt-day-a');
  // the source day is untouched — these are pure builders
  assert.equal(day().exercises[0]!.sets, 4);
});

test('techniqueDay caps sets at 2, sets RPE 6 and carries the light-day note', () => {
  const d = techniqueDay(day());
  assert.ok(d.exercises.every((e) => e.sets <= 2));
  assert.ok(d.exercises.every((e) => e.target_rpe === 6));
  assert.match(d.exercises[0]!.notes ?? '', /leave 4\+ reps/i);
  assert.equal(d.name, 'Push · technique');
});

test('applySwaps replaces only the named rows, keeping each row’s prescription', () => {
  const d = applySwaps(day(), [
    { from_slug: 'bench', to_slug: 'db-bench', to_name: 'Dumbbell Bench Press', to_id: 'ex-db-bench' },
  ]);
  assert.equal(d.exercises[0]!.exercise_slug, 'db-bench');
  assert.equal(d.exercises[0]!.exercise_name, 'Dumbbell Bench Press');
  assert.equal(d.exercises[0]!.sets, 4, 'the slot prescription survives the swap');
  assert.equal(d.exercises[1]!.exercise_slug, 'ohp', 'unnamed rows untouched');
});

test('buildAdaptedDay: rest yields null; proceed-with-swaps yields an adjusted day; plain proceed yields null', () => {
  assert.equal(buildAdaptedDay(day(), 'rest'), null);
  assert.equal(buildAdaptedDay(day(), 'proceed'), null, 'no edit → nothing to start specially');
  const adjusted = buildAdaptedDay(day(), 'proceed', [
    { from_slug: 'ohp', to_slug: 'db-ohp', to_name: 'DB Shoulder Press', to_id: 'ex-db-ohp' },
  ]);
  assert.ok(adjusted);
  assert.equal(adjusted!.name, 'Push · adjusted');
  assert.equal(adjusted!.exercises[1]!.exercise_slug, 'db-ohp');
});

test('buildAdaptedDay composes swaps with the reduce edit', () => {
  const d = buildAdaptedDay(day(), 'reduce', [
    { from_slug: 'bench', to_slug: 'db-bench', to_name: 'DB Bench', to_id: 'ex-db-bench' },
  ]);
  assert.ok(d);
  assert.equal(d!.exercises[0]!.exercise_slug, 'db-bench');
  assert.equal(d!.exercises[0]!.sets, 2, 'swapped AND halved');
});
