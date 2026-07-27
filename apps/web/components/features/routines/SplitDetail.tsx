'use client';

/**
 * SPLIT DETAIL — the week behind the name.
 *
 * The complaint this answers, verbatim: "the splits are very hard to look at properly because even
 * in onboarding the details are cut out, it's just summary." It was literally true — the card
 * offered a `truncate`d name, a one-line blurb and a `truncate`d day strip, and the richest data in
 * the library (`days[].slots`, `progression`, `required_equipment`, every recommendation reason
 * after the first) was loaded into memory and thrown away at render time.
 *
 * A coach handing over a twelve-week program answers five questions before the athlete agrees to
 * it, and they are the five sections below, in the order they get asked:
 *
 *   1. WHY THIS ONE   — every reason it was recommended, not just the first.
 *   2. THE WEEK       — sessions, hard sets, wall-clock time, and the muscles it actually loads.
 *   3. EACH DAY       — the real exercises, sets and rep ranges, with the silhouette lit up and an
 *                       honest minute estimate, so a session can be matched against a real evening.
 *   4. HOW IT ADVANCES— the progression rule, which is the difference between a program and a list.
 *   5. WHAT IT NEEDS  — the kit, checked against what the athlete told us they have.
 *
 * NOTHING HERE IS WRITTEN BY HAND. Days and exercises come from `splitPreview`, which runs the same
 * generator the app will run on confirm; sets/minutes/muscles come from `lib/demo/insights`. A
 * hand-authored "this split gives you squats and bench" would have been fabricated training data
 * and would drift from the plan the moment equipment or a protected area changed.
 *
 * Phone-first: this is a disclosure inside a card that lives in a `.scroll-region` (onboarding) or a
 * `max-h-[85dvh] overflow-y-auto` sheet (browse). It is allowed to be tall — it is never allowed to
 * be truncated, and it never covers the CTA, which lives in the shell's own `.cta-dock` zone.
 */
import * as React from 'react';
import type { SplitDefinition } from '@fitforge/shared/rules';
import { splitIsFeasible } from '@fitforge/shared/rules';
import type { OnboardingDraft } from '@/components/onboarding/types';
import { MuscleMapThumb } from '@/components/illustrations';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { BodyIcon, CheckIcon, ClockIcon, InfoIcon, PlateStackIcon } from '@/components/ui/icons';
import { m, staggerList, staggerItem } from '@/components/ui/motion';
import { fmtSets } from '@/components/features/shared/volumeMath';
import { exerciseCountLabel } from '@/lib/demo/generate';
import { dayCountLabel, setCountLabel } from '@/lib/demo/insights';
import { splitPreview } from '@/lib/demo/splitPreview';
import { useDemoState } from '@/lib/demo/useDemo';
import { resolveProgressionScheme } from '@/lib/demo/store';
import { DEMO_EQUIPMENT } from '@/lib/demo/catalog';

/** How many muscles get named in the week read-out before the rest become "+N more". */
const WEEK_MUSCLES = 6;

/** Same wording as the Workouts screen, so a goal never has two names in one app. */
const GOAL_LABEL: Record<string, string> = {
  strength: 'Strength',
  hypertrophy: 'Build muscle',
  fat_loss: 'Lose fat',
  endurance: 'Endurance',
  general_health: 'General health',
};

/** slug → the name the equipment step showed. Built once; the catalog is a module constant. */
const EQUIPMENT_NAME: Record<string, string> = Object.fromEntries(
  DEMO_EQUIPMENT.map((e) => [e.slug, e.name]),
);

