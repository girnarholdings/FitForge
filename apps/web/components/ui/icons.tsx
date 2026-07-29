import * as React from 'react';

/**
 * FitForge icon set — a small, consistent family of stroke icons (1.75 stroke, round caps/joins),
 * replacing emoji so the UI reads as a designed product rather than a template. Icons inherit
 * `currentColor` and size via `1em`/props, so they take the surrounding text color and size.
 */
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

function Svg({ size = 24, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </Svg>
);

export const DumbbellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6.5 17.5 17.5" />
    <path d="m3 8 2-2M8 3l-2 2" transform="translate(-0.5 -0.5)" />
    <rect x="1.8" y="6.3" width="3.2" height="6" rx="1" transform="rotate(-45 3.4 9.3)" />
    <rect x="19" y="11.7" width="3.2" height="6" rx="1" transform="rotate(-45 20.6 14.7)" />
  </Svg>
);

export const AppleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 8c-1.5-1.5-4-2-5.5-.5C4.7 9 5 12.5 6.5 15.5 7.6 17.7 9 20 12 20s4.4-2.3 5.5-4.5C19 12.5 19.3 9 17.5 7.5 16 6 13.5 6.5 12 8Z" />
    <path d="M12 8c0-1.5.3-3.2 2-4" />
  </Svg>
);

export const TrendingUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 16.5 9 10l4 4 8-8" />
    <path d="M16 6h5v5" />
  </Svg>
);

/**
 * Settings — a real COG, with teeth.
 *
 * This was a circle with eight radiating spokes, which is the universal drawing of a sun or a
 * spark, not a gear. It sat directly beside the theme toggle, which IS a sun, so the top bar
 * carried two near-identical glyphs and neither said "settings". Reported as "it looks like a
 * flash icon" — correctly.
 *
 * A gear reads as a gear because the teeth are closed shapes attached to the rim, not lines
 * pointing away from it.
 */
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a1.94 1.94 0 0 1-3.88 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a1.94 1.94 0 0 1 0-3.88h.1a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a1.94 1.94 0 0 1 3.88 0v.1a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a1.94 1.94 0 0 1 0 3.88h-.1a1.6 1.6 0 0 0-1.47.97Z" />
  </Svg>
);

export const FlameIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c.5 3-2 4.2-2 7a2 2 0 1 0 4 0c1 1 1.5 2.2 1.5 3.5A5.5 5.5 0 0 1 6.5 13c0-3.3 2.5-4.8 3-7 .2-1 .3-2 2.5-3Z" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6 18 18M18 6 6 18" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5 8 12l7 7" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const ScaleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M8 8h8" />
    <circle cx="12" cy="14" r="3" />
    <path d="M12 14v-2.5" />
  </Svg>
);

/**
 * NO CALL SITES as of the gym-vocabulary pass, and kept deliberately rather than deleted like
 * TrophyIcon was. Today's nutrition card — its only user — now wears the {@link ShakerIcon} the
 * Nutrition tab wears, because one destination must not have two icons, and because restaurant
 * cutlery is the wrong register for an app that logs macros rather than booking dinner. It stays
 * exported because a FOOD-ITEM context (a meal row, a recipe) is a different subject from a macro
 * target and would want it. If nothing claims it by the next pass, delete it.
 */
export const UtensilsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v7a2 2 0 0 0 2 2v9M8 3v6M4 3v6M17 3c-1.5 0-2.5 2-2.5 5S15.5 13 17 13v8" />
  </Svg>
);

export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Z" />
    <path d="M5 19.5A1.5 1.5 0 0 1 6.5 21H19" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5 13 11l2.5 1-2.5 1-1 2.5-1-2.5L8.5 12 11 11Z" />
  </Svg>
);

/**
 * NO CALL SITES as of the gym-vocabulary pass, and kept for the same reason as
 * {@link UtensilsIcon}. Both of its users — the Coach header and Today's coach entry card — now
 * wear the {@link CoachIcon} the Coach tab wears: an entry point and its destination cannot be
 * two different objects, and a speech bubble framed the coach as a chatbot rather than as someone
 * who tells you what to do. A genuine MESSAGE (a note left on a set, a comment) is a different
 * subject and would want this. If nothing claims it by the next pass, delete it.
 */
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9.5L4.5 20Z" />
    <path d="M8 8.5h8M8 12h5" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12 20 4.5 15.5 20l-4-6.5Z" />
    <path d="M11.5 13.5 20 4.5" />
  </Svg>
);

