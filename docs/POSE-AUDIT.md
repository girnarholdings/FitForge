# Pose illustration correctness audit

An incorrect exercise illustration actively teaches bad form. This is the record of a
correctness pass over every pose rig in `apps/web/components/illustrations/poses/rigs.tsx` —
51 rig ids (26 authored pose sets) covering all 59 exercises in `seed/data/exercises.json`.

Every exercise page was built, screenshotted from the real `/exercises/<slug>/` route, and
**looked at**. 34 of the 59 renders changed; the 25 that came out byte-identical are exactly the
ones judged correct.

## The bug that started it

`benchPressRig(..., incline: true)` carried `tilt: { deg: -24, cx: 58, cy: 82 }`.

The figure lies head-left (head x≈28), feet-right (toe x≈94), pivoting about x=58, and **SVG
rotation is clockwise-positive because y grows downward** — so a negative angle drove the head
DOWN and the hips UP. The app rendered a **decline press** under an "Incline press" label.

The first fix flipped the sign to `deg: 30`. That put the head up, but rotating the whole group
also swung the bench legs off the floor and drove the lifter's foot *below* the floor line. The
`tilt` mechanism was removed entirely and the incline bench is now authored directly: back pad
rising at ~32°, seat and legs square to the floor, feet planted.

## Defects found and fixed

Severity: **teaches-bad-form** (the drawing shows a technique fault a user would copy) >
**misleading** (the drawing contradicts its own caption or is anatomically impossible) >
**cosmetic** (wrong but unlikely to change what a user does).

| # | Rig / exercises | What was drawn | What is correct | Severity |
|---|---|---|---|---|
| 1 | `row-bent`, `row-onearm` — barbell-row, dumbbell-row | "Pull" put the elbow *in front of the chest*, bar 27px off the body | Elbow drives back past the ribs, bar to the lower chest | teaches-bad-form |
| 2 | `face-pull` | Hands travelled *inward*: 48px apart at start, 24px at the pull | Rope is pulled **apart** — hands start together, finish wide at the ears, elbows flared | teaches-bad-form |
| 3 | `rear-delt-fly` | The lateral-raise figure shifted down, standing upright. An upright "rear delt fly" *is* a lateral raise | Hip hinge is the exercise: torso foreshortened, head below the shoulder line, arms hang then sweep out | teaches-bad-form |
| 4 | `rdl` — romanian-deadlift | "Hinge" hung the bar ~30 cm in front of the shins — the classic bar-drift fault | Bar hangs from the shoulders over mid-foot, brushing the leg; hips travel further back | teaches-bad-form |
| 5 | `row-erg` — rowing-erg | "Catch" leaned the torso *backward*, identical to "Finish" — no body swing at all | Catch is hinged forward over the knees | teaches-bad-form |
| 6 | `incline-press` | See above — decline, then feet through the floor | Authored incline bench, feet planted | misleading |
| 7 | `cable-fly` | Both handles tethered to a single left-hand pulley — one cable drawn straight across the chest | One stack per side; each handle tethers to its own pulley (`cableFrom2`) | misleading |
| 8 | `pull-up` — pull-up, chin-up, band-assisted-pull-up | "Chin over" left the head 25px *below* the bar — the caption described a rep the drawing never finished | Head finishes level with the bar | misleading |
| 9 | `dip` | "Bottom" put the shoulder below hand level — the arm folded double, an unreachable position | Bars at hip height; straight arms at the top, ~75° elbow at the bottom | misleading |
| 10 | `push-up` | Elbow flare touched the floor; **feet lifted off the floor** at lock-out | Hands and toes are fixed ground contacts; the body pivots on the toes | misleading |
| 11 | `plank` | Elbow floated above the floor; the foot was drawn toes-up in one frame and toes-down in the other | Forearm on the floor, shoulder stacked over the elbow, weight on the toes | misleading |
| 12 | `overhead-press`, `shoulder-press-seated` (+ machine, seated DB) | "Lock out" kept the elbow folded — bar parked at forehead height | Elbows straight, bar stacked over the shoulders, clear of the head | misleading |
| 13 | `lunge` — walking-lunge | "Bottom" left the rear leg nearly straight (hip/knee/ankle collinear) | Both knees bend; rear knee drops toward the floor, rear heel lifted | misleading |
| 14 | `calf-raise` | Step started *behind* the heel, so the dropped heel was drawn through solid scenery; the top showed a flat foot | Balls of the feet on the step edge, heel hanging off the back, clear lift at the top | misleading |
| 15 | `squat-machine` — hack-squat | A free-standing barbell squat with a machine pill on the shoulders; torso folded forward | Back flat against an angled sled pad; the body travels along the rail, torso never pitches forward | misleading |
| 16 | `dead-bug` | Spine floated above the floor; near arm *and* near leg extended together | Back on the floor; contralateral — far arm/leg hold 90/90 while the near pair reach | misleading |
| 17 | `russian-twist` | The whole figure floated in mid-air, reading as a crouch | Seated on the floor, hips low, heels down | misleading |
| 18 | `glute-bridge` | Arm inherited the bench-variant offset and was drawn below the floor line | Lying on the floor, arms alongside the body | plausibility |
| 19 | `bench-press`, `hip-thrust` | Feet a few px above the floor; bar not touching the chest at "Bottom" | Feet planted; bar touches the chest | cosmetic |
| 20 | `curl` | The barbell was drawn 58px wide at the start and 46px at the top — the bar changed length | Grip width is fixed | cosmetic |
| 21 | `row-seated`, `jump-rope`, `pec-deck`, `triceps-overhead` | Arrow bowed through the head; jump/land arrows swapped; "squeeze" converged at navel height; upper arm too short overhead | Arc clears the head; arrows match the frame; hands meet at chest height | cosmetic |

