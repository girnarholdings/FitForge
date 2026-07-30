---
name: FitForge
description: A training log forged like the equipment it tracks — warm iron, machined edges, copper heat.
colors:
  surface: "#131010"
  surface-2: "#1d1815"
  elevated: "#282019"
  foreground: "#f3ede5"
  muted: "#231d18"
  muted-foreground: "#a89e93"
  border: "#2c2520"
  border-strong: "#4a4036"
  accent: "#c98963"
  accent-hover: "#d99b76"
  accent-press: "#b0714c"
  accent-foreground: "#1c0f08"
  accent-muted: "#2b1d14"
  accent-soft: "#dba888"
  energy: "#e2703a"
  energy-muted: "#2a170e"
  danger: "#ff6b70"
  success: "#3ecf8e"
  info: "#7cb4ff"
typography:
  display:
    fontFamily: "Big Shoulders, Arial Narrow, Oswald, sans-serif-condensed, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "0.01em"
  title:
    fontFamily: "Big Shoulders, Arial Narrow, Oswald, sans-serif-condensed, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "0.012em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.025em"
rounded:
  card: "1.5rem"
  field: "1rem"
  sm: "0.75rem"
  chip: "9999px"
spacing:
  card-pad: "1rem"
  stack-gap: "1rem"
  sheet-pad: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.field}"
    height: "44px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-press}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.field}"
    height: "44px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.field}"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.field}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.chip}"
    padding: "8px 14px"
  chip-selected:
    backgroundColor: "{colors.accent-muted}"
    textColor: "{colors.accent}"
    rounded: "{rounded.chip}"
    padding: "8px 14px"
---

# Design System: FitForge

## Overview

**Creative North Star: "Forged Iron"**

FitForge's world is the forge itself: warm iron surfaces (charcoal with heat under it, never blue-black), machined edges, and copper as the single voice of emphasis. The whole token system lives in `apps/web/app/globals.css` under the name "Forged Iron"; dark is the brand default (`:root`, `color-scheme: dark`) and the light "Ivory" theme is opt-in only via `<html data-theme="light">` — never auto-switched on OS preference. Depth is machined, not glowing: a 1px inset top-light where a milled edge would catch light, plus true offset shadows that fall down as light demands. Progress is heated stock — copper filling toward the goal with ember at the leading edge — rendered as bars, never rings.

The direction contract is shipped inside the artifact itself (`apps/web/app/layout.tsx` embeds it as a production HTML comment). It is the world's charter and is quoted here verbatim as binding:

> **THESIS:** A training log forged like the equipment it tracks. One surface owns the athlete's whole loop and refuses the dark-dashboard default: no uniform card stacks, no glow ambience, no kicker labels, no emoji garnish.
> **OWN-WORLD:** Warm iron surfaces (charcoal with heat under it, never blue-black), machined edges (1px top-light), true offset shadows, copper as the only accent and ember strictly as HEAT-STATE — the leading edge of real progress. Big Shoulders condensed for headings and hero numerals; Archivo for everything spoken at UI size; drawn 1.75-stroke icons, food included.
> **STORY:** Open the app, see today's work at full scale, log it, watch the metal heat toward the goal.
> **FIRST VIEWPORT (Today, 390px):** date strip, then the workout as the single anchor — day name in Big Shoulders, copper start CTA with knurl band — readiness beneath it, nutrition as one heat-bar row.
> **FORM:** Owner-pinned (forged metal, dark + copper; logo untouched); pin beats the roll.

Owner pins (confirmed in PRODUCT.md, 2026-07-30): dark + copper IS the brand; the anvil-and-smiths logo mark (`apps/web/public` brand assets) is pinned untouched — enhancement permitted, replacement not. Leaving this world is out of scope for any future session.

**Key Characteristics:**
- Warm iron neutrals — every gray carries a whisker of heat; blue-black is the named anti-reference.
- One accent (copper), one heat state (ember), one progress grammar (the heat bar).
- Machined depth: inset top-lights and true offset shadows; zero-offset halos are banned.
- Two faces with a hard division of labor: Big Shoulders condensed for headings and hero numerals, Archivo for everything else.
- Drawn 1.75-stroke icons on a 24 grid — food included; emoji are not an icon system here.
- Phone-first: 390×664 target viewport, bounded 3-zone screen shell, ≥44px touch targets.

## Colors

A near-black warm-iron ground with copper as the sole accent; every other hue is a functional state, not an identity. Values in the frontmatter are the dark (brand) theme and are normative; the light Ivory counterparts live in `globals.css` under `:root[data-theme='light']` (accent shifts to bronze `#8f5432` for AA on light).

