# FitForge — Onboarding Specification

> Condensed from [`BLUEPRINT.md`](./BLUEPRINT.md) §2.2 and §7. The blueprint holds the frozen, screen-exact detail; this is the working summary. The web implementation lives in `apps/web/app/onboarding/[step]/`. There is no native iOS onboarding: `apps/ios` is a thin WKWebView shell around goforge.fit, so iPhone users run the web flow above and the shell adds only what a webview cannot do itself (see `apps/ios/README.md`).

## Goal

Build a complete, high-quality user profile with **minimal typing**. Every screen leans on autofill, prediction, and smart defaults so the profile "forms itself." Each step persists write-through (`profiles.onboarding_step`), so a user can leave and resume via `onboarding_status()`.

## The 13-screen flow

| # | Screen | What it captures | Autofill / prediction |
|---|--------|------------------|------------------------|
| 0 | Welcome | — | — |
| 1 | Goal | strength · hypertrophy · fat loss · endurance · general health | Pre-selects "general health"; drives all downstream defaults. |
| 2 | Experience | beginner · intermediate · advanced | Defaults to beginner; sets volume/intensity defaults. |
| 3 | Environment | home · commercial gym · minimal/bodyweight | Selecting an environment applies an **equipment preset**. |
| 4 | Equipment | specific machines/equipment owned | Preset from screen 3 pre-checks likely items; dependency nudges (e.g. barbell → suggest plates/rack). |
| 5 | Liked exercises | movements the user enjoys | Type-ahead search (`search_exercises`), ranked by popularity + match. |
| 6 | Exclusions | movements/areas to avoid (injuries, dislikes) | Body-area → movement-pattern map pre-filters affected exercises. |
| 7 | Substitutions | replacements for excluded/unavailable movements | `suggest_substitutes` proposes equivalents for the same muscle/pattern using owned equipment. |
| 8 | Availability | days/week + session length | Defaults by goal (e.g. 3–4 days). |
| 9 | Metrics | age, sex, height, weight | Wheel pickers **pre-scrolled** to population medians. |
| 10 | Diet & allergies | diet type, allergens, foods to avoid | Chips; allergen selections filter foods later. |
| 11 | Macro targets | calorie + macro goals | `suggest_nutrition_targets` pre-fills from metrics + goal (Mifflin–St Jeor); user can nudge. |
| 12 | Plan preview → finish | confirmation | `generate_starter_routine` builds the starter plan; redirect to `/today`. |

## Deterministic rules (mirrored in `packages/shared/src/rules/`)

### Type-ahead ranking (`search.ts` / `search_exercises`)
`pg_trgm` similarity + boosts for prefix match and popularity, penalized by excluded/unavailable status. Debounced client-side; authoritative results from the RPC.

### Smart defaults (`defaults.ts`)
Goal × experience matrices produce sets, rep ranges, rest, and weekly frequency. Equipment presets map environment → a starting equipment set with dependency nudges.

### Macro targets (`macros.ts` / `suggest_nutrition_targets`)
Mifflin–St Jeor BMR → activity-scaled TDEE → goal adjustment (deficit/surplus/maintenance) → macro split (protein anchored per bodyweight, fat floor, carbs remainder).

### Exercise substitution (`substitution.ts` / `suggest_substitutes`)
6-step scoring: filter to feasible (equipment/bodyweight), match movement pattern, match primary muscle, weight by similarity edges + popularity, exclude user-excluded, rank. The canonical worked example: *bench-press excluded, equipment = dumbbell + flat-bench ⇒ top substitute = dumbbell-bench-press.*

### Starter routine (`splits.ts` / `generate_starter_routine`)
Chooses a split template by weekly frequency (full-body / upper-lower / push-pull-legs), fills role slots (compound → accessory) with feasible, non-excluded, preferred exercises.

## Completion contract

Onboarding is "complete" when the profile has a goal, experience, equipment set, availability, metrics, nutrition targets, and an active generated routine. See BLUEPRINT §2.2 for the DB-level completion contract.
