import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VelocityTracker,
  VELOCITY_MAX_AGE_MS,
  project,
  rubberband,
  shouldCommit,
  springBack,
} from './physics';

/* ───────────────────────────────────────────────────────────── VelocityTracker ── */

test('velocity is averaged across the window, not the last two samples', () => {
  const t = new VelocityTracker();
  // Steady 1000px/s downward, but with one 1ms burst pair at the end. Two-sample differencing
  // would report 10000px/s off that burst; the window keeps it honest.
  t.push(0, 0, 0);
  t.push(0, 20, 20);
  t.push(0, 40, 40);
  t.push(0, 60, 60);
  t.push(0, 61, 61);
  const v = t.velocity(61);
  assert.ok(v.y > 800 && v.y < 1200, `expected ~1000px/s, got ${v.y}`);
});

test('a pointer held still before release reports zero velocity', () => {
  const t = new VelocityTracker();
  t.push(0, 0, 0);
  t.push(0, 100, 50);
  // Released 300ms after the last movement — the thumb parked the sheet, it did not throw it.
  assert.deepEqual(t.velocity(50 + VELOCITY_MAX_AGE_MS + 200), { x: 0, y: 0 });
});

test('velocity is signed and decomposed per axis', () => {
  const t = new VelocityTracker();
  t.push(0, 0, 0);
  t.push(-50, 100, 100);
  const v = t.velocity(100);
  assert.ok(v.x < 0, 'leftward drag must report negative x');
  assert.ok(v.y > 0, 'downward drag must report positive y');
});

test('an empty or single-sample tracker never reports motion', () => {
  const t = new VelocityTracker();
  assert.deepEqual(t.velocity(0), { x: 0, y: 0 });
  t.push(0, 0, 10);
  assert.deepEqual(t.velocity(10), { x: 0, y: 0 });
  t.reset();
  assert.deepEqual(t.velocity(10), { x: 0, y: 0 });
});

/* ─────────────────────────────────────────────────────────────────── project ── */

test('projection matches Apple: v/1000 * d / (1 - d)', () => {
  // 1000px/s at the default rate projects ~499px — half a phone screen from one flick.
  assert.ok(Math.abs(project(1000) - 499) < 1);
  assert.equal(project(0), 0);
});

test('projection is signed and monotonic in velocity', () => {
  assert.ok(project(-1000) < 0);
  assert.ok(project(2000) > project(1000));
});

test('a deceleration rate of 1 cannot project to infinity', () => {
  assert.ok(Number.isFinite(project(1000, 1)));
  assert.ok(Number.isFinite(project(1000, 5)));
});

/* ───────────────────────────────────────────────────────────────── rubberband ── */

test('rubberband resists progressively and never exceeds its asymptote', () => {
  const dim = 600;
  const a = rubberband(50, dim);
  const b = rubberband(200, dim);
  const c = rubberband(5000, dim);
  assert.ok(a < 50, 'must give less than the finger travelled');
  assert.ok(b > a, 'further out must still move further');
  assert.ok(b / 200 < a / 50, 'but the ratio must shrink — that is the resistance');
  assert.ok(c < dim, 'and it must never pass the asymptote, which is the dimension itself');
});

test('rubberband is odd-symmetric and safe at the origin', () => {
  assert.equal(rubberband(0, 600), 0);
  assert.equal(rubberband(-100, 600), -rubberband(100, 600));
  assert.equal(rubberband(100, 0), 0);
});

/* ─────────────────────────────────────────────────────────────── shouldCommit ── */

test('a short fast flick commits even though it never crossed the distance threshold', () => {
  // 40px travelled, threshold 200px — position alone says "return home", momentum says "gone".
  assert.equal(shouldCommit(40, 1200, 200), true);
});

test('a slow haul short of the threshold returns home', () => {
  assert.equal(shouldCommit(80, 40, 200), false);
});

test('a slow haul past the threshold commits', () => {
  assert.equal(shouldCommit(240, 0, 200), true);
});

test('a reverse flick outranks position — a cancelled gesture stays cancelled', () => {
  // Dragged well past the threshold, then flicked back before release.
  assert.equal(shouldCommit(260, -1400, 200), false);
});

test('a fast flick that barely moved is treated as a tap, not a throw', () => {
  assert.equal(shouldCommit(3, 1500, 200), false);
});

/* ────────────────────────────────────────────────────────────────── springBack ── */

test('springBack carries the release velocity through, damped and signed', () => {
  const fast = springBack(1000);
  assert.ok(fast.velocity > 0 && fast.velocity < 1000, 'damped, not discarded, not amplified');
  assert.equal(springBack(-1000).velocity, -fast.velocity, 'sign survives');
  assert.equal(springBack(0).velocity, 0);
});

test('springBack is critically damped — a returning sheet must not bounce', () => {
  const s = springBack(0);
  const ratio = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  assert.ok(ratio > 0.9, `expected ~critical damping, got ratio ${ratio.toFixed(3)}`);
});
