'use client';

/**
 * EXERCISE LIBRARY — the "inventory" surface (§6 P0-2 / P1-6 + WS-4 discoverability pass).
 *
 * User feedback this rewrite answers: "exercises are really hard to get to, like inventory view"
 * and "[I want] an aggregated view [of what exercises target] plus each exercise view".
 *
 * Two tabs:
 *   • Library      — instant search, body-map-as-navigation (MuscleWiki's core loop), recents,
 *                    chip filters for muscle / equipment / pattern / difficulty, a live result
 *                    count, clear-all, and a list grouped by body part or A–Z so 59 rows stay
 *                    navigable. Every row carries a MuscleMapThumb, difficulty and equipment.
 *   • Plan targets — the aggregated targeting view (`MuscleVolume`): weighted sets per muscle per
 *                    week for the active routine (or the last 7 days of logged sets), rendered as
 *                    a silhouette heatmap + ranked bars. Tapping a muscle drills back into the
 *                    library filtered to it.
 *
 * Recents are kept in this component's own versioned localStorage slice
 * (`fitforge.recentExercises.v1`) — additive, SSR-safe, and wiped by the Local Mode data reset
 * (`localStorage.clear()`), so it never outlives the data it augments.
 */
import * as React from 'react';
import Link from 'next/link';
import { Card, Chip, Sheet, Button } from '@/components/ui';
import {
  FilterIcon,
  SearchIcon,
  BodyIcon,
  XIcon,
  ClockIcon,
  BookIcon,
  ChevronRightIcon,
  type IconProps,
} from '@/components/ui/icons';
import { MuscleMap, MuscleMapThumb, MUSCLE_NAMES } from '@/components/illustrations';
import type { MuscleSlug } from '@/components/illustrations';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { MuscleVolume, type VolumeSource } from '@/components/features/shared/MuscleVolume';
import { useActiveRoutine } from '@/lib/demo/useDemo';
import { useWorkoutSessions } from '@/components/features/shared/workoutLog';
import {
  mockAllExercises,
  EXERCISE_CATEGORIES,
  EQUIPMENT_FACETS,
  MUSCLE_FACETS,
  type ExerciseFull,
  type MovementPattern,
} from '@/components/features/_mock/data';

/* ------------------------------------------------------------------------------ vocabulary */

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const DIFFICULTY_STYLE: Record<string, string> = {
  beginner: 'bg-success/10 text-success',
  intermediate: 'bg-energy-muted text-energy',
  advanced: 'bg-danger/10 text-danger',
};

const DIFFICULTY_FACETS = [
  { slug: 'beginner', name: 'Beginner' },
  { slug: 'intermediate', name: 'Intermediate' },
  { slug: 'advanced', name: 'Advanced' },
];

const PATTERN_LABEL: Record<MovementPattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  horizontal_push: 'Horizontal push',
  vertical_push: 'Vertical push',
  horizontal_pull: 'Horizontal pull',
  vertical_pull: 'Vertical pull',
  elbow_flexion: 'Curl',
  elbow_extension: 'Triceps extension',
  shoulder_isolation: 'Delt raise',
  core_flexion: 'Trunk flexion',
  core_stability: 'Anti-movement core',
  carry: 'Carry',
  hip_extension_iso: 'Hip extension',
  knee_flexion_iso: 'Knee flexion',
  knee_extension_iso: 'Knee extension',
  calf_raise: 'Calf raise',
  cardio: 'Cardio',
  conditioning: 'Conditioning',
  mobility: 'Mobility drill',
  static_stretch: 'Static stretch',
};

function patternName(p: string): string {
  return PATTERN_LABEL[p as MovementPattern] ?? p.replace(/_/g, ' ');
}

/* --------------------------------------------------------------------------------- recents */

const RECENTS_KEY = 'fitforge.recentExercises.v1';
const RECENTS_MAX = 8;

function readRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed.filter((s) => typeof s === 'string') as string[]) : [];
  } catch {
    return [];
  }
}

function writeRecents(slugs: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(slugs.slice(0, RECENTS_MAX)));
  } catch {
    /* quota / private mode — recents are a nicety, never a hard failure */
  }
}

/* ------------------------------------------------------------------------------- filtering */

function matchesEquipment(ex: ExerciseFull, slug: string): boolean {
  if (slug === 'bodyweight') return ex.is_bodyweight_ok;
  return ex.equipment.some((g) => g.slugs.includes(slug));
}

