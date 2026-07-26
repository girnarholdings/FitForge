'use client';

import * as React from 'react';
import type { MovementPattern } from '@fitforge/shared/types';
import { BODY_AREAS, type BodyArea } from '@fitforge/shared/types';
import { resolveBodyAreaExclusions } from '@fitforge/shared/rules';
import { Chip, SearchInput } from '@/components/ui';
import { demoSubstitutes } from '@/lib/demo/catalog';
import { useOnboarding } from '../OnboardingProvider';
import { useCatalogSearch, type ExerciseHit } from '../useCatalogSearch';
import type { DraftExcludedExercise, DraftMovementExclusion } from '../types';
import { OnboardingFooter } from '../OnboardingFooter';

const BODY_AREA_LABEL: Record<BodyArea, string> = {
  shoulders: 'Shoulders',
  lower_back: 'Lower back',
  knees: 'Knees',
  wrists: 'Wrists',
  hips: 'Hips',
  neck: 'Neck',
  elbows: 'Elbows',
};

function prettyPattern(p: MovementPattern): string {
  return p
    .split('_')
    .filter((w) => w !== 'iso')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface SubHit {
  exercise_id: string;
  slug: string;
  name: string;
  score: number;
  reason: string | null;
}

/** Screen 8 · Exclusions & substitutions (§2.2 / §7.2.2 / §7.4). */
export function ExclusionsStep() {
  const { draft, patch } = useOnboarding();
  const { searchExercises } = useCatalogSearch();

  // Soft patterns the user has un-checked. Initialised from what the draft is *missing* vs the
  // full soft set for the currently-selected areas (so a back-nav restores un-checks).
  const [removedSoft, setRemovedSoft] = React.useState<Set<MovementPattern>>(() => {
    const full = resolveBodyAreaExclusions(draft.body_areas);
    const present = new Set(draft.movement_exclusions.map((m) => m.movement_pattern));
    const removed = new Set<MovementPattern>();
    for (const e of full) if (e.soft && !present.has(e.movement_pattern)) removed.add(e.movement_pattern);
    return removed;
  });

  const [subs, setSubs] = React.useState<Record<string, SubHit[]>>({});

  // Recompute stored movement exclusions from areas + user soft un-checks (§7.2.2).
  const recompute = React.useCallback(
    (areas: BodyArea[], removed: Set<MovementPattern>) => {
      const resolved = resolveBodyAreaExclusions(areas);
      const rows: DraftMovementExclusion[] = resolved
        .filter((e) => !(e.soft && removed.has(e.movement_pattern)))
        .map((e) => ({
          movement_pattern: e.movement_pattern,
          reason: 'injury',
          source_body_area: e.source_body_area,
          soft: e.soft,
        }));
      patch({ movement_exclusions: rows });
    },
    [patch],
  );

  const toggleArea = (area: BodyArea) => {
    const has = draft.body_areas.includes(area);
    const nextAreas = has ? draft.body_areas.filter((a) => a !== area) : [...draft.body_areas, area];
    patch({ body_areas: nextAreas });
    recompute(nextAreas, removedSoft);
  };

  const toggleSoft = (pattern: MovementPattern) => {
    const next = new Set(removedSoft);
    if (next.has(pattern)) next.delete(pattern);
    else next.add(pattern);
    setRemovedSoft(next);
    recompute(draft.body_areas, next);
  };

  // Which soft patterns are currently in scope (from selected areas), for the expander.
  const softInScope = React.useMemo(() => {
    const resolved = resolveBodyAreaExclusions(draft.body_areas);
    const seen = new Set<MovementPattern>();
    const out: MovementPattern[] = [];
    for (const e of resolved) {
      if (e.soft && !seen.has(e.movement_pattern)) {
        seen.add(e.movement_pattern);
        out.push(e.movement_pattern);
      }
    }
    return out;
  }, [draft.body_areas]);

  const hardPatterns = React.useMemo(
    () => draft.movement_exclusions.filter((m) => !m.soft).map((m) => m.movement_pattern),
    [draft.movement_exclusions],
  );

  const fetchSubs = React.useCallback((exerciseId: string) => {
    const data = demoSubstitutes(exerciseId, 3);
    setSubs((prev) => ({ ...prev, [exerciseId]: data as SubHit[] }));
  }, []);

  const addExcludedExercise = (hit: ExerciseHit) => {
    if (draft.excluded_exercises.some((e) => e.id === hit.exercise_id)) return;
    const row: DraftExcludedExercise = {
      id: hit.exercise_id,
      slug: hit.slug,
      name: hit.name,
      exclusion_reason: 'dislike',
      preferred_substitute_id: null,
    };
    patch({ excluded_exercises: [...draft.excluded_exercises, row] });
    void fetchSubs(hit.exercise_id);
  };

  const removeExcludedExercise = (id: string) => {
    patch({ excluded_exercises: draft.excluded_exercises.filter((e) => e.id !== id) });
  };

  const pinSubstitute = (exerciseId: string, substituteId: string | null) => {
    patch({
      excluded_exercises: draft.excluded_exercises.map((e) =>
        e.id === exerciseId ? { ...e, preferred_substitute_id: substituteId } : e,
      ),
    });
  };

  return (
    <div className="space-y-8">
      {/* 8a — body areas */}
      <section>
        <p className="mb-3 text-sm font-medium text-foreground">Protect these areas</p>
        <div className="flex flex-wrap gap-2">
          {BODY_AREAS.map((area) => (
            <Chip
              key={area}
              selected={draft.body_areas.includes(area)}
              onClick={() => toggleArea(area)}
            >
              {BODY_AREA_LABEL[area]}
            </Chip>
          ))}
        </div>

        {hardPatterns.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="exclusions-hard-summary">
            We&apos;ll leave these out entirely: {hardPatterns.map(prettyPattern).join(', ')}.
          </p>
        )}

        {softInScope.length > 0 && (
          <div
            className="mt-3 rounded-card border border-border bg-surface-2 p-3"
            data-testid="exclusions-soft-panel"
          >
            {/* Says exactly what the generator does (§7.2.2): a SOFT exclusion sinks a pattern
                below every alternative but never deletes it, so a protected area can't empty a
                day or wipe a whole movement out of the plan. */}
            <p className="text-xs text-muted-foreground">
              These stay in, but we&apos;ll ease off them — you&apos;ll only see them when nothing
              gentler fits the slot. Tap any to train it normally:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {softInScope.map((p) => (
                <Chip
                  key={p}
                  selected={!removedSoft.has(p)}
                  onClick={() => toggleSoft(p)}
                >
                  {prettyPattern(p)}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 8b — exercises to avoid */}
      <section>
        <p className="mb-3 text-sm font-medium text-foreground">Exercises to avoid</p>
        <SearchInput<ExerciseHit>
          aria-label="Search exercises to avoid"
          placeholder="Search exercises to avoid…"
          search={(q, signal) => searchExercises(q, signal)}
          getKey={(r) => r.exercise_id}
          renderResult={(r) => r.name}
          onSelect={addExcludedExercise}
        />

        <div className="mt-4 space-y-4">
          {draft.excluded_exercises.map((ex) => {
            const options = subs[ex.id] ?? [];
            return (
              <div key={ex.id} className="rounded-card border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{ex.name}</span>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-danger"
                    onClick={() => removeExcludedExercise(ex.id)}
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Substitute with:{' '}
                  <span className="text-muted-foreground/80">
                    we&apos;ll slot this in wherever {ex.name} would have gone.
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip
                    selected={ex.preferred_substitute_id === null}
                    onClick={() => pinSubstitute(ex.id, null)}
                    data-testid={`substitute-auto-${ex.slug}`}
                  >
                    Auto
                  </Chip>
                  {options.map((opt) => (
                    <Chip
                      key={opt.exercise_id}
                      selected={ex.preferred_substitute_id === opt.exercise_id}
                      onClick={() => pinSubstitute(ex.id, opt.exercise_id)}
                      data-testid={`substitute-pin-${opt.slug}`}
                    >
                      {opt.name}
                    </Chip>
                  ))}
                  {options.length === 0 && (
                    <span className="text-xs text-muted-foreground">finding alternatives…</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex-1" />
      <OnboardingFooter step="exclusions" skippable canContinue />
    </div>
  );
}
