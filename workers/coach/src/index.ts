/**
 * FitForge Coach — Cloudflare Worker (Workers AI).
 *
 * Called DIRECTLY by the static web app (no proxy in between): the browser POSTs to this
 * worker, the worker calls Workers AI, and streams/returns a short grounded answer.
 *
 * Design constraints that matter here:
 *  - The model is a small/free instruct model, so the harness does the heavy lifting:
 *    retrieved knowledge-base snippets are supplied as trusted reference notes, the user's
 *    onboarding profile is supplied as a labeled block, and generation is tightly capped.
 *  - The app NEVER depends on this worker: if it is unreachable, the client falls back to
 *    its local knowledge base. So failures here must be fast and explicit, not hangs.
 *  - No secrets are required: the AI binding is account-scoped.
 */

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
   * Variables → Add → Encrypt).
   *
   * THE KEY MUST LIVE HERE AND NOWHERE ELSE. The web app is a static export, so anything given to
   * it — including an env var — is inlined into JavaScript that every visitor downloads. A key in
   * the bundle is a key published. The worker is the only server-side surface this project has,
   * which is exactly why routing through it keeps the key secret: the browser talks to the worker,
   * the worker talks to Mistral, and the key never leaves Cloudflare.
   */
  MISTRAL_API_KEY?: string;
  /** Overrides the default Mistral model. Ignored unless MISTRAL_API_KEY is set. */
  MISTRAL_MODEL?: string;
}

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

/**
 * Run the chain. Returns the answer together with the model that actually produced it, so the
 * response and the health check report reality rather than the first name in the list.
 */
async function askWorkersAI(
  env: Env,
  system: string,
  question: string,
): Promise<
  { ok: true; answer: string; model: string } | { ok: false; status: number; detail: string }
> {
  const tried: string[] = [];
  for (const model of workersAiModels(env)) {
    try {
      const result = (await env.AI!.run(model, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      })) as { response?: string };
      return { ok: true, answer: result?.response ?? '', model };
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

/**
 * Mistral's small instruct model. Cheap, fast, and far stronger than the free Workers AI tier at
 * following the rules in the system prompt — which is most of what quality means here, since the
 * answer is meant to come from the supplied reference notes rather than the model's own memory.
 */
const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

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
 * spinner, and the client gives up at 10s — a request left hanging on Mistral's side would hold a
 * worker invocation open long after anyone is waiting for it.
 */
async function askMistral(
  env: Env,
  system: string,
  question: string,
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
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
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

/** Hard caps — a weak model rambles without them, and long answers hurt on a phone. */
const MAX_TOKENS = 200;
const TEMPERATURE = 0.25;
const MAX_QUESTION_CHARS = 500;
const MAX_SNIPPET_CHARS = 1600;
const MAX_PROFILE_CHARS = 600;

interface ChatRequest {
  question?: string;
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

function clamp(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

/** Build the system prompt. Slots with no value are omitted rather than left blank. */
function buildSystemPrompt(req: ChatRequest): string {
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
    ? `USER PROFILE\n${clamp(profileLines.join('\n'), MAX_PROFILE_CHARS)}\n\n`
    : '';

  const snippets = (req.snippets ?? []).slice(0, 3);
  const notes = snippets.length
    ? `REFERENCE NOTES (trusted; prefer these over your own memory)\n${clamp(
        snippets.map((s) => `Q: ${s.question}\nA: ${s.answer}`).join('\n\n'),
        MAX_SNIPPET_CHARS,
      )}\n\n`
    : '';

  return (
    'You are the FitForge Coach, a friendly, evidence-based fitness and nutrition assistant ' +
    'inside the FitForge app.\n\n' +
    profileBlock +
    notes +
    'RULES\n' +
    '1. Answer ONLY the question asked. 2-4 short sentences, or up to 4 bullets. Never exceed 120 words.\n' +
    "2. Base your answer on the REFERENCE NOTES when they are relevant. If they don't cover the question " +
    'and you are not confident, say "I\'m not certain about that" and suggest what to look up or ask a ' +
    'professional — do not guess numbers.\n' +
    '3. Personalize using the USER PROFILE (their goal, experience, equipment, targets, exclusions). ' +
    "Never recommend an exercise on their exclusion list or equipment they don't have.\n" +
    '4. NO medical advice. Do not diagnose, treat, or give advice for injuries, pain, illness, pregnancy, ' +
    'or medication. For those, give only general safety information and tell the user to consult a doctor ' +
    'or physical therapist.\n' +
    '5. Only mention app features listed here: logging workouts, editing routines, swapping exercises, ' +
    'changing split, exporting data, Local Mode. Never invent settings, screens, or features.\n' +
    '6. Plain English. No emojis, no markdown headers, no greetings or sign-offs, no repeating the question back.'
  );
}

/** Trim model tics a small model still emits despite the rules. */
function postProcess(text: string): string {
  let out = text.trim();
  out = out.replace(/^(sure|certainly|of course|great question)[!,.]?\s*/i, '');
  out = out.replace(/^#+\s.*$/gm, '').trim();
  // Hard word cap as a backstop for rule 1.
  const words = out.split(/\s+/);
  if (words.length > 140) out = words.slice(0, 140).join(' ') + '…';
  return out;
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
        },
        200,
        cors,
      );
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    let body: ChatRequest;
    try {
      body = (await request.json()) as ChatRequest;
    } catch {
      return json({ error: 'invalid_json' }, 400, cors);
    }

    const question = clamp((body.question ?? '').trim(), MAX_QUESTION_CHARS);
    if (!question) return json({ error: 'missing_question' }, 400, cors);

    const system = buildSystemPrompt(body);

    const provider = providerFor(env);
    if (provider === 'none') {
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

    try {
      let raw: string;
      let used = modelFor(env);
      let usedProvider: 'mistral' | 'workers-ai' = provider;

      if (provider === 'mistral') {
        const r = await askMistral(env, system, question);
        if (r.ok) {
          raw = r.answer;
        } else if (env.AI) {
          // Mistral is preferred, not required. When a key expires or Mistral has an incident, an
          // account that also has the AI binding should degrade to a weaker answer rather than to
          // no answer — the user is watching a spinner, and they cannot act on "the key is wrong".
          const fallback = await askWorkersAI(env, system, question);
          if (!fallback.ok)
            return json(
              { error: 'ai_unavailable', detail: `${r.detail} — and Workers AI: ${fallback.detail}` },
              r.status,
              cors,
            );
          raw = fallback.answer;
          used = fallback.model;
          usedProvider = 'workers-ai';
        } else {
          return json({ error: 'ai_unavailable', detail: r.detail }, r.status, cors);
        }
      } else {
        const r = await askWorkersAI(env, system, question);
        if (!r.ok) return json({ error: 'ai_unavailable', detail: r.detail }, r.status, cors);
        raw = r.answer;
        used = r.model;
      }

      const answer = postProcess(raw);
      if (!answer) return json({ error: 'empty_response' }, 502, cors);

      return json({ answer, provider: usedProvider, model: used }, 200, cors);
    } catch (err) {
      // Fail fast and explicitly — the client falls back to its local knowledge base.
      return json({ error: 'ai_unavailable', detail: String(err).slice(0, 200) }, 503, cors);
    }
  },
};
