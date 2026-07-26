/**
 * Muscle-map barrel (§4.0 · WS-C). Surfaced by the frozen top-level
 * `components/illustrations/index.ts` (`export * from './muscle-map'`).
 */
export { MuscleMap, OrientationChip } from './MuscleMap';
export type { MuscleMapExtendedProps } from './MuscleMap';
export { MuscleMapThumb } from './MuscleMapThumb';
export type { MuscleMapThumbProps } from './MuscleMapThumb';
export { BodyFigure } from './BodyFigure';
export type { BodyFigureProps } from './BodyFigure';
export { BodyExplorer, FrontGlyph, BackGlyph } from './BodyExplorer';
export type { BodyExplorerProps } from './BodyExplorer';
export type { MuscleSlug, MuscleView, MusclePath, MuscleMapProps } from './types';
export { MUSCLE_NAMES, ALL_MUSCLE_SLUGS } from './types';
export { MUSCLE_PATHS, MUSCLE_LABEL_ANCHORS, MUSCLE_HIT_PAD, MUSCLE_HIT_ORDER } from './paths';
export { BODY_OUTLINE, BODY_DETAILS, VIEW_BOX, BODY_RATIO, MIRROR_TRANSFORM } from './outline';
export {
  styleFor,
  slugsInView,
  viewOf,
  autoView,
  VIEW_LABEL,
  VIEW_CAPTION,
  type MuscleStyle,
} from './paint';
