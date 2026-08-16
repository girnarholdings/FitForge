# FitForge — MVP Build Blueprint

**Version:** 1.0 · **Date:** 2026-07-19 · **Author:** Fable master architect (prewalk)
**License of this project:** Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) — see WS-7.

> **WHERE THE BUILD DIVERGED.** Two contractual items below were never built as specified and
> the code is the truth on both. (1) **Auth is Firebase, not Supabase SSR.** There is no
> `middleware.ts` and no `lib/supabase/**` — a static export has no server for either to run on;
> see `apps/web/lib/auth/`. The Supabase paths named in §9 were removed once it was clear they
> had never been imported. (2) **iOS is a WKWebView shell**, not a native SwiftUI implementation
> of these screens; see `apps/ios/README.md`. Everything else remains contractual.

This is the single authoritative blueprint for the FitForge MVP. A fleet of parallel engineering
agents will execute Section 9 against Sections 4/6/7 verbatim. Where this document gives exact
names (slugs, enum values, table names, file paths), they are **contractual** — do not rename.

---

## 1. Product overview & principles

### 1.1 What FitForge is

FitForge is a **personal trainer + nutrition guide**: a mobile-first product (native SwiftUI iPhone
app + Next.js web app) on a single Supabase (Postgres) backend. Its centerpiece is a **smart
onboarding flow** that builds a rich, structured user profile from *preferences* — equipment
access, enjoyed exercises, exclusions (injuries/dislikes) with automatic substitutions, goals,
experience, schedule, body metrics, and nutrition preferences (diet type, allergies, macro
targets, foods to avoid). Every onboarding input is assisted: **type-ahead search over a curated
database, smart defaults, and deterministic rule-based suggestions** — no LLM in the MVP, but the
suggestion layer is isolated behind RPCs so an AI layer can replace/augment it later without
touching clients.

From the completed profile, FitForge deterministically generates a **starter routine** (split,
days, exercises, sets×reps, rest) and **nutrition targets** (calories + macros), then supports
day-to-day use: log workouts (sets/reps/weight/RPE), log food, track body weight and
measurements, and swap any exercise via the substitution engine.

### 1.2 What we learned from wger (and how FitForge improves on it)

wger (Django, AGPL, self-hosted) is the best open-source reference for fitness domain modeling.
Deep-dive findings:

**wger's domain model (studied from `wger/exercises/models`, `wger/manager/models`,
`wger/nutrition/models` and docs):**

| wger area | Models | Takeaway for FitForge |
|---|---|---|
| Exercises | `Exercise` (base), `Translation`, `Alias`, `Category`, `Equipment` (M2M), `Muscle` (primary/secondary M2M, `is_front` flag), `Image`, `Video`, `Comment`, `DeletionLog` | Adopt: base-exercise + aliases + category + equipment M2M + primary/secondary muscle M2M. Simplify: single language (English) at MVP, aliases as `text[]`, media as URLs/storage paths. Add what wger lacks: `movement_pattern`, `mechanics`, `difficulty`, `popularity`, and a first-class **substitution graph**. |
| Routines | `Routine` → `Day` → `Slot` (supports supersets) → `SlotEntry` (exercise) → per-set config tables (`SetsConfig`, `RepetitionsConfig`, `WeightConfig`, `RestConfig`, `RiRConfig`) enabling week-by-week progression; `WorkoutSession` + `WorkoutLog` | wger's config-table-per-parameter design is powerful but heavy for an MVP. Adopt the hierarchy (routine → day → slot/entry, superset via slot grouping) but flatten prescriptions into columns (`sets`, `rep_min/rep_max`, `target_rpe`, `rest_seconds`, `superset_group`). Keep sessions/logs separate from prescriptions (wger does this well). |
| Nutrition | `NutritionPlan` → `Meal` → `MealItem` → `Ingredient` (per-100g macros, Open Food Facts sourced), `IngredientWeightUnit`, `LogItem` | Adopt per-100g macro modeling and plan/meal/item/log separation. Improve: snapshot macros onto log rows (history immune to catalog edits), diet-compatibility tags on foods, curated small verified food set instead of a noisy 1M-row OFF dump. |
| Body | `WeightEntry`; measurement `Category` + `Measurement`; gallery images | Collapse into one `body_metrics` row-per-day table with nullable columns + `progress_photos` on Supabase Storage. |
| Gym mgmt | Gyms, members, contracts, admin notes | **Out of scope** — FitForge is a consumer product, not gym software. |

**Where wger is weak for a mobile/iPhone-first experience (our openings):**
1. **No preference-driven onboarding.** wger drops you into an empty database-admin-style UI; you build routines by hand. FitForge's onboarding *is* the product.
2. **Server-rendered Django UI**, desktop-first; the mobile apps are Flutter wrappers over a generic REST API with many round-trips. FitForge: native SwiftUI + a schema designed for few, fat reads (views/RPCs).
3. **No substitution intelligence.** wger has equipment/muscle metadata but never uses it to suggest alternatives. FitForge ships a deterministic substitution engine (Section 7.4).
4. **No exercise metadata for programming** (pattern, mechanics, difficulty), so nothing can be generated automatically. FitForge's catalog is programming-aware.
5. **Nutrition data is unbounded OFF data** — great coverage, terrible signal-to-noise on mobile search. FitForge seeds ~30 verified staples and ranks them first; barcode/OFF import is post-MVP.
6. **Auth/permissions are Django sessions + roles.** FitForge uses Supabase Auth + RLS: every user-owned row is `user_id = auth.uid()`, catalog is world-readable.

### 1.3 Product principles

1. **Mobile-first, thumb-first.** Every flow works one-handed on an iPhone 13-mini-sized screen. One decision per screen in onboarding. Bottom-anchored primary CTA. Web is a responsive twin, not the design driver.
2. **Never ask what we can predict.** Every input has a smart default; typing is last resort — pick from chips, search with type-ahead, accept suggestions.
3. **Preferences are first-class data**, not settings: equipment, favorites, exclusions, and substitutions are rows with reasons, driving generation and search ranking everywhere.
4. **Deterministic and explainable.** Every suggestion has a rule and a human-readable reason ("Suggested because it targets chest and needs only dumbbells"). The rules live server-side (SQL RPCs) so web + iOS behave identically; an AI layer can later shadow the same RPC contract.
5. **One backend, two thin clients.** All logic that must agree across platforms lives in Postgres (RPCs, views, constraints, RLS). Clients hold UI state only.
6. **Log-friendly.** Logging a set is ≤2 taps from the workout screen; logging a food is search → tap serving → done.
7. **Own your history.** Logs snapshot the numbers they were computed from; editing the catalog never rewrites history.

### 1.4 MVP scope fence

**In:** onboarding (full), profile, catalog browse/search, routine generation + manual editing, workout logging, food logging, calorie/macro targets + daily dashboard, body weight/measurements, progress photos, substitution engine, favorites/exclusions.
**Out (post-MVP):** social, AI coach, barcode scanning, Apple Health / HealthKit sync (stub the service boundary), wearables, gym management, recipes, Android, offline-first sync (MVP: online + optimistic UI).

---

## 2. Personas & core user flows

### 2.1 Personas

- **P1 "Restart Rachel"** (34, beginner, home: dumbbells + bands + bench). Goal: fat loss + tone. Needs: zero-jargon onboarding, home-equipment-only plan, simple food logging. Vegetarian, tree-nut allergy.
- **P2 "Gym-rat Gabe"** (27, advanced, commercial gym). Goal: hypertrophy. Shoulder impingement → excludes overhead barbell pressing, wants auto-substitutes. Wants fast logging and control over exercise selection.
- **P3 "Minimal Marco"** (45, intermediate, travels; bodyweight + bands only). Goal: general health + endurance. 30-minute sessions, 3×/week. Keto-ish, lactose intolerant.

### 2.2 Onboarding flow — screen by screen (identical steps on iOS & web)

State machine: `welcome → auth → goals → experience → schedule → location → equipment →
exercise_prefs → exclusions → body_metrics → nutrition_prefs → targets_review → plan_preview → done`.
Progress bar on every screen; every screen has a skip/default path; back never loses data.
Partial state persists after auth (write-through to Supabase after each step; pre-auth steps held
client-side). Each screen lists **[AUTOFILL]** behaviors — all rule-driven, spec in Section 7.

| # | Screen | UI (iOS = SwiftUI, web = same layout in Tailwind) | [AUTOFILL] / smart behavior |
|---|---|---|---|
| 0 | **Welcome** | Value prop, "Get started", "I have an account" | — |
| 1 | **Auth** | Sign in with Apple (iOS), email magic link / OAuth (web) via Supabase Auth | Prefills `display_name` from provider identity |
| 2 | **Goals** | Card grid, pick primary (required) + optional secondary: Strength / Build muscle / Lose fat / Endurance / General health | Selecting a goal pre-seeds defaults for later screens (rep ranges, days/week, calorie adjustment) — shown as "we've tuned your plan for X" |
| 3 | **Experience** | 3 cards: Beginner (<1y consistent), Intermediate (1–3y), Advanced (3y+), with honest descriptions | Default = Beginner. Drives exercise difficulty ceiling & volume defaults |
| 4 | **Schedule** | Days/week stepper (1–7) + weekday chips + session length chips (30/45/60/75/90 min) | Default days/week from goal×experience matrix (§7.2); weekday chips pre-selected to an evenly-spaced pattern (e.g. 3 → Mon/Wed/Fri); session length default 45 (beginner) / 60 |
| 5 | **Training location** | 3 cards: Home / Commercial gym / Minimal (bodyweight & travel) | Selecting a card **bulk-applies an equipment preset** (§7.2.1) on the next screen |
| 6 | **Equipment** | Preset already toggled on; grid of equipment chips grouped by category (Free weights / Machines / Cables / Bodyweight & accessories / Cardio) with icons; type-ahead search box on top | Preset from location; type-ahead over `equipment` (name+slug, trigram); "commercial gym" preset = everything common; toggling "Squat rack" auto-suggests "Barbell + plates" (dependency rules §7.2.1) |
| 7 | **Exercises you enjoy** | Type-ahead multi-select over exercise catalog; below it, 8 suggestion chips | Suggestions = most popular exercises *filterable by their selected equipment* and ≤ their difficulty (RPC `search_exercises` + popularity rank §7.1/7.3); selected items → `user_exercise_preferences(favorite)` |
| 8 | **Exclusions & substitutions** | Two-part: (a) body-area chips "Anything we should protect?" (shoulders, lower back, knees, wrists, hips, neck, elbows); (b) type-ahead "Exercises to avoid" | Picking a body area auto-excludes mapped movement patterns (§7.2.2) and shows which; each excluded exercise immediately shows **top-3 substitutes** (RPC `suggest_substitutes`, filtered to their equipment) — user taps one to pin it as the preferred substitute, or keeps "auto" |
| 9 | **Body metrics** | Height, weight, birthdate, sex; unit toggle | Unit system default from device locale (imperial for US); pickers pre-scrolled to population medians (170 cm/70 kg adjusted by sex); all optional except needed-for-targets note |
| 10 | **Nutrition preferences** | Diet type cards (Omnivore/Vegetarian/Vegan/Pescatarian/Keto/Mediterranean/None-just-track); allergy chips (peanut, tree nut, dairy, gluten, egg, soy, shellfish, fish, sesame); "foods to avoid" type-ahead over foods; meals/day stepper | Diet type auto-applies food-tag exclusion filters (§7.2.3); allergy chips map to food tags; foods type-ahead pre-filtered by diet compatibility; meals/day default 3 |
| 11 | **Targets review** | Shows computed calories + protein/carb/fat with a slider-free "sounds right / adjust" pattern; explanation line ("Mifflin-St Jeor × activity − 20% for fat loss") | Full deterministic macro calc (§7.2.4) via RPC `suggest_nutrition_targets`; editable; edits stored as explicit overrides |
| 12 | **Plan preview** | The generated routine: day cards (e.g. "Day A — Full body") expandable to exercises with sets×reps; every exercise row has a "swap" icon | RPC `generate_starter_routine` (§7.5). Swap opens substitute list (same RPC as screen 8). "Start plan" activates routine, sets `onboarding_completed_at` |

