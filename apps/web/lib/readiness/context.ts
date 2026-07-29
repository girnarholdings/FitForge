'use client';

/**
 * ADAPT CONTEXT — the structured snapshot of OUR data the AI trainer reasons over.
 *
 * "Make the trainer learn what exercises and splits we have" does NOT mean uploading the catalog:
 * it means every adapt request carries a compact, machine-readable digest of the entities the
 * answer is allowed to name — the active split, today's day with its exercises and muscles, and
 * per-exercise swap candidates drawn from the app's OWN substitution engine. The model is then
 * instructed to choose only from these. That constraint is what turns a chat reply into a
 * one-click plan edit: every slug in the response provably exists in this app, so the client can
 * apply it without trusting the model's imagination.
 *
 * Size is a feature: the whole digest stays around ~1KB so it never crowds the prompt.
 */
import type { Routine, RoutineDay } from '@/components/features/_mock/data';
import { mockExerciseBySlug, mockSuggestSubstitutes } from '@/components/features/_mock/data';
import type { AdaptSwap } from './dayEdits';
import type { CheckIn } from './engine';

export interface AdaptDayExercise {
  slug: string;
  name: string;
  sets: number;
  muscles: string[];
}

export interface SwapCandidate {
  slug: string;
  name: string;
  id: string;
}

export interface AdaptContext {
  split: string;
  day: { name: string; focus: string | null; exercises: AdaptDayExercise[] };
  /** per exercise slug: the top substitutions OUR engine would offer (the model may pick only these) */
  swap_candidates: Record<string, SwapCandidate[]>;
  readiness?: Pick<CheckIn, 'sleepHours' | 'soreness' | 'energy' | 'stress' | 'unwell'>;
}

export function buildAdaptContext(
  routine: Routine,
  day: RoutineDay,
  checkIn?: CheckIn,
): AdaptContext {
  const exercises: AdaptDayExercise[] = day.exercises.map((e) => {
    const ex = mockExerciseBySlug(e.exercise_slug);
    return {
      slug: e.exercise_slug,
      name: e.exercise_name,
      sets: e.sets,
      muscles: ex ? ex.primary_muscles.slice(0, 3) : [],
    };
  });

  const swap_candidates: Record<string, SwapCandidate[]> = {};
  for (const e of day.exercises) {
    const subs = mockSuggestSubstitutes(e.exercise_id, 3).map((s) => ({
      slug: s.slug,
      name: s.name,
      id: s.exercise_id,
    }));
    if (subs.length > 0) swap_candidates[e.exercise_slug] = subs;
  }

  return {
    split: routine.name,
    day: { name: day.name, focus: day.focus, exercises },
    swap_candidates,
    readiness: checkIn
      ? {
          sleepHours: checkIn.sleepHours,
          soreness: checkIn.soreness,
          energy: checkIn.energy,
          stress: checkIn.stress,
          unwell: checkIn.unwell,
        }
      : undefined,
  };
}

/**
 * Resolve the worker's validated swap list against the SAME candidates we sent, dropping anything
 * that is not among them. The worker validates too, but the client is the last line: only a swap
 * we ourselves proposed can reach `applySwaps`.
 */
export function resolveSwaps(
  ctx: AdaptContext,
  raw: { from?: unknown; to?: unknown }[] | undefined,
): AdaptSwap[] {
  if (!Array.isArray(raw)) return [];
  const out: AdaptSwap[] = [];
  for (const s of raw) {
    if (typeof s?.from !== 'string' || typeof s?.to !== 'string') continue;
    const candidate = ctx.swap_candidates[s.from]?.find((c) => c.slug === s.to);
    if (!candidate) continue;
    out.push({ from_slug: s.from, to_slug: candidate.slug, to_name: candidate.name, to_id: candidate.id });
  }
  return out;
}
