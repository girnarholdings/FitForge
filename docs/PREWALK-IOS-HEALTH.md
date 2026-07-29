# Prewalk · iOS app, HealthKit, and health-aware coaching

**Verdict: the full vision is a genuinely large lift — roughly 2–3 months of focused work across
five subsystems — but a surprisingly big slice needs no iOS app, no Apple account, no HealthKit.**
Dynamic splits on a manual morning check-in, the advanced-model tier, the readiness prompt work,
and the whole privacy/erasure compliance layer are web-and-worker work that can start today. The
only thing that *requires* Apple tooling is automatic capture of sleep/HR/HRV/temperature/cycle
data — and the cheapest honest path is a Capacitor shell around the existing static export, not a
SwiftUI rewrite (8–16+ weeks, permanent double maintenance, indefensible for one native
capability). This document records what was found so the eventual implementation starts warm.

## 1 · iOS shell + HealthKit: Capacitor, not PWA, not SwiftUI

- The PWA path is dead: HealthKit is native-only, no JS/WebKit exposure, no web equivalent. Any
  HealthKit ambition means a signed binary; the only question is how thin the native layer is.
- The repo is already shell-ready: `apps/web/next.config.mjs` has `output:'export'` with a
  basePath env var — a Capacitor iOS target is just `webDir: apps/web/out` built with
  `basePath=''`, assets bundled locally. Audit: skip the service worker in-shell, check
  absolute-URL assumptions.
- Plugin reality (2026): `Cap-go/capacitor-health` (~23 stars, actively maintained) reads steps,
  HR, sleep with stages, HRV, body/basal temperature — everything **except menstrual/cycle
  data**. Budget ~100–200 lines of custom Swift plugin for `menstrualFlow` and, later,
  `HKObserverQuery`. Assume you will read/vendor the plugin, not just install it.
- Entitlements: `com.apple.developer.healthkit` + `NSHealthShareUsageDescription` (crash without
  it). Background delivery needs a separate entitlement (iOS 15+), is per-type frequency-capped
  (~hourly), never wakes force-quit apps, device-only testing — **defer to v2**; foreground
  sync-on-open fully covers "the trainer reads last night's sleep".
- **Hidden blocker**: Google OAuth returns `403 disallowed_useragent` in WKWebView, so the
  existing Firebase web sign-in WILL fail in the shell. Fix: native Google Sign-In via
  `@capawesome-team/capacitor-firebase` bridged to the web-layer SDK — and Guideline 4.8 then
  *requires* Sign in with Apple too. This is prerequisite work (2–4 days), not polish.
- Review risk: Guideline 4.2 (web-wrapper rejection) is real for Capacitor apps but mitigated by
  HealthKit depth, local assets, and the app's already app-like design. Internal TestFlight (100
  testers) faces **no** Beta App Review — the first HealthKit build reaches the owner's phone
  without meeting 4.2 at all.
- Estimate: **1.5–3 focused weeks to first TestFlight build** (sleep/steps/HR → JSON in the web
  layer), dominated by the auth bridge, scaffold audit, and signing/CI plumbing — not HealthKit
  itself (~2–3 days). Add ~1 week later for the custom cycle/observer Swift plugin. Apple
  Developer Program $99/yr; enrollment can take days — start early. CI: Xcode Cloud or GitHub
  Actions + fastlane.

## 2 · Health data model + sync

- Shape: `fitforge.health.v1` — daily aggregates keyed by date (`sl` sleep min, stages, `eff`,
  `st` steps, `rhr`, `hrv` SDNN ms, `wtd` wrist-temp *deviation*, `ae` active kcal, optional
  `cp`/`cd` cycle phase enum + day, per-day `u` updatedAt). ~190 B/day; a 180-day window is
  ~34 KB — ~3.5 % of the 900 KB whole-bundle cap. Raw samples (sleep segments, HR streams) are
  MBs/month and architecturally impossible here; daily aggregates are the only viable shape.
  Give the slice a self-pruning hard budget so it can never tip a big log over the cap.
- **Reports conflict on where this slice lives.** The data-model report has it riding the
  `fitforge.*` extras sweep to Firestore with zero rules changes; the privacy report says
  health keys must be **denylisted from the sweep** and stored in a separately consented doc
  (e.g. `users/{uid}/health/daily`). Incompatible as stated. What both agree on: health data
  must never sync *silently* — an explicit consent gate stands between HealthKit and any cloud
  write. Decide at build time; denylist-plus-consent-gate is the safer default.
- **Clobber bug to pre-empt** (if the slice syncs at all): sync is whole-bundle last-write-wins,
  so a desktop push followed by a phone pull (`importAllState` overwrites extras wholesale) can
  permanently destroy health days only the phone ever had. Required fix, shipped *with* the
  slice: per-day union merge on pull for this key (cumulatives take max, point metrics take
  newer `u`, merge never deletes days). ~50 lines, client-only.