function equipmentLabel(slug: string): string {
  return (
    EQUIPMENT_NAME[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export interface SplitDetailProps {
  split: SplitDefinition;
  /**
   * The athlete's live draft. Onboarding MUST pass it (its draft lives in React state and is only
   * written through on step commit); post-onboarding surfaces may omit it and get the stored one.
   */
  draft?: Partial<OnboardingDraft> | null;
  /** every reason this program was recommended — the whole array, never `reasons[0]` alone */
  reasons?: readonly string[];
  /** testid namespace, e.g. `split-option-ppl-3day` */
  testIdPrefix: string;
}

export function SplitDetail({ split, draft, reasons = [], testIdPrefix }: SplitDetailProps) {
  // Read here rather than taken as a prop because every caller of this component would otherwise
  // have to resolve it, and one that forgot would silently show a week the athlete will not train.
  // Pre-onboarding this is the RECOMMENDATION for the profile so far, which is the same basis the
  // rest of the preview already runs on (and the preview is flagged `provisional` until location
  // is answered).
  const state = useDemoState();
  const scheme = React.useMemo(() => resolveProgressionScheme(state), [state]);
  // Lazy by construction: this component is only mounted while a card is open, so the generation
  // pass happens on the athlete's tap and never once per row of a 26-program list.
  const preview = React.useMemo(
    () => splitPreview(split, draft, scheme),
    [split, draft, scheme],
  );

  const equipmentSlugs = draft?.equipment_slugs ?? null;
  const location = draft?.training_location ?? null;
  const feasible = splitIsFeasible(split, equipmentSlugs, location);
  const owned = React.useMemo(() => new Set(equipmentSlugs ?? []), [equipmentSlugs]);

  const weekMuscles = preview.loads.slice(0, WEEK_MUSCLES);
  const moreMuscles = preview.loads.length - weekMuscles.length;
  const goals = split.goals.map((g) => GOAL_LABEL[g] ?? g).filter(Boolean);

  return (
    <div
      className="space-y-3 border-t border-border bg-surface-2/50 px-3 pb-3 pt-3"
      data-testid={`${testIdPrefix}-detail`}
    >
      {/* 1 · WHY THIS ONE — all of them. The recommender builds up to four reasons and the card
          used to show one, which is how "best match" ended up unexplained. */}
      {reasons.length > 0 && (
        <Section title="Why this fits you">
          <ul className="flex flex-wrap gap-1.5" data-testid={`${testIdPrefix}-reasons`}>
            {reasons.map((r) => (
              <li
                key={r}
                className="inline-flex items-center gap-1 rounded-chip bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-accent"
              >
                <CheckIcon size={11} aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 2 · THE WEEK — the four numbers that decide whether a program is livable. */}
      <Section title="Your week on this program">
        {preview.sessions === 0 ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            With the equipment and protected areas you have given us, we could not fill a single day
            of this program. Pick another split, or add equipment and come back to it.
          </p>
        ) : (
          <div className="flex items-start gap-2.5">
            {/* THE WEEK, DRAWN. The muscle names below answer "how much", but "what does this
                program train?" is a question about a body, and a list of nine words is the slowest
                possible way to answer it. Painted by the same `musclePaint` rule as each day's
                thumbnail, from the same weighted-set aggregation — so the week silhouette is the
                union of the day silhouettes underneath it and cannot drift from them. */}
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/60"
              data-testid={`${testIdPrefix}-week-map`}
            >
              <MuscleMapThumb
                primary={preview.paint.primary}
                secondary={preview.paint.secondary}
                height={50}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-snug text-muted-foreground" data-testid={`${testIdPrefix}-week-summary`}>
                <Figure>{dayCountLabel(preview.sessions)}</Figure> a week ·{' '}
                <Figure>{setCountLabel(preview.setCount)}</Figure> ·{' '}
                <Figure>about {preview.minutes} min</Figure> of training
              </p>
              <ul
                className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"
                data-testid={`${testIdPrefix}-week-muscles`}
              >
                {weekMuscles.map((load) => (
                  <li key={load.slug} className="text-[11px] leading-none text-muted-foreground">
                    <span className="font-semibold text-foreground">{load.name}</span>{' '}
                    <span className="tabular">{fmtSets(load.sets)}</span>
                  </li>
                ))}
                {moreMuscles > 0 && (
                  <li className="text-[11px] leading-none text-muted-foreground">
                    +{moreMuscles} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Section>

      {/* 3 · EACH DAY — the part that was missing entirely. Real names, real sets, real reps.
          When the athlete has not reached the equipment/location steps yet, the exercise names are
          an illustration rather than a promise, and the note below says exactly that. Naming a
          barbell lift to someone who is one screen away from telling us they own two dumbbells is
          the confident-wrong-answer failure mode, not a helpful preview. */}
      <Section title={preview.provisional ? 'Day by day (assuming a full gym)' : 'Day by day'}>
        {preview.provisional && (
          <p
            className="mb-1.5 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground"
            data-testid={`${testIdPrefix}-provisional`}
          >
            <span className="mt-px shrink-0 text-accent" aria-hidden>
              <InfoIcon size={11} />
            </span>
            You have not told us where you train yet, so these are the exercises a well-equipped gym
            would give you. The shape of the week is fixed — the movements get re-picked from your
            own kit once you answer that.
          </p>
        )}
        <m.ol
          className="space-y-2"
          variants={staggerList}
          initial="hidden"
          animate="show"
          data-testid={`${testIdPrefix}-days`}
        >
          {preview.days.map(({ day, stats }) => (
            <m.li
              key={day.id}
              variants={staggerItem}
              className="rounded-lg border border-border bg-surface p-2.5"
              data-testid={`${testIdPrefix}-day-${day.day_index}`}
            >
              <div className="flex items-start gap-2.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted/60">
                  <MuscleMapThumb primary={stats.primary} secondary={stats.secondary} height={40} />
                </span>
                <div className="min-w-0 flex-1">
                  {/* Deliberately NOT truncated. "Workout A · Squat · Bench · Row" being cut to
                      "Workout A · Squ…" is the exact defect this screen exists to fix. */}
                  <p className="text-[13px] font-semibold leading-snug text-foreground">
                    {day.name}
                  </p>
                  {stats.empty ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      Rest / recovery — nothing scheduled.
                    </p>
                  ) : (
                    <div
                      className="mt-1 flex flex-wrap items-center gap-1.5"
                      data-testid={`${testIdPrefix}-day-${day.day_index}-stats`}
                    >
                      <Chip icon={<PlateStackIcon size={10} />}>{setCountLabel(stats.setCount)}</Chip>
                      <Chip icon={<ClockIcon size={10} />}>~{stats.minutes} min</Chip>
                      <Chip>{exerciseCountLabel(stats.exerciseCount)}</Chip>
                    </div>
                  )}
                </div>
              </div>

              {!stats.empty && (
                <ul className="mt-2 border-t border-border pt-1.5">
                  {day.exercises.map((row, i) => (
                    <li
                      key={row.id}
                      className="flex items-baseline justify-between gap-3 py-1"
                      data-testid={`${testIdPrefix}-day-${day.day_index}-exercise-${i}`}
                    >
                      <span className="min-w-0 text-[12px] leading-snug text-foreground">
                        <span className="text-muted-foreground">{i + 1}. </span>
                        {row.exercise_name}
                      </span>
                      <span className="shrink-0 tabular text-[11px] text-muted-foreground">
                        {row.sets} × {row.rep_min}–{row.rep_max}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {stats.patterns.length > 0 && (
                <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                  Covers {stats.patterns.join(' · ')}
                </p>
              )}
            </m.li>
          ))}
        </m.ol>
      </Section>

      {/* 4 · HOW IT ADVANCES — the rule that makes it a program rather than a list of exercises.
          The Workouts screen has always shown this; onboarding, where the decision is made, did not. */}
      <Section title="How you progress">
        <p
          className="text-[11px] leading-snug text-muted-foreground"
          data-testid={`${testIdPrefix}-progression`}
        >
          {split.progression}
        </p>
      </Section>

      {/* 5 · WHAT IT NEEDS — checked against the kit the athlete actually told us about, so
          "will this work where I train?" is answered here rather than discovered in week one. */}
      <Section title="What you need">
        {split.required_equipment.length === 0 ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            No specific equipment — this program runs on whatever you have.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid={`${testIdPrefix}-equipment`}>
            {split.required_equipment.map((slug) => {
              // No tick until we actually KNOW. Ticking a barbell for someone who has not reached
              // the equipment step yet is a claim about their gym that they never made.
              const have = !preview.provisional && (owned.size === 0 ? feasible : owned.has(slug));
              return (
                <li
                  key={slug}
                  className={
                    'inline-flex items-center gap-1 rounded-chip bg-surface px-2 py-0.5 text-[11px] font-medium ' +
                    // Only flag a gap once we know there IS one — an un-ticked chip must not read
                    // as "you are missing this" while we are still guessing at their gym.
                    (have || preview.provisional
                      ? 'text-muted-foreground'
                      : 'text-foreground ring-1 ring-border-strong')
                  }
                >
                  {/* THE KIT, DRAWN. "What you need" is a list of objects, and it was a list of
                      words — the 30 authored portraits existed the whole time and this is the
                      screen they were made for. The tick still wins where we KNOW the athlete
                      owns it, because ownership is a state a portrait cannot carry. */}
                  {have ? (
                    <span className="text-accent" aria-hidden>
                      <CheckIcon size={10} />
                    </span>
                  ) : (
                    <EquipmentIllustration slug={slug} size={14} />
                  )}
                  {equipmentLabel(slug)}
                </li>
              );
            })}
          </ul>
        )}
        {!feasible && !preview.provisional && (
          <p
            className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground"
            data-testid={`${testIdPrefix}-equipment-warning`}
          >
            <span className="mt-px shrink-0 text-accent" aria-hidden>
              <InfoIcon size={11} />
            </span>
            You have not told us you own everything this program is written around. You can still
            pick it — the days above already show what we can build from your kit.
          </p>
        )}
      </Section>

      {goals.length > 0 && (
        <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
          <span className="mt-px shrink-0 text-accent" aria-hidden>
            <BodyIcon size={11} />
          </span>
          Built for {goals.join(' · ')}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="tabular font-semibold text-foreground">{children}</span>;
}

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
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
