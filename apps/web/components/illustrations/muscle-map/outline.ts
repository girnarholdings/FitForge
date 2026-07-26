/**
 * Body silhouette + anatomical detail line-work (§4.1), viewBox `0 0 200 440`.
 *
 * REBUILT (orientation pass). Two things changed and both matter:
 *
 *  1 · The figure is now an **A-pose anatomy plate** — arms abducted away from the ribs — instead
 *      of a narrow standing figure with the arms glued to the torso. The old drawing used only
 *      x 47…153 of a 200-wide box (53 % of it), which is why every muscle rendered as a sliver a
 *      thumb could not hit. The new one uses x 14…186, so at the SAME pixel height every muscle
 *      region is far wider.
 *
 *  2 · `front` and `back` are no longer the same path. A back view genuinely reads as a back:
 *      the skull is a full occiput dropping into a nape (vs. a tapered jaw and chin), the feet
 *      show heels (vs. toes), and the interior line-work is completely different — spine,
 *      scapulae and sacrum instead of clavicles, sternum, ribs, navel and kneecaps.
 *
 * AUTHORING MODEL: every contour is the RIGHT HALF only, drawn from the top of the head down to
 * the crotch on the x = 100 axis. Renderers draw it twice — as authored and mirrored with
 * `scale(-1,1) translate(-200,0)` — so the silhouette is symmetric by construction and there is
 * no second copy of the numbers to keep in sync.
 */

/** The shared viewBox for every muscle-map surface. */
export const VIEW_BOX = { x: 0, y: 0, w: 200, h: 440 } as const;
/** width : height of the figure box — callers size from a height. */
export const BODY_RATIO = VIEW_BOX.w / VIEW_BOX.h;
/** The mirror transform that turns a right-half path into its left twin. */
export const MIRROR_TRANSFORM = 'scale(-1,1) translate(-200,0)';

/* ═══════════════════════════════════════════════════════════════════════ the contours ══ */

/**
 * FRONT — right half: head → shoulder → arm → ribs → hip → leg → foot → back up the inner leg.
 * The skull tapers toward a jaw and the foot is a broad toe-box.
 */
const FRONT_HALF =
  // skull — tapers toward a jaw
  'M100 11 C113 11 122 24 122 42 C122 56 118 65 113 71 ' +
  // neck
  'C110 74 107 76 106 80 ' +
  // trapezius yoke → acromion
  'C119 84 136 92 148 104 ' +
  // deltoid cap
  'C157 112 162 122 162 136 ' +
  // upper arm, abducted clear of the ribs
  'C163 156 168 178 172 200 ' +
  // forearm
  'C176 218 180 240 182 258 ' +
  // hand
  'C184 272 183 288 177 295 C171 302 164 300 162 292 ' +
  'C160 284 159 274 158 264 ' +
  // forearm, inner edge
  'C156 242 155 220 152 201 ' +
  // upper arm, inner edge
  'C148 180 144 156 141 138 ' +
  // armpit
  'C140 131 138 126 134 124 ' +
  // ribs → waist
  'C132 139 128 154 127 168 ' +
  // hip flare
  'C126 182 130 194 133 204 C135 212 136 220 136 228 ' +
  // thigh → knee
  'C136 248 133 268 130 288 C128 300 127 308 126 316 ' +
  'C125 324 124 330 124 336 ' +
  // calf belly → ankle
  'C127 348 124 364 119 378 C117 388 115 398 114 407 ' +
  // foot — toes toward the viewer: a broad, rounded toe-box
  'C116 415 119 422 120 426 C120 431 116 433 110 433 L105 433 ' +
  'C102 433 101 429 102 423 L107 409 ' +
  // inner shin
  'C108 391 108 369 107 351 ' +
  // inner knee
  'C107 337 106 325 106 316 ' +
  // inner thigh → crotch
  'C105 288 102 254 100 228';

/**
 * BACK — right half. Fuller occiput that drops lower into the nape, and a short blunt heel
 * instead of a toe-box. Everything between is the same body.
 */
