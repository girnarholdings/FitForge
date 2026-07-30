'use client';

/**
 * DEMO MODE plan generation.
 *
 * Turns a completed onboarding draft into the same artefacts the backend RPCs would have produced:
 *   - nutrition targets via the §7.2.4 macros rule (Mifflin–St Jeor), and
 *   - a starter routine via the §7.5 split templates over the fixture catalog, honouring the
 *     user's equipment, movement/exercise exclusions, pinned substitutes, loved equipment and
 *     liked exercises.
 * Results are persisted to the demo store.
 *
 * ── Guarantees (these are load-bearing; the UI is allowed to trust them) ────────────────────────
 *  1. A generated day is NEVER empty. Slots are filled feasibility-first, then trimmed to the
 *     session budget, then backfilled through a relaxation ladder that bottoms out in bodyweight
 *     staples which need no equipment at all.
 *  2. SOFT exclusions (the "we'll ease off these" chips) de-prioritise a pattern — they never
 *     delete it. Only HARD exclusions remove a movement pattern outright.
 *  3. Everything the user told us is actually used: pinned substitutes fire when their exclusion
 *     fires, loved equipment biases ranking, slot notes ('rear') steer isolation picks.
 *  4. Copy is derived from what a plan ACTUALLY contains — never from the template's promise.
 */
import {
  computeNutritionTargets,
  suggestOnboardingDefaults,
  planDays,
  getSplit,
  restSeconds,
  slotCountForSession,
  splitNameForDays,
  likedSelectionBonus,
  dislikedSelectionPenalty,
  substituteAllDisliked,
  sexAdjustedPrescription,
  type RoleSlot,
  type CatalogExercise,
  type SubstitutionEdge,
  type DislikeSubstitution,
  type SexPrescriptionAdjustment,
  type SplitRecommendationInput,
} from '@fitforge/shared/rules';
import catalogFixtureJson from '@fitforge/shared/fixtures/catalog.json';
import substitutionEdgesJson from '@fitforge/shared/fixtures/substitution-edges.json';
import type { GoalType, ExperienceLevel, MovementPattern, SexType } from '@fitforge/shared/types';
import {
  EXERCISES,
  mockExerciseById,
  type ExerciseFull,
  type Routine,
  type RoutineDay,
  type RoutineExercise,
  type Profile,
  type NutritionProfile,
  type NutritionTargets,
  type Difficulty,
  localISO,
} from '@/components/features/_mock/data';
import type { OnboardingDraft } from '@/components/onboarding/types';
import { getState, update } from './store';
import { DEMO_ROUTINE_ID, demoDayId } from './ids';

export { DEMO_ROUTINE_ID, demoDayId };

function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

const DIFFICULTY_RANK: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * The §7.4 substitution engine works on the raw fixture rows (`CatalogExercise`), not the enriched
 * `ExerciseFull` the UI uses, so the disliked→easier swap reads the same JSON `EXERCISES` is built
 * from. One source, two shapes — never two catalogs that could disagree about what exists.
 */
const SUB_CATALOG = catalogFixtureJson as unknown as CatalogExercise[];
const SUB_EDGES = substitutionEdgesJson as unknown as SubstitutionEdge[];

function feasible(ex: ExerciseFull, owned: Set<string>, gymDefault: boolean): boolean {
  if (ex.is_bodyweight_ok) return true;
  if (ex.equipment.length === 0) return true;
  if (owned.size === 0 && gymDefault) return true;
  return ex.equipment.every((group) => group.slugs.some((s) => owned.has(s)));
}

function patternMatches(ex: ExerciseFull, slot: RoleSlot): boolean {
  if (ex.movement_pattern === slot.pattern) return true;
  return (slot.alt ?? []).includes(ex.movement_pattern as MovementPattern);
}

/** Compute nutrition targets for a draft (also used for live previews). */
export function targetsForDraft(draft: Partial<OnboardingDraft>): NutritionTargets & { method: string } {
  const t = computeNutritionTargets({
    sex: draft.sex ?? null,
    weight_kg: draft.weight_kg ?? null,
    height_cm: draft.height_cm ?? null,
    age: ageFromBirthdate(draft.birthdate),
    days_per_week: draft.days_per_week ?? null,
    primary_goal: (draft.primary_goal ?? 'general_health') as GoalType,
    diet_type: draft.diet_type ?? null,
  });
  return {
    kcal_target: t.kcal,
    protein_g_target: t.protein_g,
    carbs_g_target: t.carbs_g,
    fat_g_target: t.fat_g,
    method: t.method,
  };
}

/* ══════════════════════════════════════════════════════════════════ selection engine (§7.5 step 4) */

/**
 * Ranking weights. Ordered so a *harder* signal always beats a softer one:
 * an explicitly liked exercise > the stand-in for a disliked one > the slot's note (e.g. rear
 * delts) > its mechanics hint > an exact pattern match > loved equipment > raw popularity (0–100).
 */
