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
  GoldIconDefs,
  KettlebellIcon,
  KettlebellSolidIcon,
  PlateChartIcon,
  PlateChartSolidIcon,
  ShakerIcon,
  ShakerSolidIcon,
  SettingsIcon,
  UserIcon,
  LogOutIcon,
  CoachIcon,
  RepeatIcon,
  CheckIcon,
  type IconProps,
  type SolidIconProps,
} from '@/components/ui/icons';
import { m, AnimatePresence, SPRING } from '@/components/ui/motion';
import { Sheet } from '@/components/ui';
import { FloatingTabBar, type TabItem } from './FloatingTabBar';
import { LogoLockup } from '@/components/illustrations';
import { useAuth, type AuthUser } from '@/lib/auth/useUser';
import { signOutUser } from '@/lib/auth/firebase';
import {
  getRestoreState,
  getSyncStatus,
  subscribeRestore,
  subscribeSync,
  syncOnSignIn,
} from '@/lib/auth/sync';
import { useHasOnboarded, useProfileName } from '@/lib/demo/useDemo';
import { isOnboarded } from '@/lib/demo/store';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface NavItem {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  /**
   * The FILLED twin of `Icon`, rendered while this destination is the current one — in FORGED
   * GOLD (the shared `ff-gold-icon` gradient), not flat accent, so the active tab reads as the
   * brand's metal. Primary tabs all carry one; Coach and Settings do not (see {@link NavIcon}).
   */
  IconSolid?: (p: SolidIconProps) => React.ReactElement;
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
    Icon: CoachIcon,
    match: ['/coach'],
    primary: false,
    accent: true,
  },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon, match: ['/settings'], primary: false },
];

/** The mobile bar's items, in order. Derived from NAV so the bar and the sidebar cannot drift. */
const PRIMARY_NAV = NAV.filter((i) => i.primary);
const TAB_ITEMS: TabItem[] = PRIMARY_NAV.map(({ href, label, Icon, IconSolid }) => ({
  href,
  label,
  Icon,
  IconSolid,
}));

const SETTINGS_ITEM = NAV.find((i) => i.href === '/settings')!;
const COACH_ITEM = NAV.find((i) => i.href === '/coach')!;

function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
}

/**
 * Routes that own the bottom of the screen with a composer of their own, where the floating Coach
 * button must NOT be drawn.
 *
 * THIS IS A REAL BUG, NOT A TIDINESS RULE. The Coach button floats 44px above the tab pill at the
 * right-hand edge — which is exactly where a composer puts its submit button. The nav sits at z-40
 * and the composer at z-30, so the Coach link silently swallowed every tap meant for "Review what
 * you ate": the user pressed send and landed on the Coach screen with their meal unlogged. Ten
 * end-to-end specs caught it at once, all of them food-logging paths, and the Playwright log named
 * the culprit outright — "<a data-testid='tab-coach'> … intercepts pointer events".
 *
 * Hiding it here rather than padding the composer upward is the cheaper trade: clearing the button
 * would cost ~60px of vertical space on a 664px screen, permanently, on the one screen where the
 * list of what you have eaten is the content. And nothing is lost — /nutrition still reaches the
 * Coach through the Today card and the sidebar, and on /coach the button is a link to the page you
 * are already on.
 */
const COACH_FAB_HIDDEN_ON = ['/nutrition', '/coach'];

function coachFabHidden(pathname: string): boolean {
  return COACH_FAB_HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(p + '/'));
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
          {showSolid ? <Solid size={size} gold /> : <item.Icon size={size} />}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * WHICH MODE YOU ARE ACTUALLY IN — gold "Local" chip, or "Google" once signed in.
 *
 * This said "Local" unconditionally, including to someone who had just signed in with Google,
 * which is the one place the app states where your data lives and was therefore stating it wrongly.
 * The label now follows `useAuth`, and `loading` deliberately reads as Local: that is the honest
 * answer while the session is still being restored, and it flips to Google the moment it resolves
 * rather than promising cloud backup to someone who turns out to be signed out.
 */