/**
 * Dartboard — a NUMERIC GOAL, and nothing else any more.
 *
 * It used to mean two things: a goal, and "the muscles this exercise hits". Seven screens carried
 * the second meaning, which made it the most-repeated generic-web metaphor left in the app, and one
 * glyph with two meanings is worse than either of them alone. Those seven now use {@link BodyIcon},
 * an authored silhouette that already meant exactly that on the heat map. Two call sites survive —
 * the landing page's "A plan tuned to you" and onboarding's welcome highlight — where the subject
 * genuinely is a target you are aiming at.
 */
export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h15M13 6l7 6-7 6" />
  </Svg>
);

/* TrophyIcon used to live here. It is gone on purpose — see {@link MedalIcon}, which already
 * claimed "a personal record" and now holds both of the call sites the trophy had (the PR card
 * header and the strength-trend header). A trophy is a generic gamification glyph; a medal on a
 * ribbon is the object a lifter actually earns. A dead export is a lie about what the set covers. */

export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7-4.5-9.2-9C1.3 8 2.6 4.8 5.8 4.8c2 0 3.2 1.4 4.2 2.8 1-1.4 2.2-2.8 4.2-2.8 3.2 0 4.5 3.2 3 6.2C19 15.5 12 20 12 20Z" />
  </Svg>
);

export const RunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="15.5" cy="4.5" r="1.6" />
    <path d="M13 9 9.5 11 7 9M13 9l-3 3 2 4-1 4M12 12l3 1 1 4M8.5 13.5 6 21" />
  </Svg>
);

export const BuildingIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="3" width="15" height="18" rx="2" />
    <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10.5 21v-3h3v3" />
  </Svg>
);

export const PlaneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13 3.5 11 2 12.5l4 3 1 4 1.5-1.5-.5-3.5 4-2 3.5 6 2-1-1.5-8 3-2.2a2 2 0 0 0-2-3.4L15 8.5 7 6 5.5 7Z" />
  </Svg>
);

export const LeafIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-9 6-13 14-13 0 8-4 14-13 14M5 19c2-4 5-6 9-7" />
  </Svg>
);

/** Level indicator (1–3 filled bars) — used for experience level. */
export const SignalBarsIcon = ({
  level = 3,
  size = 24,
  ...p
}: IconProps & { level?: 1 | 2 | 3 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    {...p}
  >
    <rect x="3" y="14" width="4" height="7" rx="1.3" fill="currentColor" opacity={level >= 1 ? 1 : 0.28} />
    <rect x="10" y="9" width="4" height="12" rx="1.3" fill="currentColor" opacity={level >= 2 ? 1 : 0.28} />
    <rect x="17" y="4" width="4" height="17" rx="1.3" fill="currentColor" opacity={level >= 3 ? 1 : 0.28} />
  </svg>
);

export const FilterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h18M6 12h12M10 19h4" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5h.01" />
  </Svg>
);

export const RepeatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9a5 5 0 0 1 5-5h8l-2.5-2.5M20 15a5 5 0 0 1-5 5H7l2.5 2.5" />
  </Svg>
);

/** Lightning bolt — the quick-workout entry point. */
export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </Svg>
);

/** Stacked plates — "several days condensed into one" in the quick-workout picker. */
export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);

/** Sliders — "tune this target" on a muscle row. */
export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="16" cy="18" r="2" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);

export const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 12h10M17 9l3 3-3 3" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
    <path d="M3.5 9h17M8 3v3M16 3v3" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

/* ── added for the "Forged Gold" rebrand (consumed by WS-C/D/E/F/G) ── */

/** Stopwatch — the rest timer (WS-F WorkoutPlayer, P0-5). Distinct from ClockIcon (time-of-day). */
export const TimerIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="14" r="8" />
    <path d="M12 14V9.5" />
    <path d="M9.5 2h5" />
    <path d="M12 2v2" />
    <path d="M18.6 7.4 20 6" />
  </Svg>
);