const W_FAVORITE = 4000;
/**
 * The easier same-pattern stand-in the shared rule picked for something the athlete dislikes.
 * Below `W_FAVORITE` on purpose — a movement they actually said they LIKE still wins the slot.
 */
const W_DISLIKE_SUBSTITUTE = 3000;
const W_SLOT_NOTE = 2000;
const W_MECHANICS = 1000;
const W_EXACT_PATTERN = 500;
const W_LOVED_EQUIPMENT = 200;
/**
 * A DISLIKE is a down-rank, not a ban.
 *
 * Bigger than every positive weight above, so a disliked movement sinks below every alternative
 * for its slot — and FAR smaller than `SOFT_PENALTY`, so it still outranks a pattern the athlete
 * asked us to protect and can still be picked when it is the only feasible option. That last part
 * is the difference between this and the exclusions step: disliking something must never leave a
 * hole in the week.
 */
const DISLIKE_PENALTY = 8000;
/**
 * A SOFT exclusion is a preference, not a ban (§7.2.2): it sinks a pattern below every
 * alternative but leaves it selectable, so "ease off my knees" can never delete squatting or
 * empty out a day.
 */
const SOFT_PENALTY = 1_000_000;

/** Free-form slot-note matchers (only 'rear' exists in SPLIT_LIBRARY today). */
const NOTE_MATCHERS: Record<string, RegExp> = {
  rear: /rear|face[-\s]?pull|reverse[-\s]?fly/i,
};

function noteMatches(ex: ExerciseFull, note: string): boolean {
  const hay = `${ex.slug} ${ex.name}`;
  const re = NOTE_MATCHERS[note];
  return re ? re.test(hay) : hay.toLowerCase().includes(note.toLowerCase());
}

/**
 * Bodyweight staples that stay feasible with literally no equipment. This is the floor of the
 * backfill ladder — the reason a zero-exercise day is impossible by construction. Ordered
 * equipment-free first.
 */
const STAPLE_SLUGS: readonly string[] = [
  'plank',
  'dead-bug',
  'push-up',
  'bodyweight-squat',
  'glute-bridge',
  'jump-rope',
  'inverted-row',
  'russian-twist',
  'farmers-carry',
  'standing-calf-raise',
  'walking-lunge',
  'step-up',
];

interface GenContext {
  owned: Set<string>;
  loved: Set<string>;
  gymDefault: boolean;
  /** patterns removed outright (hard exclusions) */
  hardPatterns: Set<MovementPattern>;
  /** patterns to rank last but never delete (soft exclusions) */
  softPatterns: Set<MovementPattern>;
  excludedSlugs: Set<string>;
  excludedIds: Set<string>;
  favoriteSlugs: Set<string>;
  /** ranked liked slugs (index 0 = favourite); drives selection weighting AND split scoring */
  likedSlugs: string[];
  /** ranked disliked slugs (index 0 = most disliked); a DOWN-RANK, never a ban */
  dislikedSlugs: string[];
  /** disliked slug → the easier same-pattern stand-in the shared rule chose (or `to: null`) */
  dislikeSubs: Map<string, DislikeSubstitution>;
  /** slugs that are somebody's stand-in — preferred for their slot so the swap actually happens */
  dislikeSubSlugs: Set<string>;
  /** excluded exercise id → the substitute the user pinned in ExclusionsStep */
  pinned: Map<string, ExerciseFull>;
  ceiling: number;
  /** difficulty- and equipment-feasible catalog (still contains user-excluded rows so pins fire) */
  pool: ExerciseFull[];
}

/**
 * The ranked preference lists for a draft.
 *
 * `liked_exercises` is the answer of record. `favorites` is the OLD open "any exercises you love?"
 * multi-select and is only consulted when the new list is empty, so a draft written before this
 * step existed keeps working exactly as it did — an old answer is still an answer.
 */
function preferencesForDraft(draft: Partial<OnboardingDraft>): {
  liked: string[];
  disliked: string[];
} {
  const liked = (draft.liked_exercises ?? []).map((f) => f.slug);
  const legacy = (draft.favorites ?? []).map((f) => f.slug);
  return {
    liked: liked.length > 0 ? liked : legacy,
    disliked: (draft.disliked_exercises ?? []).map((f) => f.slug),
  };
}

