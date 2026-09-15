# Plan · One engine, three surfaces: Safari, iPhone, Apple Watch

Date: 2026-09-15. Synthesis of `RESEARCH-WEARABLE.md` (hardware, manufacturing, tariffs) and
`RESEARCH-ADAPTIVE.md` (what sleep and the workout log can actually drive). This document sets the
direction and scopes the work.

**The decision: no hardware.** FitForge builds a unified tracking engine that runs on three
surfaces the user already owns. The Apple Watch is the wrist sensor. HealthKit is the aggregator.
The custom band from the first pass stays an option, priced and parked.

**Research caveat.** Primary vendor pages were partially egress-blocked. Figures come from
search-result snippets, Apple developer documentation summaries and vendor pages, plus the working
tree read directly. Tags: **verified** (primary or official source snippet), **secondary**
(trade press, community, vendor blog), **estimate** (derived here). ⚠ marks anything unconfirmed.

---

## 0. The five findings that shape this plan

1. **The sync engine is the blocker, not the watch app.** Today the cloud copy is a whole-bundle
   last-write-wins mirror capped at 900,000 bytes, with an extras sweep of 32 keys at 512 KiB each
   (`apps/web/lib/auth/sync.ts`, `lib/demo/store.ts`) **verified**. That design is safe with one
   writer. Three writers — watch, phone, laptop — make it lossy by construction. Last-write-wins is
   "simple and brutal but quietly destructive" [AppScale] secondary. This must be fixed before the
   watch ships, not after.
2. **The iOS shell as built will be rejected.** `RootView.swift` is a single full-screen `WKWebView`
   loading `https://goforge.fit` **verified**. Guideline 4.2 rejections target exactly "a responsive
   website, wrapped in a WKWebView, with an app icon" [MobiLoud, AppCompliance] secondary, and 2026
   guidance says bolting on push or location is no longer sufficient ⚠. The iOS app needs genuinely
   native surfaces. The good news: HealthKit, the watch companion and the rep-counting engine are
   all native by nature, so the fix and the roadmap are the same work.
3. **HealthKit is a partial aggregator, and HRV is the hole.** Oura exports sleep with stages, heart
   rate at one-minute intervals, steps, active energy, respiratory rate, weight and workouts to
   Apple Health; Whoop syncs recovery, strain and sleep; Garmin syncs 17 metrics [sensai.fit]
   secondary. But **Oura, Whoop and Garmin all decline to write HRV into Apple Health** — Apple
   stores SDNN, Whoop measures rMSSD — and Apple Watch is the only mainstream device that writes HRV
   natively [sensai.fit] secondary. FitForge's readiness engine consumes `hrvSdnn`. So HealthKit
   gets you sleep and heart rate from everyone, and HRV only from Apple Watch. Vendor cloud APIs are
   the only route to the rest, which is the Stage 0 Worker already scoped in the first pass.
4. **The watch can see more than any band we would build.** `CMBatchedSensorManager` delivers
   800 Hz accelerometer and 200 Hz device motion on Apple Watch Series 8 and Ultra, and it requires
   an active HealthKit workout session [WWDC23 Core Motion] **verified**. The first pass priced a
   custom band whose realistic budget was 50 Hz. The watch is an order of magnitude better, free,
   and already on the wrist.
5. **The catalog is the moat and it is thin in exactly two places.** 91 exercises, 31 split
   programs, 509 bundled foods plus a USDA tier-2 build **verified from the tree**. The exercise
   library is strength-only; the food catalog is USDA-derived and therefore Western. Both gaps are
   content work with known open sources, not engineering risk.

---

## 1. What each surface is for

The single most useful design decision is to stop treating the three surfaces as one responsive
layout. They have different jobs, different session lengths and different postures.

| | **Laptop / desktop Safari** | **iPhone (Safari or app)** | **Apple Watch** |
|---|---|---|---|
| Posture | seated, two hands, 10+ min | standing, one thumb, 10–60 s bursts | mid-set, one tap, under 2 s |
| Primary job | review and plan | capture | execute |
| What the user came to do | read the week, adjust the program, export data, read the evidence links | log a set, log a meal, check today, morning check-in | start the set, confirm the reps, watch the rest timer |
| Screen budget | wide, dense, multi-column | 390 × 664, single column | ~184 × 224, one idea |
| Network | assumed | intermittent | often none |
| What it must never do | force phone-sized cards into a 1440 px window | bury the "log a set" button | show anything that needs reading |

