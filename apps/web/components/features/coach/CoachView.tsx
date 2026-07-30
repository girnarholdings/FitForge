'use client';

/**
 * COACH — the knowledge-base wiki + ask surface.
 *
 * Two modes on one screen:
 *  · ASK    — type a question. Retrieval runs entirely offline (lib/kb) and the §1.3 thresholds
 *             decide between an instant curated answer, a "did you mean…?" disambiguation, or a
 *             personalized AI answer grounded on the top 3 entries.
 *  · BROWSE — every curated entry by category, searchable and expandable, for users who would
 *             rather read than type.
 *
 * HONESTY RULES this component enforces:
 *  · Every answer carries its provenance badge — curated guide vs AI.
 *  · The best KB match is rendered IMMEDIATELY while an AI call is in flight, so the screen is
 *    never empty and a failed/slow call costs the user nothing.
 *  · With no `NEXT_PUBLIC_AI_ENDPOINT` configured (the default in this repo), questions that
 *    would route to the AI say so plainly and fall back to the closest curated entries. The UI
 *    never implies an AI answered when none did.
 *
 * SAFETY RULE, which outranks all of the above:
 *  · A question that reports pain, injury or a medical situation gets the SAFETY CARD as its
 *    primary response — never a curated entry, never a model answer, whether or not an AI
 *    endpoint is configured. `routeQuery` refuses to resolve such a query to `answer`, and this
 *    component never issues a network call for one. Related entries are offered underneath, below
 *    a rule, labelled as general information.
 */
import * as React from 'react';
import { Button, Card } from '@/components/ui';
import {
  SearchIcon,
  SendIcon,
  SparkleIcon,
  CoachIcon,
} from '@/components/ui/icons';
import { KB_ENTRIES, entryById, routeQuery, searchKb } from '@/lib/kb';
import { buildHistory } from '@/lib/coach/history';
import type { KbRoutePlus } from '@/lib/kb/route';
import {
  askCoach,
  fetchCoachStatus,
  isCoachConfigured,
  snippetsFromHits,
  type CoachStatus,
} from '@/lib/kb/client';
import { ModelPicker, useHasLockedModels } from '@/components/features/shared/ModelPicker';
import { MembersModelHint } from '@/components/auth/GoogleAuth';
import { MealSuggestionCard, wantsMealSuggestion } from './MealSuggestionCard';
import { useNutritionTargets, useLogsForDate } from '@/lib/demo/useDemo';
import { useSelectedDate } from '@/lib/demo/selectedDate';
import { profileFacts, useCoachProfile } from '@/lib/kb/profile';
import type { CoachProfile, KbEntry, KbHit } from '@/lib/kb/types';
import { AnswerCard } from './AnswerCard';
import { BrowseKb } from './BrowseKb';
import { SafetyCard } from './SafetyCard';

type Mode = 'ask' | 'browse';

type AiState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'answer'; text: string }
  | { kind: 'meal' }
  | { kind: 'unavailable'; headline: string; detail: string };

interface Turn {
  id: string;
  question: string;
  /** `null` for turns the app answered itself (meal suggestions) — there is no KB route to record. */
  route: KbRoutePlus | null;
  ai: AiState;
  facts: string[];
  /**
   * THE AI IS THE ANSWER, not a footnote to one.
   *
   * With a Coach service configured, a curated entry is grounding for the model — not a second
   * answer to read first. When this is set the guide answer stays hidden while the model is
   * working and is revealed only if the model fails, which is exactly the fallback it was always
   * meant to be. On an unconfigured build it is never set, so that behaviour is unchanged.
   */
  aiPrimary: boolean;
}

/** Total curated entries — read from the shipped KB so the copy can never drift from the data. */
const ENTRY_COUNT = KB_ENTRIES.length;

/** Cheap "this isn't English" tell, used only to add a hint to the no-match card. */
const NON_ASCII = /[^\x00-\x7F]/;

const SUGGESTIONS = [
  'How much protein do I need?',
  'How many days a week should I train?',
  'What is progressive overload?',
  'Will lifting make me bulky?',
  'How much cardio should I do?',
  'Why am I not losing weight?',
];

