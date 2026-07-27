'use client';

/**
 * DEMO MODE catalog helpers for onboarding.
 *
 * The exercise/food catalogs and substitution ranking already live in the (fixture-derived)
 * `_mock/data` module; this file adds the onboarding-only bits: a small equipment catalog (with
 * the home/gym preset flags the §7.2.1 rule needs) and a couple of convenience selectors.
 */
import type { EquipmentCategory } from '@fitforge/shared/types';
import {
  EXERCISES,
  mockSuggestSubstitutes,
  type SubstituteRow,
} from '@/components/features/_mock/data';
import type { NamedRef } from '@/components/onboarding/types';

export interface DemoEquipmentRow {
  slug: string;
  name: string;
  category: EquipmentCategory;
  common_in_home: boolean;
  common_in_gym: boolean;
}

/**
 * Equipment catalog covering every slug referenced by the fixture exercise catalog (§6.3).
 *
 * MUST STAY IN LOCKSTEP WITH seed/data/equipment.json. Anything missing here is not selectable
 * in onboarding, which means every exercise that requires it is permanently unreachable no
 * matter what gym the athlete trains in — the catalog silently shrinks for the user. Three rows
 * (smith-machine, hip-thrust-machine, plyo-box) were stranded exactly that way; the row count is
 * asserted in tests/ so the next drift fails loudly instead of quietly deleting exercises.
 */
export const DEMO_EQUIPMENT: DemoEquipmentRow[] = [
  { slug: 'barbell', name: 'Barbell', category: 'free_weights', common_in_home: true, common_in_gym: true },
  { slug: 'weight-plates', name: 'Weight Plates', category: 'free_weights', common_in_home: true, common_in_gym: true },
  { slug: 'dumbbell', name: 'Dumbbells', category: 'free_weights', common_in_home: true, common_in_gym: true },
  { slug: 'kettlebell', name: 'Kettlebell', category: 'free_weights', common_in_home: true, common_in_gym: true },
  { slug: 'ez-curl-bar', name: 'EZ-Curl Bar', category: 'free_weights', common_in_home: true, common_in_gym: true },
  { slug: 'squat-rack', name: 'Squat / Power Rack', category: 'benches_racks', common_in_home: false, common_in_gym: true },
  { slug: 'flat-bench', name: 'Flat Bench', category: 'benches_racks', common_in_home: true, common_in_gym: true },
  { slug: 'adjustable-bench', name: 'Adjustable Bench', category: 'benches_racks', common_in_home: true, common_in_gym: true },
  { slug: 'smith-machine', name: 'Smith Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'leg-press', name: 'Leg Press Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'hack-squat-machine', name: 'Hack Squat Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'leg-curl-machine', name: 'Leg Curl Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'leg-extension-machine', name: 'Leg Extension Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'calf-raise-machine', name: 'Calf Raise Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'chest-press-machine', name: 'Chest Press Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'pec-deck', name: 'Pec Deck', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'shoulder-press-machine', name: 'Shoulder Press Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'hip-thrust-machine', name: 'Hip Thrust / Glute Drive', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'lat-pulldown', name: 'Lat Pulldown Machine', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'seated-row-machine', name: 'Seated Cable Row', category: 'machines', common_in_home: false, common_in_gym: true },
  { slug: 'cable-machine', name: 'Cable Machine / Crossover', category: 'cables', common_in_home: false, common_in_gym: true },
  { slug: 'dip-station', name: 'Dip Station', category: 'bodyweight_accessories', common_in_home: true, common_in_gym: true },
  { slug: 'pull-up-bar', name: 'Pull-up Bar', category: 'bodyweight_accessories', common_in_home: true, common_in_gym: true },
  { slug: 'resistance-bands', name: 'Resistance Bands', category: 'bodyweight_accessories', common_in_home: true, common_in_gym: true },
  { slug: 'suspension-trainer', name: 'Suspension Trainer', category: 'bodyweight_accessories', common_in_home: true, common_in_gym: true },
  { slug: 'ab-wheel', name: 'Ab Wheel', category: 'bodyweight_accessories', common_in_home: true, common_in_gym: true },
  { slug: 'medicine-ball', name: 'Medicine Ball', category: 'bodyweight_accessories', common_in_home: true, common_in_gym: true },
  { slug: 'treadmill', name: 'Treadmill', category: 'cardio', common_in_home: false, common_in_gym: true },
  { slug: 'stationary-bike', name: 'Stationary Bike', category: 'cardio', common_in_home: false, common_in_gym: true },
  { slug: 'rowing-machine', name: 'Rowing Machine', category: 'cardio', common_in_home: false, common_in_gym: true },
  { slug: 'plyo-box', name: 'Plyo Box', category: 'other', common_in_home: false, common_in_gym: true },
];

/** Top popular exercises as suggestion chips for the "exercises you enjoy" step (§7.3). */
export function demoPopularExercises(limit = 8): NamedRef[] {
  return [...EXERCISES]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit)
    .map((e) => ({ id: e.id, slug: e.slug, name: e.name }));
}

/** Substitution suggestions for an excluded exercise (onboarding screen 8, §7.4). */
export function demoSubstitutes(exerciseId: string, limit = 3): SubstituteRow[] {
  return mockSuggestSubstitutes(exerciseId, limit);
}
