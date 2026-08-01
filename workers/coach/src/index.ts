/**
 * FitForge Coach — Cloudflare Worker (Mistral-preferred, Workers AI fallback).
 *
 * Called DIRECTLY by the static web app (no proxy in between): the browser POSTs to this
 * worker, the worker calls the model, and returns a short grounded answer — or, for the
 * `macros` task, a consensus nutrition estimate.
 *
 * Design constraints that matter here:
 *  - The models are small/free instruct models, so the harness does the heavy lifting: every
 *    request carries an intent-matched system prompt with an explicit OUTPUT SHAPE, retrieved
 *    knowledge-base snippets are supplied as trusted reference notes, the user's onboarding
 *    profile is a labeled block, and generation is tightly capped. A free model given a strong
 *    template follows it; given freedom it rambles.
 *  - The app NEVER depends on this worker: if it is unreachable, the client falls back to
 *    its local knowledge base. So failures here must be fast and explicit, not hangs.
 *  - The only secret is the optional MISTRAL_API_KEY, and it lives here and nowhere else:
 *    the web app is a static export, so anything given to it is inlined into JavaScript every
 *    visitor downloads. A key in the bundle is a key published.
 */
import { verifyFirebaseToken } from './firebaseAuth';

export interface Env {
  /**
   * Workers AI. Present whenever the `[ai]` binding is declared in wrangler.toml — no key needed,
   * because the binding authorises against the account that owns the worker.
   */
  AI?: {
    run: (
      model: string,
      input: Record<string, unknown>,
    ) => Promise<{ response?: string } | ReadableStream>;
  };
  ALLOWED_ORIGINS?: string;
  MODEL?: string;
  /**
   * Mistral API key, as a Cloudflare SECRET (`wrangler secret put MISTRAL_API_KEY`, or Settings →
   * Variables → Add → Encrypt). THE KEY MUST LIVE HERE AND NOWHERE ELSE — see the file header.
   */
  MISTRAL_API_KEY?: string;
  /**
   * The Firebase project whose ID tokens this worker trusts, e.g. "fitforge-app". A plain var,
   * not a secret — it is public by nature (it ships in the web app's config). Unset means no
   * token can ever be verified, so the company model stays reserved and everyone gets the free
   * tier: the safe direction to fail.
   */
  FIREBASE_PROJECT_ID?: string;
  /** Overrides the default Mistral model. Ignored unless MISTRAL_API_KEY is set. */
  MISTRAL_MODEL?: string;
  /**
   * DeepSeek API key — the PRO tier. Readable from either a Cloudflare secret or a wrangler.toml
   * var (both surface identically on `env`); prefer `wrangler secret put DEEPSEEK_API_KEY` —
   * this repo is public, so a literal value committed in wrangler.toml is a published key.
   * The Mistral/Workers-AI configuration is untouched by this tier existing.
   */
  DEEPSEEK_API_KEY?: string;
  /** Overrides the default DeepSeek model. Ignored unless DEEPSEEK_API_KEY is set. */
  DEEPSEEK_MODEL?: string;
  /**
   * Comma-separated Firebase uids with a Pro subscription, e.g. "abc123, def456". The DeepSeek
   * entry unlocks ONLY for these verified uids — sign-in alone is not enough. There is no billing
   * system yet, so this allowlist IS the subscription record; swap it for a claims check when one
   * exists.
   */
  PRO_USERS?: string;
}

/**
 * The Pro allowlist, parsed: trimmed, blanks dropped. ONE reader, so the health read-out and the
 * gate can never disagree about how many people are entitled — a diagnostic that counts differently
 * from the check it describes is worse than no diagnostic.
 */
function proUids(env: Env): string[] {
  if (!env.PRO_USERS) return [];
  return env.PRO_USERS.split(',')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

/** Is this verified uid on the Pro allowlist? Whitespace-tolerant, case-sensitive (uids are). */
function isProUser(env: Env, uid: string | null): boolean {
  if (!uid) return false;
  return proUids(env).includes(uid);
}

/* ══════════════════════════════════════════════════════════════════ generation caps ══ */

/**
 * Hard caps — a weak model rambles without them, and long answers hurt on a phone.
 * 320 rather than the old 200: the markdown output contract (bold + bullets + a "Next:" line)
 * genuinely costs tokens, and clipping mid-bullet reads worse than a slightly longer answer.
 */
const MAX_TOKENS = 320;
const TEMPERATURE = 0.25;
const MAX_QUESTION_CHARS = 500;
const MAX_SNIPPET_CHARS = 1600;
const MAX_PROFILE_CHARS = 600;

/** Macro estimation: shorter, JSON-only, and sampled at three temperatures (see below). */
const MACRO_MAX_TOKENS = 220;
const MACRO_TEMPS = [0.2, 0.55, 0.9] as const;
const MAX_FOOD_CHARS = 140;

/* ═══════════════════════════════════════════════════════════════ Workers AI chain ══ */

/**
 * WORKERS AI MODEL CHAIN — tried in order, first one that answers wins.
 *
 * This is a chain rather than a constant because of exactly how this worker broke. It was pinned to
 * `@cf/meta/llama-3.1-8b-instruct`; Cloudflare retired that model on 2026-05-30; every request from
 * that day on returned:
 *
 *     AiError: 5028: This model was deprecated on 2026-05-30. Please use an alternative model.
 *
 * Nothing in the worker, the account, the binding or the deployment changed — the model was
 * withdrawn underneath it, and a one-line constant turned that into total, silent failure. Swapping
 * in a different name would only reset the same timer, so a retirement now costs one skipped
 * candidate instead of an outage.
 *
 * The order is deliberate: strongest first, then progressively smaller and cheaper, and the families
 * are deliberately mixed (Meta, Mistral, Google) so that one vendor's generation being retired
 * wholesale still leaves something live. `MODEL`, if set, is tried ahead of all of them.
 */
const WORKERS_AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/google/gemma-3-12b-it',
] as const;

const DEFAULT_MODEL = WORKERS_AI_MODELS[0];

/** The chain for this environment: an explicit `MODEL` first, then the defaults, deduplicated. */
function workersAiModels(env: Env): string[] {
  const pinned = env.MODEL?.trim();
  const chain = pinned ? [pinned, ...WORKERS_AI_MODELS] : [...WORKERS_AI_MODELS];
  return [...new Set(chain)];
}

/* ═══════════════════════════════════════════════════ the user-facing model catalog ══ */

/**
 * One entry the client may offer in its model picker. `label` is the human name — the raw
 * `@cf/meta/...` ids read as plumbing, and the picker exists for people who just want "the fast
 * one" or "the one my key pays for".
 */
export interface ModelChoice {
  id: string;
  label: string;
  provider: 'mistral' | 'workers-ai' | 'deepseek';
  /**
   * This entry costs the COMPANY's Mistral allowance, so it is offered to signed-in users only.
   * The client hides it when signed out; {@link resolvePreferred} refuses it without a verified
   * Firebase token, which is the half that actually holds.
   */
  requiresAuth?: boolean;
  /**
   * Pro-subscription entry (the DeepSeek key). Stricter than `requiresAuth`: the verified uid
   * must also be on {@link Env.PRO_USERS}. Enforced in {@link resolvePreferred} — the client
   * label is decoration, this check is the gate.
   */
  requiresPro?: boolean;
}

const WORKERS_AI_LABELS: Record<string, string> = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': 'Llama 3.3 70B · fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout 17B',
  '@cf/mistralai/mistral-small-3.1-24b-instruct': 'Mistral Small 3.1 24B',
  '@cf/google/gemma-3-12b-it': 'Gemma 3 12B',
};

/**
 * WHAT THE PICKER MAY OFFER, decided by the worker's own configuration: the Mistral entry exists
 * only while MISTRAL_API_KEY does (it is the one non-free option, paid for by the deployer's
 * key), and the Workers AI entries are the free chain this account can already run. The client
 * renders whatever this returns and nothing else, so a stale client can never offer a backend
 * the worker cannot honour.
 */
function modelCatalog(env: Env): ModelChoice[] {
  const out: ModelChoice[] = [];
  // The Pro tier: DeepSeek, unlocked per-uid. Listed only when the key exists AND sign-ins can be
  // verified — a pro gate with no way to verify anyone would be an entry nobody can ever use.
  if (env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY.trim().length > 0 && env.FIREBASE_PROJECT_ID) {
    const id = env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL;
    out.push({
      id,
      label: id === DEFAULT_DEEPSEEK_MODEL ? 'DeepSeek V4 · Pro' : `${id} · Pro`,
      provider: 'deepseek',
      requiresAuth: true,
      requiresPro: true,
    });
  }
  if (env.MISTRAL_API_KEY && env.MISTRAL_API_KEY.trim().length > 0) {
    const id = env.MISTRAL_MODEL ?? DEFAULT_MISTRAL_MODEL;
    out.push({
      // NOT "your API key" — the key belongs to FitForge, not to the person reading the label,
      // and calling it theirs would be a small lie that invites "where do I put mine?".
      id,
      label: id === DEFAULT_MISTRAL_MODEL ? 'Mistral Small' : id,
      provider: 'mistral',
      // GATED ONLY WHEN THE GATE IS MEANINGFUL — which takes two things, and neither is optional:
      //
      //  1. A FREE TIER TO FALL BACK TO (`env.AI`). The gate exists to keep anonymous traffic off
      //     the company's paid allowance so signed-in users are unaffected when the free tier runs
      //     out. On a worker with no AI binding there is nothing to fall back to, so gating would
      //     leave guests with no backend at all: an outage, not protection.
      //
      //  2. A WAY TO BE LET THROUGH (`env.FIREBASE_PROJECT_ID`). Without a project id no token can
      //     ever be verified, so "members only" would mean "nobody, ever" — the paid key sits
      //     unused while every request takes the weaker model. A lock with no key cut for it is
      //     not security, it is a wall.
      //
      // Both present: guests get Workers AI, signed-in users get Mistral. Either absent: Mistral
      // serves everyone, exactly as it did before accounts existed.
      requiresAuth: gateActive(env),
    });
  }
  if (env.AI) {
    for (const id of workersAiModels(env)) {
      out.push({ id, label: WORKERS_AI_LABELS[id] ?? id.split('/').pop()!, provider: 'workers-ai' });
    }
  }
  return out;
}

/**
 * Is the members-only gate switched on for this deployment? See the reasoning in
 * {@link modelCatalog}: it needs both a free tier to reserve capacity FROM and a verifiable
 * sign-in to let members THROUGH.
 */
function gateActive(env: Env): boolean {
  return !!env.AI && !!env.FIREBASE_PROJECT_ID;
}

/** The catalog as a given caller may use it: gated entries drop out when nobody is signed in,
 *  and pro entries additionally drop out for signed-in users who are not on the allowlist. */
function catalogFor(env: Env, signedIn: boolean, pro = false): ModelChoice[] {
  return modelCatalog(env).filter(
    (m) => (signedIn || !m.requiresAuth) && (pro || !m.requiresPro),
  );
}

/**
 * A client-requested model, accepted ONLY if it is in the catalog. A whitelist, not a passthrough:
 * the request body is attacker-controlled, and this is the line that keeps it from steering the
 * worker at arbitrary (billable) model ids or at backends it is not configured for. An unknown id
 * quietly resolves to "no preference" — the stale-client case, not an error.
 */
