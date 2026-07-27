/**
 * The pose-frame rig library (WS-3).
 *
 * ~26 authored key-frame sets, exposed as 51 rig ids (variants share a pose set
 * and swap the implement / scenery), which is enough to cover every exercise in
 * seed/data/exercises.json through `pose_pattern` (with `movement_pattern` as
 * the fallback). All coordinates live on a 120×120 canvas with the floor at
 * y = 104 and the figure facing right in side views.
 */
import * as React from 'react';
import type { Arrow, Frame, ImplementKind, Pose, Pt, Rig } from './types';

/* ------------------------------------------------------------------ scenery */

const S = { strokeWidth: 2, opacity: 0.5 } as const;

/** A padded surface (bench / seat / step) with two legs down to the floor. */
function Pad({ x1, x2, y, legs = true, floor = 104 }: { x1: number; x2: number; y: number; legs?: boolean; floor?: number }) {
  return (
    <g {...S}>
      <rect x={x1} y={y} width={x2 - x1} height={5} rx={2} />
      {legs && (
        <>
          <line x1={x1 + 5} y1={y + 5} x2={x1 + 5} y2={floor} />
          <line x1={x2 - 5} y1={y + 5} x2={x2 - 5} y2={floor} />
        </>
      )}
    </g>
  );
}

