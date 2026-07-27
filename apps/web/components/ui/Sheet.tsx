'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { AnimatePresence, m, SPRING } from './motion';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Mobile-first bottom sheet (substitute picker, muscle filter, serving picker, §2.2/§2.3).
 *
 * The sheet SLIDES UP from the bottom edge and the scrim fades with it. That is not decoration:
 * a panel that simply appears reads as the page having been replaced, while one that travels in
 * from the bottom reads as a layer covering a page that is still there — which is exactly the
 * mental model needed for "close this and I am back where I was".
 *
 * The exit is faster than the entrance (spring in, short tween out) because dismissal should feel
 * immediate; waiting for a bouncy spring to unwind before your content returns is the commonest
 * way sheets end up feeling sluggish.
 *
 * `AnimatePresence` is what makes the exit possible at all — the sheet stays mounted until it has
 * finished leaving, instead of vanishing the moment `open` flips.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <m.button
            aria-label="Close"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <m.div
            className={cn(
              'relative z-10 max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl',
              'sm:rounded-3xl',
              className,
            )}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0, transition: { duration: 0.16, ease: 'easeIn' } }}
            transition={SPRING.sheet}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden />
            {title && <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>}
            {children}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
