# Research · Self-adapting programs, sleep-driven load, and the screened device

Date: 2026-09-15. Second pass, after `RESEARCH-WEARABLE.md`. Scope: whether FitForge should build a
program that rewrites itself from sleep and recovery data, what the evidence supports as an input,
how to handle a missed day, and whether a small screen with an explicit Start button is the right
hardware bridge to automatic rep detection.

**Research caveat.** Primary journal pages were egress-blocked in this environment. Figures come
from search-result snippets of the papers, plus vendor and repository pages read directly. Every
claim carries a confidence tag: **verified** (seen in a primary or official source snippet),
**secondary** (analyst, trade press, vendor), **estimate** (derived here). ⚠ marks a figure that no
primary source confirmed. Repository facts were read from the working tree and are verified.

---

## 0. Verdict

1. **The adaptive engine is the product. The device is an accessory.** FitForge already ships the
   readiness engine, the deduction table, the day-rewriting function and the AI adapt path. The
   work described here is an extension of `lib/readiness/` and `lib/demo/store.ts`, not a new build.
2. **Do not gate training on REM.** Consumer wearables stage sleep at 60 to 85 percent accuracy
   against polysomnography, and Oura's REM sensitivity is 76.0 percent [SleepAdv 2025]. One analysis
   even finds performance declining slightly as REM duration rises past about 1 h 20 min
   [WHOOP Locker] ⚠. The direction of the effect is not clean enough to move load. Use total sleep
   duration, which the app already collects.
3. **Sleep duration is a weaker lever than intuition suggests.** A meta-analysis found sleep
   restriction and deprivation affect acute strength far less than expected [Stronger by Science on
   Craven et al.]. The effect scales with motor-skill demand: total deprivation cut bench press
   11.2 percent but grip only 2.7 percent [PMC13028445]. FitForge's existing 30-point deduction
   below 5.5 h is, if anything, aggressive.
4. **Self-report beats the wearable.** Saw et al. 2016 found subjective self-reported measures
   trump commonly used objective measures for tracking the training response, and that the two
   classes generally do not correlate [PMID 26423706]. FitForge's engine already encodes this: the
   comment in `engine.ts` says health deltas are "deliberately smaller than any manual answer,
   because a wearable reading is weaker evidence than the athlete's own report."
5. **The highest-value adaptive feature needs no wearable at all.** A 2025 network meta-analysis
   ranked autoregulatory progressive resistance exercise first for maximal strength (SUCRA 93.0
   percent), ahead of RPE (66.8), velocity-based (27.0) and percentage-based (13.2)
   [PMID 40791980]. APRE adjusts load *within* the session from reps achieved on a benchmark set.
   The input is the logged set, which FitForge already has.
6. **Do not build the engine on acute:chronic workload ratio.** Impellizzeri et al. 2020 found no
   evidence supporting ACWR in training-load-management systems and that the statistical properties
   of the ratio make it inaccurate [IJSPP 15(6)].
7. **A missed day is a scheduling problem, not a physiological one.** Short-term detraining runs
   under four weeks, and measurable strength loss in the literature sits at −5 to −15 percent after
   far longer layoffs than a skipped Tuesday [PMC9657634, PubMed 32017951]. The correct response to
   one missed session is to redistribute the week, not to deload.
8. **The explicit Start button is the right bridge, and the Apple Watch already is that device.**
   Motra, formerly Train Fitness, claims 82+ exercises at 95 percent accuracy from wrist motion
   alone, with reviewers reporting that wrist-driven lifts count well while cables, machines and
   fixed-wrist lifts do not [Garage Gym Reviews, riven.fit]. A watchOS companion gives the same
   wrist Start affordance for zero bill of materials, zero minimum order, zero tariff and zero
   certification, and it produces exactly the labelled dataset the phase-2 auto-sensing needs.
9. **A screen changes the competitive set.** Display is among the costliest lines in a smartwatch
   bill of materials at $3 to $15 per unit [Alibaba OEM guide] ⚠, and adding touch, glass and
   sealing moves the product from Whoop's screenless lane into Apple, Garmin and Xiaomi's. If a
   screen ships, make it a Sharp Memory LCD at roughly 60 µW, not an AMOLED [Sharp datasheet].