/** Swap — quick-swap / substitute an exercise (WS-F, WS-C). One arrow up, one down. */
export const SwapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 20V5M7 5 4 8M7 5l3 3" />
    <path d="M17 4v15M17 19l-3-3M17 19l3-3" />
  </Svg>
);

/** Filled flame — streak milestones ("keep the forge hot", WS-F, P1-11). */
export const FlameSolidIcon = ({ size = 24, ...p }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...p}
  >
    <path d="M12 2.5c.6 3.3-2.2 4.6-2.2 7.5a2.2 2.2 0 0 0 4.4 0c1.1 1.1 1.7 2.4 1.7 3.8A6 6 0 0 1 6 13.5c0-3.6 2.8-5.3 3.3-7.7.2-1.1.4-2.2 2.7-3.3Z" />
  </svg>
);

/** Body silhouette glyph — muscle-map / heatmap nav & filters (WS-C, WS-F). */
export const BodyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="4.6" r="2.4" />
    <path d="M8 21l.6-7.3L7 14l1-3.6C8.4 8.7 10 8.2 12 8.2s3.6.5 4 2.2L17 14l-1.6-.3L16 21" />
  </Svg>
);

/** 4-point spark star (filled) — the signature "strike"/PR moment (matches the logo spark). */
export const SparkIcon = ({ size = 24, ...p }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...p}
  >
    <path d="M12 2 13.9 10.1 22 12 13.9 13.9 12 22 10.1 13.9 2 12 10.1 10.1Z" />
  </svg>
);

/** Export — download a JSON backup of Local Mode data (WS-E settings, P2-16). Arrow up out of tray. */
export const ExportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4" />
    <path d="M8.5 7.5 12 4l3.5 3.5" />
    <path d="M5 13v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5" />
  </Svg>
);

/** Import — restore Local Mode data from a JSON file (WS-E settings, P2-16). Arrow down into tray. */
export const ImportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <path d="M8.5 11.5 12 15l3.5-3.5" />
    <path d="M5 13v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5" />
  </Svg>
);

/** Trash — destructive "Erase Local Mode data" (WS-E). */
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

/* ══════════════════════════════════════════════════════ the GYM sub-family (24×24) ══
 *
 * WHY THIS EXISTS. The set above is a competent generic-web icon family — house, book, apple,
 * chat, layers — and that is exactly the complaint: it could belong to any product. These are the
 * app's own vocabulary: the objects a lifter actually touches. They live in the same `Svg`
 * wrapper (1.75 stroke, round caps/joins, `currentColor`, 0 0 24 24) so nothing about the family's
 * optical weight changes; only what it depicts does.
 *
 * DESIGNED AT 24, NOT SHRUNK FROM 48. The `components/illustrations/equipment` portraits carry
 * 6–12 elements plus a ground line on a 48-unit canvas — at 16–20 px their strokes render
 * sub-pixel and smear into a blob. Everything below is capped at ~6 drawn elements and was laid
 * out for the sizes it is actually used at (16 px buttons, 18 px rows, 22 px tab bar). An
 * unreadable barbell is worse than the generic icon it replaced.
 *
 * DELIBERATELY NOT GYM-IFIED (see the call sites, not this file): chevrons, ×, search, filter,
 * gear, calendar, info, export/import, trash. Those are the app's GRAMMAR — a dumbbell as a close
 * button costs comprehension for zero theme gain.
 */

/**
 * Anvil — the Today tab, tying it to the "Anvil Bar" logo mark so the brand asset earns a second
 * appearance instead of living only on the landing page.
 */
export const AnvilIcon = (p: IconProps) => (
  <Svg {...p}>
    {/* face + horn: the horn is the one silhouette cue that separates an anvil from a plain block */}
    <path d="M3.2 8h10.3c2.1 0 3.6 1 5.6 2.4-2 1.4-3.5 2.1-5.6 2.1H3.2Z" />
    {/* waist */}
    <path d="M8.6 12.5 7.6 16.6M12.4 12.5l1 4.1" />
    {/* base */}
    <path d="M5.8 16.6h12v3.9h-12z" />
  </Svg>
);