**Completion contract:** after screen 12, the DB must contain: 1 `profiles` row (complete), ≥0
`user_equipment` rows, `user_exercise_preferences` rows, `user_movement_exclusions` rows,
`nutrition_profiles` row with targets, 1 active `routines` tree, and
`profiles.onboarding_completed_at IS NOT NULL`. This is the definition of "profile forms cleanly
and completely" — an RPC `onboarding_status` reports which pieces are missing so clients can
resume an interrupted onboarding at the right screen.

### 2.3 Core post-onboarding flows

- **Today (home tab):** today's workout card (from active routine + weekday mapping) with "Start"; calorie/macro ring (consumed vs target from today's `nutrition_logs`); weight sparkline; streak.
- **Workout player:** one exercise per screen; set list with previous-session values ghosted in as defaults (tap = log same); plate-math helper; rest timer auto-starts on set completion; swap button → substitutes; finishing writes `workout_sessions` + `set_logs`.
- **Log food:** search (recents → favorites → catalog, §7.1); tap result → serving picker (default = `serving_name`/`serving_grams`, quick chips ×0.5/×1/×2) → logged to a meal slot (defaulted by time of day: <10:30 breakfast, <15:00 lunch, <21:00 dinner, else snack).
- **Routine editor:** reorder days/exercises (drag), edit sets/reps/rest, add exercise via search, swap via substitutes, duplicate routine.
- **Progress:** weight & measurement charts, PR list (best e1RM per exercise from `set_logs`), photo timeline.
- **Profile & preferences:** every onboarding answer is editable post-hoc from settings; editing equipment or exclusions offers "re-generate my plan?".

---

## 3. Domain model

Conventions: `uuid` PKs (`gen_random_uuid()`), `created_at/updated_at timestamptz` on all tables
(updated via trigger), snake_case, catalog tables world-readable, user tables RLS-locked.
Two data planes: **Catalog** (curated, seeded, admin-writable only) and **User** (RLS by owner).

### 3.1 Catalog plane

