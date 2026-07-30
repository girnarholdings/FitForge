'use client';

/**
 * THE PROFILE CARD — who you are here, and what the app knows about you, at a glance.
 *
 * This screen used to open as a wall of controls under the word "Settings": nineteen sections, the
 * first of them a routine summary, with the fact that determines what most of them MEAN — whether
 * there is an account behind this browser or not — buried two thirds of the way down. So the answer
 * to "am I signed in? is my training backed up? what plan am I even on?" required scrolling past
 * every knob in the app.
 *
 * The card answers those first, and it answers them DIFFERENTLY depending on the mode, because the
 * relevant facts are not the same:
 *
 *   · SIGNED IN — the Google identity, and whether the last sync worked. Their data lives in two
 *     places and the honest thing to show is the state of the second one.
 *   · LOCAL MODE — the chosen name (or none), and the trade-off stated plainly: nothing is uploaded,
 *     which also means clearing this browser is the one thing that loses it. Plus the way out.
 *
 * Both then get the same at-a-glance line-up — goal, plan, workouts logged, training since — because
 * that part is about the training, not the account.
 */
import * as React from 'react';
import { Card } from '@/components/ui';
import { AccountCard, GoogleSignInButton } from '@/components/auth/GoogleAuth';
import { isAuthConfigured } from '@/lib/auth/firebase';
import { useAuth } from '@/lib/auth/useUser';
import { useWorkoutSessions } from '@/components/features/shared/workoutLog';
import type { Routine } from '@/components/features/_mock/data';

/** One at-a-glance fact. Deliberately not editable — the settings below are where things change. */
function Stat({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-sm font-semibold text-foreground" data-testid={testid}>
        {value}
      </p>
    </div>
  );
}

/** "Jul 2026" — a month is honest about what a start date means and never looks like a deadline. */
function monthLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function ProfileCard({
  displayName,
  goalLabel,
  routine,
  startedAt,
}: {
  /** The name they gave onboarding, if any. */
  displayName: string;
  goalLabel: string;
  routine: Routine | null;
  /** When onboarding was completed (ISO), for "training since". */
  startedAt: string | null;
}) {
  const { user } = useAuth();
  const sessions = useWorkoutSessions();
  const since = monthLabel(startedAt);
  const authConfigured = isAuthConfigured();

  const name = user?.name ?? (displayName.trim() || 'Local Mode athlete');
  const initial = (displayName.trim() || user?.email || 'F').slice(0, 1).toUpperCase();

  return (
    <Card premium className="space-y-3" data-testid="profile-card">
      {/*
        IDENTITY, BY MODE.
        
        Signed in, `AccountCard` is reused WHOLE — avatar, name, email, the sync read-out and the one
        real sign-out. Re-implementing any of that here would give the screen two places able to
        disagree about whether you are signed in.
        
        Signed out it is NOT reused, even though it renders something: its signed-out branch is a
        four-line pitch for accounts, and a profile card whose first words are an advert tells you
        nothing about yourself. So Local Mode gets its own identity row — the name you chose, and
        where your training actually lives — with the account offer kept to its button underneath.
      */}
      {user ? (
        <AccountCard />
      ) : (
        <>
          <div className="flex items-center gap-3" data-testid="profile-local-identity">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                Local Mode — everything stays in this browser.
              </p>
            </div>
          </div>

          {/* The cost of the current arrangement, stated where it can still be acted on. */}
          <p
            className="text-[11px] leading-snug text-muted-foreground"
            data-testid="profile-mode-note"
          >
            <span className="font-semibold text-foreground">No account yet.</span> Clearing this
            browser&rsquo;s data is the one thing that erases your training — keep a backup, or add an
            account for a second copy.
          </p>
          {authConfigured && <GoogleSignInButton />}
        </>
      )}

      {/* THE TRAINING, at a glance and the same in both modes. */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border pt-3">
        <Stat label="Goal" value={goalLabel} testid="profile-goal" />
        <Stat
          label="Plan"
          value={routine ? routine.name : 'Not generated yet'}
          testid="profile-plan"
        />
        <Stat
          label="Training days"
          value={routine ? `${routine.days.length} a week` : '—'}
          testid="profile-days"
        />
        <Stat
          label="Workouts logged"
          value={String(sessions.length)}
          testid="profile-workouts"
        />
        {since && <Stat label="Training since" value={since} testid="profile-since" />}
      </dl>
    </Card>
  );
}
