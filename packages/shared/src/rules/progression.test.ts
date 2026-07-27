import { describe, it, expect } from 'vitest';
import {
  PROGRESSION_SCHEMES,
  PROGRESSION_LIBRARY,
  PROGRESSION_OPTIONS,
  PROGRESSION_EVIDENCE,
  RETIRED_PROGRESSION_SCHEMES,
  DEFAULT_PROGRESSION_SCHEME,
  TOP_SET_RPE_CAP,
  REST_FALLBACK_COMPOUND,
  REST_FALLBACK_ISOLATION,
  prescribeSets,
  recommendProgressionScheme,
  isSchemeLevelAppropriate,
  isRetiredProgressionScheme,
  schemeCaution,
  toProgressionScheme,
  isProgressionScheme,
  suggestedLoadKg,
  describeSetTarget,
  describePrescription,
  restSecondsForSet,
  trimNoticeFor,
  warmupRamp,
} from './progression.js';

/** The routine row every case below re-shapes: 4 working sets of 6–10, compound. */
const ROW = { sets: 4, rep_min: 6, rep_max: 10, target_rpe: 8, mechanics: 'compound' } as const;

describe('progression library', () => {
  it('every scheme has metadata, and the options list mirrors the scheme list', () => {
    for (const slug of PROGRESSION_SCHEMES) {
      const meta = PROGRESSION_LIBRARY[slug];
      expect(meta.slug).toBe(slug);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.tagline.length).toBeGreaterThan(0);
      expect(meta.nextSession.length).toBeGreaterThan(0);
    }
    expect(PROGRESSION_OPTIONS.map((o) => o.slug)).toEqual([...PROGRESSION_SCHEMES]);
  });

  it('ships THREE schemes — the ascending pyramid was cut, not renamed', () => {
    expect(PROGRESSION_SCHEMES).toHaveLength(3);
    expect(PROGRESSION_SCHEMES).toEqual([
      'straight_sets',
      'top_set_backoff',
      'reverse_pyramid',
    ]);
    expect(isProgressionScheme('ascending_pyramid')).toBe(false);
  });

  it('a stored ascending_pyramid migrates itself to the default, and is recognised as retired', () => {
    // The whole migration: no data step, no version bump. It just resolves safely.
    expect(toProgressionScheme('ascending_pyramid')).toBe(DEFAULT_PROGRESSION_SCHEME);
    expect(isRetiredProgressionScheme('ascending_pyramid')).toBe(true);
    expect(isRetiredProgressionScheme('reverse_pyramid')).toBe(false);
    expect(RETIRED_PROGRESSION_SCHEMES).toContain('ascending_pyramid');
  });

  it('coerces anything unrecognised to the safe default', () => {
    expect(toProgressionScheme('reverse_pyramid')).toBe('reverse_pyramid');
    expect(toProgressionScheme('nonsense')).toBe(DEFAULT_PROGRESSION_SCHEME);
    expect(toProgressionScheme(null)).toBe(DEFAULT_PROGRESSION_SCHEME);
    expect(isProgressionScheme('straight_sets')).toBe(true);
    expect(isProgressionScheme(7)).toBe(false);
  });

  it('every scheme number asserted on screen carries a citation, tier included', () => {
    expect(PROGRESSION_EVIDENCE.length).toBeGreaterThanOrEqual(4);
    for (const e of PROGRESSION_EVIDENCE) {
      expect(e.claim.length).toBeGreaterThan(0);
      expect(e.where).toMatch(/Tier [ABC]/);
      expect(e.url).toMatch(/^https:\/\//);
    }
    // The convention entry is the point of the list: it says out loud where there is no trial.
    expect(PROGRESSION_EVIDENCE.some((e) => /convention/i.test(e.claim))).toBe(true);
  });
});

