'use client';

/**
 * Authed app shell (§2.3): bottom tab bar on mobile, left sidebar on ≥md.
 *
 * Mobile tabs: Today · Workouts · Exercises · Nutrition · Progress. The exercise library is a
 * first-class destination (user feedback: "exercises are really hard to get to"), so it lives in
 * the thumb-zone tab bar. Settings moves out of the five-slot bar and is reached from the gear
 * button in the sticky mobile top bar — the desktop sidebar still lists every destination.
 *
 * Coach (the knowledge base + ask surface) deliberately does NOT displace a primary tab: it is a
 * gold-accented item at the top of the desktop sidebar and a dedicated button in the mobile top
 * bar, with a third entry point on Today itself.
 *
 * Fresh-visit gating (§5.3): a client-side guard — if the Local Mode store is missing or
 * onboarding is not complete, redirect into `/onboarding/welcome`. The check reads the store
 * directly (not the reactive snapshot) so hydration's server→client snapshot swap can't trigger a
 * spurious redirect for an already-onboarded returning user.
 */
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AnvilIcon,
  AnvilSolidIcon,
  BarbellIcon,
  BarbellSolidIcon,
  KettlebellIcon,
  KettlebellSolidIcon,
  PlateChartIcon,
  PlateChartSolidIcon,
  ShakerIcon,
  ShakerSolidIcon,
  SettingsIcon,
  WhistleIcon,
  type IconProps,
} from '@/components/ui/icons';
import { m, AnimatePresence, SPRING } from '@/components/ui/motion';
import { Sheet } from '@/components/ui';
import { LogoLockup } from '@/components/illustrations';
import { useProfileName } from '@/lib/demo/useDemo';
import { isOnboarded } from '@/lib/demo/store';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface NavItem {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  /**
   * The FILLED twin of `Icon`, rendered while this destination is the current one. Primary tabs
   * all carry one; Coach and Settings do not (see {@link NavIcon}).
   */
  IconSolid?: (p: IconProps) => React.ReactElement;
  /** also treat these path prefixes as "active" for this tab */
  match: string[];
  primary: boolean;
  /** render with the gold "forged" treatment in the sidebar (Coach only) */
  accent?: boolean;
}

/**
 * `primary` = shown in the mobile bottom tab bar (max 5, thumb zone). The sidebar renders the
 * full list. Settings is intentionally NOT primary — it is reached from the mobile top bar gear.
 *
 * THE TAB ICONS ARE GYM OBJECTS, WITH TWO DELIBERATE EXCEPTIONS.
 *
 * Anvil ties Today to the app's own logo mark, so the brand asset finally earns a second
 * appearance. Workouts (your loaded programme) is the barbell; Exercises (the library of other
 * things you could do) is the kettlebell.
 *
 * THE KETTLEBELL IS A LEGIBILITY CALL, NOT A SEMANTIC ONE, and it was made from a 390 px
 * screenshot. A dumbbell is the obvious icon for a movement library, but Workouts and Exercises
 * are ADJACENT tabs: at 22 px a dumbbell beside a barbell is two horizontal bars with lumps on
 * the ends, and the tab bar is the one place where a wrong guess costs a navigation. A bell and a
 * bar cannot be confused at any size. A shaker is the one gym object that is genuinely about
 * food; a whistle is a coach, which a speech bubble never was.
 *
 * PROGRESS IS NOW PLATES TOO, which reverses what this comment used to say. The previous note
 * kept the generic rising arrow on the grounds that "an ascending plate stack at 22 px is
 * ambiguous between progress and weights" — and it was right about a HORIZONTAL stack, which is
 * the shape of the Workouts barbell two slots away. {@link PlateChartIcon} stands the plates on
 * end on a floor line: ascending-and-vertical still reads instantly as a chart, and nothing else
 * in the bar has that silhouette. Settings still KEEPS the gear — it is already a machine part and
 * is the universal settings signal, so gym-ifying it would be pure novelty.
 *
 * EVERY PRIMARY TAB CARRIES AN OUTLINE/SOLID PAIR. Active state used to be gold-vs-grey and
 * nothing else, which is a WCAG 1.4.1 problem (colour as the only channel) as well as the single
 * loudest "this is a web app" tell in the shell. Coach and Settings have no solid twin on purpose:
 * neither lives in the tab bar, the sidebar already gives Coach a gold gradient border of its own,
 * and a filled gear is a worse gear.
 */
const NAV: NavItem[] = [
  {
    href: '/today',
    label: 'Today',
    Icon: AnvilIcon,
    IconSolid: AnvilSolidIcon,
    match: ['/today', '/workout'],
    primary: true,
  },
  {
    href: '/routines',
    label: 'Workouts',
    Icon: BarbellIcon,
    IconSolid: BarbellSolidIcon,
    match: ['/routines'],
    primary: true,
  },
  {
    href: '/exercises',
    label: 'Exercises',
    Icon: KettlebellIcon,
    IconSolid: KettlebellSolidIcon,
    match: ['/exercises'],
    primary: true,
  },
  {
    href: '/nutrition',
    label: 'Nutrition',
    Icon: ShakerIcon,
    IconSolid: ShakerSolidIcon,
    match: ['/nutrition'],
    primary: true,
  },
  {
    href: '/progress',
    label: 'Progress',
    Icon: PlateChartIcon,
    IconSolid: PlateChartSolidIcon,
    match: ['/progress'],
    primary: true,
  },
  {
    href: '/coach',
    label: 'Coach',
    Icon: WhistleIcon,
    match: ['/coach'],
    primary: false,
    accent: true,
  },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon, match: ['/settings'], primary: false },
];