- HealthKit specifics: use `HKStatisticsCollectionQuery` with 1-day intervals (handles
  Watch+iPhone dedup, unlike raw summing — better than the XML importer's keep-highest-source
  workaround). Sleep needs a sample query, attributed to the day sleep *ends* (6pm–6pm window).
  Request explicit HKUnits. Backfill 180 days in chunks on first grant; keep `HKQueryAnchor`s
  in native UserDefaults, never in the synced slice. Denied read permission returns empty
  results, not errors — absent days must render "no data", never "zero steps".
- `appleSleepingWristTemperature` (iOS 16+, Watch Series 8/Ultra+) returns **absolute °C only**
  — Apple's baseline/deviation is not exposed via API. Compute a personal baseline client-side
  (median of first ≥14 nights) and store only the deviation. Many users are steps-only (no
  Watch): every field optional, flags degrade gracefully.
- Data-layer lift: ~1 focused week (slice + merge + backfill wiring + digest builder + tests),
  gated on the native reader existing.

## 3 · Health-aware trainer + advanced models

- The hard infrastructure **already exists and ships**: full Firebase ID-token verification on
  the coach worker (`workers/coach/src/firebaseAuth.ts` — RS256 via crypto.subtle, JWKS cache),
  the signed-in gate, and the model catalog/whitelist. "Advanced model for members" is one env
  var (`MISTRAL_MODEL=mistral-medium-latest`) or ~0.5 session for a two-tier
  `MISTRAL_MODEL_MEMBER`. Missing piece before pointing a *paid* model at sign-in: **per-uid
  rate limiting** (KV counter on the verified uid) — without it one scripted account is an
  unbounded bill.
- READINESS block: a sibling to the existing clamped prompt blocks (~300-char clamp, 4–6 lines
  of pre-computed categorical flags — LOW/NORMAL/FLAG). **The client computes baselines and
  flags; small models must never do the deviation arithmetic.** Extend existing FOCUS strings
  with one readiness clause each rather than a new global block (instruction dilution is real
  at ~900 system-prompt tokens); validate via the docs/PROMPTS-COACH.md judged-panel method on
  adversarial health inputs (fever, pregnancy, cardiac phrasing) *before* launch.
- Dynamic-split recommendations are **not a chat intent** — a new JSON-only `adapt` task cloned
  from the macros pattern (`{action, scale, reason, confidence}`, whitelisted actions, scale
  bounds, optional 3-temperature consensus). Keep macros/adapt consensus samples pinned to
  mistral-small (3× cost); member chat can be medium.
- What medium/large buy: multi-constraint compliance (readiness + profile + word cap is where
  small drops a rule), JSON adherence, safety-boundary judgment. Marginal for plain KB Q&A.
- Cost at observed prompt sizes (~1.5k in / ≤320 out tokens): small ~$0.20–0.40 per 1k
  questions, medium ~$1.10–2.30, large ~$2.30–4.50. Pricing sources contradict each other —
  verify at mistral.ai/pricing before committing. Free Experiment tier is ~1–2 requests/min:
  fine solo, fatal for concurrent users; the paid tier is as much about rate limits as quality.
- Lift: 3–5 focused sessions, all buildable against synthetic readiness JSON before any
  HealthKit data exists.

## 4 · Dynamic split mode

- One line: each morning, compute a readiness verdict from transparent inputs; on clearly-bad
  days offer ONE accept/reject edit to today's session with a plain-language WHY. Never a
  silent change; green days say nothing. **Fire rarely, high precision** — alarm fatigue kills
  the feature.
- Evidence honesty: readiness/HRV-guided *resistance* prescription has weak-to-null support (a
  2024 trial found no benefit over ordinary periodization); the engine's job is catching the
  obvious bad day, not shaving sets on a 5 % HRV wobble. **Cycle-phase prescription is an
  evidence trap** — 2023–2026 reviews find no reliable phase effect on strength or adaptation.
  Phase may be shown as context (opt-in); accommodation is *symptom-driven* only.
- v1 inputs are subjective + sleep number (no baselines needed, works day one): sliders for
  soreness/energy/stress, an "under the weather?" toggle, last-night sleep. RHR/HRV/temp
  *deviation* rules ship dormant and auto-activate only once ~14–30 days of sensor baseline
  exist — realistically only via HealthKit. Never build deviation rules on hand-typed numbers.
- Outputs are real `RoutineDay`s so player/volume/logging are untouched: PROCEED (silent),
  REDUCE (extend quick.ts's `build(rows,setCap)` trim), TECHNIQUE DAY (cap RPE via
  prescription.ts), FULL REST via the existing pull-forward reschedule, DELOAD only after 3+
  red days. Accept calls `setQuickSession(modifiedDay)` — the swap pull-forward already does.
- **Hard safety gate, separate from scoring**: temp elevation + any symptom → no training edit
  at all; REST + "this can look like you're getting sick — see a doctor if it persists", via
  the coach SAFETY pattern. This is the highest-stakes rule in the feature.
- Log everything to `fitforge.readiness.v1`: inputs, band, edit offered, accepted/rejected,
  what was actually logged. Rejections are the calibration signal that stops the nagging.
