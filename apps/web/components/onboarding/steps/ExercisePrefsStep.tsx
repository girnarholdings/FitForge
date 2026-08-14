'use client';

/**
 * Screen 5 · "Which lifts do you actually enjoy?" — the RANKED top-5 liked / top-5 disliked picker.
 *
 * Moved BEFORE the split step (docs/RESEARCH-PREFERENCES.md §1): the split is the single biggest
 * determinant of what someone actually does, and it used to be chosen before the app knew one
 * thing about what they enjoy. The liked list feeds `recommendSplits` on the very next screen.
 *
 * ─── rank = order of selection ───────────────────────────────────────────────────────────────
 * There is no drag-and-drop. First tap = #1, second = #2 — "which do I add first" and "which do
 * I love most" are the same question, so most users produce their true ranking without touching
 * an edit control. Fixing the order is ONE promote-up chevron per row (any permutation of five is
 * reachable in ≤4 taps). Drag inside a scrolling page fights the iOS scroll gesture, fails screen
 * readers and switch access, and makes flaky tests.
 *
 * ─── liked / disliked coexist on one screen ──────────────────────────────────────────────────
 * A two-tab segment switches what a tap MEANS; the grid itself never re-sorts on tab switch, so
 * spatial memory survives. Disliked is styled neutral slate with swap iconography — never red,
 * because red reads as "banned" and the semantic is "give me an easier movement that trains the
 * same thing" (`substituteDisliked` in @fitforge/shared). The real exclusion step comes later.
 *
 * ─── the guardrail ───────────────────────────────────────────────────────────────────────────
 * The sex-leaning seed is a PRE-FILL, NEVER A FILTER. It may only ever overwrite a list that is
 * still one of our OWN untouched seeds (`exercise_prefs_source === 'suggested'` AND the five on
 * screen match a canonical seed verbatim); any edit flips the source to `'custom'` forever, after
 * which nothing here may write a seed again. Every one of the catalog's exercises stays reachable
 * through the browse sheet, for everyone.
 *
 * ─── why sex is asked HERE too ───────────────────────────────────────────────────────────────
 * It used not to be, and that made the whole feature unreachable: `sex` was only ever written at
 * body metrics (screen 11), six screens after this one, so EVERY first-pass athlete got the
 * neutral seed and the male/female lists were dead code in practice. Two fixes, both needed:
 *   1. the optional tailoring chips below, so the answer exists in time to matter on a FIRST pass;
 *   2. re-seeding when sex arrives later, so answering at body metrics and coming back upgrades an
 *      untouched seed instead of being silently ignored.
 * Asking in context is also the more honest version — the athlete chose the lean, we did not
 * infer it from a question they answered for calorie maths.
 */
import * as React from 'react';
import catalogFixtureJson from '@fitforge/shared/fixtures/catalog.json';
import {
  preferencePrefill,
  PREFERENCE_LIST_SIZE,
  type CatalogExercise,
} from '@fitforge/shared/rules';
import type { SexType } from '@fitforge/shared/types';
import { cn } from '@/lib/utils';
import { Button, Sheet, SearchInput, Chip } from '@/components/ui';
import {
  m,
  AnimatePresence,
  Pressable,
  AnimatedNumber,
  haptic,
} from '@/components/ui/motion';
import { usePrefersReducedMotion } from '@/components/ui/Confetti';
import {
  HeartIcon,
  SwapIcon,
  XIcon,
  PlusIcon,
  ChevronDownIcon,
} from '@/components/ui/icons';
import { MuscleMapThumb, MUSCLE_NAMES } from '@/components/illustrations';
import type { MuscleSlug } from '@/components/illustrations/muscle-map/types';
import { PoseThumb } from '@/components/illustrations/poses';
import { EXERCISES, type ExerciseFull, type MovementPattern } from '@/components/features/_mock/data';
import { useExplainerSeen, dismissExplainer } from '@/components/features/shared/explainers';
import { useOnboarding } from '../OnboardingProvider';
import { useCatalogSearch, type ExerciseHit } from '../useCatalogSearch';
import type { NamedRef } from '../types';
import { OnboardingFooter } from '../OnboardingFooter';

