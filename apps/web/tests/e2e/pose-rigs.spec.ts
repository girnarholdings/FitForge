import { readFileSync } from 'node:fs';
import { POSE_RIGS, PATTERN_DEFAULT_RIG } from '@/components/illustrations/poses/rigs';

import { test, expect } from '@playwright/test';

/**
 * Pose-rig structural guards — data assertions, no browser.
 *
 * SCOPE, stated honestly. These catch the failures that are *silent*: an exercise whose rig id
 * does not exist (it falls through to a movement-pattern default and confidently draws a
 * different exercise), or a rig that renders two identical frames under START/FINISH captions.
 * Both are invisible unless you happen to open that one exercise page.
 *
 * They do NOT check whether a drawing depicts the right movement — that is what the render
 * audit in docs/POSE-AUDIT.md is for, and it needs human eyes.
 *
 * Three further invariants were written, run against the real library, and DELETED as unsound;
 * they are recorded here so nobody re-derives them and trusts the result:
 *
 *   · "bone lengths are constant across frames" — false. These are 2D projections, so a limb
 *     rotating out of the picture plane legitimately foreshortens. The bench-press upper arm is
 *     6.4px at the bottom and 13.2px at lock-out and both are correct. Any threshold loose
 *     enough to allow that is too loose to catch a real deformation.
 *
 *   · "no joint is drawn below the floor line" — false. Toes are drawn ~2px past the ankle line
 *     as a foot cue in front views, and a hanging pull-up figure has no floor contact at all.
 *     The floor is per-rig (`Rig.ground`), not a global constant.
 *
 *   · "a two-anchor implement keeps a fixed width" — false for the majority of rigs. `imp`/`imp2`
 *     means one implement PER HAND, so a fly, a lateral raise and a face pull all move the hands
 *     apart on purpose. It holds only for a rigid bar, which the rig data does not distinguish.
 */

const rigs = () => Object.entries(POSE_RIGS);

test.describe('pose rig structure', () => {
  /**
   * Every rig actually animates, and every frame says what it is. A rig whose frames draw the
   * identical pose is a still image wearing a two-frame costume — the caption promises a
   * START → FINISH the art never delivers.
   */
  test('every rig has at least two captioned frames that differ', () => {
    const offenders: string[] = [];

    for (const [id, rig] of rigs()) {
      if (rig.frames.length < 2) {
        offenders.push(`${id}: only ${rig.frames.length} frame(s)`);
        continue;
      }
      for (const frame of rig.frames) {
        if (frame.caption.trim() === '') offenders.push(`${id}: a frame has no caption`);
      }
      const shapes = new Set(rig.frames.map((f) => JSON.stringify(f.pose)));
      if (shapes.size < 2) offenders.push(`${id}: every frame draws the identical pose`);
    }

    expect(offenders, `rigs that do not animate:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * Every exercise in the seed lands on a rig that exists. A typo'd `pose_pattern` does not
   * throw — it falls through to the movement-pattern default, so a hack squat quietly renders
   * as a barbell back squat and nothing anywhere reports a problem.
   *
   * The seed is read from disk rather than imported so this file needs nothing but the art:
   * `rigs.tsx` no longer pulls the catalog JSON (that moved to `catalog.ts`).
   */
  test('every exercise in the seed lands on a rig that exists', () => {
    const seed = JSON.parse(readFileSync('../../seed/data/exercises.json', 'utf8')) as {
      slug: string;
      movement_pattern: string;
      pose_pattern?: string;
    }[];

    expect(seed.length, 'seed looks empty — wrong path?').toBeGreaterThan(50);

    const unmapped = seed
      .map((e) => ({
        slug: e.slug,
        rigId: e.pose_pattern ?? PATTERN_DEFAULT_RIG[e.movement_pattern] ?? 'plank',
      }))
      .filter(({ rigId }) => !POSE_RIGS[rigId])
      .map(({ slug, rigId }) => `${slug} → unknown rig "${rigId}"`);

    expect(unmapped, `exercises point at rigs that do not exist:\n${unmapped.join('\n')}`).toEqual(
      [],
    );
  });
});