describe('the scheme changes the prescription, not just the label', () => {
  it('straight sets are flat, and carry the RANGE rather than the top of it', () => {
    const p = prescribeSets(ROW, 'straight_sets');
    expect(p.sets).toHaveLength(4);
    expect(p.sets.map((s) => s.loadPct)).toEqual([100, 100, 100, 100]);
    // Double progression: the range is the prescription, its top is the trigger to add load.
    expect(p.sets.map((s) => s.repsLow)).toEqual([6, 6, 6, 6]);
    expect(p.sets.map((s) => s.repsHigh)).toEqual([10, 10, 10, 10]);
    expect(p.sets.map((s) => s.reps)).toEqual([10, 10, 10, 10]);
    expect(describeSetTarget(p.sets[0]!)).toBe('6–10 reps @ 100%');
  });

  it('reverse pyramid puts the heaviest set first and adds reps as load comes off', () => {
    const p = prescribeSets(ROW, 'reverse_pyramid');
    expect(p.sets[0]!.role).toBe('top');
    expect(p.sets.map((s) => s.loadPct)).toEqual([100, 90, 81]);
    expect(p.sets.map((s) => s.reps)).toEqual([6, 8, 10]);
    // Per-set instructions, not ranges — printing "6–10" on a 100% set would be nonsense.
    expect(p.sets.every((s) => s.repsLow === s.repsHigh)).toBe(true);
    for (let i = 1; i < p.sets.length; i++) {
      expect(p.sets[i]!.loadPct!).toBeLessThan(p.sets[i - 1]!.loadPct!);
      expect(p.sets[i]!.reps).toBeGreaterThan(p.sets[i - 1]!.reps);
    }
  });

  it('reverse pyramid is capped at THREE working sets, and says which set it dropped', () => {
    const p = prescribeSets(ROW, 'reverse_pyramid');
    // The row asked for 4. A 4th would land at 73% for 12 reps — junk volume, not the stimulus.
    expect(p.sets).toHaveLength(3);
    expect(p.trimmedFrom).toBe(4);
    expect(trimNoticeFor(p)).toContain('set 4 dropped');
    // Nothing is trimmed when the row already fits, and nothing is claimed either.
    const fits = prescribeSets({ ...ROW, sets: 3 }, 'reverse_pyramid');
    expect(fits.trimmedFrom).toBeNull();
    expect(trimNoticeFor(fits)).toBeNull();
  });

  it('top set + back-offs is one 100% set then 90% for a couple more reps', () => {
    const p = prescribeSets(ROW, 'top_set_backoff');
    expect(p.sets.map((s) => s.loadPct)).toEqual([100, 90, 90, 90]);
    expect(p.sets.map((s) => s.reps)).toEqual([6, 8, 8, 8]);
    expect(p.sets[0]!.role).toBe('top');
    expect(p.sets[1]!.role).toBe('backoff');
    // Not capped: back-off volume is the whole point of the shape.
    expect(p.trimmedFrom).toBeNull();
  });

  it('the three schemes really do differ for the same row', () => {
    const shapes = PROGRESSION_SCHEMES.map((s) => describePrescription(prescribeSets(ROW, s)));
    expect(new Set(shapes).size).toBe(PROGRESSION_SCHEMES.length);
  });
});