10. **Sequence:** engine first on data you already have, then a watchOS app to move the Start
    button to the wrist and harvest labelled motion, then custom hardware only if the labelled data
    proves auto-detection and the app has demand that the watch cannot serve.

---

## 1. What "self-adapting" actually means here

The request contains four distinct features. They have very different evidence and very different
costs. Separating them is most of the analysis.

| Feature | Input it needs | Evidence base | Hardware needed | Status in repo |
|---|---|---|---|---|
| A. Within-session load autoregulation | reps achieved on a benchmark set | strongest: APRE ranked first in a 2025 network meta-analysis [PMID 40791980] | none | not built |
| B. Daily session modulation from readiness | sleep hours, soreness, energy, stress, RHR, HRV | moderate: subjective measures lead [PMID 26423706]; HRV-guided RCTs are mostly endurance [PMID 34639599] | none, optional band | **built**: `lib/readiness/engine.ts` |
| C. Weekly resequencing after a missed day | the workout log and the routine | weak-but-safe: detraining under four weeks is minor [PMC9657634] | none | not built |
| D. Automatic set and rep capture | wrist IMU at 50 Hz | mixed: 95 percent claimed, exercise-dependent in practice [Garage Gym Reviews] | watch or band | not built |

The user's instinct that D "will be complicated" is correct and is confirmed by the first-pass
research: wrist-only recognition reaches F1 62 on an 18-activity outdoor set, rising to 74 only
when an ankle sensor is added [WEAR, IMWUT 2024]. A, B and C are all reachable without any device.

---

## 2. Sleep as an input: what survives scrutiny

### 2.1 Stages, and why REM is the wrong dial

Consumer wearables separate sleep from wake at 85 to 95 percent accuracy but stage light, deep and
REM at only 60 to 85 percent [Ubie summary of validation work] ⚠. A six-device validation against
polysomnography reports per-stage sensitivities:

| Device | Light | Deep | REM | Source |
|---|---:|---:|---:|---|
| Oura | 78.2% | 79.5% | 76.0% | [SleepAdv 2025] verified |
| Fitbit | 78.0% | 61.7% | 67.3% | [SleepAdv 2025] verified |
| Apple Watch | 86.1% | 50.5% | 82.6% | [SleepAdv 2025] verified |

Two further problems compound the accuracy ceiling:

- **Directional ambiguity.** An analysis of phase-level effects reports a slight decline in
  next-day performance as REM duration increases, with a suboptimal point near 1 h 20 min of REM,
  while *less* awake time and *more* light sleep both associate with better reaction time
  [WHOOP Locker] ⚠. A metric whose sign is contested cannot be the gate on a squat session.
- **Systematic bias.** Wearables tend to overestimate deep sleep because they lean on stillness and
  low heart rate [Ubie] ⚠. A still, anxious night reads as recovery.

**The repo already sidesteps this.** `apps/web/lib/health/selectors.ts` sums sleep samples into a
single `sleepHours` figure, and `assessReadiness` in `lib/readiness/engine.ts` consumes
`sleepHours` alone. There is no stage field anywhere in the health wire format. Building REM into
the engine would mean adding a schema field to carry a number the sensor cannot measure reliably.
Recommendation: leave it out, and say so in the product copy. "We use how long you slept, because
how long is the part a wrist sensor gets right" is a stronger claim than a REM ring.

### 2.2 Sleep duration, and the size of the real effect

| Finding | Value | Confidence | Source |
|---|---|---|---|
| Sleep restriction and deprivation affect acute strength less than expected | qualitative | secondary | [SBS on Craven] |
| Total deprivation, bench press | −11.2% | secondary | [PMC13028445] |
| Total deprivation, leg press submaximal | −5.7% | secondary | [PMC13028445] |
| Total deprivation, maximal grip | −2.7% | secondary | [PMC13028445] |
| Habitual 1–2 h restriction may blunt resistance-training benefits | qualitative | secondary | [PMC11390164] |
| Single-night sleep extension improves morning physical and cognitive performance | qualitative | secondary | [PMC12387293] |

