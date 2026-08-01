# FitForge AI-Mode Diet Plans — What an Ideal Diet Plan Looks Like

Date: 2026-08-01. Scope: the diet half of AI-Mode onboarding — photo-bucket profile → confirmed
buckets + dietary preference + top-3 goals → a weekly meal plan from a curated recipe library with
per-dish swaps, discussable/adjustable by the coach worker. Constraint recap: local-first static
app, 509-food catalog + measures already shipped (`apps/web/lib/food/`), macro targets already
computed deterministically in `packages/shared/src/rules/macros.ts` (Mifflin-St Jeor → activity
factor → goal adjustment → 30%-fat split), per-meal protein anchor of **0.4 g/kg** lives in
`apps/web/lib/food/portions.ts` — everything below stays consistent with those, and says where the
existing constants should change.

Citation style follows the repo convention: rough author-year pointers good enough to re-find the
paper, honest flags where a number is a product heuristic rather than literature.

---

## 1. Diet architecture per goal

### 1.1 Goal mapping first

AI-Mode collects **top-3 goals**; the diet engine needs ONE energy stance. Map the ranked picks
onto the existing `GoalType` plus one new derived stance:

| User's top goals (ranked) | Diet stance | Existing `GoalType` used for kcal |
|---|---|---|
| fat loss first | **cut** | `fat_loss` (×0.80 — already shipped) |
| muscle/strength first, fat loss absent | **lean gain** | `hypertrophy`/`strength` (×1.08 — shipped) |
| fat loss AND muscle both in top-3 | **recomp** (new) | maintenance ×1.00, protein raised (below) |
| endurance first | **endurance** | `endurance` (×1.05 — shipped) |
| general health / none of the above | **maintain** | `general_health` (×1.00 — shipped) |

Recomp is real and worth naming: in novice/returning lifters and higher body-fat users,
simultaneous muscle gain + fat loss at ~maintenance with high protein is well documented
(Barakat et al. 2020, Strength Cond J "Body recomposition" review; Longland 2016 AJCN — big
recomp on 2.4 g/kg protein even in a 40% deficit, though that protocol is too brutal to ship).
AI-Mode's body-fat bucket makes recomp *detectable*: if fat-loss + muscle are both picked and the
build bucket is "higher body fat", a plain cut also recomps — pick `fat_loss`. Recomp stance is
for the lean-ish middle buckets.

### 1.2 Deficit / surplus sizing (keep the shipped multipliers; add two clamps)

- **Cut: −20% TDEE** (shipped `goalAdjustment` 0.8). Evidence: ~0.5–0.7% bodyweight/week loss
  preserves lean mass vs faster cuts (Garthe et al. 2011 IJSNEM — 0.7%/wk kept LBM, 1.4%/wk lost
  it; Helms/Aragon/Fitschen 2014 JISSN contest-prep review recommends 0.5–1%/wk, slower when
  leaner). −20% of a 2,400 TDEE ≈ 480 kcal ≈ 0.5 kg/wk for an 80 kg user — right in band. Do NOT
  offer an "aggressive" tier in v1.
- **Lean gain: +8%** (shipped 1.08). Evidence: recommended surplus for trained lifters is small,
  ~+5–15% / ~200–400 kcal (Iraki et al. 2019 Sports "Nutrition recommendations for bodybuilders
  in the off-season"; Garthe 2013 EJSS — big surpluses added mostly fat). +8% ≈ +230 kcal on
  2,900 TDEE. Correct; keep.
- **Recomp: ×1.00** (new stance): maintenance kcal, protein 2.0 g/kg (below). Honest heuristic:
  the recomp literature varies −5%..+5%; 0% is the defensible midpoint and the easiest to explain.
- **Endurance +5%**, **general health ×1.00**: keep as shipped.
- **Clamp 1 — BMR floor (new)**: `kcal = max(kcal, round50(BMR))` in addition to the shipped
  1500/1200 sex floors. The shipped fixed floors alone let a large user's cut land under their
  own BMR (82 kg/175 cm male, age 55, 2 days/wk: BMR ≈ 1,682, cut ≈ 1,816 — fine; but a 110 kg
  user at 1.35 activity cuts to ~1,950 with BMR ~2,050). Sub-BMR targets aren't physiologically
  magic but they are our stated product red line (§6) and they wreck adherence. One-line change
  in `computeNutritionTargets` step 3.
- **Clamp 2 — bucket midpoints**: AI-Mode gives *ranges* (weight 70–80 kg, age 25–34). Feed the
  **midpoint** into the existing math. Error analysis: ±5 kg on weight moves Mifflin BMR by
  ±50 kcal; the formula's own SEE is ~10% of RMR anyway (Frankenfield 2005 JADA validation
  review), so bucket coarseness is inside the noise. Never ask AI-Mode users for exact weight to
  "improve accuracy" — it isn't more accurate, and precision-anxiety is an adherence tax.

