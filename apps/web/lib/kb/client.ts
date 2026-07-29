'use client';

/**
 * Coach AI client — the ONLY runtime network call the static export ever makes.
 *
 * Talks to `workers/coach` exactly as that worker specifies: POST `{ question, snippets, profile }`
 * → `{ answer }` on 200, `{ error }` with a 4xx/5xx otherwise. The worker is never modified to
 * suit this client.
 *
 * Contract of this module:
 *  - It NEVER throws. Every failure — unconfigured endpoint, timeout, network, 5xx, malformed
 *    body — comes back as a value in a discriminated union so the UI can stay honest.
 *  - 10 s hard timeout (§3 "Timeouts"), after which the KB answer already on screen stands.
 *  - Successful answers are cached locally by (normalized question + profile fingerprint) so a
 *    repeat question costs nothing and works offline afterwards (§3 fallback ladder, item 3).
 */
import type { CoachProfile, CoachRequest, CoachResult, CoachSnippet, KbHit } from './types';
import { currentIdToken } from '@/lib/auth/firebase';

/** Read literally so Next can inline it at build time (static export — there is no server). */
const AI_ENDPOINT = process.env.NEXT_PUBLIC_AI_ENDPOINT ?? '';

export const AI_TIMEOUT_MS = 10_000;

/** Max KB notes attached as grounding (§3: "top 1–3 … more context degrades small models"). */
const MAX_SNIPPETS = 3;

/** True when a Coach service is configured for this build. */
/**
 * An `http://` endpoint on an `https://` page is DEAD, not merely inadvisable.
 *
 * The browser blocks mixed content before the request leaves, so the fetch rejects with a generic
 * network error and the Coach falls back to the local guide — i.e. it looks exactly like a worker
 * that was never configured, and the deployment appears simply broken with no clue why. This
 * happened on the first real deployment: the endpoint variable was set to `http://…workers.dev`.
 *
 * Treated as UNCONFIGURED rather than silently upgraded to https. Rewriting someone's
 * configuration behind their back is how you end up with a URL that works in the app and nowhere
 * else; refusing it and saying so once in the console keeps the fix where it belongs.
 */
function isBlockedMixedContent(url: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:' && url.startsWith('http://');
}

let warned = false;

export function isCoachConfigured(): boolean {
  const url = AI_ENDPOINT.trim();
  if (url.length === 0) return false;
  if (isBlockedMixedContent(url)) {
    if (!warned) {
      warned = true;
      // Once, not per call: this is read on every render of the Coach screen.
      console.warn(
        `[FitForge] Coach endpoint ${url} uses http:// on an https:// page. The browser will ` +
          'block it as mixed content, so it is being ignored and the local knowledge base will ' +
          'answer instead. Set NEXT_PUBLIC_AI_ENDPOINT (or the AI_ENDPOINT repository variable) ' +
          'to the https:// form.',
      );
    }
    return false;
  }
  return true;
}

export function coachEndpoint(): string | null {
  return isCoachConfigured() ? AI_ENDPOINT.trim() : null;
}

/** Strip ids/aliases/followups — the worker only wants the quoted question + the answer text. */
export function snippetsFromHits(hits: KbHit[]): CoachSnippet[] {
  return hits.slice(0, MAX_SNIPPETS).map((h) => ({
    question: h.entry.question,
    answer: h.entry.answer,
  }));
}

/* --------------------------------------------------------------------------- model preference */

/** One entry of the worker-advertised model catalog (health `models`). */
export interface CoachModelChoice {
  id: string;
  label: string;
  provider: 'mistral' | 'workers-ai';
  /**
   * Costs FitForge's own model allowance, so it is offered to signed-in users only. The picker
   * hides these when signed out; the worker refuses them without a verified token, which is the
   * half that actually protects the capacity.
   */
  requiresAuth?: boolean;
}

const MODEL_PREF_KEY = 'fitforge.coachModel.v1';
const modelPrefListeners = new Set<() => void>();
let modelPrefCache: string | null | undefined;

/**
 * The user's picked model id, or null for "Auto" (the worker's own policy). Stored locally like
 * every other preference; validated by the WORKER against its live catalog on each request, so a
 * stale pick (a retired model, a key that went away) degrades to Auto there rather than erroring
 * here.
 */
export function getPreferredModel(): string | null {
  if (typeof window === 'undefined') return null;
  if (modelPrefCache === undefined) {
    try {
      modelPrefCache = window.localStorage.getItem(MODEL_PREF_KEY);
    } catch {
      modelPrefCache = null;
    }
  }
  return modelPrefCache;
}

export function setPreferredModel(id: string | null): void {
  modelPrefCache = id;
  try {
    if (id) window.localStorage.setItem(MODEL_PREF_KEY, id);
    else window.localStorage.removeItem(MODEL_PREF_KEY);
  } catch {
    /* quota / private mode — the in-memory value still works for this session */
  }
  for (const l of modelPrefListeners) l();
}

export function subscribeModelPref(listener: () => void): () => void {
  modelPrefListeners.add(listener);
  return () => modelPrefListeners.delete(listener);
}

/* ------------------------------------------------------------------------------- local cache */

const CACHE_KEY = 'fitforge.coachCache.v1';
const CACHE_MAX = 40;

interface CacheShape {
  version: 1;
  items: { k: string; answer: string; at: number }[];
}