### 1.1 Laptop: the surface that does not exist yet

Today the web app is explicitly phone-first at 390 × 664, with desktop declared secondary in
`PRODUCT.md` **verified**. That is the right call for the gym, and the wrong call for Sunday
planning. The desktop view should be a genuinely different composition, not a centred phone:

- **Week board.** Seven columns, the planned session in each, drag to reschedule. This is the
  natural home for the missed-day resequencing from `RESEARCH-ADAPTIVE.md` §3.
- **Program editor.** Swap exercises, change set counts, adjust the volume targets per muscle, with
  the heat map live beside it.
- **Analytics at full width.** Volume trends, estimated one-rep-max curves, body weight, readiness
  against performance. The phone shows one chart; the laptop shows the relationship between four.
- **Export and backup.** Already exists in Settings; on desktop it should be a first-class page with
  CSV, JSON and a printable program sheet.
- **Evidence.** The in-app citations are a differentiator and nobody reads them on a phone.

### 1.2 iPhone: capture, and the native shell

The iOS app should feel like the web app because it largely is the web app. The contract that makes
this defensible under Guideline 4.2 is that the **native layer owns everything the web cannot do**:

| Native (Swift) | Web (existing Next.js) |
|---|---|
| HealthKit read and write | onboarding, plan generation, catalog |
| Watch connectivity and session handoff | nutrition logging and the food parser |
| Local notifications: rest timer, check-in nudge | progress, analytics, evidence |
| Live Activity / Dynamic Island for the active session | settings, backup, export |
| Rep-count model inference and calibration UI | coach knowledge base |
| Sign in with Apple, Google sign-in bridged natively | everything else |
| Offline shell and cached catalog | |

That list is well past "minimum functionality". It is also, conveniently, exactly the list of things
the product needs anyway.

**Note on the existing bridge.** `ForgeBridge` v1 already carries 9 message types with 12 frozen
fixtures, and `StorageMirror` mirrors localStorage natively with a 250 ms debounce **verified**.
The pattern is sound and extends cleanly. What changes is that the native side stops being a
passive mirror and starts being an origin of truth for workout events.

### 1.3 Apple Watch: one job

The watch app does **the set**, and nothing else. No nutrition, no analytics, no program editing,
no coach. The screen shows, in order of size:

1. The current exercise and target ("Bench Press · 8 reps @ 70 kg").
2. A rep count that increments as it detects, large, with a tap to correct.
3. The rest timer, which starts automatically when the set ends.
4. One button: Start Set, then Done, then Next.

Everything else is a swipe away and nothing else is on the first screen. The design constraint is
that a person with chalk on their hands and 70 kg on their back must be able to use it without
reading.

**Why the watch and not a band, in one line:** 800 Hz accelerometer versus roughly 50 Hz on a
realistic band budget, no bill of materials, no minimum order quantity, no tariff, no certification,
and the user already owns it.

---

## 2. The architecture

### 2.1 The blocker: replace whole-bundle last-write-wins

Current design, verified in the tree:

- `fitforge.workoutlog.v1` holds sessions, capped at 200 sessions and 180 days.
- The cloud mirror serialises the whole bundle, refuses above 900,000 bytes, debounced 4 seconds.
- The extras sweep carries at most 32 keys at 512 KiB each.
- Health, cycle, readiness and active-session keys are denylisted from sync entirely.
- `importAllState` overwrites extras wholesale on pull. The prewalk doc already flags this as a
  clobber bug for health data.

With a watch in the picture the failure is no longer hypothetical. The watch writes a set at 10:31;
the phone writes a meal at 10:32; whichever bundle lands second erases the other's minute.

**The fix: an append-only event log for everything a device can originate.**

```
fitforge.events.v1          // append-only, per-device, never merged destructively
  { id, deviceId, seq, ts, type, payload }

types: set.logged | set.corrected | session.started | session.ended
       meal.logged | checkin.recorded | offer.decided | weight.recorded
```

Rules, each of which is small and testable:

1. **Event ids are content-addressed** (`deviceId:seq`), so replaying twice is a no-op.
2. **Derived state is a fold.** `fitforge.workoutlog.v1` becomes a materialised view over the
   event log, not a mutable document. The existing readers do not change.
