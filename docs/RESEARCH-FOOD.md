# FitForge Nutrition Rebuild — Food Data + Conversational Logging Research

> **Shipped elsewhere.** The proposed six-stage `seed/food/` pipeline was implemented as the
> single importer `seed/import-usda.mjs`, run in CI by `.github/workflows/pages.yml` and emitting
> the lazy shards under `apps/web/public/food/`. There is no `seed/food/` directory.

Date: 2026-07-26. Constraint recap: Next.js **static export** on GitHub Pages, no runtime server/API keys,
localStorage-only "Local Mode", assets served same-origin (lazy static JSON/binary chunks OK), repo is
**CC BY-SA 4.0** so every shipped dataset must be legally redistributable. First keystroke of search must
feel instant on a phone.

---

## A. Food data source survey

### A1. USDA FoodData Central (FDC) — the backbone. RECOMMENDED (core)

**License: U.S. Government work — public domain (CC0 1.0).** USDA explicitly states FDC data are in the
public domain and may be freely redistributed, including commercially. Zero license risk inside a
CC BY-SA repo (public domain composes with anything). Attribution requested (cite FDC) but not required.
Bulk downloads: https://fdc.nal.usda.gov/download-datasets (CSV and JSON zips per data type + "full" zip).

Sub-datasets (each is a separate downloadable zip of relational CSVs — `food.csv`, `nutrient.csv`,
`food_nutrient.csv`, `food_portion.csv`, `branded_food.csv` …):

| Sub-dataset | Rows | What it is | Portions? | Verdict |
|---|---|---|---|---|
| **Foundation Foods** | ~2,200 foods | Lab-analyzed modern replacement for SR; raw commodities (milk, flour, chicken breast) with sampling metadata | some | Use for canonical staples; small but gold-standard |
| **SR Legacy** (final release 2019-04) | ~7,790 foods, ~150 nutrients each | The classic "Standard Reference" — cooked/raw variants, mixed dishes, per-100g. Frozen (never updated again) which is actually a *feature* for reproducible builds | yes (`food_portion.csv` household measures with gram weights) | **Primary generic-foods source** |
| **FNDDS / Survey** (2021–2023) | ~7,000 foods | "What people actually eat" — recipes/mixed dishes as consumed (pizza, burritos, lattes, curries) built for the NHANES dietary survey; every food has **household portion weights** (e.g. "1 slice", "1 medium", "1 cup") | **yes, excellent** | **Primary source for dishes + the household-measure→gram table** |
| **Branded (Global Branded Food Products DB)** | ~1.8–2.0M items, updated monthly | Label data submitted by manufacturers (GS1). Per-serving label values + serving size; US-skewed | serving size only | Optional lazy tier; label-typo noise, many dead/duplicate UPCs |
| Experimental Foods | small | research-grade | n/a | skip |

