import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceFor } from './advice';
import { assessReadiness, type CheckIn } from './engine';

const base: CheckIn = {
  date: '2026-07-29',
  sleepHours: 8,
  soreness: 2,
  energy: 4,
  stress: 2,
  unwell: false,
};

function advise(patch: Partial<CheckIn>) {
  const c = { ...base, ...patch };
  return adviceFor(c, assessReadiness(c));
}

test('unwell owns the whole list: fluids + electrolytes, bland food, sleep — nothing else', () => {
  const lines = advise({ unwell: true });
  assert.equal(lines.length, 3);
  assert.ok(lines.some((l) => /electrolytes/i.test(l.text)));
  assert.ok(lines.some((l) => /spicy/i.test(l.text)), 'bland-food line names what to avoid');
  assert.ok(lines.some((l) => l.kind === 'sleep'));
});

test('short sleep leads with caffeine timing and an earlier night', () => {
  const lines = advise({ sleepHours: 5 });
  assert.equal(lines[0]!.kind, 'sleep');
  assert.match(lines[0]!.text, /caffeine/i);
});

test('heavy soreness asks for protein at every meal and a walk', () => {
  const lines = advise({ soreness: 5 });
  assert.ok(lines.some((l) => /protein at every meal/i.test(l.text)));
  assert.ok(lines.some((l) => l.kind === 'recovery'));
});

test('low energy points at carbs and water', () => {
  const lines = advise({ energy: 1 });
  assert.ok(lines.some((l) => /carbs/i.test(l.text)));
});

test('a good day still gets one keep-it-boring line — never an empty section', () => {
  const lines = advise({});
  assert.equal(lines.length, 1);
  assert.match(lines[0]!.text, /protein|sleep/i);
});

test('never more than three lines — a pamphlet is not advice', () => {
  const lines = advise({ sleepHours: 4, soreness: 5, energy: 1, stress: 5 });
  assert.ok(lines.length <= 3);
});
