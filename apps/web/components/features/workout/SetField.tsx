'use client';

/**
 * ONE LABELLED CONTROL — the structural fix for the set-entry form.
 *
 * ─── the bug this makes unexpressible ───────────────────────────────────────────────────────
 * The set list used to carry a FIXED four-column header — `Weight (kg) | Reps | RPE | Done` — over
 * `grid-cols-[1fr_1fr_2.5rem_2.75rem]`, and every row then re-declared that same template
 * independently. Two declarations of one contract with nothing binding them. So when the ACTIVE row
 * lifted its weight input onto its own line as a `PlateStepper`, column 1 of that row became the
 * "Plate math" trigger — and the header's "Weight (kg)" ended up sitting directly above a button
 * that opens a plate diagram. The owner's report was exact: "labels and entering box don't match".
 *
 * Fixing the alignment would have fixed that instance. It would not have fixed the CLASS: any
 * future row shape (a bodyweight lift, a timed set, a unilateral set) re-opens it, silently,
 * because a header knows nothing about what the rows below it actually render.
 *
 * ─── the rule ───────────────────────────────────────────────────────────────────────────────
 * There is no header any more. A field's label and a field's control are emitted BY THE SAME
 * COMPONENT, FROM THE SAME PROPS, as siblings inside the same cell. It is therefore not possible
 * to write a label that describes a control that is not there: `label` and `name` describe the
 * `<input>` this component itself renders, and `trailing` (the plate-math button) is rendered
 * AFTER that input, never in place of it. Rows are free to be any shape they like.
 *
 * ─── the accessibility contract ─────────────────────────────────────────────────────────────
 * `name` is the accessible name (`aria-label`) — "Set 1 weight", "Set 1 reps", "Set 1 RPE" — and
 * the whole E2E suite locates these fields by it, so it is passed through verbatim. `label` is what
 * a human reads. WCAG 2.5.3 (Label in Name) requires the visible label to be CONTAINED in the
 * accessible name, so voice control ("tap weight") reaches the field it names. That is checked at
 * runtime in development below rather than left to review, because it is exactly the kind of
 * invariant that survives its author.
 *
 * The unit ("kg") is rendered as a SIBLING of the `<label>` element, never inside it: it is
 * genuinely useful to see, and putting it inside the label would break the 2.5.3 subset rule for a
 * word no one would ever speak.
 */
import * as React from 'react';
import { PlateStepper } from '@/components/ui';
import { GlossaryInfoButton } from '@/components/features/shared/GlossaryTerm';
import type { GlossaryTermId } from '@/components/features/shared/glossary';
import { cn } from '@/lib/utils';

/* ───────────────────────────────────────────────────────────────────────────── the label line */

function FieldLabelLine({
  htmlFor,
  label,
  unit,
  glossary,
  align,
}: {
  /** absent = the control is not a labelable element (the collar latch), so the caption is text */
  htmlFor?: string;
  label: string;
  unit?: string;
  glossary?: GlossaryTermId;
  align: 'left' | 'center';
}) {
  const text = (
    <span className="text-[10px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
      {label}
    </span>
  );
  return (
    <div
      className={cn(
        'mb-1 flex min-w-0 items-center gap-1',
        align === 'center' ? 'justify-center' : '',
      )}
    >
      {htmlFor ? (
        // A real `<label for>`: tapping the word focuses the field, which is a genuine 44 px-ish
        // affordance for free on a 10 px line.
        <label htmlFor={htmlFor} className="cursor-pointer">
          {text}
        </label>
      ) : (
        text
      )}
      {unit && (
        <span
          aria-hidden
          className="text-[10px] font-medium leading-none text-muted-foreground/70"
        >
          {unit}
        </span>
      )}
      {glossary && <GlossaryInfoButton id={glossary} className="-my-1" />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────── the number field */

export interface SetFieldProps {
  /** DOM id of the input this component renders; the `<label for>` points here. */
  id: string;
  /** VISIBLE label. MUST be a subset of `name` — see the header (WCAG 2.5.3). */
  label: string;
  /** Accessible name, verbatim: `Set 1 weight` etc. The E2E suite matches on this. */
  name: string;
  /** Unit shown beside the label, outside the `<label>` element. */
  unit?: string;
  /** Term explained by a `?` beside the label, for the words a beginner cannot be expected to know. */
  glossary?: GlossaryTermId;
  /** `null` renders an empty field — the app never shows a fabricated 0. */
  value: number | null;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
  onChange: (next: number | null) => void;
  /**
   * `stepper` dresses the input as a loaded bar (two plates you spin on a sleeve). It is still the
   * same `<input type="number">` underneath — the numeric keypad, the arrow keys and the spinbutton
   * role all depend on that.
   */
  variant?: 'plain' | 'stepper';
  /**
   * An extra control for this field, rendered AFTER the input inside the same cell. It can never
   * replace the input, which is the whole point.
   */
  trailing?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

export function SetField({
  id,
  label,
  name,
  unit,
  glossary,
  value,
  placeholder,
  inputMode = 'decimal',
  onChange,
  variant = 'plain',
  trailing,
  align = 'left',
  className,
}: SetFieldProps) {
  // Dev-only guard on the 2.5.3 contract. A console error rather than a throw: a mismatched label
  // is an accessibility defect, not a reason to blank the screen someone is mid-workout on.
  if (process.env.NODE_ENV !== 'production' && !name.toLowerCase().includes(label.toLowerCase())) {
    // eslint-disable-next-line no-console
    console.error(
      `SetField: visible label "${label}" is not contained in accessible name "${name}" (WCAG 2.5.3).`,
    );
  }

  return (
    <div className={cn('min-w-0', className)}>
      <FieldLabelLine htmlFor={id} label={label} unit={unit} glossary={glossary} align={align} />
      <div className="flex min-w-0 items-center gap-1.5">
        {variant === 'stepper' ? (
          <PlateStepper
            id={id}
            aria-label={name}
            className="min-w-0 flex-1"
            value={value ?? 0}
            onChange={(v) => onChange(v)}
            placeholder={placeholder}
          />
        ) : (
          <input
            id={id}
            type="number"
            inputMode={inputMode}
            aria-label={name}
            value={value ?? ''}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className={cn(
              'h-9 w-full min-w-0 rounded-field border border-border bg-surface px-1.5 text-sm tabular-nums outline-none focus:border-accent',
              align === 'center' && 'text-center',
            )}
          />
        )}
        {trailing}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── the non-input cell */

/**
 * A captioned cell for a control that is not a form field — today, the collar latch.
 *
 * It exists so the "Done" caption is emitted by the same component as the latch it captions, for
 * the same reason as everything above. There is no `<label for>` because a caption pointing at a
 * button is not a form label, and a fake one would make the spec that walks every `label[for]`
 * assert something untrue.
 */
export function SetFieldCell({
  label,
  align = 'left',
  className,
  children,
}: {
  label: string;
  align?: 'left' | 'center';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <FieldLabelLine label={label} align={align} />
      {children}
    </div>
  );
}
