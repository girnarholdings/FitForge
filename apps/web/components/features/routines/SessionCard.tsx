'use client';

/**
 * SESSION CARD — a workout day you can SEE before you commit to it.
 *
 * The row this replaces gave the athlete a name, one truncated line and a Start link. That is a
 * request to spend an hour on trust. A coach handing over a session answers these questions, in
 * this order, and that order is the layout of this card:
 *
 *   · WHAT IT TRAINS — the silhouette, lit up. Directly-trained muscles fill solid, muscles that
 *     only take indirect credit wash in behind them, so "leg day" is a picture before it is a word.
 *   · WHAT IT COSTS — hard sets. The one number that predicts both the stimulus and the fatigue.
 *   · HOW LONG      — estimated minutes, so it can be matched against the gap in a real day.
 *   · HOW IT RUNS   — the progression scheme in force, because under a heavy-first scheme walking
 *     in unaware that set 1 is the hardest set of the day is the exact failure its caution exists
 *     to prevent.
 *   · THE ANCHOR LIFT, by name. "Leg day" and "squat day" are the same session and completely
 *     different decisions: the heavy compound is what a lifter checks their readiness against.
 *   · WHEN IT WAS LAST TRAINED. The honest half of "am I recovered?" is the date — a readiness
 *     score would be an invented number wearing the clothes of a measurement.
 *
 * Everything below that is a tap away rather than on the face, because a card that shows every
 * number shows none of them: at 390 px the exercise list, the rep ranges, the kit list and the
 * pattern coverage are detail you go looking for, not detail you scan.
 *
 * DELIBERATELY ABSENT, and it must stay that way: estimated tonnage or calories for a session
 * nobody has performed (both require inventing loads this app refuses to invent), any 1–10
 * "difficulty" score (an unfalsifiable composite), per-muscle % of weekly goal (that is
 * `PlanTargets`' job at week level), and exercise count as a headline stat — 6 exercises × 2 sets
 * and 4 × 5 are not the same session, and sets is the honest cost.
 *
 * All numbers come from `lib/demo/insights.ts` and `@fitforge/shared/rules` — this file computes
 * nothing of its own.
 */
import * as React from 'react';
import Link from 'next/link';
import { PROGRESSION_LIBRARY, prescribeSets, type ProgressionScheme } from '@fitforge/shared/rules';
import { MuscleMapThumb } from '@/components/illustrations';
import {
  BarbellIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  LayersIcon,
  PlateStackIcon,
} from '@/components/ui/icons';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { slugForExerciseOrNull } from '@/lib/equipment/slugForExercise';
import { m, AnimatePresence, SPRING, staggerItem } from '@/components/ui/motion';
import { describeDay } from '@/lib/demo/generate';
import { dayStats, lastTrainedLabel, setCountLabel } from '@/lib/demo/insights';
import { useWorkoutSessions } from '@/components/features/shared/workoutLog';
import { fmtSets } from '@/components/features/shared/volumeMath';
import {
  WEEKDAY_LABELS,
  mockExerciseById,
  type RoutineDay,
} from '@/components/features/_mock/data';

/**
 * How many muscles fit on the collapsed face before the rest become "+N more". Four, because
 * three routinely cuts off the muscle a day is NAMED for when a session carries incidental direct
 * work (planks and carries both train a muscle directly), and five wraps to a third line.
 */
const FACE_MUSCLES = 4;

/** How many equipment portraits fit beside the two stat chips before the row wraps. */
const FACE_EQUIPMENT = 3;

/**
 * The distinct kit a day calls for, in the order the exercises come up.
 *
 * "What will I have to walk across the gym for" is a scheduling fact — it decides whether a
 * session is doable at 6pm on a Monday — and until now it was only discoverable by opening the day
 * and reading every exercise name. De-duplicated, capped, and EMPTY rather than guessed when
 * nothing in the day names equipment: a bodyweight day should draw nothing, not a stray dumbbell.
 */
function dayEquipment(day: RoutineDay): string[] {
  const seen: string[] = [];
  for (const ex of day.exercises) {
    // Shared with the player header, the swap sheet and the PR list — this was the THIRD private
    // copy of the same lookup, and three copies of a mapping guarantee that one exercise ends up
    // drawn as a barbell on one screen and a cable on another. The no-fallback variant is the
    // right one here: see its doc comment.
    const slug = slugForExerciseOrNull(ex.exercise_id);
    if (slug && !seen.includes(slug)) seen.push(slug);
    if (seen.length >= FACE_EQUIPMENT) break;
  }
  return seen;
}