function resolvePreferred(
  env: Env,
  raw: unknown,
  signedIn: boolean,
  pro = false,
): ModelChoice | undefined {
  if (typeof raw !== 'string') return undefined;
  const id = raw.trim();
  if (!id) return undefined;
  // catalogFor, not modelCatalog: a signed-out caller asking for the gated model — or a non-pro
  // caller asking for the DeepSeek entry — gets `undefined` and therefore the default policy,
  // exactly as if they had asked for a model that never existed.
  return catalogFor(env, signedIn, pro).find((m) => m.id === id);
}

/**
 * Does this error mean "that model is gone", as opposed to "inference failed"?
 *
 * The distinction decides whether trying the next candidate is worth an inference call. A retired or
 * misspelled model fails identically for every request, so moving on is the only way forward; a
 * timeout or a quota rejection would fail the same way on the next model too, and retrying the whole
 * chain would multiply one user's failed request into four.
 *
 * Cloudflare surfaces these as codes inside the message (5028 deprecated, 5007 no such model), so
 * the codes are matched first and the prose second, since the prose is theirs to reword.
 */
function isModelUnavailable(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return /\b(5028|5007)\b/.test(msg) || /deprecat|no such model|model not found|unknown model/i.test(msg);
}

interface GenOpts {
  temperature: number;
  maxTokens: number;
}

/** One prior exchange, replayed so a follow-up question can mean what it says. */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Hard caps on replayed context — the models here are small and a long tail degrades them. */
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 700;

/**
 * Sanitise client-supplied history.
 *
 * It arrives from the browser, so it is input, not memory: roles are whitelisted, content is
 * clamped, and only the most recent exchanges survive. The clamp is not only about abuse — a free
 * instruct model given four long turns of its own prose starts answering the history instead of
 * the question.
 */
function normalizeHistory(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES)) {
    const msg = m as { role?: unknown; content?: unknown };
    if (msg?.role !== 'user' && msg?.role !== 'assistant') continue;
    if (typeof msg.content !== 'string') continue;
    const content = msg.content.trim().slice(0, MAX_HISTORY_CHARS);
    if (content) out.push({ role: msg.role, content });
  }
  return out;
}

/**
 * One part of a multimodal user message. Text-only tasks keep passing a plain string; the
 * bodyscan task passes an array of parts so photos ride inside the same chat-completions
 * request every other task already uses. The object form of `image_url` is the one every
 * SDK emits, so it is the one sent.
 */
export type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** The messages array: system, the conversation so far, then what was just asked. */
function messagesFor(system: string, user: string | UserContentPart[], history: HistoryMessage[]) {
  return [
    { role: 'system' as const, content: system },
    ...history,
    { role: 'user' as const, content: user },
  ];
}

/**
 * Run the chain. Returns the answer together with the model that actually produced it, so the
 * response and the health check report reality rather than the first name in the list.
 */
async function askWorkersAI(
  env: Env,
  system: string,
  user: string,
  opts: GenOpts,
  /** A catalog-validated model to try FIRST; the normal chain still backs it up. */
  first?: string,
  history: HistoryMessage[] = [],
): Promise<
  { ok: true; answer: string; model: string } | { ok: false; status: number; detail: string }
> {
  const tried: string[] = [];
  const chain = first ? [...new Set([first, ...workersAiModels(env)])] : workersAiModels(env);
  for (const model of chain) {
    try {
      const result = (await env.AI!.run(model, {
        messages: messagesFor(system, user, history),
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      })) as { response?: unknown };
      // THE LIVE BINDING'S TYPE LIE, learned in production: when a prompt demands pure JSON,
      // some Workers AI models return `response` as an ALREADY-PARSED OBJECT, not a string —
      // the stubbed tests never showed it, and the first macros request against the real edge
      // died on `text.replace is not a function`. Normalize at the boundary where the foreign
      // type enters: an object is re-serialized, and the macros parser parses it right back.
      const raw = result?.response;
      const answer = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
      return { ok: true, answer, model };
    } catch (err) {
      tried.push(`${model}: ${String(err instanceof Error ? err.message : err).slice(0, 120)}`);
      // Anything that is not "this model is gone" would fail identically on the next candidate.
      if (!isModelUnavailable(err)) break;
    }
  }
  return {
    ok: false,
    status: 503,
    detail: `No Workers AI model answered. Tried — ${tried.join(' | ')}`.slice(0, 400),
  };
}

/* ═══════════════════════════════════════════════════════════════════════ Mistral ══ */

/**
 * Mistral's small instruct model. Cheap, fast, and far stronger than the free Workers AI tier at
 * following the rules in the system prompt — which is most of what quality means here, since the
 * answer is meant to come from the supplied reference notes rather than the model's own memory.
 */
const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

/* ═══════════════════════════════════════════════════════════════════════ DeepSeek ══ */

/**
 * The PRO tier. DeepSeek's chat API is OpenAI-shaped — same messages array, same response
 * envelope, same bearer auth — so this is `askMistral` with a different URL and key.
 *
 * `deepseek-v4-flash`, NOT `deepseek-chat`: the legacy aliases (`deepseek-chat`,
 * `deepseek-reasoner`) were fully retired on 2026-07-24 and now return errors. Current IDs are
 * `deepseek-v4-flash` (default — fast, cheap, 1M context) and `deepseek-v4-pro` (set via
 * DEEPSEEK_MODEL when the bill is acceptable). DeepSeek publishes no fixed rate limits; it
 * throttles dynamically with 429s and slow first tokens, which the 20s abort already covers.
 */
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

async function askDeepSeek(
  env: Env,
  model: string,
  system: string,
  user: string,
  opts: GenOpts,
  history: HistoryMessage[] = [],
): Promise<{ ok: true; answer: string } | { ok: false; status: number; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: messagesFor(system, user, history),
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const detail =
        res.status === 401
          ? 'DeepSeek rejected the API key (401). Check DEEPSEEK_API_KEY on this worker.'
          : `DeepSeek returned ${res.status}: ${body.slice(0, 160)}`;
      return { ok: false, status: res.status === 401 ? 500 : 503, detail };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true, answer: data.choices?.[0]?.message?.content ?? '' };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: 503,
      detail: aborted ? 'DeepSeek did not respond within 20s' : String(err).slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Which backend a given environment resolves to. Mistral wins when its key is present. */
function providerFor(env: Env): 'mistral' | 'workers-ai' | 'none' {
  if (env.MISTRAL_API_KEY && env.MISTRAL_API_KEY.trim().length > 0) return 'mistral';
  if (env.AI) return 'workers-ai';
  return 'none';
}

function modelFor(env: Env): string {
  return providerFor(env) === 'mistral'
    ? (env.MISTRAL_MODEL ?? DEFAULT_MISTRAL_MODEL)
    : (env.MODEL ?? DEFAULT_MODEL);
}

/**
 * Call Mistral's chat-completions endpoint. Same message shape as Workers AI, different transport.
 *
 * The timeout is not optional. This worker is called directly by a browser that is showing a
 * spinner, and the client gives up eventually — a request left hanging on Mistral's side would
 * hold a worker invocation open long after anyone is waiting for it.
 */
async function askMistral(
  env: Env,
  system: string,
  // A plain string for text tasks; content PARTS (text + images) for the bodyscan task. The
  // endpoint and envelope are identical either way — images ride inside the user message.
  user: string | UserContentPart[],
  opts: GenOpts,
  history: HistoryMessage[] = [],
): Promise<{ ok: true; answer: string } | { ok: false; status: number; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelFor(env),
        messages: messagesFor(system, user, history),
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 401 is the one worth distinguishing by hand: it is always the key, and every other
      // explanation sends the reader looking in the wrong place.
      const detail =
        res.status === 401
          ? 'Mistral rejected the API key (401). Check MISTRAL_API_KEY is set as a secret on this worker.'
          : `Mistral returned ${res.status}: ${body.slice(0, 160)}`;
      return { ok: false, status: res.status === 401 ? 500 : 503, detail };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true, answer: data.choices?.[0]?.message?.content ?? '' };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: 503,
      detail: aborted ? 'Mistral did not respond within 20s' : String(err).slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One generation through whichever backend this environment resolves to, with the documented
 * degradation: Mistral is preferred, not required — when its key expires or it has an incident and
 * the AI binding also exists, the request degrades to a weaker answer rather than to no answer.
 * Every caller (chat and each macro sample alike) goes through here, so the fallback policy can
 * never diverge between features.
 */
async function generateOnce(
  env: Env,
  system: string,
  user: string,
  opts: GenOpts,
  /**
   * A catalog-validated user preference (see {@link resolvePreferred}). A workers-ai pick SKIPS
   * Mistral on purpose — choosing a free model must mean the paid key is not spent — while a
   * mistral pick keeps the free chain as its safety net, same as the default policy.
   */
  preferred?: ModelChoice,
  /** A verified Firebase user, or false. Decides whether Mistral is on the table AT ALL. */
  signedIn = false,
  /** The conversation so far, already sanitised, so a follow-up can refer to what was said. */
  history: HistoryMessage[] = [],
): Promise<
  | { ok: true; answer: string; provider: 'mistral' | 'workers-ai' | 'deepseek'; model: string }
  | { ok: false; status: number; detail: string }
> {
  /**
   * THE PRO PICK, FIRST. `preferred` only ever carries a deepseek entry after `resolvePreferred`
   * confirmed the verified uid is on the allowlist — an unverified or non-pro caller cannot reach
   * this branch by construction. On a DeepSeek failure the request degrades into the exact same
   * Mistral/Workers-AI policy every other request gets: a pro user's question is never worth less
   * than a guest's because the premium backend had an incident.
   */
  if (preferred?.provider === 'deepseek') {
    const r = await askDeepSeek(env, preferred.id, system, user, opts, history);
    if (r.ok) return { ok: true, answer: r.answer, provider: 'deepseek', model: preferred.id };
  }

  const provider = providerFor(env);
  if (provider === 'none') {
    return {
      ok: false,
      status: 500,
      detail:
        'No AI backend configured. Add the Workers AI binding named AI, or set the ' +
        'MISTRAL_API_KEY secret on this worker.',
    };
  }

  /**
   * THE GATE, APPLIED TO THE DEFAULT PATH TOO — which is the whole point and the easy thing to
   * get wrong. Reserving Mistral only when a user explicitly picks it would leave every anonymous
   * "Auto" request spending the company allowance, i.e. the exact bill the gate exists to prevent,
   * because Auto is what almost everyone uses. A signed-out visitor is served by Workers AI on
   * every path. (`!env.AI` — no free tier to fall back to — is covered in `modelCatalog`.)
   */
  const mayUseMistral = signedIn || !gateActive(env);
  const forceWorkersAi = (preferred?.provider === 'workers-ai' || !mayUseMistral) && !!env.AI;

  if (provider === 'mistral' && !forceWorkersAi) {
    const r = await askMistral(env, system, user, opts, history);
    if (r.ok) return { ok: true, answer: r.answer, provider: 'mistral', model: modelFor(env) };
    if (env.AI) {
      const fallback = await askWorkersAI(env, system, user, opts, undefined, history);
      if (fallback.ok)
        return { ok: true, answer: fallback.answer, provider: 'workers-ai', model: fallback.model };
      return {
        ok: false,
        status: r.status,
        detail: `${r.detail} — and Workers AI: ${fallback.detail}`,
      };
    }
    return r;
  }

  // Only an explicit workers-ai PICK names a first model. `forceWorkersAi` is also true for every
  // signed-out request, where there is no pick at all — reading `preferred.id` off that path threw.
  const firstModel = preferred?.provider === 'workers-ai' ? preferred.id : undefined;
  const r = await askWorkersAI(env, system, user, opts, firstModel, history);
  if (!r.ok) return r;
  return { ok: true, answer: r.answer, provider: 'workers-ai', model: r.model };
}

