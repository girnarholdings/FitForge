# Defect fixes — adversarial review pass

Every defect raised by the adversarial review of the Local Mode web app, with its root cause, the
fix, and the evidence that it is closed.

**Evidence rule used throughout:** a defect is only marked closed if the *original repro* was
re-run against the *production static export* after the fix, by the integrator, and a regression
test now fails when the fix is reverted. Claims from the implementing workstreams were treated as
leads, not as evidence — two of them did not survive re-testing unchanged (see `m1` and `m2`).

Verification baseline:

| | |
|---|---|
| Build | `NEXT_PUBLIC_BASE_PATH="" NEXT_PUBLIC_DEMO=1 npm run build -w @fitforge/web` → exit 0 |
| Types | `npm run typecheck -w @fitforge/web` → clean |
| E2E | `npx playwright test` → **64 passed**, stable over 3 consecutive runs |
| Repro driver | playwright-core + `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, 390×664, `isMobile`, against the served `apps/web/out` |
| Generator fuzz | 4,082,400 generated plans (151,200 auto + 3,931,200 across all 26 named splits) |

---

## Summary

| ID | Severity | Defect | Status |
|---|---|---|---|
| B1 | blocker | Generated plan contained a training day with zero exercises; opening it crashed the workout player | **VERIFIED FIXED** |
| B1a | blocker | "Protect my knees" deleted every squat variant (applied as a hard exclusion) | **VERIFIED FIXED** |
| B2 | blocker | Any JSON with `version: 1` was imported and permanently white-screened the app; corrupt storage crashed 3 routes and rendered `NaN` | **VERIFIED FIXED** |
| M1 | major | Plan copy promised coverage the generated days did not have | **VERIFIED FIXED** |
| M2 | major | Settings was a facade: fixture data, nothing persisted, dead "Save changes", dead "Re-generate" | **VERIFIED FIXED** |
| M3 | major | `preferred_substitute_id` and `loved_equipment_slugs` were collected and silently ignored | **VERIFIED FIXED** |
| M4 | major | Backup omitted all training history; "erase everything" left the workout log on disk | **VERIFIED FIXED** |
| M5 | major | Coach answered pain / injury / medical questions with confident training advice | **VERIFIED FIXED** |
| m1 | minor | "1 exercises" | **VERIFIED FIXED** (was still live in `TodayView` after the owning workstream finished) |
| m2 | minor | A German question returned a confident, wrong English answer | **VERIFIED FIXED** (root cause fixed, not just masked) |
| m5 | minor | The `rear` slot note was ignored, so the rear-delt slot resolved to lateral raises | **VERIFIED FIXED** |

---

## B1 · blocker — a generated day with zero exercises

**Repro.** Onboarding with goal *General health*, 30-minute sessions, location *Minimal / travel*,
"Don't have" for **every** piece of equipment, protecting *Knees* + *Lower back* + *Shoulders*
produced `Day A [2] · Day B [0] · Day C [3]`. Opening Day B threw
`Cannot read properties of undefined (reading 'routineExercise')` and white-screened.

**Root cause.** Two independent bugs compounding:

1. The session-length trim ran *before* equipment/exclusion feasibility filtering, so a day's
   slots were cut to a target count and only then had most of its candidates removed — the trim
   was spending its budget on exercises that were about to be deleted.
2. `WorkoutPlayer` indexed `exercises[index]` with no bounds check, so a zero-length day
   dereferenced `undefined` during render.

**Fix.** `apps/web/lib/demo/generate.ts` — feasibility filtering now runs across all template
slots *before* the trim, followed by a relaxation ladder that backfills to a floor of 3 (or the
day's own slot count if smaller): day-focus patterns → any feasible exercise → equipment-free
bodyweight staples → an unconditional last resort. `apps/web/components/features/workout/
WorkoutPlayer.tsx` — an empty day or unresolvable id now renders a branded fallback with routes
back to Today / Workouts, and a bounds-clamping effect keeps the pager index in range.

**Evidence it is closed.**

- The exact repro, re-walked through the real wizard: `Day A [4] · Day B [3] · Day C [4]`,
  **0 empty days**; all three `/workout/<dayId>/` pages load with no "Application error", no
  `pageerror` and no console exception.
- Fuzz over the real `routineForDraft`, bundled from the production module: 5 goals × 3
  experience levels × 7 days/week × 6 session lengths × 3 locations × 8 equipment sets
  (including empty) × 10 body-area protection sets = **151,200 auto plans**, plus the same
  matrix across all 26 named splits = **3,931,200 plans**. Total **4,082,400 plans,
  0 empty days, 0 generator crashes.** The only single-exercise days that remain (21,600) are
  all the one-slot `Rest / Cardio` template day — no training day is ever a single exercise.
- Regression tests: `regression-generation.spec.ts` — the full wizard repro (asserting no empty
  day *and* that every generated day's workout page opens without error), plus a six-case
  equipment × protection matrix driven through Settings' regenerate button.

---

## B1a · blocker — protecting "Knees" deleted every squat

**Repro.** Protecting *Knees* removed **all** squat-pattern exercises, including `Bodyweight
Squat`. With no equipment owned, that left nothing to fill a squat slot — which is what emptied
Day B in B1.

**Root cause.** `resolveBodyAreaExclusions` correctly returns `squat` with `soft: true`, but
`generate.ts` ignored the flag and treated every row as a hard pattern ban.

**Fix.** Exclusions are now split on `soft`. Hard = the pattern is removed. Soft = a −1,000,000
ranking penalty, so the pattern ranks last and is only chosen when nothing gentler fits the slot —
de-prioritised, never deleted. `ExclusionsStep` copy was rewritten to state exactly that
("These stay in, but we'll ease off them…").

**Evidence it is closed.**

- `resolveBodyAreaExclusions(['knees'])` → `lunge (HARD)`, `knee_extension_iso (HARD)`,
  `squat (soft)` — confirmed against the shipped rule.
- Minimal location, zero equipment, knees protected: the plan contains `Bodyweight Squat` ×2 and
  **zero** lunge / knee-extension exercises. In a full/home gym the same protection yields
  `Barbell Back Squat` / `Goblet Squat`, again with no hard-excluded pattern leaking.
- Sweep of 630 knee-protected equipment-poor plans: **630/630** contain a squat-pattern lift and
  **336** contain a bodyweight squat variant — the pattern is never wholly eliminated.
- Regression test: `regression-generation.spec.ts` → *"protecting Knees does not eliminate
  bodyweight squat variants"*, which asserts both halves (the soft pattern survives, the hard
  patterns do not leak).

---

## B2 · blocker — the store was trusted input

**Repro.** Importing `{"version":1,"routine":"hello","completedAt":"…","userId":"demo-user"}`
through Settings → *Import data* was accepted, persisted, routed to `/today`, and permanently
white-screened the app with no recovery path. Independently, corrupt storage crashed
`/today` (`undefined.find`), `/routines` (`undefined.reduce`) and `/progress`
(`undefined.flatMap`), and garbage food-log numbers rendered a literal `NaN`.

**Root cause.** `importState` validated nothing beyond `version === 1`, and every read path
assumed the parsed JSON matched its TypeScript type. `localStorage` is untrusted input on both
sides of the boundary and was treated as trusted on both.

**Fix.** `apps/web/lib/demo/store.ts` and `apps/web/components/features/shared/workoutLog.ts` —
one shape-normalizer pass serving two callers: `normalizeDemoState` repairs or drops what is
broken and never throws; `validateDemoState` runs the same pass and treats *any* repair as a
rejection. Every read runs the normalizer and writes the repaired shape back, so a corrupt store
heals once instead of re-crashing on every route and reload. Numbers go through a finite-number
coercion, so no read can produce `NaN`. The workout log drops `null` sessions, sessions with an
unparseable `finishedAt`, and exercises with no id.

**Evidence it is closed.**

- The exact malformed payload, fed through the **real Settings file input**: rejected with the
  visible message *"Backup is malformed — state.routine: expected a routine object or null.
  Nothing was changed."*; the URL stays on `/settings/`; the previously-good state is byte-for-byte
  unchanged; all five app routes still render cleanly afterwards.
- Eight corruption shapes written directly into `localStorage` as raw text and loaded on
  `/today`, `/routines`, `/progress`, `/nutrition` — **32 route loads, 0 crashes, 0 rendered
  `NaN`**: routine as a string; `routine.days` as a number; day entries with no `exercises`
  array; garbage food-log values; a literal `NaN` token in the stored JSON; a `null` entry in
  `sessions[]`; a session with no `exercises[]` and non-numeric set values; every field corrupt at
  once; and both keys as unparseable junk.
- Repair (not just survival) is asserted: after one load of a store whose `routine` is `"hello"`,
  the persisted value is no longer `"hello"`, and a second load is also clean.
- Regression tests: `regression-data-integrity.spec.ts` — 2 import-rejection tests, 8
  corruption-survival tests, 1 repair test.

---

## M1 · major — plan copy promised coverage the plan did not have

**Root cause.** `routine.description` was a constant, and a named split's marketing blurb was
printed verbatim regardless of what the generator actually produced — so
*"Every session hits squat, hinge, push and pull"* could sit directly above a day containing none
of them.

**Fix.** `routine.description` is now derived from the days actually generated; a named split's
blurb is only allowed to stand when the plan is **not** limited. A new
`planCoverageForDraft(draft)` surfaces a cause-attributed notice (equipment / exclusions / both)
with a concrete next step, on both the plan-preview step and the Workouts card.

**Evidence it is closed.** Descriptions are generated per plan and match their contents, e.g.
*"3 days a week · covers squat, push, row, core, glutes. Built from the equipment you have."* The
notice fires only when a true reason exists — full gym with no exclusions and full gym with knees
protected both report `limited=false`; minimal with nothing owned reports `limited=true,
cause=equipment`; minimal with three protected areas reports `limited=true, cause=both`. No
generated description promises a movement pattern that a day lacks (asserted across the four
coverage cases).

---

## M2 · major — Settings was a facade

**Repro.** Seeding a real profile (*fat_loss / advanced / 2 days / 30 min / vegan / 5 meals /
1500 kcal / minimal / no equipment*) and opening Settings showed *Build muscle, Advanced,
Commercial gym, Omnivore, 4 days, 3 meals, 2600 kcal, Barbell + Dumbbells + Cable Machine +
Pull-up Bar* — fixture data, for every user. No control persisted anything, "Save changes" had no
`onClick` at all, and "Re-generate my plan" only closed the sheet.

**Root cause.** The component read `MOCK_PROFILE` / `MOCK_NUTRITION_PROFILE` / a hard-coded
equipment array and held every control in local React state.

**Fix.** `SettingsView.tsx` was rebuilt on the real store. One resolver drives both what renders
and what a write persists (draft → derived rows → neutral default), so the two cannot drift. Each
control persists immediately through a `commitPatch()` that re-derives profile, nutrition profile
and targets. The dead "Save changes" button was removed in favour of truthful instant persistence
with a live *"Saved to this browser."* status. "Re-generate my plan" calls `routineForDraft` and
replaces `state.routine`.

**Evidence it is closed.** Against the seeded non-default profile:

- Renders *Lose fat, Advanced, Minimal, Vegan, Knees, Peanut, Soy, 30 min, Female*; steppers show
  `2 days` / `5 meals`; inputs show `1500 / 120 / 150 / 45`, name `Seed Athlete`, height `162`,
  birthdate `1994-03-02`, weight `58`; equipment reads *"Nothing marked — we build bodyweight-only
  plans for you."* Every value is the seeded one.
- Editing name → `Renamed Athlete`, kcal → `1750`, diet → Pescatarian writes through to
  `draft`, `profile`, `nutritionProfile` **and** `targets`, and every edit survives `reload()`.
- Regenerate: `Seeded starter routine` (1 day, 1 exercise) → `Full Body — 2-day plan` (2 days,
  7 exercises, 0 empty days). The day count equals the edited `days_per_week`, and the summary is
  identical after a reload, proving it was written to the store rather than component state.
- Regression tests: `regression-settings.spec.ts` — 4 tests, all seeded with a deliberately
  non-default profile so a fixture-shaped fixture could not make them pass.

---

## M3 · major — two collected onboarding signals were silently ignored

**Root cause.** `preferred_substitute_id` (the substitute a user pins for an excluded exercise)
was never read, and `loved_equipment_slugs` (the swipe-deck "love it" gesture) had no effect on
ranking. Both were collected, stored, and dropped.

**Fix.** When a ranked candidate is a user-excluded exercise, the pinned substitute is used if it
is still selectable (feasible, not itself excluded/used/hard-banned), otherwise generation falls
through to automatic substitution. Loved equipment applies a +200 ranking bonus — a bias, not a
filter.

**Evidence it is closed.**

- Excluding `Barbell Back Squat` on a 4-day gym plan: substitute *Auto* → `Leg Press,
  Bulgarian Split Squat`; substitute pinned to `Hack Squat` → `Hack Squat, Bulgarian Split
  Squat`. The pin changes the outcome. (Note: the pin is honoured only when the substitute is
  itself feasible — pinning `Hack Squat` without owning a hack-squat machine correctly falls back
  to auto. That is intended behaviour, and it is what makes the first version of this test fail.)
- Loved equipment on a home kit: `loved=[]` → 0 kettlebell picks; `loved=['kettlebell']` → 2
  (`Kettlebell Swing` ×2), while barbell lifts remain in the plan — confirming a bias rather than
  a filter.

---

## M4 · major — the backup was not a backup

**Repro.** With 4 logged sessions on disk, *Export data (JSON)* produced a file containing **0**
sessions. *Erase Local Mode data → Yes, erase everything* removed `fitforge.demo.v1` and left
`fitforge.workoutlog.v1` (all 4 sessions) in place.

**Root cause.** `exportState` serialised a single key and `resetDemo` removed a single key, while
the app owns several.

**Fix.** A v2 bundle — `{format, version, exportedAt, demo, workoutLog, extras}` — where `extras`
carries every other `fitforge.*` key as opaque JSON. Import validates **every** section before
writing anything. Erase enumerates and removes every `fitforge.*` key. A bare v1 file still
imports, for backward compatibility.

**Evidence it is closed.** Full round trip driven through the real Settings controls, with one
workout logged through the actual `WorkoutPlayer` (set filled, marked done, finished) plus two
seeded sessions:

- Before export: `["fitforge.demo.v1","fitforge.workoutlog.v1"]`, **3 sessions**.
- Export → `fitforge-backup-2026-07-26.json`, top-level keys
  `[format, version, exportedAt, demo, workoutLog, extras]`, **`workoutLog.sessions = 3`**.
- Erase → URL `/`, **`fitforge.*` keys = `[]`** (nothing left).
- Import → **3 sessions restored**, keys back, and `/today`, `/progress`, `/routines`,
  `/nutrition` all render cleanly.
- Regression test: `regression-data-integrity.spec.ts` → *"export → erase → import keeps every
  logged workout, and erase clears all fitforge keys"*.

---

## M5 · major — the Coach answered medical questions

**Repro.** *"My knee hurts when I squat, what should I do?"* returned a confident curated answer
about whether knees may travel past the toes. *"I have chest pain during exercise"* returned a
disambiguation list including *"Should I train during my period?"*. *"I tore my rotator cuff, can
I keep benching?"* returned exercise-substitution advice.

**Root cause.** Retrieval ran first and confidence was the only gate. Nothing in the pipeline
distinguished *"how do I train X"* from *"X hurts"*.

**Fix.** New `apps/web/lib/kb/safety.ts` — a pure red-flag classifier (urgent / injury /
medical-general, 17 named detectors) wired as the **first** gate in `routeQuery`. A red-flagged
query cannot resolve to `answer` and never triggers an AI call. The Coach renders a purpose-built
`SafetyCard`, and only below a hard rule offers curated reading as clearly-labelled secondary
information. "Sore" alone is deliberately not a red flag.

**Evidence it is closed.** Driven against the real Coach screen with all off-origin requests
intercepted and recorded:

| Query | Primary card | Level | KB card | AI card | Off-origin requests |
|---|---|---|---|---|---|
| My knee hurts when I squat, what should I do? | `coach-safety-card` | injury | no | no | none |
| I have chest pain during exercise | `coach-safety-card` | urgent | no | no | none |
| I tore my rotator cuff, can I keep benching? | `coach-safety-card` | injury | no | no | none |
| I feel dizzy and short of breath when I run | `coach-safety-card` | urgent | no | no | none |
| my lower back is killing me after deadlifts | `coach-safety-card` | injury | no | no | none |
| I think I pulled my hamstring | `coach-safety-card` | injury | no | no | none |

No red-flag query produced a curated or AI answer card, and none reached the network.
False-positive control: *"How much protein do I need?"* and *"What is progressive overload?"*
still return `coach-answer-kb`; *"Why am I so sore after leg day?"* still disambiguates; *"what
should I do if I am sore"* is not flagged. KB retrieval health is unchanged
(`answer=13 · disambiguate=3 · ai=1`, alias recall top-1 96% / top-3 100%).

Regression tests: `regression-coach-safety.spec.ts` — 3 red-flag tests asserting the safety card
is *first* in the turn and that no answer card exists, 1 secondary-reading test, and 3 explicit
false-positive controls.

---

## m1 · minor — "1 exercises"

**Status when the integrator picked this up:** the owning workstream fixed `RoutineList` and
`PlanPreviewStep` and flagged `TodayView` as out of its scope. It was **still live**.

**Reachability.** Not theoretical: the one-slot `Rest / Cardio` template day produces a
one-exercise day in 21,600 of the 151,200 fuzzed auto plans.

**Repro (confirmed before fixing).** Seeding a routine whose days hold exactly one exercise and
loading `/today` rendered `1 exercises`.

**Fix.** `apps/web/components/features/today/TodayView.tsx:90` now uses the already-exported
`exerciseCountLabel(day.exercises.length)`.

**Evidence it is closed.** Same repro after the fix: `/today` renders `1 exercise`, `/routines`
renders `1 exercise` ×7. Regression test: `regression-generation.spec.ts` → *"a one-exercise day
never renders '1 exercises'"*, which asserts on **both** routes and fails on the pre-fix build.

---

## m2 · minor — a German question got a confident English answer

**Repro.** *"Wie viel Eiweiß brauche ich pro Tag?"* rendered the full curated answer to *"What can
I do with only dumbbells?"*.

**Root cause (fixed at source).** `editDistanceAtMostOne` in `apps/web/lib/kb/text.ts` returned
`true` at the *first* swapped adjacent pair without checking the remainder of the string, so
`brauche` and `barbell` — which differ in 6 of 7 positions — were treated as a distance-1 typo.
The implementing workstream could not touch that file and added a route-level guard that
neutralised the visible damage; the fuzzy matcher was still over-matching for every query.

**Fix.** The same-length branch now collects **all** differing positions before deciding: 0 or 1
difference is a substitution; exactly 2 differences are accepted only if they are adjacent and
mutually swapped. The route-level `weakEvidence` guard is retained as defence in depth.

**Follow-on defect this exposed, and its fix.** With the matcher corrected there is no longer any
hit at all for the German query, which pushed it down the AI branch and — on this
unconfigured build — produced *"Personalized answers need the Coach service · This question is
specific to you"*. That is a false claim: the question was not personal, it was in another
language. `CoachView` now treats "no trustworthy match" as covering both a guarded hit and no hit,
so an unconfigured build falls through to the honest no-match card.

**Evidence it is closed.**

- Unit sweep of the corrected matcher: `protien≡protein` ✓, `squat≡squta` ✓, `barbell≡barbel` ✓,
  `deadlift≡deadlfit` ✓, `form≡from` ✓ — and `brauche≡barbell` ✗, `abcd≡badc` ✗,
  `eiweiss≡fitness` ✗.
- The German query now renders `coach-no-match` as the primary card, with the language hint
  *"The guide is written in English — asking in English will match far better."* and **no** KB
  answer card and **no** "needs the Coach service" card.
- Typo rescue still works end-to-end: *"how much protien do I need"* returns `coach-answer-kb`.
- KB retrieval health unchanged after the change (alias recall top-1 96% / top-3 100%).
- Regression tests: `regression-coach-safety.spec.ts` → the no-match test (which also asserts the
  language hint and the absence of the personalize card) and *"a genuine typo is still rescued"*.

---

## m5 · minor — the `rear` slot note was ignored

**Root cause.** The shoulder-isolation slot carries `note: 'rear'`, which the picker never read,
so it resolved by popularity to `Dumbbell Lateral Raise` (a *front/side* delt movement) on the
Pull day.

**Fix.** `slot.note` now contributes a +2000 ranking bonus matched on `rear|face-pull|reverse-fly`.

**Evidence it is closed.** 6-day PPL, 75-minute sessions, full gym →
`Day B — Pull: Pull-up, Barbell Bent-over Row, Face Pull, Dumbbell Curl, Farmer's Carry`. The
rear-delt slot resolves to `Face Pull` on both Pull days.

