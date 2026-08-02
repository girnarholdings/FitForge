'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Sheet } from '@/components/ui';
import {
  SwapIcon,
  ChevronDownIcon,
  ClipboardIcon,
  InfoIcon,
  ClockIcon,
  PlateStackIcon,
} from '@/components/ui/icons';
import { m, AnimatePresence, SPRING } from '@/components/ui/motion';
import { MuscleMapThumb } from '@/components/illustrations';
import {
  finalizeOnboarding,
  planCoverageForDraft,
  prescriptionAdjustmentForDraft,
  describeDay,
  exerciseCountLabel,
} from '@/lib/demo/generate';
import { dayStats, routineStats, setCountLabel } from '@/lib/demo/insights';
import { getState, update, resolveProgressionScheme } from '@/lib/demo/store';
import {
  mockSuggestSubstitutes,
  type Routine,
  type RoutineExercise,
} from '@/components/features/_mock/data';
import { useOnboarding } from '../OnboardingProvider';
import { OnboardingFooter } from '../OnboardingFooter';
import { runDietGenerationForDraft } from '../dietGeneration';
import { PlanPreviewDiet } from './PlanPreviewDiet';

interface SubHit {
  exercise_id: string;
  slug: string;
  name: string;
  score: number;
  reason: string | null;
}

/**
 * Screen 12 · Plan preview (§2.2 / §7.5) — DEMO MODE. Generates the starter routine from the draft
 * with the §7.5 split rule over the fixture catalog, persists it, shows it, and allows swaps
 * (§7.4). "Start plan" routes to /today.
 *
 * THIS IS THE LAST SCREEN BEFORE THE PLAN IS THE ATHLETE'S PLAN, and it was the last place in
 * onboarding still answering "what am I committing to?" with a truncated line. The day row computed
 * a full `dayStats` and rendered two fields of it, then clipped both the day's name and its summary
 * with `truncate` — so "Workout A · Squat · Bench · Row" arrived as "Workout A · Squ…" on a 390 px
 * phone, with the rest in a `title` attribute no touch device can reach. That is the same
 * "the details are cut out, it's just summary" the split cards were reported for, and it is fixed
 * the same way: nothing on the face is truncated, and the numbers that were already in hand — hard
 * sets, wall-clock minutes, the movement patterns the day covers — are shown instead of discarded.
 *
 * Every figure here comes from `lib/demo/insights` (`dayStats` / `routineStats`), which is the same
 * derivation the split detail and the Workouts screen read. The week totals used to be two
 * hand-rolled reductions in this file; a second implementation of a number is how two screens end
 * up quoting different figures for one plan.
 */
