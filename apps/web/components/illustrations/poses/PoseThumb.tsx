/**
 * PoseThumb — ONE authored frame of an exercise's pose rig, as a tiny card glyph.
 *
 * The preference picker needs to answer a beginner's real question — "what movement is this?" —
 * on a ~56 px card hero. The MID frame is the most distinctive silhouette an exercise has (a squat
 * at the bottom, the pulldown bar at the chest), so that is the frame shown. No new art exists
 * here: the frame comes from the audited rigs via `resolveRig`, and because the implement (bar,
 * dumbbell, cable, band) is drawn in the figure's hands, the equipment cue comes for free.
 *
 * Deliberately static. The full animated strip is `PoseFrames`; a grid of twelve looping cards
 * would be noise, not information.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Frame, ImplementKind } from './types';
import { FrameArt } from './PoseFrames';
import { resolveRig, implementFor, equipmentForExercise } from './catalog';

export interface PoseThumbProps {
  exerciseSlug: string;
  /** rendered square, in px */
  size?: number;
  className?: string;
}

/** The most distinctive frame: mid for 3-frame rigs, the action frame for 2-frame rigs. */
function midFrame(frames: readonly Frame[]): Frame | null {
  if (frames.length === 0) return null;
  return frames[Math.min(frames.length - 1, Math.floor(frames.length / 2))] ?? null;
}

export function PoseThumb({ exerciseSlug, size = 56, className }: PoseThumbProps) {
  const rig = resolveRig(exerciseSlug);
  const frame = rig ? midFrame(rig.frames) : null;
  if (!rig || !frame) return null;
  const kind: ImplementKind = rig.implement ?? implementFor(equipmentForExercise(exerciseSlug));
  return (
    <span
      aria-hidden
      className={cn('block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <FrameArt rig={rig} frame={frame} kind={kind} />
    </span>
  );
}