function matchesQuery(ex: ExerciseFull, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (ex.name.toLowerCase().includes(needle)) return true;
  if (ex.aliases.some((a) => a.toLowerCase().includes(needle))) return true;
  if (ex.category_name.toLowerCase().includes(needle)) return true;
  return patternName(ex.movement_pattern).toLowerCase().includes(needle);
}

function equipmentSummary(ex: ExerciseFull): string {
  const names = ex.equipment.flatMap((g) => g.names);
  if (names.length === 0) return ex.is_bodyweight_ok ? 'Bodyweight' : 'No equipment';
  return names.slice(0, 2).join(' / ');
}

/**
 * The slug behind that summary line, so the row can DRAW the equipment instead of only naming it.
 * "Which equipment does this need" is the most decision-relevant fact when scanning the catalog,
 * and it was prose. Null for bodyweight work, which correctly draws nothing rather than picking an
 * arbitrary object.
 */
function equipmentGlyphSlug(ex: ExerciseFull): string | null {
  return ex.equipment[0]?.slugs[0] ?? null;
}

type Tab = 'library' | 'targets';
type Grouping = 'body' | 'az';

/* ============================================================================== the surface */

export function ExerciseCatalog() {
  const all = React.useMemo(() => mockAllExercises(), []);

  const [tab, setTab] = React.useState<Tab>('library');
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState<string | null>(null);
  const [equipment, setEquipment] = React.useState<string | null>(null);
  /**
   * Muscle filter is MULTI-select: pick chest + triceps and you get everything that trains
   * either one (OR, not AND — AND would return almost nothing on a 59-row catalog).
   */
  const [muscles, setMuscles] = React.useState<MuscleSlug[]>([]);
  const [pattern, setPattern] = React.useState<string | null>(null);
  const [difficulty, setDifficulty] = React.useState<string | null>(null);
  const [grouping, setGrouping] = React.useState<Grouping>('body');
  const [mapOpen, setMapOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [recents, setRecents] = React.useState<string[]>([]);

  // Hydrate recents after mount (server snapshot is empty → no hydration mismatch).
  React.useEffect(() => setRecents(readRecents()), []);

  const rememberExercise = React.useCallback((slug: string) => {
    setRecents((prev) => {
      const next = [slug, ...prev.filter((s) => s !== slug)].slice(0, RECENTS_MAX);
      writeRecents(next);
      return next;
    });
  }, []);

  const patternFacets = React.useMemo(() => {
    const seen = new Set<string>();
    for (const ex of all) seen.add(ex.movement_pattern);
    return [...seen]
      .map((slug) => ({ slug, name: patternName(slug) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);

  const filtered = React.useMemo(
    () =>
      all.filter((ex) => {
        if (!matchesQuery(ex, query.trim())) return false;
        if (category && ex.category_slug !== category) return false;
        if (equipment && !matchesEquipment(ex, equipment)) return false;
        if (pattern && ex.movement_pattern !== pattern) return false;
        if (difficulty && ex.difficulty !== difficulty) return false;
        if (
          muscles.length > 0 &&
          !muscles.some(
            (m) => ex.primary_muscles.includes(m) || ex.secondary_muscles.includes(m),
          )
        )
          return false;
        return true;
      }),
    [all, query, category, equipment, pattern, difficulty, muscles],
  );

  const sorted = React.useMemo(
    () => [...filtered].sort((a, b) => b.popularity - a.popularity),
    [filtered],
  );

  const sheetFilterCount =
    (equipment ? 1 : 0) + muscles.length + (pattern ? 1 : 0) + (difficulty ? 1 : 0);
  const anyFilter = sheetFilterCount > 0 || category !== null || query.trim() !== '';

  const clearAll = () => {
    setQuery('');
    setCategory(null);
    setEquipment(null);
    setMuscles([]);
    setPattern(null);
    setDifficulty(null);
  };

  /** Ranked, deduped recents that still exist in the catalog. */
  const recentExercises = React.useMemo(
    () =>
      recents
        .map((slug) => all.find((ex) => ex.slug === slug))
        .filter((ex): ex is ExerciseFull => Boolean(ex))
        .slice(0, 6),
    [recents, all],
  );

  /** Grouped rendering so a 59-row library reads as an inventory, not a scroll wall. */
  const groups = React.useMemo(() => {
    if (grouping === 'az') {
      const byLetter = new Map<string, ExerciseFull[]>();
      for (const ex of [...sorted].sort((a, b) => a.name.localeCompare(b.name))) {
        const letter = ex.name[0]?.toUpperCase() ?? '#';
        const key = /[A-Z]/.test(letter) ? letter : '#';
        byLetter.set(key, [...(byLetter.get(key) ?? []), ex]);
      }
      return [...byLetter.entries()].map(([key, items]) => ({ key, label: key, items }));
    }
    const order = EXERCISE_CATEGORIES.map((c) => c.slug);
    const byCat = new Map<string, ExerciseFull[]>();
    for (const ex of sorted) byCat.set(ex.category_slug, [...(byCat.get(ex.category_slug) ?? []), ex]);
    return [...byCat.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([slug, items]) => ({
        key: slug,
        label: items[0]?.category_name ?? slug,
        items,
      }));
  }, [sorted, grouping]);

  /** Toggle one muscle in/out of the selection. Used by the map sheet — it deliberately does
   *  NOT close the sheet, so several muscles can be tapped in one visit. */
  const toggleMuscle = React.useCallback((slug: MuscleSlug) => {
    setMuscles((prev) => (prev.includes(slug) ? prev.filter((m) => m !== slug) : [...prev, slug]));
  }, []);

  /** Drill-in from the Plan targets view: replaces the selection with just that muscle. */
  const focusMuscle = (slug: MuscleSlug) => {
    setTab('library');
    setMuscles([slug]);
    setCategory(null);
    setQuery('');
    setMapOpen(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  };

  /** Card subtitle. One muscle reads as a sentence; several read as a count plus the list,
   *  which the card truncates with an ellipsis rather than wrapping. */
  const muscleSummary =
    muscles.length === 0
      ? null
      : muscles.length === 1
        ? `Showing ${MUSCLE_NAMES[muscles[0]!] ?? muscles[0]} exercises`
        : `${muscles.length} muscles · ${muscles.map((m) => MUSCLE_NAMES[m] ?? m).join(', ')}`;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-display font-bold">Exercises</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your full movement library — search it, filter it by body part, or see what your plan
          actually trains.
        </p>
      </header>

      {/* Tabs: library vs the aggregated targeting view */}
      <div
        role="tablist"
        aria-label="Exercises views"
        className="grid grid-cols-2 gap-1 rounded-field bg-surface-2 p-1"
      >
        <TabButton
          id="library"
          active={tab === 'library'}
          onClick={() => setTab('library')}
          Icon={BookIcon}
          testId="exercises-tab-library"
        >
          Library
        </TabButton>
        <TabButton
          id="targets"
          active={tab === 'targets'}
          onClick={() => setTab('targets')}
          Icon={BodyIcon}
          testId="exercises-tab-targets"
        >
          Plan targets
        </TabButton>
      </div>

      {tab === 'targets' ? (
        <PlanTargets onMuscleSelect={focusMuscle} />
      ) : (
        <>
          {/* Instant search */}
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon size={18} />
            </span>
            <input
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises"
              data-testid="exercise-search"
              className="h-12 w-full rounded-field border border-border bg-surface-2 pl-10 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
            {query !== '' && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon size={16} />
              </button>
            )}
          </div>

          {/* Body map as navigation — the primary way into the library */}
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            data-testid="muscle-filter-open"
            className="flex w-full items-center gap-3 rounded-card border border-border bg-surface-2 p-3 text-left transition-colors hover:border-accent/60"
          >
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-sm bg-muted/60">
              <MuscleMapThumb primary={muscles} secondary={[]} height={48} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <BodyIcon size={16} className="text-accent" /> Browse by muscle
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {muscleSummary ?? 'Tap the body map to filter to what you want to train'}
              </span>
            </span>
            <ChevronRightIcon size={18} className="shrink-0 text-muted-foreground" />
          </button>

          {/* Body-part jump row (doubles as the category filter) */}
          <div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Chip selected={category === null} onClick={() => setCategory(null)}>
                All
              </Chip>
              {EXERCISE_CATEGORIES.map((c) => (
                <Chip
                  key={c.slug}
                  selected={category === c.slug}
                  onClick={() => setCategory(category === c.slug ? null : c.slug)}
                >
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>

          {/* Toolbar: more filters · result count · grouping */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              data-testid="exercise-filters-open"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-field border border-border-strong px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <FilterIcon size={15} /> Filters
              {sheetFilterCount > 0 && (
                <span className="tabular grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                  {sheetFilterCount}
                </span>
              )}
            </button>
            <p className="text-sm text-muted-foreground" data-testid="exercise-count">
              <span className="font-semibold text-foreground">{sorted.length}</span> exercise
              {sorted.length === 1 ? '' : 's'}
            </p>
            <div className="flex shrink-0 overflow-hidden rounded-field border border-border">
              <GroupToggle active={grouping === 'body'} onClick={() => setGrouping('body')}>
                Body part
              </GroupToggle>
              <GroupToggle active={grouping === 'az'} onClick={() => setGrouping('az')}>
                A–Z
              </GroupToggle>
            </div>
          </div>

          {/* Active filters (the ones that live behind the sheet / map) + clear-all */}
          {anyFilter && (
            <div className="flex flex-wrap items-center gap-2" data-testid="active-filters">
              {muscles.map((m) => (
                <ActiveChip key={m} onClear={() => toggleMuscle(m)}>
                  {MUSCLE_NAMES[m] ?? m}
                </ActiveChip>
              ))}
              {equipment && (
                <ActiveChip onClear={() => setEquipment(null)}>
                  {EQUIPMENT_FACETS.find((f) => f.slug === equipment)?.name ?? equipment}
                </ActiveChip>
              )}
              {pattern && (
                <ActiveChip onClear={() => setPattern(null)}>{patternName(pattern)}</ActiveChip>
              )}
              {difficulty && (
                <ActiveChip onClear={() => setDifficulty(null)}>
                  {DIFFICULTY_LABEL[difficulty] ?? difficulty}
                </ActiveChip>
              )}
              {anyFilter && (
                <button
                  type="button"
                  onClick={clearAll}
                  data-testid="exercise-clear-all"
                  className="ml-auto text-sm font-semibold text-accent"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {/* Recently viewed — floats the moves you actually use to the top */}
          {recentExercises.length > 0 && (
            <section aria-label="Recently viewed">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <ClockIcon size={14} /> Recently viewed
              </p>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {recentExercises.map((ex) => (
                  <Link
                    key={ex.id}
                    href={`/exercises/${ex.slug}`}
                    onClick={() => rememberExercise(ex.slug)}
                    className="w-[132px] shrink-0 rounded-card border border-border bg-surface-2 p-2.5 transition-colors hover:border-accent/60"
                  >
                    <span className="grid h-12 w-full place-items-center rounded-sm bg-muted/60">
                      <MuscleMapThumb
                        primary={ex.primary_muscles as MuscleSlug[]}
                        secondary={ex.secondary_muscles as MuscleSlug[]}
                        height={44}
                      />
                    </span>
                    <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-tight text-foreground">
                      {ex.name}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* The inventory itself */}
          {sorted.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 border-2 border-dashed border-border py-10 text-center shadow-none">
              {/* An empty state is a place the app has room to be itself. Bands, because the
                  answer to "nothing matched" is usually "widen the kit you told us about".
                  AT FULL SIZE NOW, matching Progress: these portraits were drawn on a 48-unit
                  canvas with a delicate 2 px stroke and a contact shadow, and squeezing one into a
                  26 px lozenge threw away both. The lozenge fill goes with it — `.ff-ground` is
                  invisible against `bg-accent-muted`, which is precisely what made these read as
                  flat stickers instead of objects standing on a floor. */}
              <span className="grid h-20 w-20 place-items-center">
                <EquipmentIllustration slug="resistance-bands" size={48} selected />
              </span>
              <div>
                <p className="font-semibold text-foreground">No exercises match these filters</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Try clearing a filter to widen your results.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={clearAll}>
                Clear all filters
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-border pb-1">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </h2>
                    <span className="tabular text-xs font-semibold text-muted-foreground">
                      {group.items.length}
                    </span>
                  </div>
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {group.items.map((ex) => (
                      // min-w-0: a grid item's min-width is AUTO, so the row's `truncate`
                      // (white-space: nowrap) sets the item's min-content to the full untruncated
                      // string — 455px in a 390px viewport. That horizontal overflow made mobile
                      // Chromium zoom the LAYOUT VIEWPORT out to ~558px, which silently broke
                      // every `fixed inset-0` overlay on the page (the muscle sheet landed 288px
                      // below the visual viewport). One class, and the truncation actually
                      // truncates again.
                      <li key={ex.id} className="min-w-0">
                        <Link
                          href={`/exercises/${ex.slug}`}
                          onClick={() => rememberExercise(ex.slug)}
                        >
                          {/* FLAT AND CHEAP, BY DESIGN. This row used to mount a complete
                              anatomical body SVG (~90 nodes) as a 48px thumbnail — ×91 rows,
                              that was the catalog's scroll lag in one line. The equipment glyph
                              (a static ~6-node SVG, and the differentiator a lifter actually
                              scans for) is the tile now; muscles live one tap away on the
                              detail page, at a size where they mean something. */}
                          <Card interactive flat className="ff-press flex items-center gap-3 border border-border !py-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-muted/60 text-muted-foreground">
                              {(() => {
                                const slug = equipmentGlyphSlug(ex);
                                return slug ? (
                                  <EquipmentIllustration slug={slug} size={30} />
                                ) : (
                                  <BodyIcon size={20} />
                                );
                              })()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {ex.name}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {equipmentSummary(ex)} · {patternName(ex.movement_pattern)}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                DIFFICULTY_STYLE[ex.difficulty] ?? 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {DIFFICULTY_LABEL[ex.difficulty]}
                            </span>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Interactive muscle-map filter (P1-6) */}
      <Sheet open={mapOpen} onClose={() => setMapOpen(false)} title="Filter by muscle">
        <p className="mb-3 text-sm text-muted-foreground">
          Tap as many muscles as you like — you&rsquo;ll get every exercise that trains{' '}
          <span className="font-semibold text-foreground">any</span> of them.
        </p>
        <div className="flex justify-center" data-testid="muscle-map-picker">
          <MuscleMap
            view="both"
            height={260}
            interactive
            primary={muscles}
            onMuscleClick={toggleMuscle}
          />
        </div>

        {/*
         * Sticky footer. The map + orientation control + muscle rail are taller than an iPhone's
         * 85dvh sheet, so a static action row sat below the fold and the running selection was
         * invisible while you were picking. Pinning it to the scrollport keeps the read-back and
         * the result count on screen for every tap.
         */}
        <div className="sticky bottom-0 -mx-5 mt-3 border-t border-border bg-surface px-5 pb-1 pt-3">
          <div className="mb-3 min-h-8" data-testid="map-selection">
            {muscles.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No muscles selected — showing everything.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {muscles.map((m) => (
                  <ActiveChip key={m} onClear={() => toggleMuscle(m)}>
                    {MUSCLE_NAMES[m] ?? m}
                  </ActiveChip>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {muscles.length > 0 && (
              <Button
                variant="secondary"
                className="flex-1"
                data-testid="map-clear-muscles"
                onClick={() => setMuscles([])}
              >
                Clear all
              </Button>
            )}
            <Button className="flex-1" data-testid="map-done" onClick={() => setMapOpen(false)}>
              Show {sorted.length}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Secondary filters */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-4">
          <MultiFilterRow
            label="Muscle"
            hint="Pick any number"
            facets={MUSCLE_FACETS}
            values={muscles}
            onToggle={(slug) => toggleMuscle(slug as MuscleSlug)}
            onClear={() => setMuscles([])}
          />
          <FilterRow
            label="Equipment"
            facets={EQUIPMENT_FACETS}
            value={equipment}
            onChange={setEquipment}
            glyphs
          />
          <FilterRow
            label="Movement pattern"
            facets={patternFacets}
            value={pattern}
            onChange={setPattern}
          />
          <FilterRow
            label="Difficulty"
            facets={DIFFICULTY_FACETS}
            value={difficulty}
            onChange={setDifficulty}
          />
        </div>
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setEquipment(null);
              setMuscles([]);
              setPattern(null);
              setDifficulty(null);
            }}
          >
            Reset
          </Button>
          <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
            Show {sorted.length}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------- aggregated plan targets */

function PlanTargets({ onMuscleSelect }: { onMuscleSelect: (slug: MuscleSlug) => void }) {
  const routine = useActiveRoutine();
  const sessions = useWorkoutSessions();

  const loggedSources = React.useMemo<VolumeSource[]>(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const out: VolumeSource[] = [];
    for (const sess of sessions) {
      if (new Date(sess.finishedAt).getTime() < cutoff) continue;
      for (const ex of sess.exercises) {
        if (ex.sets.length === 0) continue;
        out.push({
          slug: ex.exercise_slug,
          sets: ex.sets.length,
          primary_muscles: ex.primary_muscles,
          secondary_muscles: ex.secondary_muscles,
        });
      }
    }
    return out;
  }, [sessions]);

  const planSources = React.useMemo<VolumeSource[]>(
    () =>
      routine.days.flatMap((day) =>
        day.exercises.map((ex) => ({ slug: ex.exercise_slug, sets: ex.sets })),
      ),
    [routine],
  );

  const hasLogs = loggedSources.length > 0;
  const [source, setSource] = React.useState<'plan' | 'logged'>('plan');
  const useLogged = hasLogs && source === 'logged';

  return (
    <div className="space-y-4">
      {hasLogs && (
        <div
          role="tablist"
          aria-label="Volume source"
          className="grid grid-cols-2 gap-1 rounded-field bg-surface-2 p-1"
        >
          <TabButton
            id="plan"
            active={source === 'plan'}
            onClick={() => setSource('plan')}
            testId="targets-source-plan"
          >
            Planned
          </TabButton>
          <TabButton
            id="logged"
            active={source === 'logged'}
            onClick={() => setSource('logged')}
            testId="targets-source-logged"
          >
            Last 7 days
          </TabButton>
        </div>
      )}

      <MuscleVolume
        sources={useLogged ? loggedSources : planSources}
        title={useLogged ? 'What you actually trained' : 'What this plan targets'}
        subtitle={useLogged ? 'Last 7 days of logged sets' : routine.name}
        onMuscleSelect={onMuscleSelect}
      />

      <Card className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-muted text-accent">
          <BodyIcon size={18} />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-foreground">Want more of a muscle?</p>
          <p className="mt-0.5 text-muted-foreground">
            Tap any muscle above to jump into the library filtered to it, or{' '}
            <Link href="/routines" className="font-semibold text-accent hover:underline">
              change your split
            </Link>{' '}
            to rebalance the week.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------------- small parts */

function TabButton({
  id,
  active,
  onClick,
  Icon,
  testId,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  Icon?: (p: IconProps) => React.ReactElement;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`exercises-tab-${id}`}
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[calc(var(--radius-field)-2px)] px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'bg-elevated text-foreground shadow-[var(--shadow-card)]'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

function GroupToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'bg-accent-muted text-accent' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ActiveChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1.5 rounded-chip bg-accent-muted px-3 py-1 text-xs font-semibold text-accent"
    >
      {children}
      <XIcon size={13} />
    </button>
  );
}


/** Multi-select sibling of `FilterRow` — "All" clears, every other chip toggles independently. */
function MultiFilterRow({
  label,
  hint,
  facets,
  values,
  onToggle,
  onClear,
}: {
  label: string;
  hint?: string;
  facets: { slug: string; name: string }[];
  values: readonly string[];
  onToggle: (slug: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && <span className="ml-1.5 font-medium normal-case tracking-normal">· {hint}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Chip selected={values.length === 0} onClick={onClear}>
          All
        </Chip>
        {facets.map((f) => (
          <Chip key={f.slug} selected={values.includes(f.slug)} onClick={() => onToggle(f.slug)}>
            {f.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  facets,
  value,
  onChange,
  glyphs,
}: {
  label: string;
  facets: { slug: string; name: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  /**
   * Draw each facet's equipment portrait as the chip's leading mark. Opt-in, because a movement
   * pattern and a difficulty are not objects and would get the registry's fallback dumbbell.
   *
   * SAFE BY CONSTRUCTION: `Chip`'s `leading` slot is already wrapped in `aria-hidden` and adds no
   * text node, so `getByRole('button', { name: 'Barbell', exact: true })` in the settings spec
   * still resolves.
   */
  glyphs?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        <Chip selected={value === null} onClick={() => onChange(null)}>
          All
        </Chip>
        {facets.map((f) => (
          <Chip
            key={f.slug}
            selected={value === f.slug}
            onClick={() => onChange(value === f.slug ? null : f.slug)}
            leading={
              glyphs ? (
                <EquipmentIllustration slug={f.slug} size={18} selected={value === f.slug} />
              ) : undefined
            }
          >
            {f.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
