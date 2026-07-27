/**
 * PROGRESSION SCHEMES — how the sets of one exercise are SHAPED, and what makes the weight go up.
 *
 * A routine row only ever said "3 × 8–12". That is a volume prescription, not a training plan: it
 * leaves the athlete to guess whether all three sets are the same weight, whether the first should
 * be the heaviest, and what has to happen before the load moves. Two lifters running the identical
 * row can be doing completely different training. This module turns the row into per-set targets —
 * a rep goal and a RELATIVE LOAD for every single set — plus the one rule that decides the next
 * jump.
 *
 * Loads are expressed as a PERCENT OF THE DAY'S TOP SET, never as kilos. The app does not know the
 * athlete's true 1RM, and inventing one would be exactly the kind of fabricated number that gets
 * someone hurt. A percentage is honest: it describes the SHAPE of the session, and the athlete (or
 * their own logged history) supplies the absolute weight. On a movement with nothing to load, a
 * percentage is not honest either — "90% of your bodyweight" is not a thing you can do — so those
 * lifts express the scheme in REPS and carry no percentage at all ({@link PrescriptionInput.isBodyweight}).
 *
 * SAFETY (the coaching caveat this module exists to encode): reverse pyramid puts the heaviest set
 * of the day first, immediately after warm-ups. That is a fine tool for someone with grooved
 * technique and a known top-end, and a bad default for a novice who has neither — their first
 * heavy single-shot set is where form breaks down. So a novice is NEVER recommended into it
 * ({@link recommendProgressionScheme} cannot return it below the scheme's minimum level), an
 * explicit novice choice is honoured only alongside {@link schemeCaution}'s warning, and the
 * warning is backed by an actual {@link warmupRamp} rather than by a sentence telling the athlete
 * to warm up.
 *
 * EVIDENCE TIER, stated up front because the app asserts these numbers on screen: the per-set drop
 * (10%), the reps-per-step (+2), the ramp percentages (40/60/80/90), the 3-set cap on reverse
 * pyramid and the 1.25× rest after a top set are PRACTITIONER CONVENTION. No controlled trial
 * establishes any of them, and Angleri et al. (2017) found no hypertrophy or strength advantage
 * for a pyramid over constant load at equated volume. Scheme choice is an adherence and
 * fatigue-management lever, not a growth lever, and the app must never imply otherwise. See
 * `docs/RESEARCH-PROGRESSION.md` and {@link PROGRESSION_EVIDENCE}.
 */
import type { GoalType, ExperienceLevel, MechanicsType } from '../types/database.js';

/* ══════════════════════════════════════════════════════════════════════════ the scheme set ══ */

/**
 * THREE schemes, not four. Ordered for display: safest first, so the picker reads as a ramp
 * rather than a menu.
 *
 * `ascending_pyramid` was cut deliberately. Once {@link warmupRamp} makes a specific ramp
 * universal, an ascending pyramid IS "the ramp plus one top set" — it duplicates
 * `top_set_backoff` with worse fatigue management (the heaviest set lands last, after three
 * fatiguing sets, when performance is lowest). Its light high-rep sets are also the one shape this
 * app cannot count honestly: either they are hard sets, in which case it is four near-failure sets
 * rather than a ramp, or they are not, in which case the weekly hard-set currency every volume
 * target is calibrated in would over-count them.
 */
export const PROGRESSION_SCHEMES = [
  'straight_sets',
  'top_set_backoff',
  'reverse_pyramid',
] as const;
export type ProgressionScheme = (typeof PROGRESSION_SCHEMES)[number];

/**
 * Schemes that shipped once and no longer exist. Kept as data so a stored choice can be RETIRED
 * quietly (→ back to the recommendation) instead of being reported as a corrupt store: an athlete
 * whose backup says `ascending_pyramid` did nothing wrong.
 */
export const RETIRED_PROGRESSION_SCHEMES = ['ascending_pyramid'] as const;

export function isRetiredProgressionScheme(value: unknown): boolean {
  return (
    typeof value === 'string' && (RETIRED_PROGRESSION_SCHEMES as readonly string[]).includes(value)
  );
}

/**
 * The scheme every athlete starts on, and the one anything unrecognised falls back to. Straight
 * sets are the only shape where a missed rep costs nothing but a rep — there is no heavy opener to
 * mistime and no ramp to misjudge.
 */
export const DEFAULT_PROGRESSION_SCHEME: ProgressionScheme = 'straight_sets';

/**
 * The one sentence above the picker. A default the copy actively endorses is worth more than a
 * fourth option: the picker's job is to make an unfamiliar choice SAFE TO GET WRONG.
 */
export const PROGRESSION_PICKER_LEDE =
  "This decides how heavy each set is compared to the others — if you're not sure, keep Straight sets.";