/* ══════════════════════════════════════════════════════════ the chat prompt library ══ */

interface ChatRequest {
  question?: string;
  /** Client-declared intent. Only 'personalize' and 'meal' are trusted; everything else is classified here. */
  intent?: string;
  /** The user's model pick from the catalog the health check advertised. Whitelisted, never trusted. */
  model?: string;
  /** Firebase ID token, when the user is signed in. Verified here; absence just means "guest". */
  idToken?: string;
  /**
   * The conversation so far, oldest first, so "why?" and "what about dumbbells?" mean something.
   * The client trims it and drops it on a topic change; this worker clamps it again regardless.
   */
  history?: { role?: string; content?: string }[];
  /** Retrieved KB entries the client already matched (top ~3), used as grounding. */
  snippets?: { question: string; answer: string }[];
  /** The user's onboarding-derived context. Never contains identifying data beyond a name. */
  profile?: {
    goal?: string;
    experience?: string;
    split?: string;
    days_per_week?: number;
    equipment?: string[];
    kcal_target?: number;
    protein_target?: number;
    exclusions?: string[];
  };
}

type Intent =
  | 'volume'
  | 'technique'
  | 'nutrition'
  | 'progression'
  | 'recovery'
  | 'motivation'
  | 'personalize'
  | 'meal'
  | 'general';

/**
 * INTENT CLASSIFICATION — regex, deliberately.
 *
 * The obvious alternative is asking the model to classify, which costs a full inference round-trip
 * before the real one and hands a free model a chance to be wrong invisibly. These patterns route
 * the question to a TEMPLATE, not to an answer — a misroute still lands on the `general` frame,
 * which is a strictly-correct superset. Order matters: `meal` outranks `nutrition` (both mention
 * eating), and `technique` outranks `volume` ("how do I squat" vs "how many sets").
 */
const INTENT_HINTS: [Intent, RegExp][] = [
  ['meal', /\b(what (should|can|do) i eat|meal|snack|breakfast|lunch|dinner|hungry|recipe)\b/i],
  [
    'technique',
    /\b(form|technique|cues?|how (do|to) (i )?(do|perform|squat|deadlift|bench|press|row|curl|lunge|hinge)|depth|grip|stance|lockout|knee[s]? cav|butt wink)\b/i,
  ],
  ['progression', /\b(plateau|stuck|stall(ed|ing)?|add(ing)? weight|increase|progress(ing|ion)?|overload|deload|1rm|new pr)\b/i],
  ['volume', /\b(sets?|reps?|volume|frequency|how (many|often)|times (a|per) week)\b/i],
  ['nutrition', /\b(protein|calorie|kcal|macros?|carbs?|fats?\b|deficit|surplus|cutting|bulking|creatine|supplement)\b/i],
  ['recovery', /\b(sore(ness)?|doms|recover(y)?|rest day|sleep|overtrain(ing|ed)?|fatigue|tired)\b/i],
  ['motivation', /\b(motivat(e|ion|ed)?|consisten(t|cy)|habit|lazy|skipp?(ed|ing)?|bored|discipline)\b/i],
];

function classifyIntent(question: string, hint?: string): Intent {
  if (hint === 'personalize' || hint === 'meal') return hint;
  for (const [intent, re] of INTENT_HINTS) if (re.test(question)) return intent;
  return 'general';
}

/**
 * THE PROMPT LIBRARY. Each intent contributes a FOCUS (what this question type is really asking)
 * and an ANSWER SHAPE (the exact output skeleton). Free models are template followers: given the
 * skeleton they fill it; given prose rules alone they drift. The shapes all end in a bold
 * "**Next:**" action line because a coach's answer is a prescription, not an essay.
 */
/**
 * Per-intent coaching prompts — REFINED BY PANEL (see docs/PROMPTS-COACH.md for the method
 * and the judged alternatives). Two load-bearing choices, both judge-verified against small
 * instruct models:
 *   · every shape restates 'Whole reply under 110 words' LOCALLY — small models obey the rule
 *     nearest the output instruction far more reliably than a global cap two blocks away;
 *   · every focus routes its own danger zone to SAFETY by name (pain mid-technique,
 *     supplements mid-nutrition, medical diets mid-meal), so the escape hatch is in the
 *     intent the question actually arrives through.
 */
const INTENT_PROMPTS: Record<Intent, { focus: string; shape: string }> = {
  volume: {
    focus:
      'This is a training-volume question (sets, reps, frequency). Take the landmarks from the REFERENCE NOTES and scale them to this user\'s experience and days per week — a beginner on 3 days gets lower numbers than an advanced lifter on 6. Recommend the volume they can recover from and repeat every week.',
    shape:
      '- One lead sentence stating the number or range in **bold**.\n' +
      '- 2–3 bullets ("- ") applying it to their split, experience, and days per week.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + the one change to make in their next session.',
  },
  technique: {
    focus:
      'This is a form/technique question. Give the fewest cues that fix the most — an athlete mid-set can hold three words, not a paragraph. Pick cues that also protect the joints involved, so the lift stays safe for years. If they mention pain during the movement, follow SAFETY instead of coaching through it.',
    shape:
      '- At most 3 cue bullets ("- "), each a short imperative with the key word in **bold**.\n' +
      '- One bullet starting "- **Avoid:**" naming the most common mistake.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + how to practice it (e.g. which warm-up set to use).',
  },
  nutrition: {
    focus:
      'This is a nutrition question. Their personal targets are in the USER PROFILE — use those exact numbers, not generic ones. Ranges from the REFERENCE NOTES beat memory. Recommend the habit they can repeat every day over the perfect single day. Supplements, medications, and medical conditions go to SAFETY, not coaching.',
    shape:
      '- One lead sentence with their relevant target in **bold**.\n' +
      '- 2 bullets ("- ") on how to hit it with normal food.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + one concrete food or habit change for today.',
  },
  progression: {
    focus:
      'This is a progression/plateau question. A plateau is information: check whether sleep, food, stress, or missed sessions explain it before changing the program. Name the rule that applies, then prescribe exact numbers for the next session. Use a deload when fatigue explains the stall.',
    shape:
      '- One sentence naming the rule in play or the likely cause of the stall.\n' +
      '- 1–2 bullets ("- ") with the exact next-session prescription in **bold** (weight, reps, or deload), plus one clause on what the next 2–3 weeks should look like.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + the single thing to do at the next workout.',
  },
  recovery: {
    focus:
      'This is a recovery question. Say plainly whether this is a normal training response, without diagnosing. Sleep and food move recovery more than any gadget. If fatigue has lasted more than a week, cut this week\'s training volume rather than pushing through. Pain, injury, illness, or medication goes to SAFETY.',
    shape:
      '- One sentence saying whether this is normal, in plain words.\n' +
      '- 2 bullets ("- ") with the highest-leverage recovery actions (usually **sleep** and **food**), key terms in **bold**.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + one recovery action for tonight.',
  },
  motivation: {
    focus:
      'This is an adherence/motivation question. Be warm and brief — tactics beat pep talks. A missed workout is information about their schedule or the plan, not a character flaw: shrink the commitment so the plan fits their real week, and protect the habit over any single session.',
    shape:
      '- One warm sentence acknowledging it and noting the streak that matters is **weeks**, not days.\n' +
      '- 2 bullets ("- ") with concrete tactics (e.g. **shortest-session rule**, fixed training days), one aimed at the likely cause (schedule, session length, sleep).\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + the smallest possible action today.',
  },
  personalize: {
    focus:
      'The user is reading a general answer from the app\'s guide (it is in the REFERENCE NOTES) and asked to have it personalized. Do NOT repeat the general answer — translate it into their situation using every relevant fact in the USER PROFILE, sized to their experience level. If a fact you need is missing, name it instead of guessing.',
    shape:
      '- First line: "**For you:**" followed by one tailored sentence.\n' +
      '- 3 bullets ("- "), each tying ONE profile fact (goal, experience, equipment, targets, exclusions) to ONE specific adjustment, numbers in **bold**.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + the single action that applies it.',
  },
  meal: {
    focus:
      'The user wants meal ideas that fit their remaining targets for today (in the USER PROFILE and question). Real food with normal ingredients, meals they could repeat any week, and respect any exclusions or diet noted. If remaining targets are not given anywhere, say your numbers are estimates. Medical diets go to SAFETY.',
    shape:
      '- 2–3 bullets ("- "), each: "**Meal name** — ~**N kcal**, **N g** protein" plus a clause on why it fits their remaining targets.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + which one to make now.',
  },
  general: {
    focus:
      'Answer only the question asked, grounded in the REFERENCE NOTES when they cover it, and sized to the user\'s experience level from the USER PROFILE. When the answer is advice, connect it to their goal or current training in one short clause so it lands as coaching, not trivia.',
    shape:
      '- 2–4 short sentences, or up to 4 bullets ("- "), key numbers and exercise names in **bold**.\n' +
      '- Whole reply under 110 words.\n' +
      '- Final line: "**Next:** " + one concrete action, ONLY if the answer is advice (skip it for pure definitions).',
  },
};

