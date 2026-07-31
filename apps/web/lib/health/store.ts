'use client';

/**
 * APPLE HEALTH STORE — `fitforge.health.v1`.
 *
 * The web-side landing zone for everything the iOS shell pumps over ForgeBridge: day-grained
 * points per quantity metric, hkUuid-keyed samples for sleep sessions and external workouts,
 * plus the meta the Profile card needs (per-metric permission state, sync stamps, the
 * disconnect toggle).
 *
 * PRIVACY: the `fitforge.health.` prefix is on the sync denylist (`SYNC_DENYLIST_PREFIXES` in
 * lib/demo/store) — HealthKit-derived data never rides the automatic cloud sweep. It still
 * rides the user-initiated file export, and erase-everything covers it like any fitforge key.
 *
 * IDEMPOTENT BY CONSTRUCTION. Native resends anything un-acked and re-anchors after restores,
 * so the same batch arriving twice must be a no-op: points replace by (metric, date), samples
 * replace by hkUuid. History is bounded to {@link MAX_DAYS} days per metric — the selectors'
 * longest look-back is the 30-day HRV baseline, so 400 days is a year of trends plus slack,
 * not an unbounded localStorage liability.
 *
 * DASHBOARDS DO NOT READ THIS STORE. The selector layer (lib/health/selectors.ts) is the only
 * sanctioned reader — the "no verdicts from single readings" law is enforced there, and a
 * component reaching around it would bypass exactly that.
 */
import * as React from 'react';
import { safeSetItem } from '@/lib/storage/safeWrite';
import { getState as demoState, logWeight } from '@/lib/demo/store';
import {
  HEALTH_METRICS,
  SAMPLE_METRICS,
  type HealthMetric,
  type QuantityMetric,
  type SampleMetric,
  type DailyMetricPoint,
  type HealthSample,
  type MetricPermission,
  type HealthBatchPayload,
} from '@/lib/native/forgeBridge';

export const HEALTH_KEY = 'fitforge.health.v1';

/** Days of history kept per metric. See the header for why 400. */
export const MAX_DAYS = 400;

/** Hard cap on samples per sample-metric — several sleep fragments a night still fit in 400 days. */
const MAX_SAMPLES = MAX_DAYS * 4;

export type PermissionMap = Partial<Record<HealthMetric, MetricPermission>>;

export interface HealthMeta {
  /** last `health/permissions` push from the shell, verbatim — the Profile card's truth */
  permissions: PermissionMap | null;
  permissionsUpdatedAt: string | null;
  /** stamped on every ingested batch / completed sync, for the Profile card's "last sync" line */
  lastBatchAt: string | null;
  lastSyncCompleteAt: string | null;
  /** native said its own data is stale since this date (background delivery lapsed) */
  staleSince: string | null;
  /** the web-side toggle: stop ingesting, keep everything already imported */
  disconnected: boolean;
  /**
   * ISO dates whose demo-store weight entry WE wrote from a Health import. The body-weight
   * merge law is "a manual same-day entry wins", and without provenance a re-sync could not
   * tell "manual entry to respect" from "our own import to refresh" — this set is that memory.
   */
  healthWeightDates: string[];
}

export interface HealthState {
  version: 1;
  /** day-grained points per quantity metric, ascending by date, bounded to MAX_DAYS */
  daily: Partial<Record<QuantityMetric, DailyMetricPoint[]>>;
  /** hkUuid-keyed samples (sleep, workouts), ascending by start, bounded to MAX_DAYS of history */
  samples: Partial<Record<SampleMetric, HealthSample[]>>;
  meta: HealthMeta;
}

/* ----------------------------------------------------------------------------- load / repair */

const listeners = new Set<() => void>();
let cache: HealthState | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function emptyMeta(): HealthMeta {
  return {
    permissions: null,
    permissionsUpdatedAt: null,
    lastBatchAt: null,
    lastSyncCompleteAt: null,
    staleSince: null,
    disconnected: false,
    healthWeightDates: [],
  };
}

