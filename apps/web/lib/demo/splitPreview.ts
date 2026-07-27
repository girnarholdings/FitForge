'use client';

/**
 * SPLIT PREVIEW — "what will this program actually give me?", answered before it is chosen.
 *
 * A split card used to describe a program in one sentence and a truncated day strip. That asks the
 * athlete to commit twelve weeks of their life to a name. The honest answer to "what am I picking?"
 * is the week itself: the real days, the real exercises, the real sets and the real time cost.
 *
 * THE ONLY WAY TO GET THAT HONESTLY is to run the same generator the app will run when the choice
 * is confirmed. `routineForDraft` is pure and deterministic and it is exactly what
 * `finalizeOnboarding` and `applySplit` call, so this preview is not an approximation of the plan —
 * it IS the plan, built from the same draft, the same equipment, the same protected areas. Writing
 * plausible-looking exercise names next to a split would have been an order of magnitude less code
 * and would have been fabricated training data, which this app does not ship.
 *
 * COST AND WHY IT IS MEMOISED: one preview filters a 91-row catalog per slot per day — cheap on its
 * own, wasteful 26 times over. Callers must therefore only ask for a preview when the athlete has
 * actually opened a card, and the cache below makes re-opening the same card free. The key covers
 * every draft field generation reads, so a preview can never survive a change that would alter it.
 */
import type { SplitDefinition, ProgressionScheme } from '@fitforge/shared/rules';
import type { Routine, RoutineDay } from '@/components/features/_mock/data';
import type { OnboardingDraft } from '@/components/onboarding/types';
import { routineForDraft } from './generate';
import { getState } from './store';
import {
  dayStats,
  muscleLoads,
  musclePaint,
  volumeSourcesForRoutine,
  type DayStats,
  type MuscleLoad,
  type MusclePaint,
} from './insights';

export interface SplitPreviewDay {
  day: RoutineDay;
  stats: DayStats;
}

export interface SplitPreview {
  /** the routine this split WOULD produce, byte-for-byte what generation will build */
  routine: Routine;
  days: SplitPreviewDay[];
  /** days that contain work — a rest day is not a session */
  sessions: number;
  setCount: number;
  /** estimated wall-clock minutes across the whole week */
  minutes: number;
  /** ranked weekly muscle loads (weighted sets), heaviest first */
  loads: MuscleLoad[];
  /**
   * The same loads as the two arrays `MuscleMapThumb` takes, so the week can be DRAWN and not only
   * listed. A program's answer to "what does this train?" is a body, not a table of names — and it
   * is painted by {@link musclePaint}, the identical rule that paints each day, so the week
   * silhouette and the day silhouettes below it can never disagree about the same plan.
   */
  paint: MusclePaint;
  /**
   * The split step comes BEFORE the location/equipment/protected-area steps in onboarding, so at
   * that point generation is running on its "assume a normal gym" default rather than on answers
   * the athlete has given. The exercises below are then a fair illustration of the program but not
   * yet a promise, and the UI has to say so — quoting a specific barbell lift to someone who is
   * about to tell us they train at home with two dumbbells would be exactly the kind of confident
   * wrong answer this app must not give.
   *
   * Keyed on `training_location` alone: that is the first of those steps, so once it is answered
   * the preview is running on real answers. Everything after it (equipment, exclusions) can only
   * narrow the pool, and the plan-preview screen shows the final week before anything is committed.
   */
  provisional: boolean;
}

/**
 * Every draft field `generatePlan` reads, and nothing else. Listing them explicitly rather than
 * hashing the whole draft keeps the cache from being invalidated by, say, the athlete's display
 * name — while still guaranteeing that anything which CAN change the plan does invalidate it.
 */
function cacheKey(
  slug: string,
  draft: Partial<OnboardingDraft>,
  scheme?: ProgressionScheme,
): string {
  return JSON.stringify([
    slug,
    // The scheme changes the SET COUNTS and the MINUTES in the cached preview, so it has to be part
    // of the identity of that cache entry — otherwise switching scheme in Settings and reopening
    // the split library would serve figures computed under the old one.
    scheme ?? null,
    draft.primary_goal ?? null,
    draft.experience_level ?? null,
    draft.days_per_week ?? null,
    draft.session_minutes ?? null,
    draft.preferred_days ?? null,
    draft.training_location ?? null,
    // `training_location` also decides `provisional`, so it is load-bearing twice over.
    draft.equipment_slugs ?? null,
    draft.loved_equipment_slugs ?? null,
    draft.movement_exclusions ?? null,
    draft.excluded_exercises ?? null,
    draft.favorites ?? null,
  ]);
}

const CACHE = new Map<string, SplitPreview>();

/**
 * The draft to preview against.
 *
 * Onboarding holds its draft in React state and only writes it through to the store when a step is
 * committed, so the split step MUST pass its live draft — otherwise a preview would answer for the
 * days/week the athlete had chosen one screen ago. Everywhere else (the Workouts "Change split"
 * sheet) the stored draft IS the live one, so the fallback is honest there and only there.
 */
function resolveDraft(draft?: Partial<OnboardingDraft> | null): Partial<OnboardingDraft> {
  if (draft) return draft;
  try {
    return getState().draft ?? {};
  } catch {
    // Local Mode is localStorage-backed; a preview is never worth throwing a screen away for.
    return {};
  }
}

/**
 * Build (or recall) the week this split yields for this athlete.
 *
 * Call it LAZILY — when a card is opened, not when a list is rendered.
 */
export function splitPreview(
  split: SplitDefinition,
  draft?: Partial<OnboardingDraft> | null,
  /**
   * The scheme in force. A capped scheme (reverse pyramid runs three working sets) makes the same
   * split a materially shorter week, and a preview that quoted the row totals under every scheme
   * was the same lie the session cards were telling — just one screen earlier, at the moment the
   * split is CHOSEN. Optional, and omitting it keeps the prescribed-set reading.
   */
  scheme?: ProgressionScheme,
): SplitPreview {
  const resolved = resolveDraft(draft);
  const key = cacheKey(split.slug, resolved, scheme);
  const hit = CACHE.get(key);
  if (hit) return hit;

  const routine = routineForDraft({ ...resolved, split_slug: split.slug });
  const days = routine.days.map((day) => ({ day, stats: dayStats(day, scheme) }));
  const loads = muscleLoads(volumeSourcesForRoutine(routine, scheme));
  const preview: SplitPreview = {
    routine,
    days,
    sessions: days.filter((d) => !d.stats.empty).length,
    setCount: days.reduce((n, d) => n + d.stats.setCount, 0),
    minutes: days.reduce((n, d) => n + d.stats.minutes, 0),
    loads,
    paint: musclePaint(loads),
    provisional: resolved.training_location == null,
  };

  CACHE.set(key, preview);
  return preview;
}