function clamp(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

/** Build the system prompt. Slots with no value are omitted rather than left blank. */
function buildSystemPrompt(req: ChatRequest, intent: Intent, hasHistory = false): string {
  const p = req.profile ?? {};
  const profileLines: string[] = [];
  if (p.goal) profileLines.push(`- Goal: ${p.goal}`);
  if (p.experience) profileLines.push(`- Experience: ${p.experience}`);
  if (p.split || p.days_per_week) {
    const bits = [p.split ? `${p.split} split` : null, p.days_per_week ? `${p.days_per_week} days/week` : null]
      .filter(Boolean)
      .join(', ');
    profileLines.push(`- Training: ${bits}`);
  }
  if (p.equipment?.length) profileLines.push(`- Equipment: ${p.equipment.slice(0, 20).join(', ')}`);
  const targets = [
    p.kcal_target ? `${p.kcal_target} kcal` : null,
    p.protein_target ? `${p.protein_target} g protein` : null,
  ]
    .filter(Boolean)
    .join(', ');
  if (targets) profileLines.push(`- Targets: ${targets}`);
  if (p.exclusions?.length)
    profileLines.push(`- Excluded exercises / limitations: ${p.exclusions.slice(0, 15).join(', ')}`);

  const profileBlock = profileLines.length
    ? `USER PROFILE\n${clamp(profileLines.join('\n'), MAX_PROFILE_CHARS)}`
    : '';

  const snippets = (req.snippets ?? []).slice(0, 3);
  const notes = snippets.length
    ? `REFERENCE NOTES (trusted; prefer these over your own memory)\n${clamp(
        snippets.map((s) => `Q: ${s.question}\nA: ${s.answer}`).join('\n\n'),
        MAX_SNIPPET_CHARS,
      )}`
    : '';

  const t = INTENT_PROMPTS[intent];

  return [
    'You are FitForge Coach — the user\'s long-term personal trainer inside the FitForge app: direct, specific, encouraging, zero fluff, focused on steady progress over weeks and months — every answer is one step in the user\'s longer plan.',
    profileBlock,
    notes,
    'GROUNDING\n' +
      '- When REFERENCE NOTES are present, take every number and recommendation from them, not from memory; if the notes disagree with what you remember, the notes win.\n' +
      '- When the notes do not cover the question and you are not sure, say "I\'m not certain about that" and name what to look up or who to ask.\n' +
      '- Never invent a number, statistic, or study: give a range from the notes, or no number at all.',
    'PERSONALIZATION\n' +
      '- Use the USER PROFILE in every answer: goal, experience, equipment, targets, exclusions.\n' +
      '- Never recommend an exercise on their exclusion list or equipment they do not have — name a swap and say why in a short clause (e.g. "since **squats** are out, use **leg press**").\n' +
      '- Match the answer to their experience level: a beginner gets one simple rule, an advanced lifter gets the exact range.',
    // The holistic long-term-trainer block — the judged panel's core addition.
    'COACHING\n' +
    '- Coach for the next 8-12 weeks, not one session: when two fixes work, pick the one they can repeat every week and that is easier on the joints.\n' +
    '- Match every number to their experience level and days per week from the USER PROFILE.\n' +
    '- Treat a missed workout or a stalled lift as information, not failure: name the likely cause (sleep, stress, food, too much volume) in one clause, then adjust the plan.\n' +
    '- Mention sleep, food, or stress only when it likely explains their issue — one sentence, then back to the answer.\n' +
    '- Ask at most one question per reply, and only when the answer would change your advice.',
    'FORMAT (strict — the app renders exactly this)\n' +
      '- GitHub-flavored markdown limited to: **bold**, plain sentences, and bullet lines starting with "- ".\n' +
      '- No headings, no tables, no links, no emojis, no code blocks, no greetings, no sign-offs, no repeating the question back.\n' +
      '- Put every number, weight and exercise name in **bold**.\n' +
      '- Hard cap: 110 words.',
    // CONVERSATION RULES, only when there is a conversation. Free instruct models are strongly
    // biased toward answering the LAST thing they see, which is why an unqualified "why?" used to
    // come back as a fresh lecture. Two failure modes are worth naming explicitly: losing the
    // thread on a follow-up, and dragging the old topic into a genuinely new question. The client
    // already drops history when it detects a change of subject; this is the second line.
    hasHistory
      ? 'CONVERSATION\n' +
        '- The messages above are this same conversation. A short question ("why?", "how much?", "what about dumbbells?") is a FOLLOW-UP: resolve what "it"/"that" refers to from the exchange above and answer THAT, without restating what you already said.\n' +
        '- If the new question is clearly a different subject, answer it on its own and ignore the earlier turns.\n' +
        '- Never contradict a number you gave earlier unless the REFERENCE NOTES say otherwise; if you are correcting yourself, say so in three words.'
      : '',
    `FOCUS\n${t.focus}`,
    `ANSWER SHAPE (follow it exactly)\n${t.shape}`,
    'SAFETY\n' +
      '- NO medical advice. Do not diagnose, treat, or give advice for injuries, pain, illness, pregnancy, or medication — give only general safety information and direct the user to a doctor or physical therapist.\n' +
      '- Only mention app features that exist: logging workouts, editing routines, swapping exercises, changing split, exporting data, Local Mode. Never invent settings or screens.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Trim model tics a small model still emits despite the rules. Markdown the FORMAT contract
 * allows (bold, "- " bullets) passes through untouched — the client renders it. Everything the
 * contract forbids and a model still produces (headings, links) is stripped rather than shown.
 */
function postProcess(text: string): string {
  let out = text.trim();
  out = out.replace(/^(sure|certainly|of course|great question)[!,.]?\s*/i, '');
  // Headings are forbidden by the contract; models still open with them under long context.
  out = out.replace(/^#+\s.*$/gm, '').trim();
  // Links get hallucinated URLs; keep the text, drop the target.
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Normalize `*` bullets to the contract's `-` so the client renderer stays single-shape.
  out = out.replace(/^\s*\*\s+/gm, '- ');
  // Hard word cap as a backstop for the FORMAT rule.
  const words = out.split(/\s+/);
  if (words.length > 140) out = words.slice(0, 140).join(' ') + '…';
  return out;
}

/* ═══════════════════════════════════════════ macros: consensus nutrition estimation ══ */

interface MacroRequest {
  task?: string;
  food?: string;
  quantity?: string;
}

/**
 * The macro estimator prompt. JSON-only, schema inline, refusal path defined. The client only
 * calls this for foods its 60k-item catalog could NOT match, so the inputs are dishes, brands and
 * restaurant items — exactly where "one typical serving" plus explicit assumptions is the honest
 * unit.
 */
const MACRO_SYSTEM =
  'You are a precise nutrition estimator. Output ONLY one minified JSON object — no prose, no ' +
  'markdown, no code fence. Schema: {"per":"<the exact quantity you estimated for>","kcal":<number>,' +
  '"protein_g":<number>,"carbs_g":<number>,"fat_g":<number>,"assumptions":["<short note>"]}. ' +
  'Rules: values must be realistic for the stated quantity; if no quantity is stated, use one ' +
  'typical serving and state it in "per"; note preparation assumptions (oil, dressing, cooking ' +
  'method) in "assumptions". If the input is not a food or drink, output exactly {"error":"not_food"}.';

/** Extract the first balanced JSON object from model text, tolerating stray fences and prose. */
function extractJson(text: unknown): unknown | null {
  // Defense in depth for the same production lesson normalized in askWorkersAI: if a caller ever
  // hands the parsed object through, it IS the extraction.
  if (typeof text !== 'string') return text && typeof text === 'object' ? text : null;
  const cleaned = text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

interface MacroSample {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  per: string;
  assumptions: string[];
  reconciled: boolean;
}

/**
 * SANITY GATE for one sample. The single most valuable check is thermodynamic: kcal must agree
 * with 4·protein + 4·carbs + 9·fat. Free models flub the multiplication far more often than they
 * flub the macro split, so on disagreement the macros are trusted and kcal is RECOMPUTED rather
 * than the sample discarded — a reconciled sample still carries signal; a fabricated one fails the
 * bounds checks instead.
 */
function validateSample(raw: unknown): MacroSample | 'not_food' | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.error === 'not_food') return 'not_food';
  const p = Number(r.protein_g);
  const c = Number(r.carbs_g);
  const f = Number(r.fat_g);
  let kcal = Number(r.kcal);
  if (![p, c, f, kcal].every((n) => Number.isFinite(n) && n >= 0)) return null;
  if (p > 500 || c > 1000 || f > 500) return null;
  const computed = 4 * p + 4 * c + 9 * f;
  if (kcal <= 0 && computed <= 0) return null;
  let reconciled = false;
  if (Math.abs(kcal - computed) > Math.max(40, 0.35 * Math.max(kcal, computed))) {
    kcal = Math.round(computed);
    reconciled = true;
  }
  if (kcal <= 0 || kcal > 5000) return null;
  return {
    kcal,
    protein_g: p,
    carbs_g: c,
    fat_g: f,
    per: typeof r.per === 'string' && r.per.trim() ? r.per.trim().slice(0, 80) : 'one serving',
    assumptions: Array.isArray(r.assumptions) ? r.assumptions.map(String).slice(0, 3) : [],
    reconciled,
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * THE CONSENSUS LOOP. One sample from a free model is a guess; three independent samples at three
 * temperatures are a distribution. The three run in PARALLEL (wall-clock of one), each is sanity-
 * gated, and the answer is the per-field MEDIAN with the min–max carried as an honest range. The
 * spread of the kcal estimates is the confidence: models that agree within 30% are describing the
 * same food; models 2× apart are guessing, and the response says so.
 */
async function estimateMacros(
  env: Env,
  food: string,
  quantity: string | undefined,
  preferred?: ModelChoice,
  signedIn = false,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const user = `Food: ${food}${quantity ? `\nQuantity: ${quantity}` : ''}`;

  const results = await Promise.all(
    MACRO_TEMPS.map((temperature) =>
      generateOnce(
        env,
        MACRO_SYSTEM,
        user,
        { temperature, maxTokens: MACRO_MAX_TOKENS },
        preferred,
        signedIn,
      ),
    ),
  );

  const generated = results.filter((r) => r.ok) as Extract<
    Awaited<ReturnType<typeof generateOnce>>,
    { ok: true }
  >[];
  if (generated.length === 0) {
    const first = results[0] as { ok: false; status: number; detail: string };
    return { status: first.status, body: { error: 'ai_unavailable', detail: first.detail } };
  }

  const parsed = generated.map((g) => validateSample(extractJson(g.answer)));
  const notFood = parsed.filter((s) => s === 'not_food').length;
  const valid = parsed.filter((s): s is MacroSample => s !== null && s !== 'not_food');

  // A majority saying "this is not food" is an answer, not a failure.
  if (notFood >= 2 || (notFood === 1 && valid.length === 0)) {
    return {
      status: 422,
      body: { error: 'not_food', detail: `"${food}" does not look like a food or drink.` },
    };
  }

  // One usable sample is a guess wearing a JSON costume. Two is the floor for a range.
  if (valid.length < 2) {
    return {
      status: 503,
      body: {
        error: 'estimate_unreliable',
        detail: `Only ${valid.length} of ${results.length} samples parsed as a sane estimate.`,
      },
    };
  }

  const field = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => {
    const vals = valid.map((s) => s[k]);
    return {
      value: Math.round(median(vals) * 10) / 10,
      low: Math.round(Math.min(...vals) * 10) / 10,
      high: Math.round(Math.max(...vals) * 10) / 10,
    };
  };

  const kcal = field('kcal');
  const spread = (kcal.high - kcal.low) / Math.max(1, kcal.value);
  const confidence = spread <= 0.3 ? 'high' : spread <= 0.7 ? 'medium' : 'low';

  const assumptions = [...new Set(valid.flatMap((s) => s.assumptions))].slice(0, 4);
  if (valid.some((s) => s.reconciled))
    assumptions.push('kcal reconciled from macros (4·P + 4·C + 9·F)');

  const who = generated[0]!;
  return {
    status: 200,
    body: {
      per: valid[0]!.per,
      kcal,
      protein_g: field('protein_g'),
      carbs_g: field('carbs_g'),
      fat_g: field('fat_g'),
      confidence,
      assumptions,
      samples: valid.length,
      provider: who.provider,
      model: who.model,
    },
  };
}

/* ═══════════════════════════════════════════ meal: AI-first whole-sentence parsing ══ */

const MAX_MEAL_CHARS = 240;
const MEAL_SPLIT_TEMPERATURE = 0.2;
const MEAL_MAX_TOKENS = 320;
const MEAL_MAX_ITEMS = 6;

/**
 * The meal splitter prompt. ONE low-temperature call that turns a typed sentence into discrete
 * items — the consensus estimator then prices each item with its own three samples, so the
 * structure decision (what was eaten, how it was cooked) and the numbers decision (what it
 * costs) are made by different calls with different disciplines.
 *
 * THE PREPARATION RULE is the whole reason this task exists. The offline matcher can only match
 * words, so "steak and eggs" landed on "Egg, whole, raw/boiled" — a database row, not a
 * breakfast. A model reading the sentence knows the eggs next to a steak arrive fried or
 * scrambled, and that context has to be stated as a rule or free models revert to the most
 * generic entry just like the database did.
 */
const MEAL_SYSTEM =
  'You split a meal description into its food items. Output ONLY one minified JSON object — no ' +
  'prose, no markdown, no code fence. Schema: {"items":[{"food":"<specific name including its ' +
  'likely preparation>","qty":<number>,"unit":"<the unit word they used, or null>","grams":' +
  '<estimated TOTAL grams for this item as eaten>}]}. Rules: 1 to ' + String(MEAL_MAX_ITEMS) +
  ' items. "food" must name the preparation the dish context implies — eggs beside a steak are ' +
  'fried or scrambled, not raw or boiled; chicken with rice is grilled or roasted; toast is ' +
  'toasted bread. Never add foods the text does not imply. qty is the stated count or 1; unit ' +
  'is their own word ("egg","slice","cup","oz") or null; grams must be realistic for the ' +
  'quantity (one large egg ~50, a 6 oz steak ~170). If the input is not about food or drink, ' +
  'output exactly {"error":"not_food"}.';

interface MealSplitItem {
  food: string;
  qty: number;
  unit: string | null;
  grams: number;
}

/** Hard shape gate for the splitter's answer — anything suspect fails the whole split. */
function validateMealSplit(raw: unknown): MealSplitItem[] | 'not_food' | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.error === 'not_food') return 'not_food';
  if (!Array.isArray(r.items) || r.items.length === 0) return null;
  const out: MealSplitItem[] = [];
  for (const row of r.items.slice(0, MEAL_MAX_ITEMS)) {
    if (!row || typeof row !== 'object') return null;
    const i = row as Record<string, unknown>;
    const food = typeof i.food === 'string' ? i.food.trim().slice(0, 60) : '';
    const qty = Number(i.qty);
    const grams = Number(i.grams);
    if (food.length < 2) return null;
    if (!Number.isFinite(qty) || qty <= 0 || qty > 50) return null;
    if (!Number.isFinite(grams) || grams < 5 || grams > 3000) return null;
    out.push({
      food,
      qty: Math.round(qty * 100) / 100,
      unit: typeof i.unit === 'string' && i.unit.trim() ? i.unit.trim().slice(0, 16) : null,
      grams: Math.round(grams),
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * Split once, then price every item through the SAME consensus loop the single-food estimator
 * uses (three samples, median, range, thermodynamic gate). Items whose estimate fails come back
 * with an `error` marker instead of numbers — the client falls back to its offline catalog for
 * exactly those rows rather than losing the whole meal.
 */
async function parseMeal(
  env: Env,
  text: string,
  preferred?: ModelChoice,
  signedIn = false,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const split = await generateOnce(
    env,
    MEAL_SYSTEM,
    `Meal: ${text}`,
    { temperature: MEAL_SPLIT_TEMPERATURE, maxTokens: MEAL_MAX_TOKENS },
    preferred,
    signedIn,
  );
  if (!split.ok) return { status: split.status, body: { error: 'ai_unavailable', detail: split.detail } };

  const parsed = validateMealSplit(extractJson(split.answer));
  if (parsed === 'not_food')
    return {
      status: 422,
      body: { error: 'not_food', detail: `"${text}" does not look like a meal.` },
    };
  if (!parsed) return { status: 502, body: { error: 'unusable_answer' } };

  const estimates = await Promise.all(
    parsed.map((it) =>
      estimateMacros(
        env,
        it.food,
        `${it.qty}${it.unit ? ` ${it.unit}` : ''} (~${it.grams} g total)`,
        preferred,
        signedIn,
      ).catch(() => ({ status: 503, body: { error: 'ai_unavailable' } as Record<string, unknown> })),
    ),
  );

  const items = parsed.map((it, i) => {
    const est = estimates[i]!;
    if (est.status !== 200) return { ...it, error: String(est.body.error ?? 'estimate_failed') };
    const b = est.body;
    return {
      ...it,
      per: b.per,
      kcal: b.kcal,
      protein_g: b.protein_g,
      carbs_g: b.carbs_g,
      fat_g: b.fat_g,
      confidence: b.confidence,
      assumptions: b.assumptions,
      samples: b.samples,
    };
  });

  // A meal where nothing could be priced is a failure, not a result — the client's offline
  // parser will do a better job than a list of error rows.
  if (!items.some((i) => !('error' in i)))
    return { status: 503, body: { error: 'ai_unavailable', detail: 'no item could be estimated' } };

  return { status: 200, body: { items, provider: split.provider, model: split.model } };
}

/* ═══════════════════════════════════════════════════════════════════ HTTP handler ══ */

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAll = allowed.includes('*');
  const ok = origin && (allowAll || allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? (origin as string) : allowed[0] ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/* ═══════════════════════════════════════════════════════════ the adapt task (dynamic split) ══ */

/**
 * ADAPT — "here's how I feel; should today's session change?" as a JSON-ONLY task, cloned from
 * the macros pattern rather than the chat one, because the answer is a machine-applied plan edit
 * and prose cannot be one-click applied.
 *
 * The STRUCTURED UNDERSTANDING lives in the request: the client sends a compact digest of its own
 * entities (the split, today's exercises, and — per exercise — the only swap candidates the app's
 * substitution engine would itself offer). The model is instructed to choose from those and
 * nothing else, and `validateAdapt` then enforces it: every action is whitelisted, every swap is
 * checked against the candidates that were actually sent. What survives is applyable by
 * construction — the model proposes, the app's own vocabulary disposes.
 */
const ADAPT_MAX_TOKENS = 260;
const ADAPT_TEMPERATURE = 0.2;
const MAX_FEELING_CHARS = 400;
const ADAPT_ACTIONS = ['proceed', 'reduce', 'technique', 'rest'] as const;
type AdaptAction = (typeof ADAPT_ACTIONS)[number];

const ADAPT_SYSTEM =
  "You are FitForge Coach — the user's long-term personal trainer — deciding whether TODAY'S " +
  'planned session should change based on how they say they feel.\n' +
  "PLAN CONTEXT (json) lists the user's split, today's exercises (slug, sets, muscles) and, per " +
  'exercise, the ONLY allowed swap candidates. These are the app\'s real entities: never invent ' +
  'an exercise, never use a slug outside the lists.\n' +
  'Output ONLY one minified JSON object — no prose, no markdown, no fence. Schema: ' +
  '{"action":"proceed"|"reduce"|"technique"|"rest","swaps":[{"from":"<today slug>","to":"<candidate slug>"}],' +
  '"reason":"<plain language, under 140 chars, reflect their own words>","confidence":<0..1>,' +
  '"advice":{"nutrition":"<one concrete line for TODAY, under 140 chars>","recovery":"<one sleep/stress/recovery line, under 140 chars>"}}\n' +
  'Rules:\n' +
  '- "reduce" = same session at half the sets (tired but able). "technique" = light practice day ' +
  '(very sore, achy joints). "rest" = do not train today.\n' +
  '- Unwell, feverish, dizzy, chest pain or injured -> "rest", and the reason must say to see a ' +
  'doctor if it persists. Never advise training through illness or pain.\n' +
  '- Swaps ONLY when the complaint is about a specific movement (it hurts, equipment busy, hated) ' +
  "and only from that exercise's candidates. Omit swaps otherwise.\n" +
  '- Ordinary tiredness or a fine morning -> "proceed" with one encouraging line. Do not invent problems.\n' +
  '- ADVICE coaches the WHOLE day, matched to their words: hungover -> carbs + water with ' +
  'electrolytes, easy bland food, no spicy/greasy, no more alcohol; very sore -> protein at every ' +
  'meal + an easy walk; short sleep -> no caffeine after mid-afternoon, earlier night, lead meals ' +
  'with protein; low energy -> front-load carbs and hydrate; stressed -> a walk outside and a real ' +
  'lunch. Be concrete (name foods). No supplements beyond electrolytes/caffeine timing, no ' +
  'medical claims, no calorie numbers.';

interface AdaptContextWire {
  split: string;
  day: { name: string; focus: string | null; exercises: { slug: string; name: string; sets: number; muscles: string[] }[] };
  swap_candidates: Record<string, { slug: string; name: string }[]>;
  readiness?: { sleepHours: number | null; soreness: number; energy: number; stress: number; unwell: boolean };
}

/**
 * Rebuild the context from attacker-controlled input into a TRUSTED, clamped wire object.
 * Anything malformed is dropped field-by-field; a context with no exercises is rejected.
 */
function parseAdaptContext(raw: unknown): AdaptContextWire | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const day = (r.day ?? {}) as Record<string, unknown>;
  const exercisesRaw = Array.isArray(day.exercises) ? day.exercises.slice(0, 10) : [];
  const exercises = exercisesRaw
    .map((e) => {
      const x = e as Record<string, unknown>;
      if (typeof x.slug !== 'string' || typeof x.name !== 'string') return null;
      return {
        slug: x.slug.slice(0, 60),
        name: x.name.slice(0, 60),
        sets: typeof x.sets === 'number' && Number.isFinite(x.sets) ? Math.max(1, Math.min(10, Math.round(x.sets))) : 3,
        muscles: Array.isArray(x.muscles) ? x.muscles.filter((m) => typeof m === 'string').slice(0, 3).map((m) => (m as string).slice(0, 24)) : [],
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  if (exercises.length === 0) return null;

  const candidatesRaw = (r.swap_candidates ?? {}) as Record<string, unknown>;
  const swap_candidates: AdaptContextWire['swap_candidates'] = {};
  for (const ex of exercises) {
    const list = candidatesRaw[ex.slug];
    if (!Array.isArray(list)) continue;
    const cleaned = list
      .slice(0, 3)
      .map((c) => {
        const x = c as Record<string, unknown>;
        return typeof x.slug === 'string' && typeof x.name === 'string'
          ? { slug: x.slug.slice(0, 60), name: x.name.slice(0, 60) }
          : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (cleaned.length > 0) swap_candidates[ex.slug] = cleaned;
  }

  const readinessRaw = r.readiness as Record<string, unknown> | undefined;
  const readiness =
    readinessRaw && typeof readinessRaw === 'object'
      ? {
          sleepHours: typeof readinessRaw.sleepHours === 'number' ? readinessRaw.sleepHours : null,
          soreness: Number(readinessRaw.soreness) || 3,
          energy: Number(readinessRaw.energy) || 3,
          stress: Number(readinessRaw.stress) || 3,
          unwell: readinessRaw.unwell === true,
        }
      : undefined;

  return {
    split: typeof r.split === 'string' ? r.split.slice(0, 60) : 'your plan',
    day: {
      name: typeof day.name === 'string' ? day.name.slice(0, 60) : 'Today',
      focus: typeof day.focus === 'string' ? day.focus.slice(0, 40) : null,
      exercises,
    },
    swap_candidates,
    readiness,
  };
}

export interface AdaptResult {
  action: AdaptAction;
  swaps: { from: string; to: string }[];
  reason: string;
  confidence: number;
  /** holistic day advice — optional, prose clamped; the client falls back to its rules advice */
  advice?: { nutrition?: string; recovery?: string };
}

/** Whitelist the action, keep only swaps we ourselves offered, clamp the prose. */
function validateAdapt(parsed: unknown, ctx: AdaptContextWire): AdaptResult | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  const action = p.action;
  if (typeof action !== 'string' || !(ADAPT_ACTIONS as readonly string[]).includes(action)) return null;

  const swaps: { from: string; to: string }[] = [];
  if (Array.isArray(p.swaps)) {
    for (const s of p.swaps.slice(0, 4)) {
      const x = s as Record<string, unknown>;
      if (typeof x.from !== 'string' || typeof x.to !== 'string') continue;
      if (ctx.swap_candidates[x.from]?.some((c) => c.slug === x.to)) swaps.push({ from: x.from, to: x.to });
    }
  }

  const reason = typeof p.reason === 'string' ? p.reason.trim().slice(0, 200) : '';
  const confidence =
    typeof p.confidence === 'number' && Number.isFinite(p.confidence)
      ? Math.max(0, Math.min(1, p.confidence))
      : 0.5;
  if (!reason) return null;

  let advice: AdaptResult['advice'];
  const rawAdvice = p.advice as Record<string, unknown> | undefined;
  if (rawAdvice && typeof rawAdvice === 'object') {
    const nutrition =
      typeof rawAdvice.nutrition === 'string' ? rawAdvice.nutrition.trim().slice(0, 180) : '';
    const recovery =
      typeof rawAdvice.recovery === 'string' ? rawAdvice.recovery.trim().slice(0, 180) : '';
    if (nutrition || recovery) {
      advice = {
        ...(nutrition ? { nutrition } : {}),
        ...(recovery ? { recovery } : {}),
      };
    }
  }

  return { action: action as AdaptAction, swaps, reason, confidence, ...(advice ? { advice } : {}) };
}

/* ═══════════════════════════════════ bodyscan: vision bucket estimation (AI Mode) ══ */

/**
 * BODYSCAN — one to four body photos in, coarse fitness BUCKETS out, to pre-fill the AI-Mode
 * confirm screen. The confirm screen IS the error correction: every estimate is shown as
 * "estimated — tap to change" before it touches anything, which is why one low-temperature
 * sample is enough where macros needs a three-sample consensus.
 *
 * PRIVACY IS THE DESIGN CONSTRAINT, not a footnote. The photos transit this worker once and
 * are gone: no KV, no R2, no logging of body content, and — enforced below — no error path
 * ever quotes a payload fragment back, because a data-URI fragment IS image bytes.
 */
const BODYSCAN_MAX_TOKENS = 500; // the schema answer is ~250 tokens; headroom, not a leash
const BODYSCAN_TEMPERATURE = 0.2; // near-greedy — the confirm screen is the consensus mechanism
/**
 * One to four photos. Four angles triangulate best, but the real usage pattern is "whatever
 * the user actually has" — a front shot alone, or a single selfie — and a rough estimate the
 * user corrects on the confirm screen beats a wall that sends them back to the camera.
 */
const BODYSCAN_MIN_IMAGES = 1;
const BODYSCAN_MAX_IMAGES = 4;
/** What each uploaded photo claims to be — drives which prompt of the bundle gets built. */
const SCAN_SHOTS = ['front', 'back', 'left', 'right', 'selfie'] as const;
type ScanShot = (typeof SCAN_SHOTS)[number];
const SHOT_LABELS: Record<ScanShot, string> = {
  front: 'front',
  back: 'back',
  left: 'left side',
  right: 'right side',
  selfie: 'a selfie (face and upper body)',
};
/**
 * Per-image budget for the data URI, in characters (1 char = 1 byte on the wire). The client
 * preps ~150 KB JPEGs (~200 KB after base64), so 2 MB is an order of magnitude of headroom —
 * only a misbehaving client hits it, and it is refused before any inference is spent.
 */
const BODYSCAN_MAX_IMAGE_CHARS = 2 * 1024 * 1024;
/** The client always re-encodes to JPEG (the re-encode is what strips EXIF), so only JPEG data URIs are legitimate. */
const BODYSCAN_IMAGE_PREFIX = 'data:image/jpeg;base64,';
/**
 * The vision fallback — SEPARATE from the text chain above, because none of those models
 * accept image input, so a scan cannot walk that chain: it is this model or a 503. It is
 * noticeably weaker than the primary, which is why its confidences are capped below.
 */
const WORKERS_AI_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
/** On the fallback, cap raw confidences so every chip renders as a soft guess on the confirm screen. */
const BODYSCAN_FALLBACK_CONFIDENCE_CAP = 0.5;
/**
 * A selfie shows shoulders-up: whatever the model claims, weight/body-fat/build read from a
 * face and arms is a soft guess, so those tiers are capped below 'high'. Age is exempt — a
 * visible face is the one thing a selfie reads BETTER than the four-angle set.
 */
const BODYSCAN_SELFIE_BODY_CONFIDENCE_CAP = 0.6;

/**
 * Which prompt of the bundle a shot list earns. `full` is the ideal four-angle set; `selfie`
 * is the quick-start single shot where the FACE IS EXPECTED and the read is shoulders-up;
 * everything between is `partial` — some angles skipped on purpose, uncertainty widened.
 */
type ScanCoverage = 'full' | 'partial' | 'selfie';

function scanCoverage(shots: ScanShot[]): ScanCoverage {
  if (shots.length === 1 && shots[0] === 'selfie') return 'selfie';
  return new Set(shots.filter((s) => s !== 'selfie')).size >= 4 ? 'full' : 'partial';
}

/**
 * The scan prompt BUNDLE (docs/RESEARCH-VISION.md §D, extended). Same construction as the
 * other JSON tasks — labeled blocks, numbered RULES, the refusal path spelled out, output
 * contract last — but built per request, because what counts as a refusable photo depends on
 * what the user was ASKED for: a face-and-shoulders selfie is a contract violation in the
 * four-angle flow and the entire point of the selfie flow. As everywhere else in this worker,
 * the schema in the prompt is trust-but-parse: the validator below is what actually holds.
 */
function bodyscanSystem(shots: ScanShot[]): string {
  const coverage = scanCoverage(shots);
  const n = shots.length;

  const uploaded =
    coverage === 'selfie'
      ? `uploaded one selfie — face and upper body — to get started quickly. That is a
supported path, not a mistake: estimate from what a selfie shows (face, neck,
shoulders, chest, arms). It is not a full-body photo and must never be refused
for that.`
      : coverage === 'full'
        ? `uploaded photos of themselves (front, back, and both sides) to speed up fitness
onboarding. Faces are usually hidden or cropped — that is intentional, for
privacy.`
        : `uploaded ${n === 1 ? 'one body photo' : `${n} body photos`} (${shots
            .map((s) => SHOT_LABELS[s])
            .join(', ')}) to speed up fitness onboarding. The missing angles were skipped on
purpose — estimate from what is visible and widen your uncertainty rather than
refusing. Faces are usually hidden or cropped — that is intentional, for
privacy.`;

  const confidenceRule =
    coverage === 'selfie'
      ? `Every estimate carries a confidence from 0.0 to 1.0. A selfie supports at
   best coin-flip certainty on weight, body fat, and build — keep those at or
   below 0.5. A visible face is a real age cue, so age_bucket confidence may
   honestly run higher here. 0.5 means a coin flip between adjacent buckets.
   Below 0.3 means guessing.`
      : coverage === 'full'
        ? `Every estimate carries a confidence from 0.0 to 1.0. Use 0.8+ only when all
   four photos are sharp, clothing is fitted, and the full body is visible.
   0.5 means a coin flip between adjacent buckets. Below 0.3 means guessing.`
        : `Every estimate carries a confidence from 0.0 to 1.0. You have ${n} of the four
   ideal angles, so confidence above 0.6 should be rare — widen your bands'
   doubt instead of guessing precisely. 0.5 means a coin flip between adjacent
   buckets. Below 0.3 means guessing.`;

  const notBodyPhoto =
    coverage === 'selfie'
      ? `the image shows no real part of the user's body - a screenshot, a drawing,
   an object, a magazine or celebrity photo ("not_a_body_photo")`
      : `the images are not photos of the user's body -
   a face-only shot, a screenshot, a drawing, a magazine or celebrity photo
   ("not_a_body_photo")`;

  const faceRule =
    coverage === 'selfie'
      ? `The face is EXPECTED to be visible in a selfie. Never refuse or lower any
   confidence because of it, and never describe or identify the person. Set
   flags.face_visible true. If the person appears under 18, refuse
   ("possible_minor").`
      : `A hidden, cropped, or covered face is NORMAL. Never refuse for it and do
   not reduce any confidence except age_bucket because of it. If a
   recognizable face IS visible, set flags.face_visible true so the app can
   remind the user they can retake without it.`;

  const agePrecision =
    coverage === 'selfie'
      ? `Never a specific age. A visible face gives real age cues; still, buckets
  only.`
      : `Never a specific age. With the face hidden, body-only age cues are weak;
  confidence above 0.5 is rare here and that is expected.`;

  return `You are the body-scan estimator inside FitForge, a fitness app. The user has
${uploaded} Your ONLY job is to estimate coarse fitness buckets from the photos.
The user reviews and corrects every estimate on the next screen, so honest
uncertainty beats confident precision.

CONTEXT YOU MAY RECEIVE
The user message may state height, biological sex (user-declared), and which
photo is which angle. Use height and sex to calibrate the weight and body-fat
bands. Never infer or output sex, gender, ethnicity, or identity from photos.

ESTIMATE EXACTLY THESE FIELDS
- age_bucket: "18-25" | "26-35" | "36-45" | "46-55" | "56+".
  ${agePrecision}
- weight_range_kg: "under-50" | "50-60" | "60-70" | "70-80" | "80-90" |
  "90-100" | "100-110" | "110-120" | "over-120".
- body_fat_band: "under-10" | "10-14" | "15-19" | "20-24" | "25-29" |
  "30-39" | "40-plus" (percent). Visual body-fat reading is roughly ±5
  points at best - pick the single most likely band and let confidence
  carry the doubt.
- build: "slim" | "average" | "athletic" | "muscular" | "stocky" | "round".

RULES
1. Output JSON only, exactly matching OUTPUT SCHEMA. No text outside the JSON.
2. ${confidenceRule}
3. NEVER output a specific age or weight number, medical claims, diagnoses,
   health-risk statements, or advice of any kind. Buckets only.
4. NEVER comment on attractiveness or use judgmental language. "notes" is at
   most one neutral sentence about estimate quality, e.g. "Loose clothing
   makes the weight and body-fat bands less certain."
5. REFUSE - set status "refused", set refusal_reason, omit estimates - when:
   no real person is visible ("no_person"); more than one person
   ("multiple_people"); the person appears to be under 18
   ("possible_minor" - if in doubt, refuse); content is sexually explicit
   ("explicit_content"); ${notBodyPhoto};
   or everything is too dark, blurry, or cropped to read ("image_quality").
6. ${faceRule}
7. If one photo is unusable but the rest are readable, estimate from the
   usable ones, mark it false in photos_ok, and lower confidences.

OUTPUT SCHEMA
{
  "status": "ok" | "refused",
  "refusal_reason": null | "no_person" | "multiple_people" | "possible_minor"
                  | "explicit_content" | "not_a_body_photo" | "image_quality",
  "photos_ok": [${Array(n).fill('boolean').join(', ')}],
  "estimates": {
    "age_bucket":      { "value": string, "confidence": number },
    "weight_range_kg": { "value": string, "confidence": number },
    "body_fat_band":   { "value": string, "confidence": number },
    "build":           { "value": string, "confidence": number }
  } | null,
  "flags": { "face_visible": boolean, "clothing_loose": boolean },
  "notes": string
}`;
}

/**
 * THE TRANSLATION TABLES. The model speaks the PROMPT's enums; the response speaks the
 * CONTRACT's (docs/AIMODE-CONTRACT.md "Worker bodyscan task"). These maps are exhaustive on
 * purpose: any answer using any other word is off-enum, fails validation, and becomes a 502 —
 * un-validated model output never reaches the client.
 */

/** Prompt and contract agree on the age buckets, so this is a membership check, not a map. */
const SCAN_AGE_BUCKETS = ['18-25', '26-35', '36-45', '46-55', '56+'] as const;
type ScanAgeBucket = (typeof SCAN_AGE_BUCKETS)[number];

/**
 * Prompt weight range → the contract's numeric 10 kg band. The open-ended ends are closed to
 * a 10 kg band too, because the confirm screen renders "low–high kg" chips and the midpoint
 * feeds the deterministic math downstream — an unbounded band has no midpoint.
 */
const SCAN_WEIGHT_BANDS: Record<string, { low: number; high: number }> = {
  'under-50': { low: 40, high: 50 },
  '50-60': { low: 50, high: 60 },
  '60-70': { low: 60, high: 70 },
  '70-80': { low: 70, high: 80 },
  '80-90': { low: 80, high: 90 },
  '90-100': { low: 90, high: 100 },
  '100-110': { low: 100, high: 110 },
  '110-120': { low: 110, high: 120 },
  'over-120': { low: 120, high: 130 },
};

type ScanBodyFatBand = '<12' | '12-18' | '18-25' | '25-32' | '32+';
/** Prompt band → contract band, each routed by where its midpoint lands. */
const SCAN_BODY_FAT_BANDS: Record<string, ScanBodyFatBand> = {
  'under-10': '<12',
  '10-14': '12-18',
  '15-19': '12-18',
  '20-24': '18-25',
  '25-29': '25-32',
  '30-39': '32+',
  '40-plus': '32+',
};

type ScanBuild = 'lean' | 'athletic' | 'muscular' | 'higher-fat' | 'average';
/** Prompt build word → contract build bucket. */
const SCAN_BUILDS: Record<string, ScanBuild> = {
  slim: 'lean',
  average: 'average',
  athletic: 'athletic',
  muscular: 'muscular',
  stocky: 'higher-fat',
  round: 'higher-fat',
};

type ScanRefusalReason = 'not_person' | 'possible_minor' | 'inappropriate' | 'unreadable';
/**
 * Prompt refusal reason → contract reason. Everything that means "this is not a usable photo
 * of one adult's body" folds into the coarser client-facing enum; `possible_minor` survives
 * verbatim because the client treats it specially (no retake loop — straight to Old School).
 */
const SCAN_REFUSAL_REASONS: Record<string, ScanRefusalReason> = {
  no_person: 'not_person',
  multiple_people: 'not_person',
  not_a_body_photo: 'not_person',
  possible_minor: 'possible_minor',
  explicit_content: 'inappropriate',
  image_quality: 'unreadable',
};

type ScanConfidenceTier = 'high' | 'medium' | 'low';

/**
 * The prompt's 0..1 confidence, folded to the contract's three tiers. Thresholds follow the
 * prompt's own calibration language: 0.5 is "a coin flip between adjacent buckets" (a medium,
 * usable pre-fill), below 0.3 is "guessing" (render as a soft guess). `cap` exists for the
 * weaker fallback model, whose self-reported certainty is not worth the same trust.
 */
function scanConfidenceTier(raw: number, cap: number): ScanConfidenceTier {
  const c = Math.min(Math.max(0, Math.min(1, raw)), cap);
  return c >= 0.65 ? 'high' : c >= 0.3 ? 'medium' : 'low';
}

interface ScanField {
  value: string;
  confidence: number;
}

type BodyScanOutcome =
  | {
      kind: 'ok';
      age: ScanField;
      weight: ScanField;
      bodyFat: ScanField;
      build: ScanField;
      note: string;
    }
  | { kind: 'refused'; reason: ScanRefusalReason };

/**
 * HARD GATE on the model's answer. Refusals must carry a reason the prompt defined; estimates
 * must use exactly the prompt's bucket words. Anything else — a numeric age, an invented band,
 * prose where an enum belongs — returns null and surfaces as 502 unusable_answer, because a
 * wrong bucket silently pre-filled is worse than an honest failure the client can route past.
 */
function validateBodyScan(raw: unknown): BodyScanOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (r.status === 'refused') {
    const reason =
      typeof r.refusal_reason === 'string' ? SCAN_REFUSAL_REASONS[r.refusal_reason] : undefined;
    return reason ? { kind: 'refused', reason } : null;
  }
  if (r.status !== 'ok') return null;

  const est = r.estimates;
  if (!est || typeof est !== 'object') return null;
  const field = (key: string): ScanField | null => {
    const f = (est as Record<string, unknown>)[key];
    if (!f || typeof f !== 'object') return null;
    const { value, confidence } = f as Record<string, unknown>;
    if (typeof value !== 'string') return null;
    return {
      value,
      confidence:
        typeof confidence === 'number' && Number.isFinite(confidence)
          ? Math.max(0, Math.min(1, confidence))
          : 0,
    };
  };

  const age = field('age_bucket');
  const weight = field('weight_range_kg');
  const bodyFat = field('body_fat_band');
  const build = field('build');
  if (!age || !weight || !bodyFat || !build) return null;
  if (!(SCAN_AGE_BUCKETS as readonly string[]).includes(age.value)) return null;
  if (!SCAN_WEIGHT_BANDS[weight.value]) return null;
  if (!SCAN_BODY_FAT_BANDS[bodyFat.value]) return null;
  if (!SCAN_BUILDS[build.value]) return null;

  // One neutral sentence at most, clamped — and short enough that nothing bulky (least of all
  // image data) could ride back to the client inside it.
  const note = typeof r.notes === 'string' ? r.notes.trim().slice(0, 200) : '';
  return { kind: 'ok', age, weight, bodyFat, build, note };
}

/**
 * One VISION generation, with the same policy spine as {@link generateOnce}: Mistral primary
 * behind the same company-key gate, Workers AI fallback — but the fallback is the single
 * vision model, never the text chain, because a model that cannot see the photos cannot
 * produce anything but fiction about them.
 *
 * A `preferred` model is respected only as policy, not as a model id: vision requires a
 * vision-capable model, and every pickable Workers AI entry is text-only. So a mistral pick
 * runs the normal primary (already the vision default), while a workers-ai pick keeps its
 * real meaning — "do not spend the paid key" — and lands on the vision fallback instead of
 * the picked text model. A text-only preferred model falls through to the vision default.
 */
async function generateVision(
  env: Env,
  system: string,
  user: UserContentPart[],
  opts: GenOpts,
  preferred?: ModelChoice,
  signedIn = false,
): Promise<
  | { ok: true; answer: string; provider: 'mistral' | 'workers-ai'; model: string }
  | { ok: false; status: number; detail: string }
> {
  const runVisionModel = async () => {
    const result = (await env.AI!.run(WORKERS_AI_VISION_MODEL, {
      messages: messagesFor(system, user, []),
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    })) as { response?: unknown };
    const raw = result?.response;
    const answer = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
    return { ok: true as const, answer, provider: 'workers-ai' as const, model: WORKERS_AI_VISION_MODEL };
  };

  const askVisionFallback = async () => {
    try {
      return await runVisionModel();
    } catch (err) {
      const detail = String(err instanceof Error ? err.message : err);
      // Error 5016: Workers AI gates Meta's vision model behind a ONE-TIME, account-level
      // license acknowledgement — the account must send the model the literal prompt "agree"
      // before its first real request. Nothing surfaces this until the first production call,
      // which is exactly how every anonymous body scan came back "scanner isn't reachable"
      // while the code was verified correct. The ack is idempotent and per-account, so:
      // submit it and retry once. If Cloudflare ever changes the ritual, the retry's own
      // error comes back verbatim instead.
      if (detail.includes('5016')) {
        try {
          await env.AI!.run(WORKERS_AI_VISION_MODEL, { prompt: 'agree' });
          return await runVisionModel();
        } catch (err2) {
          return {
            ok: false as const,
            status: 503,
            detail: String(err2 instanceof Error ? err2.message : err2).slice(0, 160),
          };
        }
      }
      return { ok: false as const, status: 503, detail: detail.slice(0, 160) };
    }
  };

  const provider = providerFor(env);
  if (provider === 'none') {
    return {
      ok: false,
      status: 500,
      detail:
        'No AI backend configured. Add the Workers AI binding named AI, or set the ' +
        'MISTRAL_API_KEY secret on this worker.',
    };
  }

  // The company-key gate, verbatim from generateOnce: a signed-out request on a gated worker
  // is served by the free tier on every path, the default one included.
  const mayUseMistral = signedIn || !gateActive(env);
  const forceWorkersAi = (preferred?.provider === 'workers-ai' || !mayUseMistral) && !!env.AI;

  if (provider === 'mistral' && !forceWorkersAi) {
    const r = await askMistral(env, system, user, opts);
    if (r.ok) return { ok: true, answer: r.answer, provider: 'mistral', model: modelFor(env) };
    if (env.AI) {
      const fallback = await askVisionFallback();
      if (fallback.ok) return fallback;
      return { ok: false, status: r.status, detail: `${r.detail} — and Workers AI: ${fallback.detail}` };
    }
    return r;
  }

  if (!env.AI) {
    return { ok: false, status: 503, detail: 'No vision-capable backend is available to this request.' };
  }
  return askVisionFallback();
}

/**
 * The bodyscan task body: build the multimodal message, run the vision policy, hard-validate,
 * translate to the contract's shape. Declared height/sex are passed as CONTEXT for the model
 * to use, never to infer — weight-from-photo without a height anchor is astrology.
 */
async function bodyScan(
  env: Env,
  images: string[],
  shots: ScanShot[],
  heightCm: number | undefined,
  sex: 'male' | 'female' | 'other' | undefined,
  preferred?: ModelChoice,
  signedIn = false,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const contextBits = [
    heightCm ? `height ${Math.round(heightCm)} cm` : null,
    sex ? `sex ${sex} (user-declared)` : null,
  ].filter(Boolean);
  const user: UserContentPart[] = [
    {
      type: 'text',
      text:
        (contextBits.length ? `Context: ${contextBits.join(', ')}. ` : '') +
        shots.map((s, i) => `Photo ${i + 1} is ${SHOT_LABELS[s]}`).join(', ') +
        '.',
    },
    ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ];

  const r = await generateVision(
    env,
    bodyscanSystem(shots),
    user,
    { temperature: BODYSCAN_TEMPERATURE, maxTokens: BODYSCAN_MAX_TOKENS },
    preferred,
    signedIn,
  );
  if (!r.ok) {
    // An upstream error body can echo fragments of what it was sent. Scrub anything that
    // looks like image data before the detail leaves this worker — never echo payload bytes.
    const detail = r.detail.replace(/data:image[^\s"'`]*/gi, '[image]');
    return { status: r.status, body: { error: 'ai_unavailable', detail } };
  }

  const outcome = validateBodyScan(extractJson(r.answer));
  if (!outcome) return { status: 502, body: { error: 'unusable_answer' } };
  if (outcome.kind === 'refused')
    // The safety path succeeding, not a 5xx: the client maps each reason to its own copy and
    // offers the Old School flow.
    return { status: 422, body: { error: 'refused', reason: outcome.reason } };

  const cap = r.provider === 'workers-ai' ? BODYSCAN_FALLBACK_CONFIDENCE_CAP : 1;
  // The selfie cap applies to the body reads only — the model's own age confidence stands
  // (behind the fallback cap), because the face is genuinely visible on this path.
  const bodyCap = Math.min(
    cap,
    scanCoverage(shots) === 'selfie' ? BODYSCAN_SELFIE_BODY_CONFIDENCE_CAP : 1,
  );
  return {
    status: 200,
    body: {
      ageBucket: outcome.age.value as ScanAgeBucket,
      weightBandKg: SCAN_WEIGHT_BANDS[outcome.weight.value]!,
      bodyFatBand: SCAN_BODY_FAT_BANDS[outcome.bodyFat.value]!,
      build: SCAN_BUILDS[outcome.build.value]!,
      confidence: {
        age: scanConfidenceTier(outcome.age.confidence, cap),
        weight: scanConfidenceTier(outcome.weight.confidence, bodyCap),
        bodyFat: scanConfidenceTier(outcome.bodyFat.confidence, bodyCap),
      },
      notes: outcome.note ? [outcome.note] : [],
      provider: r.provider,
      model: r.model,
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET')
      return json(
        {
          ok: true,
          service: 'fitforge-coach',
          provider: providerFor(env),
          model: modelFor(env),
          // The whole chain, so a probe can see what the worker would fall through to without
          // having to spend an inference to find out.
          fallbacks: env.AI ? workersAiModels(env) : [],
          // What the client's model picker may offer — decided HERE, by this worker's actual
          // configuration, so the dropdown can never promise a backend the worker lacks. The
          // FULL catalog, gated entries included and flagged `requiresAuth`: GET carries no body
          // and therefore no token, so the caller's sign-in state is unknown at this point. The
          // client hides what it may not use; the POST path is where the gate is enforced.
          models: modelCatalog(env),
          /** Whether this worker can verify sign-ins at all (an unset project id gates nothing open). */
          auth: env.FIREBASE_PROJECT_ID ? 'firebase' : 'none',
          /**
           * THE PRO TIER, as this worker actually has it — COUNTS ONLY, never the uids.
           *
           * "I set PRO_USERS" and "the deployed worker can see PRO_USERS" are different claims, and
           * the gap between them is unobservable from outside without this: the pro model is
           * advertised on the strength of the DeepSeek key alone, so an empty allowlist looks
           * identical to a working one until a paying user taps it and gets Mistral. It is a plain
           * var in wrangler.toml, which means a `wrangler deploy` from a stale checkout — or a value
           * only ever typed into the dashboard — silently drops it.
           *
           * The uids stay out. A uid is an identifier rather than a credential, but publishing who
           * pays is nobody's business, and a count answers the only question a probe has.
           */
          pro: { models: modelCatalog(env).filter((m) => m.requiresPro).length, allowlist: proUids(env).length },
          tasks: ['chat', 'macros', 'adapt', 'meal', 'bodyscan'],
        },
        200,
        cors,
      );
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    let body: ChatRequest & MacroRequest;
    try {
      body = (await request.json()) as ChatRequest & MacroRequest;
    } catch {
      return json({ error: 'invalid_json' }, 400, cors);
    }

    if (providerFor(env) === 'none') {
      // Neither backend configured. Explicit, because the alternative is a 500 that reads as a bug
      // in the code rather than as a worker that was deployed without a binding or a key.
      return json(
        {
          error: 'no_provider',
          detail:
            'No AI backend configured. Add the Workers AI binding named AI, or set the ' +
            'MISTRAL_API_KEY secret on this worker.',
        },
        500,
        cors,
      );
    }

    // WHO IS ASKING. The token is verified against Google's keys before it can unlock anything;
    // any failure (absent, expired, forged, JWKS unreachable) simply reads as "guest", which is
    // the free tier. Nobody is ever refused an answer for failing to prove who they are.
    const user = await verifyFirebaseToken(
      (body as { idToken?: unknown }).idToken as string | undefined,
      env.FIREBASE_PROJECT_ID,
    );
    const signedIn = user != null;
    const pro = isProUser(env, user?.uid ?? null);
    // The user's model pick, if any — validated against the catalog THIS caller may use, so a
    // signed-out request naming the gated model — or a non-pro request naming the DeepSeek
    // entry — falls through to the default policy.
    const preferred = resolvePreferred(env, (body as { model?: unknown }).model, signedIn, pro);

    /* ── task: macros ──────────────────────────────────────────────────────────────── */
    if (body.task === 'macros') {
      const food = (body.food ?? '').trim().slice(0, MAX_FOOD_CHARS);
      if (!food) return json({ error: 'missing_food' }, 400, cors);
      try {
        const r = await estimateMacros(
          env,
          food,
          body.quantity?.trim().slice(0, 60) || undefined,
          preferred,
          signedIn,
        );
        return json(r.body, r.status, cors);
      } catch (err) {
        return json({ error: 'ai_unavailable', detail: String(err).slice(0, 200) }, 503, cors);
      }
    }

    /* ── task: meal (AI-first sentence parsing) ────────────────────────────────────── */
    if ((body as { task?: unknown }).task === 'meal') {
      const text = String((body as { text?: unknown }).text ?? '')
        .trim()
        .slice(0, MAX_MEAL_CHARS);
      if (!text) return json({ error: 'missing_text' }, 400, cors);
      try {
        const r = await parseMeal(env, text, preferred, signedIn);
        return json(r.body, r.status, cors);
      } catch (err) {
        return json({ error: 'ai_unavailable', detail: String(err).slice(0, 200) }, 503, cors);
      }
    }

    /* ── task: bodyscan (AI-Mode photo estimates) ──────────────────────────────────── */
    if ((body as { task?: unknown }).task === 'bodyscan') {
      const images = (body as { images?: unknown }).images;
      // Caps are enforced BEFORE any inference is spent, and no rejection ever quotes the
      // offending value — an index is diagnostic enough, and a data-URI fragment is image bytes.
      if (
        !Array.isArray(images) ||
        images.length < BODYSCAN_MIN_IMAGES ||
        images.length > BODYSCAN_MAX_IMAGES
      )
        return json(
          {
            error: 'bad_image_count',
            detail: `images must be ${BODYSCAN_MIN_IMAGES}-${BODYSCAN_MAX_IMAGES} data URIs — send what you have`,
          },
          400,
          cors,
        );
      // Each image carries a shot label so the right prompt of the bundle gets built. Absent
      // labels mean a legacy four-photo client: the original fixed order is assumed.
      const rawShots = (body as { shots?: unknown }).shots;
      let shots: ScanShot[];
      if (rawShots === undefined) {
        shots = (['front', 'back', 'left', 'right'] as ScanShot[]).slice(0, images.length);
      } else if (
        Array.isArray(rawShots) &&
        rawShots.length === images.length &&
        rawShots.every((s) => (SCAN_SHOTS as readonly string[]).includes(String(s)))
      ) {
        shots = rawShots as ScanShot[];
      } else {
        return json(
          {
            error: 'bad_shots',
            detail: `shots must label each image: ${SCAN_SHOTS.join(' | ')}`,
          },
          400,
          cors,
        );
      }
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (typeof img !== 'string' || !img.startsWith(BODYSCAN_IMAGE_PREFIX))
          return json(
            { error: 'bad_image_type', detail: `image ${i + 1} is not a data:image/jpeg;base64 URI` },
            400,
            cors,
          );
        if (img.length > BODYSCAN_MAX_IMAGE_CHARS)
          return json({ error: 'imgs_too_large', detail: `image ${i + 1} exceeds 2 MB` }, 400, cors);
      }
      // Declared context, clamped to plausible values; anything else is silently omitted —
      // the scan still works without it, just with wider uncertainty.
      const rawHeight = (body as { heightCm?: unknown }).heightCm;
      const heightCm =
        typeof rawHeight === 'number' && Number.isFinite(rawHeight) && rawHeight >= 100 && rawHeight <= 250
          ? rawHeight
          : undefined;
      const rawSex = (body as { sex?: unknown }).sex;
      const sex = rawSex === 'male' || rawSex === 'female' || rawSex === 'other' ? rawSex : undefined;
      try {
        const r = await bodyScan(env, images as string[], shots, heightCm, sex, preferred, signedIn);
        return json(r.body, r.status, cors);
      } catch (err) {
        // String(err) only — never anything derived from the request body, i.e. never image bytes.
        return json({ error: 'ai_unavailable', detail: String(err).slice(0, 200) }, 503, cors);
      }
    }

    /* ── task: adapt (dynamic split) ───────────────────────────────────────────────── */
    if ((body as { task?: unknown }).task === 'adapt') {
      const feeling = String((body as { feeling?: unknown }).feeling ?? '')
        .trim()
        .slice(0, MAX_FEELING_CHARS);
      if (!feeling) return json({ error: 'missing_feeling' }, 400, cors);
      const ctx = parseAdaptContext((body as { context?: unknown }).context);
      if (!ctx) return json({ error: 'invalid_context' }, 400, cors);

      const userMsg = `HOW THEY FEEL: "${feeling}"\n\nPLAN CONTEXT (json):\n${JSON.stringify(ctx)}`;
      try {
        const r = await generateOnce(
          env,
          ADAPT_SYSTEM,
          userMsg,
          { temperature: ADAPT_TEMPERATURE, maxTokens: ADAPT_MAX_TOKENS },
          preferred,
          signedIn,
        );
        if (!r.ok) return json({ error: 'ai_unavailable', detail: r.detail }, r.status, cors);
        const validated = validateAdapt(extractJson(r.answer), ctx);
        if (!validated) return json({ error: 'unusable_answer' }, 502, cors);
        // THE SAFETY GATE, IN CODE: a check-in that says "unwell" can only ever produce REST,
        // whatever the model replied. Same rule as the client engine, enforced independently.
        if (ctx.readiness?.unwell && validated.action !== 'rest') {
          validated.action = 'rest';
          validated.swaps = [];
          validated.reason =
            'You said you feel unwell — rest today, and check in with a doctor if it lasts.';
          validated.advice = validated.advice ?? {
            nutrition: 'Fluids and easy food — water with electrolytes, broth, rice, bananas.',
            recovery: 'Sleep is the treatment. Clear the evening and take it.',
          };
        }
        return json({ ...validated, provider: r.provider, model: r.model }, 200, cors);
      } catch (err) {
        return json({ error: 'ai_unavailable', detail: String(err).slice(0, 200) }, 503, cors);
      }
    }

    /* ── task: chat (default) ──────────────────────────────────────────────────────── */
    const question = (body.question ?? '').trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) return json({ error: 'missing_question' }, 400, cors);

    const intent = classifyIntent(question, body.intent);
    const history = normalizeHistory(body.history);
    const system = buildSystemPrompt(body, intent, history.length > 0);

    try {
      const r = await generateOnce(
        env,
        system,
        question,
        {
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS,
        },
        preferred,
        signedIn,
        history,
      );
      if (!r.ok) return json({ error: 'ai_unavailable', detail: r.detail }, r.status, cors);

      const answer = postProcess(r.answer);
      if (!answer) return json({ error: 'empty_response' }, 502, cors);

      return json({ answer, provider: r.provider, model: r.model, intent }, 200, cors);
    } catch (err) {
      // Fail fast and explicitly — the client falls back to its local knowledge base.
      return json({ error: 'ai_unavailable', detail: String(err).slice(0, 200) }, 503, cors);
    }
  },
};
