import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * LOCAL TIME, EVERYWHERE — the two halves of the timezone fix, pinned.
 *
 * The bug this exists to prevent was visible on screen: Nutrition called Wednesday "yesterday" on a
 * Wednesday evening. `toISOString().slice(0, 10)` is a UTC date, so for anyone east of Greenwich the
 * app's "today" rolled over before midnight, and for anyone west it rolled over hours late — food
 * logged in the evening landed on the wrong day and the streak broke for no reason.
 *
 * So: `localISO` must read the LOCAL calendar fields, and an entry's `logged_at` must carry the
 * device's real clock time plus its UTC offset, which is what lets "8:42 am" survive a trip through
 * the cloud to a phone in another timezone.
 */
const { entryOrder, entryStamp, formatEntryTime } = await import('./format');
const { localISO, deviceTimeZone } = await import('@/components/features/_mock/data');

test('localISO reads the LOCAL calendar day, not the UTC one', () => {
  // 23:30 local on the 15th. `toISOString()` would say the 16th anywhere east of UTC and the 15th
  // at 22:30-ish west of it; the local getters say the 15th on every machine, which is the point.
  const late = new Date(2026, 6, 15, 23, 30, 0);
  assert.equal(localISO(late), '2026-07-15');

  // 00:30 local on the 1st — the other edge, where a UTC read slips to the previous month.
  const early = new Date(2026, 6, 1, 0, 30, 0);
  assert.equal(localISO(early), '2026-07-01');

  // Zero-padding is not optional: '2026-7-1' sorts and compares wrongly against every other key.
  assert.match(localISO(new Date(2026, 0, 2, 12)), /^\d{4}-\d{2}-\d{2}$/);
});

test('localISO agrees with the local calendar fields for the current moment', () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  assert.equal(localISO(now), `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
});

test('deviceTimeZone reports something, or an empty string — never a crash', () => {
  const tz = deviceTimeZone();
  assert.equal(typeof tz, 'string');
});

test('entryStamp records the wall clock the athlete saw, with its offset', () => {
  const at = new Date(2026, 6, 15, 8, 42, 5);
  const { logged_at, logged_tz } = entryStamp(at);

  // Local wall clock, verbatim — a UTC stamp would show a different hour back to the same user.
  assert.match(logged_at, /^2026-07-15T08:42:05[+-]\d{2}:\d{2}$/);
  assert.equal(typeof logged_tz, 'string');

  // The offset makes it an unambiguous instant, so parsing it recovers exactly this moment.
  assert.equal(new Date(logged_at).getTime(), at.getTime());
  // …and the day it belongs to still reads the same on this device.
  assert.equal(logged_at.slice(0, 10), '2026-07-15');
});

test('formatEntryTime shows a readable local time, and nothing for an unstamped row', () => {
  const at = new Date(2026, 6, 15, 8, 42, 0);
  const shown = formatEntryTime(entryStamp(at).logged_at);
  assert.ok(shown, 'a stamped row shows a time');
  assert.match(String(shown), /8:42/);

  // Rows logged before this feature existed have no stamp. They must render as absent rather than
  // as "Invalid Date" or a fake midnight.
  assert.equal(formatEntryTime(undefined), null);
  assert.equal(formatEntryTime('not a date'), null);
});

test('entryOrder sorts chronologically and sinks unstamped rows to the end', () => {
  const morning = entryStamp(new Date(2026, 6, 15, 7, 5)).logged_at;
  const evening = entryStamp(new Date(2026, 6, 15, 19, 40)).logged_at;

  assert.ok(entryOrder(morning) < entryOrder(evening));
  assert.equal(entryOrder(undefined), Number.POSITIVE_INFINITY);

  const sorted = [evening, undefined, morning].sort((a, b) => entryOrder(a) - entryOrder(b));
  assert.deepEqual(sorted, [morning, evening, undefined]);
});
