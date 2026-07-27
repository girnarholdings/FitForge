'use client';

/**
 * Shared presentation for a split-library program (WS-5).
 *
 * Used by the onboarding "Pick your training split" step AND the Workouts screen's "Change split"
 * sheet, so a program looks identical everywhere it appears.
 *
 * THE CARD IS NOW A DISCLOSURE, and that is a deliberate revision of what this file used to say.
 * The old header comment justified a hard ~112 px cap ("five fit the onboarding scroll region") and
 * paid for it with a `truncate`d name, a `truncate`d day strip and a one-line blurb — which is
 * precisely the "the details are cut out, it's just summary" the owner reported. The cap was the
 * right instinct for a LIST and the wrong answer for a DECISION, so both now exist: the collapsed
 * face stays scannable (nothing on it is truncated any more — it is short because it is short), and
 * every fact about the program is one tap away in {@link SplitDetail}, unabridged.
 *
 * STRUCTURE MATTERS HERE, for accessibility and for the E2E suite:
 *   · The `role="radio"` element is the SUMMARY BLOCK ONLY, not the whole card. An expander button
 *     nested inside a radio is an interactive control inside an interactive control — screen
 *     readers announce it as part of the option label, and a pointer click at the card's centre
 *     could land on the toggle instead of selecting. Making the toggle a SIBLING fixes both.
 *   · `split.name` must stay the first `<p class="font-semibold">` inside the radio: the split spec
 *     scrapes the chosen program's name from exactly that selector and then asserts the generated
 *     routine is named after it. Never put another semibold `<p>` above it.
 */
import * as React from 'react';
import type { SplitDefinition, SplitEquipmentProfile } from '@fitforge/shared/rules';
import { dayTemplatesForSplit } from '@fitforge/shared/rules';
import type { OnboardingDraft } from '@/components/onboarding/types';
import { Card } from '@/components/ui';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { CheckIcon, ChevronDownIcon } from '@/components/ui/icons';
import { m, AnimatePresence, SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { SplitDetail } from './SplitDetail';

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** Shortest honest level label: "Beginner", or "Beginner–Advanced" for a range. */
export function levelLabel(levels: readonly string[]): string {
  if (levels.length === 0) return '';
  if (levels.length === 1) return LEVEL_LABEL[levels[0]!] ?? levels[0]!;
  const first = LEVEL_LABEL[levels[0]!] ?? levels[0]!;
  const last = LEVEL_LABEL[levels[levels.length - 1]!] ?? levels[levels.length - 1]!;
  return `${first}–${last}`;
}

export function daysLabel(split: SplitDefinition): string {
  const opts = split.days_options;
  if (opts.length > 1) {
    return `${Math.min(...opts)}–${Math.max(...opts)} days/wk`;
  }
  return `${split.days_per_week} days/wk`;
}

/**
 * The "Push · Pull · Legs · Push · Pull · Legs" strip.
 *
 * WRAPS — it used to `truncate`, which on a 390 px phone clipped a six-day program mid-word and put
 * the rest in a `title` attribute no touch device can reach. It is at most a handful of short words;
 * letting it take a second line costs ~14 px and stops the card lying about the program's shape.
 *
 * `daysPerWeek` asks for the athlete's REAL week rather than the program's canonical one: someone
 * who trains five days on a three-day PPL gets P/P/L/P/P, which is what generation will build.
 * Omitting it keeps the program's own length (what the Workouts screen's active-split block wants).
 */
export function DayStrip({
  split,
  daysPerWeek,
  className,
}: {
  split: SplitDefinition;
  daysPerWeek?: number | null;
  className?: string;
}) {
  const strip = dayTemplatesForSplit(split, daysPerWeek).map((d) => d.focus);
  const text = strip.join(' · ');
  return (
    <p
      className={cn('text-[11px] leading-tight text-muted-foreground', className)}
      title={text}
    >
      {text}
    </p>
  );
}

/**
 * The single object that stands for a program whose `required_equipment` list is empty.
 *
 * THIS IS A RENDERING OF AUTHORED DATA, NOT A GUESS. `equipment_profile` is a field the split
 * library sets by hand to describe exactly this — "the broad equipment demand of a program" — and
 * roughly half the library leans on it because it names no specific item (a full-gym PPL does not
 * *require* any one machine; a minimal full-body program requires almost nothing). Drawing that
 * field is not the same as inventing a kit list, and it is why these programs get ONE glyph while
 * a program with a real `required_equipment` array gets its actual items: the count itself tells
 * you whether you are looking at a fact or a category. The unabridged, checked-against-your-own-kit
 * list is one tap away in {@link SplitDetail} either way.
 */
const PROFILE_GLYPH: Record<SplitEquipmentProfile, string> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebell',
  // A cable stack is the object that most says "commercial gym floor" without naming a machine
  // the program does not actually call for.
  full_gym: 'cable-machine',
  // The two bodyweight programs in the library are the Recommended Routine family, which is
  // written around a bar to hang from.
  bodyweight: 'pull-up-bar',
  minimal: 'dumbbell',
};

/** How many kit portraits fit beside a split's name on a 390 px card before the row crowds. */
const FACE_EQUIPMENT = 3;

