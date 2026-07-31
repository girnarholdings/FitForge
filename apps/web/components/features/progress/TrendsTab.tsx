'use client';

/**
 * TRENDS — the "am I actually progressing?" surface.
 *
 * Five time-series, all built from REAL logged sessions (`workoutLog`) and the REAL body-weight log,
 * all drawn with self-authored inline SVG (no chart library, no runtime deps):
 *
 *   1. Weekly training volume — weighted sets or tonnage — over the last 12 weeks, with a trend
 *      indicator against the previous completed week and the window average as a reference line.
 *   2. Consistency — distinct training days per week vs the athlete's own target, as a dot strip.
 *   3. Sets per muscle GROUP over time — six small-multiple sparklines, so an imbalance that has
 *      been running for two months is visible as a shape, not a number.
 *   4. Strength — estimated 1RM (Epley) per session for the most-trained lifts.
 *   5. Body weight — the existing weight log, integrated here rather than duplicated.
 *
 * Above them sits a plain-English verdict computed from the same numbers (`analytics.ts`), because
 * the point of the screen is understanding, not decoration.
 *
 * EMPTY STATE: a brand-new Local Mode user has no history and none is invented. The empty state
 * says exactly what will appear and when, and points at the planned-volume projection on the heat
 * card above.
 */
import * as React from 'react';
import { Button, Card, CardTitle, Chip } from '@/components/ui';
import {
  ColumnChart,
  ConsistencyStrip,
  Sparkline,
  TrendLine,
  type SeriesPoint,
} from '@/components/features/progress/charts';
import { buildSummary, groupSeries, strengthTrends } from '@/components/features/progress/analytics';
import {
  bucketWeightedSets,
  useWorkoutSessions,
  weeklyBuckets,
  type TrendDirection,
} from '@/components/features/shared/workoutLog';
import { useVolumeGoalContext } from '@/components/features/shared/MuscleVolume';
import { fmtPct, fmtSets } from '@/components/features/shared/volumeMath';
import { useActiveRoutine, useDemoState, useWeights } from '@/lib/demo/useDemo';
import { CalendarIcon, SparkIcon, MedalIcon, ScaleIcon } from '@/components/ui/icons';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { overnight, rhrSeries } from '@/lib/health/selectors';
import { useHealthData } from '@/lib/health/store';
import { isoDaysAgo, sleepHM } from '@/lib/health/format';

const WEEKS = 12;

/** How far back the Apple Health trend lines look. Two months ≈ the 90-day first-sync backfill. */
const HEALTH_TREND_DAYS = 60;
/** Under a week of readings a "trend" is noise wearing a line — the cards stay unrendered. */
const MIN_HEALTH_POINTS = 7;

/* ------------------------------------------------------------------------------- trend pill */

function TrendArrow({ direction }: { direction: TrendDirection }) {
  if (direction === 'none') return null;
  const d =
    direction === 'up'
      ? 'M6 2.5 L10 8 L2 8 Z'
      : direction === 'down'
        ? 'M6 9.5 L10 4 L2 4 Z'
        : 'M2 6 H10';
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {direction === 'flat' ? (
        <path d={d} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
      ) : (
        <path d={d} fill="currentColor" />
      )}
    </svg>
  );
}

const DIR_CLASS: Record<TrendDirection, string> = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-muted-foreground',
  none: 'text-muted-foreground',
};