describe('target RPE varies by ROLE, not one number stamped on every set', () => {
  it('straight sets carry the row RPE unchanged', () => {
    expect(prescribeSets(ROW, 'straight_sets').sets.every((s) => s.rpe === 8)).toBe(true);
  });

  it('a reverse-pyramid top set is capped — the copy says "2 in the tank", so the number must too', () => {
    const intermediate = prescribeSets(
      { ...ROW, target_rpe: 10, experience: 'intermediate' },
      'reverse_pyramid',
    );
    expect(intermediate.sets[0]!.rpe).toBe(TOP_SET_RPE_CAP.intermediate);
    expect(intermediate.sets[0]!.rpe).toBe(8);
    // Back-offs keep the row's effort: same RPE, lighter load, more reps.
    expect(intermediate.sets[1]!.rpe).toBe(10);

    const advanced = prescribeSets(
      { ...ROW, target_rpe: 10, experience: 'advanced' },
      'reverse_pyramid',
    );
    expect(advanced.sets[0]!.rpe).toBe(9);

    // The cap never RAISES an easier prescription.
    const easy = prescribeSets({ ...ROW, target_rpe: 6, experience: 'advanced' }, 'reverse_pyramid');
    expect(easy.sets[0]!.rpe).toBe(6);
  });

  it('top-set back-offs run one notch easier, floored at 5', () => {
    const p = prescribeSets(ROW, 'top_set_backoff');
    expect(p.sets[0]!.rpe).toBe(8);
    expect(p.sets.slice(1).every((s) => s.rpe === 7)).toBe(true);
    const floored = prescribeSets({ ...ROW, target_rpe: 5 }, 'top_set_backoff');
    expect(floored.sets[1]!.rpe).toBe(5);
  });

  it('no row RPE means no invented RPE', () => {
    const p = prescribeSets({ ...ROW, target_rpe: null }, 'reverse_pyramid');
    expect(p.sets.every((s) => s.rpe === null)).toBe(true);
  });
});

describe('bodyweight movements carry no percentages at all', () => {
  const BW = { ...ROW, sets: 3, rep_min: 5, rep_max: 8, isBodyweight: true } as const;

  it('reverse pyramid on chin-ups is descending REPS at constant load', () => {
    const p = prescribeSets(BW, 'reverse_pyramid');
    expect(p.isBodyweight).toBe(true);
    // "90% of your bodyweight" is not a thing anyone can do, so there is no percentage to print.
    expect(p.sets.every((s) => s.loadPct === null)).toBe(true);
    expect(p.sets.map((s) => s.reps)).toEqual([8, 6, 5]);
    expect(describeSetTarget(p.sets[0]!)).toBe('8 reps');
  });

  it('straight sets on a bodyweight lift still carry the rep range', () => {
    const p = prescribeSets(BW, 'straight_sets');
    expect(p.sets.every((s) => s.loadPct === null)).toBe(true);
    expect(describeSetTarget(p.sets[0]!)).toBe('5–8 reps');
  });

  it('top set + back-offs drops reps rather than load', () => {
    const p = prescribeSets(BW, 'top_set_backoff');
    expect(p.sets.every((s) => s.loadPct === null)).toBe(true);
    expect(p.sets.map((s) => s.reps)).toEqual([8, 6, 6]);
  });

  it('the COPY matches the numbers — no "drop 10%" beside a constant-load prescription', () => {
    const p = prescribeSets(BW, 'reverse_pyramid');
    expect(p.explainer).not.toMatch(/10%/);
    expect(p.explainer).toMatch(/fewer reps/i);
    // "Add load to it" is not the progression on a chin-up; making the movement harder is.
    expect(p.nextSession).toMatch(/harder/i);
    expect(prescribeSets(BW, 'straight_sets').nextSession).toMatch(/harder/i);
    // A loaded lift keeps the library's own words.
    expect(prescribeSets(ROW, 'reverse_pyramid').explainer).toMatch(/10%/);
  });

  it('a loaded lift is unaffected', () => {
    expect(prescribeSets(ROW, 'reverse_pyramid').sets[0]!.loadPct).toBe(100);
  });
});

describe('compound-only schemes leave accessories alone', () => {
  it('an isolation row falls back to straight sets and says so', () => {
    const p = prescribeSets({ ...ROW, mechanics: 'isolation' }, 'reverse_pyramid');
    expect(p.requested).toBe('reverse_pyramid');
    expect(p.scheme).toBe('straight_sets');
    expect(p.substituted).toBe(true);
    expect(p.sets.map((s) => s.loadPct)).toEqual([100, 100, 100, 100]);
    // The cap belongs to the scheme that was swapped OUT — straight sets keeps all four.
    expect(p.trimmedFrom).toBeNull();
  });

  it('straight sets apply to isolation work untouched', () => {
    const p = prescribeSets({ ...ROW, mechanics: 'isolation' }, 'straight_sets');
    expect(p.scheme).toBe('straight_sets');
    expect(p.substituted).toBe(false);
  });
});