function ModeChip({
  signedIn,
  onClick,
  testId = 'mode-chip',
}: {
  signedIn: boolean;
  onClick: () => void;
  // The sidebar and the mobile bar both render one. Distinct ids so a spec can say which surface
  // it means — the same reason `nav-coach-desktop` and `mobile-coach` are separate.
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={signedIn ? 'About your Google account' : 'About Local Mode'}
      data-testid={testId}
      data-mode={signedIn ? 'google' : 'local'}
      className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-accent-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent transition-colors hover:bg-elevated"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {signedIn ? 'Google' : 'Local'}
    </button>
  );
}

/**
 * Sync now. Shown only when signed in, because there is nothing to sync to otherwise.
 *
 * Syncing is already automatic — on sign-in, and debounced after every change — so this button is
 * not how the feature works, it is how you find out that it did. It runs the same reconcile as
 * sign-in (`syncOnSignIn`, same conflict rule), which also makes it the way to PULL a change made
 * on another device without reloading.
 *
 * The icon carries the state: it spins while working, then shows a tick or turns red, because a
 * control that looks identical before and after you press it reads as broken.
 *
 * IT REPORTS THE OUTCOME, NOT THE ATTEMPT. `syncOnSignIn` resolves either way and records what
 * happened in the sync store, so the result is read back from there rather than assumed. The first
 * cut of this showed a green tick the instant the call returned, which meant a sync that had
 * failed outright — no network, rules rejected the write — looked exactly like one that worked.
 * That is worse than having no button. The reason itself is one tap away in the mode sheet beside
 * it, and in Settings.
 */
function SyncButton({
  uid,
  testId = 'sync-now',
  onRun,
}: {
  uid: string;
  testId?: string;
  /** Fired when the user starts a sync, so the shell can narrate this one and not the automatic ones. */
  onRun?: () => void;
}) {
  const [state, setState] = React.useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  React.useEffect(() => {
    if (state !== 'done' && state !== 'error') return;
    // A failure lingers longer: it is the one you might miss while looking away.
    const t = setTimeout(() => setState('idle'), state === 'error' ? 5000 : 2000);
    return () => clearTimeout(t);
  }, [state]);

  const run = async () => {
    if (state === 'busy') return;
    onRun?.();
    setState('busy');
    await syncOnSignIn(uid);
    setState(getSyncStatus().state === 'error' ? 'error' : 'done');
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      aria-label={state === 'error' ? 'Sync failed — tap to try again' : 'Sync now'}
      data-testid={testId}
      data-state={state}
      className={cn(
        // Same 36px-pill / 44px-target treatment as the Coach and Settings circles beside it.
        'relative touch-manipulation before:absolute before:-inset-1 before:content-[""]',
        'grid h-9 w-9 place-items-center rounded-full border transition-colors',
        state === 'done' && 'border-transparent bg-accent-muted text-success',
        state === 'error' && 'border-danger text-danger',
        (state === 'idle' || state === 'busy') &&
          'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-accent-soft hover:bg-accent-muted hover:text-accent',
      )}
    >
      {state === 'done' ? (
        <CheckIcon size={17} />
      ) : (
        <RepeatIcon size={17} className={state === 'busy' ? 'animate-spin' : undefined} />
      )}
    </button>
  );
}

/**
 * A NAME FOR AN ICON, on both kinds of device.
 *
 * The top bar is four wordless glyphs. On a desktop the answer is hover; on a phone there is no
 * hover at all, and `title` renders nothing — so an icon-only bar is a guessing game there
 * permanently. This shows the label on hover AND while the control is held, which is the closest
 * thing touch has to "tell me what this is" and costs a press the user was making anyway.
 *
 * `right-0` rather than centred so the label grows leftwards: the rightmost button sits against
 * the screen edge, and a centred label would hang off it.
 */
/**
 * THE TOP-RIGHT CONTROL IS THE PERSON, NOT THE GEAR — and it is a real dropdown.
 *
 * Two owner complaints drove this. First, the screen behind it became a PROFILE, so a gear was
 * naming the wrong thing. Second, the old control was a plain link: tapping it while already on
 * /settings did nothing, which reads as a stuck button. A dropdown answers both — every tap
 * either opens or closes it, and what drops down is identity first (who you are, where your data
 * lives), then the way into the full profile screen.
 *
 * Closes on: second tap (aria-expanded toggle), outside tap, Escape, and any route change.
 * `data-testid="mobile-settings"` stays on the BUTTON — it is the same 44px top-bar target the
 * touch-target and overflow specs have always measured.
 */