/**
 * WHAT THIS PROGRAM IS WRITTEN AROUND, DRAWN.
 *
 * The split cards — in onboarding and in the change-split sheet — were the last decision surface
 * in the app made entirely of text: a name, two badges, a blurb, a day strip. "Can I even run this
 * where I train?" is the first question a program has to answer and it was answerable only by
 * expanding the card. The composite-strip pattern is lifted wholesale from `LocationStep`, where
 * it is already proven at 390 px, and turns gold when the card is the chosen one so the strip
 * joins the selection rather than fighting it.
 *
 * Decorative and `aria-hidden`: the radio's accessible name is the split's own text, and the
 * detail panel states the kit in words with a have/don't-have check against the athlete's answers.
 */
function EquipmentStrip({ split, selected }: { split: SplitDefinition; selected: boolean }) {
  const slugs =
    split.required_equipment.length > 0
      ? split.required_equipment.slice(0, FACE_EQUIPMENT)
      : [PROFILE_GLYPH[split.equipment_profile]];
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex shrink-0 items-center gap-0.5 rounded-sm px-1.5 py-1 transition-colors',
        selected ? 'bg-accent-muted' : 'bg-muted',
      )}
    >
      {slugs.map((slug) => (
        <EquipmentIllustration key={slug} slug={slug} size={18} selected={selected} />
      ))}
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export interface SplitCardProps {
  split: SplitDefinition;
  selected: boolean;
  onSelect: () => void;
  /** short "why this" line shown on the collapsed face, e.g. "Best match · Fits 4 days/week" */
  reason?: string;
  /** EVERY reason the recommender gave — rendered in full inside the detail */
  reasons?: readonly string[];
  /**
   * The athlete's live draft, used to build the honest preview. Onboarding must pass it (its draft
   * lives in React state until the step commits); other surfaces may omit it and get the stored one.
   */
  draft?: Partial<OnboardingDraft> | null;
  testId?: string;
  /** controlled disclosure — omit both to let the card manage its own open state */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
}

export function SplitCard({
  split,
  selected,
  onSelect,
  reason,
  reasons,
  draft,
  testId,
  expanded,
  onExpandedChange,
}: SplitCardProps) {
  // Controlled when the list wants one card open at a time (it does, on a 664 px-tall phone);
  // self-managed otherwise so the component is still usable on its own.
  const [ownExpanded, setOwnExpanded] = React.useState(false);
  const isOpen = expanded ?? ownExpanded;
  const toggle = () => (onExpandedChange ? onExpandedChange(!isOpen) : setOwnExpanded(!isOpen));

  const prefix = testId ?? `split-option-${split.slug}`;
  const detailId = `${prefix}-panel`;

  return (
    <Card
      selected={selected}
      className={cn(
        '!p-0 overflow-hidden transition-colors',
        !selected && 'hover:border-border-strong',
      )}
    >
      {/* The option itself. Interactive, but with NO interactive descendants — see the file header. */}
      <div
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        data-testid={testId}
        data-split-slug={split.slug}
        className="cursor-pointer p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex items-start gap-2.5">
          <EquipmentStrip split={split} selected={selected} />
          <div className="min-w-0 flex-1">
            {/* FIRST semibold <p> in the radio — the split spec reads the program name from here.
                The kit strip above is a <span>, so it cannot be mistaken for it. */}
            <p className="text-[0.9375rem] font-semibold leading-tight text-foreground">
              {split.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge>{daysLabel(split)}</Badge>
              <Badge>{levelLabel(split.levels)}</Badge>
            </div>
            <p className="mt-1.5 text-[0.75rem] leading-snug text-muted-foreground">
              {split.description}
            </p>
            <DayStrip split={split} daysPerWeek={draft?.days_per_week} className="mt-1.5" />
            {reason && <p className="mt-1 text-[10px] font-medium text-accent">{reason}</p>}
          </div>
          <span
            aria-hidden
            className={cn(
              'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors',
              selected
                ? 'border-accent bg-accent text-surface'
                : 'border-border bg-surface text-transparent',
            )}
          >
            <CheckIcon size={14} />
          </span>
        </div>
      </div>

      {/* The affordance the card never had. Full-width because it is a phone target, and outside
          the radio because a button inside a radio is neither announceable nor safely clickable. */}
      <m.button
        type="button"
        onClick={toggle}
        whileTap={{ scale: 0.98 }}
        transition={SPRING.press}
        aria-expanded={isOpen}
        aria-controls={detailId}
        aria-label={`${isOpen ? 'Hide' : 'See'} the full week for ${split.name}`}
        data-testid={`${prefix}-toggle`}
        className="flex w-full items-center justify-center gap-1 border-t border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {isOpen ? 'Hide the full week' : 'See the full week'}
        <ChevronDownIcon
          size={13}
          aria-hidden
          className={'transition-transform duration-200 ' + (isOpen ? 'rotate-180' : '')}
        />
      </m.button>

      {/* Height-animated so the detail is understood to have PUSHED the list down rather than
          replaced it — the card you tapped stays where your finger left it. */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <m.div
            key="detail"
            id={detailId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING.panel}
            className="overflow-hidden"
          >
            <SplitDetail
              split={split}
              draft={draft}
              reasons={reasons}
              testIdPrefix={prefix}
            />
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
