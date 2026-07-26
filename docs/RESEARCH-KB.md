# FitForge Knowledge Base — Retrieval, LLM Harness, and Sources

Companion to `kb-faq.json` (83 entries, 10 categories). Goal: answer ~90% of user questions
instantly and offline from the KB; route only genuinely personalized edge cases to a small,
free LLM (e.g. Cloudflare Workers AI, Llama 3.x 8B class).

---

## 1. Offline Retrieval Strategy (no embeddings, static export)

### 1.1 Index build (at build time, shipped as JSON)

For each entry, build a token bag from: `question` (weight 3), each `aliases[]` string
(weight 2), `answer` (weight 1), `category` name (weight 1). Tokenization:

1. Lowercase, strip punctuation, split on whitespace.
2. Drop stopwords (`the, a, i, my, to, do, is, it, for, should, how, what, ...` — keep
   domain words like `not`, `without`, `much`, `many` since they carry meaning here).
3. Light stemming — a ~10-rule suffix stripper is enough for this domain (full Porter is
   overkill): `-ies→y, -ing→∅, -ed→∅, -es→∅, -s→∅, -ly→∅, -er→∅` with a min-stem length
   of 3. Ship the stemmer, run it identically on index and query.
4. Synonym normalization map (crucial — this does more than stemming). Maintain a small
   hand-curated table applied before indexing and querying, e.g.:
   - `workout|session|training|exercise → train`
   - `gym → gym`, `weights|lifting|lift → lift`
   - `fat|weight (in loss context) — keep both`, `shed|drop|lose → lose`
   - `bulky|big|huge|massive → bulky`, `toned|definition|lean → toned`
   - `sore|soreness|doms|ache → sore`, `protein|prot → protein`
   - `kcal|cals|calories → calorie`, `plateau|stall|stuck → plateau`
   Numbers survive tokenization (`1g`, `10000`) — normalize `10k → 10000`.
5. Precompute per-entry: `tokens: Map<stem, weight>`, plus an inverted index
   `stem → [entryId...]` and per-stem IDF: `idf(t) = log(1 + N / df(t))` where N = entry
   count. Shipped index for 83 entries is ~30–50 KB — trivial.

### 1.2 Query scoring (at runtime)

Given user text Q, tokenize/stem/synonym-normalize identically → query stems `q1..qn`.

```
score(entry) = Σ over matched stems t:  idf(t) × fieldWeight(t, entry)
             + phraseBonus   (× 1.5 multiplier if a 2+ word bigram from Q appears
                              contiguously in the question or any alias)
             + exactAliasBonus (+5 flat if the whole normalized query equals a
                              normalized alias or question)
             − lengthPenalty  (score ÷ sqrt(uniqueQueryStems), so long rambling
                              queries don't inflate scores)
```

Fuzzy assist: if a query stem matches nothing in the vocabulary, retry with edit-distance-1
against vocabulary stems of length ≥ 5 (catches `protien`, `platue`, `sorness`).

### 1.3 Decision thresholds

Normalize the top score: `conf = topScore / selfScore(topEntry)` where `selfScore` is the
entry scored against its own question (precomputed). Then:

