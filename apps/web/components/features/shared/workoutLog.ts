'use client';

/**
 * WS-F lightweight workout-session persistence (§6 P1-7 / P2-15 / P1-11).
 *
 * The training surface needs *logged sets* to power three research features — the weekly volume
 * heatmap (Progress), PR detection + spark (workout summary), and weekly-target streaks (Today).
 * The Local Mode store (`lib/demo/**`) is owned by another workstream, so WS-F keeps its own
 * additive, versioned localStorage slice here. It is fully client-side, SSR-safe (server snapshot
 * is a stable empty array), and offline — no runtime fetches, no new deps.
 *
 * This slice is part of the Local Mode data set: `lib/demo/store` includes it in every backup and
 * removes it on erase (via {@link readWorkoutLog} / {@link replaceWorkoutLog} / {@link
 * clearWorkoutLog}), so it can never outlive — or be lost by — the data it augments.
 */
import * as React from 'react';
import type { MuscleSlug } from '@/components/illustrations';
import type { Mechanics } from '@/components/features/_mock/data';

export const WORKOUT_LOG_KEY = 'fitforge.workoutlog.v1';

export interface LoggedSet {
  reps: number;
  weight_kg: number;
}
export interface LoggedExercise {
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  mechanics: Mechanics;
  /** seed muscle slugs (already the 20 MuscleSlug values) */
  primary_muscles: string[];
  secondary_muscles: string[];
  sets: LoggedSet[];
}
export interface WorkoutSession {
  id: string;
  dayId: string;
  dayName: string;
  /** ISO timestamp when the session was finished */
  finishedAt: string;
  exercises: LoggedExercise[];
}

export interface LogState {
  version: 1;
  sessions: WorkoutSession[];
}

/* ══════════════════════════════════════════════════════ shape guards (shared with lib/demo/store)
 *
 * Local Mode data is user-writable: it can be hand-edited, restored from a hostile/truncated
 * backup, or left behind in an older shape by a previous build. Nothing downstream of a
 * `localStorage` read may assume a shape, so every read runs through a normalizer.
 *
 * These primitives live HERE (rather than in `lib/demo/store`) so this slice stays dependency-free
 * and the demo store can import them one-way, with no import cycle.
 */

/** A non-null, non-array object — the only thing safe to read named fields off. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * A usable finite number, or null. Rejects `NaN` / `±Infinity` (the direct source of every
 * "NaN of 2000 kcal" in the UI) and coerces numeric strings, which is how JSON round-trips of
 * hand-edited data usually arrive.
 */
export function finiteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A non-empty string, or null. */
export function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Accumulated shape complaints. Empty ⇒ the payload was already well-formed. */
export type ShapeIssues = string[];

/** Record a complaint (bounded, so a 10 MB garbage file can't build a 10 MB error string). */
export function noteIssue(issues: ShapeIssues, path: string, msg: string): void {
  if (issues.length < 25) issues.push(`${path}: ${msg}`);
}

/** Human-readable summary of the first few issues, for user-facing import errors. */
export function describeIssues(issues: ShapeIssues): string {
  const head = issues.slice(0, 3).join('; ');
  return issues.length > 3 ? `${head} (+${issues.length - 3} more)` : head;
}

/* ------------------------------------------------------------------- workout-log normalizer */

/** Hard cap so a restored backup can never blow past the storage budget. */
const MAX_SESSIONS = 200;

const MECHANICS: readonly Mechanics[] = ['compound', 'isolation'];

function normalizeSet(v: unknown, path: string, issues: ShapeIssues): LoggedSet | null {
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected a set object');
    return null;
  }
  const reps = finiteNumber(v.reps);
  const weight = finiteNumber(v.weight_kg);
  if (reps === null) noteIssue(issues, `${path}.reps`, 'expected a finite number');
  if (weight === null) noteIssue(issues, `${path}.weight_kg`, 'expected a finite number');
  return { reps: Math.max(0, reps ?? 0), weight_kg: Math.max(0, weight ?? 0) };
}

function normalizeStringArray(v: unknown, path: string, issues: ShapeIssues): string[] {
  if (!Array.isArray(v)) {
    if (v !== undefined) noteIssue(issues, path, 'expected an array of strings');
    return [];
  }
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') out.push(item);
    else noteIssue(issues, path, 'contained a non-string entry');
  }
  return out;
}

