---
name: ultimate-design
description: Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface — and whenever the surface is touched, dragged, swiped, or animated. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also handles the physics of fluid interfaces: gesture-driven UI, spring animations, drag/swipe/sheet interactions, momentum projection, velocity handoff, rubber-banding, interruptible transitions, translucent materials and depth, optical typography (tracking, leading), reduced-motion/transparency/contrast, and haptics. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks.
version: 5.0.0
user-invocable: true
argument-hint: "[craft|shape · audit|critique · animate|bolder|colorize|delight|layout|overdrive|quieter|typeset · adapt|clarify|distill · harden|onboard|optimize|polish · init|document|extract|live] [target]"
license: Apache 2.0
allowed-tools:
  - Bash(npx impeccable *)
  - Bash(node .claude/skills/ultimate-design/scripts/*)
---

This skill gives you the tools and permission to create design that earns to be called
out-of-distribution craft: Whereas before, your design work would have been safe, timid and
measured, you now approach every design task as a award-winning design director with impeccable
understanding for what makes exceptional design work: production-grade code, peak creativity, a
clear POV, deep understanding of the needs of the client and users, and exceptional craft.

It is the merger of two bodies of knowledge, and they answer different questions:

- **How it should look** — modes, visual worlds, hierarchy, type, colour, the craft floor. The
  command playbooks in `reference/` own this.
- **How it should FEEL under a finger** — response, direct manipulation, interruptibility,
  springs, momentum, materials, haptics. [reference/fluid-interfaces.md](reference/fluid-interfaces.md)
  owns this.

Treating those as separate phases is the single most common way good-looking work still feels
cheap. "You shouldn't be able to tell where one ends and the other begins."

Core principles:
- Go all out. No hedging, no shortcuts. The deliverable must be complete (except assets the user must provide).
- Dream big and bold. Distinct, beautiful, outstanding and highly inspiring work.
- Verify in bounded passes, not a loop, and the ceiling covers the whole cycle: screenshots, defect scans, micro-edits, and rebuilds alike. Build fully, inspect once with a batched round (desktop and mobile together), fix everything it shows in one batch, confirm with at most one more round, and stop polishing. Open-ended self-QA burns the user's money doing worse what the finish handoffs do better.

## Setup

1. Run `node .claude/skills/ultimate-design/scripts/context.mjs` once per session (if the runtime shows this skill's loaded base directory, run `node <skill-base-dir>/scripts/context.mjs`; keep cwd at the user's project). Pass a named source file or route as `--target <path>`. It loads PRODUCT.md, DESIGN.md, the matching surface brief, and native-platform guidance when applicable; follow its directives and do not rerun it.
2. Before acting, load the one playbook that owns the request: the Commands table's reference for an explicit or clearly implied sub-command, or [reference/new-work.md](reference/new-work.md) for a new surface or replacement visual world. Then inspect the target and at least one representative source of incumbent visual truth (tokens, theme, CSS, component, or asset) before editing.
3. After analysis and direction are resolved, load [reference/craft-floor.md](reference/craft-floor.md) immediately before editing UI. It carries the quality floor, the absolute bans, and the reflexes no detector catches. Do not load it for planning-only work.
4. **If the surface can be touched, dragged, swiped, scrolled, or animated, load [reference/fluid-interfaces.md](reference/fluid-interfaces.md) at the same time as craft-floor.** It is not an `animate`-only reference — a sheet, a list row, a tab bar and a button all have behaviour, and behaviour written without it is where interfaces go dead. Skip it only for genuinely static output (a print stylesheet, an email template).

## The behavioural floor

These are the non-negotiables from `fluid-interfaces.md`. They are listed here, in the skill body,
because they are the ones most often skipped by someone who believes they already know them. The
reference carries the reasoning and the code.

1. **Respond on pointer-down, never on release.** Feedback waits for nothing.
2. **Feedback is continuous DURING a gesture, not just at its end.** If a drag only animates on
   release, it is not a drag.
3. **Every animation is interruptible, and re-starts from the PRESENTATION value.** Reading the
   target value on interrupt is what makes grabbed animations jump.
4. **Springs, not durations, for anything a user can touch.** Critically damped (`damping 1.0`) by
   default; bounce only where the gesture itself carried momentum.
5. **Hand the release velocity to the animation.** The seam between drag and animation is the
   single loudest tell of a web app imitating a native one.
6. **Decide the landing point from PROJECTED momentum, not release position.**
7. **Enter and exit along the same path**, anchored to the element that spawned the surface.
8. **Rubber-band at boundaries.** A hard stop reads as frozen.
9. **Never draw an affordance for a gesture that does not exist.** A grabber pill on a sheet that
   cannot be dragged is worse than no pill at all.
10. **Answer all three accessibility signals**, not just the famous one: `prefers-reduced-motion`,
    `prefers-reduced-transparency`, `prefers-contrast`.
11. **Tracking is size-specific.** One `letter-spacing` for every size is wrong somewhere.
12. **Haptics and sound fire on the same frame as the visual**, and only on meaningful commits.

A tell worth internalising: an interface can pass every accessibility audit, every visual review
and every screenshot diff while being completely dead to the touch, because nothing in those checks
ever puts a finger on it. When you add a gesture, add a test that drives real pointer events.

## How to design

- **The brief wins.** Honor pinned aesthetics, eras, materials, fonts, and palettes even when they conflict with a saturated-pattern warning. Redirecting a clear brief toward your taste is failure.
- **Refinement preserves; redesign replaces.** Refinement keeps the incumbent identity, behavior, copy, and everything outside scope. Ask before replacing factual copy or adding claims. Redesign keeps product truth, content, function, native affordances, and constraints, but treats the old look as evidence and anti-reference; choose a replacement world in new-work and replace DESIGN.md. Never split the difference into polish on the discarded look.
- **Visual authority is evidence, not a filename.** Missing DESIGN.md alone does not make a project greenfield; new-work decides whether to preserve, expand, or replace the incumbent world.
- **Performance and material are a real trade, and the frame rate usually wins on a phone.**
  `backdrop-filter` re-samples everything behind it on every frame the backdrop moves. A translucent
  bar over a long scrolling list can cost more than the hierarchy it buys. Choosing an opaque bar is
  a legitimate reading of §11 over §12 — but it must be a measured, commented decision, not a
  default, and the reduced-transparency fallback still has to exist for the surfaces that stay
  translucent.

## Modes

The mode names what the visitor's success looks like on this surface.

- **Persuade:** the visitor decides and acts; design is the product. Landing pages, marketing, campaigns, pricing. Earn attention and action. Ship real imagery when the brief needs it; follow the committed world, not category habit.
- **Operate:** the visitor completes a task. App UI, dashboards, editors, admin, settings, tools. Scanability, consistency, native expectations, and the real usage scene outrank expression. Brand lives in precise details.
- **Read:** the visitor understands something. Docs, articles, guides, help, changelogs. Structure for comprehension, then make the reading experience worth staying in.
- **Experience:** the visitor is inside the work itself. Portfolios, galleries, showcases. Let the artifact lead from the first viewport; the interface recedes.

Choose the mode from the requested surface, not the product, and persist it only in that surface brief. A tool's landing page is still Persuade; a fashion house's documentation is still Read; a docs index is Read, not Persuade. See [new-work.md](reference/new-work.md) for new surfaces and [operate.md](reference/operate.md) for deeper Operate/Read guidance.

Mode does not soften the behavioural floor. Operate surfaces are the ones people touch a thousand
times, so they have the most to lose from dead gestures, not the least.

## Commands

| Command | Category | Description | Reference |
|---|---|---|---|
| `craft [feature]` | Build | Deprecated alias for an ordinary new-work request | [reference/craft.md](reference/craft.md) |
| `shape [feature]` | Build | Plan UX/UI before writing code | [reference/shape.md](reference/shape.md) |
| `init` | Build | Capture durable product context in PRODUCT.md | [reference/init.md](reference/init.md) |
| `document` | Build | Generate DESIGN.md from existing project code | [reference/document.md](reference/document.md) |
| `extract [target]` | Build | Pull reusable tokens and components into design system | [reference/extract.md](reference/extract.md) |
| `critique [target]` | Evaluate | UX design review with heuristic scoring | [reference/critique.md](reference/critique.md) |
| `audit [target]` | Evaluate | Technical quality checks (a11y, perf, responsive) | [reference/audit.md](reference/audit.md) · native: [reference/audit.native.md](reference/audit.native.md) |
| `feel [target]` | Evaluate | Gesture, motion and material audit — put a finger on it | [reference/fluid-interfaces.md](reference/fluid-interfaces.md) |
| `polish [target]` | Refine | Final quality pass before shipping | [reference/polish.md](reference/polish.md) |
| `bolder [target]` | Refine | Amplify safe or bland designs | [reference/bolder.md](reference/bolder.md) |
| `quieter [target]` | Refine | Tone down aggressive or overstimulating designs | [reference/quieter.md](reference/quieter.md) |
| `distill [target]` | Refine | Strip to essence, remove complexity | [reference/distill.md](reference/distill.md) |
| `harden [target]` | Refine | Production-ready: errors, i18n, edge cases | [reference/harden.md](reference/harden.md) |
| `onboard [target]` | Refine | Design first-run flows, empty states, activation | [reference/onboard.md](reference/onboard.md) |
| `animate [target]` | Enhance | Add purposeful animations and motion | [reference/animate.md](reference/animate.md) + [reference/fluid-interfaces.md](reference/fluid-interfaces.md) |
| `colorize [target]` | Enhance | Add strategic color to monochromatic UIs | [reference/colorize.md](reference/colorize.md) |
| `typeset [target]` | Enhance | Improve typography hierarchy and fonts | [reference/typeset.md](reference/typeset.md) + fluid-interfaces §15 |
| `layout [target]` | Enhance | Fix spacing, rhythm, and visual hierarchy | [reference/layout.md](reference/layout.md) |
| `delight [target]` | Enhance | Add personality and memorable touches | [reference/delight.md](reference/delight.md) |
| `overdrive [target]` | Enhance | Push past conventional limits | [reference/overdrive.md](reference/overdrive.md) |
| `clarify [target]` | Fix | Improve UX copy, labels, and error messages | [reference/clarify.md](reference/clarify.md) |
| `adapt [target]` | Fix | Adapt for different devices and screen sizes | [reference/adapt.md](reference/adapt.md) · native: [reference/adapt.native.md](reference/adapt.native.md) |
| `optimize [target]` | Fix | Diagnose and fix UI performance | [reference/optimize.md](reference/optimize.md) |
| `live` | Iterate | Visual variant mode: pick elements in the browser, generate alternatives | [reference/live.md](reference/live.md) |

`animate`, `adapt`, `polish`, `audit`, `onboard` and `feel` all load
[reference/fluid-interfaces.md](reference/fluid-interfaces.md) in addition to their own playbook.

`feel` is the merged skill's own command and has no separate playbook — it runs
`fluid-interfaces.md` as a checklist against a real surface. Work it in this order, because each
step is invisible until the one before it is right: **response → tracking → interruptibility →
velocity handoff → momentum → material → accessibility signals**. Report what you actually put a
finger on; a `feel` audit conducted by reading source alone is a guess, and should say so.

Routing:

- **No argument:** read [routing.md](reference/routing.md) and present its context-aware menu; never auto-run a command.
- **Explicit or clearly implied command:** load its reference (native variant on native platforms) and follow it. Ask once if two commands fit.
- **Otherwise:** treat the request as general design work. Missing PRODUCT.md routes a new surface or replacement world through init, then new-work; a narrow refinement of existing code proceeds on the incumbent implementation as context.mjs directs, offering init afterward rather than blocking on it.
- `teach` aliases `init`. `craft` is a deprecated alias for ordinary new-work and adds nothing. `shape` owns task discovery, then enters new-work only for visual-world and surface-concept decisions.

After init writes PRODUCT.md, resume without rerunning `context.mjs`; init loads the native platform reference itself when the platform it recorded is `ios`, `android`, or `adaptive`.

**Pin / Unpin:** `node .claude/skills/ultimate-design/scripts/pin.mjs <pin|unpin> <command>` creates or removes a standalone `/<command>` shortcut. Report the script's result concisely; relay stderr verbatim on error.

**Hooks:** `/ultimate-design hooks <on|off|status|ignore-rule|ignore-file|ignore-value|reset>` manages the design detector hook for this project (auto-runs the detector after UI file edits and surfaces findings). Load [reference/hooks.md](reference/hooks.md) when the user invokes it with any argument.

**Doctor:** `/ultimate-design doctor` reports and repairs drift between this project's design artifacts (PRODUCT.md, DESIGN.md and its sidecar, config, surface briefs, the hook) and what this version reads. Load [reference/doctor.md](reference/doctor.md) when the user invokes it, or when they ask what is out of date, stale, or needs refreshing. A `CONTEXT_STALE` directive in Setup's output is the cheap subset of the same report; act on it there per its own instructions rather than running doctor unasked.

**Never repair drift as a side effect of a design task.** A `CONTEXT_STALE` finding is reported, not acted on, unless the user asks. The one exception is a finding marked `auto`, which the next write to that file performs anyway.

## Process

- **Prototype interactively — an interactive demo is worth "a million static designs."** You discover the interface by building and playing with it; a working prototype also sets a concrete bar that prevents a mediocre final implementation.
- **Design interaction and visuals together.** Motion is not a layer added after the pixels.
- **Test with real people in real context**, and review motion with fresh eyes — play it in slow motion / frame-by-frame to catch what's invisible at full speed.

## Provenance

The command system, modes, reference playbooks and scripts come from **Impeccable v4.0.4**
(Apache 2.0), retained here in full. The behavioural layer in
[reference/fluid-interfaces.md](reference/fluid-interfaces.md) is distilled from Apple's WWDC
design talks. This merged skill supersedes the separate `impeccable` and `apple-design` skills;
neither should be installed alongside it.