const BACK_HALF =
  // skull — full, round occiput, no jaw taper
  'M100 11 C114 11 124 25 124 45 C124 60 119 70 114 76 ' +
  // nape
  'C111 78 107 78 106 82 ' +
  'C119 86 136 93 148 104 ' +
  'C157 112 162 122 162 136 ' +
  'C163 156 168 178 172 200 ' +
  'C176 218 180 240 182 258 ' +
  // back of the hand — blunter than the fingers
  'C184 272 183 287 178 294 C172 301 164 299 162 291 ' +
  'C160 284 159 274 158 264 ' +
  'C156 242 155 220 152 201 ' +
  'C148 180 144 156 141 138 ' +
  'C140 131 138 126 134 124 ' +
  'C132 139 128 154 127 168 ' +
  'C126 182 130 194 133 204 C135 212 136 220 136 228 ' +
  'C136 248 133 268 130 288 C128 300 127 308 126 316 ' +
  'C125 324 124 330 124 336 ' +
  'C127 348 124 364 119 378 C117 388 115 398 114 407 ' +
  // heel — short, rounded, no toes
  'C117 415 119 423 117 429 C114 434 107 434 104 428 L106 409 ' +
  'C108 391 108 369 107 351 ' +
  'C107 337 106 325 106 316 ' +
  'C105 288 102 254 100 228';

/**
 * The right-half silhouette contour per view. Draw twice: as authored, and with
 * {@link MIRROR_TRANSFORM}. (Type-compatible with the previous full-path export.)
 */
export const BODY_OUTLINE: { front: string; back: string } = {
  front: FRONT_HALF,
  back: BACK_HALF,
};

/* ══════════════════════════════════════════════════════════════ orientation line-work ══ */

export interface DetailPath {
  d: string;
  /** `right` is mirrored to the left; `center` is drawn once */
  side: 'right' | 'center';
  /** relative stroke weight — 1 = hairline detail, 1.6 = a landmark worth reading */
  weight?: number;
  /** landmarks (spine, chin, hairline) stay legible at thumbnail size */
  key?: boolean;
}

/**
 * FRONT tells — every one of these is impossible on a back:
 * a jaw and chin, collarbones, a sternum, rib arcs, a navel, kneecaps, toes.
 */
export const FRONT_DETAILS: DetailPath[] = [
  // jaw + chin — curves DOWN toward the viewer
  { d: 'M90 56 C92 67 95 74 100 75 C105 74 108 67 110 56', side: 'center', weight: 1.5, key: true },
  // clavicles from the sternal notch out to the acromion
  { d: 'M102 90 C113 88 128 94 141 103', side: 'right', weight: 1.5, key: true },
  // sternum
  { d: 'M100 93 L100 136', side: 'center', weight: 1.2 },
  // rib arcs under the pecs
  { d: 'M102 141 C113 145 121 152 125 162', side: 'right', weight: 1 },
  { d: 'M102 153 C111 157 117 163 120 171', side: 'right', weight: 0.9 },
  // navel
  { d: 'M97.6 180 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0', side: 'center', weight: 1.2 },
  // kneecaps
  { d: 'M109 314 C113 309 120 309 123 315 C120 322 112 322 109 314 Z', side: 'right', weight: 1.1 },
  // toes
  { d: 'M106 427 L119 427', side: 'right', weight: 1 },
];

/**
 * BACK tells — a spine, shoulder blades, a sacrum triangle, a glute cleft, knee creases,
 * achilles cords, and a hairline that curves UP (the exact opposite of the chin).
 */
export const BACK_DETAILS: DetailPath[] = [
  // hairline across the nape — a STRAIGHT horizontal, the exact opposite read of the front's
  // V-shaped chin. Straight-vs-V survives every size this figure is drawn at.
  { d: 'M88 58 L112 58', side: 'center', weight: 1.7, key: true },
  { d: 'M92 66 L108 66', side: 'center', weight: 1.1, key: true },
  // spine — vertebral segments, the single loudest "this is a back" cue
  {
    d:
      'M100 90 L100 103 M100 109 L100 122 M100 128 L100 141 M100 147 L100 160 ' +
      'M100 166 L100 179 M100 185 L100 200',
    side: 'center',
    weight: 1.8,
    key: true,
  },
  // scapula wings
  { d: 'M105 110 L127 124 L120 152', side: 'right', weight: 1.4, key: true },
  // sacrum triangle
  { d: 'M92 207 L108 207 L100 223 Z', side: 'center', weight: 1.1 },
  // glute cleft
  { d: 'M100 226 L100 254', side: 'center', weight: 1.3 },
  // popliteal (knee) creases
  { d: 'M107 313 C113 319 119 319 123 313', side: 'right', weight: 1.1 },
  // achilles cords
  { d: 'M110 388 L109 407', side: 'right', weight: 1 },
];

export const BODY_DETAILS: Record<'front' | 'back', DetailPath[]> = {
  front: FRONT_DETAILS,
  back: BACK_DETAILS,
};

/**
 * Decorative rectus-abdominis crosslines (the "wall"), drawn over the abs fill in the front view.
 * Kept as its own export because `MuscleMap` paints it above the muscle layer.
 */
export const ABS_CROSSLINES =
  'M100 144 L100 210 M90 161 L110 161 M90 178 L110 178 M91 195 L109 195';
