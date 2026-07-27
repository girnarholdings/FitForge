/**
 * POSE RIGS for the bodyweight / conditioning / mobility / stretch expansion.
 *
 * Kept in its own file because `rigs.tsx` is already 2,000 lines, and because these rigs have a
 * different shape from the lifting library: many are HOLDS rather than reps.
 *
 * A static stretch has no concentric and no eccentric, so "frame 1 → frame 2" cannot mean
 * "bottom → top". Here it means **enter the position → the held position**, which is genuinely
 * the useful thing to draw: most people get a stretch wrong on the way in, not at the end.
 *
 * GEOMETRY CONTRACT (identical to rigs.tsx — see docs/POSE-AUDIT.md for why this is written down):
 *   · 120 × 120 canvas, floor at y = 104, side views face RIGHT.
 *   · SVG rotation is clockwise-positive because y grows downward. A positive angle lifts the
 *     LEFT end of a left-to-right figure. Getting this backwards is what once drew a decline
 *     press under an "incline press" label.
 *   · Anything resting on the floor sits AT y = 104, not near it.
 */
import * as React from 'react';
import type { Pose, Pt, Rig } from './types';

const S = { strokeWidth: 2, opacity: 0.5 } as const;
const arrow = (from: Pt, to: Pt, bow = 8) => ({ from, to, bow });

/** A box / step / bench with two legs to the floor. */
function Box({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g {...S}>
      <rect x={x1} y={y} width={x2 - x1} height={4} rx={2} />
      <line x1={x1 + 4} y1={y + 4} x2={x1 + 4} y2={104} />
      <line x1={x2 - 4} y1={y + 4} x2={x2 - 4} y2={104} />
    </g>
  );
}

/** A vertical wall / door frame. */
function Wall({ x, y1 = 12, y2 = 104 }: { x: number; y1?: number; y2?: number }) {
  return <line x1={x} y1={y1} x2={x} y2={y2} strokeWidth={3} opacity={0.45} />;
}

/** Kneeling side-view base facing right: shin flat on the floor, thigh vertical-ish. */
function kneel(extra: Partial<Pose> = {}): Pose {
  return {
    head: [56, 40],
    neck: [54, 49],
    sh: [54, 52],
    el: [56, 64],
    wr: [57, 76],
    hip: [50, 74],
    kn: [50, 92],
    an: [38, 104],
    toe: [32, 104],
    ...extra,
  };
}

/** Supine (on the back) side-view base, head to the LEFT, feet to the RIGHT, spine on the floor. */
function supine(extra: Partial<Pose> = {}): Pose {
  return {
    head: [26, 96],
    neck: [34, 99],
    sh: [38, 100],
    el: [48, 100],
    wr: [58, 100],
    hip: [64, 101],
    kn: [82, 101],
    an: [96, 101],
    toe: [102, 96],
    ...extra,
  };
}

/** Quadruped (hands and knees) base, facing right. */
function quadruped(extra: Partial<Pose> = {}): Pose {
  return {
    head: [76, 58],
    neck: [70, 62],
    sh: [68, 64],
    el: [70, 84],
    wr: [71, 104],
    hip: [42, 64],
    kn: [40, 84],
    an: [38, 104],
    toe: [30, 104],
    ...extra,
  };
}

/** A plank / push-up base: hands and toes on the floor, body one line. */
function plank(extra: Partial<Pose> = {}): Pose {
  return {
    head: [82, 60],
    neck: [76, 63],
    sh: [74, 64],
    el: [76, 84],
    wr: [78, 104],
    hip: [46, 74],
    kn: [32, 90],
    an: [22, 104],
    toe: [16, 100],
    ...extra,
  };
}

/* ══════════════════════════════════════════════════════════ bodyweight strength ══ */

const pikePushUp: Rig = {
  id: 'pike-push-up',
  label: 'Pike push-up',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Top',
      // Inverted V: hips are the HIGHEST point, hands and feet on the floor, torso near-vertical.
      pose: {
        head: [72, 62], neck: [70, 56], sh: [69, 53],
        el: [74, 72], wr: [78, 90],
        hip: [50, 34], kn: [40, 66], an: [32, 96], toe: [24, 100],
      },
      hi: ['arm'],
      arrow: arrow([88, 66], [88, 84], -7),
    },
    {
      caption: 'Head to floor',
      // Elbows bend; the crown travels DOWN between the hands. Hips stay high — that is the
      // difference between a pike push-up and a push-up with the hips creeping up.
      pose: {
        head: [78, 82], neck: [74, 74], sh: [72, 70],
        el: [82, 80], wr: [78, 90],
        hip: [50, 34], kn: [40, 66], an: [32, 96], toe: [24, 100],
      },
      hi: ['arm'],
      arrow: arrow([90, 84], [90, 66], 7),
    },
  ],
};

