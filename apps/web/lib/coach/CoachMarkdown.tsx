import * as React from 'react';
import { parseCoachMarkdown } from './markdown';

/**
 * Render an AI answer in the worker's FORMAT subset. All the intelligence is in the parser
 * (see markdown.ts for why a real markdown library is the wrong tool here); this maps blocks
 * to elements and nothing more.
 */
export function CoachMarkdown({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseCoachMarkdown(text), [text]);
  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-foreground">
      {blocks.map((block, i) =>
        block.type === 'ul' ? (
          <ul key={i} className="space-y-1.5 pl-1">
            {block.items.map((spans, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="min-w-0">
                  {spans.map((s, k) =>
                    s.bold ? (
                      <strong key={k} className="font-semibold text-foreground">
                        {s.text}
                      </strong>
                    ) : (
                      <React.Fragment key={k}>{s.text}</React.Fragment>
                    ),
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.spans.map((s, k) =>
              s.bold ? (
                <strong key={k} className="font-semibold text-foreground">
                  {s.text}
                </strong>
              ) : (
                <React.Fragment key={k}>{s.text}</React.Fragment>
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}