/**
 * Barbell — programmed barbell work (the Workouts tab). Horizontal with two plates a side, which
 * is what distinguishes it at 22 px from the diagonal single-plate {@link DumbbellIcon}.
 * The three centre ticks are knurling: at 22 px they resolve as texture rather than as three
 * countable lines, which is precisely what knurling looks like in the hand.
 */
export const BarbellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 12h10" />
    <path d="M10.8 10.7v2.6M12.4 10.7v2.6M14 10.7v2.6" strokeWidth={1.1} />
    <rect x="1.9" y="7.4" width="2.7" height="9.2" rx="1.1" />
    <rect x="5.2" y="9.4" width="2" height="5.2" rx="0.9" />
    <rect x="16.8" y="9.4" width="2" height="5.2" rx="0.9" />
    <rect x="19.4" y="7.4" width="2.7" height="9.2" rx="1.1" />
  </Svg>
);

/**
 * Weight plate seen face-on: rim, hub, four grip cut-outs. Used wherever the subject is LOAD —
 * the plate-math trigger, the ± buttons of {@link PlateStepper} and {@link Stepper}.
 */
export const PlateIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.8" />
    <circle cx="12" cy="12" r="2.7" />
    <path d="M12 4.2v4.4M12 15.4v4.4M4.2 12h4.4M15.4 12h4.4" />
  </Svg>
);

/**
 * A loaded sleeve — 1, 2 or 3 plates on the bar, unloaded slots ghosted at 0.28.
 *
 * API-COMPATIBLE DROP-IN for {@link SignalBarsIcon}: same `level={1|2|3}` contract, same fill +
 * opacity convention, so the experience step swaps one identifier and nothing else. Signal bars
 * are a phone-reception metaphor; "how much can you handle" is plates.
 */
export const PlateStackIcon = ({
  level = 3,
  size = 24,
  ...p
}: IconProps & { level?: 1 | 2 | 3 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    {...p}
  >
    <rect x="2" y="11" width="20" height="2" rx="1" fill="currentColor" opacity={0.45} />
    <rect x="3.6" y="8" width="4" height="8" rx="1.4" fill="currentColor" opacity={level >= 1 ? 1 : 0.28} />
    <rect x="9.8" y="6" width="4" height="12" rx="1.4" fill="currentColor" opacity={level >= 2 ? 1 : 0.28} />
    <rect x="16" y="4" width="4" height="16" rx="1.4" fill="currentColor" opacity={level >= 3 ? 1 : 0.28} />
  </svg>
);

/**
 * Kettlebell — the Exercises tab.
 *
 * THE WINDOW UNDER THE HANDLE IS THE WHOLE ICON. The first pass drew a shallow arc sitting 0.2
 * units above the bell, and at 22 px the two strokes merged: it rendered as a cloud. The handle is
 * now a proper inverted U with a neck bar closing it off, so there is a real hole to see through
 * at tab-bar size, which is the only thing that says "kettlebell" rather than "blob".
 */
export const KettlebellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.4 12.2V9.6a3.6 3.6 0 0 1 7.2 0v2.6" />
    <path d="M7.6 12.4h8.8" />
    <path d="M7.8 12.6C5.6 14.2 4.5 16.3 4.5 18.3A2.7 2.7 0 0 0 7.2 21h9.6a2.7 2.7 0 0 0 2.7-2.7c0-2-1.1-4.1-3.3-5.7" />
  </Svg>
);

/**
 * Ascending plates seen EDGE-ON on a floor line — the Progress tab, and every "your numbers over
 * time" header under it.
 *
 * THE HUB NOTCH IS THE WHOLE ICON. Three rising rounded rectangles is a bar chart in any product
 * on the app store; the short tick at each plate's mid-height is the centre hole you thread onto a
 * sleeve, and it is the one cue that says "these are plates" rather than "these are bars". At the
 * 22 px tab size the notches resolve as texture, which is acceptable — the ascending silhouette
 * still reads as a chart, so nothing is lost when the detail smears.
 *
 * VERTICAL ON PURPOSE. {@link BarbellIcon} (Workouts) and {@link PlateStackIcon} are both a
 * horizontal bar with plates on it. A third horizontal plate glyph in the same five-slot tab bar
 * would be indistinguishable from the Workouts tab at thumb speed, and a wrong guess in a tab bar
 * costs a navigation. Standing the plates up is the entire defence.
 */
