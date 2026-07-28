'use client';

/**
 * FLOATING TAB BAR — the mobile primary navigation.
 *
 * Two things this fixes about the edge-to-edge bar it replaces.
 *
 * SCROLL COST. The old bar was a full-bleed `backdrop-blur-lg` strip pinned to the bottom of the
 * viewport. `backdrop-filter` forces the compositor to re-sample everything behind the element on
 * every frame the backdrop moves — i.e. on every frame of every scroll — and the nutrition screen
 * stacked THREE of them (top bar, this, and the composer). That is the jank: the work scales with
 * blurred area, and three full-width layers is most of the screen. This bar is opaque, so the
 * compositor can treat it as a plain quad and skip the backdrop read entirely.
 *
 * REACHABILITY. Detaching the bar from the edges shortens the row so every tab sits closer to the
 * thumb's arc, and it stops the bar reading as a wall across the bottom of the app.
 *
 * The long-press gesture is an ACCELERATOR, never the only way through: each tab is a real
 * `<Link>`, so tapping, keyboard focus and screen readers all work untouched if the gesture is
 * never discovered.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { IconProps } from '@/components/ui/icons';

export interface TabItem {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
}

/** Hold this long before the bar switches from "tapping" to "scrubbing". */
const LONG_PRESS_MS = 320;
/** Movement beyond this before the hold completes means the user is scrolling, not pressing. */
const CANCEL_SLOP_PX = 12;

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function FloatingTabBar({
  items,
  activeIndex,
  coach,
}: {
  items: TabItem[];
  activeIndex: number;
  /** Optional Coach shortcut, floated above the bar's right end. */
  coach?: { href: string; label: string; Icon: (p: IconProps) => React.ReactElement; active: boolean };
}) {
  const router = useRouter();
  const barRef = React.useRef<HTMLUListElement>(null);
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  /** Set when a gesture ends in navigation, so the click the browser then fires is swallowed. */
  const swallowClick = React.useRef(false);

  const [scrubbing, setScrubbing] = React.useState(false);
  const [preview, setPreview] = React.useState<number | null>(null);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  React.useEffect(() => clearHold, []);

  /** Which tab sits under this x, by dividing the bar into equal columns. */
  const indexFromX = (clientX: number): number => {
    const el = barRef.current;
    if (!el) return activeIndex;
    const r = el.getBoundingClientRect();
    const ratio = (clientX - r.left) / Math.max(1, r.width);
    return Math.min(items.length - 1, Math.max(0, Math.floor(ratio * items.length)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Mouse users have no use for this — they have the sidebar at md and a pointer that can hit a
    // 44px target precisely. Restricting to touch also avoids hijacking click-and-drag selection.
    if (e.pointerType === 'mouse') return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    clearHold();
    holdTimer.current = setTimeout(() => {
      setScrubbing(true);
      setPreview(indexFromX(startX.current));
      // A real press deserves a real confirmation. Guarded because Safari on iOS does not
      // implement it and Firefox gates it behind a preference.
      navigator.vibrate?.(8);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!scrubbing) {
      // Still deciding. A finger that travels before the timer fires is a scroll starting on the
      // bar, not a press — let it go rather than stealing the gesture.
      const dx = Math.abs(e.clientX - startX.current);
      const dy = Math.abs(e.clientY - startY.current);
      if (dx > CANCEL_SLOP_PX || dy > CANCEL_SLOP_PX) clearHold();
      return;
    }
    setPreview(indexFromX(e.clientX));
  };

  const endGesture = (navigate: boolean) => {
    clearHold();
    if (scrubbing && navigate && preview != null && items[preview]) {
      swallowClick.current = true;
      if (preview !== activeIndex) router.push(items[preview].href);
    }
    setScrubbing(false);
    setPreview(null);
  };

  return (
    <nav
      aria-label="Primary"
      // `pointer-events-none` on the positioning layer so the transparent gutter either side of
      // the pill does not swallow taps meant for the page behind it.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden"
      data-testid="tab-bar"
    >
      <div className="mx-auto w-full max-w-[26rem] px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {/*
          COACH, ABOVE THE BAR RATHER THAN IN IT.
          The five tabs are the app's structure and Coach is not a sixth destination of the same
          kind — it is a thing you reach for mid-task, from wherever you are. Putting it in the row
          would mean either dropping a tab or shrinking all six below a comfortable target on a
          390px screen. Floating it clear keeps the row at five and gives Coach a shape nothing
          else in the bar has, which is what makes it findable without a label of its own.

          Right-aligned above the last tab: the far corner is the easiest reach for a thumb already
          resting on the bar, and it is the one spot that cannot be hit by accident while scrubbing
          across the tabs.
        */}
        {coach && (
          <div className="mb-2 flex justify-end pr-1">
            <Link
              href={coach.href}
              aria-label={coach.label}
              aria-current={coach.active ? 'page' : undefined}
              data-testid="tab-coach"
              className={cn(
                'pointer-events-auto grid h-11 w-11 place-items-center rounded-full border',
                'shadow-[var(--shadow-pop)] transition-colors',
                coach.active
                  ? 'border-transparent bg-accent text-accent-foreground'
                  : 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-surface-2 text-accent',
              )}
            >
              <coach.Icon size={20} />
            </Link>
          </div>
        )}
        <ul
          ref={barRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => endGesture(true)}
          onPointerCancel={() => endGesture(false)}
          onPointerLeave={() => endGesture(false)}
          onClickCapture={(e) => {
            if (!swallowClick.current) return;
            // The gesture already navigated; the click that follows the release would otherwise
            // fire on whichever tab the finger happened to lift over.
            swallowClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }}
          className={cn(
            'pointer-events-auto flex items-stretch justify-around rounded-chip border border-border',
            // OPAQUE. See the file header — this is the one property that matters for scroll cost.
            'bg-surface-2 shadow-[var(--shadow-pop)]',
            'transition-transform duration-150',
            scrubbing && 'scale-[1.02]',
          )}
          style={{
            // Only while scrubbing, so a normal vertical swipe that begins on the bar still
            // scrolls the page.
            touchAction: scrubbing ? 'none' : 'manipulation',
          }}
          data-scrubbing={scrubbing ? 'true' : undefined}
        >
          {items.map((item, i) => {
            const active = i === activeIndex;
            const highlighted = scrubbing ? preview === i : active;
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`tab-${item.label.toLowerCase()}`}
                  // The gesture is driven entirely by the <ul>; letting children capture the
                  // pointer would end the scrub the instant the finger crossed a tab boundary.
                  style={{ touchAction: 'inherit' }}
                  className={cn(
                    'flex select-none flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] font-semibold leading-none',
                    'transition-colors duration-150',
                    highlighted ? 'text-accent' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-8 w-12 place-items-center rounded-chip transition-[background-color,transform] duration-150',
                      highlighted ? 'bg-accent-muted' : 'bg-transparent',
                      scrubbing && preview === i && 'scale-110',
                    )}
                  >
                    <item.Icon size={21} />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
