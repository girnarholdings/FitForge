'use client';

import * as React from 'react';
import type { GoalType } from '@fitforge/shared/types';
import { SelectableCardGrid, type SelectableOption } from '@/components/ui';
import { BarbellIcon, DumbbellIcon, FlameIcon, JumpRopeIcon, HeartIcon } from '@/components/ui/icons';
import { useOnboarding } from '../OnboardingProvider';
import { OnboardingFooter } from '../OnboardingFooter';

/**
 * "Get stronger" used to be a trophy and "build endurance" a running figure — both OUTCOME
 * metaphors borrowed from generic app iconography. A loaded bar is what getting stronger actually
 * looks like; a jump rope is a training tool rather than a picture of a person. Flame and heart
 * stay as they are: already non-widget, already gym-legible, and swapping them would be change
 * for its own sake. Retiring the trophy from here lets it mean exactly one thing elsewhere
 * (session complete) instead of three.
 */
const GOAL_OPTIONS: SelectableOption<GoalType>[] = [
  { value: 'strength', title: 'Get stronger', description: 'Lift heavier over time', icon: <BarbellIcon size={22} /> },
  { value: 'hypertrophy', title: 'Build muscle', description: 'Add size and definition', icon: <DumbbellIcon size={22} /> },
  { value: 'fat_loss', title: 'Lose fat', description: 'Lean out while keeping muscle', icon: <FlameIcon size={22} /> },
  { value: 'endurance', title: 'Build endurance', description: 'Last longer, recover faster', icon: <JumpRopeIcon size={22} /> },
  { value: 'general_health', title: 'General health', description: 'Feel good and stay consistent', icon: <HeartIcon size={22} /> },
];

const GOAL_LABEL: Record<GoalType, string> = {
  strength: 'strength',
  hypertrophy: 'building muscle',
  fat_loss: 'fat loss',
  endurance: 'endurance',
  general_health: 'general health',
};

/** "fat loss", "strength and fat loss", "strength, fat loss and endurance" */
function joinGoals(goals: GoalType[]): string {
  const parts = goals.map((g) => GOAL_LABEL[g]);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Screen 2 · Goals. A single MULTI-SELECT picker — tap every goal that applies, in the order that
 * matters to you. There is no separate "secondary goal" question buried at the bottom of the
 * screen any more; the first thing you tap leads, and everything you tap shapes the plan.
 *
 * `goals[]` is the answer of record; `primary_goal` / `secondary_goal` stay in sync as goals[0] /
 * goals[1] so generation, macros, split scoring and Settings keep working unchanged.
 */
/**
 * The AI-Mode cap (docs/AIMODE-CONTRACT.md: "ranked top-3 goals"). Three, because the diet
 * engine's stance mapping reads the ranked top-3 and nothing past it — letting a fourth be
 * tapped would collect an answer nothing uses. Old School keeps its uncapped multi-select.
 */
const AI_GOAL_CAP = 3;

export function GoalsStep() {
  const { draft, patch } = useOnboarding();
  const aiMode = !!draft.ai_mode;

  // Tolerate a draft saved before this step became multi-select.
  const goals = React.useMemo<GoalType[]>(() => {
    if (draft.goals?.length) return draft.goals;
    return [draft.primary_goal, draft.secondary_goal].filter(Boolean) as GoalType[];
  }, [draft.goals, draft.primary_goal, draft.secondary_goal]);

  const atCap = aiMode && goals.length >= AI_GOAL_CAP;

  const commit = (next: GoalType[]) => {
    patch({
      goals: next,
      primary_goal: next[0] ?? null,
      secondary_goal: next[1] ?? null,
    });
  };

  const toggle = (value: GoalType) => {
    if (goals.includes(value)) {
      commit(goals.filter((g) => g !== value));
      return;
    }
    // At the AI cap an extra tap is IGNORED, never silently evicting an earlier pick — order is
    // rank here, and reshuffling someone's ranking behind their back is worse than a no-op.
    if (atCap) return;
    commit([...goals, value]);
  };

  return (
    <>
      <SelectableCardGrid
        options={GOAL_OPTIONS}
        value={goals}
        onChange={toggle}
        mode="multiple"
        order
      />

      {goals.length > 0 && (
        <div
          className="mt-5 rounded-card bg-accent-muted p-3 text-sm text-accent"
          data-testid="goals-summary"
        >
          {goals.length === 1 ? (
            <>Nice — we&apos;ll tune your plan for {joinGoals(goals)}.</>
          ) : (
            <>
              Nice — we&apos;ll tune your plan for {joinGoals(goals)}, leading with{' '}
              <span className="font-semibold">{GOAL_LABEL[goals[0]!]}</span>.
            </>
          )}
        </div>
      )}

      {aiMode ? (
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground" data-testid="goals-ai-cap">
          {atCap
            ? 'That’s your three — untap one to swap it. The first leads your programming.'
            : 'Up to three, in order — the first one you tap leads your programming, and the rest adjust the split we recommend.'}
        </p>
      ) : (
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Pick as many as you like — the first one you tap leads your programming, and the rest
          adjust the split we recommend.
        </p>
      )}

      <div className="flex-1" />
      <OnboardingFooter step="goals" canContinue={goals.length > 0} />
    </>
  );
}