3. **Merge is union, not overwrite.** Pull appends unseen events and re-folds. `importAllState`
   keeps its wholesale behaviour only for genuinely single-writer keys such as preferences.
4. **Cumulative values take max; point values take the newer timestamp.** This is the rule the
   health prewalk already specified for the health slice; generalise it.
5. **Corrections are events, not edits.** Tapping the rep count on the watch emits
   `set.corrected`, which is also the label the rep-detection model learns from.
6. **The 900 KB cap becomes a compaction trigger**, not a refusal. Fold events older than the
   retention window into a snapshot and drop them.

Effort: **estimate** 800 to 1,400 lines across `lib/demo/store.ts`, `lib/auth/sync.ts`, a new
`lib/events/`, plus test updates. This is the single largest engineering item in the plan and it
unblocks everything else. CRDT libraries such as Yjs or Automerge are an option [Medium, AppScale]
secondary, but an append-only log with deterministic fold is simpler for this data shape and avoids
a large dependency in a bundle that ships to the browser. Note the standard caveat: CRDTs resolve
structural conflicts, not business-rule conflicts [AppScale] secondary.

### 2.2 Data flow

```
Apple Watch                    iPhone                         Web (any browser)
─────────────                  ──────                         ─────────────────
HKWorkoutSession               HealthKit read/write           localStorage
CMBatchedSensorManager    ──►  ForgeBridge v2            ──►  event log (folded)
  800 Hz accel                 event log (native mirror)      ▲
  200 Hz device motion         WatchConnectivity              │
rep events + corrections       vendor API tokens         ──►  Firestore (union merge)
        │                              │                      ▲
        └──── WCSession ───────────────┘                      │
              sendMessage when reachable                 Cloudflare Worker
              transferUserInfo as fallback               /connect: Oura, Whoop, Polar
```

**WatchConnectivity discipline** [Medium, Apple forums] secondary: `sendMessage` delivers instantly
but only when the counterpart is reachable, and the watch app is reachable only in the foreground
with the display on. Apple benchmarks put interactive messaging above 97 percent delivery within one
second ⚠. The correct pattern is: check `isReachable`, use `sendMessage` for the live set so the
phone's Live Activity updates, and hand the same batch to `transferUserInfo` on failure so the
acknowledgement path still completes. The watch must also persist locally and survive the phone
being absent entirely, because independent operation is the default for fitness apps [Applefy]
secondary.

### 2.3 HealthKit: what you actually get

| Source | Sleep | Sleep stages | Heart rate | HRV | Steps / energy | Workouts |
|---|---|---|---|---|---|---|
| Apple Watch | yes | yes | yes | **yes (SDNN)** | yes | yes |
| Oura | yes | yes | 1-min intervals | **no** | yes | yes |
| Whoop | yes | via recovery | — | **no** | — | yes |
| Garmin | yes (17 metrics total) | — | yes | **no** | yes | yes |
| Fitbit | not established ⚠ | — | — | **no** | — | — |

All rows secondary [sensai.fit]. Three consequences:

1. **Sleep duration, the input `RESEARCH-ADAPTIVE.md` §2.2 endorsed, arrives from every vendor.**
   That is the metric the readiness engine uses, and it is the one that transfers.
2. **Sleep stages arrive too, and should still be ignored.** REM sensitivity tops out near 76
   percent on the best consumer device, and the performance literature disputes the sign. The
   schema has no stage field today; keep it that way.
3. **HRV needs either an Apple Watch or a vendor cloud API.** The readiness engine already treats
   HRV as a small deduction (8 points at −20 percent versus 30 for self-reported short sleep), so
   its absence degrades gracefully. Build the `workers/connect` OAuth hop for Oura and Whoop when
   users ask, not before.

**Write direction matters too.** FitForge should write completed sessions back to HealthKit as
`HKWorkoutActivityTypeTraditionalStrengthTraining` so the user's rings and their other apps see the
work. That is a one-way courtesy that costs almost nothing and makes the app a good citizen.

### 2.4 Rep counting on the watch

The pipeline, in order:

