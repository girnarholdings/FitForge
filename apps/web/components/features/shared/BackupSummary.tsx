'use client';

/**
 * TWO COPIES OF A TRAINING HISTORY, SIDE BY SIDE.
 *
 * Both places where FitForge is about to overwrite data — importing a file in Settings, and signing
 * into an account that already holds a different history — ask the same question, so they ask it
 * with the same table. Same rows, same order, same units on both sides: the point is that eyes can
 * diff two columns in a second, and "12 workouts vs 3" answers the question no prose can.
 */
import * as React from 'react';
import type { BackupSummary } from '@/lib/demo/store';

/**
 * A stamp rendered in the DEVICE's timezone — the whole reason to show it is "is this copy older or
 * newer than mine?", and a UTC string answers that wrongly for half the planet.
 */
export function stampLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One side of the comparison. */
export function SummaryColumn({
  label,
  summary,
  stampPrefix = 'Saved',
  testid,
}: {
  label: string;
  summary: BackupSummary;
  /** "Exported" for a file, "Saved" for the account copy — same field, different provenance. */
  stampPrefix?: string;
  testid: string;
}) {
  const rows: [string, string][] = [
    ['Workouts', String(summary.sessions)],
    ['Food days', String(summary.foodDays)],
    ['Food entries', String(summary.foodEntries)],
    ['Weigh-ins', String(summary.weighIns)],
    ['Plan', summary.routineName ?? '—'],
    ['Last workout', stampLabel(summary.latestSession) ?? '—'],
  ];
  const stamp = stampLabel(summary.exportedAt);
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3" data-testid={testid}>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      {/* The stamp line is ALWAYS rendered, blank when there is none. This device has no "exported
          at", and omitting the line would slide its rows up relative to the other column — which
          defeats the entire point of putting the two side by side. */}
      <p className="mt-0.5 text-[10px] text-muted-foreground" aria-hidden={!stamp}>
        {stamp ? `${stampPrefix} ${stamp}` : ' '}
      </p>
      <dl className="mt-2 flex flex-col gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            {/* A long plan name truncates rather than wraps, so the columns stay row-for-row
                aligned; the full text stays available as the element's title. */}
            <dd className="truncate text-right text-xs font-semibold text-foreground" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
