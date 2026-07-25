'use client';

/**
 * WS-4 — AGGREGATED TARGETING ("what does this plan actually train?").
 *
 * The currency is **hard sets per muscle per week** (RESEARCH-EXERCISES §6, mirroring Hevy's
 * sets-per-muscle-group chart and Fitbod's silhouette heatmap). Attribution is deterministic and
 * documented on-screen: every set credits **1.0 to each primary muscle and 0.5 to each secondary**.
 *
 * Renders BOTH views the brief asks for:
 *   1. a `MuscleMap` in `heat` mode (one glance: "what am I neglecting?"), and
 *   2. a ranked bar list of muscles with weighted set counts + plain-English target bands.
 *
 * Pure client component, no data fetching: callers pass exercise references + set counts, so the
 * same component serves a routine preview, a single workout day, or a week of logged sets.
 */
import * as React from 'react';
import { MuscleMap, MUSCLE_NAMES, ALL_MUSCLE_SLUGS } from '@/components/illustrations';
import type { MuscleSlug } from '@/components/illustrations';
import { mockExerciseBySlug, mockExerciseById } from '@/components/features/_mock/data';

/* ------------------------------------------------------------------------------ attribution */

/** One contribution to weekly volume: an exercise (by slug or id) performed for `sets` sets. */
export interface VolumeSource {
  /** exercise slug — preferred (matches routine rows and catalog URLs) */
  slug?: string;
  /** exercise id — used when only the id is at hand (logged sessions) */
  id?: string;
  /** number of hard sets */
  sets: number;
  /** optional pre-resolved muscles (skips the catalog lookup) */
  primary_muscles?: string[];
  secondary_muscles?: string[];
}

/** Credit a primary muscle gets per set. */
export const PRIMARY_CREDIT = 1;
/** Credit a secondary muscle gets per set. */
export const SECONDARY_CREDIT = 0.5;

/** Evidence-informed weekly bands (sets per muscle per week). */
export const VOLUME_BANDS = {
  /** below this = under-trained */
  low: 10,
  /** above this = high / recovery risk */
  high: 20,
} as const;

export type VolumeBand = 'none' | 'low' | 'optimal' | 'high';

export const BAND_LABEL: Record<VolumeBand, string> = {
  none: 'Not trained',
  low: 'Room to grow',
  optimal: 'On target',
  high: 'Very high',
};

export const BAND_HELP: Record<VolumeBand, string> = {
  none: 'No sets hit this muscle in the plan.',
  low: `Under ${VOLUME_BANDS.low} sets a week — fine for a support muscle, light if it's a goal.`,
  optimal: `${VOLUME_BANDS.low}–${VOLUME_BANDS.high} sets a week — a solid growth range.`,
  high: `Over ${VOLUME_BANDS.high} sets a week — great, as long as you're recovering.`,
};

const BAND_BAR: Record<VolumeBand, string> = {
  none: 'bg-border',
  low: 'bg-energy',
  optimal: 'bg-accent',
  high: 'bg-danger',
};

const BAND_TEXT: Record<VolumeBand, string> = {
  none: 'text-muted-foreground',
  low: 'text-energy',
  optimal: 'text-accent',
  high: 'text-danger',
};

export function bandFor(sets: number): VolumeBand {
  if (sets <= 0) return 'none';
  if (sets < VOLUME_BANDS.low) return 'low';
  if (sets <= VOLUME_BANDS.high) return 'optimal';
  return 'high';
}

export interface MuscleVolumeRow {
  slug: MuscleSlug;
  name: string;
  sets: number;
  band: VolumeBand;
}

function resolveMuscles(src: VolumeSource): { primary: string[]; secondary: string[] } {
  if (src.primary_muscles || src.secondary_muscles) {
    return { primary: src.primary_muscles ?? [], secondary: src.secondary_muscles ?? [] };
  }
  const ex = src.slug ? mockExerciseBySlug(src.slug) : src.id ? mockExerciseById(src.id) : undefined;
  return { primary: ex?.primary_muscles ?? [], secondary: ex?.secondary_muscles ?? [] };
}

