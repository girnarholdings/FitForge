'use client';

/**
 * FORGEBRIDGE v1 — the web half of the iOS shell contract (docs/IOS-SHELL-CONTRACT.md).
 *
 * THIS FILE IS THE SOURCE OF TRUTH for the message contract: every envelope + payload type and
 * every runtime guard lives here, and the Swift mirror (`ForgeBridgeMessages.swift`) is proven
 * against the SAME frozen fixtures at `fixtures/forgebridge/*.json`. Editing a type here is a
 * bridge-version event, not a refactor — the contract is additive-only forever, so guards check
 * only the fields v1 promised and let unknown extra fields ride through untouched.
 *
 * TRANSPORT (both directions asymmetric by design):
 *   page → native  `window.webkit.messageHandlers.forgebridge.postMessage(envelope)`
 *   native → page  ONLY `evaluateJavaScript("window.ForgeShell._receive(<json>)")`
 *
 * DETECTION IS THE GLOBAL, NEVER THE USER AGENT. The shell injects `window.ForgeShell` at
 * documentStart; a UA sniff would misfire on every iPad-desktop-UA and in-app-browser variant,
 * while the global is either there or it is not. Native pushes nothing before `bridge/hello`,
 * so the page installs `_receive` before saying hello and can never miss a message.
 *
 * NO ACK, NO SHELL: a page that sends hello and hears no `bridge/helloAck` within 3s renders
 * the plain web app — a hung shell must degrade to the product, not to a spinner.
 */
import { withBase } from '@/lib/utils';
import {
  ingestBatch,
  highWaterMarks,
  setPermissionState,
  markSyncComplete,
  isHealthDisconnected,
} from '@/lib/health/store';

/* ------------------------------------------------------------------------------- metrics v1 */

/**
 * The trainer-ranked v1 metric set — read-only, and CLOSED for v1 (VO2max, respiratory rate and
 * ring/stand anything were killed deliberately; `menstrualFlow` is a separate later opt-in).
 * `bodyFatPercentage` rides as the optional companion to `bodyMass`.
 */
export const HEALTH_METRICS = [
  'sleep',
  'restingHeartRate',
  'hrvSdnn',
  'bodyMass',
  'bodyFatPercentage',
  'steps',
  'activeEnergy',
  'workouts',
] as const;

export type HealthMetric = (typeof HEALTH_METRICS)[number];

/** Sleep sessions and external workouts cross as discrete samples; everything else is day-grained. */
export const SAMPLE_METRICS = ['sleep', 'workouts'] as const satisfies readonly HealthMetric[];
export type SampleMetric = (typeof SAMPLE_METRICS)[number];
export type QuantityMetric = Exclude<HealthMetric, SampleMetric>;

export function isHealthMetric(v: unknown): v is HealthMetric {
  return typeof v === 'string' && (HEALTH_METRICS as readonly string[]).includes(v);
}

/* ---------------------------------------------------------------------------- payload shapes */

/** One day of one quantity metric. `date` is the USER'S LOCAL calendar day — native aggregates
 *  in the phone's calendar, so the web side never re-derives a day through UTC. */
export interface DailyMetricPoint {
  date: string; // YYYY-MM-DD
  value: number;
  unit: string;
}

/** A discrete HealthKit sample (sleep session / external workout). `hkUuid` is the dedupe key. */
export interface HealthSample {
  hkUuid: string;
  start: string; // ISO-8601 with the offset the sample was recorded in
  end: string;
  value: number;
  unit: string;
  /** sleep: 'asleep' (in-bed is filtered native-side); workouts: the HKWorkoutActivityType name */
  kind: string;
  /** workouts only: active energy for the session */
  kcal?: number;
}

/**
 * HealthKit never reveals read-denial, so `yieldedData` — "did any data actually arrive" — is
 * the only honest per-metric signal the Profile card can show.
 */
export interface MetricPermission {
  requested: boolean;
  determined: boolean;
  yieldedData: boolean;
}

export interface HelloPayload {
  pageBridgeVersion: number;
}

export interface HelloAckPayload {
  shellVersion: string;
  bridgeVersion: number;
  capabilities: string[];
}

export interface UnsupportedPayload {
  forId: string;
  type: string;
}

export interface RequestPermissionsPayload {
  types: HealthMetric[];
}

