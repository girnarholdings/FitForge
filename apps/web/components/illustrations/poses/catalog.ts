/**
 * Exercise → rig lookup, split out of `rigs.tsx`.
 *
 * `rigs.tsx` is the authored ART: pure geometry on a 120×120 canvas, with no knowledge of the
 * exercise catalog. This module is the only place that reads `seed/data/exercises.json`, which
 * keeps the art importable by anything that cannot resolve a JSON module — notably the rig
 * invariant suite in `tests/e2e/pose-rigs.spec.ts`, which checks the geometry directly.
 */
import exercisesSeed from '../../../../../seed/data/exercises.json';
import { POSE_RIGS, PATTERN_DEFAULT_RIG } from './rigs';
import type { ImplementKind, Rig } from './types';

interface SeedRow {
  slug: string;
  movement_pattern: string;
  equipment: string[][];
  pose_pattern?: string;
}

const SEED = exercisesSeed as unknown as SeedRow[];

export const RIG_BY_EXERCISE = new Map<string, string>();
const EQUIP_BY_EXERCISE = new Map<string, string[]>();
for (const e of SEED) {
  RIG_BY_EXERCISE.set(e.slug, e.pose_pattern ?? PATTERN_DEFAULT_RIG[e.movement_pattern] ?? 'plank');
  EQUIP_BY_EXERCISE.set(e.slug, e.equipment.flat());
}

/** Equipment slug → the glyph drawn in the figure's hands. First match wins. */
const IMPLEMENT_BY_EQUIPMENT: Array<[ImplementKind, string[]]> = [
  ['bar', ['barbell', 'ez-curl-bar', 'smith-machine']],
  ['dumbbell', ['dumbbell']],
  ['kettlebell', ['kettlebell']],
  ['cable', ['cable-machine', 'lat-pulldown', 'seated-row-machine']],
  ['band', ['resistance-bands', 'suspension-trainer']],
  ['ball', ['medicine-ball']],
  ['wheel', ['ab-wheel']],
  [
    'machine',
    [
      'leg-press',
      'hack-squat-machine',
      'leg-extension-machine',
      'leg-curl-machine',
      'chest-press-machine',
      'pec-deck',
      'shoulder-press-machine',
      'hip-thrust-machine',
      'calf-raise-machine',
    ],
  ],
  ['plate', ['weight-plates']],
];

export function implementFor(equipment: string[]): ImplementKind {
  for (const [kind, slugs] of IMPLEMENT_BY_EQUIPMENT) {
    if (equipment.some((e) => slugs.includes(e))) return kind;
  }
  return 'none';
}

/** Resolve a rig from an exercise slug, a rig id, or a movement_pattern. */
export function resolveRig(exerciseSlug?: string, pattern?: string): Rig | null {
  if (exerciseSlug) {
    const id = RIG_BY_EXERCISE.get(exerciseSlug);
    if (id && POSE_RIGS[id]) return POSE_RIGS[id];
  }
  if (pattern) {
    if (POSE_RIGS[pattern]) return POSE_RIGS[pattern];
    const id = PATTERN_DEFAULT_RIG[pattern];
    if (id && POSE_RIGS[id]) return POSE_RIGS[id];
  }
  return null;
}

/** Equipment slugs recorded in the seed for an exercise. */
export function equipmentForExercise(exerciseSlug?: string): string[] {
  return (exerciseSlug && EQUIP_BY_EXERCISE.get(exerciseSlug)) || [];
}
