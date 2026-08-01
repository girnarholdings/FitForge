'use client';

import * as React from 'react';

/**
 * THE DRAWN SAMPLE FIGURE for the photo-guidance panel (RESEARCH-VISION §E3) — a stroke-only
 * standing figure in the house icon grammar (1.75 stroke, round caps/joins, `currentColor`,
 * no fills beyond the two the spec names), never a stock photo (owner rule: drawn, food included).
 *
 * What it teaches, wordlessly:
 *  - dashed full-height frame + crown/feet ticks   → "whole body in frame, head to feet"
 *  - light silhouette fill on torso + shorts       → "fitted clothing"
 *  - arms held slightly off the torso, no flexing  → "stand relaxed"
 *  - the blur-block over the face region           → "face hidden is the NORMAL way to do this"
 *  - phone-on-stand glyph + dashed sight-line      → "camera propped at chest height, 2–3 m"
 *
 * No text is baked into the SVG (labels live in HTML for i18n); the figure is `aria-hidden`
 * because the guidance list beside it says everything it draws.
 */
export function AiSampleFigure({
  variant = 'front',
  className,
}: {
  /** same rig, rotated — the face treatment is identical in every variant (spec §E3) */
  variant?: 'front' | 'side';
  className?: string;
}) {
  const side = variant === 'side';
  return (
    <svg
      viewBox="0 0 240 400"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* full-height frame guide with crown + feet ticks */}
      <g opacity={0.4} strokeDasharray="6 6">
        <rect x={58} y={10} width={144} height={380} rx={10} />
      </g>
      <g opacity={0.55}>
        <path d="M58 24h8M194 24h8" />
        <path d="M58 376h8M194 376h8" />
      </g>

      {/* phone propped on a stand, sight-line running to the body */}
      <g>
        <rect x={10} y={164} width={16} height={30} rx={3} />
        <path d="M18 194v10M11 204h14" />
      </g>
      <path d="M30 179h72" strokeDasharray="4 5" opacity={0.45} />

      {/* head as an outline; the face region is a blur-block, NEVER features */}
      <circle cx={130} cy={47} r={22} />
      <rect x={112} y={34} width={36} height={24} rx={7} fill="currentColor" opacity={0.35} stroke="none" />
      <path d="M130 69v12" />

      {side ? (
        <>
          {/* profile: narrower silhouette, both arm lines visible */}
          <path d="M118 81h24l4 96 6 38h-42l6-38Z" fill="currentColor" opacity={0.12} />
          <path d="M126 84 122 150l-4 58" />
          <path d="M136 84l4 66 2 58" />
          <path d="M124 215l-2 86-2 68M138 215l2 86 2 68" />
          <path d="M120 370h-12M142 370h12" />
        </>
      ) : (
        <>
          {/* fitted top + shorts silhouette — the ONE permitted light fill */}
          <path d="M104 88h52l-6 90 6 36h-52l6-36Z" fill="currentColor" opacity={0.12} />
          {/* arms ~20° off the torso, relaxed, palms in */}
          <path d="M104 92l-13 58-13 58" />
          <path d="M156 92l13 58 13 58" />
          {/* legs, feet hip-width on the bottom guide */}
          <path d="M118 214l-4 86-2 68M142 214l4 86 2 68" />
          <path d="M112 370h-14M148 370h14" />
        </>
      )}
    </svg>
  );
}
