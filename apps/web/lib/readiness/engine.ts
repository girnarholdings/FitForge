/**
 * READINESS ENGINE — transparent rules, no model (PREWALK-IOS-HEALTH phase 3).
 *
 * Each morning the user answers four things (sleep, soreness, energy, stress) plus an
 * "under the weather?" toggle. This module turns that into ONE verdict with a plain-language
 * why. Design rules, from the prewalk's evidence review:
 *
 *   · FIRE RARELY, HIGH PRECISION. HRV/readiness-guided lifting has weak-to-null evidence of
 *     beating ordinary programming, so the engine only speaks up on clearly-bad days — a green
 *     day says nothing and changes nothing. Alarm fatigue kills the feature.
 *   · NEVER SILENT. Every action is an accept/reject OFFER; the engine edits nothing itself.
 *   · THE SAFETY GATE IS SEPARATE FROM SCORING. Feeling unwell doesn't lower a score — it
 *     bypasses the score entirely and recommends rest, because "train through illness" is the
 *     one recommendation this feature must be structurally unable to make.
 *
 * Pure functions over a check-in object, so the SAME engine runs on manual sliders today and on
 * HealthKit-derived inputs later — the iOS work only ever swaps the input provider.
 */

export interface CheckIn {
  /** ISO day, e.g. "2026-07-29" */
  date: string;
  /** last night, in hours; null = didn't say */
  sleepHours: number | null;
  /** 1 = fresh … 5 = wrecked */
  soreness: 1 | 2 | 3 | 4 | 5;
  /** 1 = flat … 5 = full of energy */
  energy: 1 | 2 | 3 | 4 | 5;
  /** 1 = calm … 5 = maxed out */
  stress: 1 | 2 | 3 | 4 | 5;
  /** feels ill / feverish / "coming down with something" */
  unwell: boolean;
  /** optional free text — the hand-off to the AI trainer path */
  note?: string;
}

export type ReadinessBand = 'green' | 'yellow' | 'red';
/** The ONLY actions the engine (or the AI) may offer. A whitelist, shared with the worker task. */
export type AdaptAction = 'proceed' | 'reduce' | 'technique' | 'rest';

export interface ReadinessVerdict {
  band: ReadinessBand;
  /** 0–100, fully derivable from the inputs by a human with the table below */
  score: number;
  action: AdaptAction;
  /** the WHY, in the user's terms — shown verbatim on the offer card */
  reason: string;
  /** true when the illness gate fired; the UI adds the see-a-doctor-if-it-persists line */
  safety: boolean;
}

/**
 * The deduction table. Deliberately coarse and printed in the UI's "how this works" copy —
 * a readiness number nobody can recompute is a mood ring.
 */
function deductions(c: CheckIn): { points: number; why: string }[] {
  const out: { points: number; why: string }[] = [];
  if (c.sleepHours != null) {
    if (c.sleepHours < 5.5) out.push({ points: 30, why: `~${c.sleepHours}h of sleep` });
    else if (c.sleepHours < 7) out.push({ points: 12, why: `${c.sleepHours}h of sleep` });
  }
  if (c.soreness === 5) out.push({ points: 25, why: 'very sore' });
  else if (c.soreness === 4) out.push({ points: 14, why: 'quite sore' });
  if (c.energy === 1) out.push({ points: 25, why: 'no energy' });
  else if (c.energy === 2) out.push({ points: 14, why: 'low energy' });
  if (c.stress === 5) out.push({ points: 18, why: 'maxed-out stress' });
  else if (c.stress === 4) out.push({ points: 10, why: 'high stress' });
  return out;
}

export function assessReadiness(c: CheckIn): ReadinessVerdict {
  /* The illness gate — before, and independent of, any arithmetic. */
  if (c.unwell) {
    return {
      band: 'red',
      score: 0,
      action: 'rest',
      reason: 'You said you feel unwell. Training adds stress your body is already spending.',
      safety: true,
    };
  }

  const ded = deductions(c);
  const score = Math.max(0, 100 - ded.reduce((n, d) => n + d.points, 0));
  const why = ded
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((d) => d.why)
    .join(' and ');

  if (score >= 70) {
    return { band: 'green', score, action: 'proceed', reason: 'You look ready — train as planned.', safety: false };
  }
  if (score >= 45) {
    // Sore is the one yellow where LESS LOAD, not LESS WORK, is the right lever: a technique day
    // keeps the pattern greased without adding damage. Everything else halves the dose.
    const technique = c.soreness >= 4;
    return {
      band: 'yellow',
      score,
      action: technique ? 'technique' : 'reduce',
      reason: `Rough morning — ${why}. ${
        technique
          ? 'Keep the movements, drop the load: a light technique day.'
          : 'Do today’s session at half the sets — showing up matters more than the dose.'
      }`,
      safety: false,
    };
  }
  return {
    band: 'red',
    score,
    action: 'rest',
    reason: `Today reads like a recovery day — ${why}. One rest day costs nothing; training through this usually does.`,
    safety: false,
  };
}

/** Wire-safe action whitelist, shared by the check-in card and the AI adapt response validator. */
export const ADAPT_ACTIONS: readonly AdaptAction[] = ['proceed', 'reduce', 'technique', 'rest'];

export function isAdaptAction(v: unknown): v is AdaptAction {
  return typeof v === 'string' && (ADAPT_ACTIONS as readonly string[]).includes(v);
}