### 1.3 Protein (g/kg/day) — one change from shipped values

Literature anchors: MPS/hypertrophy benefit plateaus ≈ **1.6 g/kg** with 95% CI upper ≈ 2.2
(Morton et al. 2018 BJSM meta of 49 RCTs); cutting while training justifies the top of that range
or above (Helms et al. 2014 IJSNEM systematic review: 2.3–3.1 g/kg **FFM** for lean dieting
athletes; Phillips & Van Loon 2011); endurance 1.2–1.6 g/kg (ISSN position stand, Jäger 2017).

| Stance | g/kg | vs shipped `proteinPerKg` |
|---|---|---|
| cut (`fat_loss`) | **1.8** | keep (defensible; gen-pop users aren't stage-lean) |
| lean gain (`strength`/`hypertrophy`) | **1.8** | keep |
| **recomp** | **2.0** | new row — recomp leans on protein doing the work (Longland 2016) |
| endurance | **1.4** | keep (top of ISSN band not needed at ≤1 h sessions) |
| general health / maintain | **1.6** | keep |
| vegan (any stance) | **+0.2 g/kg on top, cap 2.2** | new — lower DIAAS/leucine of plant proteins; ~10–20% uplift is the standard correction (van Vliet 2015 J Nutr; Hevia-Larraín 2021 Sports Med showed vegans match omnivores *when total protein is high*) |

Keep the shipped **220 g absolute cap** and `round5`. Use bucket-midpoint weight.

### 1.4 Per-meal protein distribution — inherit `portions.ts`, don't fork it

The per-meal anchor is **0.4 g/kg/meal**, already the constant in `apps/web/lib/food/portions.ts`.
Evidence base (same as that file cites): max-anabolic per-meal dose ≈ 0.4 g/kg, with ~0.6 g/kg as
the ceiling before it's just satiety (Schoenfeld & Aragon 2018 JISSN "How much protein can the
body use in a single meal"); even distribution beats skewed at equal totals (Mamerow 2014 J Nutr;
Areta 2013 J Physiol — 4×20 g > 2×40 g > 8×10 g for MPS over 12 h).

Plan rule: **every main meal (breakfast/lunch/dinner) carries ≥ 0.4 g/kg protein** (80 kg user →
≥ 32 g/meal). Snacks are unconstrained but prefer ≥ 10 g. Breakfast is where real diets fail this
(toast/cereal patterns ≈ 10–15 g), which is exactly why the recipe library's breakfast section
must be protein-forward (eggs, skyr/Greek yogurt, protein oats, tofu scramble) — see §3/§5.

### 1.5 Fat and carb split

- **Fat floor: 0.6 g/kg/day** (hormonal support; chronic <15–20% kcal associates with lowered
  testosterone — Helms 2014 review; honest heuristic on the exact floor number). Shipped 30%-of-
  kcal fat almost always clears this; the floor matters only for endurance stance and very small
  users.