export interface ProgressionSchemeMeta {
  slug: ProgressionScheme;
  name: string;
  /** ONE sentence, no jargon — this is what a beginner reads on the picker card. */
  tagline: string;
  /** how the sets are shaped, in the athlete's words */
  how: string;
  /** the single rule that decides when load goes up */
  nextSession: string;
  /** the lowest experience level this may be RECOMMENDED to (see the safety note above) */
  minExperience: ExperienceLevel;
  /**
   * Schemes that only make sense on the big lifts. A 10%-per-set ramp on a lateral raise is
   * arithmetic theatre — the plate jumps are bigger than the drops — so accessories quietly run
   * straight sets instead (see {@link prescribeSets}).
   */
  compoundOnly: boolean;
  /** hard ceiling on working sets, or `null` for "however many the row prescribes" */
  maxWorkingSets: number | null;
  /** goals the scheme suits, used by {@link recommendProgressionScheme} */
  goals: GoalType[];
}

const EXPERIENCE_RANK: Record<ExperienceLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

export const PROGRESSION_LIBRARY: Record<ProgressionScheme, ProgressionSchemeMeta> = {
  straight_sets: {
    slug: 'straight_sets',
    name: 'Straight sets',
    tagline: 'Same weight on every set — when all your sets hit the top of the rep range, add a little weight next time.',
    how: 'Every working set uses the same load and chases the same rep range.',
    nextSession: 'Hit the top of the rep range on EVERY set, then add the smallest jump you have.',
    minExperience: 'beginner',
    compoundOnly: false,
    maxWorkingSets: null,
    goals: ['hypertrophy', 'fat_loss', 'endurance', 'general_health', 'strength'],
  },
  top_set_backoff: {
    slug: 'top_set_backoff',
    name: 'Top set + back-offs',
    tagline: 'One hard set at your best weight for the day, then the rest a bit lighter for a couple more reps.',
    how: 'Set 1 is the heavy one. The rest sit around 90% of it and buy volume without a second peak.',
    nextSession: 'When the top set clears its rep target with clean form, add load — the back-offs move with it.',
    minExperience: 'intermediate',
    compoundOnly: true,
    maxWorkingSets: null,
    goals: ['strength', 'hypertrophy'],
  },
  reverse_pyramid: {
    slug: 'reverse_pyramid',
    name: 'Reverse pyramid',
    tagline: 'Heaviest set first while you are freshest, then drop about 10% and add reps on each set after it.',
    how: 'Set 1 is your hardest set of the day. Every set after drops ~10% load and adds ~2 reps.',
    nextSession: 'Beat the rep target on the FIRST set, then add load to it; the drops recalculate themselves.',
    minExperience: 'intermediate',
    compoundOnly: true,
    /**
     * THREE working sets, full stop. With the 10%-per-set drop a fourth set lands at 73% of the
     * top set: on the hypertrophy default that is a 12–14 rep set at 73%, on the strength default
     * a 9-rep set at 73%. Neither is the stimulus anyone chose this scheme for — it is junk volume
     * bolted onto the end. Classic RPT runs 2–3 sets. Tier C, coaching convention: no trial
     * establishes a set count, and {@link PROGRESSION_EVIDENCE} says so on screen.
     */
    maxWorkingSets: 3,
    goals: ['strength', 'hypertrophy'],
  },
};

/** Ordered for display: safest first, so the picker reads as a ramp rather than a menu. */
export const PROGRESSION_OPTIONS: ProgressionSchemeMeta[] = PROGRESSION_SCHEMES.map(
  (slug) => PROGRESSION_LIBRARY[slug],
);

export function isProgressionScheme(value: unknown): value is ProgressionScheme {
  return (
    typeof value === 'string' && (PROGRESSION_SCHEMES as readonly string[]).includes(value)
  );
}

/** Anything unrecognised (older backup, hand-edited store, retired scheme) becomes the default. */
export function toProgressionScheme(value: unknown): ProgressionScheme {
  return isProgressionScheme(value) ? value : DEFAULT_PROGRESSION_SCHEME;
}

/* ══════════════════════════════════════════════════════════════════════ experience gating ══ */

/** True when the athlete is at or above the scheme's minimum level. */
export function isSchemeLevelAppropriate(
  scheme: ProgressionScheme,
  experience: ExperienceLevel | null | undefined,
): boolean {
  const level = EXPERIENCE_RANK[experience ?? 'beginner'];
  return level >= EXPERIENCE_RANK[PROGRESSION_LIBRARY[scheme].minExperience];
}

