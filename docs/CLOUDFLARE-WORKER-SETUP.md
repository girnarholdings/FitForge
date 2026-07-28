# Installing the Coach worker from the Cloudflare dashboard

This walks through wiring FitForge's AI Coach using **only the Cloudflare dashboard** — no CLI, no
`wrangler login`, no local Node. If you are happy on the command line, `workers/coach/README.md`
has the two-command version instead.

**Read this first:** the app is fully functional without the worker. Coach answers from the
knowledge base shipped in the bundle, and the nutrition parser is deterministic either way. The
worker only handles the personalised or edge-case questions the knowledge base cannot confidently
match. If anything below goes wrong, the app degrades to exactly what it does today — it does not
break.

**Cost:** Workers AI has a free daily allowance and the paid rate beyond it is per-neuron, not per
seat. The worker caps generation at 200 tokens precisely so a runaway loop cannot become a bill.
Check the current allowance on Cloudflare's pricing page before pointing production at it.

---

## Step 0 · What you are about to create

One Worker, with one binding and two variables:

| Thing | Value | Why |
|---|---|---|
| Worker name | `fitforge-coach` | Becomes part of the URL |
| AI binding | Variable name `AI` | How the code reaches Workers AI. **No API key** — the binding is account-scoped |
| Var `ALLOWED_ORIGINS` | Your site origin(s), comma-separated | CORS allow-list. The browser calls this worker directly, so without it the request is refused |
| Var `MODEL` | `@cf/meta/llama-3.1-8b-instruct` | Optional. Omit to use the built-in default |

---

## Step 1 · Get the worker code as JavaScript

The dashboard's editor runs **JavaScript**, not TypeScript. `workers/coach/src/index.ts` is a
single self-contained file with no imports, so stripping the types is all that is needed.

From the repository root:

```bash
cd workers/coach
npx tsc src/index.ts --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --outDir dist
```

That writes `workers/coach/dist/index.js`. Open it and copy the whole file.

> **If you cannot run that**, open `workers/coach/src/index.ts` and delete the type-only pieces by
> hand: the `export interface Env { … }` block, the `interface ChatRequest { … }` block, and any
> `: Type` annotation or `as Type` cast. Nothing else changes — there is no other TypeScript in the
> file. Getting this wrong shows up immediately in Step 3 as a syntax error in the editor, not as a
> silent failure.

---

## Step 2 · Create the Worker

1. Sign in at <https://dash.cloudflare.com>.
2. In the sidebar choose **Compute (Workers)** → **Workers & Pages**.
   *(Cloudflare renames this area periodically — if you see **Workers & Pages** directly, use
   that.)*
3. Click **Create application** → **Create Worker**.
4. Name it `fitforge-coach`. The name becomes the subdomain, so this determines your URL.
5. Click **Deploy**. This deploys Cloudflare's placeholder "Hello World" worker — expected. You are
   about to replace it.

---

## Step 3 · Paste the code

1. On the worker's page click **Edit code** (older accounts: **Quick edit**).
2. Select everything in the editor and delete it.
3. Paste the JavaScript from Step 1.
4. Click **Deploy** (top right).

If the editor underlines something in red, the type-stripping in Step 1 was incomplete — go back
and check for a leftover `: string` or `interface` block.

---

## Step 4 · Add the Workers AI binding

This is the step that is easy to miss, and skipping it makes every request return a 500 with
`AI binding missing`.

1. On the worker's page open **Settings** → **Bindings** (older accounts: **Settings** →
   **Variables** → **Bindings**).
2. **Add binding** → choose **Workers AI**.
3. Set **Variable name** to exactly `AI` — uppercase, no spaces. The code reads `env.AI`, so a
   different name silently fails.
4. **Deploy** / **Save and deploy**.

No API token is involved. The binding authorises the worker against your own account.

---

## Step 5 · Add the environment variables

Same **Settings** page, **Variables and Secrets** section. Add these as **plaintext** variables —
neither is a secret:

**`ALLOWED_ORIGINS`**

Comma-separated, no trailing slashes, scheme included:

```
https://girnarholdings.github.io,http://localhost:3000,http://localhost:4599
```

Use the origin your site is actually served from. `*` works for a quick test but means any website
on the internet can spend your Workers AI allowance, so do not leave it that way.

**`MODEL`** *(optional)*

```
@cf/meta/llama-3.1-8b-instruct
```

Any Workers AI text-generation model works. Omit the variable entirely to use the code's default.

Click **Deploy** after saving.

---

## Step 6 · Check it works

The worker's URL is on its dashboard page, of the form:

```
https://fitforge-coach.<your-subdomain>.workers.dev
```

Test it with the origin header a browser would send:

```bash
curl -X POST https://fitforge-coach.<your-subdomain>.workers.dev \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://girnarholdings.github.io' \
  -d '{"question":"How many sets per muscle per week?","snippets":[]}'
```

A JSON body with an `answer` field means you are done.

| What you get | What it means | Fix |
|---|---|---|
| `403` | Origin not in the allow-list | Step 5 — check for a trailing slash or a missing scheme |
| `500` with `AI binding missing` | Binding absent or misnamed | Step 4 — the variable name must be exactly `AI` |
| `405` | Wrong method | The worker only accepts `POST` and `OPTIONS` |
| Browser console CORS error | Same as `403` | The browser's `Origin` must match `ALLOWED_ORIGINS` exactly |

---

## Step 7 · Point the app at it

The app reads `NEXT_PUBLIC_AI_ENDPOINT` **at build time** — it is inlined into the static export,
so setting it after the fact does nothing. Add it to the Pages workflow's build step in
`.github/workflows/pages.yml`:

```yaml
      - name: Build web static export
        run: npm run build -w @fitforge/web
        env:
          NEXT_PUBLIC_BASE_PATH: /FitForge
          NEXT_PUBLIC_SITE_URL: https://girnarholdings.github.io
          NEXT_PUBLIC_DEMO: "1"
          NEXT_PUBLIC_AI_ENDPOINT: https://fitforge-coach.<your-subdomain>.workers.dev
```

Commit, let the deploy run, and Coach will start using the worker for questions the knowledge base
cannot answer. For local development put the same line in `apps/web/.env.local`.

The value is public by design — it is a URL in a client-side bundle. That is why the worker is
protected by an origin allow-list rather than by a secret.

---

## Optional · Deploy from GitHub instead of pasting

If you would rather not re-paste on every change, Cloudflare can build from the repository and
handle the TypeScript itself:

1. **Workers & Pages** → **Create application** → **Import a repository**.
2. Authorise GitHub and pick the FitForge repo.
3. Set **Root directory** to `workers/coach`.
4. Leave the build command empty — `wrangler.toml` already declares `main`, the AI binding and the
   vars, so Cloudflare configures the worker from it.
5. Deploy.

With this path Steps 3–5 are unnecessary: `wrangler.toml` is the source of truth, and pushing to
`main` redeploys. Edit `ALLOWED_ORIGINS` in that file rather than in the dashboard, or the next
deploy will overwrite what you set by hand.

---

## What this does not do

- **It does not make up numbers.** The worker is given retrieved knowledge-base snippets and the
  user's own profile as grounding, and the client never lets it supply a nutrition or training
  figure — see `apps/web/lib/food/assist.ts`. Sets, macros and weights always come from the
  deterministic rules.
- **It is not a dependency.** Every call has a short timeout and a local fallback. A worker that is
  down, rate-limited, or never deployed at all leaves the app working exactly as it does now.
