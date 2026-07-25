# RESEARCH: Exercise Demonstration, Muscle Targeting, Library UX, and Split/Program Libraries
Research date: 2026-07-25. Sources: live web research (app sites, app-store listings, help centers, review articles) + well-documented program specs. See Sources at bottom.

---

## 1. Per-app survey table

| App / Site | Exercise demo approach | Muscle targeting visual | Library UX | Programs / splits offered |
|---|---|---|---|---|
| **MuscleWiki** (musclewiki.com + app) | Short looping **video clips** (male AND female model per exercise, front + side angle), plus **numbered step text**. ~1,700–2,000+ exercises. Videos cached — "core features work offline". | **Interactive body-map silhouette is the app's core navigation**: tap a muscle on front/back figure → exercise list for it. Per-exercise: highlighted-muscle diagram (primary red, secondary lighter). | Body map IS the browse UI. Filters: equipment (barbell/dumbbell/machine/bodyweight/cables/band/kettlebell/stretches/TRX), difficulty, male/female model toggle. Also plain search + workout generator. Fast because clips are ~3-5s loops. | Not program-centric; has an AI workout generator and simple templates. |
| **Fitbod** | **HD video loops** (studio-shot, 3D-ish rendered for some), ~1,000–1,600 exercises, with written instructions. | **Muscle recovery heatmap**: body silhouette colored by *fatigue/freshness* per muscle (0–100% recovered, ~6-day recovery window). This is an **aggregated** view — sums fatigue across all logged exercises. Per-exercise primary/secondary muscle list. | Library filterable by muscle group + available equipment ("gym profiles"). Entry point is secondary — Fitbod is generator-first (it picks exercises for you), library is for swaps ("swap exercise" suggests similar). | No named-program library; algorithm generates every workout from goal + recovery + equipment. |
| **Hevy** | Illustrated **animations/short videos** + text instructions; several hundred exercises + custom exercises. | Per-exercise muscle-group tag. **Best-in-class aggregated analytics**: "Sets per muscle group per week" bar chart, "Muscle distribution" body diagram with trained areas shaded, 30-day muscle heatmap (Pro). Explicitly marketed for catching imbalances. | Search-first list with thumbnails; filter by muscle + equipment; recent/frequent exercises float up; custom exercise creation. Library reached from within workout logging (add-exercise sheet) and a Library tab. | Template/routine-centric (user-built + shared community routines), not a named-program library. |
| **Strong** | **Text instructions + some videos** for ~200–450 built-in exercises. Deliberately minimal. | Simple muscle-group tag per exercise. No heatmap, no per-muscle volume — reviewers call this its main gap vs Hevy. | Famous for **speed**: instant search, minimal taps, add-exercise sheet sorted alphabetically with muscle-group filter. Custom exercises. | User templates only; no program library. |
| **Jefit** | **Animated demonstrations** (2D looping animation frames — works offline) + step text, ~1,400 exercises. | Per-exercise primary muscle tag; body-part browse (chest/back/legs...). Basic charts of volume by muscle. | Browse by body part grid with thumbnails, filter by equipment/type, search, favorites. Web + app database. | **Large routine database** (thousands, community + staff): beginner full-body, compound-lift programs, PPL, upper/lower, 4-day & 5-day bodybuilding splits, home/dumbbell routines. |
| **Alpha Progression** | **Real trainer-filmed videos** (795 exercises, no stock/AI), short instructions, plus a **muscle-building-potential rating per exercise** (A/B/C-style evaluation). | Per-exercise target-muscle categorization; plan generator asks which muscles to prioritize; volume-per-muscle stats. | Filter by target muscle + equipment; rating helps choose between similar exercises; exercise history shown inline on the exercise page. | Generator builds plans from frequency/experience/goal (2–6 days); not named third-party programs. |
| **Boostcamp** | Exercise videos + instructions inside a program player. | Basic muscle tags; program analytics. | Library exists but the app is **program-first**. | **The program library is the product**: 100+ curated, evidence-based programs + 11,000+ community programs. Named: nSuns 5/3/1 (LP variants 4/5/6-day), GZCLP + GZCL family, 5/3/1 variants (BBB…), Reddit PPL (Metallicadpa), PHUL, PHAT, Sheiko, Candito 6-week, StrongLifts-style 5x5, GreySkull LP, Arnold splits, bodyweight/home programs. Cards show days/week, level, goal, rating, athlete count. Auto-progression built in per program. |
| **ExRx.net** | **Animated GIFs** (hand-assembled frames, ~150KB, frozen background — the OG offline-friendly approach) + terse Preparation/Execution text + Comments. ~2,000 entries; offline download product exists. | **Taxonomy, not visuals**: per-exercise Target / Synergist / Stabilizer muscle lists (anatomical names), classification by Utility (basic/auxiliary), Mechanics (compound/isolated), Force (push/pull). | Cascading directory: category → muscle group → equipment → exercise. Multi-criteria search (name, utility, movement pattern, muscle, mechanics, force, apparatus). Feels like a reference wiki, not an app. | Program *templates* as articles (full body, split routines) — reference-grade, not interactive. |
| **Bodybuilding.com database** | Video guide + photo stills + step text per exercise; user ratings (9.x/10) per exercise. | Primary muscle + secondary list; browse by muscle group page. | Browse by muscle/equipment/type; sort by rating/popularity — the **rating sort** is its signature. | Huge article-based program library (e.g., Arnold split, PHUL/PHAT writeups, 12-week programs). |
| **Liftosaur** | Minimal demo (small illustration/muscle diagram); assumes experienced users. | Per-exercise muscle map + **planned weekly sets per muscle group shown while editing a program** — great authoring-time aggregation. | Exercise picker with equipment variants; everything is text/code ("Liftoscript"). | Built-in: GZCLP + all GZCL programs (The Rippler, VDIP, General Gainz…), 5/3/1 family, Basic Beginner Routine (r/Fitness), Strong Curves, StrongLifts-style LP, Texas Method, more. Progression logic is scripted and editable. |
| **Dr. Muscle** | Video demos + written instructions for all exercises; app is chat/AI-first. | Minimal; focuses on set/rep prescription not anatomy. | Small curated library; swap suggestions. | AI-generated programs only (auto-regulated LP, rest-pause, deloads). |
| **Caliber** | **High-production videos broken into phases** + step-by-step text + form tips; 500+ exercises. Rated 5/5 for instruction by Garage Gym Reviews. | Strength Score + **Strength Balance** (compares development of major muscle groups against each other — an aggregated balance view without a silhouette). | Clean list, filter by muscle/equipment; free tier includes full library. | Trainer-built plans (paid) + freeform; not a named-split library. |
| **wger** (open source) | **Static line-drawing illustrations** (2 frames: start/end), CC-BY-SA (Everkinetic heritage) + text description. ~200–500 exercises. Fully offline/self-hosted. | Front/back **body silhouette SVG with primary muscles shaded** (red) and secondary (lighter) — simple and effective, all vector. | Browse by category (arms/legs/…) + equipment filter; multilingual; API. | Basic plan builder; no named programs. |
| **free-exercise-db / Everkinetic / opentraining** | Open datasets: 800+ exercises as JSON with **2 photos (start/end)** (free-exercise-db, public domain) or **SVG illustrations** (Everkinetic, CC-BY-SA 3.0; site defunct, art survives on Wikipedia/GitHub). | Muscle lists (primary/secondary strings) in JSON. | Searchable static frontend (free-exercise-db). | None — data only. Good reference for schema: name, force, level, mechanic, equipment, primaryMuscles[], secondaryMuscles[], instructions[], category, images[]. |
| **GymVisual** | Commercial licensed illustration packs (thousands of consistent 2D character illustrations, usually 2 frames/exercise). **Paid license — do not use without buying.** | Sold with muscle-highlight variants. | n/a | n/a |

