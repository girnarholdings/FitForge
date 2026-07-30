import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * MERGE VS OVERWRITE, tested where the decision actually lives.
 *
 * Import used to be one irreversible verb. The UI now asks, but the promise the UI makes — "merge
 * adds what you are missing and deletes nothing" — is only as true as this function, so it is the
 * function that gets pinned:
 *
 *   · merge is a UNION and never loses a local row,
 *   · overwrite really does replace,
 *   · `inspectBackup` reports the same numbers the import then writes (the confirm sheet shows
 *     those numbers, so a disagreement here is a lie on screen),
 *   · device-local sync bookkeeping never travels in a backup at all.
 */

const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
  },
};

const { eraseAllLocalData, exportAllState, getState, importAllState, inspectBackup, localSummary, update } =
  await import('./store');
const { replaceWorkoutLog } = await import('@/components/features/shared/workoutLog');
type NutritionLog = import('@/components/features/_mock/data').NutritionLog;
type Routine = import('@/components/features/_mock/data').Routine;

function session(id: string, finishedAt: string) {
  return { id, dayId: 'd1', dayName: 'Push', finishedAt, exercises: [] };
}
function food(id: string, name: string, logged_on = '2026-07-28'): NutritionLog {
  return {
    id,
    logged_on,
    meal_slot: 'lunch',
    food_id: null,
    custom_name: name,
    quantity_g: 100,
    kcal: 100,
    protein_g: 10,
    carbs_g: 5,
    fat_g: 2,
  };
}

/** A minimal but VALID routine — the importer's validator rejects a half-shaped one. */
function routineNamed(name: string): Routine {
  return {
    id: 'r1',
    name,
    description: null,
    goal: null,
    source: 'generated',
    is_active: true,
    start_date: null,
    days: [],
  };
}

/**
 * Put a device into a known state, then hand back the backup text it would export.
 *
 * Seeding goes through the store's own writers rather than poking localStorage, because both slices
 * keep an in-memory cache — a direct `setItem` is invisible to them, and the first version of this
 * test spent its time asserting against stale caches instead of against the merge.
 */
function seedAndExport(seed: () => void): string {
  eraseAllLocalData();
  storage.clear();
  seed();
  return exportAllState();
}

test('merge unions both sides; overwrite replaces this device', () => {
  // THEIR device: one workout, one food row, one weigh-in, a plan of its own.
  const theirs = seedAndExport(() => {
    update((s) => ({
      ...s,
      routine: routineNamed('Their plan'),
      logsByDate: { '2026-07-28': [food('their-food', 'Their oats')] },
      weights: [{ date: '2026-07-20', kg: 80 }],
    }));
    replaceWorkoutLog({ version: 1, sessions: [session('their-1', '2026-07-20T10:00:00.000Z')] });
    storage.set('fitforge.customFoods.v1', JSON.stringify(['theirs']));
  });

  /* -- MERGE ---------------------------------------------------------------------------------- */
  seedAndExport(() => {
    update((s) => ({
      ...s,
      routine: routineNamed('My plan'),
      logsByDate: { '2026-07-28': [food('my-food', 'My eggs')] },
      weights: [{ date: '2026-07-25', kg: 78 }],
    }));
    replaceWorkoutLog({ version: 1, sessions: [session('mine-1', '2026-07-25T10:00:00.000Z')] });
    storage.set('fitforge.customFoods.v1', JSON.stringify(['mine']));
  });

  const merged = importAllState(theirs, 'merge');
  assert.equal(merged.ok, true);

  const afterMerge = getState();
  assert.deepEqual(
    afterMerge.logsByDate['2026-07-28']?.map((r) => r.id).sort(),
    ['my-food', 'their-food'],
    'both food rows survive a merge',
  );
  assert.deepEqual(afterMerge.weights.map((w) => w.date), ['2026-07-20', '2026-07-25']);
  // The plan and profile are settings, not history: the device you are holding keeps its own.
  assert.equal(afterMerge.routine?.name, 'My plan', 'merge does not adopt their plan');
  assert.equal(localSummary().sessions, 2, 'both workouts survive a merge');
  // Local caches are the ones in use — a merge may add missing keys but never clobber.
  assert.equal(storage.get('fitforge.customFoods.v1'), JSON.stringify(['mine']));

  /* -- OVERWRITE ------------------------------------------------------------------------------ */
  const replaced = importAllState(theirs, 'overwrite');
  assert.equal(replaced.ok, true);
  const afterOverwrite = getState();
  assert.deepEqual(afterOverwrite.logsByDate['2026-07-28']?.map((r) => r.id), ['their-food']);
  assert.equal(afterOverwrite.routine?.name, 'Their plan');
  assert.equal(localSummary().sessions, 1);
  assert.equal(storage.get('fitforge.customFoods.v1'), JSON.stringify(['theirs']));
});

