'use client';

/**
 * PREP — the dynamic block before a session and the static block after it.
 *
 * WHY THIS EXISTS AT ALL. The warm-up ramp card in the player tells the athlete, verbatim:
 * "Mobility work warms your body; this warms the lift — under a heavy-first scheme you need both."
 * The app named a prerequisite it did not supply. A beginner reads that, correctly concludes they
 * are missing half their warm-up, and has nowhere in the app to get it. Meanwhile all 15 mobility
 * and static-stretch rows added to the catalog were unreachable from any generated session.
 *
 * THE ORDERING RULE IS THE WHOLE POINT, and it is the one part of this with real evidence behind
 * it: static stretching BEFORE lifting costs strength, dynamic warm-up does not. Behm et al. (2016)
 * put static at −3.7% and dynamic at +1.3% on subsequent performance, which is why this module
 * returns two separate blocks with fixed positions rather than one "stretching" list. See
 * {@link PREP_EVIDENCE}.
 *
 * WHAT IS TIER C. Which specific movements map to which pattern, and the 30-45s holds, are coaching
 * convention — the same honesty the progression module applies to its ramp percentages.
 *
 * NOT SETS. Every item here is excluded from `totalSets`/`doneSets`, from the logged session, and
 * from every volume number in the app, exactly as the warm-up ramp is. The app's training currency
 * is HARD SETS per muscle per week, calibrated against the Pelland / Baz-Valle bands; a cat-cow
 * counted as a set would inflate every weekly goal reading and every heat colour in the product.
 */
import { mockExerciseById, type RoutineDay } from '@/components/features/_mock/data';
import { EXERCISES } from '@/components/features/_mock/data';
import type { MuscleLoad } from './insights';

/** One prep movement, as the player renders it. Never a working set — see the module header. */
export interface PrepItem {
  /** catalog slug, so the row links to the real how-to page */
  slug: string;
  name: string;
  /** how long to hold or work it, in seconds */
  seconds: number;
  /** why THIS movement is in THIS session — never a generic "good for mobility" */
  cue: string;
}

export interface PrepBlocks {
  /** dynamic mobility, BEFORE the session — keyed off the day's movement patterns */
  pre: PrepItem[];
  /** static stretches, AFTER the session — keyed off the muscles the day actually loaded */
  post: PrepItem[];
}

/** Dynamic work runs long enough to raise tissue temperature; a hold does not need to. */
const PRE_SECONDS = 45;
const POST_SECONDS = 30;
/** Two to three items. Longer than that and it is a session of its own that nobody performs. */
const MAX_PRE = 3;
const MAX_POST = 3;

/**
 * Movement pattern → the dynamic movements that prepare it.
 *
 * Ordered within each pattern by how directly they rehearse it, because the picker takes the first
 * unused entry. A slug that is not in the catalog is skipped rather than rendered as a dead row.
 */
const PRE_BY_PATTERN: Readonly<Record<string, readonly { slug: string; cue: string }[]>> = {
  squat: [
    { slug: 'leg-swings', cue: 'Opens the hips before you sit into a squat' },
    { slug: 'worlds-greatest-stretch', cue: 'Hips and ankles, through the range a squat asks for' },
  ],
  hinge: [
    { slug: 'inchworm', cue: 'Lengthens the hamstrings before you load them' },
    { slug: 'cat-cow', cue: 'Wakes the spine up before it has to stay rigid under a bar' },
  ],
  lunge: [
    { slug: 'worlds-greatest-stretch', cue: 'Hip flexors and adductors, in the split stance you are about to load' },
    { slug: 'leg-swings', cue: 'Front-to-back through the stride you are about to train' },
  ],
  horizontal_push: [
    { slug: 'arm-circles', cue: 'Blood into the shoulders before they press' },
    { slug: 'band-pull-apart', cue: 'Fires the upper back so the shoulder sits where it should under a press' },
  ],
  vertical_push: [
    { slug: 'arm-circles', cue: 'Full overhead range before you go there loaded' },
    { slug: 'thoracic-rotation', cue: 'Upper-back rotation — where overhead range actually comes from' },
  ],
  horizontal_pull: [
    { slug: 'band-pull-apart', cue: 'Switches the rhomboids on before they row' },
    { slug: 'cat-cow', cue: 'Spinal segments moving before you brace them' },
  ],
  vertical_pull: [
    { slug: 'thoracic-rotation', cue: 'Frees the upper back before you pull overhead' },
    { slug: 'arm-circles', cue: 'Shoulders through their range before they take bodyweight' },
  ],
  core_stability: [{ slug: 'cat-cow', cue: 'Finds the neutral spine you are about to hold' }],
  core_flexion: [{ slug: 'cat-cow', cue: 'Flexion and extension, unloaded, first' }],
  carry: [{ slug: 'arm-circles', cue: 'Shoulders and traps before they hold a load' }],
  conditioning: [
    { slug: 'leg-swings', cue: 'Hips loose before anything explosive' },
    { slug: 'inchworm', cue: 'Whole-body, gradually — conditioning starts cold otherwise' },
  ],
};

