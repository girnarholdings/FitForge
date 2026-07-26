# FitForge Coach — Cloudflare Worker

The AI half of the in-app Coach. **Optional**: FitForge answers most questions instantly from
its local knowledge base (83 curated entries, no network). This worker is only called for
personalized or edge-case questions the knowledge base can't confidently match.

## What it does

1. Receives `{ question, snippets, profile }` directly from the browser (no proxy in between).
2. Builds a tightly-constrained system prompt: the user's onboarding profile as a labeled
   block, the retrieved knowledge-base entries as trusted reference notes, and six hard rules
   (short answers, ground in the notes, personalize, **no medical advice**, don't invent app
   features, plain English).
3. Calls Workers AI with `max_tokens: 200`, `temperature: 0.25`.
4. Post-trims the model's usual tics and enforces a word cap.
5. On any failure returns a fast, explicit error so the client can fall back locally.

The harness matters more than the model here — a small free model is fine when it only has to
rephrase retrieved, already-correct notes for one specific person.

## Deploy

```bash
cd workers/coach
npx wrangler login
npx wrangler deploy
```

Then rebuild the web app with the endpoint set:

```bash
NEXT_PUBLIC_AI_ENDPOINT=https://fitforge-coach.<your-subdomain>.workers.dev npm run build -w @fitforge/web
```

(For GitHub Pages, add `NEXT_PUBLIC_AI_ENDPOINT` to the `env:` block of the build step in
`.github/workflows/pages.yml`.)

## Configuration

Both live in `wrangler.toml` under `[vars]`:

| Var | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list. Must include your Pages origin. |
| `MODEL` | Any Workers AI text model. Defaults to `@cf/meta/llama-3.1-8b-instruct`. |

No API keys or secrets: the `[ai]` binding is scoped to your Cloudflare account.

## Verify

```bash
curl https://fitforge-coach.<your-subdomain>.workers.dev            # → { ok: true, ... }

curl -X POST https://fitforge-coach.<your-subdomain>.workers.dev \
  -H 'Content-Type: application/json' \
  -d '{"question":"Can I swap barbell squats? My gym only has dumbbells.",
       "profile":{"goal":"hypertrophy","experience":"beginner","equipment":["dumbbell","flat-bench"]},
       "snippets":[]}'
```

## Privacy

The request contains the question plus the user's training context (goal, experience,
equipment, targets, exclusions) — the minimum needed to personalize an answer. Nothing is
stored by the worker, and it is only ever called when the user asks the Coach something the
local knowledge base cannot answer.
