'use client';

/**
 * Screen 6 · Progression scheme (§2.2 + WS-P).
 *
 * The split says WHAT you train. This says HOW the sets inside it are loaded, and what has to
 * happen before the weight goes up — the difference between "3 × 8–12" and an actual plan for
 * every set. Whatever is picked here re-shapes every session in the workout player.
 *
 * Two things make this step trustworthy rather than a quiz question:
 *   1. It SHOWS the consequence. The preview under the cards runs the real shared rule
 *      (`prescribeSets`) over the real compound prescription this athlete's plan will use — the
 *      same 4 sets and rep range `lib/demo/generate.ts` writes — so the numbers change under your
 *      thumb as you tap. Nothing here is illustrative filler.
 *   2. It refuses to default a novice into a heavy-first scheme. The recommendation comes from
 *      `recommendProgressionScheme`, which cannot return a scheme above the athlete's level, and a
 *      deliberate over-reach is honoured only alongside the coaching caution.
 */
import * as React from 'react';
import {
  PROGRESSION_OPTIONS,
  PROGRESSION_PICKER_LEDE,
  describeSetTarget,
  prescribeSets,
  recommendProgressionScheme,
  schemeCaution,
  suggestOnboardingDefaults,
  trimNoticeFor,
  type ProgressionScheme,
} from '@fitforge/shared/rules';
import type { GoalType, ExperienceLevel } from '@fitforge/shared/types';
import { SelectableCardGrid, type SelectableOption } from '@/components/ui';
import { RepeatIcon, BoltIcon, PlateStackIcon } from '@/components/ui/icons';
import { ProgressionEvidenceNote } from '@/components/features/shared/ProgressionEvidence';
import { setProgressionScheme } from '@/lib/demo/store';
import { useDemoState } from '@/lib/demo/useDemo';
import { useOnboarding } from '../OnboardingProvider';
import { OnboardingFooter } from '../OnboardingFooter';

/** One icon per scheme, chosen for what the SHAPE does, not for decoration. */
const SCHEME_ICON: Record<ProgressionScheme, React.ReactNode> = {
  straight_sets: <RepeatIcon size={22} />,
  top_set_backoff: <BoltIcon size={22} />,
  // Reverse pyramid IS a descending plate stack — the one place the metaphor is literal.
  reverse_pyramid: <PlateStackIcon size={22} />,
};