function normalizeExercise(v: unknown, path: string, issues: ShapeIssues): LoggedExercise | null {
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected an exercise object');
    return null;
  }
  const id = nonEmptyString(v.exercise_id);
  if (id === null) {
    noteIssue(issues, `${path}.exercise_id`, 'expected a non-empty string');
    return null;
  }
  const mechanics = MECHANICS.includes(v.mechanics as Mechanics)
    ? (v.mechanics as Mechanics)
    : 'compound';
  if (v.mechanics !== undefined && mechanics !== v.mechanics) {
    noteIssue(issues, `${path}.mechanics`, 'expected "compound" or "isolation"');
  }
  const rawSets = v.sets;
  const sets: LoggedSet[] = [];
  if (Array.isArray(rawSets)) {
    rawSets.forEach((s, i) => {
      const set = normalizeSet(s, `${path}.sets[${i}]`, issues);
      if (set) sets.push(set);
    });
  } else if (rawSets !== undefined) {
    noteIssue(issues, `${path}.sets`, 'expected an array');
  }
  return {
    exercise_id: id,
    exercise_slug: nonEmptyString(v.exercise_slug) ?? id,
    exercise_name: nonEmptyString(v.exercise_name) ?? id,
    mechanics,
    primary_muscles: normalizeStringArray(v.primary_muscles, `${path}.primary_muscles`, issues),
    secondary_muscles: normalizeStringArray(
      v.secondary_muscles,
      `${path}.secondary_muscles`,
      issues,
    ),
    sets,
  };
}

function normalizeSession(v: unknown, path: string, issues: ShapeIssues): WorkoutSession | null {
  // A `null` entry here is the exact payload that used to crash Progress and Today.
  if (!isPlainObject(v)) {
    noteIssue(issues, path, 'expected a session object');
    return null;
  }
  const finishedAt = nonEmptyString(v.finishedAt);
  // An unparseable timestamp poisons every week bucket / streak key, so the session is dropped.
  if (finishedAt === null || !Number.isFinite(new Date(finishedAt).getTime())) {
    noteIssue(issues, `${path}.finishedAt`, 'expected an ISO date string');
    return null;
  }
  const rawExercises = v.exercises;
  const exercises: LoggedExercise[] = [];
  if (Array.isArray(rawExercises)) {
    rawExercises.forEach((e, i) => {
      const ex = normalizeExercise(e, `${path}.exercises[${i}]`, issues);
      if (ex) exercises.push(ex);
    });
  } else if (rawExercises !== undefined) {
    noteIssue(issues, `${path}.exercises`, 'expected an array');
  }
  const id = nonEmptyString(v.id);
  if (id === null) noteIssue(issues, `${path}.id`, 'expected a non-empty string');
  return {
    id: id ?? `session-${new Date(finishedAt).getTime()}`,
    dayId: nonEmptyString(v.dayId) ?? '',
    dayName: nonEmptyString(v.dayName) ?? 'Workout',
    finishedAt,
    exercises,
  };
}

/**
 * Coerce ANY value into a usable {@link LogState}, dropping what cannot be repaired. Pass an
 * `issues` array to find out whether anything had to be repaired (strict callers — i.e. import —
 * reject when it comes back non-empty); omit it to just get a safe value (defensive read).
 */
export function normalizeWorkoutLog(value: unknown, issues: ShapeIssues = []): LogState {
  if (!isPlainObject(value)) {
    noteIssue(issues, 'workoutLog', 'expected an object');
    return { version: 1, sessions: [] };
  }
  if (value.version !== undefined && value.version !== 1) {
    noteIssue(issues, 'workoutLog.version', 'expected 1');
  }
  const raw = value.sessions;
  if (!Array.isArray(raw)) {
    if (raw !== undefined) noteIssue(issues, 'workoutLog.sessions', 'expected an array');
    return { version: 1, sessions: [] };
  }
  const sessions: WorkoutSession[] = [];
  raw.forEach((s, i) => {
    const sess = normalizeSession(s, `workoutLog.sessions[${i}]`, issues);
    if (sess) sessions.push(sess);
  });
  return { version: 1, sessions: sessions.slice(0, MAX_SESSIONS) };
}