### Primary
- **Copper** (`--accent`): the only accent in the world. Primary CTAs (near-black ink text on copper — the highest-contrast element on screen), selected states, the body of every progress fill. Interaction ladder: `--accent-hover` (lighter), `--accent-press` (darker).
- **Copper family**: `--accent-foreground` (the near-black ink that rides on copper), `--accent-muted` (selected-chip fill), `--accent-soft` (the quieter copper used where full accent would shout — e.g. the carbs bar).

### Secondary
- **Ember** (`--energy`): heat-state ONLY. It is the leading ~15% of a growing progress fill (via `.ff-heat`) and the whole bar when a target is exceeded ("the metal is past temperature"). It is never ambience, never decoration, never a category color. `--energy-muted` is its dim ground.

### Neutral
- **Iron black** (`--surface`): the page. Warm, never blue.
- **Lifted iron** (`--surface-2` → `--elevated`): elevation is FILL separation — each layer up is a slightly warmer, lighter iron.
- **Forge white** (`--foreground`): primary text. **Ash** (`--muted-foreground`): secondary text. **Muted** (`--muted`): unfilled track fills.
- **Borders** (`--border`, `--border-strong`): a whisper — borders outline, surfaces separate. `--border-strong` is the hover/emphasis step.
- **Muscle-map inks**: `--muscle-base`, `--muscle-line`, `--body-outline` — the anatomical illustration's own neutrals.

### State
- **Danger** (`--danger`), **Success** (`--success`), **Info** (`--info`): functional states only. Green marks a TRUE success state (a thing that succeeded), never a macro, never an identity hue — carbs were once green and were deliberately repainted copper-soft (`components/features/nutrition/DaySummary.tsx` records the decision).

### Named Rules
**The One Accent Rule.** Copper is the only accent. A second identity hue anywhere — including per-macro colors — breaks the world. Macros are told apart by label and value, not by hue.

**The Heat-State Rule.** Ember (`--energy`) appears strictly as heat-state: the leading edge of real progress and the honest over-target signal. Never as ambience, backgrounds at rest, or emphasis.

**The Warm Iron Rule.** Every neutral carries warmth. Blue-tinted neutrals (`#0b121a`–`#3e4a58`, the retired palette) are the named anti-reference — "the most saturated AI-dashboard look there is."

## Typography

**Display Font:** Big Shoulders (condensed industrial grotesque; fallbacks Arial Narrow, Oswald, sans-serif-condensed)
**Body Font:** Archivo (workhorse grotesque with real tabular figures; fallbacks ui-sans-serif, system-ui)

Both are self-hosted at build time via `next/font/google` in `apps/web/app/layout.tsx` (static-export/offline safe), exposed as `--font-big-shoulders` / `--font-archivo` and mapped to `--font-display` / `--font-sans` in `globals.css`.

**Character:** Industrial and matter-of-fact. Big Shoulders was drawn for Chicago's "City of Big Shoulders" identity — steel, railyards, forges; Archivo descends from foundry types built for dense information settings and carries labels, body, buttons and data at 13–15px without drama. The retired pair (Inter + Space Grotesk) is a named anti-reference.

### Hierarchy
- **Display** (700, `--text-display` 2rem / 1.04, +0.01em): screen headings (the weekday on Today) and hero numerals (the kcal-left figure). Always `font-display`. Because Big Shoulders is condensed it takes a size step MORE than Archivo would need, and wants neutral-to-positive tracking — negative tracking welds a condensed gothic shut.
- **Title** (700, `--text-title` 1.375rem / 1.12, +0.012em): section-level headings, also tuned for Big Shoulders.
- **Body** (400–500, `text-sm`/`text-base` 14–16px): Archivo. ~94% of the app's strings sit at ≤15px; that density is the house voice.
- **Label** (600, 10px, uppercase, `tracking-wide`): Archivo. Reserved for terse DATA labels only (e.g. the stat labels in `components/features/settings/ProfileCard.tsx`) — never as a kicker above a heading.
- **Data numerals**: `.tabular` (`font-variant-numeric: tabular-nums`) on every number that sits in a row or column. Load-bearing (PRODUCT.md durable constraint).

### Named Rules
**The Two Faces Rule.** Big Shoulders = headings + hero numerals ONLY. Archivo = everything else — labels, body, buttons, data. A Big Shoulders label or body line is a defect.

**The No-Kicker Rule.** No kicker/eyebrow labels above headings. Uppercase micro-labels exist solely as terse data labels beside values. Emphasis is weight, size, or solid copper — never gradient text (`.text-gradient-gold` was deleted from the system; the comment in `globals.css` records why).

