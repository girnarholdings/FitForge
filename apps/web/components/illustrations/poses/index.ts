/**
 * Pose-frame system (WS-3) — offline, self-authored SVG "how to perform" art.
 *
 * Not re-exported by the frozen `components/illustrations/index.ts` barrel
 * (owned elsewhere); import from `@/components/illustrations/poses`.
 */
export { PoseFrames } from './PoseFrames';
/** the authored art (pure geometry — no catalog knowledge) */
export { POSE_RIGS, PATTERN_DEFAULT_RIG } from './rigs';
/** the seed-driven exercise → rig lookup */
export { resolveRig, implementFor, equipmentForExercise, RIG_BY_EXERCISE } from './catalog';
export type {
  Pose,
  Pt,
  Frame,
  Rig,
  Arrow,
  HiSeg,
  ImplementKind,
  PoseFramesProps,
} from './types';