/** Strict gate used by backup import: any repair at all is a rejection. */
export function validateWorkoutLog(
  value: unknown,
): { ok: true; value: LogState } | { ok: false; error: string } {
  const issues: ShapeIssues = [];
  const state = normalizeWorkoutLog(value, issues);
  if (issues.length > 0) return { ok: false, error: describeIssues(issues) };
  return { ok: true, value: state };
}

/* ------------------------------------------------------------------------------ persistence */

const SERVER_STATE: LogState = { version: 1, sessions: [] };
let cache: LogState | null = null;
const listeners = new Set<() => void>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * DEFENSIVE READ. Whatever is on disk comes back as a valid {@link LogState}: a `null` entry, a
 * session with no `exercises` array, a set whose `reps` is `"12"` or `NaN` — all repaired or
 * dropped here rather than crashing (or NaN-ing) the analytics that consume them.
 */
function load(): LogState {
  if (!isBrowser()) return SERVER_STATE;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(WORKOUT_LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const issues: ShapeIssues = [];
    cache = parsed === null ? { version: 1, sessions: [] } : normalizeWorkoutLog(parsed, issues);
    // Self-heal: rewrite the repaired shape so the next reader (and any other tab) sees clean data.
    // Storage-only — `load()` runs inside render via `getSnapshot`, so it must not notify.
    if (issues.length > 0 && raw) writeStorage(cache);
  } catch {
    cache = { version: 1, sessions: [] };
  }
  return cache;
}

function writeStorage(next: LogState) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(WORKOUT_LOG_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — keep in-memory only */
  }
}

function persist(next: LogState) {
  cache = next;
  writeStorage(next);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot(): LogState {
  return load();
}
function getServerSnapshot(): LogState {
  return SERVER_STATE;
}

/** Append a finished session. Newest first. Caps at {@link MAX_SESSIONS} to bound storage. */
export function logSession(session: WorkoutSession): void {
  const s = load();
  persist({ version: 1, sessions: [session, ...s.sessions].slice(0, MAX_SESSIONS) });
}

export function getSessions(): WorkoutSession[] {
  return load().sessions;
}

/* -------------------------------------------------- backup / erase hooks (lib/demo/store owns
 * the Local Mode bundle; it drives this slice through the three calls below so the in-memory
 * cache and every subscriber stay in step with what is on disk). */

/** Current log state — what `exportAllState()` puts in the `workoutLog` section of a backup. */
export function readWorkoutLog(): LogState {
  return load();
}

/** Replace the whole slice (backup restore). Already-validated input. */
export function replaceWorkoutLog(next: LogState): void {
  persist({ version: 1, sessions: next.sessions.slice(0, MAX_SESSIONS) });
}

/** Drop every logged session AND the underlying key ("erase all Local Mode data"). */
export function clearWorkoutLog(): void {
  cache = { version: 1, sessions: [] };
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(WORKOUT_LOG_KEY);
    } catch {
      /* ignore */
    }
  }
  for (const l of listeners) l();
}

export function useWorkoutSessions(): WorkoutSession[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).sessions;
}

/* -------------------------------------------------------------------- derived analytics */

export const HEATMAP_SET_CEILING = 12; // sets/muscle that maps to a fully-saturated (heat=1) fill

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

/**
 * Weekly volume per muscle over the last 7 days (§6 P1-7). Every completed set credits its primary
 * muscles +1 and its secondary muscles +0.5. Returns raw sets-per-muscle (feed to `heat` after
 * dividing by {@link HEATMAP_SET_CEILING}).
 */
export function setsPerMuscleLast7Days(sessions: WorkoutSession[]): Partial<Record<MuscleSlug, number>> {
  return setsPerMuscleBetween(sessions, daysAgo(7), Date.now() + 1);
}

/**
 * Weighted sets per muscle for an arbitrary window `[fromTs, toTs)`. Same attribution as
 * {@link setsPerMuscleLast7Days} (primary +1, secondary +0.5) — this is the primitive every
 * time-series in the analytics view is built from.
 */
export function setsPerMuscleBetween(
  sessions: WorkoutSession[],
  fromTs: number,
  toTs: number,
): Partial<Record<MuscleSlug, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const sess of sessions) {
    const t = new Date(sess.finishedAt).getTime();
    if (!Number.isFinite(t) || t < fromTs || t >= toTs) continue;
    for (const ex of sess.exercises) {
      const n = ex.sets.length;
      if (n === 0) continue;
      for (const m of ex.primary_muscles) out[m] = (out[m] ?? 0) + n;
      for (const m of ex.secondary_muscles) out[m] = (out[m] ?? 0) + n * 0.5;
    }
  }
  return out as Partial<Record<MuscleSlug, number>>;
}

