'use client';

/**
 * Derive the Coach worker's `profile` payload from the Local Mode store.
 *
 * SCOPE, deliberately narrow: TRAINING CONTEXT ONLY. The display name, sex, birthdate, height,
 * weight and every food log stay in the browser — the model does not need them to answer "how
 * many sets should I do?", so they are never put on the wire. The shape mirrors
 * `workers/coach/src/index.ts` `ChatRequest['profile']` field for field.
 *
 * Everything is optional: a user who skipped onboarding still gets a valid (empty) payload, and
 * the worker omits empty slots from the system prompt.
 */
import * as React from 'react';
import { getSplit } from '@fitforge/shared/rules';
import type { DemoState } from '@/lib/demo/store';
import { useDemoState } from '@/lib/demo/useDemo';
import type { CoachProfile } from './types';

const GOAL_LABEL: Record<string, string> = {
  strength: 'get stronger',
  hypertrophy: 'build muscle',
  fat_loss: 'lose fat',
  endurance: 'build endurance',
  general_health: 'general health',
};

const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

const BODY_AREA_LABEL: Record<string, string> = {
  shoulders: 'shoulders',
  lower_back: 'lower back',
  knees: 'knees',
  wrists: 'wrists',
  hips: 'hips',
  neck: 'neck',
  elbows: 'elbows',
};

/** Slugs whose kebab-case form reads badly when title-cased mechanically. */
const EQUIPMENT_NAME: Record<string, string> = {
  'ez-curl-bar': 'EZ-curl bar',
  'lat-pulldown': 'lat pulldown',
  'pec-deck': 'pec deck',
  'seated-row-machine': 'seated cable row',
  'squat-rack': 'squat rack',
  'pull-up-bar': 'pull-up bar',
  'ab-wheel': 'ab wheel',
};

function prettySlug(slug: string): string {
  return EQUIPMENT_NAME[slug] ?? slug.replace(/-/g, ' ');
}

function prettyPattern(pattern: string): string {
  return pattern
    .split('_')
    .filter((w) => w !== 'iso')
    .join(' ');
}

/**
 * Build the payload. Reads the generated profile first (post-onboarding truth) and falls back to
 * the onboarding draft for fields the generated profile does not carry (split, equipment,
 * exclusions).
 */
export function deriveCoachProfile(state: DemoState): CoachProfile {
  const profile = state.profile;
  const draft = state.draft ?? {};
  const out: CoachProfile = {};

  const goal = profile?.primary_goal ?? draft.primary_goal ?? null;
  if (goal) out.goal = GOAL_LABEL[goal] ?? goal.replace(/_/g, ' ');

  const experience = profile?.experience_level ?? draft.experience_level ?? null;
  if (experience) out.experience = EXPERIENCE_LABEL[experience] ?? experience;

  const split = getSplit(draft.split_slug);
  if (split) out.split = split.name;

  const days = profile?.days_per_week ?? draft.days_per_week ?? null;
  if (days) out.days_per_week = days;

  const equipment = draft.equipment_slugs ?? [];
  if (equipment.length > 0) out.equipment = equipment.map(prettySlug);
  else if (profile?.training_location === 'home') out.equipment = ['bodyweight only'];

  const kcal = state.targets?.kcal_target ?? state.nutritionProfile?.kcal_target ?? null;
  if (kcal) out.kcal_target = Math.round(kcal);

  const protein = state.targets?.protein_g_target ?? state.nutritionProfile?.protein_g_target ?? null;
  if (protein) out.protein_target = Math.round(protein);

  const exclusions: string[] = [
    ...(draft.body_areas ?? []).map((a) => `${BODY_AREA_LABEL[a] ?? a} (protected)`),
    ...(draft.movement_exclusions ?? []).map((m) => `no ${prettyPattern(m.movement_pattern)}`),
    ...(draft.excluded_exercises ?? []).map((e) => `no ${e.name}`),
  ];
  if (exclusions.length > 0) out.exclusions = [...new Set(exclusions)];

  return out;
}

/** Reactive binding for the Coach surface. */
export function useCoachProfile(): CoachProfile {
  const state = useDemoState();
  return React.useMemo(() => deriveCoachProfile(state), [state]);
}

/**
 * Short chips that make the personalization VISIBLE ("hypertrophy", "3 days/week",
 * "dumbbells only"). Shown next to every AI answer so the user can see exactly what the model
 * was told about them.
 */
export function profileFacts(p: CoachProfile): string[] {
  const facts: string[] = [];
  if (p.goal) facts.push(p.goal);
  if (p.experience) facts.push(p.experience);
  if (p.split) facts.push(p.split);
  if (p.days_per_week) facts.push(`${p.days_per_week} days/week`);
  if (p.equipment?.length) {
    facts.push(
      p.equipment.length <= 2
        ? `${p.equipment.join(' + ')} only`
        : `${p.equipment.length} equipment items`,
    );
  }
  if (p.kcal_target) facts.push(`${p.kcal_target} kcal`);
  if (p.protein_target) facts.push(`${p.protein_target}g protein`);
  if (p.exclusions?.length) facts.push(`${p.exclusions.length} exclusion${p.exclusions.length > 1 ? 's' : ''}`);
  return facts;
}
