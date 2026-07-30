import * as React from 'react';

/**
 * Branded empty-state spot illustrations (§4.3).
 *
 * 96px art (muted slate strokes + one gold spark, so empties feel branded, not
 * sad) + title + sub + an optional CTA slot. Each `variant` ships default
 * on-brand copy; consumers may override `title`/`description` (e.g. to match an
 * e2e-load-bearing string) and pass an `action` node for the CTA.
 */
export type EmptyStateVariant =
  | 'no-workouts'
  | 'no-foods-logged'
  | 'no-search-results'
  | 'no-prs-yet'
  | 'no-routines';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: EmptyStateVariant;
  title?: string;
  description?: string;
  /** CTA slot rendered below the text (e.g. a Button). */
  action?: React.ReactNode;
  /** Art size in px (default 96). */
  artSize?: number;
}

const SLATE = 'var(--muted-foreground)';
const GOLD = 'var(--accent)';
const FONT_DISPLAY = 'var(--font-big-shoulders), var(--font-archivo), system-ui, sans-serif';
const FONT_BODY = 'var(--font-archivo), ui-sans-serif, system-ui, sans-serif';

const DEFAULT_COPY: Record<EmptyStateVariant, { title: string; description: string }> = {
  'no-workouts': {
    title: 'The forge is cold',
    description: 'Start today’s session to fire it back up.',
  },
  'no-foods-logged': {
    title: 'Nothing logged yet',
    description: 'Add your first meal to start tracking your day.',
  },
  'no-search-results': {
    title: 'No matches',
    description: 'Try a different search or clear your filters.',
  },
  'no-prs-yet': {
    title: 'No PRs yet',
    description: 'Keep training — your first personal record is coming.',
  },
  'no-routines': {
    title: 'No routines yet',
    description: 'Build a routine or generate one from your plan.',
  },
};

function Art({ variant, size }: { variant: EmptyStateVariant; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 96 96',
    fill: 'none',
    'aria-hidden': true as const,
    xmlns: 'http://www.w3.org/2000/svg',
  };
  switch (variant) {
    case 'no-workouts': // cold anvil + faint spark
      return (
        <svg {...common}>
          <path
            d="M20 70 h34 v-6 h-7 v-11 h20 v17 h6 v9 H20 Z"
            fill="none"
            stroke={SLATE}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M28 53 C16 53 11 57 7 64 L28 65 Z" fill="none" stroke={SLATE} strokeWidth="3" strokeLinejoin="round" />
          <path d="M64 14 L67 24 L77 27 L67 30 L64 40 L61 30 L51 27 L61 24 Z" fill={GOLD} />
        </svg>
      );
    case 'no-foods-logged': // empty plate + fork
      return (
        <svg {...common}>
          <circle cx="42" cy="48" r="26" fill="none" stroke={SLATE} strokeWidth="3" />
          <circle cx="42" cy="48" r="16" fill="none" stroke={SLATE} strokeWidth="2" opacity="0.55" />
          <path d="M76 22 v20 M82 22 v20 M79 42 v32 M76 22 q3 0 6 0" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'no-search-results': // magnifier over dumbbell
      return (
        <svg {...common}>
          <path d="M18 44 v14 M26 38 v26 M56 38 v26 M64 44 v14 M26 51 h30" stroke={SLATE} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="60" cy="60" r="15" fill="none" stroke={GOLD} strokeWidth="3.5" />
          <path d="M71 71 L82 82" stroke={GOLD} strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case 'no-prs-yet': // medal outline
      return (
        <svg {...common}>
          <path d="M36 16 L48 40 M60 16 L48 40" stroke={SLATE} strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="58" r="20" fill="none" stroke={SLATE} strokeWidth="3" />
          <path d="M48 48 L51 55 L58 55 L52 60 L54 67 L48 63 L42 67 L44 60 L38 55 L45 55 Z" fill={GOLD} />
        </svg>
      );
    case 'no-routines': // blueprint scroll
      return (
        <svg {...common}>
          <rect x="24" y="18" width="44" height="60" rx="6" fill="none" stroke={SLATE} strokeWidth="3" />
          <path d="M33 34 h26 M33 45 h26 M33 56 h16" stroke={SLATE} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <path d="M62 60 L68 66 L82 50" fill="none" stroke={GOLD} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function EmptyState({
  variant,
  title,
  description,
  action,
  artSize = 96,
  style,
  ...props
}: EmptyStateProps) {
  const copy = DEFAULT_COPY[variant];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 8,
        padding: '32px 20px',
        ...style,
      }}
      {...props}
    >
      <Art variant={variant} size={artSize} />
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: 18,
          color: 'var(--foreground)',
          marginTop: 4,
        }}
      >
        {title ?? copy.title}
      </div>
      <p
        style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--muted-foreground)',
          maxWidth: 280,
          margin: 0,
        }}
      >
        {description ?? copy.description}
      </p>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