function TrendPill({
  direction,
  label,
  testId,
}: {
  direction: TrendDirection;
  label: string;
  testId?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip bg-surface-2 px-2 py-0.5 text-[11px] font-bold tabular ${DIR_CLASS[direction]}`}
      data-testid={testId}
    >
      <TrendArrow direction={direction} />
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════ tab ══ */

export function TrendsTab({ onGoToWeight }: { onGoToWeight?: () => void }) {
  const sessions = useWorkoutSessions();
  const state = useDemoState();
  const routine = useActiveRoutine();
  const { weights } = useWeights();
  const ctx = useVolumeGoalContext();

  const targetDays = state.profile?.days_per_week ?? routine.days.length ?? 4;
  const buckets = React.useMemo(() => weeklyBuckets(sessions, WEEKS), [sessions]);
  const summary = React.useMemo(
    () => buildSummary({ buckets, sessions, ctx, targetDays, weights }),
    [buckets, sessions, ctx, targetDays, weights],
  );

  // Apple Health series read here, before the training-history early return: the overnight data
  // exists independently of the training log, so a new lifter with a month of watch data still
  // gets their sleep and resting-HR lines under the (honest) training empty state.
  const health = useOvernightSeries();

  if (!summary.hasData) {
    return (
      <div className="space-y-4">
        <TrendsEmptyState targetDays={targetDays} routineName={routine.name} />
        <SleepTrendCard data={health.sleep} />
        <RestingHrTrendCard data={health.rhr} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="progress-trends">
      <SummaryCard summary={summary} />
      <VolumeCard buckets={buckets} summary={summary} />
      <ConsistencyCard buckets={buckets} targetDays={targetDays} avgDays={summary.avgDays} />
      <GroupBalanceCard buckets={buckets} />
      <StrengthCard sessions={sessions} />
      <BodyWeightCard weights={weights} onGoToWeight={onGoToWeight} />
      <SleepTrendCard data={health.sleep} />
      <RestingHrTrendCard data={health.rhr} />
    </div>
  );
}

/* ------------------------------------------------------------------------------ empty state */

function TrendsEmptyState({ targetDays, routineName }: { targetDays: number; routineName: string }) {
  return (
    <Card
      className="flex flex-col items-center gap-3 border-2 border-dashed border-border py-8 text-center shadow-none"
      data-testid="progress-trends-empty"
    >
      {/* The largest quiet surface in Progress, and it was a 26 px rising arrow in a lozenge — the
          most template-looking thing on the screen. The 48-unit equipment portraits were drawn at
          exactly this size, ground shadow and all, and until now were only ever seen this big
          inside the onboarding equipment step. A bare barbell is the honest object for "you have
          not trained yet"; the lozenge fill is dropped so the portrait's contact shadow reads. */}
      <span className="grid h-20 w-20 place-items-center">
        <EquipmentIllustration slug="barbell" size={48} selected />
      </span>
      <CardTitle>No training history yet</CardTitle>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">
        Nothing here is simulated, so this view stays empty until you finish a workout. The heat map
        above is already showing what{' '}
        <span className="font-semibold text-foreground">{routineName}</span> plans for your week.
      </p>
      <ul className="mx-auto max-w-sm space-y-1.5 text-left text-sm text-muted-foreground">
        <li>
          <span className="font-semibold text-foreground">After 1 workout</span> — sets, tonnage and
          your first estimated 1RMs appear.
        </li>
        <li>
          <span className="font-semibold text-foreground">After 2 weeks</span> — week-over-week
          volume and consistency vs your {targetDays} target days.
        </li>
        <li>
          <span className="font-semibold text-foreground">After 4 weeks</span> — muscle-group balance
          over time and a real strength trend line.
        </li>
      </ul>
    </Card>
  );
}

/* --------------------------------------------------------------------------- verdict summary */

const VERDICT_TONE: Record<string, string> = {
  progressing: 'text-success',
  steady: 'text-accent',
  slipping: 'text-energy',
  starting: 'text-muted-foreground',
};

function SummaryCard({ summary }: { summary: ReturnType<typeof buildSummary> }) {
  return (
    <Card premium className="shadow-[var(--shadow-card)]" data-testid="progress-summary">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-muted text-accent">
          <SparkIcon size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            How you&rsquo;re doing
          </p>
          <h2
            className={`font-display text-xl font-bold tracking-tight ${VERDICT_TONE[summary.verdict] ?? 'text-foreground'}`}
            data-testid="progress-summary-headline"
          >
            {summary.headline}
          </h2>
        </div>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {summary.bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* --------------------------------------------------------------------------- weekly volume */

type Metric = 'sets' | 'tonnage';

function VolumeCard({
  buckets,
  summary,
}: {
  buckets: ReturnType<typeof weeklyBuckets>;
  summary: ReturnType<typeof buildSummary>;
}) {
  const [metric, setMetric] = React.useState<Metric>('sets');
  const [sel, setSel] = React.useState<number | null>(null);

  const data: SeriesPoint[] = React.useMemo(
    () =>
      buckets.map((b) => {
        const value =
          metric === 'sets' ? Math.round(bucketWeightedSets(b) * 10) / 10 : Math.round(b.tonnage);
        return {
          label: b.label,
          value,
          display:
            metric === 'sets'
              ? `${fmtSets(value)} sets · ${b.sessions} session${b.sessions === 1 ? '' : 's'}`
              : `${value.toLocaleString()} kg · ${b.sets} sets`,
          provisional: b.isCurrent,
        };
      }),
    [buckets, metric],
  );

  const nonZero = data.filter((d) => d.value > 0);
  const avg =
    nonZero.length > 0 ? nonZero.reduce((n, d) => n + d.value, 0) / nonZero.length : 0;
  const trend = metric === 'sets' ? summary.volumeTrend : summary.tonnageTrend;
  const trendLabel =
    trend.direction === 'none'
      ? 'no data'
      : trend.direction === 'flat'
        ? 'flat'
        : `${trend.pctChange > 0 ? '+' : '−'}${Math.abs(Math.round(trend.pctChange))}%`;
  const active = sel != null ? data[sel] : null;

  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="chart-weekly-volume">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Weekly training volume</CardTitle>
        <TrendPill
          direction={trend.direction}
          label={trendLabel}
          testId="weekly-volume-trend"
        />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Last {buckets.length} weeks · vs the week before last. The hatched bar is this week, still in
        progress.
      </p>

      <div className="mt-2 flex gap-2">
        <Chip selected={metric === 'sets'} onClick={() => setMetric('sets')}>
          Sets
        </Chip>
        <Chip selected={metric === 'tonnage'} onClick={() => setMetric('tonnage')}>
          Tonnage
        </Chip>
      </div>

      <p className="mt-2 h-5 text-sm font-semibold text-foreground" aria-live="polite">
        {active ? (
          <>
            <span className="text-muted-foreground">{active.label}: </span>
            <span className="tabular">{active.display}</span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            Tap a bar for that week&rsquo;s numbers
          </span>
        )}
      </p>

      <ColumnChart
        data={data}
        selected={sel}
        onSelect={setSel}
        reference={avg > 0 ? { value: avg, label: `avg ${Math.round(avg).toLocaleString()}` } : null}
        ariaLabel={metric === 'sets' ? 'Weighted sets per week' : 'Tonnage per week'}
        testId="weekly-volume-chart"
      />
    </Card>
  );
}

/* ----------------------------------------------------------------------------- consistency */

function ConsistencyCard({
  buckets,
  targetDays,
  avgDays,
}: {
  buckets: ReturnType<typeof weeklyBuckets>;
  targetDays: number;
  avgDays: number;
}) {
  const weeks = buckets.map((b) => ({ label: b.label.split(' ')[1] ?? b.label, days: b.days, isCurrent: b.isCurrent }));
  const hit = buckets.filter((b) => !b.isCurrent && b.days >= targetDays).length;
  const trainedWeeks = buckets.filter((b) => !b.isCurrent && b.days > 0).length;

  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="chart-consistency">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Consistency</CardTitle>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <CalendarIcon size={14} />
          target {targetDays}/week
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        One dot per training day.{' '}
        <span className="font-semibold text-success">Green</span> counts toward your target,{' '}
        <span className="font-semibold text-accent">gold</span> is a bonus day.
      </p>
      <div className="mt-3">
        <ConsistencyStrip weeks={weeks} target={targetDays} testId="consistency-strip" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        You hit your target in{' '}
        <span className="font-semibold text-foreground tabular">{hit}</span> of{' '}
        <span className="tabular">{Math.max(1, trainedWeeks)}</span> trained weeks
        {avgDays > 0 && (
          <>
            {' '}
            — <span className="font-semibold text-foreground tabular">{avgDays}</span> days a week on
            average.
          </>
        )}
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------------- muscle-group balance */

function GroupBalanceCard({ buckets }: { buckets: ReturnType<typeof weeklyBuckets> }) {
  const ctx = useVolumeGoalContext();
  const series = React.useMemo(() => groupSeries(buckets, ctx), [buckets, ctx]);
  const any = series.some((s) => s.values.some((v) => v > 0));

  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="chart-group-balance">
      <CardTitle>Muscle groups over time</CardTitle>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Weighted sets per week per group, against that group&rsquo;s weekly goal. A flat low line
        for weeks is a real imbalance, not a bad week.
      </p>
      {any ? (
        <ul className="mt-3 divide-y divide-border">
          {series.map((g) => (
            <li key={g.group} className="flex items-center gap-3 py-2">
              <span className="w-[68px] shrink-0 text-sm font-semibold text-foreground">
                {g.name}
              </span>
              <span className="min-w-0 flex-1">
                <Sparkline
                  data={g.values.length > 1 ? g.values : [0, ...g.values]}
                  width={110}
                  height={26}
                  className="block"
                />
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold tabular text-foreground">
                  {fmtSets(g.lastComplete)}
                  <span className="text-[11px] font-medium text-muted-foreground">/{g.goal}</span>
                </span>
                <span
                  className={`block text-[10px] font-semibold tabular ${
                    g.pct >= 0.85 ? 'text-success' : g.pct >= 0.6 ? 'text-energy' : 'text-muted-foreground'
                  }`}
                >
                  {fmtPct(g.pct)} of goal
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-field bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
          Log a couple of weeks and each group gets its own trend line here.
        </p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- strength trend */

function StrengthCard({ sessions }: { sessions: ReturnType<typeof useWorkoutSessions> }) {
  const trends = React.useMemo(() => strengthTrends(sessions, 5), [sessions]);
  const [idx, setIdx] = React.useState(0);
  const [sel, setSel] = React.useState<number | null>(null);
  const active = trends[Math.min(idx, Math.max(0, trends.length - 1))];

  if (trends.length === 0) {
    return (
      <Card className="shadow-[var(--shadow-card)]" data-testid="chart-strength">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>Strength trend</CardTitle>
          {/* Medal, not trophy — an estimated 1RM IS the record this card is about, and the
              trophy meant three different things across the app before it was retired. */}
          <MedalIcon size={16} />
        </div>
        <p className="mt-2 rounded-field bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
          Log the same exercise across two sessions and its estimated 1RM (Epley:{' '}
          <span className="tabular">weight × (1 + reps ÷ 30)</span>) is plotted here.
        </p>
      </Card>
    );
  }

  const point = sel != null ? active?.points[sel] : null;
  const delta = active ? active.deltaKg : 0;
  const dir: TrendDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="chart-strength">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Strength trend</CardTitle>
        <TrendPill
          direction={dir}
          label={`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} kg`}
          testId="strength-trend"
        />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Best estimated 1RM per session (Epley). Your most-trained lifts first.
      </p>

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {trends.map((t, i) => (
          <Chip
            key={t.exercise_id}
            selected={i === idx}
            onClick={() => {
              setIdx(i);
              setSel(null);
            }}
          >
            {t.exercise_name}
          </Chip>
        ))}
      </div>

      <p className="mt-2 h-5 text-sm font-semibold text-foreground" aria-live="polite">
        {point ? (
          <>
            <span className="text-muted-foreground">{point.label}: </span>
            <span className="tabular">{point.display}</span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {active?.first} kg → {active?.last} kg across {active?.points.length} sessions
          </span>
        )}
      </p>

      {active && (
        <TrendLine
          data={active.points}
          selected={sel}
          onSelect={setSel}
          ariaLabel={`${active.exercise_name} estimated one rep max`}
          testId="strength-chart"
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------------------ body weight */

function BodyWeightCard({
  weights,
  onGoToWeight,
}: {
  weights: ReturnType<typeof useWeights>['weights'];
  onGoToWeight?: () => void;
}) {
  const [sel, setSel] = React.useState<number | null>(null);
  const data: SeriesPoint[] = weights.map((w) => ({
    label: w.date.slice(5),
    value: w.kg,
    display: `${w.kg} kg`,
  }));
  const delta =
    weights.length >= 2
      ? Math.round((weights[weights.length - 1]!.kg - weights[0]!.kg) * 10) / 10
      : 0;
  const dir: TrendDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const point = sel != null ? data[sel] : null;

  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="chart-body-weight">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Body weight</CardTitle>
        {weights.length >= 2 ? (
          <TrendPill
            direction={dir}
            label={`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} kg`}
            testId="body-weight-trend"
          />
        ) : (
          <ScaleIcon size={16} />
        )}
      </div>
      {weights.length >= 2 ? (
        <>
          <p className="mt-2 h-5 text-sm font-semibold text-foreground" aria-live="polite">
            {point ? (
              <>
                <span className="text-muted-foreground">{point.label}: </span>
                <span className="tabular">{point.display}</span>
              </>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                {weights.length} weigh-ins · tap a point for the value
              </span>
            )}
          </p>
          <TrendLine
            data={data}
            selected={sel}
            onSelect={setSel}
            ariaLabel="Body weight trend"
            testId="body-weight-chart"
          />
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {weights.length === 1
              ? `One weigh-in logged (${weights[0]!.kg} kg). Log again to start the trend line.`
              : 'Weigh-ins plot here alongside your training, so you can see load and body weight move together.'}
          </p>
          {onGoToWeight && (
            <Button variant="secondary" block className="mt-3" onClick={onGoToWeight}>
              <ScaleIcon size={18} /> Log a weigh-in
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------- Apple Health (shell) */

/**
 * Nightly sleep and resting-HR series for the last {@link HEALTH_TREND_DAYS} days, one point per
 * day the selector layer has data for. `overnight()` per day is the contracted read path — the
 * selectors are the ONLY way dashboards touch health data — and days without data are simply
 * absent (missing data is silence, never zeroes). Empty everywhere outside the iOS shell.
 */
function useOvernightSeries(): { sleep: SeriesPoint[]; rhr: SeriesPoint[] } {
  // The subscription: a sync batch landing while Progress is open re-derives both series.
  const healthData = useHealthData();
  // Mounted gate: the selectors read device storage and this page is prerendered — the first
  // client render must match the static HTML (no cards), or hydration tears the tab.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return React.useMemo(() => {
    const sleep: SeriesPoint[] = [];
    const rhr: SeriesPoint[] = [];
    if (!mounted) return { sleep, rhr };
    for (let daysAgo = HEALTH_TREND_DAYS - 1; daysAgo >= 0; daysAgo--) {
      const iso = isoDaysAgo(daysAgo);
      const ov = overnight(iso);
      if (!ov) continue;
      const label = iso.slice(5);
      sleep.push({
        label,
        value: Math.round(ov.sleepHours * 100) / 100,
        display: `${sleepHM(ov.sleepHours)} asleep`,
      });
    }
    // RHR comes from its own daily series, NOT via overnight(): that selector is gated on a
    // sleep session, and an RHR-only day (watch worn all day, slept without it) still belongs
    // in the trend.
    for (const p of rhrSeries(HEALTH_TREND_DAYS)) {
      rhr.push({
        label: p.date.slice(5),
        value: Math.round(p.value),
        display: `${Math.round(p.value)} bpm`,
      });
    }
    return { sleep, rhr };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- healthData is the subscription tick
  }, [mounted, healthData]);
}

/** Sleep per night — the existing TrendLine grammar, nothing new. Unrendered under 7 nights. */
function SleepTrendCard({ data }: { data: SeriesPoint[] }) {
  const [sel, setSel] = React.useState<number | null>(null);
  if (data.length < MIN_HEALTH_POINTS) return null;
  const point = sel != null ? data[sel] : null;
  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="chart-sleep">
      <CardTitle>Sleep</CardTitle>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Time asleep per night, from Apple Health. Last {HEALTH_TREND_DAYS} days.
      </p>
      <p className="mt-2 h-5 text-sm font-semibold text-foreground" aria-live="polite">
        {point ? (
          <>
            <span className="text-muted-foreground">{point.label}: </span>
            <span className="tabular">{point.display}</span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {data.length} nights · tap a point for the value
          </span>
        )}
      </p>
      <TrendLine
        data={data}
        selected={sel}
        onSelect={setSel}
        ariaLabel="Sleep per night"
        testId="sleep-chart"
      />
    </Card>
  );
}

/** Resting HR per day — same grammar. Lower is calmer; the chart says nothing, on purpose. */
function RestingHrTrendCard({ data }: { data: SeriesPoint[] }) {
  const [sel, setSel] = React.useState<number | null>(null);
  if (data.length < MIN_HEALTH_POINTS) return null;
  const point = sel != null ? data[sel] : null;
  return (
    <Card className="shadow-[var(--shadow-card)]" data-testid="chart-resting-hr">
      <CardTitle>Resting heart rate</CardTitle>
      <p className="mt-0.5 text-xs text-muted-foreground">
        One reading per day, from Apple Health. Day-to-day wobble is normal — the shape over weeks
        is the signal.
      </p>
      <p className="mt-2 h-5 text-sm font-semibold text-foreground" aria-live="polite">
        {point ? (
          <>
            <span className="text-muted-foreground">{point.label}: </span>
            <span className="tabular">{point.display}</span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {data.length} days · tap a point for the value
          </span>
        )}
      </p>
      <TrendLine
        data={data}
        selected={sel}
        onSelect={setSel}
        ariaLabel="Resting heart rate per day"
        testId="resting-hr-chart"
      />
    </Card>
  );
}
