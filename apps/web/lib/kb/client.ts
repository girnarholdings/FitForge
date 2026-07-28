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

/* ------------------------------------------------------------------------------- local cache */

const CACHE_KEY = 'fitforge.coachCache.v1';
const CACHE_MAX = 40;

interface CacheShape {
  version: 1;
  items: { k: string; answer: string; at: number }[];
}

function fingerprint(question: string, profile: CoachProfile): string {
  const q = question.trim().toLowerCase().replace(/\s+/g, ' ');
  // Stable, order-independent profile digest — the same user asking twice must hit the cache.
  const p = JSON.stringify(
    Object.keys(profile)
      .sort()
      .map((k) => [k, (profile as Record<string, unknown>)[k]]),
  );
  return `${q}::${p}`;
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

export function cachedAnswer(question: string, profile: CoachProfile): string | null {
  const k = fingerprint(question, profile);
  return readCache().items.find((i) => i.k === k)?.answer ?? null;
}

function cacheAnswer(question: string, profile: CoachProfile, answer: string): void {
  const k = fingerprint(question, profile);
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

  const hit = cachedAnswer(question, req.profile);
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
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        snippets: req.snippets.slice(0, MAX_SNIPPETS),
        profile: req.profile,
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

    cacheAnswer(question, req.profile, answer);
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
