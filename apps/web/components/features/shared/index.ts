/**
 * Cross-surface feature components (WS-4).
 *
 * `MuscleVolume` is the aggregated targeting view — sets-per-muscle-per-week with a silhouette
 * heatmap and ranked bars. It is surfaced today on /exercises ("Plan targets") and is designed to
 * be dropped into routine previews, workout summaries, and Progress without changes.
 */
export {
  MuscleVolume,
  computeMuscleVolume,
  volumeHeat,
  bandFor,
  PRIMARY_CREDIT,
  SECONDARY_CREDIT,
  VOLUME_BANDS,
  BAND_LABEL,
  BAND_HELP,
} from './MuscleVolume';
export type {
  MuscleVolumeProps,
  MuscleVolumeRow,
  VolumeSource,
  VolumeBand,
} from './MuscleVolume';