type Mode = 'liked' | 'disliked';

/* ------------------------------------------------------------------------------ catalog data */

/** Raw fixture rows for the shared prefill rule (it wants `CatalogExercise`, not the read model). */
const RULE_CATALOG = catalogFixtureJson as unknown as CatalogExercise[];

const EX_BY_SLUG = new Map<string, ExerciseFull>(EXERCISES.map((e) => [e.slug, e]));
const TOTAL_EXERCISES = EXERCISES.length;

function refFor(slug: string): NamedRef | null {
  const ex = EX_BY_SLUG.get(slug);
  return ex ? { id: ex.id, slug: ex.slug, name: ex.name } : null;
}

function muscleProse(ex: ExerciseFull, count = 2): string {
  return ex.primary_muscles
    .slice(0, count)
    .map((s) => MUSCLE_NAMES[s as MuscleSlug] ?? s.replace(/-/g, ' '))
    .join(' · ');
}

/* ---------------------------------------------------------------- browse-sheet pattern groups */

/** Beginners hunt "leg stuff", not the alphabet — the sheet groups by movement pattern. */
const SHEET_GROUPS: readonly {
  key: string;
  label: string;
  chip: string;
  patterns: readonly MovementPattern[];
}[] = [
  { key: 'squat', label: 'Squat & lunge', chip: 'Squat', patterns: ['squat', 'lunge'] },
  { key: 'hinge', label: 'Hinge', chip: 'Hinge', patterns: ['hinge'] },
  { key: 'push', label: 'Push', chip: 'Push', patterns: ['horizontal_push', 'vertical_push'] },
  { key: 'pull', label: 'Pull', chip: 'Pull', patterns: ['horizontal_pull', 'vertical_pull'] },
  {
    key: 'arms',
    label: 'Arms & shoulders',
    chip: 'Arms',
    patterns: ['elbow_flexion', 'elbow_extension', 'shoulder_isolation'],
  },
  {
    key: 'legs-iso',
    label: 'Legs & glutes — isolation',
    chip: 'Legs',
    patterns: ['hip_extension_iso', 'knee_flexion_iso', 'knee_extension_iso', 'calf_raise'],
  },
  { key: 'core', label: 'Core', chip: 'Core', patterns: ['core_flexion', 'core_stability'] },
  {
    key: 'carry',
    label: 'Carry & conditioning',
    chip: 'Carry',
    patterns: ['carry', 'conditioning', 'cardio'],
  },
  {
    key: 'mobility',
    label: 'Warm-up & stretch',
    chip: 'Mobility',
    patterns: ['mobility', 'static_stretch'],
  },
];

/* --------------------------------------------------------------------- the live "lean" line */

/** Coarse buckets for the consequence line — an app-mechanics statement, never a training claim. */
function leanGroup(p: MovementPattern): string | null {
  if (['squat', 'lunge', 'hinge', 'knee_extension_iso', 'knee_flexion_iso', 'calf_raise'].includes(p))
    return 'legs';
  if (['horizontal_push', 'vertical_push', 'shoulder_isolation', 'elbow_extension'].includes(p))
    return 'push';
  if (['horizontal_pull', 'vertical_pull', 'elbow_flexion'].includes(p)) return 'pull';
  if (p === 'hip_extension_iso') return 'glutes';
  if (['core_flexion', 'core_stability'].includes(p)) return 'core';
  if (['carry', 'conditioning', 'cardio'].includes(p)) return 'carries';
  return null;
}

function likedLean(liked: readonly NamedRef[]): string | null {
  const counts = new Map<string, number>();
  for (const ref of liked) {
    const ex = EX_BY_SLUG.get(ref.slug);
    const g = ex ? leanGroup(ex.movement_pattern) : null;
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length === 0) return null;
  return top.map(([g]) => g).join(' + ');
}

/* ------------------------------------------------------------------- seed provenance + copy */

type Provenance = 'male' | 'female' | 'neutral';