1. **Start a workout session.** `HKWorkoutSession` moves through six states (`notStarted`,
   `prepared`, `running`, `paused`, `stopped`, `ended`) [Crosley] secondary. The session is a hard
   prerequisite: `CMBatchedSensorManager` is a workout-centric API and returns nothing without one
   [WWDC23] **verified**.
2. **Stream batched sensors.** 800 Hz accelerometer and 200 Hz device motion on Series 8 and Ultra,
   gated on `isAccelerometerSupported` [WWDC23] **verified**. Fall back to `CMMotionManager` at 50
   to 100 Hz on older watches.
3. **Segment with the plan as a prior.** This is the argument from the first pass: FitForge knows
   the next exercise and the rep target, so the classifier decides among two or three candidates,
   not thirty. Open-world wrist recognition sits at F1 62 on an 18-class set; a closed set is a much
   easier problem.
4. **Count within the segment.** Few-shot rep counting reaches roughly 0.7 reps mean absolute error
   on unseen exercises with 74 percent of sets exact [arXiv 2410.00407] secondary. That is good
   enough for a confirm-first interface and not good enough for silent logging.
5. **Confirm, never assume.** The watch proposes a count; the user taps to accept or adjust. Every
   adjustment is a labelled training example.
6. **Personalise on device.** Create ML's activity classifier trains on tri-axial accelerometer and
   gyroscope windows with an activity label and exports to Core ML, classifying a rolling window
   every few seconds [Apple / Turi Create docs] secondary. A per-user calibration set of one clean
   set per exercise is the standard bootstrap.

**Battery discipline is a feature requirement, not a polish item.** Apps that mismanage the workout
session lifecycle "either lose data or drain battery" [Crosley] secondary, and watchOS suspends apps
using excessive background CPU. Rules: end the session the moment the workout ends, never hold
`running` through a rest period longer than the configured timeout, batch sensor reads rather than
polling, and run inference on windows rather than per-sample.

### 2.5 Offline

The web app has **no service worker** today, so a cold load needs the network **verified from
README**. For an installed iOS app that is indefensible: a person in a basement gym opens the app
and sees nothing. The native shell must ship a cached web bundle and fall back to it when
`goforge.fit` is unreachable, which also strengthens the Guideline 4.2 position. The watch app must
work with no phone and no network at all, buffering events until a counterpart appears.

---

## 3. Content: what to add and where it comes from

### 3.1 Workout types

Current: 91 exercises, 12 categories, 21 movement patterns, 31 split programs, all strength and
conditioning **verified**. The gaps, in the order they earn their keep:

| Gap | Why it matters | Rough scale | Source |
|---|---|---|---|
| **Machines and cables** | most commercial-gym users train mostly on these, and the current catalog skews free-weight | +40 to 60 | free-exercise-db (800+, public domain), wger (FLOSS) |
| **Mobility and yoga flows** | the readiness engine's "technique day" and "rest day" outputs currently have nothing good to offer | +30 to 50 | curated; taxonomy from wger categories |
| **Olympic and their derivatives** | power-focused users are unserved; also unlocks velocity-based content later | +15 | free-exercise-db |
| **Calisthenics progressions** | the 33 no-equipment exercises are the home-training story and it stops at beginner | +25 | curated progression ladders |
| **Kettlebell** | one of the most-requested equipment types and the app already has the equipment slug | +20 | free-exercise-db |
| **Plyometrics and conditioning** | hybrid training is the live trend the splits research already flagged | +20 | curated |
| **Unilateral and rehab-adjacent** | "protected body areas" onboarding promises substitutions the catalog cannot always make | +20 | curated |

Target: **roughly 250 to 300 exercises**, which is where substitution quality stops being the
binding constraint. Two cautions:

- **Every exercise carries the full teaching payload today** — setup, numbered instructions, tempo,
  breathing, cues, rationale, common mistakes, plus a hand-drawn pose rig. That is the quality bar
  and the reason the catalog is a moat. Importing 800 rows from a public dataset without that
  payload would dilute the product. Import for *coverage and metadata*, author the payload.
- **Licensing.** free-exercise-db is public domain [GitHub] secondary; wger is FLOSS but its content
  licence must be checked per-record before any copying, and the repo's own decision record already
  says FitForge is not a wger fork.

Also worth adding at the program layer: **non-strength modalities as first-class days** so a split
can legitimately contain a mobility day or a conditioning day without pretending it is a lift.