The pattern that matters: **effect size scales with motor-skill demand.** One bad night costs
little on a curl and a lot on a squat. That is a more useful rule than any readiness score, and it
is directly implementable, because FitForge knows which movement pattern each exercise is.

**Proposed refinement to the existing deduction table.** Today `engine.ts` deducts 30 points below
5.5 h and 12 points below 7 h, applied uniformly. A movement-aware version would keep the global
deduction smaller and instead bias the *substitution* step: on a low-sleep day, swap the barbell
back squat for a leg press or a goblet squat at the same relative effort, and leave the isolation
work alone. The substitution engine and its curated edges already exist; this is a scoring change
plus a filter, not new machinery. Marked **estimate**: no study tested exactly this policy.

### 2.3 HRV and resting heart rate

- HRV-guided training has real randomised evidence, but almost entirely in **endurance**
  populations [PMID 34639599, runners RCT in ScienceDirect]. No equivalent body exists for
  hypertrophy or maximal-strength programming. Treat transfer as an assumption, not a finding.
- A single morning HRV reading is noise. Practitioner method is a 7-day rolling average plus the
  coefficient of variation, with a smallest worthwhile change near 0.5 × SD of that rolling average
  [Elite HRV] ⚠ secondary. Day-to-day variability has been characterised for Whoop in Olympic
  athletes [PMC9505647].
- **FitForge is already correct here.** `selectors.ts` computes a 14-day trailing median for
  resting heart rate and a 30-day trailing median for HRV, and the engine fires only at
  RHR ≥ +5 bpm (11 points) or HRV ≤ −20 percent (8 points). Those are baseline-relative thresholds
  on a long window, which is the shape the literature supports.

### 2.4 The uncomfortable finding: your check-in outranks your band

Saw et al. 2016, a systematic review of athlete monitoring, concluded that subjective self-reported
measures reflected acute and chronic training loads with greater sensitivity and consistency than
the objective measures examined, and that subjective and objective measures generally did not
correlate with one another [PMID 26423706] **verified**.

This has three consequences for the product:

1. **The band is a convenience, not an oracle.** It removes the friction of a morning check-in; it
   does not out-predict one. Any marketing that positions the hardware as superior signal is
   contradicted by the review.
2. **The existing weighting is right and should stay.** The largest deduction in the table is 30
   points for under 5.5 h of self-reported sleep; the largest wearable deduction is 11 points. Keep
   that ordering.
3. **The cheapest accuracy upgrade is a better question, not a better sensor.** Single-item
   wellbeing measures have their own systematic review [PMC7534939], and adding one well-chosen
   item costs nothing.

---

## 3. The missed-day problem

This is where a self-adapting program earns its keep, and it is almost entirely a scheduling
question rather than a physiological one.

### 3.1 What the physiology says

| Finding | Value | Confidence | Source |
|---|---|---|---|
| Short-term detraining is defined as under four weeks of cessation | definition | secondary | [Frontiers 2025] |
| Strength and power loss after a detraining period, older men | −5% to −15% | secondary | [PubMed 32017951] |
| Muscle loss magnitude increases with detraining duration | qualitative | secondary | [PMC9657634] |
| Myonuclei added during hypertrophy are retained, speeding retraining | qualitative | secondary | [PMC9530508] |
| Previously inactive people lose force faster than trained ones | qualitative | secondary | [Frontiers 2025] |

Nothing in that table justifies a deload after one, two or three missed days. The honest product
behaviour after a short gap is to **resume**, not to regress the load. Fitbod, by contrast,
lowers weight recommendations after a training break [Fitbod blog] secondary; that is a defensible
comfort choice but it is not required by the evidence, and for a trained user it costs progress.

### 3.2 What the scheduler should do

The real cost of a missed day is **weekly volume falling below the muscle's target**, and FitForge
already computes exactly that: per-muscle weekly hard-set goals, counted fractionally, rendered as
percent of goal. The adaptive rule follows directly.