/**
 * The warning to show when someone picks a scheme above their level, or `null` when there is
 * nothing to warn about. Returned rather than enforced: the athlete stays in charge of their own
 * training, but they are never allowed to walk into a heavy-first session unwarned — and the
 * player shows this again at the moment it matters, not only in onboarding weeks beforehand.
 */
export function schemeCaution(
  scheme: ProgressionScheme,
  experience: ExperienceLevel | null | undefined,
): string | null {
  if (isSchemeLevelAppropriate(scheme, experience)) return null;
  if (scheme === 'reverse_pyramid') {
    return 'Your heaviest set comes first, straight after warm-ups — that is where form breaks down if the lift is still new. Run every warm-up step above, leave 2 reps in the tank, and switch back to straight sets if your technique wobbles.';
  }
  if (scheme === 'top_set_backoff') {
    return 'This needs a reliable feel for your top weight of the day. If you are still learning the lift, straight sets will progress you just as fast with less guesswork.';
  }
  return 'This scheme is usually a better fit once you have more time under the bar. Straight sets progress a new lifter just as fast.';
}

/**
 * The scheme we PUT SOMEONE ON by default. It can never return a scheme above the athlete's
 * level — that is the whole safety caveat in one line of code.
 */
export function recommendProgressionScheme(input: {
  experience_level?: ExperienceLevel | null;
  primary_goal?: GoalType | null;
}): ProgressionScheme {
  const experience = input.experience_level ?? 'beginner';
  const goal = input.primary_goal ?? 'general_health';
  const wanted: ProgressionScheme =
    goal === 'strength'
      ? 'top_set_backoff'
      : goal === 'hypertrophy' && experience === 'advanced'
        ? 'reverse_pyramid'
        : 'straight_sets';
  return isSchemeLevelAppropriate(wanted, experience) ? wanted : DEFAULT_PROGRESSION_SCHEME;
}

/* ═══════════════════════════════════════════════════════════════════ the prescription itself ══ */

export interface PrescriptionInput {
  /** working sets prescribed by the routine row */
  sets: number;
  rep_min: number;
  rep_max: number;
  target_rpe?: number | null;
  /** compound vs isolation decides whether a `compoundOnly` scheme actually applies */
  mechanics?: MechanicsType | null;
  /**
   * True when the movement has nothing to load — chin-ups, dips, push-ups. Percentages are
   * meaningless here, so the scheme expresses itself in reps alone. See {@link SetTarget.loadPct}.
   */
  isBodyweight?: boolean;
  /** drives the RPE cap on a heavy first set — see {@link TOP_SET_RPE_CAP}. */
  experience?: ExperienceLevel | null;
}

/** What a single set is FOR — drives the label the player prints next to it. */
export type SetRole = 'top' | 'work' | 'backoff';

export interface SetTarget {
  /** 1-based set number, counting WORKING sets only (warm-up ramps are not sets) */
  index: number;
  /** the rep number to aim at — the top of {@link repsLow}–{@link repsHigh} where they differ */
  reps: number;
  /**
   * The rep RANGE this set is prescribed in. Under straight sets they differ (8–12), because
   * double progression means "work up the range, THEN add load" — printing a hard 12 makes a
   * lifter who got 9 on set 4 read a success as a failure. Under the shaped schemes they are
   * equal, because those are per-set instructions rather than a range.
   */
  repsLow: number;
  repsHigh: number;
  /**
   * Percent of the day's top-set load; the top set is always 100. `null` on a bodyweight-only
   * movement, where a percentage would be a fabricated number.
   */
  loadPct: number | null;
  /** target RPE for THIS set — varies by role; a single number across a shaped session is a lie */
  rpe: number | null;
  role: SetRole;
  /** short instruction printed on the set row */
  cue: string;
}

export interface Prescription {
  /** what the athlete chose */
  requested: ProgressionScheme;
  /** what actually applies to THIS exercise (see `compoundOnly`) */
  scheme: ProgressionScheme;
  /** true when a compound-only scheme was swapped out for straight sets on an accessory */
  substituted: boolean;
  /** true when the movement carries no load, so every `loadPct` is null */
  isBodyweight: boolean;
  /**
   * The set count the ROW asked for, when the scheme capped it (see
   * {@link ProgressionSchemeMeta.maxWorkingSets}); `null` when nothing was trimmed. Surfaced, never
   * silent: a set disappearing without explanation reads as a bug.
   */
  trimmedFrom: number | null;
  sets: SetTarget[];
  /** e.g. "Reverse pyramid · heaviest first" */
  headline: string;
  /** ONE sentence a beginner understands */
  explainer: string;
  /** the rule that decides the next jump */
  nextSession: string;
}

