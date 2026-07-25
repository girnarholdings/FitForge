# RESEARCH: Onboarding, Equipment Selection & Phone-First UX in Fitness Apps
*Product research brief — July 2026. Sources: live web research (app help centers, review sites, UX teardowns, onboarding-pattern libraries) plus product knowledge of the apps themselves. Items marked (inferred) are from direct product familiarity rather than a fetched citation.*

---

## 1. Per-app table

| App | Onboarding | Equipment selection | Good / Bad |
|---|---|---|---|
| **Fitbod** | Short quiz: goal (muscle gain / strength / endurance), experience level, training frequency, then equipment. Contextual tooltips appear during the *first workout* rather than front-loading tutorials. First generated workout is the payoff screen. | The category leader. "Gym Profile" → **Available Equipment**: items grouped by category (Barbell, Dumbbell, Machines, Cables, Bodyweight, Bands, Kettlebells...), each item shown as a **photo thumbnail with a checkmark toggle** (inferred from product). Presets: **"Bodyweight Only"** mode and effectively full-gym default. **Multiple gym profiles** (home vs commercial gym), one-tap switching. Weight Selection lets you specify exact dumbbell/KB/med-ball weights you own. Only recommends exercises for selected equipment. | Good: equipment → visible plan change is immediate and trustworthy; presets kill the 30-tap problem; separate "Recommend More / Less / Don't Recommend Again" per exercise (preference decoupled from availability). Bad: equipment list is long and flat within categories; novices report not recognizing machine names (photos mitigate). |
| **Alpha Progression** | Gym-profile-driven: age, weight, experience, session length, days/week, muscles to **focus or ignore**, plan cycle. | Long checklist of very specific machines (lat pulldown, cable crossover, Roman chair, butterfly...). Killer detail: as you toggle equipment, a **live counter updates "N exercises available"** — instant feedback on the consequence of each toggle. Multiple gyms, each with its own equipment *and available weights*; active gym gates exercise picker + plan generator. | Good: live exercise-count feedback is the single best equipment-picker mechanic found; per-gym weight inventories. Bad: text-heavy checklist; intimidating for novices. |
| **Hevy** | Almost none — "cleanest onboarding in the category": download → account → **logging your first set in under 90 seconds**. No mandatory assessment, no upfront paywall. | None at onboarding; equipment is a filter/tag in the 1,000+ exercise library (each exercise has images + category tags). | Good: proof that time-to-first-action beats personalization for tracker-type apps. Bad: zero plan personalization; user must self-direct. |
| **Strong** | Minimal, productivity-first; pick a template or empty workout and go. | No equipment profile; exercise library filters by body part/equipment type. | Good: zero friction. Bad: no personalization; nothing to "steal" for plan-building apps. |
| **Jefit** | "Adaptive Plan" builds a weekly program from **5 setup questions**, and **shows you the program structure in advance** before you commit. | Gym profile with equipment noted per routine; multi-location setup; 1,400+ exercises with HD video. | Good: 5 questions → visible plan preview is a great ratio. Bad: reviewers call the UI overcrowded and hard to navigate; frequent redesigns erode familiarity. |
| **Freeletics** | Extensive quiz (~15–20 screens; the paid Coach path is 6 core questions incl. equipment + goals) using **one question per screen**, a **slider for fitness level**, "pick your top 3 goals" from suggestions, then a **"Building your plan" animation** that visibly assembles the custom plan. Then pick a "Training Journey" and confirm its required equipment. | Binary/simple: equipment access asked as part of quiz (none / basic / full), then per-Journey equipment confirmation. | Good: the interactive inputs (slider, chips) + build-animation make a long quiz feel immersive; equipment confirmation right before plan generation builds trust. Bad: long flow with high commitment → drop-off risk for casual users. |
| **Nike Training Club** | Light quiz; equipment asked as a simple **"what do you have / none"** filter to narrow programs. | Coarse buckets (none / basic / full) — a filter, not an inventory. | Good: right-sized for a class-library app. Bad: not granular enough for auto-programming. |
| **Centr** | Download quiz: body stats, fitness level, goals, eating preferences. | Filter classes by equipment at hand; coarse categories. | Good: quiz feeds meal + training simultaneously. Bad: generic form feel. |
| **Caliber** | **20+ steps** — thorough intake for human-coach matching. | Asked in intake (free text / options for coach). | Good: depth is justified because a human reads it. Bad: widely reviewed as "feels long"; a pure-software app should not copy this. |
| **Ladder** | Starts by **choosing a training style, then a coach/team** — identity-first, not data-first; quiz after. 7-day trial. | Per-program equipment requirement, confirmed at program start. | Good: leading with identity/aspiration ("which team are you?") is more engaging than demographics. Bad: little equipment granularity. |
| **Future** | Long concierge intake + video call with human coach ($199/mo). | Coach asks; free-form. | Not a software pattern to copy. |
| **Boostcamp** | Light: pick a proven program (5/3/1, nSuns, PPL...) from a catalog; program handles progression. | Per-program; no global inventory. | Good: "pick a famous program" is its own onboarding shortcut. Bad: no equipment adaptation. |
| **Dr. Muscle** | **Demo-first**: shows a walk-through/demo workout before asking much; then goals, level, equipment, preferences. Custom equipment increments (pulley increments, dumbbell customization). | Equipment quiz + per-equipment increment settings (advanced). | Good: "try before you tell us about yourself." Bad: dated UI; information-dense. |
| **Peloton** | Class-library model; light preferences; no real equipment inventory (bike/tread assumed or filter). | Filter only. | N/A for our purposes. |
| **Gymshark Training** | Short: training location (home/gym), experience, goal → free plans (inferred). | Location proxy ("home vs gym") instead of item inventory. | Good: "where do you train?" is a smart 1-tap proxy that pre-fills an equipment set. |
| **MacroFactor** | Praised as "beautiful… lovely onboarding, very friendly UX": one-question-per-screen, crisp motion design, explains *why* each question is asked, sensible defaults, and heavier use of phone-native affordances (notifications, swipe gestures, barcode). Criticism: assumes nutrition literacy (TDEE etc.) and front-loads concepts before first log; early algorithm behavior under-explained. | N/A (nutrition). | Steal: the craft (explain-why microcopy, defaults, motion), not the literacy assumptions. |
| **Noom / Fabulous (pattern reference)** | Noom: long quiz funnel — context-setting, behavioral profile, **predicted goal timeline**, tips as micro-payoffs, loader → "your personalized plan is reserved" paywall. Fabulous: **42 screens**, found via testing. One tested funnel: adding questions + stats + loading screens raised iOS payment conversion **+40%**, ARPU +20%. Counterpoint: one UK fitness app's 45–50-screen, 7–8-minute onboarding is cited as an anti-pattern ("a lot asked before users can even use the app"). | N/A | Long works ONLY when every screen gives something back (a stat, a tip, a projection). Length without reciprocity = churn. |