const SETTINGS_ITEM = NAV.find((i) => i.href === '/settings')!;
const COACH_ITEM = NAV.find((i) => i.href === '/coach')!;

function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
}

/**
 * One nav glyph, crossfading outline → solid when its destination becomes the current one.
 *
 * THE TWO ICONS OVERLAP DURING THE SWAP rather than taking turns. `AnimatePresence` with
 * `mode="wait"` would empty the slot for the length of the exit before the entrance starts, and an
 * icon that blinks out on tap reads as a broken image, not as a state change. Both are absolutely
 * positioned inside a fixed-size box so they cross-dissolve in place and the row never reflows.
 *
 * `SPRING.press` because this IS the press: it fires on the same tap that navigates.
 *
 * REDUCED MOTION IS HANDLED FOR FREE and deliberately not re-implemented here. The root
 * `MotionConfig reducedMotion="user"` drops transforms and keeps opacity for every `m.*` element,
 * so this stays a plain fade for users who ask for less motion, and `AnimatePresence` still runs
 * it to completion — no half-faded glyph can be left parked on screen. A raw CSS `@keyframes`
 * crossfade would have been collapsed to 0.001 s by the global reduced-motion rule and frozen on
 * whichever frame it landed on; see the warning in globals.css.
 */
function NavIcon({
  item,
  active,
  size,
}: {
  item: NavItem;
  active: boolean;
  size: number;
}) {
  const Solid = item.IconSolid;
  // Destinations without a filled twin (Coach, Settings) keep the plain glyph and cost nothing.
  if (!Solid) return <item.Icon size={size} />;
  const showSolid = active;
  return (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <AnimatePresence initial={false}>
        <m.span
          key={showSolid ? 'solid' : 'outline'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SPRING.press}
          className="absolute inset-0 grid place-items-center"
        >
          {showSolid ? <Solid size={size} /> : <item.Icon size={size} />}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** Gold-outline "Local" chip → taps open the Local Mode explainer (§5.1). */
function LocalChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="About Local Mode"
      className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-accent-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent transition-colors hover:bg-elevated"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Local
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/today';
  const router = useRouter();
  const name = useProfileName();
  const [checked, setChecked] = React.useState(false);
  const [explain, setExplain] = React.useState(false);

  // Fresh-visit gate (§5.3). Direct store read avoids the hydration double-render trap.
  React.useEffect(() => {
    if (isOnboarded()) setChecked(true);
    else router.replace('/onboarding/welcome');
  }, [router]);

  if (!checked) {
    // Blank canvas while we decide (redirecting fresh visits, confirming onboarded users).
    return <div className="min-h-dvh bg-surface" aria-hidden />;
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar (≥md) */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <div className="flex items-center justify-between px-5 py-5">
          <LogoLockup size={20} />
          <LocalChip onClick={() => setExplain(true)} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-accent-muted text-accent'
                    : item.accent
                      ? 'border-gradient-gold text-accent-soft hover:text-accent'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                data-testid={item.accent ? 'nav-coach-desktop' : undefined}
              >
                <NavIcon item={item} active={active} size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
              {(name || 'A').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {name || 'Your profile'}
              </p>
              <p className="text-xs text-muted-foreground">Local Mode</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar carries the brand + Local chip + Settings (which is off the tab bar). */}
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <LogoLockup size={18} />
          <div className="flex items-center gap-2">
            <LocalChip onClick={() => setExplain(true)} />
            <Link
              href="/coach"
              aria-label="Coach"
              data-testid="mobile-coach"
              aria-current={isActive(pathname, COACH_ITEM) ? 'page' : undefined}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-full border transition-colors',
                isActive(pathname, COACH_ITEM)
                  ? 'border-transparent bg-accent-muted text-accent'
                  : 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-accent-soft hover:bg-accent-muted hover:text-accent',
              )}
            >
              <WhistleIcon size={18} />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              data-testid="mobile-settings"
              aria-current={isActive(pathname, SETTINGS_ITEM) ? 'page' : undefined}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-full border border-border transition-colors',
                isActive(pathname, SETTINGS_ITEM)
                  ? 'border-transparent bg-accent-muted text-accent'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <SettingsIcon size={18} />
            </Link>
          </div>
        </div>
        <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">
          {children}
        </main>
      </div>

      {/* Bottom tab bar (mobile) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-2/90 backdrop-blur-lg md:hidden"
      >
        <ul className="mx-auto flex max-w-[520px] items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {NAV.filter((i) => i.primary).map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-semibold leading-none transition-colors',
                    active ? 'text-accent' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-8 w-12 place-items-center rounded-full transition-colors',
                      active ? 'bg-accent-muted' : 'bg-transparent',
                    )}
                  >
                    <NavIcon item={item} active={active} size={22} />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet open={explain} onClose={() => setExplain(false)} title="Local Mode">
        <p className="text-sm text-muted-foreground">
          Local Mode keeps everything — your plan, logs, and meals — in this browser&apos;s storage.
          Nothing is uploaded. Export a backup anytime from{' '}
          <Link href="/settings" className="font-semibold text-accent hover:underline">
            Settings
          </Link>
          .
        </p>
      </Sheet>
    </div>
  );
}