**Nutrient coverage:** kcal/protein/carbs/fat always; fiber/sugar/sodium nearly always in SR/FNDDS;
Branded has label nutrients only (often missing fiber/sugar). **Quality issues:** SR/FNDDS are
authoritative; main work is *selection* (7,790 SR foods include "Beverages, MONSTER energy drink,
lo-carb" style oddities and dozens of near-duplicate cuts of beef) and *naming* (inverted comma style:
"Chicken, broilers or fryers, breast, meat only, cooked, roasted" needs renaming to "Chicken breast,
roasted").

### A2. Open Food Facts (OFF) — RECOMMENDED (branded/barcode tier, filtered hard)

**License: ODbL 1.0** for the database (images CC BY-SA, not needed). ODbL permits commercial use and
redistribution **with attribution and share-alike on the database**. Compatible with our repo if the
emitted data files carry their own ODbL notice + attribution ("Contains data from Open Food Facts,
© OFF contributors, ODbL") — keep the OFF-derived shards as a clearly-delimited ODbL work inside the
repo; do not silently blend OFF rows into CC BY-SA files without the notice. This is standard practice
(many apps do exactly this).

**Size:** ~3.7M products (2025). Exports: MongoDB dump (30GB+), **JSONL gz (~5GB compressed)**, CSV
(~9GB), plus a **Parquet export on Hugging Face (`openfoodfacts/product-database`)** which is by far the
easiest to filter with DuckDB at build time. Also a daily delta feed.

**Quality issues (real, must be engineered around):** crowdsourced → missing nutriments (~35–40% of
rows lack complete kcal/P/C/F), per-serving vs per-100g entry mistakes, unit typos (kJ vs kcal),
implausible values (protein > 100g/100g), non-English names dominating (FR/DE/ES heavy), duplicate
barcodes/products, junk product names. **Portions:** `serving_size` free-text + `serving_quantity`
grams when parseable — usable maybe 50% of the time. Has a `unique_scans_n` / popularity field →
essential for ranking. Filter recipe: `countries_tags` ∈ {US,UK,CA,AU,IE,NZ}, complete macro set,
plausibility bounds, popularity threshold → ~50–150k usable branded rows.

### A3. National tables (good cross-checks; not needed as primary)

| Source | License | Size | Format | Notes |
|---|---|---|---|---|
| **CoFID / McCance & Widdowson** (UK) | **Open Government Licence v3** (attribution; redistribution + commercial OK; CC BY-compatible) | ~2,900 foods | XLSX/CSV from gov.uk | Great for UK items (baked beans, digestive biscuits, fish & chips). Use to spot-check + fill UK staples |
| **CIQUAL** (France, ANSES) | **Licence Ouverte / Etalab v2** (attribution; redistribution OK) | ~3,180 foods | XLSX/CSV/XML | French dishes; names in FR (EN translation provided) |
| **FRIDA** (Denmark, DTU) | **CC BY 4.0** — cleanest license of the EU tables | ~1,300 foods | XLSX / API | Small, high quality |
| **AUSNUT 2011-13 / AFCD** (FSANZ, Australia) | **CC BY 3.0 AU / 4.0** | AFCD ~1,600; AUSNUT ~5,740 survey foods | XLSX | AUSNUT has portion photos/measures for AU foods |
| **Canadian Nutrient File (CNF)** | **Open Government Licence – Canada** (attribution; redistribution OK) | ~5,690 foods | CSV/API | Largely SR-derived; adds Canadian items |
| German BLS 4.0 | CC BY 4.0 (newly opened) | ~15,000 | — | German names; skip for v1 |

All of the above are redistribution-safe. None beats SR+FNDDS for an English-first app, so they are
**tier-3 gap fillers**, not foundations.

### A4. Commercial APIs — all DISQUALIFIED for shipping data (runtime + license)

| Service | Model | Why disqualified |
|---|---|---|
| **Nutritionix** | REST API, ~1.9M foods + excellent NL endpoint (`/natural/nutrients`) | API key at runtime (we have no server); ToS forbids bulk storage/redistribution. *Study its NL parser UX, don't use it* |
| **Edamam** | API (Food DB + NLP endpoint), free tier | same: key + no redistribution |
| **Spoonacular** | API, recipes+products | same |
| **FatSecret Platform** | API, free tier, big branded DB | same; ToS requires "powered by FatSecret", no caching beyond 24h in free tier |
| Samsung/ESHA, NCCDB (Cronometer's source) | licensed commercial DBs | not obtainable |

These matter only as *design references* (Nutritionix's natural-language grammar is the best public
example of the parser we'll build deterministically).

### A5. Aggregated open datasets (shortcut candidates)

- **OpenNutrition** (opennutrition.app) — ~**300k foods** (generic + branded + restaurant/chain menu
  items), **ODbL** (+DbCL), single **TSV download**, built from USDA/CNF/FRIDA/AUSNUT + LLM cleaning.
  Pros: already deduped/cleaned, includes **restaurant chain items** (which no open primary source has),
  search-friendly names, serving sizes. Cons: ODbL share-alike (same handling as OFF), LLM-synthesized
  values for some entries (defensibility caveat), young project. **Recommended as the tier-2 lazy
  catalog** — it collapses 90% of our pipeline work. Verify TSV columns at build time; keep provenance
  column.
- **Kaggle/HuggingFace mirrors** of USDA & OFF (e.g. `openfoodfacts/product-database` parquet on HF —
  use this instead of the 9GB CSV; Kaggle "OpenNutrition Foods Database" mirror). Same licenses as
  upstream; convenient formats only.
- Misc GitHub food JSONs (fruityvice, food-nutrients repos): tiny/unlicensed/unmaintained — skip.

---

## B. What to ship — pragmatic recommendation

### B1. Source mix

1. **Tier 1 (core, in-repo, hand-curated):** ~500–800 generic foods + common dishes + takeaway items,
   values from **USDA SR Legacy / FNDDS / Foundation** (public domain — the CC BY-SA repo stays clean),
   with UK/AU staples cross-filled from CoFID/AUSNUT (OGL/CC BY, attribution line in the file header).
   This is `food-core.json` (starter version delivered with this research). Covers the "chicken, pizza,
   coffee, protein bar" failure cases outright.
2. **Tier 2 (lazy generic+restaurant catalog, ~30–60k foods):** filtered **OpenNutrition TSV** (or, if
   we prefer zero-ODbL, an expanded USDA SR+FNDDS extract of ~14k foods). Sharded static JSON.
3. **Tier 3 (optional, later): branded/barcode**, filtered **OFF** (~50–150k rows, ODbL notice) — only
   worth it once barcode scanning exists; otherwise branded search noise hurts more than helps.

### B2. Size budget

| Tier | Contents | Foods | Payload (gzipped) | When loaded |
|---|---|---|---|---|
| 0 | Search index header (prefix trie/token dictionary + shard map) | — | 20–40 KB | with app shell, cached |
| 1 | Core foods (full records) | 500–800 | **60–120 KB** (≈150–200 B/food gz) | with app shell → localStorage/IndexedDB; **all search before first extra fetch hits this** |
| 2 | Generic+restaurant catalog shards | 30–60k | 3–8 MB total, fetched as **10–40 KB shards** on demand; typical session touches <200 KB | on 2nd+ keystroke, cached in IndexedDB + Cache API |
| 3 | Branded shards (optional) | 50–150k | 8–20 MB total, same shard size | barcode scan / explicit "branded" toggle |

Rule: a phone should never download more than ~50 KB to answer one query.

### B3. Sharding / indexing for static hosting

- **Normalize at build time:** every food gets `id`, display name, lowercase folded `tokens[]`
  (ASCII-folded, singularized, stopwords dropped), per-100g macros quantized (kcal int, macros 1 dp),
  serving list, `rank` score.
- **In-memory (tier 0/1):** load `food-core.json` + a **compact prefix index of the FULL catalog's
  vocabulary**: map `first-2-or-3-letters → shard file`. E.g. `idx/ch.json` holds all tier-2 postings
  for tokens starting "ch". 26²≈676 shards (sparse; real count ~450), each 5–40 KB gz. This is the
  classic static-site inverted-index pattern (same as Pagefind/Lunr-prebuilt).
- **Query flow:** keystroke → instant match against tier-1 (in RAM, <1 ms) → render immediately →
  in parallel `fetch('/data/idx/ch.json')` (HTTP-cached/IndexedDB-cached) → merge tier-2 hits under
  the tier-1 hits. Prefix search = binary search within the sorted token list of the shard. Multi-token
  queries intersect posting lists. Misspellings: cheap Damerau–Levenshtein ≤1 against the shard's token
  list (they're already in RAM by then).
- **Record storage:** postings reference `foodId → data shard` (`foods/017.json`, ~500 foods/shard);
  fetch the data shard only when a result is rendered/expanded. Format: plain gzipped JSON via GitHub
  Pages' gzip — a custom binary/columnar format saves ~30% but is not worth the complexity at 3–8 MB
  total; revisit only if tier 3 ships.
- **Ranking so "chicken" ⇒ "Chicken breast" not "Chicken flavored crisps":**
  `score = w1·matchQuality (exact token > prefix > fuzzy; earlier token position wins; fewer extra
  tokens wins) + w2·popularityPrior + w3·tierPrior (core > generic > branded) + w4·userHistory
  (foods this user logged before — huge win, free, localStorage)`. Popularity prior: FNDDS survey
  frequency for generics, `unique_scans_n` for OFF, hand-set 0–100 in core. Dedupe at build time by
  `(normalizedName, roundedMacros)` keeping highest-provenance row.

### B4. Data cleaning (build-time)

- **Canonical unit = per 100 g** (per 100 ml for liquids, flagged `isLiquid` with density for
  g↔ml). Branded per-serving labels ÷ serving grams → per-100g; drop rows where serving grams unknown.
- **Plausibility filters:** kcal 0–920 per 100g (spirits+oils ≈ 884–900 max); macros each ≤ 100 g;
  Atwater check `|kcal − (4P+4C+9F)| ≤ max(25, 25%)` (allow alcohol/fiber slack); sodium ≤ 40,000 mg
  (salt itself) else drop; all-zero rows dropped.
- **Name normalization:** un-invert USDA commas ("Chicken, broilers…breast…roasted" → "Chicken breast,
  roasted"), Title-case first word only, strip marketing suffixes, collapse whitespace; ASCII-fold
  diacritics into `tokens` while keeping display name.
- **Language:** keep rows whose `lang` ∈ {en} or whose country tags are anglophone; OFF rows with
  non-Latin or all-caps garbage names dropped.
- **Brand handling:** `brand` is a separate field, searchable but tokenized separately so brand noise
  doesn't outrank generics; display "Brand · Product".
- **Dedup:** normalized-name + macro fingerprint; keep provenance order Foundation > SR > FNDDS >
  CoFID/AUSNUT > OpenNutrition > OFF.

### B5. Build pipeline (fits the existing `seed/` emit-data pattern)

```
seed/food/
  01-download.ts     # fetch FDC zips (SR Legacy, FNDDS, Foundation), OpenNutrition TSV,
                     # (later) OFF parquet from HF — cache in seed/.cache, pinned URLs+sha256
  02-extract.ts      # relational CSVs -> flat rows {name, per100g, portions[], provenance}
                     # FNDDS food_portion -> household-measure gram table (also emitted standalone)
  03-clean.ts        # unit normalization, plausibility filters, name normalization, language filter
  04-rank.ts         # popularity prior (FNDDS freq / scans), tier prior, dedupe
  05-shard.ts        # assign foodIds -> data shards (~500/shard); build token->postings;
                     # split postings by 2-letter prefix -> idx shards
  06-emit.ts         # write public/data/food/core.json, idx/*.json, foods/*.json,
                     # measures.json, meta.json {version, counts, licenses}, LICENSES.food.md
```
Deterministic (sorted keys, pinned inputs) so CI diffs are reviewable; emit a `meta.json` version so
the client can invalidate IndexedDB caches.

---

## C. Conversational logging

### C1. How real apps do it

- **MacroFactor "Describe" / AI Describe** (most praised UX): type or dictate "2 eggs, toast with
  butter, large latte" → a **plain-text parser** splits items, searches its *common foods* DB (not the
  full branded DB — key insight: NL matches against a curated generic set), and fills a "plate" of
  **editable rows** the user confirms. Photo logging uses LLMs but text path is parser-based. Users
  praise speed; complaints center on niche foods missing.
- **Nutritionix `/natural/nutrients`** (the public benchmark): grammar-based NLP that extracts
  `(qty, unit, food)` triples from phrases, ~85% accuracy on casual descriptions; failures on regional
  dishes/brands. Returns per-item structured nutrients incl. resolved gram weight — exactly the shape
  our deterministic parser should output.
- **Lose It! "Say It!/Snap It!"**: voice/photo → matches against 63M-item DB → **confirmation list**
  the user edits. Marketing claims boosted adherence; reviews note over-matching to branded oddities.
- **MyFitnessPal voice logging** (Premium, 2024+): parses multi-food sentences with portions; testers
  report it needs frequent correction on "a handful/a bowl" quantities and brand items; DB accuracy
  itself ±7% due to crowdsourcing. Its *typed* search is one-food-per-query — widely criticized.
- **Cronometer**: no NL; wins on data accuracy (NCCDB/USDA) — evidence that a **small clean DB beats a
  huge dirty one** for satisfaction.
- **Bitesnap / Foodvisor**: photo-first, LLM/CV, confirm-with-portion-picker. **Ate**: photo journal,
  deliberately no calories. **ChatGPT-loggers / "text your calories" bots** (many indie): LLM →
  JSON items → confirm; complaints: hallucinated kcal, inconsistent portions, latency, cost.
- **Common confirm pattern across all:** parsed items shown as **rows/chips with qty + unit + matched
  food + kcal**, each tappable to swap food or adjust portion, then one "Log all". Ambiguity ("a bowl
  of rice") resolved by defaulting to a household measure and making the portion the *most prominent
  editable element*. We should copy this exactly.

### C2. Deterministic offline parser spec (must stand alone; LLM optional garnish)

Pipeline: `input → segment → per-fragment: (quantity, unit, food-tokens) → resolve food → resolve
grams → score → confirm UI`.

**1. Segmentation.** Split on: commas, `+`, `&`, newlines, and the word `and` *when not inside a known
compound* (maintain a compound whitelist: "mac and cheese", "fish and chips", "rice and beans",
"salt and vinegar", "peanut butter and jelly", "surf and turf", "bangers and mash"). Also split
"with" into a *child fragment* attached to the previous item ("toast with butter" → toast + butter,
butter defaulting to a per-parent portion, e.g. 1 pat on bread).

**2. Quantity grammar** (regex + small word table, run left-to-right per fragment):
- numerals `2`, decimals `1.5`, fractions `1/2`, unicode `½`, mixed `1 1/2`
- words: a/an/one=1, couple=2, few=3, half=0.5, quarter=0.25, "half a"=0.5, dozen=12, several=3
- ranges "2-3" → midpoint 2.5, flag low confidence
- trailing form: "chicken breast 200g" — quantity+unit may appear *after* the food; scan both ends
- size adjectives small/medium/large/venti/grande → portion multiplier or named portion
  (small 0.75×, medium 1×, large 1.4×; latte sizes map to ml: small/tall 240, medium/grande 360,
  large/venti 470)

**3. Unit lexicon** (canonical → aliases → type):
mass: g/gram, kg, oz/ounce (28.35 g), lb (454 g), mg; volume: ml, l, cup (240 ml), tbsp (15 ml),
tsp (5 ml), fl oz (30 ml), glass (250 ml), bottle (330/500 ml context), can (330 ml), shot (44 ml),
pint (473 ml); count/household: slice, piece, egg, serving, scoop, bar, packet, handful, bowl, plate,
pat, knob, stick, wing, drumstick, breast, fillet, patty, bun, roll, taco, wrap, cookie, square, wedge.
Volume→grams uses per-food density; count units use the **per-food `household_measures[]`** first,
then the global defaults table (C4).

**4. Food resolution.** Remaining tokens → same search index as manual search (tier-1 in RAM, so the
parser works fully offline). Match score as in B3 plus: prefer foods whose `household_measures` contain
the parsed unit (unit "slice" boosts bread/pizza/cheese over rice); prefer cooked variants for verbs
("grilled", "fried", "boiled" map to variant tags); user history boost.

**5. Gram resolution order:** explicit mass > explicit volume×density > parsed count×food-specific
measure > food's default serving. "half a pizza" → pizza `whole=560g` measure × 0.5. No quantity at
all → 1 default serving.

**6. Confidence per item** (0–1): product of quantity confidence (explicit=1.0, word=0.9, none/default
=0.6, range=0.7), unit confidence (explicit mass=1.0, household via food-specific measure=0.9, global
default=0.7, inferred serving=0.5), match confidence (normalized search score; exact alias=1.0).
Thresholds: ≥0.8 green (pre-checked), 0.5–0.8 amber (checked but highlighted "best guess — tap to
change"), <0.5 red (unchecked, shows top-3 alternative matches inline).

**Worked examples**
- "2 eggs and a slice of toast with butter" → [2 × egg (50 g ea, alias hit, conf .97)],
  [1 × bread slice 32 g (.93)], [child: butter 1 pat 5 g (.75, amber — portion inferred)]
- "chicken breast 200g, rice 1 cup" → [chicken breast, grilled 200 g (1.0)], [rice → white rice,
  cooked, 1 cup = 158 g (.9; amber only on white-vs-brown, show swap chip)]
- "large latte" → [latte, whole milk, large = 470 ml → 480 g (.85); milk-type swap chips]
- "half a pizza" → [pizza, cheese, 0.5 × whole (560 g) = 280 g (.7, amber: which pizza? show
  pepperoni/margherita/frozen alternatives)]

**7. Confirm step UX.** One screen: parsed items as **editable rows** — `[qty stepper] [unit chip ▾]
[food name ▾] [kcal · P/C/F]` + running meal total. Tap food name → inline top-5 alternates + full
search. Tap unit chip → this food's measures + g/oz. Qty stepper ±0.25 with direct entry. Swipe/✕
removes. Amber/red rows carry a "?" badge. Primary button "Log N items · 742 kcal". Every correction
is written back to localStorage (`alias→food` and `food→portion` learning) so the parser personalizes
with zero server.

**8. LLM (optional, when the Cloudflare Workers AI endpoint IS configured):** use it ONLY to rewrite
messy free text into the same structured `(qty, unit, food-string)` JSON that feeds the *same*
resolver + confirm UI — never let it invent nutrient numbers. Adds value for: long rambling sentences,
misspellings, dish decomposition ("chicken alfredo I made at home" → ingredients), non-English input.
Deterministic path remains the default and must handle the four canonical examples above by itself.

### C3. Where deterministic is enough vs LLM helps

| Case | Deterministic | LLM adds |
|---|---|---|
| qty+unit+known food ("200g chicken breast") | 100% | nothing |
| household measures ("a bowl of rice") | good with defaults table | nothing |
| multi-item with and/with | good with compound whitelist | edge cases |
| brand-new dishes, slang, typos beyond edit-distance 1 | weak → falls to search-as-you-type | strong |
| decomposing homemade recipes | no | strong |
| portion estimation from photos | no | strong (different feature) |

### C4. Household-measure → gram defaults (global fallback table; per-food overrides in dataset)

| Measure | Default g | Common overrides (in `household_measures[]`) |
|---|---|---|
| slice (bread) | 32 | sandwich bread 26, thick 40 |
| slice (pizza, 1/8 of 14") | 107 | thin 80, deep dish 140 |
| slice (cheese) | 21 | |
| slice (deli meat) | 20 | bacon 12 (cooked) |
| slice (tomato/onion) | 20 | |
| cup cooked rice | 158 | brown 195 |
| cup cooked pasta | 140 | |
| cup raw leafy greens | 30 | |
| cup chopped vegetables | 130 | |
| cup milk / liquid | 244 (240 ml) | |
| cup dry cereal | 30–40 (per-food) | oats dry 81 |
| cup berries | 148 | |
| tbsp | 15 ml → butter 14, oil 13.5, peanut butter 16, sugar 12.5, honey 21 |
| tsp | 5 ml → sugar 4.2, oil 4.5 |
| egg (large) | 50 | white 33, yolk 17 |
| medium fruit | apple 182, banana 118, orange 131, pear 178 |
| piece/serving fruit small | 100 | |
| chicken breast | 172 (cooked) | thigh 52, wing 34, drumstick 44 |
| fillet (fish) | 150 | salmon 178 |
| patty (burger) | 90 (cooked) | |
| sausage/link | 45 | hot dog 52 |
| handful | nuts 28, chips/crisps 28, berries 40, popcorn 8 |
| scoop | protein powder 31, ice cream 66 |
| bowl | cereal+... 40 dry, soup 245, rice 200, pasta 200, salad 100 |
| plate | 300 (flag amber) |
| bar | chocolate 45, protein 60, granola 35 |
| can (drink) | 330 ml | soda 355 (12 oz US) |
| bottle (beer) | 330 ml | US 355 |
| glass (wine) | 150 ml | water/juice 250 |
| shot (spirits) | 44 ml | espresso 30 ml |
| pat (butter) | 5 | knob 10 |
| packet (sugar) | 4 | ketchup 9, instant oatmeal 40 |
| pint (beer) | 568 ml (UK) / 473 (US) | ice cream pint 390 g |

(Gram weights from USDA FNDDS `food_portion` + SR household measures; the pipeline emits the full
machine-readable version as `measures.json`.)

---

## RECOMMENDATION (execute this)

1. **Sources & licenses:** Tier-1 core hand-curated from **USDA SR Legacy + FNDDS + Foundation
   (public domain/CC0)** with CoFID (OGL v3) / AUSNUT (CC BY) fills — zero license friction in the
   CC BY-SA repo. Tier-2 lazy catalog from **OpenNutrition TSV (ODbL)** — ship its shards with an ODbL
   attribution notice (`LICENSES.food.md` + `meta.json`), or fall back to a pure USDA ~14k extract if
   ODbL is unwanted. Tier-3 (later, only with barcode scanning) filtered **Open Food Facts (ODbL)**.
   Never ship Nutritionix/Edamam/FatSecret/Spoonacular data (API-only, no redistribution).
2. **Tiers:** core 500–800 foods ≈ 60–120 KB gz in-app; catalog 30–60k foods as ~450 two-letter-prefix
   index shards (10–40 KB each) + ~100 data shards (500 foods each), all static JSON under
   `public/data/food/`, cached in IndexedDB keyed by `meta.json` version.
3. **Search:** tier-1 answers every first keystroke from RAM; shards merge in asynchronously; rank =
   match quality + popularity prior + tier prior + personal history. Dedupe/rank at build time.
4. **Parser:** deterministic segment→quantity→unit→food→grams pipeline per C2 with per-item confidence
   and the C4 measures table; editable-row confirm screen; corrections feed personal aliases in
   localStorage. Optional Workers-AI endpoint only reshapes text into the same intermediate JSON.
5. **Pipeline:** six-stage `seed/food/` build (download→extract→clean→rank→shard→emit) per B5,
   deterministic and pinned, emitting `core.json`, `idx/*.json`, `foods/*.json`, `measures.json`,
   `meta.json`, `LICENSES.food.md`.
6. **Starter data:** `food-core.json` (delivered alongside this doc) is the tier-1 seed — ~500 foods
   with aliases, per-100g macros, servings, and household measures; values sourced from the USDA
   SR Legacy/FNDDS family. It alone fixes "searching chicken returns 1 result / pizza returns nothing".

Key references: fdc.nal.usda.gov/download-datasets · world.openfoodfacts.org/data ·
huggingface.co/datasets/openfoodfacts/product-database · opennutrition.app/download ·
quadram.ac.uk (CoFID) · ciqual.anses.fr · frida.fooddata.dk · foodstandards.gov.au (AFCD/AUSNUT) ·
food-nutrition.canada.ca (CNF) · nutritionix.com/natural-demo · macrofactor.com/ai-food-logging
