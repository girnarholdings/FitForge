# AI-Mode Onboarding + Diet — the build contract

Synthesized 2026-08-01 from the research fleet. Detail lives in docs/RESEARCH-DIET.md,
docs/RESEARCH-RECIPES.md, docs/RESEARCH-VISION.md — READ YOUR SCOPE'S DOC FULLY. This contract
pins the interfaces between implementers; where it and instinct disagree, the contract wins.

## The feature in one paragraph

Onboarding forks at the welcome screen: **Old School** (the current flow, byte-for-byte
untouched) or **AI Mode**. AI Mode: guided photo capture (front/back/side×2, face hidden,
client-downscaled) → the worker's new `bodyscan` task (Mistral vision primary, Workers-AI vision
fallback) returns BUCKET estimates only (age bucket, weight band, body-fat band, build) → a
confirm screen where the user can just move past pre-filled chips (plus the questions vision
cannot answer: height band, sex, dietary preference, where they train) → ranked top-3 goals →
the EXISTING deterministic generators produce the training plan AND a new 7-day rotating diet
plan from a 100-recipe curated library, with per-dish swaps. The AI trainer gets the diet plan
in its context. Never a specific age anywhere — buckets only, in UI copy and in data.

## Laws

1. **Old School untouched.** Existing onboarding specs must pass unmodified (except the welcome
   screen gaining the mode fork).
