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
  assert.ok(input.max_tokens <= 300, `max_tokens should be capped, got ${input.max_tokens}`);
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
