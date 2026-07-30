'use client';

/**
 * ACTIVE (IN-PROGRESS) WORKOUT SESSION — `fitforge.activeSession.v1`.
 *
 * A live session used to exist only in WorkoutPlayer's React state, so a reload, an accidental
 * Back, or mobile Safari evicting the tab between sets silently destroyed every logged set — the
 * one loss this app can least afford, mid-workout, on the surface it exists for. This slice is the
 * crash belt: the player writes it on every mutation, restores it on mount for the SAME day, and
 * removes it the moment the session lands in the workout log (`fitforge.workoutlog.v1`).
 *
 * SYNC: DEVICE-LOCAL BY NATURE. An in-progress session is this phone's mid-set scratch state;
 * the finished record is what any other device cares about. It belongs off the automatic cloud
 * sweep exactly as the readiness keys are (`SYNC_DENYLIST_PREFIXES` in `lib/demo/store.ts`), but
 * that denylist is owned by the Local Mode workstream, so today the key still rides the
 * promiscuous `fitforge.*` extras sweep. The snapshot is shaped so a copy arriving from another
 * device is inert regardless: it only ever restores into the routine day (and rows) it was
 * captured from, and it expires after {@link ACTIVE_SESSION_TTL_MS}. When the demo store can take
 * a change, `fitforge.activeSession.` belongs on its denylist.
 *
 * ONE SNAPSHOT, NOT A STACK. An athlete is in one gym session at a time — you cannot be mid-set
 * in two workouts — so starting to log a DIFFERENT day simply supersedes an unfinished one on its
 * first mutation. Restore is gated on the day id (see {@link activeSessionFor}), so a stale
 * snapshot from day A can never leak sets into day B; it just sits until it is overwritten or
 * expires. That is the honest behaviour without a resume-vs-discard dialog: the sets you logged
 * survive every accidental exit, and the only thing that discards them is you training something
 * else instead.
 */
import {
  isPlainObject,
  finiteNumber,
  nonEmptyString,
} from '@/components/features/shared/workoutLog';

export const ACTIVE_SESSION_KEY = 'fitforge.activeSession.v1';

/**
 * Longer than any real gym session, shorter than yesterday's workout bleeding into today's. An
 * expired snapshot reads as "no active session" — resuming a two-day-old half-workout as if the
 * athlete never left would misdate the eventual log and lie to every weekly bucket built on it.
 */
export const ACTIVE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface ActiveSetSnapshot {
  reps: number;
  weight_kg: number;
  rpe: number | null;
  done: boolean;
}

export interface ActiveExerciseSnapshot {
  /** `RoutineExercise.id` — the join key back into the day's rows on restore */
  rowId: string;
  /** the exercise actually being trained (survives a mid-session swap) */
  exerciseId: string;
  exerciseName: string;
  sets: ActiveSetSnapshot[];
  warmups: boolean[];
  warmupAck: boolean;
}

export interface ActiveSession {
  version: 1;
  /** the `RoutineDay.id` this session belongs to — restore is scoped to it, never merged across */
  dayId: string;
  /** epoch ms the athlete started, so a resumed session keeps its true elapsed time */
  startedAt: number;
  /** epoch ms of the last write — the TTL clock */
  savedAt: number;
  /** pager position, so a reload lands on the exercise the athlete was looking at */
  exerciseIndex: number;
  exercises: ActiveExerciseSnapshot[];
}

/* ─────────────────────────────────────────────────────────────────── normalization
 * localStorage is user-writable input (house invariant #1 in lib/demo/store): a hand-edited or
 * synced-over value must degrade to "no active session", never crash the player mid-workout. */

function readSet(v: unknown): ActiveSetSnapshot | null {
  if (!isPlainObject(v)) return null;
  const reps = finiteNumber(v.reps);
  const weight = finiteNumber(v.weight_kg);
  if (reps === null || weight === null) return null;
  const rpe = v.rpe === null || v.rpe === undefined ? null : finiteNumber(v.rpe);
  return {
    reps: Math.max(0, reps),
    weight_kg: Math.max(0, weight),
    rpe,
    done: v.done === true,
  };
}

function readExercise(v: unknown): ActiveExerciseSnapshot | null {
  if (!isPlainObject(v)) return null;
  const rowId = nonEmptyString(v.rowId);
  const exerciseId = nonEmptyString(v.exerciseId);
  if (rowId === null || exerciseId === null) return null;
  if (!Array.isArray(v.sets)) return null;
  const sets: ActiveSetSnapshot[] = [];
  for (const raw of v.sets) {
    const set = readSet(raw);
    if (set === null) return null; // a half-parseable row is a corrupt one, not a resumable one
    sets.push(set);
  }
  return {
    rowId,
    exerciseId,
    exerciseName: nonEmptyString(v.exerciseName) ?? exerciseId,
    warmups: Array.isArray(v.warmups) ? v.warmups.map((w) => w === true) : [],
    warmupAck: v.warmupAck === true,
    sets,
  };
}

/**
 * Coerce ANY value into a usable {@link ActiveSession} or null. Unlike the log's normalizer this
 * never repairs-and-keeps: a snapshot is transient by design, so anything suspect is simply not a
 * session — the athlete loses nothing that was ever confirmed on screen for more than one write.
 */
export function normalizeActiveSession(value: unknown, now = Date.now()): ActiveSession | null {
  if (!isPlainObject(value) || value.version !== 1) return null;
  const dayId = nonEmptyString(value.dayId);
  const startedAt = finiteNumber(value.startedAt);
  const savedAt = finiteNumber(value.savedAt);
  if (dayId === null || startedAt === null || savedAt === null) return null;
  if (savedAt > now + 60_000 || now - savedAt > ACTIVE_SESSION_TTL_MS) return null;
  if (!Array.isArray(value.exercises) || value.exercises.length === 0) return null;
  const exercises: ActiveExerciseSnapshot[] = [];
  for (const raw of value.exercises) {
    const ex = readExercise(raw);
    if (ex === null) return null;
    exercises.push(ex);
  }
  const index = finiteNumber(value.exerciseIndex) ?? 0;
  return {
    version: 1,
    dayId,
    startedAt,
    savedAt,
    exerciseIndex: Math.max(0, Math.min(exercises.length - 1, Math.round(index))),
    exercises,
  };
}

/* ───────────────────────────────────────────────────────────────────── persistence */

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** The stored snapshot, TTL-checked and normalized, or null. Never throws (SSR-safe). */
export function readActiveSession(): ActiveSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const session = normalizeActiveSession(JSON.parse(raw));
    // Self-heal: an expired or unreadable snapshot is removed once, not re-parsed forever.
    if (session === null) window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    return session;
  } catch {
    return null;
  }
}

/**
 * The snapshot FOR THIS DAY, or null. The day-id gate is the whole anti-merge contract: a player
 * mounted for day B never sees day A's sets, however fresh they are.
 */
export function activeSessionFor(dayId: string): ActiveSession | null {
  const session = readActiveSession();
  return session !== null && session.dayId === dayId ? session : null;
}

/** Write the snapshot (stamping `savedAt`). Quota/private-mode failures are silently absorbed —
 *  the in-memory session still runs; persistence is a belt, not a load-bearing wall. */
export function saveActiveSession(session: Omit<ActiveSession, 'version' | 'savedAt'>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      ACTIVE_SESSION_KEY,
      JSON.stringify({ ...session, version: 1, savedAt: Date.now() } satisfies ActiveSession),
    );
  } catch {
    /* quota / private mode — keep in-memory only */
  }
}

/** Drop the snapshot (session finished, or explicitly abandoned). */
export function clearActiveSession(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
