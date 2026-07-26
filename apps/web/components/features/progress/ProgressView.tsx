'use client';

/**
 * Progress (§2.3): the training-analytics surface — a "% of weekly goal" heat map of the body, a
 * Trends tab of real time-series, plus weight, measurements, PRs and photos.
 *
 * A fresh Local Mode user starts empty and NOTHING is fabricated: the heat map falls back to the
 * ACTIVE ROUTINE's planned week (clearly labelled "planned"), and Trends shows an honest empty
 * state describing what appears when. Weight logging persists to the demo store (localStorage).
 * INTEGRATION: photos wire to supabase.storage.from('progress-photos'); PRs derive from set_logs.
 */
import * as React from 'react';
import { Button, Card, CardTitle, Chip, Sheet } from '@/components/ui';
import { LineChart } from '@/components/features/progress/charts';
import { TrendsTab } from '@/components/features/progress/TrendsTab';
import { ScaleIcon, TrendingUpIcon, PlusIcon, TargetIcon, TrophyIcon } from '@/components/ui/icons';
import { useActiveRoutine, useWeights } from '@/lib/demo/useDemo';
import {
  useWorkoutSessions,
  setsPerMuscleLast7Days,
  computePRs,
} from '@/components/features/shared/workoutLog';
import { MuscleGoalHeat, useVolumeGoalContext } from '@/components/features/shared/MuscleVolume';
import { buildGoalRows, fmtPct, fmtSets } from '@/components/features/shared/volumeMath';
import { plannedWeeklySets } from '@/components/features/progress/analytics';
import {
  mockExerciseBySlug,
  type ProgressPhoto,
  type PhotoPose,
} from '@/components/features/_mock/data';

type Tab = 'trends' | 'weight' | 'measurements' | 'prs' | 'photos';
const TABS: { id: Tab; label: string }[] = [
  { id: 'trends', label: 'Trends' },
  { id: 'weight', label: 'Weight' },
  { id: 'measurements', label: 'Measurements' },
  { id: 'prs', label: 'PRs' },
  { id: 'photos', label: 'Photos' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 border-2 border-dashed border-border py-9 text-center shadow-none">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-muted text-accent">
        {icon}
      </span>
      <CardTitle>{title}</CardTitle>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </Card>
  );
}

export function ProgressView() {
  const [tab, setTab] = React.useState<Tab>('trends');
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">Progress</h1>
      <WeeklyGoalHeatmap />
      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="progress-tabs">
        {TABS.map((t) => (
          <Chip
            key={t.id}
            selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`progress-tab-${t.id}`}
          >
            {t.label}
          </Chip>
        ))}
      </div>
      {tab === 'trends' && <TrendsTab onGoToWeight={() => setTab('weight')} />}
      {tab === 'weight' && <WeightTab />}
      {tab === 'measurements' && <MeasurementsTab />}
      {tab === 'prs' && <PrTab />}
      {tab === 'photos' && <PhotosTab />}
    </div>
  );
}

/**
 * THE SIGNATURE VIEW — "my body as a dashboard", now measured against a goal.
 *
 * Each muscle is filled with its position on a CONTINUOUS yellow → orange → red ramp, where the
 * axis is **% of that muscle's personalised weekly set goal** (see `volumeMath.ts`), not a raw
 * count. 50 % reads yellow, 100 % orange, 130 %+ red — so "am I doing enough here?" is answerable
 * without reading a single number, and tapping a muscle gives the numbers anyway.
 *
 * Source switch: LOGGED (last 7 days of real sets) or PLANNED (what the active routine prescribes
 * for a week). A brand-new user with no history defaults to PLANNED and is told so explicitly —
 * the view is never blank and never pretends planned volume is completed volume.
 */
