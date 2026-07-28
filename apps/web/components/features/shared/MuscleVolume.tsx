'use client';

/**
 * AGGREGATED TARGETING — "what does this plan actually train, and is it enough?"
 *
 * The currency is **hard sets per muscle per week** (primary set = 1.0, secondary = 0.5 — stated
 * on-screen, no invented percentages). What changed in this pass: raw set counts are now resolved
 * against a **personalised weekly set goal** (see `volumeMath.ts`) and rendered as a CONTINUOUS
 * yellow → orange → red heat gradient on the silhouette, so the question a lifter actually asks —
 * *"am I doing enough for this muscle?"* — is answerable at a glance.
 *
 * Three linked views:
 *   1. `MuscleGoalHeat` — the body, coloured by % of weekly goal; tap a muscle for its numbers.
 *   2. a ranked list of every muscle: sets, goal, % of goal, status.
 *   3. a plain-English read-out of what is covered, what is light, and what is untouched.
 *
 * Pure client component, no data fetching: callers pass exercise references + set counts, so the
 * same component serves a routine preview, a single workout day, or a week of logged sets.
 */
import * as React from 'react';
import { MuscleMap, MUSCLE_NAMES, ALL_MUSCLE_SLUGS } from '@/components/illustrations';
import type { MuscleSlug } from '@/components/illustrations';
import { mockExerciseBySlug, mockExerciseById } from '@/components/features/_mock/data';
import { BodyIcon, SlidersIcon } from '@/components/ui/icons';
import { m, staggerList, staggerItem, Pressable } from '@/components/ui/motion';
import { useDemoState } from '@/lib/demo/useDemo';
import { TargetTuner } from './TargetTuner';
import {
  buildGoalRows,
  fmtPct,
  fmtSets,
  goalContextFromProfile,
  goalHeatColors,
  GOAL_STATUS_HELP,
  GOAL_STATUS_LABEL,
  heatGradientCss,
  MED_WEEKLY_SETS,
  PRODUCTIVE_BAND,
  type GoalStatus,
  type MuscleGoalRow,
  type VolumeGoalContext,
} from './volumeMath';

/* ------------------------------------------------------------------------------ attribution */

/** One contribution to weekly volume: an exercise (by slug or id) performed for `sets` sets. */
export interface VolumeSource {
  /** exercise slug — preferred (matches routine rows and catalog URLs) */
  slug?: string;
  /** exercise id — used when only the id is at hand (logged sessions) */
  id?: string;
  /** number of hard sets */
  sets: number;
  /** optional pre-resolved muscles (skips the catalog lookup) */
  primary_muscles?: string[];
  secondary_muscles?: string[];
}

/** Credit a primary muscle gets per set. */
export const PRIMARY_CREDIT = 1;
/** Credit a secondary muscle gets per set. */
export const SECONDARY_CREDIT = 0.5;

/**
 * LEGACY coarse bands. Superseded by the per-muscle goals in `volumeMath.ts`, but kept exported
 * (and still correct) because `features/shared/index.ts` re-exports them.
 */
export const VOLUME_BANDS = {
  /** below this = under-trained */
  low: 10,
  /** above this = high / recovery risk */
  high: 20,
} as const;

export type VolumeBand = 'none' | 'low' | 'optimal' | 'high';

export const BAND_LABEL: Record<VolumeBand, string> = {
  none: 'Not trained',
  low: 'Room to grow',
  optimal: 'On target',
  high: 'Very high',
};

export const BAND_HELP: Record<VolumeBand, string> = {
  none: 'No sets hit this muscle in the plan.',
  low: `Under ${VOLUME_BANDS.low} sets a week — fine for a support muscle, light if it's a goal.`,
  optimal: `${VOLUME_BANDS.low}–${VOLUME_BANDS.high} sets a week — a solid growth range.`,
  high: `Over ${VOLUME_BANDS.high} sets a week — great, as long as you're recovering.`,
};

export function bandFor(sets: number): VolumeBand {
  if (sets <= 0) return 'none';
  if (sets < VOLUME_BANDS.low) return 'low';
  if (sets <= VOLUME_BANDS.high) return 'optimal';
  return 'high';
}

export interface MuscleVolumeRow {
  slug: MuscleSlug;
  name: string;
  sets: number;
  band: VolumeBand;
}