/**
 * Muscle → the static stretch that actually lengthens it.
 *
 * Keyed off the muscles a session LOADED, so the cooldown belongs to the session that just happened
 * rather than being a fixed list. A leg day ends on hamstrings and glutes; a press day ends on pecs
 * and front delts.
 */
const POST_BY_MUSCLE: Readonly<Record<string, { slug: string; cue: string }>> = {
  hamstrings: { slug: 'standing-hamstring-stretch', cue: 'You just loaded these hard' },
  'glute-max': { slug: 'figure-four-stretch', cue: 'Glutes, after the hip work' },
  'glute-med': { slug: 'pigeon-stretch', cue: 'The deeper hip rotators, after squatting or hinging' },
  'hip-flexors': { slug: 'kneeling-hip-flexor-stretch', cue: 'Hip flexors shorten under squats and sitting alike' },
  quads: { slug: 'kneeling-hip-flexor-stretch', cue: 'Front of the hip and thigh, after knee-dominant work' },
  pecs: { slug: 'doorway-chest-stretch', cue: 'Chest, after pressing' },
  'front-delts': { slug: 'doorway-chest-stretch', cue: 'Front of the shoulder, after overhead or bench work' },
  calves: { slug: 'wall-calf-stretch', cue: 'Calves, after the standing work' },
  lats: { slug: 'childs-pose', cue: 'Lats and the whole back line, after pulling' },
  'lower-back': { slug: 'childs-pose', cue: 'Lets the low back decompress after loaded work' },
  obliques: { slug: 'seated-spinal-twist', cue: 'Rotation, after bracing everything down' },
  abs: { slug: 'seated-spinal-twist', cue: 'Trunk, after it spent the session rigid' },
  adductors: { slug: 'pigeon-stretch', cue: 'Inner thigh and hip, after the wide-stance work' },
};

const BY_SLUG = new Map(EXERCISES.map((e) => [e.slug, e]));

function toItem(slug: string, cue: string, seconds: number): PrepItem | null {
  const ex = BY_SLUG.get(slug);
  if (!ex) return null;
  return { slug, name: ex.name, seconds, cue };
}

/**
 * The prep blocks for one session.
 *
 * `loads` is `dayStats(...).loads` — ranked muscle loads, direct volume first. Only muscles with
 * DIRECT work drive the cooldown: everything picks up half-set secondary credit somewhere, and
 * stretching a muscle the session merely brushed is filler that teaches the athlete to skip the
 * block. A day with no direct work anywhere (pure conditioning) correctly returns an empty `post`
 * rather than inventing one — no block is better than a wrong block.
 */
export function prepForDay(day: RoutineDay, loads: readonly MuscleLoad[] = []): PrepBlocks {
  // ---- PRE: keyed off the patterns the session is about to train, in performance order.
  const pre: PrepItem[] = [];
  const usedPre = new Set<string>();
  const patterns: string[] = [];
  for (const row of [...day.exercises].sort((a, b) => a.position - b.position)) {
    const p = mockExerciseById(row.exercise_id)?.movement_pattern;
    if (p && !patterns.includes(p)) patterns.push(p);
  }
  for (const pattern of patterns) {
    if (pre.length >= MAX_PRE) break;
    for (const candidate of PRE_BY_PATTERN[pattern] ?? []) {
      if (usedPre.has(candidate.slug)) continue;
      const item = toItem(candidate.slug, candidate.cue, PRE_SECONDS);
      if (!item) continue;
      usedPre.add(candidate.slug);
      pre.push(item);
      // ONE item per pattern on the first pass. A squat/hinge/push day should warm all three, not
      // spend its entire mobility budget on hips.
      break;
    }
  }

  // ---- POST: keyed off what the session actually loaded, hardest-hit muscle first.
  const post: PrepItem[] = [];
  const usedPost = new Set<string>();
  for (const load of loads) {
    if (post.length >= MAX_POST) break;
    if (load.direct <= 0) continue;
    const candidate = POST_BY_MUSCLE[load.slug];
    if (!candidate || usedPost.has(candidate.slug)) continue;
    const item = toItem(candidate.slug, candidate.cue, POST_SECONDS);
    if (!item) continue;
    usedPost.add(candidate.slug);
    post.push(item);
  }

  return { pre, post };
}

/**
 * The evidence for the ORDERING, shown on screen rather than kept in this comment — the same rule
 * the volume targets and the progression schemes follow.
 */
export const PREP_EVIDENCE = {
  claim:
    'Static stretching before lifting reduced subsequent strength by about 3.7%; dynamic warm-up improved it by about 1.3%. That is why the mobility block runs BEFORE and the stretches run AFTER — the order is the finding, not a preference.',
  cite: 'Behm, Blazevich, Kay & McGuigan, 2016',
  where: 'Appl Physiol Nutr Metab 41(1):1-11 — Tier A (systematic review)',
  url: 'https://pubmed.ncbi.nlm.nih.gov/26642915/',
} as const;
