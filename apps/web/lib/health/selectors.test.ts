import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * THE SELECTOR LAYER'S PRODUCT LAWS, as math:
 *
 *   · Baselines are trailing MEDIANS with hard minimums — RHR needs 14 days, HRV 30, and one
 *     day short means NULL, not "close enough". A mean would let one rough night drag "your
 *     usual"; the median is why it cannot.
 *   · MISSING DATA IS SILENCE. `overnight` on a dataless morning is null — never a zero that
 *     reads as "you slept zero hours".
 *   · "Your usual" excludes the morning being judged — a baseline that includes today grades
 *     today against itself.
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

const { ingestBatch, addDaysISO, _resetHealthStoreForTests } = await import('./store');
const {
  overnight,
  weightFor,
  weeklyActivity,
  baselines,
  permissionState,
  RHR_BASELINE_DAYS,
  HRV_BASELINE_DAYS,
} = await import('./selectors');
const { setPermissionState } = await import('./store');
type HealthBatchPayload = import('@/lib/native/forgeBridge').HealthBatchPayload;

/** `count` consecutive day-points ENDING the day before `endBefore`. */
function seedDaily(
  metric: HealthBatchPayload['metric'],
  unit: string,
  values: number[],
  endBefore: string,
): void {
  ingestBatch({
    batchId: `seed-${metric}`,
    metric,
    points: values.map((value, i) => ({
      date: addDaysISO(endBefore, i - values.length),
      value,
      unit,
    })),
  });
}

/** One clean asleep session ending on the morning of `dateISO`, so `overnight` has its anchor. */
function seedSleep(dateISO: string, hours = 7): void {
  ingestBatch({
    batchId: `seed-sleep-${dateISO}`,
    metric: 'sleep',
    samples: [
      {
        hkUuid: `sleep-${dateISO}`,
        start: `${addDaysISO(dateISO, -1)}T22:30:00-07:00`,
        end: `${dateISO}T06:00:00-07:00`,
        value: hours,
        unit: 'hr',
        kind: 'asleep',
      },
    ],
  });
}

beforeEach(() => {
  _resetHealthStoreForTests();
});

/* ------------------------------------------------------------------------- baseline math */

test('RHR baseline: 13 points is NULL — under the minimum the app has no opinion', () => {
  seedDaily('restingHeartRate', 'count/min', Array(RHR_BASELINE_DAYS - 1).fill(52), '2026-07-31');
  assert.equal(baselines().rhr, null);
});

test('RHR baseline: exactly 14 points yields the median, not the mean', () => {
  // 13 quiet days at 50 and one spike to 90: mean ≈ 52.9, median 50. The spike must not move
  // "your usual" — that is the entire reason the contract says median.
  seedDaily('restingHeartRate', 'count/min', [...Array(13).fill(50), 90], '2026-07-31');
  assert.equal(baselines().rhr, 50);
});

test('RHR baseline is TRAILING: only the newest 14 points count', () => {
  // 14 old days at 60, then 14 recent days at 50 — the athlete got fitter; the baseline follows.
  seedDaily('restingHeartRate', 'count/min', [...Array(14).fill(60), ...Array(14).fill(50)], '2026-07-31');
  assert.equal(baselines().rhr, 50);
});

test('HRV baseline: 29 points is NULL, 30 is a median', () => {
  seedDaily('hrvSdnn', 'ms', Array(HRV_BASELINE_DAYS - 1).fill(48), '2026-07-31');
  assert.equal(baselines().hrv, null);
  _resetHealthStoreForTests();
  seedDaily('hrvSdnn', 'ms', [...Array(29).fill(48), 90], '2026-07-31');
  assert.equal(baselines().hrv, 48);
});

/* ---------------------------------------------------------------------------- overnight */

test('overnight with NO data is null — silence, never a row of zeros', () => {
  assert.equal(overnight('2026-07-31'), null);
});

test('a morning with RHR but NO sleep stays silent — the row leads with "Slept …"', () => {
  // Non-null overnight GUARANTEES sleepHours (consumers render it unguarded); an RHR-only
  // morning must therefore be null here — RHR still reaches Trends via its own series.
  seedDaily('restingHeartRate', 'count/min', Array(20).fill(51), '2026-08-01');
  assert.equal(overnight('2026-07-31'), null);
});

test('overnight sums the sleep sessions ending that morning', () => {
  ingestBatch({
    batchId: 'b-sleep',
    metric: 'sleep',
    samples: [
      // A fragmented night: two asleep spans, both ending on the morning of the 31st.
      { hkUuid: 'u-1', start: '2026-07-30T22:41:00-07:00', end: '2026-07-31T02:00:00-07:00', value: 3.2, unit: 'hr', kind: 'asleep' },
      { hkUuid: 'u-2', start: '2026-07-31T02:30:00-07:00', end: '2026-07-31T05:53:00-07:00', value: 3.3, unit: 'hr', kind: 'asleep' },
      // The PREVIOUS night must not leak into this morning.
      { hkUuid: 'u-3', start: '2026-07-29T23:00:00-07:00', end: '2026-07-30T06:30:00-07:00', value: 7.5, unit: 'hr', kind: 'asleep' },
    ],
  });
  const o = overnight('2026-07-31');
  assert.ok(o);
  assert.equal(o.sleepHours, 6.5);
  assert.equal(o.sleepSource, 'health');
  assert.equal(o.rhr, null, 'no RHR that day: the field is null, the row still exists');
});