describe('malformed rows can never produce NaN', () => {
  it('an inverted rep range is read as a range', () => {
    const p = prescribeSets({ ...ROW, rep_min: 12, rep_max: 8 }, 'reverse_pyramid');
    expect(p.sets[0]!.reps).toBe(8);
    expect(p.sets.every((s) => Number.isFinite(s.reps) && Number.isFinite(s.loadPct!))).toBe(true);
  });

  it('zero / negative / non-finite set counts yield no sets rather than garbage', () => {
    expect(prescribeSets({ ...ROW, sets: 0 }, 'straight_sets').sets).toHaveLength(0);
    expect(prescribeSets({ ...ROW, sets: -3 }, 'reverse_pyramid').sets).toHaveLength(0);
    expect(prescribeSets({ ...ROW, sets: Number.NaN }, 'straight_sets').sets).toHaveLength(0);
  });

  it('a NaN rep range still prescribes real reps', () => {
    const p = prescribeSets({ ...ROW, rep_min: Number.NaN, rep_max: Number.NaN }, 'straight_sets');
    expect(p.sets.every((s) => Number.isInteger(s.reps) && s.reps >= 1)).toBe(true);
  });

  it('a long pyramid never drops below the useful-load floor', () => {
    // The 3-set cap makes this unreachable today; the floor stays as the guard that keeps it so.
    const p = prescribeSets({ ...ROW, sets: 12 }, 'straight_sets');
    expect(Math.min(...p.sets.map((s) => s.loadPct!))).toBeGreaterThanOrEqual(55);
  });
});

describe('safety: novices are never defaulted into reverse pyramid', () => {
  it('the recommendation never exceeds the athlete’s level', () => {
    for (const goal of ['strength', 'hypertrophy', 'fat_loss', 'endurance', 'general_health'] as const) {
      const rec = recommendProgressionScheme({ experience_level: 'beginner', primary_goal: goal });
      expect(rec).toBe('straight_sets');
      expect(isSchemeLevelAppropriate(rec, 'beginner')).toBe(true);
    }
  });

  it('experienced lifters get the sharper tools', () => {
    expect(
      recommendProgressionScheme({ experience_level: 'intermediate', primary_goal: 'strength' }),
    ).toBe('top_set_backoff');
    expect(
      recommendProgressionScheme({ experience_level: 'advanced', primary_goal: 'hypertrophy' }),
    ).toBe('reverse_pyramid');
    // Hypertrophy at INTERMEDIATE is deliberately not reverse pyramid.
    expect(
      recommendProgressionScheme({ experience_level: 'intermediate', primary_goal: 'hypertrophy' }),
    ).toBe('straight_sets');
  });

  it('missing answers fall back to the safest scheme', () => {
    expect(recommendProgressionScheme({})).toBe(DEFAULT_PROGRESSION_SCHEME);
    expect(recommendProgressionScheme({ experience_level: null, primary_goal: null })).toBe(
      DEFAULT_PROGRESSION_SCHEME,
    );
  });

  it('an explicit novice choice is honoured but carries a warning', () => {
    expect(isSchemeLevelAppropriate('reverse_pyramid', 'beginner')).toBe(false);
    expect(schemeCaution('reverse_pyramid', 'beginner')).toContain('heaviest set');
    // No warning where none is warranted.
    expect(schemeCaution('reverse_pyramid', 'advanced')).toBeNull();
    expect(schemeCaution('straight_sets', 'beginner')).toBeNull();
    // The scheme is still applied — we guide, we do not overrule.
    expect(prescribeSets(ROW, 'reverse_pyramid').scheme).toBe('reverse_pyramid');
  });
});