export interface PermissionsPayload {
  perMetric: Partial<Record<HealthMetric, MetricPermission>>;
}

/** `haveUpTo`: per metric, the newest local date already stored (null = send everything). */
export interface RequestSyncPayload {
  haveUpTo: Partial<Record<HealthMetric, string | null>>;
}

/** Exactly one of `points` / `samples` is present, by metric kind. */
export interface HealthBatchPayload {
  batchId: string;
  metric: HealthMetric;
  points?: DailyMetricPoint[];
  samples?: HealthSample[];
}

export interface AckBatchPayload {
  batchId: string;
}

export interface SyncCompletePayload {
  /** present when native knows its data is stale since a date (e.g. background delivery lapsed) */
  staleSince?: string;
}

/* --------------------------------------------------------------------------------- envelope */

export const BRIDGE_VERSION = 1;

export interface BridgePayloads {
  'bridge/hello': HelloPayload;
  'bridge/helloAck': HelloAckPayload;
  'bridge/unsupported': UnsupportedPayload;
  'health/requestPermissions': RequestPermissionsPayload;
  'health/permissions': PermissionsPayload;
  'health/requestSync': RequestSyncPayload;
  'health/batch': HealthBatchPayload;
  'health/ackBatch': AckBatchPayload;
  'health/syncComplete': SyncCompletePayload;
}

export type BridgeMessageType = keyof BridgePayloads;

export interface BridgeEnvelope<T extends BridgeMessageType = BridgeMessageType> {
  v: 1;
  id: string; // uuid
  type: T;
  payload: BridgePayloads[T];
}

/** The discriminated union of every v1 envelope — what `parseEnvelope` narrows into. */
export type AnyBridgeEnvelope = { [T in BridgeMessageType]: BridgeEnvelope<T> }[BridgeMessageType];

/* ----------------------------------------------------------------------------- runtime guards */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function isDailyMetricPoint(v: unknown): v is DailyMetricPoint {
  return isRecord(v) && isStr(v.date) && isNum(v.value) && isStr(v.unit);
}

function isHealthSample(v: unknown): v is HealthSample {
  return (
    isRecord(v) &&
    isStr(v.hkUuid) &&
    isStr(v.start) &&
    isStr(v.end) &&
    isNum(v.value) &&
    isStr(v.unit) &&
    isStr(v.kind) &&
    (v.kcal === undefined || isNum(v.kcal))
  );
}

function isMetricPermission(v: unknown): v is MetricPermission {
  return isRecord(v) && isBool(v.requested) && isBool(v.determined) && isBool(v.yieldedData);
}

/**
 * Per-type payload guards. Each checks ONLY what v1 promised — extra fields from a newer shell
 * pass through untouched (additive-only forever), while a missing/mistyped required field fails
 * the whole envelope: a half-shaped message acted on is worse than one dropped.
 */
const PAYLOAD_GUARDS: { [T in BridgeMessageType]: (p: Record<string, unknown>) => boolean } = {
  'bridge/hello': (p) => isNum(p.pageBridgeVersion),
  'bridge/helloAck': (p) =>
    isStr(p.shellVersion) &&
    isNum(p.bridgeVersion) &&
    Array.isArray(p.capabilities) &&
    p.capabilities.every(isStr),
  'bridge/unsupported': (p) => isStr(p.forId) && isStr(p.type),
  'health/requestPermissions': (p) => Array.isArray(p.types) && p.types.every(isHealthMetric),
  'health/permissions': (p) =>
    isRecord(p.perMetric) && Object.values(p.perMetric).every(isMetricPermission),
  'health/requestSync': (p) =>
    isRecord(p.haveUpTo) && Object.values(p.haveUpTo).every((v) => v === null || isStr(v)),
  'health/batch': (p) =>
    isStr(p.batchId) &&
    isHealthMetric(p.metric) &&
    // exactly the arrays the metric kind implies; at least one must be present and well-formed
    (p.points !== undefined || p.samples !== undefined) &&
    (p.points === undefined || (Array.isArray(p.points) && p.points.every(isDailyMetricPoint))) &&
    (p.samples === undefined || (Array.isArray(p.samples) && p.samples.every(isHealthSample))),
  'health/ackBatch': (p) => isStr(p.batchId),
  'health/syncComplete': (p) => p.staleSince === undefined || isStr(p.staleSince),
};