/** Per-set load drop of a pyramid, as a multiplier. ~10% is the conventional RPT/pyramid step. */
const PYRAMID_STEP = 0.9;
/** Back-off sets sit here relative to the top set. */
const BACKOFF_PCT = 90;
/** Reps added per set as the load comes off a pyramid. */
const REPS_PER_STEP = 2;
/**
 * Per-set REP drop on a bodyweight reverse pyramid. With no load to shed, the only honest way to
 * run heaviest-first is descending reps at constant load — a 8/6/5 chin-up session, not
 * "10 reps @ 90% of yourself".
 */
const BODYWEIGHT_REP_STEP = 0.8;
/**
 * Floor for a computed percentage. Below this the "same exercise" claim stops being true — it is a
 * different stimulus, not a back-off — and the numbers stop being useful on a phone.
 */
const MIN_LOAD_PCT = 55;
/**
 * The load-bearing safety number. The caution text tells the athlete to leave 2 reps in the tank
 * before their heaviest set of the day; the prescription has to actually SAY RPE 8, not RPE 9, or
 * the copy and the numbers contradict each other. Advanced lifters get one more notch because
 * their proximity-to-failure judgement is measurably better (Zourdos et al. 2016).
 */
export const TOP_SET_RPE_CAP: Record<ExperienceLevel, number> = {
  beginner: 8,
  intermediate: 8,
  advanced: 9,
};
/** Back-offs under top-set+back-offs run one notch easier; nothing goes below this. */
const MIN_RPE = 5;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Normalise a routine row before any arithmetic touches it. Rows arrive from generated plans, from
 * `localStorage`, and from hand-edited backups: a NaN rep range or an inverted 12–8 must produce a
 * sane prescription, never `NaN × NaN`.
 */
function normalise(input: PrescriptionInput): {
  sets: number;
  repMin: number;
  repMax: number;
  rpe: number | null;
} {
  const sets = clampInt(input.sets, 0, 20);
  const a = clampInt(input.rep_min, 1, 100);
  const b = clampInt(input.rep_max, 1, 100);
  const rpe =
    typeof input.target_rpe === 'number' && Number.isFinite(input.target_rpe)
      ? input.target_rpe
      : null;
  return { sets, repMin: Math.min(a, b), repMax: Math.max(a, b), rpe };
}

/**
 * Turn one routine row into per-set targets under `scheme`.
 *
 * This is the function that makes a progression scheme REAL rather than a label: the same
 * "4 × 6–10" row comes back as four identical 6–10 sets under straight sets, and as
 * 100% × 6 / 90% × 8 / 81% × 10 under reverse pyramid — three sets, because the fourth would be a
 * 12-rep set at 73% of the top, which is not what anyone picked this scheme for.
 */
export function prescribeSets(
  input: PrescriptionInput,
  scheme: ProgressionScheme,
): Prescription {
  const requested = toProgressionScheme(scheme);
  const meta = PROGRESSION_LIBRARY[requested];
  // Accessories opt out of the compound-only shapes (see `compoundOnly`).
  const substituted = meta.compoundOnly && input.mechanics === 'isolation';
  const applied: ProgressionScheme = substituted ? DEFAULT_PROGRESSION_SCHEME : requested;
  const appliedMeta = PROGRESSION_LIBRARY[applied];
  const isBodyweight = input.isBodyweight === true;
  const experience = input.experience ?? 'beginner';

  const { sets: requestedSets, repMin, repMax, rpe } = normalise(input);
  const cap = appliedMeta.maxWorkingSets;
  const sets = cap != null ? Math.min(requestedSets, cap) : requestedSets;
  const trimmedFrom = sets < requestedSets ? requestedSets : null;

  const targets: SetTarget[] = [];
  for (let i = 0; i < sets; i++) {
    targets.push(setTarget(applied, i, repMin, repMax, rpe, isBodyweight, experience));
  }

  return {
    requested,
    scheme: applied,
    substituted,
    isBodyweight,
    trimmedFrom,
    sets: targets,
    headline: headlineFor(applied),
    explainer: substituted
      ? `Isolation work stays on straight sets — ${appliedMeta.tagline.charAt(0).toLowerCase()}${appliedMeta.tagline.slice(1)}`
      : isBodyweight
        ? BODYWEIGHT_EXPLAINER[applied]
        : appliedMeta.tagline,
    nextSession: isBodyweight && !substituted
      ? BODYWEIGHT_NEXT_SESSION[applied]
      : appliedMeta.nextSession,
  };
}

/**
 * The copy for a movement with nothing to load.
 *
 * The library's own taglines talk about dropping 10 % and adding load, which is exactly wrong on a
 * chin-up: the athlete would read "drop about 10%" beside a prescription that says 8 / 6 / 5 reps
 * at the same bodyweight. Copy that contradicts the numbers underneath it is worse than no copy.
 */