Proposed policy, all **estimate** and all implementable from existing state:

| Situation | Rule | Why |
|---|---|---|
| 1 day missed, ≥2 training days left in the week | Pull the missed day forward; keep the order | No physiological cost; volume goal still reachable |
| 1 day missed, 1 day left | Condense: merge the missed day's primary compounds into the remaining session inside the time budget | The quick-workout condenser already exists |
| 2+ days missed, week unrecoverable | Protect the highest-deficit muscles; drop the accessories | Volume goal is the metric that matters, not session count |
| Gap of 7 to 14 days | Resume at the same load, cut top-set volume by one set for one session | Detraining is minor; the one-set haircut is a soreness hedge |
| Gap over 21 days | Re-enter at roughly −10 percent load for one week | Inside the −5 to −15 percent band the literature reports |
| Same muscle trained twice in 48 h by resequencing | Block it | Fitbod uses a 48–72 h recovery window per muscle [Fitbod] |

The important design property: **every rule reads from the workout log and the volume math that
already exist.** No new sensor, no new model.

### 3.3 Where the wearable genuinely helps here

One case only, and it is a good one. If the band shows a hard session yesterday that was *not*
logged in FitForge, the scheduler is working from a false picture. Fitbod solves this by ingesting
Apple Health and Strava to adjust muscle recovery percentages [Fitbod] secondary. FitForge's
`externalWorkoutOn(dateISO)` selector already exists for this. That is a passive-capture win that
does not require the band to classify anything.

---

## 4. Autoregulation: the feature with the best evidence

The 2025 network meta-analysis in the Journal of Exercise Science and Fitness ranked four load-
prescription strategies for maximal strength [PMID 40791980] **secondary**:

| Method | SUCRA rank | What it needs |
|---|---:|---|
| APRE, autoregulatory progressive resistance exercise | 93.0% | reps achieved on a benchmark set |
| RPE / reps-in-reserve | 66.8% | one rating per set |
| Velocity-based | 27.0% | a bar-mounted sensor or linear encoder |
| Percentage-based (fixed % of 1RM) | 13.2% | a tested 1RM |

Two readings of this table matter.

**First, velocity-based training ranked third.** The review notes that velocity-based methods use
objective velocity loss to terminate a set while RPE relies on subjective fatigue, and yet RPE
outranked it. Combined with the first pass's finding that wrist IMUs are poor bar-velocity
estimators, this removes the main physiological argument for putting a motion sensor on the wrist:
the sensor's signature output is the method that ranked third out of four.

**Second, the winner runs on data FitForge already stores.** `LoggedSet` carries `reps` and
`weight_kg`. APRE's logic is: perform a benchmark set to near-failure at a prescribed load, then
adjust the subsequent working sets by a table keyed on reps achieved. That is arithmetic over two
fields. It is the single highest-evidence adaptive feature available, and it needs no hardware, no
sleep data and no HRV.

**Caution on the ranking.** SUCRA ranks come from indirect comparisons and are sensitive to the
included trial set; a 93.0 percent SUCRA is not "93 percent better." Treat the ordering as the
finding and the magnitudes as soft.

### 4.1 What *not* to build

Impellizzeri et al. 2020 examined the acute:chronic workload ratio and found the validity
questioned by heterogeneous load inputs, no rationale for the specific acute and chronic windows,
no proper causal estimation in any study, no evidence supporting its use in training-load-management
systems, and statistical properties that make the ratio inaccurate [IJSPP 15(6), 907] **verified
via multiple summaries**. Several commercial recovery products lean on ACWR-shaped logic. FitForge
should not. The volume-versus-landmark model the app already uses is better grounded and already
cites its sources in-app.

---

## 5. The device question

### 5.1 Does the adaptive engine need hardware?

No. Mapped against the four features in section 1: A needs logged reps, B needs a check-in that
already exists and optionally health aggregates the app can already import, C needs the workout
log. Only D needs a sensor, and D is the feature with the weakest accuracy evidence.

### 5.2 If a screen ships, what does it cost?