## Found and deliberately not changed

Recorded for honesty rather than fixed — each was judged acceptable at render size:

- **Front-view seated rigs** (`shoulder-press-seated`, `pec-deck`): legs drawn full-length
  straight down, so the seat pad is the only "seated" cue. The movement itself is right.
- **`inverted-row`**: heel sits ~4px above the floor and the feet slide 2px between frames.
- **`deadlift` set-up**: shoulders drawn slightly behind the bar rather than slightly ahead.
- **`leg-press` start**: knee only ~108° flexed — a shallow starting position.
- **`step-up`**: shin short relative to the femur (the box is knee height, so the horizontal
  thigh is correct).
- **`triceps-overhead`**: the elbow still overlaps the head. Unavoidable in a true side view.

## Judged correct, unchanged

`squat-back`, `squat-front`, `squat-goblet`, `squat-bw`, `leg-press`, `split-squat`, `step-up`,
`deadlift`, `good-morning`, `kb-swing`, `leg-extension`, `leg-curl`, `seated-press`,
`lat-pulldown`, `inverted-row`, `pushdown`, `skull-crusher`, `lateral-raise`,
`cable-lateral-raise`, `hanging-leg-raise`, `cable-crunch`, `rollout`, `carry`, `run`, `bike`.

## Why this is not an automated test

`tests/e2e/pose-rigs.spec.ts` guards the two failures that are *silent* — an exercise pointing at
a rig id that does not exist, and a rig whose frames draw the identical pose. It does not, and
cannot cheaply, check that a drawing depicts the right movement.

Three stronger invariants were written, run against the real library, and deleted as unsound.
The reasoning is kept in that spec file so nobody re-derives them and trusts the result:

- **Bone lengths constant across frames** — false. These are 2D projections; a limb rotating out
  of the picture plane foreshortens legitimately. The bench-press upper arm measures 6.4px at the
  bottom and 13.2px at lock-out and *both are correct*. Any tolerance wide enough to permit that
  is too wide to catch a real deformation.
- **No joint below the floor line** — false. Toes are drawn ~2px past the ankle as a foot cue,
  and a hanging pull-up figure has no floor contact. The floor is per-rig, not a global constant.
- **Two-anchor implements keep a fixed width** — false for most rigs. `imp`/`imp2` means one
  implement *per hand*, so flies, lateral raises and face pulls separate the hands on purpose.
  It holds only for a rigid bar, which the rig data does not distinguish.

The honest conclusion is that pose correctness is a **review** obligation, not a CI one. Re-run
the render sweep when rigs change.
