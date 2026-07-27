import type { EquipmentCategory, EquipmentGlyph, EquipmentSlug } from './types';
import {
  BarbellGlyph,
  EzCurlBarGlyph,
  DumbbellGlyph,
  KettlebellGlyph,
  WeightPlatesGlyph,
} from './free-weights';
import { FlatBenchGlyph, AdjustableBenchGlyph, SquatRackGlyph } from './benches';
import {
  SmithMachineGlyph,
  LegPressGlyph,
  HackSquatMachineGlyph,
  LegExtensionMachineGlyph,
  LegCurlMachineGlyph,
  ChestPressMachineGlyph,
  PecDeckGlyph,
  ShoulderPressMachineGlyph,
  HipThrustMachineGlyph,
  CalfRaiseMachineGlyph,
} from './machines';
import { CableMachineGlyph, LatPulldownGlyph, SeatedRowMachineGlyph } from './cables';
import {
  PullUpBarGlyph,
  DipStationGlyph,
  ResistanceBandsGlyph,
  SuspensionTrainerGlyph,
  AbWheelGlyph,
  MedicineBallGlyph,
  PlyoBoxGlyph,
} from './accessories';
import { TreadmillGlyph, StationaryBikeGlyph, RowingMachineGlyph } from './cardio';

/** slug → glyph (all 31 seed equipment items, §4.2). */
export const EQUIPMENT_REGISTRY: Record<EquipmentSlug, EquipmentGlyph> = {
  // free weights
  barbell: BarbellGlyph,
  'ez-curl-bar': EzCurlBarGlyph,
  dumbbell: DumbbellGlyph,
  kettlebell: KettlebellGlyph,
  'weight-plates': WeightPlatesGlyph,
  // benches & racks
  'flat-bench': FlatBenchGlyph,
  'adjustable-bench': AdjustableBenchGlyph,
  'squat-rack': SquatRackGlyph,
  // machines
  'smith-machine': SmithMachineGlyph,
  'leg-press': LegPressGlyph,
  'hack-squat-machine': HackSquatMachineGlyph,
  'leg-extension-machine': LegExtensionMachineGlyph,
  'leg-curl-machine': LegCurlMachineGlyph,
  'chest-press-machine': ChestPressMachineGlyph,
  'pec-deck': PecDeckGlyph,
  'shoulder-press-machine': ShoulderPressMachineGlyph,
  'hip-thrust-machine': HipThrustMachineGlyph,
  'calf-raise-machine': CalfRaiseMachineGlyph,
  // cables
  'cable-machine': CableMachineGlyph,
  'lat-pulldown': LatPulldownGlyph,
  'seated-row-machine': SeatedRowMachineGlyph,
  // bodyweight & accessories
  'pull-up-bar': PullUpBarGlyph,
  'dip-station': DipStationGlyph,
  'resistance-bands': ResistanceBandsGlyph,
  'suspension-trainer': SuspensionTrainerGlyph,
  'ab-wheel': AbWheelGlyph,
  'medicine-ball': MedicineBallGlyph,
  // cardio
  treadmill: TreadmillGlyph,
  'stationary-bike': StationaryBikeGlyph,
  'rowing-machine': RowingMachineGlyph,
  // other
  'plyo-box': PlyoBoxGlyph,
};

/** Most-generic representative glyph per category (fallback target, §4.2). */
const CATEGORY_GENERIC: Record<EquipmentCategory, EquipmentGlyph> = {
  free_weights: DumbbellGlyph,
  benches_racks: FlatBenchGlyph,
  machines: ChestPressMachineGlyph,
  cables: CableMachineGlyph,
  bodyweight_accessories: ResistanceBandsGlyph,
  cardio: TreadmillGlyph,
  other: PlyoBoxGlyph,
};

/** Keyword → category guess so unknown future slugs still render an on-theme glyph. */
const CATEGORY_KEYWORDS: ReadonlyArray<[RegExp, EquipmentCategory]> = [
  [/bench|rack/, 'benches_racks'],
  [/cable|pulldown|row|crossover|pulley/, 'cables'],
  [/machine|press|deck|sled|smith|leg-|calf|hip-thrust|extension|curl/, 'machines'],
  [/band|pull-up|dip|suspension|trx|ab-wheel|wheel|med|ball|bodyweight/, 'bodyweight_accessories'],
  [/plyo|box|jump/, 'other'],
  [/tread|bike|row(ing)?|erg|cardio|elliptical|stair/, 'cardio'],
  [/bar|bell|dumbbell|kettle|plate|weight/, 'free_weights'],
];

function guessCategory(slug: string): EquipmentCategory | null {
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(slug)) return cat;
  }
  return null;
}

/**
 * Resolve any slug (known or not) to a glyph: exact match → category-generic
 * fallback (guessed from the slug) → ultimate `dumbbell` fallback (§4.2), so
 * new seed additions never render blank.
 */
export function resolveEquipmentGlyph(slug: string): EquipmentGlyph {
  const exact = EQUIPMENT_REGISTRY[slug as EquipmentSlug];
  if (exact) return exact;
  const cat = guessCategory(slug);
  if (cat) return CATEGORY_GENERIC[cat];
  return DumbbellGlyph;
}