### Key cross-app findings

- **Demo format ladder** (user preference, high→low): real video loop (male+female, multi-angle) → 2D animation/GIF → 2-frame start/end illustration → photo pair → text-only. Users consistently praise MuscleWiki's short loops ("instantly shows form, no play button, no sound needed") and Caliber's phase-broken videos. Text-only (Strong) is tolerated only because its users already know the movements.
- **Offline/no-video apps converge on the same solution**: 2-frame or few-frame illustrations (wger, Everkinetic, ExRx's frozen-background GIFs, Jefit's 2D animations). ExRx literally froze every non-moving pixel to keep GIFs ~150KB. This validates the "few poses + text" approach.
- **A good how-to section** (union of MuscleWiki/Caliber/ExRx/Alpha Progression): (1) Setup/starting position, (2) Execution steps (numbered, 3–6 steps), (3) Breathing (exhale on effort), (4) Tempo suggestion, (5) 2–4 coaching cues ("chest up", "drive through heels"), (6) Common mistakes (2–3), (7) muscles worked, (8) variations/similar exercises, (9) safety note where relevant.
- **Muscle targeting**: two families — (a) **silhouette shading** (MuscleWiki, wger, Hevy, Fitbod) with primary=strong color, secondary=lighter; (b) **structured lists** (ExRx target/synergist/stabilizer). Nobody mainstream shows per-muscle % contribution on the exercise page (too pseudo-precise); Fitbod uses hidden fractional scores only to compute recovery.
- **Aggregated views that users love**: Fitbod's recovery heatmap (silhouette, per-muscle freshness %), Hevy's weekly sets-per-muscle-group bars + shaded body diagram, Liftosaur's plan-time weekly set counts, Caliber's Strength Balance. The common currency is **hard sets per muscle per week**.
- **Library speed**: instant local search, alphabetical + grouped-by-muscle toggle, thumbnails on every row, equipment filter, recent/frequent section on top, favorites. Popular app counts: Strong ~200–450, Caliber 500+, wger ~500, Alpha Progression 795, free-exercise-db 800+, Fitbod ~1,000–1,600, Jefit ~1,400, MuscleWiki ~1,700–2,000, ExRx ~2,000. **A curated 50–150 with great art beats 2,000 with bad art for a personal app** — Strong proves small works.