- **conf ≥ 0.55** → serve the KB answer instantly. Show the question matched ("Answering:
  *How much protein do I need?*") so mismatches are self-evident, plus 2–3 `followups` as
  tappable chips.
- **0.30 ≤ conf < 0.55** → disambiguate: show the top 3 entries' questions as buttons
  ("Did you mean…?"). Zero AI cost, and taps are training data for your synonym table.
- **conf < 0.30**, or the query contains first-person specifics the KB can't know
  (regex cues: `my (knee|shoulder|back|routine)`, ages, "should I personally", multiple
  constraints combined) → route to the LLM **with the top 3 KB entries attached as
  grounding** (see §2). If the LLM is unavailable, fall back to showing the top-3 list
  with an honest "closest matches" label.

### 1.4 Maintenance loop

Log (locally) queries that hit the disambiguation or LLM path. Periodically fold the common
ones back in as new `aliases` or new entries. Alias coverage, not algorithm cleverness, is
what moves the instant-answer rate from 70% to 90%.

---

## 2. System Prompt for the Weak LLM

Exact text (fill `{...}` slots from the user profile and retrieval step; omit lines whose
slot is empty):

```
You are the FitForge Coach, a friendly, evidence-based fitness and nutrition assistant
inside the FitForge app.

USER PROFILE
- Goal: {goal}
- Experience: {experience_level}
- Training: {split} split, {days_per_week} days/week
- Equipment: {equipment_list}
- Targets: {calorie_target} kcal, {protein_target} g protein
- Excluded exercises / limitations: {exclusions}

REFERENCE NOTES (trusted; prefer these over your own memory)
{kb_snippets}

RULES
1. Answer ONLY the question asked. 2-4 short sentences, or up to 4 bullets. Never exceed
   120 words.
2. Base your answer on the REFERENCE NOTES when they are relevant. If they don't cover the
   question and you are not confident, say "I'm not certain about that" and suggest what
   to look up or ask a professional — do not guess numbers.
3. Personalize using the USER PROFILE (their goal, experience, equipment, targets,
   exclusions). Never recommend an exercise on their exclusion list or equipment they
   don't have.
4. NO medical advice. Do not diagnose, treat, or give advice for injuries, pain, illness,
   pregnancy, or medication. For those, give only general safety information and tell the
   user to consult a doctor or physical therapist.
5. Only mention app features listed here: logging workouts, editing routines, swapping
   exercises, changing split, exporting data, Local Mode. Never invent settings, screens,
   or features.
6. Plain English. No emojis, no markdown headers, no greetings or sign-offs, no repeating
   the question back.
```

Notes on why it's shaped this way for an 8B model: short numbered rules (weak models drop
rules buried in prose), profile as a labeled block (easier to copy from than to reason
about), an explicit "say you're not certain" escape hatch (reduces fabricated numbers),
and a hard word cap (small models ramble past soft limits).

---

## 3. Harness Tuning for Weak/Free Models

**Sampling & limits**
- `max_tokens`: 200 (hard backstop for the 120-word rule; prevents runaway cost/latency).
- `temperature`: 0.2–0.3. Factual coaching, not creativity. `top_p` 0.9 default is fine.
- One user turn only — don't send chat history to an 8B model; re-retrieve and re-inject
  context each question instead. History dilutes instruction-following badly at this size.

**Formatting retrieved context (`{kb_snippets}`)**
- Attach the top 1–3 KB entries, max ~350 words total. More context degrades small models.
- Format each as:
  ```
  [Note 1 — "How much protein do I need?"]
  Aim for roughly 0.7-1 g per pound of bodyweight per day...
  ```
  Quoted-question headers help the model cite the right note; strip ids/aliases/followups.
- Put snippets in the system prompt (as above), not the user turn — Llama-class models
  weight system content more reliably.

**Few-shot (recommended, 2 examples)**
Prepend two short assistant-turn exemplars: (a) a personalized answer that visibly uses a
profile field and a note, (b) a medical refusal ("I can't advise on knee pain — a physical
therapist can assess that. Meanwhile you can keep training upper body per your routine.").
Few-shot buys more instruction-following from 8B models than any amount of rule text; keep
examples under 60 words each so they model brevity too.

**Output handling**
- Truncate at the last complete sentence if the model hits `max_tokens` mid-sentence.
- Post-filter: if the reply names an app feature outside the allowed list, or exceeds
  ~150 words, regenerate once at temperature 0; if it fails again, fall back (below).
- Cheap self-check regex for medical leakage (dosage/mg, "diagnos", "you have a") →
  replace with the canned safety line + relevant KB entry.
- Label AI answers in the UI ("AI answer — general guidance, not medical advice") and
  render the KB entries used as "Sources" chips.

**Fallback ladder (model down, rate-limited, or low confidence)**
1. Show the top-3 KB matches with "Closest answers from the knowledge base:".
2. If retrieval also found nothing: a static card — "I don't have a good answer for that
   yet. Try rephrasing, or browse categories below." Never fake an AI answer.
3. Cache successful AI answers keyed by (normalized query, profile hash) locally so repeat
   questions cost nothing and work offline afterward.

**Timeouts**: 10 s hard timeout on the AI call → fallback 1. Show the KB top match
immediately *while* the AI call runs ("instant answer now, better answer in a moment") so
perceived latency is near zero.

---

## 4. Sources Consulted

Question inventory and phrasing were drawn from live research (July 2026):

- The Fitness Wiki (r/Fitness official wiki) — FAQ structure and canonical beginner
  questions ("I'm not making progress", "I don't want to get huge", self-consciousness):
  https://thefitness.wiki/ and https://thefitness.wiki/faq/ (index page; FAQ page itself
  blocks fetchers, content corroborated via search excerpts)
