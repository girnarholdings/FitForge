import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** raise emphasis with the accent ring — used for selected states */
  selected?: boolean;
  interactive?: boolean;
  /**
   * "Forged" container (§2.4) — gold gradient hairline border. Reserved for the plan-preview card,
   * PR cards, and the Today hero card. Provides its own surface-2 fill, so it replaces the default
   * border/background.
   */
  premium?: boolean;
  /**
   * MACHINED-METAL surface: a top-lit vertical gradient plus a 1px inner highlight, so the card
   * reads as a milled faceplate rather than as paper.
   *
   * Deliberately rationed to the two STRUCTURAL surfaces that anchor a screen (the Today hero, the
   * workout player's set card). Two of these is enough to shift the whole app's material feel;
   * putting it on every card would flatten the premium/standard hierarchy that already does real
   * work. Mutually exclusive with `premium` — a card is either forged gold or machined steel.
   *
   * KNOWN AND ACCEPTED: on the light Ivory theme `--elevated` and `--surface-2` are both #ffffff,
   * so the gradient renders as a flat no-op and only the inner highlight survives. That is the
   * right answer, not a bug — a steel gradient on an ivory sheet would read as a smudge.
   */
  variant?: 'steel';
}

export function Card({ selected, interactive, premium, variant, className, ...rest }: CardProps) {
  const steel = variant === 'steel' && !premium;
  return (
    <div
      className={cn(
        'rounded-card p-4 shadow-[var(--shadow-card)]',
        // fill + border: gradient hairline when premium, otherwise the standard surface treatment
        premium ? 'border-gradient-gold' : 'bg-surface-2 border',
        steel &&
          'bg-[linear-gradient(180deg,var(--elevated)_0%,var(--surface-2)_22%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),var(--shadow-card)]',
        !premium && (selected ? 'border-accent' : 'border-border'),
        selected && 'ring-2 ring-accent',
        interactive &&
          'cursor-pointer transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-foreground', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-sm text-muted-foreground', className)} {...rest} />;
}
