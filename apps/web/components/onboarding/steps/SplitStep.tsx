'use client';

/**
 * Screen 5 · Split (§2.2 + WS-5).
 *
 * Shows the 4 best-matching programs from the 26-program SPLIT_LIBRARY for the answers given so
 * far (days/week × experience × goal × equipment), plus "Pick for me" and a sheet with the whole
 * library. A recommendation is PRESELECTED on mount, so the step is continue-able with zero
 * interaction.
 *
 * Phone-first: the recommended list is the shell's scroll region; the CTA lives in the shell's
 * dock, so nothing is ever covered at 390 × 664.
 */
import * as React from 'react';
import {
  recommendSplits,
  SPLIT_LIBRARY,
  AUTO_SPLIT_SLUG,
  type SplitRecommendationInput,
} from '@fitforge/shared/rules';
import type { GoalType, ExperienceLevel } from '@fitforge/shared/types';
import { Button } from '@/components/ui';
import { SplitCard } from '@/components/features/routines/SplitCard';
import { SplitLibrarySheet } from '@/components/features/routines/SplitLibrarySheet';
import { useOnboarding } from '../OnboardingProvider';
import { OnboardingFooter } from '../OnboardingFooter';

const RECOMMENDED_COUNT = 4;

export function SplitStep() {
  const { draft, patch } = useOnboarding();
  const [browsing, setBrowsing] = React.useState(false);
  // ONE card open at a time. Two expanded programs on a 664 px-tall phone means neither can be
  // read without scrolling, and this screen exists to COMPARE programs, not to stack them.
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);

  const profile = React.useMemo<SplitRecommendationInput>(
    () => ({
      days_per_week: draft.days_per_week,
      session_minutes: draft.session_minutes,
      experience_level: (draft.experience_level ?? 'beginner') as ExperienceLevel,
      // Multi-select goals lead the recommendation; primary/secondary remain the fallback.
      goals: (draft.goals ?? []) as GoalType[],
      primary_goal: (draft.primary_goal ?? 'general_health') as GoalType,
      secondary_goal: draft.secondary_goal as GoalType | null,
      equipment_slugs: draft.equipment_slugs,
      training_location: draft.training_location,
    }),
    [
      draft.days_per_week,
      draft.session_minutes,
      draft.experience_level,
      draft.goals,
      draft.primary_goal,
      draft.secondary_goal,
      draft.equipment_slugs,
      draft.training_location,
    ],
  );

  const recommended = React.useMemo(
    () => recommendSplits(profile, RECOMMENDED_COUNT),
    [profile],
  );

  const selected = draft.split_slug;
  const topSlug = recommended[0]?.split.slug ?? AUTO_SPLIT_SLUG;

  // Preselect the best match the first time we land here (never clobbers an explicit choice).
  React.useEffect(() => {
    if (draft.split_slug == null) patch({ split_slug: topSlug });
  }, [draft.split_slug, topSlug, patch]);

  // A split the user picked from the full library that is not in the recommended four still needs
  // to be visible on this screen.
  const extra = React.useMemo(() => {
    if (!selected || selected === AUTO_SPLIT_SLUG) return null;
    if (recommended.some((r) => r.split.slug === selected)) return null;
    return recommendSplits(profile).find((r) => r.split.slug === selected) ?? null;
  }, [selected, recommended, profile]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-2" role="radiogroup" aria-label="Recommended training splits">
        {recommended.map((rec, i) => (
          <SplitCard
            key={rec.split.slug}
            split={rec.split}
            selected={selected === rec.split.slug}
            onSelect={() => patch({ split_slug: rec.split.slug })}
            reason={i === 0 ? `Best match · ${rec.reasons[0] ?? 'Recommended'}` : rec.reasons[0]}
            // The face keeps ONE reason because it has one line; the detail gets all of them.
            // `recommendSplits` builds up to four and three of them used to be discarded here.
            reasons={rec.reasons}
            draft={draft}
            testId={`split-option-${rec.split.slug}`}
            expanded={openSlug === rec.split.slug}
            onExpandedChange={(next) => setOpenSlug(next ? rec.split.slug : null)}
          />
        ))}

        {extra && (
          <SplitCard
            split={extra.split}
            selected
            onSelect={() => patch({ split_slug: extra.split.slug })}
            reason="Chosen from the full library"
            reasons={extra.reasons}
            draft={draft}
            testId={`split-option-${extra.split.slug}`}
            expanded={openSlug === extra.split.slug}
            onExpandedChange={(next) => setOpenSlug(next ? extra.split.slug : null)}
          />
        )}

        <button
          type="button"
          onClick={() => patch({ split_slug: AUTO_SPLIT_SLUG })}
          data-testid="split-option-auto"
          aria-pressed={selected === AUTO_SPLIT_SLUG}
          className={`w-full rounded-card border p-3 text-left transition-colors ${
            selected === AUTO_SPLIT_SLUG
              ? 'border-accent bg-accent-muted'
              : 'border-border bg-surface-2'
          }`}
        >
          <p className="text-[0.9375rem] font-semibold text-foreground">Pick for me</p>
          <p className="mt-0.5 text-[0.75rem] leading-snug text-muted-foreground">
            Skip the choice — FitForge builds the week from your days, goal and equipment.
          </p>
        </button>
      </div>

      <Button
        variant="ghost"
        block
        className="mt-3"
        onClick={() => setBrowsing(true)}
        data-testid="split-browse-all"
      >
        Browse all {SPLIT_LIBRARY.length} splits
      </Button>

      <SplitLibrarySheet
        open={browsing}
        onClose={() => setBrowsing(false)}
        value={selected ?? AUTO_SPLIT_SLUG}
        onSelect={(slug) => patch({ split_slug: slug })}
        profile={profile}
        // The onboarding draft has not been written through to the store yet, so the sheet has to
        // be handed the live one or its previews would answer for the previous screen's answers.
        draft={draft}
      />

      <div className="flex-1" />
      <OnboardingFooter step="split" />
    </div>
  );
}
