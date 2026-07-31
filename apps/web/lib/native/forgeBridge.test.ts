import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * FORGEBRIDGE v1 GUARDS vs THE FROZEN FIXTURES.
 *
 * `fixtures/forgebridge/*.json` (repo root) is the wire truth both sides prove themselves
 * against — the Swift DecodingTests decode the SAME files. The first block reads the directory
 * rather than a hand-kept list, so a fixture added later is covered (or fails loudly) without
 * anyone remembering to update this file. A guard rejecting any fixture is a contract break,
 * not a test to adjust.
 */

const {
  parseEnvelope,
  newEnvelopeId,
  makeEnvelope,
  HEALTH_METRICS,
  BRIDGE_VERSION,
} = await import('./forgeBridge');

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures/forgebridge',
);

const fixtureFiles = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
const readFixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));

/** Filename → the envelope type it freezes. A new fixture must be added here to be shape-checked. */
const EXPECTED_TYPE: Record<string, string> = {
  'ackBatch.json': 'health/ackBatch',
  'batch-quantity.json': 'health/batch',
  'batch-samples.json': 'health/batch',
  'batch-workouts.json': 'health/batch',
  'hello.json': 'bridge/hello',
  'helloAck.json': 'bridge/helloAck',
  'permissions.json': 'health/permissions',
  'requestPermissions.json': 'health/requestPermissions',
  'requestSync.json': 'health/requestSync',
  'syncComplete.json': 'health/syncComplete',
  'syncComplete-stale.json': 'health/syncComplete',
  'unsupported.json': 'bridge/unsupported',
};

test('there are fixtures to test against (the directory resolved)', () => {
  assert.ok(fixtureFiles.length >= 12, `found only ${fixtureFiles.length} fixtures`);
});

for (const file of fixtureFiles) {
  test(`fixture round-trip: ${file} is accepted and typed`, () => {
    const env = parseEnvelope(readFixture(file));
    assert.ok(env, `guards rejected ${file} — that is a bridge-contract break`);
    assert.equal(env.v, 1);
    assert.match(env.id, /^[0-9a-f-]{36}$/i);
    const expected = EXPECTED_TYPE[file];
    assert.ok(expected, `${file} is new — add its expected type to EXPECTED_TYPE`);
    assert.equal(env.type, expected);
  });
}

test('batch-quantity narrows to day-grained points', () => {
  const env = parseEnvelope(readFixture('batch-quantity.json'));
  assert.ok(env && env.type === 'health/batch');
  // Inside this branch the payload IS HealthBatchPayload — the narrowing under test.
  assert.equal(env.payload.batchId, 'b-0001');
  assert.equal(env.payload.metric, 'restingHeartRate');
  assert.equal(env.payload.points?.length, 2);
  assert.deepEqual(env.payload.points?.[0], { date: '2026-07-29', value: 51.0, unit: 'count/min' });
  assert.equal(env.payload.samples, undefined);
});

test('batch-samples narrows to hkUuid-keyed sleep samples', () => {
  const env = parseEnvelope(readFixture('batch-samples.json'));
  assert.ok(env && env.type === 'health/batch');
  const s = env.payload.samples?.[0];
  assert.equal(s?.hkUuid, '11111111-2222-4333-8444-555555555555');
  assert.equal(s?.kind, 'asleep');
  assert.equal(s?.value, 6.9);
});

test('batch-workouts carries the optional kcal through', () => {
  const env = parseEnvelope(readFixture('batch-workouts.json'));
  assert.ok(env && env.type === 'health/batch');
  const s = env.payload.samples?.[0];
  assert.equal(s?.kind, 'traditionalStrengthTraining');
  assert.equal(s?.kcal, 312.0);
});

test('helloAck narrows to shellVersion + capabilities', () => {
  const env = parseEnvelope(readFixture('helloAck.json'));
  assert.ok(env && env.type === 'bridge/helloAck');
  assert.equal(env.payload.shellVersion, '1.0.0');
  assert.equal(env.payload.bridgeVersion, 1);
  assert.deepEqual(env.payload.capabilities, ['health', 'storageMirror', 'backupExport']);
});

