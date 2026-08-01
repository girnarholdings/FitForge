'use client';

/**
 * BODY-SCAN CLIENT — the web half of the worker's `bodyscan` task (docs/AIMODE-CONTRACT.md
 * "Web scan client"). Mirrors `lib/food/aiParse.ts` deliberately: same endpoint plumbing, same
 * idToken/preferred-model ride-along, and the same contract of NEVER THROWING — every failure
 * path comes back as a status the photos screen turns into copy and an Old School exit. AI Mode
 * is a shortcut, never a wall.
 *
 * The worker validates everything it forwards (bucket enums, refusal reasons), but this client
 * re-validates anyway: un-checked network JSON pre-filling a profile is exactly the class of bug
 * the "AI advises, arithmetic decides" law exists to prevent.
 */
import {
  AI_AGE_BUCKETS,
  AI_BODY_FAT_BANDS,
  AI_BUILDS,
  type AiAgeBucket,
  type AiBodyFatBand,
  type AiBuild,
} from '@fitforge/shared/schemas';
import { coachEndpoint, getPreferredModel } from '@/lib/kb/client';
import { currentIdToken } from '@/lib/auth/firebase';

/* ------------------------------------------------------------------------- shapes */

export type ScanRefusalReason = 'not_person' | 'possible_minor' | 'inappropriate' | 'unreadable';
export type ScanConfidence = 'high' | 'medium' | 'low';
/** What each uploaded photo claims to be — the worker builds its prompt around these labels. */
export type ScanShot = 'front' | 'back' | 'left' | 'right' | 'selfie';

/** The contract's 200 body, verbatim. */
export interface BodyScan {
  ageBucket: AiAgeBucket;
  /** a closed 10 kg band — the worker closes the open ends so a midpoint always exists */
  weightBandKg: { low: number; high: number };
  bodyFatBand: AiBodyFatBand;
  build: AiBuild;
  confidence: { age: ScanConfidence; weight: ScanConfidence; bodyFat: ScanConfidence };
  notes: string[];
  provider?: string;
  model?: string;
}

export type BodyScanResult =
  | { status: 'ok'; scan: BodyScan }
  | { status: 'refused'; reason: ScanRefusalReason }
  | { status: 'timeout' }
  | { status: 'not-configured' }
  | { status: 'error'; detail: string };

/**
 * 45s (contract): one vision round on up to four images, with a possible Workers-AI fallback round
 * behind it — two sequential model calls, each bounded by its slowest.
 */
export const SCAN_TIMEOUT_MS = 45_000;

/* ------------------------------------------------------------------------- validation */

const REFUSAL_REASONS: readonly string[] = ['not_person', 'possible_minor', 'inappropriate', 'unreadable'];

function confidenceOf(v: unknown): ScanConfidence {
  return v === 'high' || v === 'medium' ? v : 'low';
}

function readScan(body: Record<string, unknown>): BodyScan | null {
  const band = body.weightBandKg as { low?: unknown; high?: unknown } | undefined;
  const low = Number(band?.low);
  const high = Number(band?.high);
  if (
    !(AI_AGE_BUCKETS as readonly string[]).includes(String(body.ageBucket)) ||
    !(AI_BODY_FAT_BANDS as readonly string[]).includes(String(body.bodyFatBand)) ||
    !(AI_BUILDS as readonly string[]).includes(String(body.build)) ||
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    low <= 0 ||
    high <= low
  ) {
    return null;
  }
  const conf = (body.confidence ?? {}) as Record<string, unknown>;
  return {
    ageBucket: body.ageBucket as AiAgeBucket,
    weightBandKg: { low, high },
    bodyFatBand: body.bodyFatBand as AiBodyFatBand,
    build: body.build as AiBuild,
    confidence: {
      age: confidenceOf(conf.age),
      weight: confidenceOf(conf.weight),
      bodyFat: confidenceOf(conf.bodyFat),
    },
    notes: Array.isArray(body.notes) ? body.notes.map(String).slice(0, 3) : [],
    provider: typeof body.provider === 'string' ? body.provider.slice(0, 60) : undefined,
    model: typeof body.model === 'string' ? body.model.slice(0, 120) : undefined,
  };
}

/* ------------------------------------------------------------------------- the call */

export interface BodyScanOpts {
  /**
   * One label per image, in order. Omitted = the legacy four-photo order (front, back, left,
   * right); the worker builds a different prompt for a partial set or a lone selfie.
   */
  shots?: ScanShot[];
  /** declared context (contract): passed for the model to USE, never to infer */
  heightCm?: number;
  sex?: 'male' | 'female' | 'other';
  signal?: AbortSignal;
}

/**
 * Send 1–4 prepped data URIs to the worker's `bodyscan` task. Never throws.
 *
 * The images arrive already downscaled + EXIF-stripped by {@link prepareScanImage} and are
 * NEVER stored by this module — they exist here only as function arguments on their way out.
 */
export async function askBodyScan(images: string[], opts: BodyScanOpts = {}): Promise<BodyScanResult> {
  const endpoint = coachEndpoint();
  if (!endpoint) return { status: 'not-configured' };
  if (images.length < 1 || images.length > 4)
    return { status: 'error', detail: 'expected 1-4 images' };
  if (opts.shots && opts.shots.length !== images.length)
    return { status: 'error', detail: 'shots must label each image' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SCAN_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort);

  try {
    const idToken = await currentIdToken();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'bodyscan',
        images,
        ...(opts.shots ? { shots: opts.shots } : {}),
        ...(opts.heightCm ? { heightCm: opts.heightCm } : {}),
        ...(opts.sex ? { sex: opts.sex } : {}),
        ...(getPreferredModel() ? { model: getPreferredModel() } : {}),
        ...(idToken ? { idToken } : {}),
      }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => null)) as
      | ({ error?: string; reason?: string } & Record<string, unknown>)
      | null;

    // 422 = the safety path SUCCEEDING (contract): a validated refusal with a reason enum.
    if (res.status === 422 || body?.error === 'refused') {
      const reason = typeof body?.reason === 'string' && REFUSAL_REASONS.includes(body.reason)
        ? (body.reason as ScanRefusalReason)
        : 'unreadable';
      return { status: 'refused', reason };
    }
    if (!res.ok || !body || body.error) {
      return { status: 'error', detail: body?.error ?? `HTTP ${res.status}` };
    }

    const scan = readScan(body);
    if (!scan) return { status: 'error', detail: 'malformed scan' };
    return { status: 'ok', scan };
  } catch (err) {
    if (timedOut) return { status: 'timeout' };
    if (opts.signal?.aborted) return { status: 'error', detail: 'cancelled' };
    return { status: 'error', detail: String(err).slice(0, 160) };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}
