/**
 * SMITH RANKS — the app's progression ladder, denominated in STRIKES.
 *
 * A strike is one finished session (one hammer blow on the anvil — the same metaphor the logo,
 * the Coach icon and the PR spark already trade in). The ladder exists to give a beginner a
 * horizon that is not "abs someday": the next rank is always a countable number of workouts away,
 * and the counting is done by data the app already keeps ({@link getSessions} — local, offline,
 * erased and restored with everything else).
 *
 * TUNED FOR REAL TRAINING CADENCE, not for app engagement: at 3 sessions/week the first promotion
 * lands inside week one (novelty needs feeding), Blacksmith takes ~2 months (the point where the
 * habit is real), and Anvil Lord is most of a year of honest work. Every threshold is a round
 * number a person can hold in their head.
 *
 * PURE FUNCTIONS ONLY. No storage, no React — the workout summary computes "did this session
 * cross a boundary?" by calling {@link rankFor} twice (before/after), which stays correct however
 * sessions end up being counted.
 */

export interface ForgeRank {
  /** 0-based ladder position. */
  index: number;
  name: string;
  /** Total strikes (finished sessions) at which the rank is earned. */
  minStrikes: number;
}

export const FORGE_RANKS: readonly ForgeRank[] = [
  { index: 0, name: 'Spark', minStrikes: 0 },
  { index: 1, name: 'Apprentice', minStrikes: 3 },
  { index: 2, name: 'Striker', minStrikes: 8 },
  { index: 3, name: 'Journeyman', minStrikes: 15 },
  { index: 4, name: 'Blacksmith', minStrikes: 25 },
  { index: 5, name: 'Forgemaster', minStrikes: 40 },
  { index: 6, name: 'Grandmaster', minStrikes: 60 },
  { index: 7, name: 'Anvil Lord', minStrikes: 100 },
];

export interface RankStanding {
  rank: ForgeRank;
  /** The next rung, or null at the top of the ladder. */
  next: ForgeRank | null;
  /** Strikes still owed for `next` (0 at the top). */
  toNext: number;
  /** 0..1 progress from `rank` to `next` (1 at the top — the bar reads full, not broken). */
  progress: number;
}

/** Where `strikes` finished sessions puts you on the ladder. Negative/NaN clamps to the bottom. */
export function rankFor(strikes: number): RankStanding {
  const n = Number.isFinite(strikes) ? Math.max(0, Math.floor(strikes)) : 0;
  let rank = FORGE_RANKS[0]!;
  for (const r of FORGE_RANKS) {
    if (n >= r.minStrikes) rank = r;
    else break;
  }
  const next = FORGE_RANKS[rank.index + 1] ?? null;
  if (!next) return { rank, next: null, toNext: 0, progress: 1 };
  const span = next.minStrikes - rank.minStrikes;
  return {
    rank,
    next,
    toNext: next.minStrikes - n,
    progress: span > 0 ? (n - rank.minStrikes) / span : 1,
  };
}
