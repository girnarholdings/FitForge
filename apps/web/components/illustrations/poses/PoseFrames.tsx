/**
 * <PoseFrames /> — the offline "how is this performed" visual (WS-3).
 *
 * Renders a movement pattern's authored key frames (START → MID → FINISH) as
 * self-drawn SVG: muted slate figure, GOLD moving segment + implement, and one
 * curved motion arrow per frame. Above the strip sits a CSS-only cross-fade
 * loop (~1.2 s per frame) so the movement reads at a glance with no video, no
 * network and no play button. Under `prefers-reduced-motion: reduce` the loop
 * is hidden and the static side-by-side strip carries the whole story.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Frame, HiSeg, ImplementKind, Pose, Pt, Rig, PoseFramesProps } from './types';
import { resolveRig, implementFor, equipmentForExercise } from './rigs';

const ACCENT = 'var(--accent)';
const FRAME_MS = 1200;

/* ------------------------------------------------------------------- figure */

function line(a: Pt, b: Pt, w: number, gold: boolean, opacity: number, key: string) {
  return (
    <line
      key={key}
      x1={a[0]}
      y1={a[1]}
      x2={b[0]}
      y2={b[1]}
      strokeWidth={w}
      stroke={gold ? ACCENT : undefined}
      opacity={gold ? 1 : opacity}
    />
  );
}

function chain(pts: Pt[], w: number, gold: boolean, opacity: number, key: string) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a && b) out.push(line(a, b, w, gold, opacity, `${key}-${i}`));
  }
  return out;
}

const mid = (a: Pt, b?: Pt): Pt => (b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : a);

function Figure({ pose, hi = [], view }: { pose: Pose; hi?: HiSeg[]; view: Rig['view'] }) {
  const on = (s: HiSeg) => hi.includes(s);
  const farOpacity = view === 'front' ? 0.9 : 0.45;
  const baseOpacity = 0.9;
  const hipMid = mid(pose.hip, pose.hip2);

  return (
    <g>
      {/* far leg */}
      {pose.kn2 &&
        pose.an2 &&
        chain(
          [pose.hip2 ?? pose.hip, pose.kn2, pose.an2, ...(pose.toe2 ? [pose.toe2] : [])],
          4.4,
          on('leg2'),
          farOpacity,
          'farleg',
        )}
      {/* far arm */}
      {pose.el2 &&
        pose.wr2 &&
        chain([pose.sh2 ?? pose.sh, pose.el2, pose.wr2], 4, on('arm2'), farOpacity, 'fararm')}

      {/* torso + girdles */}
      {line(pose.neck, hipMid, 7.5, on('torso'), baseOpacity, 'torso')}
      {pose.sh2 && line(pose.sh, pose.sh2, 5, on('torso'), baseOpacity, 'shbar')}
      {pose.hip2 && line(pose.hip, pose.hip2, 5, on('torso'), baseOpacity, 'hipbar')}

      {/* near leg */}
      {chain([pose.hip, pose.kn, pose.an], 4.8, on('leg'), baseOpacity, 'leg')}
      {line(pose.an, pose.toe, 3.6, on('leg'), baseOpacity, 'foot')}

      {/* near arm */}
      {chain([pose.sh, pose.el, pose.wr], 4.2, on('arm'), baseOpacity, 'arm')}

      {/* head */}
      <circle
        cx={pose.head[0]}
        cy={pose.head[1]}
        r={6.6}
        strokeWidth={2.4}
        fill="currentColor"
        fillOpacity={0.16}
        opacity={baseOpacity}
      />
    </g>
  );
}

/* --------------------------------------------------------------- implements */

interface ImplementProps {
  kind: ImplementKind;
  view: Rig['view'];
  at: Pt;
  angle?: number;
  /** front-view barbell: distance between the two hands. */
  span?: number;
}

