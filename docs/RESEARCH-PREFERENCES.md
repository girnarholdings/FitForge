# Exercise preferences, sex-based defaults, and how they shape the plan

Spec for the "top 5 liked / top 5 disliked" onboarding change and sex-aware plan customisation.
Written before implementation so the reasoning is reviewable separately from the code.

## 1. What changes in onboarding

Today `exercise_prefs` asks an open "any exercises you love?" and sits at **screen 8**, AFTER the
split has already been chosen at screen 5. That ordering is backwards: the split is the single
biggest determinant of what a user will actually do, and it is picked before the app knows a single
thing about what they enjoy.

**The change:**

| | Before | After |
|---|---|---|
| Position | screen 8 (after split) | **before the split step** |
| Shape | open multi-select "love these" | **top 5 liked + top 5 disliked**, ranked |
| Effect on plan | prioritised in exercise selection | **liked → drives split scoring AND selection; disliked → substituted, not deleted** |

Moving it earlier is the load-bearing part of the request: *"the favorite exercises prompt should be
moved up further so the exercises split design has that data on the user."*

## 2. The disliked five are NOT exclusions

This is the subtlety in the ask and the easiest thing to get wrong. The user's words:

> The least 5 liked exercises should be used to prioritize easier exercises that target the same
> areas so user can still have exposure.

Disliking an exercise is not the same as protecting an injury. The app already has a genuine
exclusion mechanism (screen 9, "anything we should protect?"), and that one removes work. This must
behave differently:

- The disliked movement is **down-ranked, not banned**.
- The muscle and movement pattern it served stay **covered** — the substitution engine
  (`packages/shared/src/rules/substitution.ts`) already scores replacements by pattern + muscle
  overlap, so the replacement trains the same thing.
- Preference is given to an **easier** variant of the same pattern (lower `difficulty`, or a
  machine/assisted version), because "I hate this" is frequently "I cannot do this well yet".
  Barbell back squat → goblet squat or leg press, not "no quad work".
- If nothing suitable exists, the original stays and the app says so rather than silently leaving a
  hole. That is the same honesty rule the empty-day work established.

## 3. Sex-based pre-fill — what the evidence actually supports

The request: pre-fill the liked/disliked lists by sex, men toward chest and back, women toward legs
and glutes.

**The population tendency is real and documented.** Industry and survey data consistently report
that female gym-goers more often prioritise the posterior chain — glutes, hamstrings, and back —
while male gym-goers more often emphasise upper body, and that exercise motivation skews toward
appearance/weight for women and muscularity for men.

- [Health Club Management — should we offer gender-specific training?](https://www.healthclubmanagement.co.uk/health-club-management-features/Talking-point-Gender-specific-training/33262)
  — female clients typically want to focus on posterior muscles (back, glutes, hamstrings); male
  clients emphasise upper body.
- [The Whole Health Practice — men and women in the weight room](https://www.thewholehealthpractice.com/post/men-and-women-in-the-weight-room-what-science-says-about-strength-muscle-motivation-and-training)
  — women more often motivated by appearance, fitness and stress relief, and more often prefer
  lower-body exercises.

**One correction to the brief:** the female tendency reported is *posterior chain*, which includes
**back**, not "legs and glutes" alone. Pre-filling women with legs+glutes only and no pulling work
would under-serve the actual pattern. Romanian deadlift and lat pulldown belong in the female
default set alongside hip thrust and squat.

### The guardrail, stated plainly

This is a **pre-fill, never a filter**. Concretely:

- Every one of the 91 exercises stays browsable and selectable by everyone. Sex changes the
  *starting order* of a list the user is about to edit, and nothing else.
- The screen says where the suggestion came from and how to change it, so it never reads as the app
  telling someone what they should want.
- `prefer_not_to_say` is an existing profile value and must get a **neutral default** built from
  overall popularity, not a coin flip between the two sets.
- A user who edits the list gets their edit respected permanently — the pre-fill never
  re-asserts itself on a later visit.

A woman who wants to bench and a man who wants to squat must reach that in one tap. If the
implementation makes either of them fight the app, it is wrong regardless of what the survey data
says about averages.

## 4. Sex-aware plan customisation — the better-evidenced lever

For the *plan itself*, preference data is weaker ground than physiology. There is a well-replicated
sex difference that is directly actionable:

**Women recover more between sets, and fatigue less at the same relative intensity.**

- [Effects of biological sex on fatigue during and recovery from resistance exercise (PeerJ 2025)](https://peerj.com/articles/20542/)
  — men showed greater relative peak power and peak torque loss between sets in both squat and
  bench; the performance difference was attributable to female participants **recovering more
  quickly during the rest intervals** rather than fatiguing more slowly within a set.
- [Sex differences in temporal recovery of neuromuscular function](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6206044/)
- Mechanism: higher proportion of type I fibres, greater capillarisation and muscle blood flow,
  different glycolytic/oxidative capacities.

**What the app should do with it:** modestly shorter default rest and a slightly higher default rep
range for female users, both **adjustable**, both labelled with the reason. That is a real,
defensible personalisation.

**What it must NOT do:** cap loads, hide compound lifts, or assume lower strength goals. The same
literature notes that when training variables are matched, sex differences in adaptation are
minimal. Nothing here should reduce what a female user is offered.

### Evidence tiers, consistent with `volumeMath` and `RESEARCH-VOLUME.md`

| Claim | Tier |
|---|---|
| Women recover more between sets; less fatigable at matched relative intensity | **A** — replicated experimental findings |
| Population tendencies in body-part preference by sex | **B** — survey/industry observation, not causal |
| Which specific five exercises to pre-fill | **C** — our judgement from the above, editable by design |

The C-tier rating is the point: these are opening suggestions, and the UI should carry that
honesty the same way the volume targets carry theirs.

## 5. Proposed default sets

Starting suggestions only, drawn from the catalog's highest-popularity movements in the areas each
group tends to prioritise.

**Male-leaning liked:** Barbell Bench Press · Lat Pulldown · Barbell Back Squat ·
Seated Cable Row · Dumbbell Shoulder Press

**Female-leaning liked:** Barbell Hip Thrust · Romanian Deadlift · Goblet Squat ·
Lat Pulldown · Walking Lunge

**Neutral / prefer-not-to-say:** the five highest-popularity compounds spanning squat, hinge, push,
pull and carry — pattern coverage rather than a body-part bias.

Disliked lists start **empty** for everyone. Pre-filling a dislike would be putting words in
someone's mouth, and unlike a liked-list suggestion it actively removes something from their plan.
That asymmetry matters and is deliberate.