- **Default split stays: fat = 30% kcal, carbs = remainder** (shipped). Carbs get the remainder
  deliberately: training quality tracks carb availability, and post-protein/fat there is no
  evidence a specific carb:fat ratio changes body comp at matched kcal+protein (Hall & Guo 2017
  Gastroenterology meta of controlled feeding studies — "calorie for calorie, no meaningful
  difference"; DIETFITS, Gardner 2018 JAMA — low-fat vs low-carb equal at 12 mo).
- **Endurance stance: fat = 25% kcal**, pushing carbs toward ~5 g/kg (ISSN/ACSM guidance is
  3–10 g/kg scaling with volume; our users train ≤ ~1 h/day, so 4–6 g/kg is the honest band).
  One-line change: `fatFraction = goal === 'endurance' ? 0.25 : 0.3`.
- Fiber: aim **14 g/1000 kcal** (IOM/AND reference). Not a hard generator constraint in v1; use
  it to rank recipes (library curation bias toward whole grains/legumes/veg), surface it in the
  day summary.

---

## 2. Adherence science — why a 7-day rotating template with swaps

The single most replicated finding in diet research: **the diet people stick to wins.** Dansinger
2005 JAMA (Atkins/Ornish/WW/Zone RCT): adherence, not assignment, predicted outcomes.
DIETFITS (Gardner 2018 JAMA, n=609): healthy-low-fat vs healthy-low-carb identical at 12 months.
So the plan's job is not macro perfection — it is minimizing the number of times per day the user
has to decide, while staying pleasant enough to keep eating.

- **Variety cuts both ways.** Dietary variety *increases intake* — sensory-specific satiety fades
  when the next dish is different (Rolls 1981 Physiol Behav; Raynor & Epstein 2001 Psych Bull
  review: variety within a food category → +intake and +body weight in that category). Monotony,
  conversely, drives quitting. The evidence-shaped answer is **variety across the week, monotony
  within the slot**.
- **Repeating breakfasts is a feature.** Habit/automaticity research: eating behaviors repeated
  in a stable context become cue-driven and effortless in weeks (Lally 2010 EJSP habit-formation
  curve; Wood & Neal 2007 Psych Rev). Breakfast is the most context-stable meal of the day, and
  successful weight-loss maintainers self-report low breakfast variety (NWCR cohort papers,
  Wing & Phelan 2005 — consistent eating patterns correlate with maintenance). Ship **2
  alternating breakfasts per week**, not 7.
- **Decision fatigue is the enemy, structure is the fix.** Providing structured meal plans +
  grocery lists beat "eat less" advice in RCTs even when no food was provided (Wing & Jeffery /
  Metz 1997/2000 food-provision and structured-plan studies: structure, not the free food, drove
  the effect). A concrete plan with a visible swap button converts "what should I eat" (open
  decision, ~200×/day food decisions per Wansink & Sobal 2007) into "this, or one of these 5"
  (closed choice).
- **Choice, but bounded.** Perceived autonomy improves adherence (SDT-based interventions, Teixeira
  2012 meta) while large choice sets reduce action (Iyengar & Lepper 2000 jam study — classic,
  effect size debated, direction fine for UI). **Show ≤ 6 swaps per dish**, ranked, with "more"
  behind a tap.
- Therefore the shape is decided: **a 7-day rotating template** — 2 breakfasts, ~4 lunches,
  5–6 dinners, repeating weekly — **with per-dish swaps** as the pressure valve. Not day-by-day
  infinite novelty (raises cooking load, grocery cost, decisions, and intake), not a 1-day repeat
  (monotony quit-risk). Leftover pairing (cook dinner ×2, tomorrow's lunch) is an explicit
  template pattern, not an accident: it halves cooking events, the #1 practical adherence cost.

---

## 3. Dietary-preference axes for v1

Existing `DietType` enum: `omnivore | vegetarian | vegan | pescatarian | keto | mediterranean |
none`. Decision — split the concept into **one base diet (hard filter, mutually exclusive)** plus
**exclusion tags (hard, stackable)**, because "vegetarian + gluten-free" is one user, not two enums.

**V1 base diets (hard filters):** `omnivore` (default), `pescatarian`, `vegetarian`
(lacto-ovo), `vegan`. These four are a strict subset lattice (vegan ⊂ vegetarian ⊂ pescatarian ⊂
omnivore), so recipe tagging is one field and filtering is monotone — a vegan recipe is servable
to everyone. Coverage math is why the set stays small: every base diet needs ≥ 4 recipes per slot
after tags apply (§5), and vegan is the expensive one.

**V1 exclusion tags (hard, stackable booleans):** `dairy_free`, `gluten_free`, `halal_friendly`,
`nut_free`, `shellfish_free`.
- `halal_friendly` = excludes pork, alcohol (incl. cooking wine), and non-specified gelatin.
  Label it "halal-friendly" and say plainly we filter ingredients, we do not certify sourcing
  (zabiha). That is honest and useful; claiming more is not.
- `nut_free` / `shellfish_free` ride along because the recipe-tag data is nearly free and the
  user need is common — but word them as preference filters ("we exclude recipes listing these
  ingredients — always check your own labels"), never as allergy-safety guarantees.
- `gluten_free` likewise filters listed ingredients; no cross-contamination claims (not celiac-safe).

**Not v1:**
- `keto` — stays what it already is in `macros.ts`: a **macro override** (1.6 g/kg protein, 65%
  fat). It is NOT a meal-plan filter in v1: a keto recipe library is a second library (~60+ dishes
  with <15 g carbs) and doubles curation. AI-Mode users picking keto get targets + logging, and a
  straightforward "meal plans for keto are coming" note. Revisit after the library exists.
- `mediterranean` — a style, not a filter. Demote to a **ranking bias tag** on recipes
  (olive-oil/fish/legume-forward scores higher for these users); no exclusion semantics.
- kosher — cannot be honestly satisfied with ingredient tags (meat/dairy separation, certification);
  shipping a fake version is worse than not shipping. Halal-friendly's ingredient-level contract
  doesn't transfer.
- paleo / carnivore / low-FODMAP — niche, or medical (FODMAP is a clinician-supervised elimination
  protocol; providing it casually is the kind of thing §6 exists for).

**Recipe schema implication:** every recipe carries `base_diet: 'omnivore'|'pescatarian'|
'vegetarian'|'vegan'` (the *most permissive* class it fits) plus boolean `contains_*` flags:
`pork, alcohol, gelatin, dairy, gluten, nuts, shellfish, egg, fish, soy`. Tag `egg`/`soy` now even
though no v1 toggle uses them — retagging 150 recipes later costs more than 2 booleans today.

**Library sizing (drives curation budget):** target ~**150 recipes**: breakfast 25, lunch 45,
dinner 50, snack 30. Composition constraint from §5's swap guarantee: for the strictest common
stack (vegan + gluten_free), each slot still needs ≥ 4 servable recipes → ≥ ~25% of each slot
vegan, and within that a GF-heavy skew. Curate to the constraint, not to vibes.

---

## 4. The plan SHAPE the generator emits

### 4.1 Meals per day

Default **4 slots**: breakfast, lunch, dinner, snack — matching the existing `MealSlot` type
exactly. Meal-frequency evidence is indifferent between 3–6 meals at matched intake (Schoenfeld
2015 Nutr Rev meta on frequency & body comp — no effect once total is controlled), so frequency is
chosen for protein distribution (§1.4 needs ≥3 protein feedings) and kcal packaging:

| kcal target | Slots |
|---|---|
| < 1,800 | 3 mains + 1 snack (snack may be merged into a larger dinner if user prefers 3 slots) |
| 1,800–2,600 | 3 mains + 1 snack (default) |
| > 2,600 | 3 mains + 2 snacks (a second `snack` slot; packing 900-kcal dinners is worse than adding a slot) |

User can toggle 3/4/5 in plan settings; the generator re-shapes without changing day targets.

### 4.2 Day-level tolerance bands (exact)

The generator portions each recipe (`portion_scale`, 0.25 steps, range 0.5–2.0) to land the day
inside these bands. Bands are deliberately loose — false precision is an adherence tax and the
underlying TDEE estimate is ±10% anyway (§1.2):

- **kcal: target ± max(100 kcal, 5%)**. (2,000 kcal target → 1,900–2,100.)
- **protein: −5 g / +25 g** around target. Overshoot is benign (satiety helps a cut); undershoot
  defeats the point.
- **carbs / fat: no hard day band.** They are outcomes of kcal − protein, constrained only by
  fat ≥ 0.6 g/kg/day (§1.5). Display them; don't fail generation on them.
- **Per-meal kcal envelope** (keeps days from generating as 100-kcal breakfast + 1,400-kcal
  dinner): breakfast 20–30%, lunch 30–35%, dinner 30–40%, snack(s) 10–20% of day kcal. Honest
  heuristic — no literature says these exact envelopes, but they match how the recipe library's
  natural portion sizes cluster and keep every main ≥ 0.4 g/kg protein without heroic portions.
- **Per-meal protein: mains ≥ 0.4 g/kg** (from `portions.ts`); snacks ≥ 10 g preferred, not required.

### 4.3 Snack policy

The snack slot is the **macro shock-absorber**: generate mains first, then pick/scale the snack to
close the day's kcal/protein gap (Greek yogurt + fruit closes a protein gap; nuts close a fat/kcal
gap). Consequence for curation: the 30 snack recipes must spread across macro roles — ~10
protein-forward (≥15 g), ~10 kcal-dense, ~10 light/veg-fruit. Never generate a day where the snack
is load-bearing beyond ±20% of its own kcal — if the gap is bigger, re-scale a main instead.

### 4.4 Training-day vs rest-day carbs — DECIDED: noise for v1

Single uniform daily target, all 7 days, all stances including endurance. Rationale: at matched
weekly kcal and protein there is no controlled evidence that gen-pop-scale carb cycling improves
body composition (no RCTs show it; the practice comes from physique-sport lore — Helms and
McDonald both frame it as preference/psychology, not physiology). Meanwhile the costs are
concrete: 2 target-sets → 2 portion scalings per recipe → meal-prep-ahead breaks (you cook Sunday
for the week, but Tuesday is a "high day"?) → more decisions (§2). The coach worker can and should
*talk* about intra-day timing ("put more of your carbs before/after training") — that's free,
verbal, and evidence-neutral. Revisit only for a future "endurance+" tier with >90 min sessions,
where glycogen actually binds (ISSN carb periodization evidence is about performance at high
volumes, not body comp).

### 4.5 Emitted shape (TypeScript)

```ts
/** Generated once at AI-Mode completion; regenerated only on explicit user action or coach 'adapt'. */
interface DietPlan {
  targets: NutritionTargets;            // existing shape: kcal_target, protein_g_target, carbs_g_target, fat_g_target
  stance: 'cut' | 'lean_gain' | 'recomp' | 'endurance' | 'maintain';
  base_diet: 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan';
  exclusions: ('dairy_free' | 'gluten_free' | 'halal_friendly' | 'nut_free' | 'shellfish_free')[];
  meals_per_day: 3 | 4 | 5;
  week: DietDay[];                      // length 7, Mon..Sun, rotates indefinitely
  generated_at: string;
  method: string;                       // human-readable audit line, same spirit as MacroTargets.method
}
interface DietDay {
  meals: PlannedMeal[];
  totals: Macros;                       // existing Macros shape from lib/food/types
}
interface PlannedMeal {
  slot: MealSlot;                       // existing 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipe_id: string;
  portion_scale: number;                // 0.5–2.0 in 0.25 steps
  macros: Macros;                       // at this scale, precomputed
  is_leftover_of?: string;              // recipe_id cooked the previous evening (cook-once-eat-twice)
  swap_ids: string[];                   // top ≤6 precomputed valid swaps (§5), ranked
}
```

Everything precomputed and serializable → localStorage, works offline, and the coach worker can be
handed a compact summary (see §7).

---

## 5. Swap rules — what makes two dishes swappable

A swap must preserve the *day's* integrity without recomputing the whole plan. All checks run on
the candidate at its best `portion_scale` (try 0.75/1.0/1.25 of the candidate's base portion):

1. **Same slot.** Breakfast↔breakfast etc. (Recipes may declare `slots: ['lunch','dinner']` —
   many dinners are valid lunches; breakfasts rarely cross.)
2. **Dietary compatibility is absolute.** Candidate must satisfy the user's `base_diet` (subset
   lattice, §3) and every active exclusion tag. No exceptions, not even "97% match".
3. **kcal distance: |Δ| ≤ max(75 kcal, 15% of the outgoing dish's kcal).** (A 500-kcal dinner's
   swaps live in 425–575.) Inside the §4.2 day band by construction if the original day was.
4. **Protein: candidate ≥ outgoing − 8 g, AND mains must still clear 0.4 g/kg** after the swap.
   Upward protein deviation is unbounded (within the kcal check).
5. **Carbs/fat: unconstrained.** Chicken-rice ↔ salmon-salad is a legitimate swap; policing C/F
   distance would gut the pool for zero body-comp benefit (§1.5 Hall & Guo).
6. **Variety guard: no duplicate recipe within a 2-day window for lunch/dinner.** Breakfasts and
   snacks are exempt — repetition there is a feature (§2).
7. **Ranking within the valid pool** (for the ≤6 shown): smaller kcal distance → same prep-time
   class (≤15 min / 15–35 / >35) → `mediterranean` style-tag boost when the user picked it →
   user's past accept/reject history (localStorage, same personalization pattern as the food
   parser's alias learning in RESEARCH-FOOD.md §C2.7).
8. **After a swap**, recompute `DietDay.totals`; if the day fell outside §4.2 bands (possible via
   rule-3 slack stacking across multiple swaps), silently re-scale the snack (±20% of its kcal
   max), else nudge the swapped dish's `portion_scale` one 0.25 step. Never block the swap — the
   user's choice wins, the numbers adapt.

**Generator guarantee:** every planned dish ships with ≥ 3 valid swaps for *this user's* filter
stack, else the generator picks a different dish for the slot. This is the constraint that sizes
the recipe library (§3): it is checked at build time against the worst-case filter stack
(vegan + gluten_free), and a CI check on the recipe library should assert it so curation drift
can't silently break AI-Mode for vegans.

---

## 6. What NOT to do (product red lines, enforced in code where possible)

- **No crash deficits.** Deficit is capped at −20% TDEE; kcal target never below
  `max(BMR, 1500♂/1200♀)` (§1.2 clamps — the BMR clamp is a required change to `macros.ts`).
  No "aggressive" toggle, no user-editable target below the floor without a warning + confirm.
- **No sub-18.5 BMI cutting.** If confirmed buckets imply BMI < 18.5 and stance is `cut`, refuse:
  set `maintain`, one calm sentence, suggest talking to a professional. Deterministic check, not
  an AI judgment call.
- **No "cheat" language. Anywhere.** Not "cheat day", not "guilt-free", not "sinful", not "burn it
  off". Food guilt predicts *worse* weight outcomes, not better discipline (Kuijer & Boyce 2014
  Appetite — "chocolate-cake-guilt" cohort). If a flexible meal concept ships later, it's a "flex
  meal". This is a hard rule in the coach worker's system prompt (add to the RULES block in
  `workers/coach/src/index.ts` style) AND a lint list for all UI copy: cheat, guilt, sin, clean,
  dirty, junk, bad food, burn off, earn your food, detox, toxins.