**The Density Mechanism.** `.ff-dense` on a screen container re-scales the whole Tailwind type ramp to ~93% (it overrides the `--text-*` custom properties, which cascade to every descendant utility). TYPE ONLY — `--spacing` is untouched so every 44px target stays 44px. Today and Nutrition wear it; any number-dense screen may.

## Layout

Phone-first at a target of **390×664 CSS px** (iPhone Safari with URL bar + toolbar visible). Desktop is secondary; a single-column screen caps at **720px** unless a real second column exists.

- **The screen shell** (`globals.css`): `.screen` is a bounded 3-zone flex column — fixed header / `.scroll-region` / `.cta-dock`. The shell owns the height (`100svh`), so the page never scrolls, the iOS URL bar never collapses mid-gesture, and the primary CTA is permanently parked in the thumb zone. `.scroll-region` is the ONE region allowed to scroll. `.cta-dock` sits outside it (can never be covered), clears the home indicator via `env(safe-area-inset-bottom)`, and collapses when empty. `.safe-top` clears the notch.
- **Unit policy:** `svh` for shells (never overflows on first paint), `vh` as legacy fallback, and NEVER `dvh` for anything whose height animates — dvh jitters as the URL bar slides. (`viewportFit: 'cover'` in `layout.tsx` is required for the safe-area insets to report at all.)
- **These primitives are UNLAYERED** and beat Tailwind's layered utilities: never pair `.cta-dock` with `empty:hidden`, `.scroll-region` with `flex-*`, or `.safe-top` with `pt-*` on the same element.
- **Desktop opt-out:** a screen that has DESIGNED a desktop sets `data-flow="desktop"`; at ≥900px the clamp releases (auto height, visible overflow, transparent dock).
- **Floating-chrome clearance:** `--dock-clearance` (`calc(9rem + env(safe-area-inset-bottom))`) is the bottom padding every scrolling app screen owes the tab pill + Coach badge. A token so bar and padding can never drift apart (the badge covering a CTA shipped as a bug twice).
- **Rhythm:** cards pad at 16px (`p-4`); screens stack on a 16px gap (`space-y-4`); chips/buttons use the Tailwind 4px scale. Touch targets ≥44px everywhere (the md button is `h-11`).

### Named Rules
**The One Anchor Rule.** One full card per screen region earns a card; secondary content rides hairline ledger rows (flat, `divide-y`-style rows), not more cards. Today's composition — the workout as the single anchor card, readiness and nutrition beneath — is the reference (`components/features/today/TodayView.tsx`).

**The Heading Is the Date Rule.** Screen headings state facts (the full weekday, the date), never greetings ("Good afternoon, Athlete" is the recorded anti-pattern).

## Elevation & Depth

Depth is **machined**: a hybrid of fill separation and true offset shadows, crowned by a 1px inset top-light — the highlight a milled edge catches. Elevation between layers is primarily FILL (`--surface` → `--surface-2` → `--elevated`), with borders as a whisper. On a near-black page the inset top-light is the layer that actually reads; large soft blurs are mostly paint cost.

### Shadow Vocabulary
- **Card** (`--elev-card`, mapped to `shadow-card`): `inset 0 1px 0 rgba(255,255,255,0.055)` top-light + two downward drops (`0 2px 6px -2px rgba(0,0,0,0.65)`, `0 12px 28px -16px rgba(0,0,0,0.95)`). The default card depth.
- **Pop** (`--elev-pop`, `shadow-pop`): `0 16px 48px -12px rgba(0,0,0,0.75)` + 1px white ring at 4% — floating/overlay chrome.
- **Ember depth** (`--elev-ember`, mapped to the legacy-named `shadow-glow` utility): a TRUE offset shadow that happens to be warm — warm inset top-light, dark drop, then `0 10px 28px -10px rgba(226,112,58,0.38)` falling DOWN. Reserved for the ONE hero action on a screen (Button `glow` prop). It replaced a zero-offset copper halo; despite the utility's name it is depth, not glow.
- **Dock** (`.cta-dock`): an upward `0 -14px 22px -14px` shade separating the docked CTA from the scroll behind it.

### Texture
- **Knurl** (`.ff-knurl`, `--knurl` ≤12% alpha): the cross-hatch grip band cut into a hero CTA — vertical hairlines at a 5px pitch, hard-masked to the band either side of the label (22/38–62/78%). A TEXTURE, never a bevel; inverted on the light theme so it can't eat the label's contrast. Gated by convention to the ONE full-width primary CTA on a screen.
- **Gold hairline** (`.border-gradient-gold`): the 1px copper gradient border that makes a card "forged" (premium).