let turnSeq = 0;

function followupEntries(entry: KbEntry): KbEntry[] {
  return entry.followups
    .map((id) => entryById(id))
    .filter((e): e is KbEntry => Boolean(e))
    .slice(0, 3);
}

function hitEntries(hits: KbHit[]): KbEntry[] {
  return hits.map((h) => h.entry);
}

/**
 * Curated background reading offered UNDER a safety card, per tier.
 *
 * Retrieval alone is not good enough here: "my knee hurts when I squat" retrieves the entry about
 * knees travelling past the toes, which is topical but useless to someone in pain, and a guarded
 * query ("I have tendonitis in my elbow") retrieves nothing at all. These entries are written for
 * exactly this moment, so they lead; genuine retrieval hits fill the remaining slots.
 */
const SAFETY_READING: Record<string, string[]> = {
  urgent: ['ts-when-to-see-a-pro', 'ts-something-hurts'],
  injury: ['ts-something-hurts', 'ts-train-through-pain', 'ts-when-to-see-a-pro'],
  'medical-general': ['ts-when-to-see-a-pro'],
};

const MAX_SECONDARY = 4;

/** Curated-first, retrieval-second, de-duplicated, capped. */
function secondaryReading(level: string, hits: KbHit[]): KbEntry[] {
  const out: KbEntry[] = [];
  const seen = new Set<string>();
  const push = (e: KbEntry | undefined) => {
    if (!e || seen.has(e.id) || out.length >= MAX_SECONDARY) return;
    seen.add(e.id);
    out.push(e);
  };
  for (const id of SAFETY_READING[level] ?? []) push(entryById(id));
  for (const e of hitEntries(hits)) push(e);
  return out;
}

/**
 * A synthetic "the user tapped this entry" route — no retrieval, confidence is by definition 1.
 * No safety gate either: opening a named entry is the user's own explicit choice to read it, not
 * the app answering a symptom with it.
 */
function directRoute(entry: KbEntry): KbRoutePlus {
  const hit: KbHit = { entry, score: 0, conf: 1, matched: [] };
  return {
    mode: 'answer',
    query: entry.question,
    hits: [hit],
    top: hit,
    conf: 1,
    cues: [],
    safety: null,
    guard: null,
    reason: 'Opened from the guide.',
  };
}

const AUTO_KEY = 'fitforge.coachAuto.v1';
const AI_KEY = 'fitforge.coachAi.v1';

