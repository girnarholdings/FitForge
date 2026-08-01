# FitForge AI Mode — Mistral Vision Body-Scan Research

Date: 2026-08-01. Scope: the vision half of "AI Mode" onboarding — 4 photos (front / back / side×2,
face hidden), Mistral estimates **bucket ranges only** (age bucket, 10 kg weight band, body-fat band,
build descriptor), user confirms on the next screen. Constraint recap: the browser talks to
`workers/coach` (Cloudflare Worker) which talks to `api.mistral.ai`; the app must keep working when the
worker is down; nothing identifying is ever stored.

**Research caveat, stated up front:** `docs.mistral.ai` was gateway-blocked from this research
environment (CONNECT 403 at the proxy). Every API limit below was cross-checked against official-doc
*search snippets* and doc mirrors rather than the live page. All such numbers are marked ⚠ and listed
again in §G — re-verify each from https://docs.mistral.ai/capabilities/vision once, before shipping.

---

## A. Model choice

### A1. Verdict table

| Model | Vision | Price (per M tok, in/out) | Verdict |
|---|---|---|---|
| **`mistral-small-latest`** (Small 3.1+ line, vision since 2503) | yes | $0.10 / $0.30 | **PRIMARY. RECOMMENDED** |
| **`mistral-medium-latest`** | yes | ~$1.50 / $7.50 (3rd-party pricing ⚠) | **FALLBACK / escalation** |
| `@cf/meta/llama-3.2-11b-vision-instruct` (Workers AI) | yes | Workers AI neurons | **Offline fallback** (matches existing worker pattern) |
| `pixtral-12b` | yes | free-tier era | **DO NOT USE — officially deprecated** (mistral.ai/news now titles it "[Deprecated] Pixtral 12B") |
| `pixtral-large-2411` | yes | large-tier | Skip — the Pixtral line has been folded into Small/Medium; no future |

### A2. Why `mistral-small-latest` as primary