/** MuscleMap `heat` payload (0..1) from the last 7 days of logged sets. */
export function weeklyHeat(sessions: WorkoutSession[]): Partial<Record<MuscleSlug, number>> {
  const raw = setsPerMuscleLast7Days(sessions);
  const heat: Partial<Record<MuscleSlug, number>> = {};
  for (const [slug, sets] of Object.entries(raw)) {
    heat[slug as MuscleSlug] = Math.min(1, (sets ?? 0) / HEATMAP_SET_CEILING);
  }
  return heat;
}

/** Epley estimated 1-rep max for a single set. */
export function e1rm(weight_kg: number, reps: number): number {
  if (weight_kg <= 0 || reps <= 0) return 0;
  return weight_kg * (1 + reps / 30);
}

export interface PersonalRecord {
  exercise_id: string;
  exercise_name: string;
  best_e1rm: number;
  best_weight_kg: number;
  best_reps: number;
}

/** Best Epley e1RM (and the set that produced it) per exercise across all logged sessions. */
export function computePRs(sessions: WorkoutSession[]): PersonalRecord[] {
  const byEx = new Map<string, PersonalRecord>();
  for (const sess of sessions) {
    for (const ex of sess.exercises) {
      for (const st of ex.sets) {
        const est = e1rm(st.weight_kg, st.reps);
        if (est <= 0) continue;
        const cur = byEx.get(ex.exercise_id);
        if (!cur || est > cur.best_e1rm) {
          byEx.set(ex.exercise_id, {
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            best_e1rm: est,
            best_weight_kg: st.weight_kg,
            best_reps: st.reps,
          });
        }
      }
    }
  }
  return [...byEx.values()].sort((a, b) => b.best_e1rm - a.best_e1rm);
}

/**
 * PRs set *by a candidate session* relative to everything logged before it. Used by the summary to
 * fire the gold spark + PR chips. `priorSessions` must exclude the candidate.
 */
export function prsInSession(
  candidate: WorkoutSession,
  priorSessions: WorkoutSession[],
): PersonalRecord[] {
  const prior = computePRs(priorSessions);
  const priorBest = new Map(prior.map((p) => [p.exercise_id, p.best_e1rm]));
  const beaten: PersonalRecord[] = [];
  for (const ex of candidate.exercises) {
    let bestSet: { est: number; w: number; r: number } | null = null;
    for (const st of ex.sets) {
      const est = e1rm(st.weight_kg, st.reps);
      if (est > 0 && (!bestSet || est > bestSet.est)) bestSet = { est, w: st.weight_kg, r: st.reps };
    }
    if (!bestSet) continue;
    const before = priorBest.get(ex.exercise_id) ?? 0;
    if (bestSet.est > before + 1e-6) {
      beaten.push({
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        best_e1rm: bestSet.est,
        best_weight_kg: bestSet.w,
        best_reps: bestSet.r,
      });
    }
  }
  return beaten;
}

/* ---------------------------------------------------------------------- weekly streaks */

/** Local midnight of the Monday that starts the week containing `ts`. */
export function weekStart(ts: number): Date {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d;
}