---

## 2. What we should steal (prioritized)

1. **Body-map as navigation** (MuscleWiki): tappable front/back SVG silhouette → exercises for that muscle. Doubles as the targeting visual. Highest wow-per-effort.
2. **Weekly sets-per-muscle bar chart + shaded silhouette** (Hevy): the aggregated view; currency = hard sets/muscle/week, with target bands (e.g., 10–20 sets = green).
3. **2-frame start/end pose art per movement pattern** (wger/Everkinetic/ExRx lineage): fully offline, self-authored SVG, reusable across exercises (spec in §5).
4. **Primary/secondary muscle shading on every exercise page** (primary = full color, secondary = 40% tint) + plain-English muscle names with anatomical name secondary.
5. **Numbered how-to steps + cues + mistakes** structure (Caliber/MuscleWiki format, §1 checklist above).
6. **Program cards with metadata** (Boostcamp): days/week, level, goal, split type on the card; one-tap "start this program".
7. **Add-exercise sheet UX** (Strong/Hevy): instant search, Recent on top, muscle + equipment filter chips, alphabetical fallback, thumbnail per row.
8. **"Similar exercises" swap** (Fitbod): same pattern + same primary muscle → substitutes list; nearly free once exercises are tagged by pattern.
9. **Recovery/freshness heatmap** (Fitbod): optional later — color silhouette by days-since-trained per muscle.
10. **Exercise rating/tiering** (Alpha Progression / Bodybuilding.com): a simple "S/A/B" effectiveness tag helps beginners choose between similar exercises.
11. **ExRx classification fields** in the data model even if not all surfaced: mechanics (compound/isolation), force (push/pull/static), utility (primary/accessory), pattern.

---

## 3. SPLIT LIBRARY TABLE (implementation-ready)

Legend: Level B=beginner, I=intermediate, A=advanced. Goal: S=strength, H=hypertrophy, F=fat loss/conditioning, E=endurance/GPP.

