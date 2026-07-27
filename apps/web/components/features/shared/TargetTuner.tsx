'use client';

/**
 * TARGET TUNER — "this says I'm over target on side delts; now what?"
 *
 * Before this, a muscle reading "Above target" or "Over target" was a dead end: the app asserted a
 * number, coloured a silhouette red, and offered no way to act on it. Two things were missing, and
 * this sheet supplies both.
 *
 * 1 · **A way to disagree.** Recommendations are population averages; recovery, training age and
 *     injury history are not. The athlete can set their own weekly target for any muscle, and
 *     because every goal in the app resolves through `weeklySetGoal`, calibrating one genuinely
 *     re-plans — heat colour, status, and the "short of goal / over goal" advice all move with it.
 *     The recommendation stays on screen next to it, so calibrating is an informed override rather
 *     than a number replaced by a number.
 *
 * 2 · **A way to act on the gap.** Over target means "drop about N sets"; under target means "add
 *     about N". The sheet states the concrete delta and routes into the filtered catalog, which is
 *     where either change actually gets made.
 *
 * The evidence behind the recommendation is shown here, not buried in a comment: an app that tells
 * you to do fourteen sets of something owes you the provenance, including which parts are trial
 * data and which part is practitioner convention.
 */
import * as React from 'react';
import { Button, Sheet } from '@/components/ui';
import { CheckIcon, InfoIcon } from '@/components/ui/icons';
import { m, SPRING, AnimatedNumber, haptic } from '@/components/ui/motion';
import type { MuscleSlug } from '@/components/illustrations';
import { setVolumeTarget } from '@/lib/demo/store';
import {
  GOAL_STATUS_LABEL,
  MED_WEEKLY_SETS,
  MAX_WEEKLY_SETS,
  PRODUCTIVE_BAND,
  VOLUME_EVIDENCE,
  fmtSets,
  goalStatus,
  heatColorAt,
  type MuscleGoalRow,
} from './volumeMath';

export interface TargetTunerProps {
  /** the muscle being tuned — null closes the sheet */
  row: MuscleGoalRow | null;
  onClose: () => void;
  /** jump into the catalog filtered to this muscle, to actually add or drop work */
  onShowExercises?: (slug: MuscleSlug) => void;
}