const pistolSquat: Rig = {
  id: 'pistol-squat',
  label: 'Pistol squat',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Stand',
      pose: {
        head: [54, 22], neck: [52, 31], sh: [52, 34], el: [60, 44], wr: [68, 48],
        hip: [51, 60], kn: [51, 82], an: [51, 104], toe: [61, 104],
        // free leg extended forward, off the floor
        hip2: [51, 60], kn2: [68, 62], an2: [84, 64], toe2: [90, 60],
      },
      hi: ['leg'],
      arrow: arrow([34, 60], [34, 84], -8),
    },
    {
      caption: 'Bottom',
      // Deep: hip below knee, standing shin angled forward, whole foot still down. Free leg stays
      // straight and clear of the floor — that is the exercise.
      pose: {
        head: [40, 54], neck: [40, 62], sh: [40, 65], el: [54, 66], wr: [68, 64],
        hip: [42, 84], kn: [56, 88], an: [51, 104], toe: [61, 104],
        hip2: [42, 84], kn2: [64, 78], an2: [82, 74], toe2: [88, 70],
      },
      hi: ['leg'],
      arrow: arrow([30, 84], [30, 60], 8),
    },
  ],
};

const nordicCurl: Rig = {
  id: 'nordic-curl',
  label: 'Nordic curl',
  view: 'side',
  ground: true,
  scenery: (
    <g {...S}>
      {/* ankle anchor */}
      <rect x={22} y={96} width={16} height={8} rx={2} />
    </g>
  ),
  frames: [
    {
      caption: 'Kneel tall',
      // Straight line from knee to head. Hips LOCKED — bending at the hip is the classic cheat.
      pose: {
        head: [56, 40], neck: [54, 49], sh: [54, 52], el: [58, 62], wr: [60, 72],
        hip: [48, 74], kn: [44, 92], an: [30, 100], toe: [24, 100],
      },
      hi: ['leg'],
      arrow: arrow([74, 56], [88, 84], -10),
    },
    {
      caption: 'Lower slowly',
      // Torso rotates forward about the KNEE, hips still straight, hands ready to catch.
      pose: {
        head: [84, 62], neck: [76, 66], sh: [74, 68], el: [82, 82], wr: [88, 98],
        hip: [56, 78], kn: [44, 92], an: [30, 100], toe: [24, 100],
      },
      hi: ['leg'],
      arrow: arrow([94, 84], [80, 58], 10),
    },
  ],
};

const hollowHold: Rig = {
  id: 'hollow-hold',
  label: 'Hollow hold',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Flatten the back',
      // Lying flat, everything down. The lower back is pressed into the floor FIRST.
      pose: supine(),
      hi: ['torso'],
      arrow: arrow([70, 90], [70, 80], 0),
    },
    {
      caption: 'Hold the dish',
      // Shoulders and legs lift; the lumbar spine stays glued at y=104. Arms overhead past the head.
      pose: {
        head: [26, 86], neck: [34, 91], sh: [38, 93],
        el: [26, 90], wr: [14, 88],
        hip: [64, 101], kn: [82, 96], an: [96, 90], toe: [102, 86],
      },
      hi: ['torso'],
    },
  ],
};

const sidePlank: Rig = {
  id: 'side-plank',
  label: 'Side plank',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Set up',
      // On the side, hips still down: elbow under shoulder, forearm flat on the floor.
      pose: {
        head: [22, 82], neck: [30, 86], sh: [32, 88],
        el: [32, 104], wr: [44, 104],
        hip: [62, 98], kn: [82, 100], an: [98, 102], toe: [104, 98],
      },
      hi: ['torso'],
      arrow: arrow([64, 92], [64, 80], 0),
    },
    {
      caption: 'Hips up',
      // One straight line ear → ankle. Only the forearm and the feet touch the floor.
      pose: {
        head: [20, 74], neck: [28, 80], sh: [30, 82],
        el: [32, 104], wr: [44, 104],
        hip: [62, 90], kn: [82, 97], an: [100, 104], toe: [106, 100],
      },
      hi: ['torso'],
    },
  ],
};

