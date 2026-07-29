import * as React from 'react';
import { LogoMark } from './LogoMark';

/**
 * FitForge wordmark lockups (§3.1 / §3.2).
 *
 * "FitForge" set in Space Grotesk SemiBold, tracking -0.01em: "Fit" in ivory
 * `--foreground`, "Forge" in the gold text gradient (`.text-gradient-gold`,
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
  'var(--font-space-grotesk), var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif';

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
        <span className="text-gradient-gold">Forge</span>
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
 * The mark on its plate — the exact composition the favicon renders (dark #0A0D14 rounded square,
 * gold-gradient figure), so every surface that shows the mark shows the SAME object as the
 * browser tab. The hairline gold ring is what keeps it legible on same-tone dark headers.
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
        background: '#0a0d14',
        boxShadow:
          '0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 4px 14px -4px rgba(228, 184, 77, 0.4)',
      }}
    >
      {/* The mark carries its own gold gradient; the plate only frames it. */}
      <span style={{ display: 'grid' }}>
        <LogoMark size={size * 0.72} aria-hidden />
      </span>
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
            'linear-gradient(105deg, transparent 0%, rgba(246, 216, 131, 0.35) 50%, transparent 100%)',
        }}
      />
    </span>
  );
}

export default LogoLockup;