function emptyState(): HealthState {
  return { version: 1, daily: {}, samples: {}, meta: emptyMeta() };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isSampleMetric = (m: string): m is SampleMetric =>
  (SAMPLE_METRICS as readonly string[]).includes(m);

/**
 * Normalize whatever is on disk into a valid HealthState — localStorage is a CACHE the shell
 * mirror may repopulate and other tabs may race, so every read repairs rather than trusts.
 * Unknown metrics and half-shaped rows are dropped; a corrupt blob degrades to empty (the
 * native mirror + re-sync path regenerates it, which is the whole architecture).
 */
function normalize(value: unknown): HealthState {
  const out = emptyState();
  if (!isRecord(value)) return out;

  if (isRecord(value.daily)) {
    for (const [metric, rows] of Object.entries(value.daily)) {
      if (!(HEALTH_METRICS as readonly string[]).includes(metric) || isSampleMetric(metric)) continue;
      if (!Array.isArray(rows)) continue;
      const clean = rows.filter(
        (r): r is DailyMetricPoint =>
          isRecord(r) &&
          typeof r.date === 'string' &&
          typeof r.value === 'number' &&
          Number.isFinite(r.value) &&
          typeof r.unit === 'string',
      );
      if (clean.length) out.daily[metric as QuantityMetric] = clean;
    }
  }
  if (isRecord(value.samples)) {
    for (const [metric, rows] of Object.entries(value.samples)) {
      if (!isSampleMetric(metric) || !Array.isArray(rows)) continue;
      const clean = rows.filter(
        (r): r is HealthSample =>
          isRecord(r) &&
          typeof r.hkUuid === 'string' &&
          typeof r.start === 'string' &&
          typeof r.end === 'string' &&
          typeof r.value === 'number' &&
          Number.isFinite(r.value) &&
          typeof r.unit === 'string' &&
          typeof r.kind === 'string',
      );
      if (clean.length) out.samples[metric] = clean;
    }
  }
  if (isRecord(value.meta)) {
    const m = value.meta;
    out.meta = {
      permissions: isRecord(m.permissions) ? (m.permissions as PermissionMap) : null,
      permissionsUpdatedAt: typeof m.permissionsUpdatedAt === 'string' ? m.permissionsUpdatedAt : null,
      lastBatchAt: typeof m.lastBatchAt === 'string' ? m.lastBatchAt : null,
      lastSyncCompleteAt: typeof m.lastSyncCompleteAt === 'string' ? m.lastSyncCompleteAt : null,
      staleSince: typeof m.staleSince === 'string' ? m.staleSince : null,
      disconnected: m.disconnected === true,
      healthWeightDates: Array.isArray(m.healthWeightDates)
        ? m.healthWeightDates.filter((d): d is string => typeof d === 'string')
        : [],
    };
  }
  return out;
}

function load(): HealthState {
  if (cache) return cache;
  if (!isBrowser()) return (cache = emptyState());
  try {
    const raw = window.localStorage.getItem(HEALTH_KEY);
    cache = raw ? normalize(JSON.parse(raw)) : emptyState();
  } catch {
    cache = emptyState();
  }
  return cache;
}

function save(next: HealthState): void {
  cache = next;
  // Quota failures surface through the shared storage-health banner; the in-memory copy still
  // serves this session either way (and in the shell, the native mirror is the durable copy).
  if (isBrowser()) safeSetItem(HEALTH_KEY, JSON.stringify(next));
  for (const l of listeners) l();
}

/* -------------------------------------------------------------------------------- ingestion */

/**
 * The LOCAL calendar date a sample belongs to. Sample timestamps carry the offset they were
 * recorded in ('2026-07-31T05:53:00-07:00'), so the leading ten characters ARE the local date —
 * re-parsing through Date/UTC is how a 23:30 bedtime lands on the wrong day (same trap, same
 * fix as lib/health/appleHealth.ts).
 */
function localDateOf(iso: string): string {
  return iso.slice(0, 10);
}

const byDateAsc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : 1);
const byStartAsc = (a: HealthSample, b: HealthSample) => (a.start < b.start ? -1 : 1);

