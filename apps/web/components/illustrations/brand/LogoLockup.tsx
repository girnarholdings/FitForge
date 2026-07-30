import * as React from 'react';
import { LogoMark } from './LogoMark';
import { withBase } from '@/lib/utils';

/**
 * FitForge wordmark lockups (§3.1 / §3.2).
 *
 * "FitForge" set in Space Grotesk SemiBold, tracking -0.01em: "Fit" in ivory
 * `--foreground`, "Forge" in solid copper (`text-accent-soft` — gradient text was
 * defined in globals.css). Never letter-spaced wide — it's machined, not
 * fashion.
 *
 * - horizontal (default): mark + wordmark on one line, gap = one plate-width.
 * - stacked: mark centered above the wordmark (onboarding welcome, OG).
 * - `mono`: the mark uses `currentColor` and the whole wordmark inherits the
 *   surrounding text color (both words), for single-color contexts.
 */
export interface LogoLockupProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'title'> {
  /** Mark height in px (the wordmark scales from it). */
  size?: number;
  stacked?: boolean;
  mono?: boolean;
  /**
   * Render the mark on its APP-ICON PLATE — dark rounded square, gold gradient figure, hairline
   * gold ring — instead of as a bare glyph. On by default because the bare glyph was the bug:
   * the browser tab showed the plated icon while the page header showed a flat gold shape, and
   * they read as two different products. The favicon is the identity; headers now wear it.
   */
  badge?: boolean;
  title?: string;
}

const FONT_STACK =
  'var(--font-big-shoulders), var(--font-archivo), ui-sans-serif, system-ui, -apple-system, sans-serif';

export function LogoLockup({
  size = 24,
  stacked = false,
  mono = false,
  badge = true,
  title = 'FitForge',
  style,
  ...props
}: LogoLockupProps) {
  // Mark reads a touch larger than cap-height so it balances the wordmark.
  const markSize = stacked ? size * 1.9 : size * 1.35;
  const fontSize = size;
  const gap = stacked ? size * 0.42 : markSize * (6 / 64) + size * 0.18;

  const wordmark = (
    <span
      style={{
        fontFamily: FONT_STACK,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        fontSize,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: mono ? 'inherit' : 'var(--foreground)' }}>Fit</span>
      {mono ? (
        <span>Forge</span>
      ) : (
        <span className="text-accent-soft">Forge</span>
      )}
    </span>
  );

  return (
    <span
      role="img"
      aria-label={title}
      style={{
        display: 'inline-flex',
        flexDirection: stacked ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
        ...style,
      }}
      {...props}
    >
      {badge && !mono ? <BrandBadge size={markSize} /> : <LogoMark size={markSize} mono={mono} aria-hidden />}
      {wordmark}
    </span>
  );
}

/**
 * The mark on its plate — now the SHIELD EMBLEM itself, cropped from the brand artwork and
 * compacted (public/brand-emblem.png, generated from the master logo; the icon set is cut from
 * the same crop, so the browser tab, the home-screen icon and every header show the same object).
 *
 * A raster where everything else is vector, on purpose: the emblem is illustrated metalwork —
 * two figures at an anvil with a lit forge — and a traced SVG of it would either weigh more than
 * the PNG or flatten exactly the material quality that made it worth adopting. At the 24–44px
 * this renders, a 192px source is 4x+ oversampled and stays crisp on any screen. The plate keeps
 * the hairline copper ring so it stays legible on same-tone dark headers, and the whole thing is
 * sized identically to the old badge — the nav bar does not grow a pixel.
 */
export function BrandBadge({ size = 28 }: { size?: number }) {
  const radius = Math.max(5, Math.round(size * 0.24));
  return (
    <span
      aria-hidden
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: radius,
        background: '#0b121a',
        boxShadow:
          '0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 4px 14px -4px rgba(226, 112, 58, 0.4)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer */}
      <img
        src={withBase('/brand-emblem.png')}
        alt=""
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* One glint across the plate on mount — freshly-struck metal, once, then still. The
          ff-shimmer keyframe ends at opacity 0 and fill-mode holds it there, so this costs one
          paint on app open and nothing after (and nothing at all under reduced motion). */}
      <span
        className="ff-shimmer"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '55%',
          pointerEvents: 'none',
          background:
            'linear-gradient(105deg, transparent 0%, rgba(236, 192, 164, 0.35) 50%, transparent 100%)',
        }}
      />
    </span>
  );
}

export default LogoLockup;
