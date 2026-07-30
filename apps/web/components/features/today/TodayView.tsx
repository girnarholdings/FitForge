'use client';

/**
 * Today (home tab, §2.3): today's workout card (active routine × weekday mapping), nutrition heat
 * ring (v_daily_nutrition vs targets), weight, and date. A fresh demo user sees real first-run
 * empty states with clear guidance — nothing is pre-filled.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardTitle, Button, ButtonLink, Sheet } from '@/components/ui';
import { ArrowRightIcon, FlameSolidIcon, HammerIcon } from '@/components/ui/icons';
import { rankFor } from '@/components/features/shared/forgeRank';
import { todaysRoutineDay } from '@/components/features/_mock/data';
import {
  useActiveRoutine,
  useNutritionTargets,
  useLogsForDate,
  useDemoState,
} from '@/lib/demo/useDemo';
import {
  useSelectedDate,
  dayLabel,
  dayOffset,
  isToday,
  isFuture,
  isPast,
  parseISO,
} from '@/lib/demo/selectedDate';
import { DateNav } from '@/components/features/shared/DateNav';
import { exerciseCountLabel } from '@/lib/demo/generate';
import { useWorkoutSessions, weeklyStreak } from '@/components/features/shared/workoutLog';
import { setQuickSession } from '@/lib/demo/store';
import { buildAdaptedDay } from '@/lib/readiness/dayEdits';
import { patchEntry, todayISO, useReadinessEntries } from '@/lib/readiness/store';
import { CoachEntryCard } from '@/components/features/coach/CoachEntryCard';
import { MorningCheckIn } from './MorningCheckIn';
import { QuickWorkoutCard } from './QuickWorkoutCard';
import { FirstRunTour } from './FirstRunTour';

export function TodayView() {
  const routine = useActiveRoutine();
  // THE DAY ON SCREEN. `todaysRoutineDay` already took a Date, so every past and future day
  // already had an answer under the weekly blueprint — nothing was scheduling-bound, the screen
  // was simply hard-wired to `new Date()`.
  const [date, setDate] = useSelectedDate();
  const viewing = React.useMemo(() => parseISO(date), [date]);
  const day = todaysRoutineDay(routine, viewing);
  const onToday = isToday(date);
  const targets = useNutritionTargets();
  const state = useDemoState();
  const sessions = useWorkoutSessions();
  const router = useRouter();
  const targetDays = state.profile?.days_per_week ?? 3;
  const streak = React.useMemo(
    () => weeklyStreak(sessions, targetDays),
    [sessions, targetDays],
  );
  const { logs } = useLogsForDate(date);
  const nutrition = logs.reduce(
    (a, l) => ({
      kcal: a.kcal + l.kcal,
      protein_g: a.protein_g + l.protein_g,
      carbs_g: a.carbs_g + l.carbs_g,
      fat_g: a.fat_g + l.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  const hasLogged = logs.length > 0;

  /**
   * THE REST-DAY GUARD. When this morning's check-in ended in an ACCEPTED rest day, the page has
   * to stop contradicting itself: a bright "Start workout" button an inch under "Rest day, on
   * purpose" is two cards giving opposite orders. So while the rest decision stands, the
   * standard session is PARKED — visibly dimmed, its start button replaced by a deliberate
   * override flow that (a) restates why rest was called, (b) recommends half the sets if they
   * insist, and (c) only then lets the full session through, recording the override honestly as
   * a rejection of the rest offer. `!adaptedDay` matters: once they take the half-session route,
   * the adapted card above owns the day and the guard stands down.
   */
  const readiness = useReadinessEntries();
  const todayEntry = onToday ? readiness.find((e) => e.date === todayISO()) : undefined;
  const restingToday =
    !!todayEntry &&
    todayEntry.decision === 'accepted' &&
    todayEntry.offered === 'rest' &&
    !todayEntry.adaptedDay;
  const [restConfirmOpen, setRestConfirmOpen] = React.useState(false);

  /** Override path A: train, but at half the dose. Feeds the adapted-session card above. */
  function trainHalfInstead() {
    if (!day || !todayEntry) return;
    const adapted = buildAdaptedDay(day, 'reduce');
    patchEntry(todayEntry.date, { adaptedDay: adapted });
    setRestConfirmOpen(false);
    if (adapted) {
      setQuickSession(adapted);
      router.push('/workout/quick');
    }
  }

  /** Override path B: the full session. Logged as rejecting the rest offer — the honest record. */
  function trainFullAnyway() {
    if (!day || !todayEntry) return;
    patchEntry(todayEntry.date, { decision: 'rejected' });
    setRestConfirmOpen(false);
    router.push(`/workout/${day.id}`);
  }

  /**
   * THE HEADING IS THE DATE, not a greeting and not an abbreviation.
   *
   * It used to read "Good afternoon, Athlete" over "Tues's plan", which answers neither question a
   * person actually has on this screen — WHICH DAY am I looking at, and is that today? Once the
   * date can be changed, "Tues" is worse than useless: it is the same three letters whether you
   * are on this Tuesday, last Tuesday or next Tuesday.
   *
   * So: the weekday in full and the calendar date, with the relative word ("Today", "Yesterday")
   * as the supporting line rather than the other way round. The greeting is gone entirely — it was
   * only ever true on today, and it was occupying the line that should have carried the date.
   */
  const weekdayFull = viewing.toLocaleDateString(undefined, { weekday: 'long' });
  const fullDate = viewing.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /* The greeting must be TRUE on both ends: "back" waits for a first logged session, and only a
     name the athlete actually gave is used — greeting the fallback persona ("Welcome back,
     Athlete" on a first-ever visit) is the exact copy DESIGN.md records as this header's
     anti-pattern. */
  const givenName = state.profile?.display_name?.trim() ?? '';
  const greeting = givenName
    ? `${sessions.length > 0 ? 'Welcome back' : 'Welcome'}, ${givenName}`
    : '';

  return (
    /* `ff-dense` re-scales the whole type ramp for this screen (see globals.css) — Today stacks
       seven cards of numbers, and at the house scale they read zoomed-in on a 390px phone. The
       stack gap comes down with it so the saving is vertical as well as textual. */
    <div className="ff-dense space-y-4" data-testid="today-view">
      {/* THE FIRST-RUN TOUR. Mounted on Today because Today is where onboarding lands and where a
          returning user starts — orienting someone on the five tabs anywhere else would mean
          explaining a screen they are not on. It renders nothing at all unless it is owed (see the
          component: it opens from an effect, never from a render-time store read). */}
      <FirstRunTour />
      <header>
        <h1
          className="font-display text-display font-bold"
          data-testid="today-heading"
        >
          {weekdayFull}
        </h1>
        {/* break-words: the greeting carries a user-chosen name, and an unbreakable 60-char name
            must wrap inside the column rather than drag the whole page sideways. */}
        <p
          className="min-w-0 break-words text-sm text-muted-foreground"
          data-testid="today-subheading"
        >
          {fullDate}
          {/* The relative word only when there IS one. Beyond ±1 day, dayLabel falls back to the
              calendar date — which this line just printed, so appending it would state the same
              fact twice. */}
          {!onToday && Math.abs(dayOffset(date)) <= 1 && <> · {dayLabel(date)}</>}
          {onToday && greeting ? ` · ${greeting}` : ''}
        </p>
      </header>

      <DateNav
        compact
        value={date}
        onChange={setDate}
        hasContent={(iso) => (state.logsByDate[iso]?.length ?? 0) > 0}
      />

      {/* THE WORKOUT ANCHORS THE SCREEN. It used to sit third, under the streak card and the
          check-in — the athlete's actual job buried beneath its own garnish, which is the
          identical-card-stack failure in one image. Order now follows the order of needs:
          train, adapt, everything else. */}
      {day ? (
        // STEEL. The hero and the workout player's set card are the two structural surfaces that
        // anchor a screen; making them read as machined metal rather than paper is enough to shift
        // the app's whole material feel without flattening the premium/standard hierarchy.
        <Card variant="steel" className="overflow-hidden !p-0 shadow-[var(--shadow-card)]">
          {/* Parked = dimmed and inert, NOT hidden: the plan still exists and saying so is the
              point. aria-hidden with pointer-events-none keeps it out of tab order too. */}
          <div
            className={restingToday ? 'pointer-events-none select-none opacity-50 blur-[2px]' : undefined}
            aria-hidden={restingToday || undefined}
          >
            <div className="px-5 pt-4">
              {/* No kicker. The day's name IS the headline — set at anchor scale in the display
                  face — and whose day it is lives in the subline, where it is a fact rather than
                  a label. */}
              <h2 className="font-display text-2xl font-bold text-foreground">{day.name}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {onToday ? 'Today' : dayLabel(date)} · {exerciseCountLabel(day.exercises.length)} ·
                from {routine.name}
              </p>
            </div>
            <div className="px-5 pt-4 pb-1">
              <ul className="mb-4 space-y-1.5 text-sm">
                {day.exercises.slice(0, 4).map((e) => (
                  <li key={e.id} className="flex justify-between text-foreground">
                    <span className="truncate pr-3">{e.exercise_name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {e.sets} × {e.rep_min}–{e.rep_max}
                    </span>
                  </li>
                ))}
                {day.exercises.length > 4 && (
                  <li className="text-xs text-muted-foreground">+{day.exercises.length - 4} more</li>
                )}
              </ul>
            </div>
          </div>
          <div className="px-5 pb-4">
            {/* STARTING A SESSION IS A TODAY ACTION. The player writes into the live log as you
                lift, so firing it from a Thursday you are merely previewing would record the sets
                against now, not against Thursday. Past and future days are therefore readable but
                not startable, and the copy says which it is rather than showing a dead button. */}
            {onToday ? (
              restingToday ? (
                <div data-testid="rest-parked">
                  <p className="mb-2 rounded-field border border-border bg-surface-2 px-3 py-2 text-center text-xs text-muted-foreground">
                    You chose a rest day — this session is parked, not deleted.
                  </p>
                  <Button
                    variant="secondary"
                    block
                    data-testid="rest-override-open"
                    onClick={() => setRestConfirmOpen(true)}
                  >
                    I want to train anyway
                  </Button>
                </div>
              ) : (
                <ButtonLink href={`/workout/${day.id}`} size="lg" block glow texture>
                  Start workout
                </ButtonLink>
              )
            ) : (
              <p
                className="rounded-field border border-border bg-surface-2 px-3 py-2.5 text-center text-sm text-muted-foreground"
                data-testid="workout-not-today"
              >
                {isFuture(date)
                  ? 'Planned for this day — start it when it comes around.'
                  : 'This is what was scheduled. Sessions are logged on the day you train them.'}
              </p>
            )}
          </div>
        </Card>
      ) : (
        onToday ? (
          <QuickWorkoutCard restDay />
        ) : (
          <Card className="shadow-[var(--shadow-card)]" data-testid="rest-day-other">
            <CardTitle>Rest day</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {/* Only the relative words survive lowercasing — "sat, aug 1" is a mangled date. */}
              No session scheduled for{' '}
              {Math.abs(dayOffset(date)) <= 1 ? dayLabel(date).toLowerCase() : dayLabel(date)}.
            </p>
          </Card>
        )
      )}

      {/* Morning check-in — directly under the session it adapts, and only for TODAY's training
          day: its offers edit today's session, and editing a past or future day from here would
          be a lie about what the buttons do. */}
      {day && onToday && <MorningCheckIn routine={routine} day={day} />}

      {/* Even on a training day, "not today's session" is a real need — pulling tomorrow forward
          is the whole reason this exists. Shown after the plan so it never competes with it — and
          not at all while a rest decision stands: the override sheet is the ONE sanctioned door
          back into training on a rest day, so a second unguarded door here would defeat it. */}
      {day && onToday && !restingToday && <QuickWorkoutCard />}

      {/* Weekly-target streak + smith rank (§6 P1-11) — real data off the log, shown after the
          work, because motivation garnish above the meal was the old screen's tell. */}
      <StreakCard
        streak={streak.streak}
        daysThisWeek={streak.daysThisWeek}
        target={streak.target}
        metThisWeek={streak.metThisWeek}
        strikes={sessions.length}
      />

      {/* Ask your coach — the knowledge base is one tap from home (§KB). */}
      <CoachEntryCard />

      {/* THE LEDGER. Nutrition and body weight used to be two more full-width cards in the
          stack — the dark-dashboard default this screen refuses. They are rows now: hairline
          separations, one heat bar, one action each. The workout is the only thing on Today
          that deserves a card's weight. */}
      <section className="border-y border-border" data-testid="today-ledger">
        <div className="py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Nutrition</p>
            {/* Rendered only when it has a job: an empty link is still a tab stop, and a screen
                reader announces a nameless "link" pointing nowhere the user can predict. */}
            {hasLogged && (
              <Link href="/nutrition" className="text-sm font-semibold text-accent">
                Log food
              </Link>
            )}
          </div>
          {hasLogged ? (
            <>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={
                    'h-full w-full origin-left rounded-full ' +
                    (nutrition.kcal > targets.kcal_target ? 'bg-energy' : 'ff-heat')
                  }
                  style={{
                    transform: `scaleX(${Math.min(1, nutrition.kcal / Math.max(1, targets.kcal_target))})`,
                  }}
                />
              </div>
              <p className="tabular mt-1.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {Math.round(nutrition.kcal).toLocaleString()}
                </span>{' '}
                / {targets.kcal_target.toLocaleString()} kcal ·{' '}
                <span className="font-semibold text-foreground">
                  {Math.round(nutrition.protein_g)}
                </span>{' '}
                / {targets.protein_g_target} g protein
              </p>
            </>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm text-muted-foreground">
                Nothing logged yet today. Your target is{' '}
                <span className="font-semibold text-foreground">{targets.kcal_target} kcal</span> ·{' '}
                {targets.protein_g_target} g protein.
              </p>
              <ButtonLink href="/nutrition" variant="secondary" className="shrink-0">
                Log your first meal
              </ButtonLink>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Body weight</p>
            {/* The row keeps its promise: once weigh-ins exist, this line IS the trend — latest
                weight and the drift across the log — not an instruction to start. */}
            {state.weights.length > 0 ? (
              <p className="tabular text-xs text-muted-foreground" data-testid="ledger-weight">
                <span className="font-semibold text-foreground">
                  {state.weights[state.weights.length - 1]!.kg} kg
                </span>
                {state.weights.length > 1 && (
                  <>
                    {' '}
                    ·{' '}
                    {(() => {
                      const d =
                        state.weights[state.weights.length - 1]!.kg - state.weights[0]!.kg;
                      return `${d >= 0 ? '+' : ''}${d.toFixed(1)} kg over ${state.weights.length} entries`;
                    })()}
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Log weigh-ins to see your trend.</p>
            )}
          </div>
          {/* Straight to the WEIGHT tab — "Add" that lands on Trends is a broken promise. */}
          <ButtonLink href="/progress?tab=weight" variant="secondary" className="shrink-0">
            Add <ArrowRightIcon size={16} />
          </ButtonLink>
        </div>
      </section>

      {/* THE OVERRIDE SHEET — the one sanctioned way from an accepted rest day back into
          training. Restates the morning's why, recommends the halved dose, lets the full session
          through only as an explicit second choice, and records that choice honestly. */}
      <Sheet
        open={restConfirmOpen}
        onClose={() => setRestConfirmOpen(false)}
        title="You chose rest today"
      >
        <div className="space-y-3" data-testid="rest-override-sheet">
          {todayEntry && (
            <p className="text-sm text-muted-foreground" data-testid="rest-override-reason">
              This morning: {todayEntry.verdict.reason}
            </p>
          )}
          {todayEntry?.verdict.safety && (
            <p className="text-sm font-medium text-danger" data-testid="rest-override-safety">
              You said you were feeling unwell. Training through illness usually costs more days
              than it saves — if you&rsquo;re still off, keep the rest day and see a doctor if it
              persists.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Genuinely feeling better? Don&rsquo;t jump straight back to full load — ease in:
          </p>
          <div className="flex flex-col gap-2">
            <Button block data-testid="rest-override-half" onClick={trainHalfInstead}>
              Do it at half the sets (recommended)
            </Button>
            <Button
              variant="secondary"
              block
              data-testid="rest-override-full"
              onClick={trainFullAnyway}
            >
              Full session — I feel fine now
            </Button>
            <Button
              variant="ghost"
              block
              data-testid="rest-override-keep"
              onClick={() => setRestConfirmOpen(false)}
            >
              Keep resting
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * Weekly-target streak card (§6 P1-11). Counts consecutive weeks hitting the training target
 * (N-of-target days), not a fragile daily chain; one free "forge freeze" per streak is already
 * applied in {@link weeklyStreak}. Ember flame + gold, with the blueprint copy.
 */
function StreakCard({
  streak,
  daysThisWeek,
  target,
  metThisWeek,
  strikes,
}: {
  streak: number;
  daysThisWeek: number;
  target: number;
  metThisWeek: boolean;
  /** Total finished sessions — the currency of the smith-rank ladder. */
  strikes: number;
}) {
  const standing = rankFor(strikes);
  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="forge-card">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold tracking-tight">
            {streak > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <FlameSolidIcon size={16} className="text-energy" aria-hidden />
                Week streak: <span className="text-accent-soft">{streak}</span>
              </span>
            ) : (
              'Start your streak'
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {streak > 0
              ? 'keep the forge hot.'
              : `Train ${target} days this week to light the forge.`}
          </p>
        </div>
        {/* THE RANK CREST. Rank name over the strike count, hammer beside it — the ladder in
            four words. The detail (progress to the next rung) sits under the day pips, where a
            second glance goes; the crest is for the first one. */}
        <div
          className="shrink-0 rounded-field border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-accent-muted px-2.5 py-1.5 text-right"
          data-testid="forge-rank"
        >
          <p className="flex items-center justify-end gap-1 text-[13px] font-bold leading-tight text-accent">
            <HammerIcon size={13} />
            {standing.rank.name}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
            {strikes} {strikes === 1 ? 'strike' : 'strikes'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: target }).map((_, i) => (
          <span
            key={i}
            className={
              'h-2 flex-1 rounded-full ' + (i < daysThisWeek ? 'bg-accent' : 'bg-muted')
            }
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {metThisWeek ? (
          <span className="font-semibold text-success">
            Target hit — {daysThisWeek}/{target} days this week
          </span>
        ) : (
          <>
            Trained {daysThisWeek} of {target} days this week
          </>
        )}
      </p>
      {/* Progress to the next rung — a real bar over real numbers, not a vibe. Hidden at the top
          of the ladder, where "N to next" stops being true. */}
      {standing.next && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-2 text-[11px] font-semibold">
            <span className="uppercase tracking-wide text-muted-foreground">
              Next rank · {standing.next.name}
            </span>
            <span className="text-accent tabular-nums" data-testid="forge-to-next">
              {standing.toNext} {standing.toNext === 1 ? 'workout' : 'workouts'} away
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="ff-heat h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.round(standing.progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