test('inspectBackup reports exactly what an import would write', () => {
  const backup = seedAndExport(() => {
    update((s) => ({
      ...s,
      routine: routineNamed('Upper/Lower'),
      logsByDate: {
        '2026-07-27': [food('a', 'Oats', '2026-07-27')],
        '2026-07-28': [food('b', 'Rice'), food('c', 'Chicken')],
        '2026-07-29': [], // an empty day is not a food day
      },
      weights: [{ date: '2026-07-25', kg: 78 }],
    }));
    replaceWorkoutLog({
      version: 1,
      sessions: [session('s1', '2026-07-25T10:00:00.000Z'), session('s2', '2026-07-27T10:00:00.000Z')],
    });
  });

  const inspected = inspectBackup(backup);
  assert.equal(inspected.ok, true);
  if (!inspected.ok) return;
  assert.equal(inspected.summary.sessions, 2);
  assert.equal(inspected.summary.foodDays, 2);
  assert.equal(inspected.summary.foodEntries, 3);
  assert.equal(inspected.summary.weighIns, 1);
  assert.equal(inspected.summary.routineName, 'Upper/Lower');
  assert.equal(inspected.summary.latestSession, '2026-07-27T10:00:00.000Z');
  assert.ok(inspected.summary.exportedAt, 'the file carries when it was exported');

  // Apply it onto an empty device: the promised numbers are the delivered numbers.
  eraseAllLocalData();
  storage.clear();
  assert.equal(importAllState(backup, 'overwrite').ok, true);
  const after = localSummary();
  assert.equal(after.sessions, inspected.summary.sessions);
  assert.equal(after.foodDays, inspected.summary.foodDays);
  assert.equal(after.foodEntries, inspected.summary.foodEntries);
  assert.equal(after.weighIns, inspected.summary.weighIns);
  assert.equal(after.routineName, inspected.summary.routineName);
});

test('a rejected backup reports the same error from inspect and import, and writes nothing', () => {
  seedAndExport(() => {
    update((s) => ({ ...s, logsByDate: { '2026-07-28': [food('keep-me', 'Oats')] } }));
  });

  for (const bad of ['not json at all', '[]', JSON.stringify({ format: 'fitforge.backup', version: 99 })]) {
    const inspected = inspectBackup(bad);
    const imported = importAllState(bad, 'overwrite');
    assert.equal(inspected.ok, false);
    assert.equal(imported.ok, false);
    if (!inspected.ok && !imported.ok) assert.equal(inspected.error, imported.error);
  }
  assert.deepEqual(getState().logsByDate['2026-07-28']?.map((r) => r.id), ['keep-me']);
});

test('sync bookkeeping is device-local: it never rides a backup', () => {
  const backup = seedAndExport(() => {
    storage.set('fitforge.cloudPushedAt.v1', '1750000000000');
    storage.set('fitforge.cloudPushedUid.v1', 'someone-elses-uid');
    storage.set('fitforge.customFoods.v1', JSON.stringify(['ok']));
  });
  const extras = (JSON.parse(backup) as { extras: Record<string, string> }).extras;
  assert.equal(extras['fitforge.cloudPushedAt.v1'], undefined);
  assert.equal(extras['fitforge.cloudPushedUid.v1'], undefined);
  assert.ok(extras['fitforge.customFoods.v1'], 'ordinary caches still travel');
});