### 3.2 Meals and ethnic variety

Current: 509 curated foods in the bundle (`core.json`, 244 KB) plus a USDA FoodData Central tier-2
build of roughly 50 to 60 k rows, and a 90 KB recipe library **verified**. USDA is public domain and
excellent, and it is also overwhelmingly American. A user eating dal, injera, pho, arepas, jollof or
adobo gets poor first-guess matches from a parser trained on a Western core.

| Source | Coverage | Size | Licence | Confidence |
|---|---|---|---|---|
| **IFCT 2017** (ICMR-NIN, Hyderabad) | Indian key foods | 528 foods | on Zenodo; verify terms ⚠ | verified count |
| **INDB** (Indian Nutrient Databank) | Indian recipes as eaten | 1,095 items + 1,014 recipes | GitHub, verify ⚠ | verified count |
| **McCance & Widdowson 2021** | UK composite dataset | large | UK OGL, verify ⚠ | secondary |
| **Open Food Facts** | global packaged products | millions | ODbL + DbCL, share-alike | verified licence |
| **CIQUAL** (France), **Frida** (Denmark), FAO/INFOODS regional tables | European and regional | varies | varies ⚠ | not researched |

Recommended approach:

1. **Extend tier 1, do not replace it.** Add roughly 300 to 500 curated foods covering South Asian,
   East and Southeast Asian, Middle Eastern, West African and Latin American staples, authored to
   the same standard as the existing 509. Target a tier-1 catalog near 900 to 1,000 foods; at the
   current density that is roughly 60 KB gzipped ⚠ estimate, still comfortably in-bundle.
2. **Author dishes, not just ingredients.** The INDB's distinction between food items and *recipes
   as consumed* is the important one. "Chicken biryani, 1 cup" is what a person types; "basmati
   rice, raw" is not.
3. **Teach the parser the vocabulary.** The food parser works on quantity, unit and food words. Add
   regional units and portion nouns: katori, roti, idli, thali, bowl, handi, tortilla, injera, pho
   bowl. This is `lib/food/measures.ts` and `parse.ts`, and it matters more than raw row count.
4. **Treat Open Food Facts as tier 3, behind barcode scan.** ODbL share-alike is a real obligation;
   keeping it in a separate, clearly-attributed tier avoids entangling the bundled catalog.
5. **Diet stances need the same widening.** The diet engine has stances; vegetarian in the Indian
   sense (dairy yes, egg often no) is not the same object as Western vegetarian, and halal and
   kosher are absent ⚠ unverified in the tree.

### 3.3 Splits and programs

31 programs today. The gaps that follow from §3.1: a mobility-forward program, a hybrid
strength-and-conditioning block, a kettlebell-only program, and a genuine beginner calisthenics
ladder. Modest work once the exercises exist.

---

## 4. Design and flow

The repo pins the visual world: dark warm-iron surfaces with copper accent, Big Shoulders condensed
for headings and hero numerals, Archivo for UI text, drawn 1.75-stroke icons, no emoji as an icon
system, 44 px minimum touch targets, and progress rendered as heat bars rather than rings
**verified from `DESIGN.md` and `PRODUCT.md`**. That world extends to the new surfaces; it does not
get redesigned. What is genuinely new:

### 4.1 Per-surface design work

- **Desktop composition.** A real multi-column grid, a week board, and charts at full width. The
  hardest part is resisting the centred-phone shortcut. Density is the point.
- **Watch faces of the app.** Three screens total: active set, rest, and session summary. Plus a
  complication showing today's session and readiness, which is the cheapest re-engagement surface
  Apple offers.
- **Live Activity / Dynamic Island** for the running session on iPhone: current exercise, set number,
  rest countdown. This is the single most "native" thing the app can show and it directly answers
  Guideline 4.2.
- **Handoff moments.** Starting on the phone and continuing on the watch must be one tap, and the
  state must be obvious on both. The 12-hour active-session TTL already in the tree is the right
  primitive.

### 4.2 Flow work, in priority order

1. **The set loop is the product.** Start set, count, confirm, rest, next. Every tap removed from
   that loop compounds across a session. Measure it: taps per logged set, on each surface.
2. **Confirm-first rep counting.** Proposed count, one tap to accept, drag or crown to adjust.
   Never silently log a number the user did not see.
