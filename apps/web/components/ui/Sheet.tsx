'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from 'motion/react';
import { useDragDismiss } from './useDragDismiss';

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
 * IT IS DRAGGABLE, and that is the point of the grabber pill at the top. See
 * {@link useDragDismiss} for the physics: 1:1 tracking, rubber-banding at the top edge, momentum
 * projection on release, velocity handoff into the settle, and an interrupt that starts from the
 * live on-screen position. For a year the pill was drawn and nothing was behind it.
 *
 * MOUNTING IS MANAGED HERE RATHER THAN BY `AnimatePresence`, because the panel's travel is owned
 * by the drag layer. Two systems writing `transform` on the same node is how a grabbed sheet ends
 * up jumping: the drag writes a live offset, then the exit animation restarts from the value the
 * animation library still believes is current. One owner, no jumps. The scrim keeps its own plain
 * CSS transition — its opacity is never something the finger drives directly, except during a
 * drag, where the drag layer fades it in lockstep with the sheet.
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

/** Below this the sheet is a bottom sheet and drags; above it, a centred dialog and does not. */
const DRAGGABLE_MAX_WIDTH = 640;

export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion() ?? false;

  /**
   * The panel outlives `open` by the length of its exit, so mounting is its own state. `shown`
   * is what the scrim's CSS transition keys off — it flips a frame after mount so there is an
   * off→on change to animate rather than an element that was simply born opaque.
   */
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);

  // Mounted in the SAME COMMIT that `open` flips, by adjusting state during render rather than
  // from an effect. This is not a style preference: the focus effect schedules a rAF to move the
  // keyboard into the panel, and an effect-driven mount can commit AFTER that frame — the rAF then
  // finds no panel, focus never enters, and an `aria-modal` dialog is left telling a screen reader
  // the page behind does not exist while the keyboard is still standing on it.
  if (open && !mounted) setMounted(true);

  const [draggable, setDraggable] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${DRAGGABLE_MAX_WIDTH - 1}px)`);
    const sync = () => setDraggable(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const drag = useDragDismiss({ onDismiss: onClose, enabled: draggable && mounted, reduced });
  const panelRef = drag.ref;

  // The exit. `open` has already gone false, but the panel stays mounted for the length of its
  // travel so it can leave the way it arrived instead of blinking out.
  const { animateIn, animateOut } = drag;
  React.useEffect(() => {
    if (open || !mounted) return;
    setShown(false);
    let live = true;
    animateOut(() => {
      if (live) setMounted(false);
    });
    return () => {
      live = false;
    };
  }, [open, mounted, animateOut]);

  // The entrance runs in a layout effect so the panel is already parked below the fold before the
  // browser paints — starting it in a passive effect shows one frame of the sheet at rest first,
  // which is the flash that makes a sheet look like it teleported in and then decided to animate.
  React.useLayoutEffect(() => {
    if (!mounted || !open) return;
    animateIn();
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted, open, animateIn]);

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
    // The panel mounts in the same commit `open` flips, but the entrance has only just parked it
    // below the fold — a rAF guarantees the node exists and is positioned before it is focused.
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

  if (!mounted) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={onTabKey}
      /* A sheet is a layer OVER the screen, so nothing inside it belongs to the screen's own
         gestures. Without this, dragging a sheet on Nutrition also swipes the day underneath it. */
      data-no-swipe-nav
    >
      <button
        ref={drag.scrimRef as React.RefObject<HTMLButtonElement>}
        aria-label="Close"
        className={cn(
          'ff-sheet-scrim absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200',
          shown ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="sheet-panel"
        onPointerDown={drag.onPointerDown}
        className={cn(
          // `outline-none`: the panel is focusable only as the keyboard's landing point on
          // open — a visible ring around the whole sheet would read as one giant button.
          'relative z-10 max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none',
          'sm:rounded-3xl',
          // A claimed drag calls preventDefault on move; telling the browser up front that this
          // surface handles its own vertical panning is what stops iOS starting a rubber-band
          // page scroll in the same gesture.
          draggable && 'touch-pan-y overscroll-contain',
          className,
        )}
      >
        {/* The grabber. `sm:hidden` because above the phone breakpoint this is a centred dialog
            with nothing to drag — and an affordance for a gesture that is switched off is exactly
            the lie this whole change existed to remove. */}
        <div
          data-testid="sheet-grabber"
          className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden"
          aria-hidden
        />
        {title && <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
