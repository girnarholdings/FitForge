/**
 * ONE mapping from an exercise to the equipment portrait that represents it.
 *
 * WHY THIS FILE EXISTS. This lookup had already been written twice — `equipmentSlugFor` in
 * `SubstituteSheet` and `equipmentSlugOf` in `WorkoutPlayer` — and a third copy was about to be
 * written for the personal-records list. Two independent copies of a mapping are a drift risk by
 * construction; three make drift a certainty, and the failure mode is the specific one the owner
 * rules out: the SAME exercise showing a barbell on one screen and a cable on another. The player,
 * the swap sheet and the PR list must agree because they are describing the same object.
 *
 * THE TWO COPIES ALREADY DISAGREED, and the disagreement is preserved rather than resolved,
 * because it is real:
 *   · `SubstituteSheet` fell back to `dumbbell` — a swap candidate with no equipment named is
 *     something you can most likely do with a pair of dumbbells.
 *   · `WorkoutPlayer` fell back to `barbell` — the header portrait is "the thing in front of you"
 *     on a planned working set, which skews barbell.
 * Both were deliberate and both are documented at their call site, so `fallback` is a REQUIRED
 * argument here. Picking a winner silently would have changed one screen's rendering under cover
 * of a refactor; guessing a third value would have changed both. The lookup itself — first slug of
 * the first equipment group — was byte-identical in both copies and is what actually moves here.
 *
 * NOTE ON HONESTY: this resolves a slug for an ILLUSTRATION only. It never feeds prescription,
 * volume or load maths, so a fallback here is a drawing decision, not invented training data.
 */
import { mockExerciseById } from '@/components/features/_mock/data';
import type { EquipmentSlug } from '@/components/illustrations/equipment/types';

/**
 * The exercise's own first equipment slug, or `fallback` when the catalog row genuinely names
 * none. `fallback` is required — see the file header for why there is no default.
 *
 * Unknown slugs are not filtered: `resolveEquipmentGlyph` already has its own keyword guess and
 * category fallback, and it is the single place that decision belongs.
 */
export function slugForExercise(exerciseId: string, fallback: EquipmentSlug): string {
  return slugForExerciseOrNull(exerciseId) ?? fallback;
}

/**
 * The same lookup with NO fallback, for surfaces that would rather draw nothing than guess.
 *
 * A list of "what this session needs" is exactly that case: a bodyweight day must show an empty
 * strip, not a stray dumbbell, because the strip is read as a checklist of what to walk across the
 * gym for. The single-glyph surfaces (the player header, a swap row, a PR row) are the opposite —
 * a blank there reads as a rendering bug — which is why they pass a fallback instead.
 */
export function slugForExerciseOrNull(exerciseId: string): string | null {
  return mockExerciseById(exerciseId)?.equipment[0]?.slugs[0] ?? null;
}
