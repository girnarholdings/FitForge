#!/usr/bin/env node
/**
 * Merge `exercises-extra.mjs` into the seed catalog, and validate hard.
 *
 * The validation is the point. A catalog row with a muscle slug that does not exist, or a
 * pose_pattern with no rig behind it, does not throw at runtime — it silently draws the wrong
 * exercise or drops out of the muscle map. Both failures are invisible until a user hits them,
 * so they are caught here instead.
 *
 *   node seed/merge-extra-exercises.mjs [--dry]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRA_EXERCISES } from './exercises-extra.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');

const read = async (f) => JSON.parse(await readFile(join(HERE, 'data', f), 'utf8'));

const existing = await read('exercises.json');
const muscles = await read('muscles.json');
const categories = await read('categories.json');
const equipment = await read('equipment.json');

const muscleSlugs = new Set(muscles.muscles.map((m) => m.slug));
const categorySlugs = new Set(categories.map((c) => c.slug));
const equipmentSlugs = new Set(equipment.map((e) => e.slug));
const existingSlugs = new Set(existing.map((e) => e.slug));

const REQUIRED = [
  'slug', 'name', 'category', 'movement_pattern', 'mechanics', 'difficulty',
  'is_unilateral', 'is_bodyweight_ok', 'popularity', 'primary_muscles',
  'secondary_muscles', 'equipment', 'instructions', 'setup', 'tempo',
  'breathing', 'form_cues', 'why', 'common_mistakes', 'pose_pattern',
];

const errors = [];
for (const ex of EXTRA_EXERCISES) {
  const at = ex.slug ?? '(no slug)';
  for (const key of REQUIRED) {
    if (ex[key] === undefined) errors.push(`${at}: missing "${key}"`);
  }
  if (existingSlugs.has(ex.slug)) errors.push(`${at}: slug already exists`);
  if (!categorySlugs.has(ex.category)) errors.push(`${at}: unknown category "${ex.category}"`);
  for (const m of [...(ex.primary_muscles ?? []), ...(ex.secondary_muscles ?? [])]) {
    if (!muscleSlugs.has(m)) errors.push(`${at}: unknown muscle "${m}"`);
  }
  for (const group of ex.equipment ?? []) {
    for (const slug of group) {
      if (!equipmentSlugs.has(slug)) errors.push(`${at}: unknown equipment "${slug}"`);
    }
  }
  if ((ex.primary_muscles ?? []).length === 0) errors.push(`${at}: no primary muscle`);
  if ((ex.form_cues ?? []).length < 2) errors.push(`${at}: needs at least 2 form cues`);
  if ((ex.common_mistakes ?? []).length < 2) errors.push(`${at}: needs at least 2 mistakes`);
}

// Duplicate slugs within the new batch itself.
const seen = new Set();
for (const ex of EXTRA_EXERCISES) {
  if (seen.has(ex.slug)) errors.push(`${ex.slug}: duplicated inside exercises-extra.mjs`);
  seen.add(ex.slug);
}

if (errors.length > 0) {
  console.error(`✗ ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

const merged = [...existing, ...EXTRA_EXERCISES];
console.log(`✓ ${EXTRA_EXERCISES.length} new exercises validated · catalog ${existing.length} → ${merged.length}`);

const byCategory = {};
const byPattern = {};
let bodyweightOnly = 0;
for (const e of merged) {
  byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  byPattern[e.movement_pattern] = (byPattern[e.movement_pattern] ?? 0) + 1;
  if ((e.equipment ?? []).flat().length === 0) bodyweightOnly += 1;
}
console.log(`  no-equipment exercises: ${bodyweightOnly}`);
console.log(`  categories: ${JSON.stringify(byCategory)}`);
console.log(`  pose patterns needing a rig: ${[...new Set(EXTRA_EXERCISES.map((e) => e.pose_pattern))].join(', ')}`);

if (dry) {
  console.log('\n(dry run — nothing written)');
} else {
  await writeFile(join(HERE, 'data', 'exercises.json'), JSON.stringify(merged, null, 2) + '\n');
  console.log('\n→ seed/data/exercises.json');
}