function resolveMuscles(src: VolumeSource): { primary: string[]; secondary: string[] } {
  if (src.primary_muscles || src.secondary_muscles) {
    return { primary: src.primary_muscles ?? [], secondary: src.secondary_muscles ?? [] };
  }
  const ex = src.slug ? mockExerciseBySlug(src.slug) : src.id ? mockExerciseById(src.id) : undefined;
  return { primary: ex?.primary_muscles ?? [], secondary: ex?.secondary_muscles ?? [] };
}

/**
 * The raw aggregation step: sources → weighted sets per muscle per week, split into TOTAL
 * (direct 1.0 + indirect 0.5) and DIRECT-only.
 *
 * The split matters downstream: a muscle can sit far over target purely on indirect credit from
 * compounds, and "you are over target" is only an actionable statement when there is direct work
 * to remove. See `MuscleGoalRow.directSets`.
 */
export function aggregateSets(
  sources: VolumeSource[],
  weeks = 1,
): {
  total: Partial<Record<MuscleSlug, number>>;
  direct: Partial<Record<MuscleSlug, number>>;
} {
  const totals = new Map<string, number>();
  const directs = new Map<string, number>();
  for (const src of sources) {
    const n = Math.max(0, src.sets);
    if (n === 0) continue;
    const { primary, secondary } = resolveMuscles(src);
    for (const m of primary) {
      totals.set(m, (totals.get(m) ?? 0) + n * PRIMARY_CREDIT);
      directs.set(m, (directs.get(m) ?? 0) + n * PRIMARY_CREDIT);
    }
    for (const m of secondary) totals.set(m, (totals.get(m) ?? 0) + n * SECONDARY_CREDIT);
  }
  const div = Math.max(1, weeks);
  const total: Partial<Record<MuscleSlug, number>> = {};
  const direct: Partial<Record<MuscleSlug, number>> = {};
  for (const slug of ALL_MUSCLE_SLUGS) {
    const t = (totals.get(slug) ?? 0) / div;
    if (t > 0) total[slug] = Math.round(t * 10) / 10;
    const d = (directs.get(slug) ?? 0) / div;
    if (d > 0) direct[slug] = Math.round(d * 10) / 10;
  }
  return { total, direct };
}

/** Total weighted sets per muscle per week. Thin wrapper over {@link aggregateSets}. */
export function setsByMuscleFromSources(
  sources: VolumeSource[],
  weeks = 1,
): Partial<Record<MuscleSlug, number>> {
  return aggregateSets(sources, weeks).total;
}

/**
 * Weighted sets per muscle. Primary +1.0/set, secondary +0.5/set. Returns EVERY seed muscle
 * (zeroes included) sorted by volume desc, then by the stable anatomical order — so "what am I
 * neglecting" is answerable from the bottom of the list.
 */