describe('the warm-up ramp is a real prescription, not a cue', () => {
  it('a loaded compound ramps 40/60/80 in the movement being trained', () => {
    const ramp = warmupRamp({ topSetKg: 100, mechanics: 'compound', scheme: 'straight_sets' });
    expect(ramp.map((w) => w.loadPct)).toEqual([40, 60, 80]);
    expect(ramp.map((w) => w.reps)).toEqual([5, 3, 2]);
    expect(ramp.map((w) => w.loadKg)).toEqual([40, 60, 80]);
    expect(ramp.map((w) => w.index)).toEqual([1, 2, 3]);
  });

  it('reverse pyramid earns a fourth step, because set 1 is the heaviest of the day', () => {
    const ramp = warmupRamp({ topSetKg: 100, mechanics: 'compound', scheme: 'reverse_pyramid' });
    expect(ramp.map((w) => w.loadPct)).toEqual([40, 60, 80, 90]);
    expect(ramp.at(-1)!.reps).toBe(1);
  });

  it('an isolation lift gets one light set, not a four-step ramp', () => {
    const ramp = warmupRamp({ topSetKg: 30, mechanics: 'isolation', scheme: 'reverse_pyramid' });
    expect(ramp).toHaveLength(1);
    expect(ramp[0]!.loadPct).toBe(50);
    expect(ramp[0]!.reps).toBe(10);
  });

  it('a bodyweight lift ramps in REPS, with no percentage and no weight', () => {
    const ramp = warmupRamp({
      topSetKg: null,
      scheme: 'reverse_pyramid',
      isBodyweight: true,
      targetReps: 10,
    });
    expect(ramp).toHaveLength(1);
    expect(ramp[0]!.loadPct).toBeNull();
    expect(ramp[0]!.loadKg).toBeNull();
    expect(ramp[0]!.reps).toBe(5);
    // Never fewer than 3 — a 1-rep "warm-up" warms nothing.
    expect(warmupRamp({ scheme: 'straight_sets', isBodyweight: true, targetReps: 4 })[0]!.reps).toBe(3);
  });

  it('with no logged history it prints percentages and refuses to invent a weight', () => {
    const ramp = warmupRamp({ topSetKg: null, mechanics: 'compound', scheme: 'reverse_pyramid' });
    // The athlete most likely to need a warm-up is the one with no history, so the STEPS survive…
    expect(ramp.map((w) => w.loadPct)).toEqual([40, 60, 80, 90]);
    // …and only the fabricated part is withheld.
    expect(ramp.every((w) => w.loadKg === null)).toBe(true);
  });
});

/**
 * THE POSITIONAL TAPER. Every compound used to get the full ramp regardless of where it sat in the
 * session — a 40/60/80/90 ramp on the fourth pulling movement of a day, under a header reading
 * "WARM-UP · REQUIRED", after the lats had already done seven-plus hard sets. That is 3-4 wasted
 * minutes per lift and the single biggest reason people start skipping ramps entirely, including on
 * the first lift, where the ramp IS the safety mechanism.
 *
 * Tested HERE rather than end-to-end on purpose: the generator writes one exercise per movement
 * pattern per day and the catalog's compounds each carry a single primary muscle, so a DEFAULT
 * generated day never reaches the already-warm state. The taper fires on hand-edited routines and
 * on splits that deliberately double a pattern (a push day with bench AND incline press), and the
 * decision itself is a pure function — so this is where it can be pinned down exactly, rather than
 * in a pager walk that would pass for the wrong reason.
 */