/**
 * Does a compound-only scheme quietly run straight sets on any of this day's isolation work?
 *
 * The ONLY scheme fact this file still derives for itself, and it is a boolean rather than a
 * number. Everything countable — performed sets, dropped sets, minutes — now comes from `dayStats`,
 * because the private `sessionShape()` that used to compute those here is exactly how the card face
 * ended up advertising "20 sets · ~49 min" for a session the player ran as 18, with the correction
 * whispered inside a collapsed disclosure. One number, one source, or the two disagree.
 */
function hasSubstitutedIsolation(day: RoutineDay, scheme: ProgressionScheme): boolean {
  return day.exercises.some(
    (row) =>
      prescribeSets(
        {
          sets: row.sets,
          rep_min: row.rep_min,
          rep_max: row.rep_max,
          target_rpe: row.target_rpe,
          mechanics: mockExerciseById(row.exercise_id)?.mechanics ?? null,
        },
        scheme,
      ).substituted,
  );
}

export interface SessionCardProps {
  day: RoutineDay;
  /** where Start goes — the player for this day */
  href: string;
  expanded: boolean;
  onToggle: () => void;
  /**
   * The progression scheme in force. Resolved by the CALLER (`resolveProgressionScheme`) rather
   * than read here, so a list of five cards subscribes to the store once instead of five times —
   * and so every card on a screen is guaranteed to be quoting the same scheme.
   */
  scheme?: ProgressionScheme;
  /** testid prefix, so the routine list and the editor can address their own cards */
  testIdPrefix?: string;
}

