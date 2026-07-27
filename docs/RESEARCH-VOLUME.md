# Training volume — what the numbers are, and what they rest on

Every weekly set target FitForge shows is asserted with a source. This is that source list, plus
what each one actually establishes and where our numbers depart from it. Implemented in
`apps/web/components/features/shared/volumeMath.ts`; surfaced in-app under **Tune target → Where
these numbers come from**.

## The unit: fractional sets

FitForge counts a set as **1.0 toward each primary muscle and 0.5 toward each secondary muscle**.

That was originally a house convention. It turns out to be the same weighting **Pelland et al.
(2025)** used to fit their dose-response curves — they classified every contributing set as direct
or indirect and quantified indirect sets as 0.5 for "fractional" volume. So the numbers on screen
are in the same units as the numbers the meta-regression produced, and comparing a user's 14 sets
against a literature band of 12–20 is a like-for-like comparison rather than an approximation.

This is the single most load-bearing fact in the whole model and it was verified rather than
assumed.

## The band: 12–20 sets per muscle per week

Two independent lines converge here, which is why the productive band reads 12–20 and not the
older 10–20 the app used to state:

| Source | Method | What it establishes |
|---|---|---|
| [Pelland et al., 2025](https://pubmed.ncbi.nlm.nih.gov/41343037/) | Bayesian meta-regression, 67 studies / 2,058 participants | Hypertrophy keeps rising with weekly sets, with pronounced diminishing returns past ~12–20. ≈ +0.24 % hypertrophy per additional set at 12.25 fractional weekly sets. Strength shows *stronger* diminishing returns than hypertrophy. |
| [Baz-Valle et al., 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/) | Systematic review | 12–20 weekly sets per muscle as the standard recommendation for young trained men; an inverted-U beyond it. |

Both also bear on **frequency**, which is why the app does not push a frequency target: Pelland
found the posterior probability of a frequency effect on hypertrophy compatible with negligible
effects once weekly volume is held constant. Frequency does help strength, with diminishing
returns. Spreading volume across more days is therefore presented as a scheduling convenience,
not as a hypertrophy lever.

## The floor: 4 sets per muscle per week

[Iversen et al., 2021 — "No time to lift?"](https://pmc.ncbi.nlm.nih.gov/articles/PMC11127831/)
puts the minimum effective dose for hypertrophy at **4 working sets per muscle per week**, taken
close to momentary failure at 6–15 reps. For strength, 2–3 working sets per exercise per week at
70–85 % 1RM.

Two things in the app come straight from this:

- `MED_WEEKLY_SETS = 4` is the floor under every scaled-down recommendation and the lower bound on
  what a user may calibrate a target to. A 2-day-a-week beginner gets scaled targets, but never a
  target the literature says does approximately nothing.
- The quick-workout condenser never trims an exercise below **2 sets**, and pairs non-competing
  movements into supersets instead of deleting work. The same review specifically identifies
  supersets as a way to cut session time substantially without cutting the dose — which is what
  makes a 20-minute budget an honest offer rather than a token one.

## Where we go beyond the evidence, and say so

**How the 12–20 band is divided BETWEEN muscles is not trial data.** Side delts sit high (14) and
front delts low (8) because almost nothing else trains side delts while every press trains front
delts; forearms sit at 6 because every grip-limited pull already loads them. That reasoning
follows practitioner volume-landmark frameworks (Israetel's MEV/MAV/MRV), not controlled
comparisons of per-muscle allocation.

It is labelled in-app as a **lower evidence tier**, and it is the main reason per-muscle targets
are user-calibratable at all: this is precisely the layer where an individual's experience should
outrank a population default.

## Direct vs indirect volume — a correctness bug this research surfaced

Building the target tuner exposed a real defect. Forearms accumulate ~16 fractional sets in a
normal pulling week **with no direct forearm work at all**, so the app read "Over target" and the
advice would have been "drop about 11 sets a week".

That instruction cannot be followed. The only way to drop those sets is to delete the rows and
pull-ups that generated them, which is obviously not the intent.

`MuscleGoalRow` therefore carries `directSets` alongside `sets`, and the advice branches on it:

- **No direct work at all** → "Nothing to drop — all of it is indirect, picked up from your
  compounds. Being over here is usually fine; raise the target instead if this muscle recovers
  well."
- **Some direct work** → the suggested cut is bounded by the direct sets actually being performed,
  and says so.

Pinned by a regression test (`tests/e2e/volume-target.spec.ts`), because the failure mode is
confident, plausible, and wrong.

## Scaling factors

These are judgement calls sitting on top of the evidence above, not findings:

| Factor | Range | Rationale |
|---|---|---|
| Goal | 0.75 (general health) → 1.15 (hypertrophy) | Hypertrophy is the volume-driven goal; strength trades volume for intensity; adherence-first plans should set reachable targets. |
| Experience | 0.7 (beginner) → 1.2 (advanced) | Beginners grow on less and recover from less; advanced lifters need more before plateau. |
| Days available | 0.75 (≤2 days) → 1.15 (6+) | A weekly goal that cannot fit in the week is a guilt generator, not a goal. |

All three are declared in `volumeMath.ts` and every one of them is overridable per muscle by the
athlete.