function fingerprint(question: string, profile: CoachProfile, intent?: string): string {
  const q = `${intent ?? 'chat'}::` + question.trim().toLowerCase().replace(/\s+/g, ' ');
  // Stable, order-independent profile digest — the same user asking twice must hit the cache.
  const p = JSON.stringify(
    Object.keys(profile)
      .sort()
      .map((k) => [k, (profile as Record<string, unknown>)[k]]),
  );
  // The model is part of the key: switching models exists to get a DIFFERENT answer, and a cache
  // hit from the previous model would make the picker look like a no-op.
  return `${q}::${p}::${getPreferredModel() ?? 'auto'}`;
}

function readCache(): CacheShape {
  if (typeof window === 'undefined') return { version: 1, items: [] };
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CacheShape) : null;
    if (parsed?.version === 1 && Array.isArray(parsed.items)) return parsed;
  } catch {
    /* corrupt / private mode — the cache is a nicety, never a hard failure */
  }
  return { version: 1, items: [] };
}

function writeCache(next: CacheShape): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* quota — ignore */
  }
}

export function cachedAnswer(question: string, profile: CoachProfile, intent?: string): string | null {
  const k = fingerprint(question, profile, intent);
  return readCache().items.find((i) => i.k === k)?.answer ?? null;
}

function cacheAnswer(question: string, profile: CoachProfile, answer: string, intent?: string): void {
  const k = fingerprint(question, profile, intent);
  const cache = readCache();
  const items = [{ k, answer, at: Date.now() }, ...cache.items.filter((i) => i.k !== k)];
  writeCache({ version: 1, items: items.slice(0, CACHE_MAX) });
}

/* ------------------------------------------------------------------------------- the call */

/**
 * Ask the Coach service. Resolves with a `CoachResult` in every case.
 *
 * @param external an optional caller signal (component unmount) — merged with the 10 s timeout.
 */
export async function askCoach(req: CoachRequest, external?: AbortSignal): Promise<CoachResult> {
  const endpoint = coachEndpoint();
  if (!endpoint) return { status: 'not-configured' };

  const question = req.question.trim();
  if (!question) return { status: 'error', detail: 'empty question' };

  const hit = cachedAnswer(question, req.profile, req.intent);
  if (hit) return { status: 'ok', answer: hit };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AI_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort);

  try {
    // Proof of sign-in, when there is any. The worker verifies it and unlocks the members-only
    // model; without it the request is served by the free tier, which is the correct default.
    const idToken = await currentIdToken();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        snippets: req.snippets.slice(0, MAX_SNIPPETS),
        profile: req.profile,
        ...(req.intent ? { intent: req.intent } : {}),
        ...(getPreferredModel() ? { model: getPreferredModel() } : {}),
        ...(idToken ? { idToken } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        /* non-JSON error body */
      }
      return { status: 'error', detail };
    }

    const body = (await res.json()) as { answer?: string; error?: string };
    if (body?.error) return { status: 'error', detail: body.error };
    const answer = (body?.answer ?? '').trim();
    if (!answer) return { status: 'error', detail: 'empty_response' };

    cacheAnswer(question, req.profile, answer, req.intent);
    return { status: 'ok', answer };
  } catch (err) {
    if (timedOut) return { status: 'timeout' };
    if (external?.aborted) return { status: 'error', detail: 'cancelled' };
    return { status: 'error', detail: String(err).slice(0, 160) };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

/* ------------------------------------------------------------------------------ live status */

export interface CoachStatus {
  online: boolean;
  provider?: string;
  model?: string;
  /** The worker-advertised model catalog. Absent on workers that predate the picker. */
  models?: CoachModelChoice[];
}

/** Shape-validate the health payload's catalog — a foreign body, never trusted into the UI raw. */
export function parseModels(raw: unknown): CoachModelChoice[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CoachModelChoice[] = [];
  for (const m of raw) {
    const c = m as CoachModelChoice;
    if (
      c &&
      typeof c.id === 'string' &&
      c.id.length > 0 &&
      c.id.length <= 120 &&
      typeof c.label === 'string' &&
      c.label.length > 0 &&
      (c.provider === 'mistral' || c.provider === 'workers-ai')
    ) {
      out.push({
        id: c.id,
        label: c.label.slice(0, 60),
        provider: c.provider,
        requiresAuth: c.requiresAuth === true,
      });
    }
  }
  return out.length > 0 ? out.slice(0, 12) : undefined;
}

const STATUS_KEY = 'fitforge.coachStatus.v1';
const STATUS_TTL_MS = 60 * 60 * 1000;

/**
 * Probe the worker's health check (GET — costs no inference) so the Coach screen can show a live
 * "AI online" presence instead of asserting configuration equals availability. Cached in
 * sessionStorage for an hour: the status chip is ambience, not telemetry.
 */
export async function fetchCoachStatus(): Promise<CoachStatus | null> {
  const endpoint = coachEndpoint();
  if (!endpoint) return null;

  try {
    const raw = window.sessionStorage.getItem(STATUS_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { at: number; status: CoachStatus };
      if (Date.now() - cached.at < STATUS_TTL_MS) return cached.status;
    }
  } catch {
    /* corrupt cache — fall through to the network */
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(endpoint, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      provider?: string;
      model?: string;
      models?: unknown;
    } | null;
    const status: CoachStatus = body?.ok
      ? { online: true, provider: body.provider, model: body.model, models: parseModels(body.models) }
      : { online: false };
    try {
      window.sessionStorage.setItem(STATUS_KEY, JSON.stringify({ at: Date.now(), status }));
    } catch {
      /* quota */
    }
    return status;
  } catch {
    return { online: false };
  }
}
