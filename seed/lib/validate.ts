/**
 * Seed data validator (WS-2).
 *
 * Pure, dependency-free validation of the curated seed JSON against the frozen
 * blueprint contract (§3.1 / §4.2 / §6). Mirrors the intent of the zod schemas
 * described in blueprint §6.7 but is self-contained so `seed` builds and tests in
 * isolation (no build-time dependency on packages/shared, which WS-3 owns).
 *
 * Checks:
 *   - per-file slug uniqueness
 *   - enum validity (matches 0001_extensions_enums.sql)
 *   - referential integrity of every slug FK (muscles→groups, exercises→category,
 *     exercise muscles/equipment, substitutions→exercises)
 *   - alt_group sanity (each group non-empty; no equipment repeats across an
 *     exercise's alt_groups — that would violate exercise_equipment's PK)
 *   - macro consistency for foods: |kcal − (4P + 4C + 9F)| ≤ max(15% kcal, 15)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------- enum vocabularies (match 0001_extensions_enums.sql + 0006_catalog_vocabulary.sql) ----------
//
// THESE FOUR LISTS ARE NOT THE CONTRACT ON THEIR OWN. A movement pattern or equipment category
// is only real once it exists in ALL FOUR of: the Postgres enum (supabase/migrations), the
// `MovementPattern`/`EquipmentCategory` unions (packages/shared/src/types/database.ts), the
// runtime arrays (packages/shared/src/types/enums.ts) and here. The 59→91 catalog expansion
// added data using vocabulary that existed in none of them, which put this validator — the only
// guard against genuinely bad seed data — permanently red and therefore ignored. If you add a
// value below, add it to the other three in the same commit.

export const EQUIPMENT_CATEGORY = [
  'free_weights', 'machines', 'cables', 'bodyweight_accessories', 'cardio', 'benches_racks',
  'other',
] as const;

export const MUSCLE_REGION = ['upper', 'lower', 'core'] as const;

export const MOVEMENT_PATTERN = [
  'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull',
  'vertical_pull', 'elbow_flexion', 'elbow_extension', 'shoulder_isolation', 'core_flexion',
  'core_stability', 'carry', 'hip_extension_iso', 'knee_flexion_iso', 'knee_extension_iso',
  'calf_raise', 'cardio',
  // Trained but not lifted — kept distinct from the lifting patterns so the prep builder can
  // find them and so volume accounting can exclude them from sets-per-muscle-per-week.
  'conditioning', 'mobility', 'static_stretch',
] as const;

export const MECHANICS_TYPE = ['compound', 'isolation'] as const;
export const DIFFICULTY_LEVEL = ['beginner', 'intermediate', 'advanced'] as const;
export const FOOD_CATEGORY = [
  'protein', 'grain', 'vegetable', 'fruit', 'dairy', 'fat_oil', 'legume', 'nut_seed',
  'beverage', 'snack', 'condiment',
] as const;

// Allergen tags are a fixed set (blueprint §3.1 / screen 10). Diet tags are an
// "open vocabulary" but we validate against the canonical set to catch typos.
export const ALLERGEN_TAGS = [
  'peanut', 'tree_nut', 'dairy', 'gluten', 'egg', 'soy', 'shellfish', 'fish', 'sesame',
] as const;
export const DIET_TAGS = [
  'vegan', 'vegetarian', 'pescatarian_ok', 'keto_friendly', 'gluten_free', 'dairy_free',
] as const;

export const MACRO_ABS_FLOOR_KCAL = 15; // rounding allowance for low-calorie foods
export const MACRO_REL_TOLERANCE = 0.15; // 15% per blueprint §6.7

// ---------- data shapes ----------

export interface Equipment {
  slug: string; name: string; category: string;
  common_in_home: boolean; common_in_gym: boolean;
}
export interface MuscleGroup { slug: string; name: string; region: string; display_order: number; }
export interface Muscle { slug: string; name: string; latin_name: string; group: string; is_front: boolean; }
export interface Category { slug: string; name: string; display_order: number; }
export interface Exercise {
  slug: string; name: string; category: string;
  movement_pattern: string; mechanics: string; difficulty: string;
  is_unilateral: boolean; is_bodyweight_ok: boolean; popularity: number;
  primary_muscles: string[]; secondary_muscles: string[];
  equipment: string[][]; instructions: string;
}
export interface Substitution { from: string; to: string; similarity: number; reason?: string; }
export interface Food {
  slug: string; name: string; brand: string | null; category: string;
  kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  fiber_g: number; sugar_g: number; sodium_mg: number;
  serving_name: string; serving_grams: number;
  diet_tags: string[]; allergen_tags: string[];
}

export interface SeedData {
  equipment: Equipment[];
  muscles: { groups: MuscleGroup[]; muscles: Muscle[] };
  categories: Category[];
  exercises: Exercise[];
  substitutions: Substitution[];
  foods: Food[];
}

// ---------- loading ----------

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(dir, file), 'utf8')) as T;
}

export function loadSeed(dataDir: string): SeedData {
  return {
    equipment: readJson(dataDir, 'equipment.json'),
    muscles: readJson(dataDir, 'muscles.json'),
    categories: readJson(dataDir, 'categories.json'),
    exercises: readJson(dataDir, 'exercises.json'),
    substitutions: readJson(dataDir, 'substitutions.json'),
    foods: readJson(dataDir, 'foods.json'),
  };
}

// ---------- macro consistency ----------

/** Atwater estimate of energy from macros (per 100 g). */
export function atwaterKcal(f: Pick<Food, 'protein_g' | 'carbs_g' | 'fat_g'>): number {
  return 4 * f.protein_g + 4 * f.carbs_g + 9 * f.fat_g;
}