### Named Rules
**The Machined Edge Rule.** Depth = 1px inset top-light + true offset shadows falling down. Zero-offset halos ("glow") are banned from the token file — decoration is not depth.

## Shapes

**One radius family: 12 / 16 / 24 (+ pill).** `--radius-card` 24px for cards and sheets, `--radius-field` 16px for buttons and inputs, `--radius-sm` 12px for thumbnails and small tiles, `--radius-chip` 9999px for capsule chips. The raw Tailwind radius names (`rounded-lg/xl/2xl/3xl`) are ALIASED onto this family in `globals.css` `@theme`, so stray call sites snap into line — an audit found nine radii in play before the aliasing; do not reintroduce off-family values.

Recurring silhouettes come from the gym: the collared barbell (ProgressBar's `variant="bar"` end caps), the knurl grip band, the pill chip. Bottom sheets square only their top corners on phones (`rounded-t-3xl`, fully rounded ≥sm).

## Components

The vocabulary lives in `apps/web/components/ui/` (barrel: `index.ts`).

### Buttons (`Button.tsx`)
- **Shape:** field radius (16px); sizes sm/md/lg = h-9/h-11/h-14; `block` for the full-width docked CTA.
- **Primary:** copper fill, near-black ink (`bg-accent text-accent-foreground`) — the highest-contrast, eye-drawing element. Hover `--accent-hover`, press `--accent-press`.
- **Secondary:** `surface-2` fill, 1px border brightening to `border-strong` on hover. **Ghost:** transparent, `surface-2` on hover. **Danger:** `--danger` fill, white text.
- **Press feel:** Motion `whileTap` scale 0.97 on `SPRING.press` — fires on pointerdown, the app's core "your finger landed" signal. Color/shadow stay on CSS transitions (150ms).
- **Focus:** `focus-visible:outline-2 outline-offset-2 outline-accent` (the house focus treatment on every interactive primitive).
- **`glow`:** the ember-depth shadow — reserved for the ONE hero action per screen; never two.
- **`texture`:** the knurl band — gated to the one full-width primary CTA (Start/Finish workout, onboarding Continue); suppressed while disabled/loading.

### Cards (`Card.tsx`)
- **Standard:** `surface-2` fill, 1px `border`, 24px radius, 16px padding, `--elev-card` shadow.
- **Premium** ("forged"): gold gradient hairline (`.border-gradient-gold`) replacing border+fill. Reserved for the plan-preview card, PR cards, the Today hero, `DaySummary`, `ProfileCard`.
- **Steel** (`variant="steel"`): machined-metal faceplate — top-lit vertical gradient (`--elevated` → `--surface-2` at 22%) + 1px inner highlight. Rationed to the two STRUCTURAL anchors (Today hero, workout player set card); mutually exclusive with premium — a card is forged gold or machined steel, never both. (On light Ivory the gradient intentionally no-ops to flat white.)
- **Flat:** shadowless, for long lists — 91 cards × a two-layer blur is real paint cost; hairline-separated flat rows read cleaner.
- **States:** `selected` = accent border + 2px accent ring; `interactive` = `.ff-press-soft` + hover border-strengthen + house focus outline.

### Chips (`Chip.tsx`)
- **Style:** pill capsule, `text-sm font-medium`, `px-3.5 py-2`; unselected `surface-2` + border; selected `accent-muted` fill + accent border + accent text.
- **Selection marker:** a check icon that springs from zero width (CSS-only transition) — a check, not a bar, because "a selection indicator that has to be explained has already failed." Anything added to a chip must be `aria-hidden` and add no text node (the E2E suite matches exact accessible names).
- **Press:** `.ff-press` (scale 0.97 on `:active`).

### Sheets (`Sheet.tsx`)
- Bottom sheet, slides up with `SPRING.sheet` over a fading `bg-black/50 backdrop-blur-sm` scrim; exit is a faster short tween (160ms ease-in) because dismissal should feel immediate. `rounded-t-3xl`, max-w 430px, `max-h-[85dvh]`, drag handle on phones, safe-area bottom padding, Escape + scrim close, body scroll locked.

### Progress (the heat grammar)
- **`.ff-heat`** (globals.css) is the progress fill for anything that visibly grows: copper body (`--accent-press` → `--accent` at 62%) running into ember at the leading ~97%, "the way a bar fresh from the fire is hottest at the working end." Over target, the whole bar goes solid ember — the honest signal. Reference composition: `DaySummary` (hero numeral + day heat bar + three macro rows; protein wears full heat as the actionable bar, carbs `--accent-soft`, fat `--energy`).
- **`ProgressBar.tsx`**: 6px track (`bg-muted`), copper fill scaling on transform (300ms). `variant="bar"` adds `border-strong` collar caps on each end so a filling bar reads as a BARBELL loading — reserved for training progress; the onboarding counter keeps the plain track.
- **Discrete pips and rings stay solid** — heat is for bars that grow. **`MacroRing.tsx` is RETIRED from product surfaces** (nothing imports it outside the barrel): heat bars replaced rings, and the "big number, small caps label" donut header is the floor's refused default. Do not reintroduce rings for progress.

### Icons (`icons.tsx`, `foodIcons.tsx`)
- One grammar for every icon in the app: **24×24 viewBox, 1.75 strokeWidth, round caps and joins, `fill="none"`, `stroke="currentColor"`, `aria-hidden`** — icons inherit surrounding text color and size.
- The food set (`foodIcons.tsx`) is drawn on the same grid — a chicken-breast row and the dumbbell tab speak one language. Its resolver mirrors the retired emoji table: name keywords outrank category, first match wins, ordered specific → generic.
- Emoji are not an icon system here (owner-confirmed). Icons should read literally — the settings cog grew real teeth because eight radiating spokes read as a sun.

### Motion (`motion.tsx` + `globals.css` keyframes)
- One `MotionProvider` at the root owns the lazy feature bundle and the global reduced-motion contract.
- **Spring presets** (`SPRING`): `press` 700/34/0.55 (taps — direct physical response), `panel` 420/38/0.9 (arrivals), `sheet` 340/36/1 (heavy, carries weight), `settle` 180/30/1 (numbers/bars, overshoot-free). **Press scales:** `PRESS` 0.97, `PRESS_SOFT` 0.985 (a whole card at 0.97 lurches).
- **CSS feedback:** `.ff-press` / `.ff-press-soft` — compositor-only `:active` scale for plain elements (hover never fires on a phone; every tappable thing needs an `:active` answer). Safe on 91-row lists.
- **Keyframe kit** (`ff-spark`, `ff-ripple`, `ff-pop`, `ff-pop-fade`, `ff-shimmer`, `ff-halo`, `ff-rise-in`, `ff-tab-spark`, `ff-ember-breathe`, `ff-shake`): every keyframe animates ONLY transform + opacity; celebration consumers are `inset-0` / `pointer-events:none` overlays; everything is additionally gated in JS on `prefers-reduced-motion` (the global collapse alone would park `both`-filled elements on their end frame).

## Do's and Don'ts

### Do:
- **Do** keep dark + copper as the brand: dark `:root` is default, light Ivory only via explicit `data-theme="light"`; the anvil logo is pinned untouched.
- **Do** put `.tabular` on every data numeral and keep touch targets ≥44px (md button = `h-11`; `.ff-dense` scales type only, never spacing).
- **Do** render continuous progress as heat bars (`.ff-heat`), with solid ember only when over target; keep discrete pips and rings solid.
- **Do** ration the signature treatments: one `glow` hero action per screen, knurl only on the one full-width primary CTA, `steel` only on structural anchors, `premium` only on the few forged cards.
- **Do** draw every icon on the 24-grid / 1.75-stroke / round-caps / `currentColor` grammar, food included.
- **Do** give every tappable element an `:active` answer (`.ff-press`/`.ff-press-soft` or Motion `whileTap`), and the house focus ring (`outline-accent`, 2px, offset 2).
- **Do** compose screens as one anchor card + hairline ledger rows; build app screens on the `.screen` / `.scroll-region` / `.cta-dock` shell with `svh` units and `--dock-clearance`.

### Don't:
- **Don't** use gradient text — emphasis is weight, size, or solid copper (`.text-gradient-gold` was deleted; do not recreate it).
- **Don't** use zero-offset glows/halos — depth is the 1px inset top-light plus true offset shadows falling down.
- **Don't** use emoji as icons, kicker/eyebrow labels above headings, or uppercase micro-labels for anything but terse data labels.
- **Don't** introduce a second accent: ember is heat-state only, green is a true success state only — never macro or identity hues.
- **Don't** set Big Shoulders on labels or body copy, or negative-track it anywhere.
- **Don't** bring back rings for progress (`MacroRing` is retired from product surfaces), blue-tinted neutrals, or the Inter/Space Grotesk pairing.
- **Don't** use `dvh` for animated heights, off-family radii (the family is 12/16/24 + pill), or Tailwind layered utilities against the unlayered shell primitives (`.cta-dock` + `empty:hidden`, etc.).
- **Don't** cap desktop single-column layouts wider than 720px unless a real second column exists.
