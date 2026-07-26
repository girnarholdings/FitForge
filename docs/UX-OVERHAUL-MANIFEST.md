# FitForge UX Overhaul — Integration Manifest

Five parallel workstreams (WS-1 … WS-5) landed together on top of `78299b6`. This document records
what each one changed, the new onboarding step order, the measured phone-viewport fit before and
after, and the integration fixes that were needed to make the five pieces work as one app.

Verified state at time of writing:

| Gate | Result |
| --- | --- |
| `npm run build -w @fitforge/shared` | pass |
| `npm run typecheck -w @fitforge/web` | pass, 0 errors |
| `NEXT_PUBLIC_BASE_PATH="" NEXT_PUBLIC_DEMO=1 npm run build -w @fitforge/web` | pass (101 static routes exported) |
| `cd apps/web && npx playwright test` | **28 passed** |
| Phone viewport fit (390 × 664) | 8/8 screens: primary CTA visible without scrolling, no clipped content |

---

## 1 · What changed, per workstream

### WS-1 · Tinder-style equipment swipe deck

- New reusable `components/ui/SwipeDeck.tsx`: drag left/right/up with a 35 %-of-width commit
  threshold or a ≥0.4 px/ms fling, spring snap-back, capped rotation, directional tint + stamp
  badges, a 3-deep card stack, and imperative drag application (no React re-render per
  `pointermove`).
- Accessibility is not an afterthought: three 56 px labelled buttons (**Don't have · Love it ·
  Have it**) plus **Undo**, arrow-key equivalents (←/→/↑, `Z`/`Backspace` = undo),
  `role="group"` + `aria-roledescription="swipeable card"`, and a polite live region announcing
  every result. `prefers-reduced-motion` swaps the fling for a 120 ms crossfade.
- `EquipmentStep` rebuilt as a 3-phase flow: **intro** (presets + launch, in-shell) →
  **deck** (full-screen `100svh` overlay) → **review** (full-screen overlay, chips you can cycle
  have → love → remove, plus a search box for anything missed).
- Cards are dominated by a gold `EquipmentIllustration` (140–240 px, vs. the old 44 px tiles),
  with an authored plain-English one-liner for all 30 equipment slugs.
- Fatigue control: the deck is grouped into the 6 seed categories, novice-first, and any category
  with ≥3 items gets an interstitial offering *Have none / Have all N / Show me one by one*.
- Presets (Home gym / Commercial gym / Bodyweight only) pre-answer a kit and land on review.
- A live "N exercises unlocked" counter (13 → 59 across the 59-exercise fixture) updates on every
  swipe.
- **Data**: love persists as a new `loved_equipment_slugs` draft field; `equipment_slugs` keeps its
  "have OR love" meaning.
- The old 2211 px scroll wall is gone — see §3.

### WS-2 · Phone-first viewport fit

- New unlayered CSS primitives in `app/globals.css`:
  - `.screen` — bounded `100svh` flex column, `overflow: hidden`. The shell owns the height, so the
    page never scrolls and the iOS URL bar never collapses mid-gesture.
  - `.scroll-region` — the single scroller inside a `.screen` (`flex:1 1 auto; min-height:0`).
  - `.cta-dock` — bottom-pinned action zone with `env(safe-area-inset-bottom)` padding, collapsing
    to nothing when empty.
  - `.safe-top` — notch clearance.
- `app/layout.tsx` viewport export now emits `viewport-fit=cover`, without which
  `env(safe-area-inset-*)` is always 0 on iOS.
- `OnboardingShell` is now a strict 3-zone screen (header / scroll-region / dock) and
  `OnboardingFooter` **portals** into the dock through a new `OnboardingDockContext`, so the CTA is
  a real flex zone rather than a `sticky` bar sitting on top of step content.
- Landing, welcome, auth, done and login were re-composed to fit one viewport; the landing hero is
  an elastic `flex-1` zone so the artwork — not the CTA — absorbs leftover space.

> Cross-cutting rule for future work: these primitives are **unlayered**, so they beat Tailwind's
> layered utilities. Never pair `.cta-dock` with `empty:hidden`, `.scroll-region` with `flex-*`, or
> `.safe-top` with `pt-*` on the same element.

### WS-3 · "How to perform" pose frames