**Abandonment facts:** 77% of users churn within 3 days of install; ~80% drop off before the paywall when onboarding is an afterthought. Every extra field measurably increases abandonment. Guidance converges on: ask only questions that **visibly change the output**, show a progress bar, target 3–7 meaningful steps for utility apps (quiz-funnel subscription apps are the exception, and only with per-screen payoffs).

---

## 2. What we should steal (prioritized, concrete)

1. **One question per screen, tappable answers, auto-advance.** Full-width option cards (min 56px tall), tap → 150ms selected state → auto-advance (no "Next" for single-choice). Progress bar top, thin (2–4px), always visible. Target: **7–9 screens**, < 90 seconds.
2. **Alpha Progression's live consequence counter.** Wherever equipment is toggled/swiped, show a persistent chip: **"142 exercises unlocked"** ticking up/down in real time. This is the cheapest trust-builder found in the entire research.
3. **Fitbod's decoupling of availability vs preference.** Two independent signals per exercise/equipment: *have it* (availability) and *love/avoid it* (preference: More / Less / Never). Our swipe deck's up-swipe = both at once (see spec below).
4. **"Building your plan" moment (Freeletics/Noom).** After the last question: 2.5–4s staged loader with 3–4 checklist lines animating in sequence — "Analyzing your equipment ✓ / Balancing push–pull volume ✓ / Reserving recovery days ✓" — then land directly on the generated Day 1 workout, not a menu. Never a spinner alone.
5. **Immediate payoff = first workout visible before signup/paywall** (Jefit shows plan structure in advance; Hevy proves time-to-first-action wins). Show the actual generated plan (blurred details acceptable) before asking for account/email.
6. **Presets kill toggle fatigue (Fitbod + Gymshark).** First equipment screen = 4 big preset cards: **"Just my body" / "Home basics (DB + bands)" / "Home gym (rack + barbell)" / "Commercial gym (everything)"** → preset pre-fills the inventory; then "Fine-tune" is optional, not mandatory.
7. **Photos, not icons, for machines.** Novices don't know "pec deck" or "Smith machine" by name. Show a real photo (or high-fidelity 3D render) + plain-English name + one-line "what it's for." Icons are fine only for barbell/dumbbell/band-tier items everyone knows.
8. **Explain-why microcopy (MacroFactor).** Under each question, one grey line: "We use this to set your starting weights." Reviews repeatedly praise this; it converts interrogation into collaboration.
9. **Slider/chips instead of radio lists for fuzzy quantities (Freeletics).** Fitness level = slider with live label ("I'm just starting" → "I train 5×/week"); goals = pick top 3 chips from suggestions.
10. **Multiple gym profiles later, not during onboarding** (Fitbod/Alpha). Onboard against ONE location; expose "Add another gym" in settings.
11. **Injury/limitation capture as body-map taps, not a form** (see §5): tap shoulder/knee/lower-back on a body silhouette → app says exactly what it will avoid.
12. **Sticky bottom CTA in the thumb zone** on every onboarding screen (10–20% conversion lift for bottom-thumb CTAs; 49% of users are one-handed, 75% of interactions thumb-driven). Never put "Continue" top-right.