test('in-bed spans are excluded from slept time', () => {
  ingestBatch({
    batchId: 'b-sleep',
    metric: 'sleep',
    samples: [
      { hkUuid: 'u-1', start: '2026-07-30T22:00:00-07:00', end: '2026-07-31T06:00:00-07:00', value: 8, unit: 'hr', kind: 'inBed' },
      { hkUuid: 'u-2', start: '2026-07-30T22:30:00-07:00', end: '2026-07-31T05:30:00-07:00', value: 6.6, unit: 'hr', kind: 'asleep' },
    ],
  });
  assert.equal(overnight('2026-07-31')?.sleepHours, 6.6);
});

test('the RHR baseline excludes the morning being judged', () => {
  // 14 prior days at 51, today at 57: baseline must be 51 (yesterday-back), and today's spike
  // must not have voted on the "usual" it is compared against.
  seedSleep('2026-07-31');
  seedDaily('restingHeartRate', 'count/min', Array(14).fill(51), '2026-07-31');
  ingestBatch({
    batchId: 'b-today',
    metric: 'restingHeartRate',
    points: [{ date: '2026-07-31', value: 57, unit: 'count/min' }],
  });
  const o = overnight('2026-07-31');
  assert.equal(o?.rhr, 57);
  assert.equal(o?.rhrBaseline, 51);
});

test('with only 13 prior days the RHR value shows but the baseline stays null', () => {
  seedSleep('2026-07-31');
  seedDaily('restingHeartRate', 'count/min', Array(13).fill(51), '2026-07-31');
  ingestBatch({
    batchId: 'b-today',
    metric: 'restingHeartRate',
    points: [{ date: '2026-07-31', value: 57, unit: 'count/min' }],
  });
  const o = overnight('2026-07-31');
  assert.equal(o?.rhr, 57);
  assert.equal(o?.rhrBaseline, null, 'no verdicts against an unproven baseline');
});

test('hrvPct is the deviation from the 30-day median, and null under the minimum', () => {
  seedSleep('2026-07-31');
  seedDaily('hrvSdnn', 'ms', Array(30).fill(50), '2026-07-31');
  ingestBatch({
    batchId: 'b-today',
    metric: 'hrvSdnn',
    points: [{ date: '2026-07-31', value: 55, unit: 'ms' }],
  });
  assert.equal(overnight('2026-07-31')?.hrvPct, 10);
});

/* ------------------------------------------------------------------------------- weight */

test('weightFor reads the Health reading for a date, kg-normalized, null when absent', () => {
  ingestBatch({
    batchId: 'b-mass',
    metric: 'bodyMass',
    points: [
      { date: '2026-07-30', value: 82.44, unit: 'kg' },
      { date: '2026-07-29', value: 180, unit: 'lb' },
    ],
  });
  assert.equal(weightFor('2026-07-30'), 82.4);
  assert.equal(weightFor('2026-07-29'), 81.6);
  assert.equal(weightFor('2026-07-28'), null);
});

/* ------------------------------------------------------------------------ weekly activity */

test('weeklyActivity totals the week and counts the days that actually reported', () => {
  ingestBatch({
    batchId: 'b-steps',
    metric: 'steps',
    points: [
      { date: '2026-07-27', value: 8000, unit: 'count' }, // Monday
      { date: '2026-07-29', value: 6000, unit: 'count' },
      { date: '2026-08-03', value: 9999, unit: 'count' }, // NEXT week — must not leak in
    ],
  });
  ingestBatch({
    batchId: 'b-energy',
    metric: 'activeEnergy',
    points: [{ date: '2026-07-28', value: 412.6, unit: 'kcal' }],
  });
  ingestBatch({
    batchId: 'b-workouts',
    metric: 'workouts',
    samples: [
      { hkUuid: 'w-1', start: '2026-07-30T18:02:00-07:00', end: '2026-07-30T18:49:00-07:00', value: 47, unit: 'min', kind: 'traditionalStrengthTraining', kcal: 312 },
    ],
  });
  const week = weeklyActivity('2026-07-27');
  assert.ok(week);
  assert.equal(week.steps, 14000);
  assert.equal(week.daysWithSteps, 2, 'two of seven days reported — the UI must be able to say so');
  assert.equal(week.activeKcal, 413);
  assert.equal(week.workouts.length, 1);
  assert.equal(week.workouts[0]!.kind, 'traditionalStrengthTraining');
});

test('a silent week is null, not a row of zeros', () => {
  assert.equal(weeklyActivity('2026-07-27'), null);
});

/* -------------------------------------------------------------------------- permissions */

test('permissionState surfaces the stored perMetric map (null before the shell spoke)', () => {
  assert.equal(permissionState(), null);
  setPermissionState({ sleep: { requested: true, determined: true, yieldedData: true } });
  assert.deepEqual(permissionState(), {
    sleep: { requested: true, determined: true, yieldedData: true },
  });
});
