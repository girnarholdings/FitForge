# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## What it is

FitForge — a personal-trainer and nutrition web app that generates a real training plan from
onboarding answers (goal, experience, schedule, equipment, exercise likes/dislikes, protected body
areas), then runs the athlete's whole loop: today's workout with per-set prescriptions, a morning
readiness check-in that adapts the day (AI-assisted via a Cloudflare Worker), conversational food
logging against a 509-food curated catalog with real portion math, weekly muscle-volume analytics
against evidence-based landmarks, and progress tracking (strength PRs, body weight, muscle heatmap).

Live at https://goforge.fit (static Next.js 15 export on GitHub Pages). Coach AI runs on a
Cloudflare Worker (Mistral primary, Workers AI fallback, DeepSeek pro tier gated by Firebase auth).

## Primary user and job

A committed gym-goer (novice through advanced) on their PHONE — in the gym between sets, in the
kitchen logging a meal, on the sofa planning tomorrow. The job: know exactly what to do today
(sets, reps, load), log it with minimal friction, and see honest numbers about whether it is
working. Target viewport is 390×664 (iPhone Safari with chrome visible); desktop is secondary.

## Meaningful difference

- Local-first: the whole app runs with no account; everything lives in the browser
  (localStorage), with optional Google sign-in adding a synced cloud copy — never required.
- Deterministic where it matters: food parsing, portion math, volume landmarks and plan
  generation are real arithmetic over curated data — the AI layer advises, it never invents
  numbers.
- Evidence-forward: volume targets, progression schemes and per-meal protein guidance cite the
  research they came from, in-app.

## Durable constraints

- Static export only — no server. All state client-side; Firestore for the optional cloud copy.
- The 205-test Playwright suite and 98 unit tests are the behavioral contract; visual work must
  keep them green (updating assertions when composition legitimately changes).
- Touch targets ≥44px; the `.tabular` numeric convention is load-bearing across data rows.
- MISTRAL/DEEPSEEK keys live only on the worker; the Firebase web config is public by design.
- Health-adjacent data (`fitforge.health.*`, `fitforge.cycle.*`, `fitforge.readiness.*`) never
  rides automatic cloud sync — deliberate file export only.

## Brand commitments (confirmed 2026-07-30)

- The visual world is pinned by the owner: DARK surfaces + COPPER accent, "forging metal" as the
  material story. Renditions may span that world's full range; leaving the world is out of scope.
- The logo (anvil-and-smiths mark, `apps/web/public` brand assets) is pinned: do not replace;
  enhancement is permitted.
- Icons are drawn SVG in one consistent stroke grammar (`components/ui/icons.tsx` is the seat of
  that system). Emoji are not an icon system here (owner-confirmed).
- Product voice: plain, factual, coach-like; states consequences honestly ("erasing deletes your
  cloud copy"); no hype, no gamification theater.

## Terminology

"Local Mode" (the no-account experience), "split" (weekly plan shape), "readiness" (morning
check-in), "quick workout" (one-off manual session), "Pro" (DeepSeek tier, uid allowlist).