- Lift: **~2–3 focused weeks with no iOS app at all** (dominated by check-in UI and day-edit
  builders, not the algorithm); HealthKit later is ~1 week of input plumbing behind the same
  interface — the rules engine is unchanged.

## 5 · Privacy / consent — blocking, and partly pre-existing

- **Showstopper**: the coach currently uses Mistral's free Experiment tier, whose terms use API
  traffic for model training unless opted out in the Admin Console. Health context through it
  is a textbook App Review 5.1.3(i) "data mining" violation and a GDPR Art. 9 problem. Before
  any health flag reaches the worker: opt out and screenshot it, move health traffic to the
  paid tier, or route it to Workers AI only. A billing/console decision, not code.
- **Pre-existing erasure gap, repo-verified**: "Erase all data" clears localStorage only; zero
  `deleteDoc` calls exist — `users/{uid}` survives forever. GDPR Art. 17 requires cloud
  deletion, and App Review 5.1.1(v) requires in-app *account* deletion for the native app
  anyway. Fix now, independent of everything else.
- Extras-sweep breach surface: `exportAllState` sweeps every `fitforge.*` key to Firestore
  automatically — any future health/cycle key uploads with no deliberate decision (see the §2
  conflict). Minimum: a sweep denylist plus an explicit consent gate.
- Consent screen must name names: which HealthKit types (per-type optional), aggregates go to
  Google Firestore, coarse flags go to Mistral/Cloudflare (separate "AI stays health-blind"
  toggle), retention + erase path, no ads/sale. Cycle data: own opt-in, **off by default,
  ideally device-only** — post-Dobbs, server-side menstrual data carries subpoena and press
  risk; the FTC has enforced here (Premom); Washington's MHMDA two-consent model (collect +
  share) is the design target. Derived flags ("luteal", "readiness: low") are still
  special-category data.
- Send the AI only coarse categorical flags — never raw values, dates, or temperatures. The
  dynamic-split *decision* needs no LLM at all; the LLM at most phrases it.
- Ship privacy policy, App Privacy "Health & Fitness" label, `PrivacyInfo.xcprivacy`, and
  purpose strings in the same PR as the entitlement. Budget one 5.1.3 rejection cycle.
- Lift: ~1.5–2.5 focused weeks, mostly consent/erasure plumbing.

## 6 · Barcode: the shell pays for it twice

- The same Capacitor shell resolves the barcode prewalk's worst finding: a native plugin
  (`@capacitor-mlkit/barcode-scanning`) sidesteps the missing `BarcodeDetector` in iOS Safari
  entirely — no zxing-wasm chunk needed on iOS-native. The OFF worker proxy (`/barcode/:gtin`)
  and My Foods gtin cache from docs/PREWALK-BARCODE.md stay shared with the web build; the
  barcode worker should reuse the coach's verified-uid rate limiting. One shell purchase, two
  roadmap items funded. (The web/PWA path still needs the zxing-wasm fallback per that prewalk
  if iOS-Safari users must scan too.)

## Recommended sequencing

Phases 1–4 need **no iOS app, no Apple account, no HealthKit** — start any time.

1. **Compliance groundwork (no iOS).** Extras-sweep denylist for health/cycle keys; fix
   erasure (cloud doc delete + account deletion); resolve the Mistral training-data posture.
   Pre-existing gaps; smallest and most urgent phase.
2. **Advanced-model tier (no iOS).** Per-uid KV rate limit, then flip the member model env var
   (two-tier if guests stay on Mistral). Immediate "advanced for members" win; auth already
   works.
3. **Dynamic split v1 on manual check-in (no iOS).** Pure `readiness(inputs, baseline)` engine
   behind an input interface; subjective morning check-in on the Today card; REDUCE/TECHNIQUE/
   REST day-builders wired to `setQuickSession`; hard illness safety gate;
   `fitforge.readiness.v1` logging. A complete, shippable feature on its own.
4. **Readiness-aware coach prompts (no iOS).** READINESS block + FOCUS/SAFETY wording, tested
   on synthetic payloads; judged-panel run on adversarial health inputs; JSON `adapt` task for
   accept/reject cards. Ready the day real data lands.
5. **Health data layer (no iOS yet).** `fitforge.health.v1` slice module, per-day merge-on-pull
   (ship *before* any native writer), readiness-digest pure function shared by coach and split
   engine — resolving the §2 sweep-vs-separate-doc conflict here.
6. **Capacitor shell + TestFlight (Apple starts here).** Enroll early ($99, days of wait).
   Scaffold; native auth bridge + Sign in with Apple; `Cap-go/capacitor-health` reads (steps,
   sleep, active energy first) behind the consent flow; internal TestFlight via Xcode Cloud.
   The 1.5–3-week milestone; deviation rules from phase 3 light up as baselines accrue.
7. **v2 native.** Custom Swift plugin for cycle data (opt-in, device-only default) and
   `HKObserverQuery` + background delivery; native barcode scanning in the same shell.
8. **App Store submission.** 4.2 hardening, privacy labels/manifest, consent screenshots in the
   review notes. Last, after everything above is honest.
