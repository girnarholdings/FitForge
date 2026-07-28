import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { type Env } from '../src/index.ts';

/**
 * THE WORKER'S CONTRACT, exercised against the real handler.
 *
 * The AI binding is stubbed and nothing else is: this runs `src/index.ts` itself, so CORS, method
 * handling, input validation, prompt construction, the generation caps and the post-processing are
 * all the code that gets deployed. What it cannot cover is Cloudflare's inference — that lives on
 * their edge, and the check for it is the `curl` in docs/CLOUDFLARE-WORKER-SETUP.md.
 *
 * Why this matters more than it looks: the browser calls this worker DIRECTLY. There is no server
 * in between to sanitise a bad request or clamp a runaway response, so the origin allow-list and
 * the token caps are not hygiene — they are the only thing standing between a published URL and
 * someone else's Workers AI bill.
 */

const ORIGIN = 'https://girnarholdings.github.io';

/** Records what the worker asked the model, so the prompt can be asserted on. */
function stubEnv(
  response = 'Three to four sets per muscle, two or three times a week.',
): Env & { calls: { model: string; input: Record<string, unknown> }[] } {
  const calls: { model: string; input: Record<string, unknown> }[] = [];
  return {
    calls,
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:3000`,
    AI: {
      run: async (model: string, input: Record<string, unknown>) => {
        calls.push({ model, input });
        return { response };
      },
    },
  } as Env & { calls: { model: string; input: Record<string, unknown> }[] };
}

const post = (body: unknown, origin: string | null = ORIGIN) =>
  new Request('https://worker.test/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });

/* ── CORS and method handling ─────────────────────────────────────────────────────────────── */

test('a preflight from an allowed origin is answered', async () => {
  const env = stubEnv();
  const res = await worker.fetch(
    new Request('https://worker.test/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    env,
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(res.headers.get('Access-Control-Allow-Methods') ?? '', /POST/);
});

test('an origin outside the allow-list is not echoed back', async () => {
  // The browser enforces CORS, so the defence is refusing to name the attacker's origin as allowed.
  const env = stubEnv();
  const res = await worker.fetch(post({ question: 'hello' }, 'https://evil.example'), env);
  assert.notEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
});

test('GET is a health check that names the resolved model', async () => {
  const env = stubEnv();
  const res = await worker.fetch(
    new Request('https://worker.test/', { method: 'GET', headers: { Origin: ORIGIN } }),
    env,
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; service: string; model: string };
  assert.equal(body.ok, true);
  assert.equal(body.service, 'fitforge-coach');
  assert.ok(body.model.startsWith('@cf/'), 'health check should report the model it would use');
});

test('an unsupported method is refused', async () => {
  const env = stubEnv();
  const res = await worker.fetch(
    new Request('https://worker.test/', { method: 'DELETE', headers: { Origin: ORIGIN } }),
    env,
  );
  assert.equal(res.status, 405);
});

/* ── input validation ─────────────────────────────────────────────────────────────────────── */

test('malformed JSON is rejected without reaching the model', async () => {
  const env = stubEnv();
  const res = await worker.fetch(
    new Request('https://worker.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: '{not json',
    }),
    env,
  );
  assert.equal(res.status, 400);
  assert.equal(env.calls.length, 0, 'a bad body must never cost an inference');
});

test('an empty question is rejected without reaching the model', async () => {
  const env = stubEnv();
  const res = await worker.fetch(post({ question: '   ' }), env);
  assert.equal(res.status, 400);
  assert.equal(env.calls.length, 0);
});

/* ── the prompt ───────────────────────────────────────────────────────────────────────────── */

test('retrieved snippets are passed to the model as grounding', async () => {
  const env = stubEnv();
  await worker.fetch(
    post({
      question: 'how many sets?',
      snippets: [{ question: 'Weekly volume', answer: '10-20 hard sets per muscle per week.' }],
    }),
    env,
  );
  const system = String(
    (env.calls[0]!.input.messages as { role: string; content: string }[])[0]!.content,
  );
  assert.match(system, /REFERENCE NOTES/);
  assert.match(system, /10-20 hard sets/, 'the retrieved answer must reach the prompt verbatim');
});

test('the profile is passed so answers can respect equipment and exclusions', async () => {
  const env = stubEnv();
  await worker.fetch(
    post({
      question: 'what should I train today?',
      profile: { goal: 'strength', equipment: ['barbell'], exclusions: ['overhead press'] },
    }),
    env,
  );
  const system = String(
    (env.calls[0]!.input.messages as { role: string; content: string }[])[0]!.content,
  );
  assert.match(system, /USER PROFILE/);
  assert.match(system, /barbell/);
  assert.match(system, /overhead press/);
  assert.match(system, /exclusion list/i, 'the rules must forbid recommending excluded work');
});

test('generation is capped, so one request cannot become a large bill', async () => {
  const env = stubEnv();
  await worker.fetch(post({ question: 'explain everything about training' }), env);
  const input = env.calls[0]!.input as { max_tokens: number; temperature: number };
  // 400, not the old 300: the markdown output contract (bold + bullets + a Next: line) costs
  // tokens. The point of the assertion is that a cap EXISTS, not its exact value.
  assert.ok(input.max_tokens <= 400, `max_tokens should be capped, got ${input.max_tokens}`);
  assert.ok(input.temperature <= 0.5, 'temperature should be low for a grounded answer');
});

test('an over-long question is truncated rather than forwarded whole', async () => {
  const env = stubEnv();
  const huge = 'a'.repeat(5000);
  await worker.fetch(post({ question: huge }), env);
  const user = String(
    (env.calls[0]!.input.messages as { role: string; content: string }[])[1]!.content,
  );
  assert.ok(user.length < 1000, `question should be clamped, got ${user.length} chars`);
});

/* ── the response ─────────────────────────────────────────────────────────────────────────── */

test('a normal answer comes back with the model that produced it', async () => {
  const env = stubEnv('Two to three sessions a week works well.');
  const res = await worker.fetch(post({ question: 'how often should I train?' }), env);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { answer: string; model: string };
  assert.match(body.answer, /Two to three sessions/);
  assert.ok(body.model.startsWith('@cf/'));
});

test('conversational filler the rules forbid is stripped', async () => {
  const env = stubEnv('Sure! Three sets is plenty.');
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  const body = (await res.json()) as { answer: string };
  assert.ok(!/^sure/i.test(body.answer), `leading filler should be removed, got: ${body.answer}`);
});

test('a rambling answer is cut to something readable on a phone', async () => {
  const env = stubEnv(Array.from({ length: 400 }, (_, i) => `word${i}`).join(' '));
  const res = await worker.fetch(post({ question: 'tell me everything' }), env);
  const body = (await res.json()) as { answer: string };
  assert.ok(body.answer.split(/\s+/).length <= 141, 'the word cap is the backstop for rule 1');
});

test('an empty model response is an error, not an empty answer bubble', async () => {
  const env = stubEnv('');
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  assert.equal(res.status, 502);
});

test('an AI failure fails fast and explicitly so the client can fall back', async () => {
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    AI: {
      run: async () => {
        throw new Error('inference unavailable');
      },
    },
  } as unknown as Env;
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, 'ai_unavailable');
});

/* ── model retirement ─────────────────────────────────────────────────────────────────────────
 *
 * THE REGRESSION TESTS FOR THE OUTAGE. The worker was pinned to one model; Cloudflare retired it on
 * 2026-05-30; every request returned 5028 from that day until it was noticed. No test here could
 * have failed, because the code was correct — the environment moved. What is testable, and what
 * these cover, is that a retirement now costs one skipped candidate instead of the whole service.
 */

/** An AI stub where only `live` answers; everything else is retired, exactly as 5028 arrives. */
function chainEnv(live: string | null, extra: Partial<Env> = {}) {
  const attempts: string[] = [];
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    AI: {
      run: async (model: string) => {
        attempts.push(model);
        if (model !== live)
          throw new Error(`AiError: 5028: This model was deprecated on 2026-05-30. Please use an alternative model.`);
        return { response: 'Ten to twenty hard sets per muscle per week.' };
      },
    },
    ...extra,
  } as unknown as Env;
  return { env, attempts };
}

test('A RETIRED MODEL IS SKIPPED, not served as an outage', async () => {
  // Nothing is live except the last candidate — the worker must still answer.
  const probe = chainEnv(null);
  await worker.fetch(post({ question: 'how many sets?' }), probe.env);
  const last = probe.attempts.at(-1)!;

  const { env, attempts } = chainEnv(last);
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  assert.equal(res.status, 200, 'a live model later in the chain must still produce an answer');
  const body = (await res.json()) as { answer: string; model: string; provider: string };
  assert.match(body.answer, /Ten to twenty/);
  assert.equal(body.model, last, 'the response must name the model that actually answered');
  assert.ok(attempts.length > 1, 'the retired candidates should have been tried and skipped');
});

test('a non-deprecation error does NOT walk the chain', async () => {
  // Quota and timeouts fail identically on every candidate. Retrying would turn one user's failed
  // request into four inference calls — the opposite of what a rate limit needs.
  const attempts: string[] = [];
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    AI: {
      run: async (model: string) => {
        attempts.push(model);
        throw new Error('AiError: 3036: Account limited');
      },
    },
  } as unknown as Env;
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  assert.equal(res.status, 503);
  assert.equal(attempts.length, 1, 'a quota error must not be retried against every model');
});

test('the 503 names every model it tried, so the next fix needs no guesswork', async () => {
  const { env } = chainEnv(null);
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, 'ai_unavailable');
  assert.match(body.detail, /@cf\//, 'the detail must list the candidates, not just say it failed');
  assert.match(body.detail, /5028/, 'and must preserve the upstream reason verbatim');
});

test('an explicitly pinned MODEL is tried first but is not a dead end', async () => {
  const { env, attempts } = chainEnv('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    MODEL: '@cf/meta/llama-3.1-8b-instruct',
  } as Partial<Env>);
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  assert.equal(attempts[0], '@cf/meta/llama-3.1-8b-instruct', 'the pin must be honoured first');
  assert.equal(res.status, 200, 'but a retired pin must fall through, not fail');
});

test('the health check publishes the fallback chain', async () => {
  const { env } = chainEnv(null);
  const res = await worker.fetch(
    new Request('https://worker.test/', { method: 'GET', headers: { Origin: ORIGIN } }),
    env,
  );
  const body = (await res.json()) as { fallbacks: string[] };
  assert.ok(body.fallbacks.length > 1, 'a probe should see the chain without spending an inference');
});

/* ── Mistral ──────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THE KEY LIVES IN THE WORKER. The web app is a static export, so any value handed to it —
 * environment variable included — is inlined into JavaScript every visitor downloads. A key in the
 * bundle is a published key. The worker is the only server-side surface in the project, which is
 * what makes it the right and only place for it.
 */

/** Stubs `fetch` for the duration of one call, recording what Mistral was sent. */
async function withMistral(
  reply: { status: number; body: unknown },
  run: () => Promise<Response>,
): Promise<{ res: Response; sent: { url: string; auth: string; body: any } | null }> {
  const original = globalThis.fetch;
  let sent: { url: string; auth: string; body: any } | null = null;
  globalThis.fetch = (async (url: any, init: any) => {
    sent = {
      url: String(url),
      auth: String(init?.headers?.Authorization ?? ''),
      body: JSON.parse(String(init?.body ?? '{}')),
    };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    return { res: await run(), sent };
  } finally {
    globalThis.fetch = original;
  }
}

const mistralOk = (content: string) => ({
  status: 200,
  body: { choices: [{ message: { content } }] },
});

test('a Mistral key takes priority over the AI binding', async () => {
  const env = { ALLOWED_ORIGINS: ORIGIN, MISTRAL_API_KEY: 'sk-test', AI: { run: async () => ({ response: 'from workers ai' }) } } as unknown as Env;
  const { res, sent } = await withMistral(mistralOk('Ten to twenty sets.'), () =>
    worker.fetch(post({ question: 'how many sets?' }), env),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { answer: string; provider: string };
  assert.equal(body.provider, 'mistral');
  assert.match(body.answer, /Ten to twenty/);
  assert.match(sent!.url, /api\.mistral\.ai/);
  assert.equal(sent!.auth, 'Bearer sk-test', 'the key must go in the Authorization header');
});

test('the same caps and system prompt apply to Mistral', async () => {
  // The caps are what stop a published URL becoming someone else's bill; they cannot be a property
  // of one backend.
  const env = { ALLOWED_ORIGINS: ORIGIN, MISTRAL_API_KEY: 'sk-test' } as unknown as Env;
  const { sent } = await withMistral(mistralOk('ok'), () =>
    worker.fetch(
      post({
        question: 'what should I train?',
        snippets: [{ question: 'Weekly volume', answer: '10-20 hard sets per muscle per week.' }],
        profile: { exclusions: ['overhead press'] },
      }),
      env,
    ),
  );
  assert.ok(sent!.body.max_tokens <= 400);
  assert.ok(sent!.body.temperature <= 0.5);
  assert.match(String(sent!.body.messages[0].content), /REFERENCE NOTES/);
  assert.match(String(sent!.body.messages[0].content), /overhead press/);
});

test('a rejected Mistral key says so, instead of a generic failure', async () => {
  const env = { ALLOWED_ORIGINS: ORIGIN, MISTRAL_API_KEY: 'wrong' } as unknown as Env;
  const { res } = await withMistral({ status: 401, body: { message: 'Unauthorized' } }, () =>
    worker.fetch(post({ question: 'how many sets?' }), env),
  );
  const body = (await res.json()) as { detail: string };
  assert.match(body.detail, /401/);
  assert.match(body.detail, /MISTRAL_API_KEY/, 'the message must name the thing to fix');
});

test('when Mistral fails and the AI binding exists, the answer degrades rather than disappears', async () => {
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    MISTRAL_API_KEY: 'sk-test',
    AI: { run: async () => ({ response: 'Ten to twenty hard sets.' }) },
  } as unknown as Env;
  const { res } = await withMistral({ status: 500, body: { message: 'upstream' } }, () =>
    worker.fetch(post({ question: 'how many sets?' }), env),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { provider: string; model: string };
  assert.equal(body.provider, 'workers-ai', 'the response must report which backend really answered');
  assert.ok(body.model.startsWith('@cf/'));
});

test('a worker with no binding and no key says exactly what is missing', async () => {
  const env = { ALLOWED_ORIGINS: ORIGIN } as unknown as Env;
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, 'no_provider');
  assert.match(body.detail, /MISTRAL_API_KEY/);
  assert.match(body.detail, /binding named AI/);
});

/* ── the prompt library ───────────────────────────────────────────────────────────────────────
 *
 * WHY TEMPLATES ARE TESTED AT ALL: the worker's whole quality story on free models is that the
 * system prompt carries an intent-matched OUTPUT SHAPE. A regression here (a misroute, a template
 * that stopped reaching the prompt) produces no error anywhere — just quietly worse answers. The
 * assertions pin the marker phrases each template alone contains.
 */

async function systemFor(body: unknown): Promise<string> {
  const env = stubEnv();
  await worker.fetch(post(body), env);
  return String((env.calls[0]!.input.messages as { role: string; content: string }[])[0]!.content);
}

test('a volume question is routed to the volume template', async () => {
  const system = await systemFor({ question: 'How many sets per muscle per week?' });
  assert.match(system, /training-volume question/);
  assert.match(system, /ANSWER SHAPE/);
  assert.match(system, /\*\*Next:\*\*/, 'every coaching shape ends in a Next action line');
});

test('a technique question gets cue-style bullets, not volume landmarks', async () => {
  const system = await systemFor({ question: 'How do I squat without my knees caving in?' });
  assert.match(system, /form\/technique question/);
  assert.match(system, /\*\*Avoid:\*\*/);
});

test("the client's personalize hint wins over classification", async () => {
  const system = await systemFor({
    question: 'How much protein do I need?',
    intent: 'personalize',
    snippets: [{ question: 'Protein', answer: '1.6-2.2 g/kg/day.' }],
  });
  assert.match(system, /\*\*For you:\*\*/);
  assert.match(system, /Do NOT repeat the general answer/);
});

test('a meal question produces the meal-ideas shape with per-option macros', async () => {
  const system = await systemFor({ question: 'What should I eat tonight to hit my protein?' });
  assert.match(system, /\*\*Meal name\*\*/);
});

test('an unclassifiable question lands on the general frame, never nothing', async () => {
  const system = await systemFor({ question: 'Tell me about how this app stores my data' });
  assert.match(system, /Answer only the question asked/);
  assert.match(system, /FORMAT \(strict/);
});

test('the markdown the contract allows passes through; what it forbids is stripped', async () => {
  const env = stubEnv('**10-20** hard sets works.\n- Spread over **2** sessions\n* Keep reps at **8**\nSee [this study](https://example.com/x) for more.');
  const res = await worker.fetch(post({ question: 'how many sets?' }), env);
  const body = (await res.json()) as { answer: string };
  assert.match(body.answer, /\*\*10-20\*\*/, 'bold must survive postProcess');
  assert.match(body.answer, /^- Spread/m, 'dash bullets must survive');
  assert.match(body.answer, /^- Keep reps/m, 'star bullets are normalized to dashes');
  assert.ok(!body.answer.includes('example.com'), 'hallucinatable link targets are dropped');
  assert.match(body.answer, /this study/, 'but the link TEXT is kept');
});

/* ── macros: the consensus estimator ──────────────────────────────────────────────────────────
 *
 * The worker asks the model THREE times at three temperatures, sanity-gates each sample, and
 * answers with the median plus an honest min–max range. These tests drive that machinery with a
 * scripted model: each call returns the next canned reply, so consensus, reconciliation and
 * rejection are all deterministic.
 */

function macroEnv(replies: string[]) {
  const calls: { input: Record<string, unknown> }[] = [];
  let i = 0;
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    AI: {
      run: async (_model: string, input: Record<string, unknown>) => {
        calls.push({ input });
        return { response: replies[Math.min(i++, replies.length - 1)] };
      },
    },
  } as unknown as Env;
  return { env, calls };
}

const sample = (kcal: number, p: number, c: number, f: number) =>
  JSON.stringify({ per: '1 bowl (350 g)', kcal, protein_g: p, carbs_g: c, fat_g: f, assumptions: ['dressed with oil'] });

const postMacros = (body: unknown) => post({ task: 'macros', ...(body as object) });

test('three agreeing samples produce a median value with a min-max range', async () => {
  const { env, calls } = macroEnv([sample(520, 28, 45, 24), sample(560, 30, 50, 26), sample(500, 26, 42, 23)]);
  const res = await worker.fetch(postMacros({ food: 'chicken burrito bowl' }), env);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    kcal: { value: number; low: number; high: number };
    protein_g: { value: number };
    confidence: string;
    samples: number;
  };
  assert.equal(body.kcal.value, 520, 'the value is the MEDIAN, never the mean of guesses');
  assert.equal(body.kcal.low, 500);
  assert.equal(body.kcal.high, 560);
  assert.equal(body.protein_g.value, 28);
  assert.equal(body.confidence, 'high', 'samples within 30% agree on what the food is');
  assert.equal(body.samples, 3);
  assert.equal(calls.length, 3, 'exactly three samples are drawn');
  const temps = calls.map((c) => c.input.temperature);
  assert.equal(new Set(temps).size, 3, 'each sample runs at a DIFFERENT temperature — that is what makes the range a range');
});

test('a code-fenced, prose-wrapped reply still parses', async () => {
  const fenced = 'Here you go!\n```json\n' + sample(300, 20, 30, 10) + '\n```\nHope that helps.';
  const { env } = macroEnv([fenced, sample(310, 21, 31, 10), sample(305, 20, 30, 11)]);
  const res = await worker.fetch(postMacros({ food: 'protein oats' }), env);
  assert.equal(res.status, 200);
});

test('a kcal figure that contradicts its own macros is recomputed from them', async () => {
  // 4·30 + 4·40 + 9·20 = 460 kcal; the model claims 900. Macros carry the signal.
  const wild = JSON.stringify({ per: '1 plate', kcal: 900, protein_g: 30, carbs_g: 40, fat_g: 20, assumptions: [] });
  const { env } = macroEnv([wild, sample(460, 30, 40, 20), sample(470, 31, 41, 20)]);
  const res = await worker.fetch(postMacros({ food: 'chicken and rice' }), env);
  const body = (await res.json()) as { kcal: { high: number }; assumptions: string[] };
  assert.ok(body.kcal.high <= 480, `reconciled kcal must not carry the 900 claim, got high=${body.kcal.high}`);
  assert.match(body.assumptions.join(' '), /reconciled/, 'the reconciliation is disclosed, not silent');
});

test('wide disagreement is reported as low confidence, not hidden behind one number', async () => {
  const { env } = macroEnv([sample(200, 10, 20, 8), sample(700, 40, 60, 30), sample(420, 25, 40, 17)]);
  const res = await worker.fetch(postMacros({ food: 'homemade curry' }), env);
  const body = (await res.json()) as { confidence: string; kcal: { low: number; high: number } };
  assert.equal(body.confidence, 'low');
  assert.ok(body.kcal.high - body.kcal.low >= 400, 'the range must expose the disagreement');
});

test('fewer than two sane samples refuses rather than guessing', async () => {
  const { env } = macroEnv(['I cannot help with that.', 'garbage {not json', sample(400, 20, 40, 15)]);
  const res = await worker.fetch(postMacros({ food: 'mystery stew' }), env);
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, 'estimate_unreliable');
});

test('a majority saying not-food is a 422 answer, not an error', async () => {
  const notFood = '{"error":"not_food"}';
  const { env } = macroEnv([notFood, notFood, sample(100, 1, 2, 1)]);
  const res = await worker.fetch(postMacros({ food: 'my car keys' }), env);
  assert.equal(res.status, 422);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, 'not_food');
});

test('an empty food is rejected without spending an inference', async () => {
  const { env, calls } = macroEnv([sample(1, 1, 1, 1)]);
  const res = await worker.fetch(postMacros({ food: '   ' }), env);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('the health check advertises both tasks', async () => {
  const env = stubEnv();
  const res = await worker.fetch(new Request('https://worker.test/', { method: 'GET' }), env);
  const body = (await res.json()) as { tasks: string[] };
  assert.deepEqual(body.tasks, ['chat', 'macros']);
});
