#!/usr/bin/env tsx
/**
 * FitForge seed pipeline (WS-2), per blueprint §6.7.
 *
 *   npm run seed:generate   -> validate, then write supabase/seed/seed.sql + the shared fixtures
 *   npm run seed:check       -> validate only (CI gate; no file writes)
 *
 * Reads seed/data/*.json, validates referential integrity + alt_group + macro
 * sanity, and emits an idempotent upsert seed.sql resolving slug FKs via lookups
 * in dependency order.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSeed, validateSeed, type SeedData } from './lib/validate.ts';
import { emitSeedSql } from './lib/emit.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, 'data');
const OUT_FILE = join(HERE, '..', 'supabase', 'seed', 'seed.sql');

/**
 * The SHIPPING app reads its substitution graph from this fixture, not from seed/data — Local
 * Mode has no database, so packages/shared/src/fixtures is the runtime source of truth for
 * apps/web/components/features/_mock/data.ts. The two drifted (73 curated edges shipping against
 * 132 in the seed) because the projection was hand-maintained and the KEY NAMES differ, so no
 * diff ever looked obviously stale. Deriving it here makes the seed the single author and lets
 * `seed:check` fail loudly the moment they disagree again.
 */
const EDGES_FIXTURE = join(
  HERE, '..', 'packages', 'shared', 'src', 'fixtures', 'substitution-edges.json',
);

/** seed {from,to,similarity} → fixture {exercise,substitute,similarity}. */
function projectEdges(data: SeedData): string {
  const rows = data.substitutions.map((s) => ({
    exercise: s.from,
    substitute: s.to,
    similarity: s.similarity,
  }));
  return `${JSON.stringify(rows, null, 2)}\n`;
}

function main(): void {
  const checkOnly = process.argv.slice(2).includes('check');

  const data = loadSeed(DATA_DIR);
  const { errors, warnings } = validateSeed(data);

  for (const w of warnings) console.warn(`  warning: ${w}`);
  if (errors.length > 0) {
    console.error(`\nSeed validation FAILED with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const counts = {
    equipment: data.equipment.length,
    muscle_groups: data.muscles.groups.length,
    muscles: data.muscles.muscles.length,
    categories: data.categories.length,
    exercises: data.exercises.length,
    substitutions: data.substitutions.length,
    foods: data.foods.length,
  };
  console.log('Seed validation passed:', JSON.stringify(counts));

  const edges = projectEdges(data);

  if (checkOnly) {
    let onDisk = '';
    try {
      onDisk = readFileSync(EDGES_FIXTURE, 'utf8');
    } catch {
      onDisk = '';
    }
    if (onDisk !== edges) {
      const have = onDisk ? (JSON.parse(onDisk) as unknown[]).length : 0;
      console.error(
        `\nFIXTURE DRIFT: packages/shared/src/fixtures/substitution-edges.json has ${have} edge(s) ` +
        `but seed/data/substitutions.json has ${data.substitutions.length}.\n` +
        '  The app reads the FIXTURE, so curated pairings that live only in the seed never reach\n' +
        '  a user. Run `npm run seed:generate -w @fitforge/seed`, then rebuild @fitforge/shared.',
      );
      process.exit(1);
    }
    console.log(`Substitution fixture in sync (${data.substitutions.length} edges).`);
    console.log('check mode: no files written.');
    return;
  }

  const sql = emitSeedSql(data);
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, sql, 'utf8');
  console.log(`Wrote ${OUT_FILE} (${sql.length} bytes).`);

  writeFileSync(EDGES_FIXTURE, edges, 'utf8');
  console.log(`Wrote ${EDGES_FIXTURE} (${data.substitutions.length} edges).`);
}

main();