export function ProgressionStep() {
  const { draft } = useOnboarding();
  const state = useDemoState();

  const experience = (draft.experience_level ?? 'beginner') as ExperienceLevel;
  const goal = (draft.primary_goal ?? 'general_health') as GoalType;

  // The recommendation is a pure function of the answers already given, so it stays correct if the
  // athlete goes back and changes their experience level.
  const recommended = React.useMemo(
    () => recommendProgressionScheme({ experience_level: experience, primary_goal: goal }),
    [experience, goal],
  );

  /* An untouched store (`progressionScheme: null`) means "no choice made", which resolves to the
   * recommendation. That is why nothing is written on mount: the card is already selected, and the
   * athlete's own answer — including deliberately choosing the recommended one — is the only thing
   * that ever writes. Back and forward can therefore never clobber a choice. */
  const selected = state.progressionScheme ?? recommended;

  /* Recommended FIRST. The cards are tall (each carries its own plain-English sentence), so a
   * recommendation sitting last is a recommendation nobody sees on a 390 × 664 phone — and the
   * subtitle's promise that "one is picked for you already" would read as a lie. */
  const options = React.useMemo<SelectableOption<ProgressionScheme>[]>(
    () =>
      [...PROGRESSION_OPTIONS]
        .sort((a, b) => Number(b.slug === recommended) - Number(a.slug === recommended))
        .map((meta) => ({
          value: meta.slug,
          title: meta.slug === recommended ? `${meta.name} · recommended for you` : meta.name,
          description: meta.tagline,
          icon: SCHEME_ICON[meta.slug],
        })),
    [recommended],
  );

  // The exact compound row this athlete's generated plan uses (4 sets, their goal × experience rep
  // range) — so the preview is their plan, not a generic example.
  const defaults = suggestOnboardingDefaults(goal, experience);
  const preview = prescribeSets(
    {
      sets: 4,
      rep_min: defaults.rep_min,
      rep_max: defaults.rep_max,
      // The RPE the generator actually writes onto every row (`lib/demo/generate.ts`), so the
      // preview can show where a scheme makes one set harder than another rather than implying
      // every set in a shaped session costs the same.
      target_rpe: 7,
      mechanics: 'compound',
      experience,
    },
    selected,
  );
  const caution = schemeCaution(selected, experience);
  /* RPE is printed only where the scheme MOVES it. "RPE 7" repeated down four identical rows is
   * clutter that carries no information on a 390 px screen; "RPE 7 / RPE 6" is the whole point of
   * a back-off and has to be visible. */
  const rpeVaries = new Set(preview.sets.map((s) => s.rpe)).size > 1;
  // Reverse pyramid runs 3 sets, so the 4-set row loses one. Said out loud: a set vanishing from
  // the preview the moment you tap a card reads as a bug unless the app owns it.
  const trimNotice = trimNoticeFor(preview);

  return (
    <div className="flex flex-1 flex-col">
      {/* The one sentence that makes an unfamiliar choice safe to get wrong. It names the default
          rather than leaving "pick one of three" hanging over a beginner. */}
      <p className="mb-3 text-[0.8125rem] leading-snug text-muted-foreground" data-testid="progression-lede">
        {PROGRESSION_PICKER_LEDE}
      </p>
      <SelectableCardGrid
        options={options}
        value={selected}
        onChange={(v) => setProgressionScheme(v)}
        mode="single"
      />

      {/* The consequence, in the athlete's own numbers. */}
      <div
        className="mt-4 rounded-card border border-border bg-surface-2 p-3"
        data-testid="progression-preview"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
          Your first big lift, set by set
        </p>
        <ul className="mt-2 space-y-1">
          {preview.sets.map((s) => (
            <li
              key={s.index}
              className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
              data-testid={`progression-preview-set-${s.index}`}
            >
              <span className="text-muted-foreground">Set {s.index}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {/* A rep RANGE under straight sets (double progression), a single number under the
                    shaped schemes — those are per-set instructions, not ranges. */}
                {s.repsLow === s.repsHigh ? `${s.reps} reps` : `${s.repsLow}–${s.repsHigh} reps`}
                {s.loadPct == null ? '' : ` · ${s.loadPct}% of your top weight`}
                {rpeVaries && s.rpe != null ? ` · RPE ${s.rpe}` : ''}
              </span>
            </li>
          ))}
        </ul>
        {trimNotice && (
          <p className="mt-2 text-[0.75rem] leading-snug text-muted-foreground" data-testid="progression-trim">
            {trimNotice}
          </p>
        )}
        <p className="mt-2 text-[0.75rem] leading-snug text-muted-foreground">
          {preview.nextSession}
        </p>
      </div>

      {caution && (
        <p
          className="mt-3 rounded-card border border-accent bg-accent-muted px-3 py-2 text-[0.75rem] leading-snug text-accent"
          role="status"
          data-testid="progression-caution"
        >
          {caution}
        </p>
      )}

      <p className="mt-3 text-[0.75rem] leading-snug text-muted-foreground">
        You can change this any time in Settings — it takes effect on your very next set.
      </p>

      {/* Provenance, collapsed. Every percentage above is asserted by the app, and the app owes the
          athlete the source — including the places where the source is coaching convention. */}
      <div className="mt-3">
        <ProgressionEvidenceNote testId="progression-onboarding-evidence" />
      </div>

      <div className="flex-1" />
      <OnboardingFooter step="progression" />
    </div>
  );
}
