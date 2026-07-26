'use client';

/**
 * Routines hub (the "Workouts" tab, §2.3). Shows the user's real active routine (the one generated
 * from their onboarding profile, persisted in the Local Mode store) — no fabricated history.
 */
import * as React from 'react';
import Link from 'next/link';
import { getSplit, AUTO_SPLIT_SLUG } from '@fitforge/shared/rules';
import type { GoalType, ExperienceLevel } from '@fitforge/shared/types';
import { Card, CardTitle, CardDescription, Button } from '@/components/ui';
import { DumbbellIcon, PlusIcon, RepeatIcon, InfoIcon } from '@/components/ui/icons';
import { useActiveRoutine, useDemoState } from '@/lib/demo/useDemo';
import {
  applySplit,
  describeDay,
  exerciseCountLabel,
  planCoverageForDraft,
} from '@/lib/demo/generate';
import { WEEKDAY_LABELS } from '@/components/features/_mock/data';
import { DayStrip, daysLabel, levelLabel } from './SplitCard';
import { SplitLibrarySheet } from './SplitLibrarySheet';

const GOAL_LABEL: Record<string, string> = {
  strength: 'Strength',
  hypertrophy: 'Build muscle',
  fat_loss: 'Lose fat',
  endurance: 'Endurance',
  general_health: 'General health',
};

export function RoutineList() {
  const routine = useActiveRoutine();
  const state = useDemoState();
  const totalExercises = routine.days.reduce((n, d) => n + d.exercises.length, 0);

  const [browsing, setBrowsing] = React.useState(false);
  const splitSlug = state.draft.split_slug ?? null;
  const split = getSplit(splitSlug);

  // M1 — never silently ship a skeleton plan. When the user's equipment / protected areas were
  // what thinned the week out, say it here with a concrete next step.
  const coverage = React.useMemo(() => planCoverageForDraft(state.draft), [state.draft]);
  const showCoverage = coverage.limited && state.routine != null;

  const profile = React.useMemo(
    () => ({
      days_per_week: state.profile?.days_per_week ?? state.draft.days_per_week ?? null,
      session_minutes: state.profile?.session_minutes ?? state.draft.session_minutes ?? null,
      experience_level: (state.profile?.experience_level ??
        state.draft.experience_level ??
        'beginner') as ExperienceLevel,
      primary_goal: (state.profile?.primary_goal ??
        state.draft.primary_goal ??
        'general_health') as GoalType,
      equipment_slugs: state.draft.equipment_slugs ?? [],
      training_location: state.profile?.training_location ?? state.draft.training_location ?? null,
    }),
    [state.profile, state.draft],
  );

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Workouts</h1>
        <Link href="/exercises" className="text-sm font-medium text-accent">
          Browse exercises
        </Link>
      </header>

      <Card premium className="!p-0 overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="truncate">{routine.name}</CardTitle>
                <span className="shrink-0 rounded-chip bg-accent-muted px-2 py-0.5 text-[11px] font-semibold text-accent">
                  Active
                </span>
              </div>
              {routine.description && <CardDescription>{routine.description}</CardDescription>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {routine.goal && (
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                    {GOAL_LABEL[routine.goal] ?? routine.goal}
                  </span>
                )}
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                  {routine.source === 'generated' ? 'Generated for you' : 'Custom'}
                </span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                  {routine.days.length} {routine.days.length === 1 ? 'day' : 'days'} ·{' '}
                  {exerciseCountLabel(totalExercises)}
                </span>
              </div>
            </div>
          </div>

          {showCoverage && (
            <div
              className="mt-3 flex gap-3 rounded-xl border border-accent-soft/60 bg-surface p-3"
              data-testid="routine-limited-notice"
            >
              <span className="mt-0.5 shrink-0 text-accent" aria-hidden>
                <InfoIcon size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{coverage.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {coverage.body}
                </p>
                <Link
                  href="/settings"
                  className="mt-2 inline-block text-[11px] font-semibold text-accent"
                  data-testid="routine-limited-action"
                >
                  {coverage.actionLabel} →
                </Link>
              </div>
            </div>
          )}

          {/* Active split — what program the week is actually running (WS-5) */}
          <div
            className="mt-3 rounded-xl border border-border bg-surface p-3"
            data-testid="active-split"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Training split
                </p>
                <p
                  className="mt-0.5 truncate text-sm font-semibold text-foreground"
                  data-testid="active-split-name"
                >
                  {split ? split.name : 'Auto — built from your schedule'}
                </p>
                {split ? (
                  <>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {daysLabel(split)} · {levelLabel(split.levels)}
                    </p>
                    <DayStrip split={split} className="mt-1" />
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {split.progression}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {routine.days.map((d) => d.focus).join(' · ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setBrowsing(true)}
                data-testid="change-split"
                className="flex shrink-0 items-center gap-1 rounded-chip border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:border-accent"
              >
                <RepeatIcon size={13} />
                Change
              </button>
            </div>
          </div>

          {/* Day rail */}
          <ul className="mt-4 space-y-1.5">
            {routine.days.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-muted text-accent">
                    <DumbbellIcon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">{d.name}</span>
                    {/* Honest, pluralised day line (M1 / m1) — the movements listed are the ones
                        this day actually contains, not the template's promise. */}
                    <span
                      className="block truncate text-xs text-muted-foreground"
                      data-testid={`routine-day-summary-${d.day_index}`}
                    >
                      {d.weekday != null ? `${WEEKDAY_LABELS[d.weekday]} · ` : ''}
                      {describeDay(d)}
                    </span>
                  </span>
                </span>
                <Link
                  href={`/workout/${d.id}`}
                  className="shrink-0 text-xs font-semibold text-accent"
                >
                  Start
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href={`/routines/${routine.id}`}>
              <Button size="sm" variant="secondary">
                Edit routine
              </Button>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBrowsing(true)}
              data-testid="change-split-cta"
            >
              Change split
            </Button>
          </div>
        </div>
      </Card>

      <Link href="/exercises" className="block">
        <Card interactive className="flex items-center gap-3 border-dashed">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-accent">
            <PlusIcon size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Build a custom day</p>
            <p className="text-xs text-muted-foreground">
              Browse the exercise library and forge your own session.
            </p>
          </div>
        </Card>
      </Link>

      <SplitLibrarySheet
        open={browsing}
        onClose={() => setBrowsing(false)}
        value={splitSlug ?? AUTO_SPLIT_SLUG}
        onSelect={(slug) => applySplit(slug === AUTO_SPLIT_SLUG ? null : slug)}
        profile={profile}
        title="Change your split"
      />
    </div>
  );
}