| Entity | Purpose | Key fields |
|---|---|---|
| `equipment` | Machines/tools | slug, name, category (`equipment_category` enum), description, `common_in_home`, `common_in_gym` booleans (drive presets) |
| `muscle_groups` | Coarse groups for UI | slug, name, `region` (upper/lower/core), display_order |
| `muscles` | Anatomical muscles | slug, name (common), latin_name, `muscle_group_id` FK, `is_front` (for body-map UI, adopted from wger) |
| `exercise_categories` | Browse buckets (body-part style, like wger's) | slug, name, display_order |
| `exercises` | The catalog | slug, name, `aliases text[]`, category FK, `movement_pattern` enum, `mechanics` (compound/isolation), `difficulty` enum, `is_unilateral`, `is_bodyweight_ok`, instructions (markdown), video_url, image_path, `tags text[]`, `popularity` 0–100 (search ranking), `is_active` |
| `exercise_muscles` | M2M with role | exercise FK, muscle FK, `role` (primary/secondary) |
| `exercise_equipment` | M2M | exercise FK, equipment FK; **OR-groups** via `alt_group smallint` (equipment in the same group are alternatives — e.g. row with dumbbell OR kettlebell; different groups are all required — e.g. barbell AND flat bench) |
| `exercise_substitutions` | Curated substitution graph (directed) | exercise FK, substitute FK, `similarity` 0–100, reason text |
| `foods` | Curated foods, macros per 100 g | slug, name, brand?, `food_category` enum, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg (all per 100 g), `serving_name`, `serving_grams`, `diet_tags text[]` (e.g. vegan, vegetarian, gluten_free, dairy_free, nut_free, keto_friendly), `allergen_tags text[]` (peanut, tree_nut, dairy, gluten, egg, soy, shellfish, fish, sesame), verified, source |

### 3.2 User plane

| Entity | Purpose | Key fields |
|---|---|---|
| `profiles` | 1:1 with `auth.users` | id (=auth.users.id), display_name, sex, birthdate, height_cm, unit_system, `experience_level`, `primary_goal`, `secondary_goal?`, `training_location`, days_per_week, session_minutes, `preferred_days smallint[]` (0=Mon…6=Sun), onboarding_step (resume pointer), onboarding_completed_at |
| `user_equipment` | Equipment the user has | user, equipment (unique pair) |
| `user_exercise_preferences` | Favorites & exclusions | user, exercise, `preference` (favorite/excluded), `exclusion_reason?` (injury/dislike/no_equipment/other), `preferred_substitute_id?` (pinned sub) |
| `user_movement_exclusions` | Pattern-level exclusions (e.g. no overhead push) | user, `movement_pattern`, reason, `source_body_area?` |
| `nutrition_profiles` | 1:1 nutrition prefs + targets | user, `diet_type`, `allergies text[]` (allergen tag slugs), meals_per_day, kcal_target, protein_g_target, carbs_g_target, fat_g_target, `targets_source` (suggested/custom) |
| `user_food_preferences` | Food favorites/avoids | user, food, preference (favorite/excluded) |
| `routines` | Program container | user, name, description, goal, is_active (≤1 active per user, partial unique index), source (generated/custom), start_date |
| `routine_days` | Ordered days in a routine | routine, day_index, name ("Day A — Push"), focus, `weekday?` (pin to calendar day) |
| `routine_exercises` | Prescription rows (wger's slot+entry+configs, flattened) | routine_day, position, exercise, sets, rep_min, rep_max, `target_rpe?`, rest_seconds, `superset_group?` (same non-null value = superset), notes |
| `workout_sessions` | A performed workout | user, routine_day? (null = freestyle), started_at, completed_at?, notes, `perceived_effort?` 1–10 |
| `set_logs` | A performed set | session, exercise, set_number, reps, weight_kg (numeric(6,2)), `rpe?`, is_warmup, completed_at. History snapshot: `exercise_name_snapshot` |
| `meals` | User-saved meal templates | user, name |
| `meal_items` | Items in a template | meal, food, quantity_g |
| `nutrition_logs` | Food diary rows | user, `logged_on date`, `meal_slot` enum, food? (nullable for quick-add), custom_name?, quantity_g, **snapshots**: kcal, protein_g, carbs_g, fat_g (computed at insert from food × quantity; quick-add fills directly) |
| `body_metrics` | Row per day per user | user, measured_on (unique per user/day), weight_kg?, body_fat_pct?, waist_cm?, chest_cm?, hips_cm?, arm_cm?, thigh_cm?, neck_cm?, notes |
| `progress_photos` | Storage-backed photos | user, taken_on, storage_path (Supabase Storage bucket `progress-photos`, path `{user_id}/…`), pose (front/side/back) |

**Relationships diagram (text):**
`profiles 1—* user_equipment *—1 equipment`; `exercises *—* muscles (role)`, `*—* equipment
(alt_group)`, `*—* exercises (substitutions)`; `routines 1—* routine_days 1—* routine_exercises
*—1 exercises`; `workout_sessions 1—* set_logs`; `foods 1—* nutrition_logs`, `1—* meal_items`;
`profiles 1—1 nutrition_profiles`.

**Extension points (post-MVP, designed-in):** `exercises.tags`/`foods.diet_tags` are open
vocabularies; suggestion RPCs are versioned (`api.v1_*` naming) so an AI implementation can be
swapped behind the same signature; `set_logs`/`nutrition_logs` snapshots make catalog evolution
safe; `source` columns everywhere distinguish generated vs user content.

---

## 4. Postgres schema (Supabase) — initial migrations

Migration files (exact paths; WS-1 owns 0001–0004, WS-6 owns 0005):

```
supabase/migrations/0001_extensions_enums.sql
supabase/migrations/0002_catalog.sql
supabase/migrations/0003_user_tables.sql
supabase/migrations/0004_rls.sql
supabase/migrations/0005_functions.sql      (RPCs — spec in §5.3/§7)
```

### 4.1 `0001_extensions_enums.sql`

```sql
create extension if not exists pg_trgm;
-- pgcrypto (gen_random_uuid) is enabled by default on Supabase

create type goal_type          as enum ('strength','hypertrophy','fat_loss','endurance','general_health');
create type experience_level   as enum ('beginner','intermediate','advanced');
create type training_location  as enum ('home','commercial_gym','minimal');
create type unit_system        as enum ('metric','imperial');
create type sex_type           as enum ('male','female','other','prefer_not_to_say');
create type equipment_category as enum ('free_weights','machines','cables','bodyweight_accessories','cardio','benches_racks');
create type muscle_region      as enum ('upper','lower','core');
create type movement_pattern   as enum ('squat','hinge','lunge','horizontal_push','vertical_push',
                                        'horizontal_pull','vertical_pull','elbow_flexion','elbow_extension',
                                        'shoulder_isolation','core_flexion','core_stability','carry',
                                        'hip_extension_iso','knee_flexion_iso','knee_extension_iso',
                                        'calf_raise','cardio');
create type mechanics_type     as enum ('compound','isolation');
create type difficulty_level   as enum ('beginner','intermediate','advanced');
create type muscle_role        as enum ('primary','secondary');
create type preference_type    as enum ('favorite','excluded');
create type exclusion_reason   as enum ('injury','dislike','no_equipment','other');
create type routine_source     as enum ('generated','custom');
create type food_category      as enum ('protein','grain','vegetable','fruit','dairy','fat_oil',
                                        'legume','nut_seed','beverage','snack','condiment');
create type diet_type          as enum ('omnivore','vegetarian','vegan','pescatarian','keto','mediterranean','none');
create type meal_slot          as enum ('breakfast','lunch','dinner','snack');
create type targets_source     as enum ('suggested','custom');
create type photo_pose         as enum ('front','side','back');

-- shared updated_at trigger
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
```

### 4.2 `0002_catalog.sql`

```sql
create table public.equipment (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  category       equipment_category not null,
  description    text,
  common_in_home boolean not null default false,
  common_in_gym  boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.muscle_groups (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  region        muscle_region not null,
  display_order smallint not null default 0
);

create table public.muscles (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  latin_name      text,
  muscle_group_id uuid not null references public.muscle_groups(id),
  is_front        boolean not null default true
);
create index muscles_group_idx on public.muscles (muscle_group_id);

create table public.exercise_categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  display_order smallint not null default 0
);

create table public.exercises (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  aliases          text[] not null default '{}',
  category_id      uuid not null references public.exercise_categories(id),
  movement_pattern movement_pattern not null,
  mechanics        mechanics_type not null,
  difficulty       difficulty_level not null default 'beginner',
  is_unilateral    boolean not null default false,
  is_bodyweight_ok boolean not null default false, -- performable with zero equipment
  instructions     text,                            -- markdown
  video_url        text,
  image_path       text,                            -- Supabase Storage path in bucket 'exercise-media'
  tags             text[] not null default '{}',
  popularity       smallint not null default 50 check (popularity between 0 and 100),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index exercises_name_trgm_idx  on public.exercises using gin (name gin_trgm_ops);
create index exercises_aliases_idx    on public.exercises using gin (aliases);
create index exercises_tags_idx       on public.exercises using gin (tags);
create index exercises_category_idx   on public.exercises (category_id);
create index exercises_pattern_idx    on public.exercises (movement_pattern);

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_id   uuid not null references public.muscles(id),
  role        muscle_role not null,
  primary key (exercise_id, muscle_id)
);
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_id, role);

-- Equipment requirements. Rows sharing (exercise_id, alt_group) are ALTERNATIVES (any one
-- suffices); distinct alt_groups are ALL required. Exercise with no rows = no equipment needed.
create table public.exercise_equipment (
  exercise_id  uuid not null references public.exercises(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id),
  alt_group    smallint not null default 1,
  primary key (exercise_id, equipment_id)
);
create index exercise_equipment_eq_idx on public.exercise_equipment (equipment_id);

create table public.exercise_substitutions (
  exercise_id   uuid not null references public.exercises(id) on delete cascade,
  substitute_id uuid not null references public.exercises(id) on delete cascade,
  similarity    smallint not null default 80 check (similarity between 0 and 100),
  reason        text,
  primary key (exercise_id, substitute_id),
  check (exercise_id <> substitute_id)
);

create table public.foods (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  brand         text,
  category      food_category not null,
  kcal          numeric(7,2) not null,   -- all per 100 g
  protein_g     numeric(6,2) not null,
  carbs_g       numeric(6,2) not null,
  fat_g         numeric(6,2) not null,
  fiber_g       numeric(6,2) not null default 0,
  sugar_g       numeric(6,2) not null default 0,
  sodium_mg     numeric(8,2) not null default 0,
  serving_name  text not null,           -- "1 large egg"
  serving_grams numeric(7,2) not null,
  diet_tags     text[] not null default '{}',   -- vegan, vegetarian, pescatarian_ok, keto_friendly, gluten_free, dairy_free
  allergen_tags text[] not null default '{}',   -- peanut, tree_nut, dairy, gluten, egg, soy, shellfish, fish, sesame
  verified      boolean not null default true,
  source        text not null default 'fitforge-curated',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index foods_name_trgm_idx on public.foods using gin (name gin_trgm_ops);
create index foods_diet_tags_idx on public.foods using gin (diet_tags);
create index foods_allergen_idx  on public.foods using gin (allergen_tags);

create trigger t_upd_equipment before update on public.equipment  for each row execute function set_updated_at();
create trigger t_upd_exercises before update on public.exercises  for each row execute function set_updated_at();
create trigger t_upd_foods     before update on public.foods      for each row execute function set_updated_at();
```

### 4.3 `0003_user_tables.sql`

```sql
create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  display_name            text,
  sex                     sex_type,
  birthdate               date,
  height_cm               numeric(5,1),
  unit_system             unit_system not null default 'metric',
  experience_level        experience_level,
  primary_goal            goal_type,
  secondary_goal          goal_type,
  training_location       training_location,
  days_per_week           smallint check (days_per_week between 1 and 7),
  session_minutes         smallint check (session_minutes between 15 and 180),
  preferred_days          smallint[] not null default '{}',  -- 0=Mon … 6=Sun
  onboarding_step         text not null default 'goals',     -- resume pointer
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- auto-create profile row on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.user_equipment (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id),
  created_at   timestamptz not null default now(),
  primary key (user_id, equipment_id)
);

create table public.user_exercise_preferences (
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  exercise_id             uuid not null references public.exercises(id),
  preference              preference_type not null,
  exclusion_reason        exclusion_reason,
  preferred_substitute_id uuid references public.exercises(id),
  created_at              timestamptz not null default now(),
  primary key (user_id, exercise_id),
  check (preference = 'excluded' or exclusion_reason is null)
);

create table public.user_movement_exclusions (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  movement_pattern movement_pattern not null,
  reason           exclusion_reason not null default 'injury',
  source_body_area text,             -- 'shoulders','lower_back','knees','wrists','hips','neck','elbows'
  created_at       timestamptz not null default now(),
  primary key (user_id, movement_pattern)
);

create table public.nutrition_profiles (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  diet_type        diet_type not null default 'none',
  allergies        text[] not null default '{}',   -- allergen tag slugs
  meals_per_day    smallint not null default 3 check (meals_per_day between 1 and 6),
  kcal_target      integer,
  protein_g_target integer,
  carbs_g_target   integer,
  fat_g_target     integer,
  targets_source   targets_source not null default 'suggested',
  updated_at       timestamptz not null default now()
);

create table public.user_food_preferences (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  food_id    uuid not null references public.foods(id),
  preference preference_type not null,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

create table public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  goal        goal_type,
  source      routine_source not null default 'custom',
  is_active   boolean not null default false,
  start_date  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index routines_one_active_idx on public.routines (user_id) where is_active;
create index routines_user_idx on public.routines (user_id);

create table public.routine_days (
  id         uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  day_index  smallint not null,
  name       text not null,
  focus      text,
  weekday    smallint check (weekday between 0 and 6),
  unique (routine_id, day_index)
);

create table public.routine_exercises (
  id             uuid primary key default gen_random_uuid(),
  routine_day_id uuid not null references public.routine_days(id) on delete cascade,
  position       smallint not null,
  exercise_id    uuid not null references public.exercises(id),
  sets           smallint not null default 3 check (sets between 1 and 10),
  rep_min        smallint not null default 8,
  rep_max        smallint not null default 12,
  target_rpe     numeric(3,1) check (target_rpe between 1 and 10),
  rest_seconds   smallint not null default 90,
  superset_group smallint,
  notes          text,
  unique (routine_day_id, position),
  check (rep_min <= rep_max)
);
create index routine_exercises_day_idx on public.routine_exercises (routine_day_id);

create table public.workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  routine_day_id   uuid references public.routine_days(id) on delete set null,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  perceived_effort smallint check (perceived_effort between 1 and 10),
  notes            text
);
create index workout_sessions_user_idx on public.workout_sessions (user_id, started_at desc);

create table public.set_logs (
  id                     uuid primary key default gen_random_uuid(),
  session_id             uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id            uuid not null references public.exercises(id),
  exercise_name_snapshot text not null,
  set_number             smallint not null,
  reps                   smallint not null check (reps >= 0),
  weight_kg              numeric(6,2) not null default 0,
  rpe                    numeric(3,1) check (rpe between 1 and 10),
  is_warmup              boolean not null default false,
  completed_at           timestamptz not null default now()
);
create index set_logs_session_idx  on public.set_logs (session_id);
create index set_logs_exercise_idx on public.set_logs (exercise_id, completed_at desc);

create table public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.meal_items (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references public.meals(id) on delete cascade,
  food_id    uuid not null references public.foods(id),
  quantity_g numeric(7,2) not null check (quantity_g > 0)
);

create table public.nutrition_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  logged_on   date not null default (now() at time zone 'utc')::date,
  meal_slot   meal_slot not null,
  food_id     uuid references public.foods(id),
  custom_name text,
  quantity_g  numeric(7,2),
  kcal        numeric(7,1) not null,   -- snapshots, computed at insert
  protein_g   numeric(6,1) not null default 0,
  carbs_g     numeric(6,1) not null default 0,
  fat_g       numeric(6,1) not null default 0,
  created_at  timestamptz not null default now(),
  check (food_id is not null or custom_name is not null)
);
create index nutrition_logs_user_day_idx on public.nutrition_logs (user_id, logged_on);

create table public.body_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  measured_on  date not null default (now() at time zone 'utc')::date,
  weight_kg    numeric(5,2),
  body_fat_pct numeric(4,1),
  waist_cm     numeric(5,1),
  chest_cm     numeric(5,1),
  hips_cm      numeric(5,1),
  arm_cm       numeric(4,1),
  thigh_cm     numeric(4,1),
  neck_cm      numeric(4,1),
  notes        text,
  unique (user_id, measured_on)
);
create index body_metrics_user_idx on public.body_metrics (user_id, measured_on desc);

create table public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  taken_on     date not null default (now() at time zone 'utc')::date,
  pose         photo_pose not null default 'front',
  storage_path text not null,   -- bucket 'progress-photos', path '{user_id}/{uuid}.jpg'
  created_at   timestamptz not null default now()
);

create trigger t_upd_profiles  before update on public.profiles  for each row execute function set_updated_at();
create trigger t_upd_routines  before update on public.routines  for each row execute function set_updated_at();
create trigger t_upd_nutrition before update on public.nutrition_profiles for each row execute function set_updated_at();
```

### 4.4 `0004_rls.sql` — Row Level Security

Pattern A — **catalog tables** (`equipment`, `muscle_groups`, `muscles`, `exercise_categories`,
`exercises`, `exercise_muscles`, `exercise_equipment`, `exercise_substitutions`, `foods`):
enable RLS; one policy `for select to anon, authenticated using (true)`. No insert/update/delete
policies — writes only via `service_role` (seeding, admin), which bypasses RLS.

Pattern B — **user tables**: enable RLS; owner-only for everything.

```sql
-- Pattern A example (repeat for all 9 catalog tables)
alter table public.exercises enable row level security;
create policy "catalog read" on public.exercises for select to anon, authenticated using (true);

-- Pattern B: profiles (PK is the user id)
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- inserts happen via the auth trigger (security definer); no insert policy needed

-- Pattern B: every table with user_id (user_equipment, user_exercise_preferences,
-- user_movement_exclusions, nutrition_profiles, user_food_preferences, routines,
-- workout_sessions, set_logs*, meals, meal_items*, nutrition_logs, body_metrics, progress_photos)
alter table public.routines enable row level security;
create policy "own rows" on public.routines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- * child tables without user_id check ownership through the parent:
alter table public.routine_days enable row level security;
create policy "own via routine" on public.routine_days for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));
-- same pattern: routine_exercises (via routine_days→routines), set_logs (via workout_sessions),
-- meal_items (via meals). nutrition_profiles uses user_id = auth.uid() as its PK check.
```

Storage: buckets `exercise-media` (public read), `progress-photos` (private; storage policies:
`(storage.foldername(name))[1] = auth.uid()::text` for select/insert/delete).

**Grants note:** Supabase default grants suffice; RPCs in 0005 are `security invoker` except
`generate_starter_routine` and `handle_new_user` (`security definer`, `set search_path = public`).

---

## 5. API surface

Both clients use Supabase client libraries (`@supabase/supabase-js`, `supabase-swift`) → same
PostgREST REST API + `/rpc/*`. No custom API server. Edge Functions only where noted.

### 5.1 PostgREST resources (direct table access under RLS)

Reads (catalog): `GET /rest/v1/equipment?order=category,name`,
`GET /rest/v1/exercises?select=*,exercise_muscles(role,muscles(name,slug,muscle_group_id)),exercise_equipment(alt_group,equipment(name,slug))&is_active=eq.true`,
`GET /rest/v1/foods?...` (but prefer search RPCs for type-ahead).

User CRUD (all owner-scoped by RLS — clients never pass other users' ids):
- `profiles`: `PATCH /rest/v1/profiles?id=eq.{uid}` per onboarding step.
- `user_equipment`: bulk replace = `DELETE ...?user_id=eq.{uid}` + batch `POST` (or RPC `set_user_equipment`).
- `user_exercise_preferences`, `user_movement_exclusions`, `user_food_preferences`: upsert via `POST ... Prefer: resolution=merge-duplicates`.
- `nutrition_profiles`: upsert.
- `routines` + nested: create tree client-side or via `generate_starter_routine`; reads use
  `GET /rest/v1/routines?select=*,routine_days(*,routine_exercises(*,exercises(name,slug,image_path)))&is_active=eq.true`.
- `workout_sessions`, `set_logs`, `nutrition_logs`, `body_metrics`, `meals`, `meal_items`, `progress_photos`: plain CRUD.

### 5.2 SQL views (read models, defined in 0005; RLS of underlying tables applies via `security_invoker=true`)

- `v_exercise_full` — exercise + category name + aggregated arrays of primary/secondary muscle slugs + equipment slugs grouped by alt_group. The one-shot read for exercise detail & catalog list.
- `v_daily_nutrition` — per user/day sums of kcal/protein/carbs/fat from `nutrition_logs`.
- `v_exercise_prs` — per user/exercise best e1RM (`weight_kg * (1 + reps/30)`, Epley) and best weight from `set_logs`.

### 5.3 RPCs (Postgres functions exposed at `POST /rest/v1/rpc/{name}`) — the intelligence layer

| RPC | Signature (args → returns) | Purpose / spec ref |
|---|---|---|
| `search_exercises` | `(q text, p_limit int default 10, filter_equipment boolean default false, category_slug text default null)` → setof `(exercise_id, slug, name, matched_alias text, score real)` | Type-ahead. Ranking rules §7.1. When `filter_equipment` and caller authed, restrict to exercises doable with the user's `user_equipment` (alt_group logic) plus `is_bodyweight_ok`. |
| `search_foods` | `(q text, p_limit int default 10, apply_diet_filter boolean default true)` → setof `(food_id, slug, name, brand, kcal, protein_g, serving_name, serving_grams, score real)` | Type-ahead with recents/favorites boost + diet/allergen filtering per §7.1. |
| `suggest_substitutes` | `(p_exercise_id uuid, p_limit int default 5)` → setof `(exercise_id, slug, name, score real, reason text)` | The substitution engine, exact algorithm §7.4. Uses caller's equipment + exclusions. |
| `suggest_nutrition_targets` | `()` → `(kcal int, protein_g int, carbs_g int, fat_g int, method text)` | Deterministic macro calc from caller's profile, §7.2.4. Client shows + user confirms → written to `nutrition_profiles`. |
| `suggest_onboarding_defaults` | `(p_goal goal_type, p_experience experience_level)` → `(days_per_week int, session_minutes int, rep_min int, rep_max int, split_name text)` | Matrix §7.2. Pure function (stable), callable pre-profile. |
| `generate_starter_routine` | `(p_name text default null)` → `uuid` (new routine id) | Builds full routine tree from the caller's completed profile, algorithm §7.5. `security definer`; validates `auth.uid()` internally; deactivates prior active routine. |
| `onboarding_status` | `()` → `(complete boolean, missing text[], resume_step text)` | Completion contract check (§2.2). |
| `set_user_equipment` | `(equipment_slugs text[])` → void | Transactional replace of `user_equipment`. |
| `log_food` | `(p_food_id uuid, p_quantity_g numeric, p_meal_slot meal_slot, p_logged_on date default null)` → uuid | Inserts `nutrition_logs` computing macro snapshots server-side (single source of rounding). |
| `previous_sets` | `(p_exercise_id uuid)` → setof `(set_number, reps, weight_kg, rpe)` | Last completed session's sets for ghost-defaults in the workout player. |

All RPCs: `stable`/`volatile` as appropriate, `to authenticated` (search RPCs also `to anon` for
logged-out browse). **Future-AI seam:** clients call only these RPC names; an AI implementation
must keep the signatures.

### 5.4 Edge Functions

MVP needs **one**: `supabase/functions/delete-account` (POST, verifies JWT, uses service role to
delete `auth.users` row → cascades; required for App Store account-deletion rule). Everything
else is Postgres. (Post-MVP functions would live here: healthkit-sync, barcode-lookup, ai-coach.)

---

## 6. Curated seed data plan

Source of truth: JSON files in `/seed/data/*.json` (owned by WS-2), compiled by
`/seed/generate.ts` into `supabase/seed/seed.sql` (idempotent upserts keyed on `slug`). The lists
below are **the actual starter content** — WS-2 transcribes them verbatim (adding instructions
text and reasonable `popularity` values where marked).

### 6.1 Equipment (30) — `seed/data/equipment.json`

| slug | name | category | home | gym |
|---|---|---|---|---|
| barbell | Barbell | free_weights | y | y |
| ez-curl-bar | EZ-Curl Bar | free_weights | y | y |
| dumbbell | Dumbbells | free_weights | y | y |
| kettlebell | Kettlebell | free_weights | y | y |
| weight-plates | Weight Plates | free_weights | y | y |
| flat-bench | Flat Bench | benches_racks | y | y |
| adjustable-bench | Adjustable Bench | benches_racks | y | y |
| squat-rack | Squat / Power Rack | benches_racks | n | y |
| smith-machine | Smith Machine | machines | n | y |
| cable-machine | Cable Machine / Crossover | cables | n | y |
| lat-pulldown | Lat Pulldown Machine | cables | n | y |
| seated-row-machine | Seated Cable Row | cables | n | y |
| leg-press | Leg Press Machine | machines | n | y |
| hack-squat-machine | Hack Squat Machine | machines | n | y |
| leg-extension-machine | Leg Extension Machine | machines | n | y |
| leg-curl-machine | Leg Curl Machine | machines | n | y |
| chest-press-machine | Chest Press Machine | machines | n | y |
| pec-deck | Pec Deck / Fly Machine | machines | n | y |
| shoulder-press-machine | Shoulder Press Machine | machines | n | y |
| hip-thrust-machine | Hip Thrust / Glute Drive | machines | n | y |
| calf-raise-machine | Calf Raise Machine | machines | n | y |
| pull-up-bar | Pull-up Bar | bodyweight_accessories | y | y |
| dip-station | Dip Station / Parallel Bars | bodyweight_accessories | n | y |
| resistance-bands | Resistance Bands | bodyweight_accessories | y | y |
| suspension-trainer | Suspension Trainer (TRX) | bodyweight_accessories | y | n |
| ab-wheel | Ab Wheel | bodyweight_accessories | y | n |
| medicine-ball | Medicine Ball | bodyweight_accessories | n | y |
| treadmill | Treadmill | cardio | n | y |
| stationary-bike | Stationary Bike | cardio | n | y |
| rowing-machine | Rowing Machine (Erg) | cardio | n | y |

Location presets (§7.2.1) derive from the `home`/`gym` columns.

### 6.2 Muscle groups (7) & muscles (20) — `seed/data/muscles.json`

Groups: `chest` (upper), `back` (upper), `shoulders` (upper), `arms` (upper), `core` (core),
`glutes` (lower), `legs` (lower).

| muscle slug | name | latin_name | group | front |
|---|---|---|---|---|
| pecs | Chest | Pectoralis major | chest | y |
| lats | Lats | Latissimus dorsi | back | n |
| traps | Traps | Trapezius | back | n |
| rhomboids | Mid-back | Rhomboideus | back | n |
| lower-back | Lower Back | Erector spinae | back | n |
| front-delts | Front Delts | Deltoideus anterior | shoulders | y |
| side-delts | Side Delts | Deltoideus lateralis | shoulders | y |
| rear-delts | Rear Delts | Deltoideus posterior | shoulders | n |
| biceps | Biceps | Biceps brachii | arms | y |
| triceps | Triceps | Triceps brachii | arms | n |
| forearms | Forearms | Brachioradialis | arms | y |
| abs | Abs | Rectus abdominis | core | y |
| obliques | Obliques | Obliquus externus | core | y |
| glute-max | Glutes | Gluteus maximus | glutes | n |
| glute-med | Hip Abductors | Gluteus medius | glutes | n |
| quads | Quads | Quadriceps femoris | legs | y |
| hamstrings | Hamstrings | Biceps femoris | legs | n |
| adductors | Inner Thigh | Adductor magnus | legs | y |
| calves | Calves | Gastrocnemius/Soleus | legs | n |
| hip-flexors | Hip Flexors | Iliopsoas | legs | y |

### 6.3 Exercise categories (9) — `seed/data/categories.json`
`chest`, `back`, `shoulders`, `arms`, `legs`, `glutes`, `core`, `cardio`, `full-body`
(display_order in that order).

### 6.4 Exercises (48) — `seed/data/exercises.json`

Columns: pattern, mech (C/I), diff (B/I/A), primary → secondary muscles, equipment
(`|` = alternatives within one alt_group, `+` = additional required group, `—` = none/bodyweight),
`BW` flag = `is_bodyweight_ok`. WS-2 adds 2–4 sentence instructions + popularity (listed) for each.

| slug | name (pattern, mech, diff, pop) | muscles P→S | equipment |
|---|---|---|---|
| barbell-back-squat | Barbell Back Squat (squat, C, I, 95) | quads → glute-max, lower-back, adductors | barbell + weight-plates + squat-rack |
| goblet-squat | Goblet Squat (squat, C, B, 80) | quads → glute-max, abs | dumbbell \| kettlebell |
| front-squat | Barbell Front Squat (squat, C, A, 60) | quads → glute-max, abs | barbell + weight-plates + squat-rack |
| bodyweight-squat | Bodyweight Squat (squat, C, B, 70) | quads → glute-max | — BW |
| leg-press | Leg Press (squat, C, B, 85) | quads → glute-max, adductors | leg-press |
| hack-squat | Hack Squat (squat, C, I, 65) | quads → glute-max | hack-squat-machine |
| bulgarian-split-squat | Bulgarian Split Squat (lunge, C, I, 75, unilateral) | quads → glute-max | dumbbell \| kettlebell, + flat-bench; BW |
| walking-lunge | Walking Lunge (lunge, C, B, 70, unilateral) | quads → glute-max, hamstrings | dumbbell \| —; BW |
| step-up | Step-up (lunge, C, B, 55, unilateral) | quads → glute-max | flat-bench; BW |
| conventional-deadlift | Conventional Deadlift (hinge, C, A, 90) | hamstrings → glute-max, lower-back, traps, forearms | barbell + weight-plates |
| romanian-deadlift | Romanian Deadlift (hinge, C, I, 85) | hamstrings → glute-max, lower-back | barbell \| dumbbell |
| kettlebell-swing | Kettlebell Swing (hinge, C, I, 70) | glute-max → hamstrings, lower-back | kettlebell |
| good-morning | Good Morning (hinge, C, A, 40) | hamstrings → glute-max, lower-back | barbell + squat-rack |
| barbell-hip-thrust | Barbell Hip Thrust (hip_extension_iso, C, I, 85) | glute-max → hamstrings | barbell + weight-plates + flat-bench \| hip-thrust-machine |
| glute-bridge | Glute Bridge (hip_extension_iso, I, B, 65) | glute-max → hamstrings | — BW |
| leg-curl | Lying/Seated Leg Curl (knee_flexion_iso, I, B, 75) | hamstrings → | leg-curl-machine |
| leg-extension | Leg Extension (knee_extension_iso, I, B, 75) | quads → | leg-extension-machine |
| standing-calf-raise | Standing Calf Raise (calf_raise, I, B, 70) | calves → | calf-raise-machine \| dumbbell \| —; BW |
| bench-press | Barbell Bench Press (horizontal_push, C, I, 95) | pecs → front-delts, triceps | barbell + weight-plates + flat-bench |
| dumbbell-bench-press | Dumbbell Bench Press (horizontal_push, C, B, 90) | pecs → front-delts, triceps | dumbbell + flat-bench |
| incline-dumbbell-press | Incline Dumbbell Press (horizontal_push, C, I, 85) | pecs → front-delts, triceps | dumbbell + adjustable-bench |
| push-up | Push-up (horizontal_push, C, B, 90) | pecs → front-delts, triceps, abs | — BW |
| machine-chest-press | Machine Chest Press (horizontal_push, C, B, 75) | pecs → front-delts, triceps | chest-press-machine |
| cable-fly | Cable Fly (horizontal_push, I, I, 70) | pecs → front-delts | cable-machine |
| pec-deck-fly | Pec Deck Fly (horizontal_push, I, B, 65) | pecs → | pec-deck |
| dip | Dip (vertical_push, C, I, 75) | pecs → triceps, front-delts | dip-station |
| overhead-press | Barbell Overhead Press (vertical_push, C, I, 85) | front-delts → side-delts, triceps | barbell + weight-plates |
| seated-dumbbell-shoulder-press | Seated DB Shoulder Press (vertical_push, C, B, 85) | front-delts → side-delts, triceps | dumbbell + adjustable-bench |
| machine-shoulder-press | Machine Shoulder Press (vertical_push, C, B, 60) | front-delts → side-delts, triceps | shoulder-press-machine |
| lateral-raise | Dumbbell Lateral Raise (shoulder_isolation, I, B, 85) | side-delts → | dumbbell \| resistance-bands |
| cable-lateral-raise | Cable Lateral Raise (shoulder_isolation, I, I, 60) | side-delts → | cable-machine |
| face-pull | Face Pull (shoulder_isolation, I, B, 70) | rear-delts → traps, rhomboids | cable-machine \| resistance-bands |
| rear-delt-fly | Rear Delt Fly (shoulder_isolation, I, B, 55) | rear-delts → rhomboids | dumbbell \| pec-deck |
| pull-up | Pull-up (vertical_pull, C, A, 90) | lats → biceps, rhomboids, forearms | pull-up-bar |
| chin-up | Chin-up (vertical_pull, C, I, 80) | lats → biceps | pull-up-bar |
| lat-pulldown | Lat Pulldown (vertical_pull, C, B, 90) | lats → biceps, rhomboids | lat-pulldown |
| band-assisted-pull-up | Band-Assisted Pull-up (vertical_pull, C, B, 55) | lats → biceps | pull-up-bar + resistance-bands |
| barbell-row | Barbell Bent-over Row (horizontal_pull, C, I, 85) | lats → rhomboids, rear-delts, biceps, lower-back | barbell + weight-plates |
| dumbbell-row | One-Arm Dumbbell Row (horizontal_pull, C, B, 85, unilateral) | lats → rhomboids, biceps | dumbbell + flat-bench |
| seated-cable-row | Seated Cable Row (horizontal_pull, C, B, 80) | rhomboids → lats, biceps, rear-delts | seated-row-machine \| cable-machine |
| inverted-row | Inverted Row (horizontal_pull, C, B, 60) | rhomboids → lats, biceps | suspension-trainer \| barbell + squat-rack; BW |
| barbell-curl | Barbell Curl (elbow_flexion, I, B, 80) | biceps → forearms | barbell \| ez-curl-bar |
| dumbbell-curl | Dumbbell Curl (elbow_flexion, I, B, 85) | biceps → forearms | dumbbell |
| hammer-curl | Hammer Curl (elbow_flexion, I, B, 75) | biceps → forearms | dumbbell |
| cable-curl | Cable Curl (elbow_flexion, I, B, 55) | biceps → | cable-machine |
| triceps-pushdown | Triceps Pushdown (elbow_extension, I, B, 85) | triceps → | cable-machine \| resistance-bands |
| skull-crusher | Skull Crusher (elbow_extension, I, I, 70) | triceps → | ez-curl-bar \| dumbbell, + flat-bench |
| overhead-triceps-extension | Overhead Triceps Extension (elbow_extension, I, B, 65) | triceps → | dumbbell \| cable-machine |
| plank | Plank (core_stability, I, B, 85) | abs → obliques, lower-back | — BW |
| dead-bug | Dead Bug (core_stability, I, B, 55) | abs → hip-flexors | — BW |
| hanging-leg-raise | Hanging Leg Raise (core_flexion, I, A, 65) | abs → hip-flexors, obliques | pull-up-bar |
| cable-crunch | Cable Crunch (core_flexion, I, B, 60) | abs → obliques | cable-machine |
| ab-wheel-rollout | Ab Wheel Rollout (core_stability, I, A, 60) | abs → obliques, lats | ab-wheel |
| russian-twist | Russian Twist (core_flexion, I, B, 60) | obliques → abs | medicine-ball \| dumbbell \| —; BW |
| farmers-carry | Farmer's Carry (carry, C, B, 60) | forearms → traps, abs, glute-med | dumbbell \| kettlebell |
| treadmill-run | Treadmill Run (cardio, C, B, 80) | quads → calves, hamstrings | treadmill |
| stationary-bike-ride | Stationary Bike (cardio, C, B, 75) | quads → calves | stationary-bike |
| rowing-erg | Rowing Machine (cardio, C, I, 70) | lats → quads, rhomboids | rowing-machine |
| jump-rope | Jump Rope (cardio, C, B, 60) | calves → quads | — BW |

(That is 58 — comfortably above the 30–50 target; category assignment follows the primary
muscle's group, cardio pattern → `cardio` category, farmers-carry → `full-body`.)

### 6.5 Curated substitutions — `seed/data/substitutions.json`

Directed pairs `exercise → substitute (similarity)`; WS-2 also adds the reverse edge at −5
similarity where sensible. Reason strings follow "Same {pattern/muscle}, uses {equipment}".

```
barbell-back-squat → goblet-squat 85, leg-press 80, hack-squat 80, front-squat 75, bulgarian-split-squat 70, bodyweight-squat 55
bench-press → dumbbell-bench-press 92, machine-chest-press 85, push-up 70, incline-dumbbell-press 70
overhead-press → seated-dumbbell-shoulder-press 90, machine-shoulder-press 82, lateral-raise 45
pull-up → lat-pulldown 90, band-assisted-pull-up 88, chin-up 85, inverted-row 65
lat-pulldown → pull-up 85, band-assisted-pull-up 80, seated-cable-row 60
conventional-deadlift → romanian-deadlift 85, kettlebell-swing 65, good-morning 60, barbell-hip-thrust 55
romanian-deadlift → leg-curl 70, good-morning 70, kettlebell-swing 65, glute-bridge 50
barbell-row → dumbbell-row 90, seated-cable-row 85, inverted-row 70
barbell-hip-thrust → glute-bridge 80, romanian-deadlift 60
leg-press → hack-squat 85, goblet-squat 75, bulgarian-split-squat 65
leg-curl → romanian-deadlift 75, glute-bridge 45
leg-extension → bulgarian-split-squat 60, step-up 55, bodyweight-squat 50
dip → bench-press 65, push-up 65, triceps-pushdown 55
barbell-curl → dumbbell-curl 92, cable-curl 85, hammer-curl 80
triceps-pushdown → overhead-triceps-extension 85, skull-crusher 80
skull-crusher → overhead-triceps-extension 85, triceps-pushdown 80
lateral-raise → cable-lateral-raise 90, machine-shoulder-press 45
face-pull → rear-delt-fly 85
cable-fly → pec-deck-fly 90, dumbbell-bench-press 60, push-up 50
plank → dead-bug 80, ab-wheel-rollout 60
hanging-leg-raise → cable-crunch 75, russian-twist 55, dead-bug 55
treadmill-run → stationary-bike-ride 75, rowing-erg 70, jump-rope 65
kettlebell-swing → romanian-deadlift 70, conventional-deadlift 55
dumbbell-bench-press → machine-chest-press 85, push-up 72, bench-press 90
seated-cable-row → dumbbell-row 85, barbell-row 80, inverted-row 70
```

### 6.6 Foods (32) with macros per 100 g — `seed/data/foods.json`

diet_tags key: V=vegan, VG=vegetarian, P=pescatarian_ok, K=keto_friendly, GF=gluten_free, DF=dairy_free.
(vegan ⇒ also vegetarian+pescatarian_ok tags; WS-2 expands.) allergen_tags in parens.

| slug | name (category) | kcal | P | C | F | fiber | serving |
|---|---|---|---|---|---|---|---|
| chicken-breast | Chicken Breast, cooked (protein) | 165 | 31 | 0 | 3.6 | 0 | 1 breast · 120 g — GF DF K |
| salmon | Atlantic Salmon, cooked (protein) | 208 | 20 | 0 | 13 | 0 | 1 fillet · 150 g — P GF DF K (fish) |
| ground-beef-90 | Ground Beef 90/10, cooked (protein) | 217 | 26 | 0 | 12 | 0 | 100 g — GF DF K |
| egg | Whole Egg (protein) | 143 | 12.6 | 0.7 | 9.5 | 0 | 1 large · 50 g — VG GF DF K (egg) |
| egg-white | Egg Whites (protein) | 52 | 10.9 | 0.7 | 0.2 | 0 | 3 tbsp · 46 g — VG GF DF (egg) |
| shrimp | Shrimp, cooked (protein) | 99 | 24 | 0.2 | 0.3 | 0 | 6 large · 85 g — P GF DF K (shellfish) |
| tofu-firm | Firm Tofu (protein) | 144 | 17 | 3 | 8 | 2 | ½ block · 126 g — V GF DF K (soy) |
| whey-protein | Whey Protein Powder (protein) | 375 | 75 | 12.5 | 6 | 0 | 1 scoop · 32 g — VG GF (dairy) |
| greek-yogurt-nonfat | Greek Yogurt, nonfat (dairy) | 59 | 10.3 | 3.6 | 0.4 | 0 | 1 cup · 170 g — VG GF (dairy) |
| cottage-cheese-2 | Cottage Cheese 2% (dairy) | 84 | 11 | 4.3 | 2.3 | 0 | ½ cup · 113 g — VG GF K (dairy) |
| cheddar | Cheddar Cheese (dairy) | 403 | 23 | 3.1 | 33 | 0 | 1 slice · 28 g — VG GF K (dairy) |
| milk-2 | Milk 2% (dairy) | 50 | 3.4 | 4.9 | 2 | 0 | 1 cup · 244 g — VG GF (dairy) |
| white-rice | White Rice, cooked (grain) | 130 | 2.7 | 28 | 0.3 | 0.4 | 1 cup · 158 g — V GF DF |
| brown-rice | Brown Rice, cooked (grain) | 112 | 2.3 | 24 | 0.8 | 1.8 | 1 cup · 195 g — V GF DF |
| oats | Rolled Oats, dry (grain) | 379 | 13.2 | 67.7 | 6.5 | 10.1 | ½ cup · 40 g — V VG DF (gluten†) |
| quinoa | Quinoa, cooked (grain) | 120 | 4.4 | 21.3 | 1.9 | 2.8 | 1 cup · 185 g — V GF DF |
| whole-wheat-bread | Whole Wheat Bread (grain) | 247 | 13 | 41 | 3.4 | 7 | 1 slice · 43 g — V DF (gluten) |
| pasta | Pasta, cooked (grain) | 158 | 5.8 | 31 | 0.9 | 1.8 | 1 cup · 140 g — V DF (gluten) |
| sweet-potato | Sweet Potato, baked (vegetable) | 90 | 2 | 20.7 | 0.2 | 3.3 | 1 medium · 130 g — V GF DF |
| potato | Potato, baked (vegetable) | 93 | 2.5 | 21.2 | 0.1 | 2.2 | 1 medium · 173 g — V GF DF |
| broccoli | Broccoli, cooked (vegetable) | 35 | 2.4 | 7.2 | 0.4 | 3.3 | 1 cup · 156 g — V GF DF K |
| spinach | Spinach, raw (vegetable) | 23 | 2.9 | 3.6 | 0.4 | 2.2 | 2 cups · 60 g — V GF DF K |
| banana | Banana (fruit) | 89 | 1.1 | 22.8 | 0.3 | 2.6 | 1 medium · 118 g — V GF DF |
| apple | Apple (fruit) | 52 | 0.3 | 13.8 | 0.2 | 2.4 | 1 medium · 182 g — V GF DF |
| blueberries | Blueberries (fruit) | 57 | 0.7 | 14.5 | 0.3 | 2.4 | 1 cup · 148 g — V GF DF |
| avocado | Avocado (fat_oil) | 160 | 2 | 8.5 | 14.7 | 6.7 | ½ fruit · 100 g — V GF DF K |
| olive-oil | Olive Oil (fat_oil) | 884 | 0 | 0 | 100 | 0 | 1 tbsp · 13.5 g — V GF DF K |
| almonds | Almonds (nut_seed) | 579 | 21.2 | 21.6 | 49.9 | 12.5 | ¼ cup · 35 g — V GF DF K (tree_nut) |
| peanut-butter | Peanut Butter (nut_seed) | 588 | 25 | 20 | 50 | 6 | 2 tbsp · 32 g — V GF DF K (peanut) |
| lentils | Lentils, cooked (legume) | 116 | 9 | 20.1 | 0.4 | 7.9 | 1 cup · 198 g — V GF DF |
| black-beans | Black Beans, cooked (legume) | 132 | 8.9 | 23.7 | 0.5 | 8.7 | 1 cup · 172 g — V GF DF |
| chickpeas | Chickpeas, cooked (legume) | 164 | 8.9 | 27.4 | 2.6 | 7.6 | 1 cup · 164 g — V GF DF |

† oats: tag `gluten` allergen (cross-contamination convention) but keep `gluten_free` off.

### 6.7 Seed pipeline

`seed/generate.ts` (Node/TS, no deps beyond `tsx`): reads JSONs, validates against zod schemas in
`packages/shared` (referential integrity of slugs, alt_group sanity, macro sanity: |kcal −
(4P+4C+9F)| ≤ 15%), emits `supabase/seed/seed.sql` as `insert ... on conflict (slug) do update`.
Applied via `supabase db reset` (config points `db.seed.sql_paths` at it) or `psql -f`.

---

## 7. Onboarding autofill / prediction rules (deterministic spec)

All implemented in SQL (`0005_functions.sql`, WS-6) and mirrored as pure TS functions in
`packages/shared/src/rules/` (WS-3) for instant client-side previews. **SQL is authoritative**;
the TS mirror must be test-verified against the same fixture table (`packages/shared` ships
fixtures both test suites consume).

### 7.1 Type-ahead search ranking

Applies to `search_exercises` and `search_foods`. Given query `q` (trimmed, lowercased, min 2 chars):

```
score = 100 * exact-name match
      +  60 * name prefix match            (name ILIKE q || '%')
      +  50 * alias exact/prefix match
      +  40 * word-boundary match          (name ~* '\m' || q)
      +  30 * similarity(name, q)          (pg_trgm, only if > 0.25)
      + popularity * 0.2                   (exercises) | verified ? 5 : 0 (foods)
      + 15 if row is in caller's favorites (user_exercise_preferences / user_food_preferences)
      + 10 if logged by caller in last 14 days (foods only: recents boost)
      - 1000 if excluded by caller         (i.e. filtered out entirely)
order by score desc, name asc limit p_limit
```

Filters: exercises — `is_active`, optional category, optional equipment-feasibility (see 7.4
step 1 for the alt_group feasibility predicate); foods — `is_active`, and when
`apply_diet_filter`: drop rows whose `allergen_tags && nutrition_profiles.allergies`, and apply
diet-type predicate (7.2.3). Client behavior: debounce 150 ms, cancel stale requests, show top 8,
show "recents" (client-cached) instantly at 0–1 chars.

### 7.2 Smart defaults

#### 7.2.1 Equipment presets & dependency nudges
- Location `home` → preselect all equipment with `common_in_home = true`.
- `commercial_gym` → preselect all with `common_in_gym = true`.
- `minimal` → preselect: `resistance-bands`, `pull-up-bar` off by default but suggested; nothing else (bodyweight exercises need no rows).
- Dependency rules (fire as one-tap suggestion chips, never silent): `squat-rack|flat-bench|adjustable-bench ⇒ suggest barbell + weight-plates`; `barbell ⇒ suggest weight-plates + flat-bench`; `lat-pulldown|seated-row-machine ⇒ suggest cable-machine`.

#### 7.2.2 Body-area → movement-pattern exclusion map (screen 8a)
| Body area chip | Excluded patterns (rows in `user_movement_exclusions`) |
|---|---|
| shoulders | vertical_push, shoulder_isolation† |
| lower_back | hinge, squat‡ |
| knees | lunge, knee_extension_iso, squat‡ |
| wrists | elbow_extension†, horizontal_push† |
| elbows | elbow_flexion, elbow_extension |
| hips | hinge, lunge |
| neck | vertical_pull† |
† = soft exclusion: shown pre-checked but individually un-checkable in an expander ("we'll avoid
these — tap to keep any"). ‡ = also soft. Hard rows are written with reason 'injury'; soft rows
only if the user leaves them checked. Routine generation (7.5) and substitution (7.4) treat all
stored rows identically.

#### 7.2.3 Diet-type → food predicate
`vegan`: require `'vegan' = any(diet_tags)`. `vegetarian`: `'vegetarian' = any(diet_tags)` or vegan.
`pescatarian`: vegetarian ∪ `'pescatarian_ok'`. `keto`: `'keto_friendly' = any(diet_tags)`
(soft filter — deprioritize others by −50 score rather than hide). `mediterranean`: soft −20 on
category in (snack) and processed flag; MVP: no hard filter. `omnivore`/`none`: no filter.
Allergies always hard-filter (`allergen_tags && allergies` ⇒ hidden).

#### 7.2.4 Nutrition targets (`suggest_nutrition_targets`)
Deterministic, explainable:
1. BMR (Mifflin-St Jeor): male `10w + 6.25h − 5·age + 5`; female `−161`; other/unspecified: mean of both. w kg (latest `body_metrics.weight_kg`, fallback: sex-median 82/70), h cm (`height_cm`, fallback 175/162), age from birthdate (fallback 30).
2. TDEE = BMR × activity factor from days_per_week: ≤2 → 1.35, 3–4 → 1.5, 5+ → 1.65.
3. Goal adjustment: fat_loss −20%, strength/hypertrophy +8%, endurance +5%, general_health 0. Clamp to ≥ 1200 (female/other) / 1500 (male).
4. Protein: fat_loss/strength/hypertrophy 1.8 g/kg; endurance 1.4; general 1.6 (cap 220 g). Fat: 30% kcal (keto diet_type: 65% kcal, protein 1.6 g/kg). Carbs: remainder (`(kcal − 4P − 9F)/4`, floor 0). Round: kcal→nearest 50, macros→nearest 5.
5. Return `method` text, e.g. `"Mifflin-St Jeor × 1.5 − 20% (fat loss)"`.

#### 7.2.5 Schedule & prescription defaults (`suggest_onboarding_defaults`)
| goal \ experience | beginner | intermediate | advanced |
|---|---|---|---|
| strength | 3d·45m·3–6 reps* | 4d·60m·3–6 | 4d·75m·3–6 |
| hypertrophy | 3d·45m·8–12 | 4d·60m·8–12 | 5d·75m·6–12 |
| fat_loss | 3d·45m·10–15 | 4d·45m·10–15 | 5d·60m·10–15 |
| endurance | 3d·30m·15–20 | 4d·45m·15–20 | 5d·45m·15–20 |
| general_health | 3d·45m·8–12 | 3d·45m·8–12 | 4d·60m·8–12 |
\* beginners on strength still get 5-rep-floor (rep_min 5) for safety. Rest defaults: strength
180 s compounds / 120 isolation; hypertrophy 90/60; fat_loss & endurance 60/45; general 90/60.
Split by final days_per_week: 1–2 → Full Body (A/B); 3 → Full Body A/B/C; 4 → Upper/Lower ×2;
5 → Upper/Lower/Push/Pull/Legs; 6–7 → Push/Pull/Legs ×2 (day 7 rest/cardio).

### 7.3 Suggestion chips (screen 7)
`search_exercises('', filter_equipment=true)` variant: top 8 by popularity among feasible
exercises with difficulty ≤ user's experience level, at most 2 per muscle_group, always ≥1 from
each of {squat/hinge, push, pull} if feasible.

### 7.4 Exercise substitution algorithm (`suggest_substitutes`) — THE core rule

Inputs: `p_exercise_id` (the exercise to replace), caller's `user_equipment`,
`user_exercise_preferences`, `user_movement_exclusions`, `profiles.experience_level`.

```
Step 0  Load target exercise T (pattern, mechanics, difficulty, primary muscles PM, secondary SM).
Step 1  Candidate pool C = active exercises ≠ T where FEASIBLE(candidate):
          feasible ⇔ is_bodyweight_ok
                     OR for EVERY alt_group g of the candidate:
                        EXISTS equipment e in g owned by user (user_equipment)
          (users with zero user_equipment rows and location='commercial_gym' ⇒ treat all
           equipment as owned; location null ⇒ same, so logged-out demo works)
Step 2  Remove candidates that are user-excluded (preference='excluded') or whose
        movement_pattern ∈ user_movement_exclusions.
Step 3  If user pinned preferred_substitute_id for T and it survives steps 1–2:
        return it first with score 1000, reason 'You chose this substitute'.
Step 4  Score each candidate c:
          s  = 50 * curated       -- exercise_substitutions row T→c exists:
                                  --   s += similarity (0–100) instead of flat 50
          s += 30 * |PM(T) ∩ PM(c)| / |PM(T)|          -- primary-muscle overlap
          s += 10 * |SM(T) ∩ (PM(c) ∪ SM(c))| / max(1,|SM(T)|)
          s += 25 if c.movement_pattern = T.pattern
          s += 10 if c.mechanics = T.mechanics
          s -= 15 * difficulty_distance(c, user.experience) if c.difficulty > experience
          s += 10 if c is user favorite
          s += c.popularity * 0.05
Step 5  Drop s < 20. Order by s desc, popularity desc. Limit p_limit (default 5).
Step 6  reason := curated row's reason if present, else generated:
        'Targets {primary muscle names}' + (pattern match ? ', same movement pattern' : '')
        + (bodyweight ? ', no equipment needed' : ', uses {owned equipment names}').
```
Determinism: ties broken by `name asc`. This exact function also powers the swap button in the
workout player and routine editor.

### 7.5 Starter routine generation (`generate_starter_routine`)

```
1. Read profile (goal, experience, days_per_week D, session_minutes, preferred_days) +
   defaults matrix (7.2.5) → split template, rep range, rest rules.
2. Split templates are ordered lists of ROLE SLOTS, e.g. Full Body A =
   [squat, horizontal_push, horizontal_pull, hinge, core_stability]
   Upper = [horizontal_push, horizontal_pull, vertical_push, vertical_pull,
            elbow_flexion, elbow_extension]
   Lower = [squat, hinge, lunge, knee_flexion_iso|hip_extension_iso, calf_raise, core_*]
   Push = [horizontal_push, vertical_push, horizontal_push(iso), elbow_extension, shoulder_isolation]
   Pull = [vertical_pull, horizontal_pull, shoulder_isolation(rear), elbow_flexion, carry|core]
   Legs = [squat, hinge, lunge, knee_extension_iso|knee_flexion_iso, calf_raise, core]
   Exact templates per D are enumerated in packages/shared/src/rules/splits.ts and mirrored in SQL.
3. Session-length trim: 30 min → first 4 slots; 45 → 5; 60 → 6; 75+ → all (+1 optional).
4. For each role slot, pick the exercise maximizing:
   popularity*0.4 + 30*favorite + 20*(difficulty ≤ experience) subject to:
   FEASIBLE (7.4 step 1), not excluded (7.4 step 2), pattern = slot pattern,
   not already used in this routine week, primary muscle_group not hit as primary
   in the same day twice unless split is PPL/UL.
   If a slot has no feasible exercise: call the substitution scorer with a synthetic target
   (pattern + representative muscle) and take the best; if still empty, drop the slot.
5. Prescription: compounds get sets = 3 (beginner) / 4 (int/adv); isolations 3;
   rep_min/rep_max & rest from matrix; target_rpe = 7 (beginner 8 fixed reps, no RPE shown).
6. Insert routines (source='generated', is_active=true, name from split, goal), routine_days
   (weekday from preferred_days in order), routine_exercises. Deactivate previous active routine.
   Return routine id.
```

---

## 8. Monorepo structure

```
fitforge/
├── README.md                  LICENSE (CC BY-SA 4.0)   CONTRIBUTING.md
├── package.json               # npm workspaces: apps/web, packages/*, seed
├── turbo.json                 # turborepo pipeline: lint, typecheck, test, build
├── .github/workflows/ci.yml   # web+shared+seed jobs; ios job (build only)
├── .env.example               # SUPABASE_URL, SUPABASE_ANON_KEY
├── apps/
│   ├── web/                   # Next.js App Router + TS + Tailwind (WS-4/WS-5)
│   │   ├── app/
│   │   │   ├── (marketing)/page.tsx            # landing
│   │   │   ├── (auth)/login/page.tsx  auth/callback/route.ts
│   │   │   ├── onboarding/[step]/page.tsx      # steps §2.2  (WS-4)
│   │   │   └── (app)/                          # authed shell (WS-5)
│   │   │       ├── today/  workout/[sessionId]/  routines/  routines/[id]/
│   │   │       ├── nutrition/  progress/  exercises/  exercises/[slug]/  settings/
│   │   ├── components/ui/                      # design system primitives (WS-4)
│   │   ├── components/onboarding/              # (WS-4)
│   │   ├── components/features/                # (WS-5)
│   │   ├── lib/supabase/{client,server,middleware}.ts   (WS-4)
│   │   └── middleware.ts  tailwind.config.ts  next.config.mjs
│   └── ios/                   # native SwiftUI app (WS-8 owns all of apps/ios)
│       └── FitForge/
│           ├── FitForge.xcodeproj  (XcodeGen project.yml preferred)
│           ├── App/           FitForgeApp.swift  RootView.swift  Theme/
│           ├── Core/          SupabaseClient+.swift  Models/ (Codable mirrors)  Repositories/
│           ├── Features/      Onboarding/  Today/  Workout/  Routines/  Nutrition/  Progress/  Settings/
│           └── Tests/
├── packages/
│   └── shared/                # (WS-3) TS: types, zod schemas, rules mirror, api helpers
│       ├── src/types/database.ts        # generated: supabase gen types typescript
│       ├── src/schemas/*.ts             # zod: seed-data + form schemas
│       ├── src/rules/{search,defaults,macros,substitution,splits}.ts
│       ├── src/fixtures/*.json          # shared test fixtures (rules parity)
│       └── src/api/rpc.ts               # typed RPC wrappers
├── supabase/
│   ├── config.toml
│   ├── migrations/0001…0004  (WS-1)   0005_functions.sql (WS-6)
│   ├── seed/seed.sql          # generated artifact (WS-2)
│   ├── functions/delete-account/index.ts        (WS-6)
│   └── tests/                 # pgTAP: 0001-0004 tests (WS-1), rpc tests (WS-6)
├── seed/                      # (WS-2) data JSONs + generate.ts + validate script
│   ├── data/{equipment,muscles,categories,exercises,substitutions,foods}.json
│   └── generate.ts
└── docs/                      # (WS-7) architecture.md, api.md, onboarding-spec.md, decisions/
```

---

## 9. BUILD FLEET WORK BREAKDOWN — 8 independent workstreams

Rules of engagement for the fleet:
- Each workstream owns a **disjoint path set** (listed under "Owns"); never write outside it.
  Root `package.json`/`turbo.json`/CI are owned by WS-7 only.
- **This blueprint is the interface contract.** All slugs, enum values, table/RPC names, and the
  directory tree above are frozen. If two workstreams need a change, it goes through the
  integrator (WS-7) as a blueprint amendment — not ad-hoc edits.
- Every workstream vendors nothing from another workstream's tree at build time except
  `packages/shared` (published via workspace) and the DB contract (this doc §4–§5).
- Definition of done for each WS includes: compiles/passes its own tests in isolation, plus a
  `docs/handoff/<ws>.md`-style note **in its final report** (not a file) listing anything the
  integrator must verify.

### WS-1 · Database Core ("schema")
**Owns:** `supabase/config.toml`, `supabase/migrations/0001_extensions_enums.sql`,
`0002_catalog.sql`, `0003_user_tables.sql`, `0004_rls.sql`, `supabase/tests/schema/*.sql`.
**Build:** transcribe §4.1–§4.4 into runnable migrations (complete the "repeat for all tables"
elisions — every catalog table gets Pattern A, every user table Pattern B including the
parent-join variants for `routine_days`, `routine_exercises`, `set_logs`, `meal_items`).
`config.toml`: project defaults + `[db.seed] sql_paths = ["./seed/seed.sql"]` + storage buckets
`exercise-media` (public) and `progress-photos` (private) with the §4.4 storage policies in
0004. pgTAP tests: tables exist, RLS enabled everywhere, anon can select catalog but not user
tables, authenticated user A cannot read user B's `routines`/`set_logs` (use
`tests.create_supabase_user` helpers). **Done when:** `supabase db reset` runs clean on a fresh
local stack and pgTAP passes.

### WS-2 · Seed Content ("content")
**Owns:** `seed/**` and `supabase/seed/seed.sql` (generated).
**Build:** transcribe §6.1–§6.6 into the six JSON files exactly (slugs verbatim); author 2–4
sentence instruction text per exercise (plain, coaching tone, no medical claims) and fill
popularity from the table; expand diet-tag shorthand; add reverse substitution edges per §6.5
note; write `seed/generate.ts` per §6.7 (validate → emit idempotent upsert SQL that resolves
slug FKs via CTE lookups, in dependency order: groups → muscles → categories → equipment →
exercises → exercise_muscles/equipment/substitutions → foods). Include `npm run seed:check`
(validation only) and unit tests for the validator (macro-consistency check must catch a bad
fixture). **Done when:** generated `seed.sql` applies cleanly on WS-1's schema (verify against
§4 DDL as written here — do not wait for WS-1) and `seed:check` passes.

### WS-3 · Shared Package ("shared")
**Owns:** `packages/shared/**`.
**Build:** `src/types/database.ts` — hand-write the TS Database type matching §4 exactly (mark
with a header: "regenerate with `supabase gen types` post-integration"); zod schemas for the six
seed JSONs (imported by WS-2's validator — publish under `@fitforge/shared/schemas`) and for all
onboarding form steps; **pure-TS mirrors of every §7 rule**: `search.ts` (score function only),
`defaults.ts` (7.2.1/7.2.2/7.2.5 matrices as typed consts), `macros.ts` (7.2.4),
`substitution.ts` (7.4 scoring given in-memory catalog), `splits.ts` (7.5 templates); fixtures in
`src/fixtures/` covering: P1/P2/P3 personas' expected targets, 10 substitution cases (e.g.
bench-press with home-dumbbell equipment → dumbbell-bench-press top), defaults matrix spot
checks — with vitest tests. `src/api/rpc.ts`: typed wrappers for every §5.3 RPC name.
**Done when:** `npm -w packages/shared test` green; package builds ESM+types.

### WS-4 · Web Foundation & Onboarding ("web-onboarding")
**Owns:** `apps/web/**` EXCEPT `apps/web/app/(app)/**` and `apps/web/components/features/**`.
**Build:** Next.js 15 App Router scaffold (TS strict, Tailwind 4, `@fitforge/shared` workspace
dep); Supabase SSR auth (`lib/supabase/{client,server,middleware}.ts`, `middleware.ts` guarding
`(app)` and `onboarding`); design system in `components/ui/` (Button, Card, Chip,
SelectableCardGrid, Stepper, SearchInput-with-typeahead, ProgressBar, Sheet, MacroRing, tokens:
neutral surface + one accent, dark-mode via `prefers-color-scheme`, mobile-first ≤430 px design
targets); marketing landing; login (magic link + Google OAuth); and the **full 13-screen
onboarding** per §2.2 under `app/onboarding/[step]/`, wired to: client-side rule previews from
`@fitforge/shared` for instant feedback + authoritative RPCs (§5.3) on commit, write-through
persistence per step (`profiles.onboarding_step`), resume via `onboarding_status`, finishing with
`generate_starter_routine` + redirect to `/today` (route may 404 until WS-5 merges — acceptable,
note in report). Type-ahead UX per §7.1 client behavior. Playwright smoke: complete onboarding
as persona P1 against a mocked Supabase (MSW) asserting the exact writes.
**Done when:** `next build` clean; smoke test green.

### WS-5 · Web App Features ("web-app")
**Owns:** `apps/web/app/(app)/**`, `apps/web/components/features/**`.
**Build:** the authed shell (bottom tab bar on mobile / sidebar ≥md: Today, Workouts, Nutrition,
Progress, Settings) and pages per §2.3: `/today` (today's routine day via weekday mapping,
`v_daily_nutrition` macro ring, weight sparkline); workout player `workout/[sessionId]`
(per-exercise pager, `previous_sets` ghost defaults, rest timer, swap via `suggest_substitutes`,
finish → session summary); `/routines` + `[id]` editor (§2.3); `/nutrition` (day view by
meal_slot, `search_foods` type-ahead, `log_food`, quick-add, meal templates); `/progress`
(charts — use a single lightweight chart lib or inline SVG; `v_exercise_prs` PR list; photo grid
uploading to `progress-photos` bucket); `/exercises` catalog browse (`v_exercise_full`, filters:
category/equipment/muscle) + detail with substitutes; `/settings` (edit every onboarding answer;
equipment/exclusion edits prompt regenerate). Import UI primitives ONLY from
`apps/web/components/ui` (WS-4's contract above — build against the names/props listed there; if
WS-4 isn't merged yet, stub the six primitives in `components/features/_stubs/` marked
`// INTEGRATION: delete, use components/ui` so the integrator swaps imports).
**Done when:** all routes compile & render with mocked data; no imports outside owned paths
except `components/ui` names from WS-4's list and `@fitforge/shared`.

### WS-6 · Database Intelligence ("rpcs")
**Owns:** `supabase/migrations/0005_functions.sql`, `supabase/functions/**`,
`supabase/tests/rpc/*.sql`.
**Build:** implement §5.2 views and every §5.3 RPC exactly per §7 specs (search ranking 7.1,
defaults 7.2, substitutes 7.4, generation 7.5, `log_food`, `previous_sets`, `onboarding_status`,
`set_user_equipment`), with stated security modes and grants (`grant execute ... to
authenticated`, search RPCs also `to anon`); the `delete-account` Edge Function (§5.4). pgTAP
tests seeded with a minimal inline fixture (do NOT depend on WS-2): craft ~10 exercises/5 foods
in-test; assert the §7.4 worked example (bench-press excluded, equipment = dumbbell+flat-bench ⇒
top substitute dumbbell-bench-press), targets math for personas P1–P3 (§7.2.4 expected numbers
must match WS-3's fixtures — both derive from this doc), and that `generate_starter_routine`
yields D days, feasible & non-excluded exercises only. Write against §4 DDL as printed here.
**Done when:** functions apply on a fresh stack after 0001–0004 (as specced) and pgTAP green.

### WS-8 · iOS App ("ios")
**Owns:** `apps/ios/**`.
**Build:** SwiftUI app (iOS 17+, XcodeGen `project.yml` so the project file is reviewable),
`supabase-swift` package; `Core/Models` Codable structs mirroring §4 tables + §5.3 RPC payloads
(single source: this doc); `Core/Repositories` (protocol + live Supabase impl + preview mocks);
Sign in with Apple via Supabase; **full onboarding flow** per §2.2 (native: paged
NavigationStack, chips as capsule toggles, wheel pickers pre-scrolled per §2.2 screen 9, haptics
on selection, debounced type-ahead per §7.1 calling RPCs); main app: TabView (Today, Workouts,
Nutrition, Progress, Settings) implementing §2.3 flows incl. workout player with rest-timer Live
Activity-ready structure (timer local notification is enough for MVP), food logging, charts via
Swift Charts, photo upload to `progress-photos`. Unit tests for repository decoding against JSON
fixtures copied from §4/§5 shapes; snapshot-free UI previews for every screen.
**Done when:** `xcodebuild -scheme FitForge build test` passes (CI job builds simulator only).

### WS-7 · Integrator, Docs & Repo Glue ("glue")
**Owns:** repo root files (`README.md`, `LICENSE`, `CONTRIBUTING.md`, `package.json`,
`turbo.json`, `.env.example`, `.gitignore`), `.github/**`, `docs/**`.
**Build:** root npm-workspaces + turbo config wiring the other trees (declare workspaces even
before they merge); CI: jobs `shared` (test), `web` (lint+build), `seed` (seed:check), `db`
(supabase start + db reset + pgTAP), `ios` (macOS runner, build); `LICENSE` = CC BY-SA 4.0 full
text + note that CC licenses are unusual for code and dependencies keep their own licenses;
README (quickstart: `supabase start` → `db reset` → `npm dev`); `docs/architecture.md` (condensed
§1/§3/§5), `docs/onboarding-spec.md` (§2.2+§7 verbatim), `docs/api.md` (§5), `docs/decisions/`
ADRs (0001 supabase-as-backend, 0002 deterministic-rules-not-llm, 0003 flattened-prescriptions
vs wger config tables, 0004 snapshot-on-log). **Integration phase (after fleet merges):** swap
WS-5 stubs → WS-4 primitives, run `supabase gen types typescript` to replace WS-3's hand-written
`database.ts`, run full stack locally, execute the §2.2 completion contract end-to-end as
persona P2 (exclusion + substitution path), and reconcile any drift against this blueprint.

### Dependency & parallelism map
All eight start in parallel from this document (no code dependencies — every contract needed is
printed here). Soft ordering for integration only: WS-1 → (WS-2, WS-6) → full-stack smoke;
WS-3 → (WS-4, WS-5) import swap; WS-7 last. File-ownership matrix is disjoint by construction —
the only shared touchpoints are read-only: `@fitforge/shared` exports (WS-3's published names)
and `components/ui` prop contracts (frozen in WS-4's spec above).

---

*End of blueprint. Version 1.0. Amendments only via the integrator (WS-7).*