2. **Buckets, never numbers, in AI-Mode copy** ("26–35", "75–85 kg"). Midpoints feed the math
   internally (research: coarseness is inside Mifflin's own error).
3. **AI advises, arithmetic decides.** Vision output only pre-fills chips the user confirms;
   plan + diet come from deterministic generators.
4. **Privacy**: photos are downscaled + EXIF-stripped client-side, sent once, never stored by
   the worker (no KV/R2/logging of image bytes), never in localStorage. Face-hidden guidance is
   mandatory copy. Refusal path (incl. `possible_minor` on any doubt) exits to Old School
   gracefully.
5. **Diet red lines** (research §6, enforced in code): kcal ≥ max(BMR, sex floor 1500/1200);
   BMI<18.5 → refuse cut stance; no "cheat/clean/detox/guilt" language anywhere; no punitive
   auto-tightening; dietary prefs are HARD filters.

## Pinned interfaces

### Worker `bodyscan` task (owner: W1)
Request: `{task:'bodyscan', images: string[1..4] (data:image/jpeg;base64 URIs, ≤2MB each after
client prep), shots?: ('front'|'back'|'left'|'right'|'selfie')[] (one label per image; absent =
legacy four-photo order), heightCm?: number, sex?: 'male'|'female'|'other', model?, idToken?}`.
The worker builds a PROMPT BUNDLE from the shot labels: full four-angle set / partial set
(missing angles skipped on purpose, uncertainty widened) / lone selfie (face EXPECTED, read is
face+neck+shoulders+chest+arms, never refused for not-full-body; weight/body-fat confidence
tiers hard-capped below 'high', age exempt — the face is a real age cue).
Response 200: `{ageBucket:'18-25'|'26-35'|'36-45'|'46-55'|'56+', weightBandKg:{low:number,
high:number} (10kg bands), bodyFatBand:'<12'|'12-18'|'18-25'|'25-32'|'32+',
build:'lean'|'athletic'|'muscular'|'higher-fat'|'average', confidence:{age,weight,bodyFat:
'high'|'medium'|'low'}, notes:string[], provider, model}`.
Errors: 422 `{error:'refused', reason:'not_person'|'possible_minor'|'inappropriate'|
'unreadable'}` · 503 ai_unavailable. Health `tasks` gains 'bodyscan'. Primary
`mistral-small-latest`; fallback `@cf/meta/llama-3.2-11b-vision-instruct`; NEVER Pixtral
(deprecated). Prompt per RESEARCH-VISION (JSON-only, bucket enums, refusal enum, hidden-face-
is-normal, no medical claims).

### Web scan client (owner: W3) — `apps/web/lib/scan/`
`prepareScanImage(file: File): Promise<string>` (createImageBitmap imageOrientation:'from-image'
with <img> fallback → 1024px long edge → JPEG q0.82 data URI; strips EXIF by re-encode).
`askBodyScan(images: string[], opts): Promise<BodyScanResult>` (same never-throw/status pattern
as lib/food/aiParse.ts; 45s timeout).

### Diet engine (owner: W2) — `apps/web/lib/diet/`
- `recipes.ts`: `export interface Recipe {id,name,slot,cuisine,per_serving:{kcal,protein_g,
  carbs_g,fat_g},serving_label,tags:string[],effort,ingredients:string[],method:string[],
  swap_group:string}`; `export const RECIPES: Recipe[]` — the validated 100-recipe corpus at
  /tmp/claude-0/-home-user-Project-Map/89c0889e-ac71-577a-a91a-f56d8f3b81e6/scratchpad/recipes.json
  (copy it in verbatim as data; do not edit recipes except to fix an outright error).
- `plan.ts`: `generateDietPlan(input:{targets:NutritionTargets, weightKg:number,
  stance:'cut'|'lean-gain'|'recomp'|'endurance'|'maintain', prefs:DietPrefs}): DietPlan` —
  7-day rotating template per RESEARCH-DIET §2/§4: 2 alternating breakfasts, leftover-paired
  lunches, 5-6 dinners, snacks to fill; day kcal ±max(100,5%), protein −5/+25g, mains ≥0.4g/kg
  protein; `DietPrefs={base:'omnivore'|'pescatarian'|'vegetarian'|'vegan', avoid:string[]
  (dairy_free|gluten_free|halal_friendly|nut_free|shellfish_free)}` as hard filters.
- `swaps.ts`: `swapCandidates(plan:DietPlan, day:number, slot:MealSlotName): Recipe[]` (≤6
  ranked; same slot, prefs-compatible, |Δkcal|≤max(75,15%), protein ≥−8g & mains keep 0.4g/kg,
  2-day no-repeat).
- `store.ts`: key `fitforge.diet.v1` `{version:1, plan:DietPlan, prefs:DietPrefs,
  stance:string, generatedAt:string}` with React hook `useDietPlan()`, `setDietPlan()`,
  `applySwap(day,slot,recipeId)`; normalize-on-read; writes via safeSetItem. NOT sync-denylisted
  (a diet plan is not health data).
- `stance.ts`: `stanceForGoals(rankedGoals: GoalType[], bodyFatBand?: string)` per RESEARCH-DIET
  §1.1 table (recomp detection included).
- `DietPlan = {days: Array<{meals: Array<{slot:MealSlotName, recipeId:string,
  servings:number}>}>}` (7 days, servings usually 1, may be 1.5/2 to hit kcal).
- packages/shared macros rule changes (research §1: recomp stance row, vegan +0.2 g/kg cap 2.2,
  endurance fat 0.25, BMR clamp) — W2 owns packages/shared/src/rules/macros.ts + its tests.

### Onboarding fork (owner: W3)
- packages/shared ONBOARDING_STEPS gains `ai_photos`, `ai_confirm` (W3 owns the schema edit —
  coordinate risk noted: W2 touches rules/macros.ts, W3 touches schemas; different files, same
  package).
- Welcome screen: mode fork (two cards: "Old school" → existing flow; "AI Mode" → ai_photos).
  Old-school step order unchanged.
- ai_photos: two modes. FULL BODY — guidance per RESEARCH-VISION UX copy (fitted clothing,
  full body, plain background, camera chest height 2-3m, FACE HIDDEN — "estimates work fine
  without your face"), drawn SVG sample figure (house 1.75-stroke grammar), 4 capture slots
  (front/back/side/side) of which ONLY FRONT IS REQUIRED — back/sides carry an Optional tag
  and skipping them never gates the scan. SELFIE — one face-and-upper-body slot, "just get
  something in to get started" copy, face expected (no face-hiding rule shown), privacy line
  covers the face explicitly. All inputs are `<input type=file accept="image/*">` WITHOUT
  `capture`, so the OS offers camera AND photo library (the upload path). The scan call labels
  every image via `shots`. Refusal → offer Old School.
- ai_confirm: pre-filled chips (age bucket, weight band, body-fat band from scan; each labeled
  "estimated — tap to change"), plus height band (5cm), sex, dietary preference (base + avoid
  tags), "where do you train" (gym/home basics/bodyweight → equipment defaults), experience
  derived from build bucket (muscular→intermediate else beginner, changeable). Schedule
  defaults: 4 days (Mon/Tue/Thu/Fri) 60min — editable later in settings, said in copy.
- goals step reused with "pick up to 3, ranked" in AI-Mode context; then plan_preview → done.
  On completion: existing generatePlan(draft) + generateDietPlan(...) both run; land on Today.

### Diet UI + coach tie-in (owner: W4)
- Nutrition screen gains a "Plan" surface (design in the ledger/card grammar; no new visual
  language): today's planned meals with recipe cards (name, serving_label, macros, effort,
  glyph via iconForFood on name), Swap button per dish → sheet listing swapCandidates with
  macro deltas, "Log this meal" → writes the existing NutritionLog rows via the normal path
  (food_id null, custom_name = recipe name, macros from per_serving×servings), full catalog
  browser (filtered by prefs, searchable) with "use for <slot> today".
- Coach tie-in: the coach chat context (lib/kb client context assembly used by CoachView)
  gains a compact diet summary when a plan exists: stance, today's meals (names+macros),
  targets — so "what should I eat tonight / swap my dinner" answers are grounded in THE plan.
  No auto-applied edits (coach suggests; the Swap UI applies).
- e2e: seed fitforge.diet.v1 directly; specs for plan renders / swap flow / log-meal writes /
  catalog filter; coach context spec stubs the worker and asserts the diet summary rides the
  request payload.

## Fleet protocol (worktrees)

Each implementer works in an ISOLATED git worktree: first `git checkout -b ai-mode/<scope>`,
commit completed work there (imperative messages, house comment style, no model names; end
commit messages with the repo's standard trailer block found in `git log -1 --format=%B` style
from recent commits). Do NOT push. Do NOT touch files outside your scope list — the integrator
merges all branches into main and resolves; overlap = merge pain for everyone. Run the checks
you can (typecheck limited to your files may fail on cross-branch imports — note, don't chase;
worker tests / unit tests in your scope MUST pass standalone where they don't depend on another
branch).

Scopes: W1 workers/coach/** · W2 apps/web/lib/diet/** + packages/shared/src/rules/** +
packages/shared tests · W3 apps/web/components/onboarding/** + apps/web/lib/scan/** +
packages/shared/src/schemas** + onboarding e2e · W4 apps/web/components/features/nutrition/**
(new Plan surface files + minimal NutritionView wiring) + coach context file + their e2e.

## v1 scope fence

OUT: coach auto-applied diet edits, grocery lists, recipe photos, kosher/FODMAP, carb cycling,
aggressive-cut tier, storing scan images anywhere, exact-age anything.