function WeeklyGoalHeatmap() {
  const sessions = useWorkoutSessions();
  const routine = useActiveRoutine();
  const ctx = useVolumeGoalContext();

  const loggedSets = React.useMemo(() => setsPerMuscleLast7Days(sessions), [sessions]);
  const hasLogged = Object.keys(loggedSets).length > 0;

  const plannedSets = React.useMemo(
    () =>
      plannedWeeklySets(
        routine.days.flatMap((d) => d.exercises.map((e) => ({ slug: e.exercise_slug, sets: e.sets }))),
        (slug) => mockExerciseBySlug(slug),
      ),
    [routine],
  );

  const [source, setSource] = React.useState<'logged' | 'planned'>('logged');
  const showPlanned = !hasLogged || source === 'planned';
  const rows = React.useMemo(
    () => buildGoalRows(showPlanned ? plannedSets : loggedSets, ctx),
    [showPlanned, plannedSets, loggedSets, ctx],
  );

  const trained = rows.filter((r) => r.sets > 0);
  const totalSets = Math.round(trained.reduce((n, r) => n + r.sets, 0));
  const onTarget = trained.filter((r) => r.pct >= 0.85).length;
  const avgPct =
    trained.length > 0 ? trained.reduce((n, r) => n + Math.min(1.5, r.pct), 0) / trained.length : 0;

  return (
    <Card premium data-testid="weekly-goal-heatmap">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Weekly volume vs goal</CardTitle>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {showPlanned ? 'planned week' : 'last 7 days'}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {showPlanned && !hasLogged ? (
          <>
            No sets logged yet, so this is what{' '}
            <span className="font-semibold text-foreground">{routine.name}</span> plans for a full
            week — {fmtSets(totalSets)} weighted sets. Finish a workout and it switches to what you
            actually did.
          </>
        ) : showPlanned ? (
          <>
            What <span className="font-semibold text-foreground">{routine.name}</span> prescribes in
            a full week: <span className="font-semibold text-foreground tabular">{fmtSets(totalSets)}</span>{' '}
            weighted sets, {onTarget} of {trained.length} muscles at or above goal.
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground tabular">{fmtSets(totalSets)}</span>{' '}
            weighted sets across{' '}
            <span className="font-semibold text-foreground tabular">{trained.length}</span> muscles —{' '}
            <span className="font-semibold text-foreground tabular">{onTarget}</span> at or above
            goal, averaging <span className="tabular">{fmtPct(avgPct)}</span> of goal.
          </>
        )}
      </p>

      <div className="mt-3">
        <MuscleGoalHeat
          rows={rows}
          height={214}
          bare
          header={
            hasLogged ? (
              <div
                role="tablist"
                aria-label="Volume source"
                className="mb-3 grid grid-cols-2 gap-1 rounded-field bg-surface p-1"
              >
                <SourceTab
                  active={source === 'logged'}
                  onClick={() => setSource('logged')}
                  testId="heat-source-logged"
                >
                  Last 7 days
                </SourceTab>
                <SourceTab
                  active={source === 'planned'}
                  onClick={() => setSource('planned')}
                  testId="heat-source-planned"
                >
                  Planned week
                </SourceTab>
              </div>
            ) : null
          }
        />
      </div>
    </Card>
  );
}