export function CoachView() {
  const [mode, setMode] = React.useState<Mode>('ask');
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const profile = useCoachProfile();
  const configured = isCoachConfigured();
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  /**
   * AI MODE — one switch, on by default, top right of the trainer.
   *
   * This replaces the old "Auto-personalize" pill, and it means more than that pill did. The pill
   * only governed whether a CONFIDENT guide match got an AI rewrite; a question that matched
   * nothing still went to the model regardless, and a question that matched several entries got a
   * "did you mean?" list instead of an answer. So the guide was still answering first whenever it
   * thought it could, which is exactly backwards for someone who turned the AI coach on: the model
   * answers, the guide grounds it and catches it when it falls.
   *
   *   ON  (and the service configured) — every question goes to the model. Curated matches travel
   *        as grounding and are revealed only if the call fails. Two exceptions stand, and they are
   *        not preferences: red-flag safety questions never reach a model, and "what can I eat"
   *        is computed from today's actual remaining macros, which no model may invent.
   *   OFF — genuinely offline. No model calls at all; the curated guide answers, the way an
   *        unconfigured build behaves. The per-answer "Personalize with AI" button remains, because
   *        a deliberate tap is an instruction, not a default.
   */
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const [status, setStatus] = React.useState<CoachStatus | null>(null);
  const hasLockedModels = useHasLockedModels();

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AI_KEY);
      // Honour the retired Auto-personalize preference on first run: someone who had switched
      // that off had opted out of automatic AI, and this switch is that choice's successor.
      const legacy = window.localStorage.getItem(AUTO_KEY);
      setAiEnabled(stored != null ? stored !== '0' : legacy !== '0');
    } catch {
      /* private mode — default on */
    }
    if (configured) void fetchCoachStatus().then(setStatus);
  }, [configured]);

  const toggleAi = React.useCallback(() => {
    setAiEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AI_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const patchTurn = React.useCallback((id: string, ai: AiState) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ai } : t)));
  }, []);

  /**
   * The thread as the model should see it. Read from a ref rather than state so a question asked
   * while a previous answer is still arriving still sees the finished turns — and so `runAi` does
   * not have to be re-created on every keystroke of the conversation.
   */
  const turnsRef = React.useRef<Turn[]>([]);
  React.useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const runAi = React.useCallback(
    async (
      turnId: string,
      question: string,
      route: KbRoutePlus,
      p: CoachProfile,
      intent?: 'personalize' | 'meal',
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      // What was actually SAID so far — the model's own answers where it gave one, the curated
      // text where the guide answered. Anything still pending contributes nothing.
      const history = buildHistory(
        turnsRef.current
          .filter((t) => t.id !== turnId)
          .map((t) => ({
            question: t.question,
            answer:
              t.ai.kind === 'answer'
                ? t.ai.text
                : (t.route?.top?.entry.answer ?? null),
          })),
        question,
      );
      const result = await askCoach(
        { question, snippets: snippetsFromHits(route.hits), profile: p, intent, history },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      if (result.status === 'ok') {
        patchTurn(turnId, { kind: 'answer', text: result.answer });
        return;
      }
      if (result.status === 'timeout') {
        patchTurn(turnId, {
          kind: 'unavailable',
          headline: 'The coach took too long',
          detail:
            'The AI service did not answer within 10 seconds, so the guide answer above stands.',
        });
        return;
      }
      {
        /* Internal failure tokens become plain sentences; only the worker's own {error} body —
           authored as product copy — passes through verbatim. Raw exception text never reaches
           this card (see lib/kb/client.ts). */
        const raw = result.status === 'error' ? result.detail : result.status;
        const PLAIN: Record<string, string> = {
          unreachable: 'the connection failed',
          empty_response: 'it sent back an empty reply',
          cancelled: 'the request was cancelled',
        };
        const reason =
          PLAIN[raw] ?? (/^HTTP \d+$/.test(raw) ? `it answered with an error (${raw})` : raw);
        patchTurn(turnId, {
          kind: 'unavailable',
          headline: 'The coach is unavailable',
          detail: `The AI service could not be reached — ${reason}. Here is the closest guidance from the guide instead.`,
        });
      }
    },
    [patchTurn],
  );

  const pushTurn = React.useCallback(
    (
      question: string,
      route: KbRoutePlus,
      wantsAi: boolean,
      aiPrimary = false,
      intent?: 'personalize' | 'meal',
    ): string => {
      turnSeq += 1;
      const id = `turn-${turnSeq}`;
      const facts = profileFacts(profile);
      const ai: AiState = !wantsAi
        ? { kind: 'none' }
        : configured
          ? { kind: 'pending' }
          : {
              kind: 'unavailable',
              headline: 'Personalized answers need the Coach service',
              detail:
                'This question is specific to you, which the curated guide cannot know. A personalized answer needs the FitForge Coach service configured (NEXT_PUBLIC_AI_ENDPOINT); this build has none, so nothing was sent anywhere. The closest guide entries are below.',
            };

      setTurns((prev) => [...prev, { id, question, route, ai, facts, aiPrimary }]);
      setMode('ask');
      if (wantsAi && configured) void runAi(id, question, route, profile, intent);
      return id;
    },
    [configured, profile, runAi],
  );

  const ask = React.useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setInput('');

      // ANSWERED LOCALLY, BEFORE ROUTING. "What can I eat?" depends on today's remaining macros,
      // which no curated entry can know and no model may guess — it would answer with invented
      // grams. Intercepting here also means the question never reaches the worker even on a build
      // that has one configured.
      if (wantsMealSuggestion(q)) {
        turnSeq += 1;
        setTurns((prev) => [
          ...prev,
          {
            id: `turn-${turnSeq}`,
            question: q,
            route: null,
            ai: { kind: 'meal' },
            facts: [],
            aiPrimary: false,
          },
        ]);
        setMode('ask');
        return;
      }

      const route = routeQuery(q, searchKb(q, 8));
      // A red-flagged question NEVER travels to the model, configured or not: a small model given
      // "I have chest pain during exercise" will happily write training advice around it.
      if (route.safety) {
        pushTurn(q, route, false);
        return;
      }

      /**
       * AI MODE ON: THE MODEL ANSWERS, FULL STOP.
       *
       * Not "the model answers when the guide is unsure" — that was the old shape, and it meant
       * the offline matcher was still the first responder whenever it felt confident, with the AI
       * demoted to a rewrite underneath. With the switch on, every mode the router can return —
       * a confident match, a did-you-mean shortlist, or nothing at all — is handed to the model,
       * with whatever the guide found travelling along as grounding. The curated material comes
       * back only when the call fails, which is the entire meaning of "fallback".
       *
       * A confident match still upgrades the request to the 'personalize' intent so the worker
       * grounds harder on the matched entry; a shortlist or a miss goes as a plain question.
       */
      if (aiEnabled && configured) {
        pushTurn(q, route, true, true, route.mode === 'answer' ? 'personalize' : undefined);
        return;
      }

      /**
       * AI MODE OFF (or no service): genuinely offline. The guide answers what it can and says so
       * honestly when it cannot — the no-match card names the real problem rather than pretending
       * the question was personal. No model call is made on any path here.
       */
      pushTurn(q, route, false);
    },
    [aiEnabled, configured, pushTurn],
  );

  /**
   * Open a specific entry as CURATED READING — no AI, no cost. This is the right verb for the
   * places that explicitly offer the guide: the reading list under a safety card, and the
   * "closest answers" list shown when an AI call has already failed (sending those back to the
   * model would loop a failure into another failure).
   */
  const openEntry = React.useCallback(
    (entry: KbEntry) => {
      pushTurn(entry.question, directRoute(entry), false);
    },
    [pushTurn],
  );

  /**
   * Follow a question the user tapped — a follow-up chip, a did-you-mean option, a source chip.
   *
   * THESE HONOUR THE AI SWITCH. They used to be hard-wired to the curated open above, which made
   * the switch a lie: you asked in AI mode, got a model answer, tapped the follow-up it offered —
   * and were quietly handed back to offline mode. A tapped question is still a question; with AI
   * on it goes to the model like any typed one, with the tapped entry travelling as
   * highest-confidence grounding. With AI off (or no service) it is the curated open it always was.
   */
  const followEntry = React.useCallback(
    (entry: KbEntry) => {
      if (aiEnabled && configured) {
        pushTurn(entry.question, directRoute(entry), true, true, 'personalize');
        return;
      }
      openEntry(entry);
    },
    [aiEnabled, configured, openEntry, pushTurn],
  );

  /** "Ask the coach about this" on a curated answer that is flagged as personalizable. */
  const personalize = React.useCallback(
    (turn: Turn) => {
      patchTurn(turn.id, { kind: 'pending' });
      if (turn.route) void runAi(turn.id, turn.question, turn.route, profile, 'personalize');
    },
    [patchTurn, profile, runAi],
  );

  React.useEffect(() => {
    if (turns.length > 0) bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns]);

  return (
    /* DESKTOP IS A CHAT PANE, NOT A SCROLLING PAGE. On ≥md in ask mode this root pins itself to
       the viewport (100svh minus <main>'s md pt-8 + pb-10 = 4.5rem of chrome), the THREAD becomes
       the scroll container, and the composer is an ordinary flex footer — parked, no sticky
       arithmetic. On mobile nothing changes: the page scrolls and the composer stays sticky above
       the tab bar, because a phone keyboard + a nested scroll container is a fight nobody wins. */
    <div
      data-testid="coach-view"
      className={
        (mode === 'ask' ? 'space-y-2.5' : 'space-y-4') +
        (mode === 'ask' ? ' md:flex md:h-[calc(100svh-4.5rem)] md:min-h-0 md:flex-col md:gap-2.5' : '')
      }
    >
      {/* THE CHROME ABOVE THE THREAD IS A BUDGET, and it was overdrawn: a display-size heading, a
          full-sentence subtitle, the mode switch and an AI bar that wrapped onto three lines left
          barely any room for an answer on a 390 × 664 screen — the content the screen exists for
          started below the fold. Everything here is one step smaller and the AI bar is one row.
          `space-y-4` on the root also drops to `space-y-2.5` in ask mode for the same reason. */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-title font-bold leading-none text-foreground md:text-display">
          Coach
        </h1>
        {/* THE AI SWITCH — top right, the one control that decides who answers. Replaces the old
            status chip + "Auto" pill pair, which together took a full row to say less than this
            says in one: the dot is the service's live status, the switch is your choice. Shown
            only when a service is configured — a switch that can never be on is a taunt. */}
        {configured ? (
          <button
            type="button"
            role="switch"
            aria-checked={aiEnabled}
            data-testid="coach-ai-switch"
            onClick={toggleAi}
            title={aiEnabled ? 'AI answers first — tap for offline guide only' : 'Offline guide only — tap for AI answers'}
            className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-chip border border-border px-2.5 py-1 text-[12px] font-semibold text-foreground transition-colors hover:border-border-strong"
          >
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              {aiEnabled && status?.online && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
              )}
              <span
                className={
                  'relative inline-flex h-1.5 w-1.5 rounded-full ' +
                  (!aiEnabled
                    ? 'bg-muted-foreground'
                    : status == null
                      ? 'bg-muted-foreground'
                      : status.online
                        ? 'bg-success'
                        : 'bg-danger')
                }
              />
            </span>
            AI
            <span
              aria-hidden
              className={
                'relative h-4.5 w-8 rounded-full transition-colors ' +
                (aiEnabled ? 'bg-accent' : 'bg-muted')
              }
              style={{ height: 18 }}
            >
              <span
                className={
                  'absolute top-[2px] h-3.5 w-3.5 rounded-full bg-surface transition-transform ' +
                  (aiEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]')
                }
              />
            </span>
          </button>
        ) : (
          <p className="truncate text-[11px] text-muted-foreground">{ENTRY_COUNT} answers offline</p>
        )}
      </header>

      {/* Mode switch */}
      <div
        role="tablist"
        aria-label="Coach mode"
        className="grid grid-cols-2 gap-1 rounded-field bg-muted p-0.5"
      >
        <TabButton
          active={mode === 'ask'}
          onClick={() => setMode('ask')}
          testId="coach-tab-ask"
          icon={<SparkleIcon size={16} />}
          label="Ask"
        />
        <TabButton
          active={mode === 'browse'}
          onClick={() => setMode('browse')}
          testId="coach-tab-browse"
          icon={<SearchIcon size={16} />}
          label="Browse"
        />
      </div>

      {/* With AI on, one slim row remains: which model. The status chip is gone (the switch's dot
          carries it) and so is the Auto pill (the switch IS that choice now). With AI off the row
          disappears entirely — offline mode has no model to pick. */}
      {configured && aiEnabled && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]"
          data-testid="coach-ai-bar"
        >
          {/* THE MODEL PICKER — the shared control (see ModelPicker.tsx). It renders nothing
              until the worker advertises a catalog, and the SAME preference drives the nutrition
              macro estimator, so a model chosen here is the model that estimates a burrito. */}
          <ModelPicker label={null} testId="coach-model-select" className="min-w-0 flex-1" />
          {/* Wraps to its own line when there is no room, which is the right place for it: it is
              an invitation, not a control. Only when a members-only model exists and this visitor
              cannot reach it. */}
          {hasLockedModels && (
            <div className="basis-full">
              <MembersModelHint />
            </div>
          )}
        </div>
      )}

      {mode === 'browse' ? (
        <BrowseKb expandedId={expandedId} onExpand={setExpandedId} />
      ) : (
        <>
          <div
            /* flex-1 + min-h-0 is what lets the thread shrink INSIDE the pane and grow a scrollbar
               of its own; the negative/positive px pair keeps that scrollbar out of the text. */
            className="min-h-[38vh] space-y-4 md:-mx-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-2"
            data-testid="coach-thread"
          >
            {turns.length === 0 ? (
              <EmptyAsk onPick={ask} onBrowse={() => setMode('browse')} configured={configured} />
            ) : (
              turns.map((turn) => (
                <TurnBlock
                  key={turn.id}
                  turn={turn}
                  onOpenEntry={followEntry}
                  onOpenEntryDirect={openEntry}
                  onPersonalize={configured ? personalize : undefined}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer — sticky in the thumb zone, clear of the mobile tab bar.
              It sticks at bottom:0 and absorbs the tab-bar height as PADDING, so its own
              surface fills the strip behind the bar instead of letting content scroll
              through it; the fixed tab bar (z-40) then draws over that padding. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            /* OPAQUE, and it has to be. The composer pill is opaque but the strip around it —
               the gap above and the disclaimer below — was not, so thread content scrolling past
               rendered THROUGH the safety disclaimer: two texts on top of each other, one of them
               the medical one. `-mx-4 px-4` bleeds the fill to the screen edges past <main>'s
               padding, so nothing shows around the sides either. */
            className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-surface px-4 pt-3 md:static md:pb-0"
          >
            {/* ONE BORDERED CONTROL, not a field sitting next to a button.
                The composer used to be a hairline box on a same-tone surface, and on a phone in
                daylight it read as a caption rather than as somewhere you could type. Enclosing the
                field and the send button in a single ring makes the whole strip legible as one
                object, and the accent ring on focus-within tells you which object has the keyboard.
                The glyph on the left is the same coach mark the tab bar and the Today card wear, so
                the thing you are talking to is identifiable at a glance. */}
            <div
              data-testid="coach-composer"
              className="flex items-center gap-2 rounded-full border-2 border-border bg-elevated py-1.5 pl-3 pr-1.5 shadow-[var(--shadow-pop)] transition-colors focus-within:border-accent"
            >
              <span aria-hidden className="shrink-0 text-muted-foreground">
                <CoachIcon size={20} />
              </span>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={configured ? 'Ask your AI coach anything…' : 'Ask your coach anything…'}
                aria-label="Ask your coach a question"
                data-testid="coach-input"
                enterKeyHint="send"
                className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                aria-label="Send question"
                data-testid="coach-submit"
                disabled={input.trim().length === 0}
                // Filled and circular so it is unmistakably pressable, and it dims rather than
                // vanishing when empty — a control that disappears reads as a rendering bug.
                // 44px, the house minimum — the send button is the one control on this screen that
                // is pressed with a thumb while walking.
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-[opacity,transform] duration-150 active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <SendIcon size={18} />
              </button>
            </div>
            {/* Persistent safety disclaimer — never dismissible, but no longer a slab gating the
                screen: one quiet line under the composer, where chat products put it. */}
            <p
              data-testid="coach-disclaimer"
              className="mt-2 px-2 text-center text-[11px] leading-snug text-muted-foreground"
            >
              General fitness guidance, not medical advice — for pain, injury, illness or
              pregnancy, speak to a doctor or physio.
            </p>
          </form>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------- pieces */

function TabButton({
  active,
  onClick,
  label,
  icon,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      className={
        'flex items-center justify-center gap-2 rounded-[0.7rem] px-3 py-2 text-sm font-semibold transition-colors ' +
        (active
          ? 'bg-surface-2 text-accent shadow-[var(--shadow-card)]'
          : 'text-muted-foreground hover:text-foreground')
      }
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function EmptyAsk({
  onPick,
  onBrowse,
  configured,
}: {
  onPick: (q: string) => void;
  onBrowse: () => void;
  configured: boolean;
}) {
  return (
    <section className="pt-4 text-center" data-testid="coach-empty">
      <p className="font-display text-title font-bold text-foreground">What do you want to know?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Answers come straight from the FitForge guide — instantly, with no network call.
        {configured
          ? ' Questions specific to you are sent to the coach with the closest guide entries attached.'
          : ' Questions specific to you will say so honestly rather than guess.'}
      </p>
      <ul className="mt-4 flex flex-wrap justify-center gap-1.5" data-testid="coach-suggestions">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              data-testid="coach-suggestion"
              className="rounded-chip border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-4 text-sm font-semibold text-accent hover:underline"
      >
        Or browse all {ENTRY_COUNT} entries
      </button>
    </section>
  );
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      {/* break-words: the text is the user's own — one long unbroken token must wrap inside the
          bubble, not drag the whole thread wider than the phone. */}
      <p
        data-testid="coach-question"
        className="max-w-[85%] break-words rounded-card rounded-br-md bg-accent-muted px-3.5 py-2.5 text-sm font-medium text-accent"
      >
        {text}
      </p>
    </div>
  );
}

/**
 * The coach composing a reply.
 *
 * This was a spinner and a line of grey text, which is the visual language of a page still loading
 * — the same thing the app shows when it is fetching a shard. The wait here is a different event:
 * someone is answering you. Three dots in a bubble on the coach's side of the thread says that in a
 * way a spinner cannot, and it lands where the answer will land, so the eye is already in the right
 * place when it arrives.
 *
 * The dots are CSS, not `motion` — this mounts and unmounts on every AI turn, and a JS animation
 * for three circles would cost more than it renders. `motion-reduce` turns them off entirely; the
 * sentence still carries the meaning.
 */
function CoachTyping() {
  return (
    <div className="flex items-end gap-2" data-testid="coach-ai-pending">
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-muted text-accent"
      >
        <CoachIcon size={17} />
      </span>
      <div className="rounded-card rounded-bl-md border border-border bg-surface-2 px-4 py-3">
        <span className="flex items-center gap-1.5" aria-hidden>
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              style={{ animationDelay: `${delay}ms` }}
              className="ff-ember-dot h-1.5 w-1.5 rounded-full bg-energy"
            />
          ))}
        </span>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Working out a personalized answer…
        </p>
      </div>
    </div>
  );
}

function TurnBlock({
  turn,
  onOpenEntry,
  onOpenEntryDirect,
  onPersonalize,
}: {
  turn: Turn;
  /** a tapped QUESTION — follow-ups, did-you-mean, sources. Honours the AI switch. */
  onOpenEntry: (entry: KbEntry) => void;
  /** curated READING — safety secondary reading, the after-failure list. Never calls the model. */
  onOpenEntryDirect: (entry: KbEntry) => void;
  onPersonalize?: (turn: Turn) => void;
}) {
  const { route, ai } = turn;

  // A turn the app answered itself. There is no KB route, no model call and nothing to badge, so
  // it returns before any of the routing logic below — which is also what narrows `route` to
  // non-null for the rest of this component.
  if (ai.kind === 'meal' || !route) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{turn.question}</p>
        <MealSuggestionCard />
      </div>
    );
  }

  const top = route.top;
  const safety = route.safety;
  const isAiPath = route.mode === 'ai';
  /**
   * The curated answer stays on screen for every path except "the AI already replaced it" — and
   * never at all on the safety path, where a curated entry as the primary response IS the defect.
   *
   * ON AN AI-PRIMARY TURN it is also held back WHILE the model works. It used to render straight
   * away as an interim card, which meant that with AI enabled you read a generic answer first and
   * the real one a second later — the guide leading, the coach trailing. Here it is what it was
   * always described as: the fallback, shown if the call fails.
   */
  const kbHeldForAi = turn.aiPrimary && (ai.kind === 'pending' || ai.kind === 'answer');
  const showKb =
    !safety && Boolean(top) && route.mode !== 'disambiguate' && ai.kind !== 'answer' && !kbHeldForAi;

  // Pain / injury / medical: one card, and nothing else can outrank it.
  if (safety) {
    return (
      <div className="space-y-2.5" data-testid="coach-turn">
        <QuestionBubble text={turn.question} />
        <SafetyCard
          flag={safety}
          entries={secondaryReading(safety.level, route.hits)}
          onOpenEntry={onOpenEntryDirect}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5" data-testid="coach-turn">
      <QuestionBubble text={turn.question} />

      {/* ── conf ≥ 0.55 — instant curated answer. On the AI path this is the interim card that
             renders BEFORE the model replies, so perceived latency is ~0. ───────────────── */}
      {showKb && top && (
        <AnswerCard
          source="kb"
          interim={ai.kind === 'pending'}
          badgeLabel={isAiPath ? 'Closest match from the guide' : undefined}
          matchedQuestion={top.entry.question}
          answer={top.entry.answer}
          followups={ai.kind === 'pending' ? [] : followupEntries(top.entry)}
          onFollowup={onOpenEntry}
          footer={
            onPersonalize && ai.kind === 'none' ? (
              <button
                type="button"
                onClick={() => onPersonalize(turn)}
                data-testid="coach-personalize"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-chip px-3.5 py-2 text-sm font-semibold text-[color:var(--accent-foreground)] shadow-[var(--shadow-glow)] transition-transform active:scale-95"
                style={{ background: 'var(--gradient-gold)' }}
              >
                <SparkleIcon size={15} /> Personalize with AI
              </button>
            ) : undefined
          }
        />
      )}

      {/* ── 0.30 ≤ conf < 0.55 — disambiguate. In AI mode this turn was answered by the model
             instead, so the picker list stays out of the way for the whole life of that call:
             while it is pending, when it answers, and when it fails — the failure card lists the
             same closest entries itself, and two copies of one list is a worse apology. ──── */}
      {route.mode === 'disambiguate' && !turn.aiPrimary && (
        <Card data-testid="coach-disambiguate">
          <p className="text-sm font-semibold text-foreground">Did you mean…?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Several entries match about equally well — pick the one you meant.
          </p>
          <ul className="mt-3 space-y-2">
            {hitEntries(route.hits).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpenEntry(e)}
                  data-testid="coach-disambiguate-option"
                  className="w-full rounded-field border border-border bg-surface px-3.5 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {e.question}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── conf < 0.30 or first-person specifics — the AI path ──────────────────────────── */}
      {ai.kind !== 'none' && (
        <>
          {ai.kind === 'pending' && <CoachTyping />}

          {ai.kind === 'answer' && (
            <AnswerCard
              source="ai"
              answer={ai.text}
              facts={turn.facts}
              sources={hitEntries(route.hits)}
              onSource={onOpenEntry}
              // The same "keep going" chips the curated card carries, drawn from the top grounded
              // entry. They arrive through the AI-aware handler, so in AI mode a tapped follow-up
              // is the next model turn — not a silent demotion to the offline guide, which is the
              // bug this line exists to keep dead.
              followups={top ? followupEntries(top.entry) : []}
              onFollowup={onOpenEntry}
            />
          )}

          {ai.kind === 'unavailable' && (
            <Card data-testid="coach-ai-unavailable">
              <p className="text-sm font-semibold text-foreground">{ai.headline}</p>
              <p className="mt-1 text-sm text-muted-foreground">{ai.detail}</p>
              {route.hits.length > 1 && (
                <>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Closest answers in the guide
                  </p>
                  <ul className="mt-1.5 space-y-2">
                    {hitEntries(route.hits).map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => onOpenEntryDirect(e)}
                          data-testid="coach-closest-option"
                          className="w-full rounded-field border border-border bg-surface px-3.5 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                        >
                          {e.question}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

        </>
      )}

      {/* Retrieval found nothing TRUSTWORTHY — never fake an answer (§3 fallback ladder, step 2).
          `route.guard` means a hit existed but its evidence did not survive inspection, which is
          the same thing from the user's side and must read the same way. */}
      {isAiPath && !top && ai.kind !== 'pending' && ai.kind !== 'answer' && (
        <Card data-testid="coach-no-match">
          <p className="text-sm font-semibold text-foreground">
            I don&rsquo;t have a good answer for that yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing in the guide genuinely matches, and a near-miss would be worse than saying so.
            Try rephrasing, or browse the categories.
          </p>
          {NON_ASCII.test(turn.question) && (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="coach-no-match-language">
              The guide is written in English — asking in English will match far better.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