| Line | Figure | Confidence | Source |
|---|---|---|---|
| Display, TFT LCD or AMOLED, in a smartwatch BOM | $3 to $15 per unit | ⚠ secondary | [Alibaba OEM guide] |
| Main SoC or MCU, Nordic / MediaTek / Realtek class | $2 to $8 | ⚠ secondary | [Alibaba OEM guide] |
| Battery, 100 to 400 mAh Li-Po | $0.80 to $2.50 | ⚠ secondary | [Alibaba OEM guide] |
| Health sensors, PPG plus accelerometer plus SpO2 | $1.50 to $6 | ⚠ secondary | [Alibaba OEM guide] |
| 1.28 in round 240×240 TFT module, hobby quantity | $4.64 to $9.90 | secondary | [eBay, DisplayModule, BuyDisplay] |
| Sharp Memory LCD LS013B7DH03 power draw | 60 µW | verified | [Sharp datasheet via Mouser] |
| Low-power memory LCD static draw, general | ~10 µW | secondary | [DisplayModule] |
| nRF52840 smartwatch with TFT, 210 mAh | 5 to 7 days | ⚠ secondary | [Alibaba buying guide] |
| nRF52840 advertising at 1 Hz with an SPI display on, 100 mAh | ~8.5 mA average, ~11 h | ⚠ hobby project | [Hackaday] |

The engineering conclusion is clean. **An always-on SPI TFT is a battery catastrophe at band
scale**; the hobby measurement of roughly 8.5 mA with the display on would drain a 200 mAh cell in
under a day. A Sharp Memory LCD at 60 µW is three to four orders of magnitude cheaper in power and
holds each pixel's state in-pixel, which is exactly the always-on, week-long-battery profile the
band needs. If a screen ships, it is a monochrome memory LCD, not a colour touchscreen.

The strategic cost is larger than the bill of materials. Adding a screen, touch, cover glass and
buttons moves the product out of the screenless lane that the first pass priced (Whoop, Fitbit Air,
Helio Strap, Polar Loop) and into the watch lane, where Apple, Garmin and Xiaomi already sell a
better screen at higher volume.

### 5.3 The Start button belongs on a device you do not manufacture

The user's phased logic is exactly right: explicit Start now, auto-detection later, with the
explicit sessions serving as labelled data. That is the standard supervised bootstrap, and the
first pass's science lens supports it — the WEAR ablation shows wrist-only recognition improving
sharply once the model has more context, and few-shot rep counting reaches roughly 0.7 reps mean
absolute error on unseen exercises with 74 percent of sets counted exactly [arXiv 2410.00407].

The question is only **which wrist device carries the button**. Motra, formerly Train Fitness,
already does exercise detection and rep counting from Apple Watch motion, claiming 82+ exercises at
95 percent accuracy, with independent reviewers noting the accuracy is exercise-dependent and that
cables, machines and fixed-wrist lifts remain hard [Garage Gym Reviews, Product Hunt, riven.fit]
secondary. Apple Watch is therefore both the proof that the affordance works and the cheapest route
to it.

A watchOS companion delivers:

- the same wrist Start, Next Set and Rest Timer affordance, with no bill of materials;
- raw 50 Hz accelerometer and gyroscope during a session the user has labelled by pressing Start;
- a workout written to HealthKit under `HKWorkoutActivityTypeTraditionalStrengthTraining`;
- heart rate during the set, which the band would also have provided;
- zero minimum order quantity, zero tariff exposure, zero FCC or BIS certification, zero tooling.

The cost is platform risk and the ~$99/yr developer programme, plus the fact that Android users
need the Wear OS equivalent. Set against $53k to $881k of cash-to-first-units from the first pass,
that is not a close call for a first experiment.

### 5.4 When custom hardware becomes the right call

Three conditions, all measurable:

1. Labelled watch data shows closed-set recognition clearing the 90 percent kill threshold from the
   first pass, so the auto-sensing phase is real rather than aspirational.
2. Enough users train without carrying a watch that the addressable gap is worth a bill of
   materials, which is an unmeasured claim today.
