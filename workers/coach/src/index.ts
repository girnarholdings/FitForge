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
  AI: {
    run: (
      model: string,
      input: Record<string, unknown>,
    ) => Promise<{ response?: string } | ReadableStream>;
  };
  ALLOWED_ORIGINS?: string;
  MODEL?: string;
}

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

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
      return json({ ok: true, service: 'fitforge-coach', model: env.MODEL ?? DEFAULT_MODEL }, 200, cors);
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

    try {
      const result = (await env.AI.run(env.MODEL ?? DEFAULT_MODEL, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      })) as { response?: string };

      const answer = postProcess(result?.response ?? '');
      if (!answer) return json({ error: 'empty_response' }, 502, cors);

      return json({ answer, model: env.MODEL ?? DEFAULT_MODEL }, 200, cors);
    } catch (err) {
      // Fail fast and explicitly — the client falls back to its local knowledge base.
      return json({ error: 'ai_unavailable', detail: String(err).slice(0, 200) }, 503, cors);
    }
  },
};