const BODYWEIGHT_EXPLAINER: Record<ProgressionScheme, string> = {
  straight_sets:
    'Same movement every set — when all your sets hit the top of the rep range, make it harder next time.',
  top_set_backoff:
    'One all-out set while you are freshest, then a couple of reps fewer on the sets after it.',
  reverse_pyramid:
    'Hardest set first while you are freshest — same movement, fewer reps on each set after it.',
};

const BODYWEIGHT_NEXT_SESSION: Record<ProgressionScheme, string> = {
  straight_sets:
    'Hit the top of the rep range on EVERY set, then make it harder — add weight in a belt or vest, or move to a harder version.',
  top_set_backoff:
    'When the first set clears its rep target with clean form, make the movement harder; the back-offs follow it.',
  reverse_pyramid:
    'Beat the rep target on the FIRST set, then make the movement harder — the later sets follow it down.',
};

/** Kept SHORT on purpose: this renders as one chip on a 390 px phone, above the set list. */
function headlineFor(scheme: ProgressionScheme): string {
  switch (scheme) {
    case 'reverse_pyramid':
      return 'Reverse pyramid · heaviest first';
    case 'top_set_backoff':
      return 'Top set + back-offs';
    case 'straight_sets':
    default:
      return 'Straight sets · same weight';
  }
}

/** The sentence the player prints when a scheme drops a set the row asked for. */
export function trimNoticeFor(prescription: Prescription): string | null {
  if (prescription.trimmedFrom == null) return null;
  const kept = prescription.sets.length;
  const why = prescription.isBodyweight
    ? 'That far down the rep drop it stops being the stimulus you picked this for.'
    : 'A set that far down the drop lands too light to be the stimulus you picked this for.';
  return `${PROGRESSION_LIBRARY[prescription.scheme].name} runs ${kept} sets — set ${prescription.trimmedFrom} dropped. ${why}`;
}

function setTarget(
  scheme: ProgressionScheme,
  i: number,
  repMin: number,
  repMax: number,
  rpe: number | null,
  isBodyweight: boolean,
  experience: ExperienceLevel,
): SetTarget {
  const index = i + 1;
  // A percentage on an unloadable movement is a fabricated number, so it is simply absent and the
  // scheme speaks in reps instead.
  const pct = (value: number): number | null => (isBodyweight ? null : value);
  const cappedTopRpe = rpe == null ? null : Math.min(rpe, TOP_SET_RPE_CAP[experience]);

  switch (scheme) {
    case 'reverse_pyramid': {
      // Set 1 is the heavy one at the BOTTOM of the rep range; every set after drops ~10% and
      // buys ~2 reps. Later sets are allowed above `repMax` — that is the point of the drop, and
      // clamping them back into the range would silently turn this into straight sets.
      const loadPct = Math.max(MIN_LOAD_PCT, Math.round(100 * Math.pow(PYRAMID_STEP, i)));
      // Bodyweight runs the mirror: constant load, DESCENDING reps from the top of the range.
      const reps = isBodyweight
        ? Math.max(1, Math.round(repMax * Math.pow(BODYWEIGHT_REP_STEP, i)))
        : Math.min(repMax + REPS_PER_STEP * 2, repMin + REPS_PER_STEP * i);
      const isTop = i === 0;
      return {
        index,
        reps,
        repsLow: reps,
        repsHigh: reps,
        loadPct: pct(loadPct),
        // The top set is capped; the back-offs carry the row's RPE unchanged — same effort,
        // lighter load, more reps, which is what the drop is FOR.
        rpe: isTop ? cappedTopRpe : rpe,
        role: isTop ? 'top' : 'backoff',
        cue: isTop
          ? 'Heaviest set of the day — run the warm-up steps first'
          : isBodyweight
            ? 'Same movement, fewer reps — stop 2 short of failure'
            : `Drop to ${loadPct}%, chase reps`,
      };
    }
    case 'top_set_backoff': {
      const isTop = i === 0;
      const loadPct = isTop ? 100 : BACKOFF_PCT;
      const reps = isTop
        ? isBodyweight
          ? repMax
          : repMin
        : isBodyweight
          ? Math.max(1, Math.round(repMax * BODYWEIGHT_REP_STEP))
          : Math.min(repMax, repMin + REPS_PER_STEP);
      return {
        index,
        reps,
        repsLow: reps,
        repsHigh: reps,
        loadPct: pct(loadPct),
        // A back-off that is as hard as the top set is a second top set. One notch easier is what
        // makes it back-off volume rather than a second peak.
        rpe: isTop ? rpe : rpe == null ? null : Math.max(MIN_RPE, rpe - 1),
        role: isTop ? 'top' : 'backoff',
        cue: isTop
          ? 'Your one hard set today'
          : isBodyweight
            ? 'Back-off · a couple of reps short of the top set'
            : `Back-off · ${BACKOFF_PCT}% for volume`,
      };
    }
    case 'straight_sets':
    default:
      // DOUBLE PROGRESSION: the RANGE is the prescription and the top of it is the trigger. The
      // set carries both, so the player can print "8–12 reps" instead of a hard 12 that reads as
      // failure to anyone who gets 9.
      return {
        index,
        reps: repMax,
        repsLow: repMin,
        repsHigh: repMax,
        loadPct: pct(100),
        rpe,
        role: 'work',
        cue: isBodyweight ? 'Same movement every set' : 'Same weight as every other set',
      };
  }
}