const birdDog: Rig = {
  id: 'bird-dog',
  label: 'Bird dog',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'On all fours',
      pose: quadruped(),
      hi: ['torso'],
    },
    {
      caption: 'Reach opposite',
      // Far arm reaches forward and far leg back, both LEVEL with the torso — not above it,
      // which is what arches the lower back.
      pose: quadruped({
        sh2: [68, 64], el2: [82, 62], wr2: [96, 60],
        hip2: [42, 64], kn2: [26, 62], an2: [12, 60], toe2: [8, 64],
      }),
      hi: ['arm2', 'leg2'],
      arrow: arrow([96, 52], [78, 52], 6),
    },
  ],
};

const wallSit: Rig = {
  id: 'wall-sit',
  label: 'Wall sit',
  view: 'side',
  ground: true,
  scenery: <Wall x={30} />,
  frames: [
    {
      caption: 'Slide down',
      pose: {
        head: [36, 34], neck: [34, 43], sh: [34, 46], el: [44, 54], wr: [54, 58],
        hip: [34, 68], kn: [52, 84], an: [54, 104], toe: [64, 104],
      },
      hi: ['leg'],
      arrow: arrow([20, 56], [20, 74], -6),
    },
    {
      caption: 'Thighs parallel',
      // Knee at 90°, thigh horizontal, shin vertical, back flat on the wall.
      pose: {
        head: [36, 44], neck: [34, 53], sh: [34, 56], el: [46, 62], wr: [58, 62],
        hip: [34, 78], kn: [64, 78], an: [64, 104], toe: [74, 104],
      },
      hi: ['leg'],
    },
  ],
};

const bearCrawl: Rig = {
  id: 'bear-crawl',
  label: 'Bear crawl',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Knees hover',
      // Like a quadruped but the knees are an inch OFF the floor — that is the whole exercise.
      pose: quadruped({ kn: [40, 84], an: [38, 100], toe: [30, 100] }),
      hi: ['torso'],
    },
    {
      caption: 'Step opposite',
      // Opposite hand and foot advance together; hips stay low and level.
      pose: quadruped({
        wr: [82, 104],
        el: [76, 84],
        kn: [46, 84],
        an: [46, 100],
        toe: [38, 100],
      }),
      hi: ['arm', 'leg'],
      arrow: arrow([90, 70], [104, 70], 6),
    },
  ],
};

/* ═════════════════════════════════════════════════════════════════ conditioning ══ */

const burpee: Rig = {
  id: 'burpee',
  label: 'Burpee',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Chest to floor',
      pose: {
        head: [86, 92], neck: [78, 94], sh: [76, 95],
        el: [80, 100], wr: [84, 104],
        hip: [46, 96], kn: [30, 99], an: [16, 102], toe: [10, 98],
      },
      hi: ['arm'],
      arrow: arrow([60, 84], [60, 62], 8),
    },
    {
      caption: 'Jump, hands overhead',
      // Airborne: BOTH feet clear of the floor line, arms fully overhead.
      pose: {
        head: [56, 30], neck: [54, 39], sh: [54, 42],
        el: [52, 30], wr: [50, 18],
        hip: [53, 66], kn: [55, 86], an: [55, 98], toe: [64, 96],
      },
      hi: ['arm', 'leg'],
      arrow: arrow([76, 60], [76, 38], 8),
    },
  ],
};

const thruster: Rig = {
  id: 'thruster',
  label: 'Thruster',
  view: 'front',
  ground: true,
  frames: [
    {
      caption: 'Front squat',
      pose: {
        head: [60, 33], neck: [60, 43], sh: [50, 47], el: [46, 58], wr: [52, 48],
        sh2: [70, 47], el2: [74, 58], wr2: [68, 48],
        hip: [55, 70], hip2: [65, 70], kn: [48, 84], kn2: [72, 84],
        an: [50, 104], an2: [70, 104], toe: [48, 106], toe2: [72, 106],
      },
      hi: ['leg', 'leg2'],
      imp: [52, 45],
      imp2: [68, 45],
      arrow: arrow([88, 60], [88, 30], 8),
    },
    {
      caption: 'Lock out overhead',
      // Elbows straight, load stacked OVER the shoulders, legs fully extended.
      pose: {
        head: [60, 27], neck: [60, 37], sh: [50, 41], el: [48, 28], wr: [48, 15],
        sh2: [70, 41], el2: [72, 28], wr2: [72, 15],
        hip: [55, 62], hip2: [65, 62], kn: [53, 83], kn2: [67, 83],
        an: [52, 104], an2: [68, 104], toe: [50, 106], toe2: [70, 106],
      },
      hi: ['arm', 'arm2'],
      imp: [48, 12],
      imp2: [72, 12],
      arrow: arrow([88, 30], [88, 60], -8),
    },
  ],
};