export const PlateChartIcon = (p: IconProps) => (
  <Svg {...p}>
    {/* the floor the plates are stood on — without it they float and read as bars */}
    <path d="M3 20.5h18" />
    <rect x="4.4" y="13" width="4" height="7" rx="1.6" />
    <rect x="10" y="9" width="4" height="11" rx="1.6" />
    <rect x="15.6" y="4.8" width="4" height="15.2" rx="1.6" />
    {/* hub holes, thinned so they read as a detail ON the plate rather than as a fourth element */}
    <path d="M5.4 16.5h2M11 14.5h2M16.6 12.4h2" strokeWidth={1.1} />
  </Svg>
);

/**
 * A coach's clipboard with a BARBELL written on it — the coach's output: a personalized answer,
 * a generated plan, "personalize this for me".
 *
 * It replaces {@link SparkleIcon} at those call sites. A sparkle is the house glyph of every
 * AI product shipped since 2023 and it was standing for the coach's entire value; a clipboard is
 * what a coach physically carries. The mini barbell on the board is what stops it reading as a
 * shopping list — and at 16 px, where the barbell collapses to a smudge, the clip plus the tall
 * rounded board still identifies the object.
 */
export const ClipboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="4" width="15" height="17" rx="2.5" />
    <rect x="9" y="1.8" width="6" height="3.2" rx="1.2" />
    {/* what is written on it: a bar with a plate a side, not a to-do rule */}
    <path d="M8 12h8" />
    <rect x="6.6" y="10.4" width="1.6" height="3.2" rx="0.7" />
    <rect x="15.8" y="10.4" width="1.6" height="3.2" rx="0.7" />
    <path d="M8 16.5h8" />
  </Svg>
);

/** Flat bench — pad on two uprights with feet. Reads as "somewhere to lie down and press". */
export const BenchIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.8" y="7.8" width="18.4" height="3.4" rx="1.7" />
    <path d="M6.6 11.2V18M17.4 11.2V18" />
    <path d="M4.4 18h4.4M15.2 18h4.4" />
  </Svg>
);

/**
 * Squat / power rack — the single object that unambiguously means "commercial gym", which is why
 * it replaces the office-block {@link BuildingIcon} on the location question.
 */
export const RackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.6 20.6V4.4M18.4 20.6V4.4" />
    <path d="M5.6 4.4h12.8" />
    <path d="M2.6 10.4h18.8" />
    <path d="M3.4 20.6h4.4M16.2 20.6h4.4" />
  </Svg>
);

/**
 * Spring collar — the thing you squeeze onto a sleeve to lock a bar. `open` splays the lever ears
 * and cuts a ~50° gap out of the ring; clamped closes both. Drives {@link CollarLatch}, the
 * set-completion control, where "logged" is a collar closing rather than a checkbox ticking.
 */
export const CollarIcon = ({ open = false, ...p }: IconProps & { open?: boolean }) => (
  <Svg {...p}>
    {/* A ~76° gap, not a hairline one. The first pass cut ~50° and at 20 px the C simply read as a
        circle — the state the control exists to communicate was invisible. */}
    {open ? <path d="M16.5 7.7A7 7 0 1 0 16.5 16.3" /> : <circle cx="10.6" cy="12" r="7" />}
    {/* The squeeze levers: splayed apart while the collar is off the bar, pinched together once
        it is clamped. */}
    <path
      d={
        open
          ? 'M17.1 7.3 21.5 5.4M17.1 16.7 21.5 18.6'
          : 'M17.3 10.8 21.5 10M17.3 13.2 21.5 14'
      }
    />
    <circle cx="10.6" cy="12" r="2.3" />
  </Svg>
);

