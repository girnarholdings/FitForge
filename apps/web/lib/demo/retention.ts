/**
 * HOW LONG TRAINING IS KEPT, and how much warning you get before any of it goes.
 *
 * ─── why a limit exists at all ──────────────────────────────────────────────────────────────
 * The cloud copy is ONE Firestore document, and Firestore's hard ceiling is 1 MiB (sync stops at
 * 900 kB, see `MAX_BYTES`). An audit measured a committed athlete crossing that at roughly a year
 * of ordinary use — at which point syncing silently froze and everything after that point existed
 * on one phone only. A silent freeze is the worst possible failure here: it looks exactly like
 * working, right up until the device is lost.
 *
 * So the log is bounded: 180 days of workouts and food. That keeps the bundle comfortably inside
 * the ceiling forever instead of walking toward it.
 *
 * ─── nothing disappears without warning ─────────────────────────────────────────────────────
 * The warning starts 30 days out (day 150) and repeats, and it always carries the same one-tap
 * escape: export a backup, which is a complete file of everything including what is about to be
 * trimmed. The prune itself is a hard rule with a soft gate — {@link pruneOldData} refuses to run
 * until a warning has actually been shown, so data can never be deleted from someone who was
 * never told.
 *
 * ─── what is NOT pruned, deliberately ───────────────────────────────────────────────────────
 * Your plan, profile, targets, preferences — none of that is time-series and none of it grows.
 * Neither are WEIGH-INS: a body-weight entry is about thirty bytes, so a decade of daily weighing
 * is under a tenth of the budget, and the long-run weight trend is the single hardest thing for an
 * athlete to reconstruct. Trimming it would save nothing and cost the most. The bulk is workout
 * sessions (every set, of every exercise) and food logs, which is exactly what this trims.
 */

/** The window that is kept. Entries older than this are trimmed. */
export const RETENTION_DAYS = 180;
/** When the warnings start — 30 days of notice, repeated, before anything is removed. */
export const WARN_AFTER_DAYS = 150;

export type RetentionPhase =
  /** nothing logged yet, or too little history to matter */
  | 'ok'
  /** inside the last 30 days before the oldest entries are trimmed */
  | 'warn'
  /** there is genuinely prunable data older than the window */
  | 'due';

export interface RetentionStatus {
  phase: RetentionPhase;
  /** how many days the log spans, oldest prunable entry → today */
  daysLogged: number;
  /** days until the oldest entry crosses the window; 0 once it has */
  daysUntilPrune: number;
  /** entries dated STRICTLY BEFORE this are trimmed (YYYY-MM-DD) */
  cutoff: string;
}

const DAY_MS = 86_400_000;

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. Negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / DAY_MS) : 0;
}

/** `today` shifted back by the retention window — the first date that survives a prune. */
export function pruneCutoff(today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(t)) return today;
  return new Date(t - RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Where this athlete stands. `oldest` is the earliest date among the PRUNABLE records only
 * (workouts and food) — including weigh-ins here would keep the warning on screen forever for
 * someone whose only old record is a weight, and there would be nothing to trim when it fired.
 */
export function retentionStatus(oldest: string | null, today: string): RetentionStatus {
  const cutoff = pruneCutoff(today);
  if (!oldest) return { phase: 'ok', daysLogged: 0, daysUntilPrune: RETENTION_DAYS, cutoff };

  const daysLogged = Math.max(0, daysBetween(oldest, today));
  const daysUntilPrune = Math.max(0, RETENTION_DAYS - daysLogged);
  const phase: RetentionPhase =
    daysLogged >= RETENTION_DAYS ? 'due' : daysLogged >= WARN_AFTER_DAYS ? 'warn' : 'ok';
  return { phase, daysLogged, daysUntilPrune, cutoff };
}

/** The date the oldest entries are trimmed on, for copy that names a day rather than a countdown. */
export function pruneDateFor(oldest: string): string {
  const t = Date.parse(`${oldest}T00:00:00Z`);
  if (!Number.isFinite(t)) return oldest;
  return new Date(t + RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
}
