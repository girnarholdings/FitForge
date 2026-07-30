'use client';

/**
 * QUICK WORKOUT — "I want to train, but not the thing that is scheduled."
 *
 * This replaces a button that used to link straight at `routine.days[0]`, i.e. it silently started
 * day 1 of the split regardless of context. Starting a session is a decision with consequences for
 * the rest of the week, so it gets a picker, and every option in it is derived from the athlete's
 * OWN split (see `lib/demo/quick`) rather than being a generic "quick burn" template:
 *
 *   · Pull the next scheduled day forward, so the week's plan stays intact.
 *   · Run any single split day on its own.
 *   · Condense the whole split into one full-body session inside a time budget.
 *
 * Every option shows its real estimated duration and what it actually contains, so the choice is
 * informed before it is committed.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardTitle, Sheet } from '@/components/ui';
import {
  BoltIcon,
  ClockIcon,
  ArrowRightIcon,
  PlateStackIcon,
  BodyIcon,
  BenchIcon,
} from '@/components/ui/icons';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { m, staggerList, staggerItem, SPRING, haptic } from '@/components/ui/motion';
import { useActiveRoutine } from '@/lib/demo/useDemo';
import { setQuickSession } from '@/lib/demo/store';
import { QUICK_BUDGETS, quickOptions, type QuickBudget, type QuickOption } from '@/lib/demo/quick';
import { describeDay } from '@/lib/demo/generate';
import { mockExerciseById } from '@/components/features/_mock/data';

const KIND_ICON: Record<QuickOption['kind'], React.ReactNode> = {
  'pull-forward': <ArrowRightIcon size={18} />,
  // "Several days condensed into one" is literally MORE PLATES ON THE BAR. The old LayersIcon's
  // own comment admitted it was reaching for stacked plates and settling for a generic layers
  // glyph; now it does not have to settle.
  condense: <PlateStackIcon size={18} />,
  // "One day, on its own" is a day that hits a specific set of muscles — a body silhouette,
  // not a dartboard. The dartboard now only ever means a numeric goal.
  isolate: <BodyIcon size={18} />,
};

/**
 * The dominant piece of equipment a quick session needs — the first slug on the first exercise
 * that names any. "What will I have to queue for" is a real part of choosing a session on a busy
 * gym floor, and it was not on the card at all. Returns null rather than guessing when the day
 * carries nothing, so the row falls back to the kind icon instead of inventing a barbell.
 */
function dominantEquipment(option: QuickOption): string | null {
  for (const ex of option.day.exercises) {
    const slug = mockExerciseById(ex.exercise_id)?.equipment[0]?.slugs[0];
    if (slug) return slug;
  }
  return null;
}

const KIND_TAG: Record<QuickOption['kind'], string> = {
  'pull-forward': 'Keeps your week on plan',
  condense: 'Everything, compressed',
  isolate: 'One day, on its own',
};

export interface QuickWorkoutCardProps {
  /** headline + copy differ on a rest day vs "I already trained today" */
  restDay?: boolean;
}

