/**
 * Pose-frame system (WS-3) — offline, self-authored SVG "how to perform" art.
 *
 * Not re-exported by the frozen `components/illustrations/index.ts` barrel
 * (owned elsewhere); import from `@/components/illustrations/poses`.
 */
export { PoseFrames } from './PoseFrames';
export {
  POSE_RIGS,
  PATTERN_DEFAULT_RIG,
  resolveRig,
  implementFor,
  equipmentForExercise,
} from './rigs';
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
