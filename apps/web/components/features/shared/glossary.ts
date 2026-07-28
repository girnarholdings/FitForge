/**
 * THE GLOSSARY — one plain-English sentence per word the app puts on screen.
 *
 * WHY THIS EXISTS: the workout player is dense with gym vocabulary that it never defines — "set",
 * "reps", "RPE", "top set", "back-off", "90%". A beginner cannot put an honest number in a box
 * whose header they cannot read, and the failure mode is silent: they latch the pre-filled target
 * and move on. Every term below is one the app itself prints.
 *
 * THE REUSE RULE (non-negotiable, and the reason this file is a registry rather than a content
 * store): an entry holds ONLY the short definition. Anything longer than a sentence lives in
 * `lib/kb/faq.json` — the 87-entry curated knowledge base the Coach already searches — and is
 * pulled in at render time through `entryById(kbId)`. Two copies of the same explanation drift;
 * one copy cannot. Where the KB has no matching entry the sheet simply shows the one-liner and
 * offers the Coach, rather than growing a second prose store here.
 *
 * WHAT MAY GO IN A ONE-LINER: what the word means, and how this app treats it. Nothing else.
 * No rep targets, no loading advice, no physiology — those are training claims, they belong to the
 * curated KB where they were written and reviewed, and inventing them here would be exactly the
 * kind of fabricated number the progression rules refuse to produce.
 */

/** Every term the UI can point at. A closed union so a typo is a compile error, not a dead sheet. */
export type GlossaryTermId =
  | 'set'
  | 'rep'
  | 'rep-range'
  | 'rpe'
  | 'working-set'
  | 'warmup-set'
  | 'top-set'
  | 'backoff-set'
  | 'percent-of-top-set'
  | 'rest-between-sets'
  | 'log-the-set'
  | 'progressive-overload'
  | 'plates-per-side';

export interface GlossaryEntry {
  id: GlossaryTermId;
  /** The word EXACTLY as it appears on screen — the sheet title has to match what was tapped. */
  term: string;
  /** ONE sentence, written for someone who has never touched a barbell. */
  oneLiner: string;
  /**
   * The `lib/kb/faq.json` entry that carries the long-form answer, if one exists. Never a copy of
   * it — the id is the link. Left undefined where the KB genuinely has nothing (see
   * `rest-between-sets`: the KB's `re-rest-days` is about DAYS OFF, a different thing entirely,
   * and pointing at it would actively mislead someone standing in a gym watching a countdown).
   */
  kbId?: string;
}

export const GLOSSARY: Record<GlossaryTermId, GlossaryEntry> = {
  set: {
    id: 'set',
    term: 'Set',
    oneLiner:
      'A set is one batch of reps done back to back without putting the weight down — you do a set, you rest, then you do the next one.',
    kbId: 'gs-reps-sets',
  },
  rep: {
    id: 'rep',
    term: 'Rep',
    oneLiner:
      'A rep is one complete lift — down and back up once. "8 reps" means do that eight times in a row.',
    kbId: 'gs-reps-sets',
  },
  'rep-range': {
    id: 'rep-range',
    term: 'Rep range',
    oneLiner:
      'Two numbers like 8–12 mean: use a weight you can lift at least 8 times, and once you can reach 12 on every set with clean form, go heavier next time.',
    kbId: 'pp-when-add-weight',
  },
  rpe: {
    id: 'rpe',
    term: 'RPE',
    oneLiner:
      'RPE is how hard the set felt on a 1–10 scale: 10 means you could not have done one more rep, 8 means you had about two more in you — and if you are not sure, leave it blank, it is optional.',
    kbId: 'ts-rpe-rir',
  },
  'working-set': {
    id: 'working-set',
    term: 'Working set',
    oneLiner:
      'A working set is a set at your real weight that counts toward your training — the light practice sets you do first to warm up do not count.',
    kbId: 'ts-warmup',
  },
  'warmup-set': {
    id: 'warmup-set',
    term: 'Warm-up set',
    oneLiner:
      'A warm-up set is the same exercise with a much lighter weight for a few easy reps to get ready — FitForge does not log warm-up sets, so the rows on this screen are your working sets only.',
    kbId: 'ts-warmup',
  },
  'top-set': {
    id: 'top-set',
    term: 'Top set',
    oneLiner:
      'Your top set is the single heaviest set of that exercise for the day — every other set on the card is described as a share of it.',
    kbId: 'pp-progressive-overload',
  },
  'backoff-set': {
    id: 'backoff-set',
    term: 'Back-off set',
    oneLiner:
      'A back-off set is a lighter set after your heaviest one, so you get more good reps in without repeating the hardest thing you just did.',
    kbId: 'pp-progressive-overload',
  },
  'percent-of-top-set': {
    id: 'percent-of-top-set',
    term: 'Percent of your top set',
    oneLiner:
      'The percent says how heavy this set is compared with your heaviest set of the day — 90% means take roughly a tenth of the weight off.',
    kbId: 'pp-how-much-add',
  },
  'rest-between-sets': {
    id: 'rest-between-sets',
    term: 'Rest between sets',
    oneLiner:
      'Rest is the wait between sets so the next set is as good as the last — the timer starts on its own when you log a set, and nothing on this screen is locked while it runs.',
  },
  'log-the-set': {
    id: 'log-the-set',
    term: 'Logging a set',
    oneLiner:
      'Closing the collar means "I actually did this set", so change the numbers to what really happened before you close it — the boxes start as a suggestion, not a score to hit.',
  },
  'progressive-overload': {
    id: 'progressive-overload',
    term: 'Progressive overload',
    oneLiner:
      'Progressive overload just means the work has to get harder over time — a bit more weight, or a rep or two more than last time.',
    kbId: 'pp-progressive-overload',
  },
  'plates-per-side': {
    id: 'plates-per-side',
    term: 'Plates per side',
    oneLiner:
      'The plate calculator shows what goes on ONE end of the bar — you put the same on the other end, and the calculator has already counted the bar itself (20 kg) before any plates.',
  },
};

export function glossaryEntry(id: GlossaryTermId): GlossaryEntry {
  return GLOSSARY[id];
}