| # | Split / Program | Days/wk | Level | Goal | Day-by-day structure | One-liner |
|---|---|---|---|---|---|---|
| 1 | **Full Body 3-Day (classic)** | 3 | B | S+H | Full A / rest / Full B / rest / Full A… (alternate A/B) | Highest frequency per muscle for beginners; every session hits squat-hinge-push-pull. |
| 2 | **StrongLifts 5x5** | 3 | B | S | A: Squat/Bench/Row · B: Squat/OHP/Deadlift, alternating, 5x5, +2.5kg per session | The canonical linear-progression starter; brutally simple. |
| 3 | **Starting Strength** | 3 | B | S | A: Squat/Press/Deadlift · B: Squat/Bench/Deadlift (later power clean), 3x5 | Rippetoe's barbell LP; squat every session, fastest novice strength gains. |
| 4 | **GreySkull LP** | 3 | B | S+H | Bench or OHP (alt) + Squat or DL (alt) + accessories; AMRAP last set; 2.5-day rotation | LP with AMRAP autoregulation and built-in 10% reset; more upper-body volume than SS. |
| 5 | **r/Fitness Basic Beginner** | 3 | B | S | 2 alternating full-body days: Row/Bench/Squat vs Chin-up/OHP/Deadlift, 3x5+ | Reddit's default recommendation; AMRAP-driven LP, minimal equipment knowledge needed. |
| 6 | **Full Body 2-Day (minimalist)** | 2 | B–I | S+H (maintenance) | 2 non-consecutive full sessions: squat+push+pull / hinge+push+pull, 3–4 sets each | For busy people; research-backed that 2 hard full-body days retain and even build muscle. |
| 7 | **Upper/Lower 4-Day** | 4 | I | S+H | Upper A / Lower A / rest / Upper B / Lower B / rest ×2 | The workhorse intermediate split; 2× frequency per muscle, easy to balance. |
| 8 | **PHUL** (Power Hypertrophy Upper Lower) | 4 | I | S+H | Upper Power / Lower Power / rest / Upper Hyper / Lower Hyper | Upper/lower with heavy (3–5 rep) days and volume (8–12 rep) days; strength + size in one week. |
| 9 | **Push/Pull/Legs ×1 (3-Day PPL)** | 3 | B–I | H | Push / Pull / Legs, each once, rest between | Gentle intro to body-part training; each muscle 1×/week directly. |
| 10 | **Reddit PPL (Metallicadpa) 6-Day** | 6 | B–I | S+H | Push/Pull/Legs ×2; each day anchored by a 5x5→AMRAP barbell lift (bench, row/DL, squat) + hypertrophy accessories | The internet's favorite LP-meets-bodybuilding program; high volume, high frequency. |
| 11 | **PPL 5-Day rotating** | 5 | I | H | P/P/L/P/P then continue rotation next week (muscles hit ~1.7×/wk) | PPL without the 6-day life commitment; rotation keeps frequency ≥1.5×. |
| 12 | **PHAT** (Layne Norton) | 5 | I–A | S+H | Upper Power / Lower Power / rest / Back+Shoulders Hyper / Chest+Arms Hyper / Legs Hyper | Powerbuilding classic: 2 power days + 3 speed-work-plus-volume hypertrophy days. |
| 13 | **Bro Split (5-Day body part)** | 5 | I | H | Chest / Back / Shoulders / Arms / Legs | One muscle per day, huge per-session volume; loved for pump and simplicity, 1×/wk frequency. |
| 14 | **Arnold Split** | 6 | A | H | Chest+Back / Shoulders+Arms / Legs, ×2 per week | Golden-era antagonist pairings, 2×/wk frequency, very high volume — for experienced lifters with time. |
| 15 | **nSuns 5/3/1 LP (4-, 5-, 6-day)** | 4–6 | I | S | Each day: a 9-set T1 wave (e.g., Bench 8 sets + 1+ AMRAP) + T2 secondary lift + accessories; days = Bench/OHP, Squat, Bench/CGBP, DL/Front Squat (+ extra days in 5/6-day) | High-volume weekly-progression 5/3/1 spinoff; top-rated on Boostcamp (43K+ athletes). |
| 16 | **5/3/1 + Boring But Big** | 4 | I | S+H | OHP / Deadlift / Bench / Squat days: 5/3/1 main sets (percent-based, AMRAP top set) + 5x10 supplemental + accessories; monthly cycles | Wendler's slow-cooker: monthly progression, submaximal training, huge staying power. |
| 17 | **GZCLP** | 3–4 | B–I | S | 4 rotating days: T1 heavy lift 5x3+ (Squat/Bench/DL/OHP) + T2 volume lift 3x10 + T3 accessory 3x15+; tiered rep-out progression with built-in stage regression | Cody Lefever's LP with automatic stall-handling; Boostcamp/Liftosaur staple. |
| 18 | **Texas Method** | 3 | I | S | Volume day (5x5 @90%) / Light recovery day / Intensity day (new 5RM) | Weekly progression bridge after novice LP stalls; classic but unforgiving. |
| 19 | **Madcow 5x5** | 3 | I | S | Mon heavy ramped 5x5 / Wed light / Fri ramp to new 1x5 PR; weekly +2.5% | The intermediate 5x5: same lifts as StrongLifts but weekly progression and ramped sets. |
| 20 | **Upper/Lower/Full Hybrid (Upper/Lower/Rest/Push/Pull/Legs or U/L + FB)** | 5 | I–A | H | e.g., Upper / Lower / rest / Push / Pull / Legs — or U/L/rest/FB | "Best of both" hybrid popular on YouTube (Jeff Nippard-style); balances frequency and volume. |
| 21 | **Home Dumbbell-Only 3–4 Day** | 3–4 | B–I | H+F | Full-body or U/L using DB bench/goblet squat/RDL/row/OHP/lunge/curl | No-barbell adaptation; every pattern covered with a pair of dumbbells + bench. |
| 22 | **Bodyweight / Calisthenics (r/bodyweightfitness RR)** | 3 | B–I | S+H | Full body ×3: pull-up/dip/row/push-up progressions + squat/hinge + core, paired sets | The Recommended Routine; progression by leverage (tuck→full) instead of load. |
| 23 | **Kettlebell Minimalist (S&S-style)** | 3–6 (short) | B–I | E+F+S | Daily-ish: swings 10x10 + Turkish get-ups 10x1 (Simple & Sinister) or C&P + snatch days | Conditioning-forward minimalism; 20–30 min sessions, one implement. |
| 24 | **Athletic / Conditioning Hybrid** | 4 | I | F+E+S | 2 lift days (full-body power: trap-bar DL, push press, jumps) + 2 conditioning days (intervals, sled, carries) | For sport/GPP users; strength maintained while engine improves. |
| 25 | **Strong Curves / Glute-Focus U/L** | 3–4 | B–I | H (lower-body emphasis) | Glute-dominant full-body or L/U/L: hip thrust anchor + squat/hinge + upper accessory | Bret Contreras' program (built into Liftosaur); most popular women's-focused template. |