**Anti-patterns to avoid:** Caliber's 20+ step intake without per-step payoff; Jefit's crowded UI; MacroFactor's assumed jargon; asking for account creation before showing any value; >10 screens with nothing given back.

---

## 3. Spec — Tinder-style equipment swipe deck

No mainstream fitness app currently does Tinder-style **equipment** picking (dating-adjacent fitness apps like Trainerize.me swipe on *trainers*; Swip'eat on meals) — so this is a differentiator, but it must follow generic swipe-deck best practice (Tinder, Bumble, react-tinder-card ecosystem).

### Card anatomy (one equipment item per card)
- Card: ~86vw wide, max 400px; height ~58svh; border-radius 24px; elevation shadow.
- Top 70%: **photo** of the equipment (real photo/3D render on neutral background — recognition, not decoration).
- Bottom 30%: **Name** (plain English, e.g. "Lat pulldown machine"), one-line descriptor ("Cable machine you pull down to your chest — builds your back"), small category tag ("Machines · 4 of 7").
- Overlay stamps fade in with drag: right = green "HAVE IT", left = grey "DON'T HAVE", up = pink/gold "LOVE IT". Stamp opacity = clamp(|dx| / threshold, 0, 1).

### Gestures & thresholds
- **Right = I have this. Left = don't have. Up = have it AND love it** (sets availability + "recommend more" preference in one gesture). Down = unused (reserve for nothing; down-swipes conflict with scroll).
- Commit threshold: **horizontal |dx| ≥ 35% of card width (~120px on a 390px iPhone)** OR **fling velocity ≥ 0.4 px/ms** regardless of distance. Vertical (up): |dy| ≥ 30% of card height with dy dominant (|dy| > 1.5·|dx|).
- Below threshold: **spring snap-back** (stiffness ~300, damping ~25; ~250ms settle). Above: card animates off-screen along release vector in ~200ms, next card promotes.
- Rotation while dragging: `rotate = dx * 0.06deg`, pivot biased to grab point (Tinder feel).
- Gesture claim: require |dx| > 10px before claiming the pointer, so vertical page scroll never fights the deck; `touch-action: pan-y` on the deck container, `none` once claimed.

### Stack rendering
- Render **3 cards** max (top + 2 behind). Behind-cards: `scale(0.95/0.90)`, `translateY(10px/20px)`, no shadow on the last. Promote with a 180ms ease-out when top card leaves. Preload images 3 deep.

### Undo, progress, fatigue control (the 30-item problem)
- **Undo:** persistent ↩ button bottom-left; restores last card with reverse animation (react-tinder-card `restore` pattern). Keep full history — unlimited undo within the session.
- **Progress:** thin segmented bar at top — one segment per **category**, fill within segment per card ("Machines 4/7"). Also the live counter chip: "**137 exercises unlocked**" (Alpha Progression mechanic) updating on every right/up swipe.
- **Batch by category with interstitial shortcuts.** Order: Bodyweight/basics → Dumbbells → Barbell & rack → Machines → Cables → Accessories. Before each category, a 1-card interstitial: "Machines — 7 cards. **[I have all of these] [I have none of these] [Show me]**". Those two buttons swipe the whole category at once → an honest full-gym user finishes in ~6 taps.
- **Global shortcut on deck entry:** "**I train at a commercial gym — assume everything**" link → skips deck, marks all available, jumps straight to the (optional) love/avoid pass.
- **Hard cap ~25–30 cards**; fold rare items ("EZ bar", "trap bar") into a post-deck "Anything else?" checklist grid. Deck should complete in < 60s for a typical user.

### Accessibility & fallbacks (WCAG 2.5.1 / 2.5.7)
- Three persistent buttons under the deck: ✕ (don't have), ♥ (have + love), ✓ (have) — every swipe has a single-tap equivalent (Tinder itself does this). Buttons ≥ 48px targets, in the bottom thumb zone.
- Keyboard: ← = no, → = yes, ↑ = love, Z/Backspace = undo. Focus order: card (announced as "Lat pulldown machine, card 4 of 7 in Machines"), then buttons.
- Screen readers: `role="group"` with `aria-roledescription="equipment card"`; announce result after action ("Marked as available. 12 exercises added."). Respect `prefers-reduced-motion`: replace fling with 120ms crossfade.

---

## 4. Spec — landing + onboarding that never overflows iPhone Safari

The problem: iOS Safari's `100vh` = the **largest** viewport (URL bar collapsed), so 100vh heroes overflow by ~60–100px on first load; the bar also collapses/expands during scroll, resizing the visible area. `svh/lvh/dvh` are Baseline Widely Available (June 2025, ~95% support; Safari 15.4+).

```css
/* 1) Root sizing — small viewport unit so it fits WITH the URL bar visible */
.screen {
  min-height: 100vh;    /* fallback, older browsers */
  min-height: 100svh;   /* fits worst case (bar expanded) — never overflows */
}
/* Use 100dvh ONLY for chrome that should track the bar (e.g. a fixed overlay),
   never for animated heights — dvh changes mid-scroll and jitters. */

/* 2) Safe areas (notch + home indicator) */
html { /* viewport meta must include viewport-fit=cover */ }
.screen {
  padding-top: max(16px, env(safe-area-inset-top));
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

/* 3) One-screen layout: flex column, content region flexes, CTA pinned */
.screen { display: flex; flex-direction: column; }
.screen__content { flex: 1 1 auto; min-height: 0; overflow-y: auto; } /* scrolls only if it must */
.screen__cta {
  flex: 0 0 auto;
  position: sticky; bottom: 0;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: linear-gradient(transparent, var(--bg) 30%); /* content scrolls under */
}

/* 4) Never let a fixed hero rely on exact height — cap media, let type scale */
.hero-media { max-height: 40svh; width: 100%; object-fit: cover; }
h1 { font-size: clamp(1.6rem, 6vw + 0.5rem, 2.6rem); }

/* 5) Kill accidental horizontal + rubber-band overflow */
html, body { overscroll-behavior-y: none; }
body { overflow-x: clip; }
```

Rules of thumb:
- **Design every onboarding screen to fit 100svh on an iPhone SE (568–667px tall)**; anything that can grow (option lists) lives in the scrollable middle region — headline and CTA never move.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` — required for `env(safe-area-inset-*)`.
- Inputs: font-size ≥ 16px (prevents iOS auto-zoom); avoid focusing inputs inside `position: fixed` bars (keyboard + visualViewport bugs) — if unavoidable, listen to `window.visualViewport.resize` and translate the bar.
- Primary CTA in the bottom-center **green thumb zone**; destructive/secondary actions can live higher. Bottom CTA placement is worth ~10–20% conversion by itself.
- Swipe-deck screens: lock scroll entirely (`overflow: hidden` on `.screen`, deck sized in svh) so the URL bar never collapses mid-gesture and the deck geometry stays stable.
- Test matrix: iPhone SE, 13/14/15 standard, Pro Max; Safari + in-app browsers (Instagram/Slack webviews have their own bar quirks — `svh` is the safe unit there too).

---

## 5. Preference capture beyond equipment (likes / dislikes / injuries)

- **Fitbod — the reference model.** Per-exercise "⋯" menu → **Recommend More Often / Recommend Less Often / Don't Recommend Again**. Exclusion removes it from the current (unstarted) workout immediately — the plan visibly changes the moment you express the preference — and from all future recommendations; reversible via Manage Exercises. Help docs explicitly frame Exclude for "pain, doesn't fit goals, or missing equipment." Fitbod also tracks per-muscle recovery ("fresh muscle" map), which acts as an implicit preference/constraint layer.
- **Alpha Progression:** asks for **muscles to focus or ignore** during plan setup — a coarse but effective preference control at onboarding time.
- **Freeletics:** asks for limitations/health constraints in the Coach quiz and adapts the Journey; post-workout feedback ("too easy/too hard", pain flags) feeds the next session — preference capture is *continuous*, not one-shot.
- **Dr. Muscle:** collects preferences at onboarding and adapts sets/reps/exercise selection from session feedback.
- **Caliber/Future:** free-text injury intake read by a human — high fidelity, doesn't scale.
- **Pattern to implement:** (a) at onboarding, a **tappable body map** ("Anything we should work around?") — tapping "shoulder" immediately shows "OK — we'll avoid overhead pressing and dips" (explain the consequence in exercise terms); (b) in-app, Fitbod-style 3-state preference on every exercise row, with instant visible substitution + a toast ("Swapped for Landmine Press") and one-tap undo; (c) up-swipes in the equipment deck seed the initial "more often" list. The universal principle from every well-reviewed app: **a preference the user can't see acting on the plan within 5 seconds might as well not exist.**
