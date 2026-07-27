# Progression schemes — what the numbers are, and what they rest on

Every per-set number FitForge shows — a load percentage, a rep target, a warm-up step, a rest
countdown — is asserted with a source. This is that source list, plus what each one actually
establishes and where our numbers depart from it. Implemented in
`packages/shared/src/rules/progression.ts`; surfaced in-app under **Where these numbers come
from**, in onboarding, in Settings → Progression, and in the workout player.

Progression schemes rest on **less** evidence than the volume targets in
[RESEARCH-VOLUME.md](./RESEARCH-VOLUME.md) do. That is the single most important thing on this
page, and the app says it on screen rather than burying it here.

## The headline finding: scheme choice is not a growth lever

[Angleri, Ugrinowitsch & Libardi (2017)](https://pubmed.ncbi.nlm.nih.gov/28130627/), *Eur J Appl
Physiol* 117(2):359-369, compared crescent pyramid training against traditional constant-load
training with **volume equated**, and found no greater strength or hypertrophy for the pyramid.

Everything else in this document follows from that result:

- FitForge will never tell an athlete that reverse pyramid builds more muscle than straight sets.
  It does not.
- A progression scheme is a **preference, adherence and fatigue-management** tool: where in the
  session the hard work lands, how much judgement each set demands, and how it feels to run.
- Because the scheme is not a growth lever, carrying a fourth option costs clarity and buys
  nothing. Three ship: straight sets, top set + back-offs, reverse pyramid.

`ascending_pyramid` was cut for two reasons. Once a specific warm-up ramp is universal (below), an
ascending pyramid **is** the ramp plus one top set — it duplicates top-set-plus-back-offs with
worse fatigue management, since the heaviest work lands last when performance is lowest. And its
light high-rep sets are the one shape this app cannot count honestly: either they are hard sets, in
which case it is four near-failure sets rather than a ramp, or they are not, in which case the
weekly hard-set currency every volume target is calibrated in would over-count them.

## The principle underneath all three schemes

| Source | What it establishes |
|---|---|
| [ACSM Position Stand — Ratamess et al., 2009](https://pubmed.ncbi.nlm.nih.gov/19204579/), *Med Sci Sports Exerc* 41(3):687-708 | Progressive overload via **programmed manipulation of reps, sets and load**. This is the canonical statement of the rule every scheme here shares. Tier A. |

That is why straight sets display a **rep range** and not the top of it. Double progression means
"work up the range, then add load": the range is the prescription, the top of it is the trigger. A
beginner reading a hard `12 reps` target and getting 9 on set 4 has done exactly what the scheme
intends and reads it as failure.

## Why a novice is never defaulted into a heavy-first scheme

| Source | What it establishes |
|---|---|
| [Zourdos et al., 2016](https://pubmed.ncbi.nlm.nih.gov/26049792/), *J Strength Cond Res* 30(1):267-275 | The velocity–RPE relationship was **tighter in experienced squatters (r = −0.88) than in novices (r = −0.77)**. Novices judge proximity to failure less accurately. Tier B. |

Reverse pyramid asks a lifter to walk into the heaviest set of their day and self-regulate it —
exactly the judgement a novice does not yet have. So `recommendProgressionScheme()` cannot return a
scheme above the athlete's level, with no exceptions:

- beginner, any goal → straight sets
- intermediate / advanced + strength → top set + back-offs
- advanced + hypertrophy → reverse pyramid
- everything else → straight sets

An explicit over-reach is **honoured, not overruled** — we guide, we do not take the decision away —
but it carries `schemeCaution()`, shown in the workout player at the moment the session runs and
not only in onboarding weeks beforehand, with a one-tap "switch to straight sets".

The same finding is why the reverse-pyramid top set is RPE-capped: the caution text tells the
athlete to leave 2 reps in the tank, so the prescription has to actually say RPE 8, not RPE 9.

## Warm-up: a ramp, not a sentence

Until this work, the entire protection for "set 1 is the heaviest set of your day" was a string
printed beside it saying *warm up fully first*. A cue is not a warm-up. `warmupRamp()` now returns
real prescription rows in the movement being trained.

Warm-up rows are **not sets**. They earn no volume credit, no PR and no place in the logged session,
because the app's whole training currency is hard sets per muscle per week, measured against the
Pelland / Baz-Valle bands. A ramp counted as work would silently inflate every weekly goal reading,
every heat colour and every target bar in the app.

Mobility work and the ramp are **not substitutes for each other**: mobility warms the body, the ramp
warms the lift. Under a heavy-first scheme both are required, and the UI says so in words rather
than in a comment.

## Where we go beyond the evidence, and say so

**None of the following is established by a controlled trial.** They are practitioner convention,
carried because they are what experienced coaches do and because the Angleri result says the choice
between reasonable schemes is not what drives the outcome anyway. They are labelled Tier C in
`PROGRESSION_EVIDENCE` and shown to the user with that label attached, exactly as the Israetel
per-muscle volume split is.

| Number | What it is | Why we use it |
|---|---|---|
| Ramp of 40 % × 5, 60 % × 3, 80 % × 2 | Coaching convention | There is no controlled comparison of specific ramp protocols. This grooves the pattern without spending anything. |
| A fourth ramp step at 90 % × 1 under reverse pyramid | Coaching convention | Set 1 is the heaviest set of the day, so the gap between the last warm-up and the first working set is the one that has to be small. |
| One 50 % × 10 step for isolation work | Coaching convention | An accessory needs the joint warm, not the pattern rehearsed. |
| ONE feeler step (60 % × 3, or 80 % × 2 under reverse pyramid) on a compound whose pattern an earlier lift already trained; NO ramp at all for an accessory on an already-warm pattern | Coaching convention | Exactly as much trial evidence behind it as the ramp percentages themselves: none. It is here because the alternative is worse coaching, not because it is better established. A full four-step ramp on the fourth pulling movement of a session — after the lats have already done seven-plus hard sets — costs 3–4 minutes, buys nothing, and is the single biggest reason athletes start skipping ramps altogether, including on the first lift where the ramp IS the safety mechanism. "Already warm" is computed from the day's running order: an earlier row sharing the movement pattern, or sharing a primary muscle. Secondary muscles are deliberately not consulted — almost everything picks up secondary credit somewhere, so including them would mark the third lift of every session warm and delete ramps that are genuinely needed. |
| 10 % load drop per set | Convention (Berkhan / Leangains lineage) | Large enough to buy the reps, small enough that it is still the same exercise. |
| +2 reps per step | Convention | Roughly the rep trade a 10 % drop is worth on a compound. |
| 3-set cap on reverse pyramid | Convention; classic RPT is 2–3 sets | With the 10 % drop, set 4 lands at 73 % of the top set — a 12–14 rep set on the hypertrophy default. That is junk volume bolted on the end, not the stimulus anyone picked the scheme for. The app **says** it dropped the set rather than silently trimming it. |
| Back-offs at 90 % of the top set | Convention | Buys volume without a second peak. |
| Top-set RPE cap: 8 (beginner / intermediate), 9 (advanced) | Convention, anchored to the RIR-based RPE scale of Zourdos et al. (2016) | The load-bearing safety number: it makes the prescription agree with the caution text. |
| Back-offs one RPE notch easier under top-set + back-offs | Convention | A back-off as hard as the top set is a second top set. |
| Rest after a top set = row rest × 1.25, to the nearest 15 s, capped at 300 s | Convention | The heaviest set of the day is the one whose quality most depends on being fully recovered. |
| Bodyweight reverse pyramid: reps × 0.8 per set | Convention | With nothing to lighten, the only honest way to run heaviest-first is descending reps at constant load (8 / 6 / 5 on chin-ups). |

## What the app refuses to compute

- **A 1RM.** Loads are expressed as a percent of the day's top set, never as kilos, and the absolute
  weight comes from the athlete's own logged history. `suggestedLoadKg()` returns `null` rather than
  a guess when there is no history, and the UI shows the percentage alone.
- **A percentage on an unloadable movement.** "90 % of your bodyweight" is not a thing anyone can
  do. On chin-ups, dips and push-ups every `loadPct` is `null` and the scheme expresses itself in
  reps. This was a live bug: the player used to print `Set 2 · 10 reps · 90%` and offer a 0 kg
  weight field on bodyweight days.
- **A starting weight.** The warm-up ramp keeps its percentages when there is no history and drops
  only the kilos, so the athlete most likely to need a warm-up still gets one — without the app
  inventing a number to put on the bar.