const BANNER_COPY: Record<Provenance, string> = {
  male: 'These five are the most-loved lifts among men in the gym. Swap, reorder or clear anything: every one of the 91 exercises is yours to pick.',
  female:
    'These five are the most-loved lifts among women in the gym — including back work, not just glutes. Swap, reorder or clear anything: every one of the 91 exercises is yours to pick.',
  neutral:
    'The five most popular all-round lifts, covering squat, hinge, push, pull and carry. Make it yours — swap anything, or clear the list and start fresh.',
};

/** The three canonical seed lists, for recognising WHICH seed is currently on screen. */
const CANONICAL_SEEDS: readonly { provenance: Provenance; slugs: string }[] = (
  [
    ['male', preferencePrefill('male', RULE_CATALOG).liked],
    ['female', preferencePrefill('female', RULE_CATALOG).liked],
    ['neutral', preferencePrefill(null, RULE_CATALOG).liked],
  ] as const
).map(([provenance, liked]) => ({ provenance, slugs: liked.join(',') }));

function seedProvenance(liked: readonly NamedRef[]): Provenance | null {
  const key = liked.map((r) => r.slug).join(',');
  return CANONICAL_SEEDS.find((s) => s.slugs === key)?.provenance ?? null;
}

/**
 * The optional tailoring control — the only reason `sex` is asked on this screen.
 *
 * Three chips, one of which is an explicit decline: 'prefer_not_to_say' is a real value in the
 * schema, so declining is an ANSWER (and yields the neutral seed) rather than a null we would keep
 * re-asking about. It writes `sex` alone and never touches `exercise_prefs_source`, because
 * choosing a lean is not editing the list — the seeding effect below is what redraws it, and the
 * provenance banner keeps saying the five are still only a suggestion.
 *
 * Labels match the same question at body metrics — one field asked twice must not be worded two
 * ways — except that the decline reads 'Skip' here, because 'Prefer not to say' sitting a few
 * pixels from the 'Rather not' tab is two unrelated meanings in nearly the same words.
 */
const TAILOR_OPTIONS: readonly { value: SexType; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Skip' },
];

/* -------------------------------------------------------------------------------- component */

interface ToastMsg {
  id: number;
  text: string;
  testId: string;
}

interface UndoSnapshot {
  id: number;
  text: string;
  liked: NamedRef[];
  disliked: NamedRef[];
  source: 'suggested' | 'custom';
}