3. Either the upper-arm placement proves materially better than the wrist for lifting, which the
   PPG-under-motion literature suggests it will, or 24/7 wear for recovery becomes the main use and
   a watch is too bulky for sleep.

Until then the hardware is an option, not a plan, and the watch app is how you buy the information
that prices the option.

---

## 6. Proposed build order

Every step reads from state the app already keeps, and each one is independently shippable.

| Step | What ships | New inputs | Files touched |
|---|---|---|---|
| 1 | APRE load autoregulation on the top set | none | `packages/shared/src/rules/progression.ts`, the player |
| 2 | Missed-day resequencing driven by the weekly volume deficit | none | new `lib/plan/reschedule.ts`, the routine store |
| 3 | Movement-aware sleep policy: smaller global deduction, substitution bias on high-skill lifts | none | `lib/readiness/engine.ts`, `dayEdits.ts` |
| 4 | External-workout awareness so unlogged sessions stop corrupting the schedule | Apple Health / Health Connect, already imported | `selectors.ts` `externalWorkoutOn` |
| 5 | watchOS companion: Start, Next Set, Rest, plus raw IMU capture per labelled set | watch motion | new watch target, HealthKit workout write |
| 6 | Train and evaluate plan-aware rep detection on the labelled corpus | the corpus from step 5 | offline, then on-device |
| 7 | Custom band or arm strap, only if steps 5 and 6 clear the thresholds | — | per `RESEARCH-WEARABLE.md` |

Steps 1 to 4 are pure software on existing data, and they are where the evidence is strongest.
Steps 5 and 6 buy the information. Step 7 is the option.

### 6.1 The one architectural rule to carry forward

The first pass established that band-generated events must be an append-only log outside the
last-write-wins sync bundle. The same rule applies to everything here: **adaptive decisions must be
recorded, not just applied.** The repo already does this for the readiness path, where
`recordDecision` stores accepted and rejected offers in `fitforge.readiness.v1`. Extend the same
pattern to rescheduling and autoregulation. Without the rejection record there is no way to learn
whether the engine's suggestions are any good, and an adaptive engine that cannot be evaluated is a
mood ring with extra steps.

---

## 7. Risks and kill criteria

| Risk | Evidence | Signal to stop |
|---|---|---|
| Adaptive suggestions annoy more than they help | JITAI trials are feasible and acceptable but outcomes vary by behaviour [Frontiers 2026] | Offer-rejection rate above 50 percent over 30 days in `fitforge.readiness.v1` |
| Sleep-driven load cuts hurt progress | Sleep loss affects acute strength less than expected [SBS on Craven] | Users who accept cuts progress slower than users who reject them |
| HRV transfer from endurance does not hold for lifting | HRV-guided RCTs are endurance-dominated [PMID 34639599] | Keep HRV's weight capped below self-report, as the engine already does |
| Wearable stage data drives a bad decision | REM sensitivity 76.0 percent on the best device [SleepAdv 2025] | Do not ship stage-gated logic at all |
| ACWR-style load ratios creep into the engine | No evidence supports ACWR in load-management systems [IJSPP 2020] | Reject any design that ratios acute over chronic load |
| Auto-detection never clears the bar | Wrist-only F1 62 on an 18-class set [WEAR 2024] | Recognition under 90 percent on the closed plan-aware set after calibration |
| The watch app cannibalises the hardware case | Motra already does this on Apple Watch | If the watch app satisfies demand, that is a finding, not a failure |

---

## 8. What I would tell the owner in one paragraph

Build the engine, not the device. The features with the best evidence, within-session
autoregulation and missed-day resequencing, need no sensor at all and run on two fields FitForge
already stores. Sleep duration is worth a modest adjustment and sleep stages are worth none, because
the best consumer wearable stages REM at 76 percent and the performance literature cannot even
agree on the sign. The morning check-in you already ship out-predicts the band, which the repo's own
code comment says out loud. The screened device is the right idea one step too early: the Apple
Watch is that device, a watchOS companion gives you the wrist Start button and the labelled motion
corpus for the price of developer time, and custom hardware becomes rational only after that corpus
proves auto-detection works. Every irreversible dollar stays behind a measurement.

