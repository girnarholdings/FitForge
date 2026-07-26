/**
 * Per-muscle path data (§4.1), redrawn for the A-pose anatomy plate in `outline.ts`.
 *
 * Author only RIGHT-half (`side:'right'`) or centred (`side:'center'`) shapes; renderers
 * auto-mirror `right` shapes with `scale(-1,1) translate(-200,0)`, so symmetry is free.
 * Multi-region muscles (quads, hamstrings, calves) are several `MusclePath` entries under one
 * slug. viewBox `0 0 200 440`, symmetric about x = 100.
 *
 * WHY THE REDRAW: with the arms abducted and the figure filling the box, every region is larger
 * and — critically — the front and back plates no longer look like each other. Front carries
 * pecs/abs/quads reading as a chest-and-belly; back carries a trapezius yoke, lat wings, an
 * erector column and glutes reading as a back.
 */
import type { MuscleSlug, MusclePath, MuscleView } from './types';

export const MUSCLE_PATHS: Record<MuscleSlug, MusclePath[]> = {
  /* ---------------------------------------------------------------- upper torso / shoulders */
  traps: [
    // front: the visible collar sliver from neck to acromion
    {
      view: 'front',
      side: 'right',
      d: 'M101 82 C114 86 132 93 146 104 L140 115 C127 102 113 94 101 92 Z',
    },
    // back: the full trapezius yoke — a kite from the nape out to both acromions and down
    // between the shoulder blades. The single most back-looking shape on the figure.
    {
      view: 'back',
      side: 'right',
      d: 'M101 82 C118 87 135 94 148 104 C141 116 131 128 120 137 C113 143 106 149 101 154 Z',
    },
  ],
  pecs: [
    {
      view: 'front',
      side: 'right',
      d: 'M104 95 L130 110 C133 118 133 128 130 135 C121 141 112 143 104 143 Z',
    },
  ],
  'front-delts': [
    {
      view: 'front',
      side: 'right',
      d: 'M139 100 C147 105 154 115 156 130 C157 141 156 151 154 158 C147 149 142 136 138 119 C137 111 137 104 139 100 Z',
    },
  ],
  'side-delts': [
    {
      view: 'front',
      side: 'right',
      d: 'M148 106 C156 113 161 124 162 137 C162 148 161 156 159 162 L154 158 C157 147 156 130 150 117 C148 112 147 108 148 106 Z',
    },
    {
      view: 'back',
      side: 'right',
      d: 'M148 106 C156 113 161 124 162 137 C162 148 161 156 159 162 L154 158 C157 147 156 130 150 117 C148 112 147 108 148 106 Z',
    },
  ],
  'rear-delts': [
    {
      view: 'back',
      side: 'right',
      d: 'M139 100 C148 105 155 116 157 131 C158 142 157 152 155 159 C148 150 143 137 139 120 C137 111 137 104 139 100 Z',
    },
  ],
  rhomboids: [
    {
      view: 'back',
      side: 'right',
      d: 'M101 156 C108 154 115 158 119 165 C120 174 118 184 114 191 L101 193 Z',
    },
  ],
  lats: [
    {
      view: 'back',
      side: 'right',
      d: 'M134 125 C133 143 131 158 129 172 C128 186 124 197 117 204 C110 200 105 190 107 176 C111 156 120 136 127 126 Z',
    },
  ],
  'lower-back': [
    {
      view: 'back',
      side: 'right',
      d: 'M100 190 C106 190 110 196 111 205 C111 216 109 225 106 231 L100 231 Z',
    },
  ],

  /* ------------------------------------------------------------------------------ arms */
  biceps: [
    {
      view: 'front',
      side: 'right',
      d: 'M145 148 C152 145 159 150 161 161 C163 174 164 189 163 201 L153 203 C151 187 148 165 145 154 Z',
    },
  ],
  triceps: [
    {
      view: 'back',
      side: 'right',
      d: 'M144 146 C152 143 158 149 160 160 C163 174 164 189 163 202 L153 204 C151 188 147 163 144 152 Z',
    },
  ],
  forearms: [
    {
      view: 'front',
      side: 'right',
      d: 'M155 208 C163 205 170 211 173 221 C178 237 181 253 181 265 C180 273 176 277 171 276 C167 261 161 234 155 215 Z',
    },
    {
      view: 'back',
      side: 'right',
      d: 'M155 208 C163 205 170 211 173 221 C178 237 181 253 181 265 C180 273 176 277 171 276 C167 261 161 234 155 215 Z',
    },
  ],

  /* ------------------------------------------------------------------------------ core */
  abs: [
    {
      view: 'front',
      side: 'center',
      d: 'M86 143 L114 143 C116 162 115 182 113 198 C111 209 106 216 100 218 C94 216 89 209 87 198 C85 182 84 162 86 143 Z',
    },
  ],
  obliques: [
    {
      view: 'front',
      side: 'right',
      d: 'M115 148 C122 152 126 160 127 171 C128 184 125 196 119 204 C115 198 113 186 114 171 Z',
    },
  ],
  'hip-flexors': [
    {
      view: 'front',
      side: 'right',
      d: 'M101 204 C111 207 119 213 124 221 L118 233 C112 225 106 219 101 216 Z',
    },
  ],

  /* ---------------------------------------------------------------------------- glutes */
  'glute-max': [
    {
      view: 'back',
      side: 'right',
      d: 'M100 214 C113 212 126 218 132 229 C135 240 133 253 126 261 C117 266 106 264 100 258 Z',
    },
  ],
  'glute-med': [
    {
      view: 'back',
      side: 'right',
      d: 'M124 198 C131 202 135 210 135 219 C135 226 133 232 130 234 C126 226 123 215 122 204 Z',
    },
  ],

  /* ------------------------------------------------------------------------------ legs */
  quads: [
    // rectus femoris (centre of the thigh)
    {
      view: 'front',
      side: 'right',
      d: 'M112 240 C120 239 126 246 126 258 C126 278 124 298 119 314 C114 317 110 315 109 308 C109 284 110 260 112 240 Z',
    },
    // vastus lateralis (outer sweep)
    {
      view: 'front',
      side: 'right',
      d: 'M127 242 C132 248 134 257 134 268 C133 286 130 302 126 313 L120 311 C124 294 126 272 126 254 Z',
    },
    // vastus medialis (the teardrop above the inner knee)
    {
      view: 'front',
      side: 'right',
      d: 'M108 282 C114 281 120 287 121 297 C121 307 119 316 115 320 C110 319 107 313 107 304 C107 295 107 287 108 282 Z',
    },
  ],
  adductors: [
    {
      view: 'front',
      side: 'right',
      d: 'M100 234 C107 235 112 244 112 256 C112 271 109 287 105 297 C102 298 100 296 100 291 Z',
    },
  ],
  hamstrings: [
    // biceps femoris (outer)
    {
      view: 'back',
      side: 'right',
      d: 'M121 262 C128 261 133 268 133 278 C132 292 129 304 125 314 L119 312 C121 297 121 279 121 262 Z',
    },
    // semitendinosus / semimembranosus (inner)
    {
      view: 'back',
      side: 'right',
      d: 'M106 262 C112 260 118 264 119 272 C119 287 117 301 114 314 L107 314 C105 298 105 280 106 262 Z',
    },
  ],
  calves: [
    // gastrocnemius, lateral head
    {
      view: 'back',
      side: 'right',
      d: 'M113 332 C120 335 124 345 124 357 C123 371 120 384 117 393 L113 390 C114 371 113 350 113 332 Z',
    },
    // gastrocnemius medial head / soleus
    {
      view: 'back',
      side: 'right',
      d: 'M107 334 C112 334 115 344 115 356 C115 372 113 386 110 395 C108 394 107 386 107 374 C107 356 107 344 107 334 Z',
    },
  ],
};