/* ══════════════════════════════════════════════════════════════════════════ the warm-up ramp ══ */

/**
 * A warm-up step. NOT a working set: it earns no volume credit, no PR, and never appears in
 * `dayStats.setCount` or a logged session. The app's entire training currency is hard sets per
 * muscle per week, calibrated against the Pelland / Baz-Valle bands, so counting ramp sets would
 * silently inflate every weekly goal reading and every heat colour in the app.
 */
export interface WarmupSet {
  /** 1-based, numbered independently of the working sets */
  index: number;
  reps: number;
  /** percent of the day's top set; `null` on a bodyweight movement */
  loadPct: number | null;
  /** the actual weight, when the athlete's own history supplies one — never invented */
  loadKg: number | null;
  cue: string;
}

/**
 * The ramp for a loaded compound: three steps that groove the pattern without spending anything.
 * TIER C — practitioner convention. There is no controlled comparison of specific ramp protocols;
 * these percentages are what coaches use, and the app labels them as such rather than dressing
 * them up as findings.
 */
const RAMP_COMPOUND: readonly { pct: number; reps: number; cue: string }[] = [
  { pct: 40, reps: 5, cue: 'Easy — find the groove, not the effort' },
  { pct: 60, reps: 3, cue: 'Same speed, more weight' },
  { pct: 80, reps: 2, cue: 'Last rehearsal — crisp, not a working set' },
];
/**
 * Reverse pyramid earns a fourth step. Set 1 is the heaviest set of the DAY, so the gap between
 * the last warm-up and the first working set is the one that has to be small.
 */
const RAMP_REVERSE_EXTRA = {
  pct: 90,
  reps: 1,
  cue: 'One single — primes the nervous system, stops well short',
} as const;
/** An isolation lift needs the joint warm, not the pattern rehearsed. One light set does it. */
const RAMP_ISOLATION = { pct: 50, reps: 10, cue: 'Light and full range — warm the joint' } as const;
/**
 * THE TAPER, for a lift whose pattern is already warm.
 *
 * A full four-step ramp on exercise 4 of a session is not how anyone coaches. By the time an
 * athlete reaches the lat pulldown after bent-over rows and chin-ups, the lats and upper back have
 * already done seven-plus hard sets: the ramp there costs 3-4 minutes, buys nothing, and — on a
 * 60-minute session — is the single biggest reason people start skipping ramps altogether,
 * including on the first lift where the ramp IS the safety mechanism. One feeler set re-finds the
 * groove of the new bar path, which is the only thing left to warm up.
 *
 * TIER C, exactly like the ramp percentages themselves: no trial establishes it, it is coaching
 * convention, and {@link PROGRESSION_EVIDENCE} says so on screen rather than in this comment.
 */
const RAMP_FEELER = { pct: 60, reps: 3, cue: 'Feeler — the pattern is already warm' } as const;
/**
 * The feeler under reverse pyramid sits higher, because set 1 is still the heaviest set of the DAY.
 * The gap between the last rehearsal and the top set is the one that must stay small no matter how
 * warm the muscle is.
 */
const RAMP_FEELER_HEAVY = {
  pct: 80,
  reps: 2,
  cue: 'Feeler — already warm, but this is still your heaviest set',
} as const;

/**
 * The specific warm-up for ONE exercise, in the movement being trained.
 *
 * This is the safety caveat made real. Until now the entire protection for "set 1 is your heaviest
 * set of the day" was a string printed next to it saying "warm up fully first". A cue is not a
 * warm-up. Mobility work warms the BODY; this warms the LIFT, and under reverse pyramid both are
 * required — neither substitutes for the other.
 *
 * With no logged history there is no honest weight to print, so every step comes back with
 * `loadKg: null` and the UI shows the percentage alone. The app never invents a starting weight —
 * but it also never withholds the warm-up from the one athlete most likely to need it.
 *
 * `patternAlreadyWarm` is what makes the ramp POSITIONAL rather than per-exercise. The caller
 * decides it (it needs the day's running order, which this pure rule does not have); this function
 * decides what to do about it — see {@link RAMP_FEELER}.
 */