export function SessionCard({
  day,
  href,
  expanded,
  onToggle,
  scheme,
  testIdPrefix = 'routine-day',
}: SessionCardProps) {
  // THE SCHEME GOES IN. Without it every figure below — the set chip, the minutes, the per-muscle
  // split — was computed from what the rows asked for rather than from what the player will run.
  const stats = React.useMemo(() => dayStats(day, scheme), [day, scheme]);
  const face = stats.loads.slice(0, FACE_MUSCLES);
  const kit = React.useMemo(() => dayEquipment(day), [day]);
  const rest = stats.loads.length - face.length;
  const detailId = `${testIdPrefix}-detail-${day.day_index}`;

  // "Am I recovered for this?" answered as a date and nothing more. Reads the real session log,
  // so a day that has never been run says so instead of implying history the athlete never made.
  const sessions = useWorkoutSessions();
  const lastTrained = React.useMemo(() => lastTrainedLabel(sessions, day.id), [sessions, day.id]);

  const substituted = React.useMemo(
    () => (scheme ? hasSubstitutedIsolation(day, scheme) : false),
    [day, scheme],
  );
  const schemeMeta = scheme ? PROGRESSION_LIBRARY[scheme] : null;

  return (
    <m.li
      variants={staggerItem}
      className="overflow-hidden rounded-xl border border-border bg-surface"
      data-testid={`${testIdPrefix}-${day.day_index}`}
    >
      <div className="flex items-start gap-3 p-3">
        {/* The single highest-value pixel on this screen: what the session hits, as a picture. */}
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted/60">
          <MuscleMapThumb primary={stats.primary} secondary={stats.secondary} height={44} />
        </span>

        <div className="min-w-0 flex-1">
          {/* NOT truncated any more — a day called "Upper body · push emphasis" was being cut to
              "Upper body · pu…", which is the complaint this whole card answers. */}
          <p className="text-sm font-semibold leading-snug text-foreground">{day.name}</p>

          {/* The honest one-liner (M1 / m1): pluralised count + the patterns the day ACTUALLY
              contains. Kept verbatim, and kept under this testid, because it is asserted. */}
          <p
            className="mt-0.5 text-xs leading-snug text-muted-foreground"
            data-testid={`routine-day-summary-${day.day_index}`}
          >
            {day.weekday != null ? `${WEEKDAY_LABELS[day.weekday]} · ` : ''}
            {describeDay(day)}
          </p>

          {stats.empty ? (
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Rest / recovery — nothing scheduled for this day.
            </p>
          ) : (
            <>
              {/* Cost and length. Two numbers, not ten. */}
              <div
                className="mt-2 flex flex-wrap items-center gap-1.5"
                data-testid={`${testIdPrefix}-stats-${day.day_index}`}
              >
                <StatChip icon={<PlateStackIcon size={11} />} label={setCountLabel(stats.setCount)} />
                <StatChip icon={<ClockIcon size={11} />} label={`~${stats.minutes} min`} />
                {/* HOW THE SETS ARE SHAPED. The scheme is chosen once in onboarding and then takes
                    effect here, weeks later — this is the chip that closes that loop. Name only:
                    the per-set numbers are the player's job, and printing a top-set rep target on
                    a card would be quoting a figure this screen cannot compute honestly for
                    unloadable movements. */}
                {schemeMeta && (
                  <StatChip
                    icon={<LayersIcon size={11} />}
                    label={schemeMeta.name}
                    testId={`${testIdPrefix}-scheme-${day.day_index}`}
                  />
                )}
                {/* WHAT YOU'LL NEED, drawn. Decorative on purpose: the "Needs" line inside the
                    disclosure is the accessible answer, this is the two-second scan. */}
                {kit.length > 0 && (
                  <span
                    aria-hidden
                    className="ml-0.5 flex items-center gap-1"
                    data-testid={`${testIdPrefix}-equipment-${day.day_index}`}
                  >
                    {kit.map((slug) => (
                      <EquipmentIllustration key={slug} slug={slug} size={18} />
                    ))}
                  </span>
                )}
              </div>

              {/* What it hits, in words, ranked by weighted sets — so the biggest claim on the
                  session is the first thing read, not the alphabetically luckiest muscle. */}
              <ul
                className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"
                data-testid={`${testIdPrefix}-muscles-${day.day_index}`}
              >
                {face.map((load) => (
                  <li key={load.slug} className="text-[11px] leading-none text-muted-foreground">
                    <span className="font-semibold text-foreground">{load.name}</span>{' '}
                    <span className="tabular">{fmtSets(load.sets)}</span>
                  </li>
                ))}
                {rest > 0 && (
                  <li className="text-[11px] leading-none text-muted-foreground">+{rest} more</li>
                )}
              </ul>

              {/* THE ANCHOR LIFT and WHEN YOU LAST DID THIS. One line, because both are single
                  facts — and because two more rows per card at 390 × 664 pushes the third session
                  off the screen, which would answer this complaint by creating it again. */}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
                {stats.anchor && (
                  <span
                    className="inline-flex items-center gap-1"
                    data-testid={`${testIdPrefix}-anchor-${day.day_index}`}
                  >
                    <span className="text-accent" aria-hidden>
                      <BarbellIcon size={12} />
                    </span>
                    Anchored by{' '}
                    <span className="font-semibold text-foreground">
                      {stats.anchor.exercise_name}
                    </span>
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1"
                  data-testid={`${testIdPrefix}-last-${day.day_index}`}
                >
                  <span className="text-muted-foreground" aria-hidden>
                    <CalendarIcon size={12} />
                  </span>
                  {lastTrained}
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Two equal-weight actions. "See what's in it" is deliberately as prominent as "Start":
          the whole point of this pass is that starting is no longer the only thing on offer. */}
      <div className="flex items-stretch border-t border-border">
        <m.button
          type="button"
          onClick={onToggle}
          whileTap={{ scale: 0.97 }}
          transition={SPRING.press}
          aria-expanded={expanded}
          aria-controls={detailId}
          data-testid={`${testIdPrefix}-toggle-${day.day_index}`}
          /* min-h-[44px]: this measured 261 × 32, under the 44 px minimum every other control in
             the app already meets. It is one of the two primary actions on the card. */
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? 'Hide details' : 'See details'}
          <ChevronDownIcon
            size={14}
            aria-hidden
            className={'transition-transform duration-200 ' + (expanded ? 'rotate-180' : '')}
          />
        </m.button>
        <Link
          href={href}
          className="grid shrink-0 place-items-center border-l border-border px-4 text-xs font-semibold text-accent transition-colors hover:bg-accent-muted"
        >
          Start
        </Link>
      </div>

      {/* Height-animated so the list below is understood to have been PUSHED down rather than
          replaced — the row you tapped stays where your finger left it. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="detail"
            id={detailId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING.panel}
            className="overflow-hidden border-t border-border bg-surface-2/50"
            data-testid={detailId}
          >
            {stats.patterns.length > 0 && (
              <p className="px-3 pt-3 text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">Covers</span>{' '}
                {stats.patterns.join(' · ')}
              </p>
            )}

            {/* WHAT YOU'LL BE QUEUING FOR, in words and UNCAPPED. The portraits on the face are
                decorative and capped at three; a kit list that stops early is the one shape that
                can send someone to a gym missing the thing they needed. This is also the only
                accessible reading of the equipment on this card. */}
            {!stats.empty && (
              <p
                className="px-3 pt-2 text-[11px] leading-snug text-muted-foreground"
                data-testid={`${testIdPrefix}-needs-${day.day_index}`}
              >
                <span className="font-semibold text-foreground">Needs</span>{' '}
                {stats.equipment.length > 0
                  ? stats.equipment.join(', ')
                  : 'nothing — bodyweight only'}
              </p>
            )}

            <ul className="p-3 pt-2">
              {day.exercises.map((row, i) => (
                <li key={row.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <Link
                    href={`/exercises/${row.exercise_slug}`}
                    className="min-w-0 text-[13px] leading-snug text-foreground hover:text-accent"
                  >
                    <span className="text-muted-foreground">{i + 1}. </span>
                    {row.exercise_name}
                    {row.superset_group != null && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-accent">
                        superset
                      </span>
                    )}
                  </Link>
                  <span className="shrink-0 text-[11px] tabular text-muted-foreground">
                    {row.sets} × {row.rep_min}–{row.rep_max}
                  </span>
                </li>
              ))}
              {stats.empty && (
                <li className="py-1.5 text-[11px] text-muted-foreground">
                  No exercises in this day yet.
                </li>
              )}
            </ul>

            {/* HOW THESE SETS ACTUALLY RUN. The chip on the face names the scheme; this says what
                it does to the rows listed directly above it — including, when the scheme caps
                working sets, exactly how many of those prescribed sets will not be performed. The
                alternative is a card advertising a set count the player never runs. */}
            {schemeMeta && !stats.empty && (
              <p
                className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground"
                data-testid={`${testIdPrefix}-scheme-note-${day.day_index}`}
              >
                <span className="font-semibold text-foreground">{schemeMeta.name}</span>{' '}
                {schemeMeta.how}
                {substituted && ' Isolation work runs straight sets.'}
                {/* Both numbers come from the SAME `dayStats` the chip on the face is built from,
                    so the note now explains the chip instead of contradicting it. It used to read
                    "Only 18 sets of the 20 above are performed" beside a face chip that said 20 —
                    the honest figure was the one nobody could see without expanding this. */}
                {stats.droppedSets > 0 &&
                  ` Only ${setCountLabel(stats.setCount)} of the ${stats.prescribedSetCount} prescribed above are performed — this scheme caps the big lifts at ${schemeMeta.maxWorkingSets} working sets.`}
              </p>
            )}
            {/* WHERE THE MINUTES GO. The headline is the TOTAL, warm-up ramps included, because
                "will this fit in my evening" is the only question it answers. This line breaks out
                the preparation half so the total is inspectable rather than asserted — P1.14. */}
            {!stats.empty && stats.prepMinutes > 0 && (
              <p
                className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground"
                data-testid={`${testIdPrefix}-prep-${day.day_index}`}
              >
                <span className="font-semibold text-foreground">~{stats.prepMinutes} min</span> of
                that is warm-up ramps — the working sets are about{' '}
                {Math.max(1, stats.minutes - stats.prepMinutes)} min.
              </p>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </m.li>
  );
}

/**
 * The same four answers, without the disclosure or the Start link — for surfaces that are ALREADY
 * showing the day's exercises and only need the read-out (the routine editor).
 *
 * In the editor this doubles as live feedback: drop a set, and the sets / minutes / muscle split
 * move with it, so the consequence of an edit is visible at the moment it is made rather than
 * discovered halfway through the session.
 */
export function SessionSummary({
  day,
  scheme,
  testId = 'session-summary',
}: {
  day: RoutineDay;
  /** the scheme in force, so the editor's live figures match the player's — see `dayStats` */
  scheme?: ProgressionScheme;
  testId?: string;
}) {
  const stats = React.useMemo(() => dayStats(day, scheme), [day, scheme]);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3" data-testid={testId}>
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/60">
        <MuscleMapThumb primary={stats.primary} secondary={stats.secondary} height={52} />
      </span>
      <div className="min-w-0 flex-1">
        {stats.empty ? (
          <p className="text-xs text-muted-foreground">
            Nothing in this day yet — add an exercise below and this will fill in.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatChip icon={<PlateStackIcon size={11} />} label={setCountLabel(stats.setCount)} />
              <StatChip icon={<ClockIcon size={11} />} label={`~${stats.minutes} min`} />
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              {stats.loads.slice(0, 4).map((load, i) => (
                <React.Fragment key={load.slug}>
                  {i > 0 && ' · '}
                  <span className="font-semibold text-foreground">{load.name}</span>{' '}
                  <span className="tabular">{fmtSets(load.sets)}</span>
                </React.Fragment>
              ))}
            </p>
            {/* The lift this day is built around, named. In the editor it is also a sanity check
                on an edit: delete the squat and the anchor changes under your thumb, which is the
                clearest possible signal that the day is no longer the day it was. */}
            {stats.anchor && (
              <p
                className="mt-1 text-[11px] leading-snug text-muted-foreground"
                data-testid={`${testId}-anchor`}
              >
                Anchored by{' '}
                <span className="font-semibold text-foreground">{stats.anchor.exercise_name}</span>
              </p>
            )}
            {stats.patterns.length > 0 && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Covers {stats.patterns.join(' · ')}
              </p>
            )}
            {stats.equipment.length > 0 && (
              <p
                className="mt-1 text-[11px] leading-snug text-muted-foreground"
                data-testid={`${testId}-needs`}
              >
                Needs {stats.equipment.join(', ')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatChip({
  icon,
  label,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-chip bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-foreground"
      data-testid={testId}
    >
      <span className="text-accent" aria-hidden>
        {icon}
      </span>
      {label}
    </span>
  );
}
