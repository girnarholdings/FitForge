'use client';

/**
 * THE SELECTED DAY — shared by Today and Nutrition.
 *
 * Both screens are views onto one day, and that day is no longer always today: you can look back
 * at what you trained on Tuesday, and you can log the dinner you forgot to record last night.
 *
 * WHY A MODULE STORE AND NOT THE URL. `useSearchParams` forces every consuming route into a
 * Suspense boundary under the App Router, and this app is a static export — the failure mode is a
 * build error, not a runtime one, but it is a lot of ceremony for state that should not outlive the
 * session anyway. A tiny `useSyncExternalStore` source keeps Today and Nutrition on the SAME day as
 * you move between them, which is the actual requirement: reviewing Tuesday means reviewing
 * Tuesday's training and Tuesday's food, not one of each.
 *
 * WHY IT RESETS ON RELOAD. Nothing here is persisted. Opening the app should always land on today —
 * a date left over from a previous session is how you log breakfast onto last Thursday without
 * noticing.
 */
import * as React from 'react';
import { todayISO } from '@/components/features/_mock/data';

/** Milliseconds in a day. Dates here are plain `YYYY-MM-DD` strings, never `Date` objects. */
const DAY_MS = 86_400_000;

let current = todayISO();
const listeners = new Set<() => void>();

export function getSelectedDate(): string {
  return current;
}

export function setSelectedDate(iso: string): void {
  if (iso === current) return;
  current = iso;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The day both screens are showing, and a setter.
 *
 * The server snapshot is the module's initial value rather than a fresh `todayISO()` call:
 * `getServerSnapshot` must return a stable reference-equal value or React re-renders forever.
 */
export function useSelectedDate(): [string, (iso: string) => void] {
  const date = React.useSyncExternalStore(subscribe, getSelectedDate, getSelectedDate);
  return [date, setSelectedDate];
}

/* ────────────────────────────────────────────────────────────────────────────── date helpers ── */

/**
 * Parse `YYYY-MM-DD` as a LOCAL date.
 *
 * `new Date('2026-07-28')` parses as UTC midnight, which in any negative-offset timezone is the
 * 27th locally — so a naive parse shifts every label back a day for most of the Americas. Splitting
 * the parts and using the `Date(y, m, d)` constructor keeps it local, which is what the user means
 * by a date.
 */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** `YYYY-MM-DD` for a local Date, without the UTC shift `toISOString()` would introduce. */
export function toISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from today. Negative = past, 0 = today, positive = future. */
export function dayOffset(iso: string): number {
  const a = parseISO(iso).setHours(0, 0, 0, 0);
  const b = parseISO(todayISO()).setHours(0, 0, 0, 0);
  return Math.round((a - b) / DAY_MS);
}

export const isToday = (iso: string): boolean => dayOffset(iso) === 0;
export const isFuture = (iso: string): boolean => dayOffset(iso) > 0;
export const isPast = (iso: string): boolean => dayOffset(iso) < 0;

/**
 * A label a person reads without decoding: "Today", "Yesterday", "Tomorrow", then the date.
 *
 * The relative words only cover ±1 deliberately. "3 days ago" is harder to place than "Sat, 25 Jul"
 * once you are past the immediate neighbours, and dropping to the real date is what lets someone
 * confirm they are logging onto the day they meant.
 */
export function dayLabel(iso: string): string {
  const off = dayOffset(iso);
  if (off === 0) return 'Today';
  if (off === -1) return 'Yesterday';
  if (off === 1) return 'Tomorrow';
  return parseISO(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Always the calendar date, for the places that need it alongside the relative word. */
export function dateLabel(iso: string): string {
  return parseISO(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