export function QuickWorkoutCard({ restDay = false }: QuickWorkoutCardProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {/* A hairline section, not another card: the plan above is the only card this screen owes
          the reader. The rest-day variant keeps a touch more presence — there, this IS the way
          into training. */}
      <div className={restDay ? 'rounded-sm border border-border bg-surface-2 p-4' : 'py-1'}>
        <div className="flex items-center gap-2.5">
          {/* An empty day is still a gym day in this app's world — an empty bench, not a blank
              card. Decorative; the title beside it is the accessible content.
              THE OBJECT IS UNCHANGED, THE DRAWING OF IT IS NOT: this was the 48-unit `flat-bench`
              PORTRAIT squeezed to 24 with the dense-stroke workaround. {@link BenchIcon} is the
              same bench drawn natively on the 24 canvas every other glyph in this card uses, so it
              carries the row's real optical weight instead of approximating it. The portrait keeps
              the sizes it was actually drawn for — the equipment picker, and the 48 px empty
              states in Progress. */}
          {restDay ? (
            <BenchIcon size={22} className="shrink-0 text-accent" />
          ) : (
            <BoltIcon size={22} className="shrink-0 text-accent" />
          )}
          {/* On a training day this card sits DIRECTLY under "Start workout", so "Want to train
              anyway?" read as nonsense — you were just invited to train. The headline now names
              the lane itself: the manual, off-plan way in, next to the scheduled one. The
              question-phrasing only survives on a rest day, where it is actually a question. */}
          <CardTitle>{restDay ? 'Rest day' : 'Quick workout'}</CardTitle>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {restDay
            ? 'No workout scheduled today — recovery is part of the plan. Want to move anyway?'
            : 'Not doing today’s session? Pull tomorrow forward, run a single day, or condense the split — your call.'}
        </p>
        <Button
          variant="secondary"
          block
          className="mt-4"
          data-testid="quick-workout-open"
          onClick={() => setOpen(true)}
        >
          {/* The rest-day button keeps the "Quick workout" name (it is the card's only label for
              the lane there); on a training day the title already says it, so the button states
              the action instead of repeating the noun. */}
          <BoltIcon size={18} /> {restDay ? 'Quick workout' : 'Pick a session'}
        </Button>
      </div>

      <QuickWorkoutSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function QuickWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const routine = useActiveRoutine();
  const router = useRouter();
  const [budget, setBudget] = React.useState<QuickBudget>(35);

  const options = React.useMemo(() => quickOptions(routine, budget), [routine, budget]);

  const start = (option: QuickOption) => {
    // The session is stashed rather than passed in the URL: it is a whole RoutineDay, and the
    // player, the volume aggregation and the logger all read it as if it were a planned day.
    setQuickSession(option.day);
    haptic('confirm');
    onClose();
    router.push('/workout/quick');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Quick workout">
      <p className="mb-3 text-sm text-muted-foreground">
        Built from <span className="font-semibold text-foreground">{routine.name}</span> — not a
        generic burner. Times are estimates from your own sets and rest.
      </p>

      {/* Time budget only changes the CONDENSED option; the others are what they are. */}
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How long have you got?
        </p>
        <div className="flex gap-2" role="group" aria-label="Time budget">
          {QUICK_BUDGETS.map((b) => (
            <m.button
              key={b}
              type="button"
              whileTap={{ scale: 0.95 }}
              transition={SPRING.press}
              onClick={() => {
                setBudget(b);
                haptic();
              }}
              aria-pressed={budget === b}
              data-testid={`quick-budget-${b}`}
              className={`flex-1 rounded-field border py-2 text-sm font-semibold transition-colors ${
                budget === b
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-border bg-surface-2 text-muted-foreground'
              }`}
            >
              {b} min
            </m.button>
          ))}
        </div>
      </div>

      <m.ul
        className="space-y-2"
        variants={staggerList}
        initial="hidden"
        animate="show"
        // Re-keying on the budget replays the stagger, which is the feedback that the list
        // genuinely rebuilt rather than just relabelling a number.
        key={budget}
        data-testid="quick-options"
      >
        {options.map((option) => (
          <m.li key={option.id} variants={staggerItem}>
            <m.button
              type="button"
              whileTap={{ scale: 0.985 }}
              transition={SPRING.press}
              onClick={() => start(option)}
              data-testid={`quick-option-${option.kind}`}
              className="flex w-full items-center gap-3 rounded-card border border-border bg-surface-2 p-3 text-left transition-colors hover:border-accent/60"
            >
              {/* The KIND badge stays the kind icon — it is the one thing that distinguishes the
                  three options from each other, and three identical barbells would be a
                  regression. The equipment goes on the meta line below, where it adds a fact
                  instead of replacing one. */}
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-muted text-accent">
                {KIND_ICON[option.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {option.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {option.subtitle}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-accent-soft">
                  <ClockIcon size={12} /> ~{option.minutes} min
                  {(() => {
                    const slug = dominantEquipment(option);
                    // "What will I have to queue for" is a real part of choosing a session on a
                    // busy floor. Drawn, not written — the line is already carrying two facts.
                    return slug ? (
                      <EquipmentIllustration slug={slug} size={16} selected className="ml-0.5" />
                    ) : null;
                  })()}
                  <span className="font-medium text-muted-foreground">· {KIND_TAG[option.kind]}</span>
                </span>
              </span>
            </m.button>
          </m.li>
        ))}
      </m.ul>

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Condensed sessions keep one movement per pattern and superset non-competing pairs rather
        than deleting sets — the approach Iversen et al. (2021) found cuts session time without
        cutting the training dose. Nothing drops below 2 sets per exercise.
      </p>

      {options.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Contains: {describeDay(options[0]!.day)}
        </p>
      )}
    </Sheet>
  );
}