const boxJump: Rig = {
  id: 'box-jump',
  label: 'Box jump',
  view: 'side',
  ground: true,
  scenery: <Box x1={66} x2={104} y={72} />,
  frames: [
    {
      caption: 'Dip and swing',
      pose: {
        head: [38, 34], neck: [36, 43], sh: [36, 46], el: [26, 54], wr: [18, 62],
        hip: [34, 66], kn: [42, 84], an: [40, 104], toe: [50, 104],
      },
      hi: ['leg'],
      arrow: arrow([54, 60], [72, 44], 10),
    },
    {
      caption: 'Land tall on the box',
      // Standing UPRIGHT on top of the box — the rep is not finished in a deep tuck.
      pose: {
        head: [84, 12], neck: [82, 21], sh: [82, 24], el: [88, 34], wr: [92, 42],
        hip: [81, 44], kn: [82, 58], an: [82, 72], toe: [92, 72],
      },
      hi: ['leg'],
      arrow: arrow([62, 44], [62, 62], -8),
    },
  ],
};

const mountainClimber: Rig = {
  id: 'mountain-climber',
  label: 'Mountain climber',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'High plank',
      pose: plank(),
      hi: ['torso'],
    },
    {
      caption: 'Drive the knee in',
      // One knee travels to the chest; the shoulders stay OVER the hands and the hips stay low.
      pose: plank({
        hip2: [46, 74], kn2: [64, 78], an2: [58, 92], toe2: [52, 96],
      }),
      hi: ['leg2'],
      arrow: arrow([26, 92], [58, 82], 8),
    },
  ],
};

const jumpingJack: Rig = {
  id: 'jumping-jack',
  label: 'Jumping jack',
  view: 'front',
  ground: true,
  frames: [
    {
      caption: 'Feet together',
      pose: {
        head: [60, 21], neck: [60, 31], sh: [50, 35], el: [48, 50], wr: [47, 64],
        sh2: [70, 35], el2: [72, 50], wr2: [73, 64],
        hip: [56, 62], hip2: [64, 62], kn: [57, 83], kn2: [63, 83],
        an: [57, 104], an2: [63, 104], toe: [55, 106], toe2: [65, 106],
      },
      hi: ['arm', 'arm2'],
      arrow: arrow([88, 56], [92, 26], 8),
    },
    {
      caption: 'Out and overhead',
      // Arms all the way overhead (not to shoulder height) and feet wide.
      pose: {
        head: [60, 21], neck: [60, 31], sh: [50, 35], el: [42, 22], wr: [36, 10],
        sh2: [70, 35], el2: [78, 22], wr2: [84, 10],
        hip: [56, 62], hip2: [64, 62], kn: [44, 82], kn2: [76, 82],
        an: [34, 104], an2: [86, 104], toe: [30, 106], toe2: [90, 106],
      },
      hi: ['arm', 'arm2'],
      arrow: arrow([92, 26], [88, 56], -8),
    },
  ],
};

const dbSnatch: Rig = {
  id: 'db-snatch',
  label: 'Dumbbell snatch',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Hinge and grip',
      pose: {
        head: [44, 44], neck: [46, 53], sh: [47, 56], el: [50, 74], wr: [52, 92],
        hip: [36, 66], kn: [46, 84], an: [44, 104], toe: [54, 104],
      },
      hi: ['leg'],
      imp: [52, 96],
      impAngle: 0,
      arrow: arrow([68, 84], [68, 34], 10),
    },
    {
      caption: 'Punch overhead',
      // Hips fully open, elbow locked, weight stacked over the shoulder — not pressed out in front.
      pose: {
        head: [54, 26], neck: [52, 35], sh: [52, 38], el: [52, 26], wr: [52, 13],
        hip: [51, 62], kn: [51, 83], an: [51, 104], toe: [61, 104],
      },
      hi: ['arm'],
      imp: [52, 10],
      impAngle: 0,
      arrow: arrow([70, 34], [70, 84], -10),
    },
  ],
};