/** Merge day-grained points: REPLACE by date (idempotent), sort, keep the newest MAX_DAYS. */
function mergePoints(existing: DailyMetricPoint[], incoming: DailyMetricPoint[]): DailyMetricPoint[] {
  const byDate = new Map(existing.map((p) => [p.date, p]));
  for (const p of incoming) byDate.set(p.date, p);
  return [...byDate.values()].sort(byDateAsc).slice(-MAX_DAYS);
}

/** Merge samples: REPLACE by hkUuid (idempotent), sort by start, prune beyond MAX_DAYS. */
function mergeSamples(existing: HealthSample[], incoming: HealthSample[]): HealthSample[] {
  const byUuid = new Map(existing.map((s) => [s.hkUuid, s]));
  for (const s of incoming) byUuid.set(s.hkUuid, s);
  const sorted = [...byUuid.values()].sort(byStartAsc);
  // Bound by AGE relative to the newest sample, not by count alone — a burst of short sleep
  // fragments must never evict a year of workouts. The count cap is only the safety net.
  const newest = sorted.length ? localDateOf(sorted[sorted.length - 1]!.end) : null;
  const floor = newest ? addDaysISO(newest, -MAX_DAYS) : null;
  const aged = floor ? sorted.filter((s) => localDateOf(s.end) >= floor) : sorted;
  return aged.slice(-MAX_SAMPLES);
}

/** Date arithmetic pinned to noon UTC so DST can never shift the calendar day. */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const LB_TO_KG = 0.45359237;

/**
 * BODY-WEIGHT MERGE (contract law): bodyMass imports ALSO write through the existing
 * `logWeight` path in lib/demo — one entry per ISO date, and a MANUAL same-day entry WINS.
 * "Manual wins" is implemented as "never overwrite an entry we did not write ourselves":
 * dates we imported are remembered in meta.healthWeightDates, so a re-sync refreshes our own
 * imports and cannot touch anything the athlete typed. Native already reduced multiple
 * same-day samples to the earliest (morning weigh-in) before they got here.
 */
function mergeBodyMassIntoWeights(points: DailyMetricPoint[], meta: HealthMeta): HealthMeta {
  const healthDates = new Set(meta.healthWeightDates);
  const manualDates = new Set(
    demoState()
      .weights.map((w) => w.date)
      .filter((d) => !healthDates.has(d)),
  );
  let changed = false;
  for (const p of points) {
    if (manualDates.has(p.date)) continue; // the athlete typed this one — theirs forever
    const kg = p.unit === 'lb' ? p.value * LB_TO_KG : p.value;
    logWeight(p.date, Math.round(kg * 10) / 10);
    if (!healthDates.has(p.date)) {
      healthDates.add(p.date);
      changed = true;
    }
  }
  if (!changed) return meta;
  return { ...meta, healthWeightDates: [...healthDates].sort().slice(-MAX_DAYS) };
}

/**
 * The single ingestion entry — the bridge wiring feeds every `health/batch` payload here.
 * Same batch twice = same state (native resends anything un-acked). A disconnected store
 * refuses new data but keeps what it has; the bridge still acks so native stops retrying.
 */
export function ingestBatch(batch: HealthBatchPayload): void {
  const s = load();
  if (s.meta.disconnected) return;

  let { daily, samples } = s;
  let meta: HealthMeta = { ...s.meta, lastBatchAt: new Date().toISOString() };

  if (isSampleMetric(batch.metric)) {
    const incoming = batch.samples ?? [];
    samples = {
      ...samples,
      [batch.metric]: mergeSamples(samples[batch.metric] ?? [], incoming),
    };
  } else {
    const metric = batch.metric as QuantityMetric;
    const incoming = batch.points ?? [];
    daily = { ...daily, [metric]: mergePoints(daily[metric] ?? [], incoming) };
    if (metric === 'bodyMass' && incoming.length) meta = mergeBodyMassIntoWeights(incoming, meta);
  }

  save({ version: 1, daily, samples, meta });
}