function isBridgeMessageType(v: unknown): v is BridgeMessageType {
  return isStr(v) && v in PAYLOAD_GUARDS;
}

/**
 * Parse an unknown value (already-parsed JSON) into a typed envelope, or null.
 *
 * Null, never throw: everything arriving here crossed a process boundary, and a malformed
 * message from a future shell must degrade to "ignored", not to a crashed dispatcher inside
 * `evaluateJavaScript`.
 */
export function parseEnvelope(raw: unknown): AnyBridgeEnvelope | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== 1 || !isStr(raw.id) || !isBridgeMessageType(raw.type)) return null;
  if (!isRecord(raw.payload) || !PAYLOAD_GUARDS[raw.type](raw.payload)) return null;
  return raw as unknown as AnyBridgeEnvelope;
}

/* ------------------------------------------------------------------------------ envelope ids */

/**
 * UUID for envelope ids. `crypto.randomUUID` everywhere that matters (WKWebView is a secure
 * context, so it exists in the shell by construction); the fallback covers node-side unit tests
 * and any http:// dev origin, where ids only need uniqueness, not cryptographic pedigree.
 */
export function newEnvelopeId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  let out = '';
  for (const ch of 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx') {
    if (ch === 'x') out += Math.floor(Math.random() * 16).toString(16);
    else if (ch === 'y') out += (8 + Math.floor(Math.random() * 4)).toString(16);
    else out += ch;
  }
  return out;
}

export function makeEnvelope<T extends BridgeMessageType>(
  type: T,
  payload: BridgePayloads[T],
): BridgeEnvelope<T> {
  return { v: 1, id: newEnvelopeId(), type, payload };
}

/* -------------------------------------------------------------------------------- transport */

declare global {
  interface Window {
    /** Injected by the shell at documentStart; the page adds `_receive`. Presence = in shell. */
    ForgeShell?: { _receive?: (raw: unknown) => void };
    webkit?: {
      messageHandlers?: {
        forgebridge?: { postMessage: (envelope: unknown) => void };
      };
    };
  }
}

/** In the iOS shell? THE GLOBAL, NEVER THE USER AGENT — see the header. Safe on the server. */
export function inShell(): boolean {
  return typeof window !== 'undefined' && !!window.ForgeShell;
}

/** Post an envelope to native. Returns whether a handler existed to receive it. */
export function sendToShell(envelope: AnyBridgeEnvelope): boolean {
  if (typeof window === 'undefined') return false;
  const handler = window.webkit?.messageHandlers?.forgebridge;
  if (!handler) return false;
  try {
    handler.postMessage(envelope);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------- dispatcher + listeners */

type BridgeListener<T extends BridgeMessageType> = (envelope: BridgeEnvelope<T>) => void;

const messageListeners = new Map<BridgeMessageType, Set<BridgeListener<BridgeMessageType>>>();

/** Listen for one message type. Returns the unsubscribe. */
export function onBridgeMessage<T extends BridgeMessageType>(
  type: T,
  listener: BridgeListener<T>,
): () => void {
  let set = messageListeners.get(type);
  if (!set) {
    set = new Set();
    messageListeners.set(type, set);
  }
  const l = listener as BridgeListener<BridgeMessageType>;
  set.add(l);
  return () => set.delete(l);
}

/**
 * The `window.ForgeShell._receive` entry point. Native inlines the envelope as a JSON literal,
 * but a string is accepted too — the transport detail must not be able to break the page.
 * Malformed input is dropped silently: this function runs inside `evaluateJavaScript`, where a
 * throw surfaces as a native-side error and nothing more useful.
 */
function receiveFromShell(raw: unknown): void {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return;
    }
  }
  const envelope = parseEnvelope(value);
  if (!envelope) return;
  const set = messageListeners.get(envelope.type);
  if (!set) return;
  for (const l of [...set]) l(envelope);
}

/* ------------------------------------------------------------------------ handshake + status */

/** No `helloAck` within this window ⇒ render the plain web app (contract law). */
export const HELLO_TIMEOUT_MS = 3_000;

