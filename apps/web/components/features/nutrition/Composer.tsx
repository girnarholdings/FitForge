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

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:static md:z-auto">
      <div
        aria-hidden
        className="h-6 bg-gradient-to-t from-surface to-transparent md:hidden"
      />
      <div className="border-t border-border bg-surface/95 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:backdrop-blur-none">
        <div className="mx-auto w-full max-w-[720px]">
          {showExamples && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setText(e);
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
              'flex items-center gap-2 rounded-2xl border border-border bg-surface-2 p-1.5',
              'shadow-[var(--shadow-card)] focus-within:border-accent',
            )}
          >
            <span aria-hidden className="pl-2 text-accent">
              <SparkleIcon size={18} />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="nutrition-composer"
              aria-label="What did you eat?"
              placeholder="What did you eat?"
              autoComplete="off"
              enterKeyHint="send"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              data-testid="composer-submit"
              aria-label="Review what you ate"
              disabled={text.trim().length === 0}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground transition-opacity disabled:opacity-40"
            >
              <SendIcon size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
