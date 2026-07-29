'use client';

/**
 * MORNING CHECK-IN — the dynamic-split mode's front door (PREWALK-IOS-HEALTH phase 3).
 *
 * Thirty seconds of taps (sleep, soreness, energy, stress, an "under the weather?" toggle) run
 * through the transparent rules engine (`lib/readiness/engine`), and on a clearly-bad day the
 * card offers ONE edit to today's session — half the sets, a light technique day, or rest — with
 * a plain-language why, always accept/reject and never silent. Accepting hands a REAL RoutineDay
 * to `setQuickSession`, so the player, volume math and logging treat it like any planned day.
 *
 * THE AI PATH lives in the same sheet: describe the morning in your own words and the coach
 * worker's `adapt` task answers with a STRUCTURED, validated recommendation over the app's own
 * entities (it may swap an exercise only for a substitution the app itself would offer) — which
 * is what makes the reply one-click applyable rather than advice. HealthKit later replaces the
 * sliders, not this flow.
 *
 * Everything is logged to `fitforge.readiness.v1` (device-local by design — see the sync
 * denylist), including rejections: a pile of "no thanks" is the recalibration signal.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardTitle, Chip, Sheet } from '@/components/ui';
import { BoltIcon, CheckIcon, CoachIcon, SparkleIcon } from '@/components/ui/icons';
import { m, AnimatePresence, SPRING, haptic } from '@/components/ui/motion';
import type { Routine, RoutineDay } from '@/components/features/_mock/data';
import { setQuickSession } from '@/lib/demo/store';
import {
  assessReadiness,
  type AdaptAction,
  type CheckIn,
  type ReadinessVerdict,
} from '@/lib/readiness/engine';
import { buildAdaptedDay, type AdaptSwap } from '@/lib/readiness/dayEdits';
import { buildAdaptContext, resolveSwaps } from '@/lib/readiness/context';
import {
  entryForDate,
  recordDecision,
  saveEntry,
  todayISO,
  useReadinessEntries,
} from '@/lib/readiness/store';
import { askAdapt, isCoachConfigured } from '@/lib/kb/client';

const SLEEP_CHOICES = [
  { label: '< 5h', hours: 4.5 },
  { label: '5–6h', hours: 6 },
  { label: '7h', hours: 7 },
  { label: '8h', hours: 8 },
  { label: '9h+', hours: 9 },
];

const SCALE_LABELS: Record<'soreness' | 'energy' | 'stress', [string, string]> = {
  soreness: ['Fresh', 'Wrecked'],
  energy: ['Flat', 'Charged'],
  stress: ['Calm', 'Maxed'],
};

const ACTION_LABEL: Record<AdaptAction, string> = {
  proceed: 'Train as planned',
  reduce: 'Half the sets today',
  technique: 'Light technique day',
  rest: 'Take a rest day',
};

const BAND_COLOR: Record<ReadinessVerdict['band'], string> = {
  green: 'var(--color-success)',
  yellow: 'var(--color-energy)',
  red: 'var(--color-danger)',
};

export function MorningCheckIn({ routine, day }: { routine: Routine; day: RoutineDay }) {
  const router = useRouter();
  const entries = useReadinessEntries();
  const today = todayISO();
  const entry = entries.find((e) => e.date === today);
  const [open, setOpen] = React.useState(false);

  /* draft check-in state */
  const [sleepHours, setSleepHours] = React.useState<number | null>(null);
  const [soreness, setSoreness] = React.useState<CheckIn['soreness']>(2);
  const [energy, setEnergy] = React.useState<CheckIn['energy']>(4);
  const [stress, setStress] = React.useState<CheckIn['stress']>(2);
  const [unwell, setUnwell] = React.useState(false);
  const [verdict, setVerdict] = React.useState<ReadinessVerdict | null>(null);

  /* the AI path */
  const aiAvailable = isCoachConfigured();
  const [feeling, setFeeling] = React.useState('');
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [aiOffer, setAiOffer] = React.useState<{
    action: AdaptAction;
    reason: string;
    swaps: AdaptSwap[];
  } | null>(null);

  const checkIn = (): CheckIn => ({
    date: today,
    sleepHours,
    soreness,
    energy,
    stress,
    unwell,
    note: feeling.trim() || undefined,
  });

  function submit() {
    const c = checkIn();
    const v = assessReadiness(c);
    setVerdict(v);
    setAiOffer(null);
    saveEntry({
      date: today,
      checkIn: c,
      verdict: v,
      offered: v.action,
      source: 'rules',
      decision: v.action === 'proceed' ? 'accepted' : null,
    });
    haptic();
  }

  /** ONE CLICK from recommendation to a startable session — the whole point of the feature. */
  function accept(action: AdaptAction, swaps: AdaptSwap[] = []) {
    recordDecision(today, 'accepted');
    const adapted = buildAdaptedDay(day, action, swaps);
    haptic('confirm');
    setOpen(false);
    if (adapted) {
      setQuickSession(adapted);
      router.push('/workout/quick');
    }
  }

  function reject() {
    recordDecision(today, 'rejected');
    setOpen(false);
  }

  async function askAi() {
    const c = checkIn();
    setAiBusy(true);
    setAiError(null);
    const ctx = buildAdaptContext(routine, day, c);
    const r = await askAdapt(feeling, ctx);
    setAiBusy(false);
    if (r.status !== 'ok') {
      setAiError(
        r.status === 'timeout'
          ? 'The trainer took too long — try again, or use the quick check-in above.'
          : 'The trainer is unreachable right now — the quick check-in above works offline.',
      );
      return;
    }
    const swaps = resolveSwaps(ctx, r.result.swaps);
    setAiOffer({ action: r.result.action, reason: r.result.reason, swaps });
    setVerdict(null);
    saveEntry({
      date: today,
      checkIn: c,
      verdict: assessReadiness(c),
      offered: r.result.action,
      source: 'ai',
      decision: null,
    });
  }

  /* ─── the card on Today ─── */

  if (entry && !open) {
    const acted = entry.decision === 'accepted' && entry.offered !== 'proceed';
    return (
      <Card className="!py-3 shadow-[var(--shadow-card)]" data-testid="morning-checkin">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: BAND_COLOR[entry.verdict.band] }}
          />
          <p className="min-w-0 flex-1 text-sm text-foreground" data-testid="checkin-summary">
            <span className="font-semibold">Readiness {entry.verdict.score}</span>
            <span className="text-muted-foreground">
              {' '}
              · {ACTION_LABEL[entry.offered].toLowerCase()}
              {entry.decision === 'rejected' && ' — kept the plan'}
              {acted && ' — accepted'}
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setVerdict(null);
              setAiOffer(null);
              setOpen(true);
            }}
            data-testid="checkin-redo"
            className="shrink-0 text-xs font-semibold text-accent"
          >
            Redo
          </button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-[var(--shadow-card)]" data-testid="morning-checkin">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-muted text-accent">
            <SparkleIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle>Morning check-in</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Thirty seconds — and today&rsquo;s plan adapts to how you actually slept.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          block
          className="mt-3"
          data-testid="checkin-open"
          onClick={() => setOpen(true)}
        >
          <BoltIcon size={18} /> Check in
        </Button>
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="How are you feeling?">
        {!verdict && !aiOffer && (
          <div className="space-y-4">
            <ChoiceRow label="Sleep last night">
              {SLEEP_CHOICES.map((s) => (
                <Chip
                  key={s.label}
                  selected={sleepHours === s.hours}
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => setSleepHours(sleepHours === s.hours ? null : s.hours)}
                >
                  {s.label}
                </Chip>
              ))}
            </ChoiceRow>
            <ScaleRow label="Soreness" value={soreness} onChange={(v) => setSoreness(v)} kind="soreness" testId="checkin-soreness" />
            <ScaleRow label="Energy" value={energy} onChange={(v) => setEnergy(v)} kind="energy" testId="checkin-energy" />
            <ScaleRow label="Stress" value={stress} onChange={(v) => setStress(v)} kind="stress" testId="checkin-stress" />
            <Chip selected={unwell} onClick={() => setUnwell(!unwell)} data-testid="checkin-unwell">
              Feeling under the weather
            </Chip>

            <Button block data-testid="checkin-submit" onClick={submit}>
              See my readiness
            </Button>

            {aiAvailable && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CoachIcon size={16} className="text-accent" /> Or tell your AI trainer in your own
                  words
                </p>
                <textarea
                  value={feeling}
                  onChange={(e) => setFeeling(e.target.value)}
                  placeholder="e.g. slept badly, shoulder’s achy from yesterday, and the gym’s packed…"
                  rows={3}
                  data-testid="adapt-feeling"
                  className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base text-foreground outline-none focus:ring-2 focus:ring-accent"
                />
                {aiError && (
                  <p className="mt-1 text-xs text-danger" data-testid="adapt-error">
                    {aiError}
                  </p>
                )}
                <Button
                  variant="secondary"
                  block
                  className="mt-2"
                  disabled={aiBusy || feeling.trim().length === 0}
                  data-testid="adapt-ask-ai"
                  onClick={() => void askAi()}
                >
                  {aiBusy ? 'Thinking…' : 'Ask the AI trainer'}
                </Button>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  It knows your split, today&rsquo;s exercises and their alternatives — the answer
                  comes back as a one-tap change to your plan, never a silent edit.
                </p>
              </div>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {verdict && (
            <m.div
              key="verdict"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING.panel}
              data-testid="readiness-verdict"
            >
              <OfferPanel
                headline={`Readiness ${verdict.score}`}
                color={BAND_COLOR[verdict.band]}
                action={verdict.action}
                reason={verdict.reason}
                safety={verdict.safety}
                onAccept={() => accept(verdict.action)}
                onReject={reject}
              />
            </m.div>
          )}
          {aiOffer && (
            <m.div
              key="ai-offer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING.panel}
              data-testid="adapt-ai-offer"
            >
              <OfferPanel
                headline="Your trainer’s call"
                color="var(--color-accent)"
                action={aiOffer.action}
                reason={aiOffer.reason}
                safety={aiOffer.action === 'rest' && unwell}
                swaps={aiOffer.swaps}
                onAccept={() => accept(aiOffer.action, aiOffer.swaps)}
                onReject={reject}
              />
            </m.div>
          )}
        </AnimatePresence>
      </Sheet>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── pieces ── */

function ChoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ScaleRow({
  label,
  value,
  onChange,
  kind,
  testId,
}: {
  label: string;
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
  kind: 'soreness' | 'energy' | 'stress';
  testId: string;
}) {
  const [lo, hi] = SCALE_LABELS[kind];
  return (
    <div data-testid={testId}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">
          {lo} → {hi}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={label}>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label} ${n} of 5`}
            onClick={() => onChange(n)}
            className={`h-10 rounded-field border text-sm font-semibold transition-colors ${
              value === n
                ? 'border-accent bg-accent-muted text-accent'
                : 'border-border bg-surface-2 text-muted-foreground'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One recommendation, one why, two buttons. Shared by the rules verdict and the AI offer. */
function OfferPanel({
  headline,
  color,
  action,
  reason,
  safety,
  swaps = [],
  onAccept,
  onReject,
}: {
  headline: string;
  color: string;
  action: AdaptAction;
  reason: string;
  safety: boolean;
  swaps?: AdaptSwap[];
  onAccept: () => void;
  onReject: () => void;
}) {
  const proceed = action === 'proceed' && swaps.length === 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <p className="font-display text-lg font-bold text-foreground">{headline}</p>
      </div>
      <div className="rounded-field border border-border bg-surface p-3">
        <p className="text-sm font-semibold text-foreground" data-testid="offer-action">
          {ACTION_LABEL[action]}
          {swaps.length > 0 && ' · with swaps'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="offer-reason">
          {reason}
        </p>
        {swaps.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground" data-testid="offer-swaps">
            {swaps.map((s) => (
              <li key={s.from_slug}>
                <span className="font-semibold text-foreground">{s.from_slug}</span> →{' '}
                <span className="font-semibold text-accent">{s.to_name}</span>
              </li>
            ))}
          </ul>
        )}
        {safety && (
          <p className="mt-2 text-xs font-medium text-danger" data-testid="offer-safety">
            This can look like the start of getting sick — if it lasts more than a day or two, check
            in with a doctor.
          </p>
        )}
      </div>
      {proceed ? (
        <Button block data-testid="adapt-accept" onClick={onAccept}>
          <CheckIcon size={18} /> Nice — train as planned
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button block data-testid="adapt-accept" onClick={onAccept}>
            {action === 'rest' ? 'Accept the rest day' : `Start: ${ACTION_LABEL[action].toLowerCase()}`}
          </Button>
          <Button variant="ghost" block data-testid="adapt-reject" onClick={onReject}>
            No thanks — keep the plan
          </Button>
        </div>
      )}
    </div>
  );
}