Implementation notes: store each split as `{name, daysPerWeek, level, goals[], structure: [{dayLabel, focus, slots:[{pattern, setsReps, exemplarExerciseId}]}], progression, description}`. Programs 2,3,15,16,17,18,19 have precise canonical set/rep/progression schemes (public domain knowledge, widely reproduced) — encode them exactly; the rest are template splits where day structure matters more than fixed numbers.

---

## 4. Best-in-class exercise page checklist

1. Name + aliases (search hits "OHP", "military press", "shoulder press").
2. Demo visual above the fold, auto-playing/looping, no sound dependency (MuscleWiki pattern).
3. Muscle silhouette: primary (full color) + secondary (tint), front/back as appropriate; tap muscle → its exercise list.
4. Tags row: equipment · mechanics (compound/isolation) · force (push/pull) · difficulty · pattern.
5. How-to: Setup (2–3 bullets) → Execution (3–6 numbered steps) → Breathing → 2–4 cues → 2–3 common mistakes.
6. Similar/substitute exercises (same pattern+muscle).
7. Personal history inline: last performed, best set, PR, chart (Alpha Progression does this well).
8. One-tap "add to workout".
9. Optional: effectiveness tier, safety note, tempo suggestion.

---

## 5. SPEC: Offline how-to representation, self-authored SVG only

**Approach: pattern-level pose art.** Do what wger/Everkinetic/ExRx prove works — a small number of static poses — but author them once per *movement pattern*, not per exercise, as clean side-view (or 3/4-view) SVG figures. Exercise pages compose: `pattern pose frames + equipment glyph + text block`.

