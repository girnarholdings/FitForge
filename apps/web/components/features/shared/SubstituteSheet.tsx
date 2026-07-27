'use client';

/**
 * Substitute picker (§2.3 swap flow). Powered by the same `suggest_substitutes` RPC that drives
 * onboarding screen 8 & 12; here it is mocked via `mockSuggestSubstitutes`. Reused by the workout
 * player and the routine editor.
 */
import * as React from 'react';
import { Sheet, Button } from '@/components/ui';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { matchQuality } from '@/lib/utils';
import { slugForExercise } from '@/lib/equipment/slugForExercise';
import { mockSuggestSubstitutes, type SubstituteRow } from '@/components/features/_mock/data';

/**
 * First equipment slug of a candidate; `dumbbell` only when the row genuinely names none — a swap
 * that lists no kit is most likely something you can do with a pair of dumbbells.
 *
 * The LOOKUP now lives in `lib/equipment/slugForExercise`, so this sheet, the player header and the
 * PR list can never disagree about what one exercise looks like. The FALLBACK stays here because it
 * is a per-surface judgement rather than a shared fact — see that file's header.
 */
function equipmentSlugFor(exerciseId: string): string {
  return slugForExercise(exerciseId, 'dumbbell');
}

export interface SubstituteSheetProps {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  exerciseName: string;
  onPick: (sub: SubstituteRow) => void;
}

export function SubstituteSheet({
  open,
  onClose,
  exerciseId,
  exerciseName,
  onPick,
}: SubstituteSheetProps) {
  const subs = React.useMemo(
    () => (open ? mockSuggestSubstitutes(exerciseId, 5) : []),
    [open, exerciseId],
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Swap ${exerciseName}`}>
      <p className="mb-3 text-sm text-muted-foreground">
        Alternatives you can do with your equipment, ranked by how closely they match.
      </p>
      {subs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No suitable substitutes found.
        </p>
      ) : (
        <ul className="space-y-2">
          {subs.map((s) => (
            <li key={s.exercise_id}>
              <button
                type="button"
                onClick={() => {
                  onPick(s);
                  onClose();
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-left transition-colors hover:border-accent/60"
              >
                {/* THE WHOLE POINT OF THIS SHEET is "what can I do instead with what's free", and
                    the equipment was the one fact it never showed. Decorative: the row's name and
                    reason are the accessible content. */}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-muted/60">
                  <EquipmentIllustration slug={equipmentSlugFor(s.exercise_id)} size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {s.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{s.reason}</span>
                </span>
                <span className="shrink-0 rounded-full bg-accent-muted px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {matchQuality(s.score)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" block className="mt-4" onClick={onClose}>
        Keep {exerciseName}
      </Button>
    </Sheet>
  );
}