- **No moralized food taxonomy.** No good/bad or red/yellow/green food classing (Noom's color
  system is the cautionary tale — widely reported as triggering for disordered-eating-prone
  users). Foods have macros and roles, not virtue.
- **No date promises.** Never "lose 5 kg by October". Show rate ranges ("~0.4–0.6 kg/week is
  typical at this target") with the uncertainty stated.
- **No punitive adaptation.** Missed days / over-target days never auto-tighten targets. The
  coach may *offer* a recalibration after ≥2 weeks of logged data (that's the `adapt` task's
  job), never impose one.
- **No eliminating food groups uninvited.** The generator never goes low-carb/low-fat/IF on its
  own; those are user choices only.
- **No medical diets or claims.** No FODMAP, no diabetic meal planning, no keto-as-therapy; the
  existing worker Rule 4 (no medical advice) extends verbatim to diet chat.
- **Photo privacy is a diet-feature concern too:** the vision task returns *bucket ranges only*
  (age range, weight range, BF band) — never a specific age/weight/BF% number in UI or coach
  chat ("your estimated weight range" not "you weigh 83 kg"). Faces hidden by product design;
  photos never persisted server-side; the worker sees buckets, never images after the vision call.

---

## 7. Coach-worker integration notes (so the diet is discussable)

Follow the existing `workers/coach/src/index.ts` pattern — profile as a labeled block, hard caps:

- Extend the profile block with a **compact plan summary** (≤ ~300 chars): stance, kcal/protein
  targets, meals_per_day, base_diet + exclusions, today's planned meals as `slot: recipe (kcal/P)`.
  Never send the whole week — clamp like `MAX_PROFILE_CHARS` does.
- The `adapt` task's allowed diet operations (whitelist, mirroring the "never invent features"
  rule): swap a dish (must come from `swap_ids`), change `meals_per_day`, retarget kcal within
  ±10% of current and always inside §6 floors, switch stance. The worker *proposes* one of these
  as structured JSON; the client applies it deterministically through the same §5 rules. The
  model never emits macro numbers of its own — same division of labor as RESEARCH-FOOD.md §C2.8
  (LLM reshapes, deterministic code computes).

