'use client';

/**
 * THE INLINE GLOSSARY TRIGGER — a word on screen that explains itself.
 *
 * WHY A SHEET AND NOT A TOOLTIP: there is no hover on a phone, and a floating popover anchored to
 * a 10px label inside a scrolling card is a positioning problem with no good answer at 390px. The
 * app already owns a bottom sheet (`components/ui/Sheet.tsx`) that slides up over the screen you
 * were on, traps nothing, closes on Escape or a scrim tap, and is `role="dialog"` — i.e. it is
 * both the cheapest and the most testable surface for "define this word". Reusing it also means a
 * definition arrives with the same physics as every other panel in the app.
 *
 * WHY TWO TRIGGERS:
 *   · {@link GlossaryTerm} — the word itself, dotted-underlined, for prose and cue lines. This is
 *     the affordance the design calls for: the term you are reading IS the button.
 *   · {@link GlossaryInfoButton} — an icon-only `?`, for places where the visible text must stay a
 *     real `<label htmlFor>` bound to an input (the set-entry field labels). A `<button>` inside a
 *     `<label>` would hijack the label's click-to-focus behaviour, so the trigger sits beside it.
 *
 * WCAG 2.5.3 (Label in Name), and the reason `GlossaryTerm` takes a `label` string rather than
 * arbitrary children: a control's accessible name must CONTAIN its visible text, so voice control
 * ("tap 8 to 12") works. The visible text is therefore always a prefix of the aria-label. Change
 * one of the two and you must change the other.
 *
 * CONTENT PROVENANCE: the sheet shows the registry's one-liner, then — where the term maps to one
 * — the matching `lib/kb/faq.json` entry verbatim, read at render time via `entryById`. Nothing is
 * duplicated here. The Coach link is the escape hatch for everything the curated answer does not
 * cover.
 */
import * as React from 'react';
import Link from 'next/link';
import { Button, Sheet } from '@/components/ui';
import { ChatIcon, InfoIcon } from '@/components/ui/icons';
import { Pressable } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { entryById } from '@/lib/kb';
import { glossaryEntry, type GlossaryTermId } from './glossary';

/* ══════════════════════════════════════════════════════════════════════════════ the triggers ══ */

export interface GlossaryTermProps {
  id: GlossaryTermId;
  /**
   * The text to render, when the word on screen is not the registry's own term — e.g. the header
   * prints `8–12`, not `Rep range`. Defaults to the term. MUST be plain text: it becomes both the
   * visible label and the head of the accessible name (see the 2.5.3 note above).
   */
  label?: string;
  className?: string;
}

/** The word itself, dotted-underlined. Tap it, get a sentence. */
export function GlossaryTerm({ id, label, className }: GlossaryTermProps) {
  const entry = glossaryEntry(id);
  const [open, setOpen] = React.useState(false);
  const text = label ?? entry.term;

  return (
    <>
      <Pressable
        onClick={() => setOpen(true)}
        data-testid={`glossary-term-${id}`}
        aria-label={`${text} — what does this mean?`}
        aria-haspopup="dialog"
        className={cn(
          // The dotted underline is the whole affordance: it says "there is more here" without
          // spending a colour or an icon on every single term.
          // `inline-block`, not `inline`: a transform (the press feedback) is ignored on an inline
          // box, so a plain `inline` trigger would silently lose the tap response every other
          // control in the app has.
          'inline-block align-baseline underline decoration-dotted decoration-1 underline-offset-[3px]',
          'transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          className,
        )}
      >
        {text}
      </Pressable>
      <GlossarySheet id={id} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Icon-only trigger: 20px OF INK, 28px OF TARGET.
 *
 * The house rule elsewhere in the app is 44px, and this control CANNOT have it. It renders on the
 * SetField label line — a 10px strip with `mb-1` between two 44px `PlateStepper` rows — so a
 * centred 44px pad would reach 12px in both directions into inputs that are themselves primary
 * 44px targets. Two 44px targets whose centres are ~21px apart is not a thing geometry allows;
 * one of them wins, and it must not be the field the athlete is trying to type a weight into.
 * Growing the glyph instead is worse still: it would push every set row ~20px taller on the
 * busiest screen in the app.
 *
 * So the target is enlarged as far as the space genuinely permits and no further. `-inset-1` is
 * 4px a side — 20 + 4 + 4 = 28 — which clears the WCAG 2.5.8 AA minimum of 24x24 and consumes
 * only the 4px gap the label line already owns, taking nothing from either stepper. A transparent
 * `::before` does the work so this costs zero layout.
 *
 * The 44px affordance for this term still exists, just not here: the visible label beside it is a
 * real `<label for>` covering the whole word, and the same explainers are reachable from Coach.
 */
export function GlossaryInfoButton({ id, className }: { id: GlossaryTermId; className?: string }) {
  const entry = glossaryEntry(id);
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Pressable
        onClick={() => setOpen(true)}
        data-testid={`glossary-info-${id}`}
        aria-label={`What does ${entry.term} mean?`}
        aria-haspopup="dialog"
        className={cn(
          'relative grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground/70',
          'touch-manipulation before:absolute before:-inset-1 before:content-[""]',
          'transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          className,
        )}
      >
        <InfoIcon size={13} />
      </Pressable>
      <GlossarySheet id={id} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════ the sheet ══ */

export function GlossarySheet({
  id,
  open,
  onClose,
}: {
  id: GlossaryTermId;
  open: boolean;
  onClose: () => void;
}) {
  const entry = glossaryEntry(id);
  // The long answer is NEVER stored here — it is looked up in the shipped KB every render, so the
  // Coach and this sheet can never drift apart.
  const kb = entry.kbId ? entryById(entry.kbId) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={entry.term}>
      <div data-testid={`glossary-sheet-${id}`}>
        <p className="text-base leading-relaxed text-foreground">{entry.oneLiner}</p>

        {kb && (
          <div className="mt-4 rounded-card border border-border bg-surface p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              From the Coach guide
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{kb.question}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{kb.answer}</p>
          </div>
        )}

        <Link href="/coach" className="mt-4 block" onClick={onClose}>
          <Button variant="secondary" block data-testid={`glossary-ask-${id}`}>
            <ChatIcon size={16} /> Ask the Coach
          </Button>
        </Link>
      </div>
    </Sheet>
  );
}
