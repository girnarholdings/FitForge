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
seat. The worker caps generation at 320 tokens for chat and 220 per macro sample precisely so a
runaway loop cannot become a bill. A macro estimate costs three samples (deliberately — the answer
is the median of three independent draws, which is what makes it trustworthy).
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

> **If you would rather not build at all**, use the GitHub-import path below — Cloudflare
> compiles the TypeScript for you and this whole step disappears.
>
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
https://goforge.fit,http://goforge.fit,https://girnarholdings.github.io,http://localhost:3000,http://localhost:4599
```

Use the origin your site is actually served from — since the custom domain was added that is
`goforge.fit` (the `http://` form matters until Enforce HTTPS is on; `github.io` only redirects
now but stays allowed for the probe). `*` works for a quick test but means any website on the
internet can spend your Workers AI allowance, so do not leave it that way.

**`MODEL`** *(optional — and best left unset)*

The worker carries a fallback chain and tries each model in turn, so it does not need to be told
which one to use. Setting `MODEL` puts your choice at the front of that chain; the chain still backs
it up, so a pin that later gets retired degrades instead of breaking. **If you previously set this to
`@cf/meta/llama-3.1-8b-instruct`, delete the variable** — see the deprecation section below.

Click **Deploy** after saving.

---

## Step 5b · Using your own Mistral key instead (optional, and better)

Workers AI's free tier is small and its model catalog turns over. If you have a Mistral API key, the
worker will prefer it and fall back to Workers AI only if Mistral is unreachable.

1. In the worker's **Settings → Variables and Secrets**, click **Add**.
2. Name it exactly `MISTRAL_API_KEY`.
3. Set the type to **Secret**, not plaintext. Secrets are write-only afterwards — Cloudflare will
   never show the value again, which is the point.
4. Paste the key. Click **Deploy**.

Optionally add `MISTRAL_MODEL` as a plaintext variable to pick a model; the default is
`mistral-small-latest`.

**Why the key goes here and nowhere else.** The web app is a static export — every environment
variable given to it is inlined into JavaScript that every visitor downloads, so a key in the app is
a key published on the internet. The worker is the only server-side surface this project has. The
browser talks to the worker, the worker talks to Mistral, and the key never leaves Cloudflare.

You can confirm which backend is live without spending a request; the health check reports it:

```bash
curl https://fitforge-coach.<your-subdomain>.workers.dev
# {"ok":true,"service":"fitforge-coach","provider":"mistral","model":"mistral-small-latest",...}
```

`"provider":"mistral"` means the secret was picked up. `"provider":"workers-ai"` means it was not —
check the name is exactly `MISTRAL_API_KEY` and that you redeployed after adding it.

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
  -H 'Origin: https://goforge.fit' \
  -d '{"question":"How many sets per muscle per week?","snippets":[]}'
```

A JSON body with an `answer` field means you are done.

| What you get | What it means | Fix |
|---|---|---|
| `403` | Origin not in the allow-list | Step 5 — check for a trailing slash or a missing scheme |
| `500` with `no_provider` | No `AI` binding **and** no Mistral key | Step 4, or step 5b |
| `503` with `deprecated` | The model was retired by Cloudflare | See below |
| `405` | Wrong method | The worker only accepts `POST` and `OPTIONS` |
| Browser console CORS error | Same as `403` | The browser's `Origin` must match `ALLOWED_ORIGINS` exactly |

### `AiError: 5028: This model was deprecated`

This is what took the Coach down. The health check said `ok`, the binding was present, the origins
were right — and every real question came back:

```
503 {"error":"ai_unavailable",
     "detail":"AiError: 5028: This model was deprecated on 2026-05-30. Please use an alternative model."}
```

Note the shape of it: **nothing was misconfigured and nothing had changed.** The worker was pinned to
`@cf/meta/llama-3.1-8b-instruct`, Cloudflare withdrew that model, and a service that had worked for
months stopped. There is no key involved anywhere in this path — Workers AI authorises through the
binding against the account that owns the worker — which is why hunting for a bad "AI key" finds
nothing to fix.

The worker now tries a chain of models and skips retired ones, so this should not recur. If you see
it anyway:

1. **Delete any `MODEL` variable** you have set. A stale pin is tried first, and while the chain will
   fall past it, the pin is pure cost.
2. Check the `detail` — it lists every model tried and why each refused, so you can see whether the
   whole chain is stale or the account simply has no Workers AI access.
3. `GET` the worker: the `fallbacks` array shows the chain it would walk.
4. If Cloudflare has retired the lot, adding a `MISTRAL_API_KEY` (step 5b) sidesteps the catalog
   entirely.

---

## Step 7 · Point the app at it

The app reads `NEXT_PUBLIC_AI_ENDPOINT` **at build time** — it is inlined into the static export,
so setting it after the fact does nothing. Add it to the Pages workflow's build step in
`.github/workflows/pages.yml`:

```yaml
      - name: Build web static export
        run: npm run build -w @fitforge/web
        env:
          # Base path is EMPTY while the site serves from the custom domain goforge.fit;
          # it goes back to /FitForge (with SITE_URL https://girnarholdings.github.io) only
          # if the custom domain is ever removed. See the comments in pages.yml.
          NEXT_PUBLIC_BASE_PATH: ""
          NEXT_PUBLIC_SITE_URL: https://goforge.fit
          NEXT_PUBLIC_DEMO: "1"
          NEXT_PUBLIC_AI_ENDPOINT: https://fitforge-coach.<your-subdomain>.workers.dev