---

## Also fixed while integrating

These were not on the review list but were found or caused during verification.

**Stale KB count in the Coach page `<head>`.** `app/(app)/coach/page.tsx` hard-coded *"83 curated
answers"* while the KB ships 87. It is now derived from `KB_ENTRIES.length`; the served HTML
reads *"87 curated answers"*.

**The E2E suite could not complete a full run.** `npx serve` leaks one file descriptor per request
and died with `EMFILE: too many open files` around test 50 of 64 (the box's hard `ulimit -n` is
4096, and the new regression specs roughly tripled the request volume). Every remaining test then
failed with `ERR_CONNECTION_REFUSED` — indistinguishable from a product regression. Replaced with
`apps/web/tests/static-server.mjs`, a ~90-line zero-dependency static server that reads files
whole rather than streaming them. `probeRoute` was also moved off `waitUntil: 'networkidle'`
(a heuristic that can never settle) onto `load` plus a best-effort quiet wait.

---

## Known-good ≠ perfect: what is still open

1. **There is no in-app path back to Settings after an erase.** Erasing gates the app to
   onboarding, and *Import data* lives only on the Settings screen — so a user who erases cannot
   restore their own backup without completing onboarding again. The data round trip itself is
   sound (verified above); the *route* to it is not. The M4 regression test re-seeds a session
   flag to get past this and comments on why.
2. **The generator is not defensive about invalid enum values.** `routineForDraft` throws
   `Cannot read properties of undefined (reading 'beginner')` when handed a `primary_goal` outside
   the five valid values. The UI cannot produce that today, and the store normalizer now rejects
   such states on import, so it is not currently reachable — but it is an unguarded assumption.
3. **The checked-in `tests/screenshots/*.png` are one copy change stale.** They were restored to
   `HEAD` to keep the diff focused; `/today` now reads "1 exercise" where the committed PNG reads
   "1 exercises". Re-run `npx playwright test screenshots.spec.ts` to refresh.
4. **`/progress` has a chip rail wider than the viewport at 320 px.** This is correct responsive
   behaviour, not an overflow bug — the rail is an `overflow-x: auto` container
   (`scrollWidth 447 > clientWidth 288`) and the page itself has zero horizontal overflow — but it
   does mean the *Photos* chip needs a horizontal scroll to reach on a small phone.