- Trainer-facing "most asked client questions": Erin Nitschke (NFPT/Medium) —
  https://erindollisonnitschke.medium.com/six-questions-personal-trainers-get-asked-the-most-by-clients-16779ce478f ;
  NFPT — https://nfpt.com/personal-training-client-questions-youll-answer/ ;
  InsureFitness — https://insurefitness.com/personal-trainer/common-questions-and-how-to-answer-them/ ;
  Svetness — https://www.svetness.com/blogs/questions-clients-ask-before-training
  (spot reduction, results timelines, "will it be tailored to me", nutrition scope-of-practice)
- App help centers (reveal what app users actually ask): Fitbod —
  https://help.fitbod.me/hc/en-us (Getting Started, algorithm Q&A, FAQ sections);
  Hevy — https://help.hevyapp.com/ (RPE usage, rest timers, routine editing);
  Strong — https://help.strongapp.io/article/231-rest-timer
- "Most googled" beginner questions: https://www.trainwithkiwi.com/post/10-most-googled-gym-questions-answered-your-complete-fitness-guide ;
  protein/frequency norms: https://liftandnurture.com/how-much-protein-for-beginners/ ,
  https://www.mindpumpmedia.com/blog/how-often-should-i-lift-weights-as-a-beginner/
- Myth-correction pages (bulky/toning/spot-reduction): Sunny Health —
  https://sunnyhealthfitness.com/blogs/health-wellness/women-weightlifting-fitness-myths ;
  Ultimate Performance — https://blog.ultimateperformance.com/why-women-shouldnt-be-scared-of-getting-bulky-training-with-weights/ ;
  VP Fitness — https://vpfitness.net/debunking-common-fitness-myths/
- Older adults: BodySpec — https://www.bodyspec.com/blog/post/weight_training_after_60_a_safe_sciencebacked_guide ;
  More Life Health — https://morelifehealth.com/articles/strength-training-guide
  (safety of RT at any age, 40-60% 1RM starts, doctor-clearance framing)
- Weight-loss stall / scale questions (MyFitnessPal community threads):
  https://community.myfitnesspal.com/en/discussion/10638534/not-losing-weight-with-a-calorie-deficit
  and related; Season Health — https://www.seasonhealth.com/blog/calorie-deficit-not-losing-weight-explained
  (logging accuracy, water/sodium, 0.5-2 lb/week norms)

Numeric guidance in answers (protein 1.6–2.2 g/kg, 10–20 sets/muscle/week, 0.5–1% BW/week
fat loss, 150 min/week cardio, RPE/RIR definitions, creatine 3–5 g) reflects mainstream
consensus positions (ISSN, ACSM/WHO activity guidelines, r/Fitness wiki) and was kept
deliberately range-based and non-prescriptive.

**App-category caveat**: the 8 `app` entries encode assumed FitForge behavior (Local Mode
= browser storage, export in Settings, KB-first answering). Verify each against the shipped
product before release — these are the only entries that can be *wrong by fiat* rather
than by science.