3. **The morning check-in must stay under 10 seconds.** It is the highest-value input in the whole
   system per Saw et al., and its value collapses if it feels like a form.
4. **Missed-day recovery must be one tap, not a guilt screen.** The rules are in
   `RESEARCH-ADAPTIVE.md` §3.2; the UI is a single card that says what changed and why, with accept
   and dismiss. The existing `OfferPanel` pattern is exactly right and should be reused verbatim.
5. **Nutrition capture on the phone should accept a photo and a sentence.** The parser and the AI
   estimate path already exist; the flow around them is where the friction lives.
6. **Empty and error states.** A fresh account already shows honest empty states, which is a stated
   product value. The watch needs its own: no plan, no phone, no network.

### 4.3 Accessibility and internationalisation

Adding ethnic food variety implies non-English-speaking users, which surfaces work the app has not
done: string extraction, right-to-left layout for Arabic and Hebrew, number and date formats, and
metric-versus-imperial units throughout. None of this is hard; all of it is expensive to retrofit
late. At minimum, extract strings before the catalog expansion lands. Also: Dynamic Type on iOS,
VoiceOver labels on the drawn icons, and the existing `prefers-reduced-motion` handling carried into
the native surfaces.

---

## 5. Everything else that this plan needs and nobody listed

1. **Identity across three devices.** Local Mode with no account is a stated product value, and the
   watch breaks the assumption quietly: a watch has no keyboard. Sign in with Apple is required by
   Guideline 4.8 once Google sign-in exists in a native app, and it is the only sane watch-side
   identity. Decide whether Local Mode stays account-free with device-pairing by QR code, or whether
   the watch simply requires the phone.
2. **Apple Developer Program, signing and CI.** $99 per year, enrolment can take days, and the
   existing CI builds unsigned. Xcode Cloud or GitHub Actions with fastlane is a prerequisite for
   TestFlight, and internal TestFlight with 100 testers faces no Beta App Review, which is the
   fastest honest path to real data.
3. **Privacy labels and consent copy.** Health data is already denylisted from cloud sync and
   exported only deliberately. The App Store privacy nutrition label, the HealthKit usage strings
   (missing strings crash the app), and the FTC Health Breach Notification Rule all apply. The
   consent view exists; extend it rather than inventing a second pattern.
4. **Testing on two new runtimes.** The behavioural contract today is 53 Playwright spec files and
   258 tests plus 22 unit-test files **verified**. The watch needs XCTest around the session
   lifecycle and the event emitter; the bridge needs its frozen-fixture pattern extended to the new
   message types. Budget the tests as part of each item, not as a phase.
5. **A labelled-data pipeline, with consent.** Every confirmed or corrected rep is a training
   example. Decide early: on-device only, or opt-in upload for model improvement. The second is more
   valuable and needs an explicit, separate consent gate. This corpus is also the asset that decides
   whether the custom band from the first pass is ever worth building.
6. **Monetisation surface.** The competitive read says the segment norm is no subscription, and that
   plan-aware rep detection is the one feature nobody else ships. If a paid tier ever exists, this
   is where it lives. Note the App Store commission on subscriptions, and that Whoop began testing
   unbundled pricing in 2026.
7. **Watch hardware floor.** 800 Hz batched sensors need Series 8 or Ultra. Decide the minimum
   supported watch and what the degraded path looks like on older hardware, because "rep counting
   does not work on your watch" is a support nightmare if it is discovered after install.
8. **Android.** Health Connect's `ExerciseSegment` carries `repetitions`, `weight` and `setIndex`,
   so the data model ports. Wear OS is the same product with a different SDK. Not now, but the event
   log and the shared rules package should not assume Apple.

---

## 6. Build order

Each step is independently shippable and ordered so that nothing later is blocked by something
earlier being wrong.