function Implement({ kind, view, at, angle = 0, span }: ImplementProps) {
  const t = `translate(${at[0]} ${at[1]}) rotate(${angle})`;
  const wrap = (children: React.ReactNode) => (
    <g transform={t} stroke={ACCENT}>
      {children}
    </g>
  );

  switch (kind) {
    case 'bar':
      if (view === 'front') {
        const half = Math.max(22, (span ?? 40) / 2 + 14);
        return (
          <g transform={`translate(${at[0]} ${at[1]})`} stroke={ACCENT}>
            <line x1={-half} y1={0} x2={half} y2={0} strokeWidth={2.4} />
            <rect x={-half - 4.5} y={-7} width={4} height={14} rx={1.4} strokeWidth={2} />
            <rect x={half + 0.5} y={-7} width={4} height={14} rx={1.4} strokeWidth={2} />
          </g>
        );
      }
      return wrap(
        <>
          <circle r={5.6} strokeWidth={2.2} />
          <circle r={1.7} strokeWidth={1.6} />
        </>,
      );
    case 'dumbbell':
      return wrap(
        <>
          <line x1={-4.5} y1={0} x2={4.5} y2={0} strokeWidth={2} />
          <rect x={-9} y={-5} width={4.2} height={10} rx={1.4} strokeWidth={2} />
          <rect x={4.8} y={-5} width={4.2} height={10} rx={1.4} strokeWidth={2} />
        </>,
      );
    case 'kettlebell':
      return wrap(
        <>
          <path d="M-3.6 -2.6 C-3.6 -8 3.6 -8 3.6 -2.6" strokeWidth={1.8} />
          <path d="M-4.2 -2.4 C-7.6 0.6 -6.6 7 -3 8.6 L3 8.6 C6.6 7 7.6 0.6 4.2 -2.4 Z" strokeWidth={2} />
        </>,
      );
    case 'ball':
      return wrap(
        <>
          <circle r={6.4} strokeWidth={2} />
          <path d="M-6.4 0 C-2 -3 2 -3 6.4 0" strokeWidth={1.4} />
        </>,
      );
    case 'wheel':
      return wrap(
        <>
          <circle r={6} strokeWidth={2} />
          <circle r={1.6} strokeWidth={1.6} />
          <line x1={-10} y1={0} x2={-6} y2={0} strokeWidth={2} />
          <line x1={6} y1={0} x2={10} y2={0} strokeWidth={2} />
        </>,
      );
    case 'plate':
      return wrap(
        <>
          <circle r={6.6} strokeWidth={2} />
          <circle r={2} strokeWidth={1.6} />
        </>,
      );
    case 'machine':
      return wrap(<rect x={-9} y={-4} width={18} height={8} rx={3} strokeWidth={2} />);
    case 'cable':
    case 'band':
      return wrap(<rect x={-6} y={-2.6} width={12} height={5.2} rx={2.2} strokeWidth={2} />);
    default:
      return null;
  }
}

/** The cable/band line from its anchor (pulley, bar) to the hands. */
function Tether({ from, to, dashed }: { from: Pt; to: Pt; dashed: boolean }) {
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      stroke={ACCENT}
      strokeWidth={1.8}
      opacity={0.75}
      strokeDasharray={dashed ? '4 3' : undefined}
    />
  );
}

/* -------------------------------------------------------------- motion arrow */

function MotionArrow({ from, to, bow = 8 }: { from: Pt; to: Pt; bow?: number }) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (from[0] + to[0]) / 2 + nx * bow;
  const cy = (from[1] + to[1]) / 2 + ny * bow;
  // tangent at the end of a quadratic curve points away from the control point
  const tx = to[0] - cx;
  const ty = to[1] - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const head = 5.5;
  const wing = (deg: number): string => {
    const a = (deg * Math.PI) / 180;
    const rx = ux * Math.cos(a) - uy * Math.sin(a);
    const ry = ux * Math.sin(a) + uy * Math.cos(a);
    return `${to[0] - rx * head} ${to[1] - ry * head}`;
  };
  return (
    <g stroke={ACCENT} opacity={0.95}>
      <path d={`M${from[0]} ${from[1]} Q${cx} ${cy} ${to[0]} ${to[1]}`} strokeWidth={2} />
      <path d={`M${wing(28)} L${to[0]} ${to[1]} L${wing(-28)}`} strokeWidth={2} />
    </g>
  );
}

/* ----------------------------------------------------------------- one frame */

