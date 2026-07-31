import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * THE HEALTH STORE'S LOAD-BEARING PROMISES, none of which a happy-path demo exercises:
 *
 *   · IDEMPOTENT INGESTION — native resends anything un-acked, so "same batch twice = same
 *     state" is what stands between a flaky ack and doubled history.
 *   · BOUNDED HISTORY — 400 days per metric, or localStorage becomes an unbounded liability.
 *   · THE BODY-WEIGHT MERGE — a manual same-day entry beats a Health import FOREVER, while
 *     our own imports stay refreshable. Getting this backwards silently edits what the
 *     athlete typed.
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

const {
  ingestBatch,
  highWaterMarks,
  healthState,
  dailyPoints,
  healthSamples,
  setPermissionState,
  disconnect,
  reconnect,
  isHealthDisconnected,
  addDaysISO,
  _resetHealthStoreForTests,
  HEALTH_KEY,
  MAX_DAYS,
} = await import('./store');
const { getState: demoState, logWeight } = await import('@/lib/demo/store');
type HealthBatchPayload = import('@/lib/native/forgeBridge').HealthBatchPayload;
type HealthSample = import('@/lib/native/forgeBridge').HealthSample;

const rhrBatch = (id: string, ...points: Array<[string, number]>): HealthBatchPayload => ({
  batchId: id,
  metric: 'restingHeartRate',
  points: points.map(([date, value]) => ({ date, value, unit: 'count/min' })),
});

const sleepSample = (hkUuid: string, end: string, hours: number): HealthSample => ({
  hkUuid,
  start: `${addDaysISO(end.slice(0, 10), -1)}T22:30:00-07:00`,
  end,
  value: hours,
  unit: 'hr',
  kind: 'asleep',
});

beforeEach(() => {
  _resetHealthStoreForTests();
});

/* -------------------------------------------------------------------------- idempotency */

test('the same batch ingested twice is a no-op, not a duplicate', () => {
  const batch = rhrBatch('b-1', ['2026-07-29', 51], ['2026-07-30', 54]);
  ingestBatch(batch);
  const { daily, samples } = healthState();
  const once = JSON.stringify({ daily, samples });
  ingestBatch(batch);
  // Compare the DATA, not meta — lastBatchAt legitimately re-stamps on a resend.
  const after = healthState();
  assert.equal(
    JSON.stringify({ daily: after.daily, samples: after.samples }),
    once,
    'a resent batch must change no data',
  );
  assert.equal(dailyPoints('restingHeartRate').length, 2);
});

test('a point for an existing date REPLACES it — corrected data wins over stale', () => {
  ingestBatch(rhrBatch('b-1', ['2026-07-30', 54]));
  ingestBatch(rhrBatch('b-2', ['2026-07-30', 52]));
  const points = dailyPoints('restingHeartRate');
  assert.equal(points.length, 1);
  assert.equal(points[0]!.value, 52);
});

test('samples dedupe by hkUuid — the HealthKit uuid is the identity, not the timestamps', () => {
  ingestBatch({ batchId: 'b-1', metric: 'sleep', samples: [sleepSample('u-1', '2026-07-31T05:53:00-07:00', 6.9)] });
  // Native re-anchors and resends the same session, slightly re-derived.
  ingestBatch({ batchId: 'b-2', metric: 'sleep', samples: [sleepSample('u-1', '2026-07-31T05:55:00-07:00', 7.0)] });
  const samples = healthSamples('sleep');
  assert.equal(samples.length, 1, 'same hkUuid must replace, never duplicate');
  assert.equal(samples[0]!.value, 7.0);
});

test('points arrive out of order and still store ascending by date', () => {
  ingestBatch(rhrBatch('b-1', ['2026-07-30', 54], ['2026-07-28', 50], ['2026-07-29', 51]));
  assert.deepEqual(
    dailyPoints('restingHeartRate').map((p) => p.date),
    ['2026-07-28', '2026-07-29', '2026-07-30'],
  );
});

/* ------------------------------------------------------------------------ bounded history */

test(`history is bounded: only the newest ${MAX_DAYS} days of a metric survive`, () => {
  const points: Array<[string, number]> = [];
  for (let i = 0; i < MAX_DAYS + 10; i += 1) points.push([addDaysISO('2025-01-01', i), 5000 + i]);
  ingestBatch({ batchId: 'b-1', metric: 'steps', points: points.map(([date, value]) => ({ date, value, unit: 'count' })) });
  const stored = dailyPoints('steps');
  assert.equal(stored.length, MAX_DAYS);
  // The OLDEST days fell off; the newest survived — trimming the wrong end erases the present.
  assert.equal(stored[stored.length - 1]!.date, addDaysISO('2025-01-01', MAX_DAYS + 9));
});

/* ----------------------------------------------------------------------- high-water marks */

test('high-water marks: newest stored date per metric, null where nothing yet', () => {
  ingestBatch(rhrBatch('b-1', ['2026-07-29', 51], ['2026-07-30', 54]));
  ingestBatch({ batchId: 'b-2', metric: 'sleep', samples: [sleepSample('u-1', '2026-07-31T05:53:00-07:00', 6.9)] });
  const marks = highWaterMarks();
  assert.equal(marks.restingHeartRate, '2026-07-30');
  assert.equal(marks.sleep, '2026-07-31', 'a sample belongs to the LOCAL date its end falls on');
  assert.equal(marks.steps, null, 'null is the cue for the 90-day backfill');
  assert.equal(marks.workouts, null);
});