export function warmupRamp(input: {
  /** the athlete's own top-set weight for this lift — the only honest anchor */
  topSetKg?: number | null;
  mechanics?: MechanicsType | null;
  scheme: ProgressionScheme;
  isBodyweight?: boolean;
  /** the working rep target, used to size a bodyweight ramp */
  targetReps?: number | null;
  incrementKg?: number;
  /**
   * True when an EARLIER exercise in the same session already trained this movement pattern (or a
   * shared primary muscle). Defaults to false, so a caller with no notion of order — a preview, a
   * single-exercise screen — still gets the full protective ramp.
   */
  patternAlreadyWarm?: boolean;
}): WarmupSet[] {
  const isBodyweight = input.isBodyweight === true;
  const alreadyWarm = input.patternAlreadyWarm === true;
  const isIsolation = input.mechanics === 'isolation';

  // An accessory whose pattern has already been ramped and worked has nothing left to warm. This
  // is the one case that returns an EMPTY ramp — a curl after five sets of rows does not need a
  // warm-up set, and printing one under a "WARM-UP · REQUIRED" header teaches the athlete that the
  // header is noise, which is precisely the habit that then gets carried onto the bench press.
  if (isIsolation && alreadyWarm) return [];

  if (isBodyweight) {
    // Nothing to lighten, so the ramp is an easier version of the movement: half the reps (or an
    // easier progression — knee push-ups, band-assisted chin-ups), which the cue says out loud.
    // Already warm means there is nothing left to do: no load to taper, and the pattern is grooved.
    if (alreadyWarm) return [];
    const target = clampInt(input.targetReps ?? 10, 1, 100);
    return [
      {
        index: 1,
        reps: Math.max(3, Math.round(target / 2)),
        loadPct: null,
        loadKg: null,
        cue: 'Half the reps, or an easier version of the movement',
      },
    ];
  }

  const steps = isIsolation
    ? [RAMP_ISOLATION]
    : alreadyWarm
      ? [input.scheme === 'reverse_pyramid' ? RAMP_FEELER_HEAVY : RAMP_FEELER]
      : input.scheme === 'reverse_pyramid'
        ? [...RAMP_COMPOUND, RAMP_REVERSE_EXTRA]
        : [...RAMP_COMPOUND];

  return steps.map((step, i) => ({
    index: i + 1,
    reps: step.reps,
    loadPct: step.pct,
    loadKg: suggestedLoadKg(input.topSetKg, step.pct, input.incrementKg),
    cue: step.cue,
  }));
}

/**
 * Seconds a single warm-up step costs, ramp-to-ramp: the set itself plus the short rest and the
 * plate change before the next one.
 *
 * Lives here rather than in the estimator because the ramp is defined here — the minute estimate on
 * every session card in the app was counting working sets and rest and NOTHING for the ramp, which
 * under reverse pyramid is 18 extra sets on a six-exercise day and made a "~49 min" card describe a
 * ~62-minute session. TIER C, like the ramp itself.
 */
export const SECONDS_PER_WARMUP_SET = 45;

/* ═══════════════════════════════════════════════════════════════════════════════════ rest ══ */

/**
 * Fallback rest, used ONLY when a routine row carries no `rest_seconds` of its own. The row's own
 * value is goal-aware (a hypertrophy compound rests 90s, not 150s), so preferring these constants
 * over it — which the player used to do — made the session card's minute estimate and the timer
 * that actually runs disagree by minutes per session.
 */
export const REST_FALLBACK_COMPOUND = 150;
export const REST_FALLBACK_ISOLATION = 90;
/**
 * Rest after the heaviest set of the day. TIER C, coaching convention: the top set is the one
 * whose quality most depends on being fully recovered, and the set after it is the one most likely
 * to be cut short by a timer sized for an average set.
 */
const TOP_SET_REST_MULTIPLIER = 1.25;
const MAX_REST_SECONDS = 300;

/** Round to the nearest 15s — the granularity the rest timer's ±15s controls already work in. */
function toRestStep(seconds: number): number {
  return Math.round(seconds / 15) * 15;
}

/**
 * How long to rest AFTER a set, given the row's own prescription and what the set was for.
 *
 * `baseRestSeconds` is the routine row's `rest_seconds`. Only when the row genuinely carries
 * nothing do the mechanics fallbacks apply.
 */