export function computeMuscleVolume(sources: VolumeSource[], weeks = 1): MuscleVolumeRow[] {
  const order = new Map(ALL_MUSCLE_SLUGS.map((s, i) => [s, i]));
  const totals = setsByMuscleFromSources(sources, weeks);
  return ALL_MUSCLE_SLUGS.map((slug) => {
    const sets = totals[slug] ?? 0;
    return { slug, name: MUSCLE_NAMES[slug], sets, band: bandFor(sets) };
  }).sort((a, b) => b.sets - a.sets || (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
}

/** `heat` payload (0..1) for `MuscleMap`, saturating at the top of the optimal band. LEGACY. */
export function volumeHeat(rows: MuscleVolumeRow[]): Partial<Record<MuscleSlug, number>> {
  const heat: Partial<Record<MuscleSlug, number>> = {};
  for (const r of rows) {
    if (r.sets > 0) heat[r.slug] = Math.min(1, r.sets / VOLUME_BANDS.high);
  }
  return heat;
}

function fmt(n: number): string {
  return fmtSets(n);
}

/**
 * The athlete's personalised goal context: profile-derived scaling PLUS any per-muscle targets
 * they calibrated for themselves. Both live here so every consumer of a goal number — heat
 * colours, statuses, the "short of goal" advice — resolves through the same place and a
 * calibration genuinely re-plans rather than just re-labelling one row.
 */
export function useVolumeGoalContext(override?: VolumeGoalContext): VolumeGoalContext {
  const state = useDemoState();
  return React.useMemo(
    () => override ?? goalContextFromProfile(state.profile, state.volumeTargets as Partial<Record<MuscleSlug, number>>),
    [override, state.profile, state.volumeTargets],
  );
}

/** The legend gradient is constant — sample the ramp once per module, not once per render. */
const LEGEND_GRADIENT = heatGradientCss(1.5);

const STATUS_TEXT: Record<GoalStatus, string> = {
  none: 'text-muted-foreground',
  under: 'text-muted-foreground',
  building: 'text-energy',
  'on-target': 'text-success',
  above: 'text-accent',
  over: 'text-danger',
};

/* ═══════════════════════════════════════════════════════ view 1 — the heat-gradient body ══ */

export interface MuscleGoalHeatProps {
  /** goal-resolved rows (build with `buildGoalRows`) */
  rows: MuscleGoalRow[];
  /**
   * Legacy sizing hint. It used to be the height of EACH of two side-by-side silhouettes; it is
   * now scaled up into the height of the single flip figure, so existing callers get a body
   * that is ~3× the painted area without touching their code.
   */
  height?: number;
  /** "Show exercises" deep-link from the selected-muscle detail */
  onMuscleSelect?: (slug: MuscleSlug) => void;
  /** open the weekly-target tuner for a muscle, from the selected-muscle detail */
  onTuneMuscle?: (slug: MuscleSlug) => void;
  /** rendered above the body (e.g. a Planned / Logged switch) */
  header?: React.ReactNode;
  /** drop the card chrome — for when the caller already provides a surface */
  bare?: boolean;
  /** show the scrollable muscle rail (off when the caller renders its own ranked list) */
  rail?: boolean;
  className?: string;
}

/**
 * The signature view, rebuilt around ONE flippable body.
 *
 * Every muscle is filled with its position on the CONTINUOUS yellow → orange → red ramp, where
 * the axis is **% of that muscle's weekly set goal**. What changed:
 *
 *   · one body with a FRONT / BACK switch instead of two look-alike silhouettes, so the figure is
 *     twice as wide and every region is a real tap target;
 *   · the read-out sits DIRECTLY under the figure and occupies the same space whether or not
 *     something is selected — tap a muscle and the answer is already on screen, with nothing
 *     below it jumping;
 *   · the selection is echoed on the body itself (gold ring + a pinned callout with the %), so
 *     you never have to hunt for what you just tapped;
 *   · the muscle rail gives every muscle a 38 px-tall alternative target, sorted by how far along
 *     its goal it is — which doubles as an instant ranking.
 */
export function MuscleGoalHeat({
  rows,
  height = 224,
  onMuscleSelect,
  onTuneMuscle,
  header,
  bare = false,
  rail = true,
  className,
}: MuscleGoalHeatProps) {
  const [selected, setSelected] = React.useState<MuscleSlug | null>(null);
  const colors = React.useMemo(() => goalHeatColors(rows), [rows]);
  const bySlug = React.useMemo(() => new Map(rows.map((r) => [r.slug, r])), [rows]);
  const detail = selected ? bySlug.get(selected) : undefined;

  // The trained muscle furthest along its own goal — the default hint before anything is picked.
  const hottest = rows
    .filter((r) => r.sets > 0)
    .reduce<MuscleGoalRow | null>((best, r) => (!best || r.pct > best.pct ? r : best), null);

  /** rail chips: a colour dot, the name, and the number that matters — sorted by % of goal */
  const badges = React.useMemo(() => {
    const out: Partial<Record<MuscleSlug, string>> = {};
    for (const r of rows) if (r.sets > 0) out[r.slug] = fmtPct(r.pct);
    return out;
  }, [rows]);
  const dotColors = React.useMemo(() => {
    const out: Partial<Record<MuscleSlug, string>> = {};
    for (const r of rows) out[r.slug] = r.sets > 0 ? r.color : 'var(--muscle-line)';
    return out;
  }, [rows]);
  const railOrder = React.useMemo(
    () => [...rows].sort((a, b) => b.pct - a.pct || b.sets - a.sets).map((r) => r.slug),
    [rows],
  );

  /* the colour key belongs NEXT to the colours it explains, not at the bottom of the card */
  const legend = (
    <div data-testid="heat-legend">
      <div
        className="h-2 w-full rounded-full border border-border"
        style={{ backgroundImage: LEGEND_GRADIENT }}
        aria-hidden
      />
      <div className="mt-1 flex justify-between text-[10px] font-semibold tabular text-muted-foreground">
        <span>0%</span>
        <span>50%</span>
        <span className="text-accent">100%</span>
        <span className="text-danger">150%+</span>
      </div>
      <p className="mt-0.5 text-center text-[10px] leading-snug text-muted-foreground">
        % of your weekly set goal — yellow is building, orange is on goal, red is over.
      </p>
    </div>
  );

  const readout = (
    <div className="min-h-[136px]" data-testid="muscle-goal-detail">
      {detail ? (
        <div className="rounded-field border border-accent/45 bg-surface p-3 shadow-[0_0_0_1px_rgba(228,184,77,0.06)]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display text-base font-bold text-foreground">
              {detail.name}
            </span>
            <span
              className={`shrink-0 text-xs font-bold ${STATUS_TEXT[detail.status]}`}
              data-testid="muscle-goal-detail-status"
            >
              {GOAL_STATUS_LABEL[detail.status]}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Stat label="This week" value={fmt(detail.sets)} unit="sets" />
            <Stat
              label={detail.calibrated ? 'Your goal' : 'Goal'}
              value={fmt(detail.goal)}
              unit="sets"
            />
            <Stat
              label="Of goal"
              value={fmtPct(detail.pct)}
              unit=""
              color={detail.sets > 0 ? detail.color : undefined}
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {GOAL_STATUS_HELP[detail.status]}
            {detail.calibrated && (
              <>
                {' '}
                <span className="font-semibold text-foreground">
                  Your target, not ours — we&rsquo;d suggest {detail.recommended}.
                </span>
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {onMuscleSelect && (
              <button
                type="button"
                onClick={() => onMuscleSelect(detail.slug)}
                data-testid="muscle-goal-detail-exercises"
                className="text-sm font-semibold text-accent"
              >
                Show {detail.name} exercises →
              </button>
            )}
            {onTuneMuscle && (
              <button
                type="button"
                onClick={() => onTuneMuscle(detail.slug)}
                data-testid="muscle-goal-detail-tune"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
              >
                <SlidersIcon size={14} /> Tune this target
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-[136px] flex-col items-center justify-center gap-1.5 rounded-field border border-dashed border-border-strong/70 bg-surface/60 px-4 text-center">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-muted text-accent">
            {/* A dartboard was standing for "the muscles this hits" in seven places while ALSO standing for a numeric goal on the landing page and in onboarding. BodyIcon is an authored silhouette that already means exactly this elsewhere; one glyph with two meanings is worse than either. */}
            <BodyIcon size={16} />
          </span>
          <p className="text-[13px] font-semibold text-foreground">
            Tap any muscle for its sets, goal and % of goal
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {hottest ? (
              <>
                Right now{' '}
                <span className="font-semibold text-foreground">{hottest.name}</span> leads at{' '}
                <span className="tabular font-semibold" style={{ color: hottest.color }}>
                  {fmtPct(hottest.pct)}
                </span>{' '}
                of goal.
              </>
            ) : (
              'Nothing logged for this week yet.'
            )}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={[
        bare ? '' : 'rounded-card bg-surface-2 p-4 shadow-[var(--shadow-card)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="muscle-goal-heat"
    >
      {header}
      <MuscleMap
        view="both"
        heatColors={colors}
        selected={selected}
        // the legacy prop sized ONE of two tiny silhouettes; scale it into a real figure
        height={Math.round(Math.max(height, 200) * 1.34)}
        // Always open facing the user. With every muscle painted, "auto" would pick a side on a
        // coin-flip and the user would land somewhere different each visit.
        initialView="front"
        interactive
        rail={rail}
        badges={badges}
        dotColors={dotColors}
        railOrder={railOrder}
        hint={
          <div className="space-y-2">
            {legend}
            {readout}
          </div>
        }
        ariaLabel="Weekly volume as a percentage of goal, per muscle"
        onMuscleClick={(slug) => setSelected((cur) => (cur === slug ? null : slug))}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <span className="block rounded-field bg-surface-2 px-1.5 py-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className="block font-display text-base font-bold tabular text-foreground"
        style={color ? { color } : undefined}
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{unit}</span>
        )}
      </span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════ view 2 — the ranked list ══ */

export interface MuscleVolumeProps {
  /** exercises + set counts to aggregate */
  sources: VolumeSource[];
  /** divide totals by this many weeks (default 1 — sources already describe one week) */
  weeks?: number;
  /** headline above the summary line */
  title?: string;
  /** one-line context, e.g. the routine name */
  subtitle?: string;
  /** tap a muscle row / silhouette → caller can deep-link into the catalog */
  onMuscleSelect?: (slug: MuscleSlug) => void;
  /** how many ranked rows to show before "Show all" (default 8) */
  initialRows?: number;
  /** override the goal personalisation (defaults to the Local Mode profile) */
  goalContext?: VolumeGoalContext;
  /** rendered inside the heat card, above the body (e.g. a Planned / Logged switch) */
  heatHeader?: React.ReactNode;
  className?: string;
}

export function MuscleVolume({
  sources,
  weeks = 1,
  title = 'What this plan targets',
  subtitle,
  onMuscleSelect,
  initialRows = 8,
  goalContext,
  heatHeader,
  className,
}: MuscleVolumeProps) {
  const ctx = useVolumeGoalContext(goalContext);
  const agg = React.useMemo(() => aggregateSets(sources, weeks), [sources, weeks]);
  const goalRows = React.useMemo(
    () => buildGoalRows(agg.total, ctx, agg.direct),
    [agg, ctx],
  );
  const [expanded, setExpanded] = React.useState(false);
  const [tuning, setTuning] = React.useState<MuscleSlug | null>(null);
  const tuningRow = tuning ? (goalRows.find((r) => r.slug === tuning) ?? null) : null;

  const order = React.useMemo(() => new Map(ALL_MUSCLE_SLUGS.map((s, i) => [s, i])), []);
  const ranked = React.useMemo(
    () =>
      [...goalRows].sort(
        (a, b) =>
          b.pct - a.pct || b.sets - a.sets || (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0),
      ),
    [goalRows, order],
  );

  const trained = ranked.filter((r) => r.sets > 0);
  const untrained = ranked.filter((r) => r.sets === 0);
  const totalSets = sources.reduce((n, s) => n + Math.max(0, s.sets), 0) / Math.max(1, weeks);
  const shown = expanded ? ranked : ranked.slice(0, initialRows);
  const lagging = trained
    .filter((r) => r.status === 'under' || r.status === 'building')
    .slice(-3)
    .reverse();
  const overshot = trained.filter((r) => r.status === 'over');
  const onTarget = trained.filter((r) => r.status === 'on-target' || r.status === 'above');

  if (trained.length === 0) {
    return (
      <div
        className={['rounded-card bg-surface-2 p-5 text-center', className].filter(Boolean).join(' ')}
        data-testid="muscle-volume"
      >
        <p className="font-semibold text-foreground">Nothing to aggregate yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add exercises to your plan and this view will show the weekly sets landing on every muscle.
        </p>
      </div>
    );
  }

  return (
    <div className={['space-y-4', className].filter(Boolean).join(' ')} data-testid="muscle-volume">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {subtitle ? `${subtitle} · ` : ''}
          <span className="tabular font-semibold text-foreground">{fmt(Math.round(totalSets))}</span>{' '}
          sets a week across{' '}
          <span className="tabular font-semibold text-foreground">{trained.length}</span> muscles
        </p>
      </div>

      {/* View 1 — the % of weekly goal heat gradient */}
      {/* the ranked list below is this view's alternative selection path, so the heat card
          drops its own rail rather than showing two lists of the same twenty muscles */}
      <MuscleGoalHeat
        rows={goalRows}
        onMuscleSelect={onMuscleSelect}
        onTuneMuscle={setTuning}
        header={heatHeader}
        rail={false}
      />

      {/* View 2 — ranked bars, each scaled to that muscle's OWN weekly goal.
          Every row carries a TUNE button: a row that says "Over target" and offers no way to act
          on it is a diagnosis with no treatment, which is exactly what this view used to be. */}
      <m.ul
        className="space-y-1.5"
        data-testid="muscle-volume-bars"
        variants={staggerList}
        initial="hidden"
        animate="show"
      >
        {shown.map((r) => (
          <m.li key={r.slug} variants={staggerItem} className="flex items-center gap-1">
            {onMuscleSelect ? (
              <Pressable
                soft
                onClick={() => onMuscleSelect(r.slug)}
                data-testid={`muscle-volume-row-${r.slug}`}
                aria-label={`${r.name}: ${fmt(r.sets)} of ${fmt(r.goal)} weekly sets, ${fmtPct(r.pct)} of goal. ${GOAL_STATUS_LABEL[r.status]}. Show exercises.`}
                className="min-w-0 flex-1 rounded-field px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <GoalRowBody row={r} />
              </Pressable>
            ) : (
              <div className="min-w-0 flex-1 px-2.5 py-2">
                <GoalRowBody row={r} />
              </div>
            )}
            <Pressable
              onClick={() => setTuning(r.slug)}
              data-testid={`muscle-tune-${r.slug}`}
              aria-label={`Tune the weekly target for ${r.name}`}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                r.status === 'above' || r.status === 'over'
                  ? 'border-accent/60 bg-accent-muted text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <SlidersIcon size={16} />
            </Pressable>
          </m.li>
        ))}
      </m.ul>

      {ranked.length > initialRows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid="muscle-volume-toggle"
          className="text-sm font-semibold text-accent"
        >
          {expanded ? 'Show top muscles only' : `Show all ${ranked.length} muscles`}
        </button>
      )}

      {/* Plain-English read-out */}
      <div className="rounded-card border border-border bg-surface-2/60 p-4 text-sm">
        <p className="font-semibold text-foreground">In plain English</p>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          {onTarget.length > 0 && (
            <li>
              <span className="font-semibold text-foreground">On or above goal:</span>{' '}
              {onTarget
                .slice(0, 4)
                .map((r) => `${r.name} (${fmtPct(r.pct)})`)
                .join(', ')}
              .
            </li>
          )}
          {lagging.length > 0 && (
            <li>
              <span className="font-semibold text-foreground">Short of goal:</span>{' '}
              {lagging.map((r) => `${r.name} (${fmt(r.sets)}/${fmt(r.goal)})`).join(', ')} — add a
              set or an accessory if these matter to you.
            </li>
          )}
          {overshot.length > 0 && (
            <li>
              <span className="font-semibold text-foreground">Over goal:</span>{' '}
              {overshot
                .slice(0, 3)
                .map((r) => `${r.name} (${fmtPct(r.pct)})`)
                .join(', ')}
              . Fine if you are recovering — watch for stalled reps.
            </li>
          )}
          {untrained.length > 0 && (
            <li>
              <span className="font-semibold text-foreground">Untouched:</span>{' '}
              {untrained.map((r) => r.name).join(', ')}.
            </li>
          )}
          <li className="pt-1 text-xs">
            Every set counts <span className="font-semibold text-foreground">1.0</span> toward each
            primary muscle and <span className="font-semibold text-foreground">0.5</span> toward each
            secondary muscle — the same fractional weighting Pelland et al. (2025) used to fit the
            dose-response curve over 67 studies, so these numbers are in the units the research is
            in. Goals sit in the{' '}
            <span className="font-semibold text-foreground">
              {PRODUCTIVE_BAND.low}–{PRODUCTIVE_BAND.high}
            </span>{' '}
            set band both that meta-regression and Baz-Valle et al. (2022) converge on, floored at
            the {MED_WEEKLY_SETS}-set minimum effective dose, then scaled to your goal, experience
            and training days.{' '}
            <span className="font-semibold text-foreground">Tap the sliders on any row</span> to set
            your own target — everything above recomputes against it.
          </li>
        </ul>
      </div>

      <TargetTuner row={tuningRow} onClose={() => setTuning(null)} onShowExercises={onMuscleSelect} />
    </div>
  );
}

/**
 * One ranked row: name · status · sets/goal. The bar is scaled to the muscle's OWN goal (the tick
 * marks 100 %), so a short bar always means "short of goal" rather than "smaller than the biggest
 * muscle in the list".
 */
function GoalRowBody({ row }: { row: MuscleGoalRow }) {
  const width = Math.min(100, (row.pct / 1.5) * 100);
  const goalTick = (1 / 1.5) * 100;
  return (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{row.name}</span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className={`text-[11px] font-semibold ${STATUS_TEXT[row.status]}`}>
            {GOAL_STATUS_LABEL[row.status]}
          </span>
          <span className="tabular text-sm font-bold text-foreground">
            {fmt(row.sets)}
            <span className="text-[11px] font-medium text-muted-foreground">/{fmt(row.goal)}</span>
          </span>
        </span>
      </span>
      <span className="relative mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full w-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-500"
          style={{
            transform: `scaleX(${Math.max(row.sets > 0 ? 4 : 0, width) / 100})`,
            backgroundColor: row.sets > 0 ? row.color : 'transparent',
          }}
        />
        {/* the 100 %-of-goal tick */}
        <span
          className="absolute top-0 h-full w-px bg-border-strong"
          style={{ left: `${goalTick}%` }}
          aria-hidden
        />
      </span>
    </>
  );
}