function contextForDraft(draft: Partial<OnboardingDraft>, experience: ExperienceLevel): GenContext {
  const owned = new Set<string>(draft.equipment_slugs ?? []);
  const loved = new Set<string>(draft.loved_equipment_slugs ?? []);
  const gymDefault = draft.training_location === 'commercial_gym' || draft.training_location == null;

  const hardPatterns = new Set<MovementPattern>();
  const softPatterns = new Set<MovementPattern>();
  for (const m of draft.movement_exclusions ?? []) {
    // A row with no `soft` flag is a hard exclusion (that is what the UI's "We'll avoid: …" says).
    if (m.soft === true) softPatterns.add(m.movement_pattern);
    else hardPatterns.add(m.movement_pattern);
  }
  for (const p of hardPatterns) softPatterns.delete(p);

  const excluded = draft.excluded_exercises ?? [];
  const excludedSlugs = new Set<string>(excluded.map((e) => e.slug));
  const excludedIds = new Set<string>(excluded.map((e) => e.id));

  const pinned = new Map<string, ExerciseFull>();
  for (const e of excluded) {
    if (!e.preferred_substitute_id) continue;
    const sub = mockExerciseById(e.preferred_substitute_id);
    if (sub) pinned.set(e.id, sub);
  }

  const ceiling = DIFFICULTY_RANK[experience as Difficulty] ?? 0;
  const pool = EXERCISES.filter(
    (ex) =>
      (DIFFICULTY_RANK[ex.difficulty] ?? 0) <= ceiling + 1 && feasible(ex, owned, gymDefault),
  );

  const { liked, disliked } = preferencesForDraft(draft);

  // Resolve every disliked movement to an EASIER option that trains the same pattern and muscles.
  // The disliked list is deliberately NOT fed to `excludedExercises` — that field is the real
  // exclusion mechanism and it removes work. Here we only want a preferred stand-in.
  const dislikeSubs = new Map<string, DislikeSubstitution>();
  const dislikeSubSlugs = new Set<string>();
  if (disliked.length > 0) {
    const subs = substituteAllDisliked(disliked, SUB_CATALOG, SUB_EDGES, {
      ownedEquipment: owned,
      trainingLocation: draft.training_location ?? null,
      experience: experience as Difficulty,
      excludedExercises: excludedSlugs,
      excludedPatterns: hardPatterns,
      favorites: new Set(liked),
    });
    for (const sub of subs) {
      dislikeSubs.set(sub.from, sub);
      if (sub.to) dislikeSubSlugs.add(sub.to);
    }
  }

  return {
    owned,
    loved,
    gymDefault,
    hardPatterns,
    softPatterns,
    excludedSlugs,
    excludedIds,
    favoriteSlugs: new Set<string>((draft.favorites ?? []).map((f) => f.slug)),
    likedSlugs: liked,
    dislikedSlugs: disliked,
    dislikeSubs,
    dislikeSubSlugs,
    pinned,
    ceiling,
    pool,
  };
}

/** Does this exercise use a piece of kit the user swiped UP on ("Love it")? */
function usesLovedEquipment(ex: ExerciseFull, ctx: GenContext): boolean {
  if (ctx.loved.size === 0) return false;
  return ex.equipment.some((group) => group.slugs.some((s) => ctx.loved.has(s)));
}

function isUserExcluded(ex: ExerciseFull, ctx: GenContext): boolean {
  return ctx.excludedSlugs.has(ex.slug) || ctx.excludedIds.has(ex.id);
}

function scoreOf(ex: ExerciseFull, ctx: GenContext, slot?: RoleSlot): number {
  let score = ex.popularity;
  // RANK matters: the #1 liked exercise earns the full weight, the #5 a fifth of it — which is the
  // only reason the step asks for a ranked list rather than a set.
  score += likedSelectionBonus(ex.slug, ctx.likedSlugs, W_FAVORITE);
  score -= dislikedSelectionPenalty(ex.slug, ctx.dislikedSlugs, DISLIKE_PENALTY);
  if (ctx.dislikeSubSlugs.has(ex.slug)) score += W_DISLIKE_SUBSTITUTE;
  if (ctx.favoriteSlugs.has(ex.slug) && !ctx.likedSlugs.includes(ex.slug)) score += W_FAVORITE;
  if (usesLovedEquipment(ex, ctx)) score += W_LOVED_EQUIPMENT;
  if (slot) {
    if (slot.note && noteMatches(ex, slot.note)) score += W_SLOT_NOTE;
    if (slot.mechanics && ex.mechanics === slot.mechanics) score += W_MECHANICS;
    if (ex.movement_pattern === slot.pattern) score += W_EXACT_PATTERN;
  }
  if (ctx.softPatterns.has(ex.movement_pattern)) score -= SOFT_PENALTY;
  return score;
}

/** Selectable right now: not already in the day, not banned, and something the user can do. */
function selectable(ex: ExerciseFull, ctx: GenContext, used: Set<string>): boolean {
  if (used.has(ex.slug)) return false;
  if (ctx.hardPatterns.has(ex.movement_pattern as MovementPattern)) return false;
  if (isUserExcluded(ex, ctx)) return false;
  return feasible(ex, ctx.owned, ctx.gymDefault);
}

type SlotBlock = 'exclusions' | 'equipment' | null;

interface SlotResult {
  pick: ExerciseFull | null;
  /** why the slot came up empty, for the honest "your plan is limited" notice */
  blocked: SlotBlock;
}

