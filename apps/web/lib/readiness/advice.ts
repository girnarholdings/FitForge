/**
 * DAY ADVICE — the trainer's opinion on everything ELSE that drives the day.
 *
 * A readiness verdict that only touches the workout is half a coach: the same inputs that say
 * "halve the sets" also say what to eat, when to caffeinate and when to be in bed. This module
 * turns a check-in into 1–3 short, concrete lines — nutrition, recovery, hydration — that render
 * under every verdict and persist with the day's entry.
 *
 * Rules, same philosophy as the readiness engine:
 *   · CONCRETE beats correct-but-vague ("front-load carbs — oats, rice, fruit", not "eat well").
 *   · No supplements beyond electrolytes, no medical claims, no calorie prescriptions — the
 *     nutrition tab owns numbers; this owns TODAY'S emphasis.
 *   · Ordered by leverage: illness > sleep > soreness > energy > stress. At most three lines —
 *     four tips is a pamphlet, nobody reads a pamphlet at 7am.
 *
 * The AI path can return sharper advice (it can read "hungover" in free text); these rules are
 * the offline floor and the fallback.
 */
import type { CheckIn, ReadinessVerdict } from './engine';

export type AdviceKind = 'nutrition' | 'hydration' | 'sleep' | 'recovery';

export interface AdviceLine {
  kind: AdviceKind;
  text: string;
}

export function adviceFor(c: CheckIn, v: ReadinessVerdict): AdviceLine[] {
  const out: AdviceLine[] = [];

  if (c.unwell) {
    out.push(
      {
        kind: 'hydration',
        text: 'Fluids first — water plus electrolytes through the day, not all at once.',
      },
      {
        kind: 'nutrition',
        text: 'Easy food today: broth, rice, bananas, toast. Skip alcohol, greasy and spicy.',
      },
      { kind: 'sleep', text: 'Sleep is the actual treatment — clear the evening and take it.' },
    );
    return out;
  }

  if (c.sleepHours != null && c.sleepHours < 6) {
    out.push({
      kind: 'sleep',
      text: `~${c.sleepHours}h of sleep: no caffeine after mid-afternoon, and aim 30–60 min earlier tonight.`,
    });
    out.push({
      kind: 'nutrition',
      text: 'Short sleep reads as hunger — lead meals with protein so the cravings have less room.',
    });
  }

  if (c.soreness >= 4) {
    out.push({
      kind: 'nutrition',
      text: 'Feed the repair: protein at every meal today, not one big hit at dinner.',
    });
    out.push({
      kind: 'recovery',
      text: 'A 15-minute easy walk beats the couch for soreness — motion is lotion.',
    });
  }

  if (c.energy <= 2 && out.length < 3) {
    out.push({
      kind: 'nutrition',
      text: 'Low energy is often low fuel — front-load carbs (oats, rice, fruit) and a big glass of water.',
    });
  }

  if (c.stress >= 4 && out.length < 3) {
    out.push({
      kind: 'recovery',
      text: 'Ten minutes outside and a real lunch away from screens will do more than pushing through.',
    });
  }

  if (out.length === 0) {
    out.push({
      kind: 'nutrition',
      text:
        v.band === 'green'
          ? 'Keep it boring and right: protein spread across meals, water nearby, bank tonight’s sleep.'
          : 'Nothing dramatic — regular meals, water nearby, and an honest bedtime.',
    });
  }

  return out.slice(0, 3);
}