/**
 * How far (in viewBox units) a muscle's INVISIBLE hit shape is grown beyond its painted shape.
 * Slivers — the trapezius collar, the lateral delt, the hip abductor — get the most, because a
 * thumb is ~44 px wide and those shapes are ~10 units of a 200-unit-wide body.
 *
 * Renderers apply it as a transparent stroke of `2 × pad` on a copy of the path, so the hit area
 * grows on every side without changing the artwork.
 */
export const DEFAULT_HIT_PAD = 7;
export const MUSCLE_HIT_PAD: Partial<Record<MuscleSlug, number>> = {
  traps: 9,
  'side-delts': 9,
  'front-delts': 8,
  'rear-delts': 8,
  'glute-med': 9,
  'hip-flexors': 9,
  rhomboids: 8,
  'lower-back': 8,
  adductors: 6,
  obliques: 7,
};

/**
 * Painted-area rank (largest first) — the hit layer is stacked in this order so a SMALL muscle's
 * padded hit shape always wins where it overlaps a big neighbour. Hand-ordered rather than
 * computed, because measuring path area needs a DOM.
 */
export const MUSCLE_HIT_ORDER: MuscleSlug[] = [
  'traps',
  'lats',
  'glute-max',
  'quads',
  'hamstrings',
  'abs',
  'pecs',
  'calves',
  'triceps',
  'biceps',
  'forearms',
  'rhomboids',
  'obliques',
  'adductors',
  'lower-back',
  'front-delts',
  'rear-delts',
  'hip-flexors',
  'glute-med',
  'side-delts',
];

/** Representative anchor point per muscle per view for leader-line labels (right-side/center). */
export const MUSCLE_LABEL_ANCHORS: Partial<Record<MuscleSlug, Partial<Record<MuscleView, [number, number]>>>> = {
  traps: { front: [124, 96], back: [124, 112] },
  pecs: { front: [119, 118] },
  'front-delts': { front: [147, 130] },
  'side-delts': { front: [157, 138], back: [157, 138] },
  'rear-delts': { back: [148, 130] },
  rhomboids: { back: [111, 174] },
  lats: { back: [124, 164] },
  'lower-back': { back: [106, 212] },
  biceps: { front: [156, 176] },
  triceps: { back: [156, 176] },
  forearms: { front: [170, 244], back: [170, 244] },
  abs: { front: [100, 178] },
  obliques: { front: [122, 178] },
  'hip-flexors': { front: [111, 218] },
  'glute-max': { back: [118, 236] },
  'glute-med': { back: [132, 216] },
  quads: { front: [118, 276] },
  adductors: { front: [106, 270] },
  hamstrings: { back: [119, 288] },
  calves: { back: [115, 362] },
};