const wallBall: Rig = {
  id: 'wall-ball',
  label: 'Wall ball',
  view: 'side',
  ground: true,
  scenery: <Wall x={96} y1={8} y2={104} />,
  frames: [
    {
      caption: 'Squat with the ball',
      pose: {
        head: [42, 48], neck: [42, 57], sh: [42, 60], el: [52, 62], wr: [58, 56],
        hip: [38, 74], kn: [56, 82], an: [52, 104], toe: [62, 104],
      },
      hi: ['leg'],
      imp: [62, 52],
      arrow: arrow([70, 44], [86, 20], 8),
    },
    {
      caption: 'Throw high',
      pose: {
        head: [50, 28], neck: [48, 37], sh: [48, 40], el: [56, 28], wr: [64, 18],
        hip: [47, 62], kn: [47, 83], an: [47, 104], toe: [57, 104],
      },
      hi: ['arm'],
      imp: [72, 14],
      arrow: arrow([86, 20], [70, 44], -8),
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════════ mobility ══ */

const armCircles: Rig = {
  id: 'arm-circles',
  label: 'Arm circles',
  view: 'front',
  ground: true,
  frames: [
    {
      caption: 'Arms out',
      pose: {
        head: [60, 21], neck: [60, 31], sh: [50, 35], el: [38, 35], wr: [26, 35],
        sh2: [70, 35], el2: [82, 35], wr2: [94, 35],
        hip: [55, 62], hip2: [65, 62], kn: [53, 83], kn2: [67, 83],
        an: [52, 104], an2: [68, 104], toe: [50, 106], toe2: [70, 106],
      },
      hi: ['arm', 'arm2'],
      arrow: arrow([26, 30], [26, 14], 10),
    },
    {
      caption: 'Sweep overhead',
      pose: {
        head: [60, 21], neck: [60, 31], sh: [50, 35], el: [44, 22], wr: [40, 10],
        sh2: [70, 35], el2: [76, 22], wr2: [80, 10],
        hip: [55, 62], hip2: [65, 62], kn: [53, 83], kn2: [67, 83],
        an: [52, 104], an2: [68, 104], toe: [50, 106], toe2: [70, 106],
      },
      hi: ['arm', 'arm2'],
      arrow: arrow([30, 12], [24, 32], 10),
    },
  ],
};

const legSwing: Rig = {
  id: 'leg-swing',
  label: 'Leg swing',
  view: 'side',
  ground: true,
  scenery: <Wall x={20} />,
  frames: [
    {
      caption: 'Swing back',
      pose: {
        head: [52, 22], neck: [50, 31], sh: [50, 34], el: [40, 40], wr: [28, 42],
        hip: [49, 60], kn: [49, 82], an: [49, 104], toe: [59, 104],
        hip2: [49, 60], kn2: [36, 74], an2: [26, 88], toe2: [20, 92],
      },
      hi: ['leg2'],
      arrow: arrow([30, 92], [82, 66], 14),
    },
    {
      caption: 'Swing through',
      pose: {
        head: [52, 22], neck: [50, 31], sh: [50, 34], el: [40, 40], wr: [28, 42],
        hip: [49, 60], kn: [49, 82], an: [49, 104], toe: [59, 104],
        hip2: [49, 60], kn2: [66, 60], an2: [84, 58], toe2: [90, 54],
      },
      hi: ['leg2'],
      arrow: arrow([84, 66], [32, 92], -14),
    },
  ],
};

const catCow: Rig = {
  id: 'cat-cow',
  label: 'Cat-cow',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Round (cat)',
      // Spine arches UP toward the ceiling; head and tailbone tuck down.
      pose: quadruped({ head: [78, 68], neck: [72, 68], sh: [68, 64], hip: [42, 64] }),
      hi: ['torso'],
      arrow: arrow([56, 46], [56, 34], -6),
    },
    {
      caption: 'Arch (cow)',
      // Chest forward and tailbone UP; the belly sinks toward the floor.
      pose: quadruped({ head: [80, 50], neck: [73, 56], sh: [68, 60], hip: [42, 58] }),
      hi: ['torso'],
      arrow: arrow([56, 34], [56, 46], 6),
    },
  ],
};

const lungeTwist: Rig = {
  id: 'lunge-twist',
  label: "World's greatest stretch",
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Deep lunge, hands down',
      pose: {
        head: [66, 52], neck: [62, 60], sh: [60, 63], el: [64, 80], wr: [66, 104],
        hip: [44, 76], kn: [70, 82], an: [70, 104], toe: [80, 104],
        hip2: [44, 76], kn2: [28, 92], an2: [16, 104], toe2: [10, 100],
      },
      hi: ['leg2'],
      arrow: arrow([46, 60], [46, 44], -6),
    },
    {
      caption: 'Reach up and open',
      // One hand stays down; the other reaches straight up as the ribs rotate.
      pose: {
        head: [64, 46], neck: [60, 54], sh: [58, 57], el: [62, 78], wr: [64, 104],
        sh2: [58, 57], el2: [56, 40], wr2: [54, 24],
        hip: [44, 76], kn: [70, 82], an: [70, 104], toe: [80, 104],
        hip2: [44, 76], kn2: [28, 92], an2: [16, 104], toe2: [10, 100],
      },
      hi: ['arm2'],
      arrow: arrow([44, 40], [58, 22], 8),
    },
  ],
};