---

## Sources

**Autoregulation and load prescription**
- Autoregulated resistance training for maximal strength enhancement: systematic review and network meta-analysis, J Exerc Sci Fit 2025. https://pubmed.ncbi.nlm.nih.gov/40791980/ · https://www.sciencedirect.com/science/article/pii/S1728869X25000590
- Velocity loss thresholds on RPE and individual differences in the back squat, 2025. https://journals.sagepub.com/doi/10.1177/17479541251339905
- RPE and RIR in resistance training: what research says, 2025. https://www.muscleresearch.net/rpe-and-rir-research-on-autoregulation-in-resistance-training/
- Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls, IJSPP 15(6) 2020. https://journals.humankinetics.com/view/journals/ijspp/15/6/article-p907.xml
- Is the relationship between acute and chronic workload a valid predictive injury tool? A Bayesian analysis. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9572878/

**Sleep**
- Performance validation of six commercial wrist-worn wearable sleep-tracking devices for sleep stage scoring compared to polysomnography, SLEEP Advances 2025. https://academic.oup.com/sleepadvances/article/6/2/zpaf021/8090472
- Accuracy of three commercial wearable devices for sleep tracking in healthy adults. https://pmc.ncbi.nlm.nih.gov/articles/PMC11511193/
- Sleep trackers vs polysomnography, stage accuracy summary. https://ubiehealth.com/doctors-note/sleep-tracker-vs-polysomnography-accuracy-stage-4762q2
- Deep sleep vs REM sleep, WHOOP Locker. https://www.whoop.com/us/en/thelocker/deep-sleep-vs-rem-sleep-what-are-the-differences/
- Sex differences in acute effects of early partial and total sleep deprivation on strength, power and endurance in resistance-trained participants. https://pmc.ncbi.nlm.nih.gov/articles/PMC13028445/
- Could a habitual sleep restriction of one to two hours be detrimental to the benefits of resistance training? https://pmc.ncbi.nlm.nih.gov/articles/PMC11390164/
- How much does sleep loss affect strength performance? Stronger by Science on Craven et al. https://www.strongerbyscience.com/research-spotlight-sleep-loss/
- Single-night sleep extension enhances morning physical and cognitive performance, randomized crossover. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12387293/
- Sleep, recovery and metaregulation: explaining the benefits of sleep. https://pmc.ncbi.nlm.nih.gov/articles/PMC4689288/

**HRV, readiness and monitoring**
- Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures, Saw et al. 2016. https://pubmed.ncbi.nlm.nih.gov/26423706/
- Single-item self-report measures of team-sport athlete wellbeing and their relationship with training load. https://pmc.ncbi.nlm.nih.gov/articles/PMC7534939/
- HRV-guided training for cardiac-vagal modulation, aerobic fitness and endurance performance: methodological systematic review with meta-analysis. https://pubmed.ncbi.nlm.nih.gov/34639599/
- Heart rate variability-guided training in professional runners. https://www.sciencedirect.com/science/article/abs/pii/S0031938421003413
- Can heart rate variability determine recovery following distinct strength loadings? Randomized cross-over trial. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6888606/
- Evaluating the typical day-to-day variability of WHOOP-derived HRV in Olympic water polo athletes. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9505647/
- Associations between daily HRV and self-reported wellness, 14-day observational study. https://pmc.ncbi.nlm.nih.gov/articles/PMC12300306/
- HRV 7-day rolling average and coefficient of variation, Elite HRV. https://help.elitehrv.com/article/355-what-is-the-hrv-7-day-rolling-average-and-coefficient-of-variation
- Garmin Training Readiness, Forerunner 965 owner's manual. https://www8.garmin.com/manuals/webhelp/GUID-0221611A-992D-495E-8DED-1DD448F7A066/EN-US/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html
- Garmin's Training Readiness metric explained. https://gadgetsandwearables.com/2022/05/30/garmin-training-readiness/
- WHOOP Coach powered by OpenAI. https://www.whoop.com/us/en/thelocker/whoop-unveils-the-new-whoop-coach-powered-by-openai/

