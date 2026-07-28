import { describe, it, expect } from 'vitest';
import {
  PREFERENCE_LIST_SIZE,
  SEX_LIKED_DEFAULT_SLUGS,
  NEUTRAL_PATTERN_GROUPS,
  neutralLikedDefaults,
  dislikedDefaults,
  preferencePrefill,
  preferenceSourceForSex,
  selectablePreferenceCatalog,
  rankWeight,
  RANK_WEIGHTS,
  likedSelectionBonus,
  dislikedSelectionPenalty,
  likedSplitBonus,
  LIKED_SPLIT_MAX_BONUS,
  substituteDisliked,
  substituteAllDisliked,
  sexAdjustedPrescription,
  FEMALE_REST_MULTIPLIER,
  MIN_REST_SECONDS,
  type DislikeContext,
} from './preferences.js';
import { recommendSplits, SPLIT_LIBRARY, getSplit } from './splits.js';
import type { CatalogExercise } from './substitution.js';
import type { MovementPattern, SexType } from '../types/database.js';
import { catalogFixture, substitutionEdgesFixture } from '../fixtures/index.js';

const ALL_SEXES: SexType[] = ['male', 'female', 'other', 'prefer_not_to_say'];
const bySlug = new Map(catalogFixture.map((e) => [e.slug, e] as const));

function subCtx(over: Partial<DislikeContext> = {}): DislikeContext {
  return {
    ownedEquipment: new Set<string>(),
    trainingLocation: 'commercial_gym',
    experience: 'intermediate',
    excludedExercises: new Set<string>(),
    excludedPatterns: new Set<MovementPattern>(),
    favorites: new Set<string>(),
    disliked: new Set<string>(),
    ...over,
  };
}

/* ══════════════════════════════════════════════════ THE GUARDRAIL — asserted first, explicitly */

describe('guardrail · a sex default is a PRE-FILL, never a filter', () => {
  it('every exercise in the catalog is reachable for every sex', () => {
    const everything = new Set(
      catalogFixture.filter((e) => e.is_active !== false).map((e) => e.slug),
    );
    for (const sex of ALL_SEXES) {
      // The browse/select surface takes no sex at all — that is the design. Prove it by asserting
      // the SAME set comes back no matter who is asking.
      const reachable = new Set(selectablePreferenceCatalog(catalogFixture).map((e) => e.slug));
      expect(reachable, `sex=${sex}`).toEqual(everything);
    }
  });

  it('no exercise is unreachable by sex — set difference across all sexes is empty', () => {
    const perSex = ALL_SEXES.map(
      () => new Set(selectablePreferenceCatalog(catalogFixture).map((e) => e.slug)),
    );
    const union = new Set(perSex.flatMap((s) => [...s]));
    for (const s of perSex) {
      const missing = [...union].filter((slug) => !s.has(slug));
      expect(missing).toEqual([]);
    }
  });

  it('sex changes only the ORDER of the pre-filled list, never its size or legality', () => {
    for (const sex of ALL_SEXES) {
      const prefill = preferencePrefill(sex, catalogFixture);
      expect(prefill.liked).toHaveLength(PREFERENCE_LIST_SIZE);
      expect(new Set(prefill.liked).size).toBe(PREFERENCE_LIST_SIZE); // no duplicates
      for (const slug of prefill.liked) expect(bySlug.has(slug)).toBe(true);
    }
  });

  it('a woman can pick bench press and a man can pick the hip thrust', () => {
    const catalog = selectablePreferenceCatalog(catalogFixture);
    expect(catalog.some((e) => e.slug === 'bench-press')).toBe(true);
    expect(catalog.some((e) => e.slug === 'barbell-hip-thrust')).toBe(true);
  });

  it('the screen always carries the provenance of the suggestion', () => {
    for (const sex of ALL_SEXES) {
      const prefill = preferencePrefill(sex, catalogFixture);
      expect(prefill.note.length).toBeGreaterThan(40);
      expect(prefill.tier).toBe('C');
      expect(['male_leaning', 'female_leaning', 'neutral']).toContain(prefill.source);
    }
  });

  it('DISLIKED starts empty for everyone, always', () => {
    expect(dislikedDefaults()).toEqual([]);
    for (const sex of ALL_SEXES) {
      expect(preferencePrefill(sex, catalogFixture).disliked).toEqual([]);
    }
    expect(preferencePrefill(null, catalogFixture).disliked).toEqual([]);
  });
});

/* ═════════════════════════════════════════════════════════════════════ the pre-fill contents */

