import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppleHealthExport } from './appleHealth';

/**
 * The Apple Health parser, tested on the properties that are invisible in a small happy-path file.
 *
 * The two that matter most both produce a WRONG NUMBER rather than a crash — a parser that
 * double-counts a Watch and an iPhone, or that shifts a near-midnight record onto the wrong day,
 * looks like it works and quietly corrupts every calorie balance derived from it.
 */

const rec = (
  type: string,
  startDate: string,
  value: number | string,
  source = 'iPhone',
  unit = 'count',
) =>
  `<Record type="${type}" sourceName="${source}" unit="${unit}" startDate="${startDate}" endDate="${startDate}" value="${value}"/>`;

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const ACTIVE = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const MASS = 'HKQuantityTypeIdentifierBodyMass';

const doc = (...records: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><HealthData locale="en_GB">${records.join('')}</HealthData>`;

test('sums records from one source into a daily total', async () => {
  const r = await parseAppleHealthExport(
    doc(
      rec(STEPS, '2026-07-28 09:00:00 +0100', 1200),
      rec(STEPS, '2026-07-28 18:00:00 +0100', 3300),
    ),
  );
  assert.equal(r.days.length, 1);
  assert.equal(r.days[0]!.date, '2026-07-28');
  assert.equal(r.days[0]!.steps, 4500);
});

test('TWO DEVICES DO NOT DOUBLE-COUNT — the largest source wins, not the sum', async () => {
  // A user wearing a Watch and carrying an iPhone has a record from each for the same walk.
  // Summing them reports ~2x their real steps, plausibly and silently.
  const r = await parseAppleHealthExport(
    doc(
      rec(STEPS, '2026-07-28 09:00:00 +0100', 5000, 'iPhone'),
      rec(STEPS, '2026-07-28 09:00:00 +0100', 5400, 'Apple Watch'),
    ),
  );
  assert.equal(r.days[0]!.steps, 5400, 'expected the higher single source, never 10400');
  assert.match(r.notes.join(' '), /more than one device/i);
});

test('de-duplication applies per day, not globally', async () => {
  const r = await parseAppleHealthExport(
    doc(
      rec(STEPS, '2026-07-27 09:00:00 +0100', 3000, 'iPhone'),
      rec(STEPS, '2026-07-28 09:00:00 +0100', 1000, 'iPhone'),
      rec(STEPS, '2026-07-28 09:00:00 +0100', 9000, 'Apple Watch'),
    ),
  );
  const byDate = Object.fromEntries(r.days.map((d) => [d.date, d.steps]));
  assert.equal(byDate['2026-07-27'], 3000, 'a day with one source is untouched');
  assert.equal(byDate['2026-07-28'], 9000);
});

test('a record just before midnight stays on its own local day', async () => {
  // THE TIMEZONE TRAP. Apple writes "2026-07-28 23:30:00 +0100"; parsing that through Date and
  // reading a UTC date moves it to the 28th→29th boundary depending on the runner's timezone. The
  // date in the export is already local to where the user was, so it is taken from the string.
  const r = await parseAppleHealthExport(
    doc(
      rec(STEPS, '2026-07-28 23:30:00 +0100', 700),
      rec(STEPS, '2026-07-29 00:30:00 +0100', 200),
    ),
  );
  const byDate = Object.fromEntries(r.days.map((d) => [d.date, d.steps]));
  assert.equal(byDate['2026-07-28'], 700);
  assert.equal(byDate['2026-07-29'], 200);
});

test('active energy and body mass are read alongside steps', async () => {
  const r = await parseAppleHealthExport(
    doc(
      rec(STEPS, '2026-07-28 09:00:00 +0100', 4000),
      rec(ACTIVE, '2026-07-28 09:00:00 +0100', 210.4, 'Apple Watch', 'kcal'),
      rec(ACTIVE, '2026-07-28 12:00:00 +0100', 180.2, 'Apple Watch', 'kcal'),
      rec(MASS, '2026-07-28 07:00:00 +0100', 82.4, 'Withings', 'kg'),
    ),
  );
  const d = r.days[0]!;
  assert.equal(d.steps, 4000);
  assert.equal(d.activeKcal, 391, 'active energy sums within one source');
  assert.equal(d.weightKg, 82.4);
});

test('body mass in pounds is converted to kilograms', async () => {
  const r = await parseAppleHealthExport(
    doc(rec(MASS, '2026-07-28 07:00:00 +0100', 180, 'Scale', 'lb')),
  );
  assert.equal(r.days[0]!.weightKg, 81.6);
});

test('a record split across a chunk boundary is not lost', async () => {
  // THE REGRESSION TEST FOR STREAMING. A `readFile`-shaped parser passes every case above; only
  // this one distinguishes it from one that carries state across chunk reads.
  const xml = doc(
    rec(STEPS, '2026-07-28 09:00:00 +0100', 1111),
    rec(STEPS, '2026-07-28 10:00:00 +0100', 2222),
    rec(STEPS, '2026-07-28 11:00:00 +0100', 3333),
  );
  async function* inTinyChunks() {
    // 7 bytes at a time guarantees records are cut mid-attribute.
    for (let i = 0; i < xml.length; i += 7) yield xml.slice(i, i + 7);
  }
  const r = await parseAppleHealthExport(inTinyChunks());
  assert.equal(r.days[0]!.steps, 1111 + 2222 + 3333);
  assert.equal(r.recordsSeen, 3);
});

test('record types we do not use are ignored rather than mis-read', async () => {
  const r = await parseAppleHealthExport(
    doc(
      rec('HKQuantityTypeIdentifierHeartRate', '2026-07-28 09:00:00 +0100', 62, 'Apple Watch', 'count/min'),
      rec(STEPS, '2026-07-28 09:00:00 +0100', 500),
    ),
  );
  assert.equal(r.recordsSeen, 1);
  assert.equal(r.days[0]!.steps, 500);
});

test('a file with nothing usable says so instead of reporting zeros', async () => {
  const r = await parseAppleHealthExport(doc());
  assert.equal(r.days.length, 0);
  assert.match(r.notes.join(' '), /export\.xml/i);
});

test('the contributing sources are reported, so the user can sanity-check them', async () => {
  const r = await parseAppleHealthExport(
    doc(
      rec(STEPS, '2026-07-28 09:00:00 +0100', 1, 'iPhone'),
      rec(STEPS, '2026-07-28 09:00:00 +0100', 2, 'Apple Watch'),
    ),
  );
  assert.deepEqual(r.sources.sort(), ['Apple Watch', 'iPhone']);
});

test('days come back in chronological order', async () => {
  const r = await parseAppleHealthExport(
    doc(
      rec(STEPS, '2026-07-29 09:00:00 +0100', 1),
      rec(STEPS, '2026-07-27 09:00:00 +0100', 2),
      rec(STEPS, '2026-07-28 09:00:00 +0100', 3),
    ),
  );
  assert.deepEqual(
    r.days.map((d) => d.date),
    ['2026-07-27', '2026-07-28', '2026-07-29'],
  );
});