- New offline, self-authored SVG pose library at `components/illustrations/poses/`:
  `types.ts`, `rigs.tsx` (~26 authored key-frame pose sets exposed as 51 rig ids covering all 59
  seed exercises), `PoseFrames.tsx`, `index.ts`. 120 × 120 canvas, floor at y = 104, side-view
  figures face right.
- Each exercise gets 2–3 frames (START → MID → FINISH) with captions, scenery primitives
  (bench pad, rack post, fixed bar, pulley, backrest), a per-frame motion arrow, and an implement
  glyph resolved from the exercise's real equipment. Cable/band implements draw a tether back to
  the pulley or bar.
- Rendering is a CSS-only cross-fade loop above a static side-by-side strip; under
  `prefers-reduced-motion` the loop is hidden and the strip carries the whole story. No JS, no
  external assets, static-export safe.
- `seed/data/exercises.json` gained five optional fields for all 59 exercises: `setup`, `tempo`,
  `breathing`, `pose_pattern`, `pose_badge` (14 exercises).
- `ExerciseDetail` replaces the old "How to do it" paragraph with a **"How to perform"** card:
  pose frames → *Set up* → numbered *Execution* steps → *Breathing* / *Tempo* lines.

### WS-4 · Exercise library access + aggregated targeting

- **Root cause of "I can't find the exercises"**: `Exercises` had `primary: false` in `AppShell`'s
  `NAV`, so it never rendered in the mobile bottom tab bar. Flipped to `primary: true` and moved
  `Settings` to `primary: false`. The tab bar is now **Today · Workouts · Exercises · Nutrition ·
  Progress**, with Exercises in the centre thumb slot. Settings moved to a gear in the mobile top
  bar (`data-testid="mobile-settings"`); the desktop sidebar still lists everything.
- `ExerciseCatalog` rewritten as a two-tab surface — **Library** and **Plan targets**:
  - instant client-side search (`exercise-search`) replacing the old combobox dropdown;
  - a full-width "Browse by muscle" body-map card opening the interactive `MuscleMap` sheet;
  - a horizontally scrolling body-part chip row doubling as the category filter;
  - a Filters sheet (muscle / equipment / pattern / difficulty) with an active-count badge;
  - removable active-filter chips and a "Recently viewed" rail
    (`fitforge.recentExercises.v1`, SSR-safe);
  - the list grouped into sections with headers + counts, toggleable Body part / A–Z.
- New `components/features/shared/MuscleVolume.tsx`: weighted sets-per-muscle-per-week
  (1.0 primary / 0.5 secondary credit), rendered as **both** a heat-mapped `MuscleMap` with a
  legend **and** a ranked bar list with target bands (0 · <10 · 10–20 · >20). It computes from the
  active routine by default, so it shows real data for a freshly onboarded user with zero history;
  a Planned / Last 7 days toggle appears once logged sets exist. Tapping a bar drills back into the
  Library filtered to that muscle.

### WS-5 · Real workout split library

- `packages/shared/src/rules/splits.ts` (+~1,150 lines, all additive): 45 new named `DayTemplate`s
  and a 26-program `SPLIT_LIBRARY` (Full Body, Upper/Lower, PPL, PHUL, Arnold, bro splits,
  StrongLifts, Starting Strength, GreySkull, r/Fitness A-B, 5/3/1 BBB, GZCLP, nSuns, Texas Method,
  Madcow, dumbbell-only, bodyweight RR, kettlebell, athletic/conditioning, glute-focused …), plus
  `getSplit`, `splitDayStrip`, `splitIsFeasible`, `recommendSplits`, `bestSplitFor`,
  `dayTemplatesForSplit`, `buildDayPlanForSplit`, `planDays`, `splitDisplayName`.
  `planDays()` with no split is byte-identical to the old `buildDayPlan()`.
- `seed/data/splits.json` (26 splits, 100 day templates) is **generated** from `SPLIT_LIBRARY` by
  `seed/generate-splits.mjs`, so code and JSON cannot drift.
- **New onboarding step** `split`, between `schedule` and `location`: 4 recommended programs as
  rich cards with a "Best match · …" reason, a "Pick for me" option preserving the old automatic
  behaviour, and "Browse all 26 splits" opening a filterable sheet. The top recommendation is
  preselected on mount, so the step advances on Continue alone. Changing days/week on the schedule
  step clears `split_slug` so the next screen re-recommends.
- `lib/demo/generate.ts` builds the week from the chosen split's day structure and names the
  routine after the program; equipment feasibility, exclusions, liked-exercise bias, difficulty
  ceiling and session-length trimming are unchanged.