| # | Step | Why here | Size (estimate) |
|---|---|---|---|
| 1 | **Event log and union merge** | every multi-device feature is lossy without it | 800–1,400 LOC + tests |
| 2 | **Desktop composition**: week board, program editor, wide analytics, export page | pure web, no new runtime, immediate user value, de-risks nothing else | 2–3 weeks |
| 3 | **Catalog expansion**: exercises to ~250, tier-1 foods to ~900, regional units and portions | content work runs in parallel with engineering | ongoing, 4–8 weeks |
| 4 | **Native iOS surfaces**: HealthKit read/write, notifications, Live Activity, offline shell, Sign in with Apple | clears Guideline 4.2 and delivers the aggregator | 3–5 weeks |
| 5 | **Adaptive engine v1**: APRE autoregulation, missed-day resequencing, movement-aware sleep policy | highest evidence, no new hardware, runs on step 1 | 2–4 weeks |
| 6 | **Watch app v1**: workout session, manual Start / Done / Next, rest timer, complication, no counting | ships the loop and starts collecting raw sensor data with labels | 3–4 weeks |
| 7 | **Rep counting v1**: batched sensors, plan-aware classifier, confirm-first UI, per-user calibration | needs step 6's corpus to be worth training | 4–8 weeks |
| 8 | **Vendor APIs**: `workers/connect` for Oura and Whoop, for HRV that HealthKit will not carry | demand-driven; only if users ask | 1–2 weeks |
| 9 | **Custom hardware** | only if step 7 clears its accuracy bar and a real population trains without a watch | per `RESEARCH-WEARABLE.md` |

Steps 1 to 3 need no Apple account at all. Step 4 is where the $99 and the signing work start.

---

## 7. Risks and kill criteria

| Risk | Signal | Response |
|---|---|---|
| Guideline 4.2 rejection of the shell | rejection on first submission | Step 4 is the mitigation; do not submit before it lands |
| Event-log migration corrupts existing user data | any data-loss report in beta | ship behind a flag, dual-write for one release, keep the old bundle readable |
| Rep counting never clears the bar | closed-set recognition under 90 percent after per-user calibration on 30 users | keep the watch app as a manual logger; it is still the best set-logging surface |
| Watch battery complaints | session drain worse than Apple's own Workout app | audit the session lifecycle first; it is the usual cause |
| Catalog expansion dilutes quality | teaching payload missing on new exercises | gate every import on the full payload; coverage without depth is not the product |
| Food licence entanglement | ODbL share-alike reaching the bundled catalog | keep Open Food Facts in tier 3, attributed, behind barcode scan |
| HRV gap disappoints Oura and Whoop users | support volume | the readiness engine already degrades gracefully; step 8 when it is loud enough |
| Scope creep into a general fitness app | the watch app grows a nutrition tab | the watch does the set; write it down and hold it |

---

## 8. The one-paragraph version

Build one engine and three surfaces, and do not build hardware. The Apple Watch out-senses any band
we could manufacture, at 800 Hz against 50, for no bill of materials, and HealthKit already carries
sleep and heart rate from Oura, Whoop and Garmin, though not HRV, which only Apple Watch writes. The
real blocker is not the watch app but the sync engine: a whole-bundle last-write-wins mirror is safe
with one writer and lossy with three, so the append-only event log comes first. The second blocker
is that the current iOS shell is a full-screen web view pointed at the live site, which is the
textbook Guideline 4.2 rejection, and the fix is the same native work the product needs anyway.
After that the ordering follows the evidence: give the laptop a real composition because nobody
plans a training block on a phone, widen the catalog because a 509-food Western core fails anyone
eating a thali, ship the adaptive engine on data already stored, then the watch as a manual logger,
and only then teach it to count. Each step is shippable alone, and the last one buys the information
that decides whether the band from the first pass is ever worth building.

---

## Sources

**Apple platform**
- What's new in Core Motion, WWDC23 — `CMBatchedSensorManager`, 800 Hz accelerometer, 200 Hz device motion, workout-session requirement. https://developer.apple.com/videos/play/wwdc2023/10179/
- Core Motion framework reference. https://developer.apple.com/documentation/coremotion
- `CMBatchedSensorManager` availability, Apple Developer Forums. https://developer.apple.com/forums/thread/761036
- HealthKit workout lifecycle: `HKWorkoutSession` states and the iOS 26 cross-platform surface. https://blakecrosley.com/blog/watchos-workout-lifecycle
- Creating independent watchOS apps, Apple Developer Documentation. https://developer.apple.com/documentation/watchos-apps/creating-independent-watchos-apps
- Native watchOS vs companion app, 2026 guide. https://applefy.tech/blog/native-watchos-vs-companion-app
- watchOS development pitfalls and practical tips. https://fatbobman.com/en/posts/watchos-development-pitfalls-and-practical-tips
- watchOS workout apps, background running and battery. https://learn.microsoft.com/en-us/xamarin/ios/watchos/platform/workout-apps
- Data synchronization between iOS and watchOS using WatchConnectivity. https://medium.com/@sheik25bareeth/data-synchronization-between-ios-and-watchos-using-watchconnectivity-009a3064e12a
- WatchConnectivity background delivery, Apple Developer Forums. https://developer.apple.com/forums/thread/766559
- Activity classification with Create ML and Core ML for watchOS. https://medium.com/@tyler.hutcherson/activity-classification-for-watchos-part-1-542d44388c40
- Turi Create activity classifier, deployment to Core ML. https://apple.github.io/turicreate/docs/userguide/activity_classifier/export_coreml.html