const inchworm: Rig = {
  id: 'inchworm',
  label: 'Inchworm',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Hinge, hands down',
      pose: {
        head: [44, 52], neck: [44, 60], sh: [44, 62], el: [48, 82], wr: [50, 104],
        hip: [36, 70], kn: [38, 88], an: [38, 104], toe: [48, 104],
      },
      hi: ['torso'],
      arrow: arrow([62, 82], [94, 96], 8),
    },
    {
      caption: 'Walk out to a plank',
      pose: plank(),
      hi: ['torso'],
      arrow: arrow([94, 96], [62, 82], -8),
    },
  ],
};

const bandPullApart: Rig = {
  id: 'band-pull-apart',
  label: 'Band pull-apart',
  view: 'front',
  ground: true,
  implement: 'band',
  frames: [
    {
      caption: 'Arms forward',
      pose: {
        head: [60, 21], neck: [60, 31], sh: [50, 35], el: [52, 40], wr: [54, 46],
        sh2: [70, 35], el2: [68, 40], wr2: [66, 46],
        hip: [55, 62], hip2: [65, 62], kn: [53, 83], kn2: [67, 83],
        an: [52, 104], an2: [68, 104], toe: [50, 106], toe2: [70, 106],
      },
      hi: ['arm', 'arm2'],
      imp: [54, 46],
      imp2: [66, 46],
      cableFrom: [54, 46],
      cableFrom2: [66, 46],
      arrow: arrow([40, 40], [22, 40], -6),
    },
    {
      caption: 'Pull apart',
      // Arms stay STRAIGHT and travel wide — bending them turns it into a row.
      pose: {
        head: [60, 21], neck: [60, 31], sh: [50, 35], el: [36, 38], wr: [22, 41],
        sh2: [70, 35], el2: [84, 38], wr2: [98, 41],
        hip: [55, 62], hip2: [65, 62], kn: [53, 83], kn2: [67, 83],
        an: [52, 104], an2: [68, 104], toe: [50, 106], toe2: [70, 106],
      },
      hi: ['arm', 'arm2'],
      imp: [22, 41],
      imp2: [98, 41],
      cableFrom: [22, 41],
      cableFrom2: [98, 41],
      arrow: arrow([22, 40], [40, 40], 6),
    },
  ],
};

const openBook: Rig = {
  id: 'open-book',
  label: 'Open-book rotation',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Arms stacked',
      // On the side, knees bent 90°, both arms straight out together.
      pose: {
        head: [26, 82], neck: [34, 86], sh: [36, 88], el: [52, 88], wr: [68, 88],
        hip: [58, 94], kn: [78, 92], an: [78, 104], toe: [86, 104],
      },
      hi: ['arm'],
      arrow: arrow([70, 82], [34, 74], 12),
    },
    {
      caption: 'Open the chest',
      // Top arm sweeps across; the KNEES STAY DOWN — if they lift, the rotation left the mid-back.
      pose: {
        head: [24, 86], neck: [32, 90], sh: [34, 92], el: [50, 88], wr: [66, 86],
        sh2: [34, 92], el2: [28, 76], wr2: [22, 62],
        hip: [58, 94], kn: [78, 92], an: [78, 104], toe: [86, 104],
      },
      hi: ['arm2'],
      arrow: arrow([34, 74], [70, 82], -12),
    },
  ],
};

/* ══════════════════════════════════════════════════════════ static stretches ══ */

const hamstringStretch: Rig = {
  id: 'hamstring-stretch',
  label: 'Hamstring stretch',
  view: 'side',
  ground: true,
  scenery: <Box x1={72} x2={104} y={84} />,
  frames: [
    {
      caption: 'Heel up, stand tall',
      pose: {
        head: [40, 22], neck: [40, 31], sh: [40, 34], el: [44, 46], wr: [48, 58],
        hip: [40, 62], kn: [40, 83], an: [40, 104], toe: [50, 104],
        hip2: [40, 62], kn2: [58, 74], an2: [76, 84], toe2: [82, 78],
      },
      hi: ['leg2'],
      arrow: arrow([58, 40], [72, 56], 8),
    },
    {
      caption: 'Hinge, back flat',
      // Hinge at the HIP with a straight spine — rounding to reach further stretches the back,
      // not the hamstring.
      pose: {
        head: [58, 40], neck: [52, 45], sh: [50, 47], el: [58, 58], wr: [66, 68],
        hip: [38, 62], kn: [38, 83], an: [38, 104], toe: [48, 104],
        hip2: [38, 62], kn2: [56, 73], an2: [76, 84], toe2: [82, 78],
      },
      hi: ['leg2'],
    },
  ],
};

