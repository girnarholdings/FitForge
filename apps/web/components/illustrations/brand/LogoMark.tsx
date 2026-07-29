import * as React from 'react';

/**
 * FitForge "Forge Coach" logo mark.
 *
 * A built figure with a sledgehammer raised — the coach who forges you, rather than the tools on
 * their own. It replaces the anvil-and-barbell mark, which packed a bar, an anvil, two plates and a
 * spark into 64px and at tab-bar size resolved into an unreadable cluster of gold.
 *
 * DRAWN FOR THE SMALLEST SIZE FIRST. Every choice here is about what survives at 16-24px, and each
 * was made by rendering it rather than reasoning about it:
 *   · The DELTS are the widest point, not the chest. Shoulder width alone is what reads as strong;
 *     abdominal detail is invisible below 48px and only muddies the silhouette.
 *   · The raised arm STARTS INSIDE the right delt. An earlier draft left a clean gap between them,
 *     which at small sizes read as a separate floating shape rather than an arm.
 *   · The hammer is a LONG thin handle with a WIDE flat head. A shorter handle and a squarer head
 *     read as a gavel; the proportion is the whole difference.
 *
 * Six shapes, no background — callers place it on their own surface, and public/favicon.svg adds
 * the dark rounded tile for the browser chrome.
 *
 * - Default: the gold gradient (`--gradient-gold` stops).
 * - `mono`: everything inherits `currentColor` (icon/print contexts, footers).
 */
export interface LogoMarkProps extends Omit<React.SVGProps<SVGSVGElement>, 'fill'> {
  size?: number | string;
  /** Monochrome variant — all shapes inherit `currentColor`. */
  mono?: boolean;
  /** Accessible title; when omitted the mark is decorative (`aria-hidden`). */
  title?: string;
}

export function LogoMark({ size = 32, mono = false, title, ...props }: LogoMarkProps) {
  const rid = React.useId();
  const gradId = `ffgold-${rid}`;
  const fill = mono ? 'currentColor' : `url(#${gradId})`;
  const labelled = Boolean(title);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      {...props}
    >
      {!mono && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ECC0A4" />
            <stop offset="0.45" stopColor="#C98963" />
            <stop offset="1" stopColor="#8A5432" />
          </linearGradient>
        </defs>
      )}

      <g fill={fill}>
        {/* Sledgehammer — long thin handle, wide flat head. */}
        <g transform="rotate(30 45 20)">
          <rect x="43" y="10" width="4" height="30" rx="2" />
          <rect x="34" y="4" width="22" height="9" rx="2.5" />
        </g>

        {/* Head. */}
        <circle cx="20" cy="14" r="6.5" />

        {/* Traps and delts: the widest point, and the whole reason the figure reads as built. */}
        <path d="M20 22.5 C11.5 22.5 5.5 26.5 5 33.5 C4.8 36.5 7 38.5 10 38 C12.5 37.6 13.5 35 13.7 32.5 C14 29 16.5 27.5 20 27.5 C23.5 27.5 26 29 26.3 32.5 C26.5 35 27.5 37.6 30 38 C33 38.5 35.2 36.5 35 33.5 C34.5 26.5 28.5 22.5 20 22.5 Z" />

        {/* Chest tapering to a narrow waist. */}
        <path d="M12.5 32 C12.5 30 15 28.5 20 28.5 C25 28.5 27.5 30 27.5 32 L25.5 48 C25.5 50.5 23.5 52 20 52 C16.5 52 14.5 50.5 14.5 48 Z" />

        {/* Raised arm. Overlaps the delt deliberately — see the header note. */}
        <path d="M27 33 C29.5 34.5 32.5 34 35.5 31.5 C38.5 29 41 25.5 42.8 22.5 C44.2 20.2 47.4 21.8 46.2 24.3 C44 29 40.5 33.2 36.5 36 C33 38.4 29.5 38.6 27.5 37 Z" />
      </g>

    </svg>
  );
}

export default LogoMark;
