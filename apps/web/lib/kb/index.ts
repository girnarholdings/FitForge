/**
 * The shipped knowledge base: 83 curated entries + the retrieval index, built ONCE at module
 * load (§1.1). 83 entries × ~60 stems is sub-millisecond work, so there is no build-time
 * artifact to keep in sync — the JSON is the single source of truth.
 *
 * Everything the UI needs is re-exported from here so components import one module.
 */
import faq from './faq.json';
import { buildKbIndex, filterEntries, searchIndex } from './search';
import { routeQuery } from './route';
import type { KbCategory, KbEntry, KbHit, KbRoute } from './types';

export const KB_ENTRIES = faq as KbEntry[];

export const KB_INDEX = buildKbIndex(KB_ENTRIES);

const BY_ID = new Map<string, KbEntry>(KB_ENTRIES.map((e) => [e.id, e]));

export function entryById(id: string): KbEntry | undefined {
  return BY_ID.get(id);
}

/** Display order + labels for the browsable wiki. Order is deliberately pedagogical. */
export const KB_CATEGORIES: { slug: KbCategory; label: string; blurb: string }[] = [
  {
    slug: 'getting-started',
    label: 'Getting started',
    blurb: 'Frequency, splits, session length, first steps.',
  },
  {
    slug: 'technique-safety',
    label: 'Technique & safety',
    blurb: 'Warm-ups, form, RPE, training to failure.',
  },
  {
    slug: 'equipment-substitutions',
    label: 'Equipment & swaps',
    blurb: 'Home training, dumbbells only, busy racks, travel.',
  },
  {
    slug: 'progression-plateaus',
    label: 'Progression & plateaus',
    blurb: 'Overload, when to add weight, deloads, stalls.',
  },
  { slug: 'nutrition', label: 'Nutrition', blurb: 'Calories, protein, macros, supplements.' },
  { slug: 'recovery', label: 'Recovery', blurb: 'Rest days, soreness, sleep, overtraining.' },
  { slug: 'cardio', label: 'Cardio', blurb: 'How much, when, zone 2, steps, HIIT vs LISS.' },
  {
    slug: 'body-composition',
    label: 'Body composition',
    blurb: 'Fat-loss rate, recomp, the scale, abs.',
  },
  {
    slug: 'demographics',
    label: 'For you specifically',
    blurb: 'Women, older adults, gym anxiety, pregnancy.',
  },
  { slug: 'app', label: 'Using FitForge', blurb: 'Local Mode, privacy, export, editing routines.' },
];

export function entriesByCategory(category: KbCategory): KbEntry[] {
  return KB_ENTRIES.filter((e) => e.category === category);
}

/** Rank the KB against a free-text question (§1.2). */
export function searchKb(query: string, limit = 8): KbHit[] {
  return searchIndex(KB_INDEX, query, limit);
}

/** Literal filter used by the wiki's browse search box. */
export function browseKb(query: string): KbEntry[] {
  return filterEntries(KB_ENTRIES, query);
}

/** Retrieve + apply the §1.3 thresholds in one call — what the Coach surface uses. */
export function askKb(query: string): KbRoute {
  return routeQuery(query, searchKb(query, 8));
}

export { routeQuery, firstPersonCues, CONF_ANSWER, CONF_DISAMBIGUATE, TOP_N } from './route';
export { buildKbIndex, searchIndex, filterEntries } from './search';
export type { KbEntry, KbHit, KbRoute, KbCategory } from './types';
