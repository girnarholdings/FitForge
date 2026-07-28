'use client';

/**
 * FIRST-USE EXPLAINER — the four sentences someone needs before their first ever logged set.
 *
 * The bar this card had to clear, and the reason it is four lines and not fourteen: *can this
 * person put a TRUE number in a box and close the collar?* Anything that does not serve that
 * question waited for the glossary. So: what a set is, what the boxes actually are (a suggestion,
 * not a score), that RPE is skippable, and what closing the collar claims. Every gym word in it is
 * a dotted-underlined glossary trigger, which also teaches the affordance itself — the last line
 * says so out loud, because a dotted underline is only discoverable once you have tapped one.
 *
 * WHERE IT SHOWS: directly UNDER the set list, never above it — the placement is measured, not
 * chosen; see the call site in `WorkoutPlayer`. An explainer in front of the fields pushes set 1 to
 * ~961 px on a 390 × 664 phone.
 *
 * WHEN IT SHOWS: the first session only. Two independent gates, and it needs both —
 *   · nothing has ever been logged (`useWorkoutSessions().length === 0`), and
 *   · it has not been dismissed (`useExplainerSeen`).
 * The session gate is what keeps it away from anyone restoring a backup or arriving with seeded
 * history; the dismissal gate is what keeps it away from someone who read it and has not finished
 * a workout yet. The player also marks it seen when a workout is finished, so a user who ignores
 * the X still never sees it twice.
 *
 * NO TRAINING CLAIMS. Every sentence is a statement about what this screen does with what you
 * type. The only load advice — "start light and judge by feel" — is deliberately absent here and
 * lives behind the glossary/Coach where it was written and reviewed.
 */
import * as React from 'react';
import { Card } from '@/components/ui';
import { XIcon } from '@/components/ui/icons';
import { m, riseIn } from '@/components/ui/motion';
import { GlossaryTerm } from '@/components/features/shared/GlossaryTerm';
import { dismissExplainer, useExplainerSeen } from '@/components/features/shared/explainers';
import { useWorkoutSessions } from '@/components/features/shared/workoutLog';

export const FIRST_SET_EXPLAINER_ID = 'workout-first-set' as const;

export function FirstSetExplainer() {
  const seen = useExplainerSeen(FIRST_SET_EXPLAINER_ID);
  const sessions = useWorkoutSessions();

  if (seen || sessions.length > 0) return null;

  return (
    <m.div variants={riseIn} initial="hidden" animate="show">
      <Card premium data-testid="first-set-explainer">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-base font-bold tracking-tight">
            First time here? Read this once.
          </p>
          <button
            type="button"
            aria-label="Dismiss the first-workout explainer"
            data-testid="first-set-explainer-dismiss"
            onClick={() => dismissExplainer(FIRST_SET_EXPLAINER_ID)}
            className="-m-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-field text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon size={16} />
          </button>
        </div>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            Each row above is one <GlossaryTerm id="set" label="set" /> — a batch of{' '}
            <GlossaryTerm id="rep" label="reps" /> done back to back. Do the set, rest, do the next
            one.
          </li>
          <li>
            The numbers are already filled in as a <strong className="text-foreground">suggestion</strong>.
            Type what you <em>actually</em> did before you{' '}
            <GlossaryTerm id="log-the-set" label="close the collar" /> — if it said 8 and you did 6,
            write 6.
          </li>
          <li>
            <GlossaryTerm id="rpe" label="RPE" /> is optional. Leave it blank if you are not sure.
          </li>
          <li>
            Any <span className="underline decoration-dotted decoration-1 underline-offset-[3px]">dotted word</span>{' '}
            explains itself when you tap it.
          </li>
        </ul>
      </Card>
    </m.div>
  );
}
