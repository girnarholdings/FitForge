/**
 * THE COACH'S MARKDOWN — a parser for exactly the subset the worker's FORMAT contract permits:
 * plain sentences, `- ` bullets, and `**bold**`. Nothing else.
 *
 * Why not a markdown library: the input is model output. A real markdown renderer's power is
 * exactly the risk surface — links with hallucinated targets, images, HTML passthrough, headings
 * that break the card's type hierarchy. This parser cannot render what the contract forbids
 * because it has no code for it; unknown syntax falls through as literal text, which is the
 * honest failure mode for a model that ignored its instructions.
 *
 * Pure data out (no React) so it unit-tests in node without a DOM; the ~20-line component that
 * maps blocks to elements lives beside it in CoachMarkdown.tsx.
 */

export type Span = { bold: boolean; text: string };
export type Block = { type: 'p'; spans: Span[] } | { type: 'ul'; items: Span[][] };

/** Split one line into bold/plain spans. Unclosed `**` is literal text, not silent styling. */
export function parseSpans(line: string): Span[] {
  const spans: Span[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) spans.push({ bold: false, text: line.slice(last, m.index) });
    spans.push({ bold: true, text: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ bold: false, text: line.slice(last) });
  return spans;
}

/** Parse a full answer: consecutive `- ` lines group into one list; everything else is a paragraph. */
export function parseCoachMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let list: Span[][] | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      list = null;
      continue;
    }
    const bullet = /^[-•]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) {
        list = [];
        blocks.push({ type: 'ul', items: list });
      }
      list.push(parseSpans(bullet[1]!));
    } else {
      list = null;
      blocks.push({ type: 'p', spans: parseSpans(line) });
    }
  }
  return blocks;
}