/** Coach's whistle — the Coach tab. A person who tells you what to do, not a speech bubble. */
/**
 * THE COACH — the brand mark's figure, redrawn as a 24-unit stroke icon.
 *
 * Not the LogoMark scaled down. That mark is six FILLED shapes tuned for 64 units; at 20px in the
 * nav its delts and arm merge into one gold lozenge. This is the same idea — built figure, raised
 * sledgehammer — rebuilt in the stroke vocabulary every other icon here uses, with the detail
 * count cut to what a 20px glyph can actually carry: shoulders, head, hammer. No waist taper, no
 * separate arm mass; the shoulder line does the work of saying "built".
 */
export const CoachIcon = (p: IconProps) => (
  <Svg {...p}>
    {/* head */}
    <circle cx="9" cy="6.2" r="2.9" />
    {/* shoulders — the widest line in the glyph, which is what reads as strong */}
    <path d="M3.4 17.5c0-3.6 2.5-6.1 5.6-6.1s5.6 2.5 5.6 6.1" />
    {/* torso */}
    <path d="M9 11.4v9.4" />
    {/* raised arm to the hammer */}
    <path d="M13.2 13.2 16.8 9.9" />
    {/* sledgehammer: long handle, wide head */}
    <path d="m15.9 11.2 4.6-4.9" />
    <path d="m17.4 3.3 3.9 3.6" />
  </Svg>
);


/**
 * Sledgehammer — the SMITH-RANK crest. The coach's hammer (see {@link CoachIcon}) drawn alone:
 * every finished session is a STRIKE on the anvil, and the rank ladder counts strikes. Two
 * elements only — diagonal handle, wide head — so it stays legible at the 13–16px chip sizes the
 * rank UI actually uses.
 */
export const HammerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 20 9.2-9.2" />
    <path d="m12.2 7.8 4-4 4.2 4.2-4 4Z" />
  </Svg>
);

/** Protein shaker — the Nutrition tab. The one gym object that is genuinely about food. */
export const ShakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7.8" y="2.6" width="8.4" height="3.2" rx="1.1" />
    <path d="M9 5.8h6l1.7 3.4v10.1a2.2 2.2 0 0 1-2.2 2.2H9.5a2.2 2.2 0 0 1-2.2-2.2V9.2Z" />
    <path d="M7.4 13.2h9.3" />
  </Svg>
);

/** Medal — a personal record. Retires the trophy from three meanings down to one (session done). */
export const MedalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.4 2.6 10.9 9M15.6 2.6 13.1 9" />
    <circle cx="12" cy="15.4" r="6" />
    <path d="m12 12.2 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3Z" />
  </Svg>
);

/** Jump rope — conditioning / "build endurance". A training tool, not a stick figure running. */
export const JumpRopeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.4 3.8 6.7 8.4" strokeWidth={3} />
    <path d="M18.6 3.8 17.3 8.4" strokeWidth={3} />
    <path d="M6.9 8.8c-3.5 3.4-2.3 11.2 5.1 11.2s8.6-7.8 5.1-11.2" />
  </Svg>
);

/** Tape measure — body measurements. Ticks make it a measuring tape rather than a plain band. */
export const TapeIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.6" y="8.4" width="18.8" height="7.2" rx="2" />
    <path d="M7 8.4v3M11 8.4v4M15 8.4v3M19 8.4v4" />
  </Svg>
);

/**
 * Chevron up. GENUINELY MISSING until now — the routine editor was shipping a raw "↑" text glyph
 * as a button label, which renders in the user's fallback font at whatever optical weight iOS or
 * Android happens to pick. Mirror of {@link ChevronDownIcon}, so up/down finally match.
 */
export const ChevronUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 15 7-7 7 7" />
  </Svg>
);

/* ═══════════════════════════════════════════════════════ the FORGED-GOLD fill (defs) ══
 *
 * One shared `<linearGradient>` so an active icon can be MOLTEN GOLD — the brand's actual metal,
 * with a light edge and a bronze shadow — instead of a flat accent fill. SVG paint servers resolve
 * by document id, so this renders ONCE (AppShell mounts it) and every `fill="url(#ff-gold-icon)"`
 * in the same document picks it up. The svg is 0×0 and aria-hidden: it is paint, not content.
 */
export function GoldIconDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="ff-gold-icon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6d883" />
          <stop offset="0.45" stopColor="#e4b84d" />
          <stop offset="1" stopColor="#b8862c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Solid icons take `gold` to swap flat `currentColor` for the forged-gold gradient fill. */
