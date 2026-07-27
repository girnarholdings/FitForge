/**
 * Pose-frame system (WS-3 · "how is this exercise performed").
 *
 * Fully offline, self-authored SVG. The unit of art is a *rig* — one movement
 * pattern drawn as 2–3 stick-figure key frames (START → MID → FINISH) on a
 * 120×120 canvas. Exercises map onto a rig and swap the *implement* glyph, so a
 * barbell back squat and a goblet squat share one rig and read differently.
 *
 * Style contract (matches the equipment glyphs in ../equipment):
 *   - muted slate figure strokes (`currentColor`, inheriting text-muted-foreground)
 *   - the moving segment / loaded implement is drawn in GOLD (`var(--accent)`)
 *   - one curved motion arrow per frame carries the direction of travel
 */
import type * as React from 'react';

/** A point on the 120×120 frame canvas. */
export type Pt = readonly [number, number];

/**
 * A key frame skeleton. `hip`/`sh` are the *near* side in a side view and the
 * viewer-left side in a front view; the `*2` fields are the far side and are
 * drawn at reduced opacity in side views, full opacity in front views.
 */
export interface Pose {
  head: Pt;
  neck: Pt;
  sh: Pt;
  el: Pt;
  wr: Pt;
  hip: Pt;
  kn: Pt;
  an: Pt;
  toe: Pt;
  /** far arm */
  sh2?: Pt;
  el2?: Pt;
  wr2?: Pt;
  /** far leg */
  hip2?: Pt;
  kn2?: Pt;
  an2?: Pt;
  toe2?: Pt;
}

/** Segments that can be rendered in gold to call out what is moving. */
export type HiSeg = 'arm' | 'arm2' | 'leg' | 'leg2' | 'torso';

/** A curved motion arrow: quadratic from `from` to `to`, bowed by `bow` px. */
export interface Arrow {
  from: Pt;
  to: Pt;
  bow?: number;
}

/** The loaded implement drawn at the hands / shoulders / feet. */
export type ImplementKind =
  | 'bar'
  | 'dumbbell'
  | 'kettlebell'
  | 'cable'
  | 'band'
  | 'ball'
  | 'wheel'
  | 'machine'
  | 'plate'
  | 'none';

export interface Frame {
  /** tiny caption under the frame, e.g. "Start" / "Bottom" / "Finish". */
  caption: string;
  pose: Pose;
  /** segments drawn in gold. */
  hi?: HiSeg[];
  /** implement anchor(s). Two anchors = one implement per hand. */
  imp?: Pt;
  imp2?: Pt;
  /** implement rotation in degrees. */
  impAngle?: number;
  /** origin of the cable/band line (pulley, anchor point, bar). */
  cableFrom?: Pt;
  /**
   * Origin for the SECOND implement's cable/band. Two-stack movements (a cable
   * fly has one weight stack per side) must not run both handles back to a
   * single pulley — that draws a cable straight across the lifter's chest.
   * Defaults to `cableFrom` when omitted (rope/single-pulley movements).
   */
  cableFrom2?: Pt;
  arrow?: Arrow;
  /** frame-specific scenery (rope arc, platform position…). */
  art?: React.ReactNode;
}

export interface Rig {
  id: string;
  /** human label, e.g. "Squat" — used for the accessible description. */
  label: string;
  view: 'side' | 'front';
  /** static scenery drawn behind the figure (bench, rack, machine). */
  scenery?: React.ReactNode;
  /** draw the floor line (default true). */
  ground?: boolean;
  /** force an implement kind regardless of the exercise's equipment. */
  implement?: ImplementKind;
  frames: Frame[];
}

export interface PoseFramesProps {
  /** Preferred: resolves rig + implement straight from the seed data. */
  exerciseSlug?: string;
  /** A rig id (e.g. "squat-goblet") or a movement_pattern (e.g. "squat"). */
  pattern?: string;
  /** Flat equipment slugs; overrides what the seed says for `exerciseSlug`. */
  equipment?: string[];
  /** "all" = every authored frame; "start-end" = first + last only. */
  frames?: 'all' | 'start-end';
  /** Height in px of one strip tile (default 88). */
  size?: number;
  /** Show the auto-playing cross-fade loop above the strip (default true). */
  loop?: boolean;
  /** Small grip/stance badge, e.g. "Neutral grip". */
  badge?: string;
  className?: string;
}