export function ExercisePrefsStep() {
  const { draft, patch, hydrated } = useOnboarding();
  const { searchExercises } = useCatalogSearch();
  const reduced = usePrefersReducedMotion();

  const [mode, setMode] = React.useState<Mode>('liked');
  const [browsing, setBrowsing] = React.useState(false);
  const [sheetChip, setSheetChip] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  const [toast, setToast] = React.useState<ToastMsg | null>(null);
  const [undo, setUndo] = React.useState<UndoSnapshot | null>(null);
  /** bumping this re-triggers the blocked-tap shake on the active count */
  const [shakeKey, setShakeKey] = React.useState(0);
  const seq = React.useRef(0);
  const lockToastShown = React.useRef(false);

  const dislikedExplained = useExplainerSeen('prefs-disliked-meaning');

  // Old drafts may hold longer arrays; the UI shows (and edits) the first five only.
  const liked = React.useMemo(
    () => draft.liked_exercises.slice(0, PREFERENCE_LIST_SIZE),
    [draft.liked_exercises],
  );
  const disliked = React.useMemo(
    () => draft.disliked_exercises.slice(0, PREFERENCE_LIST_SIZE),
    [draft.disliked_exercises],
  );
  const current = mode === 'liked' ? liked : disliked;
  const likedSlugs = React.useMemo(() => new Set(liked.map((r) => r.slug)), [liked]);
  const dislikedSlugs = React.useMemo(() => new Set(disliked.map((r) => r.slug)), [disliked]);

  /* ------------------------------------------------------------------------------- seeding */

  // Seed into an unanswered draft — and only AFTER the provider has merged any stored draft
  // (`hydrated`): seeding in the same commit as rehydration gets overwritten by the stored empty
  // lists, and never re-fires when the stored draft matches the empty one.
  //
  // The guard is deliberately about PROVENANCE, not emptiness. The old `liked.length > 0` bail
  // meant the first seed to land locked the list forever, so an athlete who answered sex later
  // (body metrics is six screens on) had that answer silently ignored — the neutral five stayed.
  // `seedProvenance` recognises our own untouched seeds verbatim, so we can re-seed over one of
  // those while still refusing, permanently, to touch a list the athlete has actually edited:
  // 'custom' source or five slugs that match no seed we ever produced.
  React.useEffect(() => {
    if (!hydrated) return;
    if (draft.exercise_prefs_source === 'custom') return;
    if (draft.disliked_exercises.length > 0) return;
    if (liked.length > 0 && seedProvenance(liked) === null) return;
    const prefill = preferencePrefill(draft.sex, RULE_CATALOG);
    const rows = prefill.liked
      .map(refFor)
      .filter((r): r is NamedRef => r !== null);
    if (rows.length === 0) return;
    // Already showing exactly this seed — bail. This is also what stops the re-seed path from
    // looping, since `patch` would otherwise re-run the effect with an identical result.
    if (rows.map((r) => r.slug).join(',') === liked.map((r) => r.slug).join(',')) return;
    // NOTE: source stays 'suggested' — this is FitForge's guess, not the athlete's answer.
    patch({ liked_exercises: rows });
  }, [
    hydrated,
    draft.exercise_prefs_source,
    draft.disliked_exercises.length,
    draft.sex,
    liked,
    patch,
  ]);

  const provenance = draft.exercise_prefs_source === 'suggested' ? seedProvenance(liked) : null;
  const edited = draft.exercise_prefs_source === 'custom';

  /* ------------------------------------------------------------------------------ timers */

  React.useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(t);
  }, [undo]);

  /* --------------------------------------------------------------------------- mutations */

  const say = (text: string) => setAnnouncement(text);

  const showToast = (text: string, testId: string) => {
    seq.current += 1;
    setToast({ id: seq.current, text, testId });
  };

  /** Every EDIT goes through here: writes both lists and flips the source to 'custom' forever. */
  const write = React.useCallback(
    (nextLiked: NamedRef[], nextDisliked: NamedRef[]) => {
      patch({
        liked_exercises: nextLiked,
        disliked_exercises: nextDisliked,
        exercise_prefs_source: 'custom',
      });
    },
    [patch],
  );

  const blockFull = React.useCallback(
    (m: Mode) => {
      setShakeKey((k) => k + 1);
      showToast("That's five — remove one to make room", 'prefs-full-toast');
      say(
        m === 'liked'
          ? 'Your top five is full. Remove one to make room.'
          : 'Five already — remove one to make room.',
      );
    },
    [],
  );

  /**
   * The one tap semantic, shared by grid cards, sheet rows and search results:
   * in the active list → remove (toggle) · in the other list → MOVE with single-level undo ·
   * otherwise append at the next rank (order of tap IS the rank).
   */
  const tapExercise = React.useCallback(
    (ref: NamedRef, m: Mode = mode) => {
      const inLiked = likedSlugs.has(ref.slug);
      const inDisliked = dislikedSlugs.has(ref.slug);
      const inCurrent = m === 'liked' ? inLiked : inDisliked;
      const inOther = m === 'liked' ? inDisliked : inLiked;

      if (inCurrent) {
        const next = (m === 'liked' ? liked : disliked).filter((r) => r.slug !== ref.slug);
        write(m === 'liked' ? next : [...liked], m === 'liked' ? [...disliked] : next);
        say(`Removed ${ref.name}. ${next.length} of ${PREFERENCE_LIST_SIZE} picked.`);
        return;
      }

      if (inOther) {
        // MOVE between lists, with an undo that restores the EXACT prior order of both.
        if ((m === 'liked' ? liked : disliked).length >= PREFERENCE_LIST_SIZE) {
          blockFull(m);
          return;
        }
        const snapshot: UndoSnapshot = {
          id: ++seq.current,
          text: m === 'liked' ? 'Moved into your top five' : 'Moved out of your top five',
          liked: [...liked],
          disliked: [...disliked],
          source: draft.exercise_prefs_source,
        };
        const nextLiked =
          m === 'liked' ? [...liked, ref] : liked.filter((r) => r.slug !== ref.slug);
        const nextDisliked =
          m === 'liked' ? disliked.filter((r) => r.slug !== ref.slug) : [...disliked, ref];
        write(nextLiked, nextDisliked);
        setUndo(snapshot);
        say(
          m === 'liked'
            ? `${ref.name} moved into your top five.`
            : `${ref.name} moved out of your top five, into rather-not.`,
        );
        return;
      }

      const list = m === 'liked' ? liked : disliked;
      if (list.length >= PREFERENCE_LIST_SIZE) {
        blockFull(m);
        return;
      }
      const next = [...list, ref];
      write(m === 'liked' ? next : [...liked], m === 'liked' ? [...disliked] : next);
      say(`${ref.name} added as number ${next.length} of ${PREFERENCE_LIST_SIZE}.`);
      if (m === 'liked' && next.length === PREFERENCE_LIST_SIZE && !lockToastShown.current) {
        lockToastShown.current = true;
        haptic('confirm');
        showToast('Top five locked in — these steer your split.', 'prefs-lock-toast');
      }
    },
    [mode, liked, disliked, likedSlugs, dislikedSlugs, write, blockFull, draft.exercise_prefs_source],
  );

  /** Swap a row with the one above it — the single reorder control. */
  const promote = React.useCallback(
    (slug: string) => {
      const list = mode === 'liked' ? [...liked] : [...disliked];
      const i = list.findIndex((r) => r.slug === slug);
      if (i <= 0) return;
      const a = list[i - 1]!;
      const b = list[i]!;
      list[i - 1] = b;
      list[i] = a;
      write(mode === 'liked' ? list : [...liked], mode === 'liked' ? [...disliked] : list);
      say(`${b.name} moved to number ${i} of ${list.length}.`);
    },
    [mode, liked, disliked, write],
  );

  const clearSeed = React.useCallback(() => {
    write([], [...disliked]);
    say('Cleared. Pick your own five from the grid below, or browse everything.');
  }, [write, disliked]);

  const applyUndo = React.useCallback(() => {
    if (!undo) return;
    // Restore both lists AND the source flag verbatim — a naive re-append would silently
    // corrupt a hand-built ranking, and the flag is part of the state being undone.
    patch({
      liked_exercises: undo.liked,
      disliked_exercises: undo.disliked,
      exercise_prefs_source: undo.source,
    });
    setUndo(null);
    say('Move undone.');
  }, [undo, patch]);

  /* ------------------------------------------------------------------------- derived view */

  // Suggestion grid: the seed five first, then the catalog by popularity — minus anything already
  // in either list. NOT filtered by equipment: that is asked four screens later, and feasibility
  // is enforced by plan generation, which is the right layer.
  const candidateOrder = React.useMemo(() => {
    const seed = preferencePrefill(draft.sex, RULE_CATALOG).liked;
    const rest = [...EXERCISES]
      .sort((a, b) => b.popularity - a.popularity || a.slug.localeCompare(b.slug))
      .map((e) => e.slug);
    const seen = new Set<string>();
    return [...seed, ...rest].filter((s) => {
      if (seen.has(s) || !EX_BY_SLUG.has(s)) return false;
      seen.add(s);
      return true;
    });
  }, [draft.sex]);

  const gridRows = React.useMemo(
    () =>
      candidateOrder
        .filter((s) => !likedSlugs.has(s) && !dislikedSlugs.has(s))
        .slice(0, 12)
        .map((s) => EX_BY_SLUG.get(s)!),
    [candidateOrder, likedSlugs, dislikedSlugs],
  );

  const lean = likedLean(liked);

  /* ---------------------------------------------------------------------------- rendering */

  const rankDisc = (i: number, m: Mode, size = 24) => (
    <span
      key={`rank-${i}`}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-display text-[11px] font-bold tabular',
        m === 'liked' ? 'bg-accent text-accent-foreground' : 'bg-muted text-foreground',
        !reduced && 'ff-pop',
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {i + 1}
    </span>
  );

  const segment = (compact = false) => (
    <div
      role="tablist"
      aria-label="Liked or disliked"
      className="grid h-10 grid-cols-2 gap-1 rounded-card border border-border bg-surface-2 p-1"
    >
      {(['liked', 'disliked'] as const).map((m) => {
        const active = mode === m;
        const count = m === 'liked' ? liked.length : disliked.length;
        return (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={active}
            data-testid={`prefs-mode-${m}`}
            onClick={() => setMode(m)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-semibold transition-colors',
              active
                ? m === 'liked'
                  ? 'bg-accent-muted text-accent'
                  : 'bg-muted text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {m === 'liked' ? (
              <HeartIcon size={14} className={active ? 'text-accent' : undefined} />
            ) : (
              <SwapIcon size={14} />
            )}
            <span>
              {m === 'liked' ? (
                <>
                  Love<span className={compact ? 'hidden' : 'max-[359px]:hidden'}> these</span>
                </>
              ) : (
                'Rather not'
              )}
            </span>
            <span
              key={active ? shakeKey : undefined}
              className={cn('tabular text-[11px]', active && shakeKey > 0 && !reduced && 'ff-shake')}
            >
              <AnimatedNumber value={count} />
              /5
            </span>
          </button>
        );
      })}
    </div>
  );

  const trayRow = (ref: NamedRef, i: number) => {
    const ex = EX_BY_SLUG.get(ref.slug);
    return (
      <m.li
        key={ref.slug}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
        className="flex h-12 items-center gap-2 rounded-card border border-border bg-surface-2 px-2"
        data-testid={`prefs-tray-row-${ref.slug}`}
      >
        {rankDisc(i, mode)}
        {ex && <PoseThumb exerciseSlug={ref.slug} size={28} />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {ref.name}
        </span>
        <button
          type="button"
          aria-label={`Move ${ref.name} up`}
          disabled={i === 0}
          onClick={() => promote(ref.slug)}
          data-testid={`prefs-promote-${ref.slug}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <ChevronDownIcon size={18} className="rotate-180" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${ref.name}`}
          onClick={() => tapExercise(ref)}
          data-testid={`prefs-remove-${ref.slug}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-card text-muted-foreground transition-colors hover:bg-muted"
        >
          <XIcon size={16} />
        </button>
      </m.li>
    );
  };

  const gridCard = (ex: ExerciseFull) => (
    <Pressable
      key={ex.slug}
      soft
      onClick={() => tapExercise({ id: ex.id, slug: ex.slug, name: ex.name })}
      data-testid={`prefs-card-${ex.slug}`}
      className="relative flex min-h-[150px] flex-col rounded-card border border-border bg-surface-2 p-2.5 text-left"
    >
      <span className="absolute right-2 top-2 hidden min-[360px]:block" aria-hidden>
        <MuscleMapThumb primary={ex.primary_muscles.slice(0, 3) as MuscleSlug[]} height={34} />
      </span>
      <span className="grid h-[64px] w-full place-items-center rounded-[12px] bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent-muted),transparent_70%)]">
        <PoseThumb exerciseSlug={ex.slug} size={56} />
      </span>
      <span className="mt-1.5 line-clamp-2 font-display text-[13px] font-semibold leading-tight text-foreground">
        {ex.name}
      </span>
      <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
        {muscleProse(ex)}
      </span>
    </Pressable>
  );

  const sheetRow = (ex: ExerciseFull) => {
    const inLiked = likedSlugs.has(ex.slug);
    const inDisliked = dislikedSlugs.has(ex.slug);
    const rank = inLiked
      ? liked.findIndex((r) => r.slug === ex.slug)
      : inDisliked
        ? disliked.findIndex((r) => r.slug === ex.slug)
        : -1;
    return (
      <li key={ex.slug}>
        <button
          type="button"
          onClick={() => tapExercise({ id: ex.id, slug: ex.slug, name: ex.name })}
          data-testid={`prefs-sheet-row-${ex.slug}`}
          className={cn(
            'flex h-14 w-full items-center gap-3 rounded-card px-2 text-left transition-colors hover:bg-surface-2',
            (inLiked || inDisliked) && 'bg-surface-2',
          )}
        >
          <PoseThumb exerciseSlug={ex.slug} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {ex.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {muscleProse(ex)}
            </span>
          </span>
          {rank >= 0 ? (
            rankDisc(rank, inLiked ? 'liked' : 'disliked', 22)
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground">
              <PlusIcon size={14} />
            </span>
          )}
        </button>
      </li>
    );
  };

  const emptyHint =
    mode === 'liked' ? (
      <li className="grid h-12 place-items-center rounded-card border border-dashed border-border text-[12px] text-muted-foreground">
        Tap a lift below to add · {PREFERENCE_LIST_SIZE - current.length} more
      </li>
    ) : current.length === 0 ? (
      <li className="rounded-card border border-dashed border-border p-3 text-[12px] leading-snug text-muted-foreground">
        Nothing here — that&apos;s fine. Add a lift you dread and we&apos;ll favour an easier
        movement that trains the same muscles. We never just delete it.
      </li>
    ) : (
      <li className="grid h-12 place-items-center rounded-card border border-dashed border-border text-[12px] text-muted-foreground">
        Tap a lift below to add · {PREFERENCE_LIST_SIZE - current.length} more
      </li>
    );

  const sheetGroups = SHEET_GROUPS.filter((g) => sheetChip === null || g.key === sheetChip)
    .map((g) => ({
      ...g,
      rows: EXERCISES.filter((e) => (g.patterns as readonly string[]).includes(e.movement_pattern)),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="prefs-step">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {segment()}

      {/* Optional tailoring — offered only while a suggestion is still what is on screen, because
          that is the only thing it changes. Once the athlete has edited, re-seeding is off the
          table and asking would imply we might overwrite their five. */}
      {mode === 'liked' && !edited && (
        <div className="mt-3" data-testid="prefs-tailor">
          <p className="text-[12px] font-medium text-foreground">
            Tailor these suggestions? <span className="text-muted-foreground">Optional.</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Tailor suggestions">
            {TAILOR_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={draft.sex === o.value}
                onClick={() => patch({ sex: o.value })}
                data-testid={`prefs-tailor-${o.value}`}
              >
                {o.label}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Only changes which five we suggest first — never what you can pick. All 91 exercises
            stay available to everyone.
          </p>
        </div>
      )}

      {/* provenance banner — only while the untouched seed is on screen, liked tab only */}
      {mode === 'liked' && provenance && (
        <div
          className="mt-3 rounded-card border border-accent/30 bg-accent-muted p-3"
          data-testid="prefs-seed-banner"
        >
          <p className="font-display text-[13px] font-bold text-foreground">
            A starting point, not a verdict.
          </p>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {BANNER_COPY[provenance]}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSeed}
            data-testid="prefs-clear-seed"
            className="mt-1 -ml-2"
          >
            Clear all five
          </Button>
        </div>
      )}

      {mode === 'disliked' && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          1 = the one you dread most. We&apos;ll look for easier same-muscle swaps, strongest first
          — your plan keeps covering those muscles.
        </p>
      )}

      {mode === 'disliked' && !dislikedExplained && (
        <div
          className="mt-2 flex items-start gap-2 rounded-card border border-border bg-surface-2 p-3"
          data-testid="prefs-disliked-explainer"
        >
          <SwapIcon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-[12px] leading-snug text-muted-foreground">
            &ldquo;Rather not&rdquo; never deletes an exercise from your plan. It asks us for an
            easier movement that trains the same thing — the real &ldquo;never give me this&rdquo;
            list comes two screens later.
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissExplainer('prefs-disliked-meaning')}
            data-testid="prefs-disliked-explainer-dismiss"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-card text-muted-foreground hover:bg-muted"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* ranked tray */}
      <ol
        className="mt-3 space-y-1.5"
        aria-label={
          mode === 'liked'
            ? 'Your top five, most loved first'
            : "Up to five you'd rather not do, strongest first"
        }
        data-testid="prefs-tray"
      >
        <AnimatePresence initial={false}>
          {current.map((ref, i) => trayRow(ref, i))}
        </AnimatePresence>
        {current.length < PREFERENCE_LIST_SIZE && emptyHint}
      </ol>

      {/* collapsed provenance footnote — permanent once anything was edited */}
      {edited && (
        <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="prefs-seed-footnote">
          Suggestions started from popular picks — you&apos;re in control.
        </p>
      )}

      {/* live consequence line */}
      {((mode === 'liked' && liked.length >= 3 && lean) ||
        (mode === 'disliked' && disliked.length >= 1)) && (
        <p className="mt-2 text-[12px] font-medium text-accent" data-testid="prefs-lean-line">
          {mode === 'liked'
            ? `Leaning ${lean} so far — your split suggestions will lean the same way.`
            : "We'll favour easier swaps that keep these muscles covered — nothing gets deleted."}
        </p>
      )}

      {/* suggestion grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
        {gridRows.map(gridCard)}
      </div>

      <Button
        variant="secondary"
        block
        className="mt-3"
        onClick={() => setBrowsing(true)}
        data-testid="prefs-browse-all"
      >
        Browse all {TOTAL_EXERCISES} exercises
      </Button>

      {/* browse-everything sheet — the structural half of "a pre-fill, never a filter" */}
      <Sheet
        open={browsing}
        onClose={() => setBrowsing(false)}
        title={`All ${TOTAL_EXERCISES} exercises`}
        className="flex h-[85dvh] flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="prefs-browse-sheet">
          {segment(true)}
          <SearchInput<ExerciseHit>
            aria-label="Search exercises"
            placeholder="Search exercises…"
            search={(q, signal) => searchExercises(q, signal)}
            getKey={(r) => r.exercise_id}
            renderResult={(r) => {
              const state = likedSlugs.has(r.slug)
                ? 'in your top five'
                : dislikedSlugs.has(r.slug)
                  ? 'in rather-not'
                  : null;
              return (
                <span className="flex w-full items-center justify-between">
                  <span>{r.name}</span>
                  {state && <span className="text-xs text-accent">{state}</span>}
                </span>
              );
            }}
            onSelect={(r) => tapExercise({ id: r.exercise_id, slug: r.slug, name: r.name })}
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by movement">
            <Chip selected={sheetChip === null} onClick={() => setSheetChip(null)}>
              All
            </Chip>
            {SHEET_GROUPS.map((g) => (
              <Chip
                key={g.key}
                selected={sheetChip === g.key}
                onClick={() => setSheetChip(sheetChip === g.key ? null : g.key)}
                data-testid={`prefs-sheet-chip-${g.key}`}
              >
                {g.chip}
              </Chip>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sheetGroups.map((g) => (
              <section key={g.key}>
                <h3 className="sticky top-0 z-10 bg-surface py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </h3>
                <ul className="space-y-0.5">{g.rows.map(sheetRow)}</ul>
              </section>
            ))}
          </div>
        </div>
      </Sheet>

      {/* centred transient toast (full-list block / five locked in) */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-[30%] z-[70] flex justify-center px-8">
          <div
            key={toast.id}
            data-testid={toast.testId}
            className={cn(
              'rounded-card border border-accent/45 bg-elevated/95 px-4 py-2.5 text-center',
              'ff-veil shadow-[var(--shadow-pop)] backdrop-blur-sm',
              !reduced && 'ff-pop-fade',
            )}
            style={{ ['--ff-dur' as string]: '2200ms' }}
          >
            <p className="font-display text-sm font-bold text-accent">{toast.text}</p>
          </div>
        </div>
      )}

      {/* single-level undo snackbar for cross-list moves */}
      {undo && (
        <div className="fixed inset-x-0 bottom-24 z-[70] flex justify-center px-6">
          <div className="flex items-center gap-3 rounded-card border border-border bg-elevated/95 px-4 py-2 shadow-[var(--shadow-pop)] ff-veil backdrop-blur-sm">
            <span className="text-[13px] text-foreground">{undo.text}</span>
            <button
              type="button"
              onClick={applyUndo}
              data-testid="prefs-move-undo"
              className="text-[13px] font-bold text-accent underline-offset-2 hover:underline"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      <div className="min-h-4 flex-1" />
      <OnboardingFooter step="exercise_prefs" skippable canContinue />
    </div>
  );
}
