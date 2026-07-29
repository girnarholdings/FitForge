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
  provider: 'mistral' | 'workers-ai';
  /**
   * This entry costs the COMPANY's Mistral allowance, so it is offered to signed-in users only.
   * The client hides it when signed out; {@link resolvePreferred} refuses it without a verified
   * Firebase token, which is the half that actually holds.
   */
  requiresAuth?: boolean;
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

/** The catalog as a given caller may use it: gated entries drop out when nobody is signed in. */
function catalogFor(env: Env, signedIn: boolean): ModelChoice[] {
  return modelCatalog(env).filter((m) => signedIn || !m.requiresAuth);
}

/**
 * A client-requested model, accepted ONLY if it is in the catalog. A whitelist, not a passthrough:
 * the request body is attacker-controlled, and this is the line that keeps it from steering the
 * worker at arbitrary (billable) model ids or at backends it is not configured for. An unknown id
 * quietly resolves to "no preference" — the stale-client case, not an error.
 */
function resolvePreferred(env: Env, raw: unknown, signedIn: boolean): ModelChoice | undefined {
  if (typeof raw !== 'string') return undefined;
  const id = raw.trim();
  if (!id) return undefined;
  // catalogFor, not modelCatalog: a signed-out caller asking for the gated model gets `undefined`
  // and therefore the default policy, exactly as if they had asked for a model that never existed.
  return catalogFor(env, signedIn).find((m) => m.id === id);
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

/** The messages array: system, the conversation so far, then what was just asked. */
function messagesFor(system: string, user: string, history: HistoryMessage[]) {
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
  user: string,
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
  | { ok: true; answer: string; provider: 'mistral' | 'workers-ai'; model: string }
  | { ok: false; status: number; detail: string }
> {
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
          tasks: ['chat', 'macros'],
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
    // The user's model pick, if any — validated against the catalog THIS caller may use, so a
    // signed-out request naming the gated model falls through to the default policy.
    const preferred = resolvePreferred(env, (body as { model?: unknown }).model, signedIn);

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