/** Local YYYY-MM-DD (never UTC — a 9 pm session must not land in tomorrow's bucket). */
function localDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Monday-anchored week key (YYYY-MM-DD of that week's Monday) for a timestamp. */
function weekKey(ts: number): string {
  return localDateKey(weekStart(ts));
}
function dayKey(iso: string): string {
  return localDateKey(new Date(iso));
}
function prevWeekKey(key: string): string {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  // localDateKey (not toISOString) — a UTC round-trip shifts the key by a day east of Greenwich.
  return localDateKey(d);
}

export interface StreakInfo {
  /** consecutive weeks (incl. current if already met) hitting the weekly training target */
  streak: number;
  /** distinct training days logged in the current week */
  daysThisWeek: number;
  target: number;
  /** whether the current week has already met the target */
  metThisWeek: boolean;
}

/**
 * Weekly-target streak (§6 P1-11): a robust "trained N-of-target days this week" chain rather than a
 * fragile daily one. One free "forge freeze" per streak forgives a single missed week. The current,
 * in-progress week never *breaks* the streak (it only extends it once the target is met).
 */
export function weeklyStreak(sessions: WorkoutSession[], target: number): StreakInfo {
  const tgt = Math.max(1, target);
  const daysByWeek = new Map<string, Set<string>>();
  for (const sess of sessions) {
    if (sess.exercises.every((e) => e.sets.length === 0)) continue;
    const wk = weekKey(new Date(sess.finishedAt).getTime());
    const set = daysByWeek.get(wk) ?? new Set<string>();
    set.add(dayKey(sess.finishedAt));
    daysByWeek.set(wk, set);
  }
  const met = (wk: string) => (daysByWeek.get(wk)?.size ?? 0) >= tgt;

  const currentWeek = weekKey(Date.now());
  const daysThisWeek = daysByWeek.get(currentWeek)?.size ?? 0;
  const metThisWeek = daysThisWeek >= tgt;

  let streak = 0;
  let freezeUsed = false;
  let wk = currentWeek;
  for (let guard = 0; guard < 104; guard++) {
    if (met(wk)) {
      streak++;
    } else if (wk === currentWeek) {
      // in-progress week: neither counts nor breaks the streak
    } else if (!freezeUsed) {
      freezeUsed = true; // forge freeze forgives one missed week
    } else {
      break;
    }
    wk = prevWeekKey(wk);
  }

  return { streak, daysThisWeek, target: tgt, metThisWeek };
}

/* ═══════════════════════════════════════════════════════════ time series (the "am I progressing?" data) */

/** One Monday-anchored week of logged training, fully aggregated. */
export interface WeekBucket {
  /** YYYY-MM-DD of that week's Monday (local) */
  key: string;
  /** epoch ms of that week's Monday 00:00 local */
  startTs: number;
  /** short axis label, e.g. "Jul 20" */
  label: string;
  /** true for the week currently in progress */
  isCurrent: boolean;
  /** completed sessions logged in the week */
  sessions: number;
  /** DISTINCT calendar days trained (what a "days per week" target actually means) */
  days: number;
  /** total hard sets performed */
  sets: number;
  /** total reps performed */
  reps: number;
  /** tonnage = Σ (reps × weight_kg) across every set, in kg */
  tonnage: number;
  /** weighted sets per muscle (primary 1.0 / secondary 0.5) */
  setsByMuscle: Partial<Record<MuscleSlug, number>>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * The last `weeks` Monday-anchored weeks, OLDEST → NEWEST, including weeks with zero training.
 * Empty weeks are the point: a gap in the bars is the honest signal that consistency slipped.
 * The final bucket is always the week in progress.
 */
export function weeklyBuckets(sessions: WorkoutSession[], weeks = 12, now = Date.now()): WeekBucket[] {
  const thisMonday = weekStart(now);
  const buckets: WeekBucket[] = [];
  const index = new Map<string, WeekBucket>();

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setDate(d.getDate() - i * 7);
    const b: WeekBucket = {
      key: localDateKey(d),
      startTs: d.getTime(),
      label: weekLabel(d),
      isCurrent: i === 0,
      sessions: 0,
      days: 0,
      sets: 0,
      reps: 0,
      tonnage: 0,
      setsByMuscle: {},
    };
    buckets.push(b);
    index.set(b.key, b);
  }

  const daysSeen = new Map<string, Set<string>>();
  for (const sess of sessions) {
    const ts = new Date(sess.finishedAt).getTime();
    if (!Number.isFinite(ts)) continue;
    const b = index.get(weekKey(ts));
    if (!b) continue;
    let sessionSets = 0;
    for (const ex of sess.exercises) {
      const n = ex.sets.length;
      if (n === 0) continue;
      sessionSets += n;
      b.sets += n;
      for (const st of ex.sets) {
        b.reps += Math.max(0, st.reps);
        b.tonnage += Math.max(0, st.reps) * Math.max(0, st.weight_kg);
      }
      for (const m of ex.primary_muscles) {
        const k = m as MuscleSlug;
        b.setsByMuscle[k] = (b.setsByMuscle[k] ?? 0) + n;
      }
      for (const m of ex.secondary_muscles) {
        const k = m as MuscleSlug;
        b.setsByMuscle[k] = (b.setsByMuscle[k] ?? 0) + n * 0.5;
      }
    }
    if (sessionSets === 0) continue;
    b.sessions += 1;
    const set = daysSeen.get(b.key) ?? new Set<string>();
    set.add(dayKey(sess.finishedAt));
    daysSeen.set(b.key, set);
  }
  for (const b of buckets) b.days = daysSeen.get(b.key)?.size ?? 0;
  return buckets;
}

/** Direction of travel for a metric. */
export type TrendDirection = 'up' | 'down' | 'flat' | 'none';

export interface Trend {
  direction: TrendDirection;
  /** current value */
  current: number;
  /** the value being compared against (previous period) */
  previous: number;
  /** signed percentage change, 0 when `previous` is 0 */
  pctChange: number;
}

/** Percentage-change trend with a dead-band (< 5 % reads as "flat", which is the honest answer). */
export function trendOf(current: number, previous: number, deadBand = 0.05): Trend {
  if (previous <= 0 && current <= 0) return { direction: 'none', current, previous, pctChange: 0 };
  if (previous <= 0) return { direction: 'up', current, previous, pctChange: 100 };
  const change = (current - previous) / previous;
  const direction: TrendDirection =
    Math.abs(change) < deadBand ? 'flat' : change > 0 ? 'up' : 'down';
  return { direction, current, previous, pctChange: change * 100 };
}

/**
 * Compare the LAST COMPLETE week against the one before it. The in-progress week is excluded on
 * purpose — comparing a Tuesday against a finished week always reads as a crash, which is a lie.
 */
export function completedWeekTrend(
  buckets: WeekBucket[],
  metric: (b: WeekBucket) => number,
): Trend {
  const done = buckets.filter((b) => !b.isCurrent);
  const last = done[done.length - 1];
  const prev = done[done.length - 2];
  return trendOf(last ? metric(last) : 0, prev ? metric(prev) : 0);
}

export interface ExerciseFrequency {
  exercise_id: string;
  exercise_name: string;
  /** number of sessions the exercise appeared in */
  sessions: number;
  /** total sets logged */
  sets: number;
}

/** Exercises ranked by how often they were trained — the ones worth charting a strength trend for. */
export function exerciseFrequency(sessions: WorkoutSession[]): ExerciseFrequency[] {
  const map = new Map<string, ExerciseFrequency>();
  for (const sess of sessions) {
    for (const ex of sess.exercises) {
      if (ex.sets.length === 0) continue;
      const cur = map.get(ex.exercise_id) ?? {
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        sessions: 0,
        sets: 0,
      };
      cur.sessions += 1;
      cur.sets += ex.sets.length;
      map.set(ex.exercise_id, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || b.sets - a.sets);
}

export interface E1rmPoint {
  /** epoch ms of the session */
  ts: number;
  /** short label, e.g. "Jul 20" */
  label: string;
  /** best Epley e1RM of that session, kg */
  e1rm: number;
  /** the set that produced it */
  weight_kg: number;
  reps: number;
}

/**
 * Per-SESSION best estimated 1RM for one exercise, oldest → newest. Session-level (not weekly)
 * because strength progression is legible set to set, and a lifter who trains a lift twice a week
 * should see both points.
 */
export function e1rmSeries(sessions: WorkoutSession[], exerciseId: string): E1rmPoint[] {
  const pts: E1rmPoint[] = [];
  for (const sess of sessions) {
    const ts = new Date(sess.finishedAt).getTime();
    if (!Number.isFinite(ts)) continue;
    let best: E1rmPoint | null = null;
    for (const ex of sess.exercises) {
      if (ex.exercise_id !== exerciseId) continue;
      for (const st of ex.sets) {
        const est = e1rm(st.weight_kg, st.reps);
        if (est <= 0) continue;
        if (!best || est > best.e1rm) {
          best = {
            ts,
            label: weekLabel(new Date(ts)),
            e1rm: Math.round(est * 10) / 10,
            weight_kg: st.weight_kg,
            reps: st.reps,
          };
        }
      }
    }
    if (best) pts.push(best);
  }
  return pts.sort((a, b) => a.ts - b.ts);
}

/** Total weighted sets across every muscle in a bucket (the "volume" headline number). */
export function bucketWeightedSets(b: WeekBucket): number {
  let total = 0;
  for (const v of Object.values(b.setsByMuscle)) total += v ?? 0;
  return total;
}
