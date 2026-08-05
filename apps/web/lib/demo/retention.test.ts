import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RETENTION_DAYS,
  WARN_AFTER_DAYS,
  daysBetween,
  pruneCutoff,
  pruneDateFor,
  retentionStatus,
} from './retention';

/**
 * THE RULE THAT DECIDES WHEN TRAINING IS DELETED, so every boundary is pinned exactly.
 *
 * The window exists because the cloud copy is one Firestore document with a 1 MiB ceiling, and a
 * committed athlete was measured crossing it at about a year — after which syncing froze silently.
 * The warning window exists because a bound nobody was told about is just a slower version of the
 * same silent loss. Both halves are arithmetic, and arithmetic is testable.
 */

test('the window and the warning are 180 and 150 days, 30 days apart', () => {
  assert.equal(RETENTION_DAYS, 180);
  assert.equal(WARN_AFTER_DAYS, 150);
  assert.equal(RETENTION_DAYS - WARN_AFTER_DAYS, 30, 'the notice period');
});

test('nothing logged is never a warning', () => {
  const s = retentionStatus(null, '2026-08-05');
  assert.equal(s.phase, 'ok');
  assert.equal(s.daysLogged, 0);
});

test('the phase boundaries are exact', () => {
  const today = '2026-08-05';
  const at = (daysAgo: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - daysAgo * 86_400_000).toISOString().slice(0, 10);

  // One day short of the warning: still silent.
  assert.equal(retentionStatus(at(149), today).phase, 'ok');
  // The warning starts the day the log turns 150.
  assert.equal(retentionStatus(at(150), today).phase, 'warn');
  assert.equal(retentionStatus(at(179), today).phase, 'warn');
  // …and the trim is due the day it turns 180, not before.
  assert.equal(retentionStatus(at(180), today).phase, 'due');
  assert.equal(retentionStatus(at(400), today).phase, 'due');
});

test('the countdown says how long is left, and stops at zero', () => {
  const today = '2026-08-05';
  const at = (daysAgo: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - daysAgo * 86_400_000).toISOString().slice(0, 10);

  assert.equal(retentionStatus(at(150), today).daysUntilPrune, 30, '30 days of notice');
  assert.equal(retentionStatus(at(179), today).daysUntilPrune, 1);
  assert.equal(retentionStatus(at(180), today).daysUntilPrune, 0);
  assert.equal(retentionStatus(at(500), today).daysUntilPrune, 0, 'never negative');
});

test('the cutoff keeps exactly the last 180 days, and the boundary day survives', () => {
  const cutoff = pruneCutoff('2026-08-05');
  assert.equal(cutoff, '2026-02-06');
  assert.equal(daysBetween(cutoff, '2026-08-05'), RETENTION_DAYS);
  // The store keeps `day >= cutoff`, so a record dated exactly on the cutoff is KEPT — an
  // off-by-one here is somebody's workout.
  assert.ok('2026-02-06' >= cutoff, 'the cutoff day itself is kept');
  assert.ok(!('2026-02-05' >= cutoff), 'the day before it is not');
});

test('a leap year does not shift the window', () => {
  // 2028 is a leap year; the span must still be exactly 180 days of real dates.
  const cutoff = pruneCutoff('2028-06-01');
  assert.equal(daysBetween(cutoff, '2028-06-01'), RETENTION_DAYS);
});

test('the prune date names the day the oldest entry crosses the line', () => {
  assert.equal(pruneDateFor('2026-02-06'), '2026-08-05');
  assert.equal(daysBetween('2026-02-06', pruneDateFor('2026-02-06')), RETENTION_DAYS);
});

test('a malformed date degrades quietly instead of deleting everything', () => {
  // Garbage in a hand-edited store must never produce a cutoff far in the future, which would
  // trim the entire log. Both helpers return the input rather than NaN-propagating.
  assert.equal(pruneCutoff('not-a-date'), 'not-a-date');
  assert.equal(pruneDateFor('not-a-date'), 'not-a-date');
  assert.equal(daysBetween('not-a-date', '2026-08-05'), 0);
  // …and an unparseable oldest date reads as a zero-length log, i.e. nothing to trim.
  assert.equal(retentionStatus('not-a-date', '2026-08-05').phase, 'ok');
});

test('a future-dated entry (clock skew) is not read as a 180-day-old log', () => {
  const s = retentionStatus('2027-01-01', '2026-08-05');
  assert.equal(s.daysLogged, 0, 'negative spans clamp to zero');
  assert.equal(s.phase, 'ok');
});