const hipFlexorStretch: Rig = {
  id: 'hip-flexor-stretch',
  label: 'Hip flexor stretch',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Half kneel',
      pose: {
        head: [50, 40], neck: [48, 49], sh: [48, 52], el: [52, 64], wr: [56, 74],
        hip: [46, 74], kn: [40, 92], an: [28, 104], toe: [22, 104],
        hip2: [46, 74], kn2: [70, 78], an2: [70, 104], toe2: [80, 104],
      },
      hi: ['leg'],
      arrow: arrow([34, 66], [52, 66], 6),
    },
    {
      caption: 'Hips forward, tall',
      // The HIPS travel forward while the torso stays vertical. Leaning back fakes the range.
      pose: {
        head: [56, 38], neck: [54, 47], sh: [54, 50], el: [58, 62], wr: [62, 72],
        hip: [54, 74], kn: [40, 92], an: [28, 104], toe: [22, 104],
        hip2: [54, 74], kn2: [78, 78], an2: [78, 104], toe2: [88, 104],
      },
      hi: ['leg'],
    },
  ],
};

const pigeon: Rig = {
  id: 'pigeon',
  label: 'Pigeon stretch',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Shin across, hips level',
      pose: {
        head: [64, 52], neck: [58, 58], sh: [56, 61], el: [60, 78], wr: [62, 96],
        hip: [44, 82], kn: [66, 92], an: [50, 100], toe: [44, 100],
        hip2: [44, 82], kn2: [26, 96], an2: [12, 102], toe2: [8, 98],
      },
      hi: ['leg2'],
      arrow: arrow([70, 56], [70, 76], -6),
    },
    {
      caption: 'Fold forward',
      pose: {
        head: [80, 82], neck: [72, 82], sh: [68, 83], el: [78, 92], wr: [88, 100],
        hip: [44, 84], kn: [66, 94], an: [50, 100], toe: [44, 100],
        hip2: [44, 84], kn2: [26, 98], an2: [12, 102], toe2: [8, 98],
      },
      hi: ['leg2'],
    },
  ],
};

const childsPose: Rig = {
  id: 'childs-pose',
  label: "Child's pose",
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Kneel and sit back',
      pose: kneel({ hip: [40, 78], kn: [46, 94], an: [34, 104], toe: [28, 104] }),
      hi: ['torso'],
      arrow: arrow([70, 60], [92, 90], 8),
    },
    {
      caption: 'Reach long, chest down',
      // Hips travel BACK to the heels while the hands travel forward — the two directions are
      // what lengthen the lats.
      pose: {
        head: [86, 94], neck: [76, 92], sh: [72, 91], el: [86, 96], wr: [102, 100],
        hip: [40, 84], kn: [50, 96], an: [36, 104], toe: [30, 104],
      },
      hi: ['torso'],
    },
  ],
};

const chestStretch: Rig = {
  id: 'chest-stretch',
  label: 'Doorway chest stretch',
  view: 'front',
  ground: true,
  scenery: (
    <>
      <Wall x={18} />
      <Wall x={102} />
    </>
  ),
  frames: [
    {
      caption: 'Forearms on the frame',
      pose: {
        head: [60, 21], neck: [60, 31], sh: [48, 36], el: [34, 36], wr: [30, 22],
        sh2: [72, 36], el2: [86, 36], wr2: [90, 22],
        hip: [55, 62], hip2: [65, 62], kn: [53, 83], kn2: [67, 83],
        an: [52, 104], an2: [68, 104], toe: [50, 106], toe2: [70, 106],
      },
      hi: ['arm', 'arm2'],
      arrow: arrow([60, 52], [60, 70], -6),
    },
    {
      caption: 'Step through and lean',
      pose: {
        head: [60, 25], neck: [60, 35], sh: [46, 40], el: [32, 38], wr: [28, 24],
        sh2: [74, 40], el2: [88, 38], wr2: [92, 24],
        hip: [55, 66], hip2: [65, 66], kn: [51, 85], kn2: [69, 85],
        an: [50, 104], an2: [70, 104], toe: [48, 106], toe2: [72, 106],
      },
      hi: ['arm', 'arm2'],
    },
  ],
};