- The Workouts screen gained an **Active split** panel (name, days/level, day strip, progression)
  with a *Change* chip and a *Change split* button that reopen the library and regenerate in place.

---

## 2 · New onboarding step order

`ONBOARDING_STEPS` is now **15 entries**; the wizard (progress-bar) portion is **12 steps**
("Step N of 12").

| # | Step id | Wizard | Notes |
| --- | --- | --- | --- |
| 0 | `welcome` | no | optional display name |
| 1 | `auth` | no | Local Mode entry (`enter-demo`) |
| 2 | `goals` | 1 / 12 | |
| 3 | `experience` | 2 / 12 | |
| 4 | `schedule` | 3 / 12 | changing days/week clears `split_slug` |
| 5 | **`split`** | **4 / 12** | **NEW (WS-5)** — best match preselected on mount |
| 6 | `location` | 5 / 12 | seeds the equipment preset |
| 7 | `equipment` | 6 / 12 | **now a swipe deck (WS-1)**: intro → deck → review |
| 8 | `exercise_prefs` | 7 / 12 | |
| 9 | `exclusions` | 8 / 12 | |
| 10 | `body_metrics` | 9 / 12 | |
| 11 | `nutrition_prefs` | 10 / 12 | |
| 12 | `targets_review` | 11 / 12 | |
| 13 | `plan_preview` | 12 / 12 | |
| 14 | `done` | no | |

New draft fields: `split_slug: string | null` (WS-5) and `loved_equipment_slugs: string[]` (WS-1).

**Persistence contract (unchanged, worth stating):** `OnboardingProvider.patch()` mutates the draft
in memory only. The draft is written to `localStorage` (`fitforge.demo.v1`) by `commitAndNext()`
when a step's Continue is pressed. Tests must assert mid-step answers on screen, and assert the
persisted draft only after Continue.

---

## 3 · Phone viewport measurements (390 × 664, dpr 2, `isMobile`)

390 × 664 is iPhone Safari with the URL bar and toolbar showing — the viewport the original
complaint was about. Harness: `apps/web/scripts/measure-viewport.mjs` (playwright-core against the
preinstalled Chromium, static export served by `serve`). It reports page `scrollHeight` vs
`clientHeight`, the inner `.scroll-region` `scrollHeight` vs `clientHeight`, and the primary CTA's
bounding box.

**BEFORE** = `78299b6`, the pre-overhaul commit, built and measured in a clean worktree.
**AFTER** = the integrated overhaul.

