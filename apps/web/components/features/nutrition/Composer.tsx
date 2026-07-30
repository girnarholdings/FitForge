'use client';

/**
 * "What did you eat?" — the primary way to log food.
 *
 * A chat-style composer parked in the thumb zone, clear of the bottom tab bar. Typing a sentence
 * and sending it runs the deterministic parser (`lib/food/parse`) and opens the confirm step;
 * nothing is written to the day until the user confirms there.
 */
import * as React from 'react';
import { SendIcon, SparkleIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

const EXAMPLES = [
  '2 eggs and a slice of toast with butter',
  'chicken breast 200g, rice 1 cup',
  'large latte',
  'bowl of oatmeal with banana',
];

export function Composer({
  onSubmit,
  showExamples,
}: {
  onSubmit: (text: string) => void;
  showExamples?: boolean;
}) {
  const [text, setText] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  // A double-tap's second dispatch can arrive in the same tick, before the cleared input has
  // re-rendered the send button disabled — a state flag or `disabled` alone would let the same
  // sentence through twice. A ref latch blocks re-entry immediately; editing re-arms it, so a
  // deliberate second meal moments later still goes through.
  const sentRef = React.useRef(false);

  function edit(value: string) {
    sentRef.current = false;
    setText(value);
  }

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || sentRef.current) return;
    sentRef.current = true;
    // Clear only after the parse has accepted the sentence: if `onSubmit` throws, the typed
    // meal must still be in the field, not silently gone.
    onSubmit(trimmed);
    setText('');
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 md:static md:z-auto">
      {/* Fades the list out under the composer instead of cutting it with a hard rule. A gradient
          is one painted quad — unlike the blur this replaces, it costs nothing per scroll frame. */}
      <div
        aria-hidden
        className="h-8 bg-gradient-to-t from-surface to-transparent md:hidden"
      />
      {/* OPAQUE and un-blurred. This sat directly above the tab bar, so the nutrition screen was
          paying for THREE stacked backdrop-filter layers on every scroll frame — top bar, tab bar
          and this — which is the scroll stutter. `pb` clears the floating pill below. */}
      <div className="bg-surface px-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-1 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto w-full max-w-[720px]">
          {showExamples && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    edit(e);
                    inputRef.current?.focus();
                  }}
                  className="shrink-0 rounded-chip border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
            className={cn(
              // THE PRIMARY ACTION ON THIS SCREEN, styled like one. It was a `bg-surface-2` field
              // inside a `bg-surface/95` strip — two greys a few percent apart on the dark theme,
              // divided by a hairline — which reads as a disabled bar rather than "type here". A
              // strong border and a lifted shadow give it an edge you can find without hunting.
              'flex items-center gap-2 rounded-2xl border-2 p-1.5',
              'border-border-strong bg-surface-2 shadow-[var(--shadow-pop)]',
              'transition-colors focus-within:border-accent',
            )}
          >
            <span aria-hidden className="pl-2 text-accent">
              <SparkleIcon size={18} />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => edit(e.target.value)}
              data-testid="nutrition-composer"
              aria-label="What did you eat?"
              placeholder="What did you eat?"
              autoComplete="off"
              enterKeyHint="send"
              // `placeholder:text-foreground/55` rather than `text-muted-foreground`: the
              // placeholder IS the instruction on this screen, and at muted contrast over
              // surface-2 it was the faintest text in the app.
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-foreground/55"
            />
            <button
              type="submit"
              data-testid="composer-submit"
              aria-label="Review what you ate"
              disabled={text.trim().length === 0}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-[background-color,color,transform] duration-150 active:scale-95 disabled:bg-muted disabled:text-muted-foreground bg-accent text-accent-foreground"
            >
              <SendIcon size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