export function restSecondsForSet(
  baseRestSeconds: number | null | undefined,
  role: SetRole,
  mechanics?: MechanicsType | null,
): number {
  const fallback =
    mechanics === 'isolation' ? REST_FALLBACK_ISOLATION : REST_FALLBACK_COMPOUND;
  const base =
    typeof baseRestSeconds === 'number' &&
    Number.isFinite(baseRestSeconds) &&
    baseRestSeconds > 0
      ? Math.min(MAX_REST_SECONDS, Math.round(baseRestSeconds))
      : fallback;
  if (role !== 'top') return base;
  return Math.min(MAX_REST_SECONDS, Math.max(base, toRestStep(base * TOP_SET_REST_MULTIPLIER)));
}

/* ═════════════════════════════════════════════════════════════════════════════ load helpers ══ */

/**
 * Turn a relative load into a weight the athlete can actually load on a bar.
 *
 * `topSetKg` is the athlete's OWN number (last session's heaviest set for this lift) — nothing here
 * estimates a 1RM or invents a starting weight. With no history there is no honest answer, so the
 * caller gets `null` and shows the percentage alone.
 */
export function suggestedLoadKg(
  topSetKg: number | null | undefined,
  loadPct: number | null | undefined,
  incrementKg = 2.5,
): number | null {
  if (typeof topSetKg !== 'number' || !Number.isFinite(topSetKg) || topSetKg <= 0) return null;
  if (typeof loadPct !== 'number' || !Number.isFinite(loadPct) || loadPct <= 0) return null;
  const step = Number.isFinite(incrementKg) && incrementKg > 0 ? incrementKg : 2.5;
  const raw = (topSetKg * loadPct) / 100;
  return Math.max(step, Math.round(raw / step) * step);
}

/** Compact per-set label for a dense list, e.g. `8 reps @ 90%`, or `8–12 reps` with no load. */
export function describeSetTarget(target: SetTarget): string {
  const reps =
    target.repsLow === target.repsHigh
      ? `${target.reps} reps`
      : `${target.repsLow}–${target.repsHigh} reps`;
  return target.loadPct == null ? reps : `${reps} @ ${target.loadPct}%`;
}

/** One-line summary of a whole prescription, e.g. `6 @ 100% · 8 @ 90% · 10 @ 81%`. */
export function describePrescription(prescription: Prescription): string {
  return prescription.sets.map(describeSetTarget).join(' · ');
}

/* ══════════════════════════════════════════════════════════════════════════════ the evidence ══ */

/** One citation, rendered on screen wherever a scheme number is asserted. */
export interface ProgressionEvidence {
  /** what this source actually establishes, in the app's own terms */
  claim: string;
  cite: string;
  where: string;
  url: string;
}

/**
 * The sources behind every number in this module — and, just as importantly, the places where
 * there is no source and the app is following coaching convention. Shown in the UI rather than
 * kept in a comment, exactly as `VOLUME_EVIDENCE` is: an app asserting "drop 10% and add 2 reps"
 * owes the user the provenance, and progression schemes rest on LESS evidence than volume targets
 * do. Long-form in `docs/RESEARCH-PROGRESSION.md`.
 */
export const PROGRESSION_EVIDENCE: readonly ProgressionEvidence[] = [
  {
    claim:
      'Load goes up by programmed manipulation of reps, sets and load — the "work up the rep range, then add weight" rule every scheme here shares.',
    cite: 'ACSM Position Stand — Ratamess et al., 2009',
    where: 'Med Sci Sports Exerc 41(3):687-708 — Tier A',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/',
  },
  {
    claim:
      'A pyramid produced NO greater strength or hypertrophy than constant-load training at equated volume. Scheme choice is a preference and fatigue-management lever, not a growth lever — this app will never tell you reverse pyramid builds more muscle.',
    cite: 'Angleri, Ugrinowitsch & Libardi, 2017',
    where: 'Eur J Appl Physiol 117(2):359-369 — Tier B',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28130627/',
  },
  {
    claim:
      'Novices judge proximity to failure less accurately than experienced lifters (velocity–RPE r = −0.77 vs −0.88). That is why a beginner is never defaulted into a heavy-first scheme, and why a top set is capped at RPE 8.',
    cite: 'Zourdos et al., 2016',
    where: 'J Strength Cond Res 30(1):267-275 — Tier B',
    url: 'https://pubmed.ncbi.nlm.nih.gov/26049792/',
  },
  {
    claim:
      'The warm-up percentages (40/60/80/90), the single-feeler taper on a lift whose pattern is already warm, the 10%-per-set drop, the +2 reps per step, the 3-set cap on reverse pyramid and the longer rest after a top set are PRACTITIONER CONVENTION. No controlled trial establishes any of them. They are labelled here rather than presented as findings.',
    cite: 'Coaching convention',
    where: 'Tier C — flagged deliberately, as the per-muscle volume split is',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/',
  },
] as const;
