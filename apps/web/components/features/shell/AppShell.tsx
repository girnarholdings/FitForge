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
  HomeIcon,
  DumbbellIcon,
  AppleIcon,
  TrendingUpIcon,
  SettingsIcon,
  BookIcon,
  ChatIcon,
  type IconProps,
} from '@/components/ui/icons';
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
  /** also treat these path prefixes as "active" for this tab */
  match: string[];
  primary: boolean;
  /** render with the gold "forged" treatment in the sidebar (Coach only) */
  accent?: boolean;
}

/**
 * `primary` = shown in the mobile bottom tab bar (max 5, thumb zone). The sidebar renders the
 * full list. Settings is intentionally NOT primary — it is reached from the mobile top bar gear.
 */
const NAV: NavItem[] = [
  { href: '/today', label: 'Today', Icon: HomeIcon, match: ['/today', '/workout'], primary: true },
  { href: '/routines', label: 'Workouts', Icon: DumbbellIcon, match: ['/routines'], primary: true },
  { href: '/exercises', label: 'Exercises', Icon: BookIcon, match: ['/exercises'], primary: true },
  { href: '/nutrition', label: 'Nutrition', Icon: AppleIcon, match: ['/nutrition'], primary: true },
  { href: '/progress', label: 'Progress', Icon: TrendingUpIcon, match: ['/progress'], primary: true },
  {
    href: '/coach',
    label: 'Coach',
    Icon: ChatIcon,
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
                <item.Icon size={20} />
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
              <ChatIcon size={18} />
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
                    <item.Icon size={22} />
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