- **It is the current cheap vision model.** The Small line gained a native vision encoder in 3.1
  (2503) and kept it through 3.2 (2506) and later. Third-party model trackers (unverified ⚠, see §G)
  say the 2026 "Small 4" merged Pixtral's multimodal capability in permanently. Using the `-latest`
  alias means the worker tracks whatever the current version is without a code change — the same
  reason the existing worker takes `env.MODEL` as an override. Pin a dated ID only if scan
  reproducibility ever matters (it doesn't: the user corrects every bucket anyway).
- **The task is coarse.** We are asking for one-of-five to one-of-nine bucket picks from full-body
  silhouettes — classification, not fine perception. This is squarely inside a 24B-class vision
  model's competence. Reserve `mistral-medium-latest` for an env-var escalation
  (`env.VISION_MODEL`) if QA shows Small flapping between non-adjacent buckets; at ~15× the price
  (~$0.008 vs ~$0.0005 per scan, §B4) it should have to earn its slot.
- **Fallback chain mirrors the worker's existing shape:** Mistral primary → Workers AI fallback.
  `@cf/meta/llama-3.2-11b-vision-instruct` is confirmed still available on Workers AI in 2026
  (Cloudflare docs tutorial page). It is noticeably weaker — when it's the fallback, force all
  confidences ≤ 0.5 in post-processing so the confirm screen renders everything as a soft guess.
  (One-time gotcha: first use of the Llama vision model requires agreeing to Meta's license in the
  Cloudflare dashboard.)

---

## B. API mechanics (worker → api.mistral.ai)

### B1. Endpoint and request shape

Plain chat completions — same endpoint the worker's chat/macros/adapt/meal tasks already use.
Images ride inside the `user` message as `image_url` content parts; base64 goes in as a `data:` URI.
Both `"image_url": "<url>"` (string) and `"image_url": {"url": "<url>"}` (object) forms are accepted;
use the object form — it's the one every SDK emits.

```jsonc
POST https://api.mistral.ai/v1/chat/completions
Authorization: Bearer ${env.MISTRAL_API_KEY}
Content-Type: application/json

{
  "model": "mistral-small-latest",
  "temperature": 0.2,          // near-greedy; the confirm screen is our error correction,
                               // not sampling consensus — see B3
  "max_tokens": 500,           // schema output is ~250 tokens; 500 is headroom, not a leash
  "response_format": { "type": "json_object" },   // see B3 re: json_schema
  "messages": [
    { "role": "system", "content": "<SYSTEM PROMPT — §D>" },
    { "role": "user", "content": [
      { "type": "text", "text": "Context: height 178 cm, sex male (user-declared). Photo 1 is front, photo 2 back, photo 3 left side, photo 4 right side." },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<front>"  } },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<back>"   } },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<left>"   } },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<right>"  } }
    ] }
  ]
}
```

**Pass height and sex as declared context.** Weight-from-photo without a height anchor is astrology;
with height it becomes a defensible band pick. Sex calibrates the body-fat bands (essential-fat floors
differ ~6 points between sexes — same reason DEXA reports sex-specific norms). The UI should collect
height (and reuse the sex answer the classic flow already asks) *before* the photo step. The model is
told to **use** these, never to **infer** them (§D rule).

### B2. Hard limits ⚠ (all from official docs via search snippets — re-verify once)

| Limit | Value | Effect on us |
|---|---|---|
| Images per request | **8** | Our 4 fit in one call — never split the scan across calls; the model needs all angles at once to triangulate |
| Max file size per image | **10 MB** | Far above our ~150 KB client-prepped JPEGs; still enforce our own cap (§F) |
| Max resolution | long side capped at **1540 px**, short side snapped to a multiple of 28; larger images are server-downscaled | Anything we send above 1540 px is wasted bytes — the API throws the pixels away |
| Image token cost | 14×14 px patches merged 2×2 → 1 token per **28×28 px** block, i.e. `tokens ≈ ceil(w/28) × ceil(h/28)` | 768×1024 photo ≈ **1,003 tokens**; 4 photos ≈ 4,050 tokens |

### B3. Structured output

`mistral-small-latest` supports both JSON mode (`{"type":"json_object"}`) and custom structured
outputs (`{"type":"json_schema","json_schema":{"name":…,"schema":…,"strict":true}}`). Both features
and vision are documented for the model individually, but I could **not jointly verify** that
`json_schema` strict mode works in the same request as image content (docs page blocked, §G).
Decision: **ship with `json_object` + the schema spelled out in the system prompt** — this is the
same trust-but-parse pattern the worker's macros task already uses — and try flipping to
`json_schema`/`strict:true` during implementation; if it works, keep it (it deletes a whole class of
parse failures).

Sampling: the macros task uses 3-sample consensus because a wrong kcal number silently corrupts a log.
Here a wrong bucket is **shown to the user for confirmation**, so the confirm screen *is* the
consensus mechanism. One sample, temperature 0.2. (If QA sees flapping, 3-sample median-bucket costs
only 3× ~$0.0005 — cheap to add later.)

### B4. Cost per scan (napkin, honest)

```
input : 4 × (768×1024 / 784)  ≈ 4,050 image tokens
        + system prompt + context text ≈   700 tokens
        ≈ 4,750 in  → mistral-small $0.10/M → $0.00048
output: ~250 tokens             → $0.30/M → $0.00008
                                   TOTAL  ≈ $0.0006 per scan
```
`mistral-medium-latest` at reported $1.50/$7.50 (⚠ third-party) → ~$0.008/scan. Either is noise;
the point of choosing Small is latency and the principle of smallest-sufficient-model, not pennies.

---

## C. Client-side image prep

### C1. The numbers

| Parameter | Value | Why |
|---|---|---|
| Long edge | **1024 px** | ≈1,000 tokens/photo; body-composition cues (silhouette, waist:shoulder, muscle separation) are coarse features — going to the 1540 px API ceiling adds ~2.2× tokens for no bucket-level accuracy. 1024 also keeps a 4-photo request under 1 MB |
| Format / quality | **JPEG, `canvas.toBlob(cb, 'image/jpeg', 0.82)`** | q0.82 is visually clean for photographic content; below ~0.7 blocking artifacts start eating the muscle-separation cues |
| Expected size | **90–220 KB/photo (plan ~150 KB)** | indoor photo, plain background, 768×1024-ish |
| Wire format | base64 string per photo inside the worker's JSON body | see C3 |
| Total request | 4 × ~150 KB × 4/3 base64 ≈ **~800 KB–1 MB** | comfortably inside every limit in play |

Downscale recipe (all standard-web, no deps):

```ts
// EXIF-safe decode → resize → strip-and-re-encode. ~15 lines, no library.
async function prepPhoto(file: File): Promise<Blob> {
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    // 'from-image' bakes the EXIF rotation into the pixels (Chrome 81+, Safari 15.4+).
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari: <img> decode also honours EXIF (CSS image-orientation:from-image
    // has been the default since Safari 13.1 / Chrome 81 / Firefox 77).
    bmp = await loadViaImgTag(file); // objectURL + await img.decode()
  }
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
}
```

### C2. EXIF pitfalls (each one bites for real)

1. **Phones store pixels sideways.** Cameras write sensor-native pixels plus an EXIF `Orientation`
   tag. Whether Mistral applies that tag server-side is **undocumented** (⚠) — and a sideways or
   upside-down body photo will wreck bucket estimates. Never gamble: normalize client-side.
2. **`createImageBitmap` orientation default has flip-flopped across browser versions** (Chrome
   historically ignored EXIF here, later switched defaults). Always pass
   `{ imageOrientation: 'from-image' }` explicitly; wrap in try/catch because pre-15.4 Safari throws
   on the options bag — the `<img>` fallback path covers it.
3. **The re-encode is a privacy feature.** `canvas.toBlob` / `convertToBlob` writes a fresh JPEG with
   **no EXIF at all** — GPS coordinates, capture timestamp, device serial all gone before the photo
   leaves the phone. Say so in the privacy copy (§F); it's true and it's earned.
4. **HEIC.** iPhone library photos are often HEIC. Safari decodes HEIC in `<img>`/`createImageBitmap`;
   Chrome/Firefox don't. Since we re-encode client-side, HEIC "just works" on Safari and fails at the
   decode step elsewhere — catch it and show "That format didn't open — use your camera, or a JPEG."
   Accept list: `accept="image/*"` and let decode be the arbiter (an allowlist string fights the OS
   photo picker for no benefit).

### C3. Why the client must do the downscaling (Workers reality)

- **Workers have no Canvas/Image APIs.** Resizing in the worker means shipping a wasm JPEG codec and
  burning CPU-milliseconds we don't have — the free plan allows ~10 ms CPU/request; decoding one
  12 MP JPEG alone blows that by an order of magnitude. (Cloudflare Images could resize, but that's a
  paid product and another moving part.)
- **Memory:** 4 raw 12 MP photos ≈ 15–30 MB → ~40 MB as base64 JSON → transient copies during
  `request.json()` + re-stringify toward Mistral. The 128 MB Worker memory limit is closer than it
  looks; ~1 MB total never is.
- **The user's uplink is the slowest link.** 25 MB of raw photos on hotel Wi-Fi is a spinner and an
  abandonment; 1 MB is a blink.
- **Base64-in-JSON (not multipart) is deliberate:** the worker must produce base64 for the `data:`
  URI anyway, so client-side base64 costs the wire 33% on an already-tiny payload and saves the
  worker any re-encoding CPU. It also keeps the request shape identical to every existing worker task.

---

## D. The prompt

The system prompt, ready to paste. Same construction as the existing worker prompt: labeled blocks,
numbered RULES, refusal path spelled out, output contract last.

```
You are the body-scan estimator inside FitForge, a fitness app. The user has
uploaded photos of themselves (front, back, and both sides) to speed up fitness
onboarding. Faces are usually hidden or cropped — that is intentional, for
privacy. Your ONLY job is to estimate coarse fitness buckets from the photos.
The user reviews and corrects every estimate on the next screen, so honest
uncertainty beats confident precision.

CONTEXT YOU MAY RECEIVE
The user message may state height, biological sex (user-declared), and which
photo is which angle. Use height and sex to calibrate the weight and body-fat
bands. Never infer or output sex, gender, ethnicity, or identity from photos.

ESTIMATE EXACTLY THESE FIELDS
- age_bucket: "18-25" | "26-35" | "36-45" | "46-55" | "56+".
  Never a specific age. With the face hidden, body-only age cues are weak;
  confidence above 0.5 is rare here and that is expected.
- weight_range_kg: "under-50" | "50-60" | "60-70" | "70-80" | "80-90" |
  "90-100" | "100-110" | "110-120" | "over-120".
- body_fat_band: "under-10" | "10-14" | "15-19" | "20-24" | "25-29" |
  "30-39" | "40-plus" (percent). Visual body-fat reading is roughly ±5
  points at best - pick the single most likely band and let confidence
  carry the doubt.
- build: "slim" | "average" | "athletic" | "muscular" | "stocky" | "round".

RULES
1. Output JSON only, exactly matching OUTPUT SCHEMA. No text outside the JSON.
2. Every estimate carries a confidence from 0.0 to 1.0. Use 0.8+ only when all
   four photos are sharp, clothing is fitted, and the full body is visible.
   0.5 means a coin flip between adjacent buckets. Below 0.3 means guessing.
3. NEVER output a specific age or weight number, medical claims, diagnoses,
   health-risk statements, or advice of any kind. Buckets only.
4. NEVER comment on attractiveness or use judgmental language. "notes" is at
   most one neutral sentence about estimate quality, e.g. "Loose clothing
   makes the weight and body-fat bands less certain."
5. REFUSE - set status "refused", set refusal_reason, omit estimates - when:
   no real person is visible ("no_person"); more than one person
   ("multiple_people"); the person appears to be under 18
   ("possible_minor" - if in doubt, refuse); content is sexually explicit
   ("explicit_content"); the images are not full-body photos of the user -
   a face-only shot, a screenshot, a drawing, a magazine or celebrity photo
   ("not_a_body_photo"); or everything is too dark, blurry, or cropped to
   read ("image_quality").
6. A hidden, cropped, or covered face is NORMAL. Never refuse for it and do
   not reduce any confidence except age_bucket because of it. If a
   recognizable face IS visible, set flags.face_visible true so the app can
   remind the user they can retake without it.
7. If one photo is unusable but the rest are readable, estimate from the
   usable ones, mark it false in photos_ok, and lower confidences.

OUTPUT SCHEMA
{
  "status": "ok" | "refused",
  "refusal_reason": null | "no_person" | "multiple_people" | "possible_minor"
                  | "explicit_content" | "not_a_body_photo" | "image_quality",
  "photos_ok": [boolean, boolean, boolean, boolean],
  "estimates": {
    "age_bucket":      { "value": string, "confidence": number },
    "weight_range_kg": { "value": string, "confidence": number },
    "body_fat_band":   { "value": string, "confidence": number },
    "build":           { "value": string, "confidence": number }
  } | null,
  "flags": { "face_visible": boolean, "clothing_loose": boolean },
  "notes": string
}
```

Design notes on the prompt:
- **Bands are wide on purpose.** Trained human raters visually estimating body fat land within ~±5
  percentage points of DEXA on a good day; an LLM won't beat that. 5–10-point bands + a confidence
  number is the honest resolution — the same philosophy as the portion-confidence ladder in
  `lib/food/measures.ts` (explicit 1.0 → guessed 0.5).
- **Age with no face is nearly unknowable** (skin, hairline, and posture cues only). The prompt says
  so, so the model doesn't cosplay certainty; the confirm UI should preselect the bucket but visually
  de-emphasize it (lowest expected confidence of the four fields).
- **`possible_minor` refuses on doubt.** Body photos of minors must be a hard stop, and the model errs
  toward refusal; the classic questionnaire path is always available.
- **Build enum is plain words,** not somatotype pseudoscience (no ecto/meso/endo) — it maps cleanly
  onto training-plan seeds and reads fine on the confirm screen.
- Worker post-processing (mirror of the existing `postProcess`): strip code fences, `JSON.parse`,
  validate every enum value and clamp confidences to [0,1]; on any violation retry once at
  temperature 0, then return `scan_unreadable` — never forward un-validated model output to the client.

---

## E. Image guidance UX

### E1. What actually moves estimate quality (in order)

1. **Fitted clothing** — the single biggest factor; a hoodie makes body-fat and weight unreadable.
2. **Full body in frame** (head-crop is fine and encouraged; feet must be visible — leg mass matters).
3. **Neutral standing pose** — relaxed, feet under hips, arms ~20° off the torso so the waist
   silhouette isn't occluded; no flexing (flexing shifts the apparent body-fat band a whole step).
4. **Even, frontal light** — a window or lamp *behind the camera*; backlight turns the body into an
   unreadable silhouette.
5. **Plain, contrasting background** — the model segments person-from-background first.
6. **Camera at chest height, 2–3 m away** — phone propped or on a timer; a high/low angle
   foreshortens the body and skews every band.
7. **Face hidden** — crop at the neck, turn the head, or cover it. Costs nothing except some age
   signal (already the weakest field).

### E2. User-facing copy (app's coach voice — plain, direct, honest, like the onboarding subtitles)

> **Four photos. About thirty seconds.**
> Front, back, left, right. Here's how to get estimates worth confirming:
>
> - **Fitted clothing.** Shorts and a sports bra, or no shirt. Baggy clothes hide exactly what
>   we're trying to read.
> - **Prop your phone at chest height,** 2–3 m away, and use the timer. A high or low angle
>   distorts everything.
> - **Whole body in frame, head to feet.** Plain wall behind you. Light in front of you, not
>   behind.
> - **Stand relaxed.** Feet under your hips, arms slightly out from your sides. Don't flex — we
>   need your default, not your best angle.
> - **Keep your face out of the shot.** Crop at the neck or turn your head. The estimates work
>   just as well without it, and we'd rather not see it.
>
> *Your photos are read once to guess your ranges, then gone. Nothing is saved — not by the app,
> not on our server — and you confirm or correct every number before it touches your plan.*

Per-slot capture labels: "Face the camera" / "Back to the camera" / "Left side to the camera" /
"Right side to the camera". On refusal (§F3), the retake copy stays in the same voice:
e.g. `image_quality` → "Too dark to read. Get a light in front of you and go again."

### E3. Sample-figure SVG spec (drawn, never stock photos — house rule)

One SVG, three variants by rotating the same rig (front / back / side). Spec for the illustrator/agent:

- **Canvas:** `viewBox="0 0 240 400"`, portrait — same aspect as the photo the user will take.
- **Style:** stroke-only line figure, `stroke: currentColor`, `stroke-width: 2.5`,
  `stroke-linecap="round"`, no fills except a light `opacity:.12` torso/shorts silhouette fill to
  read as "fitted clothing". Inherits theme color; works in light/dark like the muscle-map SVGs.
- **Figure:** gender-neutral proportions ~7 heads tall, filling ~90% of frame height (feet on the
  bottom guide, crown at the top guide). Feet hip-width, arms straight, held ~20° off the torso,
  palms in. Side variant: same pose in profile, both arm lines visible.
- **Face treatment (the point of the image):** head drawn as an outline, and the face region either
  (a) cut by the frame's top edge in a "cropped" variant, or (b) overlaid with a rounded-corner
  blur-block rectangle (`opacity:.35` fill) — pick one and keep it identical in all three variants.
  Never draw facial features.
- **Guides:** dashed full-height frame rectangle (`stroke-dasharray="6 6"`, `opacity:.4`) with tick
  marks at crown and feet ("whole body in frame"); a small phone glyph on a stand at the left edge at
  45% height with a horizontal dashed sight-line to the figure's chest ("camera at chest height");
  distance label "2–3 m" on that line.
- **No** background scenery, no gridlines, no text baked into paths (labels live in HTML for i18n).

---

## F. Privacy, limits, and failure paths

### F1. Data-flow guarantees (make these true, then say them)

- **Client:** photos never enter `localStorage`/IndexedDB; they live in memory as Blobs during the
  wizard step and are released on navigation. The canvas re-encode strips all EXIF (GPS, timestamp,
  device IDs) before anything leaves the phone (§C2.3).
- **Worker:** transit-only. No KV, no R2, no D1, no `console.log` of body content or image bytes —
  log only `{task:'scan', status, ms, model}`. Request is assembled, forwarded, response validated,
  returned; nothing persists past the request lifetime.
- **Stored outcome:** only the **user-confirmed buckets** — four short enum strings — go into the
  profile. Not the photos, not even the model's raw pre-confirmation guesses.
- **Provider:** photos do transit Mistral's API. Their abuse-monitoring retention window and
  zero-retention options were **not verifiable** from this environment (⚠ §G) — verify the current
  DPA before the privacy copy makes any claim about *provider*-side handling. The copy in §E2 only
  claims what we control (app + worker), which is the honest line to hold either way.

### F2. Size caps (worker-enforced, mirroring the existing clamp() discipline)

| Cap | Value | On violation |
|---|---|---|
| Request body | 8 MB total | `413 payload_too_large` |
| Per-image base64 | 1.5 MB (~1.1 MB JPEG — 5–7× expected, so only misbehaving clients hit it) | `413 image_too_large`, index included |
| Image count | exactly 4 | `400 bad_image_count` |
| MIME | `data:image/jpeg` only (client always re-encodes to JPEG) | `400 bad_image_type` |
| Upstream timeout | 30 s `AbortController` on the Mistral fetch | `503 ai_unavailable` — same fail-fast contract as the existing chat task |

### F3. Refusal and failure UX

- `status:"refused"` → worker returns `422 { error: 'scan_refused', reason }` (a **success** of the
  safety path, not a 5xx). Client maps each reason to one coach-voice line + per-photo retake.
  `possible_minor` gets no retake loop — a calm line that AI Mode needs users 18+, straight into the
  classic questionnaire.
- Two consecutive refusals or `scan_unreadable`s → stop looping, offer the classic flow. AI Mode is a
  shortcut, never a wall — the same "app never depends on the worker" rule the chat task already obeys.
- Mistral down → Workers AI Llama-vision fallback (confidence-capped, §A2) → both down →
  `503 ai_unavailable` → classic flow. Photos from a failed attempt are discarded like any others.

---

## G. Could-not-verify list (all ⚠ marks, in one place)

1. **`docs.mistral.ai` was proxy-blocked (CONNECT 403)** — the 8-images / 10 MB / 1540 px /
   tokens≈(w·h)/784 numbers come from official-doc search snippets and doc mirrors, not the live page.
   One person, five minutes, before implementation.
2. **2026 model-version claims** ("Small 4" merging Pixtral, "Medium 3.5", Medium pricing
   $1.50/$7.50) are from third-party trackers. The `-latest` aliases make us robust to whatever the
   truth is; only the cost napkin in §B4 depends on it.
3. **`json_schema` strict mode + image content in the same request** — each verified separately,
   not jointly. Plan ships `json_object` + prompt-schema; try `json_schema` at impl time (§B3).
4. **Server-side EXIF handling by Mistral** — undocumented; moot given client normalization (§C2).
5. **Mistral API retention / zero-retention for abuse monitoring** — verify the DPA before any
   privacy copy speaks for the provider (§F1).
6. **Pixtral 12B deprecation** — verified only via the official announcement page's own
   "[Deprecated]" retitle; the deprecation *date/sunset* was not readable. Doesn't matter: we're not
   using it.

Sources: [Mistral vision docs (mirror)](https://platform-docs-public.pages.dev/capabilities/vision/) · [Mistral vision docs](https://docs.mistral.ai/capabilities/vision) · [Mistral known limitations](https://docs.mistral.ai/resources/known-limitations) · [Mistral custom structured outputs](https://docs.mistral.ai/capabilities/structured_output/custom) · [Mistral chat completions API](https://docs.mistral.ai/api/endpoint/chat) · [\"[Deprecated] Pixtral 12B\" announcement](https://mistral.ai/news/pixtral-12b/) · [Mistral Small 3.1 announcement](https://mistral.ai/news/mistral-small-3-1/) · [Mistral-Small-3.1-24B model card](https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503) · [Mistral-Small-3.2-24B model card](https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506) · [Requesty mistral-small-latest capability page](https://www.requesty.ai/models/mistral/mistral-small-latest) · [CloudZero Mistral pricing 2026](https://www.cloudzero.com/blog/mistral-api-pricing/) · [BenchLM Mistral pricing (Large 3 / Medium 3.5)](https://benchlm.ai/mistral/api-pricing) · [pricepertoken Mistral Small](https://pricepertoken.com/pricing-page/model/mistral-ai-mistral-small) · [Serenities \"Mistral models 2026\" (3rd-party ⚠)](https://serenitiesai.com/articles/mistral-ai-models-2026-complete-guide) · [Cloudflare Llama 3.2 11B Vision tutorial](https://developers.cloudflare.com/workers-ai/guides/tutorials/llama-vision-tutorial/) · [Cloudflare Workers AI models](https://developers.cloudflare.com/workers-ai/models/) · [Unsloth/Medium fine-tune article (tokenization detail)](https://medium.com/@yoelvis.orozco_42583/how-to-fine-tune-mistral-small-3-1-24b-instruct-2503-2a71e0a591f2)