export interface ShellStatus {
  /**
   * 'idle'       — init not yet run (or running on the server)
   * 'connecting' — global present, hello sent, ack pending
   * 'shell'      — helloAck received; capabilities/shellVersion are real
   * 'web'        — no global, or the 3s ack window expired: the plain web app
   */
  phase: 'idle' | 'connecting' | 'shell' | 'web';
  shellVersion: string | null;
  bridgeVersion: number | null;
  capabilities: string[];
}

const IDLE_STATUS: ShellStatus = {
  phase: 'idle',
  shellVersion: null,
  bridgeVersion: null,
  capabilities: [],
};

let status: ShellStatus = IDLE_STATUS;
const statusListeners = new Set<() => void>();

function setStatus(next: ShellStatus): void {
  status = next;
  for (const l of statusListeners) l();
}

/** Stable reference between changes — safe for `useSyncExternalStore`. */
export function getShellStatus(): ShellStatus {
  return status;
}

export function subscribeShellStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/* ------------------------------------------------------------------------------ health wiring */

/**
 * Handshake succeeded and the shell can do health: ask for everything newer than what the
 * store already holds. Skipped entirely while disconnected — "disconnect" means STOP INGESTING
 * (data stays), and not inviting batches is the polite half of that.
 */
function startHealthSync(): void {
  if (isHealthDisconnected()) return;
  sendToShell(makeEnvelope('health/requestSync', { haveUpTo: highWaterMarks() }));
}

function wireHealthListeners(): void {
  onBridgeMessage('health/batch', (env) => {
    // Ingest THEN ack — an ack is a durability promise, and native drops its resend bookkeeping
    // on it. While disconnected the batch is dropped but still acked: un-acked batches would
    // make native retry forever for data we are refusing on purpose.
    if (!isHealthDisconnected()) ingestBatch(env.payload);
    sendToShell(makeEnvelope('health/ackBatch', { batchId: env.payload.batchId }));
  });
  onBridgeMessage('health/permissions', (env) => {
    setPermissionState(env.payload.perMetric);
  });
  onBridgeMessage('health/syncComplete', (env) => {
    markSyncComplete(env.payload.staleSince ?? null);
  });
}

/* -------------------------------------------------------------------------- service worker */

/**
 * Conservative offline shell (public/sw.js): network-first navigations, cache-first immutable
 * `/_next/static/**`. Registered ONLY inside the shell for now — the PWA-wide rollout is gated
 * until the caching story has soaked where we control the runtime. Failure is ignored: the app
 * predates the worker and must keep working without it.
 */
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(withBase('/sw.js')).catch(() => {
    /* no worker, no problem — the network path is the primary path */
  });
}

/* -------------------------------------------------------------------------------------- init */

let initialized = false;

/**
 * Idempotent bridge init — mounted once at the app root (ShellBridgeDriver) and safe to call
 * again from any hook. Outside the shell this resolves to 'web' immediately (the global is
 * either injected at documentStart or never); inside, it installs `_receive` BEFORE sending
 * hello, so the first native push can never race the dispatcher.
 */
export function initForgeBridge(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  if (!inShell()) {
    setStatus({ ...IDLE_STATUS, phase: 'web' });
    return;
  }

  window.ForgeShell!._receive = receiveFromShell;
  wireHealthListeners();
  registerServiceWorker();

  const timer = setTimeout(() => {
    // Shell global present but nobody home — a hung/ancient shell degrades to the plain web app.
    if (status.phase === 'connecting') setStatus({ ...IDLE_STATUS, phase: 'web' });
  }, HELLO_TIMEOUT_MS);

  onBridgeMessage('bridge/helloAck', (env) => {
    clearTimeout(timer);
    setStatus({
      phase: 'shell',
      shellVersion: env.payload.shellVersion,
      bridgeVersion: env.payload.bridgeVersion,
      capabilities: [...env.payload.capabilities],
    });
    if (env.payload.capabilities.includes('health')) startHealthSync();
  });

  setStatus({ ...IDLE_STATUS, phase: 'connecting' });
  sendToShell(makeEnvelope('bridge/hello', { pageBridgeVersion: BRIDGE_VERSION }));
}

/** Ask native to run the HealthKit authorization sheet for the v1 metric set. */
export function requestHealthPermissions(types: HealthMetric[] = [...HEALTH_METRICS]): boolean {
  return sendToShell(makeEnvelope('health/requestPermissions', { types }));
}