/** A vertical machine column (cable stack, rack upright). */
function Post({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  return <line x1={x} y1={y1} x2={x} y2={y2} {...S} />;
}

/** A fixed horizontal bar (pull-up bar, dip bars, rack pins). */
function FixedBar({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <line x1={x1} y1={y} x2={x2} y2={y} strokeWidth={3} opacity={0.55} />;
}

function Pulley({ at }: { at: Pt }) {
  return <circle cx={at[0]} cy={at[1]} r={3.4} {...S} />;
}

/** A machine backrest, drawn as a thick angled pad. */
function Backrest({ from, to }: { from: Pt; to: Pt }) {
  return <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} strokeWidth={4} opacity={0.45} strokeLinecap="round" />;
}

/* ------------------------------------------------------------------ helpers */

const arrow = (from: Pt, to: Pt, bow = 8): Arrow => ({ from, to, bow });

/** Standing side-view base (facing right); arms supplied per variant. */
function stand(el: Pt, wr: Pt, extra: Partial<Pose> = {}): Pose {
  return {
    head: [57, 23],
    neck: [54, 32],
    sh: [54, 35],
    el,
    wr,
    hip: [53, 61],
    kn: [53, 82],
    an: [53, 104],
    toe: [63, 104],
    ...extra,
  };
}

/** Standing front-view base; arms supplied per variant. */
function front(el: Pt, wr: Pt, el2: Pt, wr2: Pt, extra: Partial<Pose> = {}): Pose {
  return {
    head: [60, 21],
    neck: [60, 31],
    sh: [50, 35],
    el,
    wr,
    sh2: [70, 35],
    el2,
    wr2,
    hip: [55, 62],
    hip2: [65, 62],
    kn: [53, 83],
    kn2: [67, 83],
    an: [52, 104],
    an2: [68, 104],
    toe: [50, 106],
    toe2: [70, 106],
    ...extra,
  };
}

/* ------------------------------------------------------- squat family (1/26) */

interface SquatOpts {
  startArm: [Pt, Pt];
  bottomArm: [Pt, Pt];
  impStart?: Pt;
  impBottom?: Pt;
  implement?: ImplementKind;
  impAngle?: number;
}

function squatRig(id: string, label: string, o: SquatOpts): Rig {
  const bottom = (el: Pt, wr: Pt): Pose => ({
    head: [64, 49],
    neck: [60, 57],
    sh: [60, 59],
    el,
    wr,
    hip: [44, 80],
    kn: [64, 82],
    an: [54, 104],
    toe: [64, 104],
  });
  const top = stand(o.startArm[0], o.startArm[1]);
  return {
    id,
    label,
    view: 'side',
    implement: o.implement,
    frames: [
      {
        caption: 'Start',
        pose: top,
        hi: ['leg'],
        imp: o.impStart,
        impAngle: o.impAngle,
        arrow: arrow([88, 44], [88, 86], 9),
      },
      {
        caption: 'Bottom',
        pose: bottom(o.bottomArm[0], o.bottomArm[1]),
        hi: ['leg'],
        imp: o.impBottom,
        impAngle: o.impAngle,
        arrow: arrow([88, 86], [88, 44], -9),
      },
      { caption: 'Finish', pose: top, hi: ['leg'], imp: o.impStart, impAngle: o.impAngle },
    ],
  };
}

/* ------------------------------------------------------------ press families */

/** Flat bench press: supine on a horizontal pad, feet planted on the floor. */
function benchPressRig(id: string, label: string): Rig {
  const body = { hip: [64, 70] as Pt, kn: [84, 76] as Pt, an: [84, 104] as Pt, toe: [94, 104] as Pt };
  const base = (el: Pt, wr: Pt): Pose => ({
    head: [28, 63],
    neck: [36, 66],
    sh: [40, 66],
    el,
    wr,
    ...body,
  });
  return {
    id,
    label,
    view: 'side',
    scenery: <Pad x1={24} x2={80} y={72} />,
    frames: [
      {
        caption: 'Bottom',
        pose: base([35, 62], [46, 59]),
        hi: ['arm'],
        imp: [46, 56],
        impAngle: 90,
        arrow: arrow([64, 54], [64, 34], -8),
      },
      {
        caption: 'Lock out',
        pose: base([42, 53], [45, 40]),
        hi: ['arm'],
        imp: [45, 37],
        impAngle: 90,
        arrow: arrow([64, 34], [64, 54], 8),
      },
    ],
  };
}

/**
 * Incline press. Authored directly rather than rotating the flat-bench scene: rotating the
 * whole group swung the bench legs off the floor and drove the lifter's feet THROUGH the
 * floor line. Here the back pad rises to the left at ~32° (the head end is raised — an
 * incline, not a decline), the seat and its legs stay square to the floor, and the press
 * path runs perpendicular to the torso (up and slightly toward the feet).
 */
function inclinePressRig(id: string, label: string): Rig {
  const base = (el: Pt, wr: Pt): Pose => ({
    head: [28, 54],
    neck: [36, 58],
    sh: [38, 59],
    el,
    wr,
    hip: [60, 72],
    kn: [80, 80],
    an: [80, 104],
    toe: [90, 104],
  });
  return {
    id,
    label,
    view: 'side',
    scenery: (
      <>
        <Pad x1={52} x2={78} y={76} />
        <Backrest from={[54, 78]} to={[22, 58]} />
        <line x1={26} y1={62} x2={34} y2={104} {...S} />
      </>
    ),
    frames: [
      {
        caption: 'Bottom',
        pose: base([38, 52], [48, 54]),
        hi: ['arm'],
        imp: [50, 51],
        impAngle: 90,
        arrow: arrow([70, 54], [78, 38], -8),
      },
      {
        caption: 'Lock out',
        pose: base([48, 49], [57, 40]),
        hi: ['arm'],
        imp: [58, 38],
        impAngle: 90,
        arrow: arrow([78, 38], [70, 54], 8),
      },
    ],
  };
}

function ohpRig(id: string, label: string, seated: boolean): Rig {
  const legs: Partial<Pose> = seated
    ? { hip: [55, 66], hip2: [65, 66], kn: [50, 86], kn2: [70, 86], an: [50, 104], an2: [70, 104], toe: [48, 106], toe2: [72, 106] }
    : {};
  return {
    id,
    label,
    view: 'front',
    scenery: seated ? <Pad x1={42} x2={78} y={70} legs={false} /> : undefined,
    frames: [
      {
        caption: 'Start',
        pose: front([44, 48], [46, 36], [76, 48], [74, 36], legs),
        hi: ['arm', 'arm2'],
        imp: [46, 33],
        imp2: [74, 33],
        arrow: arrow([98, 42], [98, 14], -8),
      },
      {
        // Lock out = elbows STRAIGHT, bar/handles stacked over the shoulders and clear of
        // the head. The previous pose kept the upper arm folded to ~4px, so the "lock out"
        // frame parked the bar at forehead height — a half rep.
        caption: 'Lock out',
        pose: front([49, 23], [49, 11], [71, 23], [71, 11], legs),
        hi: ['arm', 'arm2'],
        imp: [49, 8],
        imp2: [71, 8],
        arrow: arrow([98, 14], [98, 42], 8),
      },
    ],
  };
}

function flyRig(id: string, label: string, seated: boolean): Rig {
  const legs: Partial<Pose> = seated
    ? { hip: [55, 66], hip2: [65, 66], kn: [50, 86], kn2: [70, 86], an: [50, 104], an2: [70, 104], toe: [48, 106], toe2: [72, 106] }
    : {};
  return {
    id,
    label,
    view: 'front',
    scenery: seated ? (
      <Pad x1={42} x2={78} y={70} legs={false} />
    ) : (
      <>
        <Post x={8} y1={12} y2={104} />
        <Post x={112} y1={12} y2={104} />
      </>
    ),
    frames: [
      {
        caption: 'Open',
        pose: front([32, 42], [16, 48], [88, 42], [104, 48], legs),
        hi: ['arm', 'arm2'],
        imp: [13, 49],
        imp2: [107, 49],
        cableFrom: seated ? undefined : [8, 16],
        cableFrom2: seated ? undefined : [112, 16],
        arrow: arrow([18, 62], [50, 66], 10),
      },
      {
        caption: 'Squeeze',
        pose: front([44, 44], [56, 48], [76, 44], [64, 48], legs),
        hi: ['arm', 'arm2'],
        imp: [55, 49],
        imp2: [65, 49],
        cableFrom: seated ? undefined : [8, 16],
        cableFrom2: seated ? undefined : [112, 16],
        arrow: arrow([50, 66], [18, 62], -10),
      },
    ],
  };
}

/* --------------------------------------------------------------- pull family */

function bentRowRig(id: string, label: string, oneArm: boolean): Rig {
  const far: Partial<Pose> = oneArm
    ? { sh2: [62, 50], el2: [50, 60], wr2: [38, 72] }
    : { kn2: [48, 86], an2: [50, 104], toe2: [60, 104] };
  const base = (el: Pt, wr: Pt): Pose => ({
    head: [74, 40],
    neck: [66, 46],
    sh: [64, 48],
    el,
    wr,
    hip: [42, 66],
    kn: [50, 86],
    an: [52, 104],
    toe: [62, 104],
    ...far,
  });
  return {
    id,
    label,
    view: 'side',
    scenery: oneArm ? <Pad x1={14} x2={46} y={74} /> : undefined,
    frames: [
      {
        caption: 'Start',
        pose: base([62, 64], [60, 82]),
        hi: ['arm'],
        imp: [60, 86],
        impAngle: 90,
        arrow: arrow([88, 84], [88, 62], -8),
      },
      {
        // A row drives the ELBOW BACK PAST THE RIBS. The previous pose put the elbow at
        // (76,56) — in front of the chest, on the far side of the torso from the back —
        // which draws a shoulder-flexion movement, not a row.
        caption: 'Pull',
        pose: base([48, 50], [56, 64]),
        hi: ['arm'],
        imp: [56, 68],
        impAngle: 90,
        arrow: arrow([88, 62], [88, 84], 8),
      },
    ],
  };
}

/* ------------------------------------------------------------- misc builders */

function legMachineRig(id: string, label: string, dir: 'extend' | 'curl'): Rig {
  const base = (an: Pt, toe: Pt, kn: Pt): Pose => ({
    head: [22, 42],
    neck: [27, 50],
    sh: [28, 53],
    el: [34, 63],
    wr: [42, 70],
    hip: [45, 76],
    kn,
    an,
    toe,
  });
  const bent = base([66, 98], [76, 98], [66, 76]);
  const out = base([92, 66], [100, 62], [70, 72]);
  const frames: Frame[] =
    dir === 'extend'
      ? [
          { caption: 'Start', pose: bent, hi: ['leg'], imp: [66, 100], arrow: arrow([84, 96], [96, 74], -10) },
          { caption: 'Extend', pose: out, hi: ['leg'], imp: [93, 68], arrow: arrow([96, 74], [84, 96], 10) },
        ]
      : [
          { caption: 'Start', pose: out, hi: ['leg'], imp: [93, 68], arrow: arrow([96, 74], [84, 96], 10) },
          { caption: 'Curl', pose: bent, hi: ['leg'], imp: [66, 100], arrow: arrow([84, 96], [96, 74], -10) },
        ];
  return {
    id,
    label,
    view: 'side',
    implement: 'machine',
    scenery: (
      <>
        <Pad x1={26} x2={62} y={76} />
        <Backrest from={[26, 76]} to={[18, 46]} />
      </>
    ),
    frames,
  };
}

function hipThrustRig(id: string, label: string, bench: boolean): Rig {
  // Bench version: arms hang down the side of the bench. FLOOR version (glute bridge): the
  // lifter is already lying ON the floor, so an arm dropped 20px below the shoulder ended up
  // 12px BELOW the floor line. On the floor the arms rest alongside the body instead.
  const armEl: Pt = bench ? [-4, 10] : [10, 4];
  const armWr: Pt = bench ? [0, 20] : [20, 6];
  const base = (hip: Pt, sh: Pt, head: Pt, neck: Pt, kn: Pt): Pose => ({
    head,
    neck,
    sh,
    el: [sh[0] + armEl[0], sh[1] + armEl[1]],
    wr: [sh[0] + armWr[0], sh[1] + armWr[1]],
    hip,
    kn,
    an: [82, 104],
    toe: [92, 104],
  });
  const down = bench
    ? base([62, 88], [38, 68], [28, 64], [36, 68], [80, 76])
    : base([58, 92], [30, 96], [20, 92], [30, 96], [80, 80]);
  const up = bench
    ? base([62, 74], [38, 68], [28, 64], [36, 68], [82, 74])
    : base([58, 78], [30, 96], [20, 92], [30, 96], [82, 78]);
  const impDown: Pt = bench ? [62, 82] : [58, 86];
  const impUp: Pt = bench ? [62, 68] : [58, 72];
  return {
    id,
    label,
    view: 'side',
    scenery: bench ? <Pad x1={12} x2={46} y={70} legs /> : undefined,
    frames: [
      { caption: 'Start', pose: down, hi: ['leg'], imp: impDown, arrow: arrow([98, 88], [98, 68], -8) },
      { caption: 'Lock out', pose: up, hi: ['leg'], imp: impUp, arrow: arrow([98, 68], [98, 88], 8) },
    ],
  };
}

function lateralRaiseRig(id: string, label: string): Rig {
  return {
    id,
    label,
    view: 'front',
    frames: [
      {
        caption: 'Start',
        pose: front([47, 48], [44, 62], [73, 48], [76, 62]),
        hi: ['arm', 'arm2'],
        imp: [42, 66],
        imp2: [78, 66],
        arrow: arrow([28, 62], [16, 42], -9),
      },
      {
        caption: 'Raise',
        pose: front([36, 38], [20, 36], [84, 38], [100, 36]),
        hi: ['arm', 'arm2'],
        imp: [16, 36],
        imp2: [104, 36],
        arrow: arrow([16, 42], [28, 62], 9),
      },
    ],
  };
}

/**
 * Rear delt fly — its own rig, NOT a shifted lateral raise. Performed upright, a "rear delt
 * fly" is simply a lateral raise; the hip hinge IS the exercise. Previously both ids drew the
 * same standing figure 12px lower, so the two illustrations were indistinguishable and the
 * rear-delt one taught the wrong movement.
 *
 * Read as a front view of someone hinged over: the torso is foreshortened to a stub, the head
 * drops between/below the shoulder line (you are looking at the crown), and the arms hang
 * straight toward the floor before sweeping out to the sides.
 */
function rearDeltFlyRig(id: string, label: string): Rig {
  const bentOver = (el: Pt, wr: Pt, el2: Pt, wr2: Pt): Pose => ({
    head: [60, 52],
    neck: [60, 44],
    sh: [46, 42],
    el,
    wr,
    sh2: [74, 42],
    el2,
    wr2,
    hip: [55, 60],
    hip2: [65, 60],
    kn: [52, 80],
    kn2: [68, 80],
    an: [52, 100],
    an2: [68, 100],
    toe: [48, 104],
    toe2: [72, 104],
  });
  return {
    id,
    label,
    view: 'front',
    frames: [
      {
        caption: 'Hang',
        pose: bentOver([46, 56], [46, 70], [74, 56], [74, 70]),
        hi: ['arm', 'arm2'],
        imp: [46, 74],
        imp2: [74, 74],
        impAngle: 90,
        arrow: arrow([32, 66], [18, 48], -9),
      },
      {
        caption: 'Fly',
        pose: bentOver([32, 46], [18, 44], [88, 46], [102, 44]),
        hi: ['arm', 'arm2'],
        imp: [14, 44],
        imp2: [106, 44],
        arrow: arrow([18, 48], [32, 66], 9),
      },
    ],
  };
}

/* ------------------------------------------------------------- the rig table */

function buildRigs(): Record<string, Rig> {
  const list: Rig[] = [
    /* --- squat family ------------------------------------------------- */
    squatRig('squat-back', 'Back squat', {
      startArm: [[48, 44], [47, 34]],
      bottomArm: [[54, 66], [53, 57]],
      impStart: [50, 34],
      impBottom: [56, 57],
    }),
    squatRig('squat-front', 'Front squat', {
      startArm: [[57, 45], [59, 36]],
      bottomArm: [[63, 67], [64, 57]],
      impStart: [60, 34],
      impBottom: [65, 56],
    }),
    squatRig('squat-goblet', 'Goblet squat', {
      startArm: [[52, 47], [60, 44]],
      bottomArm: [[58, 69], [66, 65]],
      impStart: [64, 45],
      impBottom: [70, 66],
    }),
    squatRig('squat-bw', 'Bodyweight squat', {
      startArm: [[58, 45], [66, 38]],
      bottomArm: [[66, 64], [76, 58]],
      implement: 'none',
    }),
    /**
     * Hack squat. Its own rig rather than the free-squat pose with a machine glyph pasted on
     * the shoulders: on a hack squat the back stays FLAT AGAINST AN ANGLED SLED PAD and the
     * torso never folds forward, so the shared squat pose (which pitches the chest over the
     * knees) misdescribed the apparatus and the trunk position alike.
     */
    {
      id: 'squat-machine',
      label: 'Hack squat',
      view: 'side',
      implement: 'machine',
      scenery: (
        <>
          <Backrest from={[36, 88]} to={[66, 32]} />
          <line x1={28} y1={94} x2={58} y2={38} {...S} />
          <line x1={22} y1={96} x2={34} y2={96} {...S} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [68, 34],
            neck: [62, 41],
            sh: [60, 42],
            el: [55, 55],
            wr: [50, 68],
            hip: [48, 66],
            kn: [50, 84],
            an: [52, 104],
            toe: [62, 104],
          },
          hi: ['leg'],
          imp: [59, 37],
          impAngle: -30,
          arrow: arrow([86, 52], [70, 82], 8),
        },
        {
          caption: 'Bottom',
          pose: {
            head: [58, 53],
            neck: [52, 60],
            sh: [50, 61],
            el: [45, 74],
            wr: [40, 87],
            hip: [38, 85],
            kn: [56, 84],
            an: [52, 104],
            toe: [62, 104],
          },
          hi: ['leg'],
          imp: [49, 56],
          impAngle: -30,
          arrow: arrow([70, 82], [86, 52], -8),
        },
      ],
    },
    {
      id: 'leg-press',
      label: 'Leg press',
      view: 'side',
      implement: 'machine',
      scenery: (
        <>
          <Backrest from={[14, 50]} to={[34, 80]} />
          <Pad x1={30} x2={58} y={80} legs={false} floor={104} />
          <line x1={62} y1={94} x2={112} y2={40} {...S} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [20, 50],
            neck: [27, 59],
            sh: [29, 61],
            el: [36, 70],
            wr: [44, 76],
            hip: [48, 78],
            kn: [64, 50],
            an: [80, 68],
            toe: [88, 62],
          },
          hi: ['leg'],
          imp: [86, 62],
          impAngle: -47,
          arrow: arrow([66, 96], [100, 62], -10),
        },
        {
          caption: 'Press',
          pose: {
            head: [20, 50],
            neck: [27, 59],
            sh: [29, 61],
            el: [36, 70],
            wr: [44, 76],
            hip: [48, 78],
            kn: [74, 60],
            an: [96, 50],
            toe: [104, 44],
          },
          hi: ['leg'],
          imp: [102, 44],
          impAngle: -47,
          arrow: arrow([100, 62], [66, 96], 10),
        },
      ],
    },

    /* --- lunge family -------------------------------------------------- */
    {
      id: 'lunge',
      label: 'Lunge',
      view: 'side',
      frames: [
        {
          caption: 'Start',
          pose: stand([54, 49], [54, 63], { kn2: [50, 82], an2: [50, 104], toe2: [60, 104] }),
          hi: ['leg'],
          imp: [56, 66],
          impAngle: 90,
          arrow: arrow([88, 46], [88, 84], 9),
        },
        {
          // Both knees bend in a lunge: the REAR knee drops to just above the floor with the
          // rear heel lifted. The previous pose left the rear leg almost straight (knee, hip
          // and ankle nearly collinear), which is a split stance, not a lunge.
          caption: 'Bottom',
          pose: {
            head: [52, 34],
            neck: [49, 43],
            sh: [49, 46],
            el: [49, 60],
            wr: [49, 74],
            hip: [50, 72],
            kn: [72, 82],
            an: [72, 104],
            toe: [82, 104],
            kn2: [46, 94],
            an2: [28, 97],
            toe2: [32, 104],
          },
          hi: ['leg'],
          imp: [51, 77],
          impAngle: 90,
          arrow: arrow([88, 84], [88, 46], -9),
        },
      ],
    },
    {
      id: 'split-squat',
      label: 'Split squat',
      view: 'side',
      scenery: <Pad x1={8} x2={36} y={82} />,
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [56, 22],
            neck: [53, 31],
            sh: [53, 34],
            el: [53, 48],
            wr: [53, 62],
            hip: [52, 60],
            kn: [60, 82],
            an: [62, 104],
            toe: [72, 104],
            kn2: [36, 74],
            an2: [24, 82],
            toe2: [14, 80],
          },
          hi: ['leg'],
          imp: [55, 65],
          impAngle: 90,
          arrow: arrow([88, 44], [88, 80], 9),
        },
        {
          caption: 'Bottom',
          pose: {
            head: [54, 34],
            neck: [51, 43],
            sh: [51, 46],
            el: [51, 60],
            wr: [51, 74],
            hip: [50, 72],
            kn: [70, 84],
            an: [66, 104],
            toe: [76, 104],
            kn2: [34, 88],
            an2: [24, 82],
            toe2: [14, 80],
          },
          hi: ['leg'],
          imp: [53, 77],
          impAngle: 90,
          arrow: arrow([88, 80], [88, 44], -9),
        },
      ],
    },
    {
      id: 'step-up',
      label: 'Step-up',
      view: 'side',
      scenery: <Pad x1={64} x2={104} y={82} />,
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [50, 30],
            neck: [47, 39],
            sh: [47, 42],
            el: [47, 56],
            wr: [47, 70],
            hip: [46, 68],
            kn: [66, 68],
            an: [72, 82],
            toe: [82, 82],
            kn2: [44, 88],
            an2: [44, 104],
            toe2: [54, 104],
          },
          hi: ['leg'],
          imp: [49, 73],
          impAngle: 90,
          arrow: arrow([94, 74], [94, 44], -9),
        },
        {
          caption: 'Stand up',
          pose: {
            head: [76, 20],
            neck: [73, 29],
            sh: [73, 32],
            el: [73, 46],
            wr: [73, 60],
            hip: [72, 58],
            kn: [72, 70],
            an: [72, 82],
            toe: [82, 82],
            kn2: [64, 66],
            an2: [58, 78],
            toe2: [50, 76],
          },
          hi: ['leg'],
          imp: [75, 63],
          impAngle: 90,
          arrow: arrow([94, 44], [94, 74], 9),
        },
      ],
    },

    /* --- hinge family -------------------------------------------------- */
    {
      id: 'deadlift',
      label: 'Deadlift',
      view: 'side',
      frames: [
        {
          caption: 'Set-up',
          pose: {
            head: [58, 42],
            neck: [52, 50],
            sh: [52, 52],
            el: [56, 72],
            wr: [58, 92],
            hip: [38, 74],
            kn: [56, 82],
            an: [52, 102],
            toe: [62, 102],
          },
          hi: ['leg', 'torso'],
          imp: [58, 96],
          arrow: arrow([80, 92], [80, 62], -9),
        },
        {
          caption: 'Knee',
          pose: {
            head: [59, 34],
            neck: [54, 42],
            sh: [54, 44],
            el: [55, 64],
            wr: [56, 84],
            hip: [42, 68],
            kn: [54, 84],
            an: [53, 103],
            toe: [63, 103],
          },
          hi: ['leg', 'torso'],
          imp: [56, 86],
          arrow: arrow([80, 84], [80, 60], -9),
        },
        {
          caption: 'Lock out',
          pose: stand([55, 50], [56, 66]),
          hi: ['torso'],
          imp: [56, 69],
        },
      ],
    },
    {
      id: 'rdl',
      label: 'Romanian deadlift',
      view: 'side',
      frames: [
        {
          caption: 'Start',
          pose: stand([55, 50], [56, 66]),
          hi: ['torso'],
          imp: [56, 69],
          arrow: arrow([86, 50], [86, 84], 9),
        },
        {
          // The bar hangs straight down from the shoulders and must stay ON THE LEGS. The
          // previous hinge parked the shoulders 11px in front of mid-foot, so the bar floated
          // ~17px (≈30 cm) out in front of the shins — the classic bar-drift fault. Hips go
          // further back instead, keeping the bar over mid-foot and brushing the shin.
          caption: 'Hinge',
          pose: {
            head: [63, 54],
            neck: [55, 57],
            sh: [53, 58],
            el: [53, 73],
            wr: [53, 88],
            hip: [28, 68],
            kn: [46, 84],
            an: [52, 104],
            toe: [62, 104],
          },
          hi: ['leg', 'torso'],
          imp: [53, 92],
          arrow: arrow([86, 84], [86, 50], -9),
        },
        { caption: 'Finish', pose: stand([55, 50], [56, 66]), hi: ['torso'], imp: [56, 69] },
      ],
    },
    {
      id: 'good-morning',
      label: 'Good morning',
      view: 'side',
      frames: [
        {
          caption: 'Start',
          pose: stand([48, 44], [47, 34]),
          hi: ['torso'],
          imp: [50, 34],
          arrow: arrow([86, 46], [86, 80], 9),
        },
        {
          caption: 'Hinge',
          pose: {
            head: [78, 52],
            neck: [70, 55],
            sh: [68, 56],
            el: [64, 68],
            wr: [60, 58],
            hip: [40, 62],
            kn: [50, 84],
            an: [52, 104],
            toe: [62, 104],
          },
          hi: ['leg', 'torso'],
          imp: [64, 58],
          arrow: arrow([86, 80], [86, 46], -9),
        },
      ],
    },
    {
      id: 'kb-swing',
      label: 'Kettlebell swing',
      view: 'side',
      frames: [
        {
          caption: 'Hike',
          pose: {
            head: [76, 52],
            neck: [68, 56],
            sh: [66, 57],
            el: [64, 72],
            wr: [58, 86],
            hip: [40, 62],
            kn: [52, 84],
            an: [54, 104],
            toe: [64, 104],
          },
          hi: ['torso'],
          imp: [56, 92],
          arrow: arrow([70, 92], [86, 48], 16),
        },
        {
          caption: 'Snap',
          pose: stand([66, 38], [78, 40]),
          hi: ['torso'],
          imp: [84, 42],
          arrow: arrow([86, 48], [70, 92], -16),
        },
      ],
    },
    hipThrustRig('hip-thrust', 'Hip thrust', true),
    hipThrustRig('glute-bridge', 'Glute bridge', false),

    /* --- leg isolation -------------------------------------------------- */
    legMachineRig('leg-extension', 'Leg extension', 'extend'),
    legMachineRig('leg-curl', 'Leg curl', 'curl'),
    {
      id: 'calf-raise',
      label: 'Calf raise',
      view: 'side',
      // The step starts IN FRONT of the heel (x1=58) so the balls of the feet are on it and
      // the heel hangs off the back edge. The old block started at x=44 — behind the heel —
      // so the dropped heel was drawn straight through the solid step.
      scenery: <Pad x1={58} x2={98} y={94} />,
      frames: [
        {
          caption: 'Stretch',
          pose: {
            head: [57, 23],
            neck: [54, 32],
            sh: [54, 35],
            el: [54, 49],
            wr: [54, 63],
            hip: [53, 61],
            kn: [53, 82],
            an: [53, 100],
            toe: [64, 94],
          },
          hi: ['leg'],
          imp: [56, 66],
          impAngle: 90,
          arrow: arrow([86, 76], [86, 60], -7),
        },
        {
          // Top of a calf raise = heel clearly ABOVE the ball of the foot. The old top frame
          // left the ankle only 2px above the toe, so "Rise" showed a flat foot.
          caption: 'Rise',
          pose: {
            head: [57, 13],
            neck: [54, 22],
            sh: [54, 25],
            el: [54, 39],
            wr: [54, 53],
            hip: [53, 51],
            kn: [53, 72],
            an: [55, 90],
            toe: [64, 94],
          },
          hi: ['leg'],
          imp: [56, 56],
          impAngle: 90,
          arrow: arrow([86, 60], [86, 76], 7),
        },
      ],
    },

    /* --- horizontal push ------------------------------------------------ */
    benchPressRig('bench-press', 'Bench press'),
    inclinePressRig('incline-press', 'Incline press'),
    {
      id: 'push-up',
      label: 'Push-up',
      view: 'side',
      implement: 'none',
      // Hands and toes are the two ground contacts and NEVER leave the floor (y=104); the
      // body pivots about the toes. The old pose drew 20–22px arm bones (the rest of the rig
      // library uses ~14) which forced the elbow 20px behind the shoulder and let the feet
      // float 6px in the air at lock-out.
      frames: [
        {
          caption: 'Bottom',
          pose: {
            head: [94, 76],
            neck: [86, 79],
            sh: [78, 82],
            el: [71, 94],
            wr: [84, 104],
            hip: [50, 90],
            kn: [30, 96],
            an: [16, 100],
            toe: [10, 104],
          },
          hi: ['arm'],
          arrow: arrow([104, 92], [104, 66], -8),
        },
        {
          caption: 'Lock out',
          pose: {
            head: [98, 66],
            neck: [90, 70],
            sh: [82, 74],
            el: [83, 89],
            wr: [84, 104],
            hip: [52, 85],
            kn: [32, 93],
            an: [18, 98],
            toe: [10, 104],
          },
          hi: ['arm'],
          arrow: arrow([104, 66], [104, 92], 8),
        },
      ],
    },
    {
      id: 'seated-press',
      label: 'Seated chest press',
      view: 'side',
      implement: 'machine',
      scenery: (
        <>
          <Pad x1={22} x2={58} y={78} />
          <Backrest from={[24, 78]} to={[18, 46]} />
          <Post x={104} y1={30} y2={104} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [22, 42],
            neck: [27, 50],
            sh: [29, 53],
            el: [24, 65],
            wr: [38, 60],
            hip: [42, 78],
            kn: [64, 80],
            an: [64, 102],
            toe: [74, 102],
          },
          hi: ['arm'],
          imp: [40, 61],
          impAngle: 90,
          arrow: arrow([72, 74], [96, 70], 8),
        },
        {
          caption: 'Press',
          pose: {
            head: [22, 42],
            neck: [27, 50],
            sh: [29, 53],
            el: [44, 58],
            wr: [62, 57],
            hip: [42, 78],
            kn: [64, 80],
            an: [64, 102],
            toe: [74, 102],
          },
          hi: ['arm'],
          imp: [66, 56],
          impAngle: 90,
          arrow: arrow([96, 70], [72, 74], -8),
        },
      ],
    },
    flyRig('cable-fly', 'Cable fly', false),
    flyRig('pec-deck', 'Pec deck fly', true),

    /* --- vertical push -------------------------------------------------- */
    {
      id: 'dip',
      label: 'Dip',
      view: 'side',
      implement: 'none',
      ground: false,
      // Dip bars sit at HIP height: with straight arms at the top the shoulders are a full
      // arm-length (28px) ABOVE the hands. The old rig put the bars at y=52 with 8px arm
      // bones, and its "Bottom" frame dropped the shoulder BELOW hand level — a position the
      // elbow cannot reach.
      scenery: (
        <>
          <FixedBar x1={26} x2={94} y={64} />
          <Post x={30} y1={64} y2={112} />
          <Post x={90} y1={64} y2={112} />
        </>
      ),
      frames: [
        {
          caption: 'Top',
          pose: {
            head: [60, 24],
            neck: [57, 33],
            sh: [56, 36],
            el: [56, 50],
            wr: [56, 64],
            hip: [57, 62],
            kn: [62, 80],
            an: [54, 92],
            toe: [64, 94],
          },
          hi: ['arm'],
          arrow: arrow([80, 38], [80, 58], 8),
        },
        {
          caption: 'Bottom',
          pose: {
            head: [60, 35],
            neck: [57, 44],
            sh: [56, 47],
            el: [45, 56],
            wr: [56, 64],
            hip: [57, 73],
            kn: [62, 91],
            an: [54, 103],
            toe: [64, 105],
          },
          hi: ['arm'],
          arrow: arrow([80, 58], [80, 38], -8),
        },
      ],
    },
    ohpRig('overhead-press', 'Overhead press', false),
    ohpRig('shoulder-press-seated', 'Seated shoulder press', true),

    /* --- horizontal pull ------------------------------------------------ */
    bentRowRig('row-bent', 'Bent-over row', false),
    bentRowRig('row-onearm', 'One-arm row', true),
    {
      id: 'row-seated',
      label: 'Seated row',
      view: 'side',
      scenery: (
        <>
          <Pad x1={30} x2={66} y={86} legs={false} />
          <Post x={110} y1={40} y2={104} />
          <Pulley at={[108, 70]} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [50, 47],
            neck: [46, 56],
            sh: [46, 58],
            el: [62, 62],
            wr: [78, 66],
            hip: [46, 84],
            kn: [74, 84],
            an: [80, 104],
            toe: [90, 104],
          },
          hi: ['arm'],
          imp: [82, 66],
          impAngle: 90,
          cableFrom: [108, 70],
          arrow: arrow([70, 42], [44, 42], 8),
        },
        {
          caption: 'Pull',
          pose: {
            head: [50, 47],
            neck: [46, 56],
            sh: [46, 58],
            el: [36, 64],
            wr: [56, 68],
            hip: [46, 84],
            kn: [74, 84],
            an: [80, 104],
            toe: [90, 104],
          },
          hi: ['arm'],
          imp: [58, 68],
          impAngle: 90,
          cableFrom: [108, 70],
          arrow: arrow([44, 42], [70, 42], -8),
        },
      ],
    },
    {
      id: 'inverted-row',
      label: 'Inverted row',
      view: 'side',
      implement: 'none',
      scenery: (
        <>
          <FixedBar x1={34} x2={88} y={52} />
          <Post x={38} y1={20} y2={104} />
          <Post x={84} y1={20} y2={104} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [42, 68],
            neck: [50, 72],
            sh: [54, 74],
            el: [58, 62],
            wr: [60, 54],
            hip: [76, 86],
            kn: [92, 94],
            an: [104, 100],
            toe: [108, 94],
          },
          hi: ['arm'],
          arrow: arrow([32, 84], [32, 64], -8),
        },
        {
          caption: 'Pull',
          pose: {
            head: [42, 58],
            neck: [50, 62],
            sh: [54, 64],
            el: [48, 56],
            wr: [60, 54],
            hip: [76, 80],
            kn: [92, 90],
            an: [104, 98],
            toe: [108, 92],
          },
          hi: ['arm'],
          arrow: arrow([32, 64], [32, 84], 8),
        },
      ],
    },

    /* --- vertical pull -------------------------------------------------- */
    {
      id: 'pull-up',
      label: 'Pull-up',
      view: 'side',
      ground: false,
      scenery: (
        <>
          <FixedBar x1={26} x2={94} y={14} />
          <Post x={30} y1={14} y2={26} />
          <Post x={90} y1={14} y2={26} />
        </>
      ),
      frames: [
        {
          caption: 'Hang',
          pose: {
            head: [60, 41],
            neck: [56, 49],
            sh: [56, 50],
            el: [56, 33],
            wr: [56, 16],
            hip: [55, 74],
            kn: [55, 92],
            an: [55, 108],
            toe: [64, 110],
          },
          hi: ['arm'],
          cableFrom: [56, 15],
          imp: [55, 106],
          arrow: arrow([82, 62], [82, 40], -8),
        },
        {
          // "Chin over" has to actually clear the bar: the head must finish level with the
          // bar (y=14), not 25px below it. Pulling only 8px up left the caption describing a
          // rep that the drawing never completed.
          caption: 'Chin over',
          pose: {
            head: [60, 16],
            neck: [55, 24],
            sh: [54, 25],
            el: [40, 19],
            wr: [56, 16],
            hip: [53, 49],
            kn: [51, 67],
            an: [43, 79],
            toe: [51, 83],
          },
          hi: ['arm'],
          cableFrom: [56, 15],
          imp: [44, 77],
          arrow: arrow([82, 40], [82, 62], 8),
        },
      ],
    },
    {
      id: 'lat-pulldown',
      label: 'Lat pulldown',
      view: 'side',
      implement: 'cable',
      scenery: (
        <>
          <FixedBar x1={30} x2={96} y={10} />
          <Post x={94} y1={10} y2={104} />
          <Pad x1={34} x2={70} y={86} legs={false} />
          <Pulley at={[56, 12]} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [54, 47],
            neck: [50, 56],
            sh: [50, 58],
            el: [52, 40],
            wr: [54, 24],
            hip: [50, 84],
            kn: [74, 86],
            an: [76, 104],
            toe: [86, 104],
          },
          hi: ['arm'],
          imp: [55, 22],
          impAngle: 90,
          cableFrom: [56, 12],
          arrow: arrow([84, 34], [84, 58], 8),
        },
        {
          caption: 'Pull',
          pose: {
            head: [54, 47],
            neck: [50, 56],
            sh: [50, 58],
            el: [38, 58],
            wr: [54, 62],
            hip: [50, 84],
            kn: [74, 86],
            an: [76, 104],
            toe: [86, 104],
          },
          hi: ['arm'],
          imp: [55, 62],
          impAngle: 90,
          cableFrom: [56, 12],
          arrow: arrow([84, 58], [84, 34], -8),
        },
      ],
    },

    /* --- arms ------------------------------------------------------------ */
    {
      id: 'curl',
      label: 'Curl',
      view: 'front',
      // Grip width is FIXED (a barbell does not get shorter at the top), so the hands stay at
      // x=45/75 in both frames and only travel vertically. The cable anchor sits on the floor
      // line, not below it.
      frames: [
        {
          caption: 'Start',
          pose: front([48, 50], [46, 64], [72, 50], [74, 64]),
          hi: ['arm', 'arm2'],
          imp: [45, 67],
          imp2: [75, 67],
          cableFrom: [60, 103],
          arrow: arrow([30, 64], [32, 40], -10),
        },
        {
          caption: 'Squeeze',
          pose: front([48, 50], [46, 36], [72, 50], [74, 36]),
          hi: ['arm', 'arm2'],
          imp: [45, 33],
          imp2: [75, 33],
          cableFrom: [60, 103],
          arrow: arrow([32, 40], [30, 64], 10),
        },
      ],
    },
    {
      id: 'pushdown',
      label: 'Triceps pushdown',
      view: 'side',
      implement: 'cable',
      scenery: (
        <>
          <Post x={96} y1={14} y2={104} />
          <Pulley at={[96, 18]} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: stand([56, 52], [64, 44]),
          hi: ['arm'],
          imp: [66, 42],
          impAngle: 90,
          cableFrom: [96, 18],
          arrow: arrow([78, 46], [78, 68], 8),
        },
        {
          caption: 'Lock out',
          pose: stand([56, 52], [62, 66]),
          hi: ['arm'],
          imp: [64, 68],
          impAngle: 90,
          cableFrom: [96, 18],
          arrow: arrow([78, 68], [78, 46], -8),
        },
      ],
    },
    {
      id: 'skull-crusher',
      label: 'Skull crusher',
      view: 'side',
      scenery: <Pad x1={24} x2={80} y={72} />,
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [28, 63],
            neck: [36, 66],
            sh: [40, 66],
            el: [44, 50],
            wr: [46, 38],
            hip: [64, 70],
            kn: [84, 74],
            an: [84, 98],
            toe: [94, 98],
          },
          hi: ['arm'],
          imp: [46, 34],
          impAngle: 90,
          arrow: arrow([48, 26], [26, 34], 8),
        },
        {
          caption: 'Stretch',
          pose: {
            head: [28, 63],
            neck: [36, 66],
            sh: [40, 66],
            el: [44, 50],
            wr: [30, 46],
            hip: [64, 70],
            kn: [84, 74],
            an: [84, 98],
            toe: [94, 98],
          },
          hi: ['arm'],
          imp: [26, 44],
          impAngle: 90,
          arrow: arrow([26, 34], [48, 26], -8),
        },
      ],
    },
    {
      id: 'triceps-overhead',
      label: 'Overhead triceps extension',
      view: 'side',
      // The upper arm stays vertical overhead and the elbow does not move — only the forearm
      // swings. (Side view: the elbow sits beside the ear, so it reads over the head circle.)
      frames: [
        {
          caption: 'Stretch',
          pose: stand([53, 21], [40, 27]),
          hi: ['arm'],
          imp: [36, 28],
          impAngle: 90,
          arrow: arrow([38, 16], [58, 8], -8),
        },
        {
          caption: 'Lock out',
          pose: stand([53, 21], [55, 8]),
          hi: ['arm'],
          imp: [56, 5],
          impAngle: 90,
          arrow: arrow([58, 8], [38, 16], 8),
        },
      ],
    },

    /* --- shoulders -------------------------------------------------------- */
    lateralRaiseRig('lateral-raise', 'Lateral raise'),
    rearDeltFlyRig('rear-delt-fly', 'Rear delt fly'),
    {
      id: 'face-pull',
      label: 'Face pull',
      view: 'front',
      implement: 'cable',
      scenery: <FixedBar x1={40} x2={80} y={8} />,
      // A face pull PULLS THE ROPE APART: the hands start together, reaching toward the
      // anchor, and finish WIDE beside the ears with the elbows flared back. The previous
      // frames had the hands 48px apart at the start and only 24px apart at the finish —
      // i.e. the hands travelled inward, the opposite of the movement.
      frames: [
        {
          caption: 'Start',
          pose: front([52, 26], [56, 14], [68, 26], [64, 14]),
          hi: ['arm', 'arm2'],
          imp: [56, 12],
          imp2: [64, 12],
          cableFrom: [60, 9],
          arrow: arrow([30, 26], [16, 34], -8),
        },
        {
          caption: 'Pull',
          pose: front([34, 36], [44, 26], [86, 36], [76, 26]),
          hi: ['arm', 'arm2'],
          imp: [42, 26],
          imp2: [78, 26],
          cableFrom: [60, 9],
          arrow: arrow([16, 34], [30, 26], 8),
        },
      ],
    },

    /* --- core ------------------------------------------------------------- */
    {
      id: 'plank',
      label: 'Plank',
      view: 'side',
      implement: 'none',
      // Forearm plank: the ELBOW AND FOREARM rest on the floor (y=104) with the shoulder
      // stacked over the elbow, and the body is supported on the TOES. The old rig floated
      // the elbow 12px above the floor, stretched the upper arm from 15px to 22px between
      // frames, and drew the foot with the ankle on the ground and the toes in the air in
      // "Set up" but the opposite way round in "Hold".
      frames: [
        {
          caption: 'Set up',
          pose: {
            head: [96, 82],
            neck: [86, 84],
            sh: [78, 88],
            el: [78, 104],
            wr: [92, 104],
            hip: [52, 88],
            kn: [34, 94],
            an: [20, 99],
            toe: [12, 104],
          },
          hi: ['torso'],
        },
        {
          caption: 'Hold',
          pose: {
            head: [96, 85],
            neck: [86, 86],
            sh: [78, 88],
            el: [78, 104],
            wr: [92, 104],
            hip: [52, 93],
            kn: [34, 96],
            an: [20, 99],
            toe: [12, 104],
          },
          hi: ['torso'],
          arrow: arrow([76, 82], [26, 92], -5),
        },
      ],
    },
    {
      id: 'dead-bug',
      label: 'Dead bug',
      view: 'side',
      implement: 'none',
      // Lying supine, the back is ON THE FLOOR — the old pose floated the spine 14px above
      // the floor line. The far arm and far leg stay locked at 90/90 while the near arm and
      // near leg reach out, so the frames show the CONTRALATERAL pattern the drill trains.
      frames: [
        {
          caption: 'Set up',
          pose: {
            head: [26, 94],
            neck: [34, 97],
            sh: [38, 98],
            el: [38, 84],
            wr: [40, 70],
            hip: [64, 100],
            kn: [80, 78],
            an: [92, 90],
            toe: [100, 88],
            sh2: [38, 98],
            el2: [38, 84],
            wr2: [40, 70],
            hip2: [64, 100],
            kn2: [80, 78],
            an2: [92, 90],
            toe2: [100, 88],
          },
          hi: ['arm', 'leg'],
          arrow: arrow([96, 74], [110, 88], 8),
        },
        {
          caption: 'Extend',
          pose: {
            head: [26, 94],
            neck: [34, 97],
            sh: [38, 98],
            el: [30, 84],
            wr: [16, 82],
            hip: [64, 100],
            kn: [86, 90],
            an: [106, 96],
            toe: [112, 90],
            sh2: [38, 98],
            el2: [38, 84],
            wr2: [40, 70],
            hip2: [64, 100],
            kn2: [80, 78],
            an2: [92, 90],
            toe2: [100, 88],
          },
          hi: ['arm', 'leg'],
          arrow: arrow([110, 88], [96, 74], -8),
        },
      ],
    },
    {
      id: 'rollout',
      label: 'Ab wheel rollout',
      view: 'side',
      implement: 'wheel',
      frames: [
        {
          caption: 'Set up',
          pose: {
            head: [38, 52],
            neck: [46, 57],
            sh: [50, 59],
            el: [56, 76],
            wr: [62, 90],
            hip: [66, 78],
            kn: [74, 100],
            an: [88, 104],
            toe: [96, 100],
          },
          hi: ['torso'],
          imp: [64, 96],
          arrow: arrow([48, 68], [22, 82], -10),
        },
        {
          caption: 'Roll out',
          pose: {
            head: [26, 74],
            neck: [34, 77],
            sh: [38, 78],
            el: [30, 86],
            wr: [22, 92],
            hip: [62, 86],
            kn: [74, 100],
            an: [88, 104],
            toe: [96, 100],
          },
          hi: ['torso'],
          imp: [20, 96],
          arrow: arrow([22, 82], [48, 68], 10),
        },
      ],
    },
    {
      id: 'hanging-leg-raise',
      label: 'Hanging leg raise',
      view: 'side',
      implement: 'none',
      ground: false,
      scenery: (
        <>
          <FixedBar x1={26} x2={94} y={14} />
          <Post x={30} y1={14} y2={26} />
          <Post x={90} y1={14} y2={26} />
        </>
      ),
      frames: [
        {
          caption: 'Hang',
          pose: {
            head: [60, 41],
            neck: [56, 49],
            sh: [56, 50],
            el: [56, 33],
            wr: [56, 16],
            hip: [55, 74],
            kn: [55, 92],
            an: [55, 108],
            toe: [64, 110],
          },
          hi: ['leg'],
          arrow: arrow([72, 100], [92, 74], 14),
        },
        {
          caption: 'Raise',
          pose: {
            head: [60, 41],
            neck: [56, 49],
            sh: [56, 50],
            el: [56, 33],
            wr: [56, 16],
            hip: [55, 74],
            kn: [74, 70],
            an: [94, 68],
            toe: [100, 62],
          },
          hi: ['leg'],
          arrow: arrow([92, 74], [72, 100], -14),
        },
      ],
    },
    {
      id: 'cable-crunch',
      label: 'Cable crunch',
      view: 'side',
      implement: 'cable',
      scenery: (
        <>
          <Post x={92} y1={8} y2={104} />
          <Pulley at={[76, 10]} />
        </>
      ),
      frames: [
        {
          caption: 'Start',
          pose: {
            head: [58, 49],
            neck: [54, 58],
            sh: [54, 60],
            el: [54, 44],
            wr: [58, 32],
            hip: [56, 86],
            kn: [62, 104],
            an: [78, 102],
            toe: [86, 98],
          },
          hi: ['torso'],
          imp: [59, 29],
          cableFrom: [76, 10],
          arrow: arrow([36, 50], [36, 76], -8),
        },
        {
          caption: 'Crunch',
          pose: {
            head: [70, 80],
            neck: [62, 76],
            sh: [62, 74],
            el: [64, 58],
            wr: [68, 46],
            hip: [56, 86],
            kn: [62, 104],
            an: [78, 102],
            toe: [86, 98],
          },
          hi: ['torso'],
          imp: [69, 43],
          cableFrom: [76, 10],
          arrow: arrow([36, 76], [36, 50], 8),
        },
      ],
    },
    {
      id: 'russian-twist',
      label: 'Russian twist',
      view: 'front',
      // Seated ON THE FLOOR: hips just above the floor line and heels down. The old pose sat
      // the whole figure 12px up in mid-air, which read as a standing/crouching twist.
      frames: [
        {
          caption: 'Left',
          pose: {
            head: [60, 44],
            neck: [60, 54],
            sh: [50, 58],
            el: [38, 66],
            wr: [30, 74],
            sh2: [70, 58],
            el2: [62, 68],
            wr2: [36, 76],
            hip: [56, 92],
            hip2: [64, 92],
            kn: [44, 84],
            kn2: [76, 84],
            an: [36, 100],
            an2: [84, 100],
            toe: [30, 104],
            toe2: [90, 104],
          },
          hi: ['torso'],
          imp: [26, 76],
          arrow: arrow([34, 56], [86, 56], -14),
        },
        {
          caption: 'Right',
          pose: {
            head: [60, 44],
            neck: [60, 54],
            sh: [50, 58],
            el: [58, 68],
            wr: [84, 76],
            sh2: [70, 58],
            el2: [82, 66],
            wr2: [90, 74],
            hip: [56, 92],
            hip2: [64, 92],
            kn: [44, 84],
            kn2: [76, 84],
            an: [36, 100],
            an2: [84, 100],
            toe: [30, 104],
            toe2: [90, 104],
          },
          hi: ['torso'],
          imp: [94, 76],
          arrow: arrow([86, 56], [34, 56], 14),
        },
      ],
    },

    /* --- carry & cardio ---------------------------------------------------- */
    {
      id: 'carry',
      label: 'Loaded carry',
      view: 'side',
      frames: [
        {
          caption: 'Stand tall',
          pose: stand([54, 49], [54, 63], { kn2: [50, 82], an2: [50, 104], toe2: [60, 104] }),
          hi: ['torso'],
          imp: [56, 66],
          impAngle: 90,
          arrow: arrow([74, 96], [100, 96], -6),
        },
        {
          caption: 'Walk',
          pose: {
            head: [57, 23],
            neck: [54, 32],
            sh: [54, 35],
            el: [54, 49],
            wr: [54, 63],
            hip: [53, 61],
            kn: [64, 80],
            an: [70, 100],
            toe: [80, 100],
            kn2: [42, 82],
            an2: [34, 102],
            toe2: [26, 104],
          },
          hi: ['torso'],
          imp: [56, 66],
          impAngle: 90,
          arrow: arrow([74, 96], [100, 96], -6),
        },
      ],
    },
    {
      id: 'run',
      label: 'Run',
      view: 'side',
      implement: 'none',
      scenery: <Pad x1={12} x2={108} y={100} legs={false} />,
      frames: [
        {
          caption: 'Drive',
          pose: {
            head: [60, 21],
            neck: [56, 30],
            sh: [55, 34],
            el: [64, 46],
            wr: [70, 36],
            sh2: [52, 34],
            el2: [44, 50],
            wr2: [38, 60],
            hip: [53, 60],
            kn: [70, 68],
            an: [78, 84],
            toe: [86, 80],
            kn2: [40, 80],
            an2: [28, 94],
            toe2: [20, 98],
          },
          hi: ['leg'],
          arrow: arrow([94, 60], [94, 40], -8),
        },
        {
          caption: 'Land',
          pose: {
            head: [60, 21],
            neck: [56, 30],
            sh: [55, 34],
            el: [46, 48],
            wr: [40, 58],
            sh2: [52, 34],
            el2: [62, 46],
            wr2: [68, 36],
            hip: [53, 60],
            kn: [58, 80],
            an: [64, 98],
            toe: [74, 98],
            kn2: [46, 76],
            an2: [34, 86],
            toe2: [26, 90],
          },
          hi: ['leg'],
          arrow: arrow([94, 40], [94, 60], 8),
        },
      ],
    },
    {
      id: 'bike',
      label: 'Stationary bike',
      view: 'side',
      implement: 'none',
      scenery: (
        <>
          <Pad x1={30} x2={54} y={70} legs={false} />
          <line x1={42} y1={75} x2={62} y2={92} {...S} />
          <line x1={78} y1={50} x2={64} y2={92} {...S} />
          <FixedBar x1={70} y={50} x2={90} />
          <circle cx={62} cy={92} r={11} {...S} />
        </>
      ),
      frames: [
        {
          caption: 'Drive',
          pose: {
            head: [48, 37],
            neck: [45, 46],
            sh: [46, 49],
            el: [58, 52],
            wr: [72, 54],
            hip: [42, 68],
            kn: [62, 78],
            an: [62, 100],
            toe: [70, 100],
            kn2: [58, 72],
            an2: [54, 86],
            toe2: [62, 84],
          },
          hi: ['leg'],
          arrow: arrow([76, 92], [62, 106], -8),
        },
        {
          caption: 'Recover',
          pose: {
            head: [48, 37],
            neck: [45, 46],
            sh: [46, 49],
            el: [58, 52],
            wr: [72, 54],
            hip: [42, 68],
            kn: [60, 74],
            an: [54, 88],
            toe: [62, 86],
            kn2: [62, 78],
            an2: [62, 100],
            toe2: [70, 100],
          },
          hi: ['leg'],
          arrow: arrow([62, 106], [76, 92], 8),
        },
      ],
    },
    {
      id: 'row-erg',
      label: 'Rowing machine',
      view: 'side',
      implement: 'cable',
      scenery: (
        <>
          <FixedBar x1={12} x2={110} y={96} />
          <circle cx={16} cy={72} r={11} {...S} />
          <Post x={16} y1={83} y2={96} />
        </>
      ),
      frames: [
        {
          // The figure faces the flywheel (-x). At the CATCH the torso is hinged FORWARD over
          // the knees (~1 o'clock shoulders ahead of the hips); the old pose leaned it back
          // by the same 8px as the finish, so the stroke showed no body swing at all and the
          // catch looked like a lay-back.
          caption: 'Catch',
          pose: {
            head: [46, 57],
            neck: [54, 62],
            sh: [56, 64],
            el: [44, 68],
            wr: [32, 72],
            hip: [62, 86],
            kn: [46, 70],
            an: [34, 84],
            toe: [28, 80],
          },
          hi: ['leg', 'arm'],
          imp: [30, 72],
          impAngle: 90,
          cableFrom: [20, 72],
          arrow: arrow([56, 42], [88, 40], -8),
        },
        {
          caption: 'Finish',
          pose: {
            head: [92, 58],
            neck: [84, 62],
            sh: [82, 64],
            el: [88, 74],
            wr: [70, 74],
            hip: [76, 86],
            kn: [50, 84],
            an: [30, 86],
            toe: [24, 80],
          },
          hi: ['leg', 'arm'],
          imp: [68, 74],
          impAngle: 90,
          cableFrom: [22, 72],
          arrow: arrow([88, 40], [56, 42], 8),
        },
      ],
    },
    {
      id: 'jump-rope',
      label: 'Jump rope',
      view: 'front',
      implement: 'none',
      frames: [
        {
          caption: 'Rope up',
          pose: front([48, 50], [46, 62], [72, 50], [74, 62]),
          hi: ['arm', 'arm2'],
          art: <path d="M46 62 C24 2 96 2 74 62" strokeWidth={2} stroke="var(--accent)" opacity={0.75} />,
          // Rope overhead → the next thing that happens is the JUMP, so this arrow points up
          // (and the airborne frame's arrow points down into the landing). They were swapped.
          arrow: arrow([96, 76], [96, 34], -10),
        },
        {
          caption: 'Jump',
          pose: front([48, 44], [46, 56], [72, 44], [74, 56], {
            head: [60, 15],
            neck: [60, 25],
            sh: [50, 29],
            sh2: [70, 29],
            hip: [55, 56],
            hip2: [65, 56],
            kn: [50, 74],
            kn2: [70, 74],
            an: [52, 92],
            an2: [68, 92],
            toe: [50, 96],
            toe2: [70, 96],
          }),
          hi: ['leg', 'leg2'],
          art: <path d="M46 56 C26 112 94 112 74 56" strokeWidth={2} stroke="var(--accent)" opacity={0.75} />,
          arrow: arrow([96, 34], [96, 76], 10),
        },
      ],
    },
  ];

  const map: Record<string, Rig> = {};
  for (const r of list) map[r.id] = r;
  return map;
}

export const POSE_RIGS: Record<string, Rig> = buildRigs();

/* --------------------------------------------------- exercise → rig resolution */

/** Fallback rig for a raw `movement_pattern` when no `pose_pattern` is set. */
export const PATTERN_DEFAULT_RIG: Record<string, string> = {
  squat: 'squat-back',
  hinge: 'rdl',
  lunge: 'lunge',
  horizontal_push: 'bench-press',
  vertical_push: 'overhead-press',
  horizontal_pull: 'row-bent',
  vertical_pull: 'pull-up',
  elbow_flexion: 'curl',
  elbow_extension: 'pushdown',
  shoulder_isolation: 'lateral-raise',
  core_flexion: 'cable-crunch',
  core_stability: 'plank',
  carry: 'carry',
  hip_extension_iso: 'hip-thrust',
  knee_flexion_iso: 'leg-curl',
  knee_extension_iso: 'leg-extension',
  calf_raise: 'calf-raise',
  cardio: 'run',
};