describe('sex-leaning liked defaults', () => {
  it('male-leaning is the researched set, in order', () => {
    expect(preferencePrefill('male', catalogFixture).liked).toEqual([
      'bench-press',
      'lat-pulldown',
      'barbell-back-squat',
      'seated-cable-row',
      'seated-dumbbell-shoulder-press',
    ]);
  });

  it('female-leaning is posterior chain INCLUDING back, not legs/glutes alone', () => {
    const liked = preferencePrefill('female', catalogFixture).liked;
    expect(liked).toEqual([
      'barbell-hip-thrust',
      'romanian-deadlift',
      'goblet-squat',
      'lat-pulldown',
      'walking-lunge',
    ]);
    // the correction the research made to the brief: there IS a pulling movement in here
    const patterns = liked.map((s) => bySlug.get(s)!.movement_pattern);
    expect(patterns).toContain('vertical_pull');
  });

  it('every default slug exists in the catalog', () => {
    for (const list of [SEX_LIKED_DEFAULT_SLUGS.male, SEX_LIKED_DEFAULT_SLUGS.female]) {
      for (const slug of list) expect(bySlug.has(slug), slug).toBe(true);
    }
  });

  it('other / prefer_not_to_say / null all get the neutral set (never a coin flip)', () => {
    const neutral = neutralLikedDefaults(catalogFixture);
    expect(preferencePrefill('other', catalogFixture).liked).toEqual(neutral);
    expect(preferencePrefill('prefer_not_to_say', catalogFixture).liked).toEqual(neutral);
    expect(preferencePrefill(null, catalogFixture).liked).toEqual(neutral);
    expect(preferencePrefill(undefined, catalogFixture).liked).toEqual(neutral);
  });

  it('neutral spans squat, hinge, push, pull and carry — coverage, not a body-part bias', () => {
    const neutral = neutralLikedDefaults(catalogFixture);
    expect(neutral).toHaveLength(NEUTRAL_PATTERN_GROUPS.length);
    for (const group of NEUTRAL_PATTERN_GROUPS) {
      const hit = neutral.some((slug) =>
        group.patterns.includes(bySlug.get(slug)!.movement_pattern),
      );
      expect(hit, `no ${group.key} in the neutral default`).toBe(true);
    }
    // and every one of them is a compound
    for (const slug of neutral) expect(bySlug.get(slug)!.mechanics).toBe('compound');
  });

  it('neutral picks the most popular option per group, easier lift breaking ties', () => {
    const neutral = neutralLikedDefaults(catalogFixture);
    // pull-up and lat-pulldown are both popularity 90; the beginner one wins
    expect(neutral).toContain('lat-pulldown');
    expect(neutral).not.toContain('pull-up');
  });

  it('a leaning set is topped up from neutral when the catalog is missing its slugs', () => {
    const thin = catalogFixture.filter((e) => e.slug !== 'bench-press');
    const liked = preferencePrefill('male', thin).liked;
    expect(liked).toHaveLength(PREFERENCE_LIST_SIZE);
    expect(liked).not.toContain('bench-press');
  });

  it('preferenceSourceForSex maps every SexType', () => {
    expect(preferenceSourceForSex('male')).toBe('male_leaning');
    expect(preferenceSourceForSex('female')).toBe('female_leaning');
    expect(preferenceSourceForSex('other')).toBe('neutral');
    expect(preferenceSourceForSex('prefer_not_to_say')).toBe('neutral');
    expect(preferenceSourceForSex(null)).toBe('neutral');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ ranking weights */

describe('rank weighting', () => {
  it('rank 1 outweighs rank 5 five to one', () => {
    const liked = ['a', 'b', 'c', 'd', 'e'];
    expect(rankWeight('a', liked)).toBe(RANK_WEIGHTS[0]);
    expect(rankWeight('e', liked)).toBe(RANK_WEIGHTS[4]);
    expect(rankWeight('zzz', liked)).toBe(0);
  });

  it('liked bonus scales by rank and is zero for anything unlisted', () => {
    const liked = ['a', 'b', 'c', 'd', 'e'];
    expect(likedSelectionBonus('a', liked, 4000)).toBe(4000);
    expect(likedSelectionBonus('e', liked, 4000)).toBe(800);
    expect(likedSelectionBonus('zzz', liked, 4000)).toBe(0);
  });

  it('disliked penalty scales by rank the same way', () => {
    const disliked = ['a', 'b'];
    expect(dislikedSelectionPenalty('a', disliked, 8000)).toBe(8000);
    expect(dislikedSelectionPenalty('b', disliked, 8000)).toBe(6400);
    expect(dislikedSelectionPenalty('zzz', disliked, 8000)).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════ LIKED → split scoring */

describe('LIKED → split scoring', () => {
  it('is zero with no liked list, and bounded by LIKED_SPLIT_MAX_BONUS otherwise', () => {
    const split = getSplit('reddit-ppl-6')!;
    expect(likedSplitBonus(split, [], catalogFixture).bonus).toBe(0);
    for (const s of SPLIT_LIBRARY) {
      const b = likedSplitBonus(s, preferencePrefill('female', catalogFixture).liked, catalogFixture)
        .bonus;
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(LIKED_SPLIT_MAX_BONUS);
    }
  });

  it('a glute-focused liker scores a glute program above a generic upper/lower one', () => {
    const liked = ['barbell-hip-thrust', 'romanian-deadlift', 'goblet-squat'];
    const glute = SPLIT_LIBRARY.find((s) => s.slug === 'strong-curves-4');
    const upperLower = SPLIT_LIBRARY.find((s) => s.slug === 'upper-lower-4');
    expect(glute, 'library has a glute program').toBeTruthy();
    expect(upperLower, 'library has an upper/lower program').toBeTruthy();
    const a = likedSplitBonus(glute!, liked, catalogFixture).bonus;
    const b = likedSplitBonus(upperLower!, liked, catalogFixture).bonus;
    expect(a).toBeGreaterThan(b);
  });

  it('names the liked exercises it matched, and gives a chip-length reason', () => {
    const score = likedSplitBonus(
      getSplit('reddit-ppl-6')!,
      ['bench-press', 'lat-pulldown'],
      catalogFixture,
    );
    expect(score.matched).toEqual(['bench-press', 'lat-pulldown']);
    expect(score.reason).toBe('Built around movements you like');
  });

  it('an unknown slug contributes nothing and does not throw', () => {
    const score = likedSplitBonus(getSplit('reddit-ppl-6')!, ['not-a-real-slug'], catalogFixture);
    expect(score.bonus).toBe(0);
    expect(score.matched).toEqual([]);
  });

  it('NEVER dominates days/week, experience or goal in recommendSplits', () => {
    // A 3-day beginner who loves advanced upper-body work still gets a 3-day beginner program.
    const base = {
      days_per_week: 3,
      experience_level: 'beginner' as const,
      goals: ['general_health' as const],
      training_location: 'commercial_gym' as const,
    };
    const withLiked = recommendSplits(
      {
        ...base,
        liked_exercise_slugs: ['bench-press', 'pull-up', 'dip', 'barbell-row', 'overhead-press'],
        catalog: catalogFixture,
      },
      1,
    )[0]!;
    expect(withLiked.split.days_options).toContain(3);
    expect(withLiked.split.levels).toContain('beginner');
  });

  it('the liked bonus can never exceed the goal or level weights it must not outrank', () => {
    // 12 < 15 (primary goal) < 18 (level match) < 40 (days/week supported)
    expect(LIKED_SPLIT_MAX_BONUS).toBeLessThan(15);
    expect(LIKED_SPLIT_MAX_BONUS).toBeLessThan(18);
  });

  it('recommendSplits is unchanged when no liked list is supplied', () => {
    const input = { days_per_week: 4, experience_level: 'intermediate' as const };
    const a = recommendSplits(input).map((r) => `${r.split.slug}:${r.score}`);
    const b = recommendSplits({ ...input, liked_exercise_slugs: [], catalog: catalogFixture }).map(
      (r) => `${r.split.slug}:${r.score}`,
    );
    expect(a).toEqual(b);
  });
});

/* ═════════════════════════════════════════════ DISLIKED → easier same-pattern substitution */

describe('DISLIKED → easier, same-pattern substitution (NOT exclusion)', () => {
  it('barbell back squat → an EASIER squat, not "no quad work"', () => {
    const sub = substituteDisliked('barbell-back-squat', catalogFixture, substitutionEdgesFixture, subCtx());
    expect(sub.to).not.toBeNull();
    expect(sub.easier).toBe(true);
    expect(sub.outcome).toBe('easier_same_pattern');
    expect(bySlug.get(sub.to!)!.movement_pattern).toBe('squat');
  });

  it('PATTERN COVERAGE IS PRESERVED for every exercise in the catalog', () => {
    for (const ex of catalogFixture) {
      const sub = substituteDisliked(ex.slug, catalogFixture, substitutionEdgesFixture, subCtx({ experience: 'advanced' }));
      if (sub.to === null) {
        // The honest fallback: the original stays, and the caller is told why.
        expect(sub.outcome).toBe('kept_original');
        expect(sub.reason.length).toBeGreaterThan(20);
        continue;
      }
      const replacement = bySlug.get(sub.to)!;
      const samePattern = replacement.movement_pattern === ex.movement_pattern;
      const sameMuscle = replacement.primary_muscles.some((m) =>
        ex.primary_muscles.includes(m),
      );
      expect(
        samePattern || sameMuscle,
        `${ex.slug} → ${sub.to} preserved neither pattern nor muscle`,
      ).toBe(true);
    }
  });

  it('MUSCLE COVERAGE IS PRESERVED whenever the pattern changes', () => {
    for (const ex of catalogFixture) {
      const sub = substituteDisliked(ex.slug, catalogFixture, substitutionEdgesFixture, subCtx({ experience: 'advanced' }));
      if (sub.to === null) continue;
      const replacement = bySlug.get(sub.to)!;
      if (replacement.movement_pattern === ex.movement_pattern) continue;
      expect(
        replacement.primary_muscles.some((m) => ex.primary_muscles.includes(m)),
        `${ex.slug} → ${sub.to} changed pattern AND muscles`,
      ).toBe(true);
    }
  });

  it('never returns a harder movement than the one the user disliked', () => {
    const order = { beginner: 0, intermediate: 1, advanced: 2 } as const;
    for (const ex of catalogFixture) {
      const sub = substituteDisliked(ex.slug, catalogFixture, substitutionEdgesFixture, subCtx({ experience: 'advanced' }));
      if (sub.to === null) continue;
      expect(
        order[bySlug.get(sub.to)!.difficulty],
        `${ex.slug} → ${sub.to} is harder`,
      ).toBeLessThanOrEqual(order[ex.difficulty]);
    }
  });

  it('never swaps one disliked movement for another disliked movement', () => {
    const disliked = ['barbell-back-squat', 'goblet-squat', 'leg-press'];
    const subs = substituteAllDisliked(disliked, catalogFixture, substitutionEdgesFixture, subCtx());
    for (const s of subs) {
      if (s.to) expect(disliked).not.toContain(s.to);
    }
  });

  it('never returns an exercise the user actually EXCLUDED (that step still removes work)', () => {
    const ctx = subCtx({ excludedExercises: new Set(['goblet-squat', 'leg-press']) });
    const sub = substituteDisliked('barbell-back-squat', catalogFixture, substitutionEdgesFixture, ctx);
    expect(sub.to).not.toBe('goblet-squat');
    expect(sub.to).not.toBe('leg-press');
  });

  it('a disliked exercise is DOWN-RANKED, not deleted: it is still in the catalog', () => {
    const disliked = ['bench-press'];
    substituteAllDisliked(disliked, catalogFixture, substitutionEdgesFixture, subCtx());
    expect(selectablePreferenceCatalog(catalogFixture).some((e) => e.slug === 'bench-press')).toBe(
      true,
    );
  });

  it('an unknown slug degrades to kept_original rather than throwing', () => {
    const sub = substituteDisliked('not-a-real-slug', catalogFixture, substitutionEdgesFixture, subCtx());
    expect(sub.to).toBeNull();
    expect(sub.outcome).toBe('kept_original');
  });

  it('with nothing available at all the original stays and says so', () => {
    // A one-exercise catalog: there is literally nothing to swap to.
    const solo: CatalogExercise[] = [bySlug.get('bench-press')!];
    const sub = substituteDisliked('bench-press', solo, [], subCtx());
    expect(sub.to).toBeNull();
    expect(sub.outcome).toBe('kept_original');
    expect(sub.pattern).toBe('horizontal_push');
    expect(sub.primaryMuscles.length).toBeGreaterThan(0);
  });

  /**
   * REGRESSION — a stretch is not a substitute for a lift.
   *
   * The catalog carries mobility and stretching rows that declare real `primary_muscles`
   * (`standing-hamstring-stretch` → hamstrings, `childs-pose` → lats). They are all `beginner`
   * difficulty and need no equipment, so on a thin equipment profile they outranked every real
   * lift on the "easiest first" ladder: disliking a Romanian deadlift produced a hamstring
   * STRETCH, prescribed with sets, reps and an RPE target. The plan then reads as covered while
   * the muscle is not trained at all — strictly worse than keeping the disliked lift, because it
   * is invisible. `kept_original` is the correct honest outcome when nothing real is available.
   */
  it('never substitutes a lift with a stretch or mobility drill, even on a thin equipment profile', () => {
    const NON_STRENGTH = ['mobility', 'static_stretch', 'cardio', 'conditioning'] as string[];
    // A home lifter with dumbbells and a bench: the profile that produced the bug.
    const thin = subCtx({
      ownedEquipment: new Set(['dumbbell', 'bench']),
      trainingLocation: 'home_gym',
      experience: 'beginner',
    });
    const strength = catalogFixture.filter(
      (e) => !NON_STRENGTH.includes(e.movement_pattern) && e.is_active !== false,
    );
    for (const ex of strength) {
      const sub = substituteDisliked(ex.slug, catalogFixture, substitutionEdgesFixture, thin);
      if (!sub.to) continue; // kept_original is always an acceptable answer
      const pick = bySlug.get(sub.to)!;
      expect(
        NON_STRENGTH.includes(pick.movement_pattern),
        `${ex.slug} → ${sub.to} (${pick.movement_pattern}) is not resistance training`,
      ).toBe(false);
    }
  });

  it('still substitutes within a non-strength class — a bike may stand in for a treadmill', () => {
    const sub = substituteDisliked(
      'treadmill-run',
      catalogFixture,
      substitutionEdgesFixture,
      subCtx(),
    );
    if (sub.to) expect(bySlug.get(sub.to)!.movement_pattern).toBe('cardio');
  });
});

/* ═══════════════════════════════════════════════════════ sex-aware rest / reps (tier A) */

describe('sex-aware prescription', () => {
  const base = { rest_seconds: 90, rep_min: 8, rep_max: 12 };

  it('female gets modestly shorter rest and a slightly higher rep range', () => {
    const out = sexAdjustedPrescription({ sex: 'female', ...base });
    expect(out.rest_seconds).toBe(75); // 90 × 0.85 = 76.5 → nearest 5
    expect(out.rep_min).toBe(9);
    expect(out.rep_max).toBe(13);
    expect(out.adjusted).toBe(true);
  });

  it('the adjustment is labelled with its reason and its evidence tier', () => {
    const out = sexAdjustedPrescription({ sex: 'female', ...base });
    expect(out.tier).toBe('A');
    expect(out.label).toMatch(/recover more between sets/i);
    expect(out.label).toMatch(/can change/i); // says it is adjustable
  });

  it('male / other / prefer_not_to_say / null are untouched and unlabelled', () => {
    for (const sex of ['male', 'other', 'prefer_not_to_say', null, undefined] as const) {
      const out = sexAdjustedPrescription({ sex, ...base });
      expect(out.rest_seconds).toBe(base.rest_seconds);
      expect(out.rep_min).toBe(base.rep_min);
      expect(out.rep_max).toBe(base.rep_max);
      expect(out.adjusted).toBe(false);
      expect(out.label).toBe('');
      expect(out.tier).toBeNull();
    }
  });

  it('is MODEST — never more than the documented multiplier / shift', () => {
    for (const rest of [45, 60, 90, 120, 180]) {
      const out = sexAdjustedPrescription({ sex: 'female', rest_seconds: rest, rep_min: 5, rep_max: 6 });
      expect(out.rest_seconds).toBeGreaterThanOrEqual(
        Math.min(rest, Math.floor(rest * FEMALE_REST_MULTIPLIER) - 5),
      );
      expect(out.rest_seconds).toBeLessThanOrEqual(rest);
      expect(out.rep_max - out.rep_min).toBe(1); // the range MOVES, it does not widen
    }
  });

  it('never drops rest below the floor', () => {
    const out = sexAdjustedPrescription({ sex: 'female', rest_seconds: 20, rep_min: 8, rep_max: 12 });
    expect(out.rest_seconds).toBeGreaterThanOrEqual(MIN_REST_SECONDS);
  });

  it('touches ONLY rest and reps — it can never cap load or hide a compound', () => {
    const out = sexAdjustedPrescription({ sex: 'female', ...base });
    expect(Object.keys(out).sort()).toEqual(
      ['adjusted', 'label', 'rep_max', 'rep_min', 'rest_seconds', 'tier'].sort(),
    );
    // and the catalog a female athlete can train from is the whole catalog, compounds included
    const compounds = selectablePreferenceCatalog(catalogFixture).filter(
      (e) => e.mechanics === 'compound',
    );
    expect(compounds.length).toBeGreaterThan(0);
  });
});
