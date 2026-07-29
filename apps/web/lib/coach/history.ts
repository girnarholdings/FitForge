/**
 * CONVERSATION MEMORY for the Coach, and the decision of when to forget.
 *
 * ─── the bug ────────────────────────────────────────────────────────────────────────────────
 * Every question used to be sent alone. So "How much protein do I need?" answered well, and the
 * obvious next word — "why?" — arrived at the model with no idea what "why" was about, and came
 * back as a fresh lecture on something else. The coach could answer questions but could not hold
 * a conversation, which is most of what makes a trainer feel like a person.
 *
 * ─── why not just send everything ───────────────────────────────────────────────────────────
 * These are small free instruct models. Feed them four long turns of their own prose and they
 * start answering the history instead of the question, and the token budget that pays for the
 * ANSWER goes on repeating the past. So history is capped, compressed oldest-first, and dropped
 * entirely when it stops being relevant.
 *
 * ─── when to forget ─────────────────────────────────────────────────────────────────────────
 * A user who asks about protein, gets an answer, then asks "how do I fix my squat depth?" has
 * changed the subject, and dragging protein into that answer is worse than having no memory at
 * all. {@link isFollowUp} decides: a question is a follow-up when it LOOKS referential (short, or
 * leading with a discourse marker, or carrying a pronoun with no new subject) or when it shares
 * real vocabulary with the recent exchange. Otherwise the thread starts fresh.
 *
 * The test is deliberately biased toward FORGETTING. A wrongly-kept history produces a confidently
 * off-topic answer; a wrongly-dropped one produces a slightly generic but correct answer, and the
 * worker's system prompt is told to ignore history that does not fit. Cheap failure, expensive
 * failure — pick the cheap one.
 */

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Exchanges replayed to the model. Three (six messages) is the worker's cap too. */
const MAX_EXCHANGES = 3;
/** Per-message clamps. The assistant gets more room because its answer carries the numbers. */
const MAX_USER_CHARS = 180;
const MAX_ASSISTANT_CHARS = 420;

/** Words that carry no topic and so must not count as shared vocabulary. */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'it',
  'its', 'this', 'that', 'these', 'those', 'my', 'me', 'i', 'you', 'your', 'we', 'they', 'them',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'should', 'would', 'could',
  'will', 'shall', 'may', 'might', 'much', 'many', 'more', 'less', 'get', 'got', 'have', 'has',
  'need', 'want', 'about', 'so', 'then', 'than', 'there', 'not', 'no', 'yes', 'ok', 'okay',
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * Openers that make a question referential no matter what words follow: it is explicitly
 * continuing the previous thought.
 */
const CONTINUES = /^(why|why not|and|but|so|then|what about|how about|ok|okay|also|plus|instead|really|are you sure|is that|does that|what if|which one|how come)\b/i;

/** Bare pronouns that only mean something given a previous answer. */
const REFERENTIAL = /\b(it|that|those|these|them|they|this|the same|the other one)\b/i;

/**
 * Should the conversation so far be sent with this question?
 *
 * Exported for tests — this is the judgement the whole feature turns on, and it deserves cases
 * written down rather than a comment claiming it works.
 */
export function isFollowUp(question: string, priorText: string): boolean {
  const q = question.trim();
  if (!q) return false;
  const words = q.split(/\s+/);

  // An explicit continuation is a follow-up whatever else it contains.
  if (CONTINUES.test(q)) return true;

  // Very short questions cannot be self-contained. "How much?" "Heavier?" "Per day?"
  if (words.length <= 4) return true;

  const prior = contentWords(priorText);
  const now = contentWords(q);
  let shared = 0;
  for (const w of now) if (prior.has(w)) shared++;

  // A pronoun with nothing new to anchor it is referring backwards.
  if (REFERENTIAL.test(q) && shared > 0) return true;

  // Real topical overlap: at least two shared content words, or one when the question is short
  // enough that one is a large share of it.
  if (shared >= 2) return true;
  if (shared === 1 && now.size <= 3) return true;

  return false;
}

interface TurnLike {
  question: string;
  /** What the coach actually said, if anything was said. */
  answer: string | null;
}

/**
 * Build the history to send with `question`, or `[]` when the subject has changed.
 *
 * Older exchanges are compressed harder than recent ones: the most recent answer is the one a
 * follow-up is usually about, so it keeps the most room.
 */
export function buildHistory(turns: TurnLike[], question: string): HistoryMessage[] {
  const answered = turns.filter((t) => t.answer && t.answer.trim().length > 0);
  if (answered.length === 0) return [];

  const recent = answered.slice(-MAX_EXCHANGES);
  const priorText = recent.map((t) => `${t.question} ${t.answer ?? ''}`).join(' ');
  if (!isFollowUp(question, priorText)) return [];

  const out: HistoryMessage[] = [];
  recent.forEach((t, i) => {
    // Oldest of the three gets half the room — it is context, not the subject.
    const isOldest = i === 0 && recent.length === MAX_EXCHANGES;
    const userCap = isOldest ? Math.floor(MAX_USER_CHARS / 2) : MAX_USER_CHARS;
    const botCap = isOldest ? Math.floor(MAX_ASSISTANT_CHARS / 2) : MAX_ASSISTANT_CHARS;
    out.push({ role: 'user', content: compress(t.question, userCap) });
    out.push({ role: 'assistant', content: compress(t.answer ?? '', botCap) });
  });
  return out;
}

/**
 * Trim to a budget on a sentence boundary where possible.
 *
 * Cutting mid-sentence hands the model a fragment it may try to complete; ending on a full stop
 * reads as a finished turn, which is what it is.
 */
function compress(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}