export function TargetTuner({ row, onClose, onShowExercises }: TargetTunerProps) {
  // Local draft so dragging the stepper does not rewrite localStorage on every tick.
  const [draft, setDraft] = React.useState<number | null>(null);
  React.useEffect(() => setDraft(row ? row.goal : null), [row?.slug, row?.goal]);

  // Nothing selected = nothing mounted. AnimatePresence inside Sheet handles its own exit, so
  // there is no need to keep a closed sheet in the tree.
  if (!row) return null;

  const target = draft ?? row.goal;
  const previewPct = target > 0 ? row.sets / target : 0;
  const previewStatus = goalStatus(previewPct, row.sets);
  const isRecommended = target === row.recommended;
  /** whole sets to add (positive) or drop (negative) to land on the target */
  const delta = Math.round(target - row.sets);
  /** over target with no direct work at all — there is literally nothing to cut */
  const allIndirect = delta < 0 && row.directSets <= 0;
  /** over target with some direct work, but most of the volume rides in from compounds */
  const mostlyIndirect = delta < 0 && row.directSets > 0 && row.directSets < Math.abs(delta);

  const commit = (next: number | null) => {
    setVolumeTarget(row.slug, next);
    haptic('confirm');
    onClose();
  };

  const nudge = (by: number) => {
    setDraft((d) =>
      Math.min(MAX_WEEKLY_SETS, Math.max(MED_WEEKLY_SETS, (d ?? row.goal) + by)),
    );
    haptic();
  };

  return (
    <Sheet open onClose={onClose} title={`${row.name} weekly target`}>
      {/* Where this muscle stands right now, against the target being previewed. */}
      <div
        className="rounded-card border border-border bg-surface-2 p-3"
        data-testid="tuner-preview"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            You are doing{' '}
            <span className="font-bold text-foreground">{fmtSets(row.sets)}</span> sets a week
          </span>
          <span
            className="text-xs font-bold"
            style={{ color: row.sets > 0 ? heatColorAt(previewPct) : undefined }}
            data-testid="tuner-preview-status"
          >
            {GOAL_STATUS_LABEL[previewStatus]}
          </span>
        </div>
        <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <m.span
            className="block h-full rounded-full"
            style={{ backgroundColor: row.sets > 0 ? heatColorAt(previewPct) : 'transparent' }}
            animate={{ width: `${Math.min(100, (previewPct / 1.5) * 100)}%` }}
            transition={SPRING.settle}
          />
          <span
            className="absolute top-0 h-full w-px bg-border-strong"
            style={{ left: `${(1 / 1.5) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* The stepper. Big targets, because this is a thumb interaction on a phone. */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your weekly target
        </p>
        <div className="flex items-center gap-3">
          <m.button
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={SPRING.press}
            onClick={() => nudge(-1)}
            disabled={target <= MED_WEEKLY_SETS}
            aria-label="Decrease target by one set"
            data-testid="tuner-minus"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xl font-bold text-foreground disabled:opacity-40"
          >
            −
          </m.button>
          <div className="flex-1 text-center">
            <p className="font-display text-3xl font-bold tabular text-foreground">
              <AnimatedNumber value={target} data-testid="tuner-value" />
              <span className="ml-1 text-sm font-medium text-muted-foreground">sets / week</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground" data-testid="tuner-recommendation">
              {isRecommended ? (
                <span className="font-semibold text-success">FitForge&rsquo;s recommendation</span>
              ) : (
                <>
                  We recommend{' '}
                  <span className="font-semibold text-foreground">{row.recommended}</span> for your
                  goal and experience
                </>
              )}
            </p>
          </div>
          <m.button
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={SPRING.press}
            onClick={() => nudge(1)}
            disabled={target >= MAX_WEEKLY_SETS}
            aria-label="Increase target by one set"
            data-testid="tuner-plus"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xl font-bold text-foreground disabled:opacity-40"
          >
            +
          </m.button>
        </div>

        <input
          type="range"
          min={MED_WEEKLY_SETS}
          max={MAX_WEEKLY_SETS}
          step={1}
          value={target}
          onChange={(e) => setDraft(Number(e.target.value))}
          aria-label={`${row.name} weekly set target`}
          data-testid="tuner-slider"
          className="mt-3 w-full accent-[var(--color-accent)]"
        />
        <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
          <span>{MED_WEEKLY_SETS} · minimum effective</span>
          <span className="text-accent">
            {PRODUCTIVE_BAND.low}–{PRODUCTIVE_BAND.high} · productive band
          </span>
          <span>{MAX_WEEKLY_SETS}</span>
        </div>
      </div>

      {/* The concrete next action — the thing that was missing entirely.
          It must respect where the volume actually CAME FROM: a muscle sitting over target purely
          on indirect credit (forearms in any pulling week) has nothing to trim, and "drop 11 sets"
          would mean deleting the rows and pull-ups that generated it. */}
      <div className="mt-4 rounded-card border border-accent/40 bg-accent-muted/40 p-3">
        <p className="text-sm font-semibold text-foreground" data-testid="tuner-action">
          {delta === 0 ? (
            <>You are exactly on this target.</>
          ) : delta > 0 ? (
            <>
              Add about <span className="text-accent">{delta}</span> more{' '}
              {delta === 1 ? 'set' : 'sets'} a week to hit it.
            </>
          ) : allIndirect ? (
            <>
              Nothing to drop — <span className="text-accent">all of it is indirect</span>, picked up
              from your compounds. Being over here is usually fine; raise the target instead if this
              muscle recovers well.
            </>
          ) : (
            <>
              Drop about{' '}
              <span className="text-accent">{Math.min(Math.abs(delta), row.directSets)}</span> of your{' '}
              <span className="text-foreground">{fmtSets(row.directSets)}</span> direct{' '}
              {row.directSets === 1 ? 'set' : 'sets'} a week
              {mostlyIndirect ? ' — the rest is indirect and comes with your compounds.' : '.'}
            </>
          )}
        </p>
        {onShowExercises && delta !== 0 && !allIndirect && (
          <button
            type="button"
            onClick={() => {
              setVolumeTarget(row.slug, target === row.recommended ? null : target);
              onShowExercises(row.slug);
              onClose();
            }}
            data-testid="tuner-show-exercises"
            className="mt-1.5 text-sm font-semibold text-accent"
          >
            {delta > 0 ? `Find ${row.name} exercises` : `Review my ${row.name} work`} →
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {row.calibrated && (
          <Button
            variant="secondary"
            className="flex-1"
            data-testid="tuner-reset"
            onClick={() => commit(null)}
          >
            Use recommended
          </Button>
        )}
        <Button className="flex-1" data-testid="tuner-save" onClick={() => commit(target)}>
          <CheckIcon size={18} /> Save target
        </Button>
      </div>

      <EvidenceNote />
    </Sheet>
  );
}

/** The provenance, collapsed by default — available on demand, never in the way. */
function EvidenceNote() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="tuner-evidence-toggle"
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
      >
        <InfoIcon size={14} /> Where these numbers come from
      </button>
      {open && (
        <m.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={SPRING.panel}
          className="mt-2 space-y-2 overflow-hidden"
          data-testid="tuner-evidence"
        >
          {VOLUME_EVIDENCE.map((e) => (
            <li key={e.cite} className="text-[11px] leading-snug text-muted-foreground">
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent"
              >
                {e.cite}
              </a>
              <span className="text-muted-foreground"> · {e.where}</span>
              <br />
              {e.claim}
            </li>
          ))}
        </m.ul>
      )}
    </div>
  );
}