### Format
- **2–3 frames per pattern**: START and END always; MID only where the path matters (e.g., squat depth, pull-up chin position). Rendered side by side ("A → B") or as a 2-frame crossfade/toggle animation (CSS, still offline, no assets).
- **Figure style**: single-color filled mannequin (like wger/Everkinetic) or thick-stroke stick figure with joint dots; ~24 landmarks; consistent proportions from one shared figure component so all art matches. Accent color on the moving limb; motion arrow (curved SVG arrow) showing bar/limb path — this one arrow does most of the teaching.
- **Equipment as swappable glyphs**: barbell (line+plates), dumbbell, kettlebell, cable (line to pulley corner), band, bench (rect), pull-up bar. Same pose + different glyph = different exercise. Grip/stance variants via small badge text ("wide grip", "neutral") rather than new art.
- **Muscle overlay**: the same front/back body silhouette used app-wide, primary/secondary shading, shown beside the pose frames.
- **Text block** (per exercise, authored, ~60–120 words): setup bullets, numbered execution, breathing line, 2–4 cues, 2–3 mistakes. Text is where exercise-specific nuance lives; art carries the pattern.

### Movement patterns needed to cover ~59 exercises (≈20 pattern rigs)

| Pattern rig (2–3 frames each) | Covers (examples) |
|---|---|
| 1. Horizontal press, lying | barbell bench, DB bench, close-grip bench, floor press |
| 2. Incline press | incline barbell/DB press |
| 3. Push-up (plank press) | push-up, diamond, deficit |
| 4. Vertical press, standing/seated | OHP, DB shoulder press, push press |
| 5. Dip (upright support) | dips, bench dips |
| 6. Horizontal row, bent-over | barbell row, DB row (add bench glyph), cable row (seated variant = frame tweak) |
| 7. Vertical pull | pull-up, chin-up, lat pulldown (cable glyph, seated) |
| 8. Squat | back squat, front squat (bar position swap), goblet (DB glyph), bodyweight |
| 9. Split squat / lunge | lunge, Bulgarian split squat (rear bench), step-up |
| 10. Hip hinge, floor pull | conventional deadlift, trap bar, sumo (stance badge) |
| 11. Hip hinge, top-down | RDL, stiff-leg DL, good morning, DB RDL |
| 12. Hip thrust / glute bridge | barbell hip thrust, glute bridge |
| 13. Elbow flexion (curl) | barbell/DB/hammer/cable curl (glyph + grip badge) |
| 14. Elbow extension, pressdown | cable pushdown, band pushdown |
| 15. Elbow extension, overhead/lying | skull crusher, overhead DB extension |
| 16. Lateral/front raise | side raise, front raise, cable lateral |
| 17. Fly / rear-delt reverse fly | DB fly, cable fly, reverse fly, face pull (cable, arrow change) |
| 18. Calf raise | standing/seated calf raise |
| 19. Core anti-extension / plank family | plank, dead bug, ab rollout |
| 20. Trunk flexion / leg raise | crunch, hanging leg raise, sit-up |
| (+ optional) 21. Shrug; 22. Leg extension/curl machine (one seated rig, arrow flips); 23. Carry (single frame + arrow) | shrugs, leg ext, leg curl, farmer carry |

≈20–23 rigs × 2.5 frames ≈ **50–58 SVG frames total** to cover 59+ exercises — and each new exercise added later is usually free (existing rig + glyph + text). Author frames as one SVG symbol library (`<symbol id="squat-start">…`) with CSS variables for accent color and theme (light/dark).

