#!/usr/bin/env node
/**
 * Regenerates seed/data/splits.json from the typed SPLIT_LIBRARY in
 * packages/shared/src/rules/splits.ts, so the JSON mirror can never drift from the code the app
 * actually runs on.
 *
 *   npm run build -w @fitforge/shared && node seed/generate-splits.mjs
 *
 * The JSON is the data-exchange copy (a future backend seeds `splits` / `split_days` /
 * `split_day_slots` from it); the TS consts remain the source of truth.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, 'data', 'splits.json');

const { SPLIT_LIBRARY } = await import(
  join(HERE, '..', 'packages', 'shared', 'dist', 'rules', 'splits.js')
);

const payload = {
  $comment:
    'GENERATED — do not hand-edit. Source of truth: packages/shared/src/rules/splits.ts (SPLIT_LIBRARY). Regenerate with: node seed/generate-splits.mjs',
  splits: SPLIT_LIBRARY.map((s) => ({
    slug: s.slug,
    name: s.name,
    description: s.description,
    days_per_week: s.days_per_week,
    days_options: s.days_options,
    levels: s.levels,
    goals: s.goals,
    equipment_profile: s.equipment_profile,
    required_equipment: s.required_equipment,
    progression: s.progression,
    tags: s.tags,
    days: s.days.map((d, i) => ({
      day_index: i,
      key: d.key,
      label: d.label ?? null,
      focus: d.focus,
      slots: d.slots.map((sl) => ({
        pattern: sl.pattern,
        alt: sl.alt ?? [],
        mechanics: sl.mechanics ?? null,
        note: sl.note ?? null,
      })),
    })),
  })),
};

writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(
  `Wrote ${OUT_FILE}: ${payload.splits.length} splits, ` +
    `${payload.splits.reduce((n, s) => n + s.days.length, 0)} day templates.`,
);