/** Absolute delta between stated kcal and the Atwater estimate. */
export function macroDelta(f: Pick<Food, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>): number {
  return Math.abs(f.kcal - atwaterKcal(f));
}

/** Allowed deviation: the larger of 15% of stated kcal and an absolute floor. */
export function macroTolerance(kcal: number): number {
  return Math.max(MACRO_REL_TOLERANCE * kcal, MACRO_ABS_FLOOR_KCAL);
}

export function isMacroConsistent(f: Pick<Food, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>): boolean {
  return macroDelta(f) <= macroTolerance(f.kcal);
}

// ---------- validation ----------

export interface ValidationResult { errors: string[]; warnings: string[]; }

function dupes(slugs: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const s of slugs) {
    if (seen.has(s)) dup.add(s);
    seen.add(s);
  }
  return [...dup];
}

export function validateSeed(data: SeedData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  const eqCat = new Set<string>(EQUIPMENT_CATEGORY);
  const region = new Set<string>(MUSCLE_REGION);
  const pattern = new Set<string>(MOVEMENT_PATTERN);
  const mech = new Set<string>(MECHANICS_TYPE);
  const diff = new Set<string>(DIFFICULTY_LEVEL);
  const foodCat = new Set<string>(FOOD_CATEGORY);
  const allergenVocab = new Set<string>(ALLERGEN_TAGS);
  const dietVocab = new Set<string>(DIET_TAGS);

  // --- equipment ---
  const equipmentSlugs = data.equipment.map((e) => e.slug);
  for (const s of dupes(equipmentSlugs)) err(`equipment: duplicate slug "${s}"`);
  const equipmentSet = new Set(equipmentSlugs);
  for (const e of data.equipment) {
    if (!e.slug) err('equipment: row missing slug');
    if (!e.name) err(`equipment "${e.slug}": missing name`);
    if (!eqCat.has(e.category)) err(`equipment "${e.slug}": invalid category "${e.category}"`);
    if (typeof e.common_in_home !== 'boolean') err(`equipment "${e.slug}": common_in_home must be boolean`);
    if (typeof e.common_in_gym !== 'boolean') err(`equipment "${e.slug}": common_in_gym must be boolean`);
  }

  // --- muscle groups & muscles ---
  const groupSlugs = data.muscles.groups.map((g) => g.slug);
  for (const s of dupes(groupSlugs)) err(`muscle_groups: duplicate slug "${s}"`);
  const groupSet = new Set(groupSlugs);
  for (const g of data.muscles.groups) {
    if (!region.has(g.region)) err(`muscle_group "${g.slug}": invalid region "${g.region}"`);
  }
  const muscleSlugs = data.muscles.muscles.map((m) => m.slug);
  for (const s of dupes(muscleSlugs)) err(`muscles: duplicate slug "${s}"`);
  const muscleSet = new Set(muscleSlugs);
  for (const m of data.muscles.muscles) {
    if (!groupSet.has(m.group)) err(`muscle "${m.slug}": unknown group "${m.group}"`);
    if (typeof m.is_front !== 'boolean') err(`muscle "${m.slug}": is_front must be boolean`);
  }

  // --- categories ---
  const categorySlugs = data.categories.map((c) => c.slug);
  for (const s of dupes(categorySlugs)) err(`categories: duplicate slug "${s}"`);
  const categorySet = new Set(categorySlugs);

  // --- exercises ---
  const exerciseSlugs = data.exercises.map((x) => x.slug);
  for (const s of dupes(exerciseSlugs)) err(`exercises: duplicate slug "${s}"`);
  const exerciseSet = new Set(exerciseSlugs);
  for (const x of data.exercises) {
    if (!x.slug) { err('exercises: row missing slug'); continue; }
    if (!x.name) err(`exercise "${x.slug}": missing name`);
    if (!categorySet.has(x.category)) err(`exercise "${x.slug}": unknown category "${x.category}"`);
    if (!pattern.has(x.movement_pattern)) err(`exercise "${x.slug}": invalid movement_pattern "${x.movement_pattern}"`);
    if (!mech.has(x.mechanics)) err(`exercise "${x.slug}": invalid mechanics "${x.mechanics}"`);
    if (!diff.has(x.difficulty)) err(`exercise "${x.slug}": invalid difficulty "${x.difficulty}"`);
    if (!Number.isInteger(x.popularity) || x.popularity < 0 || x.popularity > 100)
      err(`exercise "${x.slug}": popularity ${x.popularity} out of range 0..100`);
    if (!x.instructions || x.instructions.trim().length < 20)
      err(`exercise "${x.slug}": instructions too short`);
    if (!Array.isArray(x.primary_muscles) || x.primary_muscles.length === 0)
      err(`exercise "${x.slug}": must have at least one primary muscle`);
    for (const mm of x.primary_muscles ?? [])
      if (!muscleSet.has(mm)) err(`exercise "${x.slug}": unknown primary muscle "${mm}"`);
    for (const mm of x.secondary_muscles ?? [])
      if (!muscleSet.has(mm)) err(`exercise "${x.slug}": unknown secondary muscle "${mm}"`);
    const overlap = (x.primary_muscles ?? []).filter((mm) => (x.secondary_muscles ?? []).includes(mm));
    for (const mm of overlap) err(`exercise "${x.slug}": muscle "${mm}" listed as both primary and secondary`);

    // equipment alt-group sanity
    if (!Array.isArray(x.equipment)) {
      err(`exercise "${x.slug}": equipment must be an array of alt-groups`);
    } else {
      const seenEquip = new Set<string>();
      x.equipment.forEach((grp, gi) => {
        if (!Array.isArray(grp) || grp.length === 0)
          err(`exercise "${x.slug}": alt-group ${gi} is empty`);
        for (const eq of grp) {
          if (!equipmentSet.has(eq)) err(`exercise "${x.slug}": unknown equipment "${eq}"`);
          if (seenEquip.has(eq))
            err(`exercise "${x.slug}": equipment "${eq}" appears in more than one alt-group (violates exercise_equipment PK)`);
          seenEquip.add(eq);
        }
      });
      if (x.equipment.length === 0 && !x.is_bodyweight_ok)
        err(`exercise "${x.slug}": no equipment and not is_bodyweight_ok — impossible to perform`);
    }
  }

  // --- substitutions ---
  const subSeen = new Set<string>();
  for (const s of data.substitutions) {
    if (!exerciseSet.has(s.from)) err(`substitution: unknown "from" exercise "${s.from}"`);
    if (!exerciseSet.has(s.to)) err(`substitution: unknown "to" exercise "${s.to}"`);
    if (s.from === s.to) err(`substitution: self-reference "${s.from}"`);
    if (!Number.isInteger(s.similarity) || s.similarity < 0 || s.similarity > 100)
      err(`substitution ${s.from}→${s.to}: similarity ${s.similarity} out of range 0..100`);
    const key = `${s.from}->${s.to}`;
    if (subSeen.has(key)) err(`substitution: duplicate edge ${key}`);
    subSeen.add(key);
  }

  // --- foods ---
  const foodSlugs = data.foods.map((f) => f.slug);
  for (const s of dupes(foodSlugs)) err(`foods: duplicate slug "${s}"`);
  for (const f of data.foods) {
    if (!f.slug) { err('foods: row missing slug'); continue; }
    if (!f.name) err(`food "${f.slug}": missing name`);
    if (!foodCat.has(f.category)) err(`food "${f.slug}": invalid category "${f.category}"`);
    for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'serving_grams'] as const) {
      const v = f[k];
      if (typeof v !== 'number' || Number.isNaN(v) || v < 0)
        err(`food "${f.slug}": ${k} must be a non-negative number (got ${v})`);
    }
    if (!f.serving_name) err(`food "${f.slug}": missing serving_name`);
    if (f.serving_grams <= 0) err(`food "${f.slug}": serving_grams must be > 0`);
    for (const t of f.diet_tags ?? [])
      if (!dietVocab.has(t)) err(`food "${f.slug}": unknown diet_tag "${t}"`);
    for (const t of f.allergen_tags ?? [])
      if (!allergenVocab.has(t)) err(`food "${f.slug}": unknown allergen_tag "${t}"`);
    // vegan ⇒ vegetarian + pescatarian_ok (blueprint §6.6 expansion rule)
    if ((f.diet_tags ?? []).includes('vegan')) {
      if (!f.diet_tags.includes('vegetarian')) err(`food "${f.slug}": vegan must also tag vegetarian`);
      if (!f.diet_tags.includes('pescatarian_ok')) err(`food "${f.slug}": vegan must also tag pescatarian_ok`);
    }
    // macro consistency
    if (!isMacroConsistent(f)) {
      err(
        `food "${f.slug}": macro inconsistency — kcal ${f.kcal} vs Atwater ${atwaterKcal(f).toFixed(1)} ` +
        `(delta ${macroDelta(f).toFixed(1)} > tolerance ${macroTolerance(f.kcal).toFixed(1)})`,
      );
    }
  }

  return { errors, warnings };
}
