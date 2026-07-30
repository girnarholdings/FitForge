'use client';

/**
 * READINESS LOG — `fitforge.readiness.v1`.
 *
 * One entry per day: the check-in, the verdict, what was offered, and what the user DID with the
 * offer. The decisions are the point: a pile of rejections is the signal to recalibrate (or shut
 * up), and none of that is knowable without recording them.
 *
 * PRIVACY: this key is on the sync denylist (`SYNC_DENYLIST_PREFIXES` in lib/demo/store) — it is
 * subjective health data, so it stays on this device. It still rides the user-initiated file
 * export, and it is covered by erase-everything like every other `fitforge.*` key.
 */
import * as React from 'react';
import { localISO, type RoutineDay } from '@/components/features/_mock/data';
import { safeSetItem } from '@/lib/storage/safeWrite';
import type { CheckIn, ReadinessVerdict, AdaptAction } from './engine';
import type { AdviceLine } from './advice';

export const READINESS_KEY = 'fitforge.readiness.v1';
const MAX_ENTRIES = 120;

export interface ReadinessEntry {
  date: string;
  checkIn: CheckIn;
  verdict: ReadinessVerdict;
  /** what was offered (rules verdict, or the AI's validated action) */
  offered: AdaptAction;
  /** 'rules' = the morning check-in engine; 'ai' = the coach adapt task */
  source: 'rules' | 'ai';
  decision: 'accepted' | 'rejected' | null;
  /**
   * The FULL adapted day that was accepted (swaps applied, sets edited), so Today can keep
   * showing it and re-stage it in one tap — exiting the player must never cost a re-done
   * questionnaire. Absent for rest days, rejections and plain proceeds.
   */
  adaptedDay?: RoutineDay | null;
  /** the day's holistic advice (nutrition/sleep/recovery), persisted so the recap can show it */
  advice?: AdviceLine[];
  /**
   * The WHY behind the offered action, in the voice that offered it — the AI's own sentence when
   * the coach answered, the rules engine's otherwise. Persisted so the answered card keeps
   * stating the day's opinion instead of decaying into a bare score.
   */
  offeredReason?: string;
}

interface ReadinessState {
  version: 1;
  entries: ReadinessEntry[];
}

const listeners = new Set<() => void>();
let cache: ReadinessState | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function load(): ReadinessState {
  if (cache) return cache;
  const empty: ReadinessState = { version: 1, entries: [] };
  if (!isBrowser()) return empty;
  try {
    const raw = window.localStorage.getItem(READINESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as ReadinessState) : null;
    cache = parsed && Array.isArray(parsed.entries) ? { version: 1, entries: parsed.entries } : empty;
  } catch {
    cache = empty;
  }
  return cache;
}

function save(next: ReadinessState): void {
  cache = next;
  // A check-in that fails to land must be SAID, not swallowed: `safeSetItem` raises the shared
  // storage-health flag (lib/storage/safeWrite) that drives the app-wide "storage is full"
  // banner. The in-memory copy still serves this session either way.
  if (isBrowser()) safeSetItem(READINESS_KEY, JSON.stringify(next));
  for (const l of listeners) l();
}

/** The LOCAL calendar day — a check-in belongs to the morning the athlete is having, not to UTC's. */
export function todayISO(): string {
  return localISO();
}

export function readinessEntries(): ReadinessEntry[] {
  return load().entries;
}

export function entryForDate(date: string): ReadinessEntry | undefined {
  return load().entries.find((e) => e.date === date);
}

/** Upsert by date — a re-taken check-in replaces the morning's earlier one. */
export function saveEntry(entry: ReadinessEntry): void {
  const rest = load().entries.filter((e) => e.date !== entry.date);
  save({ version: 1, entries: [entry, ...rest].slice(0, MAX_ENTRIES) });
}

export function recordDecision(date: string, decision: 'accepted' | 'rejected'): void {
  patchEntry(date, { decision });
}

/** Merge fields into an existing entry (decision, the accepted adaptedDay, advice…). */
export function patchEntry(date: string, patch: Partial<ReadinessEntry>): void {
  const entries = load().entries.map((e) => (e.date === date ? { ...e, ...patch } : e));
  save({ version: 1, entries });
}

export function subscribeReadiness(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_SNAPSHOT: ReadinessEntry[] = [];

export function useReadinessEntries(): ReadinessEntry[] {
  return React.useSyncExternalStore(
    subscribeReadiness,
    () => load().entries,
    () => SERVER_SNAPSHOT,
  );
}