/**
 * Weighted sets per muscle. Primary +1.0/set, secondary +0.5/set. Returns EVERY seed muscle
 * (zeroes included) sorted by volume desc, then by the stable anatomical order — so "what am I
 * neglecting" is answerable from the bottom of the list.
 */
export function computeMuscleVolume(sources: VolumeSource[], weeks = 1): MuscleVolumeRow[] {
  const totals = new Map<string, number>();
  for (const src of sources) {
    const n = Math.max(0, src.sets);
    if (n === 0) continue;
    const { primary, secondary } = resolveMuscles(src);
    for (const m of primary) totals.set(m, (totals.get(m) ?? 0) + n * PRIMARY_CREDIT);
    for (const m of secondary) totals.set(m, (totals.get(m) ?? 0) + n * SECONDARY_CREDIT);
  }
  const div = Math.max(1, weeks);
  const order = new Map(ALL_MUSCLE_SLUGS.map((s, i) => [s, i]));
  return ALL_MUSCLE_SLUGS.map((slug) => {
    const sets = Math.round(((totals.get(slug) ?? 0) / div) * 10) / 10;
    return { slug, name: MUSCLE_NAMES[slug], sets, band: bandFor(sets) };
  }).sort((a, b) => b.sets - a.sets || (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
}

/** `heat` payload (0..1) for `MuscleMap`, saturating at the top of the optimal band. */
export function volumeHeat(rows: MuscleVolumeRow[]): Partial<Record<MuscleSlug, number>> {
  const heat: Partial<Record<MuscleSlug, number>> = {};
  for (const r of rows) {
    if (r.sets > 0) heat[r.slug] = Math.min(1, r.sets / VOLUME_BANDS.high);
  }
  return heat;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ---------------------------------------------------------------------------- presentation */

export interface MuscleVolumeProps {
  /** exercises + set counts to aggregate */
  sources: VolumeSource[];
  /** divide totals by this many weeks (default 1 — sources already describe one week) */
  weeks?: number;
  /** headline above the summary line */
  title?: string;
  /** one-line context, e.g. the routine name */
  subtitle?: string;
  /** tap a muscle row / silhouette → caller can deep-link into the catalog */
  onMuscleSelect?: (slug: MuscleSlug) => void;
  /** how many ranked rows to show before "Show all" (default 8) */
  initialRows?: number;
  className?: string;
}

export function MuscleVolume({
  sources,
  weeks = 1,
  title = 'What this plan targets',
  subtitle,
  onMuscleSelect,
  initialRows = 8,
  className,
}: MuscleVolumeProps) {
  const rows = React.useMemo(() => computeMuscleVolume(sources, weeks), [sources, weeks]);
  const heat = React.useMemo(() => volumeHeat(rows), [rows]);
  const [expanded, setExpanded] = React.useState(false);

  const trained = rows.filter((r) => r.sets > 0);
  const untrained = rows.filter((r) => r.sets === 0);
  const totalSets = sources.reduce((n, s) => n + Math.max(0, s.sets), 0) / Math.max(1, weeks);
  const max = Math.max(VOLUME_BANDS.low, ...rows.map((r) => r.sets));
  const shown = expanded ? rows : rows.slice(0, initialRows);
  const lagging = trained.filter((r) => r.band === 'low').slice(-3).reverse();

  if (trained.length === 0) {
    return (
      <div
        className={['rounded-card bg-surface-2 p-5 text-center', className].filter(Boolean).join(' ')}
        data-testid="muscle-volume"
      >
        <p className="font-semibold text-foreground">Nothing to aggregate yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add exercises to your plan and this view will show the weekly sets landing on every muscle.
        </p>
      </div>
    );
  }

  return (
    <div className={['space-y-4', className].filter(Boolean).join(' ')} data-testid="muscle-volume">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {subtitle ? `${subtitle} · ` : ''}
          <span className="tabular font-semibold text-foreground">{fmt(Math.round(totalSets))}</span>{' '}
          sets a week across{' '}
          <span className="tabular font-semibold text-foreground">{trained.length}</span> muscles
        </p>
      </div>

      {/* View 1 — silhouette heat */}
      <div className="rounded-card bg-surface-2 p-4 shadow-[var(--shadow-card)]">
        <div className="flex justify-center">
          <MuscleMap view="both" height={230} heat={heat} labels={false} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <LegendSwatch opacity={0} label="0" />
          <LegendSwatch opacity={0.3} label={`< ${VOLUME_BANDS.low}`} />
          <LegendSwatch opacity={0.62} label={`${VOLUME_BANDS.low}–${VOLUME_BANDS.high}`} />
          <LegendSwatch opacity={0.9} label={`${VOLUME_BANDS.high}+`} />
          <span className="w-full text-center">weighted sets per muscle, per week</span>
        </div>
      </div>

      {/* View 2 — ranked bars */}
      <ul className="space-y-1.5" data-testid="muscle-volume-bars">
        {shown.map((r) => {
          const pct = max > 0 ? Math.max(r.sets > 0 ? 4 : 0, (r.sets / max) * 100) : 0;
          const inner = (
            <>
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className={`text-[11px] font-semibold ${BAND_TEXT[r.band]}`}>
                    {BAND_LABEL[r.band]}
                  </span>
                  <span className="tabular text-sm font-bold text-foreground">{fmt(r.sets)}</span>
                </span>
              </span>
              <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full ${BAND_BAR[r.band]} motion-safe:transition-[width] motion-safe:duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </>
          );
          return (
            <li key={r.slug}>
              {onMuscleSelect ? (
                <button
                  type="button"
                  onClick={() => onMuscleSelect(r.slug)}
                  data-testid={`muscle-volume-row-${r.slug}`}
                  aria-label={`${r.name}: ${fmt(r.sets)} sets per week. ${BAND_LABEL[r.band]}. Show exercises.`}
                  className="w-full rounded-field px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  {inner}
                </button>
              ) : (
                <div className="px-2.5 py-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length > initialRows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid="muscle-volume-toggle"
          className="text-sm font-semibold text-accent"
        >
          {expanded ? 'Show top muscles only' : `Show all ${rows.length} muscles`}
        </button>
      )}

      {/* Plain-English read-out */}
      <div className="rounded-card border border-border bg-surface-2/60 p-4 text-sm">
        <p className="font-semibold text-foreground">In plain English</p>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">Best covered:</span>{' '}
            {trained
              .slice(0, 3)
              .map((r) => `${r.name} (${fmt(r.sets)})`)
              .join(', ')}
            .
          </li>
          {lagging.length > 0 && (
            <li>
              <span className="font-semibold text-foreground">Light on volume:</span>{' '}
              {lagging.map((r) => `${r.name} (${fmt(r.sets)})`).join(', ')} — under{' '}
              {VOLUME_BANDS.low} sets a week.
            </li>
          )}
          {untrained.length > 0 && (
            <li>
              <span className="font-semibold text-foreground">Untouched:</span>{' '}
              {untrained.map((r) => r.name).join(', ')}. Add an accessory if any of these matter to
              you.
            </li>
          )}
          <li className="pt-1 text-xs">
            Every set counts <span className="font-semibold text-foreground">1.0</span> toward each
            primary muscle and <span className="font-semibold text-foreground">0.5</span> toward each
            secondary muscle — no guesswork, no fake percentages.
          </li>
        </ul>
      </div>
    </div>
  );
}

/** Gold-intensity swatch matching the silhouette's heat ramp (fill-opacity 0.15 + 0.75·v). */
function LegendSwatch({ opacity, label }: { opacity: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-4 rounded-full border border-border"
        style={
          opacity === 0
            ? { background: 'var(--muscle-base, var(--muted))' }
            : { background: 'var(--accent)', opacity: 0.15 + 0.75 * opacity }
        }
        aria-hidden
      />
      {label}
    </span>
  );
}