function FrameArt({ rig, frame, kind }: { rig: Rig; frame: Frame; kind: ImplementKind }) {
  const tethered = kind === 'cable' || kind === 'band';
  const span = frame.imp && frame.imp2 ? Math.abs(frame.imp2[0] - frame.imp[0]) : undefined;
  const barFront = kind === 'bar' && rig.view === 'front';
  const anchors: Pt[] = barFront
    ? frame.imp && frame.imp2
      ? [mid(frame.imp, frame.imp2)]
      : frame.imp
        ? [frame.imp]
        : []
    : ([frame.imp, frame.imp2].filter(Boolean) as Pt[]);

  const body = (
    <>
      {rig.scenery}
      {frame.art}
      {tethered &&
        frame.cableFrom &&
        anchors.map((a, i) => (
          <Tether key={`t${i}`} from={frame.cableFrom as Pt} to={a} dashed={kind === 'band'} />
        ))}
      <Figure pose={frame.pose} hi={frame.hi} view={rig.view} />
      {anchors.map((a, i) => (
        <Implement key={`i${i}`} kind={kind} view={rig.view} at={a} angle={frame.impAngle} span={span} />
      ))}
      {frame.arrow && <MotionArrow {...frame.arrow} />}
    </>
  );

  return (
    <svg
      viewBox="0 0 120 120"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block text-muted-foreground"
      aria-hidden
    >
      {rig.ground !== false && (
        <line x1={8} y1={104} x2={112} y2={104} strokeWidth={2} opacity={0.28} />
      )}
      {rig.tilt ? (
        <g transform={`rotate(${rig.tilt.deg} ${rig.tilt.cx} ${rig.tilt.cy})`}>{body}</g>
      ) : (
        body
      )}
    </svg>
  );
}

/* ------------------------------------------------------------ loop stylesheet */

const LOOP_CSS = `
@keyframes ff-pose-2{0%,40%{opacity:1}50%,90%{opacity:0}100%{opacity:1}}
@keyframes ff-pose-3{0%,26%{opacity:1}33%,93%{opacity:0}100%{opacity:1}}
@media (prefers-reduced-motion: reduce){.ff-pose-loop{display:none!important}}
`;

function cycle(i: number, n: number): React.CSSProperties {
  return {
    animationName: `ff-pose-${n}`,
    animationDuration: `${(n * FRAME_MS) / 1000}s`,
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
    animationDelay: `${(-i * FRAME_MS) / 1000}s`,
    opacity: i === 0 ? 1 : 0,
  };
}

/* -------------------------------------------------------------- the component */

export function PoseFrames({
  exerciseSlug,
  pattern,
  equipment,
  frames = 'all',
  size = 88,
  loop = true,
  badge,
  className,
}: PoseFramesProps) {
  const rig = resolveRig(exerciseSlug, pattern);
  if (!rig) return null;

  const equip = equipment ?? equipmentForExercise(exerciseSlug);
  const kind: ImplementKind = rig.implement ?? implementFor(equip);

  const all = rig.frames;
  const shown: Frame[] =
    frames === 'start-end' && all.length > 2
      ? [all[0], all[all.length - 1]].filter((f): f is Frame => Boolean(f))
      : all;
  const n = shown.length;
  const animated = loop && n > 1 && n <= 3;
  const label = `${rig.label}: ${shown.map((f) => f.caption).join(' then ')}`;

  return (
    <div className={cn('w-full', className)} data-testid="pose-frames" role="img" aria-label={label}>
      <style dangerouslySetInnerHTML={{ __html: LOOP_CSS }} />

      {animated && (
        <div
          className="ff-pose-loop relative mb-2 overflow-hidden rounded-sm border border-border bg-surface"
          style={{ height: Math.round(size * 1.85), backgroundImage: 'var(--gradient-ember-bg)' }}
          data-testid="pose-loop"
        >
          {shown.map((f, i) => (
            <div key={`l${i}`} className="absolute inset-0" style={cycle(i, n)}>
              <FrameArt rig={rig} frame={f} kind={kind} />
            </div>
          ))}
          {shown.map((f, i) => (
            <span
              key={`c${i}`}
              className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface-2/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
              style={cycle(i, n)}
            >
              {f.caption}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2" data-testid="pose-strip">
        {shown.map((f, i) => (
          <figure key={`f${i}`} className="min-w-0 flex-1" data-testid={`pose-frame-${i}`}>
            <div
              className="overflow-hidden rounded-sm border border-border bg-surface"
              style={{ height: size }}
            >
              <FrameArt rig={rig} frame={f} kind={kind} />
            </div>
            <figcaption className="mt-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {f.caption}
            </figcaption>
          </figure>
        ))}
      </div>

      {badge && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          <span className="rounded-full bg-surface-2 px-2 py-0.5">{badge}</span>
        </p>
      )}
    </div>
  );
}