const calfStretch: Rig = {
  id: 'calf-stretch',
  label: 'Wall calf stretch',
  view: 'side',
  ground: true,
  scenery: <Wall x={92} />,
  frames: [
    {
      caption: 'Hands on the wall',
      pose: {
        head: [56, 30], neck: [58, 38], sh: [59, 41], el: [72, 42], wr: [86, 42],
        hip: [50, 62], kn: [50, 83], an: [50, 104], toe: [60, 104],
        hip2: [50, 62], kn2: [38, 82], an2: [28, 104], toe2: [38, 104],
      },
      hi: ['leg2'],
      arrow: arrow([40, 66], [58, 66], 6),
    },
    {
      caption: 'Back heel DOWN',
      // The back heel staying on the floor IS the stretch. Letting it lift removes it entirely.
      pose: {
        head: [62, 30], neck: [64, 38], sh: [65, 41], el: [76, 42], wr: [88, 42],
        hip: [58, 62], kn: [60, 83], an: [62, 104], toe: [72, 104],
        hip2: [58, 62], kn2: [40, 80], an2: [24, 104], toe2: [34, 104],
      },
      hi: ['leg2'],
    },
  ],
};

const seatedTwist: Rig = {
  id: 'seated-twist',
  label: 'Seated spinal twist',
  view: 'front',
  ground: true,
  frames: [
    {
      caption: 'Sit tall, foot across',
      pose: {
        head: [60, 26], neck: [60, 36], sh: [50, 40], el: [44, 54], wr: [42, 68],
        sh2: [70, 40], el2: [76, 54], wr2: [78, 68],
        hip: [55, 74], hip2: [65, 74], kn: [40, 82], kn2: [68, 68],
        an: [26, 90], an2: [56, 78], toe: [22, 94], toe2: [52, 82],
      },
      hi: ['torso'],
      arrow: arrow([84, 40], [66, 34], 8),
    },
    {
      caption: 'Rotate, stay tall',
      pose: {
        head: [56, 26], neck: [58, 36], sh: [50, 42], el: [58, 54], wr: [68, 62],
        sh2: [68, 38], el2: [80, 46], wr2: [88, 56],
        hip: [55, 74], hip2: [65, 74], kn: [40, 82], kn2: [68, 68],
        an: [26, 90], an2: [56, 78], toe: [22, 94], toe2: [52, 82],
      },
      hi: ['torso'],
    },
  ],
};

const figureFour: Rig = {
  id: 'figure-four',
  label: 'Figure-four stretch',
  view: 'side',
  ground: true,
  frames: [
    {
      caption: 'Ankle over knee',
      // On the back, head DOWN on the floor — curling up makes it an abdominal effort.
      pose: {
        head: [22, 100], neck: [30, 101], sh: [34, 101], el: [46, 100], wr: [58, 98],
        hip: [56, 100], kn: [76, 82], an: [76, 100], toe: [84, 100],
        hip2: [56, 100], kn2: [62, 78], an2: [80, 76], toe2: [86, 80],
      },
      hi: ['leg2'],
      arrow: arrow([90, 84], [70, 74], 8),
    },
    {
      caption: 'Draw the thigh in',
      pose: {
        head: [22, 100], neck: [30, 101], sh: [34, 101], el: [44, 92], wr: [56, 84],
        hip: [56, 100], kn: [66, 74], an: [72, 92], toe: [80, 94],
        hip2: [56, 100], kn2: [52, 72], an2: [70, 66], toe2: [76, 70],
      },
      hi: ['leg2'],
    },
  ],
};

/* ══════════════════════════════════════════════════════════════════════ export ══ */

export const EXTRA_RIGS: Rig[] = [
  pikePushUp,
  pistolSquat,
  nordicCurl,
  hollowHold,
  sidePlank,
  birdDog,
  wallSit,
  bearCrawl,
  burpee,
  thruster,
  boxJump,
  mountainClimber,
  jumpingJack,
  dbSnatch,
  wallBall,
  armCircles,
  legSwing,
  catCow,
  lungeTwist,
  inchworm,
  bandPullApart,
  openBook,
  hamstringStretch,
  hipFlexorStretch,
  pigeon,
  childsPose,
  chestStretch,
  calfStretch,
  seatedTwist,
  figureFour,
];