export type SolidIconProps = IconProps & { gold?: boolean };
const solidFill = (gold?: boolean) => (gold ? 'url(#ff-gold-icon)' : 'currentColor');

/* ════════════════════════════════════════════════════════ the SOLID pair-family (24×24) ══
 *
 * WHY THESE EXIST. The five primary tabs used to signal "you are here" with COLOUR ALONE — the
 * same outline glyph, gold instead of grey. That is a design tell (every native tab bar in this
 * category swaps outline for filled) and a WCAG 1.4.1 failure: colour was the only channel
 * carrying the state. Each primary tab now owns an outline/solid PAIR and {@link AppShell}
 * crossfades between them, so the state is carried by SHAPE as well as by colour and by the
 * accent-muted pill behind it. {@link DumbbellSolidIcon} was the orphan that started the family.
 *
 * NO KNOCKOUTS. Not one glyph below separates its parts with a background-coloured stroke or
 * fill. The active tab sits on `bg-accent-muted` (mobile pill AND desktop sidebar row), not on
 * `--color-surface`, so a `stroke="var(--color-surface)"` knockout — the trick the 48-unit
 * equipment portraits can legitimately use, because they only ever sit on a surface-coloured
 * field — would paint a surface-coloured bar across an accent-muted pill and either vanish or
 * gash the icon. Interior detail is therefore carried by `fillRule="evenodd"` (the kettlebell's
 * handle window) or by a real gap between two subpaths (the shaker's lid), both of which show the
 * pill through and are correct on any background.
 *
 * DRAWN AT 22, CHECKED AT 22. These are only ever rendered at 20 px (sidebar) and 22 px (tab bar)
 * and the silhouettes were chosen so that no two ADJACENT tabs share one. Only one is ever solid
 * at a time and a text label sits directly under it, which is the mitigation of last resort.
 */

/** Filled dumbbell — for solid/active states where a stroke glyph would disappear against a fill. */
export const DumbbellSolidIcon = ({ size = 24, gold, ...p }: SolidIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={solidFill(gold)}
    aria-hidden="true"
    {...p}
  >
    <rect x="1.8" y="7.8" width="2.9" height="8.4" rx="1.3" />
    <rect x="5.3" y="9.4" width="2.6" height="5.2" rx="1.1" />
    <rect x="7.9" y="10.8" width="8.2" height="2.4" rx="1.2" />
    <rect x="16.1" y="9.4" width="2.6" height="5.2" rx="1.1" />
    <rect x="19.3" y="7.8" width="2.9" height="8.4" rx="1.3" />
  </svg>
);

/**
 * Filled anvil — the Today tab, active. ONE closed path: face + horn, waist, base, traced as a
 * single outline so the three parts weld into one silhouette instead of reading as a stack of
 * three shapes at 22 px. The horn is still the only cue that separates an anvil from a block, so
 * it keeps its full length even though the fill makes everything else heavier.
 */
export const AnvilSolidIcon = ({ size = 24, gold, ...p }: SolidIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={solidFill(gold)}
    aria-hidden="true"
    {...p}
  >
    <path d="M3.2 7.4H13.6c2.3 0 4 1.1 6.2 2.6-2.2 1.6-3.9 2.5-6.2 2.5h-1l1.2 3.6h4.9a1.2 1.2 0 0 1 1.2 1.2v2.1a1.2 1.2 0 0 1-1.2 1.2H5.5a1.2 1.2 0 0 1-1.2-1.2v-2.1a1.2 1.2 0 0 1 1.2-1.2h2.7l1.2-3.6H3.2A1.2 1.2 0 0 1 2 11.3V8.6a1.2 1.2 0 0 1 1.2-1.2Z" />
  </svg>
);

/**
 * Filled barbell — the Workouts tab, active. Five separate bodies (two plates a side plus the
 * bar) rather than one welded blob: the GAPS are what make it a loaded bar. They are ≥0.6 units,
 * which survives at 22 px, and they show the accent-muted pill through rather than a knockout.
 * The outline's knurling ticks are dropped — at this weight they would only muddy the bar.
 */