/**
 * Pick one exercise for a role slot. Candidates are ranked, then walked in order: a candidate the
 * user excluded hands over to their PINNED substitute when they chose one (M3) and is otherwise
 * skipped.
 */
function chooseForSlot(slot: RoleSlot, ctx: GenContext, used: Set<string>): SlotResult {
  const matching = ctx.pool.filter(
    (ex) =>
      !used.has(ex.slug) &&
      !ctx.hardPatterns.has(ex.movement_pattern as MovementPattern) &&
      patternMatches(ex, slot),
  );
  matching.sort((a, b) => scoreOf(b, ctx, slot) - scoreOf(a, ctx, slot));

  for (const cand of matching) {
    if (isUserExcluded(cand, ctx)) {
      // The exclusion fired — honour the substitute the user pinned for it, if we still can.
      const sub = ctx.pinned.get(cand.id);
      if (sub && selectable(sub, ctx, used)) return { pick: sub, blocked: null };
      continue;
    }
    if (ctx.dislikedSlugs.includes(cand.slug)) {
      // A disliked movement only gets this far once everything else for the slot is exhausted (the
      // penalty sinks it). Hand over to the easier same-pattern stand-in if one is still available;
      // otherwise KEEP IT — coverage beats comfort, and `keptDislikes` tells the user why.
      const swap = ctx.dislikeSubs.get(cand.slug)?.to;
      const alt = swap ? EXERCISES.find((ex) => ex.slug === swap) : undefined;
      if (alt && selectable(alt, ctx, used)) return { pick: alt, blocked: null };
    }
    return { pick: cand, blocked: null };
  }

  // Nothing available. Attribute the failure so the UI can tell the user something true.
  const forPattern = EXERCISES.filter((ex) => patternMatches(ex, slot) && !isUserExcluded(ex, ctx));
  const notBanned = forPattern.filter(
    (ex) => !ctx.hardPatterns.has(ex.movement_pattern as MovementPattern),
  );
  if (forPattern.length > 0 && notBanned.length === 0) return { pick: null, blocked: 'exclusions' };
  if (notBanned.length > 0 && !notBanned.some((ex) => feasible(ex, ctx.owned, ctx.gymDefault))) {
    return { pick: null, blocked: 'equipment' };
  }
  return { pick: null, blocked: null };
}

interface DayBuild {
  picks: ExerciseFull[];
  /** how many exercises the template wanted for this day after the session-length trim */
  target: number;
  /** slots we could not fill from the template */
  shortfall: number;
  /** noticeably under-filled — the trigger for the honest "this plan is lean" notice (M1) */
  thin: boolean;
  blockedByExclusions: number;
  blockedByEquipment: number;
  backfilled: number;
}

/**
 * Build one day.
 *
 * ORDERING (m6): feasibility filtering happens across ALL of the template's slots first, and the
 * result is trimmed to the session budget afterwards — the reverse of the old code, which trimmed
 * to the first N slots and only then discovered they were infeasible (which is what turned thin
 * days into EMPTY days).
 */