**Detraining and muscle memory**
- Use it or lose it? Meta-analysis on the effects of resistance training cessation on muscle size in older adults. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9657634/
- Myonuclear permanence in skeletal muscle memory: systematic review and meta-analysis. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9530508/
- Skeletal muscle memory: implications for sports, aging and nutrition, Frontiers 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12673669/
- The effect of resistance training, detraining and retraining on muscle strength and power in older men. https://pubmed.ncbi.nlm.nih.gov/32017951/

**Adaptive apps and behaviour change**
- Just-in-Time Adaptive Interventions for physical activity: systematic review of public health impact and methodological quality, Frontiers 2026. https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2026.1934024/full
- Personalized interventions for behaviour change: scoping review of just-in-time adaptive interventions, Br J Health Psychol 2025. https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/bjhp.12766
- Using personalized intervention criteria in a mobile JITAI for increasing physical activity, JMIR Human Factors 2025. https://humanfactors.jmir.org/2025/1/e66750
- Fitbod muscle recovery and how it impacts your next workout. https://fitbod.me/blog/muscle-recovery/
- How Fitbod generates your personalized workouts. https://fitbod.me/blog/fitbod-algorithm/

**Automatic rep detection**
- Train Fitness app review, Garage Gym Reviews. https://www.garagegymreviews.com/equipment/train-fitness-app
- Train Fitness: automatic exercise detection and rep counting, Product Hunt. https://www.producthunt.com/products/train-fitness
- Best automatic rep counter apps for Apple Watch, honest review. https://riven.fit/blog/best-automatic-rep-counter-apps-apple-watch
- Does the Apple Watch count reps? https://riven.fit/blog/does-apple-watch-count-reps
- WEAR: an outdoor sports dataset for wearable and egocentric activity recognition, IMWUT 2024. https://dl.acm.org/doi/10.1145/3699776
- Few-shot repetition counting on unseen exercises, arXiv 2410.00407. https://arxiv.org/pdf/2410.00407

**Display and power**
- Sharp LS013B7DH03 memory LCD datasheet. https://www.mouser.com/datasheet/2/365/LS013B7DH03%20SPEC_SMA-224806.pdf
- The Sharp Memory LCD suite. https://www.mouser.com/ds/2/365/Sharp_Memory_LCD_Brochure_2015-746065.pdf
- Best display for battery devices: e-paper, PMOLED and low-power LCDs. https://www.displaymodule.com/blogs/knowledge/best-display-for-battery-devices-e-paper-pmoled-low-power-lcds
- OLED power consumption vs LCD. https://www.displaymodule.com/blogs/knowledge/oled-power-consumption-vs-lcd
- 1.28 in round 240×240 TFT SPI module. https://www.displaymodule.com/products/1-28-inch-round-240x240-tft-spi-dm-tftr128-446
- Smartwatch OEM cost breakdown. https://www.gysmartwatch.com/html/smartwatch-oem-cost-breakdown.html
- nRF52840 smart watch guide. https://electronics.alibaba.com/buyingguides/nrf52840-smart-watch-guide-what-actually-matters
- nRF52 smartwatch project, Hackaday. https://hackaday.io/project/169967-nrf52-smartwatch

**FitForge repository (verified against the working tree, 2026-09-15)**
- `apps/web/lib/readiness/engine.ts` — deduction table, illness gate, band thresholds
- `apps/web/lib/readiness/store.ts` — `fitforge.readiness.v1`, decision recording
- `apps/web/lib/readiness/dayEdits.ts` — `buildAdaptedDay`, reduce / technique / rest
- `apps/web/lib/health/selectors.ts` — `overnight()`, `baselines()`, `externalWorkoutOn()`, 14-day RHR and 30-day HRV medians
- `apps/web/lib/native/forgeBridge.ts` — the eight-metric health wire format, no sleep stages
- `apps/web/components/features/shared/workoutLog.ts` — `LoggedSet { reps, weight_kg }`
- `docs/ARCHITECTURE-ADAPT.md` — the existing readiness and AI adapt loop
