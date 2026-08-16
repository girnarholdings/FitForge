# RESEARCH-RECIPES — AI Mode Diet: The Curated Recipe Library (v1)

Date: 2026-08-01. Owner: recipe library workstream for the "AI Mode" onboarding feature.
Constraint recap: FitForge is a **local-first static export** (no runtime server), the repo is
**CC BY-SA 4.0**, and the diet generator + swap UI + AI trainer must all run off one bundled
catalog. That means every recipe here is **original text** (no copied recipe content — recipe
*ideas* and ingredient lists are not copyrightable, but expressive text is; all method text is
freshly written), and every nutrient number must be **derivable and internally consistent**, in
the same spirit as `apps/web/lib/food/core.json` ("Nothing is ever invented").

> **Shipped elsewhere.** The recommendation below was implemented as `fixtures/recipes.v1.json`
> with the engine in `apps/web/lib/diet/`. Neither `seed/data/recipes.json` nor
> `apps/web/lib/food/recipes.core.json` exists — read this section as the proposal it was.

**Deliverable:** 100 curated recipes (the `data` payload of this research task). Recommended home:
`seed/data/recipes.json` as the canonical copy, bundled into the app the same way
`lib/food/core.json` is (e.g. `apps/web/lib/food/recipes.core.json`), with the validator below
added to `seed:check`.

---

## A. What this catalog is (and is not)

- The **complete v1 pool** the weekly-meal-plan generator draws from: 20 breakfasts, 26 lunches,
  32 dinners, 22 snacks.
- The **swap universe**: every dish belongs to a coarse `swap_group`, so "swap this curry" shows
  curries, not smoothies.
- The **grounding corpus for the AI trainer**: the worker (`workers/coach`) should receive compact
  recipe rows (id, name, slot, macros, tags, swap_group) as context and be constrained to
  recommend **only ids that exist in this catalog** — the same "no invented numbers" rule the
  Coach already follows for nutrition.
