'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { m, SPRING, PRESS } from './motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * DOM handlers whose names collide with Motion's own callbacks of the same name (Motion's
 * `onAnimationStart` takes an animation *definition*, the DOM's takes an `AnimationEvent`).
 * Dropped from the public surface rather than papered over with a cast — nothing in the app
 * attaches CSS-animation or HTML5-drag handlers to a Button, and a silent type lie here would
 * hand the wrong argument shape to whoever first tried.
 */
type MotionCollidingProps =
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragExit'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDrop';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, MotionCollidingProps> {
  variant?: Variant;
  size?: Size;
  /** stretch to full width — used for the bottom-anchored primary CTA (§1.3) */
  block?: boolean;
  loading?: boolean;
  /**
   * Gold glow (§2.4) — reserved for the ONE hero action on a screen (landing/onboarding primary
   * CTA, active workout's current-set action, PR moments). Never two glows on screen.
   */
  glow?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  // Gold primary: near-black ink text on gold — the highest-contrast, eye-drawing element (§2.1).
  primary:
    'bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-press disabled:opacity-50',
  secondary:
    'bg-surface-2 text-foreground border border-border hover:border-border-strong hover:bg-elevated active:opacity-80 disabled:opacity-50',
  ghost: 'bg-transparent text-foreground hover:bg-surface-2 active:opacity-80 disabled:opacity-50',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-field',
  md: 'h-11 px-4 text-base rounded-field',
  lg: 'h-14 px-6 text-base rounded-field',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, glow, className, children, disabled, ...rest },
  ref,
) {
  const inert = disabled || loading;
  return (
    // The press scale is the app's core "your finger landed" signal — it fires on pointerdown and
    // releases on pointerup, so it reads as connected to the touch rather than to whatever
    // navigation follows. Colour/shadow stay on CSS transitions; only transform is animated here.
    <m.button
      ref={ref}
      disabled={inert}
      whileTap={inert ? undefined : PRESS}
      transition={SPRING.press}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-medium',
        'transition-[opacity,background-color,box-shadow,border-color] duration-150 ease-out',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed touch-manipulation',
        VARIANTS[variant],
        SIZES[size],
        glow && !inert && 'shadow-[var(--shadow-glow)] hover:shadow-[var(--shadow-glow)]',
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </m.button>
  );
});