function ProfileMenu({
  pathname,
  user,
  displayName,
}: {
  pathname: string;
  user: AuthUser | null;
  displayName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Route changes close the menu — following a menu item must not leave it hanging open.
  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        // Escape must hand focus back to the trigger — otherwise a keyboard user is dropped at
        // the top of the document and has to walk the whole bar again.
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /**
   * The KEYBOARD HALF of the menu pattern this button advertises. aria-haspopup="menu" is a
   * promise (APG): arrows move through items, Home/End jump, Tab leaves and closes. Announcing
   * the pattern while implementing only pointer taps is worse than a plain disclosure — the
   * screen-reader user is told the keys work and then they don't.
   */
  const items = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusItem = (index: number) => {
    const list = items();
    if (list.length === 0) return;
    list[((index % list.length) + list.length) % list.length]?.focus();
  };
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(at + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(at <= 0 ? list.length - 1 : at - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(list.length - 1);
    } else if (e.key === 'Tab') {
      setOpen(false); // Tab exits a menu; leaving it open behind the moved focus orphans it.
    }
  };

  /* Array.from splits on CODE POINTS where slice(0,1) splits on code units — a name that starts
     with an emoji or any astral-plane character would otherwise render its avatar initial as a
     lone surrogate: the � replacement glyph. */
  const initial = (Array.from(displayName.trim() || user?.email || '')[0] ?? '').toUpperCase();
  const onSettings = /^\/settings(\/|$)/.test(pathname);

  return (
    <div ref={rootRef} className="relative" onKeyDown={onMenuKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Profile"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="mobile-settings"
        aria-current={onSettings ? 'page' : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          // ArrowDown on the closed trigger opens the menu with the first item focused — the
          // APG entry gesture pointer users never see.
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(0));
          }
        }}
        className={cn(
          'relative touch-manipulation before:absolute before:-inset-1 before:content-[""]',
          'grid h-9 w-9 place-items-center overflow-hidden rounded-full border transition-colors',
          open || onSettings
            ? 'border-transparent bg-accent-muted text-accent'
            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- static export: no optimizer
          <img src={user.photoURL} alt="" width={34} height={34} referrerPolicy="no-referrer" />
        ) : initial ? (
          <span className="text-sm font-bold">{initial}</span>
        ) : (
          <UserIcon size={18} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile menu"
          data-testid="profile-menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-sm border border-border bg-surface-2 p-1.5 shadow-[var(--shadow-pop)]"
        >
          {/* Identity first: who this device thinks you are, and where the data lives. The email
              WRAPS instead of truncating — the domain is the part that distinguishes two Google
              accounts, and an ellipsis was hiding exactly that half. break-all because an email
              is one unbreakable token to the line-breaker. */}
          <div className="px-2.5 py-2">
            <p className="break-words text-sm font-semibold text-foreground">
              {user?.name ?? (displayName.trim() || 'Local Mode athlete')}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {user ? (user.email ?? 'Synced to Google') : 'Local Mode — this browser'}
            </p>
          </div>
          <div className="mx-1 border-t border-border" role="none" />
          <Link
            href="/settings"
            role="menuitem"
            data-testid="profile-menu-settings"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center gap-2.5 rounded-sm px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <SettingsIcon size={17} className="text-muted-foreground" />
            Profile &amp; settings
          </Link>
          {user && (
            <button
              type="button"
              role="menuitem"
              data-testid="profile-menu-signout"
              onClick={() => {
                setOpen(false);
                void signOutUser();
              }}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <LogOutIcon size={17} className="text-muted-foreground" />
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WithLabel({
  label,
  children,
  suppressed = false,
}: {
  label: string;
  children: React.ReactNode;
  /**
   * Stand down while something more important occupies the space directly below the bar.
   * The labels hang under their buttons, which is exactly where the sync announcement goes — and
   * a tooltip covering the sentence that says whether your data saved is a worse trade than a
   * button briefly not naming itself.
   */
  suppressed?: boolean;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      {!suppressed && (
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-full z-40 mt-1.5 whitespace-nowrap rounded-md border border-border bg-elevated px-1.5 py-0.5 text-[10px] font-semibold text-foreground opacity-0 shadow-[var(--shadow-card)] transition-opacity duration-100 group-hover:opacity-100 group-active:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
      )}
    </span>
  );
}

/**
 * WHAT THE SYNC BUTTON JUST DID, in words.
 *
 * The button alone could only spin and then flash a colour, which answered "did anything happen"
 * and not "did it work" — and the two-second tick was easy to miss entirely. Pressing sync is a
 * deliberate act with a question behind it, so the answer is written out: which direction the data
 * went, or why it did not go.
 *
 * Only ever shown for a sync the user ASKED for. Background pushes fire every few seconds while
 * you train, and narrating those would turn the top of the screen into a status log.
 */
function SyncAnnouncement({ onDone, testId = 'sync-announcement' }: { onDone: () => void; testId?: string }) {
  const status = useSyncStatus();
  const settled = status.state === 'synced' || status.state === 'error';

  React.useEffect(() => {
    if (!settled) return;
    // A failure lingers: it is the one you need time to read.
    const t = setTimeout(onDone, status.state === 'error' ? 9000 : 3500);
    return () => clearTimeout(t);
  }, [settled, status.state, onDone]);

  const text =
    status.state === 'syncing'
      ? 'Syncing…'
      : status.state === 'synced'
        ? status.direction === 'pull'
          ? 'Restored from your account'
          : 'Backed up to your account'
        : status.state === 'error'
          ? status.detail
          : 'Syncing…';

  return (
    <p
      data-testid={testId}
      data-state={status.state}
      className={cn(
        'flex items-center gap-1.5 px-4 pb-2 text-[11px] leading-snug',
        status.state === 'error' ? 'text-danger' : 'text-muted-foreground',
      )}
    >
      {status.state === 'syncing' && <RepeatIcon size={12} className="animate-spin shrink-0" />}
      {status.state === 'synced' && <CheckIcon size={12} className="shrink-0 text-success" />}
      <span className="min-w-0">{text}</span>
    </p>
  );
}

const RESTORE_SERVER_SNAPSHOT = Object.freeze({ phase: 'idle', pulled: false } as const);

/** Whether the first cloud reconcile has settled — see RestoreState. The routing gate waits on it. */
function useRestore() {
  return React.useSyncExternalStore(
    subscribeRestore,
    getRestoreState,
    () => RESTORE_SERVER_SNAPSHOT as ReturnType<typeof getRestoreState>,
  );
}

/** The sync store as a snapshot, so the mode sheet can explain a failure the button only hints at. */
function useSyncStatus() {
  return React.useSyncExternalStore(
    subscribeSync,
    getSyncStatus,
    () => ({ state: 'idle' }) as ReturnType<typeof getSyncStatus>,
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/today';
  const router = useRouter();
  const name = useProfileName();
  const { status: authStatus, user } = useAuth();
  const sync = useSyncStatus();
  const restore = useRestore();
  // Reactive, so a cloud restore landing mid-wait re-runs the gate rather than leaving the app on
  // its loading screen until something else happens to re-render.
  const hasOnboarded = useHasOnboarded();
  const signedIn = authStatus === 'signed-in' && !!user;
  const [checked, setChecked] = React.useState(false);
  const [explain, setExplain] = React.useState(false);
  // Only true for a sync the user pressed — background pushes stay silent. See SyncAnnouncement.
  const [announceSync, setAnnounceSync] = React.useState(false);
  const startAnnounce = React.useCallback(() => setAnnounceSync(true), []);
  const endAnnounce = React.useCallback(() => setAnnounceSync(false), []);

  // -1 when the route is not one of the five tabs (Coach, Settings). That simply means no tab is
  // highlighted; the bar still renders and still navigates.
  const activeTabIndex = PRIMARY_NAV.findIndex((i) => isActive(pathname, i));

  /**
   * Fresh-visit gate (§5.3) — now aware that "this browser is empty" and "this person is new" are
   * different statements.
   *
   * It used to conflate them: an empty local store meant onboarding, full stop. For a signed-in
   * user opening the app on a second device that is exactly wrong — the store is empty because
   * their account has not been fetched yet, and the redirect fired while the fetch was still in
   * the air. They were walked through building a plan they already had.
   *
   * So a signed-in visitor gets to wait for the reconcile to settle. `'done'` rather than
   * "succeeded" on purpose: a Firestore outage must release them into onboarding, not trap them on
   * a spinner. The direct store read still avoids the hydration double-render trap, and
   * `useHasOnboarded` re-runs this the instant a restore writes the plan in.
   */
  React.useEffect(() => {
    // ONCE. This is an admission check, not a standing rule. Re-running it after someone is
    // already inside turns any later emptying of the store into a redirect — and Settings →
    // "Erase Local Mode data" empties it on purpose. The bounce to onboarding then raced the
    // erase's own navigation home and left a freshly seeded session behind: a wipe that did not
    // look wiped. The reactive inputs exist to let the FIRST decision wait for a cloud restore,
    // not to keep re-deciding afterwards.
    if (checked) return;
    if (isOnboarded()) {
      setChecked(true);
      return;
    }
    // Still resolving who this is — deciding now would be deciding on no information.
    if (authStatus === 'loading') return;
    if (signedIn && restore.phase !== 'done') return;
    router.replace('/onboarding/welcome');
  }, [checked, router, authStatus, signedIn, restore.phase, hasOnboarded]);

  if (!checked) {
    // Blank canvas while we decide — except for the one case worth naming, where the wait is a
    // network round trip and silence would read as a hang.
    return (
      <div className="grid min-h-screen min-h-[100svh] place-items-center bg-surface px-6">
        {signedIn && restore.phase === 'restoring' && (
          <p className="text-sm text-muted-foreground" data-testid="restoring-account">
            Restoring your training…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100svh] md:flex">
      {/* The forged-gold paint server every active solid icon (sidebar + tab bar) references. */}
      <GoldIconDefs />
      {/* Sidebar (≥md) */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <div className="flex items-center justify-between px-5 py-5">
          {/* The wordmark goes home. It was inert on every screen, and a logo that does nothing is
              a dead end in the one place every user reflexively taps to get back. */}
          <Link href="/today" aria-label="FitForge home" data-testid="logo-home">
            <LogoLockup size={20} />
          </Link>
          <div className="flex items-center gap-2">
            {signedIn && (
              <WithLabel label="Sync now" suppressed={announceSync}>
                <SyncButton uid={user.uid} testId="sync-now-desktop" onRun={startAnnounce} />
              </WithLabel>
            )}
            <ModeChip
              signedIn={signedIn}
              onClick={() => setExplain(true)}
              testId="mode-chip-desktop"
            />
          </div>
        </div>
        {announceSync && (
          <SyncAnnouncement onDone={endAnnounce} testId="sync-announcement-desktop" />
        )}
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
            {/* Array.from: code points, not code units — an emoji-leading name must not render
                its initial as a lone surrogate (�). */}
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
              {(Array.from(name)[0] ?? 'A').toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {name || 'Your profile'}
              </p>
              {/* The account, when there is one — the email is the unambiguous answer to "which
                  Google account am I actually signed into on this device". */}
              <p className="truncate text-xs text-muted-foreground" data-testid="sidebar-mode">
                {signedIn ? (user.email ?? 'Signed in with Google') : 'Local Mode'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar carries the brand + Local chip + Settings (which is off the tab bar). */}
        {/* OPAQUE, not `bg-surface/95 backdrop-blur`. A translucent, blurred sticky header makes the
            compositor re-sample the page behind it on every scroll frame — full width, for the
            whole scroll, on every screen. Solid costs nothing and looks identical over a solid
            page. */}
        <div className="sticky top-0 z-30 border-b border-border bg-surface md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link href="/today" aria-label="FitForge home" data-testid="logo-home-mobile">
            <LogoLockup size={18} />
          </Link>
          {/* gap-2 IS LOAD-BEARING, not spacing taste. Each circle is a 36px pill with a
              transparent 4px-a-side ::before that grows the TARGET to 44px; an 8px gap is exactly
              what lets those pads meet without overlapping. Tightening it to 6px to make room for
              the sync button made adjacent pads overlap by 2px, and touch-targets.spec caught it
              immediately — a tap near the edge of Coach landed on Settings. */}
          <div className="flex items-center gap-2">
            <ModeChip signedIn={signedIn} onClick={() => setExplain(true)} />
            {signedIn && (
              <WithLabel label="Sync now" suppressed={announceSync}>
                <SyncButton uid={user.uid} onRun={startAnnounce} />
              </WithLabel>
            )}
            <WithLabel label="Coach" suppressed={announceSync}>
            <Link
              href="/coach"
              aria-label="Coach"
              data-testid="mobile-coach"
              aria-current={isActive(pathname, COACH_ITEM) ? 'page' : undefined}
              className={cn(
                // 36px PILL, 44px TARGET. The visible circles are sized to sit beside the Local
                // Mode chip without crowding it off a 390px bar, so they cannot simply be grown.
                // A transparent ::before adds 4px a side instead (36 + 4 + 4 = 44) at zero layout
                // cost — WCAG 2.5.8 governs the TARGET, not the ink. The `gap-2` between the two
                // is 8px, so the pads meet exactly and never overlap into each other.
                // These are the only way to reach Coach and Settings on mobile.
                'relative touch-manipulation before:absolute before:-inset-1 before:content-[""]',
                'grid h-9 w-9 place-items-center rounded-full border transition-colors',
                isActive(pathname, COACH_ITEM)
                  ? 'border-transparent bg-accent-muted text-accent'
                  : 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-accent-soft hover:bg-accent-muted hover:text-accent',
              )}
            >
              <CoachIcon size={18} />
            </Link>
            </WithLabel>
            <WithLabel label="Profile" suppressed={announceSync}>
              <ProfileMenu pathname={pathname} user={user} displayName={name} />
            </WithLabel>
          </div>
        </div>
        {/* Under the bar, full width — the one place a sentence fits on a 390px screen. */}
        {announceSync && <SyncAnnouncement onDone={endAnnounce} />}
        </div>
        {/* Desktop width is opt-in per surface: only screens that lay out a real second column
            get it. A 1040px single-column card stack is worse than the 720px one. */}
        <main
          className={cn(
            'mx-auto w-full flex-1 px-4 pb-[var(--dock-clearance)] pt-4 md:px-8 md:pb-10 md:pt-8',
            /^\/(exercises|progress|routines)(\/|$)/.test(pathname)
              ? 'max-w-[720px] lg:max-w-[1040px]'
              : 'max-w-[720px]',
          )}
        >
          {children}
        </main>
      </div>

      {/* Bottom tab bar (mobile) — a floating, OPAQUE pill. See FloatingTabBar for why it is
          neither blurred nor full-bleed, and for the long-press-to-scrub gesture. */}
      <FloatingTabBar
        items={TAB_ITEMS}
        activeIndex={activeTabIndex}
        coach={
          coachFabHidden(pathname)
            ? undefined
            : {
                href: COACH_ITEM.href,
                label: COACH_ITEM.label,
                Icon: COACH_ITEM.Icon,
                active: isActive(pathname, COACH_ITEM),
              }
        }
      />

      <Sheet
        open={explain}
        onClose={() => setExplain(false)}
        title={signedIn ? 'Signed in with Google' : 'Local Mode'}
      >
        {signedIn ? (
          <p className="text-sm text-muted-foreground" data-testid="mode-sheet-google">
            Your plan, logs and meals are saved in this browser and backed up to{' '}
            {/* break-all: an email is one unbreakable token; without it a long address is
                hard-clipped mid-word at the sheet edge — which displays a WRONG address in the
                sentence whose whole job is naming where the data went. */}
            <span className="break-all text-foreground">{user.email ?? 'your Google account'}</span>
            , so you
            can pick them up on another device. Backing up happens on its own — the sync button
            beside this chip is there when you want to push or pull right now. Manage the account in{' '}
            <Link href="/settings" className="font-semibold text-accent hover:underline">
              Settings
            </Link>
            .
            {sync.state === 'error' && (
              // The sync button can only afford to turn red; the reason belongs somewhere it fits.
              <span className="mt-2 block text-danger" data-testid="mode-sheet-sync-error">
                Last sync failed: {sync.detail}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Local Mode keeps everything — your plan, logs, and meals — in this browser&apos;s
            storage. Nothing is uploaded. Export a backup anytime from{' '}
            <Link href="/settings" className="font-semibold text-accent hover:underline">
              Settings
            </Link>
            .
          </p>
        )}
      </Sheet>
    </div>
  );
}
