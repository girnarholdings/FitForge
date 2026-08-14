/**
 * GESTURE PHYSICS — the shared maths behind every draggable surface in the app.
 *
 * These four functions are what separates a panel that "has a drag handler" from one that feels
 * like a physical object. They are pure and framework-free on purpose: the React that consumes
 * them changes often, the physics does not, and physics you can unit-test is physics you can
 * trust at 3am.
 *
 *   · `VelocityTracker` — a short history of pointer samples, so release velocity is the finger's
 *     real speed rather than the jitter of the last two events.
 *   · `project`        — where a flick is HEADED, not where it was let go. This is what makes a
 *     small flick throw a sheet closed instead of dropping it where the thumb left it.
 *   · `rubberband`     — progressive resistance past a boundary. A hard stop reads as "frozen";
 *     resistance reads as "responsive, but there is nothing more here".
 *   · `springBack`     — a critically-damped return that INHERITS the release velocity, so there
 *     is no visible seam between the drag and the animation that finishes it.
 *
 * The projection constant is Apple's, from the Designing Fluid Interfaces sample code. The
 * textbook `v²/(2·a)` form is NOT what iOS ships and lands noticeably short on slow flicks.
 */

/** A single pointer sample. `t` is `performance.now()` milliseconds. */
export interface Sample {
  x: number;
  y: number;
  t: number;
}

/** px/s on each axis. Decomposed, never a single 2D magnitude — see `springBack`. */
export interface Velocity {
  x: number;
  y: number;
}

/** How many samples the release velocity is averaged over. */
export const VELOCITY_WINDOW = 5;

/**
 * Samples older than this are discarded before computing velocity. A thumb that rests at the
 * bottom of a drag for 200ms has stopped, and averaging in its earlier travel would fling a
 * sheet the user deliberately parked.
 */
export const VELOCITY_MAX_AGE_MS = 100;

/**
 * A ring of recent pointer samples.
 *
 * Velocity is taken across the whole retained window rather than between the last two events,
 * because pointermove delivery is bursty — on a loaded main thread two consecutive samples can
 * be 1ms apart, which turns a 2px wobble into a reported 2000px/s fling.
 */
export class VelocityTracker {
  private samples: Sample[] = [];

  reset(): void {
    this.samples = [];
  }

  push(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    if (this.samples.length > VELOCITY_WINDOW) this.samples.shift();
  }

  /** px/s on each axis, `{x: 0, y: 0}` when there is not enough recent history to be sure. */
  velocity(now?: number): Velocity {
    const last = this.samples[this.samples.length - 1];
    if (!last) return { x: 0, y: 0 };
    // A pointer that has been still since the last sample has zero velocity regardless of how it
    // got there — this is the "hold, then release" case, and it must not fling.
    if (now !== undefined && now - last.t > VELOCITY_MAX_AGE_MS) return { x: 0, y: 0 };
    const cutoff = last.t - VELOCITY_MAX_AGE_MS;
    const first = this.samples.find((s) => s.t >= cutoff) ?? this.samples[0]!;
    const dt = last.t - first.t;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: ((last.x - first.x) / dt) * 1000, y: ((last.y - first.y) / dt) * 1000 };
  }
}

/**
 * Apple's momentum projection: the distance a flick would still travel under scroll-style
 * exponential decay.
 *
 * `0.998` is the normal scroll feel; lower is snappier. Guarded against a caller passing `1`,
 * which would divide by zero and project a surface to infinity.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  const d = Math.min(0.9999, Math.max(0, decelerationRate));
  return ((velocity / 1000) * d) / (1 - d);
}

/**
 * Progressive resistance past a boundary.
 *
 * `overshoot` is how far past the bound the finger has travelled, `dimension` the size of the
 * surface being resisted against (its height for a sheet). The returned displacement grows
 * monotonically but asymptotically — the further you pull, the less it gives, and it can never
 * exceed `dimension` however hard the drag is (the limit of the expression as overshoot → ∞).
 * `constant` sets how quickly the give falls off, not where it stops.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0 || dimension <= 0) return 0;
  const abs = Math.abs(overshoot);
  const resisted = (abs * dimension * constant) / (dimension + constant * abs);
  return overshoot < 0 ? -resisted : resisted;
}

/**
 * A spring transition that carries the finger's release velocity into the animation.
 *
 * `stiffness`/`damping`/`mass` reproduce SPRING.sheet; the point of this helper is the
 * `velocity` field. Motion takes absolute px/s, and the SIGN matters: a positive velocity at
 * release means the surface was still travelling down as the finger left, so the spring must
 * start out travelling down too even when it is about to return upward. Handing it `0` is the
 * classic seam — the surface visibly stops dead at the release point, then starts again.
 *
 * Velocity is damped rather than passed whole because a 4000px/s thumb-flick on a surface that
 * is only returning 40px would overshoot into a visible bounce.
 */
export const RELEASE_VELOCITY_KEEP = 0.55;

export function springBack(releaseVelocity: number) {
  return {
    type: 'spring' as const,
    stiffness: 340,
    damping: 36,
    mass: 1,
    velocity: releaseVelocity * RELEASE_VELOCITY_KEEP,
  };
}

/**
 * Should a released drag commit (dismiss/advance) or return home?
 *
 * The decision is made on the PROJECTED landing point, not the release position — that is the
 * whole point of §6. A 30px flick with real speed behind it commits; a slow 200px haul that the
 * user is clearly still deciding about does not, until it passes the distance threshold.
 *
 * `travelled` and `threshold` are both positive distances along the gesture's axis.
 */
export function shouldCommit(
  travelled: number,
  velocity: number,
  threshold: number,
  opts: { minVelocity?: number; minTravel?: number; decelerationRate?: number } = {},
): boolean {
  const { minVelocity = 450, minTravel = 24, decelerationRate = 0.998 } = opts;
  // Nothing that barely moved may commit, however fast the pointer was going. A 3px jab can carry
  // a four-figure reported velocity, and projecting it would dismiss a sheet the user only tapped.
  // This floor applies to BOTH paths below, which is the whole reason it is checked first.
  if (travelled < minTravel) return false;
  // A flick BACKWARD outranks distance: the user pulled the surface out and changed their mind
  // mid-gesture, and honouring the position would commit an action they just cancelled.
  if (velocity <= -minVelocity) return false;
  if (velocity >= minVelocity) return true;
  const projected = travelled + project(velocity, decelerationRate);
  return projected >= threshold;
}