- It is **not** a food-logging database (that's the 509-food tier-1 catalog + USDA tier-2), and it
  is **not** a restaurant-recipe collection. Every dish is cookable by a tired person on a
  weeknight or a motivated person on a Sunday.

---

## B. Curation principles (the ten rules)

1. **Real home cooking.** Ingredients you can buy in one supermarket run; pans, a tray, an oven, a
   blender. No sous vide, no 14-ingredient spice walls (spice *mixes* are named with their
   contents so a beginner can improvise).
2. **Protein-forward.** 39 of 58 lunch/dinner mains carry ≥30 g protein per serving. The ones that
   don't are the deliberate plant-based mains (dal, chana masala, tagine, lentil ragu…), and the
   generator compensates (rule F4). Rationale (practitioner-tier, same evidence honesty as
   `docs/RESEARCH-VOLUME.md`): total protein ~1.6–2.2 g/kg/day for trainees (Morton et al., 2018,
   BJSM meta-analysis) and a per-meal distribution of roughly 0.4 g/kg (Schoenfeld & Aragon, 2018,
   JISSN review) — the second figure is a heuristic, not settled science, and we say so.
3. **Energy bands per slot.** Each slot spans light / standard / hearty so the generator can hit a
   1,500 kcal cut day and a 3,000 kcal surplus day from the same pool (validated coverage in §E).
4. **Internal consistency over label theatre.** `kcal` is *recomputed* from the macros using
   Atwater general factors (4/4/9), rounded to the nearest 5. See §C.
5. **Diet coverage quotas, enforced by a script, not by vibes.** ≥25% vegetarian (actual: 54%),
   ≥12% vegan (actual: 28%), breakfast ≥18 options (actual: 20), 8+ cuisines (actual: 23).
6. **Cuisine diversity with respectful, real names.** Chana masala is "Chana Masala", not "Indian
   Chickpea Curry #3". Where we lighten a classic we say so in the name ("Lighter Chicken Tikka
   Masala", "The Leaner Full English") — naming a modification honestly, never as "guilt-free".
7. **Coarse swap groups.** ~20 groups (curry, stir-fry, wrap, traybake, snack-protein…). Coarse on
   purpose: swaps should feel like "another dinner of the same shape", and the generator has a
   numeric kcal filter for the fine-grained part.
8. **No supplements-as-meals, no "cheat" anything.** No protein-powder shakes posing as breakfast
   (skyr/Greek yogurt/tofu do the protein work); no "cheat meal", "guilt-free", "skinny" framing
   anywhere. Food is food.
9. **Quantified ingredients, terse methods.** Every ingredient carries a quantity; every method is
   3–6 steps a phone screen can hold. `serving_label` states what one serving physically is with
   an approximate weight, mirroring `serving_name`/`serving_grams` in the food catalog.
10. **An effort ladder.** `quick` (≤15 min), `standard` (~20–40 min), `project` (>40 min, or
    multi-stage: overnight marinades, from-scratch falafel, pho broth, batch bakes). Every slot
    has quick options; projects exist because a plan of nothing but 10-minute meals gets abandoned
    for being boring, and a plan of projects gets abandoned for being work.

---

## C. Macro methodology — and where the numbers honestly come from

- **Per-ingredient macro values are taken from USDA FoodData Central family data** (SR Legacy /
  FNDDS, public domain / CC0 — same sourcing as `lib/food/core.json`, see
  `docs/RESEARCH-FOOD.md` §A1), summed across the stated quantities using **cooked yields** where
  the recipe cooks the food (e.g. 150 g raw chicken breast ≈ 105–110 g cooked ≈ 32–34 g protein),
  then rounded to whole grams per serving.
- **kcal is then derived, not asserted:** `kcal = round((4·P + 4·C + 9·F) / 5) · 5` — Atwater
  general factors (Merrill & Watt, 1973, USDA Agriculture Handbook 74). Maximum rounding drift is
  2.5 kcal (<1%), so the required "within 8% of 4P+4C+9F" rule holds for **100/100 recipes by
  construction**, verified by the validator (§E).
- **Honest caveats, stated here rather than hidden:** real foods deviate from general Atwater
  factors (fiber fermentation, specific factors per food class — cf. FAO Food and Nutrition Paper
  77, 2003); home portions of "1 tbsp oil" vary ±30%; produce varies by season. Treat every
  per-serving number as a **±10–15% estimate** — which is also the honest error bar of the photo
  → bucket flow this feature starts from, so the system is consistent about its own precision.
  The plan-level guardrail (day totals within ±5% of target using these numbers) is a *planning*
  tolerance, not a claim of measurement accuracy.
- **Why swaps at all:** menu monotony predicts abandonment; variety supports adherence (Raynor &
  Epstein, 2001, Psychological Bulletin — variety/eating review; practitioner-tier application).
  Swaps keep the plan feeling chosen rather than assigned, which is the entire point of "curated
  but customized".

---

## D. Schema and tag semantics (normative)

| Field | Semantics |
|---|---|
| `id` | kebab-case, stable forever (referenced by plans, logs, coach transcripts) |
| `slot` | `breakfast` \| `lunch` \| `dinner` \| `snack` — where the generator schedules it; users may of course eat breakfast for dinner |
| `cuisine` | lowercase label; 23 distinct in v1 |
| `per_serving` | `{kcal, protein_g, carbs_g, fat_g}` — one serving, kcal Atwater-derived (§C) |
| `serving_label` | human description of one serving, with ~weight |
| `tags` | subset of: vegetarian, vegan, pescatarian, dairy_free, gluten_free, high_protein, quick, budget, halal_friendly |
| `effort` | `quick` \| `standard` \| `project` (§B10) |
| `ingredients` | short strings with quantities |
| `method` | 3–6 terse steps |
| `swap_group` | coarse family for swap candidates (§F3) |

**Tag rules (enforced by the validator):**
- `vegan` ⇒ `vegetarian` + `dairy_free` (auto-added).
- `pescatarian` marks **fish/seafood dishes**. The *filter* for a pescatarian user is:
  `pescatarian ∪ vegetarian ∪ vegan`. Vegetarian users get `vegetarian`; vegan users get `vegan`
  only.
- `halal_friendly` marks **meat/fish recipes** containing no pork and no alcohol, assuming
  halal-sourced meat. Vegetarian/vegan recipes are trivially acceptable and deliberately
  *untagged* — the halal filter is `halal_friendly ∪ vegetarian ∪ vegan`. (One recipe in the
  catalog contains pork — the Full English's back bacon — and is correspondingly untagged.)
- `gluten_free` is claimed only when the ingredient list is GF as written (corn tortillas, rice,
  potatoes). Soy-sauce dishes are *not* tagged GF; the coach may suggest tamari as a per-user
  adjustment.
- `high_protein` is **derived, not editorial**: ≥30 g/serving for meals, ≥12 g for snacks.
- `quick` tag ≡ `effort: "quick"` (auto-synced).

---

## E. Validated distribution — output of the committed validator, not hand counts

The catalog was emitted and checked by `recipes-build.mjs` (validator to be committed alongside
the data; wire into `npm run seed:check`). Checks: schema shape, kebab ids, unique ids, Atwater
≤8%, tag vocabulary, effort enum, 3–6 method steps, slot quotas, vegetarian/vegan quotas, cuisine
count, and per-slot band coverage. **Result: 0 errors.**

| Metric | Value |
|---|---|
| Total recipes | **100** (spec: 90–110) |
| Slots | breakfast 20 · lunch 26 · dinner 32 · snack 22 |
| Vegetarian (incl. vegan) | **54** (54%; floor 25%) |
| Vegan | **28** (28%; floor 12%) |
| Cuisines | **23** distinct |
| Mains ≥30 g protein | **39 / 58** lunch+dinner (the rest are deliberate plant mains) |
| kcal ranges | breakfast 325–565 · lunch 335–565 · dinner 380–555 · snack 85–250 |

**Band coverage** (light/standard/hearty thresholds — breakfast <380/>470, lunch <420/>500,
dinner <460/>530, snack <150/>220 kcal): breakfast 5/12/3 · lunch 8/9/9 · dinner 7/20/5 ·
snack 6/10/6. Every slot has ≥3 recipes in every band.

**Swap group sizes:** curry 6, eggs-breakfast 7, grill 3, oats 3, pancakes 2, pasta 4,
protein-bowl 10, salad 6, sandwich 5, smoothie 3, snack-bake 1, snack-fruit 7, snack-protein 7,
snack-savoury 5, soup 6, stew 5, stir-fry 3, tacos 3, toast 3, traybake 3, wrap 7, yogurt-bowl 1.
Two groups are singletons (`yogurt-bowl`, `snack-bake`) — deliberate, handled by the fallback in
F3 rather than by mislabeling them into the wrong family.

---

## F. How the generator and the AI trainer should use it (decisive spec)

1. **Day template:** 3 meals + 1–2 snacks. Given the day's kcal target, assign slot budgets
   roughly 25/30/35/10(+10)% and pick from the matching band (light day ⇒ light band, etc.).
   Greedy-fill, then adjust by swapping within groups until the day lands within **±5% kcal** and
   protein ≥ the daily protein target. These recipes' band spread makes 1,400–3,200 kcal/day
   reachable without scaling portions; portion scaling (0.75×/1.25×) is a v2 lever, not v1.
2. **Weekly variety rules:** no recipe more than 2×/week; ≥4 cuisines per week; default ≤1
   `project` recipe per day with a weekend bias; respect the user's effort preference if the
   AI-mode onboarding captures one.
3. **Swap candidates for a dish:** same `slot` + same `swap_group`, passing the user's dietary
   filter (D), with kcal within ±15% of the dish being replaced. If that yields <3 options, widen
   to same `slot` within ±12% kcal regardless of group. Singleton groups rely on this fallback by
   design.
4. **Plant-main pairing rule:** when a day's mains include a <25 g-protein plant main, the
   generator must fill the snack slot from `snack-protein` (or add the second snack), so
   vegetarian/vegan days still hit protein targets honestly rather than quietly missing them.
5. **AI trainer integration (`workers/coach`):** add a `diet` task that receives the user's
   targets, the week's plan (ids), and the compact catalog rows. System prompt constraints, in
   the existing worker's style: may explain any recipe, may propose swaps **only by catalog id**
   (validated server-side against the swap rule in F3 before being applied), must not invent
   macro numbers — all numbers come from this file. This mirrors how the Coach already refuses to
   fabricate nutrient values.
6. **Dietary preference from AI-mode onboarding** maps to filters: omnivore → all;
   pescatarian → `pescatarian ∪ vegetarian ∪ vegan`; vegetarian → `vegetarian`; vegan → `vegan`;
   halal → `halal_friendly ∪ vegetarian ∪ vegan`; dairy-free / gluten-free are conjunctive extra
   filters (`∧ dairy_free`, `∧ gluten_free`).

---

## G. v2 extension rules

Keep these invariants when adding recipes (the validator enforces them): Atwater-derived kcal;
band coverage ≥3 per band per slot; quotas (≥25% veg, ≥12% vegan, breakfast ≥18); tag vocabulary
closed; no supplements-as-meals; no "cheat"/"guilt" framing. Known v1 gaps worth filling next, in
priority order: (1) more gluten-free dinners in the `pasta` group (GF pasta variants), (2) a
second `yogurt-bowl` and `snack-bake` member so those groups swap natively, (3) more halal-tagged
snacks (currently 1 of 22 — vegetarian snacks cover the gap via the filter union, but named
coverage is friendlier), (4) West African and Eastern European mains for cuisine breadth, and
(5) portion-scaling metadata (`scalable: true` + min/max multipliers) to widen kcal reach without
new recipes.
