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
 *
 * FOCUS IS MANAGED HERE, ONCE, so every sheet in the app inherits it. `aria-modal` is a promise:
 * a screen reader is told the page behind the scrim does not exist, so the keyboard must agree —
 * focus moves INTO the sheet on open, Tab cycles within it while it is up, and focus returns to
 * the control that opened it on close. Initial focus lands on the PANEL itself (`tabIndex={-1}`)
 * rather than the first control, so opening a sheet full of chips never pops a software keyboard
 * or pre-arms a button the athlete has not looked at yet.
 */

/** Everything the keyboard can reach; `tabindex="-1"` holders (the panel itself) excluded. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

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

  React.useEffect(() => {
    if (!open) return;
    // Captured before focus moves anywhere, so close can hand the keyboard back to the trigger.
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The panel mounts in the same commit `open` flips, but under AnimatePresence its first frame
    // is still being set up — a rAF guarantees the node exists and is styled before it is focused.
    // `preventScroll` because the browser would otherwise yank the page toward an element that is
    // mid-slide from off-screen.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      // A child that claimed focus itself (an autoFocus search box) wins — stealing focus back
      // to the panel would blur it, close its popups, and hide the keyboard it asked for.
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      const prevFocus = restoreRef.current;
      restoreRef.current = null;
      // Only if the trigger still exists — accepting an offer can navigate the page away, and
      // focusing a detached node is a silent no-op that strands focus on <body>.
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };
  }, [open]);

  /**
   * Tab containment. The loop spans the whole dialog (scrim close button included, so it stays
   * keyboard-reachable), not just the panel. Focus can also sit on the panel itself right after
   * open — it is not in the FOCUSABLE list, but native Tab order from it already stays inside the
   * dialog, so only the two wrap-around edges need intercepting.
   */
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const root = containerRef.current;
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (focusables.length === 0) {
      e.preventDefault();
      panelRef.current?.focus({ preventScroll: true });
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (active === panelRef.current) {
      // From the panel itself, native forward-Tab would leave the dialog entirely whenever the
      // sheet's content has no focusables (the panel is the container's last element), so both
      // directions are routed by hand: forward to the first control inside the panel, backward
      // to the dialog's last.
      e.preventDefault();
      const firstInPanel = focusables.find((el) => panelRef.current?.contains(el));
      (e.shiftKey ? last : (firstInPanel ?? first)).focus();
      return;
    }
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onKeyDown={onTabKey}
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
            ref={panelRef}
            tabIndex={-1}
            className={cn(
              // `outline-none`: the panel is focusable only as the keyboard's landing point on
              // open — a visible ring around the whole sheet would read as one giant button.
              'relative z-10 max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none',
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
