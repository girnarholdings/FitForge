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
import exercisesSeed from '../../../../../seed/data/exercises.json';

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

function benchPressRig(id: string, label: string, incline: boolean): Rig {
  const body = { hip: [64, 70] as Pt, kn: [84, 74] as Pt, an: [84, 98] as Pt, toe: [94, 98] as Pt };
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
    /**
     * INCLINE = the HEAD END IS RAISED. The figure lies head-left (head x≈28), feet-right
     * (toe x≈94) about a pivot at x=58, and SVG rotation is CLOCKWISE-positive (y grows
     * downward), so a POSITIVE angle lifts the head and drops the feet — a true incline.
     * The previous negative angle drove the head DOWN and the hips UP, i.e. it drew a
     * DECLINE press under an "Incline press" label. 30° is the standard incline-bench
     * setting for upper-chest emphasis.
     */
    tilt: incline ? { deg: 30, cx: 58, cy: 82 } : undefined,
    scenery: <Pad x1={24} x2={80} y={72} />,
    frames: [
      {
        caption: 'Bottom',
        pose: base([36, 60], [46, 56]),
        hi: ['arm'],
        imp: [46, 53],
        impAngle: 90,
        arrow: arrow([64, 52], [64, 34], -8),
      },
      {
        caption: 'Lock out',
        pose: base([43, 52], [46, 40]),
        hi: ['arm'],
        imp: [46, 37],
        impAngle: 90,
        arrow: arrow([64, 34], [64, 52], 8),
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
        arrow: arrow([98, 40], [98, 18], -8),
      },
      {
        caption: 'Lock out',
        pose: front([48, 32], [48, 18], [72, 32], [72, 18], legs),
        hi: ['arm', 'arm2'],
        imp: [48, 15],
        imp2: [72, 15],
        arrow: arrow([98, 18], [98, 40], 8),
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
        arrow: arrow([18, 62], [50, 66], 10),
      },
      {
        caption: 'Squeeze',
        pose: front([44, 46], [56, 52], [76, 46], [64, 52], legs),
        hi: ['arm', 'arm2'],
        imp: [55, 53],
        imp2: [65, 53],
        cableFrom: seated ? undefined : [8, 16],
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
        caption: 'Pull',
        pose: base([76, 56], [62, 66]),
        hi: ['arm'],
        imp: [60, 70],
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
  const base = (hip: Pt, sh: Pt, head: Pt, neck: Pt, kn: Pt): Pose => ({
    head,
    neck,
    sh,
    el: [sh[0] - 4, sh[1] + 10],
    wr: [sh[0], sh[1] + 20],
    hip,
    kn,
    an: [82, 100],
    toe: [92, 100],
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

function lateralRaiseRig(id: string, label: string, bent: boolean): Rig {
  const hinge: Partial<Pose> = bent
    ? {
        head: [60, 34],
        neck: [60, 43],
        sh: [50, 46],
        sh2: [70, 46],
        hip: [55, 68],
        hip2: [65, 68],
        kn: [53, 86],
        kn2: [67, 86],
      }
    : {};
  const dy = bent ? 12 : 0;
  return {
    id,
    label,
    view: 'front',
    frames: [
      {
        caption: 'Start',
        pose: front([47, 48 + dy], [44, 62 + dy], [73, 48 + dy], [76, 62 + dy], hinge),
        hi: ['arm', 'arm2'],
        imp: [42, 66 + dy],
        imp2: [78, 66 + dy],
        arrow: arrow([28, 62 + dy], [16, 42 + dy], -9),
      },
      {
        caption: 'Raise',
        pose: front([36, 38 + dy], [20, 36 + dy], [84, 38 + dy], [100, 36 + dy], hinge),
        hi: ['arm', 'arm2'],
        imp: [16, 36 + dy],
        imp2: [104, 36 + dy],
        arrow: arrow([16, 42 + dy], [28, 62 + dy], 9),
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
    squatRig('squat-machine', 'Machine squat', {
      startArm: [[48, 44], [47, 34]],
      bottomArm: [[54, 66], [53, 57]],
      impStart: [50, 34],
      impBottom: [56, 57],
      implement: 'machine',
    }),
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
          caption: 'Bottom',
          pose: {
            head: [52, 26],
            neck: [49, 35],
            sh: [49, 38],
            el: [49, 52],
            wr: [49, 66],
            hip: [48, 64],
            kn: [70, 80],
            an: [70, 104],
            toe: [80, 104],
            kn2: [30, 88],
            an2: [22, 102],
            toe2: [14, 104],
          },
          hi: ['leg'],
          imp: [51, 69],
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
          caption: 'Hinge',
          pose: {
            head: [78, 52],
            neck: [70, 55],
            sh: [68, 56],
            el: [68, 72],
            wr: [68, 86],
            hip: [40, 62],
            kn: [50, 84],
            an: [52, 104],
            toe: [62, 104],
          },
          hi: ['leg', 'torso'],
          imp: [68, 90],
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
      scenery: <Pad x1={44} x2={84} y={94} />,
      frames: [
        {
          caption: 'Stretch',
          pose: {
            head: [57, 25],
            neck: [54, 34],
            sh: [54, 37],
            el: [54, 51],
            wr: [54, 65],
            hip: [53, 63],
            kn: [53, 84],
            an: [53, 102],
            toe: [64, 94],
          },
          hi: ['leg'],
          imp: [56, 68],
          impAngle: 90,
          arrow: arrow([86, 76], [86, 60], -7),
        },
        {
          caption: 'Rise',
          pose: {
            head: [57, 15],
            neck: [54, 24],
            sh: [54, 27],
            el: [54, 41],
            wr: [54, 55],
            hip: [53, 53],
            kn: [53, 74],
            an: [55, 92],
            toe: [64, 94],
          },
          hi: ['leg'],
          imp: [56, 58],
          impAngle: 90,
          arrow: arrow([86, 60], [86, 76], 7),
        },
      ],
    },

    /* --- horizontal push ------------------------------------------------ */
    benchPressRig('bench-press', 'Bench press', false),
    benchPressRig('incline-press', 'Incline press', true),
    {
      id: 'push-up',
      label: 'Push-up',
      view: 'side',
      implement: 'none',
      frames: [
        {
          caption: 'Bottom',
          pose: {
            head: [96, 80],
            neck: [88, 84],
            sh: [84, 86],
            el: [66, 96],
            wr: [88, 100],
            hip: [52, 92],
            kn: [32, 96],
            an: [14, 100],
            toe: [8, 104],
          },
          hi: ['arm'],
          arrow: arrow([104, 94], [104, 66], -8),
        },
        {
          caption: 'Lock out',
          pose: {
            head: [96, 62],
            neck: [88, 68],
            sh: [84, 70],
            el: [86, 85],
            wr: [88, 100],
            hip: [52, 80],
            kn: [32, 88],
            an: [14, 94],
            toe: [8, 98],
          },
          hi: ['arm'],
          arrow: arrow([104, 66], [104, 94], 8),
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
      scenery: (
        <>
          <FixedBar x1={26} x2={94} y={52} />
          <Post x={30} y1={52} y2={112} />
          <Post x={90} y1={52} y2={112} />
        </>
      ),
      frames: [
        {
          caption: 'Top',
          pose: {
            head: [60, 24],
            neck: [57, 33],
            sh: [56, 36],
            el: [57, 44],
            wr: [56, 52],
            hip: [57, 62],
            kn: [62, 80],
            an: [54, 92],
            toe: [64, 94],
          },
          hi: ['arm'],
          arrow: arrow([80, 40], [80, 62], 8),
        },
        {
          caption: 'Bottom',
          pose: {
            head: [60, 38],
            neck: [57, 47],
            sh: [56, 50],
            el: [44, 54],
            wr: [56, 52],
            hip: [57, 76],
            kn: [62, 94],
            an: [54, 106],
            toe: [64, 108],
          },
          hi: ['arm'],
          arrow: arrow([80, 62], [80, 40], -8),
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
          arrow: arrow([70, 42], [44, 42], -8),
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
          arrow: arrow([44, 42], [70, 42], 8),
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
          caption: 'Chin over',
          pose: {
            head: [60, 33],
            neck: [55, 41],
            sh: [54, 42],
            el: [44, 29],
            wr: [56, 16],
            hip: [54, 64],
            kn: [52, 82],
            an: [44, 94],
            toe: [52, 98],
          },
          hi: ['arm'],
          cableFrom: [56, 15],
          imp: [45, 92],
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
      frames: [
        {
          caption: 'Start',
          pose: front([48, 50], [46, 64], [72, 50], [74, 64]),
          hi: ['arm', 'arm2'],
          imp: [45, 67],
          imp2: [75, 67],
          cableFrom: [60, 108],
          arrow: arrow([30, 64], [32, 40], -10),
        },
        {
          caption: 'Squeeze',
          pose: front([48, 50], [52, 36], [72, 50], [68, 36]),
          hi: ['arm', 'arm2'],
          imp: [51, 33],
          imp2: [69, 33],
          cableFrom: [60, 108],
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
      frames: [
        {
          caption: 'Stretch',
          pose: stand([52, 24], [38, 28]),
          hi: ['arm'],
          imp: [34, 29],
          impAngle: 90,
          arrow: arrow([36, 18], [58, 10], -8),
        },
        {
          caption: 'Lock out',
          pose: stand([52, 24], [54, 10]),
          hi: ['arm'],
          imp: [55, 7],
          impAngle: 90,
          arrow: arrow([58, 10], [36, 18], 8),
        },
      ],
    },

    /* --- shoulders -------------------------------------------------------- */
    lateralRaiseRig('lateral-raise', 'Lateral raise', false),
    lateralRaiseRig('rear-delt-fly', 'Rear delt fly', true),
    {
      id: 'face-pull',
      label: 'Face pull',
      view: 'front',
      implement: 'cable',
      scenery: <FixedBar x1={40} x2={80} y={8} />,
      frames: [
        {
          caption: 'Start',
          pose: front([46, 38], [38, 26], [74, 38], [82, 26]),
          hi: ['arm', 'arm2'],
          imp: [36, 24],
          imp2: [84, 24],
          cableFrom: [60, 9],
          arrow: arrow([28, 30], [16, 40], -8),
        },
        {
          caption: 'Pull',
          pose: front([32, 34], [50, 26], [88, 34], [70, 26]),
          hi: ['arm', 'arm2'],
          imp: [48, 25],
          imp2: [72, 25],
          cableFrom: [60, 9],
          arrow: arrow([16, 40], [28, 30], 8),
        },
      ],
    },

    /* --- core ------------------------------------------------------------- */
    {
      id: 'plank',
      label: 'Plank',
      view: 'side',
      implement: 'none',
      frames: [
        {
          caption: 'Set up',
          pose: {
            head: [92, 72],
            neck: [84, 75],
            sh: [80, 77],
            el: [80, 92],
            wr: [92, 102],
            hip: [54, 86],
            kn: [36, 98],
            an: [24, 104],
            toe: [16, 100],
          },
          hi: ['torso'],
        },
        {
          caption: 'Hold',
          pose: {
            head: [92, 64],
            neck: [84, 68],
            sh: [80, 70],
            el: [80, 92],
            wr: [92, 102],
            hip: [54, 80],
            kn: [36, 90],
            an: [20, 100],
            toe: [12, 104],
          },
          hi: ['torso'],
          arrow: arrow([80, 56], [24, 88], -6),
        },
      ],
    },
    {
      id: 'dead-bug',
      label: 'Dead bug',
      view: 'side',
      implement: 'none',
      frames: [
        {
          caption: 'Set up',
          pose: {
            head: [26, 86],
            neck: [34, 89],
            sh: [38, 90],
            el: [38, 74],
            wr: [40, 60],
            hip: [64, 94],
            kn: [80, 72],
            an: [92, 84],
            toe: [100, 82],
          },
          hi: ['arm', 'leg'],
          arrow: arrow([96, 66], [110, 82], 8),
        },
        {
          caption: 'Extend',
          pose: {
            head: [26, 86],
            neck: [34, 89],
            sh: [38, 90],
            el: [30, 76],
            wr: [16, 74],
            hip: [64, 94],
            kn: [86, 84],
            an: [106, 90],
            toe: [112, 84],
          },
          hi: ['arm', 'leg'],
          arrow: arrow([110, 82], [96, 66], -8),
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
      frames: [
        {
          caption: 'Left',
          pose: {
            head: [60, 32],
            neck: [60, 42],
            sh: [50, 46],
            el: [38, 54],
            wr: [30, 62],
            sh2: [70, 46],
            el2: [62, 56],
            wr2: [36, 64],
            hip: [56, 80],
            hip2: [64, 80],
            kn: [44, 72],
            kn2: [76, 72],
            an: [36, 88],
            an2: [84, 88],
            toe: [30, 92],
            toe2: [90, 92],
          },
          hi: ['torso'],
          imp: [26, 64],
          arrow: arrow([34, 44], [86, 44], -14),
        },
        {
          caption: 'Right',
          pose: {
            head: [60, 32],
            neck: [60, 42],
            sh: [50, 46],
            el: [58, 56],
            wr: [84, 64],
            sh2: [70, 46],
            el2: [82, 54],
            wr2: [90, 62],
            hip: [56, 80],
            hip2: [64, 80],
            kn: [44, 72],
            kn2: [76, 72],
            an: [36, 88],
            an2: [84, 88],
            toe: [30, 92],
            toe2: [90, 92],
          },
          hi: ['torso'],
          imp: [94, 64],
          arrow: arrow([86, 44], [34, 44], 14),
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
          caption: 'Catch',
          pose: {
            head: [78, 54],
            neck: [70, 60],
            sh: [68, 62],
            el: [54, 66],
            wr: [40, 70],
            hip: [62, 86],
            kn: [46, 70],
            an: [34, 84],
            toe: [28, 80],
          },
          hi: ['leg', 'arm'],
          imp: [38, 70],
          impAngle: 90,
          cableFrom: [22, 72],
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
          arrow: arrow([96, 34], [96, 76], 10),
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
          arrow: arrow([96, 76], [96, 34], -10),
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

interface SeedRow {
  slug: string;
  movement_pattern: string;
  equipment: string[][];
  pose_pattern?: string;
}

const SEED = exercisesSeed as unknown as SeedRow[];

const RIG_BY_EXERCISE = new Map<string, string>();
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