/* ---------------------------------------------------------------------------- disconnect */

test('disconnect stops ingesting but KEEPS imported data; reconnect resumes', () => {
  ingestBatch(rhrBatch('b-1', ['2026-07-29', 51]));
  disconnect();
  assert.equal(isHealthDisconnected(), true);
  ingestBatch(rhrBatch('b-2', ['2026-07-30', 54]));
  assert.equal(dailyPoints('restingHeartRate').length, 1, 'no new data while disconnected');
  assert.equal(dailyPoints('restingHeartRate')[0]!.value, 51, 'existing data untouched');
  reconnect();
  ingestBatch(rhrBatch('b-3', ['2026-07-30', 54]));
  assert.equal(dailyPoints('restingHeartRate').length, 2);
});

/* ---------------------------------------------------------------------------- permissions */

test('the permissions push lands in meta, verbatim, for the Profile card', () => {
  setPermissionState({ sleep: { requested: true, determined: true, yieldedData: true } });
  const meta = healthState().meta;
  assert.deepEqual(meta.permissions, { sleep: { requested: true, determined: true, yieldedData: true } });
  assert.ok(meta.permissionsUpdatedAt);
});

/* ----------------------------------------------------------------------- body-weight merge */

test('a bodyMass import writes through the demo logWeight path', () => {
  ingestBatch({ batchId: 'b-1', metric: 'bodyMass', points: [{ date: '2026-06-01', value: 82.44, unit: 'kg' }] });
  const entry = demoState().weights.find((w) => w.date === '2026-06-01');
  assert.equal(entry?.kg, 82.4, 'imported, rounded to 0.1 kg');
  assert.ok(healthState().meta.healthWeightDates.includes('2026-06-01'), 'provenance recorded');
});

test('A MANUAL SAME-DAY ENTRY WINS — an import never overwrites what the athlete typed', () => {
  logWeight('2026-06-02', 80.0); // the athlete's own entry, before any sync
  ingestBatch({ batchId: 'b-1', metric: 'bodyMass', points: [{ date: '2026-06-02', value: 83.3, unit: 'kg' }] });
  assert.equal(demoState().weights.find((w) => w.date === '2026-06-02')?.kg, 80.0);
  assert.ok(
    !healthState().meta.healthWeightDates.includes('2026-06-02'),
    'a skipped date must NOT be claimed as health-sourced, or the next re-sync would steal it',
  );
  // The health HISTORY still keeps the reading — only the merged product log defers to manual.
  assert.equal(dailyPoints('bodyMass').find((p) => p.date === '2026-06-02')?.value, 83.3);
});

test('re-syncs stay idempotent: a health-sourced date is OURS to refresh', () => {
  ingestBatch({ batchId: 'b-1', metric: 'bodyMass', points: [{ date: '2026-06-03', value: 82.0, unit: 'kg' }] });
  // Native re-anchors after a restore and resends the day with a corrected reading.
  ingestBatch({ batchId: 'b-2', metric: 'bodyMass', points: [{ date: '2026-06-03', value: 81.6, unit: 'kg' }] });
  assert.equal(demoState().weights.find((w) => w.date === '2026-06-03')?.kg, 81.6);
  assert.equal(
    healthState().meta.healthWeightDates.filter((d) => d === '2026-06-03').length,
    1,
    'provenance records the date once, not per sync',
  );
});

test('pounds convert to kilograms on the way into the weight log', () => {
  ingestBatch({ batchId: 'b-1', metric: 'bodyMass', points: [{ date: '2026-06-04', value: 180, unit: 'lb' }] });
  assert.equal(demoState().weights.find((w) => w.date === '2026-06-04')?.kg, 81.6);
});

/* ------------------------------------------------------------------------- load repair */

test('a corrupt blob on disk degrades to empty instead of throwing', () => {
  storage.set(HEALTH_KEY, '{definitely not json');
  _resetHealthStoreForTests_keepStorage();
  assert.deepEqual(dailyPoints('restingHeartRate'), []);
  assert.equal(isHealthDisconnected(), false);
});

test('half-shaped rows are dropped on load, valid ones kept', () => {
  storage.set(
    HEALTH_KEY,
    JSON.stringify({
      version: 1,
      daily: {
        restingHeartRate: [{ date: '2026-07-30', value: 54, unit: 'count/min' }, { date: 42 }],
        notAMetric: [{ date: '2026-07-30', value: 1, unit: 'x' }],
      },
      samples: { sleep: [{ hkUuid: 'only-a-uuid' }] },
      meta: { disconnected: 'yes' },
    }),
  );
  _resetHealthStoreForTests_keepStorage();
  assert.equal(dailyPoints('restingHeartRate').length, 1);
  assert.equal(healthSamples('sleep').length, 0);
  assert.equal(isHealthDisconnected(), false, 'a non-boolean flag normalizes to connected');
});

/** Reset the cache WITHOUT clearing storage — for the tests that seed disk bytes directly. */
function _resetHealthStoreForTests_keepStorage(): void {
  const saved = storage.get(HEALTH_KEY);
  _resetHealthStoreForTests();
  if (saved !== undefined) storage.set(HEALTH_KEY, saved);
}