export const BarbellSolidIcon = ({ size = 24, gold, ...p }: SolidIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={solidFill(gold)}
    aria-hidden="true"
    {...p}
  >
    <rect x="1.9" y="7.4" width="2.7" height="9.2" rx="1.2" />
    <rect x="5.3" y="9.4" width="2" height="5.2" rx="0.9" />
    <rect x="7.9" y="11" width="8.2" height="2" rx="1" />
    <rect x="16.7" y="9.4" width="2" height="5.2" rx="0.9" />
    <rect x="19.4" y="7.4" width="2.7" height="9.2" rx="1.2" />
  </svg>
);

/**
 * Filled kettlebell — the Exercises tab, active.
 *
 * THE HANDLE WINDOW IS THE ICON, and filling a kettlebell is exactly where that window gets lost.
 * It survives here as an `evenodd` hole: one path, two subpaths — the outer silhouette, then the
 * window as a second closed region. The handle wall left around it is 1.7 units (~1.5 px at tab
 * size) and the window itself is 5.4 units tall, so there is a genuine hole to see the pill
 * through. Painting that window with a background-coloured shape instead would render an
 * accent-muted bar on an accent-muted pill: invisible, and the glyph blobs.
 */
export const KettlebellSolidIcon = ({ size = 24, gold, ...p }: SolidIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={solidFill(gold)}
    aria-hidden="true"
    {...p}
  >
    <path
      fillRule="evenodd"
      d="M7.55 12.4V9.7a4.45 4.45 0 0 1 8.9 0v2.7c2.5 1.9 3.75 4.2 3.75 6.2a2.8 2.8 0 0 1-2.8 2.8H6.6a2.8 2.8 0 0 1-2.8-2.8c0-2 1.25-4.3 3.75-6.2ZM9.25 12.4V9.7a2.75 2.75 0 0 1 5.5 0v2.7Z"
    />
  </svg>
);

/**
 * Filled protein shaker — the Nutrition tab, active. The lid is a SEPARATE body with a real
 * 1.4-unit gap under it, not a knockout line: at 22 px that gap is ~1.3 px of pill showing
 * through, which is what makes the object read as "a bottle with a screw top" instead of a
 * rounded slab. A `stroke="var(--color-surface)"` divider would have been invisible on the
 * accent-muted active pill, which is the one background this icon is guaranteed to sit on.
 */
export const ShakerSolidIcon = ({ size = 24, gold, ...p }: SolidIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={solidFill(gold)}
    aria-hidden="true"
    {...p}
  >
    <rect x="7.6" y="2.4" width="8.8" height="3" rx="1.2" />
    <path d="M9.2 6.8h5.6l1.9 3.6v8.6a2.4 2.4 0 0 1-2.4 2.4H9.7a2.4 2.4 0 0 1-2.4-2.4v-8.6Z" />
  </svg>
);

/**
 * Filled ascending plates — the Progress tab, active. The outline's hub notches are dropped
 * rather than knocked out (see the family note above), so what remains must not degrade into a
 * plain bar chart: the plates are drawn as full STADIUMS (`rx` = half the width), which is the
 * rounded rim of a plate stood on its edge and is not a shape any bar chart uses.
 */
export const PlateChartSolidIcon = ({ size = 24, gold, ...p }: SolidIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={solidFill(gold)}
    aria-hidden="true"
    {...p}
  >
    <rect x="3" y="19.7" width="18" height="1.8" rx="0.9" />
    <rect x="4.3" y="12.4" width="4.4" height="6.3" rx="2.2" />
    <rect x="9.8" y="8.2" width="4.4" height="10.5" rx="2.2" />
    <rect x="15.3" y="4" width="4.4" height="14.7" rx="2.2" />
  </svg>
);

/**
 * Filled star. LIVES HERE, not in SwipeDeck: Settings imported the entire 36 KB swipe-deck
 * module (drag physics, confetti) to render this one 24px glyph on its heaviest screen.
 */
export const StarIcon = ({ size = 24, ...p }: React.SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
    focusable="false"
    {...p}
  >
    <path d="M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.7l-5.52 2.9 1.05-6.15L3.06 9.1l6.18-.9L12 2.6z" />
  </svg>
);