describe('warmupRamp · position', () => {
  it('a cold compound gets the full ramp', () => {
    expect(
      warmupRamp({ mechanics: 'compound', scheme: 'straight_sets', patternAlreadyWarm: false }),
    ).toHaveLength(3);
  });

  it('a compound on an already-warm pattern gets ONE feeler, not four steps', () => {
    const ramp = warmupRamp({
      topSetKg: 100,
      mechanics: 'compound',
      scheme: 'straight_sets',
      patternAlreadyWarm: true,
    });
    expect(ramp).toHaveLength(1);
    expect(ramp[0]!.loadPct).toBe(60);
    expect(ramp[0]!.loadKg).toBe(60);
  });

  it('the feeler sits HIGHER under reverse pyramid, because set 1 is still the heaviest', () => {
    const ramp = warmupRamp({
      topSetKg: 100,
      mechanics: 'compound',
      scheme: 'reverse_pyramid',
      patternAlreadyWarm: true,
    });
    expect(ramp).toHaveLength(1);
    expect(ramp[0]!.loadPct).toBe(80);
  });

  it('an isolation lift on an already-warm pattern gets NO ramp at all', () => {
    // A curl after five sets of rows does not need a warm-up set, and printing one under a
    // "required" header is how an athlete learns that the header is noise.
    expect(
      warmupRamp({ mechanics: 'isolation', scheme: 'straight_sets', patternAlreadyWarm: true }),
    ).toEqual([]);
    // …and a bodyweight movement on a warm pattern likewise: there is no load left to taper.
    expect(
      warmupRamp({ scheme: 'straight_sets', isBodyweight: true, patternAlreadyWarm: true }),
    ).toEqual([]);
  });

  it('defaults to COLD, so a caller with no notion of order still gets the protective ramp', () => {
    expect(warmupRamp({ mechanics: 'compound', scheme: 'reverse_pyramid' })).toHaveLength(4);
  });
});

describe('rest comes from the ROW, not from a mechanics constant', () => {
  it("uses the row's own goal-aware rest", () => {
    // A hypertrophy compound row rests 90s. The player used to run 150s for every compound,
    // making the session card's minute estimate and the timer disagree by minutes per session.
    expect(restSecondsForSet(90, 'work')).toBe(90);
    expect(restSecondsForSet(90, 'backoff')).toBe(90);
  });

  it('falls back to the mechanics default only when the row carries nothing', () => {
    expect(restSecondsForSet(null, 'work', 'compound')).toBe(REST_FALLBACK_COMPOUND);
    expect(restSecondsForSet(undefined, 'work', 'isolation')).toBe(REST_FALLBACK_ISOLATION);
    expect(restSecondsForSet(0, 'work', 'compound')).toBe(REST_FALLBACK_COMPOUND);
    expect(restSecondsForSet(Number.NaN, 'work', 'isolation')).toBe(REST_FALLBACK_ISOLATION);
  });

  it('a top set earns 1.25× rest, rounded to 15s and capped at five minutes', () => {
    expect(restSecondsForSet(90, 'top')).toBe(120); // 112.5 → nearest 15 rounds up
    expect(restSecondsForSet(150, 'top')).toBe(195); // 187.5 → nearest 15 rounds up
    expect(restSecondsForSet(300, 'top')).toBe(300); // never past the cap
    expect(restSecondsForSet(600, 'top')).toBe(300); // a nonsense row is clamped too
  });
});

describe('suggestedLoadKg', () => {
  it('scales the athlete’s own top set and rounds to a loadable jump', () => {
    expect(suggestedLoadKg(100, 90)).toBe(90);
    expect(suggestedLoadKg(100, 81)).toBe(80);
    expect(suggestedLoadKg(62.5, 100)).toBe(62.5);
  });

  it('refuses to invent a weight when there is no history or no percentage', () => {
    expect(suggestedLoadKg(null, 90)).toBeNull();
    expect(suggestedLoadKg(0, 90)).toBeNull();
    expect(suggestedLoadKg(Number.NaN, 90)).toBeNull();
    // A bodyweight set target carries `loadPct: null`; there is nothing to scale.
    expect(suggestedLoadKg(100, null)).toBeNull();
  });
});