export function PlanPreviewStep() {
  const { draft, goTo, hydrated } = useOnboarding();
  const router = useRouter();
  const [routine, setRoutine] = React.useState<Routine | null>(null);
  const [openDay, setOpenDay] = React.useState<string | null>(null);
  const [swap, setSwap] = React.useState<{ dayId: string; rowId: string; exerciseId: string } | null>(null);
  const [subs, setSubs] = React.useState<SubHit[]>([]);
  const ranRef = React.useRef(false);
  /** The one diet generation this screen owes — held so Start plan can await it, never re-run it. */
  const dietRun = React.useRef<Promise<unknown> | null>(null);

  /**
   * Generate + persist once (§7.5) — but ONLY ONCE THE DRAFT IS REAL.
   *
   * `finalizeOnboarding` WRITES the draft it is handed straight into the store. React runs child
   * effects before parent effects, so the []-dep version of this ran against `emptyDraft()` and
   * persisted it over the athlete's answers — reproducible by cold-loading
   * /onboarding/plan_preview, which is a reachable resume URL. Sex, split and every equipment
   * answer came back as defaults.
   *
   * Gating on `hydrated` is the whole fix: it flips inside the provider's own mount effect, i.e.
   * strictly after localStorage has been read, so the first plan generated here is the plan the
   * athlete actually configured. `ranRef` still guards against a second run once it flips.
   */
  React.useEffect(() => {
    if (!hydrated || ranRef.current) return;
    ranRef.current = true;
    const r = finalizeOnboarding(draft);
    setRoutine(r);
    setOpenDay(r.days[0]?.id ?? null);
    // THE MEALS GENERATE HERE TOO, for BOTH modes — the preview is where "what am I committing
    // to?" gets answered, and a diet first seen days after commitment was the old failure. After
    // finalizeOnboarding so the targets it needs are real; fire-and-track so the screen renders
    // the training plan immediately and the meal card appears when the store fills (the card
    // subscribes). Start plan awaits this same promise rather than running a second generation —
    // a re-run would clobber any swap made right here on this screen.
    dietRun.current = runDietGenerationForDraft(draft, getState().targets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const openSwap = (dayId: string, row: RoutineExercise) => {
    setSwap({ dayId, rowId: row.id, exerciseId: row.exercise_id });
    setSubs(mockSuggestSubstitutes(row.exercise_id, 5));
  };

  const applySwap = (sub: SubHit) => {
    if (!swap) return;
    const next = update((s) => {
      if (!s.routine) return s;
      const days = s.routine.days.map((d) =>
        d.id !== swap.dayId
          ? d
          : {
              ...d,
              exercises: d.exercises.map((e) =>
                e.id !== swap.rowId
                  ? e
                  : { ...e, exercise_id: sub.exercise_id, exercise_slug: sub.slug, exercise_name: sub.name },
              ),
            },
      );
      return { ...s, routine: { ...s.routine, days } };
    });
    setRoutine(next.routine);
    setSwap(null);
  };

  const startPlan = async () => {
    // ensure everything is persisted, then head to Today.
    if (!getState().completedAt) finalizeOnboarding(draft);
    // The 7-day diet plan generated when this screen mounted (both modes) — await it so it is
    // in the store before Today renders, but NEVER run it again: the athlete may have swapped
    // dishes on this very screen, and a second generation would silently discard those swaps.
    // The cold-resume fallback (a reload landing here with the effect not yet run) still
    // generates once. One call into the never-throw diet boundary — a missing or failing diet
    // engine changes nothing about landing on Today.
    await (dietRun.current ?? runDietGenerationForDraft(draft, getState().targets));
    router.push('/today');
  };

  const targets = getState().targets;
  // The whole week in one derivation. Two inline reductions used to live here and answered only
  // "days" and "exercises"; `routineStats` answers those PLUS the two figures that decide whether a
  // week is livable — hard sets and wall-clock minutes — from the same composition every other
  // screen reads, so the plan preview can never disagree with the Workouts screen about its own plan.
  // The scheme is chosen one step earlier, so this screen — the last look before the plan becomes
  // the athlete's plan — must quote the sets it will actually run. Without it, a lifter who picked
  // reverse pyramid would be shown a week that is several sets and several minutes longer than the
  // one the player then hands them.
  const scheme = React.useMemo(
    () => resolveProgressionScheme(getState()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read whenever the draft moves
    [draft],
  );
  const week = React.useMemo(
    () => (routine ? routineStats(routine, scheme) : null),
    [routine, scheme],
  );

  // M1 — when equipment / protected areas genuinely thin the plan out, SAY SO here rather than
  // quietly shipping a skeleton week. Derived from the same generation pass that built `routine`.
  const coverage = React.useMemo(() => planCoverageForDraft(draft), [draft]);

  // The rest/rep numbers in the day detail below are sex-adjusted for a female draft, and an
  // unexplained personalisation about the athlete's body is indistinguishable from a bug. This is
  // the label `sexAdjustedPrescription` returns precisely so the numbers can never ship bare.
  const prescription = React.useMemo(() => prescriptionAdjustmentForDraft(draft), [draft]);

  return (
    <div className="space-y-4">
      {!routine && <p className="text-sm text-muted-foreground">Building your plan…</p>}
      {/* Marks "the plan finished generating", which is the only point at which the store is
          settled. The hydration regression spec waits on this rather than on a timeout — a
          timeout would pass just as happily against the bug it exists to catch. */}
      {routine && <span hidden data-testid="plan-preview" />}

      {routine && week && (
        <>
          {/* Forged-plan summary — the "money moment" premium card (§P2-14). */}
          <Card premium className="p-5">
            {/* No eyebrow. The plan's NAME is the payoff of the whole questionnaire — it takes
                the display voice at full size, with the coach's clipboard handed over beside it.
                A label announcing "your forged plan" above it was the heading apologizing for
                itself. */}
            <p className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
              <ClipboardIcon size={20} className="shrink-0 text-accent" />
              {routine.name}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-display text-3xl font-semibold leading-none tabular-nums text-accent">
                  {week.trainingDays}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  days / week
                </p>
              </div>
              <div>
                {/* HARD SETS, not exercise count. Six exercises at two sets and four at five sets
                    are not the same week, and sets is the currency every volume target in this app
                    is expressed in — the exercise count moves to the line below, where it belongs. */}
                <p className="font-display text-3xl font-semibold leading-none tabular-nums text-foreground">
                  {week.setCount}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  sets / week
                </p>
              </div>
              <div>
                <p className="font-display text-3xl font-semibold leading-none tabular-nums text-foreground">
                  {targets?.kcal_target ?? '—'}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  kcal / day
                </p>
              </div>
            </div>
            <p
              className="mt-3 text-center text-[11px] leading-snug text-muted-foreground"
              data-testid="plan-week-summary"
            >
              {exerciseCountLabel(week.exerciseCount)} across the week · about {week.minutes} min of
              training
            </p>
          </Card>
          {coverage.limited && (
            <Card className="border-accent-soft/60 bg-surface-2" data-testid="plan-limited-notice">
              <div className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-accent" aria-hidden>
                  <InfoIcon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{coverage.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {coverage.body}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => goTo(coverage.actionStep)}
                      data-testid="plan-limited-action"
                    >
                      {coverage.actionLabel}
                    </Button>
                    {coverage.cause === 'both' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => goTo('exclusions')}
                        data-testid="plan-limited-action-alt"
                      >
                        Review protected areas
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* A disliked lift the catalogue had no easier same-pattern replacement for, so it
              stayed. Rendered on its OWN condition, never `coverage.limited`: this is not the plan
              being cut short, it is one lift still being there, and it must not fire the "running
              lean" banner. Deliberately quieter than that card for the same reason. Leaving it
              unexplained is the exact silent hole `keptDislikesNote` was written to close. */}
          {coverage.keptDislikes.length > 0 && (
            <p
              className="rounded-card border border-border bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
              data-testid="plan-kept-dislikes"
            >
              {coverage.keptDislikesNote}
            </p>
          )}

          {/* Sits with the plan, not inside one day, because the adjustment applies to every row's
              rest and rep figures below. `adjusted` is false for every draft it did not change. */}
          {prescription.adjusted && (
            <p
              className="rounded-card border border-border bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
              data-testid="plan-prescription-note"
            >
              {prescription.label}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Tap a day to review it — swap anything you like.
          </p>
          <div className="space-y-3">
            {routine.days.map((day) => {
              const expanded = openDay === day.id;
              const stats = dayStats(day, scheme);
              const panelId = `plan-day-panel-${day.day_index}`;
              return (
                <Card key={day.id} className="overflow-hidden p-0">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 p-4 text-left"
                    onClick={() => setOpenDay(expanded ? null : day.id)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    data-testid={`plan-day-toggle-${day.day_index}`}
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-muted/60">
                        {/* Same silhouette rule as the Workouts session card, from the same
                            shared derivation — a day must never light up differently on two
                            screens. The secondary wash comes with it, which the private copy this
                            replaced never had. */}
                        <MuscleMapThumb
                          primary={stats.primary}
                          secondary={stats.secondary}
                          height={40}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* WRAPS, deliberately. This used to `truncate`, which turned a day called
                            "Upper body · push emphasis" into "Upper body · pu…" and pushed the rest
                            into a tooltip a phone cannot open. A second line costs ~16 px; a clipped
                            day name costs the athlete the ability to tell their sessions apart. */}
                        <span
                          className="block font-semibold leading-snug text-foreground"
                          data-testid={`plan-day-name-${day.day_index}`}
                        >
                          {day.name}
                        </span>
                        {/* Honest per-day copy (M1 / m1): the count is pluralised and the
                            movements listed are the ones the day ACTUALLY contains. */}
                        <span
                          className="block text-xs leading-snug text-muted-foreground"
                          data-testid={`plan-day-summary-${day.day_index}`}
                        >
                          {stats.empty ? 'Rest / recovery' : describeDay(day)}
                        </span>
                        {/* WHAT IT COSTS. `dayStats` was already being computed on this line and
                            only its two silhouette fields were used — the hard-set count and the
                            minute estimate were derived and thrown away, on the one screen where
                            "can I actually do this week?" is the question being asked. */}
                        {!stats.empty && (
                          <span
                            className="mt-1.5 flex flex-wrap items-center gap-1.5"
                            data-testid={`plan-day-stats-${day.day_index}`}
                          >
                            <StatChip icon={<PlateStackIcon size={10} />}>
                              {setCountLabel(stats.setCount)}
                            </StatChip>
                            <StatChip icon={<ClockIcon size={10} />}>~{stats.minutes} min</StatChip>
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronDownIcon
                      size={18}
                      aria-hidden
                      className={
                        'mt-0.5 shrink-0 text-muted-foreground transition-transform duration-200 ' +
                        (expanded ? 'rotate-180' : '')
                      }
                    />
                  </button>
                  {/* Height-animated like the split card's disclosure, so the day reads as having
                      PUSHED the list down rather than replaced it — the row you tapped stays under
                      your finger. */}
                  <AnimatePresence initial={false}>
                    {expanded && (
                      <m.div
                        key="detail"
                        id={panelId}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING.panel}
                        className="overflow-hidden border-t border-border"
                        data-testid={`plan-day-detail-${day.day_index}`}
                      >
                        <ul>
                          {day.exercises.map((row) => (
                            <li
                              key={row.id}
                              className="flex items-start justify-between gap-2 px-4 py-3 text-sm"
                            >
                              <span className="min-w-0">
                                <span className="block leading-snug text-foreground">
                                  {row.exercise_name}
                                </span>
                                <span className="block text-xs leading-snug text-muted-foreground">
                                  {row.sets} × {row.rep_min}–{row.rep_max} · {row.rest_seconds}s rest
                                </span>
                              </span>
                              <button
                                type="button"
                                aria-label={`Swap ${row.exercise_name}`}
                                onClick={() => openSwap(day.id, row)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent-muted"
                              >
                                <SwapIcon size={13} /> Swap
                              </button>
                            </li>
                          ))}
                          {stats.empty && (
                            <li className="px-4 py-3 text-xs text-muted-foreground">
                              Rest / recovery day.
                            </li>
                          )}
                        </ul>
                        {/* UNABRIDGED, unlike the one-line `describeDay` above it. Same rows, same
                            label table, no slice — the face may show LESS than the detail, but the
                            two can never claim different things about what the day contains. */}
                        {stats.patterns.length > 0 && (
                          <p
                            className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted-foreground"
                            data-testid={`plan-day-patterns-${day.day_index}`}
                          >
                            Covers {stats.patterns.join(' · ')}
                          </p>
                        )}
                      </m.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })}
          </div>

          {/* The meal half of the commitment — same grammar, same swap machinery as Nutrition's
              own plan surface. Renders only once the diet generation lands in the store. */}
          <PlanPreviewDiet />
        </>
      )}

      <Sheet open={swap !== null} onClose={() => setSwap(null)} title="Swap exercise">
        {subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alternatives found.</p>
        ) : (
          <div className="space-y-2">
            {subs.map((s) => (
              <button
                key={s.exercise_id}
                type="button"
                onClick={() => applySwap(s)}
                className="flex w-full flex-col rounded-xl border border-border bg-surface-2 p-3 text-left hover:border-accent"
              >
                <span className="font-medium text-foreground">{s.name}</span>
                {s.reason && <span className="text-xs text-muted-foreground">{s.reason}</span>}
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <div className="flex-1" />
      <OnboardingFooter
        step="plan_preview"
        continueLabel="Start plan"
        canContinue={routine !== null}
        onContinue={startPlan}
      />
    </div>
  );
}

/**
 * The same stat chip the split detail uses, so a set count and a minute estimate look identical
 * wherever a session is described. A `<span>` rather than a `<div>`: it renders inside the day
 * row's `<button>`, and a block element inside a button is invalid HTML that React will not warn
 * about but hydration and screen readers both dislike.
 */
function StatChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-chip bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-foreground">
      {icon && (
        <span className="text-accent" aria-hidden>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