### Data model addition
`exercise.pattern` (enum of rigs above), `exercise.equipment`, `exercise.gripStanceBadge?`, `exercise.frames = derived from pattern`, `exercise.howTo {setup[], steps[], breathing, cues[], mistakes[]}`, `exercise.primaryMuscles[]`, `exercise.secondaryMuscles[]`, `exercise.mechanics`, `exercise.force`, `exercise.tier?`. (Mirrors free-exercise-db's proven schema + pattern field.)

---

## 6. SPEC: Aggregated targeting view

**Currency: hard sets per muscle per week** (Hevy's model — the one users and the hypertrophy literature both use).

- **Attribution rule**: each set credits **1.0 set to each primary muscle, 0.5 to each secondary** (Fitbod-style fractional scoring, simplified). Keep it deterministic and documented; no fake percentages on the UI.
- **View 1 — Week bar chart**: horizontal bars per muscle group (10–12 groups: chest, back, front/side/rear delts or just shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core), value = weighted sets this week. Overlay a **target band** (e.g., 10–20 sets shaded green; <10 amber "undertrained", >22 red "check recovery"). Toggle: this week / last 4 weeks avg / per-workout.
- **View 2 — Body silhouette heat**: reuse the same front/back SVG silhouette; fill each muscle by set-count bucket (0 = outline only, 1–5 light, 6–12 medium, 13–20 strong, >20 saturated/warning). One glance answers "what am I neglecting" (Hevy's shaded muscle-distribution diagram + Fitbod heatmap, merged).
- **View 3 — Plan-time preview** (Liftosaur's trick, high value): when viewing/editing a split or program, show projected weekly sets per muscle *before* the user commits — instantly reveals that a bro split gives quads 4 sets/week.
- **Optional freshness mode** (Fitbod): recolor silhouette by days-since-last-trained per muscle (0–1d red "fatigued" → 3d+ green "fresh"), simple decay, no ML needed.
- **Drill-down**: tap a bar/muscle → list of contributing exercises + sets this week → tap through to exercise page.

---

## Sources (primary ones used)
- MuscleWiki site/app listings: https://musclewiki.com/ · https://apps.apple.com/us/app/musclewiki-workout-fitness/id1096827640 · https://play.google.com/store/apps/details?id=com.musclewiki.macro · https://greatist.com/move/this-cool-website-tells-you-exactly-how-to-work-any-muscle
- Fitbod recovery/heatmap: https://fitbod.me/blog/muscle-recovery/ · https://fitbod.zendesk.com/hc/en-us/articles/360006269014-Muscle-Recovery · https://fitbod.me/blog/tracking-volume-intensity-and-recovery-with-fitbod/ · https://fitnessdrum.com/fitbod-review/
- Hevy analytics: https://www.hevyapp.com/features/sets-per-muscle-group-per-week/ · https://www.hevyapp.com/features/muscle-group-workout-chart/ · https://www.hevyapp.com/features/training-chart/ · https://repreturn.com/hevy-app-review/
- Strong vs Hevy: https://repreturn.com/strong-app-vs-hevy/ · https://www.sensai.fit/blog/hevy-vs-strong-2026 · https://help.strongapp.io/article/97-create-custom-exercises
- Boostcamp: https://www.boostcamp.app/programs · https://www.boostcamp.app/blogs/most-popular-free-workout-routines-from-reddit · https://apps.apple.com/us/app/boostcamp-workout-programs/id1529354455
- Jefit: https://www.jefit.com/exercises · https://www.jefit.com/routines · https://www.gymbird.com/fitness-apps/jefit-app-review
- Alpha Progression: https://alphaprogression.com/en · https://fitnessdrum.com/alpha-progression-app-review/ · https://www.hotelgyms.com/blog/alpha-progression-the-gym-logger-app-from-germany
- ExRx: https://exrx.net/Lists/Directory · https://exrx.net/WorkoutWebApp/BrowseExercises · https://exrx.net/Questions/ExerciseClassAnalyses
- Liftosaur: https://www.liftosaur.com/ · https://www.liftosaur.com/programs/gzclp · https://www.liftosaur.com/blog/posts/liftosaur-overview/
- Caliber: https://www.garagegymreviews.com/caliber-app-review · https://barbend.com/caliber-fitness-app-review/
- Dr. Muscle: https://dr-muscle.com/what-makes-dr-muscle-different/ · https://apps.apple.com/us/app/dr-muscle-ai-personal-trainer/id1073943857
- wger: https://wger.de/en/software/features · https://github.com/wger-project/wger
- Open datasets: https://github.com/yuhonas/free-exercise-db (public domain, 800+ ex., 2-photo format) · https://github.com/yuhonas/free-exercise-db/issues/2 (Everkinetic CC-BY-SA 3.0) · https://github.com/chaosbastler/opentraining-exercises
- Program specs (StrongLifts, Starting Strength, GreySkull, nSuns, GZCLP, 5/3/1, Texas Method, Madcow, PHUL, PHAT, Reddit PPL, RR, Strong Curves): canonical public writeups widely mirrored on Boostcamp/Liftosaur/r-Fitness wikis.