| Screen | BEFORE page sh/ch | BEFORE CTA bottom | BEFORE CTA visible | AFTER page sh/ch | AFTER region sh/ch | AFTER CTA bottom | AFTER CTA visible |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` landing | 1225 / 664 (**561 px overflow**) | 1133 | **NO** | 664 / 664 | 477 / 477 | 588 | **YES** |
| `/onboarding/welcome/` | 1030 / 664 (**366 px overflow**) | 938 | **NO** | 664 / 664 | 558 / 520 | 588 | **YES** |
| `/onboarding/goals/` | 814 / 664 (150 px overflow) | 648 | yes | 664 / 664 | 597 / 528 | 652 | **YES** |
| `/onboarding/equipment/` | 2211 / 664 (**1547 px scroll wall**) | 596 | yes | 664 / 664 | 528 / 528 | 652 | **YES** |
| `/onboarding/split/` | — (route did not exist) | — | — | 664 / 664 | 893 / 528 | 652 | **YES** |
| `/login/` | 664 / 664 | 378 | yes | 664 / 664 | 567 / 567 | 395 | **YES** |
| equipment **deck** overlay | — | — | — | 664 / 664 | 608 / 608 | 576 | **YES** |
| equipment **review** overlay | — | — | — | 664 / 664 | 608 / 608 | 640 | **YES** |

Reading the numbers:

- **Page height is now pinned to the viewport on every screen.** `scrollHeight === clientHeight ===
  664` everywhere, because `.screen` is a bounded `100svh` shell and scrolling moved inside
  `.scroll-region`. The page itself never scrolls, so the iOS URL bar cannot collapse mid-gesture.
- Because `.screen` is `overflow: hidden`, a bounded shell could in principle *clip* content rather
  than scroll it — which page height alone would never reveal. The harness therefore also asserts
  that no `.screen` (or deck/review overlay) has `scrollHeight > clientHeight`. **No screen clips.**
  Overflow on `goals` (69 px) and `split` (365 px) lives inside `.scroll-region` and is reachable.
- **Every primary CTA's bounding-box bottom is ≤ 664** with top ≥ 0 — the two screens that failed
  before (landing at 1133 px, welcome at 938 px) are the ones the user was complaining about.
- The equipment step went from a **2211 px** scroll wall to a bounded 664 px screen, and its
  full-screen deck/review overlays are bounded too.

No screen needed a viewport fix during integration; the WS-2 work already satisfied the criterion,
and the measurement above is the evidence rather than an assumption. One *interaction* bug in that
area did need fixing — see §4.1.

---

## 4 · Integration fixes made during merge

### 4.1 Equipment review overlay hid its own Continue button (app bug, cross-workstream)

WS-1's review phase renders `<OnboardingFooter>` inside a `position: fixed; inset: 0; z-index: 60`
overlay. WS-2's `OnboardingFooter` **portals** into the shell's `.cta-dock`, which lives in
`<main class="screen">` with no `z-index`. The overlay therefore painted over the dock and the
review screen's **Continue was invisible and unclickable** — a dead end in the middle of onboarding.

Fix (`components/onboarding/steps/EquipmentStep.tsx`): wrap the review phase's footer in
`<OnboardingDockContext.Provider value={null}>` so `OnboardingFooter` falls back to its in-flow
`.cta-dock` bar *inside* the overlay. Covered by an assertion in
`tests/e2e/equipment-deck.spec.ts` and by the `equipment-review (overlay)` row of the viewport
harness (CTA bottom 640 ≤ 664).

### 4.2 Stale equipment-step copy

`lib/onboarding/steps.ts` still described the removed tap-grid: *"Tap to toggle. Search for anything
not shown."* Now: *"Swipe right if you have it, up if you love it. Presets work too."*

### 4.3 E2E suite brought up to the new reality (integrator owns `apps/web/tests/**`)

- `helpers.ts`
  - `completeOnboarding()` walks the **new 12-step wizard order** including `split` (asserts the
    CTA is enabled, i.e. that something really was preselected), and renumbered comments.
  - New `answerEquipmentDeck()` drives the swipe deck through its **accessible buttons**
    (`swipe-action-left|right|up`, `equipment-category-one-by-one`), never drag gestures, and exits
    via the review screen.
  - New `advanceToEquipment()` for tests that only need the wizard up to the equipment step.
  - `completeOnboarding(page, { onSplit })` hook so a test can choose a specific program.
- `onboarding.spec.ts` — the targets-review walkthrough gained the `split` step.
- `landing.spec.ts` / `exercises.spec.ts` — screenshot calls removed and centralised (see below) so
  parallel workers cannot race on the same PNG.
- **New coverage**
  - `equipment-deck.spec.ts` — right/up/left record have / love / don't-have; undo rewinds the deck
    counter; the review chips match the answered kit; the persisted draft has
    `loved_equipment_slugs ⊂ equipment_slugs` with exactly one loved item; going Back re-hydrates
    the deck from the draft; the review CTA is reachable; a preset pre-answers the kit and the deck
    overlay does not scroll the page at the phone viewport.
  - `split.spec.ts` — picking a *non-default* recommendation persists `split_slug`, names the
    generated routine after that program, produces a routine with exercises, and surfaces it on
    `/routines` as `active-split-name` with a working "Change" entry point.
  - `exercises.spec.ts` — Exercises is present in the mobile bottom tab bar, navigates, and gets
    `aria-current="page"`; `mobile-settings` still reaches Settings; the detail page shows
    `how-to-perform` + `pose-frames` + `pose-strip` + ≥2 numbered steps + Set up / Breathing /
    Tempo; the Plan targets tab renders a real `muscle-volume` aggregate (not the empty state) with
    a populated bar list, non-zero weighted sets, the heat silhouette, and working drill-down.
  - `screenshots.spec.ts` — sole owner of the six canonical docs screenshots at 390 × 664.

No assertion was weakened to hide breakage. The one genuine app defect found (§4.1) was fixed in
the app, not papered over in the test.

### 4.4 Notes on things that did *not* need fixing

- `npm run typecheck -w @fitforge/web` was already clean on the merged tree — WS-5's
  `ONBOARDING_STEPS` addition, WS-1's and WS-5's shared edits to
  `components/onboarding/types.ts`, and WS-3's local `SeedExercise & {...}` intersection all
  type-check together after `npm run build -w @fitforge/shared`.
- WS-1's fixed-position overlays survive WS-2's shell: no ancestor of the onboarding step body
  carries `transform`, `filter` or `contain`, so `position: fixed` still resolves against the
  viewport.

---

## 5 · Screenshots

Captured at 390 × 664 by `apps/web/tests/e2e/screenshots.spec.ts` into `apps/web/tests/screenshots/`:

| File | What it shows |
| --- | --- |
| `landing.png` | one-viewport landing with both CTAs docked |
| `onboarding-equipment.png` | the swipe deck mid-flow (card + Don't have / Love it / Have it) |
| `onboarding-split.png` | the split step with the best match preselected |
| `exercises-catalog.png` | the Library tab |
| `exercise-detail.png` | the "How to perform" pose frames + Set up + Execution |
| `targeting-aggregate.png` | the Plan targets tab: heat silhouette + weighted volume |

---

## 6 · Known gaps / follow-ups

- **Split recommendations are made before equipment is known.** The `split` step deliberately sits
  before `location`/`equipment`, so at recommendation time every program is treated as feasible.
  `generate.ts` still substitutes by owned equipment, so a barbell program resolves to feasible
  variants — but the ranking itself is equipment-blind during onboarding. The post-onboarding
  "Change split" sheet on Workouts *does* rank with the user's real equipment.
- **`loved_equipment_slugs` is recorded but not yet consumed by generation.** WS-1 persists the
  gold-star signal; `lib/demo/generate.ts` does not currently bias exercise selection toward loved
  equipment.
- **WS-3's seed fields are still untyped in `packages/shared`.** `setup`, `tempo`, `breathing`,
  `pose_pattern` and `pose_badge` exist in `seed/data/exercises.json` and are consumed through a
  local `SeedExercise & { … }` intersection in `ExerciseDetail.tsx`. Adding them as optional fields
  on `SeedExercise` would let that local type go away. (Left alone deliberately: it is a shared-type
  change with no current type error and no runtime effect.)
- **Swipe *gestures* are not covered by e2e.** The deck's pointer physics (35 % commit threshold,
  0.4 px/ms fling, up-dominance rule) are exercised only by hand; the suite drives the accessible
  buttons, which is the stable and accessibility-relevant path.
- `PoseFrames` is not re-exported from `components/illustrations/index.ts`; import it from
  `@/components/illustrations/poses`.

---

# Wave 2 — Gamified onboarding + goal-relative analytics

A second pair of workstreams landed on top of the five above: **WS-A** (swipe-deck feel tuning +
gamification) and **WS-B** (percent-of-goal heat gradient + weekly analytics time-series). This
section records what they added, how they were integrated, and what was verified.

Verified state at time of writing:

| Gate | Result |
| --- | --- |
| `npm run build -w @fitforge/shared` | pass |
| `npm run typecheck -w @fitforge/web` | pass, 0 errors |
| `NEXT_PUBLIC_BASE_PATH="" NEXT_PUBLIC_DEMO=1 npm run build -w @fitforge/web` | pass (101 static routes exported) |
| `cd apps/web && npx playwright test --reporter=line` | **34 passed** (28 pre-existing + 6 new) |
| Phone viewport fit (390 × 664, dpr 2, `isMobile`) | no horizontal overflow on any audited route |

---

## 7 · Gamification — the equipment deck's reward loop (WS-A)

### 7.1 Feel

The deck's drag physics were rebuilt so the card is *the finger*, not a lagging proxy:

- The card is painted **synchronously inside `pointermove`** (no React re-render per event), with a
  velocity-derived lead capped at 14 px, and a 1.02× "grab" lift eased in a frame-rate-independent
  `requestAnimationFrame` loop.
- Release runs a **critically-damped spring** (ω = 20.5, ≈ 320 ms, no overshoot) that inherits 45 %
  of the release velocity, so an abandoned drag settles instead of snapping.
- Commit uses a 5-sample / 55 ms velocity buffer, so a **fast short flick** commits (0.4 px/ms with
  a 22 px travel floor) rather than being rejected for not clearing the distance threshold.
- The exit is animated along the **actual release vector** (clamped to the committed side) with
  rotation continuing past the screen edge; the cards behind are promoted progressively with drag
  distance rather than popping at the commit line.
- Feedback layers: an eased stamp ramp, a coloured inset edge vignette (gold = have, warm gold +
  ember = love, neutral = pass) that saturates past the commit line, and guarded
  `navigator.vibrate` haptics (light tick on crossing, stronger on commit, triple pattern for love).

### 7.2 Reward loop

Every reward path is shared by **drag, button and keyboard** answers, because all three funnel
through the same `commit()`:

| Element | `data-testid` | Behaviour |
| --- | --- | --- |
| Commit burst | `swipe-deck-burst` | gold spark for *love*, ripple for *have*, nothing for *pass*; ~780 ms |
| Streak chip | `equipment-combo-chip` | from 3 answers in a row: "3 in a row" → "On a roll · 5" → "Blazing · 8" → "Unstoppable · 12"; resets on undo |
| Milestone toast | `equipment-milestone-toast` | crossing a round unlocked threshold ("+7 exercises unlocked") or finishing a category ("Benches & racks done") |
| Unlocked counter | `equipment-unlocked-counter` | counts *up* to its new value instead of snapping; isolated leaf component so the ~60 fps tick never re-renders the deck |
| Pace nudge | `equipment-deck-nudge` | honest, shrinking "14 left · about 20s" / "Last one" |
| Finish moment | `equipment-finish-screen` | new `celebrate` phase: gradient-gold number counting from zero, breathing halo, 2.2× spark burst, one glow CTA |

**Phase change:** `EquipmentStep`'s `Phase` union gained `'celebrate'`, inserted between
deck-exhaustion and `'review'`. It **auto-advances to review after 3400 ms**, so the wizard can
never be stranded there; `equipment-finish-continue` skips ahead immediately, and
`equipment-deck-review` still jumps straight to review, bypassing the celebration entirely.

**Cost discipline:** every effect is an `absolute`/`fixed`, `pointer-events-none` overlay animating
only `transform` and `opacity` — zero layout shift — and all of them are disabled in **JS** under
`prefers-reduced-motion` (via `usePrefersReducedMotion` in `components/ui/Confetti.tsx`) in addition
to the global CSS rule. `globals.css` gained a purely additive animation block (`ff-spark`,
`ff-ripple`, `ff-pop`, `ff-pop-fade`, `ff-shimmer`, `ff-halo`, `ff-rise-in`) immediately before the
existing reduced-motion rule; no token, primitive or existing rule was modified.

**New `SwipeDeck` props** (both optional, both backwards compatible):
`getBurst(item, dir) => 'spark' | 'ripple' | null` and `overlay: ReactNode` (a pointer-events-none
layer over the card area — `EquipmentStep` uses it for the combo chip).

`components/ui/Confetti.tsx` is intentionally **not** in the `components/ui` barrel; both consumers
import it by path, and `SwipeDeck` now takes `usePrefersReducedMotion` from it.

---

## 8 · Analytics — training as a time series (WS-B)

### 8.1 Percent-of-weekly-goal heat gradient

The heat map's axis changed from *raw sets* to **% of that muscle's personalised weekly set goal**,
which is the question a lifter actually asks ("am I doing enough here?").

- New `components/features/shared/volumeMath.ts` documents per-muscle weekly hard-set goals
  (`BASE_WEEKLY_SET_GOAL`, 6–14 sets placed inside the 10–20 dose-response band by muscle size and
  how much indirect volume the muscle already absorbs — front delts low, side delts high), scaled by
  `GOAL_VOLUME_FACTOR` (hypertrophy 1.15 → general health 0.75), `EXPERIENCE_VOLUME_FACTOR`
  (0.7 / 1.0 / 1.2) and `daysVolumeFactor` (anchored at 4 days = 1.0), floored at 4 sets.
- `heatColorAt(pct)` interpolates a continuous ramp **in OKLab**: 0 % inert, 25 % dark gold,
  50 % yellow `#f2d044`, 100 % orange `#ff7a33`, 130 % red, 170 %+ deep red. `heatGradientCss()`
  samples the *same* function, so the legend can never drift from the body.
- `MuscleMap` gained `heatColors` / `selected` / `ariaLabel` through an **additive**
  `MuscleMapExtendedProps extends MuscleMapProps`; the frozen `types.ts` contract file is untouched
  and every existing caller (`ExerciseCatalog`, `MuscleVolume`, `MuscleMapThumb`) is behaviourally
  byte-identical. Precedence: `heatColors` ▸ `heat` ▸ `primary` ▸ `secondary` ▸ inert.
- New exported `MuscleGoalHeat`: interactive silhouette (`muscle-goal-heat`) + continuous gradient
  legend with 0 / 50 / 100 / 150 % labels (`heat-legend`) + tap-a-muscle read-out
  (`muscle-goal-detail`) showing name, sets, goal, % of goal, a status word ("Under-trained /
  Building / On target / Above target / Over target") and a "Show exercises →" deep link.
- All legacy exports (`computeMuscleVolume`, `volumeHeat`, `bandFor`, `VOLUME_BANDS`, `BAND_*`) are
  preserved, so `features/shared/index.ts` and `ExerciseCatalog` needed no changes.

### 8.2 Weekly progress + time series

- `workoutLog.ts` gained `weeklyBuckets()` (12 Monday-anchored weeks *including empty ones* —
  a gap in the bars is the honest signal), `setsPerMuscleBetween`, `trendOf` /
  `completedWeekTrend`, `exerciseFrequency`, `e1rmSeries` and `bucketWeightedSets`.
- New `features/progress/analytics.ts`: `groupSeries` (6 muscle groups over time vs group goal),
  `strengthTrends` (Epley e1RM, ≥ 2 sessions only — a single point is not a trend),
  `buildSummary` (the plain-English verdict and its bullets) and `plannedWeeklySets`.
- New `features/progress/TrendsTab.tsx` — the default Progress tab: a "How you're doing" verdict
  card, a weekly volume column chart (Sets/Tonnage toggle, hatched in-progress week, average
  reference line, tap-a-bar read-out), a consistency dot-calendar vs target days, muscle-group
  small-multiple sparklines with % of goal, an e1RM strength trend line with exercise chips, and the
  existing body-weight log integrated (not duplicated).
- `charts.tsx` gained `ColumnChart`, `TrendLine` and `ConsistencyStrip` — self-authored inline SVG,
  320-unit viewBox at `w-full h-auto`, keyboard-activatable per-datum tap targets, `useId`-scoped
  pattern ids, `motion-safe:` only.

### 8.3 Honesty rules (enforced by tests)

- A user with **no history** never sees a fabricated chart. The heat card falls back to the active
  routine's **planned** week, labelled "planned week" and "No sets logged yet", with no
  Logged/Planned switch to imply history exists; Trends renders `progress-trends-empty`, which says
  "Nothing here is simulated" and lists what unlocks after 1 workout / 2 weeks / 4 weeks. None of
  `progress-summary`, `chart-weekly-volume`, `chart-consistency`, `chart-strength` or
  `chart-body-weight` mount at all.
- The week-over-week trend deliberately compares the **last two complete weeks** and excludes the
  in-progress one, because comparing a Tuesday against a finished week always reads as a crash.

### 8.4 Bug fixed in passing

`workoutLog.ts` built week and day keys with `Date.toISOString().slice(0, 10)` applied to
*local-midnight* dates, which shifted every bucket back a day for any user east of Greenwich
(this broke `weeklyStreak`). Replaced with a local `localDateKey()`.

---

## 9 · Integration work for this wave

Both workstreams landed type-clean: `npm run build -w @fitforge/shared` and
`npm run typecheck -w @fitforge/web` passed on the merged tree with **no cross-workstream glue
required** — `MuscleMap`'s prop extension is additive, so `ExerciseCatalog` and `MuscleVolume`
consumers compiled unchanged. `next build` also passed first time. The integration work was
therefore test coverage plus one render fix:

- **`charts.tsx`** — the `ColumnChart` average-reference label was drawn at `x = VB_W` with
  `textAnchor="end"`, putting the final glyph flush against the viewBox edge, where it was clipped.
  Moved 2 units in.
- **New e2e helpers** (`apps/web/tests/e2e/helpers.ts`):
  - `seedTrainingHistory(page)` writes ~5 weeks of progressively-heavier sessions straight into
    WS-F's real `fitforge.workoutlog.v1` slice, in the exact shape `WorkoutPlayer.finishWorkout()`
    persists — so every analytic under test runs over production code paths rather than a stub.
  - `recordTransientTestIds(page)` / `seenTransientTestIds(page)` — a `MutationObserver` installed
    *before* an interaction. The reward effects are deliberately short-lived (burst 780 ms, combo
    chip 1400 ms), so polling for them with a normal locator is a race; recording their appearance
    is both non-flaky and a stronger assertion (it proves the effect *fired*).
  - `tapMuscle(page, slug)` — each muscle is one `<a>` wrapping a path **and its mirrored twin**, so
    the element's bounding box spans both sides of the body and its geometric centre falls in the
    gap between them, where a neighbouring shape (the inner thigh, between the two quads)
    legitimately sits on top. The helper aims at the left-hand copy, which is what a real thumb
    does. *This is a genuine property of the silhouette, not a test workaround — a centre-of-bbox
    synthetic click is simply not where a user taps.*
  - `pageOverflow(page)` — `{ vertical, horizontal }` document overflow in px.

### New coverage added (6 tests)

| Spec | Test |
| --- | --- |
| `equipment-deck.spec.ts` | answering with the buttons still records have/love **and** fires the reward layer (burst, streak chip, count-up counter, shrinking nudge) with ≤ 1 px page overflow on both axes, and the answers survive to the persisted draft |
| `equipment-deck.spec.ts` | exhausting the deck reaches `equipment-finish-screen`, counts a real number up from zero, fires the celebration burst, and hands off to review (via the CTA or the 3.4 s auto-advance) |
| `progress.spec.ts` | the Trends tab renders all five time-series + the "How you're doing" verdict; a tapped bar reports that week's numbers; the Sets/Tonnage toggle redraws; the seeded +2.5 kg-per-session progression must read as a **positive** e1RM delta |
| `progress.spec.ts` | the heat view shows the continuous % of goal legend (0/50/100/150 %+), a real CSS gradient, and a tap-a-muscle read-out with sets / goal / % / status that toggles off on a second tap; the Logged ⇄ Planned switch keeps the legend |
| `progress.spec.ts` | an empty-history user gets the labelled planned projection and the honest empty state — and **none** of the time-series components mount |
| `screenshots.spec.ts` | `progress-heat.png` + `progress-analytics.png` at 390 × 664; `onboarding-equipment.png` re-shot in the gamified state (streak chip + milestone toast + progress fill live) |

---

## 10 · Phone viewport re-measurement (390 × 664, dpr 2, `isMobile`, static export)

Measured with `playwright-core` driving `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
against `npx serve apps/web/out -l 4599`, after completing onboarding so the routes are not
intercepted by the not-onboarded gate.

| Route | `scrollHeight` | `clientHeight` | `scrollWidth` | `clientWidth` | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: | --- |
| `/` | 664 | 664 | 390 | 390 | **none** |
| `/onboarding/equipment/` | 664 | 664 | 390 | 390 | **none** |
| `/progress/` (no history) | 1207 | 664 | 390 | 390 | **none** |
| `/progress/` (5 weeks seeded) | 2721 | 664 | 390 | 390 | **none** |
| `/exercises/` | 7009 | 664 | 390 | 390 | **none** |

`/` and `/onboarding/equipment/` remain exactly one viewport tall with no page scroll at all. The
two long routes scroll vertically by design (a catalog and an analytics stack); neither scrolls
sideways. The only elements that extend past 390 px are chips inside deliberate `overflow-x-auto`
rails (the Progress tab strip, the catalog category strip) — those scroll within their own
container, which is why `document.documentElement.scrollWidth` stays at 390.

---

## 11 · Known gaps / follow-ups for this wave

- **The milestone toast is not asserted deterministically.** Whether a given run crosses a round
  "exercises unlocked" threshold depends on which equipment the preset already seeded, so the
  suite asserts the burst, chip, counter and nudge but only *observes* the toast (it is visible in
  `onboarding-equipment.png`). A dedicated fixture that forces a crossing would close this.
- **Swipe gestures are still button-driven in e2e.** WS-A's pointer physics (velocity buffer,
  spring constants, release-vector exit) are exercised only by hand; the suite drives the
  accessible buttons, which is the stable and accessibility-relevant path. The reward layer is
  shared by both paths, so its coverage is real either way.
- **`prefers-reduced-motion` is not covered by e2e.** Every effect is gated in JS as well as CSS,
  but no test runs the suite under `reducedMotion: 'reduce'`.
- **The seeded analytics fixture is time-relative.** `seedTrainingHistory` places sessions at fixed
  day offsets from *now*, so the exact bucket contents shift with the day of the week the suite
  runs. Assertions are written against shapes and directions, never exact counts, for that reason.
- **`loved_equipment_slugs` is still not consumed by generation** (carried over from wave 1).