**App Store review**
- App Store review guidelines: will your webview app be rejected? https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper
- Apple Guideline 4.2: what minimum functionality means. https://appcompliance.io/blog/apple-guideline-4-2-minimum-functionality/
- Guideline 4.2 rejection: how to fix minimum functionality issues. https://ascauto.org/rejections/guideline-4-2

**Wearable data into HealthKit**
- Oura, Whoop, Garmin Apple Health integration: what syncs, and the HRV gap. https://www.sensai.fit/blog/wearable-apple-health-integration-what-syncs-oura-whoop-garmin
- Best HRV apps that work with Oura Ring and Whoop, what actually syncs. https://www.sensai.fit/blog/7-best-hrv-fitness-apps-oura-whoop-2025
- Wearable HRV accuracy in 2026: what the validation studies say. https://www.sensai.fit/blog/wearable-hrv-accuracy-validation-studies-2026

**Sync architecture**
- Local-first architecture: CRDTs and sync engines. https://appscale.blog/en/blog/local-first-architecture-crdts-sync-engines-offline-first-2026
- Real-time data sync in distributed systems: CRDT, OT and event sourcing. https://www.askantech.com/real-time-data-sync-distributed-systems-crdt-operational-transform-event-sourcing/
- TypeScript CRDT toolkits for offline-first apps. https://medium.com/@2nick2patel2/typescript-crdt-toolkits-for-offline-first-apps-conflict-free-sync-without-tears-df456c7a169b

**Content sources**
- free-exercise-db, public domain, 800+ exercises in JSON. https://github.com/yuhonas/free-exercise-db
- wger, self-hosted FLOSS fitness and nutrition tracker. https://github.com/wger-project/wger
- exercemus/exercises, curated open exercise list. https://github.com/exercemus/exercises
- Indian Food Composition Tables 2017, 528 foods, ICMR-NIN. https://ifct2017.github.io/ · https://zenodo.org/records/7088653 · https://www.nin.res.in/ebooks/IFCT2017.pdf
- Indian Nutrient Databank, 1,095 items and 1,014 recipes. https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-
- Development of an Indian food composition database. https://www.sciencedirect.com/science/article/pii/S2475299124017244
- Open Food Facts data, API and licence. https://world.openfoodfacts.org/data · https://openfoodfacts.github.io/openfoodfacts-server/api/

**Prior passes and repository (verified against the working tree, 2026-09-15)**
- `docs/RESEARCH-WEARABLE.md` — hardware, BOM, India and China manufacturing, tariffs, three strategies
- `docs/RESEARCH-ADAPTIVE.md` — sleep and HRV as inputs, autoregulation, missed-day rules
- `docs/ARCHITECTURE-ADAPT.md` — the readiness and AI adapt loop as built
- `apps/ios/FitForge/App/RootView.swift` — the full-screen `WKWebView` shell, app-bound domains
- `apps/ios/FitForge/Bridge/ForgeBridge.swift`, `apps/web/lib/native/forgeBridge.ts` — bridge v1, 9 message types
- `apps/web/lib/auth/sync.ts` — 900,000-byte bundle cap, 4-second debounce
- `apps/web/lib/demo/store.ts` — extras sweep 32 keys / 512 KiB, sync denylist prefixes
- `apps/web/lib/food/index.ts`, `core.json` — 509 tier-1 foods, 244 KB
- `packages/shared/src/rules/splits.ts` — 31 programs
- `seed/data/exercises.json` — 91 exercises
