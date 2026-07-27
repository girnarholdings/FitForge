'use client';

/**
 * WHAT THIS PLAN HITS — the week, one level up from the individual session.
 *
 * A lifter's second question, right after "what's in today's session?", is "does the WEEK add up?"
 * The full answer already exists on Progress (the flip body, every muscle, the evidence note); the
 * job here is the five-second version, on the screen where the plan is chosen: how many hard sets
 * a week, over how many muscles, and where the heaviest five land against that athlete's own
 * weekly goal.
 *
 * Deliberately capped at five rows. The complaint being answered is "let the user SEE things", not
 * "show the user everything" — twenty bar rows on the hub screen would push the actual sessions
 * below the fold and answer a question nobody asked here. The link out carries the rest.
 *
 * Goal numbers resolve through `useVolumeGoalContext` / `buildGoalRows`, i.e. the same
 * personalised targets (including anything the athlete calibrated by hand) that Progress uses, so
 * a bar that reads "on goal" here reads "on goal" there.
 */
import * as React from 'react';
import Link from 'next/link';
import { BodyIcon } from '@/components/ui/icons';
import { m, staggerList, staggerItem } from '@/components/ui/motion';
import { aggregateSets, useVolumeGoalContext } from '@/components/features/shared/MuscleVolume';
import { buildGoalRows, fmtPct, fmtSets } from '@/components/features/shared/volumeMath';
import {
  muscleCountLabel,
  routineStats,
  setCountLabel,
  volumeSourcesForRoutine,
} from '@/lib/demo/insights';
import type { ProgressionScheme } from '@fitforge/shared/rules';
import type { Routine } from '@/components/features/_mock/data';

/** How many muscles get a bar before the athlete is sent to the full breakdown. */
const TOP_ROWS = 5;

export function PlanTargets({
  routine,
  scheme,
}: {
  routine: Routine;
  /**
   * The progression scheme in force, resolved by the caller.
   *
   * NOT optional in spirit, even though it is in the type: without it every bar on this panel is
   * computed from the sets the ROWS ask for rather than the sets the player runs, and under a
   * capped scheme those differ. The panel reported "56 sets a week … Chest 8/14 · 57%" byte-for-
   * byte identically under all three schemes, on the screen whose entire job is calibrating weekly
   * volume — a confidently wrong number is worse than no number.
   */
  scheme?: ProgressionScheme;
}) {
  const ctx = useVolumeGoalContext();
  const stats = React.useMemo(() => routineStats(routine, scheme), [routine, scheme]);
  const agg = React.useMemo(
    () => aggregateSets(volumeSourcesForRoutine(routine, scheme)),
    [routine, scheme],
  );
  const goalRows = React.useMemo(() => buildGoalRows(agg.total, ctx, agg.direct), [agg, ctx]);

  // Ranked by DIRECT volume, for the same reason `muscleLoads` is (see its comment): ranking five
  // rows by total weighted sets hands the top of a squat-and-press week to forearms and lower back
  // on half-set credit, and answers a question nobody asked. Not ranked by % of goal either — that
  // is "where am I behind", which is Progress's job; this block answers "what does the week train".
  const top = React.useMemo(
    () =>
      [...goalRows]
        .filter((r) => r.sets > 0)
        .sort((a, b) => b.directSets - a.directSets || b.sets - a.sets || b.pct - a.pct)
        .slice(0, TOP_ROWS),
    [goalRows],
  );

  // An equipment-starved or brand-new plan can genuinely have nothing in it. Say so plainly
  // rather than rendering five empty bars.
  if (top.length === 0) {
    return (
      <div
        className="mt-3 rounded-xl border border-border bg-surface p-3"
        data-testid="plan-targets"
      >
        <p className="text-[11px] leading-snug text-muted-foreground">
          No sets in this plan yet — add exercises to a day and this will show what the week hits.
        </p>
      </div>
    );
  }

  const trained = goalRows.filter((r) => r.sets > 0).length;

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-3" data-testid="plan-targets">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          What this week hits
        </p>
        <Link href="/progress" className="shrink-0 text-[11px] font-semibold text-accent">
          Full breakdown →
        </Link>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground" data-testid="plan-targets-summary">
        <span className="tabular font-semibold text-foreground">
          {setCountLabel(stats.setCount)}
        </span>{' '}
        a week across{' '}
        <span className="tabular font-semibold text-foreground">{muscleCountLabel(trained)}</span> ·
        about{' '}
        <span className="tabular font-semibold text-foreground">{stats.minutes} min</span> of
        training
      </p>

      <m.ul className="mt-2 space-y-1.5" variants={staggerList} initial="hidden" animate="show">
        {top.map((row) => (
          <m.li key={row.slug} variants={staggerItem} data-testid={`plan-target-${row.slug}`}>
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-foreground">{row.name}</span>
              <span className="shrink-0 tabular text-[11px] text-muted-foreground">
                {fmtSets(row.sets)}
                <span className="text-muted-foreground">/{fmtSets(row.goal)}</span>
                <span className="ml-1.5 font-semibold" style={{ color: row.color }}>
                  {fmtPct(row.pct)}
                </span>
              </span>
            </span>
            {/* Scaled to that muscle's OWN goal, with the 100 % tick, exactly as on Progress — a
                short bar always means "short of goal", never "smaller than the biggest muscle". */}
            <span className="relative mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
                style={{
                  width: `${Math.max(4, Math.min(100, (row.pct / 1.5) * 100))}%`,
                  backgroundColor: row.color,
                }}
              />
              <span
                className="absolute top-0 h-full w-px bg-border-strong"
                style={{ left: `${(1 / 1.5) * 100}%` }}
                aria-hidden
              />
            </span>
          </m.li>
        ))}
      </m.ul>

      <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
        <span className="mt-px shrink-0 text-accent" aria-hidden>
          <BodyIcon size={11} />
        </span>
        Each set counts 1.0 toward every primary muscle and 0.5 toward every secondary one, against
        your own weekly targets.
      </p>
    </div>
  );
}