test('requestSync accepts the null-means-backfill haveUpTo values', () => {
  const env = parseEnvelope(readFixture('requestSync.json'));
  assert.ok(env && env.type === 'health/requestSync');
  assert.equal(env.payload.haveUpTo.sleep, '2026-07-30');
  assert.equal(env.payload.haveUpTo.restingHeartRate, null);
});

test('permissions narrows to the perMetric map', () => {
  const env = parseEnvelope(readFixture('permissions.json'));
  assert.ok(env && env.type === 'health/permissions');
  assert.deepEqual(env.payload.perMetric.restingHeartRate, {
    requested: true,
    determined: true,
    yieldedData: false,
  });
});

test('syncComplete works both with and without staleSince', () => {
  const plain = parseEnvelope(readFixture('syncComplete.json'));
  assert.ok(plain && plain.type === 'health/syncComplete');
  assert.equal(plain.payload.staleSince, undefined);
  const stale = parseEnvelope(readFixture('syncComplete-stale.json'));
  assert.ok(stale && stale.type === 'health/syncComplete');
  assert.equal(stale.payload.staleSince, '2026-07-27');
});

test('requestPermissions types are all known v1 metrics', () => {
  const env = parseEnvelope(readFixture('requestPermissions.json'));
  assert.ok(env && env.type === 'health/requestPermissions');
  for (const t of env.payload.types) assert.ok((HEALTH_METRICS as readonly string[]).includes(t));
});

/* ------------------------------------------------------------------ rejection, not repair */

test('a wrong envelope version is rejected, not guessed at', () => {
  const raw = readFixture('hello.json') as Record<string, unknown>;
  assert.equal(parseEnvelope({ ...raw, v: 2 }), null);
});

test('an unknown message type is rejected (the shell says bridge/unsupported for ours)', () => {
  const raw = readFixture('hello.json') as Record<string, unknown>;
  assert.equal(parseEnvelope({ ...raw, type: 'health/futureThing' }), null);
});

test('a half-shaped payload fails the whole envelope', () => {
  assert.equal(
    parseEnvelope({ v: 1, id: 'x', type: 'health/batch', payload: { batchId: 'b-1' } }),
    null,
    'a batch with neither points nor samples must not parse',
  );
  assert.equal(
    parseEnvelope({
      v: 1,
      id: 'x',
      type: 'health/batch',
      payload: { batchId: 'b-1', metric: 'sleep', samples: [{ hkUuid: 'u' }] },
    }),
    null,
    'a sample missing its required fields must not parse',
  );
  assert.equal(parseEnvelope({ v: 1, id: 'x', type: 'bridge/hello', payload: {} }), null);
  assert.equal(parseEnvelope('not even an object'), null);
  assert.equal(parseEnvelope(null), null);
});

test('EXTRA payload fields ride through untouched — the contract is additive-only', () => {
  const raw = readFixture('helloAck.json') as { payload: Record<string, unknown> };
  raw.payload.futureField = { anything: true };
  const env = parseEnvelope(raw);
  assert.ok(env, 'a newer shell adding a field must not break an older page');
});

/* ----------------------------------------------------------------------------- envelope ids */

test('newEnvelopeId yields distinct uuid-shaped ids', () => {
  const a = newEnvelopeId();
  const b = newEnvelopeId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.notEqual(a, b);
});

test('makeEnvelope produces a v1 envelope the guards accept back', () => {
  const env = makeEnvelope('bridge/hello', { pageBridgeVersion: BRIDGE_VERSION });
  const reparsed = parseEnvelope(JSON.parse(JSON.stringify(env)));
  assert.ok(reparsed && reparsed.type === 'bridge/hello');
  assert.equal(reparsed.payload.pageBridgeVersion, 1);
});