---

## RECOMMENDATION (execute this)

1. **Targets:** keep `computeNutritionTargets` multipliers; add recomp stance (×1.00, 2.0 g/kg),
   vegan +0.2 g/kg protein uplift, endurance fat 25%, and the `max(BMR, sex floor)` kcal clamp.
   Feed AI-Mode bucket midpoints straight in — precision theater is banned.
2. **Distribution:** 0.4 g/kg protein per main (the `portions.ts` constant is the single source),
   3 mains + 1–2 snacks per §4.1, snack as macro shock-absorber.
3. **Template:** 7-day rotating plan — 2 alternating breakfasts, ~4 lunches with leftover pairing,
   5–6 dinners — repeating weekly, with ≤6 ranked swaps per dish as the variety valve.
4. **Preferences v1:** base diets omnivore/pescatarian/vegetarian/vegan (hard, subset lattice) +
   tags dairy_free/gluten_free/halal_friendly/nut_free/shellfish_free (hard, stackable);
   mediterranean demoted to a ranking bias; keto stays macro-only; kosher/paleo/FODMAP out.
5. **Bands:** day kcal ± max(100, 5%); protein −5/+25 g; per-meal envelopes 20–30/30–35/30–40/
   10–20%; no carb/fat day bands; fat ≥ 0.6 g/kg. Uniform targets all 7 days — no train/rest carb
   cycling in v1.