/* --------------------------------------------------------------------- sync bookkeeping */

/**
 * Per-metric high-water marks for `health/requestSync`'s `haveUpTo`: the newest LOCAL date
 * already stored, null where nothing is — null is native's cue to run the 90-day backfill.
 */
export function highWaterMarks(): Record<HealthMetric, string | null> {
  const s = load();
  const marks = {} as Record<HealthMetric, string | null>;
  for (const metric of HEALTH_METRICS) {
    if (isSampleMetric(metric)) {
      const rows = s.samples[metric] ?? [];
      marks[metric] = rows.length
        ? rows.reduce((max, r) => {
            const d = localDateOf(r.end);
            return d > max ? d : max;
          }, '')
        : null;
    } else {
      const rows = s.daily[metric] ?? [];
      marks[metric] = rows.length ? rows[rows.length - 1]!.date : null;
    }
  }
  return marks;
}

export function setPermissionState(perMetric: PermissionMap): void {
  const s = load();
  save({
    ...s,
    meta: { ...s.meta, permissions: perMetric, permissionsUpdatedAt: new Date().toISOString() },
  });
}

/**
 * The per-metric permission map the shell last pushed (`requested` / `determined` /
 * `yieldedData`) — the Profile "Apple Health" card's truth. Null before the shell ever spoke.
 * `yieldedData` is the only honest signal: HealthKit never reveals read-denial.
 */
export function permissionState(): PermissionMap | null {
  return load().meta.permissions;
}

export function markSyncComplete(staleSince: string | null): void {
  const s = load();
  save({ ...s, meta: { ...s.meta, lastSyncCompleteAt: new Date().toISOString(), staleSince } });
}

/* ------------------------------------------------------------------------------ disconnect */

/**
 * Stop ingesting; KEEP everything already imported. The imported days are the athlete's
 * history, and a toggle that deleted them would punish changing your mind — re-connecting
 * later simply resumes from the high-water marks.
 */
export function disconnect(): void {
  const s = load();
  if (s.meta.disconnected) return;
  save({ ...s, meta: { ...s.meta, disconnected: true } });
}

/** The other half of the toggle. (The next handshake or app launch re-requests sync.) */
export function reconnect(): void {
  const s = load();
  if (!s.meta.disconnected) return;
  save({ ...s, meta: { ...s.meta, disconnected: false } });
}

/** Aliases of {@link disconnect}/{@link reconnect} — both spellings are in live use. */
export const disconnectHealth = disconnect;
export const reconnectHealth = reconnect;

export function isHealthDisconnected(): boolean {
  return load().meta.disconnected;
}

/* -------------------------------------------------------------------------------- reading */

export function healthState(): HealthState {
  return load();
}

export function dailyPoints(metric: QuantityMetric): DailyMetricPoint[] {
  return load().daily[metric] ?? [];
}

export function healthSamples(metric: SampleMetric): HealthSample[] {
  return load().samples[metric] ?? [];
}

export function subscribeHealth(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_SNAPSHOT: HealthState = { version: 1, daily: {}, samples: {}, meta: emptyMeta() };

/**
 * The whole store as reactive state. Components use this as the SUBSCRIPTION TICK and read
 * through the selectors (lib/health/selectors) for derivation — the returned reference changes
 * exactly when a batch lands, so a `useMemo` keyed on it re-derives at the right moments.
 */
export function useHealthData(): HealthState {
  return React.useSyncExternalStore(subscribeHealth, load, () => SERVER_SNAPSHOT);
}

/** Alias of {@link useHealthData} — same hook, for call sites that prefer the -State spelling. */
export const useHealthState = useHealthData;

/** TESTS ONLY: drop the in-memory cache so a fresh load() re-reads (or re-empties) the store. */
export function _resetHealthStoreForTests(): void {
  cache = null;
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(HEALTH_KEY);
    } catch {
      /* fine — the next load() self-heals */
    }
  }
}