```

Commit, let the deploy run, and Coach will start using the worker for questions the knowledge base
cannot answer. For local development put the same line in `apps/web/.env.local`.

The value is public by design — it is a URL in a client-side bundle. That is why the worker is
protected by an origin allow-list rather than by a secret.

---

## Deploy from GitHub instead of pasting

Cloudflare can build from the repository and handle the TypeScript itself, so you never re-paste.

1. **Workers & Pages** → **Create application** → **Import a repository**.
2. Authorise GitHub and pick the FitForge repo.
3. Set **Root directory** to `workers/coach`.
4. Leave the build command as the default (`npx wrangler deploy`). `wrangler.toml` already declares
   `main`, the AI binding and the vars, so Cloudflare configures the worker from it.
5. Deploy.

With this path Steps 3–5 above are unnecessary: `wrangler.toml` is the source of truth and pushing
to `main` redeploys. Edit `ALLOWED_ORIGINS` in that file rather than in the dashboard, or the next
deploy overwrites what you set by hand.

---

## If the Cloudflare build is failing

Work down this list — they are ordered by how often each one is the cause.

### 1. `workers/coach` had no `package.json` (fixed in this repo)

This is the most likely cause of a build that fails immediately, and it has now been fixed. The
directory previously contained only `src/`, `wrangler.toml` and a README. Cloudflare's build runs an
install in the **root directory** you configured, and with no `package.json` there it fails before
it ever reaches wrangler — typically with `npm ERR! enoent ENOENT: no such file or directory, open
'/opt/buildhome/repo/workers/coach/package.json'` or `Error: No package.json found`.

`workers/coach/package.json` and its lockfile now exist, pinning wrangler and providing `deploy`,
`dev` and `build` scripts. **Pull the latest `main` and retry the build** — if this was your failure,
that alone fixes it.

Note it is deliberately NOT a workspace of the root `package.json` (`workspaces` is
`apps/web`, `packages/*`, `seed`). The worker deploys on its own from its own directory, and adding
it to the workspace would make Cloudflare's install try to resolve the entire monorepo.

### 2. Root directory set to the repo root

If **Root directory** is blank or `/`, Cloudflare installs the whole monorepo and then cannot find
`wrangler.toml`. Symptom: `Could not find wrangler.toml` or a very long install that ends in a
Next.js build error — the giveaway that it is building the wrong thing entirely. Set it to
`workers/coach`.

### 3. Build command overridden with something Pages-shaped

Workers Builds and Pages Builds are different products with similar screens. A worker configured
with `npm run build` (there is no such script at the repo root that produces a worker) or with an
output directory set will fail. For this worker the command is `npx wrangler deploy` and there is no
output directory.

### 4. Node version

`wrangler` 4.x needs Node 20+. If the build log shows a syntax error inside wrangler itself, set the
`NODE_VERSION` build variable to `22` to match what this repo builds with everywhere else.

### 5. It is not the build — it is the binding

A build that SUCCEEDS and a worker that then 500s on every request is Step 4, not a build problem.
`wrangler.toml` declares the AI binding, so the GitHub path configures it for you; the dashboard
paste path does not, and that is the step people miss.

### Reading the actual error

The build log is on the worker's **Deployments** tab — open the failed deployment and expand the
build output. The first red line is the real error; everything after it is fallout. If none of the
above matches, send me that line.

---

## What this does not do

- **It does not make up numbers.** The worker is given retrieved knowledge-base snippets and the
  user's own profile as grounding, and the client never lets it supply a nutrition or training
  figure — see `apps/web/lib/food/assist.ts`. Sets, macros and weights always come from the
  deterministic rules.
- **It is not a dependency.** Every call has a short timeout and a local fallback. A worker that is
  down, rate-limited, or never deployed at all leaves the app working exactly as it does now.


---

## What the worker actually does (v2)

Two tasks through one endpoint:

**Chat** (`POST {question, snippets, profile, intent?}`) — the system prompt is assembled from an
intent-routed template library (volume, technique, nutrition, progression, recovery, motivation,
personalize, meal ideas, general). Each template carries a strict markdown OUTPUT SHAPE — bold
numbers, dash bullets, a closing `**Next:**` action line — because free instruct models follow
skeletons far better than prose rules. The client renders exactly that subset and nothing else.

**Macros** (`POST {task:"macros", food, quantity?}`) — three parallel samples at three
temperatures, each sanity-gated (kcal must agree with 4·P + 4·C + 9·F, else it is recomputed from
the macros), answered as the per-field median with the min–max carried as an honest range and a
spread-based confidence. Fewer than two sane samples refuses (`estimate_unreliable`) rather than
guessing; a majority of `not_food` verdicts is a 422.