6. **Swaps:** same slot, absolute dietary compatibility, |Δkcal| ≤ max(75, 15%), protein ≥ −8 g and
   mains still ≥ 0.4 g/kg, 2-day no-repeat for lunch/dinner, generator guarantees ≥3 swaps per
   dish per user (CI-checked against the vegan+GF worst case, sizing the ~150-recipe library).
7. **Red lines in code:** BMR/1200/1500 floors, −20% deficit cap, BMI<18.5 cut refusal, banned-
   word lint (cheat/guilt/clean/burn-off/detox), no auto-tightening, buckets-not-numbers in all
   copy, worker adapt-ops whitelist.

Key references: Morton 2018 BJSM · Schoenfeld & Aragon 2018 JISSN · Areta 2013 J Physiol ·
Mamerow 2014 J Nutr · Helms 2014 IJSNEM · Garthe 2011 IJSNEM · Iraki 2019 Sports · Barakat 2020
SCJ · Longland 2016 AJCN · Hall & Guo 2017 Gastroenterology · Gardner 2018 JAMA (DIETFITS) ·
Dansinger 2005 JAMA · Raynor & Epstein 2001 Psych Bull · Lally 2010 EJSP · Wing & Phelan 2005 ·
Wansink & Sobal 2007 · Teixeira 2012 · Kuijer & Boyce 2014 Appetite · Jäger 2017 JISSN (ISSN
protein stand) · Frankenfield 2005 JADA · Hevia-Larraín 2021 Sports Med.