function buildDay(slots: readonly RoleSlot[], sessionMinutes: number, ctx: GenContext): DayBuild {
  const used = new Set<string>();
  const picks: ExerciseFull[] = [];
  let blockedByExclusions = 0;
  let blockedByEquipment = 0;

  for (const slot of slots) {
    const { pick, blocked } = chooseForSlot(slot, ctx, used);
    if (pick) {
      used.add(pick.slug);
      picks.push(pick);
      continue;
    }
    if (blocked === 'exclusions') blockedByExclusions++;
    else if (blocked === 'equipment') blockedByEquipment++;
  }

  // …now trim to the session budget (§7.5 step 3).
  const budget = slotCountForSession(sessionMinutes);
  const cap = Number.isFinite(budget) ? (budget as number) : slots.length;
  const target = Math.min(cap, slots.length);
  const chosen = picks.slice(0, cap);
  const shortfall = Math.max(0, target - chosen.length);

  // A day must never be empty and must never be a token single exercise (M1). Floor at three,
  // or at the day's own size when the template is smaller (a 1-slot cardio day stays a cardio day).
  const floor = Math.max(1, Math.min(3, target));
  let backfilled = 0;

  if (chosen.length < floor) {
    const dayPatterns = new Set<MovementPattern>();
    for (const s of slots) {
      dayPatterns.add(s.pattern);
      for (const alt of s.alt ?? []) dayPatterns.add(alt);
    }

    const usable = ctx.pool.filter((ex) => selectable(ex, ctx, used));
    const staples = STAPLE_SLUGS.map((slug) => EXERCISES.find((ex) => ex.slug === slug)).filter(
      (ex): ex is ExerciseFull => !!ex && selectable(ex, ctx, used),
    );

    // Relaxation ladder: the day's own patterns → anything feasible → equipment-free staples.
    const ladder: ExerciseFull[][] = [
      usable.filter((ex) => dayPatterns.has(ex.movement_pattern as MovementPattern)),
      usable,
      staples,
    ];

    for (const tier of ladder) {
      if (chosen.length >= floor) break;
      for (const ex of [...tier].sort((a, b) => scoreOf(b, ctx) - scoreOf(a, ctx))) {
        if (chosen.length >= floor) break;
        if (used.has(ex.slug)) continue;
        used.add(ex.slug);
        chosen.push(ex);
        backfilled++;
      }
    }

    // Unreachable with the seed catalog (core_stability can never be hard-excluded and Plank needs
    // no equipment) — kept so "a day is never empty" is true by construction, not by luck.
    if (chosen.length === 0) {
      const last = EXERCISES.find((ex) => ex.slug === 'plank') ?? EXERCISES[0];
      if (last) {
        chosen.push(last);
        backfilled++;
      }
    }
  }

  // A padded day would otherwise read "Russian Twist, Push-up, Plank" — lead with the compounds.
  // Stable partition, and only when we actually padded, so untouched days keep template order.
  const ordered =
    backfilled > 0
      ? [
          ...chosen.filter((ex) => ex.mechanics === 'compound'),
          ...chosen.filter((ex) => ex.mechanics !== 'compound'),
        ]
      : chosen;

  // "Thin" means the day visibly lost content — one slot short of a six-slot day is not thin, a
  // three-of-four day is. A 1-slot cardio day is never thin.
  const thin = chosen.length < Math.min(4, target);

  return {
    picks: ordered,
    target,
    shortfall,
    thin,
    blockedByExclusions,
    blockedByEquipment,
    backfilled,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ honest plan copy (M1) */

const PATTERN_LABEL: Record<string, string> = {
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'lunge',
  horizontal_push: 'push',
  vertical_push: 'overhead press',
  horizontal_pull: 'row',
  vertical_pull: 'pull-up',
  elbow_flexion: 'biceps',
  elbow_extension: 'triceps',
  shoulder_isolation: 'delts',
  core_flexion: 'core',
  core_stability: 'core',
  carry: 'carries',
  hip_extension_iso: 'glutes',
  knee_flexion_iso: 'hamstrings',
  knee_extension_iso: 'quads',
  calf_raise: 'calves',
  cardio: 'cardio',
  conditioning: 'conditioning',
  mobility: 'mobility',
  static_stretch: 'stretch',
};

function patternLabelsFor(rows: readonly RoutineExercise[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const ex = mockExerciseById(row.exercise_id);
    const label = ex ? PATTERN_LABEL[ex.movement_pattern] : undefined;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** `2 exercises` / `1 exercise` — pluralisation done once, used everywhere (m1). */
export function exerciseCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
}

/**
 * An honest one-line summary of what a day ACTUALLY contains — never what its template promised.
 * e.g. "4 exercises · push · row · core".
 */
export function describeDay(day: RoutineDay): string {
  const count = exerciseCountLabel(day.exercises.length);
  const labels = patternLabelsFor(day.exercises);
  return labels.length > 0 ? `${count} · ${labels.slice(0, 4).join(' · ')}` : count;
}

/**
 * Every distinct movement pattern a day trains, in the order it is performed — UNABRIDGED.
 *
 * `describeDay` stops at four labels because it has to survive on one line; a surface with room to
 * breathe must not inherit that cap, or a six-slot day silently loses its 5th and 6th pattern.
 * Same rows, same label table, no slice — so the one-liner and the detail view can differ in how
 * MUCH they show but never in WHAT they claim the day contains.
 */
export function dayPatternLabels(day: RoutineDay): string[] {
  return patternLabelsFor(day.exercises);
}

function describeRoutine(days: readonly RoutineDay[], limited: boolean): string {
  const labels: string[] = [];
  for (const day of days) {
    for (const label of patternLabelsFor(day.exercises)) {
      if (!labels.includes(label)) labels.push(label);
    }
  }
  const dayPart = `${days.length} ${days.length === 1 ? 'day' : 'days'} a week`;
  const covers = labels.length > 0 ? ` · covers ${labels.slice(0, 5).join(', ')}` : '';
  const tail = limited ? ' Built from the equipment you have.' : '';
  return `${dayPart}${covers}.${tail}`;
}

/* ══════════════════════════════════════════════════════════════════════════ plan coverage (M1 ii) */

export interface PlanCoverage {
  /** true when equipment / exclusions stopped us filling the plan as designed */
  limited: boolean;
  cause: 'equipment' | 'exclusions' | 'both' | null;
  title: string;
  body: string;
  actionLabel: string;
  /** onboarding step to send the user to; maps to /settings once onboarding is done */
  actionStep: 'equipment' | 'exclusions';
  /** template slots we could not fill */
  shortfall: number;
  /** exercises added by the backfill ladder to keep days trainable */
  backfilled: number;
  /** smallest day in the plan */
  thinnestDay: number;
  /**
   * Disliked movements the catalog had NO easier same-pattern replacement for, so the original
   * stayed in the plan.
   *
   * Additive and separate from `limited` / `cause` on purpose: this is not the plan being cut
   * short by equipment or protected areas, it is one lift the athlete would rather not do still
   * being there — a much smaller thing, and it must not fire the "your plan is running lean"
   * banner. Silently leaving the disliked lift in with no explanation is the failure mode this
   * field exists to prevent.
   */
  keptDislikes: { slug: string; name: string; reason: string }[];
  /** one honest line naming them, or '' when every dislike was successfully swapped */
  keptDislikesNote: string;
}

const NO_COVERAGE_ISSUE: PlanCoverage = {
  limited: false,
  cause: null,
  title: '',
  body: '',
  actionLabel: '',
  actionStep: 'equipment',
  shortfall: 0,
  backfilled: 0,
  thinnestDay: 0,
  keptDislikes: [],
  keptDislikesNote: '',
};

function coverageCopy(
  cause: 'equipment' | 'exclusions' | 'both',
): Pick<PlanCoverage, 'title' | 'body' | 'actionLabel' | 'actionStep'> {
  if (cause === 'exclusions') {
    return {
      title: 'Your protected areas are trimming this plan',
      body: 'The areas you asked us to protect rule out whole movement patterns, so we filled the gaps with safe alternatives. Review them if any feel stricter than you meant.',
      actionLabel: 'Review protected areas',
      actionStep: 'exclusions',
    };
  }
  if (cause === 'equipment') {
    return {
      title: 'Your kit is limiting this plan',
      body: 'With the equipment you have we could not fill every slot, so some days lean on bodyweight staples. Adding a bench, dumbbells or a pull-up bar unlocks far more.',
      actionLabel: 'Add equipment',
      actionStep: 'equipment',
    };
  }
  return {
    title: 'This plan is running lean',
    body: 'Between the equipment you have and the areas you are protecting, several slots had nothing to fill them, so we backed them with bodyweight staples. Add equipment or ease a protected area to unlock more.',
    actionLabel: 'Add equipment',
    actionStep: 'equipment',
  };
}

/**
 * The honest line for disliked movements we could not swap out.
 *
 * Names them, says WHY they stayed, and points at the step that would actually remove them — the
 * exclusions step, which is a different question with a different consequence. Deleting the
 * movement on a dislike alone would leave the pattern untrained, and pretending we had swapped it
 * would be worse than either.
 */
function keptDislikesCopy(kept: readonly DislikeSubstitution[]): string {
  if (kept.length === 0) return '';
  const names = kept.map((k) => k.fromName);
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
  const verb = names.length === 1 ? 'is' : 'are';
  return `${list} ${verb} still in your plan: nothing in the catalogue trains the same thing more easily, and dropping ${names.length === 1 ? 'it' : 'them'} would leave a gap in your week. If ${names.length === 1 ? 'it is' : 'they are'} genuinely off-limits, add ${names.length === 1 ? 'it' : 'them'} under the areas you want protected instead.`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════ generation */

interface GeneratedPlan {
  routine: Routine;
  coverage: PlanCoverage;
}

/**
 * Session length is applied by `buildDay` AFTER feasibility filtering, so the planner is asked for
 * every slot the template defines.
 */
const NO_TRIM_MINUTES = Number.MAX_SAFE_INTEGER;

function generatePlan(draft: Partial<OnboardingDraft>): GeneratedPlan {
  const goal = (draft.primary_goal ?? 'general_health') as GoalType;
  const experience = (draft.experience_level ?? 'beginner') as ExperienceLevel;
  const defaults = suggestOnboardingDefaults(goal, experience);
  const daysPerWeek = draft.days_per_week ?? defaults.days_per_week;
  const sessionMinutes = draft.session_minutes ?? defaults.session_minutes;
  const preferredDays = draft.preferred_days ?? [];

  const ctx = contextForDraft(draft, experience);

  // A chosen split (§ WS-5 SPLIT_LIBRARY) supplies the week's day structure. With no split — or
  // the explicit 'auto' sentinel — `planDays` is exactly the old days-per-week behaviour.
  const split = getSplit(draft.split_slug ?? null);
  const plan = planDays({
    daysPerWeek,
    sessionMinutes: NO_TRIM_MINUTES,
    preferredDays,
    split,
  });

  let shortfall = 0;
  let backfilled = 0;
  let thinDays = 0;
  let blockedByExclusions = 0;
  let blockedByEquipment = 0;

  const days: RoutineDay[] = plan.map((planned, dayIdx) => {
    const built = buildDay(planned.slots, sessionMinutes, ctx);
    shortfall += built.shortfall;
    backfilled += built.backfilled;
    if (built.thin) thinDays++;
    blockedByExclusions += built.blockedByExclusions;
    blockedByEquipment += built.blockedByEquipment;

    const exercises: RoutineExercise[] = built.picks.map((pick, i) => {
      const mechanics = pick.mechanics === 'compound' ? 'compound' : 'isolation';
      // Physiology, not preference: the ONE sex difference the evidence supports is applied here,
      // to rest and reps only. It never caps load, never removes a compound, never lowers a target.
      const rx = sexAdjustedPrescription({
        sex: draft.sex ?? null,
        rest_seconds: restSeconds(goal, mechanics),
        rep_min: defaults.rep_min,
        rep_max: defaults.rep_max,
      });
      return {
        id: `${demoDayId(dayIdx)}-ex-${i + 1}`,
        position: i + 1,
        exercise_id: pick.id,
        exercise_slug: pick.slug,
        exercise_name: pick.name,
        image_path: pick.image_path,
        sets: mechanics === 'compound' ? 4 : 3,
        rep_min: rx.rep_min,
        rep_max: rx.rep_max,
        target_rpe: 7,
        rest_seconds: rx.rest_seconds,
        superset_group: null,
        notes: null,
      };
    });

    return {
      id: demoDayId(dayIdx),
      day_index: dayIdx,
      name: planned.name,
      focus: planned.focus,
      weekday: planned.weekday,
      exercises,
    };
  });

  // Only claim the plan is limited when we can name a TRUE reason for it.
  const cause: PlanCoverage['cause'] =
    blockedByExclusions > 0 && blockedByEquipment > 0
      ? 'both'
      : blockedByExclusions > 0
        ? 'exclusions'
        : blockedByEquipment > 0
          ? 'equipment'
          : null;
  const limited = (backfilled > 0 || thinDays > 0) && cause !== null;
  const thinnestDay = days.reduce((min, d) => Math.min(min, d.exercises.length), Infinity);

  // Report only what the plan ACTUALLY contains. `ctx.keptDislikes` is what the shared rule could
  // not find a swap for, which is a different question from what survived into the week — a slot
  // may simply never have come up. Claiming "Bench Press is still in your plan" about a plan with
  // no bench press in it is exactly the kind of derived-from-the-template copy the M1 work banned.
  const plannedSlugs = new Set(days.flatMap((d) => d.exercises.map((e) => e.exercise_slug)));
  const survived = ctx.dislikedSlugs
    .map((slug) => ctx.dislikeSubs.get(slug))
    .filter((k): k is DislikeSubstitution => !!k && plannedSlugs.has(k.from));
  const keptDislikes = survived.map((k) => ({
    slug: k.from,
    name: k.fromName,
    reason: k.reason,
  }));
  const keptDislikesNote = keptDislikesCopy(survived);

  const coverage: PlanCoverage = limited
    ? {
        limited: true,
        cause,
        ...coverageCopy(cause),
        shortfall,
        backfilled,
        thinnestDay,
        keptDislikes,
        keptDislikesNote,
      }
    : { ...NO_COVERAGE_ISSUE, thinnestDay, keptDislikes, keptDislikesNote };

  const routine: Routine = {
    id: DEMO_ROUTINE_ID,
    name: split ? split.name : `${splitNameForDays(daysPerWeek)} — ${daysPerWeek}-day plan`,
    // A named program's blurb is only allowed to stand when the plan actually delivers it. The
    // moment equipment/exclusions thin the week, the description is derived from what the days
    // REALLY contain (M1) instead of repeating "every session hits squat, hinge, push and pull".
    description:
      limited || !split ? describeRoutine(days, limited) : split.description,
    goal,
    source: 'generated',
    is_active: true,
    start_date: localISO(),
    days,
  };

  return { routine, coverage };
}

/** Build the starter routine tree from the draft (§7.5). */
export function routineForDraft(draft: Partial<OnboardingDraft>): Routine {
  return generatePlan(draft).routine;
}

/**
 * How well the draft's equipment / exclusions let us realise the plan. Pure and deterministic —
 * re-running generation gives the same answer, so the UI can call this without threading extra
 * state through the store.
 */
export function planCoverageForDraft(draft: Partial<OnboardingDraft>): PlanCoverage {
  return generatePlan(draft).coverage;
}

/**
 * The sex-aware rest/rep adjustment applied to this draft's plan, WITH the reason for it.
 *
 * Exported rather than baked into every routine row's `notes` for two reasons: the sentence is the
 * same for all of them (so repeating it 24 times is noise), and it belongs next to the CONTROL that
 * changes the numbers, not next to the numbers themselves. `adjusted === false` means nothing was
 * changed and there is nothing to label — which is the case for every sex except female, and for a
 * draft that never answered the question.
 *
 * A caller that renders the adjusted rest or rep range MUST render `label` too. An unexplained
 * personalisation is indistinguishable from a bug, and this one is about the athlete's body.
 */
export function prescriptionAdjustmentForDraft(
  draft: Partial<OnboardingDraft>,
): SexPrescriptionAdjustment {
  const goal = (draft.primary_goal ?? 'general_health') as GoalType;
  const experience = (draft.experience_level ?? 'beginner') as ExperienceLevel;
  const defaults = suggestOnboardingDefaults(goal, experience);
  return sexAdjustedPrescription({
    sex: (draft.sex ?? null) as SexType | null,
    // The compound rest interval is the one the plan leads with, so it is the honest number to show.
    rest_seconds: restSeconds(goal, 'compound'),
    rep_min: defaults.rep_min,
    rep_max: defaults.rep_max,
  });
}

/**
 * Rank the split library for a draft, now that the preference step runs BEFORE the split step.
 *
 * The whole point of moving the question earlier: `liked_exercise_slugs` reaches `recommendSplits`,
 * so the programs offered are shaped by what the athlete enjoys instead of being chosen blind. The
 * bonus is capped well below days/week, experience and goal (see `preferences.ts`), so it reorders
 * appropriate programs rather than promoting inappropriate ones.
 */
export function splitRecommendationInputForDraft(
  draft: Partial<OnboardingDraft>,
): SplitRecommendationInput {
  const { liked } = preferencesForDraft(draft);
  return {
    days_per_week: draft.days_per_week ?? null,
    experience_level: draft.experience_level ?? null,
    goals: draft.goals ?? null,
    primary_goal: draft.primary_goal ?? null,
    secondary_goal: draft.secondary_goal ?? null,
    equipment_slugs: draft.equipment_slugs ?? null,
    training_location: draft.training_location ?? null,
    session_minutes: draft.session_minutes ?? null,
    liked_exercise_slugs: liked,
    catalog: SUB_CATALOG,
  };
}

function profileForDraft(draft: Partial<OnboardingDraft>): Profile {
  const defaults = suggestOnboardingDefaults(
    (draft.primary_goal ?? 'general_health') as GoalType,
    (draft.experience_level ?? 'beginner') as ExperienceLevel,
  );
  const name = draft.display_name?.trim();
  return {
    display_name: name ? name : null,
    sex: (draft.sex ?? 'prefer_not_to_say') as Profile['sex'],
    birthdate: draft.birthdate ?? '1990-01-01',
    height_cm: draft.height_cm ?? 170,
    unit_system: draft.unit_system ?? 'metric',
    experience_level: (draft.experience_level ?? 'beginner') as Difficulty,
    primary_goal: (draft.primary_goal ?? 'general_health') as GoalType,
    secondary_goal: (draft.secondary_goal ?? null) as Profile['secondary_goal'],
    training_location: (draft.training_location ?? 'commercial_gym') as Profile['training_location'],
    days_per_week: draft.days_per_week ?? defaults.days_per_week,
    session_minutes: draft.session_minutes ?? defaults.session_minutes,
    preferred_days: draft.preferred_days ?? [],
  };
}

function nutritionProfileForDraft(
  draft: Partial<OnboardingDraft>,
  targets: NutritionTargets,
): NutritionProfile {
  return {
    diet_type: (draft.diet_type ?? 'none') as NutritionProfile['diet_type'],
    allergies: draft.allergies ?? [],
    meals_per_day: draft.meals_per_day ?? 3,
    kcal_target: targets.kcal_target,
    protein_g_target: targets.protein_g_target,
    carbs_g_target: targets.carbs_g_target,
    fat_g_target: targets.fat_g_target,
    targets_source: draft.targets_source ?? 'suggested',
  };
}

/**
 * Finish onboarding: compute + persist profile / routine / targets from the draft, stamp the
 * completion contract, and return the generated routine.
 */
export function finalizeOnboarding(draft: Partial<OnboardingDraft>): Routine {
  const targetsFull = targetsForDraft(draft);
  const targets: NutritionTargets = {
    kcal_target: draft.kcal_target ?? targetsFull.kcal_target,
    protein_g_target: draft.protein_g_target ?? targetsFull.protein_g_target,
    carbs_g_target: draft.carbs_g_target ?? targetsFull.carbs_g_target,
    fat_g_target: draft.fat_g_target ?? targetsFull.fat_g_target,
  };
  const routine = routineForDraft(draft);
  const profile = profileForDraft(draft);
  const nutritionProfile = nutritionProfileForDraft(draft, targets);

  update((s) => ({
    ...s,
    draft,
    onboardingStep: 'done',
    completedAt: new Date().toISOString(),
    profile,
    nutritionProfile,
    routine,
    targets,
  }));

  return routine;
}

/**
 * Switch the active training split AFTER onboarding (Workouts → "Change split") and rebuild the
 * routine from the stored draft. Everything else the user told us — equipment, exclusions, liked
 * exercises, session length, preferred weekdays — is honoured exactly as during onboarding.
 *
 * `slug` may be a SPLIT_LIBRARY slug or `'auto'` / null to go back to the automatic day plan.
 */
export function applySplit(slug: string | null): Routine {
  const state = getState();
  const draft: Partial<OnboardingDraft> = { ...state.draft, split_slug: slug };
  const routine = routineForDraft(draft);
  update((s) => ({ ...s, draft, routine }));
  return routine;
}