function SourceTab({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      className={
        'rounded-field py-1.5 text-center text-xs font-semibold transition-colors ' +
        (active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}

function WeightTab() {
  const { weights, logWeight } = useWeights();
  const [open, setOpen] = React.useState(false);

  if (weights.length === 0) {
    return (
      <>
        <EmptyState
          icon={<ScaleIcon size={26} />}
          title="Track your body weight"
          body="Log your weight to build a trend line and see progress toward your goal over time."
          action={
            <Button className="mt-1" onClick={() => setOpen(true)}>
              <PlusIcon size={18} /> Log your first weigh-in
            </Button>
          }
        />
        <WeightSheet open={open} onClose={() => setOpen(false)} onSave={(kg) => logWeight(todayISO(), kg)} />
      </>
    );
  }

  const data = weights.map((w) => ({ label: w.date.slice(5), value: w.kg }));
  const firstKg = weights[0]!.kg;
  const lastKg = weights[weights.length - 1]!.kg;
  const delta = +(lastKg - firstKg).toFixed(1);
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <div className="mb-2 flex items-baseline justify-between">
        <CardTitle>Body weight</CardTitle>
        {weights.length > 1 && (
          <span className={'text-sm font-semibold ' + (delta <= 0 ? 'text-success' : 'text-muted-foreground')}>
            {delta > 0 ? '+' : ''}
            {delta} kg · {weights.length} entries
          </span>
        )}
      </div>
      {weights.length > 1 ? (
        <LineChart data={data} unit="kg" height={200} />
      ) : (
        <p className="rounded-2xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
          First entry logged: <span className="font-semibold text-foreground">{firstKg} kg</span>. Log
          again tomorrow to start your trend line.
        </p>
      )}
      <Button variant="secondary" block className="mt-4" onClick={() => setOpen(true)}>
        <PlusIcon size={18} /> Log today&rsquo;s weight
      </Button>
      <WeightSheet open={open} onClose={() => setOpen(false)} onSave={(kg) => logWeight(todayISO(), kg)} />
    </Card>
  );
}

function WeightSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (kg: number) => void;
}) {
  const [kg, setKg] = React.useState('');
  const val = Number(kg);
  const valid = kg.trim() !== '' && val > 0 && val < 500;
  return (
    <Sheet open={open} onClose={onClose} title="Log weight">
      <div className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weight (kg)
          </span>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={kg}
            placeholder="e.g. 78.5"
            onChange={(e) => setKg(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-lg tabular-nums outline-none focus:border-accent"
          />
        </label>
        <Button
          block
          size="lg"
          disabled={!valid}
          onClick={() => {
            onSave(val);
            setKg('');
            onClose();
          }}
        >
          Save weigh-in
        </Button>
      </div>
    </Sheet>
  );
}

function MeasurementsTab() {
  return (
    <EmptyState
      icon={<TargetIcon size={26} />}
      title="No measurements yet"
      body="Track chest, waist, arms and more to see how your body composition changes — not just the scale."
      action={
        <Button variant="secondary" className="mt-1" disabled>
          Coming soon
        </Button>
      }
    />
  );
}

function PrTab() {
  const sessions = useWorkoutSessions();
  const prs = React.useMemo(() => computePRs(sessions), [sessions]);

  if (prs.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUpIcon size={26} />}
        title="No personal records yet"
        body="Finish a logged workout and your best sets — plus an estimated 1-rep max (Epley) — show up here automatically."
      />
    );
  }

  return (
    <Card className="!p-0 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-accent">
        <TrophyIcon size={18} />
        <CardTitle>Personal records</CardTitle>
      </div>
      <ul>
        {prs.map((p, i) => (
          <li
            key={p.exercise_id}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="truncate text-sm font-semibold text-foreground">
                {p.exercise_name}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-display text-base font-bold tabular-nums text-accent">
                {Math.round(p.best_e1rm)} kg
              </span>
              <span className="block text-[11px] tabular-nums text-muted-foreground">
                {p.best_weight_kg}kg × {p.best_reps} · e1RM
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PhotosTab() {
  const [photos, setPhotos] = React.useState<ProgressPhoto[]>([]);
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const byDate = React.useMemo(() => {
    const map = new Map<string, ProgressPhoto[]>();
    for (const p of photos) {
      const arr = map.get(p.taken_on) ?? [];
      arr.push(p);
      map.set(p.taken_on, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [photos]);

  return (
    <div className="space-y-4">
      {photos.length === 0 ? (
        <EmptyState
          icon={<PlusIcon size={26} />}
          title="No progress photos yet"
          body="Add front, side and back photos over time to see visual change. Photos stay on your device in demo mode."
          action={
            <Button className="mt-1" onClick={() => setUploadOpen(true)}>
              <PlusIcon size={18} /> Add a photo
            </Button>
          }
        />
      ) : (
        <Button block onClick={() => setUploadOpen(true)}>
          <PlusIcon size={18} /> Add progress photo
        </Button>
      )}
      {byDate.map(([date, group]) => (
        <div key={date}>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">{date}</p>
          <div className="grid grid-cols-3 gap-2">
            {group.map((p) => (
              <figure
                key={p.id}
                className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted"
              >
                <div className="grid h-full w-full place-items-center text-muted-foreground/40">
                  <ScaleIcon size={28} />
                </div>
                <figcaption className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium capitalize text-white">
                  {p.pose}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}

      <Sheet open={uploadOpen} onClose={() => setUploadOpen(false)} title="Add progress photo">
        <UploadForm
          onAdd={(pose) => {
            setPhotos((prev) => [
              {
                id: `p-new-${prev.length}`,
                taken_on: todayISO(),
                pose,
                storage_path: `mock/${pose}-new.jpg`,
              },
              ...prev,
            ]);
            setUploadOpen(false);
          }}
        />
      </Sheet>
    </div>
  );
}

function UploadForm({ onAdd }: { onAdd: (pose: PhotoPose) => void }) {
  const [pose, setPose] = React.useState<PhotoPose>('front');
  const poses: PhotoPose[] = ['front', 'side', 'back'];
  return (
    <div className="space-y-4">
      <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
        Tap to choose a photo (demo)
      </div>
      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pose
        </span>
        <div className="flex gap-2">
          {poses.map((p) => (
            <Chip key={p} selected={pose === p} onClick={() => setPose(p)}>
              <span className="capitalize">{p}</span>
            </Chip>
          ))}
        </div>
      </div>
      <Button block size="lg" onClick={() => onAdd(pose)}>
        Save photo
      </Button>
    </div>
  );
}
