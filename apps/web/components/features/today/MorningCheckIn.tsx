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
import { adviceFor, type AdviceLine } from '@/lib/readiness/advice';
import {
  patchEntry,
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
    advice: AdviceLine[];
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
      advice: adviceFor(c, v),
      offeredReason: v.reason,
    });
    haptic();
  }

  /**
   * ONE CLICK from recommendation to a startable session — and the accepted day is PERSISTED on
   * the entry, so exiting the player never costs a re-done questionnaire: Today keeps showing
   * the adapted session with its own re-enter button until the day ends.
   */
  function accept(action: AdaptAction, swaps: AdaptSwap[] = []) {
    const adapted = buildAdaptedDay(day, action, swaps);
    patchEntry(today, { decision: 'accepted', adaptedDay: adapted });
    haptic('confirm');
    setOpen(false);
    if (adapted) {
      setQuickSession(adapted);
      router.push('/workout/quick');
    }
  }

  /** Re-stage the persisted adapted day — the "I exited, let me back in" path. */
  function reenter(adapted: RoutineDay) {
    setQuickSession(adapted);
    haptic('confirm');
    router.push('/workout/quick');
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
    // The AI's advice wins (it can read "hungover" in free text); the rules advice is the floor.
    const fallback = adviceFor(c, assessReadiness(c));
    const advice: AdviceLine[] = [];
    if (r.result.advice?.nutrition) advice.push({ kind: 'nutrition', text: r.result.advice.nutrition });
    if (r.result.advice?.recovery) advice.push({ kind: 'recovery', text: r.result.advice.recovery });
    const finalAdvice = advice.length > 0 ? advice : fallback;
    setAiOffer({ action: r.result.action, reason: r.result.reason, swaps, advice: finalAdvice });
    setVerdict(null);
    saveEntry({
      date: today,
      checkIn: c,
      verdict: assessReadiness(c),
      offered: r.result.action,
      source: 'ai',
      decision: null,
      advice: finalAdvice,
      offeredReason: r.result.reason,
    });
  }

  /* ─── the card on Today ─── */

  const redoButton = (
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
  );

  if (entry && !open) {
    /**
     * AN ACCEPTED ADAPTED SESSION STAYS ON TODAY, in full. Exiting the player must never cost a
     * re-done questionnaire — the card shows the whole adapted split (every exercise, its sets)
     * and re-stages it in one tap, for as long as the day lasts. The standard workout card below
     * remains untouched, so "actually, give me the normal session" is always one scroll away.
     */
    if (entry.decision === 'accepted' && entry.adaptedDay) {
      const adapted = entry.adaptedDay;
      return (
        <Card className="shadow-[var(--shadow-card)]" data-testid="morning-checkin">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: BAND_COLOR[entry.verdict.band] }}
              />
              <div className="min-w-0">
                <CardTitle data-testid="adapted-session-title">{adapted.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground" data-testid="checkin-summary">
                  Readiness {entry.verdict.score} · your adapted session for today
                </p>
              </div>
            </div>
            {redoButton}
          </div>
          <ul className="mt-3 space-y-1" data-testid="adapted-session-exercises">
            {adapted.exercises.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-foreground">
                  {e.exercise_name}
                </span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">
                  {e.sets} × {e.rep_min}–{e.rep_max}
                  {e.target_rpe != null && ` · RPE ${e.target_rpe}`}
                </span>
              </li>
            ))}
          </ul>
          {entry.advice && entry.advice.length > 0 && <AdviceList lines={entry.advice} compact />}
          <Button
            block
            className="mt-3"
            data-testid="adapted-session-enter"
            onClick={() => reenter(adapted)}
          >
            <BoltIcon size={18} /> Enter this session
          </Button>
        </Card>
      );
    }

    /** An accepted REST day also keeps its card — the advice is the day's plan. */
    if (entry.decision === 'accepted' && entry.offered === 'rest') {
      return (
        <Card className="shadow-[var(--shadow-card)]" data-testid="morning-checkin">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: BAND_COLOR[entry.verdict.band] }}
              />
              <div className="min-w-0">
                <CardTitle>Rest day, on purpose</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground" data-testid="checkin-summary">
                  Readiness {entry.verdict.score} · recovery is the session today
                </p>
              </div>
            </div>
            {redoButton}
          </div>
          {entry.advice && entry.advice.length > 0 && <AdviceList lines={entry.advice} compact />}
        </Card>
      );
    }

    /**
     * The answered state is still A VERDICT, not a scoreboard. The score alone ("Readiness 82")
     * tells the athlete nothing about what the coach concluded — the owner called that out — so
     * the card keeps the WHY in the voice that offered it, and the rest-of-day advice under it.
     */
    const acted = entry.decision === 'accepted' && entry.offered !== 'proceed';
    return (
      <Card className="shadow-[var(--shadow-card)]" data-testid="morning-checkin">
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
          {redoButton}
        </div>
        <p
          className="mt-2 text-sm leading-snug text-muted-foreground"
          data-testid="checkin-reason"
        >
          {entry.offeredReason ?? entry.verdict.reason}
        </p>
        {entry.advice && entry.advice.length > 0 && <AdviceList lines={entry.advice} compact />}
      </Card>
    );
  }

  return (
    <>
      {/* A ROW, not a card. The prompt sits directly under the workout anchor and exists to be
          answered once — the finish review named Today's uniform card stack, and an unanswered
          question does not outrank the work. The answered states keep their own shapes. */}
      <div
        className="flex items-center gap-3 border-y border-border py-3"
        data-testid="morning-checkin"
      >
        <SparkleIcon size={18} className="shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Morning check-in</p>
          <p className="text-xs text-muted-foreground">
            Thirty seconds — today&rsquo;s plan adapts to how you slept.
          </p>
        </div>
        {/* md, not sm: a first-run primary action — the ≥44px target floor applies to it. */}
        <Button
          variant="secondary"
          className="shrink-0"
          data-testid="checkin-open"
          onClick={() => setOpen(true)}
        >
          Check in
        </Button>
      </div>

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
                advice={adviceFor(checkIn(), verdict)}
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
                advice={aiOffer.advice}
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

const ADVICE_LABEL: Record<AdviceLine['kind'], string> = {
  nutrition: 'Fuel',
  hydration: 'Drink',
  sleep: 'Sleep',
  recovery: 'Recover',
};

/**
 * The holistic half of the recommendation: what to eat, drink and do with the REST of the day.
 * Renders under every verdict and again on the persisted Today card, because "half the sets"
 * without "front-load carbs and get to bed early" is half a coach.
 */
function AdviceList({ lines, compact = false }: { lines: AdviceLine[]; compact?: boolean }) {
  return (
    <div className={compact ? 'mt-3 border-t border-border pt-3' : 'mt-1'} data-testid="day-advice">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        For the rest of your day
      </p>
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 shrink-0 rounded-chip bg-accent-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
              {ADVICE_LABEL[l.kind] ?? 'Tip'}
            </span>
            <span className="min-w-0 text-muted-foreground">{l.text}</span>
          </li>
        ))}
      </ul>
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
  advice = [],
  onAccept,
  onReject,
}: {
  headline: string;
  color: string;
  action: AdaptAction;
  reason: string;
  safety: boolean;
  swaps?: AdaptSwap[];
  advice?: AdviceLine[];
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
        {advice.length > 0 && <AdviceList lines={advice} />}
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
